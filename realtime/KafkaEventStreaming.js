/**
 * Apache Kafka Event Streaming Architecture for PelotonIQ
 * Handles real-time event streaming, processing, and distribution across the system
 */

const EventEmitter = require('events');
const { Kafka, logLevel } = require('kafkajs');
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
        new winston.transports.File({ filename: 'logs/kafka-streaming.log' }),
        new winston.transports.Console()
    ]
});

/**
 * Event schema for race events
 */
class RaceEvent {
    constructor(data) {
        this.eventId = data.eventId || this.generateEventId();
        this.eventType = data.eventType; // position_update, tactical_event, weather_update, race_state_change
        this.timestamp = new Date(data.timestamp);
        this.source = data.source; // position_tracker, weather_service, tactical_detector
        this.raceId = data.raceId;
        this.payload = data.payload;
        this.metadata = {
            version: data.version || '1.0',
            priority: data.priority || 'normal', // low, normal, high, critical
            correlation_id: data.correlation_id || null,
            causation_id: data.causation_id || null,
            ...data.metadata
        };
        this.schema_version = '1.0';
    }

    generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Validate event data
     */
    validate() {
        const errors = [];

        if (!this.eventType) errors.push('eventType is required');
        if (!this.source) errors.push('source is required');
        if (!this.raceId) errors.push('raceId is required');
        if (!this.payload) errors.push('payload is required');

        // Validate timestamp
        if (!(this.timestamp instanceof Date) || isNaN(this.timestamp)) {
            errors.push('timestamp must be a valid Date');
        }

        // Validate event type
        const validEventTypes = [
            'position_update',
            'tactical_event',
            'weather_update',
            'race_state_change',
            'rider_status_change',
            'group_formation',
            'alert',
            'system_event'
        ];

        if (!validEventTypes.includes(this.eventType)) {
            errors.push(`eventType must be one of: ${validEventTypes.join(', ')}`);
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Convert to Kafka message format
     */
    toKafkaMessage() {
        return {
            key: `${this.raceId}_${this.eventType}`,
            value: JSON.stringify({
                eventId: this.eventId,
                eventType: this.eventType,
                timestamp: this.timestamp.toISOString(),
                source: this.source,
                raceId: this.raceId,
                payload: this.payload,
                metadata: this.metadata,
                schema_version: this.schema_version
            }),
            headers: {
                'event-type': this.eventType,
                'source': this.source,
                'race-id': this.raceId,
                'priority': this.metadata.priority,
                'timestamp': this.timestamp.getTime().toString()
            }
        };
    }

    /**
     * Create from Kafka message
     */
    static fromKafkaMessage(message) {
        const data = JSON.parse(message.value.toString());
        return new RaceEvent(data);
    }

    toJSON() {
        return {
            eventId: this.eventId,
            eventType: this.eventType,
            timestamp: this.timestamp.toISOString(),
            source: this.source,
            raceId: this.raceId,
            payload: this.payload,
            metadata: this.metadata,
            schema_version: this.schema_version
        };
    }
}

/**
 * Event stream processor for handling incoming events
 */
class EventProcessor {
    constructor(processorId, options = {}) {
        this.processorId = processorId;
        this.options = {
            batchSize: options.batchSize || 100,
            batchTimeout: options.batchTimeout || 5000,
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000,
            deadLetterQueue: options.deadLetterQueue || true,
            ...options
        };

        this.eventHandlers = new Map(); // eventType -> handler function
        this.middleware = []; // Array of middleware functions
        this.batch = [];
        this.batchTimer = null;
        this.isProcessing = false;

        this.stats = {
            eventsProcessed: 0,
            batchesProcessed: 0,
            errors: 0,
            averageProcessingTime: 0,
            lastProcessedAt: null
        };
    }

    /**
     * Register event handler
     */
    registerHandler(eventType, handlerFunction) {
        this.eventHandlers.set(eventType, handlerFunction);
        logger.debug('Event handler registered', { processorId: this.processorId, eventType });
    }

    /**
     * Add middleware
     */
    addMiddleware(middlewareFunction) {
        this.middleware.push(middlewareFunction);
        logger.debug('Middleware added', { processorId: this.processorId });
    }

    /**
     * Process single event
     */
    async processEvent(event) {
        const startTime = performance.now();

        try {
            // Apply middleware
            let processedEvent = event;
            for (const middleware of this.middleware) {
                processedEvent = await middleware(processedEvent, this);
                if (!processedEvent) {
                    logger.debug('Event filtered by middleware', { 
                        processorId: this.processorId,
                        eventId: event.eventId 
                    });
                    return;
                }
            }

            // Find and execute handler
            const handler = this.eventHandlers.get(processedEvent.eventType);
            if (handler) {
                await handler(processedEvent, this);
                this.stats.eventsProcessed++;
            } else {
                logger.warn('No handler found for event type', {
                    processorId: this.processorId,
                    eventType: processedEvent.eventType,
                    eventId: processedEvent.eventId
                });
            }

            // Update stats
            const processingTime = performance.now() - startTime;
            this.updateProcessingStats(processingTime);
            this.stats.lastProcessedAt = new Date();

        } catch (error) {
            this.stats.errors++;
            logger.error('Error processing event', {
                processorId: this.processorId,
                eventId: event.eventId,
                error: error.message,
                stack: error.stack
            });

            throw error; // Re-throw to handle at batch level
        }
    }

    /**
     * Process batch of events
     */
    async processBatch(events) {
        if (this.isProcessing) {
            logger.warn('Processor already busy, queuing batch', { 
                processorId: this.processorId,
                batchSize: events.length 
            });
            return;
        }

        this.isProcessing = true;
        const batchStartTime = performance.now();

        try {
            const promises = events.map(event => this.processEvent(event));
            await Promise.allSettled(promises);

            this.stats.batchesProcessed++;
            
            logger.debug('Batch processed', {
                processorId: this.processorId,
                batchSize: events.length,
                processingTime: performance.now() - batchStartTime
            });

        } catch (error) {
            logger.error('Error processing batch', {
                processorId: this.processorId,
                batchSize: events.length,
                error: error.message
            });
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Add event to batch
     */
    addToBatch(event) {
        this.batch.push(event);

        // Process batch if full
        if (this.batch.length >= this.options.batchSize) {
            this.flushBatch();
        } else if (!this.batchTimer) {
            // Set timer for batch timeout
            this.batchTimer = setTimeout(() => {
                this.flushBatch();
            }, this.options.batchTimeout);
        }
    }

    /**
     * Flush current batch
     */
    async flushBatch() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        if (this.batch.length === 0) return;

        const batchToProcess = this.batch.splice(0);
        await this.processBatch(batchToProcess);
    }

    /**
     * Update processing statistics
     */
    updateProcessingStats(processingTime) {
        const alpha = 0.1; // Smoothing factor
        this.stats.averageProcessingTime = 
            this.stats.averageProcessingTime * (1 - alpha) + processingTime * alpha;
    }

    /**
     * Get processor statistics
     */
    getStats() {
        return {
            processorId: this.processorId,
            ...this.stats,
            queuedEvents: this.batch.length,
            isProcessing: this.isProcessing
        };
    }
}

/**
 * Main Kafka Event Streaming Service
 */
class KafkaEventStreaming extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            clientId: options.clientId || 'pelotoniq-streaming',
            brokers: options.brokers || ['localhost:9092'],
            groupId: options.groupId || 'pelotoniq-consumers',
            topics: {
                raceEvents: options.raceEventsTopic || 'race-events',
                positionUpdates: options.positionUpdatesTopic || 'position-updates',
                tacticalEvents: options.tacticalEventsTopic || 'tactical-events',
                weatherUpdates: options.weatherUpdatesTopic || 'weather-updates',
                aiModelUpdates: options.aiModelUpdatesTopic || 'ai-model-updates',
                notifications: options.notificationsTopic || 'notifications',
                deadLetter: options.deadLetterTopic || 'dead-letter-queue'
            },
            partitions: options.partitions || 3,
            replicationFactor: options.replicationFactor || 1,
            retentionMs: options.retentionMs || 86400000, // 24 hours
            compressionType: options.compressionType || 'gzip',
            batchSize: options.batchSize || 16384,
            lingerMs: options.lingerMs || 5,
            acks: options.acks || 'all',
            enableIdempotence: options.enableIdempotence !== false,
            ...options
        };

        // Kafka instances
        this.kafka = null;
        this.producer = null;
        this.consumers = new Map(); // consumerId -> consumer instance
        this.admin = null;

        // Event processors
        this.processors = new Map(); // processorId -> EventProcessor

        // Internal state
        this.isConnected = false;
        this.producerReady = false;
        this.topics = new Set();

        // Performance tracking
        this.stats = {
            messagesProduced: 0,
            messagesConsumed: 0,
            bytesProduced: 0,
            bytesConsumed: 0,
            errors: 0,
            connectionCount: 0,
            averageLatency: 0,
            lastActivity: null
        };

        this.initializeKafka();
    }

