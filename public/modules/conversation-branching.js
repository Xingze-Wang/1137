// Conversation Branching Module - Create and manage conversation branches

export class ConversationBranching {
  constructor(options = {}) {
    this.branches = new Map();
    this.currentBranch = 'main';
    this.history = [];
    this.maxBranches = options.maxBranches || 100;
    this.autosave = options.autosave !== false;

    // Branch metadata
    this.metadata = {
      created: Date.now(),
      lastModified: Date.now(),
      author: options.author || 'anonymous'
    };

    // Callbacks
    this.onBranchCreate = options.onBranchCreate || (() => {});
    this.onBranchSwitch = options.onBranchSwitch || (() => {});
    this.onBranchMerge = options.onBranchMerge || (() => {});
    this.onBranchDelete = options.onBranchDelete || (() => {});

    // Initialize main branch
    this.initializeMainBranch();
  }

  initializeMainBranch() {
    this.createBranch('main', null, {
      protected: true,
      description: 'Main conversation thread'
    });
  }

  // Create a new branch from current point
  createBranch(name, fromMessage = null, options = {}) {
    if (this.branches.has(name)) {
      throw new Error(`Branch "${name}" already exists`);
    }

    if (this.branches.size >= this.maxBranches) {
      throw new Error(`Maximum number of branches (${this.maxBranches}) reached`);
    }

    const parentBranch = options.parent || this.currentBranch;
    const parentData = this.branches.get(parentBranch);

    const branch = {
      id: this.generateId(),
      name,
      parent: parentBranch,
      created: Date.now(),
      modified: Date.now(),
      author: this.metadata.author,
      messages: [],
      metadata: {
        description: options.description || '',
        tags: options.tags || [],
        protected: options.protected || false,
        experimental: options.experimental || false
      },
      stats: {
        messageCount: 0,
        tokenCount: 0,
        lastActivity: Date.now()
      }
    };

    // Copy messages up to branch point
    if (parentData && fromMessage !== null) {
      const branchPoint = this.findBranchPoint(parentData, fromMessage);
      branch.messages = parentData.messages.slice(0, branchPoint + 1);
      branch.stats.messageCount = branch.messages.length;
    }

    this.branches.set(name, branch);

    // Add to history
    this.addToHistory({
      action: 'create_branch',
      branch: name,
      timestamp: Date.now()
    });

    // Save if autosave enabled
    if (this.autosave) {
      this.saveBranches();
    }

    // Trigger callback
    this.onBranchCreate(branch);

    return branch;
  }

  // Switch to a different branch
  switchBranch(name) {
    if (!this.branches.has(name)) {
      throw new Error(`Branch "${name}" does not exist`);
    }

    const previousBranch = this.currentBranch;
    this.currentBranch = name;

    // Update last activity
    const branch = this.branches.get(name);
    branch.stats.lastActivity = Date.now();

    // Add to history
    this.addToHistory({
      action: 'switch_branch',
      from: previousBranch,
      to: name,
      timestamp: Date.now()
    });

    // Trigger callback
    this.onBranchSwitch(name, previousBranch);

    return branch;
  }

  // Fork current conversation into new branch
  fork(name, options = {}) {
    const currentData = this.getCurrentBranch();
    const forkPoint = options.fromMessage || currentData.messages.length - 1;

    const forkedBranch = this.createBranch(name, forkPoint, {
      ...options,
      parent: this.currentBranch
    });

    // Optionally switch to new branch
    if (options.switchTo !== false) {
      this.switchBranch(name);
    }

    return forkedBranch;
  }

