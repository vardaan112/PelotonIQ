/**
 * Test suite for Connection Resilience & Failover Manager
 * Comprehensive testing of connection resilience, failover, and recovery scenarios
 */

const ConnectionResilienceManager = require('../ConnectionResilienceManager');

describe('ConnectionResilienceManager', () => {
    let manager;
    
    beforeEach(() => {
        manager = new ConnectionResilienceManager({
            healthCheckInterval: 100,
            connectionTimeout: 1000,
            maxRetryAttempts: 3,
            retryDelay: 100,
            failureThreshold: 2,
            circuitBreakerTimeout: 500
        });
    });
    
    afterEach(() => {
        if (manager) {
            manager.cleanup();
        }
    });
    
    describe('Endpoint Registration', () => {
        test('should register primary endpoint successfully', () => {
            const endpoint = { url: 'ws://localhost:8080/race-data' };
            
            manager.registerEndpoint('primary-race-feed', endpoint, {
                type: 'websocket',
                priority: 'primary',
                weight: 100
            });
            
            expect(manager.connections.has('primary-race-feed')).toBe(true);
            expect(manager.primaryEndpoints).toContain('primary-race-feed');
            
            const connection = manager.connections.get('primary-race-feed');
            expect(connection.endpoint).toBe(endpoint);
            expect(connection.status).toBe('inactive');
            expect(connection.healthScore).toBe(100);
        });
        
        test('should register fallback endpoint', () => {
            const endpoint = { url: 'ws://backup.example.com/race-data' };
            
            manager.registerEndpoint('backup-feed', endpoint, {
                priority: 'fallback',
                weight: 50
            });
            
            expect(manager.connections.has('backup-feed')).toBe(true);
            expect(manager.fallbackEndpoints).toContain('backup-feed');
        });
        
        test('should initialize circuit breaker for new endpoint', () => {
            manager.registerEndpoint('test-endpoint', { url: 'ws://test.com' });
            
            const circuitBreaker = manager.circuitBreakers.get('test-endpoint');
            expect(circuitBreaker).toBeDefined();
            expect(circuitBreaker.state).toBe('closed');
            expect(circuitBreaker.failureCount).toBe(0);
        });
    });
    
    describe('Connection Establishment', () => {
        beforeEach(() => {
            manager.registerEndpoint('test-endpoint', { url: 'ws://test.com' }, { priority: 'primary' });
        });
        
        test('should establish connection successfully', async () => {
            // Mock successful connection
            jest.spyOn(manager, 'establishConnection').mockResolvedValue({
                id: 'test-endpoint',
                socket: { mock: true },
                connected: true
            });
            
            const connection = await manager.connect('test-endpoint');
            
            expect(connection).toBeDefined();
            expect(connection.connected).toBe(true);
            expect(manager.activeConnections.has('test-endpoint')).toBe(true);
            
            const conn = manager.connections.get('test-endpoint');
            expect(conn.status).toBe('connected');
            expect(conn.retryAttempts).toBe(0);
        });
        
        test('should retry on connection failure', async () => {
            let attemptCount = 0;
            jest.spyOn(manager, 'establishConnection').mockImplementation(() => {
                attemptCount++;
                if (attemptCount < 3) {
                    throw new Error('Connection failed');
                }
                return Promise.resolve({ connected: true });
            });
            
            const connection = await manager.connect('test-endpoint');
            
            expect(attemptCount).toBe(3);
            expect(connection.connected).toBe(true);
        });
        
        test('should fail after max retry attempts', async () => {
            jest.spyOn(manager, 'establishConnection').mockRejectedValue(new Error('Connection failed'));
            
            await expect(manager.connect('test-endpoint')).rejects.toThrow('Failed to connect');
            
            expect(manager.failedConnections.has('test-endpoint')).toBe(true);
            expect(manager.activeConnections.has('test-endpoint')).toBe(false);
        });
    });
    
    describe('Circuit Breaker', () => {
        beforeEach(() => {
            manager.registerEndpoint('unreliable-endpoint', { url: 'ws://unreliable.com' });
        });
        
        test('should open circuit breaker after failure threshold', async () => {
            jest.spyOn(manager, 'establishConnection').mockRejectedValue(new Error('Connection failed'));
            
            // Trigger failures to exceed threshold
            for (let i = 0; i < manager.config.failureThreshold; i++) {
                try {
                    await manager.connect('unreliable-endpoint');
                } catch (error) {
                    // Expected to fail
                }
            }
            
            const circuitBreaker = manager.circuitBreakers.get('unreliable-endpoint');
            expect(circuitBreaker.state).toBe('open');
            expect(circuitBreaker.failureCount).toBe(manager.config.failureThreshold);
        });
        
        test('should reject connections when circuit breaker is open', async () => {
            const circuitBreaker = manager.circuitBreakers.get('unreliable-endpoint');
            circuitBreaker.state = 'open';
            circuitBreaker.nextAttempt = Date.now() + 1000;
            
            await expect(manager.connect('unreliable-endpoint')).rejects.toThrow('Circuit breaker open');
        });
        
        test('should transition to half-open after timeout', async () => {
            const circuitBreaker = manager.circuitBreakers.get('unreliable-endpoint');
            circuitBreaker.state = 'open';
            circuitBreaker.nextAttempt = Date.now() - 1000; // Past timeout
            
            jest.spyOn(manager, 'establishConnection').mockResolvedValue({ connected: true });
            
            await manager.connect('unreliable-endpoint');
            
            expect(circuitBreaker.state).toBe('closed');
            expect(circuitBreaker.failureCount).toBe(0);
        });
    });
    
    describe('Failover Management', () => {
        beforeEach(() => {
            manager.registerEndpoint('primary-feed', { url: 'ws://primary.com' }, { priority: 'primary' });
            manager.registerEndpoint('backup-feed', { url: 'ws://backup.com' }, { priority: 'fallback' });
        });
        
        test('should select best available endpoint', async () => {
            // Set up different health scores
            manager.connections.get('primary-feed').healthScore = 90;
            manager.connections.get('backup-feed').healthScore = 70;
            
            const bestEndpoint = await manager.selectBestEndpoint();
            expect(bestEndpoint).toBe('primary-feed');
        });
        
        test('should failover to backup when primary fails', async () => {
            jest.spyOn(manager, 'establishConnection').mockResolvedValue({ connected: true });
            
            // Mark primary as failed
            manager.failedConnections.add('primary-feed');
            
            const connection = await manager.handleFailover('primary-feed');
            
            expect(connection).toBeDefined();
            expect(manager.currentEndpoint).toBe('backup-feed');
            expect(manager.failoverState).toBe('fallback');
        });
        
        test('should enter degraded mode when no endpoints available', async () => {
            // Mark all endpoints as failed
            manager.failedConnections.add('primary-feed');
            manager.failedConnections.add('backup-feed');
            
            const connection = await manager.handleFailover('primary-feed');
            
            expect(connection).toBeNull();
            expect(manager.failoverState).toBe('degraded');
        });
    });
    
    describe('Health Monitoring', () => {
        beforeEach(() => {
            manager.registerEndpoint('monitored-endpoint', { url: 'ws://monitored.com' });
            manager.activeConnections.add('monitored-endpoint');
        });
        
        test('should update connection health score', async () => {
            const connection = manager.connections.get('monitored-endpoint');
            connection.status = 'connected';
            
            // Simulate good latency
            connection.metrics.latency = 50;
            
            jest.spyOn(manager, 'sleep').mockResolvedValue();
            
            manager.startConnectionMonitoring('monitored-endpoint');
            
            // Wait for health check
            await new Promise(resolve => setTimeout(resolve, 150));
            
            expect(connection.healthScore).toBeGreaterThan(90);
        });
        
        test('should detect stale connections', async () => {
            const connection = manager.connections.get('monitored-endpoint');
            connection.status = 'connected';
            connection.metrics.lastPing = Date.now() - 2000; // 2 seconds ago
            
            jest.spyOn(manager, 'handleFailover').mockResolvedValue(null);
            
            await manager.performHealthChecks();
            
            expect(manager.handleFailover).toHaveBeenCalledWith('monitored-endpoint');
        });
    });
    
    describe('Data Validation', () => {
        test('should validate well-formed messages', () => {
            const validMessage = {
                id: 'msg-123',
                type: 'position-update',
                timestamp: Date.now(),
                data: { latitude: 45.123, longitude: 2.456 }
            };
            
            expect(manager.validateMessage(validMessage)).toBe(true);
        });
        
        test('should reject messages without required fields', () => {
            const invalidMessage = {
                data: { latitude: 45.123, longitude: 2.456 }
            };
            
            expect(manager.validateMessage(invalidMessage)).toBe(false);
        });
        
        test('should detect duplicate messages', () => {
            const message = {
                id: 'duplicate-test',
                type: 'test',
                timestamp: Date.now(),
                data: {}
            };
            
            expect(manager.validateMessage(message)).toBe(true);
            expect(manager.validateMessage(message)).toBe(false); // Duplicate
        });
        
        test('should validate checksums when enabled', () => {
            manager.config.checksumValidation = true;
            
            const data = { test: 'data' };
            const checksum = manager.calculateChecksum(data);
            
            const message = {
                id: 'checksum-test',
                type: 'test',
                timestamp: Date.now(),
                data,
                checksum
            };
            
            expect(manager.validateMessage(message)).toBe(true);
            
            // Invalid checksum
            message.checksum = 'invalid';
            expect(manager.validateMessage(message)).toBe(false);
        });
    });
    
    describe('Status Reporting', () => {
        test('should provide comprehensive status', () => {
            manager.registerEndpoint('status-test', { url: 'ws://test.com' }, { priority: 'primary' });
            manager.activeConnections.add('status-test');
            
            const status = manager.getStatus();
            
            expect(status).toHaveProperty('sessionId');
            expect(status).toHaveProperty('failoverState');
            expect(status).toHaveProperty('activeConnections');
            expect(status).toHaveProperty('networkMetrics');
            expect(status.totalConnections).toBe(1);
        });
    });
    
    describe('Resource Cleanup', () => {
        test('should cleanup resources properly', () => {
            manager.registerEndpoint('cleanup-test', { url: 'ws://test.com' });
            manager.activeConnections.add('cleanup-test');
            manager.startConnectionMonitoring('cleanup-test');
            
            expect(manager.healthChecks.size).toBe(1);
            
            manager.cleanup();
            
            expect(manager.activeConnections.size).toBe(0);
            expect(manager.failedConnections.size).toBe(0);
            expect(manager.healthChecks.size).toBe(0);
        });
    });
    
    describe('Integration Scenarios', () => {
        test('should handle complete failover scenario', async () => {
            // Setup multiple endpoints
            manager.registerEndpoint('primary', { url: 'ws://primary.com' }, { priority: 'primary' });
            manager.registerEndpoint('secondary', { url: 'ws://secondary.com' }, { priority: 'fallback' });
            
            // Mock connections
            jest.spyOn(manager, 'establishConnection')
                .mockImplementationOnce(() => Promise.reject(new Error('Primary failed')))
                .mockImplementationOnce(() => Promise.resolve({ connected: true, id: 'secondary' }));
            
            // Attempt primary connection (will fail)
            try {
                await manager.connect('primary');
            } catch (error) {
                // Expected failure
            }
            
            // Trigger failover
            const failoverConnection = await manager.handleFailover('primary');
            
            expect(failoverConnection).toBeDefined();
            expect(manager.currentEndpoint).toBe('secondary');
            expect(manager.failoverState).toBe('fallback');
        });
        
        test('should recover from degraded state', async () => {
            manager.registerEndpoint('recovery-test', { url: 'ws://recovery.com' }, { priority: 'primary' });
            
            // Enter degraded state
            manager.failoverState = 'degraded';
            manager.failedConnections.add('recovery-test');
            
            // Reset circuit breaker
            const circuitBreaker = manager.circuitBreakers.get('recovery-test');
            circuitBreaker.state = 'closed';
            circuitBreaker.failureCount = 0;
            
            // Mock successful recovery
            jest.spyOn(manager, 'establishConnection').mockResolvedValue({ connected: true });
            
            const connection = await manager.connect('recovery-test');
            
            expect(connection.connected).toBe(true);
            expect(manager.activeConnections.has('recovery-test')).toBe(true);
            expect(manager.failedConnections.has('recovery-test')).toBe(false);
        });
    });
});

