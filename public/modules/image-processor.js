// Image Processor Module - Multi-modal input for images

export class ImageProcessor {
  constructor(options = {}) {
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.acceptedFormats = options.acceptedFormats || [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml'
    ];

    // Callbacks
    this.onImageLoad = options.onImageLoad || (() => {});
    this.onImageError = options.onImageError || (() => {});
    this.onImageProcess = options.onImageProcess || (() => {});

    // Image analysis models
    this.visionModel = null;
    this.ocrModel = null;

    // Canvas for image manipulation
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');

    // Initialize
    this.initialize();
  }

  async initialize() {
    try {
      // Load TensorFlow.js for image analysis
      await this.loadTensorFlow();

      // Load OCR model
      await this.loadOCR();

      console.log('Image Processor initialized');
    } catch (error) {
      console.error('Failed to initialize Image Processor:', error);
    }
  }

  async loadTensorFlow() {
    // Dynamically load TensorFlow.js
    if (!window.tf) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.11.0/dist/tf.min.js';

      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    // Load MobileNet for image classification
    const modelScript = document.createElement('script');
    modelScript.src = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.0/dist/mobilenet.min.js';

    await new Promise((resolve, reject) => {
      modelScript.onload = resolve;
      modelScript.onerror = reject;
      document.head.appendChild(modelScript);
    });

    // Initialize vision model
    if (window.mobilenet) {
      this.visionModel = await window.mobilenet.load();
    }
  }

  async loadOCR() {
    // Load Tesseract.js for OCR
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4.1.1/dist/tesseract.min.js';

    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    if (window.Tesseract) {
      this.ocrModel = window.Tesseract;
    }
  }

  // Process uploaded image
  async processImage(file, options = {}) {
    const {
      analyze = true,
      ocr = false,
      resize = true,
      maxWidth = 1920,
      maxHeight = 1080
    } = options;

    try {
      // Validate file
      this.validateFile(file);

      // Read file
      const imageData = await this.readFile(file);

      // Load image
      const image = await this.loadImage(imageData);

      // Resize if needed
      let processedImage = image;
      if (resize) {
        processedImage = await this.resizeImage(image, maxWidth, maxHeight);
      }

      // Create result object
      const result = {
        original: {
          name: file.name,
          size: file.size,
          type: file.type,
          width: image.width,
          height: image.height
        },
        processed: {
          dataURL: processedImage.dataURL,
          width: processedImage.width,
          height: processedImage.height
        },
        metadata: await this.extractMetadata(file),
        analysis: null,
        text: null
      };

      // Analyze image content
      if (analyze && this.visionModel) {
        result.analysis = await this.analyzeImage(processedImage.element);
      }

      // Extract text from image
      if (ocr && this.ocrModel) {
        result.text = await this.extractText(processedImage.dataURL);
      }

      // Generate thumbnail
      result.thumbnail = await this.generateThumbnail(processedImage.element);

      this.onImageProcess(result);
      return result;

    } catch (error) {
      console.error('Image processing failed:', error);
      this.onImageError(error);
      throw error;
    }
  }

  validateFile(file) {
    if (!file) {
      throw new Error('No file provided');
    }

    if (!this.acceptedFormats.includes(file.type)) {
      throw new Error(`Invalid file type: ${file.type}`);
    }

    if (file.size > this.maxFileSize) {
      throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    }
  }

  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;

