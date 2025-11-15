// Memory Manager Module - Long-term memory with vector database integration

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0';

// Configure Transformers.js to use remote models
env.remoteURL = 'https://huggingface.co/';
env.allowRemoteModels = true;

export class MemoryManager {
  constructor(options = {}) {
    this.vectorStore = null;
    this.embedder = null;
    this.memories = new Map();
    this.maxMemories = options.maxMemories || 1000;
    this.similarityThreshold = options.similarityThreshold || 0.7;
    this.userId = options.userId || null;

    // Memory types
    this.memoryTypes = {
      CONVERSATION: 'conversation',
      FACT: 'fact',
      PREFERENCE: 'preference',
      CONTEXT: 'context',
      SKILL: 'skill',
      RELATIONSHIP: 'relationship'
    };

    // Initialize
    this.initialize();
  }

  async initialize() {
    try {
      // Initialize embedding model
      this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

      // Initialize vector store
      this.vectorStore = new VectorStore({
        dimensions: 384, // MiniLM output dimensions
        metric: 'cosine'
      });

      // Load existing memories from storage
      await this.loadMemories();

      console.log('Memory Manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Memory Manager:', error);
    }
  }

  // Create a new memory
  async createMemory(content, metadata = {}) {
    const memory = {
      id: this.generateId(),
      content,
      type: metadata.type || this.memoryTypes.CONVERSATION,
      timestamp: Date.now(),
      userId: this.userId,
      metadata: {
        ...metadata,
        importance: metadata.importance || this.calculateImportance(content),
        keywords: this.extractKeywords(content),
        entities: await this.extractEntities(content)
      }
    };

    // Generate embedding
    const embedding = await this.generateEmbedding(content);
    memory.embedding = embedding;

    // Store in vector database
    await this.vectorStore.add(memory.id, embedding, memory);

    // Store locally
    this.memories.set(memory.id, memory);

    // Persist to storage
    await this.saveMemory(memory);

    // Consolidate if needed
    if (this.memories.size > this.maxMemories) {
      await this.consolidateMemories();
    }

    return memory;
  }

  // Retrieve relevant memories
  async retrieve(query, options = {}) {
    const {
      limit = 5,
      type = null,
      minImportance = 0,
      timeRange = null
    } = options;

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Search vector store
    const results = await this.vectorStore.search(queryEmbedding, limit * 2);

    // Filter and rank results
    let memories = results
      .filter(result => result.similarity >= this.similarityThreshold)
      .map(result => result.data)
      .filter(memory => {
        // Type filter
        if (type && memory.type !== type) return false;

        // Importance filter
        if (memory.metadata.importance < minImportance) return false;

        // Time range filter
        if (timeRange) {
          const age = Date.now() - memory.timestamp;
          if (age > timeRange) return false;
        }

        return true;
      });

    // Re-rank based on multiple factors
    memories = this.rerankMemories(memories, query);

    return memories.slice(0, limit);
  }

  // Update existing memory
  async updateMemory(memoryId, updates) {
    const memory = this.memories.get(memoryId);
    if (!memory) return null;

    // Update memory
    Object.assign(memory, updates);
    memory.updatedAt = Date.now();

    // Regenerate embedding if content changed
    if (updates.content) {
      memory.embedding = await this.generateEmbedding(updates.content);
      await this.vectorStore.update(memoryId, memory.embedding);
    }

    // Save updates
    await this.saveMemory(memory);

    return memory;
  }

  // Delete memory
  async deleteMemory(memoryId) {
    const memory = this.memories.get(memoryId);
    if (!memory) return false;

    // Remove from vector store
    await this.vectorStore.delete(memoryId);

    // Remove from local storage
    this.memories.delete(memoryId);

    // Remove from persistent storage
    await this.removeFromStorage(memoryId);

    return true;
  }

  // Generate embedding for text
  async generateEmbedding(text) {
    if (!this.embedder) {
      throw new Error('Embedder not initialized');
    }

    const output = await this.embedder(text, {
      pooling: 'mean',
      normalize: true
    });

    return Array.from(output.data);
  }

  // Calculate importance score
  calculateImportance(content) {
    let score = 0;

    // Length factor
    const words = content.split(' ').length;
    if (words > 50) score += 0.2;

    // Question factor
    if (content.includes('?')) score += 0.1;

    // Personal information factor
    const personalKeywords = ['I', 'my', 'me', 'prefer', 'like', 'dislike', 'want'];
    personalKeywords.forEach(keyword => {
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        score += 0.1;
      }
    });

