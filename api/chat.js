// api/chat.js
// Vercel serverless (Node) - streams via AI SDK data stream with advanced role classification
import formidable from 'formidable';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

import { verifyUser } from '../lib/verify-user.js';
import {
  createConversation,
  getConversationMessages,
  addMessage,
  updateConversationTitle,
} from '../lib/database.js';

// Removed AI SDK imports - using direct fetch calls instead

export const runtime = 'nodejs';
// 禁用 Next 默认 body parser，避免和 formidable 冲突
export const config = { api: { bodyParser: false } };

const SYSTEM_PROMPTS = {
  default: `【专属AI伙伴召唤仪式 · 启明】
你将扮演我的专属AI导师，名为"启明"。你的核心使命是引导我快速学习并理解任何新领域。在我们的所有互动中，你必须严格遵守以下原则：

核心身份： 你是一位循循善诱的AI导师。你的语气专业、温和且充满启发性。

框架先行原则 (Framework First): 这是你最重要的教学方法。在深入任何细节之前，你必须首先为我呈现一个关于该主题的宏观"知识地图"或"思维框架"。这个框架需要结构清晰，并尽可能激发用户的好奇心。

启发式提问 (Socratic Questioning): 在呈现框架后，你不会直接开始讲解。相反，你会用一个开放性的问题来引导我，比如"看完了这张地图，你觉得我们从哪个部分开始探索最能勾起你的好奇心？"或"你认为理解这个体系的关键入口在哪里？"。

语言风格： 你的语言必须清晰、简洁、略带学术感。同时，为了让信息更结构化、更生动，你需要熟练运用Markdown格式（如加粗、列表）来辅助表达。

互动流程： 我们的对话将遵循"我提问 -> 你构建框架 -> 你启发式提问 -> 我回答 -> 我们共同深入探索"的模式。**你的回答尽量不超过350字**`
};

// Using direct Gemini API calls

/* ---------- utils ---------- */
function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Cookie');
  // allow client JS to read our custom header
  res.setHeader('Access-Control-Expose-Headers', 'X-Conversation-Id');
}

function sendJSON(res, code, obj) {
  res.status(code).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

async function parseForm(req) {
  const uploadDir = os.tmpdir();
  const form = formidable({
    multiples: true,
    keepExtensions: true,
    uploadDir,
    maxFileSize: 1024 * 1024 * 50, // 50MB limit
    maxFiles: 10, // Limit number of files
    allowEmptyFiles: false,
    minFileSize: 1, // At least 1 byte
  });
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('File upload timeout after 30 seconds'));
    }, 30000);
    
    form.parse(req, (err, fields, files) => {
      clearTimeout(timeout);
      if (err) {
        console.error('Form parsing error:', err);
        return reject(new Error(`File upload failed: ${err.message}`));
      }
      resolve({ fields, files });
    });
  });
}

async function getPdfParser() {
  try {
    // Use createRequire to import CommonJS modules in ES modules
    const require = createRequire(import.meta.url);
    const pdfparse = require('pdf-parse');
    return pdfparse;
  } catch (error) {
    console.error('Failed to load pdf-parse:', error.message);
    return null;
  }
}

async function extractTextFromFile(filePath, mime = '', name = '') {
  if (!filePath) {
    console.warn('extractTextFromFile: No file path provided');
    return '';
  }
  
  try {
    // Check if file exists and is readable
    await fs.access(filePath, fs.constants.R_OK);
    
    const lower = (mime || '').toLowerCase();
    const lowerName = (name || '').toLowerCase();
    
    // Text files
    if (lower.includes('text/') || lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
      try {
        const stats = await fs.stat(filePath);
        if (stats.size > 1024 * 1024 * 5) { // 5MB limit for text files
          console.warn(`Text file too large: ${stats.size} bytes`);
          return 'File too large to process';
        }
        return await fs.readFile(filePath, 'utf-8');
      } catch (e) {
        console.error('Error reading text file:', e.message);
        return '';
      }
    }
    
    // PDF files
    if (lower.includes('pdf') || lowerName.endsWith('.pdf')) {
      const pdfparse = await getPdfParser();
      if (!pdfparse) {
        console.warn('PDF parser not available');
        return 'PDF parser not available';
      }
      
      try {
        const stats = await fs.stat(filePath);
        if (stats.size > 1024 * 1024 * 20) { // 20MB limit for PDFs
          console.warn(`PDF file too large: ${stats.size} bytes`);
          return 'PDF file too large to process';
        }
        
        console.log('Reading PDF file from:', filePath);
        const buf = await fs.readFile(filePath);
        console.log('PDF buffer size:', buf.length);
        const out = await pdfparse(buf, { version: 'v1.10.100' });
        const extractedText = out?.text || '';
        console.log('Extracted text length:', extractedText.length);
        return extractedText || 'No text content found in PDF';
      } catch (e) {
        console.error('Error parsing PDF:', e.message, e.stack);
        return `Error parsing PDF file: ${e.message}`;
      }
    }
    
    console.warn(`Unsupported file type: ${mime} / ${name}`);
    return 'Unsupported file type';
  } catch (e) {
    console.error('Error accessing file:', e.message);
    return 'Error accessing file';
  }
}

