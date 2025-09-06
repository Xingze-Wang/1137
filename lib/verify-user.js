// lib/verify-user.js
import { supabaseAdmin, isAdminConfigured } from './supabase.js';

/**
 * Extract Bearer token from Authorization header or Supabase cookies.
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
export function getBearerToken(req) {
  // First try Authorization header
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token && token.length > 10) { // Basic token length validation
      return token;
    }
  }

  // Fallback to cookies with safe parsing
  if (req.headers.cookie) {
    try {
      const cookies = req.headers.cookie.split(';');
      const cookieMap = {};
      
      for (const cookie of cookies) {
        const eqIndex = cookie.indexOf('=');
        if (eqIndex > 0) {
          const key = cookie.slice(0, eqIndex).trim();
          const value = cookie.slice(eqIndex + 1).trim();
          try {
            cookieMap[key] = decodeURIComponent(value);
          } catch (e) {
            // Skip malformed cookies
            console.warn(`Failed to decode cookie ${key}:`, e.message);
          }
        }
      }
      
      const token = cookieMap['sb-token'] || cookieMap['sb-access-token'] || '';
      if (token && token.length > 10) {
        return token;
      }
    } catch (e) {
      console.warn('Failed to parse cookies:', e.message);
    }
  }
  
  return '';
}

/**
 * Verify the user's JWT using service role when available, else fall back to anon client + getUser.
 * Throws on failure.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<object>} Supabase user
 */
export async function verifyUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error('Missing or invalid authorization header');
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error('Supabase environment variables not configured');
  }

  let lastError = null;
  let isTokenExpired = false;

  // 1) Try admin verifier (preferred)
  try {
    if (typeof isAdminConfigured === 'function' && isAdminConfigured() && supabaseAdmin) {
      // Add timeout to prevent hanging
      const authPromise = supabaseAdmin.auth.getUser(token);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Auth timeout')), 10000)
      );
      
      const { data: { user }, error } = await Promise.race([authPromise, timeoutPromise]);
      
      if (error) {
        lastError = error;
        // Check if error indicates token expiration
        const errorMsg = error.message || '';
        if (errorMsg.includes('token is expired') || 
            errorMsg.includes('jwt expired') ||
            errorMsg.includes('invalid token') ||
            errorMsg.includes('token has expired')) {
          isTokenExpired = true;
        }
        console.log('Admin auth error:', errorMsg);
      } else if (user && user.id) {
        console.log('Admin auth successful for user:', user.id);
        return user;
      }
    }
  } catch (e) {
    lastError = e;
    const errorMsg = e.message || '';
    if (errorMsg.includes('token is expired') || 
        errorMsg.includes('jwt expired') ||
        errorMsg.includes('invalid token') ||
        errorMsg.includes('timeout')) {
      isTokenExpired = true;
    }
    console.log('Admin auth exception:', errorMsg);
  }

  // 2) Fallback: anon client + getUser() 
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    
    // Add timeout to prevent hanging
    const authPromise = c.auth.getUser(token);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Auth timeout')), 10000)
    );
    
    const { data: { user }, error } = await Promise.race([authPromise, timeoutPromise]);
    
    if (error) {
      lastError = error;
      const errorMsg = error.message || '';
      if (errorMsg.includes('token is expired') || 
          errorMsg.includes('jwt expired') ||
          errorMsg.includes('invalid token') ||
          errorMsg.includes('token has expired')) {
        isTokenExpired = true;
      }
      console.log('Anon client auth error:', errorMsg);
    } else if (user && user.id) {
      console.log('Anon client auth successful for user:', user.id);
      return user;
    }
  } catch (e) {
    lastError = e;
    const errorMsg = e.message || '';
    if (errorMsg.includes('token is expired') || 
        errorMsg.includes('jwt expired') ||
        errorMsg.includes('invalid token') ||
        errorMsg.includes('timeout')) {
      isTokenExpired = true;
    }
    console.log('Anon client auth exception:', errorMsg);
  }

  // If token is expired, throw a specific error that the frontend can handle
  if (isTokenExpired) {
    const expiredError = new Error('Token expired');
    expiredError.code = 'TOKEN_EXPIRED';
    throw expiredError;
  }

  throw new Error(`Invalid or expired token${lastError ? `: ${lastError.message}` : ''}`);
}