    /**
     * Initialize Kafka client
     */
    initializeKafka() {
        this.kafka = new Kafka({
            clientId: this.options.clientId,
            brokers: this.options.brokers,
            logLevel: logLevel.INFO,
            retry: {
                initialRetryTime: 100,
                retries: 8
            },
            connectionTimeout: 3000,
            requestTimeout: 30000
        });

        this.admin = this.kafka.admin();
        logger.info('Kafka client initialized', { 
            clientId: this.options.clientId,
            brokers: this.options.brokers 
        });
    }

    /**
     * Start Kafka streaming service
     */
    async start() {
        try {
            // Connect admin client
            await this.admin.connect();
            
            // Create topics if they don't exist
            await this.createTopics();

            // Initialize producer
            await this.initializeProducer();

            // Create default processors
            this.createDefaultProcessors();

            this.isConnected = true;
            this.emit('connected');

            logger.info('Kafka streaming service started successfully');

        } catch (error) {
            logger.error('Failed to start Kafka streaming service', { error: error.message });
            throw error;
        }
    }

    /**
     * Stop Kafka streaming service
     */
    async stop() {
        try {
            // Stop all consumers
            for (const [consumerId, consumer] of this.consumers) {
                await consumer.disconnect();
                logger.debug('Consumer disconnected', { consumerId });
            }
            this.consumers.clear();

            // Stop producer
            if (this.producer) {
                await this.producer.disconnect();
                this.producerReady = false;
            }

            // Stop admin client
            if (this.admin) {
                await this.admin.disconnect();
            }

            this.isConnected = false;
            this.emit('disconnected');

            logger.info('Kafka streaming service stopped');

        } catch (error) {
            logger.error('Error stopping Kafka streaming service', { error: error.message });
            throw error;
        }
    }

