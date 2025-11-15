// Voice Assistant Module - Speech Recognition & Text-to-Speech

export class VoiceAssistant {
  constructor(options = {}) {
    this.lang = options.lang || 'zh-CN';
    this.continuous = options.continuous || false;
    this.interimResults = options.interimResults || true;

    // Callbacks
    this.onResult = options.onResult || (() => {});
    this.onError = options.onError || (() => {});
    this.onStart = options.onStart || (() => {});
    this.onEnd = options.onEnd || (() => {});

    // Speech recognition
    this.recognition = null;
    this.isListening = false;

    // Speech synthesis
    this.synthesis = window.speechSynthesis;
    this.voices = [];
    this.selectedVoice = null;
    this.isSpeaking = false;

    // Initialize
    this.initSpeechRecognition();
    this.loadVoices();

    // Audio feedback
    this.audioContext = null;
    this.initAudioFeedback();
  }

  // Initialize Speech Recognition
  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = this.continuous;
    this.recognition.interimResults = this.interimResults;
    this.recognition.lang = this.lang;

    // Event handlers
    this.recognition.onstart = () => {
      this.isListening = true;
      this.onStart();
      this.playStartSound();
      console.log('Speech recognition started');
    };

    this.recognition.onresult = (event) => {
      const results = event.results;
      const lastResult = results[results.length - 1];

      const transcript = lastResult[0].transcript;
      const isFinal = lastResult.isFinal;

      this.onResult({
        transcript,
        isFinal,
        confidence: lastResult[0].confidence
      });
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.isListening = false;
      this.onError(event.error);
      this.playErrorSound();
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.onEnd();
      this.playEndSound();
      console.log('Speech recognition ended');
    };
  }

  // Load available voices
  loadVoices() {
    const loadVoiceList = () => {
      this.voices = this.synthesis.getVoices();

      // Select preferred voice
      this.selectedVoice = this.voices.find(voice =>
        voice.lang.startsWith(this.lang.split('-')[0])
      ) || this.voices[0];

      console.log(`Loaded ${this.voices.length} voices`);
    };

    loadVoiceList();

    // Chrome loads voices asynchronously
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoiceList;
    }
  }

  // Start listening
  startListening() {
    if (!this.recognition) {
      console.error('Speech recognition not available');
      return false;
    }

    if (this.isListening) {
      console.warn('Already listening');
      return false;
    }

    try {
      this.recognition.start();
      return true;
    } catch (error) {
      console.error('Failed to start recognition:', error);
      return false;
    }
  }

  // Stop listening
  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  // Toggle listening
  toggleListening() {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  // Speak text
  speak(text, options = {}) {
    if (!this.synthesis) {
      console.error('Speech synthesis not available');
      return Promise.reject(new Error('Speech synthesis not available'));
    }

    // Cancel any ongoing speech
    if (this.isSpeaking) {
      this.synthesis.cancel();
    }

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);

      // Set voice
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }

      // Set options
      utterance.rate = options.rate || 1.0;
      utterance.pitch = options.pitch || 1.0;
      utterance.volume = options.volume || 1.0;
      utterance.lang = options.lang || this.lang;

      // Event handlers
      utterance.onstart = () => {
        this.isSpeaking = true;
        console.log('Started speaking');
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        console.log('Finished speaking');
        resolve();
      };

      utterance.onerror = (event) => {
        this.isSpeaking = false;
        console.error('Speech synthesis error:', event);
        reject(event);
      };

      // Speak
      this.synthesis.speak(utterance);
    });
  }

  // Stop speaking
  stopSpeaking() {
    if (this.synthesis && this.isSpeaking) {
      this.synthesis.cancel();
      this.isSpeaking = false;
    }
  }

  // Pause speaking
  pauseSpeaking() {
    if (this.synthesis && this.isSpeaking) {
      this.synthesis.pause();
    }
  }

  // Resume speaking
  resumeSpeaking() {
    if (this.synthesis) {
      this.synthesis.resume();
    }
  }

  // Set voice by name or index
  setVoice(voiceIdentifier) {
    if (typeof voiceIdentifier === 'number') {
      this.selectedVoice = this.voices[voiceIdentifier];
    } else {
      this.selectedVoice = this.voices.find(v => v.name === voiceIdentifier);
    }
  }

  // Get available voices
  getVoices() {
    return this.voices.map(voice => ({
      name: voice.name,
      lang: voice.lang,
      local: voice.localService,
      default: voice.default
    }));
  }

  // Initialize audio feedback
  initAudioFeedback() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.warn('Audio context not available:', error);
    }
  }

  // Play start sound
  playStartSound() {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.value = 523.25; // C5
    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.1);
  }

  // Play end sound
  playEndSound() {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.value = 392; // G4
    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.15);
  }

  // Play error sound
  playErrorSound() {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.value = 200;
    oscillator.type = 'sawtooth';
    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.2);
  }

  // Check browser support
  static checkSupport() {
    const hasSpeechRecognition = 'SpeechRecognition' in window ||
                                 'webkitSpeechRecognition' in window;
    const hasSpeechSynthesis = 'speechSynthesis' in window;

    return {
      recognition: hasSpeechRecognition,
      synthesis: hasSpeechSynthesis,
      full: hasSpeechRecognition && hasSpeechSynthesis
    };
  }
}

