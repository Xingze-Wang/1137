import { getSupabaseAdmin } from './supabase.js';

// 创建新会话
export async function createConversation(userId, title = '新对话') {
  try {
    // Validate inputs
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new Error('Invalid user ID provided');
    }
    
    if (!title || typeof title !== 'string') {
      title = '新对话';
    }
    
    // Sanitize and limit title length
    title = title.trim().slice(0, 255);
    if (!title) title = '新对话';
    
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      throw new Error('Database connection not available');
    }

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert([
        {
          user_id: userId.trim(),
          title: title
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Database error creating conversation:', error);
      throw new Error(`Failed to create conversation: ${error.message}`);
    }
    
    if (!data || !data.id) {
      throw new Error('No conversation data returned from database');
    }
    
    return { success: true, conversation: data };
  } catch (error) {
    console.error('创建会话失败:', error.message || error);
    return { success: false, error: error.message || 'Failed to create conversation' };
  }
}

// 获取用户的所有会话
export async function getUserConversations(userId, limit = 50) {
  try {
    // Validate inputs
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new Error('Invalid user ID provided');
    }
    
    // Validate and sanitize limit
    const maxLimit = 100;
    if (typeof limit !== 'number' || limit < 1 || limit > maxLimit) {
      limit = 50;
    }
    
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      throw new Error('Database connection not available');
    }

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select(`
        id,
        title,
        created_at,
        updated_at,
        messages (
          id,
          role,
          content,
          created_at,
          ai_mode
        )
      `)
      .eq('user_id', userId.trim())
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Database error fetching conversations:', error);
      throw new Error(`Failed to fetch conversations: ${error.message}`);
    }
    
    // Validate response data
    if (!Array.isArray(data)) {
      console.warn('Unexpected data format from database');
      return { success: true, conversations: [] };
    }
    
    return { success: true, conversations: data || [] };
  } catch (error) {
    console.error('获取会话失败:', error.message || error);
    return { success: false, error: error.message || 'Failed to fetch conversations' };
  }
}

// 获取会话的所有消息
export async function getConversationMessages(conversationId, userId) {
  try {
    // Validate inputs
    if (!conversationId || typeof conversationId !== 'string' || conversationId.trim().length === 0) {
      throw new Error('Invalid conversation ID provided');
    }
    
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new Error('Invalid user ID provided');
    }
    
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      throw new Error('Database connection not available');
    }

    // 验证会话属于该用户
    const { data: conversation, error: convError } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('id', conversationId.trim())
      .eq('user_id', userId.trim())
      .single();

    if (convError) {
      console.error('Database error verifying conversation ownership:', convError);
      if (convError.code === 'PGRST116') {
        throw new Error('Conversation not found or access denied');
      }
      throw new Error(`Failed to verify conversation: ${convError.message}`);
    }
    
    if (!conversation) {
      throw new Error('Conversation not found or access denied');
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId.trim())
      .order('created_at', { ascending: true })
      .limit(1000); // Prevent huge result sets

    if (error) {
      console.error('Database error fetching messages:', error);
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }
    
    return { success: true, messages: data || [] };
  } catch (error) {
    console.error('获取消息失败:', error.message || error);
    return { success: false, error: error.message || 'Failed to fetch messages' };
  }
}

// 添加消息到会话
export async function addMessage(conversationId, userId, role, content, files = [], aiMode = 'default') {
  try {
    // Validate inputs
    if (!conversationId || typeof conversationId !== 'string' || conversationId.trim().length === 0) {
      throw new Error('Invalid conversation ID provided');
    }
    
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new Error('Invalid user ID provided');
    }
    
    if (!role || !['user', 'assistant'].includes(role)) {
      throw new Error('Invalid role provided. Must be "user" or "assistant"');
    }
    
    if (!content || typeof content !== 'string') {
      throw new Error('Invalid content provided');
    }
    
    // Sanitize and validate content
    content = content.trim();
    if (content.length === 0) {
      throw new Error('Message content cannot be empty');
    }
    
    if (content.length > 50000) { // 50KB limit
      content = content.slice(0, 50000);
    }
    
    // Validate files array
    if (!Array.isArray(files)) {
      files = [];
    }
    
    // Validate and sanitize files
    files = files.filter(file => {
      return file && typeof file === 'string' && file.trim().length > 0;
    }).slice(0, 10); // Limit to 10 files
    
    // Validate aiMode
    if (!aiMode || typeof aiMode !== 'string') {
      aiMode = 'default';
    }
    aiMode = aiMode.trim().slice(0, 50);
    
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      throw new Error('Database connection not available');
    }

    // 验证会话属于该用户
    const { data: conversation, error: convError } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('id', conversationId.trim())
      .eq('user_id', userId.trim())
      .single();

    if (convError) {
      console.error('Database error verifying conversation for message:', convError);
      if (convError.code === 'PGRST116') {
        throw new Error('Conversation not found or access denied');
      }
      throw new Error(`Failed to verify conversation: ${convError.message}`);
    }
    
    if (!conversation) {
      throw new Error('Conversation not found or access denied');
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert([
        {
          conversation_id: conversationId.trim(),
          role: role,
          content: content,
          files: files,
          ai_mode: aiMode
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Database error adding message:', error);
      throw new Error(`Failed to add message: ${error.message}`);
    }
    
    if (!data || !data.id) {
      throw new Error('No message data returned from database');
    }
    
    return { success: true, message: data };
  } catch (error) {
    console.error('添加消息失败:', error.message || error);
    return { success: false, error: error.message || 'Failed to add message' };
  }
}

// 更新会话标题
export async function updateConversationTitle(conversationId, userId, newTitle) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      throw new Error('Database connection not available');
    }
    
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .update({ title: newTitle })
      .eq('id', conversationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, conversation: data };
  } catch (error) {
    console.error('更新会话标题失败:', error);
    return { success: false, error: error.message };
  }
}

// 删除会话
export async function deleteConversation(conversationId, userId) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      throw new Error('Database connection not available');
    }
    
    const { error } = await supabaseAdmin
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('删除会话失败:', error);
    return { success: false, error: error.message };
  }
}

// 根据消息内容自动生成会话标题
export function generateConversationTitle(firstMessage) {
  const content = firstMessage.trim();
  const maxLength = 30;
  
  if (content.length <= maxLength) {
    return content;
  }
  
  return content.substring(0, maxLength).trim() + '...';
}

