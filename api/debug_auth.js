// api/debug-auth.js
// Debug endpoint to test authentication and diagnose issues
import { verifyUser, getBearerToken } from '../lib/verify-user.js';
import { createClient } from '@supabase/supabase-js';

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Cookie');
}

function send(res, code, obj) {
  res.status(code).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj, null, 2));
}

export default async function handler(req, res) {
  setCors(req, res);
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const token = getBearerToken(req);
  
  const debugInfo = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      hasSupabaseUrl: !!process.env.SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.SUPABASE_ANON_KEY || !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET',
    },
    request: {
      method: req.method,
      hasAuthHeader: !!req.headers.authorization,
      authHeader: req.headers.authorization ? req.headers.authorization.substring(0, 30) + '...' : 'none',
      hasCookie: !!req.headers.cookie,
      cookies: req.headers.cookie ? Object.keys(parseCookies(req.headers.cookie)) : [],
    },
    token: {
      found: !!token,
      length: token?.length || 0,
      prefix: token ? token.substring(0, 20) + '...' : 'none',
      source: token ? (req.headers.authorization ? 'header' : 'cookie') : 'none',
    },
    verification: {
      status: 'pending',
      user: null,
      error: null,
      attempts: [],
    },
  };

  if (!token) {
    debugInfo.verification.status = 'failed';
    debugInfo.verification.error = 'No token found';
    return send(res, 200, debugInfo);
  }

  // Try admin client verification
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (url && serviceKey) {
      const adminClient = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      
      const { data: { user }, error } = await adminClient.auth.getUser(token);
      
      debugInfo.verification.attempts.push({
        method: 'admin_client',
        success: !!user && !error,
        error: error?.message || null,
        userId: user?.id || null,
      });
      
      if (user && !error) {
        debugInfo.verification.status = 'success';
        debugInfo.verification.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          created_at: user.created_at,
        };
      }
    }
  } catch (e) {
    debugInfo.verification.attempts.push({
      method: 'admin_client',
      success: false,
      error: e.message,
    });
  }

  // Try anon client verification
  if (debugInfo.verification.status !== 'success') {
    try {
      const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (url && anonKey) {
        const anonClient = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        
        const { data: { user }, error } = await anonClient.auth.getUser(token);
        
        debugInfo.verification.attempts.push({
          method: 'anon_client',
          success: !!user && !error,
          error: error?.message || null,
          userId: user?.id || null,
        });
        
        if (user && !error) {
          debugInfo.verification.status = 'success';
          debugInfo.verification.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            created_at: user.created_at,
          };
        }
      }
    } catch (e) {
      debugInfo.verification.attempts.push({
        method: 'anon_client',
        success: false,
        error: e.message,
      });
    }
  }

  // Try JWT decode
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      debugInfo.token.jwt = {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        exp: payload.exp,
        expired: payload.exp ? payload.exp * 1000 < Date.now() : false,
        expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
      };
    }
  } catch (e) {
    debugInfo.token.jwt = { error: 'Failed to decode JWT' };
  }

  if (debugInfo.verification.status === 'pending') {
    debugInfo.verification.status = 'failed';
    debugInfo.verification.error = 'All verification methods failed';
  }

  // Test with verifyUser function
  try {
    const user = await verifyUser(req, { requireAuth: true });
    debugInfo.verifyUserFunction = {
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  } catch (e) {
    debugInfo.verifyUserFunction = {
      success: false,
      error: e.message,
    };
  }

  return send(res, 200, debugInfo);
}

function parseCookies(cookieString) {
  try {
    return cookieString.split(';').reduce((acc, cookie) => {
      const [key, ...valueParts] = cookie.trim().split('=');
      if (key) {
        acc[key] = valueParts.join('=');
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
}