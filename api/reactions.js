// api/reactions.js
// Message reactions and bookmarks API
import { verifyUser } from '../lib/verify-user.js';
import { supabase } from '../lib/supabase.js';

export const runtime = 'nodejs';
export const config = { api: { bodyParser: true } };

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
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

  // Verify user authentication
  let user;
  try {
    user = await verifyUser(req);
  } catch (authErr) {
    console.error('Authentication failed in reactions:', authErr);
    return sendJSON(res, 401, { error: 'Invalid or expired token' });
  }

  try {
    // GET - Get user's reactions or bookmarked messages
    if (req.method === 'GET') {
      const { type, message_id } = req.query;

      // Get bookmarked messages
      if (type === 'bookmarks') {
        const { data, error } = await supabase.rpc('get_bookmarked_messages', {
          p_user_id: user.id
        });

        if (error) {
          console.error('Get bookmarks error:', error);
          return sendJSON(res, 500, { error: 'Failed to fetch bookmarks' });
        }

        return sendJSON(res, 200, {
          success: true,
          bookmarks: data || []
        });
      }

      // Get reactions for a specific message
      if (message_id) {
        const { data, error } = await supabase
          .from('message_reactions')
          .select('*')
          .eq('message_id', message_id)
          .eq('user_id', user.id);

        if (error) {
          console.error('Get reactions error:', error);
          return sendJSON(res, 500, { error: 'Failed to fetch reactions' });
        }

        return sendJSON(res, 200, {
          success: true,
          reactions: data || []
        });
      }

      return sendJSON(res, 400, { error: 'Missing required parameters' });
    }

    // POST - Add a reaction
    if (req.method === 'POST') {
      const { message_id, reaction_type } = req.body;

      if (!message_id || !reaction_type) {
        return sendJSON(res, 400, { error: 'message_id and reaction_type are required' });
      }

      const validTypes = ['thumbs_up', 'thumbs_down', 'bookmark'];
      if (!validTypes.includes(reaction_type)) {
        return sendJSON(res, 400, { error: 'Invalid reaction_type' });
      }

      // Verify message exists and belongs to user's conversation
      const { data: message, error: messageError } = await supabase
        .from('messages')
        .select('conversation_id, conversations!inner(user_id)')
        .eq('id', message_id)
        .single();

      if (messageError || !message) {
        console.error('Message verification error:', messageError);
        return sendJSON(res, 404, { error: 'Message not found' });
      }

      if (message.conversations.user_id !== user.id) {
        return sendJSON(res, 403, { error: 'Access denied' });
      }

      // Insert reaction (will update if already exists due to UNIQUE constraint)
      const { data, error } = await supabase
        .from('message_reactions')
        .upsert({
          message_id,
          user_id: user.id,
          reaction_type
        }, {
          onConflict: 'message_id,user_id,reaction_type'
        })
        .select()
        .single();

      if (error) {
        console.error('Add reaction error:', error);
        return sendJSON(res, 500, { error: 'Failed to add reaction' });
      }

      return sendJSON(res, 200, {
        success: true,
        reaction: data
      });
    }

    // DELETE - Remove a reaction
    if (req.method === 'DELETE') {
      const { message_id, reaction_type } = req.body;

      if (!message_id || !reaction_type) {
        return sendJSON(res, 400, { error: 'message_id and reaction_type are required' });
      }

      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', message_id)
        .eq('user_id', user.id)
        .eq('reaction_type', reaction_type);

      if (error) {
        console.error('Delete reaction error:', error);
        return sendJSON(res, 500, { error: 'Failed to delete reaction' });
      }

      return sendJSON(res, 200, {
        success: true,
        message: 'Reaction removed'
      });
    }

    return sendJSON(res, 405, { error: 'Method not allowed' });

  } catch (err) {
    console.error('Reactions error:', err);
    return sendJSON(res, 500, {
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}
