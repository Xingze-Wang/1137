// api/auth.js
// Fixed authentication handler with robust token management
import { createClient } from '@supabase/supabase-js';

/* ---------- CORS helpers ---------- */
function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
}

function send(res, code, obj) {
  res.status(code).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

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

/* ---------- Body parsing ---------- */
function getBody(req) {
  // Handle case where body is already parsed
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  
  // Handle string body
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      console.warn('Failed to parse request body as JSON:', e.message);
      return {};
    }
  }
  
  // Handle undefined/null body
  if (!req.body) {
    return {};
  }
  
  // Fallback for other types
  try {
    return JSON.parse(String(req.body));
  } catch (e) {
    console.warn('Failed to parse request body:', e.message);
    return {};
  }
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
export default async function handler(req, res) {
  setCors(req, res);
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Method Not Allowed' });
  }

  // Log environment for debugging
  console.log('Auth environment check:', {
    hasUrl: !!process.env.SUPABASE_URL,
    hasAnonKey: !!process.env.SUPABASE_ANON_KEY,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { action, email, password } = getBody(req);

  try {
    if (action === 'signup') {
      if (!email || !password) {
        return send(res, 400, { error: '缺少邮箱或密码' });
      }
      
      // Use admin client for signup to auto-confirm
      const supabaseAdmin = getSupabaseAdmin();
      if (!supabaseAdmin) {
        // Fallback to regular client
        const supabase = getSupabaseClient();
        if (!supabase) {
          return send(res, 500, { error: 'Supabase not configured' });
        }
        
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            emailRedirectTo: `${req.headers.origin || 'http://localhost:3000'}/`,
          }
        });
        
        if (error) throw error;
        return send(res, 200, { 
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
          return send(res, 200, { 
            user: signInData.user, 
            session: signInData.session,
            message: '注册并登录成功'
          });
        }
      }
      
      return send(res, 200, { 
        user: data.user, 
        message: '注册成功，请登录' 
      });
    }

    if (action === 'signin') {
      if (!email || !password) {
        return send(res, 400, { error: '缺少邮箱或密码' });
      }
      
      const supabase = getSupabaseClient();
      if (!supabase) {
        return send(res, 500, { error: 'Supabase not configured' });
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

      return send(res, 200, { 
        user: data.user, 
        session: data.session,
        message: '登录成功'
      });
    }

    if (action === 'signout') {
      clearSessionCookies(res);
      return send(res, 200, { 
        ok: true,
        message: '登出成功'
      });
    }
    
    if (action === 'verify') {
      // Verify token endpoint for debugging
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      
      if (!token) {
        return send(res, 401, { error: 'No token provided' });
      }
      
      const supabaseAdmin = getSupabaseAdmin();
      if (supabaseAdmin) {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error) {
          console.error('Token verification error (admin):', error);
          return send(res, 401, { error: 'Invalid token (admin check)' });
        }
        return send(res, 200, { 
          valid: true, 
          user,
          method: 'admin'
        });
      }
      
      const supabase = getSupabaseClient();
      if (!supabase) {
        return send(res, 500, { error: 'Supabase not configured' });
      }
      
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error) {
        console.error('Token verification error (client):', error);
        return send(res, 401, { error: 'Invalid token' });
      }
      
      return send(res, 200, { 
        valid: true, 
        user,
        method: 'client'
      });
    }

    return send(res, 400, { error: 'Unknown action' });
  } catch (e) {
    console.error('Auth error:', e);
    
    // Determine appropriate status code
    let statusCode = 400;
    if (e?.message?.includes('not configured') || e?.message?.includes('Missing')) {
      statusCode = 500;
    } else if (e?.message?.includes('Invalid') || e?.message?.includes('expired')) {
      statusCode = 401;
    }
    
    return send(res, statusCode, { 
      error: e?.message || 'Authentication failed',
      details: process.env.NODE_ENV === 'development' ? e.toString() : undefined
    });
  }
}