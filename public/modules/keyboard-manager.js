// Keyboard Manager Module - Advanced keyboard shortcuts and command palette

export class KeyboardManager {
  constructor(options = {}) {
    this.shortcuts = new Map();
    this.commandPalette = null;
    this.isEnabled = true;
    this.currentMode = 'normal';
    this.modifierKeys = {
      ctrl: false,
      alt: false,
      shift: false,
      meta: false
    };

    // Callbacks
    this.onCommand = options.onCommand || (() => {});
    this.onModeChange = options.onModeChange || (() => {});

    // Default shortcuts
    this.initializeDefaultShortcuts();

    // Setup listeners
    this.setupEventListeners();

    // Initialize command palette
    this.initCommandPalette();
  }

  initializeDefaultShortcuts() {
    // Global shortcuts
    this.registerShortcut('Ctrl+K', 'openCommandPalette', 'Open command palette');
    this.registerShortcut('Ctrl+/', 'toggleShortcutsHelp', 'Show keyboard shortcuts');
    this.registerShortcut('Escape', 'escape', 'Cancel/Close');

    // Navigation
    this.registerShortcut('Ctrl+N', 'newChat', 'Start new chat');
    this.registerShortcut('Ctrl+Shift+N', 'newWindow', 'Open new window');
    this.registerShortcut('Ctrl+Tab', 'nextConversation', 'Next conversation');
    this.registerShortcut('Ctrl+Shift+Tab', 'previousConversation', 'Previous conversation');
    this.registerShortcut('Alt+1', 'switchToChat1', 'Switch to chat 1');
    this.registerShortcut('Alt+2', 'switchToChat2', 'Switch to chat 2');
    this.registerShortcut('Alt+3', 'switchToChat3', 'Switch to chat 3');

    // Editing
    this.registerShortcut('Ctrl+Enter', 'sendMessage', 'Send message');
    this.registerShortcut('Shift+Enter', 'newLine', 'New line in input');
    this.registerShortcut('Ctrl+Shift+Enter', 'sendAndClear', 'Send and clear history');
    this.registerShortcut('Ctrl+Z', 'undo', 'Undo');
    this.registerShortcut('Ctrl+Shift+Z', 'redo', 'Redo');
    this.registerShortcut('Ctrl+A', 'selectAll', 'Select all');
    this.registerShortcut('Ctrl+C', 'copy', 'Copy');
    this.registerShortcut('Ctrl+V', 'paste', 'Paste');
    this.registerShortcut('Ctrl+X', 'cut', 'Cut');

    // Message actions
    this.registerShortcut('Ctrl+R', 'regenerateResponse', 'Regenerate response');
    this.registerShortcut('Ctrl+E', 'editLastMessage', 'Edit last message');
    this.registerShortcut('Ctrl+D', 'deleteMessage', 'Delete message');
    this.registerShortcut('Ctrl+Shift+C', 'copyCodeBlock', 'Copy code block');
    this.registerShortcut('Ctrl+Shift+E', 'expandCodeBlock', 'Expand code block');

    // Voice & Media
    this.registerShortcut('Ctrl+Space', 'toggleVoiceInput', 'Toggle voice input');
    this.registerShortcut('Ctrl+Shift+V', 'toggleVoiceOutput', 'Toggle voice output');
    this.registerShortcut('Ctrl+U', 'uploadFile', 'Upload file');
    this.registerShortcut('Ctrl+I', 'insertImage', 'Insert image');

    // Export & Share
    this.registerShortcut('Ctrl+S', 'saveConversation', 'Save conversation');
    this.registerShortcut('Ctrl+Shift+S', 'saveAs', 'Save as...');
    this.registerShortcut('Ctrl+P', 'print', 'Print conversation');
    this.registerShortcut('Ctrl+Shift+E', 'exportConversation', 'Export conversation');
    this.registerShortcut('Ctrl+Shift+L', 'shareLink', 'Share link');

    // View
    this.registerShortcut('Ctrl+B', 'toggleSidebar', 'Toggle sidebar');
    this.registerShortcut('Ctrl+Shift+F', 'toggleFullscreen', 'Toggle fullscreen');
    this.registerShortcut('Ctrl+Plus', 'zoomIn', 'Zoom in');
    this.registerShortcut('Ctrl+Minus', 'zoomOut', 'Zoom out');
    this.registerShortcut('Ctrl+0', 'resetZoom', 'Reset zoom');
    this.registerShortcut('Ctrl+Shift+D', 'toggleDarkMode', 'Toggle dark mode');

    // Search
    this.registerShortcut('Ctrl+F', 'findInConversation', 'Find in conversation');
    this.registerShortcut('Ctrl+Shift+F', 'globalSearch', 'Global search');
    this.registerShortcut('F3', 'findNext', 'Find next');
    this.registerShortcut('Shift+F3', 'findPrevious', 'Find previous');

    // Mode switching
    this.registerShortcut('Alt+L', 'switchToLearning', 'Switch to learning mode');
    this.registerShortcut('Alt+S', 'switchToStartup', 'Switch to startup mode');
    this.registerShortcut('Alt+A', 'switchToAgent', 'Switch to agent mode');

    // Vim-like navigation (optional)
    this.registerShortcut('j', 'scrollDown', 'Scroll down', 'vim');
    this.registerShortcut('k', 'scrollUp', 'Scroll up', 'vim');
    this.registerShortcut('g g', 'scrollToTop', 'Scroll to top', 'vim');
    this.registerShortcut('G', 'scrollToBottom', 'Scroll to bottom', 'vim');
    this.registerShortcut('/', 'startSearch', 'Start search', 'vim');
    this.registerShortcut('n', 'nextResult', 'Next search result', 'vim');
    this.registerShortcut('N', 'previousResult', 'Previous search result', 'vim');
  }

