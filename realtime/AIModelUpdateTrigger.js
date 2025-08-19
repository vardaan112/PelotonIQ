/**
 * AI Model Update Trigger System for PelotonIQ
 * Automatically triggers AI model updates based on real-time race data and performance metrics
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
        new winston.transports.File({ filename: 'logs/ai-model-updates.log' }),
        new winston.transports.Console()
    ]
});

/**
 * AI Model types and their characteristics
 */
const ModelType = {
    PERFORMANCE_PREDICTION: 'performance_prediction',
    TACTICAL_ANALYSIS: 'tactical_analysis',
    WEATHER_IMPACT: 'weather_impact',
    TEAM_OPTIMIZATION: 'team_optimization',
    FATIGUE_MODELING: 'fatigue_modeling',
    ROUTE_STRATEGY: 'route_strategy'
};

/**
 * Update trigger conditions
 */
const TriggerCondition = {
    DATA_THRESHOLD: 'data_threshold',
    TIME_BASED: 'time_based',
    PERFORMANCE_DRIFT: 'performance_drift',
    MANUAL_REQUEST: 'manual_request',
    RACE_COMPLETION: 'race_completion',
    SIGNIFICANT_EVENT: 'significant_event'
};

/**
 * Model update priorities
 */
const UpdatePriority = {
    LOW: 1,
    NORMAL: 2,
    HIGH: 3,
    URGENT: 4,
    CRITICAL: 5
};

/**
 * AI Model configuration and state tracking
 */
class AIModel {
    constructor(modelId, config = {}) {
        this.modelId = modelId;
        this.modelType = config.modelType || ModelType.PERFORMANCE_PREDICTION;
        this.version = config.version || '1.0.0';
        this.createdAt = new Date(config.createdAt || Date.now());
        this.lastUpdated = new Date(config.lastUpdated || Date.now());
        
        // Model configuration
        this.config = {
            framework: config.framework || 'tensorflow',
            algorithm: config.algorithm || 'neural_network',
            inputFeatures: config.inputFeatures || [],
            outputTargets: config.outputTargets || [],
            hyperparameters: config.hyperparameters || {},
            trainingDataSources: config.trainingDataSources || [],
            validationSplit: config.validationSplit || 0.2,
            batchSize: config.batchSize || 32,
            epochs: config.epochs || 100,
            learningRate: config.learningRate || 0.001,
            ...config.config
        };
        
        // Performance tracking
        this.performance = {
            accuracy: config.accuracy || 0,
            precision: config.precision || 0,
            recall: config.recall || 0,
            f1Score: config.f1Score || 0,
            meanSquaredError: config.meanSquaredError || 0,
            rSquared: config.rSquared || 0,
            predictionLatency: config.predictionLatency || 0,
            trainingTime: config.trainingTime || 0,
            lastEvaluationAt: new Date(config.lastEvaluationAt || Date.now())
        };
        
        // Update triggers
        this.updateTriggers = {
            dataThreshold: config.dataThreshold || 1000, // New data points needed
            timeInterval: config.timeInterval || 86400000, // 24 hours in ms
            performanceDriftThreshold: config.performanceDriftThreshold || 0.05, // 5% drop
            minUpdateInterval: config.minUpdateInterval || 3600000, // 1 hour minimum
            enableAutoUpdate: config.enableAutoUpdate !== false
        };
        
        // Current state
        this.status = 'active'; // active, updating, failed, deprecated
        this.dataCount = 0;
        this.lastPredictionAccuracy = this.performance.accuracy;
        this.updateQueue = [];
        this.isUpdating = false;
        
        // Dependencies
        this.dependencies = config.dependencies || []; // Other models this depends on
        this.dependents = new Set(); // Models that depend on this one
        
        // Statistics
        this.stats = {
            totalUpdates: 0,
            successfulUpdates: 0,
            failedUpdates: 0,
            averageUpdateTime: 0,
            totalPredictions: 0,
            averagePredictionTime: 0,
            dataPointsProcessed: 0
        };
    }

