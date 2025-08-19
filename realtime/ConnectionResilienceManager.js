/**
 * Connection Resilience & Failover Manager
 * Ensures robust operation of real-time data streaming with automatic recovery
 */

const EventEmitter = require('events');
const { nanoid } = require('nanoid');

class ConnectionResilienceManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.sessionId = nanoid();
        this.config = {
            // Connection monitoring
            healthCheckInterval: options.healthCheckInterval || 5000, // 5 seconds
            connectionTimeout: options.connectionTimeout || 30000, // 30 seconds
            maxRetryAttempts: options.maxRetryAttempts || 5,
            retryDelay: options.retryDelay || 2000, // 2 seconds
            backoffMultiplier: options.backoffMultiplier || 1.5,
            maxRetryDelay: options.maxRetryDelay || 30000, // 30 seconds
            
            // Circuit breaker
            failureThreshold: options.failureThreshold || 3,
            circuitBreakerTimeout: options.circuitBreakerTimeout || 60000, // 1 minute
            
            // Failover
            enableFailover: options.enableFailover !== false,
            failoverTimeout: options.failoverTimeout || 10000, // 10 seconds
            primaryWeight: options.primaryWeight || 100,
            fallbackWeight: options.fallbackWeight || 50,
            
            // Connection pooling
            maxConnections: options.maxConnections || 10,
            connectionPoolTimeout: options.connectionPoolTimeout || 5000,
            
            // Network monitoring
            networkQualityThreshold: options.networkQualityThreshold || 0.7,
            latencyThreshold: options.latencyThreshold || 1000, // 1 second
            
            // Data integrity
            enableDataValidation: options.enableDataValidation !== false,
            checksumValidation: options.checksumValidation !== false,
            duplicateDetectionWindow: options.duplicateDetectionWindow || 60000 // 1 minute
        };
        
        // Connection state management
        this.connections = new Map();
        this.circuitBreakers = new Map();
        this.connectionPool = [];
        this.activeConnections = new Set();
        this.failedConnections = new Set();
        
        // Health monitoring
        this.healthChecks = new Map();
        this.networkMetrics = {
            latency: [],
            throughput: [],
            errorRate: [],
            lastUpdate: Date.now()
        };
        
        // Failover management
        this.primaryEndpoints = [];
        this.fallbackEndpoints = [];
        this.currentEndpoint = null;
        this.failoverState = 'primary'; // 'primary', 'fallback', 'degraded'
        
        // Data integrity tracking
        this.receivedMessages = new Set();
        this.messageSequence = 0;
        this.lastMessageTime = Date.now();
        
        this.logger = console; // Can be replaced with proper logger
        
        this.logger.info('ConnectionResilienceManager initialized', {
            sessionId: this.sessionId,
            config: this.config
        });
        
        this.startHealthMonitoring();
    }
    
    /**
     * Register a connection endpoint
     */
    registerEndpoint(id, endpoint, options = {}) {
        const connectionConfig = {
            id,
            endpoint,
            type: options.type || 'websocket',
            priority: options.priority || 'primary',
            weight: options.weight || 100,
            retryAttempts: 0,
            lastAttempt: null,
            status: 'inactive',
            healthScore: 100,
            metrics: {
                connectTime: null,
                lastPing: null,
                latency: 0,
                messageCount: 0,
                errorCount: 0
            },
            created: Date.now()
        };
        
        this.connections.set(id, connectionConfig);
        
        if (options.priority === 'primary') {
            this.primaryEndpoints.push(id);
        } else {
            this.fallbackEndpoints.push(id);
        }
        
        // Initialize circuit breaker
        this.circuitBreakers.set(id, {
            state: 'closed', // 'closed', 'open', 'half-open'
            failureCount: 0,
            lastFailure: null,
            nextAttempt: null
        });
        
        this.logger.info('Endpoint registered', {
            id,
            endpoint: endpoint.url || endpoint,
            priority: options.priority,
            sessionId: this.sessionId
        });
        
        this.emit('endpoint-registered', { id, endpoint, options });
    }
    
    /**
     * Establish connection with resilience
     */
    async connect(endpointId, options = {}) {
        const connection = this.connections.get(endpointId);
        if (!connection) {
            throw new Error(`Unknown endpoint: ${endpointId}`);
        }
        
        const circuitBreaker = this.circuitBreakers.get(endpointId);
        
        // Check circuit breaker
        if (circuitBreaker.state === 'open') {
            const now = Date.now();
            if (now < circuitBreaker.nextAttempt) {
                throw new Error(`Circuit breaker open for ${endpointId}`);
            } else {
                circuitBreaker.state = 'half-open';
                this.logger.info('Circuit breaker transitioning to half-open', { endpointId });
            }
        }
        
        const startTime = Date.now();
        let retryAttempt = 0;
        
        while (retryAttempt <= this.config.maxRetryAttempts) {
            try {
                this.logger.info('Attempting connection', {
                    endpointId,
                    attempt: retryAttempt + 1,
                    maxAttempts: this.config.maxRetryAttempts + 1
                });
                
                connection.status = 'connecting';
                connection.lastAttempt = Date.now();
                
                // Simulate connection establishment
                const connectionResult = await this.establishConnection(connection, options);
                
                // Connection successful
                connection.status = 'connected';
                connection.retryAttempts = 0;
                connection.metrics.connectTime = Date.now() - startTime;
                
                this.activeConnections.add(endpointId);
                this.failedConnections.delete(endpointId);
                
                // Reset circuit breaker
                circuitBreaker.state = 'closed';
                circuitBreaker.failureCount = 0;
                
                this.logger.info('Connection established successfully', {
                    endpointId,
                    connectTime: connection.metrics.connectTime,
                    sessionId: this.sessionId
                });
                
                this.emit('connection-established', {
                    endpointId,
                    connection: connectionResult,
                    metrics: connection.metrics
                });
                
                // Start connection monitoring
                this.startConnectionMonitoring(endpointId);
                
                return connectionResult;
                
            } catch (error) {
                retryAttempt++;
                connection.metrics.errorCount++;
                
                this.logger.warn('Connection attempt failed', {
                    endpointId,
                    attempt: retryAttempt,
                    error: error.message
                });
                
                // Update circuit breaker
                circuitBreaker.failureCount++;
                circuitBreaker.lastFailure = Date.now();
                
                if (circuitBreaker.failureCount >= this.config.failureThreshold) {
                    circuitBreaker.state = 'open';
                    circuitBreaker.nextAttempt = Date.now() + this.config.circuitBreakerTimeout;
                    
                    this.logger.error('Circuit breaker opened', {
                        endpointId,
                        failureCount: circuitBreaker.failureCount
                    });
                }
                
                if (retryAttempt <= this.config.maxRetryAttempts) {
                    const delay = Math.min(
                        this.config.retryDelay * Math.pow(this.config.backoffMultiplier, retryAttempt - 1),
                        this.config.maxRetryDelay
                    );
                    
                    this.logger.info('Retrying connection', {
                        endpointId,
                        delay,
                        nextAttempt: retryAttempt + 1
                    });
                    
                    await this.sleep(delay);
                }
            }
        }
        
        // All retry attempts failed
        connection.status = 'failed';
        this.failedConnections.add(endpointId);
        this.activeConnections.delete(endpointId);
        
        this.emit('connection-failed', {
            endpointId,
            attempts: retryAttempt,
            totalTime: Date.now() - startTime
        });
        
        throw new Error(`Failed to connect to ${endpointId} after ${retryAttempt} attempts`);
    }
    
    /**
     * Automatic failover management
     */
    async handleFailover(failedEndpointId) {
        this.logger.info('Initiating failover', {
            failedEndpoint: failedEndpointId,
            currentState: this.failoverState
        });
        
        // Remove failed connection
        this.activeConnections.delete(failedEndpointId);
        this.failedConnections.add(failedEndpointId);
        
        // Find best alternative endpoint
        const alternativeEndpoint = await this.selectBestEndpoint();
        
        if (!alternativeEndpoint) {
            this.failoverState = 'degraded';
            this.logger.error('No alternative endpoints available', {
                failedEndpoint: failedEndpointId
            });
            
            this.emit('failover-degraded', { failedEndpoint: failedEndpointId });
            return null;
        }
        
        try {
            // Attempt connection to alternative
            const connection = await this.connect(alternativeEndpoint, { timeout: this.config.failoverTimeout });
            
            this.currentEndpoint = alternativeEndpoint;
            this.failoverState = this.primaryEndpoints.includes(alternativeEndpoint) ? 'primary' : 'fallback';
            
            this.logger.info('Failover successful', {
                from: failedEndpointId,
                to: alternativeEndpoint,
                newState: this.failoverState
            });
            
            this.emit('failover-completed', {
                from: failedEndpointId,
                to: alternativeEndpoint,
                connection
            });
            
            return connection;
            
        } catch (error) {
            this.logger.error('Failover failed', {
                alternativeEndpoint,
                error: error.message
            });
            
            this.emit('failover-failed', {
                failedEndpoint: failedEndpointId,
                alternativeEndpoint,
                error: error.message
            });
            
            return null;
        }
    }
    
    /**
     * Select best available endpoint based on health and priority
     */
    async selectBestEndpoint() {
        const availableEndpoints = Array.from(this.connections.keys())
            .filter(id => !this.failedConnections.has(id))
            .filter(id => {
                const cb = this.circuitBreakers.get(id);
                return cb.state !== 'open';
            });
        
        if (availableEndpoints.length === 0) {
            return null;
        }
        
        // Score endpoints based on health, priority, and latency
        const scoredEndpoints = availableEndpoints.map(id => {
            const connection = this.connections.get(id);
            const isPrimary = this.primaryEndpoints.includes(id);
            
            const healthScore = connection.healthScore;
            const latencyScore = Math.max(0, 100 - (connection.metrics.latency / 10));
            const priorityScore = isPrimary ? this.config.primaryWeight : this.config.fallbackWeight;
            
            const totalScore = (healthScore * 0.4) + (latencyScore * 0.3) + (priorityScore * 0.3);
            
            return { id, score: totalScore, connection };
        });
        
        // Sort by score (highest first)
        scoredEndpoints.sort((a, b) => b.score - a.score);
        
        return scoredEndpoints[0].id;
    }
    
    /**
     * Simulate connection establishment (replace with actual implementation)
     */
    async establishConnection(connection, options = {}) {
        // Simulate connection delay
        await this.sleep(Math.random() * 1000 + 500);
        
        // Simulate random connection failures for testing
        if (Math.random() < 0.1) { // 10% failure rate
            throw new Error('Simulated connection failure');
        }
        
        return {
            id: connection.id,
            endpoint: connection.endpoint,
            socket: { mock: true }, // Mock socket object
            connected: true,
            timestamp: Date.now()
        };
    }
    
    /**
     * Start health monitoring for all connections
     */
    startHealthMonitoring() {
        setInterval(() => {
            this.performHealthChecks();
        }, this.config.healthCheckInterval);
        
        setInterval(() => {
            this.updateNetworkMetrics();
        }, this.config.healthCheckInterval * 2);
    }
    
    /**
     * Start monitoring specific connection
     */
    startConnectionMonitoring(endpointId) {
        const connection = this.connections.get(endpointId);
        if (!connection) return;
        
        const healthCheckId = setInterval(async () => {
            try {
                const pingStart = Date.now();
                
                // Simulate ping
                await this.sleep(Math.random() * 100 + 50);
                
                const latency = Date.now() - pingStart;
                connection.metrics.latency = latency;
                connection.metrics.lastPing = Date.now();
                
                // Update health score based on latency
                if (latency < this.config.latencyThreshold / 2) {
                    connection.healthScore = Math.min(100, connection.healthScore + 1);
                } else if (latency > this.config.latencyThreshold) {
                    connection.healthScore = Math.max(0, connection.healthScore - 5);
                }
                
            } catch (error) {
                connection.healthScore = Math.max(0, connection.healthScore - 10);
                connection.metrics.errorCount++;
                
                if (connection.healthScore < 20) {
                    this.logger.warn('Connection health degraded', {
                        endpointId,
                        healthScore: connection.healthScore
                    });
                    
                    // Trigger failover if health is critically low
                    if (connection.healthScore < 10) {
                        await this.handleFailover(endpointId);
                    }
                }
            }
        }, this.config.healthCheckInterval);
        
        this.healthChecks.set(endpointId, healthCheckId);
    }
    
    /**
     * Perform health checks on all active connections
     */
    async performHealthChecks() {
        const activeConnections = Array.from(this.activeConnections);
        
        for (const endpointId of activeConnections) {
            const connection = this.connections.get(endpointId);
            if (!connection || connection.status !== 'connected') continue;
            
            // Check if connection is stale
            const timeSinceLastPing = Date.now() - (connection.metrics.lastPing || 0);
            if (timeSinceLastPing > this.config.connectionTimeout) {
                this.logger.warn('Connection appears stale', {
                    endpointId,
                    timeSinceLastPing
                });
                
                await this.handleFailover(endpointId);
            }
        }
    }
    
    /**
     * Update network quality metrics
     */
    updateNetworkMetrics() {
        const now = Date.now();
        const connections = Array.from(this.activeConnections).map(id => this.connections.get(id));
        
        if (connections.length > 0) {
            const avgLatency = connections.reduce((sum, conn) => sum + conn.metrics.latency, 0) / connections.length;
            const avgErrorRate = connections.reduce((sum, conn) => sum + conn.metrics.errorCount, 0) / connections.length;
            
            this.networkMetrics.latency.push({ value: avgLatency, timestamp: now });
            this.networkMetrics.errorRate.push({ value: avgErrorRate, timestamp: now });
            
            // Keep only last 100 measurements
            if (this.networkMetrics.latency.length > 100) {
                this.networkMetrics.latency.shift();
                this.networkMetrics.errorRate.shift();
            }
        }
        
        this.networkMetrics.lastUpdate = now;
    }
    
    /**
     * Data integrity validation
     */
    validateMessage(message) {
        if (!this.config.enableDataValidation) return true;
        
        try {
            // Check message structure
            if (!message || typeof message !== 'object') {
                return false;
            }
            
            // Check required fields
            if (!message.timestamp || !message.type) {
                return false;
            }
            
            // Check for duplicates
            const messageId = message.id || `${message.type}-${message.timestamp}`;
            if (this.receivedMessages.has(messageId)) {
                this.logger.warn('Duplicate message detected', { messageId });
                return false;
            }
            
            // Add to received messages (with cleanup)
            this.receivedMessages.add(messageId);
            setTimeout(() => {
                this.receivedMessages.delete(messageId);
            }, this.config.duplicateDetectionWindow);
            
            // Validate checksum if present
            if (this.config.checksumValidation && message.checksum) {
                const calculatedChecksum = this.calculateChecksum(message.data);
                if (calculatedChecksum !== message.checksum) {
                    this.logger.warn('Checksum validation failed', { messageId });
                    return false;
                }
            }
            
            this.lastMessageTime = Date.now();
            return true;
            
        } catch (error) {
            this.logger.error('Message validation error', { error: error.message });
            return false;
        }
    }
    
    /**
     * Calculate message checksum
     */
    calculateChecksum(data) {
        const crypto = require('crypto');
        return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
    }
    
    /**
     * Get comprehensive status
     */
    getStatus() {
        const activeConnections = Array.from(this.activeConnections).map(id => {
            const conn = this.connections.get(id);
            const cb = this.circuitBreakers.get(id);
            return {
                id,
                endpoint: conn.endpoint,
                status: conn.status,
                healthScore: conn.healthScore,
                latency: conn.metrics.latency,
                circuitBreakerState: cb.state,
                isPrimary: this.primaryEndpoints.includes(id)
            };
        });
        
        const failedConnections = Array.from(this.failedConnections).map(id => {
            const conn = this.connections.get(id);
            const cb = this.circuitBreakers.get(id);
            return {
                id,
                endpoint: conn.endpoint,
                lastFailure: cb.lastFailure,
                circuitBreakerState: cb.state,
                nextAttempt: cb.nextAttempt
            };
        });
        
        return {
            sessionId: this.sessionId,
            failoverState: this.failoverState,
            currentEndpoint: this.currentEndpoint,
            activeConnections,
            failedConnections,
            totalConnections: this.connections.size,
            networkMetrics: {
                avgLatency: this.networkMetrics.latency.length > 0 ? 
                    this.networkMetrics.latency.reduce((sum, m) => sum + m.value, 0) / this.networkMetrics.latency.length : 0,
                lastUpdate: this.networkMetrics.lastUpdate
            },
            uptime: Date.now() - this.networkMetrics.lastUpdate
        };
    }
    
    /**
     * Cleanup resources
     */
    cleanup() {
        // Clear health check intervals
        this.healthChecks.forEach(intervalId => clearInterval(intervalId));
        this.healthChecks.clear();
        
        // Clear connections
        this.activeConnections.clear();
        this.failedConnections.clear();
        
        this.logger.info('ConnectionResilienceManager cleanup completed', {
            sessionId: this.sessionId
        });
    }
    
    /**
     * Utility sleep function
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ConnectionResilienceManager;