      reader.readAsDataURL(file);
    });
  }

  loadImage(dataURL) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        this.onImageLoad(img);
        resolve({
          element: img,
          width: img.width,
          height: img.height,
          dataURL
        });
      };

      img.onerror = reject;
      img.src = dataURL;
    });
  }

  async resizeImage(image, maxWidth, maxHeight) {
    const { element, width, height } = image;

    // Calculate new dimensions
    let newWidth = width;
    let newHeight = height;

    if (width > maxWidth || height > maxHeight) {
      const aspectRatio = width / height;

      if (width > height) {
        newWidth = Math.min(width, maxWidth);
        newHeight = newWidth / aspectRatio;
      } else {
        newHeight = Math.min(height, maxHeight);
        newWidth = newHeight * aspectRatio;
      }
    }

    // Resize on canvas
    this.canvas.width = newWidth;
    this.canvas.height = newHeight;
    this.ctx.drawImage(element, 0, 0, newWidth, newHeight);

    const dataURL = this.canvas.toDataURL('image/jpeg', 0.9);

    return {
      element,
      width: newWidth,
      height: newHeight,
      dataURL
    };
  }

  async analyzeImage(imageElement) {
    if (!this.visionModel) {
      return null;
    }

    try {
      // Get predictions from MobileNet
      const predictions = await this.visionModel.classify(imageElement);

      // Process predictions
      const analysis = {
        classifications: predictions.map(p => ({
          label: p.className,
          confidence: p.probability
        })),
        primaryLabel: predictions[0]?.className || 'Unknown',
        confidence: predictions[0]?.probability || 0,
        tags: predictions
          .filter(p => p.probability > 0.1)
          .map(p => p.className.split(',')[0].trim().toLowerCase())
      };

      // Detect colors
      analysis.colors = await this.detectColors(imageElement);

      // Detect faces (if face detection model is available)
      analysis.faces = await this.detectFaces(imageElement);

      return analysis;
    } catch (error) {
      console.error('Image analysis failed:', error);
      return null;
    }
  }

  async detectColors(imageElement) {
    // Sample image and extract dominant colors
    const width = 100; // Sample size
    const height = 100;

    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.drawImage(imageElement, 0, 0, width, height);

    const imageData = this.ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    // Color frequency map
    const colorMap = {};

    for (let i = 0; i < pixels.length; i += 4) {
      const r = Math.round(pixels[i] / 10) * 10;
      const g = Math.round(pixels[i + 1] / 10) * 10;
      const b = Math.round(pixels[i + 2] / 10) * 10;
      const rgb = `${r},${g},${b}`;

      colorMap[rgb] = (colorMap[rgb] || 0) + 1;
    }

    // Sort by frequency and get top colors
    const sortedColors = Object.entries(colorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([color, count]) => {
        const [r, g, b] = color.split(',').map(Number);
        return {
          rgb: `rgb(${r}, ${g}, ${b})`,
          hex: this.rgbToHex(r, g, b),
          frequency: count / (width * height)
        };
      });

    return sortedColors;
  }

  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  async detectFaces(imageElement) {
    // Placeholder for face detection
    // In production, use face-api.js or similar
    return [];
  }

  async extractText(dataURL) {
    if (!this.ocrModel) {
      return null;
    }

    try {
      const worker = await this.ocrModel.createWorker();

      await worker.loadLanguage('eng+chi_sim');
      await worker.initialize('eng+chi_sim');

      const { data } = await worker.recognize(dataURL);

      await worker.terminate();

      return {
        text: data.text,
        confidence: data.confidence,
        lines: data.lines?.map(line => ({
          text: line.text,
          confidence: line.confidence,
          bbox: line.bbox
        }))
      };
    } catch (error) {
      console.error('OCR failed:', error);
      return null;
    }
  }

  async extractMetadata(file) {
    const metadata = {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: new Date(file.lastModified).toISOString()
    };

    // Extract EXIF data for JPEG images
    if (file.type === 'image/jpeg') {
      metadata.exif = await this.extractEXIF(file);
    }

    return metadata;
  }

  async extractEXIF(file) {
    // Simplified EXIF extraction
    // In production, use exif-js or similar library
    return null;
  }

  async generateThumbnail(imageElement, size = 200) {
    const aspectRatio = imageElement.width / imageElement.height;
    let width = size;
    let height = size;

    if (aspectRatio > 1) {
      height = size / aspectRatio;
    } else {
      width = size * aspectRatio;
    }

    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.drawImage(imageElement, 0, 0, width, height);

    return this.canvas.toDataURL('image/jpeg', 0.7);
  }

  // Create image comparison tool
  createComparison(image1, image2) {
    const container = document.createElement('div');
    container.className = 'image-comparison';
    container.innerHTML = `
      <div class="comparison-slider">
        <div class="comparison-before">
          <img src="${image1}" alt="Before">
        </div>
        <div class="comparison-after">
          <img src="${image2}" alt="After">
        </div>
        <div class="comparison-handle">
          <div class="handle-bar"></div>
        </div>
      </div>
    `;

    this.setupComparisonInteraction(container);
    return container;
  }

  setupComparisonInteraction(container) {
    const slider = container.querySelector('.comparison-slider');
    const handle = container.querySelector('.comparison-handle');
    const after = container.querySelector('.comparison-after');

    let isDragging = false;

    const updatePosition = (x) => {
      const rect = slider.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (x - rect.left) / rect.width));

      handle.style.left = `${position * 100}%`;
      after.style.clipPath = `inset(0 ${(1 - position) * 100}% 0 0)`;
    };

    handle.addEventListener('mousedown', () => {
      isDragging = true;
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        updatePosition(e.clientX);
      }
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Touch support
    handle.addEventListener('touchstart', () => {
      isDragging = true;
    });

    document.addEventListener('touchmove', (e) => {
      if (isDragging) {
        updatePosition(e.touches[0].clientX);
      }
    });

    document.addEventListener('touchend', () => {
      isDragging = false;
    });
  }

  // Create image gallery
  createGallery(images) {
    const gallery = document.createElement('div');
    gallery.className = 'image-gallery';
    gallery.innerHTML = `
      <div class="gallery-main">
        <img src="${images[0]}" alt="Main image">
        <div class="gallery-nav">
          <button class="gallery-prev">‹</button>
          <button class="gallery-next">›</button>
        </div>
      </div>
      <div class="gallery-thumbnails">
        ${images.map((img, i) => `
          <img src="${img}" alt="Thumbnail ${i + 1}" class="${i === 0 ? 'active' : ''}" data-index="${i}">
        `).join('')}
      </div>
    `;

    this.setupGalleryInteraction(gallery, images);
    return gallery;
  }

  setupGalleryInteraction(gallery, images) {
    const mainImage = gallery.querySelector('.gallery-main img');
    const thumbnails = gallery.querySelectorAll('.gallery-thumbnails img');
    const prevBtn = gallery.querySelector('.gallery-prev');
    const nextBtn = gallery.querySelector('.gallery-next');

    let currentIndex = 0;

    const updateGallery = (index) => {
      currentIndex = index;
      mainImage.src = images[index];

      thumbnails.forEach((thumb, i) => {
        thumb.classList.toggle('active', i === index);
      });
    };

    thumbnails.forEach((thumb, i) => {
      thumb.addEventListener('click', () => updateGallery(i));
    });

    prevBtn.addEventListener('click', () => {
      updateGallery((currentIndex - 1 + images.length) % images.length);
    });

    nextBtn.addEventListener('click', () => {
      updateGallery((currentIndex + 1) % images.length);
    });
  }

  // Create image editor
  createEditor(imageURL) {
    const editor = document.createElement('div');
    editor.className = 'image-editor';
    editor.innerHTML = `
      <div class="editor-canvas-container">
        <canvas class="editor-canvas"></canvas>
      </div>
      <div class="editor-tools">
        <div class="tool-group">
          <label>Brightness</label>
          <input type="range" class="brightness-slider" min="-100" max="100" value="0">
        </div>
        <div class="tool-group">
          <label>Contrast</label>
          <input type="range" class="contrast-slider" min="-100" max="100" value="0">
        </div>
        <div class="tool-group">
          <label>Saturation</label>
          <input type="range" class="saturation-slider" min="-100" max="100" value="0">
        </div>
        <div class="tool-group">
          <button class="crop-btn">Crop</button>
          <button class="rotate-btn">Rotate</button>
          <button class="flip-btn">Flip</button>
        </div>
        <div class="tool-group">
          <button class="reset-btn">Reset</button>
          <button class="save-btn">Save</button>
        </div>
      </div>
    `;

    this.setupEditor(editor, imageURL);
    return editor;
  }

  setupEditor(editor, imageURL) {
    const canvas = editor.querySelector('.editor-canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    let originalImageData = null;
    let currentFilters = {
      brightness: 0,
      contrast: 0,
      saturation: 0
    };

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    };

    img.src = imageURL;

    // Brightness control
    editor.querySelector('.brightness-slider').addEventListener('input', (e) => {
      currentFilters.brightness = parseInt(e.target.value);
      applyFilters();
    });

    // Contrast control
    editor.querySelector('.contrast-slider').addEventListener('input', (e) => {
      currentFilters.contrast = parseInt(e.target.value);
      applyFilters();
    });

    // Saturation control
    editor.querySelector('.saturation-slider').addEventListener('input', (e) => {
      currentFilters.saturation = parseInt(e.target.value);
      applyFilters();
    });

    const applyFilters = () => {
      if (!originalImageData) return;

      const imageData = new ImageData(
        new Uint8ClampedArray(originalImageData.data),
        originalImageData.width,
        originalImageData.height
      );

      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        // Apply brightness
        data[i] += currentFilters.brightness;
        data[i + 1] += currentFilters.brightness;
        data[i + 2] += currentFilters.brightness;

        // Apply contrast
        const factor = (259 * (currentFilters.contrast + 255)) / (255 * (259 - currentFilters.contrast));
        data[i] = factor * (data[i] - 128) + 128;
        data[i + 1] = factor * (data[i + 1] - 128) + 128;
        data[i + 2] = factor * (data[i + 2] - 128) + 128;

        // Apply saturation
        const gray = 0.2989 * data[i] + 0.5870 * data[i + 1] + 0.1140 * data[i + 2];
        data[i] += (data[i] - gray) * currentFilters.saturation / 100;
        data[i + 1] += (data[i + 1] - gray) * currentFilters.saturation / 100;
        data[i + 2] += (data[i + 2] - gray) * currentFilters.saturation / 100;
      }

      ctx.putImageData(imageData, 0, 0);
    };

    // Rotate button
    editor.querySelector('.rotate-btn').addEventListener('click', () => {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');

      tempCanvas.width = canvas.height;
      tempCanvas.height = canvas.width;

      tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
      tempCtx.rotate(90 * Math.PI / 180);
      tempCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

      canvas.width = tempCanvas.width;
      canvas.height = tempCanvas.height;
      ctx.drawImage(tempCanvas, 0, 0);

      originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    });

    // Flip button
    editor.querySelector('.flip-btn').addEventListener('click', () => {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(canvas, -canvas.width, 0);
      ctx.restore();

      originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    });

    // Reset button
    editor.querySelector('.reset-btn').addEventListener('click', () => {
      ctx.drawImage(img, 0, 0);
      originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      editor.querySelector('.brightness-slider').value = 0;
      editor.querySelector('.contrast-slider').value = 0;
      editor.querySelector('.saturation-slider').value = 0;

      currentFilters = {
        brightness: 0,
        contrast: 0,
        saturation: 0
      };
    });

    // Save button
    editor.querySelector('.save-btn').addEventListener('click', () => {
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'edited-image.jpg';
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/jpeg', 0.9);
    });
  }
}

// Export singleton instance
export const imageProcessor = new ImageProcessor();