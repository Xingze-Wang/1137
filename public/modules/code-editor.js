// Code Editor Module - Monaco Editor Integration

export class CodeEditor {
  constructor(options = {}) {
    this.container = options.container;
    this.theme = options.theme || 'vs-dark';
    this.language = options.language || 'javascript';
    this.readOnly = options.readOnly || false;
    this.minimap = options.minimap !== false;
    this.fontSize = options.fontSize || 14;

    this.editor = null;
    this.monaco = null;
    this.isLoaded = false;

    // Callbacks
    this.onChange = options.onChange || (() => {});
    this.onSave = options.onSave || (() => {});
    this.onRun = options.onRun || (() => {});

    // Load Monaco Editor
    this.loadMonaco();
  }

  async loadMonaco() {
    if (window.monaco) {
      this.monaco = window.monaco;
      this.initialize();
      return;
    }

    // Load Monaco Editor from CDN
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js';

    script.onload = () => {
      require.config({
        paths: {
          'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs'
        }
      });

      require(['vs/editor/editor.main'], () => {
        this.monaco = window.monaco;
        this.initialize();
      });
    };

    document.head.appendChild(script);
  }

  initialize() {
    if (!this.container) {
      console.error('Container element not provided');
      return;
    }

    // Configure Monaco
    this.configureMonaco();

    // Create editor
    this.createEditor();

    // Setup event handlers
    this.setupEventHandlers();

    this.isLoaded = true;
    console.log('Monaco Editor initialized');
  }