    /**
     * Create Kafka topics
     */
    async createTopics() {
        const topicsToCreate = Object.values(this.options.topics).map(topic => ({
            topic: topic,
            numPartitions: this.options.partitions,
            replicationFactor: this.options.replicationFactor,
            configEntries: [
                { name: 'retention.ms', value: this.options.retentionMs.toString() },
                { name: 'compression.type', value: this.options.compressionType },
                { name: 'cleanup.policy', value: 'delete' }
            ]
        }));

        try {
            await this.admin.createTopics({
                topics: topicsToCreate,
                waitForLeaders: true,
                timeout: 30000
            });

            // Track created topics
            for (const topicConfig of topicsToCreate) {
                this.topics.add(topicConfig.topic);
            }

            logger.info('Kafka topics created/verified', { 
                topics: Object.values(this.options.topics) 
            });

        } catch (error) {
            if (error.type === 'TOPIC_ALREADY_EXISTS') {
                logger.debug('Topics already exist, continuing...');
                for (const topicConfig of topicsToCreate) {
                    this.topics.add(topicConfig.topic);
                }
            } else {
                throw error;
            }
        }
    }

    /**
     * Initialize Kafka producer
     */
    async initializeProducer() {
        this.producer = this.kafka.producer({
            maxInFlightRequests: 1,
            idempotent: this.options.enableIdempotence,
            transactionTimeout: 30000,
            retry: {
                initialRetryTime: 100,
                retries: 5
            }
        });

        this.producer.on('producer.connect', () => {
            this.producerReady = true;
            logger.info('Kafka producer connected');
        });

        this.producer.on('producer.disconnect', () => {
            this.producerReady = false;
            logger.warn('Kafka producer disconnected');
        });

        await this.producer.connect();
    }