  // Merge one branch into another
  mergeBranches(sourceBranch, targetBranch, options = {}) {
    if (!this.branches.has(sourceBranch)) {
      throw new Error(`Source branch "${sourceBranch}" does not exist`);
    }

    if (!this.branches.has(targetBranch)) {
      throw new Error(`Target branch "${targetBranch}" does not exist`);
    }

    const source = this.branches.get(sourceBranch);
    const target = this.branches.get(targetBranch);

    if (target.metadata.protected && !options.force) {
      throw new Error(`Cannot merge into protected branch "${targetBranch}"`);
    }

    // Find common ancestor
    const commonAncestor = this.findCommonAncestor(sourceBranch, targetBranch);

    // Merge strategies
    const strategy = options.strategy || 'append';
    let mergedMessages = [];

    switch (strategy) {
      case 'append':
        // Simply append source messages to target
        mergedMessages = [...target.messages, ...source.messages];
        break;

      case 'interleave':
        // Interleave messages by timestamp
        mergedMessages = this.interleaveMessages(target.messages, source.messages);
        break;

      case 'replace':
        // Replace target with source from merge point
        const mergePoint = options.mergePoint || commonAncestor;
        mergedMessages = [
          ...target.messages.slice(0, mergePoint),
          ...source.messages.slice(mergePoint)
        ];
        break;

      case 'smart':
        // Smart merge with conflict resolution
        mergedMessages = this.smartMerge(target.messages, source.messages, commonAncestor);
        break;
    }

    // Update target branch
    target.messages = mergedMessages;
    target.modified = Date.now();
    target.stats.messageCount = mergedMessages.length;
    target.stats.lastActivity = Date.now();

    // Add merge metadata
    target.metadata.mergeHistory = target.metadata.mergeHistory || [];
    target.metadata.mergeHistory.push({
      from: sourceBranch,
      timestamp: Date.now(),
      strategy,
      author: this.metadata.author
    });

    // Optionally delete source branch
    if (options.deleteSource) {
      this.deleteBranch(sourceBranch);
    }

    // Add to history
    this.addToHistory({
      action: 'merge_branches',
      source: sourceBranch,
      target: targetBranch,
      strategy,
      timestamp: Date.now()
    });

    // Trigger callback
    this.onBranchMerge(sourceBranch, targetBranch, mergedMessages);

    return target;
  }

  // Delete a branch
  deleteBranch(name) {
    if (!this.branches.has(name)) {
      throw new Error(`Branch "${name}" does not exist`);
    }

    const branch = this.branches.get(name);

    if (branch.metadata.protected) {
      throw new Error(`Cannot delete protected branch "${name}"`);
    }

    if (name === this.currentBranch) {
      // Switch to main branch if deleting current
      this.switchBranch('main');
    }

    // Check for child branches
    const children = this.getChildBranches(name);
    if (children.length > 0) {
      throw new Error(`Cannot delete branch "${name}" with child branches`);
    }

    this.branches.delete(name);

    // Add to history
    this.addToHistory({
      action: 'delete_branch',
      branch: name,
      timestamp: Date.now()
    });

    // Trigger callback
    this.onBranchDelete(name);

    return true;
  }

  // Add message to current branch
  addMessage(message) {
    const branch = this.getCurrentBranch();

    const messageWithMetadata = {
      ...message,
      id: this.generateId(),
      timestamp: Date.now(),
      branch: this.currentBranch,
      index: branch.messages.length
    };

    branch.messages.push(messageWithMetadata);
    branch.modified = Date.now();
    branch.stats.messageCount++;
    branch.stats.tokenCount += this.estimateTokens(message.content);
    branch.stats.lastActivity = Date.now();

    // Save if autosave enabled
    if (this.autosave) {
      this.saveBranches();
    }

    return messageWithMetadata;
  }

  // Edit message in branch (creates new branch by default)
  editMessage(messageId, newContent, options = {}) {
    const branch = this.getCurrentBranch();
    const messageIndex = branch.messages.findIndex(m => m.id === messageId);

    if (messageIndex === -1) {
      throw new Error(`Message "${messageId}" not found in current branch`);
    }

    if (options.createBranch !== false) {
      // Create new branch for edit
      const editBranchName = options.branchName || `edit-${Date.now()}`;
      this.fork(editBranchName, {
        fromMessage: messageIndex,
        description: `Edit of message ${messageId}`,
        switchTo: true
      });
    }

    // Edit message in current branch
    const currentBranch = this.getCurrentBranch();
    currentBranch.messages[messageIndex] = {
      ...currentBranch.messages[messageIndex],
      content: newContent,
      edited: true,
      editedAt: Date.now(),
      originalContent: currentBranch.messages[messageIndex].content
    };

    currentBranch.modified = Date.now();

    return currentBranch.messages[messageIndex];
  }

