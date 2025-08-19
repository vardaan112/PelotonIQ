/**
 * WebSocket Connection Manager for PelotonIQ Real-time Data Streaming
 * Handles live race data streaming with robust error handling and reconnection logic
 */

const EventEmitter = require('events');
const WebSocket = require('ws');
const Redis = require('redis');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const winston = require('winston');
const { promisify } = require('util');

// Configure logging
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/websocket-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/websocket-combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

/**
 * WebSocket Connection Manager
 * Manages real-time connections for live race data streaming
 */
class WebSocketManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            port: options.port || 8080,
            heartbeatInterval: options.heartbeatInterval || 30000, // 30 seconds
            connectionTimeout: options.connectionTimeout || 60000, // 1 minute
            maxConnections: options.maxConnections || 10000,
            reconnectAttempts: options.reconnectAttempts || 5,
            reconnectDelay: options.reconnectDelay || 1000, // Start at 1 second
            maxReconnectDelay: options.maxReconnectDelay || 30000, // Max 30 seconds
            rateLimitWindow: options.rateLimitWindow || 60000, // 1 minute
            rateLimitMax: options.rateLimitMax || 100, // 100 messages per minute
            jwtSecret: options.jwtSecret || process.env.JWT_SECRET || 'pelotoniq-secret',
            redisUrl: options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379'
        };

        // Connection management
        this.connections = new Map(); // connectionId -> connection object
        this.userConnections = new Map(); // userId -> Set of connectionIds
        this.subscriptions = new Map(); // connectionId -> Set of subscription topics
        this.messageQueues = new Map(); // connectionId -> message queue
        this.rateLimiters = new Map(); // connectionId -> rate limit data

        // Server state
        this.server = null;
        this.redis = null;
        this.isShuttingDown = false;
        this.heartbeatInterval = null;
        
        // Statistics
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            messagesReceived: 0,
            messagesSent: 0,
            reconnections: 0,
            errors: 0,
            rateLimitViolations: 0
        };

        this.initializeRedis();
        this.setupHeartbeat();
        this.setupGracefulShutdown();
    }

    /**
     * Initialize Redis connection for state management
     */
    async initializeRedis() {
        try {
            this.redis = Redis.createClient({ url: this.options.redisUrl });
            
            this.redis.on('error', (err) => {
                logger.error('Redis connection error:', err);
                this.emit('redis-error', err);
            });

            this.redis.on('connect', () => {
                logger.info('Connected to Redis');
                this.emit('redis-connected');
            });

            await this.redis.connect();
        } catch (error) {
            logger.error('Failed to initialize Redis:', error);
            throw error;
        }
    }

    /**
     * Start WebSocket server
     */
    async start() {
        try {
            this.server = new WebSocket.Server({
                port: this.options.port,
                verifyClient: this.verifyClient.bind(this),
                maxPayload: 16 * 1024 * 1024, // 16MB max payload
                perMessageDeflate: {
                    zlibDeflateOptions: {
                        level: 7,
                        threshold: 1024
                    }
                }
            });

            this.server.on('connection', this.handleConnection.bind(this));
            this.server.on('error', this.handleServerError.bind(this));

            logger.info(`WebSocket server started on port ${this.options.port}`);
            this.emit('server-started', { port: this.options.port });

            // Start background tasks
            this.startHeartbeat();
            this.startStatsReporting();

        } catch (error) {
            logger.error('Failed to start WebSocket server:', error);
            throw error;
        }
    }

    /**
     * Verify client connection with authentication
     */
    verifyClient(info) {
        try {
            const url = new URL(info.req.url, `http://${info.req.headers.host}`);
            const token = url.searchParams.get('token');

            if (!token) {
                logger.warn('Connection rejected: No authentication token provided');
                return false;
            }

            // Verify JWT token
            const decoded = jwt.verify(token, this.options.jwtSecret);
            
            // Check if user has permission for real-time access
            if (!decoded.permissions || !decoded.permissions.includes('realtime-access')) {
                logger.warn('Connection rejected: Insufficient permissions', { userId: decoded.userId });
                return false;
            }

            // Check connection limit
            if (this.connections.size >= this.options.maxConnections) {
                logger.warn('Connection rejected: Maximum connections reached');
                return false;
            }

            // Store user info for later use
            info.req.user = decoded;
            return true;

        } catch (error) {
            logger.warn('Connection rejected: Invalid token', { error: error.message });
            return false;
        }
    }

    /**
     * Handle new WebSocket connection
     */
    handleConnection(ws, req) {
        const connectionId = uuid.v4();
        const user = req.user;
        const clientIp = req.socket.remoteAddress;

        const connection = {
            id: connectionId,
            ws: ws,
            user: user,
            clientIp: clientIp,
            connectedAt: new Date(),
            lastHeartbeat: new Date(),
            isAlive: true,
            subscriptions: new Set(),
            messageQueue: [],
            rateLimitData: {
                messageCount: 0,
                windowStart: Date.now()
            }
        };

        // Store connection
        this.connections.set(connectionId, connection);
        
        // Track user connections
        if (!this.userConnections.has(user.userId)) {
            this.userConnections.set(user.userId, new Set());
        }
        this.userConnections.get(user.userId).add(connectionId);

        // Update statistics
        this.stats.totalConnections++;
        this.stats.activeConnections++;

        logger.info('New WebSocket connection established', {
            connectionId,
            userId: user.userId,
            clientIp,
            activeConnections: this.stats.activeConnections
        });

        // Set up connection event handlers
        this.setupConnectionHandlers(connection);

        // Send welcome message
        this.sendMessage(connectionId, {
            type: 'welcome',
            connectionId: connectionId,
            serverTime: new Date().toISOString(),
            capabilities: ['live-positions', 'weather-updates', 'tactical-events', 'race-data']
        });

        this.emit('connection-established', connection);
    }

    /**
     * Set up event handlers for a connection
     */
    setupConnectionHandlers(connection) {
        const { ws, id: connectionId } = connection;

        // Handle incoming messages
        ws.on('message', (data) => {
            this.handleMessage(connectionId, data);
        });

        // Handle connection close
        ws.on('close', (code, reason) => {
            this.handleConnectionClose(connectionId, code, reason);
        });

        // Handle connection errors
        ws.on('error', (error) => {
            this.handleConnectionError(connectionId, error);
        });

        // Handle pong responses (heartbeat)
        ws.on('pong', () => {
            this.handlePong(connectionId);
        });
    }

    /**
     * Handle incoming messages from clients
     */
    async handleMessage(connectionId, data) {
        try {
            const connection = this.connections.get(connectionId);
            if (!connection) {
                logger.warn('Received message for unknown connection', { connectionId });
                return;
            }

            // Rate limiting check
            if (!this.checkRateLimit(connectionId)) {
                this.stats.rateLimitViolations++;
                logger.warn('Rate limit exceeded', { 
                    connectionId, 
                    userId: connection.user.userId 
                });
                
                this.sendMessage(connectionId, {
                    type: 'error',
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: 'Too many messages. Please slow down.'
                });
                return;
            }

            let message;
            try {
                message = JSON.parse(data.toString());
            } catch (parseError) {
                logger.warn('Invalid JSON received', { connectionId, error: parseError.message });
                this.sendMessage(connectionId, {
                    type: 'error',
                    code: 'INVALID_JSON',
                    message: 'Invalid JSON format'
                });
                return;
            }

            this.stats.messagesReceived++;

            // Process message based on type
            await this.processMessage(connectionId, message);

        } catch (error) {
            logger.error('Error handling message', { connectionId, error: error.message, stack: error.stack });
            this.stats.errors++;
        }
    }

    /**
     * Process different types of messages
     */
    async processMessage(connectionId, message) {
        const connection = this.connections.get(connectionId);
        
        switch (message.type) {
            case 'ping':
                this.sendMessage(connectionId, { type: 'pong', timestamp: new Date().toISOString() });
                break;

            case 'subscribe':
                await this.handleSubscribe(connectionId, message);
                break;

            case 'unsubscribe':
                await this.handleUnsubscribe(connectionId, message);
                break;

            case 'get-subscriptions':
                this.sendMessage(connectionId, {
                    type: 'subscriptions',
                    subscriptions: Array.from(connection.subscriptions)
                });
                break;

            case 'get-stats':
                if (connection.user.permissions.includes('admin')) {
                    this.sendMessage(connectionId, {
                        type: 'stats',
                        stats: this.getPublicStats()
                    });
                }
                break;

            default:
                logger.warn('Unknown message type', { connectionId, type: message.type });
                this.sendMessage(connectionId, {
                    type: 'error',
                    code: 'UNKNOWN_MESSAGE_TYPE',
                    message: `Unknown message type: ${message.type}`
                });
        }
    }

    /**
     * Handle subscription requests
     */
    async handleSubscribe(connectionId, message) {
        const connection = this.connections.get(connectionId);
        const { topics } = message;

        if (!Array.isArray(topics)) {
            this.sendMessage(connectionId, {
                type: 'error',
                code: 'INVALID_TOPICS',
                message: 'Topics must be an array'
            });
            return;
        }

        const validTopics = [];
        const invalidTopics = [];

        for (const topic of topics) {
            if (this.isValidTopic(topic) && this.hasTopicPermission(connection.user, topic)) {
                connection.subscriptions.add(topic);
                validTopics.push(topic);
                
                // Store subscription in Redis for persistence
                await this.redis.sAdd(`subscriptions:${connectionId}`, topic);
            } else {
                invalidTopics.push(topic);
            }
        }

        this.sendMessage(connectionId, {
            type: 'subscription-result',
            validTopics,
            invalidTopics,
            totalSubscriptions: connection.subscriptions.size
        });

        logger.info('Subscription updated', {
            connectionId,
            userId: connection.user.userId,
            validTopics,
            invalidTopics
        });
    }

    /**
     * Handle unsubscription requests
     */
    async handleUnsubscribe(connectionId, message) {
        const connection = this.connections.get(connectionId);
        const { topics } = message;

        if (!Array.isArray(topics)) {
            this.sendMessage(connectionId, {
                type: 'error',
                code: 'INVALID_TOPICS',
                message: 'Topics must be an array'
            });
            return;
        }

        for (const topic of topics) {
            connection.subscriptions.delete(topic);
            await this.redis.sRem(`subscriptions:${connectionId}`, topic);
        }

        this.sendMessage(connectionId, {
            type: 'unsubscription-result',
            topics,
            totalSubscriptions: connection.subscriptions.size
        });

        logger.info('Unsubscription completed', {
            connectionId,
            userId: connection.user.userId,
            topics
        });
    }

    /**
     * Validate topic names
     */
    isValidTopic(topic) {
        const validTopics = [
            'race.positions',
            'race.gaps',
            'race.weather',
            'race.tactical-events',
            'race.splits',
            'race.status',
            'team.tactics',
            'rider.performance',
            'notifications.alerts',
            'system.status'
        ];

        return validTopics.includes(topic) || topic.match(/^race\.[\w-]+$/);
    }

    /**
     * Check if user has permission for topic
     */
    hasTopicPermission(user, topic) {
        const permissions = user.permissions || [];

        // Admin users have access to all topics
        if (permissions.includes('admin')) {
            return true;
        }

        // Map topics to required permissions
        const topicPermissions = {
            'race.positions': 'race-data',
            'race.gaps': 'race-data',
            'race.weather': 'race-data',
            'race.tactical-events': 'tactical-data',
            'race.splits': 'race-data',
            'race.status': 'race-data',
            'team.tactics': 'team-data',
            'rider.performance': 'performance-data',
            'notifications.alerts': 'notifications',
            'system.status': 'system-monitoring'
        };

        const requiredPermission = topicPermissions[topic];
        return requiredPermission && permissions.includes(requiredPermission);
    }

    /**
     * Check rate limiting for connection
     */
    checkRateLimit(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection) return false;

        const now = Date.now();
        const { rateLimitData } = connection;

        // Reset window if expired
        if (now - rateLimitData.windowStart >= this.options.rateLimitWindow) {
            rateLimitData.messageCount = 0;
            rateLimitData.windowStart = now;
        }

        rateLimitData.messageCount++;
        return rateLimitData.messageCount <= this.options.rateLimitMax;
    }

    /**
     * Send message to specific connection
     */
    sendMessage(connectionId, message) {
        const connection = this.connections.get(connectionId);
        if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
            return false;
        }

        try {
            const data = JSON.stringify({
                ...message,
                timestamp: new Date().toISOString(),
                connectionId: connectionId
            });

            connection.ws.send(data);
            this.stats.messagesSent++;
            return true;

        } catch (error) {
            logger.error('Error sending message', { connectionId, error: error.message });
            this.handleConnectionError(connectionId, error);
            return false;
        }
    }

    /**
     * Broadcast message to multiple connections
     */
    broadcast(message, options = {}) {
        const {
            topic = null,
            userIds = null,
            excludeConnectionIds = new Set(),
            requirePermission = null
        } = options;

        let recipients = 0;
        const failedDeliveries = [];

        for (const [connectionId, connection] of this.connections) {
            // Skip excluded connections
            if (excludeConnectionIds.has(connectionId)) {
                continue;
            }

            // Filter by topic subscription
            if (topic && !connection.subscriptions.has(topic)) {
                continue;
            }

            // Filter by user IDs
            if (userIds && !userIds.includes(connection.user.userId)) {
                continue;
            }

            // Filter by permission
            if (requirePermission && !connection.user.permissions.includes(requirePermission)) {
                continue;
            }

            // Send message
            if (this.sendMessage(connectionId, message)) {
                recipients++;
            } else {
                failedDeliveries.push(connectionId);
            }
        }

        logger.debug('Broadcast completed', {
            topic,
            recipients,
            failedDeliveries: failedDeliveries.length
        });

        return { recipients, failedDeliveries };
    }

    /**
     * Handle connection close
     */
    async handleConnectionClose(connectionId, code, reason) {
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        logger.info('WebSocket connection closed', {
            connectionId,
            userId: connection.user.userId,
            code,
            reason: reason?.toString(),
            duration: Date.now() - connection.connectedAt.getTime()
        });

        // Clean up connection
        await this.cleanupConnection(connectionId);

        this.emit('connection-closed', { connectionId, code, reason });
    }

    /**
     * Handle connection errors
     */
    handleConnectionError(connectionId, error) {
        const connection = this.connections.get(connectionId);
        
        logger.error('WebSocket connection error', {
            connectionId,
            userId: connection?.user?.userId,
            error: error.message,
            stack: error.stack
        });

        this.stats.errors++;

        // Close connection on error
        if (connection) {
            this.closeConnection(connectionId, 1011, 'Internal error');
        }

        this.emit('connection-error', { connectionId, error });
    }

    /**
     * Handle server errors
     */
    handleServerError(error) {
        logger.error('WebSocket server error', { error: error.message, stack: error.stack });
        this.emit('server-error', error);
    }

    /**
     * Handle pong response (heartbeat)
     */
    handlePong(connectionId) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            connection.isAlive = true;
            connection.lastHeartbeat = new Date();
        }
    }

    /**
     * Setup heartbeat mechanism
     */
    setupHeartbeat() {
        // Will be started when server starts
    }

    /**
     * Start heartbeat monitoring
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.performHeartbeat();
        }, this.options.heartbeatInterval);

        logger.info('Heartbeat monitoring started', { 
            interval: this.options.heartbeatInterval 
        });
    }

    /**
     * Perform heartbeat check on all connections
     */
    performHeartbeat() {
        const now = Date.now();
        const timeoutThreshold = now - this.options.connectionTimeout;
        const deadConnections = [];

        for (const [connectionId, connection] of this.connections) {
            if (connection.ws.readyState === WebSocket.OPEN) {
                // Check if connection is responsive
                if (connection.lastHeartbeat.getTime() < timeoutThreshold) {
                    deadConnections.push(connectionId);
                } else {
                    // Send ping
                    connection.isAlive = false;
                    try {
                        connection.ws.ping();
                    } catch (error) {
                        logger.warn('Failed to ping connection', { connectionId, error: error.message });
                        deadConnections.push(connectionId);
                    }
                }
            } else {
                deadConnections.push(connectionId);
            }
        }

        // Clean up dead connections
        for (const connectionId of deadConnections) {
            logger.info('Removing dead connection', { connectionId });
            this.closeConnection(connectionId, 1000, 'Connection timeout');
        }

        logger.debug('Heartbeat completed', {
            totalConnections: this.connections.size,
            deadConnections: deadConnections.length
        });
    }

    /**
     * Close specific connection
     */
    async closeConnection(connectionId, code = 1000, reason = 'Normal closure') {
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        try {
            if (connection.ws.readyState === WebSocket.OPEN) {
                connection.ws.close(code, reason);
            }
        } catch (error) {
            logger.warn('Error closing connection', { connectionId, error: error.message });
        }

        await this.cleanupConnection(connectionId);
    }

    /**
     * Clean up connection resources
     */
    async cleanupConnection(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        // Remove from connections map
        this.connections.delete(connectionId);

        // Remove from user connections
        const userConnections = this.userConnections.get(connection.user.userId);
        if (userConnections) {
            userConnections.delete(connectionId);
            if (userConnections.size === 0) {
                this.userConnections.delete(connection.user.userId);
            }
        }

        // Clean up Redis data
        try {
            await this.redis.del(`subscriptions:${connectionId}`);
        } catch (error) {
            logger.warn('Failed to clean up Redis data', { connectionId, error: error.message });
        }

        // Update statistics
        this.stats.activeConnections = Math.max(0, this.stats.activeConnections - 1);

        logger.debug('Connection cleanup completed', { connectionId });
    }

    /**
     * Start statistics reporting
     */
    startStatsReporting() {
        setInterval(() => {
            this.reportStats();
        }, 60000); // Report every minute
    }

    /**
     * Report current statistics
     */
    reportStats() {
        const stats = {
            ...this.stats,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            timestamp: new Date().toISOString()
        };

        logger.info('WebSocket server statistics', stats);
        this.emit('stats-report', stats);

        // Store stats in Redis for monitoring
        this.redis.hSet('websocket:stats', {
            activeConnections: this.stats.activeConnections,
            totalConnections: this.stats.totalConnections,
            messagesSent: this.stats.messagesSent,
            messagesReceived: this.stats.messagesReceived,
            errors: this.stats.errors,
            lastUpdate: Date.now()
        }).catch(err => {
            logger.warn('Failed to store stats in Redis', { error: err.message });
        });
    }

    /**
     * Get public statistics (safe to expose)
     */
    getPublicStats() {
        return {
            activeConnections: this.stats.activeConnections,
            totalConnections: this.stats.totalConnections,
            uptime: process.uptime(),
            serverTime: new Date().toISOString()
        };
    }

    /**
     * Setup graceful shutdown
     */
    setupGracefulShutdown() {
        const gracefulShutdown = async (signal) => {
            logger.info(`Received ${signal}, starting graceful shutdown...`);
            this.isShuttingDown = true;

            try {
                await this.shutdown();
                logger.info('Graceful shutdown completed');
                process.exit(0);
            } catch (error) {
                logger.error('Error during shutdown', { error: error.message });
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    }

    /**
     * Shutdown server gracefully
     */
    async shutdown() {
        logger.info('Starting WebSocket server shutdown...');

        // Stop accepting new connections
        if (this.server) {
            this.server.close();
        }

        // Stop heartbeat
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        // Close all connections
        const shutdownPromises = [];
        for (const [connectionId, connection] of this.connections) {
            this.sendMessage(connectionId, {
                type: 'server-shutdown',
                message: 'Server is shutting down',
                reconnectAfter: 5000
            });

            shutdownPromises.push(
                new Promise(resolve => {
                    setTimeout(() => {
                        this.closeConnection(connectionId, 1001, 'Server shutdown');
                        resolve();
                    }, 1000);
                })
            );
        }

        await Promise.all(shutdownPromises);

        // Close Redis connection
        if (this.redis) {
            await this.redis.quit();
        }

        logger.info('WebSocket server shutdown completed');
    }

    /**
     * Get connection by ID
     */
    getConnection(connectionId) {
        return this.connections.get(connectionId);
    }

    /**
     * Get connections for user
     */
    getUserConnections(userId) {
        const connectionIds = this.userConnections.get(userId);
        if (!connectionIds) return [];

        return Array.from(connectionIds)
            .map(id => this.connections.get(id))
            .filter(Boolean);
    }

    /**
     * Get all active connections
     */
    getAllConnections() {
        return Array.from(this.connections.values());
    }

    /**
     * Send message to user (all their connections)
     */
    sendToUser(userId, message) {
        const connections = this.getUserConnections(userId);
        let sent = 0;

        for (const connection of connections) {
            if (this.sendMessage(connection.id, message)) {
                sent++;
            }
        }

        return sent;
    }

    /**
     * Reconnection helper for clients
     */
    static createReconnectingClient(url, options = {}) {
        const client = {
            ws: null,
            url: url,
            options: {
                reconnectAttempts: options.reconnectAttempts || 5,
                reconnectDelay: options.reconnectDelay || 1000,
                maxReconnectDelay: options.maxReconnectDelay || 30000,
                ...options
            },
            reconnectCount: 0,
            isConnecting: false,
            eventHandlers: new Map()
        };

        client.connect = function() {
            if (this.isConnecting) return;
            this.isConnecting = true;

            try {
                this.ws = new WebSocket(this.url);

                this.ws.onopen = () => {
                    this.isConnecting = false;
                    this.reconnectCount = 0;
                    logger.info('WebSocket client connected');
                    this.emit('open');
                };

                this.ws.onmessage = (event) => {
                    this.emit('message', event.data);
                };

                this.ws.onclose = (event) => {
                    this.isConnecting = false;
                    logger.info('WebSocket client disconnected', { code: event.code, reason: event.reason });
                    this.emit('close', event);
                    this.handleReconnect();
                };

                this.ws.onerror = (error) => {
                    this.isConnecting = false;
                    logger.error('WebSocket client error', { error });
                    this.emit('error', error);
                };

            } catch (error) {
                this.isConnecting = false;
                logger.error('Failed to create WebSocket connection', { error: error.message });
                this.handleReconnect();
            }
        };

        client.handleReconnect = function() {
            if (this.reconnectCount >= this.options.reconnectAttempts) {
                logger.error('Max reconnection attempts reached');
                this.emit('max-reconnects-reached');
                return;
            }

            const delay = Math.min(
                this.options.reconnectDelay * Math.pow(2, this.reconnectCount),
                this.options.maxReconnectDelay
            );

            this.reconnectCount++;
            logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectCount})`);

            setTimeout(() => {
                this.connect();
            }, delay);
        };

        client.send = function(data) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
                return true;
            }
            return false;
        };

        client.close = function() {
            if (this.ws) {
                this.ws.close();
            }
        };

        client.on = function(event, handler) {
            if (!this.eventHandlers.has(event)) {
                this.eventHandlers.set(event, []);
            }
            this.eventHandlers.get(event).push(handler);
        };

        client.emit = function(event, ...args) {
            const handlers = this.eventHandlers.get(event) || [];
            handlers.forEach(handler => {
                try {
                    handler(...args);
                } catch (error) {
                    logger.error('Error in event handler', { event, error: error.message });
                }
            });
        };

        return client;
    }
}

module.exports = WebSocketManager;