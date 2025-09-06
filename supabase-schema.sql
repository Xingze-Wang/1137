-- 聊天历史数据库表结构
-- 请在 Supabase SQL Editor 中执行此脚本

-- 启用 RLS (Row Level Security)
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- 会话表 - 存储用户的聊天会话
CREATE TABLE conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT '新对话',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 消息表 - 存储聊天消息
CREATE TABLE messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    files JSONB DEFAULT '[]'::jsonb,
    ai_mode VARCHAR(50) DEFAULT 'default',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON conversations(user_id, updated_at DESC);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(conversation_id, created_at ASC);

-- 启用 Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 会话表的 RLS 策略
CREATE POLICY "Users can view their own conversations" 
ON conversations FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations" 
ON conversations FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations" 
ON conversations FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations" 
ON conversations FOR DELETE 
USING (auth.uid() = user_id);

-- 消息表的 RLS 策略
CREATE POLICY "Users can view messages in their conversations" 
ON messages FOR SELECT 
USING (
    conversation_id IN (
        SELECT id FROM conversations WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can create messages in their conversations" 
ON messages FOR INSERT 
WITH CHECK (
    conversation_id IN (
        SELECT id FROM conversations WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update messages in their conversations" 
ON messages FOR UPDATE 
USING (
    conversation_id IN (
        SELECT id FROM conversations WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete messages in their conversations" 
ON messages FOR DELETE 
USING (
    conversation_id IN (
        SELECT id FROM conversations WHERE user_id = auth.uid()
    )
);

-- 创建函数自动更新 conversation 的 updated_at 字段
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations 
    SET updated_at = NOW() 
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器，在插入新消息时更新会话时间
CREATE TRIGGER update_conversation_on_new_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_timestamp();