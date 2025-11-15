// Team Workspaces Module - Multi-user collaboration spaces

export class TeamWorkspaces {
  constructor(options = {}) {
    this.workspaces = new Map();
    this.currentWorkspace = null;
    this.user = options.user || null;
    this.socket = null;

    // Workspace limits
    this.limits = {
      maxWorkspaces: options.maxWorkspaces || 10,
      maxMembers: options.maxMembers || 100,
      maxChannels: options.maxChannels || 50,
      maxStorage: options.maxStorage || 10 * 1024 * 1024 * 1024 // 10GB
    };

    // Permissions
    this.permissions = {
      OWNER: 'owner',
      ADMIN: 'admin',
      MEMBER: 'member',
      GUEST: 'guest'
    };

    // Callbacks
    this.onWorkspaceCreate = options.onWorkspaceCreate || (() => {});
    this.onWorkspaceUpdate = options.onWorkspaceUpdate || (() => {});
    this.onMemberJoin = options.onMemberJoin || (() => {});
    this.onMemberLeave = options.onMemberLeave || (() => {});
    this.onMessageReceive = options.onMessageReceive || (() => {});

    // Initialize
    this.initialize();
  }

  async initialize() {
    // Load existing workspaces
    await this.loadWorkspaces();

    // Setup WebSocket connection
    this.setupWebSocket();

    console.log('Team Workspaces initialized');
  }

  // Create a new workspace
  async createWorkspace(name, options = {}) {
    if (this.workspaces.size >= this.limits.maxWorkspaces) {
      throw new Error(`Maximum number of workspaces (${this.limits.maxWorkspaces}) reached`);
    }

    const workspace = {
      id: this.generateId(),
      name,
      description: options.description || '',
      created: Date.now(),
      modified: Date.now(),
      owner: this.user?.id || 'anonymous',
      settings: {
        private: options.private || false,
        requireApproval: options.requireApproval || false,
        allowGuests: options.allowGuests || true,
        maxMembers: options.maxMembers || this.limits.maxMembers,
        features: {
          voice: options.voice !== false,
          video: options.video !== false,
          screen: options.screen !== false,
          whiteboard: options.whiteboard !== false,
          codeShare: options.codeShare !== false
        }
      },
      members: new Map(),
      channels: new Map(),
      roles: new Map(),
      invites: new Map(),
      activity: [],
      storage: {
        used: 0,
        limit: options.storageLimit || 1024 * 1024 * 1024 // 1GB default
      }
    };

    // Add owner as first member
    this.addMember(workspace, {
      id: this.user?.id || 'anonymous',
      name: this.user?.name || 'Anonymous',
      email: this.user?.email || '',
      role: this.permissions.OWNER,
      joined: Date.now()
    });

    // Create default channels
    this.createChannel(workspace, 'general', {
      description: 'General discussion',
      default: true
    });

    this.createChannel(workspace, 'random', {
      description: 'Off-topic discussions'
    });

    // Store workspace
    this.workspaces.set(workspace.id, workspace);

    // Persist
    await this.saveWorkspace(workspace);

    // Trigger callback
    this.onWorkspaceCreate(workspace);

    return workspace;
  }

  // Join workspace
  async joinWorkspace(workspaceId, options = {}) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Check if already member
    if (workspace.members.has(this.user?.id)) {
      this.currentWorkspace = workspaceId;
      return workspace;
    }

    // Check workspace settings
    if (workspace.settings.private) {
      if (!options.inviteCode) {
        throw new Error('Invite code required for private workspace');
      }

      if (!this.validateInviteCode(workspace, options.inviteCode)) {
        throw new Error('Invalid invite code');
      }
    }

    if (workspace.members.size >= workspace.settings.maxMembers) {
      throw new Error('Workspace is full');
    }

    // Add as member
    const member = {
      id: this.user?.id || `guest_${Date.now()}`,
      name: this.user?.name || 'Guest',
      email: this.user?.email || '',
      role: options.role || this.permissions.MEMBER,
      joined: Date.now(),
      status: 'online',
      activity: {
        lastSeen: Date.now(),
        currentChannel: null
      }
    };

