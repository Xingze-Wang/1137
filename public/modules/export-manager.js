// Export Manager Module - Export conversations to various formats

import { jsPDF } from 'https://cdn.skypack.dev/jspdf@2.5.1';
import html2canvas from 'https://cdn.skypack.dev/html2canvas@1.4.1';
import { marked } from 'https://cdn.skypack.dev/marked@9.1.0';

export class ExportManager {
  constructor() {
    this.formats = ['pdf', 'markdown', 'json', 'html', 'docx', 'txt'];
    this.currentConversation = null;
  }

  // Export conversation in specified format
  async exportConversation(conversation, format, options = {}) {
    this.currentConversation = conversation;

    switch (format.toLowerCase()) {
      case 'pdf':
        return await this.exportToPDF(conversation, options);
      case 'markdown':
      case 'md':
        return this.exportToMarkdown(conversation, options);
      case 'json':
        return this.exportToJSON(conversation, options);
      case 'html':
        return this.exportToHTML(conversation, options);
      case 'docx':
        return await this.exportToDocx(conversation, options);
      case 'txt':
      case 'text':
        return this.exportToText(conversation, options);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  // Export to PDF
  async exportToPDF(conversation, options = {}) {
    const {
      title = conversation.title || 'AI Conversation',
      includeMetadata = true,
      includeTimestamps = true,
      paperSize = 'a4',
      orientation = 'portrait'
    } = options;

    // Initialize jsPDF
    const pdf = new jsPDF({
      orientation: orientation,
      unit: 'mm',
      format: paperSize
    });

    // Set fonts
    pdf.setFont('helvetica', 'normal');

    // Add header
    pdf.setFontSize(20);
    pdf.setTextColor(10, 56, 31); // Brand color
    pdf.text(title, 20, 20);

    // Add metadata
    if (includeMetadata) {
      pdf.setFontSize(10);
      pdf.setTextColor(107, 114, 128);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, 20, 30);
      pdf.text(`Mode: ${conversation.mode || 'Learning'}`, 20, 35);
      pdf.text(`Messages: ${conversation.messages?.length || 0}`, 20, 40);
    }

    // Add line separator
    pdf.setDrawColor(229, 231, 235);
    pdf.line(20, 45, pdf.internal.pageSize.width - 20, 45);

    // Add messages
    let yPosition = 55;
    const pageHeight = pdf.internal.pageSize.height;
    const margin = 20;
    const lineHeight = 7;

    for (const message of conversation.messages || []) {
      // Check if need new page
      if (yPosition > pageHeight - 30) {
        pdf.addPage();
        yPosition = 20;
      }

      // Add role indicator
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');

      if (message.role === 'user') {
        pdf.setTextColor(79, 70, 229); // Accent color
        pdf.text('You:', margin, yPosition);
      } else {
        pdf.setTextColor(16, 185, 129); // Success color
        pdf.text('Assistant:', margin, yPosition);
      }

      yPosition += lineHeight;

      // Add timestamp if enabled
      if (includeTimestamps && message.timestamp) {
        pdf.setFontSize(9);
        pdf.setTextColor(156, 163, 175);
        pdf.setFont('helvetica', 'normal');
        pdf.text(new Date(message.timestamp).toLocaleString(), margin, yPosition);
        yPosition += lineHeight;
      }

      // Add message content
      pdf.setFontSize(11);
      pdf.setTextColor(17, 24, 39);
      pdf.setFont('helvetica', 'normal');

      // Wrap text
      const lines = pdf.splitTextToSize(message.content, pdf.internal.pageSize.width - 2 * margin);

      for (const line of lines) {
        if (yPosition > pageHeight - 20) {
          pdf.addPage();
          yPosition = 20;
        }
        pdf.text(line, margin, yPosition);
        yPosition += lineHeight;
      }

      yPosition += lineHeight; // Extra space between messages
    }

    // Add footer
    const pageCount = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(9);
      pdf.setTextColor(156, 163, 175);
      pdf.text(
        `Page ${i} of ${pageCount}`,
        pdf.internal.pageSize.width / 2,
        pdf.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    // Save PDF
    const filename = `${this.sanitizeFilename(title)}_${Date.now()}.pdf`;
    pdf.save(filename);

    return { success: true, filename };
  }

  // Export to Markdown
  exportToMarkdown(conversation, options = {}) {
    const {
      title = conversation.title || 'AI Conversation',
      includeMetadata = true,
      includeTimestamps = true,
      includeTOC = true
    } = options;

    let markdown = '';

    // Add title
    markdown += `# ${title}\n\n`;

    // Add metadata
    if (includeMetadata) {
      markdown += '## Metadata\n\n';
      markdown += `- **Date**: ${new Date().toLocaleString()}\n`;
      markdown += `- **Mode**: ${conversation.mode || 'Learning'}\n`;
      markdown += `- **Messages**: ${conversation.messages?.length || 0}\n`;
      markdown += `- **ID**: ${conversation.id || 'N/A'}\n\n`;
    }

    // Add table of contents
    if (includeTOC && conversation.messages?.length > 5) {
      markdown += '## Table of Contents\n\n';
      let messageIndex = 0;
      for (const message of conversation.messages || []) {
        if (message.role === 'user') {
          messageIndex++;
          const preview = message.content.substring(0, 50);
          markdown += `${messageIndex}. [${preview}...](#message-${messageIndex})\n`;
        }
      }
      markdown += '\n---\n\n';
    }

    // Add conversation
    markdown += '## Conversation\n\n';

    let messageIndex = 0;
    for (const message of conversation.messages || []) {
      if (message.role === 'user') {
        messageIndex++;
        markdown += `<a id="message-${messageIndex}"></a>\n\n`;
        markdown += `### 👤 You\n`;
      } else {
        markdown += `### 🤖 Assistant\n`;
      }

      if (includeTimestamps && message.timestamp) {
        markdown += `*${new Date(message.timestamp).toLocaleString()}*\n\n`;
      }

      // Process content
      let content = message.content;

      // Preserve code blocks
      content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        return `\`\`\`${lang || ''}\n${code}\`\`\``;
      });

      markdown += `${content}\n\n`;
      markdown += '---\n\n';
    }

    // Add footer
    markdown += `\n\n---\n`;
    markdown += `*Exported from Beta AI - ${new Date().toLocaleString()}*\n`;

    // Download file
    this.downloadFile(
      markdown,
      `${this.sanitizeFilename(title)}_${Date.now()}.md`,
      'text/markdown'
    );

    return { success: true, content: markdown };
  }

