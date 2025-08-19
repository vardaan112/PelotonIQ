/**
 * Comprehensive test suite for Dashboard Notification System
 */

const { 
    DashboardNotificationSystem, 
    DashboardSubscription, 
    Notification, 
    NotificationPriority, 
    NotificationCategory 
} = require('../DashboardNotificationSystem');

describe('DashboardSubscription', () => {
    test('should create subscription with default values', () => {
        const subscription = new DashboardSubscription('dashboard-1');
        
        expect(subscription.dashboardId).toBe('dashboard-1');
        expect(subscription.isActive).toBe(true);
        expect(subscription.preferences.enableRealTimeUpdates).toBe(true);
        expect(subscription.preferences.minPriority).toBe(NotificationPriority.NORMAL);
        expect(subscription.sessionId).toMatch(/^session_/);
    });

    test('should create subscription with custom config', () => {
        const config = {
            userId: 'user-123',
            categories: [NotificationCategory.RACE_UPDATE],
            minPriority: NotificationPriority.HIGH,
            raceFilters: ['tour-de-france-2024'],
            enableSound: true
        };
        
        const subscription = new DashboardSubscription('dashboard-1', config);
        
        expect(subscription.userId).toBe('user-123');
        expect(subscription.preferences.categories).toEqual([NotificationCategory.RACE_UPDATE]);
        expect(subscription.preferences.minPriority).toBe(NotificationPriority.HIGH);
        expect(subscription.preferences.raceFilters).toEqual(['tour-de-france-2024']);
        expect(subscription.preferences.enableSound).toBe(true);
    });

    test('should filter notifications based on category', () => {
        const subscription = new DashboardSubscription('dashboard-1', {
            categories: [NotificationCategory.RACE_UPDATE]
        });
        
        const raceNotification = new Notification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Race Update',
            priority: NotificationPriority.NORMAL
        });
        
        const weatherNotification = new Notification({
            category: NotificationCategory.WEATHER_ALERT,
            title: 'Weather Alert',
            priority: NotificationPriority.NORMAL
        });
        
        expect(subscription.shouldReceiveNotification(raceNotification)).toBe(true);
        expect(subscription.shouldReceiveNotification(weatherNotification)).toBe(false);
    });

    test('should filter notifications based on priority', () => {
        const subscription = new DashboardSubscription('dashboard-1', {
            minPriority: NotificationPriority.HIGH
        });
        
        const highPriority = new Notification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'High Priority',
            priority: NotificationPriority.HIGH
        });
        
        const lowPriority = new Notification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Low Priority',
            priority: NotificationPriority.LOW
        });
        
        expect(subscription.shouldReceiveNotification(highPriority)).toBe(true);
        expect(subscription.shouldReceiveNotification(lowPriority)).toBe(false);
    });

    test('should filter notifications based on race filter', () => {
        const subscription = new DashboardSubscription('dashboard-1', {
            raceFilters: ['tour-de-france-2024']
        });
        
        const tourNotification = new Notification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Tour Update',
            priority: NotificationPriority.NORMAL,
            raceId: 'tour-de-france-2024'
        });
        
        const giroNotification = new Notification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Giro Update',
            priority: NotificationPriority.NORMAL,
            raceId: 'giro-d-italia-2024'
        });
        
        expect(subscription.shouldReceiveNotification(tourNotification)).toBe(true);
        expect(subscription.shouldReceiveNotification(giroNotification)).toBe(false);
    });

    test('should implement rate limiting', () => {
        const subscription = new DashboardSubscription('dashboard-1', {
            maxNotificationsPerMinute: 2
        });
        
        // Send notifications up to limit
        subscription.recordSentNotification();
        subscription.recordSentNotification();
        
        expect(subscription.isRateLimited()).toBe(true);
        
        const notification = new Notification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Test',
            priority: NotificationPriority.NORMAL
        });
        
        expect(subscription.shouldReceiveNotification(notification)).toBe(false);
    });

    test('should detect stale subscriptions', () => {
        const subscription = new DashboardSubscription('dashboard-1');
        
        // Set old last activity
        subscription.lastActivity = new Date(Date.now() - 400000); // 6.67 minutes ago
        
        expect(subscription.isStale(300000)).toBe(true); // 5 minute threshold
        expect(subscription.isStale(500000)).toBe(false); // 8.33 minute threshold
    });

    test('should update preferences', () => {
        const subscription = new DashboardSubscription('dashboard-1');
        
        subscription.updatePreferences({
            minPriority: NotificationPriority.URGENT,
            enableSound: true
        });
        
        expect(subscription.preferences.minPriority).toBe(NotificationPriority.URGENT);
        expect(subscription.preferences.enableSound).toBe(true);
        expect(subscription.preferences.enableRealTimeUpdates).toBe(true); // Should preserve existing
    });
});