  // Compare two branches
  compareBranches(branch1, branch2) {
    if (!this.branches.has(branch1) || !this.branches.has(branch2)) {
      throw new Error('One or both branches do not exist');
    }

    const b1 = this.branches.get(branch1);
    const b2 = this.branches.get(branch2);

    // Find divergence point
    const divergencePoint = this.findDivergencePoint(b1, b2);

    // Calculate differences
    const diff = {
      divergencePoint,
      branch1: {
        name: branch1,
        uniqueMessages: b1.messages.slice(divergencePoint),
        totalMessages: b1.messages.length,
        stats: b1.stats
      },
      branch2: {
        name: branch2,
        uniqueMessages: b2.messages.slice(divergencePoint),
        totalMessages: b2.messages.length,
        stats: b2.stats
      },
      commonMessages: divergencePoint,
      similarity: this.calculateSimilarity(b1, b2)
    };

    return diff;
  }

  // Visualize branch structure
  visualizeBranches() {
    const tree = {
      name: 'main',
      branch: this.branches.get('main'),
      children: []
    };

    // Build tree structure
    const buildTree = (node) => {
      const children = this.getChildBranches(node.name);

      for (const childName of children) {
        const childNode = {
          name: childName,
          branch: this.branches.get(childName),
          children: []
        };

        buildTree(childNode);
        node.children.push(childNode);
      }
    };

    buildTree(tree);

    return tree;
  }

  // Create a checkpoint (snapshot)
  createCheckpoint(name, description = '') {
    const checkpoint = {
      id: this.generateId(),
      name,
      description,
      timestamp: Date.now(),
      branches: new Map(this.branches),
      currentBranch: this.currentBranch,
      metadata: { ...this.metadata }
    };

    // Store checkpoint
    if (!this.checkpoints) {
      this.checkpoints = new Map();
    }

    this.checkpoints.set(name, checkpoint);

    return checkpoint;
  }

  // Restore from checkpoint
  restoreCheckpoint(name) {
    if (!this.checkpoints || !this.checkpoints.has(name)) {
      throw new Error(`Checkpoint "${name}" not found`);
    }

    const checkpoint = this.checkpoints.get(name);

    this.branches = new Map(checkpoint.branches);
    this.currentBranch = checkpoint.currentBranch;
    this.metadata = { ...checkpoint.metadata };

    return checkpoint;
  }

  // Helper methods

  getCurrentBranch() {
    return this.branches.get(this.currentBranch);
  }

  getBranch(name) {
    return this.branches.get(name);
  }

  getAllBranches() {
    return Array.from(this.branches.values());
  }

  getBranchNames() {
    return Array.from(this.branches.keys());
  }

  getChildBranches(parentName) {
    const children = [];

    for (const [name, branch] of this.branches) {
      if (branch.parent === parentName) {
        children.push(name);
      }
    }

    return children;
  }

  findBranchPoint(branch, messageId) {
    return branch.messages.findIndex(m => m.id === messageId);
  }

  findCommonAncestor(branch1, branch2) {
    const b1 = this.branches.get(branch1);
    const b2 = this.branches.get(branch2);

    for (let i = 0; i < Math.min(b1.messages.length, b2.messages.length); i++) {
      if (b1.messages[i].id !== b2.messages[i].id) {
        return i - 1;
      }
    }

    return Math.min(b1.messages.length, b2.messages.length) - 1;
  }