  // Export to JSON
  exportToJSON(conversation, options = {}) {
    const {
      pretty = true,
      includeMetadata = true
    } = options;

    const data = {
      version: '1.0',
      exported: new Date().toISOString(),
      application: 'Beta AI',
      conversation: {
        id: conversation.id,
        title: conversation.title,
        mode: conversation.mode,
        created: conversation.created,
        updated: conversation.updated,
        messages: conversation.messages?.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          metadata: msg.metadata || {}
        }))
      }
    };

    if (!includeMetadata) {
      delete data.conversation.created;
      delete data.conversation.updated;
      data.conversation.messages = data.conversation.messages?.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    }

    const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

    // Download file
    this.downloadFile(
      json,
      `${this.sanitizeFilename(conversation.title || 'conversation')}_${Date.now()}.json`,
      'application/json'
    );

    return { success: true, data };
  }

  // Export to HTML
  exportToHTML(conversation, options = {}) {
    const {
      title = conversation.title || 'AI Conversation',
      includeStyles = true,
      darkMode = false
    } = options;

    let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>`;

    if (includeStyles) {
      html += `
  <style>
    :root {
      --bg: ${darkMode ? '#111827' : '#FFFFFF'};
      --text: ${darkMode ? '#F9FAFB' : '#111827'};
      --border: ${darkMode ? '#374151' : '#E5E7EB'};
      --user-bg: ${darkMode ? '#4F46E5' : '#EEF2FF'};
      --assistant-bg: ${darkMode ? '#059669' : '#D1FAE5'};
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      line-height: 1.6;
    }

    h1 {
      color: var(--text);
      border-bottom: 2px solid var(--border);
      padding-bottom: 1rem;
    }

    .metadata {
      background: var(--border);
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 2rem;
      font-size: 0.875rem;
    }

    .message {
      margin-bottom: 1.5rem;
      padding: 1rem;
      border-radius: 8px;
    }

    .message.user {
      background: var(--user-bg);
      margin-left: 2rem;
    }

    .message.assistant {
      background: var(--assistant-bg);
      margin-right: 2rem;
    }

    .role {
      font-weight: 600;
      margin-bottom: 0.5rem;
    }

    .timestamp {
      font-size: 0.75rem;
      opacity: 0.7;
      margin-bottom: 0.5rem;
    }

    pre {
      background: ${darkMode ? '#1F2937' : '#F3F4F6'};
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
    }

    code {
      background: ${darkMode ? '#1F2937' : '#F3F4F6'};
      padding: 0.125rem 0.25rem;
      border-radius: 2px;
      font-family: 'SF Mono', Monaco, monospace;
    }

    .footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 0.875rem;
      opacity: 0.7;
    }
  </style>`;
    }

    html += `
