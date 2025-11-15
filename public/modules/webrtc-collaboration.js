/**
 * WebRTC Real-time Collaboration Module
 * Provides peer-to-peer collaboration features including:
 * - Screen sharing
 * - Voice/video chat
 * - Collaborative editing
 * - Presence indicators
 * - Real-time cursor tracking
 */

class WebRTCCollaboration {
    constructor(config = {}) {
        this.config = {
            iceServers: config.iceServers || [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            signalServer: config.signalServer || 'wss://localhost:3001',
            maxPeers: config.maxPeers || 10,
            videoConstraints: config.videoConstraints || {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audioConstraints: config.audioConstraints || {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            ...config
        };

        this.peers = new Map();
        this.localStream = null;
        this.screenStream = null;
        this.dataChannels = new Map();
        this.presence = new Map();
        this.cursors = new Map();
        this.userId = this.generateUserId();
        this.roomId = null;
        this.signalSocket = null;
        this.callbacks = new Map();

        // Collaboration state
        this.documentState = {
            content: '',
            version: 0,
            operations: []
        };

        // Initialize components
        this.init();
    }

    init() {
        // Set up WebSocket for signaling
        this.setupSignaling();

        // Set up presence tracking
        this.setupPresenceTracking();

        // Set up collaborative features
        this.setupCollaborativeFeatures();
    }

    /**
     * Connect to signaling server
     */
    setupSignaling() {
        try {
            this.signalSocket = new WebSocket(this.config.signalServer);

            this.signalSocket.onopen = () => {
                console.log('Connected to signaling server');
                this.emit('signal:connected');
            };

            this.signalSocket.onmessage = async (event) => {
                const message = JSON.parse(event.data);
                await this.handleSignalMessage(message);
            };

            this.signalSocket.onerror = (error) => {
                console.error('Signaling error:', error);
                this.emit('signal:error', error);
            };

            this.signalSocket.onclose = () => {
                console.log('Disconnected from signaling server');
                this.emit('signal:disconnected');
                // Attempt reconnection
                setTimeout(() => this.setupSignaling(), 5000);
            };
        } catch (error) {
            console.error('Failed to setup signaling:', error);
            // Fallback to manual connection if signaling server is unavailable
            this.setupManualConnection();
        }
    }

    /**
     * Handle signaling messages
     */
    async handleSignalMessage(message) {
        const { type, from, data } = message;

        switch (type) {
            case 'offer':
                await this.handleOffer(from, data);
                break;
            case 'answer':
                await this.handleAnswer(from, data);
                break;
            case 'ice-candidate':
                await this.handleIceCandidate(from, data);
                break;
            case 'join-room':
                this.handlePeerJoined(from, data);
                break;
            case 'leave-room':
                this.handlePeerLeft(from);
                break;
            case 'room-state':
                this.handleRoomState(data);
                break;
        }
    }

    /**
     * Join collaboration room
     */
    async joinRoom(roomId, options = {}) {
        this.roomId = roomId;

        // Request user media if needed
        if (options.video || options.audio) {
            await this.getUserMedia({
                video: options.video ? this.config.videoConstraints : false,
                audio: options.audio ? this.config.audioConstraints : false
            });
        }

        // Send join message
        this.sendSignal({
            type: 'join-room',
            data: {
                roomId,
                userId: this.userId,
                metadata: options.metadata || {}
            }
        });

        this.emit('room:joined', { roomId, userId: this.userId });

        return { roomId, userId: this.userId };
    }

    /**
     * Leave collaboration room
     */
    leaveRoom() {
        // Send leave message
        this.sendSignal({
            type: 'leave-room',
            data: { roomId: this.roomId }
        });

        // Clean up peer connections
        this.peers.forEach(peer => {
            peer.close();
        });
        this.peers.clear();

        // Stop media streams
        this.stopUserMedia();
        this.stopScreenShare();

        this.emit('room:left', { roomId: this.roomId });
        this.roomId = null;
    }

    /**
     * Create peer connection
     */
    async createPeerConnection(peerId, isInitiator = false) {
        const pc = new RTCPeerConnection({
            iceServers: this.config.iceServers
        });

        // Add local streams
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }

        // Handle remote stream
        pc.ontrack = (event) => {
            this.handleRemoteStream(peerId, event.streams[0]);
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal({
                    type: 'ice-candidate',
                    to: peerId,
                    data: event.candidate
                });
            }
        };

        // Create data channel for collaboration
        if (isInitiator) {
            const dataChannel = pc.createDataChannel('collaboration', {
                ordered: true,
                maxRetransmits: 10
            });
            this.setupDataChannel(peerId, dataChannel);
        }

        pc.ondatachannel = (event) => {
            this.setupDataChannel(peerId, event.channel);
        };

        // Monitor connection state
        pc.onconnectionstatechange = () => {
            console.log(`Peer ${peerId} connection state:`, pc.connectionState);
            this.emit('peer:state', { peerId, state: pc.connectionState });

            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                this.removePeer(peerId);
            }
        };

        this.peers.set(peerId, pc);
        return pc;
    }