    this.addMember(workspace, member);

    // Set as current workspace
    this.currentWorkspace = workspaceId;

    // Notify other members
    this.broadcastToWorkspace(workspace, {
      type: 'member_joined',
      member,
      timestamp: Date.now()
    });

    // Trigger callback
    this.onMemberJoin(workspace, member);

    return workspace;
  }

  // Leave workspace
  async leaveWorkspace(workspaceId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return;

    const member = workspace.members.get(this.user?.id);
    if (!member) return;

    // Cannot leave if owner (must transfer ownership first)
    if (member.role === this.permissions.OWNER) {
      throw new Error('Owner cannot leave workspace. Transfer ownership first.');
    }

    // Remove member
    workspace.members.delete(this.user?.id);

    // Notify other members
    this.broadcastToWorkspace(workspace, {
      type: 'member_left',
      memberId: this.user?.id,
      timestamp: Date.now()
    });

    // Clear current workspace if it was this one
    if (this.currentWorkspace === workspaceId) {
      this.currentWorkspace = null;
    }

    // Trigger callback
    this.onMemberLeave(workspace, member);
  }

  // Create channel in workspace
  createChannel(workspace, name, options = {}) {
    if (workspace.channels.size >= this.limits.maxChannels) {
      throw new Error(`Maximum number of channels (${this.limits.maxChannels}) reached`);
    }

    const channel = {
      id: this.generateId(),
      name,
      description: options.description || '',
      created: Date.now(),
      creator: this.user?.id || 'system',
      type: options.type || 'text', // text, voice, video
      private: options.private || false,
      default: options.default || false,
      members: options.private ? new Set([this.user?.id]) : null,
      messages: [],
      pinnedMessages: [],
      typing: new Set(),
      settings: {
        slowMode: options.slowMode || 0, // Seconds between messages
        readOnly: options.readOnly || false,
        autoArchive: options.autoArchive || 0 // Days before archive
      }
    };

    workspace.channels.set(channel.id, channel);

    // Broadcast channel creation
    this.broadcastToWorkspace(workspace, {
      type: 'channel_created',
      channel,
      timestamp: Date.now()
    });

    return channel;
  }

  // Send message to channel
  sendMessage(workspaceId, channelId, content, options = {}) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const channel = workspace.channels.get(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Check permissions
    if (!this.canSendMessage(workspace, channel)) {
      throw new Error('No permission to send message');
    }

    const message = {
      id: this.generateId(),
      channelId,
      authorId: this.user?.id || 'anonymous',
      content,
      timestamp: Date.now(),
      type: options.type || 'text',
      attachments: options.attachments || [],
      mentions: this.extractMentions(content),
      reactions: new Map(),
      edited: false,
      thread: options.threadId || null,
      metadata: options.metadata || {}
    };

    // Add to channel
    channel.messages.push(message);

    // Update activity
    this.updateActivity(workspace, {
      type: 'message',
      channelId,
      messageId: message.id,
      authorId: message.authorId,
      timestamp: message.timestamp
    });

    // Broadcast to channel members
    this.broadcastToChannel(workspace, channel, {
      type: 'message',
      message,
      timestamp: Date.now()
    });

    // Trigger callback
    this.onMessageReceive(workspace, channel, message);

    return message;
  }

  // Update member role
  updateMemberRole(workspaceId, memberId, newRole) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Check permissions
    if (!this.hasPermission(workspace, this.user?.id, 'manage_members')) {
      throw new Error('No permission to manage members');
    }

    const member = workspace.members.get(memberId);
    if (!member) {
      throw new Error('Member not found');
    }

    // Cannot change owner role
    if (member.role === this.permissions.OWNER) {
      throw new Error('Cannot change owner role');
    }

    member.role = newRole;
    member.roleUpdated = Date.now();

    // Broadcast role change
    this.broadcastToWorkspace(workspace, {
      type: 'role_updated',
      memberId,
      newRole,
      timestamp: Date.now()
    });

    return member;
  }

  // Create invite link
  createInvite(workspaceId, options = {}) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Check permissions
    if (!this.hasPermission(workspace, this.user?.id, 'create_invite')) {
      throw new Error('No permission to create invites');
    }

    const invite = {
      code: this.generateInviteCode(),
      created: Date.now(),
      creator: this.user?.id,
      expires: options.expires || Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
      maxUses: options.maxUses || 0, // 0 = unlimited
      uses: 0,
      role: options.role || this.permissions.MEMBER
    };

    workspace.invites.set(invite.code, invite);

    return invite;
  }

  // Validate invite code
  validateInviteCode(workspace, code) {
    const invite = workspace.invites.get(code);
    if (!invite) return false;

    // Check expiration
    if (invite.expires && Date.now() > invite.expires) {
      workspace.invites.delete(code);
      return false;
    }

    // Check usage limit
    if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
      workspace.invites.delete(code);
      return false;
    }

    // Increment usage
    invite.uses++;

    return true;
  }

  // Search workspace content
  async searchWorkspace(workspaceId, query, options = {}) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const results = {
      messages: [],
      files: [],
      members: [],
      channels: []
    };

    // Search messages
    if (options.includeMessages !== false) {
      for (const channel of workspace.channels.values()) {
        for (const message of channel.messages) {
          if (message.content.toLowerCase().includes(query.toLowerCase())) {
            results.messages.push({
              ...message,
              channelName: channel.name,
              score: this.calculateRelevance(message.content, query)
            });
          }
        }
      }
    }

    // Search members
    if (options.includeMembers !== false) {
      for (const member of workspace.members.values()) {
        if (member.name.toLowerCase().includes(query.toLowerCase())) {
          results.members.push(member);
        }
      }
    }

    // Search channels
    if (options.includeChannels !== false) {
      for (const channel of workspace.channels.values()) {
        if (channel.name.toLowerCase().includes(query.toLowerCase()) ||
            channel.description.toLowerCase().includes(query.toLowerCase())) {
          results.channels.push(channel);
        }
      }
    }

    // Sort by relevance
    results.messages.sort((a, b) => b.score - a.score);

    return results;
  }

  // Get workspace statistics
  getWorkspaceStats(workspaceId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const stats = {
      members: {
        total: workspace.members.size,
        online: Array.from(workspace.members.values()).filter(m => m.status === 'online').length,
        byRole: {}
      },
      channels: {
        total: workspace.channels.size,
        public: Array.from(workspace.channels.values()).filter(c => !c.private).length,
        private: Array.from(workspace.channels.values()).filter(c => c.private).length
      },
      messages: {
        total: 0,
        today: 0,
        thisWeek: 0,
        thisMonth: 0
      },
      storage: workspace.storage,
      activity: {
        lastMessage: null,
        mostActiveChannel: null,
        mostActiveUser: null
      }
    };

    // Count messages and activity
    const now = Date.now();
    const today = new Date().setHours(0, 0, 0, 0);
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const monthAgo = now - (30 * 24 * 60 * 60 * 1000);

    const userMessageCount = new Map();
    const channelMessageCount = new Map();

    for (const channel of workspace.channels.values()) {
      for (const message of channel.messages) {
        stats.messages.total++;

        if (message.timestamp >= today) stats.messages.today++;
        if (message.timestamp >= weekAgo) stats.messages.thisWeek++;
        if (message.timestamp >= monthAgo) stats.messages.thisMonth++;

        // Track user activity
        const count = userMessageCount.get(message.authorId) || 0;
        userMessageCount.set(message.authorId, count + 1);

        // Track channel activity
        const channelCount = channelMessageCount.get(channel.id) || 0;
        channelMessageCount.set(channel.id, channelCount + 1);

        // Track last message
        if (!stats.activity.lastMessage || message.timestamp > stats.activity.lastMessage.timestamp) {
          stats.activity.lastMessage = message;
        }
      }
    }

    // Find most active user
    let maxUserMessages = 0;
    for (const [userId, count] of userMessageCount) {
      if (count > maxUserMessages) {
        maxUserMessages = count;
        stats.activity.mostActiveUser = userId;
      }
    }

    // Find most active channel
    let maxChannelMessages = 0;
    for (const [channelId, count] of channelMessageCount) {
      if (count > maxChannelMessages) {
        maxChannelMessages = count;
        stats.activity.mostActiveChannel = channelId;
      }
    }

    // Count by role
    for (const member of workspace.members.values()) {
      stats.members.byRole[member.role] = (stats.members.byRole[member.role] || 0) + 1;
    }

    return stats;
  }

  // Setup WebSocket for real-time updates
  setupWebSocket() {
    if (typeof WebSocket === 'undefined') return;

    const wsUrl = process.env.WS_URL || 'ws://localhost:3001';

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('WebSocket connected');

        // Authenticate
        this.socket.send(JSON.stringify({
          type: 'auth',
          userId: this.user?.id,
          timestamp: Date.now()
        }));
      };

      this.socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.handleWebSocketMessage(data);
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.socket.onclose = () => {
        console.log('WebSocket disconnected');
        // Reconnect after delay
        setTimeout(() => this.setupWebSocket(), 5000);
      };
    } catch (error) {
      console.error('Failed to setup WebSocket:', error);
    }
  }

  handleWebSocketMessage(data) {
    switch (data.type) {
      case 'message':
        this.handleIncomingMessage(data);
        break;

      case 'member_joined':
        this.handleMemberJoined(data);
        break;

      case 'member_left':
        this.handleMemberLeft(data);
        break;

      case 'typing_start':
        this.handleTypingStart(data);
        break;

      case 'typing_stop':
        this.handleTypingStop(data);
        break;

      case 'presence_update':
        this.handlePresenceUpdate(data);
        break;

      default:
        console.log('Unknown WebSocket message type:', data.type);
    }
  }

  handleIncomingMessage(data) {
    const workspace = this.workspaces.get(data.workspaceId);
    if (!workspace) return;

    const channel = workspace.channels.get(data.channelId);
    if (!channel) return;

    // Add message to channel
    channel.messages.push(data.message);

    // Trigger callback
    this.onMessageReceive(workspace, channel, data.message);
  }

  handleMemberJoined(data) {
    const workspace = this.workspaces.get(data.workspaceId);
    if (!workspace) return;

    workspace.members.set(data.member.id, data.member);
    this.onMemberJoin(workspace, data.member);
  }

  handleMemberLeft(data) {
    const workspace = this.workspaces.get(data.workspaceId);
    if (!workspace) return;

    const member = workspace.members.get(data.memberId);
    if (member) {
      workspace.members.delete(data.memberId);
      this.onMemberLeave(workspace, member);
    }
  }

  handleTypingStart(data) {
    const workspace = this.workspaces.get(data.workspaceId);
    if (!workspace) return;

    const channel = workspace.channels.get(data.channelId);
    if (!channel) return;

    channel.typing.add(data.userId);
  }

  handleTypingStop(data) {
    const workspace = this.workspaces.get(data.workspaceId);
    if (!workspace) return;

    const channel = workspace.channels.get(data.channelId);
    if (!channel) return;

    channel.typing.delete(data.userId);
  }

  handlePresenceUpdate(data) {
    const workspace = this.workspaces.get(data.workspaceId);
    if (!workspace) return;

    const member = workspace.members.get(data.userId);
    if (member) {
      member.status = data.status;
      member.activity.lastSeen = Date.now();
    }
  }

  // Broadcast to workspace members
  broadcastToWorkspace(workspace, data) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    this.socket.send(JSON.stringify({
      type: 'broadcast_workspace',
      workspaceId: workspace.id,
      data
    }));
  }

  // Broadcast to channel members
  broadcastToChannel(workspace, channel, data) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    this.socket.send(JSON.stringify({
      type: 'broadcast_channel',
      workspaceId: workspace.id,
      channelId: channel.id,
      data
    }));
  }

  // Helper methods

  addMember(workspace, member) {
    workspace.members.set(member.id, member);
    workspace.modified = Date.now();
  }

  hasPermission(workspace, userId, permission) {
    const member = workspace.members.get(userId);
    if (!member) return false;

    const rolePermissions = {
      [this.permissions.OWNER]: ['*'], // All permissions
      [this.permissions.ADMIN]: [
        'manage_members',
        'manage_channels',
        'create_invite',
        'delete_messages',
        'pin_messages'
      ],
      [this.permissions.MEMBER]: [
        'send_message',
        'create_thread',
        'react',
        'upload_file'
      ],
      [this.permissions.GUEST]: [
        'send_message',
        'react'
      ]
    };

    const perms = rolePermissions[member.role] || [];
    return perms.includes('*') || perms.includes(permission);
  }

  canSendMessage(workspace, channel) {
    const member = workspace.members.get(this.user?.id);
    if (!member) return false;

    // Check channel settings
    if (channel.readOnly && member.role !== this.permissions.OWNER && member.role !== this.permissions.ADMIN) {
      return false;
    }

    // Check private channel membership
    if (channel.private && channel.members && !channel.members.has(this.user?.id)) {
      return false;
    }

    return this.hasPermission(workspace, this.user?.id, 'send_message');
  }

  extractMentions(content) {
    const mentions = [];
    const regex = /@(\w+)/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      mentions.push(match[1]);
    }

    return mentions;
  }

  calculateRelevance(content, query) {
    const contentLower = content.toLowerCase();
    const queryLower = query.toLowerCase();

    let score = 0;

    // Exact match
    if (contentLower === queryLower) score += 10;

    // Contains exact phrase
    if (contentLower.includes(queryLower)) score += 5;

    // Word matches
    const queryWords = queryLower.split(' ');
    const contentWords = contentLower.split(' ');

    for (const word of queryWords) {
      if (contentWords.includes(word)) score += 1;
    }

    return score;
  }

  updateActivity(workspace, activity) {
    workspace.activity.push({
      ...activity,
      timestamp: Date.now()
    });

    // Limit activity log size
    if (workspace.activity.length > 1000) {
      workspace.activity = workspace.activity.slice(-500);
    }

    workspace.modified = Date.now();
  }

  async saveWorkspace(workspace) {
    // Save to database or local storage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`workspace_${workspace.id}`, JSON.stringify(workspace));
    }

    // Also save to server if available
    try {
      await fetch('/api/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.user?.token}`
        },
        body: JSON.stringify(workspace)
      });
    } catch (error) {
      console.error('Failed to save workspace to server:', error);
    }
  }

  async loadWorkspaces() {
    // Load from local storage
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('workspace_')) {
          const data = localStorage.getItem(key);
          if (data) {
            try {
              const workspace = JSON.parse(data);
              // Convert plain objects back to Maps
              workspace.members = new Map(Object.entries(workspace.members || {}));
              workspace.channels = new Map(Object.entries(workspace.channels || {}));
              workspace.roles = new Map(Object.entries(workspace.roles || {}));
              workspace.invites = new Map(Object.entries(workspace.invites || {}));

              this.workspaces.set(workspace.id, workspace);
            } catch (error) {
              console.error('Failed to parse workspace:', error);
            }
          }
        }
      }
    }

    // Also load from server
    try {
      const response = await fetch('/api/workspaces', {
        headers: {
          'Authorization': `Bearer ${this.user?.token}`
        }
      });

      if (response.ok) {
        const workspaces = await response.json();
        for (const workspace of workspaces) {
          this.workspaces.set(workspace.id, workspace);
        }
      }
    } catch (error) {
      console.error('Failed to load workspaces from server:', error);
    }
  }

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  generateInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';

    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    return code;
  }
}

// Export singleton instance
export const teamWorkspaces = new TeamWorkspaces();