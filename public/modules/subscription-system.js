/**
 * Stripe Subscription System Module
 * Complete monetization solution with:
 * - Multiple pricing tiers
 * - Payment processing
 * - Billing management
 * - Usage-based billing
 * - Customer portal
 * - Invoice management
 */

class SubscriptionSystem {
    constructor(config = {}) {
        this.config = {
            stripePublicKey: config.stripePublicKey || 'pk_test_51234567890',
            apiEndpoint: config.apiEndpoint || '/api/subscriptions',
            currency: config.currency || 'usd',
            locale: config.locale || 'en',
            plans: config.plans || this.getDefaultPlans(),
            features: config.features || this.getDefaultFeatures(),
            ...config
        };

        // Initialize Stripe
        this.stripe = null;
        this.elements = null;

        // Subscription state
        this.currentSubscription = null;
        this.customer = null;
        this.paymentMethods = [];
        this.invoices = [];
        this.usageData = {};

        // Cache
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes

        this.init();
    }

    /**
     * Initialize subscription system
     */
    async init() {
        // Load Stripe.js
        await this.loadStripe();

        // Initialize customer session
        await this.initializeCustomer();

        // Set up usage tracking
        this.setupUsageTracking();

        // Set up webhook handlers
        this.setupWebhooks();
    }