    /**
     * Publish event to Kafka
     */
    async publishEvent(event, options = {}) {
        if (!this.producerReady) {
            throw new Error('Producer not ready');
        }

        // Validate event
        const validation = event.validate();
        if (!validation.isValid) {
            throw new Error(`Invalid event: ${validation.errors.join(', ')}`);
        }

        // Determine topic
        const topic = options.topic || this.getTopicForEventType(event.eventType);
        if (!topic) {
            throw new Error(`No topic found for event type: ${event.eventType}`);
        }

        // Prepare message
        const message = event.toKafkaMessage();
        if (options.partition !== undefined) {
            message.partition = options.partition;
        }

        try {
            const result = await this.producer.send({
                topic: topic,
                messages: [message],
                acks: this.options.acks,
                timeout: 30000
            });

            // Update statistics
            this.stats.messagesProduced++;
            this.stats.bytesProduced += Buffer.byteLength(message.value);
            this.stats.lastActivity = new Date();

            this.emit('event-published', {
                eventId: event.eventId,
                eventType: event.eventType,
                topic: topic,
                partition: result[0].partition,
                offset: result[0].offset
            });

            logger.debug('Event published', {
                eventId: event.eventId,
                eventType: event.eventType,
                topic: topic,
                partition: result[0].partition,
                offset: result[0].offset
            });

            return result[0];

        } catch (error) {
            this.stats.errors++;
            logger.error('Failed to publish event', {
                eventId: event.eventId,
                eventType: event.eventType,
                topic: topic,
                error: error.message
            });

            throw error;
        }
    }

    /**
     * Publish batch of events
     */
    async publishBatch(events, options = {}) {
        if (!this.producerReady) {
            throw new Error('Producer not ready');
        }

        // Group events by topic
        const eventsByTopic = new Map();

        for (const event of events) {
            const validation = event.validate();
            if (!validation.isValid) {
                logger.warn('Skipping invalid event', {
                    eventId: event.eventId,
                    errors: validation.errors
                });
                continue;
            }

            const topic = options.topic || this.getTopicForEventType(event.eventType);
            if (!topic) {
                logger.warn('No topic found for event', {
                    eventId: event.eventId,
                    eventType: event.eventType
                });
                continue;
            }

            if (!eventsByTopic.has(topic)) {
                eventsByTopic.set(topic, []);
            }

            eventsByTopic.get(topic).push(event.toKafkaMessage());
        }

        // Publish to each topic
        const results = [];
        for (const [topic, messages] of eventsByTopic) {
            try {
                const result = await this.producer.send({
                    topic: topic,
                    messages: messages,
                    acks: this.options.acks,
                    timeout: 30000
                });

                results.push(...result);

                // Update statistics
                this.stats.messagesProduced += messages.length;
                this.stats.bytesProduced += messages.reduce((sum, msg) => 
                    sum + Buffer.byteLength(msg.value), 0);

            } catch (error) {
                this.stats.errors++;
                logger.error('Failed to publish batch to topic', {
                    topic: topic,
                    messageCount: messages.length,
                    error: error.message
                });
            }
        }

        this.stats.lastActivity = new Date();
        
        logger.info('Event batch published', {
            totalEvents: events.length,
            successfulEvents: results.length,
            topicsUsed: eventsByTopic.size
        });

        return results;
    }