  registerShortcut(keys, action, description, mode = 'normal') {
    const normalizedKeys = this.normalizeKeys(keys);

    if (!this.shortcuts.has(mode)) {
      this.shortcuts.set(mode, new Map());
    }

    this.shortcuts.get(mode).set(normalizedKeys, {
      action,
      description,
      keys: keys,
      mode
    });
  }

  normalizeKeys(keys) {
    return keys
      .toLowerCase()
      .replace(/ctrl/gi, 'ctrl')
      .replace(/cmd/gi, 'meta')
      .replace(/command/gi, 'meta')
      .replace(/alt/gi, 'alt')
      .replace(/shift/gi, 'shift')
      .replace(/\s+/g, '+')
      .split('+')
      .sort()
      .join('+');
  }

  setupEventListeners() {
    // Keydown handler
    document.addEventListener('keydown', (e) => {
      if (!this.isEnabled) return;

      // Update modifier states
      this.modifierKeys.ctrl = e.ctrlKey;
      this.modifierKeys.alt = e.altKey;
      this.modifierKeys.shift = e.shiftKey;
      this.modifierKeys.meta = e.metaKey;

      // Build key combination
      const keys = this.buildKeyCombination(e);

      // Check for shortcut
      const shortcut = this.findShortcut(keys);
      if (shortcut) {
        e.preventDefault();
        e.stopPropagation();
        this.executeShortcut(shortcut);
      }
    });

    // Keyup handler
    document.addEventListener('keyup', (e) => {
      this.modifierKeys.ctrl = e.ctrlKey;
      this.modifierKeys.alt = e.altKey;
      this.modifierKeys.shift = e.shiftKey;
      this.modifierKeys.meta = e.metaKey;
    });

    // Focus/Blur handlers
    window.addEventListener('blur', () => {
      // Reset modifier states when window loses focus
      this.modifierKeys = {
        ctrl: false,
        alt: false,
        shift: false,
        meta: false
      };
    });
  }

  buildKeyCombination(event) {
    const keys = [];

    if (event.ctrlKey) keys.push('ctrl');
    if (event.altKey) keys.push('alt');
    if (event.shiftKey) keys.push('shift');
    if (event.metaKey) keys.push('meta');

    // Add the actual key
    let key = event.key.toLowerCase();

    // Normalize special keys
    const keyMap = {
      ' ': 'space',
      'arrowup': 'up',
      'arrowdown': 'down',
      'arrowleft': 'left',
      'arrowright': 'right',
      'escape': 'escape',
      'enter': 'enter',
      'backspace': 'backspace',
      'delete': 'delete',
      'tab': 'tab'
    };

    key = keyMap[key] || key;

    // Handle special characters
    if (key === '+') key = 'plus';
    if (key === '-') key = 'minus';

    keys.push(key);

    return keys.sort().join('+');
  }

