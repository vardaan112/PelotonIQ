/**
 * Resilient WebSocket Manager
 * Integrates Connection Resilience Manager with WebSocket connections for race data streaming
 */

const EventEmitter = require('events');
const WebSocket = require('ws');
const ConnectionResilienceManager = require('./ConnectionResilienceManager');
const { nanoid } = require('nanoid');

class ResilientWebSocketManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.sessionId = nanoid();
        this.config = {
            // WebSocket specific options
            pingInterval: options.pingInterval || 30000, // 30 seconds
            pongTimeout: options.pongTimeout || 5000, // 5 seconds
            reconnectDelay: options.reconnectDelay || 2000, // 2 seconds
            maxReconnectAttempts: options.maxReconnectAttempts || 10,
            
            // Data streaming options
            messageQueueSize: options.messageQueueSize || 1000,
            compressionEnabled: options.compressionEnabled !== false,
            heartbeatEnabled: options.heartbeatEnabled !== false,
            
            // Race data specific
            raceDataValidation: options.raceDataValidation !== false,
            positionUpdateThreshold: options.positionUpdateThreshold || 100, // meters
            timeGapThreshold: options.timeGapThreshold || 1000, // 1 second
            
            ...options
        };
        
        // Initialize connection resilience manager
        this.resilienceManager = new ConnectionResilienceManager({
            healthCheckInterval: 5000,
            connectionTimeout: 30000,
            maxRetryAttempts: this.config.maxReconnectAttempts,
            retryDelay: this.config.reconnectDelay,
            enableFailover: true,
            enableDataValidation: true,
            ...options.resilience
        });
        
        // WebSocket management
        this.activeSockets = new Map();
        this.messageQueue = [];
        this.connectionAttempts = new Map();
        
        // Race data state
        this.lastPositionUpdate = new Map();
        this.lastTimeGapUpdate = new Map();
        this.currentRaceState = {
            stage: null,
            riders: new Map(),
            weather: null,
            lastUpdate: null
        };
        
        // Performance metrics
        this.metrics = {
            messagesReceived: 0,
            messagesProcessed: 0,
            reconnections: 0,
            dataLoss: 0,
            avgLatency: 0,
            startTime: Date.now()
        };
        
        this.logger = console;
        
        this.logger.info('ResilientWebSocketManager initialized', {
            sessionId: this.sessionId,
            config: this.config
        });
        
        this.setupResilienceHandlers();
    }
    
    /**
     * Register race data endpoints with resilience
     */
    registerRaceDataEndpoints(endpoints) {
        endpoints.forEach((endpoint, index) => {
            const endpointId = endpoint.id || `race-endpoint-${index}`;
            const priority = endpoint.priority || (index === 0 ? 'primary' : 'fallback');
            
            this.resilienceManager.registerEndpoint(endpointId, endpoint, {
                type: 'websocket',
                priority,
                weight: endpoint.weight || (priority === 'primary' ? 100 : 50)
            });
            
            this.logger.info('Race data endpoint registered', {
                endpointId,
                url: endpoint.url,
                priority
            });
        });
    }
    
    /**
     * Connect to race data streams with resilience
     */
    async connectToRaceStreams() {
        this.logger.info('Connecting to race data streams', { sessionId: this.sessionId });
        
        try {
            // Get best available endpoint
            const bestEndpoint = await this.resilienceManager.selectBestEndpoint();
            if (!bestEndpoint) {
                throw new Error('No available race data endpoints');
            }
            
            const connection = await this.connectToEndpoint(bestEndpoint);
            
            this.logger.info('Connected to race data stream', {
                endpointId: bestEndpoint,
                sessionId: this.sessionId
            });
            
            this.emit('race-stream-connected', { endpointId: bestEndpoint, connection });
            
            return connection;
            
        } catch (error) {
            this.logger.error('Failed to connect to race streams', {
                error: error.message,
                sessionId: this.sessionId
            });
            
            this.emit('race-stream-error', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Connect to specific endpoint with WebSocket
     */
    async connectToEndpoint(endpointId) {
        const connection = this.resilienceManager.connections.get(endpointId);
        if (!connection) {
            throw new Error(`Unknown endpoint: ${endpointId}`);
        }
        
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(connection.endpoint.url, {
                perMessageDeflate: this.config.compressionEnabled,
                handshakeTimeout: this.config.connectionTimeout
            });
            
            // Connection timeout
            const timeoutId = setTimeout(() => {
                ws.terminate();
                reject(new Error('WebSocket connection timeout'));
            }, this.config.connectionTimeout);
            
            ws.on('open', () => {
                clearTimeout(timeoutId);
                
                const socketInfo = {
                    id: endpointId,
                    socket: ws,
                    endpoint: connection.endpoint,
                    connected: true,
                    connectedAt: Date.now(),
                    messageCount: 0,
                    lastPing: Date.now()
                };
                
                this.activeSockets.set(endpointId, socketInfo);
                
                // Setup WebSocket event handlers
                this.setupWebSocketHandlers(endpointId, ws);
                
                // Start heartbeat if enabled
                if (this.config.heartbeatEnabled) {
                    this.startHeartbeat(endpointId);
                }
                
                this.logger.info('WebSocket connected successfully', {
                    endpointId,
                    url: connection.endpoint.url
                });
                
                resolve(socketInfo);
            });
            
            ws.on('error', (error) => {
                clearTimeout(timeoutId);
                this.logger.error('WebSocket connection error', {
                    endpointId,
                    error: error.message
                });
                reject(error);
            });
        });
    }
    
    /**
     * Setup WebSocket event handlers
     */
    setupWebSocketHandlers(endpointId, ws) {
        const socketInfo = this.activeSockets.get(endpointId);
        
        ws.on('message', (data) => {
            this.handleWebSocketMessage(endpointId, data);
        });
        
        ws.on('close', (code, reason) => {
            this.logger.warn('WebSocket connection closed', {
                endpointId,
                code,
                reason: reason.toString()
            });
            
            this.activeSockets.delete(endpointId);
            this.handleConnectionLoss(endpointId);
        });
        
        ws.on('error', (error) => {
            this.logger.error('WebSocket error', {
                endpointId,
                error: error.message
            });
            
            this.metrics.dataLoss++;
            this.handleConnectionError(endpointId, error);
        });
        
        ws.on('pong', () => {
            if (socketInfo) {
                socketInfo.lastPing = Date.now();
                
                // Update connection health
                const connection = this.resilienceManager.connections.get(endpointId);
                if (connection) {
                    connection.healthScore = Math.min(100, connection.healthScore + 2);
                }
            }
        });
    }
    
    /**
     * Handle incoming WebSocket messages
     */
    handleWebSocketMessage(endpointId, data) {
        this.metrics.messagesReceived++;
        
        try {
            const message = JSON.parse(data.toString());
            
            // Validate message using resilience manager
            if (!this.resilienceManager.validateMessage(message)) {
                this.logger.warn('Invalid message received', {
                    endpointId,
                    messageType: message.type
                });
                return;
            }
            
            // Update socket metrics\n            const socketInfo = this.activeSockets.get(endpointId);\n            if (socketInfo) {\n                socketInfo.messageCount++;\n            }\n            \n            // Process race data message\n            this.processRaceDataMessage(message);\n            \n            this.metrics.messagesProcessed++;\n            \n        } catch (error) {\n            this.logger.error('Failed to process WebSocket message', {\n                endpointId,\n                error: error.message\n            });\n            \n            this.metrics.dataLoss++;\n        }\n    }\n    \n    /**\n     * Process race-specific data messages\n     */\n    processRaceDataMessage(message) {\n        const messageTime = Date.now();\n        \n        switch (message.type) {\n            case 'position-update':\n                this.handlePositionUpdate(message, messageTime);\n                break;\n                \n            case 'time-gap-update':\n                this.handleTimeGapUpdate(message, messageTime);\n                break;\n                \n            case 'weather-update':\n                this.handleWeatherUpdate(message, messageTime);\n                break;\n                \n            case 'tactical-event':\n                this.handleTacticalEvent(message, messageTime);\n                break;\n                \n            case 'stage-update':\n                this.handleStageUpdate(message, messageTime);\n                break;\n                \n            default:\n                this.logger.debug('Unknown message type', {\n                    type: message.type,\n                    messageId: message.id\n                });\n        }\n        \n        // Update race state timestamp\n        this.currentRaceState.lastUpdate = messageTime;\n        \n        // Emit processed message\n        this.emit('race-data-processed', {\n            type: message.type,\n            data: message.data,\n            timestamp: messageTime\n        });\n    }\n    \n    /**\n     * Handle rider position updates with filtering\n     */\n    handlePositionUpdate(message, timestamp) {\n        const riderId = message.data.riderId;\n        const position = message.data.position;\n        \n        // Check if position change is significant\n        const lastPosition = this.lastPositionUpdate.get(riderId);\n        if (lastPosition) {\n            const distance = this.calculateDistance(\n                lastPosition.latitude,\n                lastPosition.longitude,\n                position.latitude,\n                position.longitude\n            );\n            \n            if (distance < this.config.positionUpdateThreshold) {\n                // Position change too small, skip update\n                return;\n            }\n        }\n        \n        this.lastPositionUpdate.set(riderId, {\n            ...position,\n            timestamp\n        });\n        \n        // Update current race state\n        this.currentRaceState.riders.set(riderId, {\n            position,\n            lastUpdate: timestamp\n        });\n        \n        this.emit('rider-position-update', {\n            riderId,\n            position,\n            timestamp\n        });\n    }\n    \n    /**\n     * Handle time gap updates with threshold filtering\n     */\n    handleTimeGapUpdate(message, timestamp) {\n        const riderId = message.data.riderId;\n        const timeGap = message.data.timeGap;\n        \n        // Check if time gap change is significant\n        const lastTimeGap = this.lastTimeGapUpdate.get(riderId);\n        if (lastTimeGap) {\n            const timeDifference = Math.abs(timeGap - lastTimeGap.timeGap);\n            if (timeDifference < this.config.timeGapThreshold) {\n                return;\n            }\n        }\n        \n        this.lastTimeGapUpdate.set(riderId, {\n            timeGap,\n            timestamp\n        });\n        \n        this.emit('time-gap-update', {\n            riderId,\n            timeGap,\n            timestamp\n        });\n    }\n    \n    /**\n     * Handle weather condition updates\n     */\n    handleWeatherUpdate(message, timestamp) {\n        this.currentRaceState.weather = {\n            ...message.data,\n            timestamp\n        };\n        \n        this.emit('weather-update', {\n            weather: message.data,\n            timestamp\n        });\n    }\n    \n    /**\n     * Handle tactical events (attacks, crashes, etc.)\n     */\n    handleTacticalEvent(message, timestamp) {\n        this.emit('tactical-event', {\n            event: message.data,\n            timestamp\n        });\n        \n        this.logger.info('Tactical event detected', {\n            eventType: message.data.eventType,\n            riderId: message.data.riderId,\n            timestamp\n        });\n    }\n    \n    /**\n     * Handle stage information updates\n     */\n    handleStageUpdate(message, timestamp) {\n        this.currentRaceState.stage = {\n            ...message.data,\n            timestamp\n        };\n        \n        this.emit('stage-update', {\n            stage: message.data,\n            timestamp\n        });\n    }\n    \n    /**\n     * Handle connection loss with automatic recovery\n     */\n    async handleConnectionLoss(endpointId) {\n        this.logger.warn('Connection lost, initiating recovery', { endpointId });\n        this.metrics.reconnections++;\n        \n        try {\n            // Attempt failover through resilience manager\n            const newConnection = await this.resilienceManager.handleFailover(endpointId);\n            \n            if (newConnection) {\n                // Establish new WebSocket connection\n                await this.connectToEndpoint(this.resilienceManager.currentEndpoint);\n                \n                this.emit('connection-recovered', {\n                    from: endpointId,\n                    to: this.resilienceManager.currentEndpoint\n                });\n            } else {\n                this.emit('connection-degraded', { endpointId });\n            }\n            \n        } catch (error) {\n            this.logger.error('Connection recovery failed', {\n                endpointId,\n                error: error.message\n            });\n            \n            this.emit('connection-recovery-failed', {\n                endpointId,\n                error: error.message\n            });\n        }\n    }\n    \n    /**\n     * Handle connection errors\n     */\n    handleConnectionError(endpointId, error) {\n        this.logger.error('Connection error occurred', {\n            endpointId,\n            error: error.message\n        });\n        \n        this.emit('connection-error', {\n            endpointId,\n            error: error.message\n        });\n    }\n    \n    /**\n     * Start heartbeat for connection health monitoring\n     */\n    startHeartbeat(endpointId) {\n        const heartbeatInterval = setInterval(() => {\n            const socketInfo = this.activeSockets.get(endpointId);\n            if (!socketInfo || socketInfo.socket.readyState !== WebSocket.OPEN) {\n                clearInterval(heartbeatInterval);\n                return;\n            }\n            \n            try {\n                socketInfo.socket.ping();\n                \n                // Check for pong timeout\n                const timeSinceLastPong = Date.now() - socketInfo.lastPing;\n                if (timeSinceLastPong > this.config.pongTimeout) {\n                    this.logger.warn('Heartbeat timeout detected', {\n                        endpointId,\n                        timeSinceLastPong\n                    });\n                    \n                    socketInfo.socket.terminate();\n                }\n                \n            } catch (error) {\n                this.logger.error('Heartbeat failed', {\n                    endpointId,\n                    error: error.message\n                });\n                clearInterval(heartbeatInterval);\n            }\n        }, this.config.pingInterval);\n    }\n    \n    /**\n     * Calculate distance between two geographic points\n     */\n    calculateDistance(lat1, lon1, lat2, lon2) {\n        const R = 6371; // Earth's radius in kilometers\n        const dLat = (lat2 - lat1) * Math.PI / 180;\n        const dLon = (lon2 - lon1) * Math.PI / 180;\n        const a = \n            Math.sin(dLat/2) * Math.sin(dLat/2) +\n            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * \n            Math.sin(dLon/2) * Math.sin(dLon/2);\n        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));\n        return R * c * 1000; // Distance in meters\n    }\n    \n    /**\n     * Setup resilience manager event handlers\n     */\n    setupResilienceHandlers() {\n        this.resilienceManager.on('failover-completed', (event) => {\n            this.logger.info('Failover completed successfully', event);\n            this.emit('failover-completed', event);\n        });\n        \n        this.resilienceManager.on('failover-failed', (event) => {\n            this.logger.error('Failover failed', event);\n            this.emit('failover-failed', event);\n        });\n        \n        this.resilienceManager.on('connection-established', (event) => {\n            this.emit('resilience-connection-established', event);\n        });\n        \n        this.resilienceManager.on('connection-failed', (event) => {\n            this.emit('resilience-connection-failed', event);\n        });\n    }\n    \n    /**\n     * Get current race state\n     */\n    getCurrentRaceState() {\n        return {\n            ...this.currentRaceState,\n            riderCount: this.currentRaceState.riders.size,\n            lastUpdate: this.currentRaceState.lastUpdate\n        };\n    }\n    \n    /**\n     * Get comprehensive status and metrics\n     */\n    getStatus() {\n        const uptime = Date.now() - this.metrics.startTime;\n        \n        return {\n            sessionId: this.sessionId,\n            uptime,\n            activeConnections: Array.from(this.activeSockets.keys()),\n            connectionCount: this.activeSockets.size,\n            metrics: {\n                ...this.metrics,\n                uptime,\n                messagesPerSecond: this.metrics.messagesReceived / (uptime / 1000),\n                successRate: this.metrics.messagesProcessed / this.metrics.messagesReceived\n            },\n            resilienceStatus: this.resilienceManager.getStatus(),\n            raceState: this.getCurrentRaceState()\n        };\n    }\n    \n    /**\n     * Cleanup resources\n     */\n    cleanup() {\n        // Close all WebSocket connections\n        this.activeSockets.forEach((socketInfo, endpointId) => {\n            if (socketInfo.socket.readyState === WebSocket.OPEN) {\n                socketInfo.socket.close();\n            }\n        });\n        \n        this.activeSockets.clear();\n        \n        // Cleanup resilience manager\n        this.resilienceManager.cleanup();\n        \n        this.logger.info('ResilientWebSocketManager cleanup completed', {\n            sessionId: this.sessionId\n        });\n    }\n}\n\nmodule.exports = ResilientWebSocketManager;