    /**
     * Subscribe to topic with processor
     */
    async subscribe(topics, processorId, options = {}) {
        if (this.consumers.has(processorId)) {
            throw new Error(`Consumer with ID ${processorId} already exists`);
        }

        const consumer = this.kafka.consumer({
            groupId: options.groupId || this.options.groupId,
            sessionTimeout: 30000,
            rebalanceTimeout: 60000,
            heartbeatInterval: 3000,
            maxBytesPerPartition: 1048576, // 1MB
            minBytes: 1,
            maxBytes: 52428800, // 50MB
            maxWaitTimeInMs: 5000,
            retry: {
                initialRetryTime: 100,
                retries: 8
            }
        });

        // Setup consumer event handlers
        consumer.on('consumer.group_join', (event) => {
            logger.info('Consumer joined group', {
                processorId,
                groupId: event.payload.groupId,
                memberId: event.payload.memberId
            });
        });

        consumer.on('consumer.crash', (event) => {
            logger.error('Consumer crashed', {
                processorId,
                error: event.payload.error.message
            });
            
            this.emit('consumer-crashed', { processorId, error: event.payload.error });
        });

        await consumer.connect();
        await consumer.subscribe({ 
            topics: Array.isArray(topics) ? topics : [topics],
            fromBeginning: options.fromBeginning || false
        });

        // Get or create processor
        const processor = this.processors.get(processorId) || 
                         new EventProcessor(processorId, options);
        
        if (!this.processors.has(processorId)) {
            this.processors.set(processorId, processor);
        }

        // Start consuming
        await consumer.run({
            partitionsConsumedConcurrently: options.concurrency || 1,
            eachMessage: async ({ topic, partition, message, heartbeat }) => {
                try {
                    const event = RaceEvent.fromKafkaMessage(message);
                    
                    // Add to processor batch
                    processor.addToBatch(event);

                    // Update statistics
                    this.stats.messagesConsumed++;
                    this.stats.bytesConsumed += Buffer.byteLength(message.value);
                    this.stats.lastActivity = new Date();

                    // Call heartbeat to avoid rebalancing
                    await heartbeat();

                    this.emit('event-consumed', {
                        eventId: event.eventId,
                        eventType: event.eventType,
                        topic,
                        partition,
                        offset: message.offset,
                        processorId
                    });

                } catch (error) {
                    this.stats.errors++;
                    logger.error('Error processing consumed message', {
                        topic,
                        partition,
                        offset: message.offset,
                        processorId,
                        error: error.message
                    });

                    // Send to dead letter queue if enabled
                    if (options.deadLetterQueue !== false) {
                        await this.sendToDeadLetterQueue(message, error, {
                            topic,
                            partition,
                            processorId
                        });
                    }
                }
            }
        });

        this.consumers.set(processorId, consumer);
        this.stats.connectionCount++;

        logger.info('Subscribed to topics', {
            processorId,
            topics: Array.isArray(topics) ? topics : [topics]
        });

        return consumer;
    }

    /**
     * Unsubscribe consumer
     */
    async unsubscribe(processorId) {
        const consumer = this.consumers.get(processorId);
        if (!consumer) {
            throw new Error(`Consumer with ID ${processorId} not found`);
        }

        await consumer.disconnect();
        this.consumers.delete(processorId);

        // Flush remaining events in processor
        const processor = this.processors.get(processorId);
        if (processor) {
            await processor.flushBatch();
        }

        this.stats.connectionCount--;

        logger.info('Unsubscribed consumer', { processorId });
    }

    /**
     * Send message to dead letter queue
     */
    async sendToDeadLetterQueue(originalMessage, error, metadata) {
        try {
            const deadLetterEvent = new RaceEvent({
                eventType: 'system_event',
                source: 'kafka_streaming',
                raceId: 'system',
                payload: {
                    type: 'dead_letter',
                    originalMessage: {
                        value: originalMessage.value.toString(),
                        headers: originalMessage.headers,
                        ...metadata
                    },
                    error: {
                        message: error.message,
                        stack: error.stack,
                        timestamp: new Date().toISOString()
                    }
                },
                timestamp: new Date()
            });

            await this.publishEvent(deadLetterEvent, { 
                topic: this.options.topics.deadLetter 
            });

            logger.warn('Message sent to dead letter queue', {
                originalTopic: metadata.topic,
                processorId: metadata.processorId,
                error: error.message
            });

        } catch (dlqError) {
            logger.error('Failed to send message to dead letter queue', {
                originalError: error.message,
                dlqError: dlqError.message
            });
        }
    }

