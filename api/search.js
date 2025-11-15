// api/search.js
// Full-text search endpoint for conversations and messages
import { verifyUser } from '../lib/verify-user.js';
import { supabase } from '../lib/supabase.js';

export const runtime = 'nodejs';
export const config = { api: { bodyParser: true } };

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Cookie');
}

function sendJSON(res, code, obj) {
  res.status(code).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return sendJSON(res, 405, { error: 'Method not allowed' });
  }

  // Verify user authentication
  let user;
  try {
    user = await verifyUser(req);
  } catch (authErr) {
    console.error('Authentication failed in search:', authErr);
    return sendJSON(res, 401, { error: 'Invalid or expired token' });
  }

  try {
    const { query, ai_mode, start_date, end_date } = req.query;

    // Validate query
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return sendJSON(res, 400, { error: 'Search query is required' });
    }

    if (query.length > 500) {
      return sendJSON(res, 400, { error: 'Search query too long (max 500 characters)' });
    }

    // Build parameters for the search function
    const params = {
      p_user_id: user.id,
      p_query: query.trim(),
      p_ai_mode: ai_mode || null,
      p_start_date: start_date || null,
      p_end_date: end_date || null,
    };

    console.log('Search params:', params);

    // Call the PostgreSQL search function
    const { data, error } = await supabase.rpc('search_conversations', params);

    if (error) {
      console.error('Search error:', error);
      return sendJSON(res, 500, {
        error: 'Search failed',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    // Group results by conversation
    const conversationMap = new Map();

    for (const row of data || []) {
      if (!conversationMap.has(row.conversation_id)) {
        conversationMap.set(row.conversation_id, {
          id: row.conversation_id,
          title: row.conversation_title,
          created_at: row.conversation_created_at,
          updated_at: row.conversation_updated_at,
          matches: []
        });
      }

      conversationMap.get(row.conversation_id).matches.push({
        message_id: row.message_id,
        content: row.message_content,
        role: row.message_role,
        ai_mode: row.message_ai_mode,
        created_at: row.message_created_at,
        rank: row.search_rank
      });
    }

    const results = Array.from(conversationMap.values());

    return sendJSON(res, 200, {
      success: true,
      query: query.trim(),
      results,
      total: results.length
    });

  } catch (err) {
    console.error('Search error:', err);
    return sendJSON(res, 500, {
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}