    /**
     * Load Stripe.js library
     */
    async loadStripe() {
        return new Promise((resolve, reject) => {
            if (window.Stripe) {
                this.stripe = window.Stripe(this.config.stripePublicKey);
                this.elements = this.stripe.elements();
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://js.stripe.com/v3/';
            script.onload = () => {
                this.stripe = window.Stripe(this.config.stripePublicKey);
                this.elements = this.stripe.elements();
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Get default subscription plans
     */
    getDefaultPlans() {
        return [
            {
                id: 'free',
                name: 'Free',
                price: 0,
                interval: 'month',
                features: ['basic_chat', 'history_7days', 'export_limited'],
                limits: {
                    messagesPerDay: 50,
                    storageGB: 1,
                    apiCalls: 100
                }
            },
            {
                id: 'starter',
                name: 'Starter',
                price: 9.99,
                interval: 'month',
                priceId: 'price_starter_monthly',
                features: ['unlimited_chat', 'history_30days', 'export_all', 'voice_assistant', 'code_editor'],
                limits: {
                    messagesPerDay: 500,
                    storageGB: 10,
                    apiCalls: 1000,
                    teamMembers: 3
                },
                popular: true
            },
            {
                id: 'professional',
                name: 'Professional',
                price: 29.99,
                interval: 'month',
                priceId: 'price_pro_monthly',
                features: ['unlimited_chat', 'history_unlimited', 'export_all', 'voice_assistant', 'code_editor', 'team_collaboration', 'priority_support', 'custom_models'],
                limits: {
                    messagesPerDay: 5000,
                    storageGB: 100,
                    apiCalls: 10000,
                    teamMembers: 10
                }
            },
            {
                id: 'enterprise',
                name: 'Enterprise',
                price: 'custom',
                interval: 'month',
                features: ['all_features', 'sla', 'dedicated_support', 'custom_integration', 'white_label', 'on_premise'],
                limits: {
                    messagesPerDay: 'unlimited',
                    storageGB: 'unlimited',
                    apiCalls: 'unlimited',
                    teamMembers: 'unlimited'
                }
            }
        ];
    }

    /**
     * Get default feature definitions
     */
    getDefaultFeatures() {
        return {
            basic_chat: 'Basic AI Chat',
            unlimited_chat: 'Unlimited AI Chat',
            history_7days: '7-day Message History',
            history_30days: '30-day Message History',
            history_unlimited: 'Unlimited Message History',
            export_limited: 'Export to TXT',
            export_all: 'Export All Formats',
            voice_assistant: 'Voice Assistant',
            code_editor: 'Code Editor with Execution',
            team_collaboration: 'Team Collaboration',
            priority_support: '24/7 Priority Support',
            custom_models: 'Custom AI Models',
            all_features: 'All Features Included',
            sla: '99.9% SLA',
            dedicated_support: 'Dedicated Account Manager',
            custom_integration: 'Custom Integrations',
            white_label: 'White Label Solution',
            on_premise: 'On-Premise Deployment'
        };
    }

    /**
     * Initialize customer session
     */
    async initializeCustomer() {
        try {
            // Get or create customer
            const response = await fetch(`${this.config.apiEndpoint}/customer`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.customer = data.customer;
                this.currentSubscription = data.subscription;
                this.paymentMethods = data.paymentMethods || [];
            }
        } catch (error) {
            console.error('Failed to initialize customer:', error);
        }
    }

    /**
     * Create subscription checkout
     */
    async createCheckout(planId, options = {}) {
        try {
            const plan = this.config.plans.find(p => p.id === planId);
            if (!plan) {
                throw new Error('Invalid plan');
            }

            // Create checkout session
            const response = await fetch(`${this.config.apiEndpoint}/create-checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify({
                    priceId: plan.priceId,
                    quantity: options.quantity || 1,
                    successUrl: options.successUrl || window.location.href,
                    cancelUrl: options.cancelUrl || window.location.href,
                    metadata: options.metadata
                })
            });

            const { sessionId } = await response.json();

            // Redirect to Stripe Checkout
            const { error } = await this.stripe.redirectToCheckout({ sessionId });

            if (error) {
                throw error;
            }

            return { success: true, sessionId };
        } catch (error) {
            console.error('Checkout failed:', error);
            throw error;
        }
    }

    /**
     * Create payment element for embedded checkout
     */
    createPaymentElement(container, options = {}) {
        const paymentElement = this.elements.create('payment', {
            layout: options.layout || 'tabs',
            paymentMethodOrder: options.order || ['card', 'apple_pay', 'google_pay'],
            fields: {
                billingDetails: {
                    address: options.collectAddress || 'auto'
                }
            }
        });

        paymentElement.mount(container);

        // Handle payment submission
        const form = container.closest('form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handlePayment(paymentElement, options);
            });
        }

        return paymentElement;
    }

    /**
     * Handle payment submission
     */
    async handlePayment(paymentElement, options = {}) {
        try {
            // Create payment intent
            const response = await fetch(`${this.config.apiEndpoint}/create-payment-intent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify({
                    amount: options.amount,
                    currency: this.config.currency,
                    metadata: options.metadata
                })
            });

            const { clientSecret } = await response.json();

            // Confirm payment
            const { error, paymentIntent } = await this.stripe.confirmPayment({
                elements: this.elements,
                clientSecret,
                confirmParams: {
                    return_url: options.returnUrl || window.location.href
                },
                redirect: options.redirect !== false ? 'if_required' : 'never'
            });

            if (error) {
                throw error;
            }

            if (paymentIntent.status === 'succeeded') {
                return { success: true, paymentIntent };
            }
        } catch (error) {
            console.error('Payment failed:', error);
            throw error;
        }
    }

    /**
     * Update subscription
     */
    async updateSubscription(planId, options = {}) {
        try {
            const response = await fetch(`${this.config.apiEndpoint}/update-subscription`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify({
                    subscriptionId: this.currentSubscription.id,
                    priceId: this.config.plans.find(p => p.id === planId)?.priceId,
                    quantity: options.quantity,
                    prorationBehavior: options.proration || 'create_prorations'
                })
            });

            const updatedSubscription = await response.json();
            this.currentSubscription = updatedSubscription;

            return updatedSubscription;
        } catch (error) {
            console.error('Failed to update subscription:', error);
            throw error;
        }
    }

    /**
     * Cancel subscription
     */
    async cancelSubscription(options = {}) {
        try {
            const response = await fetch(`${this.config.apiEndpoint}/cancel-subscription`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify({
                    subscriptionId: this.currentSubscription.id,
                    cancelAtPeriodEnd: options.atPeriodEnd !== false,
                    feedback: options.feedback
                })
            });

            const result = await response.json();

            if (options.atPeriodEnd) {
                this.currentSubscription.cancelAtPeriodEnd = true;
            } else {
                this.currentSubscription = null;
            }

            return result;
        } catch (error) {
            console.error('Failed to cancel subscription:', error);
            throw error;
        }
    }

    /**
     * Resume canceled subscription
     */
    async resumeSubscription() {
        try {
            const response = await fetch(`${this.config.apiEndpoint}/resume-subscription`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify({
                    subscriptionId: this.currentSubscription.id
                })
            });

            const resumedSubscription = await response.json();
            this.currentSubscription = resumedSubscription;

            return resumedSubscription;
        } catch (error) {
            console.error('Failed to resume subscription:', error);
            throw error;
        }
    }

    /**
     * Add payment method
     */
    async addPaymentMethod(paymentMethodId, setAsDefault = false) {
        try {
            const response = await fetch(`${this.config.apiEndpoint}/add-payment-method`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify({
                    paymentMethodId,
                    setAsDefault
                })
            });

            const result = await response.json();
            this.paymentMethods = result.paymentMethods;

            return result;
        } catch (error) {
            console.error('Failed to add payment method:', error);
            throw error;
        }
    }

