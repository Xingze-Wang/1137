// Semantic Search Module - Advanced search with AI embeddings

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0';

export class SemanticSearch {
  constructor(options = {}) {
    this.embedder = null;
    this.searchIndex = new Map();
    this.documents = [];
    this.maxResults = options.maxResults || 10;
    this.minScore = options.minScore || 0.5;

    // Search modes
    this.searchModes = {
      SEMANTIC: 'semantic',
      KEYWORD: 'keyword',
      HYBRID: 'hybrid',
      FUZZY: 'fuzzy',
      REGEX: 'regex'
    };

    this.currentMode = options.mode || this.searchModes.HYBRID;

    // Initialize
    this.initialize();
  }

  async initialize() {
    try {
      // Initialize embedding model for semantic search
      env.remoteURL = 'https://huggingface.co/';
      env.allowRemoteModels = true;

      this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

      console.log('Semantic Search initialized');
    } catch (error) {
      console.error('Failed to initialize Semantic Search:', error);
    }
  }

  // Index documents for searching
  async indexDocuments(documents) {
    console.log(`Indexing ${documents.length} documents...`);

    for (const doc of documents) {
      await this.indexDocument(doc);
    }

    console.log('Indexing complete');
  }

  async indexDocument(doc) {
    const id = doc.id || this.generateId();

    // Extract searchable content
    const content = this.extractContent(doc);

    // Generate embeddings for semantic search
    const embedding = await this.generateEmbedding(content);

    // Create search index entry
    const indexEntry = {
      id,
      content,
      embedding,
      keywords: this.extractKeywords(content),
      metadata: doc.metadata || {},
      timestamp: doc.timestamp || Date.now(),
      type: doc.type || 'message'
    };

    // Store in index
    this.searchIndex.set(id, indexEntry);
    this.documents.push(doc);

    // Update inverted index for keyword search
    this.updateInvertedIndex(indexEntry);
  }

  // Perform search
  async search(query, options = {}) {
    const {
      mode = this.currentMode,
      limit = this.maxResults,
      filters = {},
      boost = {}
    } = options;

    let results = [];

    switch (mode) {
      case this.searchModes.SEMANTIC:
        results = await this.semanticSearch(query, limit);
        break;

      case this.searchModes.KEYWORD:
        results = this.keywordSearch(query, limit);
        break;

      case this.searchModes.HYBRID:
        results = await this.hybridSearch(query, limit);
        break;

      case this.searchModes.FUZZY:
        results = this.fuzzySearch(query, limit);
        break;

      case this.searchModes.REGEX:
        results = this.regexSearch(query, limit);
        break;
    }

    // Apply filters
    if (Object.keys(filters).length > 0) {
      results = this.applyFilters(results, filters);
    }

    // Apply boosting
    if (Object.keys(boost).length > 0) {
      results = this.applyBoost(results, boost);
    }

    // Re-rank results
    results = this.rerankResults(results, query);

    return results.slice(0, limit);
  }

  // Semantic search using embeddings
  async semanticSearch(query, limit) {
    if (!this.embedder) {
      console.warn('Embedder not initialized, falling back to keyword search');
      return this.keywordSearch(query, limit);
    }

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Calculate similarities
    const results = [];

    for (const [id, entry] of this.searchIndex) {
      const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);

      if (similarity >= this.minScore) {
        results.push({
          id,
          content: entry.content,
          score: similarity,
          type: 'semantic',
          metadata: entry.metadata
        });
      }
    }