  findShortcut(keys) {
    const modeShortcuts = this.shortcuts.get(this.currentMode);
    if (modeShortcuts && modeShortcuts.has(keys)) {
      return modeShortcuts.get(keys);
    }

    // Fallback to normal mode
    const normalShortcuts = this.shortcuts.get('normal');
    if (normalShortcuts && normalShortcuts.has(keys)) {
      return normalShortcuts.get(keys);
    }

    return null;
  }

  executeShortcut(shortcut) {
    console.log(`Executing shortcut: ${shortcut.action}`);

    // Dispatch custom event
    const event = new CustomEvent('shortcutExecuted', {
      detail: {
        action: shortcut.action,
        keys: shortcut.keys,
        description: shortcut.description
      }
    });
    window.dispatchEvent(event);

    // Execute callback
    this.onCommand(shortcut.action);

    // Handle built-in actions
    this.handleBuiltInAction(shortcut.action);
  }

  handleBuiltInAction(action) {
    switch (action) {
      case 'openCommandPalette':
        this.openCommandPalette();
        break;
      case 'toggleShortcutsHelp':
        this.showShortcutsHelp();
        break;
      case 'escape':
        this.handleEscape();
        break;
      case 'toggleSidebar':
        document.getElementById('toggle-sidebar')?.click();
        break;
      case 'newChat':
        document.getElementById('new-chat-btn')?.click();
        break;
      case 'sendMessage':
        document.getElementById('send-button')?.click();
        break;
      case 'toggleVoiceInput':
        document.querySelector('.voice-button')?.click();
        break;
      case 'findInConversation':
        this.startFind();
        break;
      case 'toggleFullscreen':
        this.toggleFullscreen();
        break;
      case 'toggleDarkMode':
        this.toggleDarkMode();
        break;
    }
  }

  initCommandPalette() {
    // Create command palette UI
    const palette = document.createElement('div');
    palette.className = 'command-palette';
    palette.innerHTML = `
      <div class="command-palette-overlay"></div>
      <div class="command-palette-modal">
        <div class="command-palette-header">
          <input type="text"
                 class="command-palette-input"
                 placeholder="Type a command or search..."
                 autocomplete="off">
          <button class="command-palette-close">×</button>
        </div>
        <div class="command-palette-results"></div>
        <div class="command-palette-footer">
          <span class="command-palette-hint">
            <kbd>↑↓</kbd> Navigate
            <kbd>Enter</kbd> Select
            <kbd>Esc</kbd> Close
          </span>
        </div>
      </div>
    `;

    palette.style.display = 'none';
    document.body.appendChild(palette);

    this.commandPalette = {
      element: palette,
      input: palette.querySelector('.command-palette-input'),
      results: palette.querySelector('.command-palette-results'),
      isOpen: false,
      selectedIndex: 0,
      filteredCommands: []
    };

    // Setup command palette events
    this.setupCommandPaletteEvents();

    // Add styles
    this.addCommandPaletteStyles();
  }

  setupCommandPaletteEvents() {
    const { element, input, results } = this.commandPalette;

    // Close button
    element.querySelector('.command-palette-close').addEventListener('click', () => {
      this.closeCommandPalette();
    });

    // Overlay click
    element.querySelector('.command-palette-overlay').addEventListener('click', () => {
      this.closeCommandPalette();
    });

    // Input handler
    input.addEventListener('input', (e) => {
      this.filterCommands(e.target.value);
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this.selectNextCommand();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.selectPreviousCommand();
          break;
        case 'Enter':
          e.preventDefault();
          this.executeSelectedCommand();
          break;
        case 'Escape':
          e.preventDefault();
          this.closeCommandPalette();
          break;
      }
    });