    /**
     * Check if model needs update based on configured triggers
     */
    needsUpdate() {
        if (!this.updateTriggers.enableAutoUpdate || this.isUpdating) {
            return false;
        }

        const now = Date.now();
        const timeSinceLastUpdate = now - this.lastUpdated.getTime();
        
        // Check minimum update interval
        if (timeSinceLastUpdate < this.updateTriggers.minUpdateInterval) {
            return false;
        }

        // Check data threshold
        if (this.dataCount >= this.updateTriggers.dataThreshold) {
            logger.debug('Model needs update: data threshold reached', {
                modelId: this.modelId,
                dataCount: this.dataCount,
                threshold: this.updateTriggers.dataThreshold
            });
            return true;
        }

        // Check time interval
        if (timeSinceLastUpdate >= this.updateTriggers.timeInterval) {
            logger.debug('Model needs update: time interval reached', {
                modelId: this.modelId,
                timeSinceLastUpdate,
                interval: this.updateTriggers.timeInterval
            });
            return true;
        }

        // Check performance drift
        const performanceDrop = this.lastPredictionAccuracy - this.performance.accuracy;
        if (performanceDrop >= this.updateTriggers.performanceDriftThreshold) {
            logger.debug('Model needs update: performance drift detected', {
                modelId: this.modelId,
                performanceDrop,
                threshold: this.updateTriggers.performanceDriftThreshold
            });
            return true;
        }

        return false;
    }

    /**
     * Add new training data
     */
    addTrainingData(dataPoints) {
        this.dataCount += Array.isArray(dataPoints) ? dataPoints.length : 1;
        this.stats.dataPointsProcessed += Array.isArray(dataPoints) ? dataPoints.length : 1;
    }

    /**
     * Record prediction performance
     */
    recordPrediction(actualValue, predictedValue, latency) {
        this.stats.totalPredictions++;
        
        // Update average prediction time
        const alpha = 0.1;
        this.stats.averagePredictionTime = 
            this.stats.averagePredictionTime * (1 - alpha) + latency * alpha;
        
        // Update performance metrics (simplified)
        if (typeof actualValue === 'number' && typeof predictedValue === 'number') {
            const error = Math.abs(actualValue - predictedValue);
            const relativeError = error / Math.abs(actualValue);
            
            // Update accuracy (inverse of relative error)
            const accuracy = Math.max(0, 1 - relativeError);
            this.performance.accuracy = this.performance.accuracy * (1 - alpha) + accuracy * alpha;
        }
    }

    /**
     * Start model update process
     */
    startUpdate() {
        this.isUpdating = true;
        this.status = 'updating';
        this.stats.totalUpdates++;
        
        logger.info('Model update started', {
            modelId: this.modelId,
            modelType: this.modelType,
            version: this.version,
            dataCount: this.dataCount
        });
    }

    /**
     * Complete model update
     */
    completeUpdate(success, newPerformance = {}, newVersion = null) {
        this.isUpdating = false;
        this.lastUpdated = new Date();
        this.dataCount = 0; // Reset data counter
        
        if (success) {
            this.status = 'active';
            this.stats.successfulUpdates++;
            
            // Update performance metrics
            Object.assign(this.performance, newPerformance);
            this.performance.lastEvaluationAt = new Date();
            
            // Update version if provided
            if (newVersion) {
                this.version = newVersion;
            }
            
            logger.info('Model update completed successfully', {
                modelId: this.modelId,
                newVersion: this.version,
                performance: this.performance
            });
        } else {
            this.status = 'failed';
            this.stats.failedUpdates++;
            
            logger.error('Model update failed', {
                modelId: this.modelId,
                modelType: this.modelType
            });
        }
    }

    /**
     * Get model health score
     */
    getHealthScore() {
        const factors = {
            accuracy: this.performance.accuracy,
            recency: Math.max(0, 1 - (Date.now() - this.lastUpdated.getTime()) / (7 * 24 * 60 * 60 * 1000)), // 7 days
            reliability: this.stats.totalUpdates > 0 ? this.stats.successfulUpdates / this.stats.totalUpdates : 1,
            performance: Math.max(0, 1 - this.stats.averagePredictionTime / 1000) // Penalize slow predictions
        };
        
        return Object.values(factors).reduce((sum, factor) => sum + factor, 0) / Object.keys(factors).length;
    }

    toJSON() {
        return {
            modelId: this.modelId,
            modelType: this.modelType,
            version: this.version,
            status: this.status,
            createdAt: this.createdAt,
            lastUpdated: this.lastUpdated,
            config: this.config,
            performance: this.performance,
            updateTriggers: this.updateTriggers,
            dataCount: this.dataCount,
            isUpdating: this.isUpdating,
            healthScore: this.getHealthScore(),
            dependencies: this.dependencies,
            dependents: Array.from(this.dependents),
            stats: this.stats
        };
    }
}

/**
 * Update request with priority and context
 */
