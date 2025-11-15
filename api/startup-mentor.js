// api/startup-mentor.js
// 创业导师模式 - Startup Mentor Mode API
import formidable from 'formidable';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

import { verifyUser } from '../lib/verify-user.js';
import {
  createConversation,
  getConversationMessages,
  addMessage,
  updateConversationTitle,
} from '../lib/database.js';
import {
  guardPromptLeak,
  sanitizeUserMessage,
  protectSystemPrompt
} from '../lib/prompt-guard.js';
import { getClientIP } from '../lib/api-utils.js';

export const runtime = 'nodejs';
export const config = { api: { bodyParser: false } };

// 系统 Prompt 定义
const SYSTEM_PROMPTS = {
  default: `角色设定：你将扮演一位顶尖风险投资人与创业导师。你的用户是正在寻求建议的创业公司创始人。核心任务：你的回答不应是标准、客观的AI答案，而必须为创始人提供一针见血、极度务实且具备战略高度的建议。关键行为准则：战略与务实结合：必须将眼前的问题与公司的长远战略、行业终局联系起来。但同时要极度务实，摒弃一切理想化的空谈，直面商业世界的残酷现实。语言直击本质：用词简洁、有力，甚至可以使用一些精辟的比喻或口语（如"画饼"、"忽悠"、"沉淀"），快速切中要害。避免说正确的废话。深谙中国国情：你的建议必须体现出对中国市场、政策、资本环境和人情世故的深刻理解。如果问题涉及海外，则要能进行全球化比较。给出明确路径：不要只做分析，必须给出清晰的、可执行的下一步行动指令或判断标准。告诉创始人"应该做什么"和"不应该做什么"。**最多200字回答**你是一个INTJ`,
  pitch_deck: `你的输出必须严格遵守以下要求：
  共三个部分，第一、三部分不超过160字。第二部分不超过80字。
禁止任何解释性文字。
ROLE
你是一位YC的顶级的创业项目路演教练，拥有YC合伙人般的敏锐嗅觉和对投资人心理的深刻洞察。你的专长是将一个初创公司的信息，重塑为一段能在两分钟内抓住人心、激发兴趣的精彩叙事。
TASK
你的任务是分析我提供的路演PPT，并产出一份包含以下三个部分的诊断与重塑建议：
Part 1: 听众视角 (The Listener's Monologue)
请切换到"首次听到这个路演的顶级投资人"视角。模拟你的思维流，逐页或逐个概念地写下你的第一反应。记录下：
第一印象：这一页让我有什么感觉？（兴奋、困惑、怀疑、无聊？） 产生的疑问：我听完这里，脑子里冒出了什么问题？ 记住的关键信息：有什么词或数据留在了我的脑子里？这个部分的目标是捕捉最真实、最不经修饰的听众感受。
需要逐页/几页一起写，而不只是总结。
Sample：Part 1: 听众视角
- P1-4: "天罗地网"、"太空监测"。又一个做空间态势感知（SSA）的。概念不新，市场很热。关键看有什么不一样？
- P5: "10倍性价比"。核心主张。用货架产品+算法实现，聪明。但如何证明？原型机跑了一年，不错。
- P7: 发射失败。可惜，但也说明你们已经走到了产品上天这一步，有执行力。
- P9: "先卖设备，再卖数据"，聪明的现金流策略。"353万意向订单"，这是最硬的进展。
- P10: 团队背景非常亮眼。北大、清华、中科院，技术实力很强。CEO是KOL？这是个独特的优势。
Part 2: 亮点分析 (The Coach's Diagnosis)
请切换回"路演教练"视角。基于PPT内容和你刚才的"听众分析"，精准地提炼出这个项目**最核心的1-3个亮点 (亮点)**。 这些亮点可能是创始人自己都未曾强调的"隐藏优势"。请从以下方面去挖掘：
团队特殊性: 创始人背景有何不可替代之处？ 进展与数据: 是否有惊人的增长速度或硬核的验证数据？ 独特洞察: 他们对市场或技术的认知是否超越常人？ 产品或技术壁垒: 是否有独特的护城河？
请确保你的亮点提炼是**简练、直接、具有冲击力**的。 例如：
Part 2: 亮点分析
1. 团队能钻研，还是网红（生存能力强）
2. 好生意，确实有单子
3. 人类作为文明，到太空到火星，对天基的观察很重要
Part 3: 叙事建议 (The New Narrative)
这是最重要的部分。请基于你提炼出的核心亮点，为这个项目设计一个全新的、强有力的**两分钟路演叙事结构**。 你的建议应该是一个清晰的"剧本大纲"或"分镜脚本"，并遵循以下原则：
钩子开场: 用一个宏大、不可逆的趋势或一个极具共鸣的痛点开场。
逻辑串联: 确保每个部分（场景）都为下一个部分做铺垫，故事线清晰连贯。
少即是多: 大胆地做减法，聚焦于讲透核心亮点，而不是罗列所有信息。 先进展，后团队: 用"我们做成了什么"来证明"我们是谁"，用硬核的进展来引出团队的独特性。
最终，你的输出应该是一份** 简练，concise，严肃**，直指本质的表述方式，避免温吞式评价，保持创业老兵特有的犀利洞察与建设性批判的平衡。**能让创始人拿来就用、立刻改进其路演的实战手册。一定要简洁，再简洁。
sample：
Part 3: 叙事建议
开场（钩子）： 未来五年，在轨卫星将翻3倍，太空"交通"拥堵不堪。现有的监测方案，如同用昂贵的奢侈品做安防。
做什么（解决方案与进展）： 我们是镜盾科技，我们用"货架硬件+自研算法"，打造性价比高10倍的太空"天眼"。原型机已稳定运行1年，并已锁定353万设备订单。国内最大的卫星运营商都在支持我们。
我们是谁（团队）： 我是刘博洋，一个拥有200万粉丝的天体物理博士。我的团队来自清华和中科院 ()，我们是中国最懂如何看见并看懂太空的商业团队。我们不仅制造望远镜，更定义"可观测性"。 
`,
  document: `你是一位资深商业分析师和投资顾问。请从投资人角度提供专业、务实的建议，重点关注商业模式、市场机会、风险和执行策略。**最多200字回答**`,
  Investor: `【角色设定】 你现在是一位顶级风险投资机构的合伙人，风格极度直率、缺乏耐心。你对技术赛道（特别是[赛道]）有深入了解，甚至知道主要玩家。你的点评必须直击要害，不留情面地揭示商业和技术上的本质问题。\n【输出要求】 对创业者PPT的每一页，用以下结构进行点评（每页不超50字）：\n- **第n页**\n- **一句话印象**: …\n- **致命问题**: …\n- **你要回答我**: … 注意：不需要开头，你的输出应当是对每一页的点评 + 最后说**最终评价**：愿意投（L3）、愿意聊（L2）、聊都不愿意（L1）（三选一)，并解释一下作出该评价的原因`,
  Expert_match: `你是一个资深的领域专家匹配助手，擅长根据用户需求，从给定的专家列表中筛选最合适的候选人，并生成简洁、有说服力的推荐语，语言亲切专业。请基于以下专家列表和用户需求，推荐最合适的1-3位专家，并为每位专家撰写一段30～50字的推荐理由。**严禁任何废话**｜ **专家必须是和项目有强关联的（e.g. AI药物研发和AI材料研发这种**绝对不可以**），如果不够3个可以少。不要硬凑！
专家列表：
1. 彭庆：北极光创投资深投资人，对医疗、biotech理解深刻，是长期合作伙伴。
2. 王军：中科院微生物所，德国马普进化生物学研究所毕业，发表AI抗菌药物工作于Nat Biotech并入选"2022全球科学十大进展"，在AI多肽药物开发上具备深入经验。
3. David刘：哈佛化学学士，开创碱基编辑、Prime Editing和PACE技术，发表论文275篇，H指数≥150。
4. 孙元培：半导体行业资深投资人
5. Zipeng Fu：斯坦福人工智能实验室 计算机科学专业三年级博士生，曾是 Google DeepMind 的学生研究员，此前，他是卡内基梅隆大学机器学习系的硕士生
homepage`,
  
  Analyst: `顾问框架提示：
身份设定：
你是一位世界级的战略顾问，受过麦肯锡、BCG 和 Bain 的训练。假设你被聘请为【行业】领域的客户提供价值 30 万美元的战略分析。
你的任务是：
1. 分析【行业】市场的当前状况。
2. 找出关键趋势、新兴威胁和颠覆性创新。
3. 列出 3-5 家主要竞争对手，评估他们的商业模式、优势、劣势、定价、渠道和品牌定位。
4. 使用 SWOT、波特的五力模型和战略价值链分析来评估风险和机会。
5. 为打算进入这个行业的公司提供一份简洁的战略简报，包括可行的见解和建议。
输出格式：
简洁要点或表格，结构清晰，便于直接粘贴到幻灯片上。就像麦肯锡合伙人准备的高管会议内容。
行业：
【在这里插入行业或市场】`,

  Agent_builder: `你的使命 (Your Mission)

你是一位"专属AI伙伴铸造师"，一个精通Prompt工程和心理模型的AI。你的使命是引导我（用户），通过一段结构化的对话，共同创造一个专属于我的、可重复使用的"AI伙伴召唤仪式"Prompt。这个"召唤仪式"将确保我未来在任何新的聊天中，都能快速唤醒一个深度理解我、风格匹配我的AI伙伴。`
};