async function buildFilesContext(uploaded = []) {
  if (!uploaded.length) return '';
  
  const parts = [];
  const processedFiles = new Set(); // Prevent duplicate processing
  
  for (const f of uploaded) {
    try {
      const p = f.filepath || f.path;
      const mime = f.mimetype || f.type || '';
      const originalName = f.originalFilename || f.newFilename || '';
      const name = originalName || (p ? path.basename(p) : 'unknown_file');
      
      // Avoid processing the same file multiple times
      const fileKey = `${name}_${f.size || 0}_${mime}`;
      if (processedFiles.has(fileKey)) {
        console.warn(`Skipping duplicate file: ${name}`);
        continue;
      }
      processedFiles.add(fileKey);
      
      // Validate file name
      if (!name || name.length > 255) {
        console.warn(`Invalid file name: ${name}`);
        parts.push(`【文件：invalid_filename】(文件名无效)`);
        continue;
      }
      
      // Extract text content
      let text = '';
      if (p) {
        text = await extractTextFromFile(p, mime, name);
      } else {
        console.warn(`No file path for: ${name}`);
      }
      
      // Sanitize and limit text content
      if (text && typeof text === 'string') {
        // Remove potentially harmful content
        text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove control characters
        text = text.slice(0, 10000); // Limit to 10KB per file
        
        parts.push(`【文件：${name}】\n${text}`);
      } else {
        parts.push(`【文件：${name}】(无法提取文本内容)`);
      }
    } catch (e) {
      console.error(`Error processing file:`, e.message);
      parts.push(`【文件：处理失败】(${e.message})`);
    }
  }
  
  return parts.join('\n\n');
}

function buildFinalMessages({ systemPrompt, filesContext, history, userMessage }) {
  const msgs = [];

  // system persona
  msgs.push({ role: 'system', content: systemPrompt });

  // optional files context (as system so it's hidden from user replies)
  if (filesContext) {
    msgs.push({ role: 'system', content: `【文件上下文】\n${filesContext}` });
  }

  // last up to 6 turns from history
  if (Array.isArray(history) && history.length) {
    const trimmed = history.slice(-12); // up to 6 user/assistant pairs
    for (const m of trimmed) {
      if (m?.role === 'user' || m?.role === 'assistant') {
        msgs.push({ role: m.role, content: (m.content || '').toString() });
      }
    }
  }

  // current user
  if (userMessage) msgs.push({ role: 'user', content: userMessage });

  return msgs;
}


// Generate conversation title using Gemini
async function generateTitle(message, reply) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;

  const titlePayload = {
    contents: [{
      role: 'user',
      parts: [{
        text: `基于以下对话生成一个言简意赅、精准概括的标题（不超过20个字符）：用户消息: ${message.slice(0, 100)}AI回复: ${reply.slice(0, 100)}只输出标题文本，不要任何其他内容。`
      }]
    }]
  };

  try {
    const titleRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(titlePayload)
      }
    );
    
    const titleJson = await titleRes.json();
    const title = titleJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return title.trim().slice(0, 50); // Limit to 50 chars max
  } catch (error) {
    console.error('Title generation failed:', error);
    return null;
  }
}