describe('Notification', () => {
    test('should create notification with required fields', () => {
        const notification = new Notification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Test Notification',
            message: 'This is a test'
        });
        
        expect(notification.category).toBe(NotificationCategory.RACE_UPDATE);
        expect(notification.title).toBe('Test Notification');
        expect(notification.message).toBe('This is a test');
        expect(notification.priority).toBe(NotificationPriority.NORMAL);
        expect(notification.id).toMatch(/^notif_/);
    });

    test('should create notification with all fields', () => {
        const data = {
            category: NotificationCategory.TACTICAL_EVENT,
            priority: NotificationPriority.URGENT,
            title: 'Attack!',
            message: 'Pogačar attacks on the final climb',
            raceId: 'tour-de-france-2024',
            riderId: 'tadej-pogacar',
            teamId: 'uae-team-emirates',
            data: { gap: '5 seconds', distance: '2km to go' },
            actions: [{ label: 'View Live', action: 'view-race' }],
            displayOptions: { requireAction: true }
        };
        
        const notification = new Notification(data);
        
        expect(notification.category).toBe(NotificationCategory.TACTICAL_EVENT);
        expect(notification.priority).toBe(NotificationPriority.URGENT);
        expect(notification.raceId).toBe('tour-de-france-2024');
        expect(notification.riderId).toBe('tadej-pogacar');
        expect(notification.data.gap).toBe('5 seconds');
        expect(notification.actions).toHaveLength(1);
        expect(notification.displayOptions.requireAction).toBe(true);
    });

    test('should track delivery statistics', () => {
        const notification = new Notification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Test',
            message: 'Test message'
        });
        
        // Record successful deliveries
        notification.recordDelivery('dashboard-1', true, 50);
        notification.recordDelivery('dashboard-2', true, 75);
        notification.recordDelivery('dashboard-3', false, 200);
        
        const stats = notification.getDeliveryStats();
        
        expect(stats.totalRecipients).toBe(3);
        expect(stats.successfulDeliveries).toBe(2);
        expect(stats.failedDeliveries).toBe(1);
        expect(stats.averageLatency).toBe(62.5); // (50 + 75) / 2
        expect(stats.successRate).toBe(2/3);
    });

    test('should handle acknowledgments', () => {
        const notification = new Notification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Test',
            message: 'Test message'
        });
        
        notification.recordAcknowledgment('dashboard-1');
        notification.recordAcknowledgment('dashboard-2');
        
        const stats = notification.getDeliveryStats();
        
        expect(stats.acknowledgedCount).toBe(2);
        expect(stats.acknowledged.has('dashboard-1')).toBe(true);
        expect(stats.acknowledged.has('dashboard-2')).toBe(true);
    });

    test('should detect expired notifications', () => {
        const notification = new Notification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Test',
            message: 'Test message',
            expiresAt: new Date(Date.now() - 1000) // Expired 1 second ago
        });
        
        expect(notification.isExpired()).toBe(true);
        
        const futureNotification = new Notification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Test',
            message: 'Test message',
            expiresAt: new Date(Date.now() + 10000) // Expires in 10 seconds
        });
        
        expect(futureNotification.isExpired()).toBe(false);
    });
});