    /**
     * Get topic for event type
     */
    getTopicForEventType(eventType) {
        const topicMap = {
            'position_update': this.options.topics.positionUpdates,
            'tactical_event': this.options.topics.tacticalEvents,
            'weather_update': this.options.topics.weatherUpdates,
            'race_state_change': this.options.topics.raceEvents,
            'rider_status_change': this.options.topics.raceEvents,
            'group_formation': this.options.topics.raceEvents,
            'alert': this.options.topics.notifications,
            'system_event': this.options.topics.raceEvents,
            'ai_model_update': this.options.topics.aiModelUpdates
        };

        return topicMap[eventType] || this.options.topics.raceEvents;
    }

    /**
     * Create default event processors
     */
    createDefaultProcessors() {
        // Position update processor
        const positionProcessor = new EventProcessor('position-processor', {
            batchSize: 50,
            batchTimeout: 1000
        });

        positionProcessor.registerHandler('position_update', async (event) => {
            this.emit('position-update-processed', event);
        });

        this.processors.set('position-processor', positionProcessor);

        // Tactical event processor
        const tacticalProcessor = new EventProcessor('tactical-processor', {
            batchSize: 20,
            batchTimeout: 2000
        });

        tacticalProcessor.registerHandler('tactical_event', async (event) => {
            this.emit('tactical-event-processed', event);
        });

        this.processors.set('tactical-processor', tacticalProcessor);

        // Weather update processor
        const weatherProcessor = new EventProcessor('weather-processor', {
            batchSize: 10,
            batchTimeout: 5000
        });

        weatherProcessor.registerHandler('weather_update', async (event) => {
            this.emit('weather-update-processed', event);
        });

        this.processors.set('weather-processor', weatherProcessor);

        logger.info('Default event processors created');
    }

    /**
     * Register custom event processor
     */
    registerProcessor(processorId, processor) {
        if (this.processors.has(processorId)) {
            throw new Error(`Processor with ID ${processorId} already exists`);
        }

        this.processors.set(processorId, processor);
        
        logger.info('Custom processor registered', { processorId });
    }

    /**
     * Get event processor
     */
    getProcessor(processorId) {
        return this.processors.get(processorId);
    }

    /**
     * Get all processors
     */
    getAllProcessors() {
        return Array.from(this.processors.values()).map(processor => ({
            processorId: processor.processorId,
            stats: processor.getStats()
        }));
    }

    /**
     * Create race event
     */
    createRaceEvent(eventType, payload, options = {}) {
        return new RaceEvent({
            eventType,
            source: options.source || 'kafka_streaming',
            raceId: options.raceId || 'default',
            payload,
            timestamp: options.timestamp || new Date(),
            metadata: options.metadata || {}
        });
    }

    /**
     * Health check
     */
    async healthCheck() {
        const health = {
            status: 'healthy',
            kafka: {
                connected: this.isConnected,
                producerReady: this.producerReady,
                consumerCount: this.consumers.size,
                processorCount: this.processors.size
            },
            topics: Array.from(this.topics),
            stats: this.getStats()
        };

        try {
            // Test admin connection
            const metadata = await this.admin.getTopicMetadata({
                topics: [this.options.topics.raceEvents]
            });
            
            health.kafka.topicMetadata = metadata.topics.length > 0;

        } catch (error) {
            health.status = 'unhealthy';
            health.error = error.message;
        }

        return health;
    }

    /**
     * Get system statistics
     */
    getStats() {
        const processorStats = {};
        for (const [processorId, processor] of this.processors) {
            processorStats[processorId] = processor.getStats();
        }

        return {
            ...this.stats,
            processors: processorStats,
            topics: Array.from(this.topics),
            isConnected: this.isConnected,
            producerReady: this.producerReady,
            activeConsumers: this.consumers.size,
            memoryUsage: process.memoryUsage()
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            messagesProduced: 0,
            messagesConsumed: 0,
            bytesProduced: 0,
            bytesConsumed: 0,
            errors: 0,
            connectionCount: this.consumers.size,
            averageLatency: 0,
            lastActivity: null
        };

        // Reset processor stats
        for (const processor of this.processors.values()) {
            processor.stats = {
                eventsProcessed: 0,
                batchesProcessed: 0,
                errors: 0,
                averageProcessingTime: 0,
                lastProcessedAt: null
            };
        }

        logger.info('Statistics reset');
    }
}

module.exports = { KafkaEventStreaming, RaceEvent, EventProcessor };