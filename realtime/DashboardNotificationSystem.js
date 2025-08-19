/**
 * Dashboard Notification System for PelotonIQ
 * Real-time notification delivery and management for connected dashboards
 */

const EventEmitter = require('events');
const winston = require('winston');
const { performance } = require('perf_hooks');

// Configure logging
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/dashboard-notifications.log' }),
        new winston.transports.Console()
    ]
});

/**
 * Notification priority levels
 */
const NotificationPriority = {
    LOW: 1,
    NORMAL: 2,
    HIGH: 3,
    URGENT: 4,
    CRITICAL: 5
};

/**
 * Notification categories
 */
const NotificationCategory = {
    RACE_UPDATE: 'race_update',
    TACTICAL_EVENT: 'tactical_event',
    WEATHER_ALERT: 'weather_alert',
    SYSTEM_STATUS: 'system_status',
    PERFORMANCE_ALERT: 'performance_alert',
    USER_ACTION: 'user_action',
    DATA_QUALITY: 'data_quality'
};

/**
 * Dashboard subscription and notification filtering
 */
class DashboardSubscription {
    constructor(dashboardId, config = {}) {
        this.dashboardId = dashboardId;
        this.userId = config.userId || null;
        this.sessionId = config.sessionId || this.generateSessionId();
        this.connectedAt = new Date();
        this.lastActivity = new Date();
        
        // Subscription preferences
        this.preferences = {
            categories: config.categories || Object.values(NotificationCategory),
            minPriority: config.minPriority || NotificationPriority.NORMAL,
            raceFilters: config.raceFilters || [], // Specific race IDs to follow
            riderFilters: config.riderFilters || [], // Specific rider IDs to follow
            teamFilters: config.teamFilters || [], // Specific team IDs to follow
            enableRealTimeUpdates: config.enableRealTimeUpdates !== false,
            enableSound: config.enableSound || false,
            enablePopups: config.enablePopups !== false,
            maxNotificationsPerMinute: config.maxNotificationsPerMinute || 30
        };
        
        // Rate limiting
        this.notificationQueue = [];
        this.sentNotifications = new Map(); // timestamp -> count
        
        // Statistics
        this.stats = {
            notificationsReceived: 0,
            notificationsSent: 0,
            notificationsFiltered: 0,
            averageLatency: 0,
            connectionUptime: 0,
            lastNotificationAt: null
        };
        
        this.isActive = true;
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Check if notification should be sent based on filters
     */
    shouldReceiveNotification(notification) {
        // Check if subscription is active
        if (!this.isActive || !this.preferences.enableRealTimeUpdates) {
            return false;
        }

        // Check category filter
        if (!this.preferences.categories.includes(notification.category)) {
            return false;
        }

        // Check priority filter
        if (notification.priority < this.preferences.minPriority) {
            return false;
        }

        // Check race filter
        if (this.preferences.raceFilters.length > 0 && notification.raceId) {
            if (!this.preferences.raceFilters.includes(notification.raceId)) {
                return false;
            }
        }

        // Check rider filter
        if (this.preferences.riderFilters.length > 0 && notification.riderId) {
            if (!this.preferences.riderFilters.includes(notification.riderId)) {
                return false;
            }
        }

        // Check team filter
        if (this.preferences.teamFilters.length > 0 && notification.teamId) {
            if (!this.preferences.teamFilters.includes(notification.teamId)) {
                return false;
            }
        }

        // Check rate limiting
        if (this.isRateLimited()) {
            return false;
        }

        return true;
    }

    /**
     * Check if dashboard is rate limited
     */
    isRateLimited() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        
        // Clean old entries
        for (const [timestamp] of this.sentNotifications) {
            if (timestamp < oneMinuteAgo) {
                this.sentNotifications.delete(timestamp);
            }
        }

        // Count notifications in the last minute
        let notificationsInLastMinute = 0;
        for (const count of this.sentNotifications.values()) {
            notificationsInLastMinute += count;
        }

        return notificationsInLastMinute >= this.preferences.maxNotificationsPerMinute;
    }

    /**
     * Record sent notification for rate limiting
     */
    recordSentNotification() {
        const now = Date.now();
        const currentCount = this.sentNotifications.get(now) || 0;
        this.sentNotifications.set(now, currentCount + 1);
        
        this.stats.notificationsSent++;
        this.stats.lastNotificationAt = new Date();
        this.lastActivity = new Date();
    }

    /**
     * Update subscription preferences
     */
    updatePreferences(newPreferences) {
        this.preferences = { ...this.preferences, ...newPreferences };
        logger.debug('Dashboard preferences updated', {
            dashboardId: this.dashboardId,
            preferences: this.preferences
        });
    }

