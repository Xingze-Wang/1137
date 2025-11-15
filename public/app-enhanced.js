// Enhanced Application - Integration of all advanced modules

import { streamManager } from './modules/streaming-client.js';
import { voiceUI } from './modules/voice-assistant.js';
import { CodeEditor, codeBlockManager } from './modules/code-editor.js';
import { exportManager } from './modules/export-manager.js';
import { keyboardManager } from './modules/keyboard-manager.js';
import { memoryManager } from './modules/memory-manager.js';
import { imageProcessor } from './modules/image-processor.js';

class EnhancedBetaApp {
  constructor() {
    this.state = {
      user: null,
      currentConversation: null,
      conversations: [],
      messages: [],
      mode: 'learning',
      isStreaming: false,
      memories: []
    };

    // Module instances
    this.modules = {
      streaming: streamManager,
      voice: null,
      codeEditor: null,
      export: exportManager,
      keyboard: keyboardManager,
      memory: memoryManager,
      image: imageProcessor
    };

    // UI elements
    this.elements = {};

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    } else {
      this.initialize();
    }
  }

  async initialize() {
    console.log('🚀 Initializing Enhanced Beta App...');

    try {
      // Get DOM elements
      this.initializeElements();

      // Initialize modules
      await this.initializeModules();

      // Setup event listeners
      this.setupEventListeners();

      // Load user session
      await this.loadUserSession();

      // Initialize UI
      this.initializeUI();

      // Load conversations if logged in
      if (this.state.user) {
        await this.loadConversations();
        await this.loadMemories();
      }

      console.log('✅ Enhanced Beta App initialized successfully');
    } catch (error) {
      console.error('Initialization failed:', error);
      this.showError('Failed to initialize application');
    }
  }

  initializeElements() {
    this.elements = {
      // Auth elements
      authContainer: document.getElementById('auth-container'),
      chatContainer: document.getElementById('chat-container'),

      // Chat elements
      chatLog: document.getElementById('chat-log'),
      userInput: document.getElementById('user-input'),
      sendButton: document.getElementById('send-button'),
      stopButton: document.getElementById('stop-button'),

      // Sidebar elements
      sidebar: document.getElementById('sidebar'),
      conversationsList: document.getElementById('conversations-list'),
      newChatBtn: document.getElementById('new-chat-btn'),

      // Mode selector
      modeDropdown: document.getElementById('mode-dropdown'),
      currentModeText: document.getElementById('current-mode-text'),

      // File upload
      fileInput: document.getElementById('file-input'),
      fileUploadBtn: document.getElementById('file-upload-btn')
    };
  }

  async initializeModules() {
    // Initialize voice UI
    if (this.elements.chatContainer) {
      const voiceContainer = document.createElement('div');
      voiceContainer.className = 'voice-container';
      this.elements.chatContainer.querySelector('.chat-input-area').appendChild(voiceContainer);
      this.modules.voice = voiceUI.create(voiceContainer);
    }

    // Initialize code editor for messages
    this.setupCodeBlockProcessing();

    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Initialize export UI
    this.setupExportUI();

    // Initialize image processing
    this.setupImageProcessing();

    // Setup memory manager
    if (this.state.user) {
      this.modules.memory.userId = this.state.user.id;
    }
  }

  setupEventListeners() {
    // Voice input events
    window.addEventListener('voiceInput', (e) => {
      this.handleVoiceInput(e.detail);
    });

    // Stream events
    window.addEventListener('streamComplete', (e) => {
      this.handleStreamComplete(e.detail);
    });

    window.addEventListener('streamError', (e) => {
      this.handleStreamError(e.detail);
    });

    // Keyboard shortcut events
    window.addEventListener('shortcutExecuted', (e) => {
      this.handleShortcut(e.detail);
    });

    // Conversation update events
    window.addEventListener('conversationUpdate', (e) => {
      this.handleConversationUpdate(e.detail);
    });

    // Chat form submission
    if (this.elements.userInput) {
      this.elements.userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }

    if (this.elements.sendButton) {
      this.elements.sendButton.addEventListener('click', () => {
        this.sendMessage();
      });
    }

    if (this.elements.stopButton) {
      this.elements.stopButton.addEventListener('click', () => {
        this.stopStreaming();
      });
    }

    // New chat button
    if (this.elements.newChatBtn) {
      this.elements.newChatBtn.addEventListener('click', () => {
        this.startNewChat();
      });
    }

    // File upload
    if (this.elements.fileUploadBtn) {
      this.elements.fileUploadBtn.addEventListener('click', () => {
        this.elements.fileInput?.click();
      });
    }

    if (this.elements.fileInput) {
      this.elements.fileInput.addEventListener('change', (e) => {
        this.handleFileUpload(e.target.files);
      });
    }

    // Mode selector
    const modeOptions = document.querySelectorAll('.mode-option');
    modeOptions.forEach(option => {
      option.addEventListener('click', () => {
        this.changeMode(option.dataset.mode);
      });
    });

    // Example prompts
    const promptCards = document.querySelectorAll('.prompt-card');
    promptCards.forEach(card => {
      card.addEventListener('click', () => {
        this.handlePromptCard(card.dataset.mode, card.dataset.prompt);
      });
    });
  }

  async sendMessage() {
    const message = this.elements.userInput?.value.trim();
    if (!message || this.state.isStreaming) return;

    // Clear input
    this.elements.userInput.value = '';

    // Create user message element
    const userMessageEl = this.createMessageElement('user', message);
    this.elements.chatLog?.appendChild(userMessageEl);

    // Show chat log if hidden
    if (this.elements.chatLog?.style.display === 'none') {
      this.elements.chatLog.style.display = 'block';
      document.getElementById('welcome-screen')?.style.display = 'none';
    }

    // Create AI message element for streaming
    const aiMessageEl = this.createMessageElement('assistant', '');
    const contentEl = aiMessageEl.querySelector('.message-content');
    this.elements.chatLog?.appendChild(aiMessageEl);

    // Start streaming
    this.state.isStreaming = true;
    this.updateStreamingUI(true);

    try {
      // Store message in memory
      await this.storeInMemory(message, 'user');

      // Retrieve relevant memories
      const memories = await this.modules.memory.retrieve(message, {
        limit: 3,
        minImportance: 0.5
      });

      // Build context from memories
      const context = this.buildContextFromMemories(memories);

      // Stream response
      await this.modules.streaming.streamToElement(
        contentEl,
        message,
        this.state.mode,
        this.state.currentConversation
      );

      // Process code blocks in response
      codeBlockManager.processMessage(aiMessageEl, `msg-${Date.now()}`);

    } catch (error) {
      console.error('Failed to send message:', error);
      contentEl.innerHTML = `<span class="error">Error: ${error.message}</span>`;
    } finally {
      this.state.isStreaming = false;
      this.updateStreamingUI(false);
    }
  }

  async handleVoiceInput(detail) {
    const { text, confidence } = detail;

    // Set input value
    if (this.elements.userInput) {
      this.elements.userInput.value = text;
    }

    // Auto-send if confidence is high
    if (confidence > 0.9) {
      setTimeout(() => this.sendMessage(), 500);
    }
  }

  async handleFileUpload(files) {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        // Process image
        const result = await this.modules.image.processImage(file, {
          analyze: true,
          ocr: true,
          resize: true
        });

        // Display image in chat
        this.displayImageResult(result);

        // Store in memory
        await this.storeInMemory(`Uploaded image: ${result.analysis?.primaryLabel || file.name}`, 'user', {
          type: 'image',
          imageData: result.thumbnail
        });

      } else {
        // Handle other file types
        this.displayFile(file);
      }
    }
  }

  displayImageResult(result) {
    const messageEl = this.createMessageElement('user', '');
    const contentEl = messageEl.querySelector('.message-content');

    contentEl.innerHTML = `
      <div class="image-message">
        <img src="${result.thumbnail}" alt="${result.original.name}" class="message-image">
        <div class="image-info">
          <div class="image-name">${result.original.name}</div>
          ${result.analysis ? `
            <div class="image-analysis">
              <strong>识别结果:</strong> ${result.analysis.primaryLabel}
              <span class="confidence">(${(result.analysis.confidence * 100).toFixed(1)}% 置信度)</span>
            </div>
            <div class="image-tags">
              ${result.analysis.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
          ` : ''}
          ${result.text ? `
            <div class="image-text">
              <strong>提取的文字:</strong>
              <p>${result.text.text.substring(0, 200)}${result.text.text.length > 200 ? '...' : ''}</p>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    this.elements.chatLog?.appendChild(messageEl);

    // Auto-generate question about the image
    if (result.analysis) {
      this.elements.userInput.value = `这张图片中的${result.analysis.primaryLabel}有什么特点？`;
    }
  }

  setupCodeBlockProcessing() {
    // Process code blocks in new messages
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.classList?.contains('message')) {
            codeBlockManager.processMessage(node, `msg-${Date.now()}`);
          }
        });
      });
    });

    if (this.elements.chatLog) {
      observer.observe(this.elements.chatLog, {
        childList: true,
        subtree: true
      });
    }
  }

  setupKeyboardShortcuts() {
    // Register custom command handlers
    this.modules.keyboard.onCommand = (action) => {
      switch (action) {
        case 'newChat':
          this.startNewChat();
          break;
        case 'sendMessage':
          this.sendMessage();
          break;
        case 'regenerateResponse':
          this.regenerateLastResponse();
          break;
        case 'exportConversation':
          this.exportCurrentConversation();
          break;
        case 'toggleVoiceInput':
          this.toggleVoiceInput();
          break;
        case 'switchToLearning':
          this.changeMode('learning');
          break;
        case 'switchToStartup':
          this.changeMode('startup');
          break;
        case 'switchToAgent':
          this.changeMode('agent');
          break;
        case 'saveConversation':
          this.saveCurrentConversation();
          break;
        case 'toggleVimMode':
          this.toggleVimMode();
          break;
        case 'showStatistics':
          this.showUsageStatistics();
          break;
        default:
          console.log('Unhandled command:', action);
      }
    };
  }

  setupExportUI() {
    const exportContainer = document.createElement('div');
    exportContainer.className = 'export-container';

    const headerActions = document.querySelector('.chat-header');
    if (headerActions) {
      headerActions.appendChild(exportContainer);
      this.modules.export.createExportUI(exportContainer);
    }

    // Override getCurrentConversation
    this.modules.export.getCurrentConversation = () => {
      return {
        id: this.state.currentConversation,
        title: `Conversation ${new Date().toLocaleDateString()}`,
        mode: this.state.mode,
        messages: this.state.messages,
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };
    };
  }

  setupImageProcessing() {
    // Image processor callbacks
    this.modules.image.onImageProcess = (result) => {
      console.log('Image processed:', result);
    };

    this.modules.image.onImageError = (error) => {
      this.showError(`Image processing failed: ${error.message}`);
    };
  }

  async storeInMemory(content, role, metadata = {}) {
    if (!this.modules.memory || !this.state.user) return;

    try {
      await this.modules.memory.createMemory(content, {
        type: role === 'user' ? 'conversation' : 'context',
        conversationId: this.state.currentConversation,
        ...metadata
      });
    } catch (error) {
      console.error('Failed to store memory:', error);
    }
  }

  buildContextFromMemories(memories) {
    if (!memories || memories.length === 0) return '';

    const context = memories
      .map(m => `[${new Date(m.timestamp).toLocaleDateString()}] ${m.content}`)
      .join('\n');

    return `Based on previous conversations:\n${context}\n\n`;
  }

  async loadMemories() {
    if (!this.state.user) return;

    try {
      // Get memory statistics
      const stats = this.modules.memory.getStatistics();
      console.log('Memory statistics:', stats);
    } catch (error) {
      console.error('Failed to load memories:', error);
    }
  }

  changeMode(mode) {
    this.state.mode = mode;

    // Update UI
    const modeTexts = {
      learning: '学习模式',
      startup: '创业导师',
      agent: '创建Agent'
    };

    if (this.elements.currentModeText) {
      this.elements.currentModeText.textContent = modeTexts[mode];
    }

    // Update mode options
    document.querySelectorAll('.mode-option').forEach(option => {
      option.classList.toggle('active', option.dataset.mode === mode);
    });

    // Close dropdown
    document.getElementById('mode-dropdown-menu')?.classList.remove('show');

    // Store mode preference in memory
    this.storeInMemory(`Switched to ${mode} mode`, 'system', {
      type: 'preference',
      importance: 0.3
    });
  }

  startNewChat() {
    this.state.currentConversation = null;
    this.state.messages = [];

    // Clear chat log
    if (this.elements.chatLog) {
      this.elements.chatLog.innerHTML = '';
      this.elements.chatLog.style.display = 'none';
    }

    // Show welcome screen
    const welcomeScreen = document.getElementById('welcome-screen');
    if (welcomeScreen) {
      welcomeScreen.style.display = 'flex';
    }

    // Clear input
    if (this.elements.userInput) {
      this.elements.userInput.value = '';
    }
  }

  async regenerateLastResponse() {
    const messages = this.elements.chatLog?.querySelectorAll('.message');
    if (!messages || messages.length < 2) return;

    // Get last user message
    let lastUserMessage = null;
    for (let i = messages.length - 2; i >= 0; i--) {
      if (messages[i].classList.contains('user')) {
        lastUserMessage = messages[i].querySelector('.message-content').textContent;
        break;
      }
    }

    if (!lastUserMessage) return;

    // Remove last AI message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.classList.contains('assistant')) {
      lastMessage.remove();
    }

    // Resend message
    this.elements.userInput.value = lastUserMessage;
    await this.sendMessage();
  }

  exportCurrentConversation() {
    const conversation = this.modules.export.getCurrentConversation();
    this.modules.export.exportConversation(conversation, 'markdown');
  }

  toggleVoiceInput() {
    document.querySelector('.voice-button')?.click();
  }

  saveCurrentConversation() {
    // Save to local storage
    const conversation = {
      id: this.state.currentConversation,
      messages: this.state.messages,
      mode: this.state.mode,
      timestamp: Date.now()
    };

    localStorage.setItem(`conversation_${conversation.id}`, JSON.stringify(conversation));
    this.showNotification('Conversation saved', 'success');
  }

  toggleVimMode() {
    const vimEnabled = this.modules.keyboard.currentMode === 'vim';
    this.modules.keyboard.setMode(vimEnabled ? 'normal' : 'vim');
    this.showNotification(`Vim mode ${vimEnabled ? 'disabled' : 'enabled'}`, 'info');
  }

  async showUsageStatistics() {
    const stats = {
      totalConversations: this.state.conversations.length,
      totalMessages: this.state.messages.length,
      memoryStats: this.modules.memory.getStatistics(),
      storageUsed: this.calculateStorageUsed()
    };

    // Create statistics modal
    const modal = document.createElement('div');
    modal.className = 'stats-modal';
    modal.innerHTML = `
      <div class="stats-overlay"></div>
      <div class="stats-content">
        <h2>使用统计</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">${stats.totalConversations}</div>
            <div class="stat-label">总对话数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${stats.totalMessages}</div>
            <div class="stat-label">总消息数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${stats.memoryStats.total}</div>
            <div class="stat-label">存储的记忆</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${(stats.storageUsed / 1024).toFixed(1)} KB</div>
            <div class="stat-label">存储使用</div>
          </div>
        </div>
        <div class="stats-chart" id="usage-chart"></div>
        <button class="stats-close">关闭</button>
      </div>
    `;

    document.body.appendChild(modal);

    // Event handlers
    modal.querySelector('.stats-close').onclick = () => modal.remove();
    modal.querySelector('.stats-overlay').onclick = () => modal.remove();

    // Show with animation
    setTimeout(() => modal.classList.add('open'), 10);
  }

  calculateStorageUsed() {
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length + key.length;
      }
    }
    return total;
  }

  createMessageElement(role, content) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = role === 'user' ? '👤' : '🤖';

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.textContent = content;

    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `
      <button class="action-btn" data-action="copy" title="复制">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
      ${role === 'assistant' ? `
        <button class="action-btn" data-action="regenerate" title="重新生成">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 4v6h6M23 20v-6h-6"/>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
        </button>
        <button class="action-btn" data-action="speak" title="朗读">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
        </button>
      ` : ''}
    `;

    wrapper.appendChild(avatar);
    wrapper.appendChild(contentEl);
    wrapper.appendChild(actions);
    messageEl.appendChild(wrapper);

    // Setup action handlers
    this.setupMessageActions(messageEl);

    // Store in state
    this.state.messages.push({ role, content, timestamp: Date.now() });

    return messageEl;
  }

  setupMessageActions(messageEl) {
    const actionButtons = messageEl.querySelectorAll('.action-btn');

    actionButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const content = messageEl.querySelector('.message-content').textContent;

        switch (action) {
          case 'copy':
            navigator.clipboard.writeText(content);
            this.showNotification('已复制到剪贴板', 'success');
            break;
          case 'regenerate':
            this.regenerateLastResponse();
            break;
          case 'speak':
            this.modules.voice?.assistant?.speak(content);
            break;
        }
      });
    });
  }

  updateStreamingUI(isStreaming) {
    if (this.elements.sendButton) {
      this.elements.sendButton.style.display = isStreaming ? 'none' : 'flex';
    }

    if (this.elements.stopButton) {
      this.elements.stopButton.style.display = isStreaming ? 'flex' : 'none';
    }

    if (this.elements.userInput) {
      this.elements.userInput.disabled = isStreaming;
    }
  }

  stopStreaming() {
    this.modules.streaming.abortAll();
    this.state.isStreaming = false;
    this.updateStreamingUI(false);
  }

  handlePromptCard(mode, prompt) {
    this.changeMode(mode);
    this.elements.userInput.value = prompt;
    setTimeout(() => this.sendMessage(), 100);
  }

  async loadUserSession() {
    // Check for stored auth token
    const token = localStorage.getItem('auth_token');
    if (token) {
      try {
        const response = await fetch('/api/auth', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          this.state.user = data.user;
          this.showChatInterface();
        } else {
          this.showAuthInterface();
        }
      } catch (error) {
        console.error('Session load failed:', error);
        this.showAuthInterface();
      }
    } else {
      this.showAuthInterface();
    }
  }

  async loadConversations() {
    try {
      const response = await fetch('/api/conversations', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      if (response.ok) {
        const conversations = await response.json();
        this.state.conversations = conversations;
        this.renderConversations(conversations);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  }

  renderConversations(conversations) {
    if (!this.elements.conversationsList) return;

    this.elements.conversationsList.innerHTML = conversations.map(conv => `
      <div class="conversation-item" data-id="${conv.id}">
        <div class="conversation-title">${conv.title || 'Untitled'}</div>
        <div class="conversation-preview">${conv.preview || ''}</div>
        <div class="conversation-time">${this.formatTime(conv.updated_at)}</div>
      </div>
    `).join('');

    // Add click handlers
    this.elements.conversationsList.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        this.loadConversation(item.dataset.id);
      });
    });
  }

  async loadConversation(conversationId) {
    // Implementation for loading a specific conversation
    this.state.currentConversation = conversationId;
    // Load messages for this conversation
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
  }

  showChatInterface() {
    if (this.elements.authContainer) {
      this.elements.authContainer.style.display = 'none';
    }

    if (this.elements.chatContainer) {
      this.elements.chatContainer.style.display = 'flex';
    }
  }

  showAuthInterface() {
    if (this.elements.authContainer) {
      this.elements.authContainer.style.display = 'flex';
    }

    if (this.elements.chatContainer) {
      this.elements.chatContainer.style.display = 'none';
    }
  }

  initializeUI() {
    // Add enhanced styles
    this.injectEnhancedStyles();

    // Initialize tooltips
    this.initializeTooltips();

    // Setup drag and drop
    this.setupDragAndDrop();
  }

  injectEnhancedStyles() {
    const styles = `
      .message-wrapper {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
      }

      .message-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        background: var(--color-bg-secondary);
        flex-shrink: 0;
      }

      .message-actions {
        display: flex;
        gap: 0.5rem;
        opacity: 0;
        transition: opacity 0.3s ease;
        margin-left: auto;
      }

      .message:hover .message-actions {
        opacity: 1;
      }

      .action-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.25rem;
        color: var(--color-text-secondary);
        transition: color 0.2s ease;
      }

      .action-btn:hover {
        color: var(--color-accent);
      }

      .image-message {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .message-image {
        max-width: 400px;
        border-radius: 8px;
        cursor: zoom-in;
      }

      .image-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .image-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .tag {
        padding: 0.25rem 0.75rem;
        background: var(--color-bg-secondary);
        border-radius: 1rem;
        font-size: 0.75rem;
      }

      .stats-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .stats-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(5px);
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .stats-modal.open .stats-overlay {
        opacity: 1;
      }

      .stats-content {
        position: relative;
        background: var(--color-bg-primary);
        border-radius: 12px;
        padding: 2rem;
        max-width: 600px;
        width: 90%;
        transform: scale(0.95);
        opacity: 0;
        transition: all 0.3s ease;
      }

      .stats-modal.open .stats-content {
        transform: scale(1);
        opacity: 1;
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 1.5rem;
        margin: 2rem 0;
      }

      .stat-item {
        text-align: center;
      }

      .stat-value {
        font-size: 2rem;
        font-weight: 700;
        color: var(--color-accent);
      }

      .stat-label {
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        margin-top: 0.25rem;
      }

      .voice-container {
        position: absolute;
        right: 80px;
        bottom: 20px;
      }

      .export-container {
        position: relative;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .message {
        animation: fadeIn 0.4s ease;
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  initializeTooltips() {
    // Simple tooltip implementation
    document.querySelectorAll('[title]').forEach(element => {
      const title = element.getAttribute('title');
      element.removeAttribute('title');
      element.dataset.tooltip = title;

      element.addEventListener('mouseenter', (e) => {
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = title;

        const rect = element.getBoundingClientRect();
        tooltip.style.position = 'fixed';
        tooltip.style.left = `${rect.left + rect.width / 2}px`;
        tooltip.style.top = `${rect.top - 30}px`;
        tooltip.style.transform = 'translateX(-50%)';

        document.body.appendChild(tooltip);
        element.activeTooltip = tooltip;
      });

      element.addEventListener('mouseleave', () => {
        if (element.activeTooltip) {
          element.activeTooltip.remove();
          element.activeTooltip = null;
        }
      });
    });
  }

  setupDragAndDrop() {
    const dropZone = this.elements.chatContainer;
    if (!dropZone) return;

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFileUpload(files);
      }
    });
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  showError(message) {
    this.showNotification(message, 'error');
  }
}

// Initialize the enhanced app
const enhancedApp = new EnhancedBetaApp();

// Export for debugging
window.EnhancedBetaApp = enhancedApp;