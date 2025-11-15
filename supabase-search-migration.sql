-- Migration: Add full-text search support for conversations and messages
-- Run this in Supabase SQL Editor

-- Add GIN index for full-text search on messages.content
CREATE INDEX IF NOT EXISTS idx_messages_content_fts
ON messages USING GIN (to_tsvector('simple', content));

-- Add GIN index for conversation titles
CREATE INDEX IF NOT EXISTS idx_conversations_title_fts
ON conversations USING GIN (to_tsvector('simple', title));

-- Add index for ai_mode filtering
CREATE INDEX IF NOT EXISTS idx_messages_ai_mode ON messages(ai_mode);

-- Create a function for searching conversations with full-text search
CREATE OR REPLACE FUNCTION search_conversations(
  p_user_id UUID,
  p_query TEXT,
  p_ai_mode TEXT DEFAULT NULL,
  p_start_date TIMESTAMP DEFAULT NULL,
  p_end_date TIMESTAMP DEFAULT NULL
)
RETURNS TABLE (
  conversation_id UUID,
  conversation_title VARCHAR,
  conversation_created_at TIMESTAMP WITH TIME ZONE,
  conversation_updated_at TIMESTAMP WITH TIME ZONE,
  message_id UUID,
  message_content TEXT,
  message_role VARCHAR,
  message_ai_mode VARCHAR,
  message_created_at TIMESTAMP WITH TIME ZONE,
  search_rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (c.id, m.id)
    c.id as conversation_id,
    c.title as conversation_title,
    c.created_at as conversation_created_at,
    c.updated_at as conversation_updated_at,
    m.id as message_id,
    m.content as message_content,
    m.role as message_role,
    m.ai_mode as message_ai_mode,
    m.created_at as message_created_at,
    ts_rank(to_tsvector('simple', m.content), plainto_tsquery('simple', p_query)) as search_rank
  FROM conversations c
  INNER JOIN messages m ON m.conversation_id = c.id
  WHERE
    c.user_id = p_user_id
    AND (
      to_tsvector('simple', m.content) @@ plainto_tsquery('simple', p_query)
      OR to_tsvector('simple', c.title) @@ plainto_tsquery('simple', p_query)
      OR m.content ILIKE '%' || p_query || '%'
      OR c.title ILIKE '%' || p_query || '%'
    )
    AND (p_ai_mode IS NULL OR m.ai_mode = p_ai_mode)
    AND (p_start_date IS NULL OR m.created_at >= p_start_date)
    AND (p_end_date IS NULL OR m.created_at <= p_end_date)
  ORDER BY search_rank DESC, m.created_at DESC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION search_conversations TO authenticated;

COMMENT ON FUNCTION search_conversations IS 'Full-text search across conversations and messages with optional filters for AI mode and date range';
