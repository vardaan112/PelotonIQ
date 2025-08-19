/**
 * Data Aggregation & Conflict Resolution Service for PelotonIQ
 * Combines multiple real-time sources with intelligent conflict resolution
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
        new winston.transports.File({ filename: 'logs/data-aggregation.log' }),
        new winston.transports.Console()
    ]
});

/**
 * Data source information and reliability scoring
 */
class DataSource {
    constructor(sourceId, config = {}) {
        this.sourceId = sourceId;
        this.name = config.name || sourceId;
        this.type = config.type || 'unknown'; // timing, sensor, manual, social, broadcast
        this.priority = config.priority || 5; // 1-10 scale (10 = highest)
        this.reliability = config.reliability || 0.8; // 0-1 scale
        this.latency = config.latency || 1000; // Expected latency in ms
        this.accuracy = config.accuracy || 0.9; // Historical accuracy score
        
        // Dynamic metrics
        this.stats = {
            messagesReceived: 0,
            lastUpdateTime: null,
            averageLatency: config.latency || 1000,
            errorRate: 0,
            conflictRate: 0,
            uptime: 1.0
        };
        
        this.isActive = true;
        this.lastHealthCheck = new Date();
    }

    /**
     * Update source statistics
     */
    updateStats(latency, wasConflicted = false, wasError = false) {
        this.stats.messagesReceived++;
        this.stats.lastUpdateTime = new Date();
        
        // Update average latency with exponential smoothing
        const alpha = 0.1;
        this.stats.averageLatency = this.stats.averageLatency * (1 - alpha) + latency * alpha;
        
        // Update error rate
        if (wasError) {
            this.stats.errorRate = this.stats.errorRate * 0.9 + 0.1;
        } else {
            this.stats.errorRate = this.stats.errorRate * 0.95;
        }
        
        // Update conflict rate
        if (wasConflicted) {
            this.stats.conflictRate = this.stats.conflictRate * 0.9 + 0.1;
        } else {
            this.stats.conflictRate = this.stats.conflictRate * 0.95;
        }
        
        // Calculate dynamic reliability score
        this.reliability = Math.max(0.1, 
            this.accuracy * (1 - this.stats.errorRate) * (1 - this.stats.conflictRate * 0.5) * this.stats.uptime
        );
    }

    /**
     * Calculate current trust score
     */
    getTrustScore() {
        const timeFactor = this.stats.lastUpdateTime ? 
            Math.max(0.1, 1 - (Date.now() - this.stats.lastUpdateTime) / 60000) : 0.1;
        
        return this.reliability * this.priority / 10 * timeFactor;
    }

    toJSON() {
        return {
            sourceId: this.sourceId,
            name: this.name,
            type: this.type,
            priority: this.priority,
            reliability: this.reliability,
            trustScore: this.getTrustScore(),
            stats: this.stats,
            isActive: this.isActive
        };
    }
}

/**
 * Aggregated data point with conflict resolution metadata
 */
class AggregatedDataPoint {
    constructor(key, timestamp) {
        this.key = key;
        this.timestamp = timestamp;
        this.sources = new Map(); // sourceId -> {value, timestamp, metadata}
        this.resolvedValue = null;
        this.confidence = 0;
        this.conflictLevel = 'none'; // none, low, medium, high
        this.resolutionMethod = null;
        this.metadata = {};
    }

    /**
     * Add data from a source
     */
    addSourceData(sourceId, value, timestamp, metadata = {}) {
        this.sources.set(sourceId, {
            value,
            timestamp,
            metadata,
            receivedAt: new Date()
        });
    }

    /**
     * Get all source values
     */
    getSourceValues() {
        return Array.from(this.sources.values()).map(data => data.value);
    }

    /**
     * Check if values conflict
     */
    hasConflict(threshold = 0.05) {
        const values = this.getSourceValues();
        if (values.length <= 1) return false;
        
        // For numeric values, check variance
        if (values.every(v => typeof v === 'number')) {
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
            const coefficient = Math.sqrt(variance) / Math.abs(mean);
            return coefficient > threshold;
        }
        
        // For non-numeric values, check equality
        const unique = new Set(values.map(v => JSON.stringify(v)));
        return unique.size > 1;
    }

