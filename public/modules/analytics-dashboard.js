/**
 * Usage Analytics Dashboard Module
 * Comprehensive analytics solution with:
 * - Real-time metrics
 * - Interactive charts
 * - User behavior tracking
 * - Performance monitoring
 * - Custom events
 * - Export capabilities
 */

class AnalyticsDashboard {
    constructor(config = {}) {
        this.config = {
            apiEndpoint: config.apiEndpoint || '/api/analytics',
            updateInterval: config.updateInterval || 30000, // 30 seconds
            maxDataPoints: config.maxDataPoints || 100,
            timeRanges: config.timeRanges || ['1h', '24h', '7d', '30d', '90d'],
            defaultRange: config.defaultRange || '24h',
            trackingEnabled: config.trackingEnabled !== false,
            ...config
        };

        // Analytics data
        this.metrics = {
            realtime: {},
            historical: {},
            events: [],
            sessions: [],
            errors: []
        };

        // Chart instances
        this.charts = new Map();

        // Tracking state
        this.sessionId = this.generateSessionId();
        this.userId = this.getUserId();
        this.startTime = Date.now();
        this.lastActivity = Date.now();
        this.pageViews = 0;
        this.interactions = 0;

        // Performance observer
        this.performanceObserver = null;

        // Initialize
        this.init();
    }

    /**
     * Initialize analytics
     */
    async init() {
        // Load chart library
        await this.loadChartLibrary();

        // Set up tracking
        if (this.config.trackingEnabled) {
            this.setupTracking();
        }

        // Set up performance monitoring
        this.setupPerformanceMonitoring();

        // Load initial data
        await this.loadAnalyticsData();

        // Start real-time updates
        this.startRealTimeUpdates();

        // Set up event listeners
        this.setupEventListeners();
    }

    /**
     * Load Chart.js library
     */
    async loadChartLibrary() {
        return new Promise((resolve, reject) => {
            if (window.Chart) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Set up tracking
     */
    setupTracking() {
        // Track page views
        this.trackPageView();

        // Track clicks
        document.addEventListener('click', (e) => {
            this.trackEvent('click', {
                target: e.target.tagName,
                text: e.target.textContent?.substring(0, 50),
                x: e.clientX,
                y: e.clientY
            });
        });

        // Track form submissions
        document.addEventListener('submit', (e) => {
            this.trackEvent('form_submit', {
                formId: e.target.id,
                formName: e.target.name
            });
        });

        // Track errors
        window.addEventListener('error', (e) => {
            this.trackError({
                message: e.message,
                source: e.filename,
                line: e.lineno,
                column: e.colno,
                stack: e.error?.stack
            });
        });

        // Track unhandled promise rejections
        window.addEventListener('unhandledrejection', (e) => {
            this.trackError({
                message: e.reason?.message || e.reason,
                type: 'unhandled_rejection',
                stack: e.reason?.stack
            });
        });

        // Track visibility changes
        document.addEventListener('visibilitychange', () => {
            this.trackEvent('visibility_change', {
                hidden: document.hidden,
                state: document.visibilityState
            });
        });

        // Track beforeunload
        window.addEventListener('beforeunload', () => {
            this.endSession();
        });

        // Track user activity
        ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
            document.addEventListener(event, () => {
                this.lastActivity = Date.now();
                this.interactions++;
            }, { passive: true });
        });

        // Track idle time
        setInterval(() => {
            const idleTime = Date.now() - this.lastActivity;
            if (idleTime > 60000) { // 1 minute
                this.trackEvent('user_idle', { duration: idleTime });
            }
        }, 60000);
    }

    /**
     * Set up performance monitoring
     */
    setupPerformanceMonitoring() {
        // Use Performance Observer API
        if ('PerformanceObserver' in window) {
            // Observe navigation timing
            const navObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    this.trackPerformance('navigation', {
                        domContentLoaded: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
                        loadComplete: entry.loadEventEnd - entry.loadEventStart,
                        domInteractive: entry.domInteractive,
                        firstPaint: entry.fetchStart
                    });
                }
            });

            try {
                navObserver.observe({ type: 'navigation', buffered: true });
            } catch (e) {
                // Fallback for browsers that don't support this
            }