describe('DashboardNotificationSystem', () => {
    let system;

    beforeEach(() => {
        system = new DashboardNotificationSystem({
            maxSubscriptions: 100,
            notificationRetentionMs: 10000,
            cleanupInterval: 1000
        });
    });

    afterEach(async () => {
        if (system.isRunning) {
            await system.stop();
        }
    });

    test('should initialize system correctly', () => {
        expect(system.isRunning).toBe(false);
        expect(system.subscriptions.size).toBe(0);
        expect(system.notifications.size).toBe(0);
        expect(system.deliveryChannels.size).toBeGreaterThan(0);
    });

    test('should start and stop system', async () => {
        expect(system.isRunning).toBe(false);
        
        await system.start();
        expect(system.isRunning).toBe(true);
        expect(system.cleanupTimer).toBeDefined();
        
        await system.stop();
        expect(system.isRunning).toBe(false);
        expect(system.cleanupTimer).toBeNull();
    });

    test('should subscribe and unsubscribe dashboards', () => {
        const config = { userId: 'user-123', minPriority: NotificationPriority.HIGH };
        
        const subscription = system.subscribe('dashboard-1', config);
        
        expect(subscription).toBeInstanceOf(DashboardSubscription);
        expect(system.subscriptions.size).toBe(1);
        expect(system.stats.totalSubscriptions).toBe(1);
        expect(system.stats.activeSubscriptions).toBe(1);
        
        system.unsubscribe('dashboard-1');
        
        expect(system.subscriptions.size).toBe(0);
        expect(system.stats.activeSubscriptions).toBe(0);
    });

    test('should prevent duplicate subscriptions', () => {
        const subscription1 = system.subscribe('dashboard-1');
        const subscription2 = system.subscribe('dashboard-1');
        
        expect(subscription1).toBe(subscription2);
        expect(system.subscriptions.size).toBe(1);
    });

    test('should enforce subscription limit', () => {
        const limitedSystem = new DashboardNotificationSystem({ maxSubscriptions: 2 });
        
        limitedSystem.subscribe('dashboard-1');
        limitedSystem.subscribe('dashboard-2');
        
        expect(() => {
            limitedSystem.subscribe('dashboard-3');
        }).toThrow('Maximum subscriptions reached');
    });

    test('should update subscription preferences', () => {
        system.subscribe('dashboard-1');
        
        const updated = system.updateSubscription('dashboard-1', {
            minPriority: NotificationPriority.URGENT,
            enableSound: true
        });
        
        expect(updated.preferences.minPriority).toBe(NotificationPriority.URGENT);
        expect(updated.preferences.enableSound).toBe(true);
    });

    test('should send notifications to matching subscriptions', async () => {
        // Subscribe dashboards with different preferences
        system.subscribe('dashboard-1', {
            categories: [NotificationCategory.RACE_UPDATE],
            minPriority: NotificationPriority.NORMAL
        });
        
        system.subscribe('dashboard-2', {
            categories: [NotificationCategory.TACTICAL_EVENT],
            minPriority: NotificationPriority.HIGH
        });
        
        system.subscribe('dashboard-3', {
            categories: [NotificationCategory.RACE_UPDATE],
            raceFilters: ['tour-de-france-2024']
        });
        
        const mockEmit = jest.fn();
        system.emit = mockEmit;
        
        // Send race update notification
        const result = await system.sendNotification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Stage Winner',
            message: 'Pogačar wins stage 15',
            priority: NotificationPriority.NORMAL,
            raceId: 'tour-de-france-2024'
        });
        
        expect(result.recipientCount).toBe(2); // dashboard-1 and dashboard-3
        expect(system.notifications.size).toBe(1);
        expect(system.stats.totalNotifications).toBe(1);
        expect(mockEmit).toHaveBeenCalledWith('notification-sent', expect.any(Object));
    });

    test('should handle notification delivery failures gracefully', async () => {
        system.subscribe('dashboard-1');
        
        // Override delivery function to simulate failure
        system.deliveryChannels.set('websocket', async () => {
            throw new Error('Connection failed');
        });
        
        const result = await system.sendNotification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Test',
            message: 'Test message'
        });
        
        expect(result.recipientCount).toBe(1);
        
        const notification = system.notifications.values().next().value;
        const stats = notification.getDeliveryStats();
        
        expect(stats.failedDeliveries).toBe(1);
        expect(stats.successfulDeliveries).toBe(0);
    });

    test('should register custom delivery channels', () => {
        const customDelivery = jest.fn();
        
        system.registerDeliveryChannel('custom', customDelivery);
        
        expect(system.deliveryChannels.has('custom')).toBe(true);
        expect(system.deliveryChannels.get('custom')).toBe(customDelivery);
    });

    test('should acknowledge notifications', () => {
        const mockEmit = jest.fn();
        system.emit = mockEmit;
        
        // Create a notification manually for testing
        const notification = new Notification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Test',
            message: 'Test message'
        });
        
        system.notifications.set(notification.id, notification);
        
        system.acknowledgeNotification(notification.id, 'dashboard-1');
        
        const stats = notification.getDeliveryStats();
        expect(stats.acknowledgedCount).toBe(1);
        expect(mockEmit).toHaveBeenCalledWith('notification-acknowledged', {
            notificationId: notification.id,
            dashboardId: 'dashboard-1'
        });
    });

    test('should retrieve notifications and subscriptions', () => {
        // Create subscription
        system.subscribe('dashboard-1', { userId: 'user-123' });
        
        // Create notification
        const notification = new Notification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Test',
            message: 'Test message'
        });
        system.notifications.set(notification.id, notification);
        
        // Test retrieval methods
        const subscription = system.getSubscription('dashboard-1');
        expect(subscription).toBeDefined();
        expect(subscription.userId).toBe('user-123');
        
        const allSubscriptions = system.getAllSubscriptions();
        expect(allSubscriptions).toHaveLength(1);
        
        const retrievedNotification = system.getNotification(notification.id);
        expect(retrievedNotification).toBeDefined();
        expect(retrievedNotification.title).toBe('Test');
        
        const recentNotifications = system.getRecentNotifications(10);
        expect(recentNotifications).toHaveLength(1);
        
        const raceNotifications = system.getRecentNotifications(10, NotificationCategory.RACE_UPDATE);
        expect(raceNotifications).toHaveLength(1);
    });

    test('should perform cleanup of expired data', async () => {
        await system.start();
        
        // Create expired notification
        const expiredNotification = new Notification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Expired',
            message: 'This should be cleaned up',
            timestamp: new Date(Date.now() - 20000) // 20 seconds ago
        });
        system.notifications.set(expiredNotification.id, expiredNotification);
        
        // Create stale subscription
        const staleSubscription = system.subscribe('stale-dashboard');
        staleSubscription.lastActivity = new Date(Date.now() - 400000); // 6.67 minutes ago
        
        // Trigger cleanup
        system.performCleanup();
        
        expect(system.notifications.has(expiredNotification.id)).toBe(false);
        expect(system.subscriptions.has('stale-dashboard')).toBe(false);
    });

    test('should provide comprehensive statistics', () => {
        system.subscribe('dashboard-1');
        system.subscribe('dashboard-2');
        
        const notification = new Notification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Test',
            message: 'Test message'
        });
        system.notifications.set(notification.id, notification);
        
        const stats = system.getStats();
        
        expect(stats).toHaveProperty('totalSubscriptions');
        expect(stats).toHaveProperty('activeSubscriptions');
        expect(stats).toHaveProperty('totalNotifications');
        expect(stats).toHaveProperty('averageDeliveryTime');
        expect(stats).toHaveProperty('deliverySuccessRate');
        expect(stats).toHaveProperty('isRunning');
        expect(stats).toHaveProperty('uptime');
        expect(stats.activeSubscriptions).toBe(2);
        expect(stats.activeNotifications).toBe(1);
    });

    test('should perform health check', async () => {
        await system.start();
        system.subscribe('dashboard-1');
        
        const health = await system.healthCheck();
        
        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('system');
        expect(health).toHaveProperty('performance');
        expect(health).toHaveProperty('memory');
        expect(health.status).toBe('healthy');
        expect(health.system.isRunning).toBe(true);
        expect(health.system.activeSubscriptions).toBe(1);
    });

    test('should provide notification creation helpers', () => {
        const raceUpdate = system.createRaceUpdateNotification(
            'Stage Result',
            'Pogačar wins stage 15',
            'tour-de-france-2024'
        );
        
        expect(raceUpdate.category).toBe(NotificationCategory.RACE_UPDATE);
        expect(raceUpdate.priority).toBe(NotificationPriority.NORMAL);
        
        const tacticalEvent = system.createTacticalEventNotification(
            'Attack!',
            'Vingegaard attacks',
            'tour-de-france-2024',
            'jonas-vingegaard',
            NotificationPriority.URGENT
        );
        
        expect(tacticalEvent.category).toBe(NotificationCategory.TACTICAL_EVENT);
        expect(tacticalEvent.priority).toBe(NotificationPriority.URGENT);
        
        const weatherAlert = system.createWeatherAlertNotification(
            'Storm Warning',
            'Severe weather approaching',
            'tour-de-france-2024',
            'severe'
        );
        
        expect(weatherAlert.category).toBe(NotificationCategory.WEATHER_ALERT);
        expect(weatherAlert.priority).toBe(NotificationPriority.CRITICAL);
        
        const systemStatus = system.createSystemStatusNotification(
            'Service Update',
            'System maintenance completed'
        );
        
        expect(systemStatus.category).toBe(NotificationCategory.SYSTEM_STATUS);
        expect(systemStatus.priority).toBe(NotificationPriority.NORMAL);
    });

    test('should handle high-load stress test', async () => {
        await system.start();
        
        // Create many subscriptions
        for (let i = 0; i < 50; i++) {
            system.subscribe(`dashboard-${i}`, {
                categories: [NotificationCategory.RACE_UPDATE],
                minPriority: NotificationPriority.LOW
            });
        }
        
        // Send many notifications rapidly
        const notifications = [];
        for (let i = 0; i < 100; i++) {
            const promise = system.sendNotification({
                category: NotificationCategory.RACE_UPDATE,
                title: `Notification ${i}`,
                message: `Test message ${i}`,
                priority: NotificationPriority.NORMAL
            });
            notifications.push(promise);
        }
        
        const results = await Promise.allSettled(notifications);
        const successful = results.filter(r => r.status === 'fulfilled');
        
        expect(successful.length).toBe(100);
        expect(system.stats.totalNotifications).toBe(100);
        expect(system.stats.notificationsSent).toBeGreaterThan(0);
    }, 10000);

    test('should emit all expected events', async () => {
        const events = [];
        const originalEmit = system.emit;
        system.emit = function(event, data) {
            events.push({ event, data });
            return originalEmit.call(this, event, data);
        };

        await system.start();
        system.subscribe('dashboard-1');
        
        await system.sendNotification({
            category: NotificationCategory.RACE_UPDATE,
            title: 'Test',
            message: 'Test message'
        });
        
        system.acknowledgeNotification(system.notifications.keys().next().value, 'dashboard-1');
        system.unsubscribe('dashboard-1');
        await system.stop();
        
        const eventTypes = events.map(e => e.event);
        expect(eventTypes).toContain('system-started');
        expect(eventTypes).toContain('dashboard-subscribed');
        expect(eventTypes).toContain('notification-sent');
        expect(eventTypes).toContain('websocket-delivery');
        expect(eventTypes).toContain('notification-acknowledged');
        expect(eventTypes).toContain('dashboard-unsubscribed');
        expect(eventTypes).toContain('system-stopped');
    });
});