    toJSON() {
        return {
            key: this.key,
            timestamp: this.timestamp,
            resolvedValue: this.resolvedValue,
            confidence: this.confidence,
            conflictLevel: this.conflictLevel,
            resolutionMethod: this.resolutionMethod,
            sourceCount: this.sources.size,
            sources: Object.fromEntries(this.sources),
            metadata: this.metadata
        };
    }
}

/**
 * Main Data Aggregation Service
 */
class DataAggregationService extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            aggregationWindow: options.aggregationWindow || 5000, // 5 seconds
            maxDataAge: options.maxDataAge || 30000, // 30 seconds
            conflictThreshold: options.conflictThreshold || 0.05,
            minSources: options.minSources || 1,
            enableHealthChecks: options.enableHealthChecks !== false,
            healthCheckInterval: options.healthCheckInterval || 10000,
            ...options
        };

        // Data storage
        this.dataSources = new Map(); // sourceId -> DataSource
        this.aggregationBuffer = new Map(); // key -> AggregatedDataPoint
        this.resolvedData = new Map(); // key -> resolved values with timestamps
        
        // Conflict resolution strategies
        this.resolutionStrategies = new Map([
            ['weighted_average', this.weightedAverageResolution.bind(this)],
            ['highest_priority', this.highestPriorityResolution.bind(this)],
            ['majority_vote', this.majorityVoteResolution.bind(this)],
            ['confidence_weighted', this.confidenceWeightedResolution.bind(this)],
            ['temporal_priority', this.temporalPriorityResolution.bind(this)],
            ['source_reliability', this.sourceReliabilityResolution.bind(this)]
        ]);

        // Statistics
        this.stats = {
            totalDataPoints: 0,
            conflictsDetected: 0,
            conflictsResolved: 0,
            averageResolutionTime: 0,
            sourcesActive: 0,
            dataQualityScore: 1.0
        };

        // Internal state
        this.isRunning = false;
        this.aggregationTimer = null;
        this.healthCheckTimer = null;

        this.initializeService();
    }

    /**
     * Initialize service
     */
    initializeService() {
        // Create default aggregation strategies for different data types
        this.dataTypeStrategies = new Map([
            ['position', ['weighted_average', 'source_reliability', 'temporal_priority']],
            ['weather', ['highest_priority', 'temporal_priority', 'majority_vote']],
            ['tactical_event', ['confidence_weighted', 'majority_vote', 'source_reliability']],
            ['race_state', ['highest_priority', 'source_reliability', 'temporal_priority']],
            ['timing', ['weighted_average', 'source_reliability', 'highest_priority']]
        ]);

        logger.info('Data Aggregation Service initialized', {
            aggregationWindow: this.options.aggregationWindow,
            conflictThreshold: this.options.conflictThreshold,
            strategiesAvailable: Array.from(this.resolutionStrategies.keys())
        });
    }

    /**
     * Start the aggregation service
     */
    async start() {
        if (this.isRunning) {
            throw new Error('Data Aggregation Service is already running');
        }

        this.isRunning = true;
        
        // Start aggregation timer
        this.aggregationTimer = setInterval(() => {
            this.processAggregationBuffer();
        }, this.options.aggregationWindow);

        // Start health check timer
        if (this.options.enableHealthChecks) {
            this.healthCheckTimer = setInterval(() => {
                this.performHealthChecks();
            }, this.options.healthCheckInterval);
        }

        this.emit('service-started');
        logger.info('Data Aggregation Service started');
    }

    /**
     * Stop the aggregation service
     */
    async stop() {
        if (!this.isRunning) return;

        this.isRunning = false;

        if (this.aggregationTimer) {
            clearInterval(this.aggregationTimer);
            this.aggregationTimer = null;
        }

        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }

        // Process remaining buffer
        this.processAggregationBuffer();

        this.emit('service-stopped');
        logger.info('Data Aggregation Service stopped');
    }

    /**
     * Register a data source
     */
    registerSource(sourceId, config = {}) {
        if (this.dataSources.has(sourceId)) {
            logger.warn('Data source already registered', { sourceId });
            return this.dataSources.get(sourceId);
        }

        const source = new DataSource(sourceId, config);
        this.dataSources.set(sourceId, source);
        this.stats.sourcesActive++;

        this.emit('source-registered', source.toJSON());
        logger.info('Data source registered', { sourceId, config });

        return source;
    }

    /**
     * Unregister a data source
     */
    unregisterSource(sourceId) {
        const source = this.dataSources.get(sourceId);
        if (!source) {
            logger.warn('Data source not found for unregistration', { sourceId });
            return;
        }

        this.dataSources.delete(sourceId);
        this.stats.sourcesActive--;

        // Remove source data from aggregation buffer
        for (const [key, dataPoint] of this.aggregationBuffer) {
            dataPoint.sources.delete(sourceId);
            if (dataPoint.sources.size === 0) {
                this.aggregationBuffer.delete(key);
            }
        }

        this.emit('source-unregistered', { sourceId });
        logger.info('Data source unregistered', { sourceId });
    }

    /**
     * Ingest data from a source
     */
    ingestData(sourceId, dataType, key, value, timestamp = new Date(), metadata = {}) {
        const startTime = performance.now();
        
        // Validate source
        const source = this.dataSources.get(sourceId);
        if (!source) {
            logger.warn('Data received from unregistered source', { sourceId, key });
            return;
        }

        if (!source.isActive) {
            logger.debug('Data received from inactive source', { sourceId, key });
            return;
        }

        // Create aggregation key
        const aggregationKey = `${dataType}:${key}`;
        
        // Get or create aggregated data point
        let dataPoint = this.aggregationBuffer.get(aggregationKey);
        if (!dataPoint) {
            dataPoint = new AggregatedDataPoint(aggregationKey, timestamp);
            this.aggregationBuffer.set(aggregationKey, dataPoint);
        }

        // Add source data
        dataPoint.addSourceData(sourceId, value, timestamp, {
            ...metadata,
            dataType,
            ingestionTime: new Date()
        });

        // Update source statistics
        const latency = Date.now() - timestamp.getTime();
        source.updateStats(latency);

        this.stats.totalDataPoints++;

        // Emit ingestion event
        this.emit('data-ingested', {
            sourceId,
            dataType,
            key: aggregationKey,
            value,
            timestamp,
            latency
        });

        // Check for immediate conflicts
        if (dataPoint.hasConflict(this.options.conflictThreshold)) {
            this.stats.conflictsDetected++;
            this.emit('conflict-detected', {
                key: aggregationKey,
                sources: Array.from(dataPoint.sources.keys()),
                values: dataPoint.getSourceValues()
            });
        }

        logger.debug('Data ingested', {
            sourceId,
            dataType,
            key: aggregationKey,
            sourceCount: dataPoint.sources.size,
            processingTime: performance.now() - startTime
        });
    }

    /**
     * Process aggregation buffer
     */
    processAggregationBuffer() {
        const startTime = performance.now();
        const currentTime = Date.now();
        let processedCount = 0;
        let resolvedCount = 0;

        for (const [key, dataPoint] of this.aggregationBuffer) {
            // Check if data point should be processed
            const age = currentTime - dataPoint.timestamp.getTime();
            const hasMinSources = dataPoint.sources.size >= this.options.minSources;
            const isExpired = age > this.options.maxDataAge;

            if (hasMinSources || isExpired) {
                try {
                    const resolved = this.resolveDataPoint(dataPoint);
                    if (resolved) {
                        this.resolvedData.set(key, resolved);
                        resolvedCount++;
                        
                        this.emit('data-resolved', resolved);
                    }
                } catch (error) {
                    logger.error('Error resolving data point', {
                        key,
                        error: error.message,
                        sourceCount: dataPoint.sources.size
                    });
                }

                this.aggregationBuffer.delete(key);
                processedCount++;
            }
        }

        // Clean up old resolved data
        for (const [key, resolvedData] of this.resolvedData) {
            const age = currentTime - resolvedData.timestamp.getTime();
            if (age > this.options.maxDataAge * 2) {
                this.resolvedData.delete(key);
            }
        }

        const processingTime = performance.now() - startTime;
        
        if (processedCount > 0) {
            logger.debug('Aggregation buffer processed', {
                processedCount,
                resolvedCount,
                bufferSize: this.aggregationBuffer.size,
                processingTime
            });
        }

        // Update stats
        this.updateAggregationStats(processingTime);
    }

    /**
     * Resolve conflicts in a data point
     */
    resolveDataPoint(dataPoint) {
        const startTime = performance.now();
        
        // Determine data type from key
        const dataType = dataPoint.key.split(':')[0];
        const strategies = this.dataTypeStrategies.get(dataType) || ['weighted_average'];

        // Check for conflicts
        const hasConflict = dataPoint.hasConflict(this.options.conflictThreshold);
        dataPoint.conflictLevel = this.calculateConflictLevel(dataPoint);

        let resolvedValue = null;
        let confidence = 0;
        let usedStrategy = null;

        // Try resolution strategies in order
        for (const strategyName of strategies) {
            const strategy = this.resolutionStrategies.get(strategyName);
            if (strategy) {
                try {
                    const result = strategy(dataPoint);
                    if (result && result.confidence > confidence) {
                        resolvedValue = result.value;
                        confidence = result.confidence;
                        usedStrategy = strategyName;
                    }
                } catch (error) {
                    logger.warn('Resolution strategy failed', {
                        strategy: strategyName,
                        error: error.message,
                        key: dataPoint.key
                    });
                }
            }
        }

        // Fallback to first available value if no strategy worked
        if (resolvedValue === null && dataPoint.sources.size > 0) {
            const firstSource = Array.from(dataPoint.sources.values())[0];
            resolvedValue = firstSource.value;
            confidence = 0.5;
            usedStrategy = 'fallback';
        }

        if (resolvedValue !== null) {
            dataPoint.resolvedValue = resolvedValue;
            dataPoint.confidence = confidence;
            dataPoint.resolutionMethod = usedStrategy;

            if (hasConflict) {
                this.stats.conflictsResolved++;
            }

            // Update resolution time stats
            const resolutionTime = performance.now() - startTime;
            this.updateResolutionStats(resolutionTime);

            logger.debug('Data point resolved', {
                key: dataPoint.key,
                strategy: usedStrategy,
                confidence,
                conflictLevel: dataPoint.conflictLevel,
                sourceCount: dataPoint.sources.size,
                resolutionTime
            });

            return dataPoint.toJSON();
        }

        return null;
    }

    /**
     * Weighted average resolution strategy
     */
    weightedAverageResolution(dataPoint) {
        const values = [];
        const weights = [];
        
        for (const [sourceId, data] of dataPoint.sources) {
            const source = this.dataSources.get(sourceId);
            if (source && typeof data.value === 'number') {
                values.push(data.value);
                weights.push(source.getTrustScore());
            }
        }

        if (values.length === 0) return null;

        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        if (totalWeight === 0) return null;

        const weightedSum = values.reduce((sum, val, i) => sum + val * weights[i], 0);
        const average = weightedSum / totalWeight;

        return {
            value: average,
            confidence: Math.min(0.95, totalWeight / values.length)
        };
    }

    /**
     * Highest priority resolution strategy
     */
    highestPriorityResolution(dataPoint) {
        let bestSource = null;
        let bestPriority = -1;

        for (const [sourceId, data] of dataPoint.sources) {
            const source = this.dataSources.get(sourceId);
            if (source && source.priority > bestPriority) {
                bestSource = data;
                bestPriority = source.priority;
            }
        }

        if (!bestSource) return null;

        return {
            value: bestSource.value,
            confidence: Math.min(0.9, bestPriority / 10)
        };
    }

    /**
     * Majority vote resolution strategy
     */
    majorityVoteResolution(dataPoint) {
        const valueCounts = new Map();
        const sourceWeights = new Map();

        for (const [sourceId, data] of dataPoint.sources) {
            const source = this.dataSources.get(sourceId);
            if (source) {
                const valueKey = JSON.stringify(data.value);
                valueCounts.set(valueKey, (valueCounts.get(valueKey) || 0) + 1);
                sourceWeights.set(valueKey, (sourceWeights.get(valueKey) || 0) + source.getTrustScore());
            }
        }

        if (valueCounts.size === 0) return null;

        // Find majority by count and weight
        let bestValue = null;
        let bestScore = 0;

        for (const [valueKey, count] of valueCounts) {
            const weight = sourceWeights.get(valueKey);
            const score = count * weight;
            
            if (score > bestScore) {
                bestValue = JSON.parse(valueKey);
                bestScore = score;
            }
        }

        const totalSources = dataPoint.sources.size;
        const confidence = Math.min(0.95, bestScore / totalSources);

        return {
            value: bestValue,
            confidence
        };
    }

    /**
     * Confidence weighted resolution strategy
     */
    confidenceWeightedResolution(dataPoint) {
        let bestValue = null;
        let bestConfidence = 0;

        for (const [sourceId, data] of dataPoint.sources) {
            const source = this.dataSources.get(sourceId);
            if (source) {
                const sourceConfidence = data.metadata.confidence || source.reliability;
                const trustScore = source.getTrustScore();
                const combinedConfidence = sourceConfidence * trustScore;

                if (combinedConfidence > bestConfidence) {
                    bestValue = data.value;
                    bestConfidence = combinedConfidence;
                }
            }
        }

        return bestValue !== null ? {
            value: bestValue,
            confidence: Math.min(0.95, bestConfidence)
        } : null;
    }

    /**
     * Temporal priority resolution strategy
     */
    temporalPriorityResolution(dataPoint) {
        let newestData = null;
        let newestTime = 0;

        for (const [sourceId, data] of dataPoint.sources) {
            const timestamp = data.timestamp.getTime();
            if (timestamp > newestTime) {
                newestData = data;
                newestTime = timestamp;
            }
        }

        if (!newestData) return null;

        const age = Date.now() - newestTime;
        const confidence = Math.max(0.1, 1 - age / this.options.maxDataAge);

        return {
            value: newestData.value,
            confidence
        };
    }

    /**
     * Source reliability resolution strategy
     */
    sourceReliabilityResolution(dataPoint) {
        let bestSource = null;
        let bestReliability = 0;

        for (const [sourceId, data] of dataPoint.sources) {
            const source = this.dataSources.get(sourceId);
            if (source && source.reliability > bestReliability) {
                bestSource = data;
                bestReliability = source.reliability;
            }
        }

        if (!bestSource) return null;

        return {
            value: bestSource.value,
            confidence: Math.min(0.9, bestReliability)
        };
    }

    /**
     * Calculate conflict level
     */
    calculateConflictLevel(dataPoint) {
        const values = dataPoint.getSourceValues();
        if (values.length <= 1) return 'none';

        if (values.every(v => typeof v === 'number')) {
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
            const coefficient = Math.sqrt(variance) / Math.abs(mean);

            if (coefficient > 0.2) return 'high';
            if (coefficient > 0.1) return 'medium';
            if (coefficient > 0.05) return 'low';
            return 'none';
        }

        const unique = new Set(values.map(v => JSON.stringify(v)));
        const conflictRatio = (unique.size - 1) / values.length;

        if (conflictRatio > 0.5) return 'high';
        if (conflictRatio > 0.3) return 'medium';
        if (conflictRatio > 0) return 'low';
        return 'none';
    }

    /**
     * Perform health checks on data sources
     */
    performHealthChecks() {
        const currentTime = Date.now();
        let activeCount = 0;

        for (const [sourceId, source] of this.dataSources) {
            const timeSinceLastUpdate = source.stats.lastUpdateTime ? 
                currentTime - source.stats.lastUpdateTime.getTime() : Infinity;

            // Check if source is still active
            const wasActive = source.isActive;
            source.isActive = timeSinceLastUpdate < this.options.maxDataAge;

            if (source.isActive) {
                activeCount++;
            }

            // Emit status change
            if (wasActive !== source.isActive) {
                this.emit('source-status-changed', {
                    sourceId,
                    isActive: source.isActive,
                    timeSinceLastUpdate
                });

                logger.info('Data source status changed', {
                    sourceId,
                    isActive: source.isActive,
                    timeSinceLastUpdate
                });
            }

            source.lastHealthCheck = new Date();
        }

        this.stats.sourcesActive = activeCount;
        this.calculateDataQualityScore();
    }

    /**
     * Calculate overall data quality score
     */
    calculateDataQualityScore() {
        if (this.dataSources.size === 0) {
            this.stats.dataQualityScore = 0;
            return;
        }

        let totalReliability = 0;
        let totalUptime = 0;
        let activeCount = 0;

        for (const source of this.dataSources.values()) {
            if (source.isActive) {
                totalReliability += source.reliability;
                totalUptime += source.stats.uptime;
                activeCount++;
            }
        }

        const averageReliability = activeCount > 0 ? totalReliability / activeCount : 0;
        const averageUptime = activeCount > 0 ? totalUptime / activeCount : 0;
        const activeRatio = activeCount / this.dataSources.size;

        this.stats.dataQualityScore = averageReliability * averageUptime * activeRatio;
    }

    /**
     * Update aggregation statistics
     */
    updateAggregationStats(processingTime) {
        // Update average processing time
        const alpha = 0.1;
        this.stats.averageResolutionTime = 
            this.stats.averageResolutionTime * (1 - alpha) + processingTime * alpha;
    }

    /**
     * Update resolution statistics
     */
    updateResolutionStats(resolutionTime) {
        // Update average resolution time
        const alpha = 0.1;
        this.stats.averageResolutionTime = 
            this.stats.averageResolutionTime * (1 - alpha) + resolutionTime * alpha;
    }

    /**
     * Get resolved data by key
     */
    getResolvedData(key) {
        return this.resolvedData.get(key);
    }

    /**
     * Get all resolved data
     */
    getAllResolvedData() {
        return Object.fromEntries(this.resolvedData);
    }

    /**
     * Get data source information
     */
    getDataSource(sourceId) {
        const source = this.dataSources.get(sourceId);
        return source ? source.toJSON() : null;
    }

    /**
     * Get all data sources
     */
    getAllDataSources() {
        return Array.from(this.dataSources.values()).map(source => source.toJSON());
    }

    /**
     * Get service statistics
     */
    getStats() {
        return {
            ...this.stats,
            bufferSize: this.aggregationBuffer.size,
            resolvedDataSize: this.resolvedData.size,
            registeredSources: this.dataSources.size,
            isRunning: this.isRunning
        };
    }

    /**
     * Health check endpoint
     */
    async healthCheck() {
        const health = {
            status: 'healthy',
            service: {
                isRunning: this.isRunning,
                bufferSize: this.aggregationBuffer.size,
                dataQualityScore: this.stats.dataQualityScore
            },
            sources: {
                registered: this.dataSources.size,
                active: this.stats.sourcesActive,
                reliability: this.stats.dataQualityScore
            },
            performance: {
                averageResolutionTime: this.stats.averageResolutionTime,
                conflictResolutionRate: this.stats.conflictsDetected > 0 ? 
                    this.stats.conflictsResolved / this.stats.conflictsDetected : 1
            },
            stats: this.getStats()
        };

        // Determine health status
        if (!this.isRunning) {
            health.status = 'stopped';
        } else if (this.stats.dataQualityScore < 0.5) {
            health.status = 'degraded';
        } else if (this.stats.sourcesActive < this.dataSources.size * 0.7) {
            health.status = 'degraded';
        }

        return health;
    }
}

module.exports = { DataAggregationService, DataSource, AggregatedDataPoint };