// Voice UI Controller
export class VoiceUIController {
  constructor(containerElement) {
    this.container = containerElement;
    this.assistant = null;
    this.isEnabled = false;

    // UI elements
    this.voiceButton = null;
    this.indicator = null;
    this.transcript = null;

    // Check support
    const support = VoiceAssistant.checkSupport();
    if (support.full) {
      this.initialize();
    } else {
      console.warn('Voice features not fully supported:', support);
    }
  }

  initialize() {
    // Create UI
    this.createUI();

    // Initialize voice assistant
    this.assistant = new VoiceAssistant({
      lang: 'zh-CN',
      continuous: false,
      onResult: (result) => this.handleResult(result),
      onStart: () => this.handleStart(),
      onEnd: () => this.handleEnd(),
      onError: (error) => this.handleError(error)
    });
  }

  createUI() {
    // Create voice button
    this.voiceButton = document.createElement('button');
    this.voiceButton.className = 'voice-button';
    this.voiceButton.innerHTML = `
      <svg class="voice-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    `;
    this.voiceButton.title = '语音输入 (按住说话)';

    // Create indicator
    this.indicator = document.createElement('div');
    this.indicator.className = 'voice-indicator';
    this.indicator.style.display = 'none';
    this.indicator.innerHTML = `
      <div class="voice-wave">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="voice-text">正在听...</div>
    `;

    // Create transcript display
    this.transcript = document.createElement('div');
    this.transcript.className = 'voice-transcript';
    this.transcript.style.display = 'none';

    // Add styles
    this.addStyles();

    // Add to container
    this.container.appendChild(this.voiceButton);
    this.container.appendChild(this.indicator);
    this.container.appendChild(this.transcript);

    // Setup event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Push-to-talk functionality
    this.voiceButton.addEventListener('mousedown', () => {
      this.startRecording();
    });

    this.voiceButton.addEventListener('mouseup', () => {
      this.stopRecording();
    });

    this.voiceButton.addEventListener('mouseleave', () => {
      if (this.assistant?.isListening) {
        this.stopRecording();
      }
    });

    // Touch events for mobile
    this.voiceButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.startRecording();
    });

    this.voiceButton.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.stopRecording();
    });

    // Keyboard shortcut (Space key)
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.ctrlKey && !e.repeat) {
        e.preventDefault();
        this.startRecording();
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && e.ctrlKey) {
        e.preventDefault();
        this.stopRecording();
      }
    });
  }

  startRecording() {
    if (this.assistant) {
      this.assistant.startListening();
    }
  }

  stopRecording() {
    if (this.assistant) {
      this.assistant.stopListening();
    }
  }

  handleStart() {
    this.voiceButton.classList.add('recording');
    this.indicator.style.display = 'flex';
    this.transcript.style.display = 'block';
    this.transcript.textContent = '';
  }

  handleEnd() {
    this.voiceButton.classList.remove('recording');
    this.indicator.style.display = 'none';

    // Hide transcript after delay
    setTimeout(() => {
      this.transcript.style.display = 'none';
    }, 2000);
  }

  handleResult(result) {
    this.transcript.textContent = result.transcript;

    if (result.isFinal) {
      // Dispatch event with final transcript
      const event = new CustomEvent('voiceInput', {
        detail: {
          text: result.transcript,
          confidence: result.confidence
        }
      });
      window.dispatchEvent(event);

      // Visual feedback
      this.transcript.classList.add('final');
      setTimeout(() => {
        this.transcript.classList.remove('final');
      }, 500);
    }
  }

  handleError(error) {
    console.error('Voice error:', error);
    this.voiceButton.classList.add('error');
    setTimeout(() => {
      this.voiceButton.classList.remove('error');
    }, 1000);
  }

  // Speak text using TTS
  async speak(text) {
    if (this.assistant) {
      return this.assistant.speak(text);
    }
  }

  // Add CSS styles
  addStyles() {
    if (document.querySelector('#voice-assistant-styles')) return;

    const styles = `
      .voice-button {
        position: relative;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--color-bg-secondary);
        border: 2px solid var(--color-border);
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .voice-button:hover {
        background: var(--color-bg-tertiary);
        border-color: var(--color-accent);
        transform: scale(1.05);
      }

      .voice-button.recording {
        background: var(--color-accent);
        border-color: var(--color-accent);
        animation: pulse-record 1.5s infinite;
      }

      .voice-button.recording .voice-icon {
        stroke: white;
      }

      .voice-button.error {
        background: #FEE2E2;
        border-color: #EF4444;
        animation: shake 0.5s;
      }

      @keyframes pulse-record {
        0% {
          box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4);
        }
        50% {
          box-shadow: 0 0 0 10px rgba(79, 70, 229, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(79, 70, 229, 0);
        }
      }

      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
      }

      .voice-indicator {
        position: absolute;
        bottom: 60px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--color-bg-primary);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        padding: 1rem;
        box-shadow: var(--shadow-lg);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        z-index: 1000;
      }

      .voice-wave {
        display: flex;
        gap: 3px;
        height: 30px;
        align-items: center;
      }

      .voice-wave span {
        width: 4px;
        height: 100%;
        background: var(--color-accent);
        border-radius: 2px;
        animation: wave 1s ease-in-out infinite;
      }

      .voice-wave span:nth-child(2) { animation-delay: 0.1s; }
      .voice-wave span:nth-child(3) { animation-delay: 0.2s; }
      .voice-wave span:nth-child(4) { animation-delay: 0.3s; }
      .voice-wave span:nth-child(5) { animation-delay: 0.4s; }

      @keyframes wave {
        0%, 100% {
          transform: scaleY(0.3);
        }
        50% {
          transform: scaleY(1);
        }
      }

      .voice-transcript {
        position: absolute;
        bottom: 110px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--color-bg-primary);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 0.75rem 1rem;
        max-width: 300px;
        box-shadow: var(--shadow-md);
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        transition: all 0.3s ease;
        z-index: 999;
      }

      .voice-transcript.final {
        background: var(--color-accent);
        color: white;
        transform: translateX(-50%) scale(1.05);
      }

      .voice-text {
        font-size: 0.875rem;
        color: var(--color-text-secondary);
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.id = 'voice-assistant-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }
}

// Export default voice assistant instance
export const voiceUI = {
  create: (container) => new VoiceUIController(container),
  checkSupport: VoiceAssistant.checkSupport
};