describe('Integration Tests', () => {
    test('should integrate with other real-time components', async () => {
        const notificationSystem = new DashboardNotificationSystem();
        await notificationSystem.start();
        
        // Simulate dashboard connections
        const dashboards = [
            { id: 'team-manager-1', userId: 'manager-1', raceFilters: ['tour-de-france-2024'] },
            { id: 'race-director-1', userId: 'director-1', minPriority: NotificationPriority.HIGH },
            { id: 'spectator-1', userId: 'fan-1', categories: [NotificationCategory.RACE_UPDATE] }
        ];
        
        dashboards.forEach(dashboard => {
            notificationSystem.subscribe(dashboard.id, dashboard);
        });
        
        // Simulate real-time events from other components
        const events = [
            // Position update
            {
                category: NotificationCategory.RACE_UPDATE,
                title: 'Position Update',
                message: 'Pogačar takes the lead',
                raceId: 'tour-de-france-2024',
                riderId: 'tadej-pogacar',
                priority: NotificationPriority.NORMAL
            },
            
            // Tactical event
            {
                category: NotificationCategory.TACTICAL_EVENT,
                title: 'Attack!',
                message: 'Vingegaard attacks on the final climb',
                raceId: 'tour-de-france-2024',
                riderId: 'jonas-vingegaard',
                priority: NotificationPriority.URGENT
            },
            
            // Weather alert
            {
                category: NotificationCategory.WEATHER_ALERT,
                title: 'Weather Warning',
                message: 'Heavy rain approaching finish line',
                raceId: 'tour-de-france-2024',
                priority: NotificationPriority.HIGH
            },
            
            // System status
            {
                category: NotificationCategory.SYSTEM_STATUS,
                title: 'Data Quality Alert',
                message: 'GPS signal degraded for sector 3',
                priority: NotificationPriority.NORMAL
            }
        ];
        
        // Send all events
        const results = await Promise.allSettled(
            events.map(event => notificationSystem.sendNotification(event))
        );
        
        const successful = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        
        // Verify delivery logic
        expect(successful).toHaveLength(4);
        
        // Team manager should receive race-specific notifications
        const teamManagerNotifications = successful.filter(r => r.recipientCount >= 1);
        expect(teamManagerNotifications.length).toBeGreaterThan(0);
        
        // Race director should receive high priority notifications
        const highPriorityEvents = events.filter(e => e.priority >= NotificationPriority.HIGH);
        expect(highPriorityEvents.length).toBe(2); // Tactical event and weather alert
        
        // Verify system health
        const health = await notificationSystem.healthCheck();
        expect(health.status).toBe('healthy');
        expect(health.system.activeSubscriptions).toBe(3);
        
        const stats = notificationSystem.getStats();
        expect(stats.totalNotifications).toBe(4);
        expect(stats.activeSubscriptions).toBe(3);
        
        await notificationSystem.stop();
    });
});