    // Technical content factor
    const technicalKeywords = ['function', 'code', 'algorithm', 'API', 'database'];
    technicalKeywords.forEach(keyword => {
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        score += 0.05;
      }
    });

    return Math.min(score, 1.0);
  }

  // Extract keywords from text
  extractKeywords(text) {
    // Simple keyword extraction (in production, use TF-IDF or similar)
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'could'
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));

    // Count word frequency
    const wordFreq = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // Sort by frequency and return top keywords
    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  // Extract entities from text
  async extractEntities(text) {
    // Simple entity extraction (in production, use NER model)
    const entities = {
      persons: [],
      locations: [],
      organizations: [],
      dates: [],
      technologies: []
    };

    // Person names (simple pattern)
    const personPattern = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
    const persons = text.match(personPattern) || [];
    entities.persons = [...new Set(persons)];

    // Technologies
    const techKeywords = [
      'JavaScript', 'Python', 'React', 'Node.js', 'MongoDB',
      'PostgreSQL', 'Docker', 'Kubernetes', 'AWS', 'Azure',
      'Machine Learning', 'AI', 'Neural Network', 'API'
    ];

    techKeywords.forEach(tech => {
      if (text.includes(tech)) {
        entities.technologies.push(tech);
      }
    });

    // Dates (simple pattern)
    const datePattern = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g;
    const dates = text.match(datePattern) || [];
    entities.dates = [...new Set(dates)];

    return entities;
  }

  // Re-rank memories based on multiple factors
  rerankMemories(memories, query) {
    const queryWords = new Set(query.toLowerCase().split(' '));

    return memories.map(memory => {
      let score = 0;

      // Keyword overlap
      const keywordOverlap = memory.metadata.keywords.filter(keyword =>
        queryWords.has(keyword.toLowerCase())
      ).length;
      score += keywordOverlap * 0.1;

      // Recency
      const age = Date.now() - memory.timestamp;
      const recencyScore = Math.exp(-age / (30 * 24 * 60 * 60 * 1000)); // Decay over 30 days
      score += recencyScore * 0.3;

      // Importance
      score += memory.metadata.importance * 0.2;

      // Type relevance
      if (query.includes('prefer') && memory.type === this.memoryTypes.PREFERENCE) {
        score += 0.2;
      }

      return { ...memory, score };
    }).sort((a, b) => b.score - a.score);
  }

  // Consolidate memories when limit exceeded
  async consolidateMemories() {
    console.log('Consolidating memories...');

    // Sort memories by importance and recency
    const sortedMemories = Array.from(this.memories.values()).sort((a, b) => {
      const scoreA = a.metadata.importance + Math.exp(-(Date.now() - a.timestamp) / (30 * 24 * 60 * 60 * 1000));
      const scoreB = b.metadata.importance + Math.exp(-(Date.now() - b.timestamp) / (30 * 24 * 60 * 60 * 1000));
      return scoreB - scoreA;
    });

    // Keep top memories
    const toKeep = sortedMemories.slice(0, this.maxMemories * 0.8);
    const toRemove = sortedMemories.slice(this.maxMemories * 0.8);

    // Summarize removed memories
    const summary = await this.summarizeMemories(toRemove);
    if (summary) {
      await this.createMemory(summary, {
        type: this.memoryTypes.CONTEXT,
        importance: 0.7,
        originalCount: toRemove.length
      });
    }

    // Remove old memories
    for (const memory of toRemove) {
      await this.deleteMemory(memory.id);
    }
  }

  // Summarize multiple memories
  async summarizeMemories(memories) {
    if (memories.length === 0) return null;

    // Group by type
    const grouped = {};
    memories.forEach(memory => {
      if (!grouped[memory.type]) {
        grouped[memory.type] = [];
      }
      grouped[memory.type].push(memory.content);
    });

    // Create summary
    const summaryParts = [];
    for (const [type, contents] of Object.entries(grouped)) {
      summaryParts.push(`${type}: ${contents.slice(0, 3).join('; ')}`);
    }

    return `Summary of ${memories.length} memories: ${summaryParts.join('. ')}`;
  }

  // Load memories from storage
  async loadMemories() {
    try {
      const stored = localStorage.getItem(`memories_${this.userId}`);
      if (stored) {
        const memories = JSON.parse(stored);
        for (const memory of memories) {
          this.memories.set(memory.id, memory);
          if (memory.embedding) {
            await this.vectorStore.add(memory.id, memory.embedding, memory);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load memories:', error);
    }
  }

  // Save memory to storage
  async saveMemory(memory) {
    try {
      const allMemories = Array.from(this.memories.values());
      localStorage.setItem(`memories_${this.userId}`, JSON.stringify(allMemories));
    } catch (error) {
      console.error('Failed to save memory:', error);
    }
  }

  // Remove from storage
  async removeFromStorage(memoryId) {
    await this.saveMemory(); // Save all memories after removal
  }

  // Generate unique ID
  generateId() {
    return `memory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get memory statistics
  getStatistics() {
    const stats = {
      total: this.memories.size,
      byType: {},
      averageImportance: 0,
      oldestMemory: null,
      newestMemory: null
    };

    let totalImportance = 0;
    let oldest = Infinity;
    let newest = 0;

    for (const memory of this.memories.values()) {
      // Count by type
      stats.byType[memory.type] = (stats.byType[memory.type] || 0) + 1;

      // Calculate average importance
      totalImportance += memory.metadata.importance;

      // Find oldest and newest
      if (memory.timestamp < oldest) {
        oldest = memory.timestamp;
        stats.oldestMemory = memory;
      }
      if (memory.timestamp > newest) {
        newest = memory.timestamp;
        stats.newestMemory = memory;
      }
    }

    stats.averageImportance = totalImportance / this.memories.size;

    return stats;
  }

  // Export memories
  exportMemories(format = 'json') {
    const memories = Array.from(this.memories.values());

    switch (format) {
      case 'json':
        return JSON.stringify(memories, null, 2);
      case 'csv':
        return this.exportToCSV(memories);
      default:
        return memories;
    }
  }

  exportToCSV(memories) {
    const headers = ['ID', 'Content', 'Type', 'Timestamp', 'Importance'];
    const rows = memories.map(m => [
      m.id,
      `"${m.content.replace(/"/g, '""')}"`,
      m.type,
      new Date(m.timestamp).toISOString(),
      m.metadata.importance
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  // Import memories
  async importMemories(data, format = 'json') {
    let memories;

    switch (format) {
      case 'json':
        memories = JSON.parse(data);
        break;
      case 'csv':
        memories = this.parseCSV(data);
        break;
      default:
        memories = data;
    }

    for (const memory of memories) {
      if (!memory.embedding) {
        memory.embedding = await this.generateEmbedding(memory.content);
      }
      this.memories.set(memory.id, memory);
      await this.vectorStore.add(memory.id, memory.embedding, memory);
    }

    await this.saveMemory();
  }

  parseCSV(csv) {
    const lines = csv.split('\n');
    const headers = lines[0].split(',');

    return lines.slice(1).map(line => {
      const values = line.match(/(?:^|,)("(?:[^"]+|"")*"|[^,]*)/g)
        .map(v => v.replace(/^,/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));

      return {
        id: values[0],
        content: values[1],
        type: values[2],
        timestamp: new Date(values[3]).getTime(),
        metadata: {
          importance: parseFloat(values[4])
        }
      };
    });
  }
}

// Simple in-memory vector store
class VectorStore {
  constructor(options = {}) {
    this.dimensions = options.dimensions || 384;
    this.metric = options.metric || 'cosine';
    this.vectors = new Map();
  }

  async add(id, vector, data) {
    this.vectors.set(id, { vector, data });
  }

  async update(id, vector) {
    const item = this.vectors.get(id);
    if (item) {
      item.vector = vector;
    }
  }

  async delete(id) {
    this.vectors.delete(id);
  }

  async search(queryVector, k = 5) {
    const results = [];

    for (const [id, item] of this.vectors) {
      const similarity = this.calculateSimilarity(queryVector, item.vector);
      results.push({
        id,
        similarity,
        data: item.data
      });
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }

  calculateSimilarity(vec1, vec2) {
    if (this.metric === 'cosine') {
      return this.cosineSimilarity(vec1, vec2);
    } else if (this.metric === 'euclidean') {
      return 1 / (1 + this.euclideanDistance(vec1, vec2));
    }
    return 0;
  }

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

  euclideanDistance(vec1, vec2) {
    let sum = 0;
    for (let i = 0; i < vec1.length; i++) {
      sum += Math.pow(vec1[i] - vec2[i], 2);
    }
    return Math.sqrt(sum);
  }
}

// Export singleton instance
export const memoryManager = new MemoryManager();