    /**
     * Update activity timestamp
     */
    updateActivity() {
        this.lastActivity = new Date();
    }

    /**
     * Calculate connection uptime
     */
    getConnectionUptime() {
        return Date.now() - this.connectedAt.getTime();
    }

    /**
     * Check if subscription is stale
     */
    isStale(maxIdleTime = 300000) { // 5 minutes
        return Date.now() - this.lastActivity.getTime() > maxIdleTime;
    }

    toJSON() {
        return {
            dashboardId: this.dashboardId,
            userId: this.userId,
            sessionId: this.sessionId,
            connectedAt: this.connectedAt,
            lastActivity: this.lastActivity,
            preferences: this.preferences,
            stats: {
                ...this.stats,
                connectionUptime: this.getConnectionUptime()
            },
            isActive: this.isActive
        };
    }
}

/**
 * Notification message with delivery tracking
 */
class Notification {
    constructor(data) {
        this.id = data.id || this.generateId();
        this.category = data.category;
        this.priority = data.priority || NotificationPriority.NORMAL;
        this.title = data.title;
        this.message = data.message;
        this.timestamp = new Date(data.timestamp || Date.now());
        
        // Context data
        this.raceId = data.raceId || null;
        this.riderId = data.riderId || null;
        this.teamId = data.teamId || null;
        this.stageId = data.stageId || null;
        
        // Rich content
        this.data = data.data || {};
        this.actions = data.actions || []; // Available user actions
        this.imageUrl = data.imageUrl || null;
        this.url = data.url || null;
        
        // Display options
        this.displayOptions = {
            autoHide: data.autoHide !== false,
            hideAfter: data.hideAfter || 5000,
            requireAction: data.requireAction || false,
            soundFile: data.soundFile || null,
            animationType: data.animationType || 'slide'
        };
        
        // Delivery tracking
        this.deliveryStats = {
            created: new Date(),
            totalRecipients: 0,
            successfulDeliveries: 0,
            failedDeliveries: 0,
            deliveryLatencies: [],
            acknowledged: new Set() // Dashboard IDs that acknowledged
        };
        
        this.expiresAt = data.expiresAt ? new Date(data.expiresAt) : 
                       new Date(Date.now() + 3600000); // 1 hour default
    }