class UpdateRequest {
    constructor(modelId, triggerCondition, priority = UpdatePriority.NORMAL, context = {}) {
        this.id = this.generateId();
        this.modelId = modelId;
        this.triggerCondition = triggerCondition;
        this.priority = priority;
        this.context = context;
        this.createdAt = new Date();
        this.status = 'pending'; // pending, processing, completed, failed
        this.estimatedDuration = context.estimatedDuration || 0;
        this.actualDuration = 0;
        this.error = null;
    }

    generateId() {
        return `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    toJSON() {
        return {
            id: this.id,
            modelId: this.modelId,
            triggerCondition: this.triggerCondition,
            priority: this.priority,
            context: this.context,
            createdAt: this.createdAt,
            status: this.status,
            estimatedDuration: this.estimatedDuration,
            actualDuration: this.actualDuration,
            error: this.error
        };
    }
}

/**
 * Main AI Model Update Trigger System
 */
class AIModelUpdateTrigger extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            maxConcurrentUpdates: options.maxConcurrentUpdates || 3,
            updateQueueSize: options.updateQueueSize || 100,
            checkInterval: options.checkInterval || 60000, // 1 minute
            enableAutoUpdate: options.enableAutoUpdate !== false,
            priorityWeights: options.priorityWeights || {
                [UpdatePriority.LOW]: 1,
                [UpdatePriority.NORMAL]: 2,
                [UpdatePriority.HIGH]: 4,
                [UpdatePriority.URGENT]: 8,
                [UpdatePriority.CRITICAL]: 16
            },
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 300000, // 5 minutes
            ...options
        };

        // Storage
        this.models = new Map(); // modelId -> AIModel
        this.updateQueue = []; // Array of UpdateRequest
        this.activeUpdates = new Map(); // updateId -> UpdateRequest
        this.updateHistory = []; // Recent update history
        
        // Update handlers
        this.updateHandlers = new Map(); // modelType -> update function
        this.preprocessors = new Map(); // modelType -> preprocessing function
        this.validators = new Map(); // modelType -> validation function
        
        // Statistics
        this.stats = {
            totalModels: 0,
            activeModels: 0,
            modelsNeedingUpdate: 0,
            updatesTriggered: 0,
            updatesCompleted: 0,
            updatesFailed: 0,
            averageUpdateTime: 0,
            queueLength: 0,
            systemUptime: Date.now()
        };

        // Internal state
        this.isRunning = false;
        this.checkTimer = null;
        
        this.initializeSystem();
    }

    /**
     * Initialize the update trigger system
     */
    initializeSystem() {
        // Register default update handlers
        this.registerUpdateHandler(ModelType.PERFORMANCE_PREDICTION, this.performancePredictionUpdate.bind(this));
        this.registerUpdateHandler(ModelType.TACTICAL_ANALYSIS, this.tacticalAnalysisUpdate.bind(this));
        this.registerUpdateHandler(ModelType.WEATHER_IMPACT, this.weatherImpactUpdate.bind(this));
        this.registerUpdateHandler(ModelType.TEAM_OPTIMIZATION, this.teamOptimizationUpdate.bind(this));
        this.registerUpdateHandler(ModelType.FATIGUE_MODELING, this.fatigueModelingUpdate.bind(this));
        this.registerUpdateHandler(ModelType.ROUTE_STRATEGY, this.routeStrategyUpdate.bind(this));
        
        logger.info('AI Model Update Trigger System initialized', {
            maxConcurrentUpdates: this.options.maxConcurrentUpdates,
            checkInterval: this.options.checkInterval,
            supportedModelTypes: Array.from(this.updateHandlers.keys())
        });
    }

    /**
     * Start the update trigger system
     */
    async start() {
        if (this.isRunning) {
            throw new Error('AI Model Update Trigger System is already running');
        }

        this.isRunning = true;
        
        // Start periodic checks
        this.checkTimer = setInterval(() => {
            this.checkForUpdates();
        }, this.options.checkInterval);

        this.emit('system-started');
        logger.info('AI Model Update Trigger System started');
    }

    /**
     * Stop the update trigger system
     */
    async stop() {
        if (!this.isRunning) return;

        this.isRunning = false;

        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }

        // Wait for active updates to complete
        await this.waitForActiveUpdates();

        this.emit('system-stopped');
        logger.info('AI Model Update Trigger System stopped');
    }

    /**
     * Register AI model
     */
    registerModel(modelId, config = {}) {
        if (this.models.has(modelId)) {
            logger.warn('Model already registered', { modelId });
            return this.models.get(modelId);
        }

        const model = new AIModel(modelId, config);
        this.models.set(modelId, model);
        
        this.stats.totalModels++;
        this.stats.activeModels++;

        this.emit('model-registered', model.toJSON());
        logger.info('AI model registered', {
            modelId,
            modelType: model.modelType,
            version: model.version
        });

        return model;
    }

    /**
     * Unregister AI model
     */
    unregisterModel(modelId) {
        const model = this.models.get(modelId);
        if (!model) {
            logger.warn('Model not found for unregistration', { modelId });
            return;
        }

        // Cancel any pending updates
        this.updateQueue = this.updateQueue.filter(req => req.modelId !== modelId);
        
        // Remove from active updates if present
        for (const [updateId, request] of this.activeUpdates) {
            if (request.modelId === modelId) {
                this.activeUpdates.delete(updateId);
            }
        }

        this.models.delete(modelId);
        this.stats.activeModels--;

        this.emit('model-unregistered', { modelId });
        logger.info('AI model unregistered', { modelId });
    }

    /**
     * Add training data to model
     */
    addTrainingData(modelId, dataPoints, triggerUpdate = false) {
        const model = this.models.get(modelId);
        if (!model) {
            logger.warn('Model not found for training data', { modelId });
            return;
        }

        model.addTrainingData(dataPoints);
        
        this.emit('training-data-added', {
            modelId,
            dataPointsCount: Array.isArray(dataPoints) ? dataPoints.length : 1,
            totalDataCount: model.dataCount
        });

        // Check if update should be triggered
        if (triggerUpdate || model.needsUpdate()) {
            this.triggerUpdate(modelId, TriggerCondition.DATA_THRESHOLD);
        }
    }

    /**
     * Record prediction result for model performance tracking
     */
    recordPrediction(modelId, actualValue, predictedValue, latency = 0) {
        const model = this.models.get(modelId);
        if (!model) {
            logger.warn('Model not found for prediction recording', { modelId });
            return;
        }

        model.recordPrediction(actualValue, predictedValue, latency);
        
        // Check for performance drift
        if (model.needsUpdate()) {
            this.triggerUpdate(modelId, TriggerCondition.PERFORMANCE_DRIFT, UpdatePriority.HIGH);
        }
    }

    /**
     * Manually trigger model update
     */
    triggerUpdate(modelId, triggerCondition = TriggerCondition.MANUAL_REQUEST, priority = UpdatePriority.NORMAL, context = {}) {
        const model = this.models.get(modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }

        if (model.isUpdating) {
            logger.warn('Model is already being updated', { modelId });
            return null;
        }

        // Check queue size
        if (this.updateQueue.length >= this.options.updateQueueSize) {
            throw new Error('Update queue is full');
        }

        const updateRequest = new UpdateRequest(modelId, triggerCondition, priority, context);
        this.updateQueue.push(updateRequest);
        
        // Sort queue by priority
        this.updateQueue.sort((a, b) => {
            const weightA = this.options.priorityWeights[a.priority] || 1;
            const weightB = this.options.priorityWeights[b.priority] || 1;
            return weightB - weightA;
        });

        this.stats.updatesTriggered++;
        this.stats.queueLength = this.updateQueue.length;

        this.emit('update-triggered', {
            updateId: updateRequest.id,
            modelId,
            triggerCondition,
            priority,
            queuePosition: this.updateQueue.indexOf(updateRequest)
        });

        logger.info('Model update triggered', {
            updateId: updateRequest.id,
            modelId,
            triggerCondition,
            priority,
            queueLength: this.updateQueue.length
        });

        // Process queue
        this.processUpdateQueue();

        return updateRequest;
    }

    /**
     * Check all models for update triggers
     */
    checkForUpdates() {
        if (!this.options.enableAutoUpdate) return;

        let modelsNeedingUpdate = 0;
        
        for (const model of this.models.values()) {
            if (model.needsUpdate()) {
                modelsNeedingUpdate++;
                this.triggerUpdate(model.modelId, TriggerCondition.TIME_BASED, UpdatePriority.NORMAL);
            }
        }

        this.stats.modelsNeedingUpdate = modelsNeedingUpdate;

        if (modelsNeedingUpdate > 0) {
            logger.debug('Automatic update check completed', {
                modelsNeedingUpdate,
                queueLength: this.updateQueue.length
            });
        }
    }

    /**
     * Process update queue
     */
    async processUpdateQueue() {
        while (this.updateQueue.length > 0 && 
               this.activeUpdates.size < this.options.maxConcurrentUpdates) {
            
            const updateRequest = this.updateQueue.shift();
            this.stats.queueLength = this.updateQueue.length;
            
            // Start update
            this.activeUpdates.set(updateRequest.id, updateRequest);
            updateRequest.status = 'processing';
            
            // Process update asynchronously
            this.processUpdate(updateRequest).catch(error => {
                logger.error('Error processing update', {
                    updateId: updateRequest.id,
                    modelId: updateRequest.modelId,
                    error: error.message
                });
            });
        }
    }

    /**
     * Process individual update request
     */
    async processUpdate(updateRequest) {
        const startTime = performance.now();
        const model = this.models.get(updateRequest.modelId);
        
        if (!model) {
            updateRequest.status = 'failed';
            updateRequest.error = 'Model not found';
            this.activeUpdates.delete(updateRequest.id);
            return;
        }

        try {
            model.startUpdate();
            
            this.emit('update-started', {
                updateId: updateRequest.id,
                modelId: updateRequest.modelId,
                modelType: model.modelType
            });

            // Get update handler
            const updateHandler = this.updateHandlers.get(model.modelType);
            if (!updateHandler) {
                throw new Error(`No update handler for model type: ${model.modelType}`);
            }

            // Execute update
            const result = await updateHandler(model, updateRequest);
            
            // Update model
            model.completeUpdate(true, result.performance, result.version);
            updateRequest.status = 'completed';
            
            const duration = performance.now() - startTime;
            updateRequest.actualDuration = duration;
            
            // Update statistics
            this.stats.updatesCompleted++;
            this.updateAverageUpdateTime(duration);
            
            this.emit('update-completed', {
                updateId: updateRequest.id,
                modelId: updateRequest.modelId,
                duration,
                performance: result.performance
            });

            logger.info('Model update completed', {
                updateId: updateRequest.id,
                modelId: updateRequest.modelId,
                duration,
                newVersion: result.version
            });

        } catch (error) {
            model.completeUpdate(false);
            updateRequest.status = 'failed';
            updateRequest.error = error.message;
            
            this.stats.updatesFailed++;
            
            this.emit('update-failed', {
                updateId: updateRequest.id,
                modelId: updateRequest.modelId,
                error: error.message
            });

            logger.error('Model update failed', {
                updateId: updateRequest.id,
                modelId: updateRequest.modelId,
                error: error.message
            });
        } finally {
            this.activeUpdates.delete(updateRequest.id);
            this.updateHistory.push(updateRequest.toJSON());
            
            // Keep only recent history
            if (this.updateHistory.length > 1000) {
                this.updateHistory = this.updateHistory.slice(-500);
            }
            
            // Process next in queue
            this.processUpdateQueue();
        }
    }

    /**
     * Register update handler for model type
     */
    registerUpdateHandler(modelType, handlerFunction) {
        this.updateHandlers.set(modelType, handlerFunction);
        logger.debug('Update handler registered', { modelType });
    }

    /**
     * Default update handlers for different model types
     */
    async performancePredictionUpdate(model, updateRequest) {
        // Simulate performance prediction model update
        await this.simulateTraining(2000); // 2 second training simulation
        
        return {
            performance: {
                accuracy: Math.min(0.95, model.performance.accuracy + 0.01),
                meanSquaredError: Math.max(0.01, model.performance.meanSquaredError - 0.001),
                trainingTime: 2000
            },
            version: this.incrementVersion(model.version)
        };
    }

    async tacticalAnalysisUpdate(model, updateRequest) {
        // Simulate tactical analysis model update
        await this.simulateTraining(3000); // 3 second training simulation
        
        return {
            performance: {
                precision: Math.min(0.92, model.performance.precision + 0.02),
                recall: Math.min(0.90, model.performance.recall + 0.015),
                f1Score: Math.min(0.91, model.performance.f1Score + 0.01),
                trainingTime: 3000
            },
            version: this.incrementVersion(model.version)
        };
    }

    async weatherImpactUpdate(model, updateRequest) {
        // Simulate weather impact model update
        await this.simulateTraining(1500); // 1.5 second training simulation
        
        return {
            performance: {
                accuracy: Math.min(0.88, model.performance.accuracy + 0.015),
                rSquared: Math.min(0.85, model.performance.rSquared + 0.01),
                trainingTime: 1500
            },
            version: this.incrementVersion(model.version)
        };
    }

    async teamOptimizationUpdate(model, updateRequest) {
        // Simulate team optimization model update
        await this.simulateTraining(4000); // 4 second training simulation
        
        return {
            performance: {
                accuracy: Math.min(0.93, model.performance.accuracy + 0.02),
                precision: Math.min(0.89, model.performance.precision + 0.01),
                trainingTime: 4000
            },
            version: this.incrementVersion(model.version)
        };
    }

    async fatigueModelingUpdate(model, updateRequest) {
        // Simulate fatigue modeling update
        await this.simulateTraining(2500); // 2.5 second training simulation
        
        return {
            performance: {
                accuracy: Math.min(0.87, model.performance.accuracy + 0.01),
                meanSquaredError: Math.max(0.05, model.performance.meanSquaredError - 0.002),
                trainingTime: 2500
            },
            version: this.incrementVersion(model.version)
        };
    }

    async routeStrategyUpdate(model, updateRequest) {
        // Simulate route strategy model update
        await this.simulateTraining(3500); // 3.5 second training simulation
        
        return {
            performance: {
                accuracy: Math.min(0.90, model.performance.accuracy + 0.015),
                precision: Math.min(0.86, model.performance.precision + 0.02),
                trainingTime: 3500
            },
            version: this.incrementVersion(model.version)
        };
    }

    /**
     * Simulate training process
     */
    async simulateTraining(duration) {
        return new Promise(resolve => setTimeout(resolve, duration));
    }

    /**
     * Increment model version
     */
    incrementVersion(currentVersion) {
        const parts = currentVersion.split('.');
        const patch = parseInt(parts[2] || '0') + 1;
        return `${parts[0]}.${parts[1]}.${patch}`;
    }

    /**
     * Wait for all active updates to complete
     */
    async waitForActiveUpdates(timeout = 300000) { // 5 minutes
        const startTime = Date.now();
        
        while (this.activeUpdates.size > 0 && Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (this.activeUpdates.size > 0) {
            logger.warn('Timeout waiting for active updates to complete', {
                remainingUpdates: this.activeUpdates.size
            });
        }
    }

    /**
     * Update average update time statistic
     */
    updateAverageUpdateTime(duration) {
        const alpha = 0.1;
        this.stats.averageUpdateTime = 
            this.stats.averageUpdateTime * (1 - alpha) + duration * alpha;
    }

    /**
     * Get model information
     */
    getModel(modelId) {
        const model = this.models.get(modelId);
        return model ? model.toJSON() : null;
    }

    /**
     * Get all registered models
     */
    getAllModels() {
        return Array.from(this.models.values()).map(model => model.toJSON());
    }

    /**
     * Get update queue status
     */
    getUpdateQueue() {
        return {
            queue: this.updateQueue.map(req => req.toJSON()),
            activeUpdates: Array.from(this.activeUpdates.values()).map(req => req.toJSON()),
            queueLength: this.updateQueue.length,
            activeCount: this.activeUpdates.size
        };
    }

    /**
     * Get update history
     */
    getUpdateHistory(limit = 50) {
        return this.updateHistory
            .slice(-limit)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    /**
     * Get system statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeModels: this.models.size,
            queueLength: this.updateQueue.length,
            activeUpdates: this.activeUpdates.size,
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
                registeredModels: this.models.size,
                queueLength: this.updateQueue.length,
                activeUpdates: this.activeUpdates.size
            },
            performance: {
                averageUpdateTime: this.stats.averageUpdateTime,
                successRate: this.stats.updatesTriggered > 0 ? 
                    this.stats.updatesCompleted / this.stats.updatesTriggered : 1,
                queueUtilization: this.updateQueue.length / this.options.updateQueueSize
            },
            models: {
                totalModels: this.models.size,
                modelsNeedingUpdate: Array.from(this.models.values()).filter(m => m.needsUpdate()).length,
                averageModelHealth: this.models.size > 0 ? 
                    Array.from(this.models.values()).reduce((sum, m) => sum + m.getHealthScore(), 0) / this.models.size : 1
            },
            stats: this.getStats()
        };

        // Determine health status
        if (!this.isRunning) {
            health.status = 'stopped';
        } else if (health.performance.successRate < 0.8) {
            health.status = 'degraded';
        } else if (health.performance.queueUtilization > 0.9) {
            health.status = 'degraded';
        } else if (health.models.averageModelHealth < 0.7) {
            health.status = 'degraded';
        }

        return health;
    }
}

module.exports = { 
    AIModelUpdateTrigger, 
    AIModel, 
    UpdateRequest, 
    ModelType, 
    TriggerCondition, 
    UpdatePriority 
};