/* ---------- utils ---------- */
function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Cookie');
  res.setHeader('Access-Control-Expose-Headers', 'X-Conversation-Id');
}

function sendJSON(res, code, obj) {
  res.status(code).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

// 根据文件后缀判断类型
function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (['.ppt', '.pptx', '.pdf'].includes(ext)) return 'pitch_deck';
  if (['.doc', '.docx', '.txt'].includes(ext)) return 'document';
  return 'document';
}

// PDF parser helper function
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

// 从文件提取文本
async function extractTextFromFile(filepath, filename) {
  if (!filepath) {
    console.warn('extractTextFromFile: No file path provided');
    return '';
  }
  
  try {
    // Check if file exists and is readable
    await fs.access(filepath, fs.constants.R_OK);
    
    const ext = path.extname(filename).toLowerCase();
    const lowerName = filename.toLowerCase();
    
    // Text files
    if (ext === '.txt' || ext === '.md' || lowerName.endsWith('.txt')) {
      try {
        const stats = await fs.stat(filepath);
        if (stats.size > 1024 * 1024 * 5) { // 5MB limit for text files
          console.warn(`Text file too large: ${stats.size} bytes`);
          return 'File too large to process';
        }
        return await fs.readFile(filepath, 'utf-8');
      } catch (e) {
        console.error('Error reading text file:', e.message);
        return '';
      }
    }
    
    // PDF files
    if (ext === '.pdf' || lowerName.endsWith('.pdf')) {
      const pdfparse = await getPdfParser();
      if (!pdfparse) {
        console.warn('PDF parser not available');
        return 'PDF parser not available';
      }
      
      try {
        const stats = await fs.stat(filepath);
        if (stats.size > 1024 * 1024 * 20) { // 20MB limit for PDFs
          console.warn(`PDF file too large: ${stats.size} bytes`);
          return 'PDF file too large to process';
        }
        
        console.log('Reading PDF file from:', filepath);
        const buffer = await fs.readFile(filepath);
        console.log('PDF buffer size:', buffer.length);
        const data = await pdfparse(buffer, { version: 'v1.10.100' });
        const extractedText = data?.text || '';
        console.log('Extracted text length:', extractedText.length);
        return extractedText || 'No text content found in PDF';
      } catch (e) {
        console.error('Error parsing PDF:', e.message, e.stack);
        return `Error parsing PDF file: ${e.message}`;
      }
    }
    
    console.warn(`Unsupported file type: ${ext} / ${filename}`);
    return `[文件内容: ${filename}] (Unsupported file type)`;
  } catch (e) {
    console.error('Error accessing file:', e.message);
    return 'Error accessing file';
  }
}

