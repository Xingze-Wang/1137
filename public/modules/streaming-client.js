// Streaming Client Module - Handles Server-Sent Events for real-time AI responses

export class StreamingClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '/api/chat-stream';
    this.onChunk = options.onChunk || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onError = options.onError || (() => {});
    this.onMetadata = options.onMetadata || (() => {});

    this.eventSource = null;
    this.buffer = '';
    this.isStreaming = false;
    this.abortController = null;
  }

  async streamMessage(message, mode = 'learning', conversationId = null) {
    if (this.isStreaming) {
      console.warn('Already streaming, aborting previous stream');
      this.abort();
    }

    this.isStreaming = true;
    this.buffer = '';
    this.abortController = new AbortController();

    try {
      // Get auth token
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Prepare request body
      const requestBody = {
        message,
        mode,
        conversationId
      };

      // Create EventSource for SSE
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Stream request failed');
      }

      // Read the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Decode chunk
        const chunk = decoder.decode(value, { stream: true });
        this.processChunk(chunk);
      }

      this.isStreaming = false;
      this.onComplete(this.buffer);

    } catch (error) {
      this.isStreaming = false;

      if (error.name === 'AbortError') {
        console.log('Stream aborted');
        return;
      }

      console.error('Streaming error:', error);
      this.onError(error);
    }
  }

  processChunk(chunk) {
    // Parse SSE format
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);

        if (data === '[DONE]') {
          continue;
        }

        try {
          const parsed = JSON.parse(data);

          switch (parsed.type) {
            case 'content':
              this.buffer += parsed.content;
              this.onChunk(parsed.content, parsed.chunkIndex);
              break;

            case 'metadata':
              this.onMetadata(parsed);
              break;

            case 'done':
              console.log(`Stream complete: ${parsed.totalChunks} chunks, ${parsed.totalLength} chars`);
              break;

            case 'error':
              this.onError(new Error(parsed.error));
              break;
          }
        } catch (e) {
          console.warn('Failed to parse chunk:', data);
        }
      }
    }
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }

    if (this.eventSource) {
      this.eventSource.close();
    }

    this.isStreaming = false;
  }

  getBuffer() {
    return this.buffer;
  }

  isActive() {
    return this.isStreaming;
  }
}

// Typing Animation Controller
export class TypingAnimator {
  constructor(element, options = {}) {
    this.element = element;
    this.speed = options.speed || 30; // ms per character
    this.smoothing = options.smoothing || true;
    this.cursorEnabled = options.cursor !== false;

    this.queue = [];
    this.isAnimating = false;
    this.currentText = '';
    this.cursor = null;

    if (this.cursorEnabled) {
      this.createCursor();
    }
  }

  createCursor() {
    this.cursor = document.createElement('span');
    this.cursor.className = 'typing-cursor';
    this.cursor.textContent = '▊';
    this.cursor.style.cssText = `
      animation: blink 1s infinite;
      color: var(--color-accent);
      font-weight: normal;
    `;

    // Add cursor animation styles
    if (!document.querySelector('#typing-cursor-styles')) {
      const style = document.createElement('style');
      style.id = 'typing-cursor-styles';
      style.textContent = `
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  addChunk(text) {
    this.queue.push(text);

    if (!this.isAnimating) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.queue.length === 0) {
      this.isAnimating = false;
      if (this.cursor && this.element.contains(this.cursor)) {
        this.element.removeChild(this.cursor);
      }
      return;
    }

    this.isAnimating = true;
    const chunk = this.queue.shift();

    // Add cursor if not present
    if (this.cursor && !this.element.contains(this.cursor)) {
      this.element.appendChild(this.cursor);
    }

    // Animate the chunk
    if (this.smoothing) {
      await this.animateText(chunk);
    } else {
      this.currentText += chunk;
      this.updateDisplay();
    }

    // Process next chunk
    this.processQueue();
  }

  async animateText(text) {
    for (const char of text) {
      this.currentText += char;
      this.updateDisplay();

      // Variable speed for more natural feel
      const delay = this.speed + (Math.random() * 20 - 10);
      await this.sleep(delay);
    }
  }

  updateDisplay() {
    // Use innerHTML for markdown support
    const htmlContent = this.renderMarkdown(this.currentText);

    if (this.cursor) {
      this.element.innerHTML = htmlContent;
      this.element.appendChild(this.cursor);
    } else {
      this.element.innerHTML = htmlContent;
    }
  }

  renderMarkdown(text) {
    // Basic markdown rendering
    return text
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  clear() {
    this.queue = [];
    this.currentText = '';
    this.element.innerHTML = '';
    this.isAnimating = false;
  }

  instant(text) {
    this.clear();
    this.currentText = text;
    this.updateDisplay();
  }
}

// Stream Manager - Coordinates streaming and animation
export class StreamManager {
  constructor() {
    this.client = null;
    this.animators = new Map();
    this.activeStreams = new Map();
  }

  initialize() {
    this.client = new StreamingClient({
      onChunk: (content, index) => this.handleChunk(content, index),
      onComplete: (fullText) => this.handleComplete(fullText),
      onError: (error) => this.handleError(error),
      onMetadata: (metadata) => this.handleMetadata(metadata)
    });
  }

  async streamToElement(element, message, mode, conversationId) {
    const streamId = Date.now().toString();

    // Create animator for this element
    const animator = new TypingAnimator(element, {
      speed: 20,
      smoothing: true,
      cursor: true
    });

    this.animators.set(streamId, animator);
    this.activeStreams.set(streamId, { element, animator });

    // Store current stream ID for chunk handling
    this.currentStreamId = streamId;

    // Start streaming
    await this.client.streamMessage(message, mode, conversationId);

    // Cleanup
    this.animators.delete(streamId);
    this.activeStreams.delete(streamId);

    return streamId;
  }

  handleChunk(content, index) {
    const animator = this.animators.get(this.currentStreamId);
    if (animator) {
      animator.addChunk(content);
    }
  }

  handleComplete(fullText) {
    console.log('Stream complete, total length:', fullText.length);

    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('streamComplete', {
      detail: { text: fullText, streamId: this.currentStreamId }
    }));
  }

  handleError(error) {
    console.error('Stream error:', error);

    // Show error in UI
    const stream = this.activeStreams.get(this.currentStreamId);
    if (stream) {
      stream.element.innerHTML = `
        <div class="stream-error">
          <span class="error-icon">⚠️</span>
          <span class="error-text">Error: ${error.message}</span>
        </div>
      `;
    }

    // Dispatch error event
    window.dispatchEvent(new CustomEvent('streamError', {
      detail: { error, streamId: this.currentStreamId }
    }));
  }

  handleMetadata(metadata) {
    // Handle conversation ID updates
    if (metadata.conversationId) {
      window.dispatchEvent(new CustomEvent('conversationUpdate', {
        detail: { conversationId: metadata.conversationId }
      }));
    }
  }

  abort(streamId) {
    if (streamId) {
      const stream = this.activeStreams.get(streamId);
      if (stream) {
        stream.animator.clear();
      }
    }

    this.client?.abort();
  }

  abortAll() {
    for (const [streamId, stream] of this.activeStreams) {
      stream.animator.clear();
    }

    this.client?.abort();
    this.activeStreams.clear();
    this.animators.clear();
  }
}

// Export singleton instance
export const streamManager = new StreamManager();
streamManager.initialize();