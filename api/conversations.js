// api/conversations.js
// CLEAN + SAFE JSON BODY PARSING (no JSON.parse crashes)

import { verifyUser } from '../lib/verify-user.js';
import {
  getUserConversations,
  getConversationMessages,
  deleteConversation,
} from '../lib/database.js';

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Cookie');
}

function send(res, code, obj) {
  res.status(code).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

function safeJsonParse(body) {
  if (!body) return {};
  if (typeof body === 'object') return body; // Already parsed by runtime
  try {
    return JSON.parse(body);
  } catch (e) {
    console.warn('[conversations] JSON parse failed:', e?.message);
    return {}; // never throw
  }
}

export default async function handler(req, res) {
  try {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    // Auth (shared)
    let user;
    try {
      user = await verifyUser(req);
    } catch (e) {
      console.error('[conversations] Auth failed:', e?.message || e);
      return send(res, 401, { error: 'Invalid or expired token' });
    }

    if (req.method === 'GET') {
      const r = await getUserConversations(user.id);
      if (!r?.success) return send(res, 500, { error: r?.error || '获取会话失败' });
      return send(res, 200, { conversations: r.conversations || [] });
    }

    if (req.method === 'POST') {
      const body = safeJsonParse(req.body);
      const { conversationId } = body;
      if (!conversationId) return send(res, 400, { error: '缺少 conversationId' });

      const r = await getConversationMessages(conversationId, user.id);
      if (!r?.success) return send(res, 500, { error: r?.error || '获取会话失败' });

      // normalize shape for frontend
      const messages = (r.messages || []).map(m => ({
        role: m.role,
        content: m.content || '',
        created_at: m.created_at,
      }));
      return send(res, 200, { messages });
    }

    if (req.method === 'DELETE') {
      const body = safeJsonParse(req.body);
      const { conversationId } = body;
      if (!conversationId) return send(res, 400, { error: '缺少 conversationId' });

      const r = await deleteConversation(conversationId, user.id);
      if (!r?.success) return send(res, 500, { error: r?.error || '删除会话失败' });
      return send(res, 200, { message: '会话已删除' });
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return send(res, 405, { error: 'Method Not Allowed' });
  } catch (err) {
    console.error('Conversations API Error:', err);
    return send(res, 500, { error: err?.message || '服务器内部错误' });
  }
}