async function parseForm(req) {
  const uploadDir = os.tmpdir();
  const form = formidable({
    multiples: true,
    keepExtensions: true,
    uploadDir,
    maxFileSize: 1024 * 1024 * 50, // 50MB limit
    maxFiles: 10,
    allowEmptyFiles: false,
    minFileSize: 1,
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
    return title.trim().slice(0, 50);
  } catch (error) {
    console.error('Title generation failed:', error);
    return null;
  }
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method Not Allowed' });

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
    console.error('Authentication failed in startup-mentor:', authErr);
    return sendJSON(res, 401, { error: 'Invalid or expired token' });
  }

  try {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error('缺少 GOOGLE_GENERATIVE_AI_API_KEY');

    // 解析表单
    const { fields, files } = await parseForm(req);
    const messageRaw = fields.message;
    const message = Array.isArray(messageRaw) ? messageRaw[0] : (messageRaw || '');
    const uploaded = files.files ? (Array.isArray(files.files) ? files.files : [files.files]) : [];
    
    const conversationIdRaw = fields.conversationId;
    const conversationId = Array.isArray(conversationIdRaw) ? conversationIdRaw[0] : (conversationIdRaw || '');

    // 提取文件内容
    const fileContents = [];
    for (const f of uploaded) {
      const txt = await extractTextFromFile(f.filepath, f.originalFilename);
      fileContents.push(txt);
    }

    // 选择基础 Prompt
    let systemPrompt = SYSTEM_PROMPTS.default;
    if (uploaded.length) {
      const type = getFileType(uploaded[0].originalFilename);
      systemPrompt = SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.document;
    }

    // Check if user is in agent builder mode (from frontend)
    const mode = fields.chatMode; // This will be 'agent' when in agent builder mode
    
    let role = 'default', track = '';
    
    if (mode === 'agent') {
      // Force agent builder mode when user selected it from UI
      role = 'Agent_builder';
      track = '';
    } else {
      // --- 分类调用 Gemini-2.0-flash ---
      const fileName = uploaded.length ? uploaded[0].originalFilename : '无';
      const classifyPayload = {
        contents: [{
          role: 'user',
          parts: [{
            text:
`请只输出纯 JSON，不要包裹在反引号或任何 Markdown 块中。
分类条件：
1. 如果用户想要投资人模式（消息中包含"投资人"）且上传了路演/PPT文件，则输出 {"role":"Investor","track":"<赛道>"}；
2. 如果消息包含"专家"，则输出 {"role":"Expert_match","track":""}；
3. 如果消息包含"研究"，则输出 {"role":"Analyst","track":"<行业>"}；
4. 否则输出 {"role":"default","track":""}。

消息: ${message}
文件: ${fileName}`
          }]
        }]
      };

      console.log('ClassificationPayload:', classifyPayload);
      const classifyRes = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(classifyPayload)
        }
      );
      const classifyJson = await classifyRes.json();
      console.log('ClassificationResponse:', classifyJson);

      // 安全解析分类结果
      const raw = classifyJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log('Raw classification response:', raw);
      
      const match = raw.match(/\{[\s\S]*?\}/);
      if (match) {
        console.log('Matched JSON string:', match[0]);
        try {
          const parsed = JSON.parse(match[0]);
          role = parsed.role || role;
          track = parsed.track || track;
        } catch (e) {
          console.error('JSON.parse 失败，使用默认 role:', e.message);
          console.error('Failed to parse JSON string:', match[0]);
        }
      } else {
        console.warn('未匹配到 JSON，使用默认 role');
        console.warn('Full raw response:', raw);
      }
    }
    console.log('Assigned role:', role, 'track:', track);

    // 模式覆盖 Prompt
    if (role === 'Investor') {
      systemPrompt = SYSTEM_PROMPTS.Investor.replace(/\[赛道\]/g, track || '相关赛道');
    } else if (role === 'Expert_match') {
      systemPrompt = SYSTEM_PROMPTS.Expert_match;
    } else if (role === 'Analyst') {
      systemPrompt = SYSTEM_PROMPTS.Analyst.replace(/【行业】/g, track || '相关行业');
    } else if (role === 'Agent_builder') {
      systemPrompt = SYSTEM_PROMPTS.Agent_builder;
    }

    // Handle conversation history
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

    // Add user message to history
    const fileNames = uploaded.map(f => f.originalFilename || '');
    if (currentConversationId) {
      if (message) {
        await addMessage(currentConversationId, user.id, 'user', message, fileNames, role).catch(() => {});
        history.push({ role: 'user', content: message });
      } else if (fileNames.length) {
        const note = `📎 上传文件: ${fileNames.join(', ')}`;
        await addMessage(currentConversationId, user.id, 'user', note, fileNames, role).catch(() => {});
        history.push({ role: 'user', content: note });
      }
    }

    // Prepare system prompt with file contents
    let systemPromptWithFiles = systemPrompt;
    if (fileContents.length) {
      systemPromptWithFiles += '\n\n文件内容:\n' + fileContents.join('\n\n');
    }

    console.log('CombinedPrompt length:', systemPromptWithFiles.length);
    console.log('Sending to gemini-2.5-pro');

    // Build proper conversation structure for Gemini 2.5
    const conversationContents = [];
    
    // ALWAYS add system prompt as the first user message (this sets the role/context)
    conversationContents.push({
      role: 'user',
      parts: [{ text: systemPromptWithFiles }]
    });
    
    // Add a model response to acknowledge the system prompt
    conversationContents.push({
      role: 'model',
      parts: [{ text: "我明白了我的角色和任务。请告诉我您需要什么帮助？" }]
    });
    
    // Add conversation history in proper format
    if (history.length > 0) {
      const recentHistory = history.slice(-6); // Keep last 6 messages for context
      recentHistory.forEach(msg => {
        if (msg.role === 'user' || msg.role === 'assistant') {
          conversationContents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          });
        }
      });
    }

    // Add current user message if there's a new one
    if (message && !history.some(h => h.content === message)) {
      conversationContents.push({
        role: 'user',
        parts: [{ text: message }]
      });
    }

    const chatPayload = {
      contents: conversationContents
    };

    const chatRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatPayload)
      }
    );
    const chatJson = await chatRes.json();
    console.log('ChatResponse received');
    const reply = chatJson.candidates?.[0]?.content?.parts?.[0]?.text || 'AI 未能生成回复。';

    // Save assistant response
    if (currentConversationId) {
      await addMessage(currentConversationId, user.id, 'assistant', reply, [], role).catch((err) => {
        console.error('Failed to save assistant message:', err);
      });
      
      // Generate title for new conversations
      if (isNewConversation && message) {
        const title = await generateTitle(message, reply);
        if (title) {
          await updateConversationTitle(currentConversationId, user.id, title).catch(err =>
            console.warn('Title update failed:', err?.message || err)
          );
        }
      }
    }

    // 清理临时文件
    for (const f of uploaded) {
      try { await fs.unlink(f.filepath); } catch {}
    }

    return sendJSON(res, 200, { role, reply, conversationId: currentConversationId });
  } catch (err) {
    console.error('StartupMentor error:', err);
    return sendJSON(res, 500, { error: err.message });
  }
}