// Performance and stress tests
describe('ConnectionResilienceManager Performance', () => {
    let manager;
    
    beforeEach(() => {
        manager = new ConnectionResilienceManager({
            healthCheckInterval: 50,
            maxRetryAttempts: 2
        });
    });
    
    afterEach(() => {
        if (manager) {
            manager.cleanup();
        }
    });
    
    test('should handle multiple concurrent connections', async () => {
        const endpointCount = 10;
        const endpoints = [];
        
        // Register multiple endpoints
        for (let i = 0; i < endpointCount; i++) {
            const endpointId = `endpoint-${i}`;
            manager.registerEndpoint(endpointId, { url: `ws://test${i}.com` });
            endpoints.push(endpointId);
        }
        
        // Mock all connections to succeed
        jest.spyOn(manager, 'establishConnection').mockResolvedValue({ connected: true });
        
        // Connect to all endpoints concurrently
        const connectionPromises = endpoints.map(id => manager.connect(id));
        const connections = await Promise.all(connectionPromises);
        
        expect(connections).toHaveLength(endpointCount);
        expect(manager.activeConnections.size).toBe(endpointCount);
    });
    
    test('should handle rapid message validation', () => {
        const messageCount = 1000;
        const messages = [];
        
        // Generate test messages
        for (let i = 0; i < messageCount; i++) {
            messages.push({
                id: `msg-${i}`,
                type: 'test',
                timestamp: Date.now() + i,
                data: { value: i }
            });
        }
        
        const startTime = Date.now();
        
        // Validate all messages
        const results = messages.map(msg => manager.validateMessage(msg));
        
        const duration = Date.now() - startTime;
        
        expect(results.every(r => r === true)).toBe(true);
        expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
});

module.exports = {};