</head>
<body>
  <h1>${title}</h1>

  <div class="metadata">
    <div>Mode: ${conversation.mode || 'Learning'}</div>
    <div>Messages: ${conversation.messages?.length || 0}</div>
    <div>Exported: ${new Date().toLocaleString()}</div>
  </div>

  <div class="conversation">`;

    for (const message of conversation.messages || []) {
      const roleClass = message.role === 'user' ? 'user' : 'assistant';
      const roleLabel = message.role === 'user' ? 'You' : 'Assistant';

      html += `
    <div class="message ${roleClass}">
      <div class="role">${roleLabel}</div>`;

      if (message.timestamp) {
        html += `
      <div class="timestamp">${new Date(message.timestamp).toLocaleString()}</div>`;
      }

      // Convert markdown to HTML
      const htmlContent = marked.parse(message.content || '');
      html += `
      <div class="content">${htmlContent}</div>
    </div>`;
    }

    html += `
  </div>

  <div class="footer">
    Exported from Beta AI - ${new Date().toLocaleString()}
  </div>
</body>
</html>`;

    // Download file
    this.downloadFile(
      html,
      `${this.sanitizeFilename(title)}_${Date.now()}.html`,
      'text/html'
    );

    return { success: true, html };
  }

  // Export to DOCX
  async exportToDocx(conversation, options = {}) {
    // For DOCX export, we'll use a library like docx
    // This is a simplified version - in production, use a proper DOCX library

    const htmlContent = this.exportToHTML(conversation, { ...options, includeStyles: false });

    // Create a blob with Word-compatible HTML
    const wordHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <title>${conversation.title || 'AI Conversation'}</title>
      </head>
      <body>
        ${htmlContent.html}
      </body>
      </html>
    `;

    // Download as .doc file (Word will open it correctly)
    this.downloadFile(
      wordHtml,
      `${this.sanitizeFilename(conversation.title || 'conversation')}_${Date.now()}.doc`,
      'application/msword'
    );

    return { success: true };
  }

  // Export to plain text
  exportToText(conversation, options = {}) {
    const {
      includeTimestamps = false,
      separator = '---'
    } = options;

    let text = '';

    // Add title
    text += `${conversation.title || 'AI Conversation'}\n`;
    text += `${'='.repeat(50)}\n\n`;

    // Add metadata
    text += `Date: ${new Date().toLocaleString()}\n`;
    text += `Mode: ${conversation.mode || 'Learning'}\n`;
    text += `Messages: ${conversation.messages?.length || 0}\n\n`;
    text += `${separator}\n\n`;

    // Add messages
    for (const message of conversation.messages || []) {
      const role = message.role === 'user' ? 'YOU' : 'ASSISTANT';
      text += `[${role}]`;

      if (includeTimestamps && message.timestamp) {
        text += ` - ${new Date(message.timestamp).toLocaleString()}`;
      }

      text += `\n${message.content}\n\n`;
      text += `${separator}\n\n`;
    }

    // Add footer
    text += `\nExported from Beta AI - ${new Date().toLocaleString()}\n`;

    // Download file
    this.downloadFile(
      text,
      `${this.sanitizeFilename(conversation.title || 'conversation')}_${Date.now()}.txt`,
      'text/plain'
    );

    return { success: true, text };
  }

  // Utility: Download file
  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Utility: Sanitize filename
  sanitizeFilename(filename) {
    return filename
      .replace(/[^a-z0-9]/gi, '_')
      .replace(/_+/g, '_')
      .substring(0, 50);
  }

  // Create export UI
  createExportUI(container) {
    const exportButton = document.createElement('button');
    exportButton.className = 'export-button';
    exportButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>导出</span>
    `;

    const dropdown = document.createElement('div');
    dropdown.className = 'export-dropdown';
    dropdown.style.display = 'none';
    dropdown.innerHTML = `
      <div class="export-option" data-format="pdf">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z"/>
        </svg>
        导出为 PDF
      </div>
      <div class="export-option" data-format="markdown">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3,3H21V21H3V3M5,5V19H19V5H5M7,11H9V17H7V11M11,7H13V17H11V7M15,11H17V13H15V11Z"/>
        </svg>
        导出为 Markdown
      </div>
      <div class="export-option" data-format="json">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8,3A2,2 0 0,0 6,5V9A2,2 0 0,1 4,11H3V13H4A2,2 0 0,1 6,15V19A2,2 0 0,0 8,21H10V19H8V15A2,2 0 0,0 6,13A2,2 0 0,0 8,11V5H10V3H8M16,3A2,2 0 0,1 18,5V9A2,2 0 0,0 20,11H21V13H20A2,2 0 0,0 18,15V19A2,2 0 0,1 16,21H14V19H16V15A2,2 0 0,1 18,13A2,2 0 0,1 16,11V5H14V3H16Z"/>
        </svg>
        导出为 JSON
      </div>
      <div class="export-option" data-format="html">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12,17.56L16.07,16.43L16.62,10.33H9.38L9.2,8.3H16.8L17,6.31H7L7.56,12.32H14.45L14.22,14.9L12,15.5L9.78,14.9L9.64,13.24H7.64L7.93,16.43L12,17.56M4.07,3H19.93L18.5,19.2L12,21L5.5,19.2L4.07,3Z"/>
        </svg>
        导出为 HTML
      </div>
      <div class="export-option" data-format="docx">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6,2H14L20,8V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2M13,3.5V9H18.5L13,3.5Z"/>
        </svg>
        导出为 Word
      </div>
      <div class="export-option" data-format="txt">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M16,18H8V16H16V18M16,14H8V12H16V14M13,9V3.5L18.5,9H13Z"/>
        </svg>
        导出为纯文本
      </div>
    `;

    // Add styles
    this.addExportStyles();

    // Event handlers
    exportButton.addEventListener('click', () => {
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    dropdown.addEventListener('click', (e) => {
      const option = e.target.closest('.export-option');
      if (option) {
        const format = option.dataset.format;
        this.handleExportClick(format);
        dropdown.style.display = 'none';
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!exportButton.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });

    container.appendChild(exportButton);
    container.appendChild(dropdown);

    return { button: exportButton, dropdown };
  }

  handleExportClick(format) {
    // Get current conversation data
    const conversation = this.getCurrentConversation();

    if (!conversation) {
      this.showNotification('没有可导出的对话', 'error');
      return;
    }

    try {
      this.exportConversation(conversation, format);
      this.showNotification(`成功导出为 ${format.toUpperCase()} 格式`, 'success');
    } catch (error) {
      console.error('Export failed:', error);
      this.showNotification(`导出失败: ${error.message}`, 'error');
    }
  }

  getCurrentConversation() {
    // This should be implemented to get the current conversation data
    // from your app's state management
    return window.currentConversation || {
      title: 'Sample Conversation',
      mode: 'learning',
      messages: [
        { role: 'user', content: 'Hello', timestamp: Date.now() },
        { role: 'assistant', content: 'Hi there!', timestamp: Date.now() }
      ]
    };
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `export-notification ${type}`;
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

  addExportStyles() {
    if (document.querySelector('#export-manager-styles')) return;

    const styles = `
      .export-button {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        border-radius: 0.5rem;
        cursor: pointer;
        transition: all 0.3s ease;
        font-size: 0.875rem;
        color: var(--color-text-primary);
      }

      .export-button:hover {
        background: var(--color-bg-tertiary);
        border-color: var(--color-accent);
      }

      .export-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 0.5rem;
        background: var(--color-bg-primary);
        border: 1px solid var(--color-border);
        border-radius: 0.5rem;
        box-shadow: var(--shadow-lg);
        min-width: 200px;
        z-index: 1000;
      }

      .export-option {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        cursor: pointer;
        transition: background 0.2s ease;
        font-size: 0.875rem;
        color: var(--color-text-primary);
      }

      .export-option:hover {
        background: var(--color-bg-secondary);
      }

      .export-option:first-child {
        border-radius: 0.5rem 0.5rem 0 0;
      }

      .export-option:last-child {
        border-radius: 0 0 0.5rem 0.5rem;
      }

      .export-option svg {
        flex-shrink: 0;
        opacity: 0.7;
      }

      .export-notification {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        font-size: 0.875rem;
        z-index: 10001;
        transform: translateX(400px);
        transition: transform 0.3s ease;
        box-shadow: var(--shadow-lg);
      }

      .export-notification.show {
        transform: translateX(0);
      }

      .export-notification.success {
        background: #10B981;
        color: white;
      }

      .export-notification.error {
        background: #EF4444;
        color: white;
      }

      .export-notification.info {
        background: var(--color-accent);
        color: white;
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.id = 'export-manager-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }
}

// Export singleton instance
export const exportManager = new ExportManager();