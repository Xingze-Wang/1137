// script.js – FIXED VERSION WITH BETTER TOKEN EXPIRATION HANDLING
(() => {
  'use strict';

  /* ================================
   *  DOM lookups
   * ================================ */
  const authContainer = document.getElementById('auth-container');
  const chatContainer = document.getElementById('chat-container');

  // Auth UI
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const authMessage = document.getElementById('auth-message');
  const userEmail = document.getElementById('user-email');
  const logoutBtn = document.getElementById('logout-btn');
  const switchToSignup = document.getElementById('switch-to-signup');
  const switchToLogin = document.getElementById('switch-to-login');
  const USE_STREAM = false;

  // Sidebar
  const sidebar = document.getElementById('sidebar');
  const conversationsList = document.getElementById('conversations-list');
  const newChatBtn = document.getElementById('new-chat-btn');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar');

  // Chat area
  const chatLog = document.getElementById('chat-log');
  const chatForm = document.getElementById('chat-form');
  const userInput = document.getElementById('user-input');
  const sendButton = document.getElementById('send-button');
  const stopButton = document.getElementById('stop-button');
  const fileUploadBtn = document.getElementById('file-upload-btn');
  const fileInput = document.getElementById('file-input');
  const filePreviewArea = document.getElementById('file-preview-area');
  const fileList = document.getElementById('file-list');
  const clearFilesBtn = document.getElementById('clear-files');
  const conversationIdInput = document.getElementById('conversation-id');
  
  // Mode dropdown elements
  const modeDropdown = document.getElementById('mode-dropdown');
  const modeDropdownBtn = document.getElementById('mode-dropdown-btn');
  const modeDropdownMenu = document.getElementById('mode-dropdown-menu');
  const currentModeText = document.getElementById('current-mode-text');
  const chatModeInput = document.getElementById('chat-mode');

  const API_CHAT = '/api/chat';
  const API_STARTUP_MENTOR = '/api/startup-mentor';
  const API_CONV = '/api/conversations';
  const API_AUTH = '/api/auth';

  // Helper function to update page title and assistant name based on role
  function updateUIBasedOnRole(role) {
    let title = 'Dean'; // default
    let assistantName = 'Dean'; // default
    
    if (role === 'Investor') {
      title = 'Investor';
      assistantName = 'Investor';
    } else if (role === 'Expert_match') {
      title = 'Expert Match';
      assistantName = 'Expert Match';
    } else if (role === 'Analyst') {
      title = 'Analyst';
      assistantName = 'Analyst';
    } else if (role === 'Agent_builder') {
      title = 'Agent Builder';
      assistantName = 'Agent Builder';
    }
    
    // Update page title
    document.title = title;
    
    return assistantName;
  }

  /* ================================
   *  Minimal client AuthManager
   * ================================ */
  class AuthManager {
    constructor() {
      this.user = null;
      this.session = null;
      this.listeners = [];
      this._load();
    }
    addListener(cb) { if (typeof cb === 'function') this.listeners.push(cb); }
    _notify() { this.listeners.forEach(fn => { try { fn(this.user, this.session); } catch {} }); }
    _tokenFrom(s) { return s?.access_token || s?.accessToken || s?.provider_token || ''; }
    _getToken() { return this._tokenFrom(this.session || {}); }
    checkAuth() { return !!this._getToken(); }
    getCurrentUser() { return this.user; }
    getAuthHeaders() {
      const t = this._getToken();
      return t ? { Authorization: `Bearer ${t}` } : {};
    }
    _save(user, session) {
      this.user = user || null;
      this.session = session || null;
      localStorage.setItem('auth_user', JSON.stringify(this.user || {}));
      localStorage.setItem('auth_session', JSON.stringify(this.session || {}));
      // Cookie fallback for server (readable by Node)
      const t = this._getToken();
      if (t) {
        document.cookie = `sb-token=${encodeURIComponent(t)}; Path=/; SameSite=Lax`;
        document.cookie = `sb-access-token=${encodeURIComponent(t)}; Path=/; SameSite=Lax`;
      }
      this._notify();
    }
    _clear() {
      this.user = null; this.session = null;
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_session');
      document.cookie = 'sb-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
      document.cookie = 'sb-access-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
      this._notify();
    }
    _load() {
      try {
        const u = JSON.parse(localStorage.getItem('auth_user') || 'null');
        const s = JSON.parse(localStorage.getItem('auth_session') || 'null');
        if (s && this._tokenFrom(s)) { this.user = u; this.session = s; }
      } catch {}
    }
    
    // NEW: Method to validate current session
    async validateSession() {
      const token = this._getToken();
      if (!token) {
        this._clear();
        return false;
      }
      
      try {
        const r = await fetch(API_AUTH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'verify' })
        });
        
        if (!r.ok) {
          console.log('Session validation failed, clearing auth');
          this._clear();
          return false;
        }
        
        const data = await r.json();
        if (!data.valid) {
          console.log('Session invalid, clearing auth');
          this._clear();
          return false;
        }
        
        return true;
      } catch (err) {
        console.log('Session validation error:', err);
        this._clear();
        return false;
      }
    }
    
    async signup(email, password) {
      const r = await fetch(API_AUTH, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ action: 'signup', email, password })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || '注册失败');
      return j;
    }
    async signin(email, password) {
      const r = await fetch(API_AUTH, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ action: 'signin', email, password })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || '登录失败');
      if (!j.session || !this._tokenFrom(j.session)) throw new Error('登录成功但无 token');
      this._save(j.user, j.session);
      return j;
    }
    async signout() {
      try {
        await fetch(API_AUTH, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ action: 'signout' })
        });
      } catch {}
      this._clear();
    }
  }
  const authManager = new AuthManager();
  window.authManager = authManager; // optional global for debugging


  // IMPROVED: Global error handler for token expiration
  function handleApiError(response, error) {
    // Check various error patterns for token expiration
    const errorMessage = error?.message || error?.error || '';
    const isTokenExpired = 
      error?.code === 'TOKEN_EXPIRED' || 
      errorMessage.toLowerCase().includes('token expired') ||
      errorMessage.toLowerCase().includes('token is expired') ||
      errorMessage.toLowerCase().includes('invalid token') ||
      errorMessage.toLowerCase().includes('jwt') ||
      response?.status === 401;
    
    if (isTokenExpired) {
      console.log('Token expired, signing out...');
      authManager.signout();
      setUI(false); // Force show login screen
      return true; // handled
    }
    return false; // not handled
  }

  /* ================================
   *  UI helpers
   * ================================ */
  function setUI(authenticated) {
    if (authContainer) authContainer.style.display = authenticated ? 'none' : 'flex';
    if (chatContainer) chatContainer.style.display = authenticated ? 'flex' : 'none';
    if (authenticated) {
      const currentUser = authManager.getCurrentUser();
      const email = currentUser?.email || '';
      if (userEmail) userEmail.textContent = email;
      
      // Update user avatar with first letter of email
      const userAvatar = document.getElementById('user-avatar');
      if (userAvatar) {
        const firstLetter = email.charAt(0).toUpperCase() || 'U';
        userAvatar.textContent = firstLetter;
        userAvatar.style.fontSize = '1.1rem';
        userAvatar.style.fontWeight = '600';
      }
      
      // Load conversations with better error handling
      loadConversations().catch(err => {
        console.warn('[loadConversations] Error:', err);
        // Check if it's an auth error
        if (err?.message?.toLowerCase().includes('token') || err?.message?.toLowerCase().includes('401')) {
          authManager.signout();
          setUI(false);
        }
      });
      if (chatLog && !chatLog.children.length) {
        // Reset to default title and assistant name
        document.title = 'Dean';
        addMessage('Dean', '你好，我是你的AI导师，陪你一同探索一切未知。');
      }
    }
  }
  
  // IMPROVED: Initial auth check with validation
  async function initializeAuth() {
    if (authManager.checkAuth()) {
      // Have a token, but validate it's still good
      const isValid = await authManager.validateSession();
      setUI(isValid);
    } else {
      setUI(false);
    }
  }
  
  authManager.addListener((_u, s) => setUI(!!(s && (s.access_token || s.accessToken))));
  
  // Call initialization
  initializeAuth();

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
  function renderMessageContent(text) {
    const safe = escapeHtml(text);
    return safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }
  function createMessageElement(sender, message, extraClass = '') {
    const wrapper = document.createElement('div');
    wrapper.className = `chat-message ${extraClass}`.trim();

    const senderEl = document.createElement('p');
    senderEl.className = `message-sender ${sender}`;
    senderEl.textContent = sender;

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.innerHTML = `<p>${renderMessageContent(message || '')}</p>`;

    wrapper.appendChild(senderEl);
    wrapper.appendChild(contentEl);
    return wrapper;
  }
  function addMessage(sender, message, extraClass = '') {
    const el = createMessageElement(sender, message, extraClass);
    chatLog.appendChild(el);
    chatLog.scrollTop = chatLog.scrollHeight;
    return el;
  }
  
  // Share conversation functionality
  function generateConversationReport() {
    const messages = Array.from(chatLog.querySelectorAll('.chat-message'));
    if (messages.length === 0) {
      return 'No conversation to share.';
    }
    
    const currentUser = authManager.getCurrentUser();
    const timestamp = new Date().toLocaleString('zh-CN');
    
    let report = `# 对话报告\n\n`;
    report += `**生成时间**: ${timestamp}\n`;
    report += `**用户**: ${currentUser?.email || 'Anonymous'}\n`;
    report += `**AI助手**: Dean (AI实践导师)\n`;
    report += `**消息数量**: ${messages.length}\n\n`;
    report += `---\n\n`;
    
    // Extract conversation summary
    let conversationSummary = '';
    let keyTopics = new Set();
    let userQuestionCount = 0;
    
    messages.forEach((msgEl, index) => {
      const sender = msgEl.querySelector('.message-sender')?.textContent || '';
      const content = msgEl.querySelector('.message-content')?.textContent || '';
      
      if (sender === 'You') {
        userQuestionCount++;
        // Extract key topics from user messages
        const keywords = content.toLowerCase().match(/\b(\w{3,})\b/g) || [];
        keywords.forEach(word => {
          if (word.length > 3 && !['this', 'that', 'with', 'from', 'they', 'have', 'will', 'been', 'said', 'each', 'which', 'their', 'what', 'when', 'where', 'would', 'could', 'should'].includes(word)) {
            keyTopics.add(word);
          }
        });
      }
      
      report += `## ${index + 1}. ${sender}\n\n`;
      report += `${content}\n\n`;
      report += `---\n\n`;
    });
    
    // Add executive summary at the beginning
    let execSummary = `## 执行摘要\n\n`;
    execSummary += `本次对话共进行了 ${messages.length} 轮交流，用户提出了 ${userQuestionCount} 个问题或请求。`;
    
    if (keyTopics.size > 0) {
      execSummary += `主要讨论话题包括：${Array.from(keyTopics).slice(0, 5).join('、')}等。`;
    }
    
    execSummary += `\n\nDean AI助手提供了专业的实践指导和建议，涵盖了用户关注的核心问题。对话展现了良好的互动质量和解决方案的实用性。\n\n`;
    execSummary += `---\n\n`;
    
    // Insert summary after header
    const headerEnd = report.indexOf('---\n\n') + 6;
    report = report.slice(0, headerEnd) + execSummary + '## 详细对话记录\n\n' + report.slice(headerEnd);
    
    report += `\n\n---\n\n`;
    report += `*本报告由 Beta AI 系统自动生成，记录了完整的对话内容和关键洞察。*\n`;
    
    return report;
  }
  
  function shareConversation() {
    const report = generateConversationReport();
    
    // Create a shareable link (in a real app, this would upload to a server)
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `conversation-report-${new Date().toISOString().slice(0, 10)}.md`;
    
    // Show share modal
    showShareModal(report, downloadLink);
  }
  
  function showShareModal(report, downloadLink) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'share-modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'share-modal';
    
    modal.innerHTML = `
      <div class="share-modal-header">
        <h3>分享对话</h3>
        <button class="close-modal" type="button">&times;</button>
      </div>
      <div class="share-modal-content">
        <p>您的对话已生成为专业报告格式。您可以：</p>
        <div class="share-options">
          <button class="share-option" id="download-report">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            下载报告 (Markdown)
          </button>
          <button class="share-option" id="copy-report">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            复制到剪贴板
          </button>
        </div>
        <div class="report-preview">
          <h4>报告预览:</h4>
          <pre>${report.slice(0, 500)}...</pre>
        </div>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Event listeners
    overlay.querySelector('.close-modal').onclick = () => {
      document.body.removeChild(overlay);
      URL.revokeObjectURL(downloadLink.href);
    };
    
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        URL.revokeObjectURL(downloadLink.href);
      }
    };
    
    overlay.querySelector('#download-report').onclick = () => {
      downloadLink.click();
    };
    
    overlay.querySelector('#copy-report').onclick = async () => {
      try {
        await navigator.clipboard.writeText(report);
        const btn = overlay.querySelector('#copy-report');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> 已复制!';
        setTimeout(() => {
          btn.innerHTML = originalText;
        }, 2000);
      } catch (err) {
        alert('复制失败，请手动复制报告内容');
      }
    };
  }
  function scrollToBottom() { chatLog.scrollTop = chatLog.scrollHeight; }

  /* ================================
   *  Conversations (sidebar) - IMPROVED ERROR HANDLING
   * ================================ */
  let conversations = [];
  let currentConversationId = '';

  async function loadConversations() {
    const headers = authManager.getAuthHeaders();
    
    try {
      const res = await fetch(API_CONV, { method: 'GET', headers });
      const data = await res.json();
      
      if (!res.ok) {
        if (handleApiError(res, data)) return; // Token expired, handled
        throw new Error(data.error || '获取会话失败');
      }
      
      conversations = data.conversations || [];
      renderConversations();
    } catch (error) {
      console.warn('Failed to load conversations:', error);
      // Check if it's an auth error
      if (handleApiError(null, error)) return;
      // Don't throw to prevent breaking the UI
    }
  }
  
  function renderConversations() {
    if (!conversationsList) return;
    conversationsList.innerHTML = '';
    conversations.forEach(conv => {
      const el = document.createElement('div');
      el.className = 'conversation-item' + (conv.id === currentConversationId ? ' active' : '');
      el.onclick = () => loadConversation(conv.id);

      // Create title element
      const titleEl = document.createElement('div');
      titleEl.className = 'conversation-title';
      titleEl.textContent = conv.title || `会话 ${conv.id.slice(0, 6)}...`;

      // Create delete button with icon
      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.innerHTML = '&times;'; // Use × symbol instead of text
      delBtn.title = '删除会话';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        deleteConversation(conv.id);
      };

      el.appendChild(titleEl);
      el.appendChild(delBtn);
      conversationsList.appendChild(el);
    });
  }
  
  async function loadConversation(convId) {
    const headers = { 'Content-Type': 'application/json', ...authManager.getAuthHeaders() };
    try {
      const res = await fetch(API_CONV, {
        method: 'POST',
        headers,
        body: JSON.stringify({ conversationId: convId })
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (handleApiError(res, data)) return;
        alert(data.error || '加载会话失败');
        return;
      }
      
      currentConversationId = convId;
      if (conversationIdInput) conversationIdInput.value = currentConversationId;
      chatLog.innerHTML = '';
      
      // Update title based on the latest assistant message's ai_mode
      const assistantMessages = (data.messages || []).filter(m => m.role === 'assistant');
      if (assistantMessages.length > 0) {
        const latestAssistantMessage = assistantMessages[assistantMessages.length - 1];
        updateUIBasedOnRole(latestAssistantMessage.ai_mode || 'default');
      }
      
      (data.messages || []).forEach(m => {
        if (m.role === 'user') {
          addMessage('You', m.content);
        } else {
          // Determine assistant name based on ai_mode
          let assistantName = 'Dean'; // default
          if (m.ai_mode === 'Investor') {
            assistantName = 'Investor';
          } else if (m.ai_mode === 'Expert_match') {
            assistantName = 'Expert Match';
          } else if (m.ai_mode === 'Analyst') {
            assistantName = 'Analyst';
          } else if (m.ai_mode === 'Agent_builder') {
            assistantName = 'Agent Builder';
          }
          addMessage(assistantName, m.content);
        }
      });
      renderConversations();
      scrollToBottom();
    } catch (error) {
      if (handleApiError(null, error)) return;
      alert('加载会话失败');
    }
  }
  
  async function deleteConversation(convId) {
    if (!confirm('确定要删除这个会话吗？')) return;
    const headers = { 'Content-Type': 'application/json', ...authManager.getAuthHeaders() };
    try {
      const res = await fetch(API_CONV, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ conversationId: convId })
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (handleApiError(res, data)) return;
        alert(data.error || '删除失败');
        return;
      }
      
      if (convId === currentConversationId) startNewConversation();
      await loadConversations();
    } catch (error) {
      if (handleApiError(null, error)) return;
      alert('删除失败');
    }
  }
  
  function startNewConversation() {
    currentConversationId = '';
    if (conversationIdInput) conversationIdInput.value = '';
    chatLog.innerHTML = '';
    
    // Reset to default title and assistant name
    document.title = 'Dean';
    addMessage('Dean', '这次想要探索哪些未知领域？');
    document.querySelectorAll('.conversation-item.active').forEach(el => el.classList.remove('active'));
  }

  /* ================================
   *  Files
   * ================================ */
  let selectedFiles = [];

  function getFileTypeIcon(fileName) {
    if (!fileName) return '📄';
    const ext = fileName.toLowerCase().split('.').pop();
    
    switch (ext) {
      case 'pdf': return '📕';
      case 'doc': 
      case 'docx': return '📘';
      case 'txt': return '📝';
      case 'ppt':
      case 'pptx': return '📊';
      case 'xls':
      case 'xlsx': return '📈';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp': return '🖼️';
      default: return '📄';
    }
  }
  function updateFilePreview() {
    if (!filePreviewArea || !fileList) return;
    fileList.innerHTML = '';
    if (selectedFiles.length) {
      filePreviewArea.style.display = 'block';
      selectedFiles.forEach(f => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
          ${getFileTypeIcon(f.name)}
          <span class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
          <button class="file-remove" data-name="${escapeHtml(f.name)}">×</button>
        `;
        item.querySelector('.file-remove').onclick = () => {
          selectedFiles = selectedFiles.filter(x => x.name !== f.name);
          updateFilePreview();
        };
        fileList.appendChild(item);
      });
      if (fileUploadBtn) fileUploadBtn.classList.add('active');
    } else {
      filePreviewArea.style.display = 'none';
      if (fileUploadBtn) fileUploadBtn.classList.remove('active');
    }
  }
  function clearFiles() { selectedFiles = []; updateFilePreview(); }
  function disableInputs(disable) {
    [userInput, fileUploadBtn, clearFilesBtn, fileInput].forEach(el => { if (el) el.disabled = disable; });
    // Also disable the file attach button
    if (fileUploadBtn) fileUploadBtn.style.opacity = disable ? '0.4' : '1';
  }

  if (fileUploadBtn) fileUploadBtn.onclick = () => fileInput && fileInput.click();
  if (fileInput) fileInput.onchange = (e) => {
    Array.from(e.target.files || []).forEach(f => {
      if (!selectedFiles.some(x => x.name === f.name && x.size === f.size)) selectedFiles.push(f);
    });
    updateFilePreview();
    fileInput.value = ''; // allow reselect same file
  };
  if (clearFilesBtn) clearFilesBtn.onclick = () => clearFiles();

  // Drag & drop for files
  if (chatForm) {
    chatForm.addEventListener('dragover', e => {
      e.preventDefault();
      chatForm.classList.add('dragover');
    });
    chatForm.addEventListener('dragleave', e => {
      e.preventDefault();
      chatForm.classList.remove('dragover');
    });
    chatForm.addEventListener('drop', e => {
      e.preventDefault();
      chatForm.classList.remove('dragover');
      Array.from(e.dataTransfer.files)
        .filter(f => ['.pdf','.doc','.docx','.txt','.ppt','.pptx']
          .includes('.' + f.name.split('.').pop().toLowerCase()))
        .forEach(f => {
          if (!selectedFiles.some(x => x.name === f.name)) selectedFiles.push(f);
        });
      updateFilePreview();
    });
  }

  /* ================================
   *  Streaming (SSE) client
   * ================================ */
  async function streamFetchSSE(url, { headers, body, signal, onEvent, onOpen }) {
    const resp = await fetch(url, { method: 'POST', headers, body, signal });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      // Check for auth errors in response
      try {
        const errorData = JSON.parse(t);
        if (handleApiError(resp, errorData)) {
          throw new Error('Authentication failed');
        }
      } catch {}
      throw new Error(`Server ${resp.status} ${resp.statusText}: ${t}`);
    }

    // NEW: callback so we can read headers (e.g., conversation id)
    try { onOpen && onOpen(resp); } catch {}

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop();

      for (const ev of events) {
        if (!ev) continue;
        const lines = ev.split('\n').filter(Boolean);
        let event = 'message';
        const dataLines = [];
        for (const line of lines) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        const dataRaw = dataLines.join('\n');
        onEvent && onEvent({ event, data: dataRaw });
      }
    }

    if (buffer.trim()) {
      const lines = buffer.split('\n').filter(Boolean);
      let event = 'message';
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      const dataRaw = dataLines.join('\n');
      onEvent && onEvent({ event, data: dataRaw });
    }
  }

  /* ================================
   *  Mode Selector Logic
   * ================================ */
  let currentMode = 'learning'; // 'learning', 'startup', or 'agent'
  
  function updateModeUI(mode) {
    currentMode = mode;
    
    // Update dropdown text and active states
    const modeNames = {
      'learning': '学习模式',
      'startup': '创业导师', 
      'agent': '创建Agent'
    };
    
    if (currentModeText) {
      currentModeText.textContent = modeNames[mode] || '学习模式';
    }
    
    // Update active states in dropdown menu
    const modeOptions = document.querySelectorAll('.mode-option');
    modeOptions.forEach(option => {
      option.classList.toggle('active', option.dataset.mode === mode);
    });
    
    // Update hidden input
    if (chatModeInput) chatModeInput.value = mode;
    
    // Update placeholder text based on mode
    if (userInput) {
      if (mode === 'startup') {
        userInput.placeholder = '请告诉我您的创业问题或上传路演材料...';
      } else if (mode === 'agent') {
        userInput.placeholder = '告诉我你想创建什么样的AI伙伴...';
      } else {
        userInput.placeholder = 'Enter a question here...';
      }
    }
    
    // Close dropdown after selection
    if (modeDropdown) {
      modeDropdown.classList.remove('open');
    }
    
    // Clear current conversation when switching modes
    startNewConversation();
    
    console.log('Switched to mode:', mode);
  }
  
  // Mode dropdown event listeners
  if (modeDropdownBtn) {
    modeDropdownBtn.addEventListener('click', () => {
      if (modeDropdown) {
        modeDropdown.classList.toggle('open');
      }
    });
  }

  // Handle mode option clicks
  if (modeDropdownMenu) {
    modeDropdownMenu.addEventListener('click', (e) => {
      if (e.target.classList.contains('mode-option')) {
        const mode = e.target.dataset.mode;
        if (mode) {
          updateModeUI(mode);
        }
      }
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (modeDropdown && !modeDropdown.contains(e.target)) {
      modeDropdown.classList.remove('open');
    }
  });
  
  // Initialize mode
  updateModeUI('learning');
  
  /* ================================
   *  Chat form (send + stream) - IMPROVED ERROR HANDLING
   * ================================ */
  if (chatForm) chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = (userInput?.value || '').trim();
    if (!text && !selectedFiles.length) return;
    
    console.log('🚀 CHAT SUBMISSION:');
    console.log('💬 Message:', text || '[no text]');
    console.log('📎 Files:', selectedFiles.length, selectedFiles.map(f => f.name));
    console.log('🔗 Current conversation:', currentConversationId || '[new conversation]');

    // Block inputs and swap send button with stop button
    disableInputs(true);
    
    // FIXED: Hide send button and show stop button in the same position
    if (sendButton) sendButton.style.display = 'none';
    if (stopButton) {
      stopButton.disabled = false;
      stopButton.style.display = 'inline-flex';
    }

    // Combine user message + file names into one bubble
    let combinedMsg = text;
    if (selectedFiles.length) {
      combinedMsg += (combinedMsg ? '\n\n' : '') + '📎 上传文件: ' + selectedFiles.map(f => f.name).join(', ');
    }
    addMessage('You', combinedMsg);

    // Build form
    const formData = new FormData();
    formData.append('message', text);
    if (currentConversationId) formData.append('conversationId', currentConversationId);
    selectedFiles.forEach(f => formData.append('files', f));

    // Clear input & files immediately
    if (userInput) {
      userInput.value = '';
      userInput.style.height = '1.5rem'; // Reset to single line height
    }
    clearFiles();

    // Prepare assistant streaming bubble
    const assistantEl = addMessage('Dean', '', 'typing-indicator streaming');
    const contentEl = assistantEl.querySelector('.message-content > p');
    let accumulated = '';
    let wasNewConversation = !currentConversationId;

    const headers = { ...authManager.getAuthHeaders() };
    delete headers['Content-Type']; // let browser set boundary

    const controller = new AbortController();
    let aborted = false;
    if (stopButton) {
      stopButton.onclick = () => {
        if (!aborted) {
          controller.abort();
          aborted = true;
          // Re-enable inputs and reset UI
          disableInputs(false);
          stopButton.disabled = true;
          stopButton.style.display = 'none';
          sendButton.style.display = 'inline-flex';
          assistantEl.classList.remove('typing-indicator', 'streaming');
          if (userInput) userInput.focus();
        }
      };
    }

    function updateAssistantBubble() {
      if (!contentEl) return;
      contentEl.innerHTML = renderMessageContent(accumulated);
      scrollToBottom();
    }

    try {
      // Choose API endpoint based on current mode
      const apiEndpoint = (currentMode === 'startup' || currentMode === 'agent') ? API_STARTUP_MENTOR : API_CHAT;
      console.log('Using API endpoint:', apiEndpoint, 'for mode:', currentMode);
      
      // Non-stream request (streaming disabled)
      const resp = await fetch(apiEndpoint, { method: 'POST', headers, body: formData });
      const json = await resp.json();
      console.log('📨 Non-stream response:', { ok: resp.ok, status: resp.status, reply: (json.reply || '').slice(0, 50) + '...' });
      
      if (!resp.ok) {
        if (handleApiError(resp, json)) {
          assistantEl.remove();
          return;
        }
        throw new Error(json.error || '请求失败');
      }
      
      accumulated = (json.reply || '').toString();
      
      // Update UI based on role from API response
      if (json.role) {
        const assistantName = updateUIBasedOnRole(json.role);
        // Update the assistant name in the message bubble
        const senderEl = assistantEl.querySelector('.message-sender');
        if (senderEl) {
          senderEl.textContent = assistantName;
        }
      }
      
      if (!accumulated.trim()) {
        console.error('⌚ FRONTEND: Empty reply from API');
        accumulated = '抱歉，AI暂时无法生成回复，请重试。如果问题持续，请检查网络连接或稍后再试。';
      }
      if (!currentConversationId && json.conversationId) {
        currentConversationId = json.conversationId;
        if (conversationIdInput) conversationIdInput.value = currentConversationId;
        wasNewConversation = true;
      }
      updateAssistantBubble();
      assistantEl.classList.remove('streaming', 'typing-indicator');
      if (wasNewConversation) await loadConversations().catch(() => {});
      
      /*
      // STREAM first (AI SDK data stream over SSE) - DISABLED
      await streamFetchSSE(`${API_CHAT}?stream=1`, {
        headers,
        body: formData,
        signal: controller.signal,

        // NEW: read conversation id from response header set by the server
        onOpen: (resp) => {
          const cid = resp.headers.get('x-conversation-id');
          if (cid && !currentConversationId) {
            currentConversationId = cid;
            if (conversationIdInput) conversationIdInput.value = currentConversationId;
            wasNewConversation = true;
            console.log('🆕 New conversation created via header:', currentConversationId);
          }
        },

        onEvent: ({ event, data }) => {
          // AI SDK data stream sends JSON lines with { type: 'text-delta' | ... }
          try {
            const obj = JSON.parse(data);
            if (obj && obj.type === 'text-delta' && typeof obj.delta === 'string') {
              accumulated += obj.delta;
              updateAssistantBubble();
              assistantEl.classList.remove('typing-indicator');
              return;
            }
            if (obj && obj.type === 'error' && obj.errorText) {
              accumulated += `\n\n[错误] ${obj.errorText}`;
              updateAssistantBubble();
              return;
            }
            if (obj && obj.type === 'finish') {
              // end of message
              return;
            }
            // ignore other structured parts (sources, tool events, etc.)
          } catch {
            // Fallback: if not JSON, treat as plain text chunk (rare)
            if (data && data !== '[DONE]') {
              accumulated += data;
              updateAssistantBubble();
              assistantEl.classList.remove('typing-indicator');
            }
          }
        }
      });

      // Streaming ended
      assistantEl.classList.remove('streaming', 'typing-indicator');
      if (!accumulated.trim()) {
        console.error('⌚ FRONTEND: No content accumulated from stream');
        accumulated = '抱歉，AI暂时无法生成回复，请重试。如果问题持续，请检查网络连接或稍后再试。';
        updateAssistantBubble();
      } else {
        console.log('✅ FRONTEND: Stream completed successfully with', accumulated.length, 'characters');
      }
      if (wasNewConversation) {
        await loadConversations().catch(() => {});
      }
      */
    } catch (err) {
      console.error('⌚ Request failed:', err?.message || err);
      assistantEl.remove();
      addMessage('Dean', '抱歉，连接出现问题。请检查网络连接后重试。');
    } finally {
      disableInputs(false);
      // FIXED: Hide stop button and show send button again
      if (stopButton) {
        stopButton.disabled = true;
        stopButton.style.display = 'none';
      }
      if (sendButton) {
        sendButton.style.display = 'inline-flex';
      }
      if (userInput) userInput.focus();
    }
  });

  if (userInput) {
    // Auto-resize textarea
    function autoResize() {
      userInput.style.height = '1.5rem'; // Reset to single line height
      const newHeight = Math.max(24, Math.min(userInput.scrollHeight, 120)); // Min 24px (1.5rem), max 120px
      userInput.style.height = newHeight + 'px';
    }
    
    userInput.addEventListener('input', autoResize);
    userInput.addEventListener('paste', () => setTimeout(autoResize, 0));
    
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm?.requestSubmit();
      }
    });
    
    // Initial resize
    autoResize();
  }

  /* ================================
   *  Auth UI handlers
   * ================================ */
  function showAuthMessage(msg, isError=false) {
    if (!authMessage) return;
    authMessage.textContent = msg;
    authMessage.className = 'auth-message ' + (isError ? 'error' : 'success');
    authMessage.style.display = 'block';
  }
  if (switchToSignup) switchToSignup.addEventListener('click', () => {
    if (loginForm) loginForm.style.display = 'none';
    if (signupForm) signupForm.style.display = 'block';
    if (authMessage) authMessage.style.display = 'none';
  });
  if (switchToLogin) switchToLogin.addEventListener('click', () => {
    if (signupForm) signupForm.style.display = 'none';
    if (loginForm) loginForm.style.display = 'block';
    if (authMessage) authMessage.style.display = 'none';
  });

  if (loginForm) loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const email = document.getElementById('email')?.value || '';
      const password = document.getElementById('password')?.value || '';
      await authManager.signin(email, password);
      showAuthMessage('登录成功');
      setUI(true);
    } catch (err) {
      showAuthMessage(err.message || '登录失败', true);
    }
  });

  if (signupForm) signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email')?.value || '';
    const password = document.getElementById('signup-password')?.value || '';
    const confirm = document.getElementById('confirm-password')?.value || '';
    if (password !== confirm) {
      showAuthMessage('两次密码不一致', true); return;
    }
    try {
      await authManager.signup(email, password);
      showAuthMessage('注册成功，请登录');
      // switch to login
      if (signupForm) signupForm.style.display = 'none';
      if (loginForm) loginForm.style.display = 'block';
    } catch (err) {
      showAuthMessage(err.message || '注册失败', true);
    }
  });

  if (logoutBtn) logoutBtn.addEventListener('click', () => authManager.signout());

  /* ================================
   *  Sidebar and misc
   * ================================ */
  if (newChatBtn) newChatBtn.addEventListener('click', startNewConversation);
  if (toggleSidebarBtn) toggleSidebarBtn.addEventListener('click', () => {
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed');
  });
  
  // Share conversation button
  const shareBtn = document.getElementById('share-conversation');
  if (shareBtn) shareBtn.addEventListener('click', shareConversation);
  
  // Sidebar hover tooltip for collapsed state
  function createHoverTooltip() {
    const tooltip = document.createElement('div');
    tooltip.className = 'sidebar-tooltip';
    tooltip.textContent = 'Open sidebar';
    document.body.appendChild(tooltip);
    return tooltip;
  }
  
  let hoverTooltip = null;
  
  if (sidebar && toggleSidebarBtn) {
    const brandLogo = sidebar.querySelector('.brand-logo');
    
    function showTooltip(e) {
      if (!sidebar.classList.contains('collapsed')) return;
      
      if (!hoverTooltip) {
        hoverTooltip = createHoverTooltip();
      }
      
      const rect = brandLogo.getBoundingClientRect();
      hoverTooltip.style.left = rect.right + 10 + 'px';
      hoverTooltip.style.top = rect.top + (rect.height / 2) - 12 + 'px';
      hoverTooltip.style.opacity = '1';
      hoverTooltip.style.visibility = 'visible';
    }
    
    function hideTooltip() {
      if (hoverTooltip) {
        hoverTooltip.style.opacity = '0';
        hoverTooltip.style.visibility = 'hidden';
      }
    }
    
    if (brandLogo) {
      brandLogo.addEventListener('mouseenter', showTooltip);
      brandLogo.addEventListener('mouseleave', hideTooltip);
    }
  }

  // Initial files UI
  updateFilePreview();
})();