  findDivergencePoint(branch1, branch2) {
    const minLength = Math.min(branch1.messages.length, branch2.messages.length);

    for (let i = 0; i < minLength; i++) {
      if (branch1.messages[i].id !== branch2.messages[i].id ||
          branch1.messages[i].content !== branch2.messages[i].content) {
        return i;
      }
    }

    return minLength;
  }

  interleaveMessages(messages1, messages2) {
    const combined = [...messages1, ...messages2];
    return combined.sort((a, b) => a.timestamp - b.timestamp);
  }

  smartMerge(messages1, messages2, commonAncestor) {
    const merged = [];

    // Add common messages
    for (let i = 0; i <= commonAncestor; i++) {
      merged.push(messages1[i] || messages2[i]);
    }

    // Intelligently merge diverged messages
    const diverged1 = messages1.slice(commonAncestor + 1);
    const diverged2 = messages2.slice(commonAncestor + 1);

    // Simple strategy: interleave by timestamp
    const interleaved = this.interleaveMessages(diverged1, diverged2);
    merged.push(...interleaved);

    return merged;
  }

  calculateSimilarity(branch1, branch2) {
    const divergencePoint = this.findDivergencePoint(branch1, branch2);
    const totalMessages = Math.max(branch1.messages.length, branch2.messages.length);

    if (totalMessages === 0) return 1;

    return divergencePoint / totalMessages;
  }

  estimateTokens(text) {
    // Simple token estimation (actual implementation would use tokenizer)
    return Math.ceil(text.length / 4);
  }

  addToHistory(entry) {
    this.history.push(entry);

    // Limit history size
    if (this.history.length > 1000) {
      this.history = this.history.slice(-500);
    }
  }

  saveBranches() {
    if (typeof localStorage !== 'undefined') {
      const data = {
        branches: Array.from(this.branches.entries()),
        currentBranch: this.currentBranch,
        metadata: this.metadata,
        history: this.history
      };

      localStorage.setItem('conversation_branches', JSON.stringify(data));
    }
  }

  loadBranches() {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('conversation_branches');

      if (stored) {
        const data = JSON.parse(stored);
        this.branches = new Map(data.branches);
        this.currentBranch = data.currentBranch;
        this.metadata = data.metadata;
        this.history = data.history || [];
        return true;
      }
    }

    return false;
  }

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Export branches
  exportBranches() {
    return {
      version: '1.0',
      exported: new Date().toISOString(),
      branches: Array.from(this.branches.entries()),
      currentBranch: this.currentBranch,
      metadata: this.metadata,
      history: this.history
    };
  }

  // Import branches
  importBranches(data) {
    if (data.version !== '1.0') {
      throw new Error('Incompatible branch data version');
    }

    this.branches = new Map(data.branches);
    this.currentBranch = data.currentBranch;
    this.metadata = data.metadata;
    this.history = data.history || [];
  }
}

// Branch Visualizer UI
export class BranchVisualizer {
  constructor(container, branchManager) {
    this.container = container;
    this.branchManager = branchManager;
    this.selectedBranch = null;

    this.createUI();
    this.render();
  }

  createUI() {
    this.container.innerHTML = `
      <div class="branch-visualizer">
        <div class="branch-header">
          <h3>Conversation Branches</h3>
          <div class="branch-actions">
            <button class="btn-create-branch">New Branch</button>
            <button class="btn-merge-branch">Merge</button>
            <button class="btn-delete-branch">Delete</button>
          </div>
        </div>
        <div class="branch-tree">
          <svg class="branch-svg"></svg>
        </div>
        <div class="branch-details">
          <div class="branch-info"></div>
        </div>
      </div>
    `;

    this.elements = {
      svg: this.container.querySelector('.branch-svg'),
      info: this.container.querySelector('.branch-info'),
      createBtn: this.container.querySelector('.btn-create-branch'),
      mergeBtn: this.container.querySelector('.btn-merge-branch'),
      deleteBtn: this.container.querySelector('.btn-delete-branch')
    };

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.elements.createBtn.addEventListener('click', () => {
      this.showCreateBranchDialog();
    });

    this.elements.mergeBtn.addEventListener('click', () => {
      if (this.selectedBranch) {
        this.showMergeBranchDialog();
      }
    });

    this.elements.deleteBtn.addEventListener('click', () => {
      if (this.selectedBranch) {
        this.deleteBranch(this.selectedBranch);
      }
    });
  }

