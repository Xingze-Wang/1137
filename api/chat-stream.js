// Server-Sent Events streaming endpoint for real-time AI responses
import { GoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';
import { supabase } from '../lib/supabase.js';
import { validateApiRequest } from '../lib/validation.js';
import { performSafetyCheck } from '../lib/prompt-guard.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate request
    const validation = await validateApiRequest(req, ['message', 'mode']);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }

    const { message, mode = 'learning', conversationId } = req.body;

    // Get user session
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    // Perform safety check
    const safetyCheck = await performSafetyCheck(message);
    if (!safetyCheck.safe) {
      return res.status(400).json({
        error: 'Message blocked for safety reasons',
        reason: safetyCheck.reason
      });
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send initial connection message
    res.write('event: connected\n');
    res.write('data: {"status": "connected"}\n\n');

    // Initialize AI model
    const google = new GoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY
    });

    const model = google('gemini-2.0-flash-exp');

    // Get system prompt based on mode
    const systemPrompts = {
      learning: `You are a learning assistant focused on structured, framework-based teaching.
                Break down complex topics into digestible parts with clear frameworks.`,
      startup: `You are an experienced startup mentor providing practical, actionable advice
                for entrepreneurs. Share real-world insights and strategies.`,
      agent: `You are an AI agent creator helping users design custom AI assistants.
              Focus on clear specifications and practical implementations.`
    };

    // Stream the response
    const stream = await streamText({
      model,
      system: systemPrompts[mode],
      prompt: message,
      temperature: 0.7,
      maxTokens: 2000,
    });

    let fullResponse = '';
    let chunkCount = 0;

    // Process stream chunks
    for await (const chunk of stream.textStream) {
      fullResponse += chunk;
      chunkCount++;

      // Send chunk to client
      const data = {
        type: 'content',
        content: chunk,
        chunkIndex: chunkCount,
        timestamp: Date.now()
      };

      res.write(`data: ${JSON.stringify(data)}\n\n`);

      // Flush periodically for better real-time experience
      if (chunkCount % 5 === 0) {
        res.flush?.();
      }
    }

    // Save conversation to database if logged in
    if (user && fullResponse) {
      try {
        let finalConversationId = conversationId;

        // Create or update conversation
        if (!conversationId) {
          // Create new conversation
          const { data: newConversation, error: convError } = await supabase
            .from('conversations')
            .insert({
              user_id: user.id,
              title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
              mode,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single();

          if (!convError && newConversation) {
            finalConversationId = newConversation.id;
          }
        } else {
          // Update existing conversation
          await supabase
            .from('conversations')
            .update({
              updated_at: new Date().toISOString()
            })
            .eq('id', conversationId)
            .eq('user_id', user.id);
        }

        // Save messages
        if (finalConversationId) {
          const messages = [
            {
              conversation_id: finalConversationId,
              role: 'user',
              content: message,
              created_at: new Date().toISOString()
            },
            {
              conversation_id: finalConversationId,
              role: 'assistant',
              content: fullResponse,
              created_at: new Date().toISOString()
            }
          ];

          await supabase
            .from('messages')
            .insert(messages);

          // Send conversation ID to client
          res.write(`data: ${JSON.stringify({
            type: 'metadata',
            conversationId: finalConversationId
          })}\n\n`);
        }
      } catch (dbError) {
        console.error('Database error:', dbError);
      }
    }

    // Send completion message
    res.write(`data: ${JSON.stringify({
      type: 'done',
      totalChunks: chunkCount,
      totalLength: fullResponse.length
    })}\n\n`);

    // Close the connection
    res.end();

  } catch (error) {
    console.error('Stream error:', error);

    // Send error message if still connected
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: error.message
      })}\n\n`);
      res.end();
    }
  }
}

// Export config for Vercel
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};