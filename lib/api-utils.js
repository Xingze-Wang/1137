// lib/api-utils.js
// Shared API utilities for error handling, logging, and responses

/**
 * Set CORS headers on response
 */
export function setCorsHeaders(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Cookie');
}

/**
 * Send JSON response with proper headers
 */
export function sendJSON(res, statusCode, data) {
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(data));
}

/**
 * Send error response with consistent format
 */
export function sendError(res, error, defaultMessage = 'Internal server error') {
  const statusCode = error?.statusCode || error?.status || 500;
  const message = error?.message || defaultMessage;

  // Log server errors
  if (statusCode >= 500) {
    console.error('[API Error]', {
      message,
      stack: error?.stack,
      code: error?.code,
      timestamp: new Date().toISOString()
    });
  }

  const response = {
    error: message,
    code: error?.code,
    field: error?.field
  };

  // Include details in development mode only
  if (process.env.NODE_ENV === 'development' && statusCode >= 500) {
    response.details = error?.stack;
  }

  sendJSON(res, statusCode, response);
}

/**
 * Wrap async handler with error handling
 */
export function asyncHandler(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      sendError(res, error);
    }
  };
}

/**
 * Add timeout to request
 */
export function withTimeout(req, res, timeoutMs = 30000) {
  const timeout = setTimeout(() => {
    if (!res.writableEnded) {
      console.error('[Request Timeout]', {
        url: req.url,
        method: req.method,
        timeout: timeoutMs
      });
      sendError(res, {
        statusCode: 408,
        message: 'Request timeout'
      });
    }
  }, timeoutMs);

  // Clear timeout if response finishes normally
  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));

  return timeout;
}

/**
 * Log request details
 */
export function logRequest(req, additionalInfo = {}) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Request]', {
      method: req.method,
      url: req.url,
      timestamp: new Date().toISOString(),
      ...additionalInfo
    });
  }
}

/**
 * Parse JSON body safely
 */
export function parseJSONBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;

  try {
    return JSON.parse(String(body));
  } catch (e) {
    const error = new Error('Invalid JSON in request body');
    error.statusCode = 400;
    throw error;
  }
}

/**
 * Extract client IP for rate limiting
 */
export function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Validate content type
 */
export function validateContentType(req, expectedTypes = ['application/json']) {
  const contentType = req.headers['content-type'];

  if (!contentType) {
    if (req.method === 'POST' || req.method === 'PUT') {
      const error = new Error('Content-Type header is required');
      error.statusCode = 400;
      throw error;
    }
    return;
  }

  const matches = expectedTypes.some(type =>
    contentType.toLowerCase().includes(type.toLowerCase())
  );

  if (!matches) {
    const error = new Error(
      `Invalid Content-Type. Expected one of: ${expectedTypes.join(', ')}`
    );
    error.statusCode = 415;
    throw error;
  }
}

/**
 * Create standard success response
 */
export function createSuccessResponse(data, message = null) {
  const response = { success: true, ...data };
  if (message) response.message = message;
  return response;
}

/**
 * Handle OPTIONS preflight
 */
export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Validate HTTP method
 */
export function validateMethod(req, res, allowedMethods = []) {
  if (!allowedMethods.includes(req.method)) {
    res.setHeader('Allow', allowedMethods.join(', '));
    sendError(res, {
      statusCode: 405,
      message: 'Method Not Allowed'
    });
    return false;
  }
  return true;
}