  render() {
    const tree = this.branchManager.visualizeBranches();
    this.renderTree(tree);
  }

  renderTree(tree) {
    // Create D3.js tree visualization
    const width = 600;
    const height = 400;
    const nodeRadius = 20;

    // Clear existing
    this.elements.svg.innerHTML = '';

    // Simple tree rendering (in production, use D3.js)
    const renderNode = (node, x, y, level = 0) => {
      // Draw node
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', nodeRadius);
      circle.setAttribute('fill', node.name === this.branchManager.currentBranch ? '#4F46E5' : '#E5E7EB');
      circle.setAttribute('stroke', '#111827');
      circle.setAttribute('stroke-width', '2');
      circle.style.cursor = 'pointer';

      circle.addEventListener('click', () => {
        this.selectBranch(node.name);
      });

      this.elements.svg.appendChild(circle);

      // Draw label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x);
      text.setAttribute('y', y + 5);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '12');
      text.textContent = node.name;

      this.elements.svg.appendChild(text);

      // Draw children
      const childSpacing = width / (node.children.length + 1);
      node.children.forEach((child, index) => {
        const childX = (index + 1) * childSpacing;
        const childY = y + 80;

        // Draw edge
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x);
        line.setAttribute('y1', y + nodeRadius);
        line.setAttribute('x2', childX);
        line.setAttribute('y2', childY - nodeRadius);
        line.setAttribute('stroke', '#9CA3AF');
        line.setAttribute('stroke-width', '2');

        this.elements.svg.appendChild(line);

        // Render child node
        renderNode(child, childX, childY, level + 1);
      });
    };

    // Set SVG dimensions
    this.elements.svg.setAttribute('width', width);
    this.elements.svg.setAttribute('height', height);
    this.elements.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Render tree starting from root
    renderNode(tree, width / 2, 40);
  }

  selectBranch(name) {
    this.selectedBranch = name;
    const branch = this.branchManager.getBranch(name);

    this.elements.info.innerHTML = `
      <h4>${name}</h4>
      <p>Messages: ${branch.stats.messageCount}</p>
      <p>Created: ${new Date(branch.created).toLocaleString()}</p>
      <p>Modified: ${new Date(branch.modified).toLocaleString()}</p>
      ${branch.metadata.description ? `<p>Description: ${branch.metadata.description}</p>` : ''}
      <button class="btn-switch-branch">Switch to Branch</button>
    `;

    const switchBtn = this.elements.info.querySelector('.btn-switch-branch');
    switchBtn.addEventListener('click', () => {
      this.branchManager.switchBranch(name);
      this.render();
    });
  }

  showCreateBranchDialog() {
    const name = prompt('Enter branch name:');
    if (name) {
      const description = prompt('Enter description (optional):');
      this.branchManager.fork(name, {
        description,
        switchTo: true
      });
      this.render();
    }
  }

  showMergeBranchDialog() {
    const targetBranch = prompt('Merge into branch:');
    if (targetBranch) {
      try {
        this.branchManager.mergeBranches(this.selectedBranch, targetBranch, {
          strategy: 'smart'
        });
        this.render();
      } catch (error) {
        alert(`Merge failed: ${error.message}`);
      }
    }
  }

  deleteBranch(name) {
    if (confirm(`Delete branch "${name}"?`)) {
      try {
        this.branchManager.deleteBranch(name);
        this.selectedBranch = null;
        this.render();
      } catch (error) {
        alert(`Cannot delete: ${error.message}`);
      }
    }
  }
}

// Export singleton instance
export const conversationBranching = new ConversationBranching();