  configureMonaco() {
    // Register custom themes
    this.monaco.editor.defineTheme('beta-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6B7280' },
        { token: 'keyword', foreground: '4F46E5' },
        { token: 'string', foreground: '10B981' },
        { token: 'number', foreground: 'F59E0B' },
        { token: 'function', foreground: 'EC4899' }
      ],
      colors: {
        'editor.background': '#111827',
        'editor.foreground': '#F9FAFB',
        'editor.lineHighlightBackground': '#1F2937',
        'editor.selectionBackground': '#4F46E540',
        'editorCursor.foreground': '#4F46E5',
        'editorWhitespace.foreground': '#374151'
      }
    });

    this.monaco.editor.defineTheme('beta-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '9CA3AF' },
        { token: 'keyword', foreground: '4F46E5' },
        { token: 'string', foreground: '059669' },
        { token: 'number', foreground: 'D97706' },
        { token: 'function', foreground: 'DB2777' }
      ],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#111827',
        'editor.lineHighlightBackground': '#F9FAFB',
        'editor.selectionBackground': '#4F46E520',
        'editorCursor.foreground': '#4F46E5'
      }
    });

    // Configure language features
    this.monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: this.monaco.languages.typescript.ScriptTarget.Latest,
      allowNonTsExtensions: true,
      moduleResolution: this.monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: this.monaco.languages.typescript.ModuleKind.ESNext,
      noLib: false,
      jsx: this.monaco.languages.typescript.JsxEmit.React
    });

    // Add type definitions for better IntelliSense
    this.loadTypeDefinitions();
  }

  async loadTypeDefinitions() {
    const typeDefs = [
      'https://cdn.jsdelivr.net/npm/@types/node@latest/index.d.ts',
      'https://cdn.jsdelivr.net/npm/@types/react@latest/index.d.ts'
    ];

    for (const url of typeDefs) {
      try {
        const response = await fetch(url);
        const content = await response.text();
        const filename = url.split('/').pop();

        this.monaco.languages.typescript.javascriptDefaults.addExtraLib(
          content,
          `ts:${filename}`
        );
      } catch (error) {
        console.warn(`Failed to load type definitions from ${url}:`, error);
      }
    }
  }

  createEditor() {
    this.editor = this.monaco.editor.create(this.container, {
      value: '',
      language: this.language,
      theme: this.theme === 'dark' ? 'beta-dark' : 'beta-light',
      automaticLayout: true,
      fontSize: this.fontSize,
      minimap: {
        enabled: this.minimap
      },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      lineNumbers: 'on',
      renderWhitespace: 'selection',
      bracketPairColorization: {
        enabled: true
      },
      suggestOnTriggerCharacters: true,
      quickSuggestions: true,
      formatOnPaste: true,
      formatOnType: true,
      readOnly: this.readOnly,
      padding: {
        top: 10,
        bottom: 10
      }
    });
  }

  setupEventHandlers() {
    // Change handler
    this.editor.onDidChangeModelContent(() => {
      const value = this.editor.getValue();
      this.onChange(value);
    });

    // Save shortcut (Ctrl/Cmd + S)
    this.editor.addCommand(
      this.monaco.KeyMod.CtrlCmd | this.monaco.KeyCode.KeyS,
      () => {
        const value = this.editor.getValue();
        this.onSave(value);
      }
    );

    // Run shortcut (Ctrl/Cmd + Enter)
    this.editor.addCommand(
      this.monaco.KeyMod.CtrlCmd | this.monaco.KeyCode.Enter,
      () => {
        const value = this.editor.getValue();
        this.onRun(value);
      }
    );

    // Format shortcut (Shift + Alt + F)
    this.editor.addCommand(
      this.monaco.KeyMod.Shift | this.monaco.KeyMod.Alt | this.monaco.KeyCode.KeyF,
      () => {
        this.format();
      }
    );
  }

  // Set editor value
  setValue(value, language) {
    if (!this.editor) return;

    if (language && language !== this.language) {
      this.setLanguage(language);
    }

    this.editor.setValue(value);
  }

  // Get editor value
  getValue() {
    if (!this.editor) return '';
    return this.editor.getValue();
  }

  // Set language
  setLanguage(language) {
    if (!this.editor) return;

    this.language = language;
    this.monaco.editor.setModelLanguage(
      this.editor.getModel(),
      language
    );
  }

  // Set theme
  setTheme(theme) {
    if (!this.monaco) return;

    this.theme = theme;
    const monacoTheme = theme === 'dark' ? 'beta-dark' : 'beta-light';
    this.monaco.editor.setTheme(monacoTheme);
  }

  // Format code
  format() {
    if (!this.editor) return;

    this.editor.getAction('editor.action.formatDocument').run();
  }

  // Insert text at cursor
  insertText(text) {
    if (!this.editor) return;

    const selection = this.editor.getSelection();
    const range = new this.monaco.Range(
      selection.startLineNumber,
      selection.startColumn,
      selection.endLineNumber,
      selection.endColumn
    );

    this.editor.executeEdits('', [{
      range: range,
      text: text,
      forceMoveMarkers: true
    }]);
  }

  // Focus editor
  focus() {
    if (this.editor) {
      this.editor.focus();
    }
  }

  // Destroy editor
  dispose() {
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
  }

  // Get selection
  getSelection() {
    if (!this.editor) return '';

    const selection = this.editor.getSelection();
    const model = this.editor.getModel();
    return model.getValueInRange(selection);
  }

  // Add custom action
  addAction(action) {
    if (!this.editor) return;

    this.editor.addAction({
      id: action.id,
      label: action.label,
      keybindings: action.keybindings,
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: action.run
    });
  }

  // Update editor options
  updateOptions(options) {
    if (!this.editor) return;

    this.editor.updateOptions(options);
  }

  // Detect language from code
  static detectLanguage(code) {
    const patterns = {
      javascript: /(?:function|const|let|var|=>|class|import|export)/,
      python: /(?:def|class|import|from|if __name__|print\(|lambda)/,
      java: /(?:public class|private|protected|static void|import java)/,
      cpp: /(?:#include|using namespace|int main|std::)/,
      html: /(?:<html|<body|<div|<script|<style)/,
      css: /(?:\.[\w-]+\s*{|#[\w-]+\s*{|@media|:root)/,
      sql: /(?:SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|FROM)/i,
      rust: /(?:fn |impl |pub |use |mod |let mut|match )/,
      go: /(?:package |func |import |type |struct {)/,
      typescript: /(?:interface |type |enum |namespace |declare )/
    };

    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(code)) {
        return lang;
      }
    }

    return 'plaintext';
  }
}

// Code Block Manager - Handles code blocks in messages
export class CodeBlockManager {
  constructor() {
    this.codeBlocks = new Map();
    this.activeEditor = null;
  }

  // Process message and create code blocks
  processMessage(messageElement, messageId) {
    const codeBlocks = messageElement.querySelectorAll('pre code');

    codeBlocks.forEach((block, index) => {
      const blockId = `${messageId}-${index}`;

      // Detect language
      const classes = block.className.split(' ');
      const langClass = classes.find(c => c.startsWith('language-'));
      const language = langClass ? langClass.replace('language-', '') :
                      CodeEditor.detectLanguage(block.textContent);

      // Create wrapper
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';
      wrapper.innerHTML = `
        <div class="code-block-header">
          <span class="code-language">${language}</span>
          <div class="code-actions">
            <button class="code-action" data-action="copy" title="复制">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
            <button class="code-action" data-action="edit" title="编辑">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="code-action" data-action="run" title="运行">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="code-block-content"></div>
      `;

      // Replace the original code block
      const parent = block.parentElement;
      parent.replaceWith(wrapper);
      wrapper.querySelector('.code-block-content').appendChild(parent);

      // Store code block info
      this.codeBlocks.set(blockId, {
        element: wrapper,
        code: block.textContent,
        language: language
      });

      // Setup event handlers
      this.setupBlockHandlers(wrapper, blockId);
    });
  }

  setupBlockHandlers(wrapper, blockId) {
    const actions = wrapper.querySelectorAll('.code-action');

    actions.forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.action;
        const blockInfo = this.codeBlocks.get(blockId);

        switch (action) {
          case 'copy':
            this.copyCode(blockInfo.code);
            this.showTooltip(button, '已复制！');
            break;

          case 'edit':
            this.openEditor(blockId);
            break;

          case 'run':
            this.runCode(blockInfo.code, blockInfo.language);
            break;
        }
      });
    });
  }

  copyCode(code) {
    navigator.clipboard.writeText(code).then(() => {
      console.log('Code copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy code:', err);
    });
  }

  showTooltip(element, message) {
    const tooltip = document.createElement('div');
    tooltip.className = 'code-tooltip';
    tooltip.textContent = message;

    const rect = element.getBoundingClientRect();
    tooltip.style.left = `${rect.left}px`;
    tooltip.style.top = `${rect.top - 30}px`;

    document.body.appendChild(tooltip);

    setTimeout(() => {
      tooltip.remove();
    }, 2000);
  }

  openEditor(blockId) {
    const blockInfo = this.codeBlocks.get(blockId);
    if (!blockInfo) return;

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'code-editor-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>代码编辑器 - ${blockInfo.language}</h3>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div id="monaco-container" style="height: 400px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary modal-cancel">取消</button>
          <button class="btn-primary modal-save">保存</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Initialize editor
    const editor = new CodeEditor({
      container: modal.querySelector('#monaco-container'),
      language: blockInfo.language,
      theme: 'dark',
      fontSize: 14
    });

    // Wait for Monaco to load
    const checkLoaded = setInterval(() => {
      if (editor.isLoaded) {
        clearInterval(checkLoaded);
        editor.setValue(blockInfo.code);
      }
    }, 100);

    // Event handlers
    modal.querySelector('.modal-close').onclick = () => {
      editor.dispose();
      modal.remove();
    };

    modal.querySelector('.modal-cancel').onclick = () => {
      editor.dispose();
      modal.remove();
    };

    modal.querySelector('.modal-save').onclick = () => {
      const newCode = editor.getValue();
      blockInfo.code = newCode;
      blockInfo.element.querySelector('pre code').textContent = newCode;
      editor.dispose();
      modal.remove();
    };

    // Add modal styles if not present
    this.addModalStyles();
  }

  async runCode(code, language) {
    console.log(`Running ${language} code...`);

    // Dispatch event for code execution
    window.dispatchEvent(new CustomEvent('runCode', {
      detail: { code, language }
    }));

    // For JavaScript, we can run it in a sandboxed iframe
    if (language === 'javascript') {
      this.runJavaScript(code);
    } else {
      // For other languages, show a message
      this.showToast(`需要服务器端支持来运行 ${language} 代码`);
    }
  }

  runJavaScript(code) {
    // Create sandboxed iframe
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.sandbox = 'allow-scripts';
    document.body.appendChild(iframe);

    // Create console output modal
    const outputModal = document.createElement('div');
    outputModal.className = 'code-output-modal';
    outputModal.innerHTML = `
      <div class="output-content">
        <div class="output-header">
          <h3>代码执行结果</h3>
          <button class="output-close">✕</button>
        </div>
        <div class="output-body">
          <pre class="output-text"></pre>
        </div>
      </div>
    `;

    document.body.appendChild(outputModal);

    const outputText = outputModal.querySelector('.output-text');
    let output = [];

    // Inject code with custom console
    const wrappedCode = `
      const console = {
        log: (...args) => parent.postMessage({
          type: 'log',
          data: args.map(arg => String(arg)).join(' ')
        }, '*'),
        error: (...args) => parent.postMessage({
          type: 'error',
          data: args.map(arg => String(arg)).join(' ')
        }, '*')
      };

      try {
        ${code}
      } catch(error) {
        console.error(error.toString());
      }
    `;

    // Listen for messages
    const messageHandler = (event) => {
      if (event.data.type === 'log') {
        output.push(event.data.data);
        outputText.textContent = output.join('\n');
      } else if (event.data.type === 'error') {
        output.push(`Error: ${event.data.data}`);
        outputText.textContent = output.join('\n');
        outputText.style.color = '#EF4444';
      }
    };

    window.addEventListener('message', messageHandler);

    // Run code
    iframe.contentWindow.postMessage(wrappedCode, '*');

    // Cleanup
    outputModal.querySelector('.output-close').onclick = () => {
      window.removeEventListener('message', messageHandler);
      iframe.remove();
      outputModal.remove();
    };

    // Remove iframe after execution
    setTimeout(() => {
      iframe.remove();
    }, 1000);
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'code-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  addModalStyles() {
    if (document.querySelector('#code-editor-modal-styles')) return;

    const styles = `
      .code-editor-modal, .code-output-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
      }

      .modal-content, .output-content {
        background: var(--color-bg-primary);
        border-radius: 12px;
        width: 80%;
        max-width: 800px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: var(--shadow-2xl);
        animation: slideUp 0.3s ease;
      }

      .modal-header, .output-header {
        padding: 1.5rem;
        border-bottom: 1px solid var(--color-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .modal-close, .output-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: var(--color-text-secondary);
        transition: color 0.3s;
      }

      .modal-close:hover, .output-close:hover {
        color: var(--color-text-primary);
      }

      .modal-body {
        flex: 1;
        padding: 1.5rem;
        overflow: auto;
      }

      .output-body {
        flex: 1;
        padding: 1.5rem;
        overflow: auto;
        background: var(--color-bg-secondary);
      }

      .output-text {
        font-family: var(--font-mono);
        font-size: 0.875rem;
        line-height: 1.5;
        white-space: pre-wrap;
        word-wrap: break-word;
      }

      .modal-footer {
        padding: 1.5rem;
        border-top: 1px solid var(--color-border);
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
      }

      .code-block-wrapper {
        margin: 1rem 0;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid var(--color-border);
      }

      .code-block-header {
        background: var(--color-bg-secondary);
        padding: 0.5rem 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--color-border);
      }

      .code-language {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--color-text-secondary);
      }

      .code-actions {
        display: flex;
        gap: 0.5rem;
      }

      .code-action {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.25rem;
        color: var(--color-text-secondary);
        transition: color 0.3s;
      }

      .code-action:hover {
        color: var(--color-accent);
      }

      .code-tooltip {
        position: fixed;
        background: var(--color-text-primary);
        color: white;
        padding: 0.25rem 0.75rem;
        border-radius: 4px;
        font-size: 0.75rem;
        z-index: 10001;
        animation: fadeIn 0.3s;
      }

      .code-toast {
        position: fixed;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: var(--color-text-primary);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        font-size: 0.875rem;
        z-index: 10001;
        transition: transform 0.3s ease;
      }

      .code-toast.show {
        transform: translateX(-50%) translateY(0);
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes slideUp {
        from {
          transform: translateY(20px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.id = 'code-editor-modal-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }
}

// Export instances
export const codeBlockManager = new CodeBlockManager();