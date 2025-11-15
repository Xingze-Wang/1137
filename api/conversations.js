// api/conversations.js
// ENHANCED with validation and error handling

import { verifyUser } from '../lib/verify-user.js';
import {
  getUserConversations,
  getConversationMessages,
  deleteConversation,
} from '../lib/database.js';
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
  getClientIP,
  createSuccessResponse
} from '../lib/api-utils.js';
import {
  validateConversationId,
  checkRateLimit
} from '../lib/validation.js';

export default asyncHandler(async function handler(req, res) {
  // Set timeout
  withTimeout(req, res, 15000);

  // Set CORS headers
  setCorsHeaders(req, res);

  // Handle OPTIONS preflight
  if (handleOptions(req, res)) return;

  // Log request
  logRequest(req, { endpoint: 'conversations' });

  // Rate limiting
  const clientIP = getClientIP(req);
  try {
    checkRateLimit(`conversations:${clientIP}`, 100, 60000); // 100 req/min
  } catch (error) {
    return sendError(res, error);
  }

  // Auth (shared)
  let user;
  try {
    user = await verifyUser(req);
  } catch (e) {
    console.error('[conversations] Auth failed:', e?.message || e);
    return sendError(res, {
      statusCode: 401,
      message: 'Invalid or expired authentication token'
    });
  }

  if (req.method === 'GET') {
    const r = await getUserConversations(user.id);
    if (!r?.success) {
      return sendError(res, {
        statusCode: 500,
        message: r?.error || 'Failed to fetch conversations'
      });
    }
    return sendJSON(res, 200, createSuccessResponse({
      conversations: r.conversations || []
    }));
  }

  if (req.method === 'POST') {
    const body = parseJSONBody(req.body);
    const { conversationId } = body;

    if (!conversationId) {
      return sendError(res, {
        statusCode: 400,
        message: 'Missing required field: conversationId',
        field: 'conversationId'
      });
    }

    // Validate conversation ID format
    try {
      validateConversationId(conversationId);
    } catch (error) {
      return sendError(res, {
        statusCode: 400,
        message: error.message,
        field: 'conversationId'
      });
    }

    const r = await getConversationMessages(conversationId, user.id);
    if (!r?.success) {
      return sendError(res, {
        statusCode: r?.error?.includes('not found') ? 404 : 500,
        message: r?.error || 'Failed to fetch messages'
      });
    }

    // normalize shape for frontend
    const messages = (r.messages || []).map(m => ({
      role: m.role,
      content: m.content || '',
      created_at: m.created_at,
      ai_mode: m.ai_mode
    }));

    return sendJSON(res, 200, createSuccessResponse({ messages }));
  }

  if (req.method === 'DELETE') {
    const body = parseJSONBody(req.body);
    const { conversationId } = body;

    if (!conversationId) {
      return sendError(res, {
        statusCode: 400,
        message: 'Missing required field: conversationId',
        field: 'conversationId'
      });
    }

    // Validate conversation ID format
    try {
      validateConversationId(conversationId);
    } catch (error) {
      return sendError(res, {
        statusCode: 400,
        message: error.message,
        field: 'conversationId'
      });
    }

    const r = await deleteConversation(conversationId, user.id);
    if (!r?.success) {
      return sendError(res, {
        statusCode: r?.error?.includes('not found') ? 404 : 500,
        message: r?.error || 'Failed to delete conversation'
      });
    }

    return sendJSON(res, 200, createSuccessResponse(
      { deleted: true },
      'Conversation deleted successfully'
    ));
  }

  // Invalid method
  res.setHeader('Allow', 'GET, POST, DELETE');
  return sendError(res, {
    statusCode: 405,
    message: 'Method not allowed'
  });
});
