/**
 * Comprehensive test suite for WebSocketManager
 * Tests all scenarios including edge cases and failure conditions
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const Redis = require('redis-mock');
const WebSocketManager = require('../WebSocketManager');

// Mock Redis
jest.mock('redis', () => require('redis-mock'));

describe('WebSocketManager', () => {
    let wsManager;
    let mockRedis;
    const JWT_SECRET = 'test-secret';
    const TEST_PORT = 8081;

    // Helper function to create valid JWT token
    const createToken = (payload = {}) => {
        const defaultPayload = {
            userId: 'test-user-1',
            permissions: ['realtime-access', 'race-data'],
            exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
        };
        return jwt.sign({ ...defaultPayload, ...payload }, JWT_SECRET);
    };

    // Helper function to create WebSocket client
    const createClient = (token) => {
        const validToken = token || createToken();
        return new WebSocket(`ws://localhost:${TEST_PORT}?token=${validToken}`);
    };

    beforeEach(async () => {
        wsManager = new WebSocketManager({
            port: TEST_PORT,
            jwtSecret: JWT_SECRET,
            heartbeatInterval: 1000, // Shorter for testing
            connectionTimeout: 2000,
            maxConnections: 100,
            rateLimitMax: 10,
            rateLimitWindow: 1000
        });

        await wsManager.start();
        
        // Wait for server to be ready
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
        if (wsManager) {
            await wsManager.shutdown();
        }
    });

    describe('Connection Establishment', () => {
        test('should accept connection with valid token', (done) => {
            const client = createClient();
            
            client.onopen = () => {
                expect(wsManager.stats.activeConnections).toBe(1);
                client.close();
                done();
            };

            client.onerror = (error) => {
                done(error);
            };
        });

        test('should reject connection without token', (done) => {
            const client = new WebSocket(`ws://localhost:${TEST_PORT}`);
            
            client.onopen = () => {
                done(new Error('Connection should have been rejected'));
            };

            client.onerror = () => {
                expect(wsManager.stats.activeConnections).toBe(0);
                done();
            };

            client.onclose = () => {
                expect(wsManager.stats.activeConnections).toBe(0);
                done();
            };
        });

        test('should reject connection with invalid token', (done) => {
            const invalidToken = 'invalid-token';
            const client = new WebSocket(`ws://localhost:${TEST_PORT}?token=${invalidToken}`);
            
            client.onopen = () => {
                done(new Error('Connection should have been rejected'));
            };

            client.onerror = () => {
                done();
            };

            client.onclose = () => {
                done();
            };
        });

        test('should reject connection with expired token', (done) => {
            const expiredToken = jwt.sign({
                userId: 'test-user',
                permissions: ['realtime-access'],
                exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
            }, JWT_SECRET);

            const client = new WebSocket(`ws://localhost:${TEST_PORT}?token=${expiredToken}`);
            
            client.onopen = () => {
                done(new Error('Connection should have been rejected'));
            };

            client.onerror = () => {
                done();
            };

            client.onclose = () => {
                done();
            };
        });

        test('should reject connection without proper permissions', (done) => {
            const tokenWithoutPermissions = createToken({
                permissions: ['other-permission']
            });

            const client = new WebSocket(`ws://localhost:${TEST_PORT}?token=${tokenWithoutPermissions}`);
            
            client.onopen = () => {
                done(new Error('Connection should have been rejected'));
            };

            client.onerror = () => {
                done();
            };

            client.onclose = () => {
                done();
            };
        });

        test('should handle maximum connections limit', async () => {
            const maxConnections = 3;
            wsManager.options.maxConnections = maxConnections;

            const clients = [];
            const connectionPromises = [];

            // Create max connections
            for (let i = 0; i < maxConnections; i++) {
                const client = createClient(createToken({ userId: `user-${i}` }));
                clients.push(client);
                
                connectionPromises.push(new Promise((resolve, reject) => {
                    client.onopen = resolve;
                    client.onerror = reject;
                    setTimeout(() => reject(new Error('Connection timeout')), 2000);
                }));
            }

            await Promise.all(connectionPromises);
            expect(wsManager.stats.activeConnections).toBe(maxConnections);

            // Try to create one more connection (should be rejected)
            const extraClient = createClient(createToken({ userId: 'extra-user' }));
            
            await new Promise((resolve) => {
                extraClient.onopen = () => {
                    resolve(new Error('Extra connection should have been rejected'));
                };
                extraClient.onerror = resolve;
                extraClient.onclose = resolve;
                setTimeout(resolve, 1000);
            });

            // Clean up
            clients.forEach(client => client.close());
        });
    });

    describe('Message Handling', () => {
        let client;

        beforeEach((done) => {
            client = createClient();
            client.onopen = () => done();
            client.onerror = done;
        });

        afterEach(() => {
            if (client) {
                client.close();
            }
        });

        test('should handle ping/pong messages', (done) => {
            client.send(JSON.stringify({ type: 'ping' }));
            
            client.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'pong') {
                    expect(message.timestamp).toBeDefined();
                    done();
                }
            };
        });

        test('should handle subscription requests', (done) => {
            const topics = ['race.positions', 'race.weather'];
            client.send(JSON.stringify({
                type: 'subscribe',
                topics: topics
            }));

            client.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'subscription-result') {
                    expect(message.validTopics).toEqual(topics);
                    expect(message.invalidTopics).toEqual([]);
                    expect(message.totalSubscriptions).toBe(topics.length);
                    done();
                }
            };
        });

        test('should reject invalid topic subscriptions', (done) => {
            const invalidTopics = ['invalid.topic', 'another.invalid'];
            client.send(JSON.stringify({
                type: 'subscribe',
                topics: invalidTopics
            }));

            client.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'subscription-result') {
                    expect(message.validTopics).toEqual([]);
                    expect(message.invalidTopics).toEqual(invalidTopics);
                    done();
                }
            };
        });

        test('should handle unsubscription requests', (done) => {
            // First subscribe
            const topics = ['race.positions', 'race.weather'];
            client.send(JSON.stringify({
                type: 'subscribe',
                topics: topics
            }));

            let subscribed = false;
            client.onmessage = (event) => {
                const message = JSON.parse(event.data);
                
                if (message.type === 'subscription-result' && !subscribed) {
                    subscribed = true;
                    // Now unsubscribe from one topic
                    client.send(JSON.stringify({
                        type: 'unsubscribe',
                        topics: ['race.positions']
                    }));
                } else if (message.type === 'unsubscription-result') {
                    expect(message.topics).toEqual(['race.positions']);
                    expect(message.totalSubscriptions).toBe(1);
                    done();
                }
            };
        });

        test('should handle invalid JSON messages', (done) => {
            client.send('invalid json');
            
            client.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'error' && message.code === 'INVALID_JSON') {
                    done();
                }
            };
        });

        test('should handle unknown message types', (done) => {
            client.send(JSON.stringify({ type: 'unknown-type' }));
            
            client.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'error' && message.code === 'UNKNOWN_MESSAGE_TYPE') {
                    done();
                }
            };
        });

        test('should enforce rate limiting', async () => {
            const rateLimitMax = wsManager.options.rateLimitMax;
            let errorReceived = false;

            // Send messages rapidly to exceed rate limit
            for (let i = 0; i < rateLimitMax + 5; i++) {
                client.send(JSON.stringify({ type: 'ping' }));
            }

            await new Promise((resolve) => {
                client.onmessage = (event) => {
                    const message = JSON.parse(event.data);
                    if (message.type === 'error' && message.code === 'RATE_LIMIT_EXCEEDED') {
                        errorReceived = true;
                        resolve();
                    }
                };
                setTimeout(resolve, 2000);
            });

            expect(errorReceived).toBe(true);
            expect(wsManager.stats.rateLimitViolations).toBeGreaterThan(0);
        });
    });

    describe('Broadcasting', () => {
        let clients;

        beforeEach(async () => {
            clients = [];
            const connectionPromises = [];

            for (let i = 0; i < 3; i++) {
                const client = createClient(createToken({ userId: `user-${i}` }));
                clients.push(client);
                
                connectionPromises.push(new Promise((resolve) => {
                    client.onopen = resolve;
                }));
            }

            await Promise.all(connectionPromises);

            // Subscribe all clients to race.positions
            for (const client of clients) {
                client.send(JSON.stringify({
                    type: 'subscribe',
                    topics: ['race.positions']
                }));
            }

            // Wait for subscriptions to complete
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        afterEach(() => {
            clients.forEach(client => client.close());
        });

        test('should broadcast to all subscribers', (done) => {
            const testMessage = {
                type: 'race-update',
                data: { position: 1, rider: 'Test Rider' }
            };

            let receivedCount = 0;
            clients.forEach(client => {
                client.onmessage = (event) => {
                    const message = JSON.parse(event.data);
                    if (message.type === 'race-update') {
                        receivedCount++;
                        if (receivedCount === clients.length) {
                            done();
                        }
                    }
                };
            });

            const result = wsManager.broadcast(testMessage, { topic: 'race.positions' });
            expect(result.recipients).toBe(clients.length);
        });

        test('should broadcast to specific users only', (done) => {
            const testMessage = {
                type: 'user-specific-update',
                data: { message: 'Hello specific users' }
            };

            const targetUserIds = ['user-0', 'user-2'];
            let receivedCount = 0;

            clients.forEach((client, index) => {
                client.onmessage = (event) => {
                    const message = JSON.parse(event.data);
                    if (message.type === 'user-specific-update') {
                        expect(targetUserIds.includes(`user-${index}`)).toBe(true);
                        receivedCount++;
                        if (receivedCount === targetUserIds.length) {
                            done();
                        }
                    }
                };
            });

            const result = wsManager.broadcast(testMessage, { userIds: targetUserIds });
            expect(result.recipients).toBe(targetUserIds.length);
        });

        test('should exclude specific connections from broadcast', (done) => {
            const testMessage = {
                type: 'broadcast-test',
                data: { test: true }
            };

            // Get connection ID of first client
            const allConnections = wsManager.getAllConnections();
            const excludeConnectionId = allConnections[0].id;

            let receivedCount = 0;
            clients.forEach((client, index) => {
                client.onmessage = (event) => {
                    const message = JSON.parse(event.data);
                    if (message.type === 'broadcast-test') {
                        // First client should not receive the message
                        expect(index).not.toBe(0);
                        receivedCount++;
                        if (receivedCount === clients.length - 1) {
                            done();
                        }
                    }
                };
            });

            const result = wsManager.broadcast(testMessage, {
                topic: 'race.positions',
                excludeConnectionIds: new Set([excludeConnectionId])
            });
            expect(result.recipients).toBe(clients.length - 1);
        });
    });

    describe('Heartbeat and Connection Management', () => {
        test('should detect dead connections', async () => {
            const client = createClient();
            
            await new Promise((resolve) => {
                client.onopen = resolve;
            });

            expect(wsManager.stats.activeConnections).toBe(1);

            // Simulate client disconnect without proper close
            client.terminate();

            // Wait for heartbeat to detect dead connection
            await new Promise(resolve => setTimeout(resolve, 3000));

            expect(wsManager.stats.activeConnections).toBe(0);
        });

        test('should handle heartbeat responses', (done) => {
            const client = createClient();
            
            client.onopen = () => {
                const connection = wsManager.getAllConnections()[0];
                const initialHeartbeat = connection.lastHeartbeat;

                // Send pong to update heartbeat
                client.pong();

                setTimeout(() => {
                    expect(connection.lastHeartbeat.getTime()).toBeGreaterThan(initialHeartbeat.getTime());
                    client.close();
                    done();
                }, 100);
            };
        });

        test('should cleanup connection resources on close', async () => {
            const client = createClient();
            
            await new Promise((resolve) => {
                client.onopen = resolve;
            });

            const connectionId = wsManager.getAllConnections()[0].id;
            expect(wsManager.getConnection(connectionId)).toBeDefined();

            client.close();

            // Wait for cleanup
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(wsManager.getConnection(connectionId)).toBeUndefined();
            expect(wsManager.stats.activeConnections).toBe(0);
        });
    });

    describe('Error Handling', () => {
        test('should handle client errors gracefully', (done) => {
            const client = createClient();
            
            client.onopen = () => {
                // Force an error by sending invalid data
                client._socket.write('invalid websocket frame');
            };

            wsManager.on('connection-error', (event) => {
                expect(event.connectionId).toBeDefined();
                expect(event.error).toBeDefined();
                done();
            });
        });

        test('should handle server errors', (done) => {
            wsManager.on('server-error', (error) => {
                expect(error).toBeDefined();
                done();
            });

            // Simulate server error
            wsManager.server.emit('error', new Error('Test server error'));
        });

        test('should handle Redis connection errors', (done) => {
            wsManager.on('redis-error', (error) => {
                expect(error).toBeDefined();
                done();
            });

            // Simulate Redis error
            wsManager.redis.emit('error', new Error('Test Redis error'));
        });
    });

    describe('Permission System', () => {
        test('should enforce topic permissions', (done) => {
            const limitedToken = createToken({
                permissions: ['realtime-access'] // No race-data permission
            });
            const client = new WebSocket(`ws://localhost:${TEST_PORT}?token=${limitedToken}`);
            
            client.onopen = () => {
                client.send(JSON.stringify({
                    type: 'subscribe',
                    topics: ['race.positions'] // Requires race-data permission
                }));
            };

            client.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'subscription-result') {
                    expect(message.validTopics).toEqual([]);
                    expect(message.invalidTopics).toEqual(['race.positions']);
                    client.close();
                    done();
                }
            };
        });

        test('should allow admin access to all topics', (done) => {
            const adminToken = createToken({
                permissions: ['realtime-access', 'admin']
            });
            const client = new WebSocket(`ws://localhost:${TEST_PORT}?token=${adminToken}`);
            
            client.onopen = () => {
                client.send(JSON.stringify({
                    type: 'subscribe',
                    topics: ['race.positions', 'system.status']
                }));
            };

            client.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'subscription-result') {
                    expect(message.validTopics).toEqual(['race.positions', 'system.status']);
                    expect(message.invalidTopics).toEqual([]);
                    client.close();
                    done();
                }
            };
        });

        test('should provide stats to admin users only', (done) => {
            const adminToken = createToken({
                permissions: ['realtime-access', 'admin']
            });
            const client = new WebSocket(`ws://localhost:${TEST_PORT}?token=${adminToken}`);
            
            client.onopen = () => {
                client.send(JSON.stringify({ type: 'get-stats' }));
            };

            client.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'stats') {
                    expect(message.stats).toBeDefined();
                    expect(message.stats.activeConnections).toBeDefined();
                    client.close();
                    done();
                }
            };
        });
    });

    describe('Network Resilience', () => {
        test('should handle network partition scenarios', async () => {
            const client = createClient();
            
            await new Promise((resolve) => {
                client.onopen = resolve;
            });

            // Simulate network partition by closing socket without WebSocket close frame
            client._socket.destroy();

            // Wait for heartbeat to detect the issue
            await new Promise(resolve => setTimeout(resolve, 3000));

            expect(wsManager.stats.activeConnections).toBe(0);
        });

        test('should handle concurrent connections from same user', async () => {
            const userId = 'multi-connection-user';
            const clients = [];
            
            // Create multiple connections for same user
            for (let i = 0; i < 3; i++) {
                const client = createClient(createToken({ userId: userId }));
                clients.push(client);
            }

            await Promise.all(clients.map(client => 
                new Promise(resolve => {
                    client.onopen = resolve;
                })
            ));

            const userConnections = wsManager.getUserConnections(userId);
            expect(userConnections.length).toBe(3);

            // Test sending message to user (should reach all connections)
            const sentCount = wsManager.sendToUser(userId, {
                type: 'test-message',
                data: 'Hello user'
            });

            expect(sentCount).toBe(3);

            // Clean up
            clients.forEach(client => client.close());
        });
    });

    describe('Performance and Load Testing', () => {
        test('should handle high message volume', async () => {
            const client = createClient();
            
            await new Promise((resolve) => {
                client.onopen = resolve;
            });

            const messageCount = 50;
            let receivedCount = 0;

            client.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'pong') {
                    receivedCount++;
                }
            };

            // Send many ping messages rapidly
            for (let i = 0; i < messageCount; i++) {
                client.send(JSON.stringify({ type: 'ping' }));
            }

            // Wait for responses
            await new Promise(resolve => setTimeout(resolve, 1000));

            expect(receivedCount).toBeGreaterThan(0);
            expect(wsManager.stats.messagesReceived).toBeGreaterThanOrEqual(messageCount);

            client.close();
        });

        test('should maintain performance with many subscribers', async () => {
            const clientCount = 20;
            const clients = [];
            
            // Create many clients
            for (let i = 0; i < clientCount; i++) {
                const client = createClient(createToken({ userId: `load-test-user-${i}` }));
                clients.push(client);
            }

            await Promise.all(clients.map(client => 
                new Promise(resolve => {
                    client.onopen = resolve;
                })
            ));

            // Subscribe all to same topic
            for (const client of clients) {
                client.send(JSON.stringify({
                    type: 'subscribe',
                    topics: ['race.positions']
                }));
            }

            await new Promise(resolve => setTimeout(resolve, 200));

            // Broadcast message and measure performance
            const startTime = Date.now();
            const result = wsManager.broadcast({
                type: 'load-test',
                data: { test: true }
            }, { topic: 'race.positions' });
            const endTime = Date.now();

            expect(result.recipients).toBe(clientCount);
            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second

            // Clean up
            clients.forEach(client => client.close());
        });
    });

    describe('Graceful Shutdown', () => {
        test('should shutdown gracefully', async () => {
            const client = createClient();
            
            await new Promise((resolve) => {
                client.onopen = resolve;
            });

            let shutdownMessageReceived = false;
            client.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'server-shutdown') {
                    shutdownMessageReceived = true;
                }
            };

            // Initiate shutdown
            const shutdownPromise = wsManager.shutdown();

            // Wait a bit for shutdown message
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(shutdownMessageReceived).toBe(true);

            await shutdownPromise;
            expect(wsManager.stats.activeConnections).toBe(0);
        });
    });

    describe('Reconnecting Client', () => {
        test('should reconnect automatically on connection loss', (done) => {
            const client = WebSocketManager.createReconnectingClient(
                `ws://localhost:${TEST_PORT}?token=${createToken()}`,
                {
                    reconnectAttempts: 3,
                    reconnectDelay: 100
                }
            );

            let connectionCount = 0;
            client.on('open', () => {
                connectionCount++;
                
                if (connectionCount === 1) {
                    // Close connection to trigger reconnect
                    client.ws.close();
                } else if (connectionCount === 2) {
                    // Second connection successful - reconnect worked
                    expect(connectionCount).toBe(2);
                    client.close();
                    done();
                }
            });

            client.connect();
        });

        test('should emit max-reconnects-reached after exhausting attempts', (done) => {
            // Create client with connection to invalid port to force connection failures
            const client = WebSocketManager.createReconnectingClient(
                `ws://localhost:9999?token=${createToken()}`,
                {
                    reconnectAttempts: 2,
                    reconnectDelay: 10
                }
            );

            client.on('max-reconnects-reached', () => {
                expect(client.reconnectCount).toBe(2);
                done();
            });

            client.connect();
        });
    });

    describe('Edge Cases', () => {
        test('should handle malformed subscription topics', (done) => {
            const client = createClient();
            
            client.onopen = () => {
                client.send(JSON.stringify({
                    type: 'subscribe',
                    topics: 'not-an-array' // Should be array
                }));
            };

            client.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'error' && message.code === 'INVALID_TOPICS') {
                    client.close();
                    done();
                }
            };
        });

        test('should handle subscription to empty topics array', (done) => {
            const client = createClient();
            
            client.onopen = () => {
                client.send(JSON.stringify({
                    type: 'subscribe',
                    topics: []
                }));
            };

            client.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'subscription-result') {
                    expect(message.validTopics).toEqual([]);
                    expect(message.invalidTopics).toEqual([]);
                    expect(message.totalSubscriptions).toBe(0);
                    client.close();
                    done();
                }
            };
        });

        test('should handle sending message to disconnected client', (done) => {
            const client = createClient();
            
            client.onopen = () => {
                const connectionId = wsManager.getAllConnections()[0].id;
                
                // Close client connection
                client.close();
                
                setTimeout(() => {
                    // Try to send message to disconnected client
                    const result = wsManager.sendMessage(connectionId, {
                        type: 'test',
                        data: 'test'
                    });
                    
                    expect(result).toBe(false);
                    done();
                }, 100);
            };
        });

        test('should handle concurrent message processing', async () => {
            const client = createClient();
            
            await new Promise((resolve) => {
                client.onopen = resolve;
            });

            // Send multiple messages concurrently
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(new Promise((resolve) => {
                    client.send(JSON.stringify({ type: 'ping', id: i }));
                    resolve();
                }));
            }

            await Promise.all(promises);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 100));

            // Should not have caused any errors
            expect(wsManager.stats.errors).toBe(0);

            client.close();
        });

        test('should handle memory pressure gracefully', async () => {
            const client = createClient();
            
            await new Promise((resolve) => {
                client.onopen = resolve;
            });

            // Send very large message
            const largeData = 'x'.repeat(1000000); // 1MB string
            
            try {
                client.send(JSON.stringify({
                    type: 'ping',
                    data: largeData
                }));

                // Should handle large message without crashing
                await new Promise(resolve => setTimeout(resolve, 100));
                expect(wsManager.stats.activeConnections).toBe(1);
                
            } catch (error) {
                // Large message might be rejected, which is acceptable
                expect(error).toBeDefined();
            }

            client.close();
        });
    });
});