    // Click on result
    results.addEventListener('click', (e) => {
      const item = e.target.closest('.command-palette-item');
      if (item) {
        const index = parseInt(item.dataset.index);
        this.executeCommand(this.commandPalette.filteredCommands[index]);
        this.closeCommandPalette();
      }
    });
  }

  openCommandPalette() {
    if (this.commandPalette.isOpen) return;

    const { element, input } = this.commandPalette;

    element.style.display = 'flex';
    this.commandPalette.isOpen = true;

    // Reset and focus
    input.value = '';
    input.focus();

    // Show all commands initially
    this.filterCommands('');

    // Add open class for animation
    setTimeout(() => {
      element.classList.add('open');
    }, 10);
  }

  closeCommandPalette() {
    if (!this.commandPalette.isOpen) return;

    const { element } = this.commandPalette;

    element.classList.remove('open');

    setTimeout(() => {
      element.style.display = 'none';
      this.commandPalette.isOpen = false;
    }, 300);
  }

  filterCommands(query) {
    const allCommands = this.getAllCommands();

    // Filter based on query
    const filtered = query
      ? allCommands.filter(cmd =>
          cmd.action.toLowerCase().includes(query.toLowerCase()) ||
          cmd.description.toLowerCase().includes(query.toLowerCase()) ||
          cmd.keys.toLowerCase().includes(query.toLowerCase())
        )
      : allCommands;

    this.commandPalette.filteredCommands = filtered;
    this.commandPalette.selectedIndex = 0;

    // Render results
    this.renderCommandResults(filtered);
  }

  getAllCommands() {
    const commands = [];

    for (const [mode, shortcuts] of this.shortcuts) {
      for (const [keys, shortcut] of shortcuts) {
        commands.push({
          ...shortcut,
          mode
        });
      }
    }

    // Add additional commands not bound to shortcuts
    commands.push(
      { action: 'toggleVimMode', description: 'Toggle Vim mode', keys: '' },
      { action: 'showStatistics', description: 'Show usage statistics', keys: '' },
      { action: 'clearAllData', description: 'Clear all data', keys: '' },
      { action: 'exportSettings', description: 'Export settings', keys: '' },
      { action: 'importSettings', description: 'Import settings', keys: '' },
      { action: 'showAPIKeys', description: 'Manage API keys', keys: '' },
      { action: 'toggleDebugMode', description: 'Toggle debug mode', keys: '' }
    );

    return commands;
  }

  renderCommandResults(commands) {
    const { results } = this.commandPalette;

    if (commands.length === 0) {
      results.innerHTML = '<div class="command-palette-empty">No commands found</div>';
      return;
    }

    results.innerHTML = commands.map((cmd, index) => `
      <div class="command-palette-item ${index === this.commandPalette.selectedIndex ? 'selected' : ''}"
           data-index="${index}">
        <div class="command-palette-item-content">
          <div class="command-palette-item-title">${cmd.description || cmd.action}</div>
          <div class="command-palette-item-subtitle">${cmd.action}</div>
        </div>
        ${cmd.keys ? `<div class="command-palette-item-keys">${this.formatKeys(cmd.keys)}</div>` : ''}
      </div>
    `).join('');
  }

  formatKeys(keys) {
    return keys.split('+')
      .map(key => `<kbd>${key}</kbd>`)
      .join('');
  }

  selectNextCommand() {
    const { filteredCommands, selectedIndex } = this.commandPalette;

    if (selectedIndex < filteredCommands.length - 1) {
      this.commandPalette.selectedIndex++;
      this.updateSelectedCommand();
    }
  }

  selectPreviousCommand() {
    const { selectedIndex } = this.commandPalette;

    if (selectedIndex > 0) {
      this.commandPalette.selectedIndex--;
      this.updateSelectedCommand();
    }
  }

  updateSelectedCommand() {
    const items = this.commandPalette.results.querySelectorAll('.command-palette-item');

    items.forEach((item, index) => {
      if (index === this.commandPalette.selectedIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  executeSelectedCommand() {
    const command = this.commandPalette.filteredCommands[this.commandPalette.selectedIndex];
    if (command) {
      this.executeCommand(command);
      this.closeCommandPalette();
    }
  }

  executeCommand(command) {
    this.onCommand(command.action);
    this.handleBuiltInAction(command.action);
  }

  showShortcutsHelp() {
    const modal = document.createElement('div');
    modal.className = 'shortcuts-help-modal';
    modal.innerHTML = `
      <div class="shortcuts-help-overlay"></div>
      <div class="shortcuts-help-content">
        <div class="shortcuts-help-header">
          <h2>Keyboard Shortcuts</h2>
          <button class="shortcuts-help-close">×</button>
        </div>
        <div class="shortcuts-help-body">
          ${this.generateShortcutsHTML()}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add styles if needed
    this.addShortcutsHelpStyles();

    // Event handlers
    modal.querySelector('.shortcuts-help-close').onclick = () => modal.remove();
    modal.querySelector('.shortcuts-help-overlay').onclick = () => modal.remove();

    // Show animation
    setTimeout(() => modal.classList.add('open'), 10);
  }

  generateShortcutsHTML() {
    const categories = {
      'Navigation': ['newChat', 'nextConversation', 'previousConversation'],
      'Editing': ['sendMessage', 'undo', 'redo', 'copy', 'paste'],
      'View': ['toggleSidebar', 'toggleFullscreen', 'zoomIn', 'zoomOut'],
      'Export': ['saveConversation', 'exportConversation', 'print'],
      'Search': ['findInConversation', 'globalSearch', 'findNext']
    };

    let html = '';

    for (const [category, actions] of Object.entries(categories)) {
      html += `<div class="shortcuts-category">
        <h3>${category}</h3>
        <div class="shortcuts-list">`;

      for (const action of actions) {
        const shortcut = this.findShortcutByAction(action);
        if (shortcut) {
          html += `
            <div class="shortcut-item">
              <span class="shortcut-description">${shortcut.description}</span>
              <span class="shortcut-keys">${this.formatKeys(shortcut.keys)}</span>
            </div>`;
        }
      }

      html += `</div></div>`;
    }

    return html;
  }

  findShortcutByAction(action) {
    for (const [mode, shortcuts] of this.shortcuts) {
      for (const [keys, shortcut] of shortcuts) {
        if (shortcut.action === action) {
          return shortcut;
        }
      }
    }
    return null;
  }

  startFind() {
    // Create find UI if not exists
    if (!this.findBar) {
      this.createFindBar();
    }

    this.findBar.style.display = 'flex';
    this.findBar.querySelector('input').focus();
  }

  createFindBar() {
    const findBar = document.createElement('div');
    findBar.className = 'find-bar';
    findBar.innerHTML = `
      <input type="text" placeholder="Find in conversation..." class="find-input">
      <span class="find-results">0 of 0</span>
      <button class="find-prev" title="Previous (Shift+F3)">↑</button>
      <button class="find-next" title="Next (F3)">↓</button>
      <button class="find-close" title="Close (Esc)">×</button>
    `;

    findBar.style.display = 'none';
    document.body.appendChild(findBar);

    this.findBar = findBar;

    // Setup find events
    const input = findBar.querySelector('.find-input');
    input.addEventListener('input', () => this.performFind(input.value));

    findBar.querySelector('.find-prev').onclick = () => this.findPrevious();
    findBar.querySelector('.find-next').onclick = () => this.findNext();
    findBar.querySelector('.find-close').onclick = () => this.closeFindBar();

    // Add styles
    this.addFindBarStyles();
  }

  performFind(query) {
    // Implementation for finding text in conversation
    console.log('Finding:', query);
  }

  findNext() {
    console.log('Find next');
  }

  findPrevious() {
    console.log('Find previous');
  }

  closeFindBar() {
    if (this.findBar) {
      this.findBar.style.display = 'none';
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
  }

  handleEscape() {
    // Close any open modals/overlays
    this.closeCommandPalette();
    this.closeFindBar();

    // Dispatch escape event
    window.dispatchEvent(new CustomEvent('escapePressed'));
  }

  enable() {
    this.isEnabled = true;
  }

  disable() {
    this.isEnabled = false;
  }

  setMode(mode) {
    this.currentMode = mode;
    this.onModeChange(mode);
  }

  addCommandPaletteStyles() {
    if (document.querySelector('#command-palette-styles')) return;

    const styles = `
      .command-palette {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10000;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 10vh;
      }

      .command-palette-overlay {
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

      .command-palette.open .command-palette-overlay {
        opacity: 1;
      }

      .command-palette-modal {
        position: relative;
        width: 90%;
        max-width: 600px;
        background: var(--color-bg-primary);
        border-radius: 12px;
        box-shadow: var(--shadow-2xl);
        overflow: hidden;
        transform: translateY(-20px) scale(0.95);
        opacity: 0;
        transition: all 0.3s ease;
      }

      .command-palette.open .command-palette-modal {
        transform: translateY(0) scale(1);
        opacity: 1;
      }

      .command-palette-header {
        display: flex;
        align-items: center;
        padding: 1rem;
        border-bottom: 1px solid var(--color-border);
      }

      .command-palette-input {
        flex: 1;
        padding: 0.5rem;
        background: transparent;
        border: none;
        font-size: 1rem;
        color: var(--color-text-primary);
        outline: none;
      }

      .command-palette-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        color: var(--color-text-secondary);
        cursor: pointer;
        padding: 0.5rem;
      }

      .command-palette-results {
        max-height: 400px;
        overflow-y: auto;
      }

      .command-palette-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        cursor: pointer;
        transition: background 0.2s ease;
      }

      .command-palette-item:hover,
      .command-palette-item.selected {
        background: var(--color-bg-secondary);
      }

      .command-palette-item-content {
        flex: 1;
      }

      .command-palette-item-title {
        font-size: 0.875rem;
        color: var(--color-text-primary);
        font-weight: 500;
      }

      .command-palette-item-subtitle {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
        margin-top: 0.125rem;
      }

      .command-palette-item-keys {
        display: flex;
        gap: 0.25rem;
      }

      .command-palette-footer {
        padding: 0.75rem 1rem;
        border-top: 1px solid var(--color-border);
        background: var(--color-bg-secondary);
      }

      .command-palette-hint {
        display: flex;
        gap: 1rem;
        font-size: 0.75rem;
        color: var(--color-text-secondary);
      }

      .command-palette-empty {
        padding: 2rem;
        text-align: center;
        color: var(--color-text-secondary);
      }

      kbd {
        display: inline-block;
        padding: 0.125rem 0.375rem;
        background: var(--color-bg-tertiary);
        border: 1px solid var(--color-border);
        border-radius: 4px;
        font-size: 0.75rem;
        font-family: var(--font-mono);
        color: var(--color-text-primary);
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.id = 'command-palette-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  addShortcutsHelpStyles() {
    if (document.querySelector('#shortcuts-help-styles')) return;

    const styles = `
      .shortcuts-help-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .shortcuts-help-overlay {
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

      .shortcuts-help-modal.open .shortcuts-help-overlay {
        opacity: 1;
      }

      .shortcuts-help-content {
        position: relative;
        width: 90%;
        max-width: 700px;
        max-height: 80vh;
        background: var(--color-bg-primary);
        border-radius: 12px;
        box-shadow: var(--shadow-2xl);
        overflow: hidden;
        transform: scale(0.95);
        opacity: 0;
        transition: all 0.3s ease;
      }

      .shortcuts-help-modal.open .shortcuts-help-content {
        transform: scale(1);
        opacity: 1;
      }

      .shortcuts-help-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1.5rem;
        border-bottom: 1px solid var(--color-border);
      }

      .shortcuts-help-header h2 {
        margin: 0;
        font-size: 1.25rem;
        color: var(--color-text-primary);
      }

      .shortcuts-help-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        color: var(--color-text-secondary);
        cursor: pointer;
      }

      .shortcuts-help-body {
        padding: 1.5rem;
        overflow-y: auto;
        max-height: calc(80vh - 100px);
      }

      .shortcuts-category {
        margin-bottom: 1.5rem;
      }

      .shortcuts-category h3 {
        margin: 0 0 0.75rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        text-transform: uppercase;
      }

      .shortcuts-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .shortcut-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem;
        background: var(--color-bg-secondary);
        border-radius: 6px;
      }

      .shortcut-description {
        font-size: 0.875rem;
        color: var(--color-text-primary);
      }

      .shortcut-keys {
        display: flex;
        gap: 0.25rem;
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.id = 'shortcuts-help-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  addFindBarStyles() {
    if (document.querySelector('#find-bar-styles')) return;

    const styles = `
      .find-bar {
        position: fixed;
        top: 60px;
        right: 20px;
        background: var(--color-bg-primary);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        box-shadow: var(--shadow-lg);
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        z-index: 1000;
        animation: slideDown 0.3s ease;
      }

      @keyframes slideDown {
        from {
          transform: translateY(-20px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      .find-input {
        width: 200px;
        padding: 0.375rem 0.5rem;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        border-radius: 4px;
        font-size: 0.875rem;
        color: var(--color-text-primary);
        outline: none;
      }

      .find-input:focus {
        border-color: var(--color-accent);
      }

      .find-results {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
        min-width: 60px;
      }

      .find-prev,
      .find-next,
      .find-close {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        font-size: 1rem;
        color: var(--color-text-secondary);
        transition: color 0.2s ease;
      }

      .find-prev:hover,
      .find-next:hover,
      .find-close:hover {
        color: var(--color-accent);
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.id = 'find-bar-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }
}

// Export singleton instance
export const keyboardManager = new KeyboardManager();