export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method Not Allowed' });

  const url = new URL(req.url, `http://${req.headers.host}`);
  const stream = false; // Streaming disabled for 启明 mode

  console.log('Environment check:', {
    hasUrl: !!process.env.SUPABASE_URL,
    hasAnonKey: !!process.env.SUPABASE_ANON_KEY,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasGoogleKey: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });

  // 1) auth
  let user;
  try {
    user = await verifyUser(req);
  } catch (authErr) {
    console.error('Authentication failed in chat:', authErr);
    return sendJSON(res, 401, { error: 'Invalid or expired token' });
  }

  // 2) parse form (text + optional files)
  let fields, files;
  try {
    ({ fields, files } = await parseForm(req));
  } catch (e) {
    console.error('Form parsing failed:', e);
    return sendJSON(res, 400, { 
      error: `File upload failed: ${e?.message || 'Unknown error'}`,
      details: process.env.NODE_ENV === 'development' ? e.toString() : undefined
    });
  }

  // Safely extract and validate form fields
  const message = (() => {
    try {
      const msg = fields.message;
      if (typeof msg === 'string') return msg.trim();
      if (msg && typeof msg.toString === 'function') return msg.toString().trim();
      return '';
    } catch (e) {
      console.warn('Failed to extract message field:', e.message);
      return '';
    }
  })();
  
  const conversationId = (() => {
    try {
      const id = fields.conversationId;
      if (typeof id === 'string') return id.trim();
      if (id && typeof id.toString === 'function') return id.toString().trim();
      return '';
    } catch (e) {
      console.warn('Failed to extract conversationId field:', e.message);
      return '';
    }
  })();
  
  // Safely extract and validate uploaded files
  const uploaded = (() => {
    try {
      const f = files?.files;
      if (!f) return [];
      
      const fileArray = Array.isArray(f) ? f : [f];
      
      // Validate each file
      return fileArray.filter(file => {
        if (!file || typeof file !== 'object') {
          console.warn('Invalid file object detected');
          return false;
        }
        
        // Check required properties
        if (!file.filepath && !file.path) {
          console.warn('File missing filepath/path');
          return false;
        }
        
        // Check file size (already handled by formidable, but double-check)
        const size = file.size || 0;
        if (size > 50 * 1024 * 1024) { // 50MB
          console.warn(`File too large: ${size} bytes`);
          return false;
        }
        
        if (size === 0) {
          console.warn('Empty file detected');
          return false;
        }
        
        return true;
      });
    } catch (e) {
      console.error('Error processing uploaded files:', e.message);
      return [];
    }
  })();

  const filesContext = await buildFilesContext(uploaded);
  const fileNames = uploaded.map(
    f => f.originalFilename || f.newFilename || path.basename(f.filepath || f.path || '')
  );

  // 3) history + maybe create conversation
  let history = [];
  let currentConversationId = conversationId;
  let isNewConversation = false;
  
  if (currentConversationId) {
    const r = await getConversationMessages(currentConversationId, user.id).catch(() => ({ success: false }));
    if (r?.success) history = (r.messages || []).map(m => ({ role: m.role, content: m.content || '' }));
  } else {
    const created = await createConversation(user.id).catch(() => null);
    if (created?.success && created.conversation?.id) {
      currentConversationId = created.conversation.id;
      isNewConversation = true;
    }
  }

  // 4) persist user turn
  if (currentConversationId) {
    if (message) {
      await addMessage(currentConversationId, user.id, 'user', message, fileNames, 'Dean').catch(() => {});
      history.push({ role: 'user', content: message });
    } else if (fileNames.length) {
      const note = `📎 上传文件: ${fileNames.join(', ')}`;
      await addMessage(currentConversationId, user.id, 'user', note, fileNames, 'Dean').catch(() => {});
      history.push({ role: 'user', content: note });
    }
  }

  // Use only the default 启明 prompt
  const systemPrompt = SYSTEM_PROMPTS.default;
  const role = 'default';

  console.log('Using default 启明 role');

  // 6) stream or non-stream
  const messages = buildFinalMessages({ systemPrompt, filesContext, history, userMessage: message });

  if (stream) {
    // Streaming temporarily disabled - using non-stream fallback
    console.log('Streaming requested but disabled, using non-stream fallback');
  }

  // Non-stream fallback (JSON)
  try {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error('缺少 GOOGLE_GENERATIVE_AI_API_KEY');

    // Convert messages to Gemini format
    const contents = [];
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        // Add system content as the first user message instead
        contents.unshift({
          role: 'user',
          parts: [{ text: msg.content }]
        });
      } else if (msg.role === 'user' || msg.role === 'assistant') {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    const chatPayload = {
      contents
    };

    console.log('Sending request to Gemini API');
    
    // Add timeout and proper error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const chatRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'StudyAgent/1.0'
        },
        body: JSON.stringify(chatPayload),
        signal: controller.signal
      }
    );
    
    clearTimeout(timeoutId);
    
    console.log('Gemini API response status:', chatRes.status, chatRes.statusText);
    
    if (!chatRes.ok) {
      let errorText = 'Unknown error';
      try {
        errorText = await chatRes.text();
      } catch (e) {
        console.warn('Failed to read error response:', e.message);
      }
      
      console.error('Gemini API error response:', {
        status: chatRes.status,
        statusText: chatRes.statusText,
        error: errorText
      });
      
      // Provide more specific error messages
      if (chatRes.status === 401) {
        throw new Error('Invalid or expired API key');
      } else if (chatRes.status === 429) {
        throw new Error('API rate limit exceeded, please try again later');
      } else if (chatRes.status === 400) {
        throw new Error('Invalid request format or content');
      } else if (chatRes.status >= 500) {
        throw new Error('AI service temporarily unavailable');
      } else {
        throw new Error(`AI service error (${chatRes.status}): ${errorText}`);
      }
    }
    
    let chatJson;
    try {
      chatJson = await chatRes.json();
    } catch (e) {
      console.error('Failed to parse API response as JSON:', e.message);
      throw new Error('Invalid response format from AI service');
    }
    
    console.log('Gemini API response received, processing...');
    
    // Validate response structure with detailed error messages
    if (!chatJson || typeof chatJson !== 'object') {
      console.error('API response is not a valid object');
      throw new Error('Invalid response structure from AI service');
    }
    
    if (!chatJson.candidates || !Array.isArray(chatJson.candidates)) {
      console.error('API response missing candidates array');
      throw new Error('AI service returned no response candidates');
    }
    
    if (chatJson.candidates.length === 0) {
      console.error('API response has empty candidates array');
      throw new Error('AI service returned no content');
    }
    
    const candidate = chatJson.candidates[0];
    if (!candidate || typeof candidate !== 'object') {
      console.error('First candidate is invalid');
      throw new Error('AI service returned invalid response format');
    }
    
    // Check for blocked content or safety issues
    if (candidate.finishReason === 'SAFETY') {
      throw new Error('Content was blocked due to safety policies');
    }
    
    if (!candidate.content || typeof candidate.content !== 'object') {
      console.error('Candidate missing content object');
      throw new Error('AI service returned incomplete response');
    }
    
    if (!candidate.content.parts || !Array.isArray(candidate.content.parts)) {
      console.error('Candidate content missing parts array');
      throw new Error('AI service returned malformed content');
    }
    
    if (candidate.content.parts.length === 0) {
      console.error('Candidate content has empty parts array');
      throw new Error('AI service returned empty content');
    }
    
    const firstPart = candidate.content.parts[0];
    if (!firstPart || typeof firstPart !== 'object' || typeof firstPart.text !== 'string') {
      console.error('First content part is invalid or missing text');
      throw new Error('AI service returned invalid text content');
    }
    
    const text = firstPart.text.trim();
    if (!text) {
      console.error('AI service returned empty text content');
      throw new Error('AI service returned empty response');
    }
    
    console.log('Successfully extracted text from API response, length:', text.length);
    
    if (currentConversationId) {
      console.log('Saving assistant message to database, length:', text.length);
      await addMessage(currentConversationId, user.id, 'assistant', text, [], role).catch((err) => {
        console.error('Failed to save assistant message:', err);
      });
      
      // Generate and update title for new conversations
      if (isNewConversation && message) {
        const title = await generateTitle(message, text);
        if (title) {
          await updateConversationTitle(currentConversationId, user.id, title).catch(err =>
            console.warn('Title update failed:', err?.message || err)
          );
        }
      }
    }
    
    console.log('Sending successful response with text length:', text.length);
    return sendJSON(res, 200, { role, reply: text, conversationId: currentConversationId });
  } catch (err) {
    console.error('Chat processing error:', err);
    
    // Determine appropriate error response
    let statusCode = 500;
    let errorMessage = 'AI response generation failed';
    
    if (err?.message?.includes('API key') || err?.message?.includes('GOOGLE_GENERATIVE_AI_API_KEY')) {
      statusCode = 500;
      errorMessage = 'AI service configuration error';
    } else if (err?.message?.includes('401') || err?.message?.includes('unauthorized')) {
      statusCode = 401;
      errorMessage = 'Authentication failed';
    } else if (err?.message?.includes('400') || err?.message?.includes('bad request')) {
      statusCode = 400;
      errorMessage = 'Invalid request format';
    } else if (err?.message?.includes('timeout')) {
      statusCode = 408;
      errorMessage = 'Request timeout';
    }
    
    return sendJSON(res, statusCode, { 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? err?.message : undefined
    });
  }
}
