-- Migration: Add message reactions and bookmarks
-- Run this in Supabase SQL Editor

-- Create reactions table
CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reaction_type VARCHAR(20) NOT NULL CHECK (reaction_type IN ('thumbs_up', 'thumbs_down', 'bookmark')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(message_id, user_id, reaction_type)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user_id ON message_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_type ON message_reactions(user_id, reaction_type);

-- Enable Row Level Security
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for reactions
CREATE POLICY "Users can view their own reactions"
ON message_reactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reactions"
ON message_reactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reactions"
ON message_reactions FOR DELETE
USING (auth.uid() = user_id);

-- Create a view for message reactions summary
CREATE OR REPLACE VIEW message_reactions_summary AS
SELECT
    m.id as message_id,
    m.conversation_id,
    COUNT(CASE WHEN mr.reaction_type = 'thumbs_up' THEN 1 END) as thumbs_up_count,
    COUNT(CASE WHEN mr.reaction_type = 'thumbs_down' THEN 1 END) as thumbs_down_count,
    COUNT(CASE WHEN mr.reaction_type = 'bookmark' THEN 1 END) as bookmark_count
FROM messages m
LEFT JOIN message_reactions mr ON m.id = mr.message_id
GROUP BY m.id, m.conversation_id;

-- Function to get bookmarked messages for a user
CREATE OR REPLACE FUNCTION get_bookmarked_messages(p_user_id UUID)
RETURNS TABLE (
    message_id UUID,
    conversation_id UUID,
    conversation_title VARCHAR,
    message_content TEXT,
    message_role VARCHAR,
    message_created_at TIMESTAMP WITH TIME ZONE,
    bookmarked_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id as message_id,
        m.conversation_id,
        c.title as conversation_title,
        m.content as message_content,
        m.role as message_role,
        m.created_at as message_created_at,
        mr.created_at as bookmarked_at
    FROM message_reactions mr
    INNER JOIN messages m ON mr.message_id = m.id
    INNER JOIN conversations c ON m.conversation_id = c.id
    WHERE mr.user_id = p_user_id
      AND mr.reaction_type = 'bookmark'
      AND c.user_id = p_user_id
    ORDER BY mr.created_at DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_bookmarked_messages TO authenticated;

COMMENT ON TABLE message_reactions IS 'Stores user reactions (thumbs up/down, bookmarks) to messages';
COMMENT ON FUNCTION get_bookmarked_messages IS 'Returns all bookmarked messages for a user';
