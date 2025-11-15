// api/auth.js
// ENHANCED authentication handler with validation and error handling
import { createClient } from '@supabase/supabase-js';
import {
  setCorsHeaders,
  sendJSON,
  sendError,
  asyncHandler,
  withTimeout,
  logRequest,
  parseJSONBody,
  handleOptions,
  validateMethod,
  getClientIP
} from '../lib/api-utils.js';
import {
  isValidEmail,
  isValidPassword,
  validateRequiredFields,
  checkRateLimit
} from '../lib/validation.js';

/* ---------- Cookie helpers ---------- */
function setSessionCookies(res, session) {
  if (!session?.access_token) return;
  
  // Set multiple cookie variants for compatibility
  const cookies = [
    `sb-token=${encodeURIComponent(session.access_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`,
    `sb-access-token=${encodeURIComponent(session.access_token)}; Path=/; SameSite=Lax; Max-Age=3600`,
    `sb-refresh-token=${encodeURIComponent(session.refresh_token || '')}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`,
  ];
  res.setHeader('Set-Cookie', cookies);
}

function clearSessionCookies(res) {
  const expired = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  res.setHeader('Set-Cookie', [
    `sb-token=; Path=/; ${expired}; SameSite=Lax`,
    `sb-access-token=; Path=/; ${expired}; SameSite=Lax`,
    `sb-refresh-token=; Path=/; ${expired}; SameSite=Lax`,
  ]);
}


/* ---------- Supabase clients ---------- */
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !serviceKey) {
    console.error('Missing Supabase admin credentials');
    return null;
  }
  
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  
  if (!url || !anonKey) {
    console.error('Missing Supabase client credentials');
    return null;
  }
  
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/* ---------- Main handler ---------- */
export default asyncHandler(async function handler(req, res) {
  // Set timeout for request
  withTimeout(req, res, 15000);

  // Set CORS headers
  setCorsHeaders(req, res);

  // Handle OPTIONS preflight
  if (handleOptions(req, res)) return;

  // Validate method
  if (!validateMethod(req, res, ['POST'])) return;

  // Log request
  logRequest(req, { action: 'auth' });

  // Parse body
  const body = parseJSONBody(req.body);
  const { action, email, password } = body;

  // Rate limiting by IP
  const clientIP = getClientIP(req);
  try {
    checkRateLimit(`auth:${clientIP}`, 20, 60000); // 20 requests per minute
  } catch (error) {
    return sendError(res, error);
  }

  // Validate action
  if (!action || typeof action !== 'string') {
    return sendError(res, {
      statusCode: 400,
      message: 'Missing or invalid action parameter'
    });
  }

  try {
    if (action === 'signup') {
      // Validate required fields
      validateRequiredFields(body, ['email', 'password']);

      // Validate email format
      if (!isValidEmail(email)) {
        return sendError(res, {
          statusCode: 400,
          message: 'Invalid email format',
          field: 'email'
        });
      }

      // Validate password strength
      if (!isValidPassword(password)) {
        return sendError(res, {
          statusCode: 400,
          message: 'Password must be between 6 and 72 characters',
          field: 'password'
        });
      }
      
      // Use admin client for signup to auto-confirm
      const supabaseAdmin = getSupabaseAdmin();
      if (!supabaseAdmin) {
        // Fallback to regular client
        const supabase = getSupabaseClient();
        if (!supabase) {
          return sendError(res, {
            statusCode: 500,
            message: 'Database not configured properly'
          });
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${req.headers.origin || 'http://localhost:3000'}/`,
          }
        });

        if (error) throw error;
        return sendJSON(res, 200, {
          user: data.user,
          session: data.session,
          message: data.session ? '注册成功' : '注册成功，请检查邮箱确认'
        });
      }
      
      // Admin signup with auto-confirm
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      
      if (error) throw error;
      
      // Now sign them in to get a session
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });


        if (!signInError && signInData.session) {
          setSessionCookies(res, signInData.session);
          return sendJSON(res, 200, {
            user: signInData.user,
            session: signInData.session,
            message: '注册并登录成功'
          });
        }
      }

      return sendJSON(res, 200, {
        user: data.user,
        message: '注册成功，请登录'
      });
    }

    if (action === 'signin') {
      // Validate required fields
      validateRequiredFields(body, ['email', 'password']);

      // Validate email format
      if (!isValidEmail(email)) {
        return sendError(res, {
          statusCode: 400,
          message: 'Invalid email format',
          field: 'email'
        });
      }
      
      const supabase = getSupabaseClient();
      if (!supabase) {
        return sendError(res, {
          statusCode: 500,
          message: 'Database not configured properly'
        });
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Sign in error:', error);
        throw error;
      }

      if (!data.session) {
        throw new Error('登录成功但未获得会话');
      }

      // Set cookies for server-side auth
      setSessionCookies(res, data.session);

      console.log('Sign in successful:', {
        userId: data.user?.id,
        hasSession: !!data.session,
        hasAccessToken: !!data.session?.access_token,
      });

      return sendJSON(res, 200, {
        user: data.user,
        session: data.session,
        message: '登录成功'
      });
    }

    if (action === 'signout') {
      clearSessionCookies(res);
      return sendJSON(res, 200, {
        ok: true,
        message: '登出成功'
      });
    }
    
    if (action === 'verify') {
      // Verify token endpoint for debugging
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

      if (!token) {
        return sendError(res, {
          statusCode: 401,
          message: 'No authentication token provided'
        });
      }

      const supabaseAdmin = getSupabaseAdmin();
      if (supabaseAdmin) {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error) {
          console.error('Token verification error (admin):', error);
          return sendError(res, {
            statusCode: 401,
            message: 'Invalid or expired token'
          });
        }
        return sendJSON(res, 200, {
          valid: true,
          user,
          method: 'admin'
        });
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        return sendError(res, {
          statusCode: 500,
          message: 'Database not configured properly'
        });
      }

      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error) {
        console.error('Token verification error (client):', error);
        return sendError(res, {
          statusCode: 401,
          message: 'Invalid or expired token'
        });
      }

      return sendJSON(res, 200, {
        valid: true,
        user,
        method: 'client'
      });
    }

    return sendError(res, {
      statusCode: 400,
      message: `Unknown action: ${action}`
    });
  } catch (e) {
    // Map Supabase errors to appropriate status codes
    let statusCode = 400;
    let message = e?.message || 'Authentication failed';

    if (e?.message?.includes('not configured') || e?.message?.includes('Missing')) {
      statusCode = 500;
      message = 'Server configuration error';
    } else if (e?.message?.includes('Invalid') || e?.message?.includes('expired') || e?.message?.includes('credentials')) {
      statusCode = 401;
      message = e?.message || 'Invalid credentials';
    }

    return sendError(res, {
      statusCode,
      message,
      code: e?.code
    });
  }
});