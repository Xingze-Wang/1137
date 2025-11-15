// lib/validation.js
// Comprehensive input validation utilities

/**
 * Validate email format
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate password strength
 */
export function isValidPassword(password) {
  if (!password || typeof password !== 'string') return false;
  return password.length >= 6 && password.length <= 72; // bcrypt limit
}

/**
 * Sanitize string input
 */
export function sanitizeString(str, maxLength = 1000) {
  if (!str || typeof str !== 'string') return '';
  // Remove control characters except newlines and tabs
  const sanitized = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return sanitized.slice(0, maxLength).trim();
}

/**
 * Validate conversation ID
 */
export function validateConversationId(id) {
  if (!isValidUUID(id)) {
    throw new Error('Invalid conversation ID format');
  }
  return id;
}

/**
 * Validate user ID
 */
export function validateUserId(id) {
  if (!isValidUUID(id)) {
    throw new Error('Invalid user ID format');
  }
  return id;
}

/**
 * Validate message content
 */
export function validateMessageContent(content, maxLength = 50000) {
  if (!content || typeof content !== 'string') {
    throw new Error('Message content must be a non-empty string');
  }

  const sanitized = sanitizeString(content, maxLength);
  if (!sanitized) {
    throw new Error('Message content cannot be empty after sanitization');
  }

  return sanitized;
}

/**
 * Validate file array
 */
export function validateFileArray(files, maxFiles = 10) {
  if (!Array.isArray(files)) {
    return [];
  }

  return files
    .filter(file => file && typeof file === 'string' && file.trim().length > 0)
    .map(file => sanitizeString(file, 255))
    .slice(0, maxFiles);
}

/**
 * Validate AI mode
 */
export function validateAiMode(mode) {
  const validModes = ['default', 'Dean', 'Investor', 'Expert_match', 'Analyst', 'Agent_builder', 'pitch_deck'];
  const sanitized = sanitizeString(mode, 50);

  if (!sanitized || !validModes.includes(sanitized)) {
    return 'default';
  }

  return sanitized;
}

/**
 * Create validation error response
 */
export function createValidationError(message, field = null) {
  const error = new Error(message);
  error.statusCode = 400;
  error.field = field;
  return error;
}

/**
 * Validate request body has required fields
 */
export function validateRequiredFields(body, fields) {
  const missing = [];

  for (const field of fields) {
    if (!body[field] || (typeof body[field] === 'string' && !body[field].trim())) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    throw createValidationError(
      `Missing required fields: ${missing.join(', ')}`,
      missing[0]
    );
  }
}

/**
 * Rate limiting helper (simple in-memory)
 */
const rateLimitMap = new Map();

export function checkRateLimit(key, maxRequests = 100, windowMs = 60000) {
  const now = Date.now();
  const userRequests = rateLimitMap.get(key) || [];

  // Clean old requests
  const recentRequests = userRequests.filter(timestamp => now - timestamp < windowMs);

  if (recentRequests.length >= maxRequests) {
    const error = new Error('Too many requests, please try again later');
    error.statusCode = 429;
    throw error;
  }

  recentRequests.push(now);
  rateLimitMap.set(key, recentRequests);

  // Clean up old entries periodically
  if (rateLimitMap.size > 10000) {
    const cutoff = now - windowMs;
    for (const [k, timestamps] of rateLimitMap.entries()) {
      const recent = timestamps.filter(t => t > cutoff);
      if (recent.length === 0) {
        rateLimitMap.delete(k);
      } else {
        rateLimitMap.set(k, recent);
      }
    }
  }
}
