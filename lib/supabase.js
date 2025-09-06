// lib/supabase.js
// CLEAN VERSION - NO NEXT_PUBLIC ANYWHERE
import { createClient } from '@supabase/supabase-js';

// Admin client singleton
let supabaseAdmin = null;

// Initialize admin client with service role key
function initSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !serviceKey) {
    console.warn('Supabase admin not configured - missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return null;
  }
  
  try {
    supabaseAdmin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    console.log('Supabase admin client initialized');
    return supabaseAdmin;
  } catch (error) {
    console.error('Failed to initialize Supabase admin:', error);
    return null;
  }
}

// Check if admin is configured
export function isAdminConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Get or initialize admin client (lazy initialization)
function getSupabaseAdmin() {
  if (!supabaseAdmin && isAdminConfigured()) {
    supabaseAdmin = initSupabaseAdmin();
  }
  return supabaseAdmin;
}

// Initialize on module load
if (isAdminConfigured()) {
  initSupabaseAdmin();
}

// Export the admin client and getter
export { supabaseAdmin, getSupabaseAdmin };