    /**
     * Remove payment method
     */
    async removePaymentMethod(paymentMethodId) {
        try {
            const response = await fetch(`${this.config.apiEndpoint}/remove-payment-method`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify({ paymentMethodId })
            });

            const result = await response.json();
            this.paymentMethods = this.paymentMethods.filter(pm => pm.id !== paymentMethodId);

            return result;
        } catch (error) {
            console.error('Failed to remove payment method:', error);
            throw error;
        }
    }

    /**
     * Get invoices
     */
    async getInvoices(options = {}) {
        try {
            const cacheKey = `invoices-${JSON.stringify(options)}`;
            const cached = this.getFromCache(cacheKey);
            if (cached) return cached;

            const response = await fetch(`${this.config.apiEndpoint}/invoices?${new URLSearchParams(options)}`, {
                headers: {
                    'Authorization': `Bearer ${this.getAuthToken()}`
                }
            });

            const invoices = await response.json();
            this.invoices = invoices;

            this.setCache(cacheKey, invoices);
            return invoices;
        } catch (error) {
            console.error('Failed to get invoices:', error);
            throw error;
        }
    }

    /**
     * Download invoice
     */
    async downloadInvoice(invoiceId) {
        try {
            const response = await fetch(`${this.config.apiEndpoint}/download-invoice/${invoiceId}`, {
                headers: {
                    'Authorization': `Bearer ${this.getAuthToken()}`
                }
            });

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `invoice-${invoiceId}.pdf`;
            a.click();

            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to download invoice:', error);
            throw error;
        }
    }

    /**
     * Track usage
     */
    async trackUsage(metric, quantity = 1, metadata = {}) {
        try {
            // Update local usage
            if (!this.usageData[metric]) {
                this.usageData[metric] = 0;
            }
            this.usageData[metric] += quantity;

            // Send to server
            const response = await fetch(`${this.config.apiEndpoint}/track-usage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify({
                    metric,
                    quantity,
                    timestamp: Date.now(),
                    metadata
                })
            });

            return response.json();
        } catch (error) {
            console.error('Failed to track usage:', error);
            // Queue for later retry
            this.queueUsageTracking({ metric, quantity, metadata });
        }
    }

    /**
     * Get usage statistics
     */
    async getUsageStats(period = 'current_period') {
        try {
            const response = await fetch(`${this.config.apiEndpoint}/usage-stats?period=${period}`, {
                headers: {
                    'Authorization': `Bearer ${this.getAuthToken()}`
                }
            });

            return response.json();
        } catch (error) {
            console.error('Failed to get usage stats:', error);
            throw error;
        }
    }

    /**
     * Check feature access
     */
    hasFeature(featureId) {
        if (!this.currentSubscription) {
            // Check free plan features
            const freePlan = this.config.plans.find(p => p.id === 'free');
            return freePlan?.features.includes(featureId) || false;
        }

        const plan = this.config.plans.find(p => p.priceId === this.currentSubscription.priceId);
        return plan?.features.includes(featureId) || false;
    }

    /**
     * Check usage limit
     */
    async checkLimit(metric) {
        if (!this.currentSubscription) {
            const freePlan = this.config.plans.find(p => p.id === 'free');
            return this.usageData[metric] < (freePlan?.limits[metric] || 0);
        }

        const plan = this.config.plans.find(p => p.priceId === this.currentSubscription.priceId);
        const limit = plan?.limits[metric];

        if (limit === 'unlimited') return true;

        const usage = await this.getUsageStats();
        return usage[metric] < limit;
    }

    /**
     * Get customer portal URL
     */
    async getCustomerPortalUrl(returnUrl = window.location.href) {
        try {
            const response = await fetch(`${this.config.apiEndpoint}/customer-portal`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify({ returnUrl })
            });

            const { url } = await response.json();
            return url;
        } catch (error) {
            console.error('Failed to get customer portal URL:', error);
            throw error;
        }
    }

    /**
     * Open customer portal
     */
    async openCustomerPortal() {
        const url = await this.getCustomerPortalUrl();
        window.open(url, '_blank');
    }

    /**
     * Set up usage tracking
     */
    setupUsageTracking() {
        // Track API calls
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            this.trackUsage('apiCalls', 1);
            return originalFetch.apply(window, args);
        };

        // Track messages
        document.addEventListener('message:sent', () => {
            this.trackUsage('messages', 1);
        });

        // Track storage
        setInterval(() => {
            this.calculateStorageUsage();
        }, 60000); // Every minute
    }

    /**
     * Calculate storage usage
     */
    async calculateStorageUsage() {
        if (navigator.storage?.estimate) {
            const { usage, quota } = await navigator.storage.estimate();
            const usageGB = usage / (1024 * 1024 * 1024);
            this.trackUsage('storageGB', usageGB, { quota });
        }
    }

    /**
     * Set up webhook handlers
     */
    setupWebhooks() {
        // Listen for webhook events
        window.addEventListener('stripe:webhook', (event) => {
            this.handleWebhook(event.detail);
        });
    }

    /**
     * Handle webhook event
     */
    handleWebhook(event) {
        switch (event.type) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                this.currentSubscription = event.data.object;
                this.onSubscriptionChange(this.currentSubscription);
                break;

            case 'customer.subscription.deleted':
                this.currentSubscription = null;
                this.onSubscriptionCanceled();
                break;

            case 'invoice.payment_succeeded':
                this.onPaymentSuccess(event.data.object);
                break;

            case 'invoice.payment_failed':
                this.onPaymentFailed(event.data.object);
                break;
        }
    }

    /**
     * Subscription change handler
     */
    onSubscriptionChange(subscription) {
        // Update UI
        this.updateSubscriptionUI();

        // Notify user
        this.showNotification('Subscription updated successfully', 'success');

        // Emit event
        document.dispatchEvent(new CustomEvent('subscription:changed', {
            detail: subscription
        }));
    }

    /**
     * Subscription canceled handler
     */
    onSubscriptionCanceled() {
        // Update UI
        this.updateSubscriptionUI();

        // Notify user
        this.showNotification('Subscription canceled', 'info');

        // Emit event
        document.dispatchEvent(new CustomEvent('subscription:canceled'));
    }

    /**
     * Payment success handler
     */
    onPaymentSuccess(invoice) {
        this.showNotification('Payment successful', 'success');
        document.dispatchEvent(new CustomEvent('payment:success', {
            detail: invoice
        }));
    }

    /**
     * Payment failed handler
     */
    onPaymentFailed(invoice) {
        this.showNotification('Payment failed. Please update your payment method.', 'error');
        document.dispatchEvent(new CustomEvent('payment:failed', {
            detail: invoice
        }));
    }

    /**
     * Queue usage tracking for retry
     */
    queueUsageTracking(data) {
        const queue = JSON.parse(localStorage.getItem('usageQueue') || '[]');
        queue.push({ ...data, timestamp: Date.now() });
        localStorage.setItem('usageQueue', JSON.stringify(queue));

        // Retry after delay
        setTimeout(() => this.retryUsageTracking(), 30000);
    }

    /**
     * Retry queued usage tracking
     */
    async retryUsageTracking() {
        const queue = JSON.parse(localStorage.getItem('usageQueue') || '[]');

        for (const item of queue) {
            try {
                await this.trackUsage(item.metric, item.quantity, item.metadata);
            } catch (error) {
                console.error('Failed to retry usage tracking:', error);
            }
        }

        localStorage.removeItem('usageQueue');
    }

    /**
     * Cache management
     */
    setCache(key, value) {
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.value;
        }
        return null;
    }

    /**
     * Get auth token
     */
    getAuthToken() {
        // Get from your auth system
        return localStorage.getItem('authToken') || '';
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `subscription-notification ${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    /**
     * Update subscription UI
     */
    updateSubscriptionUI() {
        const elements = document.querySelectorAll('[data-subscription-feature]');
        elements.forEach(element => {
            const feature = element.dataset.subscriptionFeature;
            const hasAccess = this.hasFeature(feature);
            element.style.display = hasAccess ? '' : 'none';
        });
    }

    /**
     * Create pricing table UI
     */
    createPricingTable(container) {
        const table = document.createElement('div');
        table.className = 'subscription-pricing-table';
        table.innerHTML = `
            <div class="pricing-header">
                <h2>Choose Your Plan</h2>
                <p>Select the perfect plan for your needs</p>
                <div class="billing-toggle">
                    <label class="toggle-switch">
                        <input type="checkbox" class="billing-period" checked>
                        <span class="toggle-slider"></span>
                    </label>
                    <span class="billing-label">
                        <span class="monthly">Monthly</span>
                        <span class="annual">Annual (Save 20%)</span>
                    </span>
                </div>
            </div>

            <div class="pricing-cards">
                ${this.config.plans.map(plan => this.createPlanCard(plan)).join('')}
            </div>

            <div class="pricing-features">
                <h3>All Plans Include</h3>
                <div class="features-grid">
                    <div class="feature-item">
                        <svg class="feature-icon" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        </svg>
                        <span>SSL encryption</span>
                    </div>
                    <div class="feature-item">
                        <svg class="feature-icon" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        </svg>
                        <span>99.9% uptime SLA</span>
                    </div>
                    <div class="feature-item">
                        <svg class="feature-icon" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        </svg>
                        <span>API access</span>
                    </div>
                    <div class="feature-item">
                        <svg class="feature-icon" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        </svg>
                        <span>Regular updates</span>
                    </div>
                </div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .subscription-pricing-table {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                padding: 40px;
                background: #f8f9fa;
                border-radius: 12px;
            }

            .pricing-header {
                text-align: center;
                margin-bottom: 40px;
            }

            .pricing-header h2 {
                margin: 0 0 10px 0;
                font-size: 2.5em;
                color: #1a1a1a;
            }

            .pricing-header p {
                margin: 0 0 30px 0;
                color: #666;
                font-size: 1.1em;
            }

            .billing-toggle {
                display: inline-flex;
                align-items: center;
                gap: 15px;
            }

            .toggle-switch {
                position: relative;
                width: 60px;
                height: 30px;
            }

            .toggle-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }

            .toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: #ccc;
                transition: .4s;
                border-radius: 30px;
            }

            .toggle-slider:before {
                position: absolute;
                content: "";
                height: 22px;
                width: 22px;
                left: 4px;
                bottom: 4px;
                background: white;
                transition: .4s;
                border-radius: 50%;
            }

            .toggle-switch input:checked + .toggle-slider {
                background: #007bff;
            }

            .toggle-switch input:checked + .toggle-slider:before {
                transform: translateX(30px);
            }

            .pricing-cards {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                gap: 30px;
                margin-bottom: 50px;
            }

            .pricing-card {
                background: white;
                border-radius: 12px;
                padding: 30px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                position: relative;
                transition: transform 0.3s;
            }

            .pricing-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 5px 20px rgba(0,0,0,0.15);
            }

            .pricing-card.popular {
                border: 2px solid #007bff;
            }

            .popular-badge {
                position: absolute;
                top: -12px;
                right: 20px;
                background: #007bff;
                color: white;
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 0.85em;
                font-weight: 600;
            }

            .plan-name {
                font-size: 1.5em;
                font-weight: 600;
                margin-bottom: 10px;
            }

            .plan-price {
                font-size: 3em;
                font-weight: 700;
                margin: 20px 0;
                color: #007bff;
            }

            .plan-price span {
                font-size: 0.4em;
                color: #666;
                font-weight: 400;
            }

            .plan-features {
                list-style: none;
                padding: 0;
                margin: 20px 0 30px 0;
            }

            .plan-features li {
                padding: 10px 0;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .plan-features .check {
                color: #28a745;
                font-size: 1.2em;
            }

            .plan-button {
                width: 100%;
                padding: 12px;
                border: none;
                border-radius: 6px;
                background: #007bff;
                color: white;
                font-size: 1em;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.3s;
            }

            .plan-button:hover {
                background: #0056b3;
            }

            .plan-button.current {
                background: #6c757d;
                cursor: default;
            }

            .plan-button.contact {
                background: white;
                color: #007bff;
                border: 2px solid #007bff;
            }

            .plan-button.contact:hover {
                background: #f0f7ff;
            }

            .plan-limits {
                margin-top: 20px;
                padding-top: 20px;
                border-top: 1px solid #e0e0e0;
            }

            .limit-item {
                display: flex;
                justify-content: space-between;
                padding: 5px 0;
                font-size: 0.9em;
                color: #666;
            }

            .limit-value {
                font-weight: 600;
                color: #333;
            }

            .pricing-features {
                background: white;
                padding: 30px;
                border-radius: 12px;
            }

            .pricing-features h3 {
                margin: 0 0 20px 0;
                font-size: 1.5em;
            }

            .features-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
            }

            .feature-item {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .feature-icon {
                width: 20px;
                height: 20px;
                fill: #28a745;
            }

            /* Notification styles */
            .subscription-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 6px;
                background: #333;
                color: white;
                font-size: 14px;
                z-index: 10000;
                animation: slideIn 0.3s;
            }

            .subscription-notification.success {
                background: #28a745;
            }

            .subscription-notification.error {
                background: #dc3545;
            }

            .subscription-notification.info {
                background: #17a2b8;
            }

            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                }
                to {
                    transform: translateX(0);
                }
            }

            /* Payment element styles */
            .payment-form {
                max-width: 500px;
                margin: 0 auto;
                padding: 30px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }

            .payment-element {
                margin-bottom: 20px;
            }

            .payment-button {
                width: 100%;
                padding: 14px;
                border: none;
                border-radius: 6px;
                background: #007bff;
                color: white;
                font-size: 1.1em;
                font-weight: 600;
                cursor: pointer;
            }

            .payment-button:disabled {
                background: #6c757d;
                cursor: not-allowed;
            }
        `;
        document.head.appendChild(style);

        container.appendChild(table);

        // Set up event handlers
        this.setupPricingTableHandlers(table);

        return table;
    }

    /**
     * Create plan card HTML
     */
    createPlanCard(plan) {
        const isCurrentPlan = this.currentSubscription?.priceId === plan.priceId;
        const price = plan.price === 'custom' ? 'Contact Us' : `$${plan.price}`;

        return `
            <div class="pricing-card ${plan.popular ? 'popular' : ''}">
                ${plan.popular ? '<span class="popular-badge">Most Popular</span>' : ''}

                <h3 class="plan-name">${plan.name}</h3>

                <div class="plan-price">
                    ${price}
                    ${plan.price !== 'custom' ? `<span>/${plan.interval}</span>` : ''}
                </div>

                <ul class="plan-features">
                    ${plan.features.map(feature => `
                        <li>
                            <span class="check">✓</span>
                            <span>${this.config.features[feature]}</span>
                        </li>
                    `).join('')}
                </ul>

                ${plan.limits ? `
                    <div class="plan-limits">
                        ${Object.entries(plan.limits).map(([key, value]) => `
                            <div class="limit-item">
                                <span>${this.formatLimitKey(key)}</span>
                                <span class="limit-value">${value}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                <button class="plan-button ${isCurrentPlan ? 'current' : ''} ${plan.price === 'custom' ? 'contact' : ''}"
                        data-plan-id="${plan.id}"
                        ${isCurrentPlan ? 'disabled' : ''}>
                    ${isCurrentPlan ? 'Current Plan' : (plan.price === 'custom' ? 'Contact Sales' : 'Choose Plan')}
                </button>
            </div>
        `;
    }

    /**
     * Format limit key for display
     */
    formatLimitKey(key) {
        const formats = {
            messagesPerDay: 'Messages/Day',
            storageGB: 'Storage',
            apiCalls: 'API Calls',
            teamMembers: 'Team Members'
        };
        return formats[key] || key;
    }

    /**
     * Set up pricing table event handlers
     */
    setupPricingTableHandlers(table) {
        // Plan selection
        table.querySelectorAll('.plan-button:not(.current)').forEach(button => {
            button.addEventListener('click', async (e) => {
                const planId = e.target.dataset.planId;

                if (e.target.classList.contains('contact')) {
                    // Open contact form
                    window.location.href = '/contact';
                } else {
                    // Create checkout
                    await this.createCheckout(planId);
                }
            });
        });

        // Billing toggle
        const toggle = table.querySelector('.billing-period');
        if (toggle) {
            toggle.addEventListener('change', (e) => {
                const isAnnual = !e.target.checked;
                this.updatePricingDisplay(isAnnual);
            });
        }
    }

    /**
     * Update pricing display for billing period
     */
    updatePricingDisplay(isAnnual) {
        const cards = document.querySelectorAll('.pricing-card');
        cards.forEach((card, index) => {
            const plan = this.config.plans[index];
            if (plan.price !== 'custom' && plan.price !== 0) {
                const priceElement = card.querySelector('.plan-price');
                const annualPrice = plan.price * 12 * 0.8; // 20% discount
                const price = isAnnual ? annualPrice : plan.price;
                const period = isAnnual ? 'year' : plan.interval;

                priceElement.innerHTML = `$${price.toFixed(2)}<span>/${period}</span>`;

                if (isAnnual) {
                    const savings = (plan.price * 12 - annualPrice).toFixed(2);
                    priceElement.innerHTML += `<div style="font-size: 0.3em; color: #28a745;">Save $${savings}</div>`;
                }
            }
        });
    }

    /**
     * Create customer portal UI
     */
    createCustomerPortal(container) {
        const portal = document.createElement('div');
        portal.className = 'customer-portal';
        portal.innerHTML = `
            <div class="portal-header">
                <h2>Account & Billing</h2>
                <button class="portal-close">×</button>
            </div>

            <div class="portal-tabs">
                <button class="tab-button active" data-tab="subscription">Subscription</button>
                <button class="tab-button" data-tab="payment">Payment Methods</button>
                <button class="tab-button" data-tab="invoices">Invoices</button>
                <button class="tab-button" data-tab="usage">Usage</button>
            </div>

            <div class="portal-content">
                <div class="tab-pane active" data-pane="subscription">
                    ${this.createSubscriptionPane()}
                </div>

                <div class="tab-pane" data-pane="payment">
                    ${this.createPaymentPane()}
                </div>

                <div class="tab-pane" data-pane="invoices">
                    ${this.createInvoicesPane()}
                </div>

                <div class="tab-pane" data-pane="usage">
                    ${this.createUsagePane()}
                </div>
            </div>
        `;

        container.appendChild(portal);
        this.setupPortalHandlers(portal);

        return portal;
    }

    /**
     * Create subscription pane
     */
    createSubscriptionPane() {
        if (!this.currentSubscription) {
            return `
                <div class="no-subscription">
                    <p>You don't have an active subscription.</p>
                    <button class="btn-primary view-plans">View Plans</button>
                </div>
            `;
        }

        const plan = this.config.plans.find(p => p.priceId === this.currentSubscription.priceId);

        return `
            <div class="subscription-info">
                <h3>Current Plan: ${plan?.name}</h3>
                <div class="subscription-details">
                    <div class="detail-row">
                        <span>Status:</span>
                        <span class="status ${this.currentSubscription.status}">${this.currentSubscription.status}</span>
                    </div>
                    <div class="detail-row">
                        <span>Next billing date:</span>
                        <span>${new Date(this.currentSubscription.currentPeriodEnd * 1000).toLocaleDateString()}</span>
                    </div>
                    <div class="detail-row">
                        <span>Amount:</span>
                        <span>$${(this.currentSubscription.amount / 100).toFixed(2)}/${this.currentSubscription.interval}</span>
                    </div>
                </div>

                <div class="subscription-actions">
                    <button class="btn-secondary upgrade-plan">Change Plan</button>
                    ${this.currentSubscription.cancelAtPeriodEnd ?
                        `<button class="btn-primary resume-subscription">Resume Subscription</button>` :
                        `<button class="btn-danger cancel-subscription">Cancel Subscription</button>`
                    }
                </div>
            </div>
        `;
    }

    /**
     * Create payment methods pane
     */
    createPaymentPane() {
        return `
            <div class="payment-methods">
                <h3>Payment Methods</h3>
                <div class="methods-list">
                    ${this.paymentMethods.map(pm => `
                        <div class="payment-method">
                            <div class="method-info">
                                <span class="method-brand">${pm.card.brand}</span>
                                <span class="method-last4">•••• ${pm.card.last4}</span>
                                <span class="method-exp">${pm.card.exp_month}/${pm.card.exp_year}</span>
                            </div>
                            <button class="remove-method" data-method-id="${pm.id}">Remove</button>
                        </div>
                    `).join('')}
                </div>
                <button class="btn-primary add-payment-method">Add Payment Method</button>
            </div>
        `;
    }

    /**
     * Create invoices pane
     */
    createInvoicesPane() {
        return `
            <div class="invoices-list">
                <h3>Billing History</h3>
                <table class="invoices-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.invoices.map(invoice => `
                            <tr>
                                <td>${new Date(invoice.created * 1000).toLocaleDateString()}</td>
                                <td>$${(invoice.amount_paid / 100).toFixed(2)}</td>
                                <td><span class="status ${invoice.status}">${invoice.status}</span></td>
                                <td>
                                    <button class="download-invoice" data-invoice-id="${invoice.id}">Download</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Create usage pane
     */
    createUsagePane() {
        const usage = this.usageData;
        const plan = this.config.plans.find(p => p.priceId === this.currentSubscription?.priceId) ||
                     this.config.plans.find(p => p.id === 'free');

        return `
            <div class="usage-stats">
                <h3>Usage Statistics</h3>
                <div class="usage-cards">
                    ${Object.entries(plan.limits).map(([metric, limit]) => {
                        const used = usage[metric] || 0;
                        const percentage = limit === 'unlimited' ? 0 : (used / limit) * 100;

                        return `
                            <div class="usage-card">
                                <h4>${this.formatLimitKey(metric)}</h4>
                                <div class="usage-bar">
                                    <div class="usage-fill" style="width: ${percentage}%"></div>
                                </div>
                                <div class="usage-text">
                                    <span>${used}</span> / <span>${limit}</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Set up portal event handlers
     */
    setupPortalHandlers(portal) {
        // Tab switching
        portal.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;

                // Update active tab
                portal.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                // Update active pane
                portal.querySelectorAll('.tab-pane').forEach(pane => {
                    pane.classList.toggle('active', pane.dataset.pane === tab);
                });
            });
        });

        // Close button
        portal.querySelector('.portal-close')?.addEventListener('click', () => {
            portal.remove();
        });

        // Subscription actions
        portal.querySelector('.cancel-subscription')?.addEventListener('click', () => {
            if (confirm('Are you sure you want to cancel your subscription?')) {
                this.cancelSubscription({ atPeriodEnd: true });
            }
        });

        portal.querySelector('.resume-subscription')?.addEventListener('click', () => {
            this.resumeSubscription();
        });

        // Payment methods
        portal.querySelector('.add-payment-method')?.addEventListener('click', () => {
            this.showPaymentMethodForm();
        });

        portal.querySelectorAll('.remove-method').forEach(button => {
            button.addEventListener('click', (e) => {
                const methodId = e.target.dataset.methodId;
                if (confirm('Remove this payment method?')) {
                    this.removePaymentMethod(methodId);
                }
            });
        });

        // Invoices
        portal.querySelectorAll('.download-invoice').forEach(button => {
            button.addEventListener('click', (e) => {
                const invoiceId = e.target.dataset.invoiceId;
                this.downloadInvoice(invoiceId);
            });
        });
    }

    /**
     * Show payment method form
     */
    showPaymentMethodForm() {
        const modal = document.createElement('div');
        modal.className = 'payment-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Add Payment Method</h3>
                <form class="payment-form">
                    <div id="payment-element"></div>
                    <button type="submit" class="payment-button">Add Payment Method</button>
                </form>
                <button class="modal-close">Cancel</button>
            </div>
        `;

        document.body.appendChild(modal);

        // Create payment element
        const paymentElement = this.createPaymentElement(
            modal.querySelector('#payment-element'),
            { mode: 'setup' }
        );

        // Handle form submission
        modal.querySelector('.payment-form').addEventListener('submit', async (e) => {
            e.preventDefault();

            // Set up payment method
            const { error, setupIntent } = await this.stripe.confirmSetup({
                elements: this.elements,
                confirmParams: {
                    return_url: window.location.href
                },
                redirect: 'if_required'
            });

            if (!error) {
                await this.addPaymentMethod(setupIntent.payment_method);
                modal.remove();
            }
        });

        // Close modal
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.remove();
        });
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SubscriptionSystem;
} else {
    window.SubscriptionSystem = SubscriptionSystem;
}