            // Observe resource timing
            const resObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.duration > 1000) { // Track slow resources
                        this.trackPerformance('slow_resource', {
                            name: entry.name,
                            duration: entry.duration,
                            type: entry.initiatorType
                        });
                    }
                }
            });

            try {
                resObserver.observe({ type: 'resource', buffered: true });
            } catch (e) {
                // Fallback
            }

            // Observe long tasks
            if ('PerformanceObserver' in window && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
                const taskObserver = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        this.trackPerformance('long_task', {
                            duration: entry.duration,
                            startTime: entry.startTime,
                            name: entry.name
                        });
                    }
                });

                taskObserver.observe({ type: 'longtask' });
            }
        }

        // Track memory usage if available
        if (performance.memory) {
            setInterval(() => {
                this.trackPerformance('memory', {
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    totalJSHeapSize: performance.memory.totalJSHeapSize,
                    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
                });
            }, 30000);
        }

        // Track FPS
        this.trackFPS();
    }

    /**
     * Track FPS
     */
    trackFPS() {
        let lastTime = performance.now();
        let frames = 0;
        let fps = 0;

        const measureFPS = () => {
            frames++;
            const currentTime = performance.now();

            if (currentTime >= lastTime + 1000) {
                fps = Math.round(frames * 1000 / (currentTime - lastTime));
                frames = 0;
                lastTime = currentTime;

                this.updateMetric('fps', fps);
            }

            requestAnimationFrame(measureFPS);
        };

        requestAnimationFrame(measureFPS);
    }

    /**
     * Load analytics data
     */
    async loadAnalyticsData(timeRange = this.config.defaultRange) {
        try {
            const response = await fetch(`${this.config.apiEndpoint}/data?range=${timeRange}`, {
                headers: {
                    'Authorization': `Bearer ${this.getAuthToken()}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.metrics.historical = data;
                this.updateCharts();
            }
        } catch (error) {
            console.error('Failed to load analytics data:', error);
        }
    }

    /**
     * Start real-time updates
     */
    startRealTimeUpdates() {
        // Update real-time metrics
        setInterval(() => {
            this.updateRealTimeMetrics();
        }, 1000);

        // Fetch new data periodically
        setInterval(() => {
            this.loadAnalyticsData();
        }, this.config.updateInterval);
    }

    /**
     * Update real-time metrics
     */
    updateRealTimeMetrics() {
        const now = Date.now();
        const sessionDuration = now - this.startTime;

        this.metrics.realtime = {
            activeUsers: this.getActiveUsers(),
            pageViews: this.pageViews,
            interactions: this.interactions,
            sessionDuration: Math.floor(sessionDuration / 1000),
            avgResponseTime: this.calculateAvgResponseTime(),
            errorRate: this.calculateErrorRate(),
            cpuUsage: this.getCPUUsage(),
            memoryUsage: this.getMemoryUsage(),
            bandwidth: this.getBandwidth()
        };

        // Emit update event
        this.emit('metrics:updated', this.metrics.realtime);
    }

    /**
     * Track page view
     */
    trackPageView(page = window.location.pathname) {
        this.pageViews++;

        this.trackEvent('page_view', {
            page,
            referrer: document.referrer,
            title: document.title,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            viewportSize: `${window.innerWidth}x${window.innerHeight}`,
            colorDepth: window.screen.colorDepth,
            pixelRatio: window.devicePixelRatio
        });
    }

    /**
     * Track event
     */
    trackEvent(eventName, properties = {}) {
        const event = {
            name: eventName,
            properties,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            userId: this.userId,
            page: window.location.pathname,
            userAgent: navigator.userAgent
        };

        this.metrics.events.push(event);

        // Send to server
        this.sendEvent(event);

        // Limit stored events
        if (this.metrics.events.length > 1000) {
            this.metrics.events = this.metrics.events.slice(-500);
        }
    }

    /**
     * Track error
     */
    trackError(error) {
        const errorData = {
            ...error,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            userId: this.userId,
            page: window.location.href,
            userAgent: navigator.userAgent
        };

        this.metrics.errors.push(errorData);

        // Send to server
        this.sendError(errorData);

        // Emit error event
        this.emit('error:tracked', errorData);
    }

    /**
     * Track performance
     */
    trackPerformance(type, data) {
        const perfData = {
            type,
            data,
            timestamp: Date.now(),
            sessionId: this.sessionId
        };

        this.sendPerformance(perfData);
    }

    /**
     * Track custom metric
     */
    trackMetric(name, value, unit = '') {
        this.updateMetric(name, value);

        this.trackEvent('custom_metric', {
            name,
            value,
            unit
        });
    }

    /**
     * Update metric
     */
    updateMetric(name, value) {
        if (!this.metrics.realtime[name]) {
            this.metrics.realtime[name] = [];
        }

        this.metrics.realtime[name].push({
            value,
            timestamp: Date.now()
        });

        // Limit data points
        if (this.metrics.realtime[name].length > this.config.maxDataPoints) {
            this.metrics.realtime[name].shift();
        }
    }

    /**
     * Send event to server
     */
    async sendEvent(event) {
        if (!this.config.trackingEnabled) return;

        try {
            await fetch(`${this.config.apiEndpoint}/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify(event)
            });
        } catch (error) {
            console.error('Failed to send event:', error);
        }
    }

    /**
     * Send error to server
     */
    async sendError(error) {
        try {
            await fetch(`${this.config.apiEndpoint}/errors`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify(error)
            });
        } catch (err) {
            console.error('Failed to send error:', err);
        }
    }

    /**
     * Send performance data
     */
    async sendPerformance(data) {
        try {
            await fetch(`${this.config.apiEndpoint}/performance`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify(data)
            });
        } catch (error) {
            console.error('Failed to send performance data:', error);
        }
    }

    /**
     * End session
     */
    endSession() {
        const sessionData = {
            sessionId: this.sessionId,
            userId: this.userId,
            duration: Date.now() - this.startTime,
            pageViews: this.pageViews,
            interactions: this.interactions,
            errors: this.metrics.errors.length
        };

        // Send session data
        navigator.sendBeacon(`${this.config.apiEndpoint}/sessions`, JSON.stringify(sessionData));
    }

    /**
     * Calculate average response time
     */
    calculateAvgResponseTime() {
        const timings = performance.getEntriesByType('resource');
        if (timings.length === 0) return 0;

        const total = timings.reduce((sum, timing) => sum + timing.duration, 0);
        return Math.round(total / timings.length);
    }

    /**
     * Calculate error rate
     */
    calculateErrorRate() {
        const recentErrors = this.metrics.errors.filter(e =>
            e.timestamp > Date.now() - 60000
        ).length;

        return (recentErrors / Math.max(this.interactions, 1)) * 100;
    }

    /**
     * Get active users (mock)
     */
    getActiveUsers() {
        // In production, this would query the server
        return Math.floor(Math.random() * 100) + 50;
    }

    /**
     * Get CPU usage (mock)
     */
    getCPUUsage() {
        // In production, this would use actual metrics
        return Math.random() * 100;
    }

    /**
     * Get memory usage
     */
    getMemoryUsage() {
        if (performance.memory) {
            return (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100;
        }
        return Math.random() * 100;
    }

    /**
     * Get bandwidth
     */
    getBandwidth() {
        // Estimate based on resource timing
        const resources = performance.getEntriesByType('resource');
        const recent = resources.slice(-10);

        if (recent.length === 0) return 0;

        const totalBytes = recent.reduce((sum, r) => sum + (r.transferSize || 0), 0);
        const totalTime = recent.reduce((sum, r) => sum + r.duration, 0);

        return totalTime > 0 ? (totalBytes / totalTime) * 1000 : 0; // bytes per second
    }

    /**
     * Generate session ID
     */
    generateSessionId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    /**
     * Get user ID
     */
    getUserId() {
        let userId = localStorage.getItem('analyticsUserId');
        if (!userId) {
            userId = this.generateSessionId();
            localStorage.setItem('analyticsUserId', userId);
        }
        return userId;
    }

    /**
     * Get auth token
     */
    getAuthToken() {
        return localStorage.getItem('authToken') || '';
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Custom events from the app
        document.addEventListener('analytics:track', (e) => {
            this.trackEvent(e.detail.name, e.detail.properties);
        });

        document.addEventListener('analytics:metric', (e) => {
            this.trackMetric(e.detail.name, e.detail.value, e.detail.unit);
        });
    }

    /**
     * Create dashboard UI
     */
    createDashboard(container) {
        const dashboard = document.createElement('div');
        dashboard.className = 'analytics-dashboard';
        dashboard.innerHTML = `
            <div class="dashboard-header">
                <h2>Analytics Dashboard</h2>
                <div class="dashboard-controls">
                    <select class="time-range-selector">
                        ${this.config.timeRanges.map(range => `
                            <option value="${range}" ${range === this.config.defaultRange ? 'selected' : ''}>
                                ${this.formatTimeRange(range)}
                            </option>
                        `).join('')}
                    </select>
                    <button class="refresh-btn" title="Refresh">
                        <svg viewBox="0 0 24 24">
                            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                        </svg>
                    </button>
                    <button class="export-btn" title="Export">
                        <svg viewBox="0 0 24 24">
                            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                        </svg>
                    </button>
                    <button class="fullscreen-btn" title="Fullscreen">
                        <svg viewBox="0 0 24 24">
                            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="dashboard-content">
                <!-- Real-time Metrics -->
                <div class="metrics-section">
                    <h3>Real-time Metrics</h3>
                    <div class="metrics-grid">
                        <div class="metric-card">
                            <div class="metric-value" data-metric="activeUsers">0</div>
                            <div class="metric-label">Active Users</div>
                            <div class="metric-change positive">+12%</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value" data-metric="pageViews">0</div>
                            <div class="metric-label">Page Views</div>
                            <div class="metric-change positive">+5%</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value" data-metric="avgResponseTime">0ms</div>
                            <div class="metric-label">Avg Response Time</div>
                            <div class="metric-change negative">-8%</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value" data-metric="errorRate">0%</div>
                            <div class="metric-label">Error Rate</div>
                            <div class="metric-change positive">-15%</div>
                        </div>
                    </div>
                </div>

                <!-- Charts -->
                <div class="charts-section">
                    <div class="chart-container">
                        <h3>Traffic Overview</h3>
                        <canvas id="traffic-chart"></canvas>
                    </div>

                    <div class="chart-container">
                        <h3>Performance Metrics</h3>
                        <canvas id="performance-chart"></canvas>
                    </div>

                    <div class="chart-container">
                        <h3>User Activity</h3>
                        <canvas id="activity-chart"></canvas>
                    </div>

                    <div class="chart-container">
                        <h3>Error Distribution</h3>
                        <canvas id="error-chart"></canvas>
                    </div>
                </div>

                <!-- Events Log -->
                <div class="events-section">
                    <h3>Recent Events</h3>
                    <div class="events-filters">
                        <input type="search" class="event-search" placeholder="Search events...">
                        <select class="event-type-filter">
                            <option value="">All Events</option>
                            <option value="page_view">Page Views</option>
                            <option value="click">Clicks</option>
                            <option value="form_submit">Form Submits</option>
                            <option value="custom">Custom</option>
                        </select>
                    </div>
                    <div class="events-list"></div>
                </div>

                <!-- Errors Log -->
                <div class="errors-section">
                    <h3>Error Tracking</h3>
                    <div class="errors-summary">
                        <div class="error-stat">
                            <span class="error-count">0</span>
                            <span class="error-label">Total Errors</span>
                        </div>
                        <div class="error-stat">
                            <span class="error-count">0</span>
                            <span class="error-label">Unique Errors</span>
                        </div>
                        <div class="error-stat">
                            <span class="error-count">0</span>
                            <span class="error-label">Affected Users</span>
                        </div>
                    </div>
                    <div class="errors-list"></div>
                </div>

                <!-- Heatmap -->
                <div class="heatmap-section">
                    <h3>Click Heatmap</h3>
                    <div class="heatmap-container">
                        <canvas id="heatmap-canvas"></canvas>
                    </div>
                </div>

                <!-- User Flow -->
                <div class="userflow-section">
                    <h3>User Flow</h3>
                    <div class="userflow-container">
                        <canvas id="userflow-canvas"></canvas>
                    </div>
                </div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .analytics-dashboard {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: #f5f7fa;
                padding: 20px;
                min-height: 100vh;
            }

            .dashboard-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 30px;
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }

            .dashboard-header h2 {
                margin: 0;
                font-size: 1.8em;
                color: #1a1a1a;
            }

            .dashboard-controls {
                display: flex;
                gap: 10px;
                align-items: center;
            }

            .time-range-selector {
                padding: 8px 12px;
                border: 1px solid #ddd;
                border-radius: 6px;
                background: white;
                font-size: 14px;
            }

            .refresh-btn, .export-btn, .fullscreen-btn {
                width: 36px;
                height: 36px;
                border: none;
                border-radius: 6px;
                background: white;
                border: 1px solid #ddd;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .refresh-btn:hover, .export-btn:hover, .fullscreen-btn:hover {
                background: #f0f0f0;
            }

            .dashboard-controls svg {
                width: 20px;
                height: 20px;
                fill: #666;
            }

            .metrics-section {
                margin-bottom: 30px;
            }

            .metrics-section h3 {
                margin: 0 0 20px 0;
                font-size: 1.2em;
                color: #666;
            }

            .metrics-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
            }

            .metric-card {
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }

            .metric-value {
                font-size: 2em;
                font-weight: 700;
                color: #1a1a1a;
                margin-bottom: 5px;
            }

            .metric-label {
                font-size: 0.9em;
                color: #666;
                margin-bottom: 10px;
            }

            .metric-change {
                font-size: 0.85em;
                font-weight: 600;
            }

            .metric-change.positive {
                color: #28a745;
            }

            .metric-change.negative {
                color: #dc3545;
            }

            .charts-section {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }

            .chart-container {
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }

            .chart-container h3 {
                margin: 0 0 20px 0;
                font-size: 1.1em;
                color: #333;
            }

            .chart-container canvas {
                max-height: 300px;
            }

            .events-section, .errors-section {
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                margin-bottom: 20px;
            }

            .events-section h3, .errors-section h3 {
                margin: 0 0 20px 0;
                font-size: 1.1em;
                color: #333;
            }

            .events-filters {
                display: flex;
                gap: 10px;
                margin-bottom: 20px;
            }

            .event-search {
                flex: 1;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 6px;
            }

            .event-type-filter {
                padding: 8px 12px;
                border: 1px solid #ddd;
                border-radius: 6px;
                background: white;
            }

            .events-list, .errors-list {
                max-height: 400px;
                overflow-y: auto;
            }

            .event-item, .error-item {
                padding: 12px;
                border-bottom: 1px solid #f0f0f0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .event-item:hover, .error-item:hover {
                background: #f8f9fa;
            }

            .event-name, .error-message {
                font-weight: 600;
                color: #333;
            }

            .event-time, .error-time {
                font-size: 0.85em;
                color: #999;
            }

            .event-details, .error-details {
                font-size: 0.9em;
                color: #666;
                margin-top: 4px;
            }

            .errors-summary {
                display: flex;
                gap: 30px;
                margin-bottom: 20px;
                padding-bottom: 20px;
                border-bottom: 1px solid #e0e0e0;
            }

            .error-stat {
                display: flex;
                flex-direction: column;
            }

            .error-count {
                font-size: 1.8em;
                font-weight: 700;
                color: #dc3545;
            }

            .error-label {
                font-size: 0.9em;
                color: #666;
                margin-top: 4px;
            }

            .heatmap-section, .userflow-section {
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                margin-bottom: 20px;
            }

            .heatmap-section h3, .userflow-section h3 {
                margin: 0 0 20px 0;
                font-size: 1.1em;
                color: #333;
            }

            .heatmap-container, .userflow-container {
                position: relative;
                height: 400px;
                background: #f8f9fa;
                border-radius: 4px;
            }

            #heatmap-canvas, #userflow-canvas {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
            }

            /* Loading animation */
            .loading {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid #007bff;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            /* Responsive */
            @media (max-width: 768px) {
                .charts-section {
                    grid-template-columns: 1fr;
                }

                .metrics-grid {
                    grid-template-columns: 1fr;
                }
            }
        `;
        document.head.appendChild(style);

        container.appendChild(dashboard);

        // Initialize charts
        this.initializeCharts();

        // Set up event handlers
        this.setupDashboardHandlers(dashboard);

        // Start updating UI
        this.startUIUpdates();

        return dashboard;
    }

    /**
     * Initialize charts
     */
    initializeCharts() {
        // Traffic chart
        const trafficCtx = document.getElementById('traffic-chart')?.getContext('2d');
        if (trafficCtx) {
            this.charts.set('traffic', new Chart(trafficCtx, {
                type: 'line',
                data: {
                    labels: this.generateTimeLabels(),
                    datasets: [{
                        label: 'Page Views',
                        data: this.generateMockData(),
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        tension: 0.4
                    }, {
                        label: 'Unique Visitors',
                        data: this.generateMockData(),
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom'
                        }
                    }
                }
            }));
        }

        // Performance chart
        const perfCtx = document.getElementById('performance-chart')?.getContext('2d');
        if (perfCtx) {
            this.charts.set('performance', new Chart(perfCtx, {
                type: 'line',
                data: {
                    labels: this.generateTimeLabels(),
                    datasets: [{
                        label: 'Response Time (ms)',
                        data: this.generateMockData(100, 500),
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        tension: 0.4
                    }, {
                        label: 'CPU Usage (%)',
                        data: this.generateMockData(0, 100),
                        borderColor: 'rgb(255, 206, 86)',
                        backgroundColor: 'rgba(255, 206, 86, 0.2)',
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom'
                        }
                    }
                }
            }));
        }

        // Activity chart
        const activityCtx = document.getElementById('activity-chart')?.getContext('2d');
        if (activityCtx) {
            this.charts.set('activity', new Chart(activityCtx, {
                type: 'bar',
                data: {
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                    datasets: [{
                        label: 'Active Users',
                        data: [120, 190, 300, 250, 220, 180, 150],
                        backgroundColor: 'rgba(75, 192, 192, 0.6)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            }));
        }

        // Error chart
        const errorCtx = document.getElementById('error-chart')?.getContext('2d');
        if (errorCtx) {
            this.charts.set('error', new Chart(errorCtx, {
                type: 'doughnut',
                data: {
                    labels: ['JavaScript', 'Network', 'API', 'Other'],
                    datasets: [{
                        data: [30, 25, 35, 10],
                        backgroundColor: [
                            'rgba(255, 99, 132, 0.6)',
                            'rgba(54, 162, 235, 0.6)',
                            'rgba(255, 206, 86, 0.6)',
                            'rgba(75, 192, 192, 0.6)'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'right'
                        }
                    }
                }
            }));
        }
    }

    /**
     * Generate time labels
     */
    generateTimeLabels() {
        const labels = [];
        for (let i = 23; i >= 0; i--) {
            const time = new Date(Date.now() - i * 60 * 60 * 1000);
            labels.push(time.getHours() + ':00');
        }
        return labels;
    }

    /**
     * Generate mock data
     */
    generateMockData(min = 0, max = 1000) {
        return Array.from({ length: 24 }, () =>
            Math.floor(Math.random() * (max - min)) + min
        );
    }

    /**
     * Update charts
     */
    updateCharts() {
        this.charts.forEach((chart, name) => {
            if (this.metrics.historical[name]) {
                // Update with real data
                chart.data.datasets.forEach((dataset, index) => {
                    dataset.data = this.metrics.historical[name][index] || dataset.data;
                });
                chart.update();
            }
        });
    }

    /**
     * Set up dashboard handlers
     */
    setupDashboardHandlers(dashboard) {
        // Time range selector
        dashboard.querySelector('.time-range-selector')?.addEventListener('change', (e) => {
            this.loadAnalyticsData(e.target.value);
        });

        // Refresh button
        dashboard.querySelector('.refresh-btn')?.addEventListener('click', () => {
            this.loadAnalyticsData();
        });

        // Export button
        dashboard.querySelector('.export-btn')?.addEventListener('click', () => {
            this.exportAnalytics();
        });

        // Fullscreen button
        dashboard.querySelector('.fullscreen-btn')?.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                dashboard.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        });

        // Event search
        dashboard.querySelector('.event-search')?.addEventListener('input', (e) => {
            this.filterEvents(e.target.value);
        });

        // Event type filter
        dashboard.querySelector('.event-type-filter')?.addEventListener('change', (e) => {
            this.filterEventsByType(e.target.value);
        });
    }

    /**
     * Start UI updates
     */
    startUIUpdates() {
        setInterval(() => {
            this.updateMetricsUI();
            this.updateEventsUI();
            this.updateErrorsUI();
        }, 1000);
    }

    /**
     * Update metrics UI
     */
    updateMetricsUI() {
        Object.entries(this.metrics.realtime).forEach(([key, value]) => {
            const element = document.querySelector(`[data-metric="${key}"]`);
            if (element) {
                if (key === 'avgResponseTime') {
                    element.textContent = `${value}ms`;
                } else if (key === 'errorRate') {
                    element.textContent = `${value.toFixed(2)}%`;
                } else {
                    element.textContent = value;
                }
            }
        });
    }

    /**
     * Update events UI
     */
    updateEventsUI() {
        const eventsList = document.querySelector('.events-list');
        if (!eventsList) return;

        const recentEvents = this.metrics.events.slice(-10).reverse();
        eventsList.innerHTML = recentEvents.map(event => `
            <div class="event-item">
                <div>
                    <div class="event-name">${event.name}</div>
                    <div class="event-details">${JSON.stringify(event.properties).substring(0, 100)}...</div>
                </div>
                <div class="event-time">${new Date(event.timestamp).toLocaleTimeString()}</div>
            </div>
        `).join('');
    }

    /**
     * Update errors UI
     */
    updateErrorsUI() {
        const errorsList = document.querySelector('.errors-list');
        if (!errorsList) return;

        const recentErrors = this.metrics.errors.slice(-10).reverse();
        errorsList.innerHTML = recentErrors.map(error => `
            <div class="error-item">
                <div>
                    <div class="error-message">${error.message}</div>
                    <div class="error-details">${error.source || 'Unknown'} (Line ${error.line || '?'})</div>
                </div>
                <div class="error-time">${new Date(error.timestamp).toLocaleTimeString()}</div>
            </div>
        `).join('');

        // Update error summary
        document.querySelector('.errors-section .error-count').textContent = this.metrics.errors.length;
    }

    /**
     * Filter events
     */
    filterEvents(searchTerm) {
        const filtered = this.metrics.events.filter(event =>
            event.name.includes(searchTerm) ||
            JSON.stringify(event.properties).includes(searchTerm)
        );

        this.displayFilteredEvents(filtered);
    }

    /**
     * Filter events by type
     */
    filterEventsByType(type) {
        const filtered = type ?
            this.metrics.events.filter(event => event.name === type) :
            this.metrics.events;

        this.displayFilteredEvents(filtered);
    }

    /**
     * Display filtered events
     */
    displayFilteredEvents(events) {
        const eventsList = document.querySelector('.events-list');
        if (!eventsList) return;

        eventsList.innerHTML = events.slice(-10).reverse().map(event => `
            <div class="event-item">
                <div>
                    <div class="event-name">${event.name}</div>
                    <div class="event-details">${JSON.stringify(event.properties).substring(0, 100)}...</div>
                </div>
                <div class="event-time">${new Date(event.timestamp).toLocaleTimeString()}</div>
            </div>
        `).join('');
    }

    /**
     * Export analytics
     */
    async exportAnalytics() {
        const data = {
            metrics: this.metrics,
            exported: new Date().toISOString(),
            timeRange: document.querySelector('.time-range-selector')?.value
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    /**
     * Format time range
     */
    formatTimeRange(range) {
        const formats = {
            '1h': 'Last Hour',
            '24h': 'Last 24 Hours',
            '7d': 'Last 7 Days',
            '30d': 'Last 30 Days',
            '90d': 'Last 90 Days'
        };
        return formats[range] || range;
    }

    /**
     * Event emitter
     */
    emit(event, data) {
        document.dispatchEvent(new CustomEvent(`analytics:${event}`, { detail: data }));
    }

    /**
     * Cleanup
     */
    destroy() {
        // Stop observers
        if (this.performanceObserver) {
            this.performanceObserver.disconnect();
        }

        // Clear intervals
        clearInterval(this.updateInterval);
        clearInterval(this.metricsInterval);

        // Destroy charts
        this.charts.forEach(chart => chart.destroy());

        // End session
        this.endSession();
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnalyticsDashboard;
} else {
    window.AnalyticsDashboard = AnalyticsDashboard;
}