    // Sort by similarity
    return results.sort((a, b) => b.score - a.score);
  }

  // Keyword-based search
  keywordSearch(query, limit) {
    const queryTerms = this.tokenize(query.toLowerCase());
    const results = [];

    for (const [id, entry] of this.searchIndex) {
      let score = 0;
      const contentLower = entry.content.toLowerCase();

      // Exact match bonus
      if (contentLower.includes(query.toLowerCase())) {
        score += 2;
      }

      // Term matching
      for (const term of queryTerms) {
        if (contentLower.includes(term)) {
          score += 1;
        }

        // Keyword matching
        if (entry.keywords.includes(term)) {
          score += 1.5;
        }
      }

      if (score > 0) {
        results.push({
          id,
          content: entry.content,
          score: score / (queryTerms.length + 1),
          type: 'keyword',
          metadata: entry.metadata
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  // Hybrid search combining semantic and keyword
  async hybridSearch(query, limit) {
    const [semanticResults, keywordResults] = await Promise.all([
      this.semanticSearch(query, limit * 2),
      this.keywordSearch(query, limit * 2)
    ]);

    // Combine and normalize scores
    const combined = new Map();

    for (const result of semanticResults) {
      combined.set(result.id, {
        ...result,
        semanticScore: result.score,
        keywordScore: 0,
        score: result.score * 0.6 // Weight for semantic
      });
    }

    for (const result of keywordResults) {
      if (combined.has(result.id)) {
        const existing = combined.get(result.id);
        existing.keywordScore = result.score;
        existing.score = existing.semanticScore * 0.6 + result.score * 0.4;
        existing.type = 'hybrid';
      } else {
        combined.set(result.id, {
          ...result,
          semanticScore: 0,
          keywordScore: result.score,
          score: result.score * 0.4 // Weight for keyword
        });
      }
    }

    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score);
  }

  // Fuzzy search for typo tolerance
  fuzzySearch(query, limit) {
    const results = [];

    for (const [id, entry] of this.searchIndex) {
      const distance = this.levenshteinDistance(
        query.toLowerCase(),
        entry.content.toLowerCase()
      );

      // Calculate fuzzy score
      const maxLen = Math.max(query.length, entry.content.length);
      const score = 1 - (distance / maxLen);

      if (score >= this.minScore) {
        results.push({
          id,
          content: entry.content,
          score,
          type: 'fuzzy',
          metadata: entry.metadata,
          distance
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // Regex search for pattern matching
  regexSearch(pattern, limit) {
    const results = [];

    try {
      const regex = new RegExp(pattern, 'gi');

      for (const [id, entry] of this.searchIndex) {
        const matches = entry.content.match(regex);

        if (matches) {
          results.push({
            id,
            content: entry.content,
            score: matches.length / entry.content.length,
            type: 'regex',
            metadata: entry.metadata,
            matches
          });
        }
      }
    } catch (error) {
      console.error('Invalid regex pattern:', error);
      return [];
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // Apply filters to results
  applyFilters(results, filters) {
    return results.filter(result => {
      for (const [key, value] of Object.entries(filters)) {
        if (key === 'type' && result.metadata.type !== value) return false;
        if (key === 'date') {
          const resultDate = new Date(result.metadata.timestamp);
          const filterDate = new Date(value);
          if (resultDate < filterDate) return false;
        }
        if (key === 'author' && result.metadata.author !== value) return false;
      }
      return true;
    });
  }

  // Apply score boosting
  applyBoost(results, boost) {
    return results.map(result => {
      let boostedScore = result.score;

      for (const [field, multiplier] of Object.entries(boost)) {
        if (field === 'recent') {
          const age = Date.now() - result.metadata.timestamp;
          const recencyBoost = Math.exp(-age / (7 * 24 * 60 * 60 * 1000)); // Decay over 7 days
          boostedScore *= (1 + recencyBoost * multiplier);
        }

        if (field === 'type' && result.metadata.type) {
          if (boost[field][result.metadata.type]) {
            boostedScore *= boost[field][result.metadata.type];
          }
        }
      }

      return { ...result, score: boostedScore };
    });
  }

  // Re-rank results based on additional factors
  rerankResults(results, query) {
    const queryLength = query.length;

    return results.map(result => {
      let adjustedScore = result.score;

      // Length penalty - prefer shorter, more relevant results
      const lengthRatio = queryLength / result.content.length;
      adjustedScore *= (1 + lengthRatio * 0.1);

      // Position bonus - earlier matches get higher scores
      const position = result.content.toLowerCase().indexOf(query.toLowerCase());
      if (position >= 0) {
        adjustedScore *= (1 + (1 - position / result.content.length) * 0.2);
      }

      return { ...result, score: adjustedScore };
    }).sort((a, b) => b.score - a.score);
  }

  // Highlight search terms in results
  highlightResults(results, query) {
    const terms = this.tokenize(query);

    return results.map(result => {
      let highlighted = result.content;

      // Highlight each term
      for (const term of terms) {
        const regex = new RegExp(`(${term})`, 'gi');
        highlighted = highlighted.replace(regex, '<mark>$1</mark>');
      }

      return {
        ...result,
        highlighted
      };
    });
  }

  // Generate suggestions for autocomplete
  async generateSuggestions(prefix, limit = 5) {
    const suggestions = new Set();

    // Check all indexed content
    for (const [id, entry] of this.searchIndex) {
      const words = this.tokenize(entry.content);

      for (const word of words) {
        if (word.startsWith(prefix.toLowerCase()) && word.length > prefix.length) {
          suggestions.add(word);

          if (suggestions.size >= limit * 2) break;
        }
      }
    }

    // Score suggestions by frequency
    const suggestionScores = {};
    for (const suggestion of suggestions) {
      let frequency = 0;

      for (const [id, entry] of this.searchIndex) {
        if (entry.content.toLowerCase().includes(suggestion)) {
          frequency++;
        }
      }

      suggestionScores[suggestion] = frequency;
    }

    // Sort by frequency and return top suggestions
    return Object.entries(suggestionScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([suggestion]) => suggestion);
  }

  // Extract searchable content from document
  extractContent(doc) {
    if (typeof doc === 'string') return doc;

    const contentParts = [];

    if (doc.title) contentParts.push(doc.title);
    if (doc.content) contentParts.push(doc.content);
    if (doc.text) contentParts.push(doc.text);
    if (doc.description) contentParts.push(doc.description);
    if (doc.tags) contentParts.push(doc.tags.join(' '));

    return contentParts.join(' ');
  }

  // Extract keywords from text
  extractKeywords(text) {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be'
    ]);

    const words = this.tokenize(text.toLowerCase())
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Count frequency
    const frequency = {};
    for (const word of words) {
      frequency[word] = (frequency[word] || 0) + 1;
    }

    // Return top keywords
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  // Update inverted index for faster keyword search
  updateInvertedIndex(entry) {
    if (!this.invertedIndex) {
      this.invertedIndex = new Map();
    }

    const terms = [...this.tokenize(entry.content), ...entry.keywords];

    for (const term of terms) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Set());
      }
      this.invertedIndex.get(term).add(entry.id);
    }
  }

  // Tokenize text into words
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);
  }

  // Generate embedding for text
  async generateEmbedding(text) {
    if (!this.embedder) return new Array(384).fill(0);

    const output = await this.embedder(text, {
      pooling: 'mean',
      normalize: true
    });

    return Array.from(output.data);
  }

  // Calculate cosine similarity between vectors
  cosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  // Calculate Levenshtein distance for fuzzy matching
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // Substitution
            matrix[i][j - 1] + 1,     // Insertion
            matrix[i - 1][j] + 1      // Deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  // Generate unique ID
  generateId() {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Clear search index
  clearIndex() {
    this.searchIndex.clear();
    this.documents = [];
    this.invertedIndex = new Map();
  }

  // Get search statistics
  getStatistics() {
    return {
      totalDocuments: this.searchIndex.size,
      indexSize: this.calculateIndexSize(),
      vocabularySize: this.invertedIndex ? this.invertedIndex.size : 0,
      averageDocumentLength: this.calculateAverageLength()
    };
  }

  calculateIndexSize() {
    let size = 0;

    for (const [id, entry] of this.searchIndex) {
      size += entry.content.length;
      size += entry.embedding.length * 4; // Approximate bytes for float32
    }

    return size;
  }

  calculateAverageLength() {
    if (this.searchIndex.size === 0) return 0;

    let totalLength = 0;
    for (const [id, entry] of this.searchIndex) {
      totalLength += entry.content.length;
    }

    return Math.round(totalLength / this.searchIndex.size);
  }
}

// Search UI Component
export class SearchUI {
  constructor(container, searchEngine) {
    this.container = container;
    this.searchEngine = searchEngine;
    this.currentResults = [];

    this.createUI();
    this.setupEventListeners();
  }

  createUI() {
    this.container.innerHTML = `
      <div class="search-container">
        <div class="search-bar">
          <input type="text"
                 class="search-input"
                 placeholder="Search conversations, messages, files..."
                 autocomplete="off">
          <div class="search-mode-selector">
            <select class="search-mode">
              <option value="hybrid">Smart Search</option>
              <option value="semantic">Semantic</option>
              <option value="keyword">Keyword</option>
              <option value="fuzzy">Fuzzy</option>
              <option value="regex">Regex</option>
            </select>
          </div>
          <button class="search-button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
          </button>
        </div>
        <div class="search-suggestions"></div>
        <div class="search-filters">
          <button class="filter-chip" data-filter="type:message">Messages</button>
          <button class="filter-chip" data-filter="type:file">Files</button>
          <button class="filter-chip" data-filter="date:week">Past Week</button>
          <button class="filter-chip" data-filter="date:month">Past Month</button>
        </div>
        <div class="search-results"></div>
        <div class="search-status"></div>
      </div>
    `;

    this.elements = {
      input: this.container.querySelector('.search-input'),
      modeSelector: this.container.querySelector('.search-mode'),
      searchButton: this.container.querySelector('.search-button'),
      suggestions: this.container.querySelector('.search-suggestions'),
      results: this.container.querySelector('.search-results'),
      status: this.container.querySelector('.search-status'),
      filters: this.container.querySelectorAll('.filter-chip')
    };
  }

  setupEventListeners() {
    // Search on input
    let searchTimeout;
    this.elements.input.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value;

      if (query.length > 2) {
        searchTimeout = setTimeout(() => {
          this.performSearch(query);
          this.showSuggestions(query);
        }, 300);
      } else {
        this.clearResults();
      }
    });

    // Search on button click
    this.elements.searchButton.addEventListener('click', () => {
      this.performSearch(this.elements.input.value);
    });

    // Search on Enter
    this.elements.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.performSearch(this.elements.input.value);
      }
    });

    // Mode change
    this.elements.modeSelector.addEventListener('change', () => {
      if (this.elements.input.value) {
        this.performSearch(this.elements.input.value);
      }
    });

    // Filter clicks
    this.elements.filters.forEach(filter => {
      filter.addEventListener('click', () => {
        filter.classList.toggle('active');
        if (this.elements.input.value) {
          this.performSearch(this.elements.input.value);
        }
      });
    });
  }

  async performSearch(query) {
    if (!query) return;

    // Show loading
    this.elements.status.innerHTML = '<div class="loading">Searching...</div>';

    // Get active filters
    const filters = this.getActiveFilters();

    // Perform search
    const results = await this.searchEngine.search(query, {
      mode: this.elements.modeSelector.value,
      filters
    });

    this.currentResults = results;
    this.renderResults(results);

    // Update status
    this.elements.status.innerHTML = `Found ${results.length} results`;
  }

  renderResults(results) {
    if (results.length === 0) {
      this.elements.results.innerHTML = `
        <div class="no-results">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
          <p>No results found</p>
        </div>
      `;
      return;
    }

    // Highlight results
    const highlighted = this.searchEngine.highlightResults(
      results,
      this.elements.input.value
    );

    this.elements.results.innerHTML = highlighted.map(result => `
      <div class="search-result" data-id="${result.id}">
        <div class="result-header">
          <span class="result-type">${result.type}</span>
          <span class="result-score">${(result.score * 100).toFixed(0)}%</span>
        </div>
        <div class="result-content">${result.highlighted}</div>
        <div class="result-metadata">
          ${result.metadata.timestamp ?
            `<span>${new Date(result.metadata.timestamp).toLocaleDateString()}</span>` : ''}
          ${result.metadata.author ?
            `<span>By ${result.metadata.author}</span>` : ''}
        </div>
      </div>
    `).join('');

    // Add click handlers
    this.elements.results.querySelectorAll('.search-result').forEach(result => {
      result.addEventListener('click', () => {
        this.handleResultClick(result.dataset.id);
      });
    });
  }

  async showSuggestions(query) {
    const suggestions = await this.searchEngine.generateSuggestions(query);

    if (suggestions.length > 0) {
      this.elements.suggestions.innerHTML = suggestions.map(suggestion => `
        <div class="suggestion-item">${suggestion}</div>
      `).join('');

      this.elements.suggestions.style.display = 'block';

      // Add click handlers
      this.elements.suggestions.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          this.elements.input.value = item.textContent;
          this.performSearch(item.textContent);
          this.elements.suggestions.style.display = 'none';
        });
      });
    } else {
      this.elements.suggestions.style.display = 'none';
    }
  }

  getActiveFilters() {
    const filters = {};

    this.elements.filters.forEach(filter => {
      if (filter.classList.contains('active')) {
        const [key, value] = filter.dataset.filter.split(':');
        filters[key] = value;
      }
    });

    return filters;
  }

  handleResultClick(resultId) {
    const result = this.currentResults.find(r => r.id === resultId);
    if (result) {
      // Dispatch custom event
      const event = new CustomEvent('searchResultClick', {
        detail: result
      });
      window.dispatchEvent(event);
    }
  }

  clearResults() {
    this.elements.results.innerHTML = '';
    this.elements.suggestions.style.display = 'none';
    this.elements.status.innerHTML = '';
  }
}

// Export singleton instance
export const semanticSearch = new SemanticSearch();