    /**
     * Set up data channel for collaboration
     */
    setupDataChannel(peerId, channel) {
        channel.onopen = () => {
            console.log(`Data channel opened with ${peerId}`);
            this.dataChannels.set(peerId, channel);
            this.emit('datachannel:open', { peerId });
        };

        channel.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleDataChannelMessage(peerId, message);
        };

        channel.onerror = (error) => {
            console.error(`Data channel error with ${peerId}:`, error);
            this.emit('datachannel:error', { peerId, error });
        };

        channel.onclose = () => {
            console.log(`Data channel closed with ${peerId}`);
            this.dataChannels.delete(peerId);
            this.emit('datachannel:close', { peerId });
        };
    }

    /**
     * Handle data channel messages
     */
    handleDataChannelMessage(peerId, message) {
        const { type, data } = message;

        switch (type) {
            case 'cursor':
                this.updateCursor(peerId, data);
                break;
            case 'selection':
                this.updateSelection(peerId, data);
                break;
            case 'operation':
                this.applyOperation(peerId, data);
                break;
            case 'presence':
                this.updatePresence(peerId, data);
                break;
            case 'chat':
                this.handleChatMessage(peerId, data);
                break;
            case 'state-sync':
                this.syncState(peerId, data);
                break;
        }
    }

    /**
     * Start screen sharing
     */
    async startScreenShare(options = {}) {
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    displaySurface: options.displaySurface || 'monitor'
                },
                audio: options.audio || false
            });

            // Replace video track in all peer connections
            const videoTrack = this.screenStream.getVideoTracks()[0];
            this.peers.forEach(pc => {
                const sender = pc.getSenders().find(s =>
                    s.track && s.track.kind === 'video'
                );
                if (sender) {
                    sender.replaceTrack(videoTrack);
                }
            });

            // Handle screen share ending
            videoTrack.onended = () => {
                this.stopScreenShare();
            };

            this.emit('screenshare:started', { stream: this.screenStream });
            return this.screenStream;
        } catch (error) {
            console.error('Failed to start screen share:', error);
            throw error;
        }
    }

    /**
     * Stop screen sharing
     */
    stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());

            // Restore camera video if available
            if (this.localStream) {
                const videoTrack = this.localStream.getVideoTracks()[0];
                if (videoTrack) {
                    this.peers.forEach(pc => {
                        const sender = pc.getSenders().find(s =>
                            s.track && s.track.kind === 'video'
                        );
                        if (sender) {
                            sender.replaceTrack(videoTrack);
                        }
                    });
                }
            }

            this.screenStream = null;
            this.emit('screenshare:stopped');
        }
    }

    /**
     * Get user media
     */
    async getUserMedia(constraints) {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.emit('media:started', { stream: this.localStream });
            return this.localStream;
        } catch (error) {
            console.error('Failed to get user media:', error);
            throw error;
        }
    }

    /**
     * Stop user media
     */
    stopUserMedia() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
            this.emit('media:stopped');
        }
    }

    /**
     * Toggle audio/video
     */
    toggleTrack(type, enabled) {
        if (this.localStream) {
            const tracks = type === 'audio'
                ? this.localStream.getAudioTracks()
                : this.localStream.getVideoTracks();

            tracks.forEach(track => {
                track.enabled = enabled;
            });

            this.emit('track:toggled', { type, enabled });
        }
    }

    /**
     * Send cursor position
     */
    sendCursor(position) {
        this.broadcast({
            type: 'cursor',
            data: {
                ...position,
                userId: this.userId,
                timestamp: Date.now()
            }
        });
    }

    /**
     * Send selection
     */
    sendSelection(selection) {
        this.broadcast({
            type: 'selection',
            data: {
                ...selection,
                userId: this.userId,
                timestamp: Date.now()
            }
        });
    }

    /**
     * Send operation (for collaborative editing)
     */
    sendOperation(operation) {
        // Apply operation locally
        this.documentState.operations.push(operation);
        this.documentState.version++;

        // Broadcast to peers
        this.broadcast({
            type: 'operation',
            data: {
                operation,
                version: this.documentState.version,
                userId: this.userId,
                timestamp: Date.now()
            }
        });
    }

    /**
     * Update cursor position
     */
    updateCursor(peerId, data) {
        this.cursors.set(peerId, data);
        this.emit('cursor:update', { peerId, ...data });
    }

    /**
     * Update selection
     */
    updateSelection(peerId, data) {
        this.emit('selection:update', { peerId, ...data });
    }

    /**
     * Apply operation from peer
     */
    applyOperation(peerId, data) {
        const { operation, version } = data;

        // Handle version conflicts
        if (version <= this.documentState.version) {
            // Transform operation against local operations
            const transformed = this.transformOperation(operation, this.documentState.operations);
            this.documentState.operations.push(transformed);
        } else {
            this.documentState.operations.push(operation);
        }

        this.documentState.version = Math.max(this.documentState.version, version);
        this.emit('operation:applied', { peerId, operation, version });
    }

    /**
     * Transform operation for OT (Operational Transformation)
     */
    transformOperation(op, against) {
        // Simple OT implementation - can be extended for complex transformations
        let transformed = { ...op };

        against.forEach(againstOp => {
            if (op.type === 'insert' && againstOp.type === 'insert') {
                if (op.position >= againstOp.position) {
                    transformed.position += againstOp.text.length;
                }
            } else if (op.type === 'delete' && againstOp.type === 'insert') {
                if (op.position >= againstOp.position) {
                    transformed.position += againstOp.text.length;
                }
            } else if (op.type === 'insert' && againstOp.type === 'delete') {
                if (op.position > againstOp.position) {
                    transformed.position -= againstOp.length;
                }
            }
        });

        return transformed;
    }

    /**
     * Set up presence tracking
     */
    setupPresenceTracking() {
        // Send presence updates periodically
        setInterval(() => {
            if (this.roomId) {
                const presence = {
                    userId: this.userId,
                    status: 'active',
                    lastSeen: Date.now(),
                    metadata: this.getPresenceMetadata()
                };

                this.broadcast({
                    type: 'presence',
                    data: presence
                });
            }
        }, 5000);
    }

    /**
     * Get presence metadata
     */
    getPresenceMetadata() {
        return {
            cursor: this.cursors.get(this.userId),
            audioEnabled: this.localStream?.getAudioTracks()[0]?.enabled || false,
            videoEnabled: this.localStream?.getVideoTracks()[0]?.enabled || false,
            screenSharing: !!this.screenStream
        };
    }

    /**
     * Update presence
     */
    updatePresence(peerId, data) {
        this.presence.set(peerId, data);
        this.emit('presence:update', { peerId, ...data });

        // Clean up stale presence
        const now = Date.now();
        this.presence.forEach((presence, id) => {
            if (now - presence.lastSeen > 30000) {
                this.presence.delete(id);
                this.emit('presence:timeout', { peerId: id });
            }
        });
    }

    /**
     * Set up collaborative features
     */
    setupCollaborativeFeatures() {
        // Collaborative drawing
        this.drawing = {
            strokes: [],
            currentStroke: null
        };

        // Collaborative annotations
        this.annotations = new Map();

        // Shared clipboard
        this.clipboard = {
            content: null,
            owner: null
        };
    }

    /**
     * Start drawing
     */
    startDrawing(point) {
        this.drawing.currentStroke = {
            id: this.generateId(),
            userId: this.userId,
            points: [point],
            color: '#000000',
            width: 2,
            timestamp: Date.now()
        };

        this.broadcast({
            type: 'drawing:start',
            data: this.drawing.currentStroke
        });
    }

    /**
     * Continue drawing
     */
    continueDrawing(point) {
        if (this.drawing.currentStroke) {
            this.drawing.currentStroke.points.push(point);

            this.broadcast({
                type: 'drawing:continue',
                data: {
                    strokeId: this.drawing.currentStroke.id,
                    point
                }
            });
        }
    }

    /**
     * End drawing
     */
    endDrawing() {
        if (this.drawing.currentStroke) {
            this.drawing.strokes.push(this.drawing.currentStroke);

            this.broadcast({
                type: 'drawing:end',
                data: {
                    strokeId: this.drawing.currentStroke.id
                }
            });

            this.drawing.currentStroke = null;
        }
    }

    /**
     * Add annotation
     */
    addAnnotation(annotation) {
        const id = this.generateId();
        const annotationData = {
            id,
            userId: this.userId,
            ...annotation,
            timestamp: Date.now()
        };

        this.annotations.set(id, annotationData);

        this.broadcast({
            type: 'annotation:add',
            data: annotationData
        });

        return id;
    }

    /**
     * Update annotation
     */
    updateAnnotation(id, updates) {
        const annotation = this.annotations.get(id);
        if (annotation && annotation.userId === this.userId) {
            const updated = { ...annotation, ...updates };
            this.annotations.set(id, updated);

            this.broadcast({
                type: 'annotation:update',
                data: { id, updates }
            });
        }
    }

    /**
     * Remove annotation
     */
    removeAnnotation(id) {
        const annotation = this.annotations.get(id);
        if (annotation && annotation.userId === this.userId) {
            this.annotations.delete(id);

            this.broadcast({
                type: 'annotation:remove',
                data: { id }
            });
        }
    }

    /**
     * Share clipboard
     */
    shareClipboard(content, type = 'text') {
        this.clipboard = {
            content,
            type,
            owner: this.userId,
            timestamp: Date.now()
        };

        this.broadcast({
            type: 'clipboard:share',
            data: this.clipboard
        });
    }

    /**
     * Handle offer
     */
    async handleOffer(peerId, offer) {
        const pc = await this.createPeerConnection(peerId, false);

        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.sendSignal({
            type: 'answer',
            to: peerId,
            data: answer
        });
    }

    /**
     * Handle answer
     */
    async handleAnswer(peerId, answer) {
        const pc = this.peers.get(peerId);
        if (pc) {
            await pc.setRemoteDescription(answer);
        }
    }

    /**
     * Handle ICE candidate
     */
    async handleIceCandidate(peerId, candidate) {
        const pc = this.peers.get(peerId);
        if (pc) {
            await pc.addIceCandidate(candidate);
        }
    }

    /**
     * Handle peer joined
     */
    async handlePeerJoined(peerId, data) {
        console.log(`Peer ${peerId} joined`);

        // Create offer for new peer
        const pc = await this.createPeerConnection(peerId, true);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        this.sendSignal({
            type: 'offer',
            to: peerId,
            data: offer
        });

        this.emit('peer:joined', { peerId, ...data });
    }

    /**
     * Handle peer left
     */
    handlePeerLeft(peerId) {
        console.log(`Peer ${peerId} left`);
        this.removePeer(peerId);
        this.emit('peer:left', { peerId });
    }

    /**
     * Remove peer
     */
    removePeer(peerId) {
        const pc = this.peers.get(peerId);
        if (pc) {
            pc.close();
            this.peers.delete(peerId);
        }

        this.dataChannels.delete(peerId);
        this.presence.delete(peerId);
        this.cursors.delete(peerId);
    }

    /**
     * Handle remote stream
     */
    handleRemoteStream(peerId, stream) {
        console.log(`Received remote stream from ${peerId}`);
        this.emit('stream:added', { peerId, stream });
    }

    /**
     * Handle room state
     */
    handleRoomState(state) {
        const { peers, document } = state;

        // Connect to existing peers
        peers.forEach(peerId => {
            if (peerId !== this.userId) {
                this.handlePeerJoined(peerId, {});
            }
        });

        // Sync document state
        if (document) {
            this.documentState = document;
            this.emit('state:synced', document);
        }
    }

    /**
     * Send signal message
     */
    sendSignal(message) {
        if (this.signalSocket?.readyState === WebSocket.OPEN) {
            this.signalSocket.send(JSON.stringify({
                ...message,
                from: this.userId
            }));
        }
    }

    /**
     * Broadcast to all peers
     */
    broadcast(message) {
        this.dataChannels.forEach((channel, peerId) => {
            if (channel.readyState === 'open') {
                channel.send(JSON.stringify(message));
            }
        });
    }

    /**
     * Send to specific peer
     */
    sendToPeer(peerId, message) {
        const channel = this.dataChannels.get(peerId);
        if (channel?.readyState === 'open') {
            channel.send(JSON.stringify(message));
        }
    }

    /**
     * Manual connection fallback
     */
    setupManualConnection() {
        // Generate connection offer for manual exchange
        this.emit('manual:required', {
            message: 'Signaling server unavailable. Use manual connection.',
            userId: this.userId
        });
    }

    /**
     * Create manual offer
     */
    async createManualOffer(peerId) {
        const pc = await this.createPeerConnection(peerId, true);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        return {
            type: 'offer',
            sdp: offer.sdp,
            peerId: this.userId
        };
    }

    /**
     * Accept manual offer
     */
    async acceptManualOffer(offerData) {
        const { peerId, sdp } = offerData;
        const pc = await this.createPeerConnection(peerId, false);

        await pc.setRemoteDescription({ type: 'offer', sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        return {
            type: 'answer',
            sdp: answer.sdp,
            peerId: this.userId
        };
    }

    /**
     * Accept manual answer
     */
    async acceptManualAnswer(answerData) {
        const { peerId, sdp } = answerData;
        const pc = this.peers.get(peerId);

        if (pc) {
            await pc.setRemoteDescription({ type: 'answer', sdp });
        }
    }

    /**
     * Event emitter
     */
    on(event, callback) {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, []);
        }
        this.callbacks.get(event).push(callback);
    }

    off(event, callback) {
        const callbacks = this.callbacks.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        const callbacks = this.callbacks.get(event);
        if (callbacks) {
            callbacks.forEach(callback => callback(data));
        }
    }

    /**
     * Generate unique ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    /**
     * Generate user ID
     */
    generateUserId() {
        return 'user-' + this.generateId();
    }

    /**
     * Create UI for collaboration
     */
    createUI(container) {
        const ui = document.createElement('div');
        ui.className = 'webrtc-collaboration-ui';
        ui.innerHTML = `
            <div class="collab-header">
                <h3>Real-time Collaboration</h3>
                <div class="collab-status">
                    <span class="status-indicator"></span>
                    <span class="status-text">Disconnected</span>
                </div>
            </div>

            <div class="collab-room">
                <input type="text" class="room-input" placeholder="Enter room ID">
                <button class="join-btn">Join Room</button>
                <button class="create-btn">Create Room</button>
            </div>

            <div class="collab-controls">
                <button class="control-btn video-btn" title="Toggle Video">
                    <svg viewBox="0 0 24 24">
                        <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/>
                    </svg>
                </button>
                <button class="control-btn audio-btn" title="Toggle Audio">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2h-2v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z"/>
                    </svg>
                </button>
                <button class="control-btn screen-btn" title="Share Screen">
                    <svg viewBox="0 0 24 24">
                        <path d="M21 2H3c-1.11 0-2 .89-2 2v12a2 2 0 0 0 2 2h7l-2 3v1h8v-1l-2-3h7a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
                    </svg>
                </button>
                <button class="control-btn draw-btn" title="Drawing Mode">
                    <svg viewBox="0 0 24 24">
                        <path d="M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75M3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z"/>
                    </svg>
                </button>
            </div>

            <div class="collab-participants">
                <h4>Participants</h4>
                <div class="participants-list"></div>
            </div>

            <div class="collab-chat">
                <div class="chat-messages"></div>
                <div class="chat-input-container">
                    <input type="text" class="chat-input" placeholder="Type a message...">
                    <button class="chat-send">Send</button>
                </div>
            </div>

            <div class="video-container">
                <video class="local-video" autoplay muted></video>
                <div class="remote-videos"></div>
            </div>

            <div class="drawing-canvas-container" style="display: none;">
                <canvas class="drawing-canvas"></canvas>
                <div class="drawing-tools">
                    <input type="color" class="color-picker">
                    <input type="range" class="brush-size" min="1" max="20" value="2">
                    <button class="clear-canvas">Clear</button>
                </div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .webrtc-collaboration-ui {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: white;
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }

            .collab-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }

            .collab-header h3 {
                margin: 0;
                font-size: 1.2em;
                color: #333;
            }

            .collab-status {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .status-indicator {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #dc3545;
            }

            .status-indicator.connected {
                background: #28a745;
            }

            .collab-room {
                display: flex;
                gap: 10px;
                margin-bottom: 20px;
            }

            .room-input {
                flex: 1;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
            }

            .join-btn, .create-btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                background: #007bff;
                color: white;
                cursor: pointer;
            }

            .join-btn:hover, .create-btn:hover {
                background: #0056b3;
            }

            .collab-controls {
                display: flex;
                gap: 10px;
                margin-bottom: 20px;
            }

            .control-btn {
                width: 40px;
                height: 40px;
                border: none;
                border-radius: 50%;
                background: #f0f0f0;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .control-btn:hover {
                background: #e0e0e0;
            }

            .control-btn.active {
                background: #007bff;
                color: white;
            }

            .control-btn svg {
                width: 20px;
                height: 20px;
                fill: currentColor;
            }

            .collab-participants {
                margin-bottom: 20px;
            }

            .collab-participants h4 {
                margin: 0 0 10px 0;
                font-size: 1em;
                color: #666;
            }

            .participants-list {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
            }

            .participant {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 4px 12px;
                background: #f0f0f0;
                border-radius: 20px;
            }

            .participant-avatar {
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 12px;
            }

            .collab-chat {
                border: 1px solid #ddd;
                border-radius: 4px;
                height: 200px;
                display: flex;
                flex-direction: column;
                margin-bottom: 20px;
            }

            .chat-messages {
                flex: 1;
                padding: 10px;
                overflow-y: auto;
            }

            .chat-message {
                margin-bottom: 10px;
            }

            .chat-message-user {
                font-weight: bold;
                color: #007bff;
            }

            .chat-input-container {
                display: flex;
                padding: 10px;
                border-top: 1px solid #ddd;
            }

            .chat-input {
                flex: 1;
                padding: 6px;
                border: 1px solid #ddd;
                border-radius: 4px;
            }

            .chat-send {
                margin-left: 10px;
                padding: 6px 12px;
                border: none;
                border-radius: 4px;
                background: #007bff;
                color: white;
                cursor: pointer;
            }

            .video-container {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 10px;
                margin-bottom: 20px;
            }

            .local-video, .remote-video {
                width: 100%;
                border-radius: 4px;
                background: #000;
            }

            .drawing-canvas-container {
                position: relative;
                margin-top: 20px;
            }

            .drawing-canvas {
                border: 1px solid #ddd;
                border-radius: 4px;
                cursor: crosshair;
                width: 100%;
            }

            .drawing-tools {
                display: flex;
                gap: 10px;
                margin-top: 10px;
                align-items: center;
            }

            .color-picker {
                width: 40px;
                height: 40px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }

            .brush-size {
                flex: 1;
            }

            .clear-canvas {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                background: #dc3545;
                color: white;
                cursor: pointer;
            }

            /* Cursor indicators */
            .remote-cursor {
                position: absolute;
                width: 20px;
                height: 20px;
                pointer-events: none;
                z-index: 1000;
            }

            .remote-cursor::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 0;
                height: 0;
                border-left: 8px solid transparent;
                border-right: 8px solid transparent;
                border-top: 12px solid;
            }

            .remote-cursor-label {
                position: absolute;
                top: 15px;
                left: 10px;
                padding: 2px 6px;
                background: rgba(0,0,0,0.7);
                color: white;
                font-size: 11px;
                border-radius: 3px;
                white-space: nowrap;
            }
        `;
        document.head.appendChild(style);

        container.appendChild(ui);

        // Set up event handlers
        this.setupUIHandlers(ui);

        return ui;
    }

    /**
     * Set up UI event handlers
     */
    setupUIHandlers(ui) {
        // Room controls
        const roomInput = ui.querySelector('.room-input');
        const joinBtn = ui.querySelector('.join-btn');
        const createBtn = ui.querySelector('.create-btn');

        joinBtn.addEventListener('click', () => {
            const roomId = roomInput.value.trim();
            if (roomId) {
                this.joinRoom(roomId, { video: true, audio: true });
            }
        });

        createBtn.addEventListener('click', () => {
            const roomId = this.generateId();
            roomInput.value = roomId;
            this.joinRoom(roomId, { video: true, audio: true });
        });

        // Media controls
        const videoBtn = ui.querySelector('.video-btn');
        const audioBtn = ui.querySelector('.audio-btn');
        const screenBtn = ui.querySelector('.screen-btn');
        const drawBtn = ui.querySelector('.draw-btn');

        videoBtn.addEventListener('click', () => {
            const enabled = !videoBtn.classList.contains('active');
            this.toggleTrack('video', enabled);
            videoBtn.classList.toggle('active', enabled);
        });

        audioBtn.addEventListener('click', () => {
            const enabled = !audioBtn.classList.contains('active');
            this.toggleTrack('audio', enabled);
            audioBtn.classList.toggle('active', enabled);
        });

        screenBtn.addEventListener('click', async () => {
            if (screenBtn.classList.contains('active')) {
                this.stopScreenShare();
                screenBtn.classList.remove('active');
            } else {
                await this.startScreenShare();
                screenBtn.classList.add('active');
            }
        });

        drawBtn.addEventListener('click', () => {
            const canvas = ui.querySelector('.drawing-canvas-container');
            const isActive = !drawBtn.classList.contains('active');
            drawBtn.classList.toggle('active', isActive);
            canvas.style.display = isActive ? 'block' : 'none';

            if (isActive) {
                this.setupDrawingCanvas(ui);
            }
        });

        // Chat
        const chatInput = ui.querySelector('.chat-input');
        const chatSend = ui.querySelector('.chat-send');

        const sendMessage = () => {
            const message = chatInput.value.trim();
            if (message) {
                this.broadcast({
                    type: 'chat',
                    data: {
                        message,
                        userId: this.userId,
                        timestamp: Date.now()
                    }
                });

                // Add to local chat
                this.addChatMessage(this.userId, message);
                chatInput.value = '';
            }
        };

        chatSend.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        // Update UI on events
        this.on('signal:connected', () => {
            ui.querySelector('.status-indicator').classList.add('connected');
            ui.querySelector('.status-text').textContent = 'Connected';
        });

        this.on('signal:disconnected', () => {
            ui.querySelector('.status-indicator').classList.remove('connected');
            ui.querySelector('.status-text').textContent = 'Disconnected';
        });

        this.on('media:started', ({ stream }) => {
            const localVideo = ui.querySelector('.local-video');
            localVideo.srcObject = stream;

            // Enable buttons based on available tracks
            if (stream.getVideoTracks().length > 0) {
                videoBtn.classList.add('active');
            }
            if (stream.getAudioTracks().length > 0) {
                audioBtn.classList.add('active');
            }
        });

        this.on('stream:added', ({ peerId, stream }) => {
            const remoteVideos = ui.querySelector('.remote-videos');
            let video = remoteVideos.querySelector(`[data-peer-id="${peerId}"]`);

            if (!video) {
                video = document.createElement('video');
                video.className = 'remote-video';
                video.setAttribute('data-peer-id', peerId);
                video.autoplay = true;
                remoteVideos.appendChild(video);
            }

            video.srcObject = stream;
        });

        this.on('peer:joined', ({ peerId }) => {
            this.addParticipant(peerId);
        });

        this.on('peer:left', ({ peerId }) => {
            this.removeParticipant(peerId);

            // Remove video
            const video = ui.querySelector(`[data-peer-id="${peerId}"]`);
            if (video) {
                video.remove();
            }
        });
    }

    /**
     * Set up drawing canvas
     */
    setupDrawingCanvas(ui) {
        const canvas = ui.querySelector('.drawing-canvas');
        const ctx = canvas.getContext('2d');
        const colorPicker = ui.querySelector('.color-picker');
        const brushSize = ui.querySelector('.brush-size');
        const clearBtn = ui.querySelector('.clear-canvas');

        // Set canvas size
        canvas.width = canvas.offsetWidth;
        canvas.height = 400;

        let isDrawing = false;

        canvas.addEventListener('mousedown', (e) => {
            isDrawing = true;
            const rect = canvas.getBoundingClientRect();
            const point = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            this.startDrawing(point);
        });

        canvas.addEventListener('mousemove', (e) => {
            if (isDrawing) {
                const rect = canvas.getBoundingClientRect();
                const point = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                };
                this.continueDrawing(point);

                // Draw locally
                if (this.drawing.currentStroke) {
                    const prev = this.drawing.currentStroke.points[this.drawing.currentStroke.points.length - 2];
                    ctx.strokeStyle = colorPicker.value;
                    ctx.lineWidth = brushSize.value;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(prev.x, prev.y);
                    ctx.lineTo(point.x, point.y);
                    ctx.stroke();
                }
            }
        });

        canvas.addEventListener('mouseup', () => {
            if (isDrawing) {
                isDrawing = false;
                this.endDrawing();
            }
        });

        clearBtn.addEventListener('click', () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            this.drawing.strokes = [];
            this.broadcast({
                type: 'drawing:clear',
                data: {}
            });
        });

        // Handle remote drawing
        this.on('drawing:remote', ({ stroke }) => {
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            stroke.points.forEach((point, i) => {
                if (i === 0) {
                    ctx.moveTo(point.x, point.y);
                } else {
                    ctx.lineTo(point.x, point.y);
                }
            });
            ctx.stroke();
        });
    }

    /**
     * Add participant to UI
     */
    addParticipant(peerId) {
        const list = document.querySelector('.participants-list');
        if (!list) return;

        const participant = document.createElement('div');
        participant.className = 'participant';
        participant.setAttribute('data-peer-id', peerId);
        participant.innerHTML = `
            <div class="participant-avatar">${peerId.substr(0, 2).toUpperCase()}</div>
            <span class="participant-name">${peerId}</span>
        `;

        list.appendChild(participant);
    }

    /**
     * Remove participant from UI
     */
    removeParticipant(peerId) {
        const participant = document.querySelector(`.participant[data-peer-id="${peerId}"]`);
        if (participant) {
            participant.remove();
        }
    }

    /**
     * Add chat message
     */
    addChatMessage(userId, message) {
        const messages = document.querySelector('.chat-messages');
        if (!messages) return;

        const messageEl = document.createElement('div');
        messageEl.className = 'chat-message';
        messageEl.innerHTML = `
            <span class="chat-message-user">${userId}:</span>
            <span class="chat-message-text">${message}</span>
        `;

        messages.appendChild(messageEl);
        messages.scrollTop = messages.scrollHeight;
    }

    /**
     * Handle chat message
     */
    handleChatMessage(peerId, data) {
        this.addChatMessage(peerId, data.message);
        this.emit('chat:message', { peerId, ...data });
    }

    /**
     * Cleanup
     */
    destroy() {
        // Leave room
        if (this.roomId) {
            this.leaveRoom();
        }

        // Close signal socket
        if (this.signalSocket) {
            this.signalSocket.close();
        }

        // Clear intervals
        clearInterval(this.presenceInterval);

        // Clear callbacks
        this.callbacks.clear();
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebRTCCollaboration;
} else {
    window.WebRTCCollaboration = WebRTCCollaboration;
}