    generateId() {
        return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Check if notification is expired
     */
    isExpired() {
        return Date.now() > this.expiresAt.getTime();
    }

    /**
     * Record delivery attempt
     */
    recordDelivery(dashboardId, success, latency) {
        this.deliveryStats.totalRecipients++;
        
        if (success) {
            this.deliveryStats.successfulDeliveries++;
            this.deliveryStats.deliveryLatencies.push(latency);
        } else {
            this.deliveryStats.failedDeliveries++;
        }
    }

    /**
     * Record acknowledgment from dashboard
     */
    recordAcknowledgment(dashboardId) {
        this.deliveryStats.acknowledged.add(dashboardId);
    }

    /**
     * Calculate delivery statistics
     */
    getDeliveryStats() {
        const latencies = this.deliveryStats.deliveryLatencies;
        const averageLatency = latencies.length > 0 ? 
            latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length : 0;
        
        return {
            ...this.deliveryStats,
            acknowledgedCount: this.deliveryStats.acknowledged.size,
            averageLatency,
            successRate: this.deliveryStats.totalRecipients > 0 ? 
                this.deliveryStats.successfulDeliveries / this.deliveryStats.totalRecipients : 0
        };
    }

    toJSON() {
        return {
            id: this.id,
            category: this.category,
            priority: this.priority,
            title: this.title,
            message: this.message,
            timestamp: this.timestamp,
            raceId: this.raceId,
            riderId: this.riderId,
            teamId: this.teamId,
            stageId: this.stageId,
            data: this.data,
            actions: this.actions,
            imageUrl: this.imageUrl,
            url: this.url,
            displayOptions: this.displayOptions,
            deliveryStats: this.getDeliveryStats(),
            expiresAt: this.expiresAt
        };
    }
}

/**
 * Main Dashboard Notification System
 */
class DashboardNotificationSystem extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            maxSubscriptions: options.maxSubscriptions || 1000,
            notificationRetentionMs: options.notificationRetentionMs || 3600000, // 1 hour
            cleanupInterval: options.cleanupInterval || 300000, // 5 minutes
            maxQueueSize: options.maxQueueSize || 10000,
            enableDeliveryTracking: options.enableDeliveryTracking !== false,
            enablePersistence: options.enablePersistence || false,
            defaultPriority: options.defaultPriority || NotificationPriority.NORMAL,
            ...options
        };

        // Storage
        this.subscriptions = new Map(); // dashboardId -> DashboardSubscription
        this.notifications = new Map(); // notificationId -> Notification
        this.notificationQueue = []; // Pending notifications
        
        // Delivery channels
        this.deliveryChannels = new Map(); // channelId -> delivery function
        
        // Statistics
        this.stats = {
            totalSubscriptions: 0,
            activeSubscriptions: 0,
            totalNotifications: 0,
            notificationsSent: 0,
            notificationsQueued: 0,
            averageDeliveryTime: 0,
            deliverySuccessRate: 0,
            systemUptime: Date.now()
        };

        // Internal state
        this.isRunning = false;
        this.cleanupTimer = null;
        
        this.initializeSystem();
    }

    /**
     * Initialize notification system
     */
    initializeSystem() {
        // Register default delivery channels
        this.registerDeliveryChannel('websocket', this.websocketDelivery.bind(this));
        this.registerDeliveryChannel('sse', this.sseDelivery.bind(this));
        this.registerDeliveryChannel('webhook', this.webhookDelivery.bind(this));
        
        logger.info('Dashboard Notification System initialized', {
            maxSubscriptions: this.options.maxSubscriptions,
            retentionMs: this.options.notificationRetentionMs,
            deliveryChannels: Array.from(this.deliveryChannels.keys())
        });
    }

    /**
     * Start the notification system
     */
    async start() {
        if (this.isRunning) {
            throw new Error('Dashboard Notification System is already running');
        }

        this.isRunning = true;
        
        // Start cleanup timer
        this.cleanupTimer = setInterval(() => {
            this.performCleanup();
        }, this.options.cleanupInterval);

        this.emit('system-started');
        logger.info('Dashboard Notification System started');
    }

    /**
     * Stop the notification system
     */
    async stop() {
        if (!this.isRunning) return;

        this.isRunning = false;

        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }

        // Process remaining queue
        await this.processNotificationQueue();

        this.emit('system-stopped');
        logger.info('Dashboard Notification System stopped');
    }

    /**
     * Subscribe dashboard to notifications
     */
    subscribe(dashboardId, config = {}) {
        if (this.subscriptions.has(dashboardId)) {
            logger.warn('Dashboard already subscribed', { dashboardId });
            return this.subscriptions.get(dashboardId);
        }

        if (this.subscriptions.size >= this.options.maxSubscriptions) {
            throw new Error('Maximum subscriptions reached');
        }

        const subscription = new DashboardSubscription(dashboardId, config);
        this.subscriptions.set(dashboardId, subscription);
        
        this.stats.totalSubscriptions++;
        this.stats.activeSubscriptions++;

        this.emit('dashboard-subscribed', subscription.toJSON());
        logger.info('Dashboard subscribed', {
            dashboardId,
            userId: subscription.userId,
            sessionId: subscription.sessionId
        });

        return subscription;
    }

    /**
     * Unsubscribe dashboard from notifications
     */
    unsubscribe(dashboardId) {
        const subscription = this.subscriptions.get(dashboardId);
        if (!subscription) {
            logger.warn('Dashboard not found for unsubscription', { dashboardId });
            return;
        }

        this.subscriptions.delete(dashboardId);
        this.stats.activeSubscriptions--;

        this.emit('dashboard-unsubscribed', { dashboardId });
        logger.info('Dashboard unsubscribed', { dashboardId });
    }

    /**
     * Update dashboard subscription preferences
     */
    updateSubscription(dashboardId, preferences) {
        const subscription = this.subscriptions.get(dashboardId);
        if (!subscription) {
            throw new Error(`Dashboard ${dashboardId} not subscribed`);
        }

        subscription.updatePreferences(preferences);
        
        this.emit('subscription-updated', {
            dashboardId,
            preferences: subscription.preferences
        });

        return subscription;
    }

    /**
     * Send notification to subscribed dashboards
     */
    async sendNotification(notificationData) {
        const startTime = performance.now();
        
        // Create notification object
        const notification = new Notification(notificationData);
        
        // Validate notification
        if (!notification.category || !notification.title) {
            throw new Error('Notification must have category and title');
        }

        // Store notification
        this.notifications.set(notification.id, notification);
        this.stats.totalNotifications++;

        // Find matching subscriptions
        const targetSubscriptions = [];
        for (const subscription of this.subscriptions.values()) {
            if (subscription.shouldReceiveNotification(notification)) {
                targetSubscriptions.push(subscription);
            } else {
                subscription.stats.notificationsFiltered++;
            }
        }

        notification.deliveryStats.totalRecipients = targetSubscriptions.length;

        // Deliver notification
        const deliveryPromises = targetSubscriptions.map(subscription => 
            this.deliverToSubscription(notification, subscription));
        
        await Promise.allSettled(deliveryPromises);

        // Update system stats
        const processingTime = performance.now() - startTime;
        this.updateDeliveryStats(processingTime, notification);

        // Emit notification sent event
        this.emit('notification-sent', {
            notificationId: notification.id,
            category: notification.category,
            priority: notification.priority,
            recipientCount: targetSubscriptions.length,
            processingTime
        });

        logger.info('Notification sent', {
            notificationId: notification.id,
            category: notification.category,
            priority: notification.priority,
            recipientCount: targetSubscriptions.length,
            processingTime
        });

        return {
            notificationId: notification.id,
            recipientCount: targetSubscriptions.length,
            deliveryStats: notification.getDeliveryStats()
        };
    }

    /**
     * Deliver notification to specific subscription
     */
    async deliverToSubscription(notification, subscription) {
        const startTime = performance.now();
        
        try {
            // Choose delivery channel (default to websocket)
            const channelId = subscription.preferences.deliveryChannel || 'websocket';
            const deliveryChannel = this.deliveryChannels.get(channelId);
            
            if (!deliveryChannel) {
                throw new Error(`Delivery channel ${channelId} not available`);
            }

            // Deliver notification
            await deliveryChannel(notification, subscription);
            
            // Record successful delivery
            const latency = performance.now() - startTime;
            notification.recordDelivery(subscription.dashboardId, true, latency);
            subscription.recordSentNotification();
            
            this.stats.notificationsSent++;

        } catch (error) {
            // Record failed delivery
            const latency = performance.now() - startTime;
            notification.recordDelivery(subscription.dashboardId, false, latency);
            
            logger.error('Failed to deliver notification', {
                notificationId: notification.id,
                dashboardId: subscription.dashboardId,
                error: error.message
            });
        }
    }

    /**
     * WebSocket delivery channel
     */
    async websocketDelivery(notification, subscription) {
        // This would integrate with the WebSocket manager
        this.emit('websocket-delivery', {
            dashboardId: subscription.dashboardId,
            notification: notification.toJSON()
        });
    }

    /**
     * Server-Sent Events delivery channel
     */
    async sseDelivery(notification, subscription) {
        // This would integrate with SSE connections
        this.emit('sse-delivery', {
            dashboardId: subscription.dashboardId,
            notification: notification.toJSON()
        });
    }

    /**
     * Webhook delivery channel
     */
    async webhookDelivery(notification, subscription) {
        // This would make HTTP POST to webhook URL
        this.emit('webhook-delivery', {
            dashboardId: subscription.dashboardId,
            notification: notification.toJSON()
        });
    }

    /**
     * Register custom delivery channel
     */
    registerDeliveryChannel(channelId, deliveryFunction) {
        this.deliveryChannels.set(channelId, deliveryFunction);
        logger.debug('Delivery channel registered', { channelId });
    }

    /**
     * Process notification queue
     */
    async processNotificationQueue() {
        if (this.notificationQueue.length === 0) return;

        const notifications = this.notificationQueue.splice(0);
        const promises = notifications.map(notification => 
            this.sendNotification(notification));
        
        await Promise.allSettled(promises);
        
        logger.debug('Notification queue processed', {
            processedCount: notifications.length
        });
    }

    /**
     * Acknowledge notification receipt
     */
    acknowledgeNotification(notificationId, dashboardId) {
        const notification = this.notifications.get(notificationId);
        if (notification) {
            notification.recordAcknowledgment(dashboardId);
            
            this.emit('notification-acknowledged', {
                notificationId,
                dashboardId
            });
        }
    }

    /**
     * Get subscription information
     */
    getSubscription(dashboardId) {
        const subscription = this.subscriptions.get(dashboardId);
        return subscription ? subscription.toJSON() : null;
    }

    /**
     * Get all active subscriptions
     */
    getAllSubscriptions() {
        return Array.from(this.subscriptions.values()).map(sub => sub.toJSON());
    }

    /**
     * Get notification by ID
     */
    getNotification(notificationId) {
        const notification = this.notifications.get(notificationId);
        return notification ? notification.toJSON() : null;
    }

    /**
     * Get recent notifications
     */
    getRecentNotifications(limit = 50, category = null) {
        const notifications = Array.from(this.notifications.values())
            .filter(notif => !category || notif.category === category)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, limit);
        
        return notifications.map(notif => notif.toJSON());
    }

    /**
     * Perform system cleanup
     */
    performCleanup() {
        const now = Date.now();
        let cleanedNotifications = 0;
        let cleanedSubscriptions = 0;

        // Clean expired notifications
        for (const [id, notification] of this.notifications) {
            if (notification.isExpired() || 
                now - notification.timestamp.getTime() > this.options.notificationRetentionMs) {
                this.notifications.delete(id);
                cleanedNotifications++;
            }
        }

        // Clean stale subscriptions
        for (const [dashboardId, subscription] of this.subscriptions) {
            if (subscription.isStale()) {
                this.unsubscribe(dashboardId);
                cleanedSubscriptions++;
            }
        }

        if (cleanedNotifications > 0 || cleanedSubscriptions > 0) {
            logger.debug('System cleanup completed', {
                cleanedNotifications,
                cleanedSubscriptions,
                activeNotifications: this.notifications.size,
                activeSubscriptions: this.subscriptions.size
            });
        }
    }

    /**
     * Update delivery statistics
     */
    updateDeliveryStats(processingTime, notification) {
        // Update average delivery time
        const alpha = 0.1;
        this.stats.averageDeliveryTime = 
            this.stats.averageDeliveryTime * (1 - alpha) + processingTime * alpha;
        
        // Update delivery success rate
        const deliveryStats = notification.getDeliveryStats();
        if (deliveryStats.totalRecipients > 0) {
            this.stats.deliverySuccessRate = 
                this.stats.deliverySuccessRate * (1 - alpha) + 
                deliveryStats.successRate * alpha;
        }
    }

    /**
     * Get system statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeSubscriptions: this.subscriptions.size,
            activeNotifications: this.notifications.size,
            queueSize: this.notificationQueue.length,
            isRunning: this.isRunning,
            uptime: Date.now() - this.stats.systemUptime
        };
    }

    /**
     * Health check
     */
    async healthCheck() {
        const health = {
            status: 'healthy',
            system: {
                isRunning: this.isRunning,
                activeSubscriptions: this.subscriptions.size,
                activeNotifications: this.notifications.size,
                queueSize: this.notificationQueue.length
            },
            performance: {
                averageDeliveryTime: this.stats.averageDeliveryTime,
                deliverySuccessRate: this.stats.deliverySuccessRate,
                notificationsSent: this.stats.notificationsSent
            },
            memory: {
                subscriptionsSize: this.subscriptions.size,
                notificationsSize: this.notifications.size,
                deliveryChannels: this.deliveryChannels.size
            },
            stats: this.getStats()
        };

        // Determine health status
        if (!this.isRunning) {
            health.status = 'stopped';
        } else if (this.stats.deliverySuccessRate < 0.8) {
            health.status = 'degraded';
        } else if (this.notificationQueue.length > this.options.maxQueueSize * 0.8) {
            health.status = 'degraded';
        }

        return health;
    }

    /**
     * Create notification helpers for common notification types
     */
    createRaceUpdateNotification(title, message, raceId, data = {}) {
        return {
            category: NotificationCategory.RACE_UPDATE,
            priority: NotificationPriority.NORMAL,
            title,
            message,
            raceId,
            data
        };
    }

    createTacticalEventNotification(title, message, raceId, riderId, priority = NotificationPriority.HIGH) {
        return {
            category: NotificationCategory.TACTICAL_EVENT,
            priority,
            title,
            message,
            raceId,
            riderId,
            displayOptions: { requireAction: priority >= NotificationPriority.URGENT }
        };
    }

    createWeatherAlertNotification(title, message, raceId, severity = 'medium') {
        const priorityMap = {
            low: NotificationPriority.NORMAL,
            medium: NotificationPriority.HIGH,
            high: NotificationPriority.URGENT,
            severe: NotificationPriority.CRITICAL
        };

        return {
            category: NotificationCategory.WEATHER_ALERT,
            priority: priorityMap[severity] || NotificationPriority.HIGH,
            title,
            message,
            raceId,
            data: { severity },
            displayOptions: { 
                requireAction: severity === 'severe',
                soundFile: severity === 'severe' ? 'alert-critical.mp3' : null
            }
        };
    }

    createSystemStatusNotification(title, message, priority = NotificationPriority.NORMAL) {
        return {
            category: NotificationCategory.SYSTEM_STATUS,
            priority,
            title,
            message,
            displayOptions: { autoHide: priority <= NotificationPriority.NORMAL }
        };
    }
}

module.exports = { 
    DashboardNotificationSystem, 
    DashboardSubscription, 
    Notification, 
    NotificationPriority, 
    NotificationCategory 
};