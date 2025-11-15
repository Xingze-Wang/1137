// Optimized Script - Performance Enhanced Version
(() => {
  'use strict';

  /* ==============================================
   * Performance Optimization Core
   * ============================================== */

  // Request Animation Frame throttle
  const raf = {
    callbacks: new Set(),
    running: false,
    tick() {
      this.callbacks.forEach(callback => callback());
      this.running = false;
    },
    add(callback) {
      this.callbacks.add(callback);
      if (!this.running) {
        this.running = true;
        requestAnimationFrame(() => this.tick());
      }
    },
    remove(callback) {
      this.callbacks.delete(callback);
    }
  };

  // Virtual DOM for message rendering
  class VirtualList {
    constructor(container, itemHeight = 80) {
      this.container = container;
      this.itemHeight = itemHeight;
      this.items = [];
      this.visibleRange = { start: 0, end: 0 };
      this.scrollTop = 0;
      this.containerHeight = 0;

      this.init();
    }

    init() {
      this.viewport = document.createElement('div');
      this.viewport.className = 'virtual-viewport';
      this.viewport.style.position = 'relative';
      this.viewport.style.overflow = 'auto';
      this.viewport.style.height = '100%';

      this.content = document.createElement('div');
      this.content.className = 'virtual-content';
      this.content.style.position = 'relative';

      this.viewport.appendChild(this.content);
      this.container.appendChild(this.viewport);

      this.viewport.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });

      // Observe container resize
      if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(entries => {
          this.containerHeight = entries[0].contentRect.height;
          this.updateVisibleRange();
        });
        resizeObserver.observe(this.viewport);
      }
    }

    handleScroll() {
      this.scrollTop = this.viewport.scrollTop;
      raf.add(() => this.updateVisibleRange());
    }

    updateVisibleRange() {
      const scrollTop = this.scrollTop;
      const containerHeight = this.containerHeight || this.viewport.clientHeight;

      const start = Math.floor(scrollTop / this.itemHeight);
      const end = Math.ceil((scrollTop + containerHeight) / this.itemHeight);

      // Add buffer for smoother scrolling
      const bufferSize = 3;
      this.visibleRange = {
        start: Math.max(0, start - bufferSize),
        end: Math.min(this.items.length, end + bufferSize)
      };

      this.render();
    }

    render() {
      const fragment = document.createDocumentFragment();
      const { start, end } = this.visibleRange;

      // Clear current content
      this.content.innerHTML = '';

      // Set total height for scrollbar
      this.content.style.height = `${this.items.length * this.itemHeight}px`;

      // Render only visible items
      for (let i = start; i < end; i++) {
        const item = this.items[i];
        if (!item) continue;

        const element = this.renderItem(item);
        element.style.position = 'absolute';
        element.style.top = `${i * this.itemHeight}px`;
        element.style.width = '100%';

        fragment.appendChild(element);
      }

      this.content.appendChild(fragment);
    }

    renderItem(item) {
      // Override this method to customize item rendering
      const div = document.createElement('div');
      div.className = 'virtual-item';
      div.textContent = item.content || '';
      return div;
    }

    addItem(item) {
      this.items.push(item);
      this.updateVisibleRange();
    }

    setItems(items) {
      this.items = items;
      this.updateVisibleRange();
    }
  }

  /* ==============================================
   * Optimized Request Management
   * ============================================== */

  class RequestManager {
    constructor() {
      this.queue = [];
      this.activeRequests = new Map();
      this.cache = new Map();
      this.maxConcurrent = 3;
      this.processing = false;
    }

    async add(key, requestFn, options = {}) {
      // Check cache first
      if (options.cache && this.cache.has(key)) {
        const cached = this.cache.get(key);
        if (Date.now() - cached.timestamp < (options.cacheTTL || 60000)) {
          return cached.data;
        }
      }

      // Deduplicate identical requests
      if (this.activeRequests.has(key)) {
        return this.activeRequests.get(key);
      }

      const promise = new Promise((resolve, reject) => {
        this.queue.push({ key, requestFn, resolve, reject, options });
      });

      this.activeRequests.set(key, promise);
      this.process();

      return promise;
    }

    async process() {
      if (this.processing) return;
      this.processing = true;

      while (this.queue.length > 0 && this.activeRequests.size < this.maxConcurrent) {
        const item = this.queue.shift();
        if (!item) continue;

        this.executeRequest(item);
      }

      this.processing = false;
    }

    async executeRequest({ key, requestFn, resolve, reject, options }) {
      try {
        const result = await requestFn();

        // Cache result if requested
        if (options.cache) {
          this.cache.set(key, {
            data: result,
            timestamp: Date.now()
          });
        }

        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        this.activeRequests.delete(key);
        this.process(); // Process next in queue
      }
    }

    clearCache(pattern) {
      if (!pattern) {
        this.cache.clear();
        return;
      }

      for (const [key] of this.cache) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    }
  }

  /* ==============================================
   * Web Worker for Heavy Operations
   * ============================================== */

  class WorkerPool {
    constructor(workerScript, poolSize = 2) {
      this.workers = [];
      this.queue = [];
      this.poolSize = poolSize;

      // Create worker script blob
      const blob = new Blob([workerScript], { type: 'application/javascript' });
      this.workerUrl = URL.createObjectURL(blob);

      // Initialize workers
      for (let i = 0; i < poolSize; i++) {
        this.createWorker();
      }
    }

    createWorker() {
      const worker = new Worker(this.workerUrl);
      worker.busy = false;

      worker.onmessage = (e) => {
        worker.busy = false;
        if (worker.resolver) {
          worker.resolver(e.data);
          worker.resolver = null;
        }
        this.processQueue();
      };

      this.workers.push(worker);
    }

    async execute(data) {
      return new Promise((resolve) => {
        this.queue.push({ data, resolve });
        this.processQueue();
      });
    }

    processQueue() {
      if (this.queue.length === 0) return;

      const availableWorker = this.workers.find(w => !w.busy);
      if (!availableWorker) return;

      const task = this.queue.shift();
      if (!task) return;

      availableWorker.busy = true;
      availableWorker.resolver = task.resolve;
      availableWorker.postMessage(task.data);
    }

    terminate() {
      this.workers.forEach(w => w.terminate());
      URL.revokeObjectURL(this.workerUrl);
    }
  }

  // Markdown processing worker script
  const markdownWorkerScript = `
    self.onmessage = function(e) {
      const { text, type } = e.data;

      if (type === 'markdown') {
        // Simple markdown processing
        let processed = text
          .replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>')
          .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
          .replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\*([^\*]+)\*/g, '<em>$1</em>')
          .replace(/\\n/g, '<br>');

        self.postMessage({ processed });
      }
    };
  `;

  /* ==============================================
   * Optimized DOM Operations
   * ============================================== */

  class DOMBatcher {
    constructor() {
      this.operations = [];
      this.scheduled = false;
    }

    add(operation) {
      this.operations.push(operation);
      if (!this.scheduled) {
        this.scheduled = true;
        requestAnimationFrame(() => this.flush());
      }
    }

    flush() {
      const fragment = document.createDocumentFragment();

      // Batch reads
      const reads = this.operations.filter(op => op.type === 'read');
      const readResults = reads.map(op => op.fn());

      // Batch writes
      const writes = this.operations.filter(op => op.type === 'write');
      writes.forEach((op, index) => {
        if (op.fn) op.fn(readResults[index]);
      });

      this.operations = [];
      this.scheduled = false;
    }
  }

  /* ==============================================
   * Initialize Optimized Application
   * ============================================== */

  const App = {
    requestManager: new RequestManager(),
    domBatcher: new DOMBatcher(),
    markdownWorker: null,
    virtualList: null,
    state: {
      user: null,
      currentConversation: null,
      messages: [],
      mode: 'learning'
    },

    async init() {
      console.log('🚀 Initializing optimized application...');

      // Initialize workers
      if (window.Worker) {
        this.markdownWorker = new WorkerPool(markdownWorkerScript, 2);
      }

      // Check for stored session
      const storedMode = sessionStorage.getItem('selectedMode');
      const storedPrompt = sessionStorage.getItem('initialPrompt');

      if (storedMode) {
        this.state.mode = storedMode;
        sessionStorage.removeItem('selectedMode');
      }

      // Initialize auth
      await this.initAuth();

      // Initialize UI components
      this.initUI();

      // Set up event listeners
      this.setupEventListeners();

      // Load conversations if logged in
      if (this.state.user) {
        await this.loadConversations();

        // If there's a stored prompt from landing page, use it
        if (storedPrompt) {
          this.handlePromptFromLanding(storedPrompt);
          sessionStorage.removeItem('initialPrompt');
        }
      }

      console.log('✅ Application initialized successfully');
    },

    async initAuth() {
      try {
        const response = await fetch('/api/auth', {
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          if (data.user) {
            this.state.user = data.user;
            this.showChatInterface();
          } else {
            this.showAuthInterface();
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        this.showAuthInterface();
      }
    },

    initUI() {
      // Initialize virtual list for messages
      const chatLog = document.getElementById('chat-log');
      if (chatLog) {
        this.virtualList = new VirtualList(chatLog, 120);

        // Override renderItem for custom message rendering
        this.virtualList.renderItem = (message) => {
          const messageDiv = document.createElement('div');
          messageDiv.className = `message ${message.role}`;

          // Use worker for markdown processing if available
          if (this.markdownWorker && message.content) {
            this.markdownWorker.execute({
              text: message.content,
              type: 'markdown'
            }).then(result => {
              messageDiv.innerHTML = result.processed;
            });
          } else {
            messageDiv.textContent = message.content;
          }

          return messageDiv;
        };
      }

      // Add smooth transitions CSS
      this.injectStyles();
    },

    injectStyles() {
      const styles = `
        /* Smooth transitions */
        .message {
          animation: messageSlide 0.3s ease-out;
        }

        @keyframes messageSlide {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Loading skeleton */
        .skeleton {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
        }

        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Optimized scrollbar */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        ::-webkit-scrollbar-track {
          background: transparent;
        }

        ::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.3);
        }

        /* GPU acceleration for animations */
        .animate-gpu {
          will-change: transform, opacity;
          transform: translateZ(0);
        }
      `;

      const styleSheet = document.createElement('style');
      styleSheet.textContent = styles;
      document.head.appendChild(styleSheet);
    },

    setupEventListeners() {
      // Use event delegation for better performance
      document.addEventListener('click', this.handleClick.bind(this));
      document.addEventListener('submit', this.handleSubmit.bind(this));

      // Debounced input handlers
      const searchInput = document.getElementById('search-chats');
      if (searchInput) {
        searchInput.addEventListener('input', this.debounce((e) => {
          this.searchConversations(e.target.value);
        }, 300));
      }

      // Intersection Observer for lazy loading
      this.setupLazyLoading();

      // Page visibility API for performance
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.onPageHidden();
        } else {
          this.onPageVisible();
        }
      });
    },

    setupLazyLoading() {
      if ('IntersectionObserver' in window) {
        const lazyImageObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const img = entry.target;
              img.src = img.dataset.src;
              img.classList.remove('lazy');
              lazyImageObserver.unobserve(img);
            }
          });
        });

        document.querySelectorAll('img.lazy').forEach(img => {
          lazyImageObserver.observe(img);
        });
      }
    },

    handleClick(e) {
      const target = e.target;

      // Handle new chat button
      if (target.closest('#new-chat-btn')) {
        e.preventDefault();
        this.startNewChat();
        return;
      }

      // Handle logout button
      if (target.closest('#logout-btn')) {
        e.preventDefault();
        this.logout();
        return;
      }

      // Handle mode selection
      if (target.closest('.mode-option')) {
        const mode = target.dataset.mode;
        this.changeMode(mode);
        return;
      }

      // Handle prompt cards
      if (target.closest('.prompt-card')) {
        const card = target.closest('.prompt-card');
        const mode = card.dataset.mode;
        const prompt = card.dataset.prompt;
        this.handleQuickPrompt(mode, prompt);
        return;
      }
    },

    handleSubmit(e) {
      // Handle chat form submission
      if (e.target.id === 'chat-form') {
        e.preventDefault();
        this.sendMessage();
        return;
      }

      // Handle login form
      if (e.target.id === 'login-form') {
        e.preventDefault();
        this.handleLogin();
        return;
      }

      // Handle signup form
      if (e.target.id === 'signup-form') {
        e.preventDefault();
        this.handleSignup();
        return;
      }
    },

    async sendMessage() {
      const input = document.getElementById('user-input');
      const message = input.value.trim();
      if (!message) return;

      // Clear input immediately for better UX
      input.value = '';

      // Add user message to virtual list
      const userMessage = {
        role: 'user',
        content: message,
        timestamp: Date.now()
      };

      this.state.messages.push(userMessage);
      this.virtualList.addItem(userMessage);

      // Show typing indicator
      const typingIndicator = this.createTypingIndicator();
      this.virtualList.addItem(typingIndicator);

      try {
        // Use request manager for deduplication and caching
        const response = await this.requestManager.add(
          `chat-${message}-${this.state.mode}`,
          () => fetch('/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message,
              mode: this.state.mode,
              conversationId: this.state.currentConversation
            }),
            credentials: 'include'
          }).then(res => res.json()),
          { cache: false }
        );

        // Remove typing indicator
        this.virtualList.items.pop();

        // Add AI response
        const aiMessage = {
          role: 'assistant',
          content: response.reply,
          timestamp: Date.now()
        };

        this.state.messages.push(aiMessage);
        this.virtualList.addItem(aiMessage);

        // Update conversation ID if new
        if (response.conversationId && !this.state.currentConversation) {
          this.state.currentConversation = response.conversationId;
        }

      } catch (error) {
        console.error('Failed to send message:', error);
        // Remove typing indicator
        this.virtualList.items.pop();

        // Show error message
        this.showError('Failed to send message. Please try again.');
      }
    },

    createTypingIndicator() {
      return {
        role: 'assistant',
        content: '<div class="typing-indicator"><span></span><span></span><span></span></div>',
        isTyping: true
      };
    },

    showChatInterface() {
      const authContainer = document.getElementById('auth-container');
      const chatContainer = document.getElementById('chat-container');

      if (authContainer) authContainer.style.display = 'none';
      if (chatContainer) {
        chatContainer.style.display = 'flex';
        chatContainer.classList.add('animate-gpu');
      }

      // Update user info
      const userEmail = document.getElementById('user-email');
      if (userEmail && this.state.user) {
        userEmail.textContent = this.state.user.email;
      }
    },

    showAuthInterface() {
      const authContainer = document.getElementById('auth-container');
      const chatContainer = document.getElementById('chat-container');

      if (authContainer) {
        authContainer.style.display = 'flex';
        authContainer.classList.add('animate-gpu');
      }
      if (chatContainer) chatContainer.style.display = 'none';
    },

    async loadConversations() {
      try {
        const conversations = await this.requestManager.add(
          'conversations-list',
          () => fetch('/api/conversations', {
            credentials: 'include'
          }).then(res => res.json()),
          { cache: true, cacheTTL: 30000 }
        );

        this.renderConversations(conversations);
      } catch (error) {
        console.error('Failed to load conversations:', error);
      }
    },

    renderConversations(conversations) {
      const container = document.getElementById('conversations-list');
      if (!container) return;

      const fragment = document.createDocumentFragment();

      conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conversation-item';
        item.dataset.id = conv.id;
        item.innerHTML = `
          <div class="conversation-title">${conv.title || 'Untitled'}</div>
          <div class="conversation-preview">${conv.preview || ''}</div>
          <div class="conversation-time">${this.formatTime(conv.updated_at)}</div>
        `;
        fragment.appendChild(item);
      });

      container.innerHTML = '';
      container.appendChild(fragment);
    },

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
    },

    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },

    onPageHidden() {
      // Pause non-critical operations
      console.log('Page hidden - pausing operations');
    },

    onPageVisible() {
      // Resume operations
      console.log('Page visible - resuming operations');
      // Refresh data if needed
      if (this.state.user) {
        this.requestManager.clearCache('conversations');
        this.loadConversations();
      }
    },

    async logout() {
      try {
        await fetch('/api/auth', {
          method: 'DELETE',
          credentials: 'include'
        });

        this.state.user = null;
        this.state.currentConversation = null;
        this.state.messages = [];

        this.showAuthInterface();
      } catch (error) {
        console.error('Logout failed:', error);
      }
    },

    cleanup() {
      // Clean up workers
      if (this.markdownWorker) {
        this.markdownWorker.terminate();
      }

      // Clear caches
      this.requestManager.clearCache();

      // Remove event listeners
      document.removeEventListener('click', this.handleClick);
      document.removeEventListener('submit', this.handleSubmit);
    }
  };

  // Initialize app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
  } else {
    App.init();
  }

  // Clean up on page unload
  window.addEventListener('beforeunload', () => App.cleanup());

  // Export for debugging
  window.OptimizedApp = App;
})();