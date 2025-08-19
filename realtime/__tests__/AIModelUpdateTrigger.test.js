/**
 * Comprehensive test suite for AI Model Update Trigger System
 */

const { 
    AIModelUpdateTrigger, 
    AIModel, 
    UpdateRequest, 
    ModelType, 
    TriggerCondition, 
    UpdatePriority 
} = require('../AIModelUpdateTrigger');

describe('AIModel', () => {
    test('should create AI model with default values', () => {
        const model = new AIModel('test-model');
        
        expect(model.modelId).toBe('test-model');
        expect(model.modelType).toBe(ModelType.PERFORMANCE_PREDICTION);
        expect(model.version).toBe('1.0.0');
        expect(model.status).toBe('active');
        expect(model.dataCount).toBe(0);
        expect(model.isUpdating).toBe(false);
    });

    test('should create AI model with custom config', () => {
        const config = {
            modelType: ModelType.TACTICAL_ANALYSIS,
            version: '2.1.3',
            framework: 'pytorch',
            accuracy: 0.85,
            dataThreshold: 500,
            timeInterval: 43200000 // 12 hours
        };
        
        const model = new AIModel('tactical-model', config);
        
        expect(model.modelType).toBe(ModelType.TACTICAL_ANALYSIS);
        expect(model.version).toBe('2.1.3');
        expect(model.config.framework).toBe('pytorch');
        expect(model.performance.accuracy).toBe(0.85);
        expect(model.updateTriggers.dataThreshold).toBe(500);
        expect(model.updateTriggers.timeInterval).toBe(43200000);
    });

    test('should detect need for update based on data threshold', () => {
        const model = new AIModel('test-model', { dataThreshold: 100 });
        
        expect(model.needsUpdate()).toBe(false);
        
        model.addTrainingData(Array(50).fill({}));
        expect(model.needsUpdate()).toBe(false);
        
        model.addTrainingData(Array(60).fill({}));
        expect(model.needsUpdate()).toBe(true);
        expect(model.dataCount).toBe(110);
    });

    test('should detect need for update based on time interval', () => {
        const model = new AIModel('test-model', { 
            timeInterval: 1000, // 1 second
            minUpdateInterval: 500 // 0.5 second
        });
        
        // Set last update to past
        model.lastUpdated = new Date(Date.now() - 2000); // 2 seconds ago
        
        expect(model.needsUpdate()).toBe(true);
    });

    test('should detect need for update based on performance drift', () => {
        const model = new AIModel('test-model', { 
            performanceDriftThreshold: 0.1,
            minUpdateInterval: 0
        });
        
        model.performance.accuracy = 0.8;
        model.lastPredictionAccuracy = 0.95; // 15% drop
        
        expect(model.needsUpdate()).toBe(true);
    });

    test('should respect minimum update interval', () => {
        const model = new AIModel('test-model', { 
            dataThreshold: 10,
            minUpdateInterval: 10000 // 10 seconds
        });
        
        model.addTrainingData(Array(20).fill({}));
        model.lastUpdated = new Date(Date.now() - 5000); // 5 seconds ago
        
        expect(model.needsUpdate()).toBe(false);
    });

    test('should not update when auto-update disabled', () => {
        const model = new AIModel('test-model', { 
            enableAutoUpdate: false,
            dataThreshold: 10
        });
        
        model.addTrainingData(Array(20).fill({}));
        
        expect(model.needsUpdate()).toBe(false);
    });

    test('should not update when already updating', () => {
        const model = new AIModel('test-model', { dataThreshold: 10 });
        
        model.addTrainingData(Array(20).fill({}));
        model.isUpdating = true;
        
        expect(model.needsUpdate()).toBe(false);
    });

    test('should record prediction performance', () => {
        const model = new AIModel('test-model');
        
        model.recordPrediction(100, 95, 50); // 5% error, 50ms latency
        
        expect(model.stats.totalPredictions).toBe(1);
        expect(model.stats.averagePredictionTime).toBe(50);
        expect(model.performance.accuracy).toBeGreaterThan(0.9);
    });

    test('should handle update lifecycle', () => {
        const model = new AIModel('test-model');
        
        model.startUpdate();
        expect(model.isUpdating).toBe(true);
        expect(model.status).toBe('updating');
        expect(model.stats.totalUpdates).toBe(1);
        
        model.completeUpdate(true, { accuracy: 0.95 }, '1.0.1');
        expect(model.isUpdating).toBe(false);
        expect(model.status).toBe('active');
        expect(model.version).toBe('1.0.1');
        expect(model.performance.accuracy).toBe(0.95);
        expect(model.stats.successfulUpdates).toBe(1);
        expect(model.dataCount).toBe(0); // Reset after update
        
        model.startUpdate();
        model.completeUpdate(false);
        expect(model.status).toBe('failed');
        expect(model.stats.failedUpdates).toBe(1);
    });

    test('should calculate health score', () => {
        const model = new AIModel('test-model', { accuracy: 0.9 });
        
        const healthScore = model.getHealthScore();
        
        expect(healthScore).toBeGreaterThan(0);
        expect(healthScore).toBeLessThanOrEqual(1);
    });

    test('should handle dependencies', () => {
        const model = new AIModel('dependent-model', {
            dependencies: ['base-model-1', 'base-model-2']
        });
        
        expect(model.dependencies).toEqual(['base-model-1', 'base-model-2']);
        expect(model.dependents.size).toBe(0);
        
        model.dependents.add('child-model-1');
        expect(model.dependents.has('child-model-1')).toBe(true);
    });
});

describe('UpdateRequest', () => {
    test('should create update request with required fields', () => {
        const request = new UpdateRequest('model-1', TriggerCondition.DATA_THRESHOLD);
        
        expect(request.modelId).toBe('model-1');
        expect(request.triggerCondition).toBe(TriggerCondition.DATA_THRESHOLD);
        expect(request.priority).toBe(UpdatePriority.NORMAL);
        expect(request.status).toBe('pending');
        expect(request.id).toMatch(/^update_/);
    });

    test('should create update request with all fields', () => {
        const context = { reason: 'Manual trigger', estimatedDuration: 5000 };
        const request = new UpdateRequest('model-1', TriggerCondition.MANUAL_REQUEST, UpdatePriority.HIGH, context);
        
        expect(request.priority).toBe(UpdatePriority.HIGH);
        expect(request.context.reason).toBe('Manual trigger');
        expect(request.estimatedDuration).toBe(5000);
    });
});

describe('AIModelUpdateTrigger', () => {
    let trigger;

    beforeEach(() => {
        trigger = new AIModelUpdateTrigger({
            maxConcurrentUpdates: 2,
            updateQueueSize: 10,
            checkInterval: 1000,
            retryAttempts: 2
        });
    });

    afterEach(async () => {
        if (trigger.isRunning) {
            await trigger.stop();
        }
    });

    test('should initialize system correctly', () => {
        expect(trigger.isRunning).toBe(false);
        expect(trigger.models.size).toBe(0);
        expect(trigger.updateQueue.length).toBe(0);
        expect(trigger.activeUpdates.size).toBe(0);
        expect(trigger.updateHandlers.size).toBeGreaterThan(0);
    });

    test('should start and stop system', async () => {
        expect(trigger.isRunning).toBe(false);
        
        await trigger.start();
        expect(trigger.isRunning).toBe(true);
        expect(trigger.checkTimer).toBeDefined();
        
        await trigger.stop();
        expect(trigger.isRunning).toBe(false);
        expect(trigger.checkTimer).toBeNull();
    });

    test('should register and unregister models', () => {
        const config = { 
            modelType: ModelType.TACTICAL_ANALYSIS, 
            version: '1.2.0',
            accuracy: 0.85
        };
        
        const model = trigger.registerModel('tactical-model', config);
        
        expect(model).toBeInstanceOf(AIModel);
        expect(trigger.models.size).toBe(1);
        expect(trigger.stats.totalModels).toBe(1);
        expect(trigger.stats.activeModels).toBe(1);
        
        trigger.unregisterModel('tactical-model');
        
        expect(trigger.models.size).toBe(0);
        expect(trigger.stats.activeModels).toBe(0);
    });

    test('should prevent duplicate model registration', () => {
        const model1 = trigger.registerModel('model-1');
        const model2 = trigger.registerModel('model-1');
        
        expect(model1).toBe(model2);
        expect(trigger.models.size).toBe(1);
    });

    test('should add training data to models', () => {
        trigger.registerModel('model-1', { dataThreshold: 100 });
        
        const mockEmit = jest.fn();
        trigger.emit = mockEmit;
        
        trigger.addTrainingData('model-1', Array(50).fill({}));
        
        const model = trigger.models.get('model-1');
        expect(model.dataCount).toBe(50);
        expect(mockEmit).toHaveBeenCalledWith('training-data-added', expect.any(Object));
    });

    test('should auto-trigger update when data threshold reached', () => {
        trigger.registerModel('model-1', { dataThreshold: 50 });
        
        const mockEmit = jest.fn();
        trigger.emit = mockEmit;
        
        trigger.addTrainingData('model-1', Array(60).fill({}), false);
        
        expect(trigger.updateQueue.length).toBe(1);
        expect(trigger.updateQueue[0].triggerCondition).toBe(TriggerCondition.DATA_THRESHOLD);
        expect(mockEmit).toHaveBeenCalledWith('update-triggered', expect.any(Object));
    });

    test('should record prediction and trigger on performance drift', () => {
        const model = trigger.registerModel('model-1', { 
            performanceDriftThreshold: 0.1,
            minUpdateInterval: 0
        });
        
        model.lastPredictionAccuracy = 0.9;
        
        trigger.recordPrediction('model-1', 100, 70, 50); // Poor prediction
        
        expect(trigger.updateQueue.length).toBe(1);
        expect(trigger.updateQueue[0].triggerCondition).toBe(TriggerCondition.PERFORMANCE_DRIFT);
        expect(trigger.updateQueue[0].priority).toBe(UpdatePriority.HIGH);
    });

    test('should manually trigger updates', () => {
        trigger.registerModel('model-1');
        
        const updateRequest = trigger.triggerUpdate('model-1', TriggerCondition.MANUAL_REQUEST, UpdatePriority.URGENT);
        
        expect(updateRequest).toBeInstanceOf(UpdateRequest);
        expect(trigger.updateQueue.length).toBe(1);
        expect(trigger.stats.updatesTriggered).toBe(1);
    });

    test('should handle queue size limit', () => {
        const limitedTrigger = new AIModelUpdateTrigger({ updateQueueSize: 2 });
        limitedTrigger.registerModel('model-1');
        
        limitedTrigger.triggerUpdate('model-1', TriggerCondition.MANUAL_REQUEST);
        limitedTrigger.triggerUpdate('model-1', TriggerCondition.MANUAL_REQUEST);
        
        expect(() => {
            limitedTrigger.triggerUpdate('model-1', TriggerCondition.MANUAL_REQUEST);
        }).toThrow('Update queue is full');
    });

    test('should prioritize updates correctly', () => {
        trigger.registerModel('model-1');
        
        trigger.triggerUpdate('model-1', TriggerCondition.MANUAL_REQUEST, UpdatePriority.LOW);
        trigger.triggerUpdate('model-1', TriggerCondition.MANUAL_REQUEST, UpdatePriority.CRITICAL);
        trigger.triggerUpdate('model-1', TriggerCondition.MANUAL_REQUEST, UpdatePriority.NORMAL);
        
        expect(trigger.updateQueue[0].priority).toBe(UpdatePriority.CRITICAL);
        expect(trigger.updateQueue[1].priority).toBe(UpdatePriority.NORMAL);
        expect(trigger.updateQueue[2].priority).toBe(UpdatePriority.LOW);
    });

    test('should process updates with different model types', async () => {
        await trigger.start();
        
        const models = [
            { id: 'perf-model', type: ModelType.PERFORMANCE_PREDICTION },
            { id: 'tactical-model', type: ModelType.TACTICAL_ANALYSIS },
            { id: 'weather-model', type: ModelType.WEATHER_IMPACT },
            { id: 'team-model', type: ModelType.TEAM_OPTIMIZATION },
            { id: 'fatigue-model', type: ModelType.FATIGUE_MODELING },
            { id: 'route-model', type: ModelType.ROUTE_STRATEGY }
        ];
        
        models.forEach(({ id, type }) => {
            trigger.registerModel(id, { modelType: type });
        });
        
        const updatePromises = models.map(({ id }) => 
            trigger.triggerUpdate(id, TriggerCondition.MANUAL_REQUEST));
        
        // Wait for updates to process
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        expect(trigger.stats.updatesTriggered).toBe(6);
        expect(trigger.stats.updatesCompleted).toBeGreaterThan(0);
    }, 10000);

    test('should handle update failures gracefully', async () => {
        await trigger.start();
        
        // Override update handler to simulate failure
        trigger.registerUpdateHandler(ModelType.PERFORMANCE_PREDICTION, async () => {
            throw new Error('Simulated training failure');
        });
        
        trigger.registerModel('failing-model', { modelType: ModelType.PERFORMANCE_PREDICTION });
        
        const mockEmit = jest.fn();
        trigger.emit = mockEmit;
        
        trigger.triggerUpdate('failing-model', TriggerCondition.MANUAL_REQUEST);
        
        // Wait for update to process
        await new Promise(resolve => setTimeout(resolve, 500));
        
        expect(trigger.stats.updatesFailed).toBe(1);
        expect(mockEmit).toHaveBeenCalledWith('update-failed', expect.any(Object));
        
        const model = trigger.models.get('failing-model');
        expect(model.status).toBe('failed');
    });

    test('should respect concurrent update limit', async () => {
        await trigger.start();
        
        // Register models
        for (let i = 0; i < 5; i++) {
            trigger.registerModel(`model-${i}`);
        }
        
        // Trigger multiple updates
        for (let i = 0; i < 5; i++) {
            trigger.triggerUpdate(`model-${i}`, TriggerCondition.MANUAL_REQUEST);
        }
        
        // Should not exceed max concurrent updates
        expect(trigger.activeUpdates.size).toBeLessThanOrEqual(trigger.options.maxConcurrentUpdates);
        expect(trigger.updateQueue.length).toBeGreaterThan(0);
    });

    test('should check for automatic updates', () => {
        // Create models that need updates
        const model1 = trigger.registerModel('model-1', { 
            dataThreshold: 10,
            timeInterval: 1000,
            minUpdateInterval: 0
        });
        const model2 = trigger.registerModel('model-2', { 
            dataThreshold: 20,
            enableAutoUpdate: false
        });
        
        // Set conditions for updates
        model1.addTrainingData(Array(15).fill({}));
        model1.lastUpdated = new Date(Date.now() - 2000); // 2 seconds ago
        
        model2.addTrainingData(Array(25).fill({}));
        
        trigger.checkForUpdates();
        
        expect(trigger.updateQueue.length).toBe(1); // Only model-1 should trigger
        expect(trigger.updateQueue[0].modelId).toBe('model-1');
    });

    test('should register custom update handlers', () => {
        const customHandler = jest.fn();
        
        trigger.registerUpdateHandler('custom_model_type', customHandler);
        
        expect(trigger.updateHandlers.has('custom_model_type')).toBe(true);
        expect(trigger.updateHandlers.get('custom_model_type')).toBe(customHandler);
    });

    test('should provide comprehensive information retrieval', () => {
        trigger.registerModel('model-1', { modelType: ModelType.TACTICAL_ANALYSIS });
        trigger.registerModel('model-2', { modelType: ModelType.WEATHER_IMPACT });
        
        trigger.triggerUpdate('model-1', TriggerCondition.MANUAL_REQUEST);
        
        // Test model retrieval
        const model1 = trigger.getModel('model-1');
        expect(model1).toBeDefined();
        expect(model1.modelType).toBe(ModelType.TACTICAL_ANALYSIS);
        
        const allModels = trigger.getAllModels();
        expect(allModels).toHaveLength(2);
        
        // Test queue status
        const queueStatus = trigger.getUpdateQueue();
        expect(queueStatus.queueLength).toBe(1);
        expect(queueStatus.queue).toHaveLength(1);
        
        // Test statistics
        const stats = trigger.getStats();
        expect(stats).toHaveProperty('totalModels');
        expect(stats).toHaveProperty('activeModels');
        expect(stats).toHaveProperty('updatesTriggered');
        expect(stats.activeModels).toBe(2);
    });

    test('should maintain update history', async () => {
        await trigger.start();
        
        trigger.registerModel('model-1');
        trigger.triggerUpdate('model-1', TriggerCondition.MANUAL_REQUEST);
        
        // Wait for update to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const history = trigger.getUpdateHistory();
        expect(history.length).toBeGreaterThan(0);
        expect(history[0]).toHaveProperty('id');
        expect(history[0]).toHaveProperty('status');
        expect(history[0]).toHaveProperty('actualDuration');
    });

    test('should perform health check', async () => {
        await trigger.start();
        trigger.registerModel('healthy-model', { accuracy: 0.9 });
        trigger.registerModel('unhealthy-model', { accuracy: 0.5 });
        
        const health = await trigger.healthCheck();
        
        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('system');
        expect(health).toHaveProperty('performance');
        expect(health).toHaveProperty('models');
        expect(health.system.isRunning).toBe(true);
        expect(health.system.registeredModels).toBe(2);
        expect(['healthy', 'degraded']).toContain(health.status);
    });

    test('should handle high-load stress test', async () => {
        await trigger.start();
        
        // Register many models
        for (let i = 0; i < 20; i++) {
            trigger.registerModel(`model-${i}`, {
                modelType: i % 2 === 0 ? ModelType.PERFORMANCE_PREDICTION : ModelType.TACTICAL_ANALYSIS
            });
        }
        
        // Trigger many updates
        const startTime = performance.now();
        for (let i = 0; i < 20; i++) {
            trigger.triggerUpdate(`model-${i}`, TriggerCondition.MANUAL_REQUEST, 
                i < 5 ? UpdatePriority.HIGH : UpdatePriority.NORMAL);
        }
        const triggerTime = performance.now() - startTime;
        
        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        expect(triggerTime).toBeLessThan(1000); // Should trigger quickly
        expect(trigger.stats.updatesTriggered).toBe(20);
        expect(trigger.stats.updatesCompleted).toBeGreaterThan(0);
        
        const stats = trigger.getStats();
        expect(stats.averageUpdateTime).toBeGreaterThan(0);
    }, 15000);

    test('should emit all expected events', async () => {
        const events = [];
        const originalEmit = trigger.emit;
        trigger.emit = function(event, data) {
            events.push({ event, data });
            return originalEmit.call(this, event, data);
        };

        await trigger.start();
        trigger.registerModel('test-model');
        trigger.addTrainingData('test-model', [{}]);
        trigger.triggerUpdate('test-model', TriggerCondition.MANUAL_REQUEST);
        
        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 500));
        
        trigger.recordPrediction('test-model', 100, 95, 50);
        await trigger.stop();
        
        const eventTypes = events.map(e => e.event);
        expect(eventTypes).toContain('system-started');
        expect(eventTypes).toContain('model-registered');
        expect(eventTypes).toContain('training-data-added');
        expect(eventTypes).toContain('update-triggered');
        expect(eventTypes).toContain('update-started');
        expect(eventTypes).toContain('update-completed');
        expect(eventTypes).toContain('system-stopped');
    });
});

describe('Integration Tests', () => {
    test('should integrate with other real-time components', async () => {
        const trigger = new AIModelUpdateTrigger();
        await trigger.start();
        
        // Register models for different cycling scenarios
        const models = [
            {
                id: 'performance-predictor',
                type: ModelType.PERFORMANCE_PREDICTION,
                config: { 
                    dataThreshold: 100,
                    inputFeatures: ['power', 'heart_rate', 'speed', 'altitude'],
                    outputTargets: ['finish_time', 'position']
                }
            },
            {
                id: 'tactical-analyzer',
                type: ModelType.TACTICAL_ANALYSIS,
                config: {
                    dataThreshold: 50,
                    inputFeatures: ['position', 'gap', 'gradient', 'weather'],
                    outputTargets: ['attack_probability', 'success_chance']
                }
            },
            {
                id: 'weather-impact',
                type: ModelType.WEATHER_IMPACT,
                config: {
                    dataThreshold: 200,
                    inputFeatures: ['temperature', 'wind_speed', 'humidity', 'precipitation'],
                    outputTargets: ['performance_impact', 'strategy_adjustment']
                }
            }
        ];
        
        models.forEach(({ id, type, config }) => {
            trigger.registerModel(id, { modelType: type, ...config });
        });
        
        // Simulate real-time data flow from other components
        
        // 1. Position updates trigger tactical analysis
        trigger.addTrainingData('tactical-analyzer', [
            { position: 1, gap: 0, gradient: 8.5, weather: 'headwind' },
            { position: 2, gap: 5, gradient: 8.5, weather: 'headwind' },
            { position: 3, gap: 12, gradient: 8.5, weather: 'headwind' }
        ]);
        
        // 2. Weather updates trigger weather impact model
        trigger.addTrainingData('weather-impact', Array(250).fill({
            temperature: 32, windSpeed: 25, humidity: 45, precipitation: 0
        }));
        
        // 3. Performance data triggers prediction model
        trigger.addTrainingData('performance-predictor', Array(120).fill({
            power: 400, heartRate: 175, speed: 45, altitude: 1200
        }));
        
        // 4. Manual strategy update
        trigger.triggerUpdate('tactical-analyzer', TriggerCondition.SIGNIFICANT_EVENT, 
            UpdatePriority.URGENT, { reason: 'Major attack detected' });
        
        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Verify system state
        const stats = trigger.getStats();
        expect(stats.totalModels).toBe(3);
        expect(stats.updatesTriggered).toBeGreaterThan(0);
        
        // Verify models were updated
        const tacticalModel = trigger.getModel('tactical-analyzer');
        const weatherModel = trigger.getModel('weather-impact');
        const performanceModel = trigger.getModel('performance-predictor');
        
        expect(tacticalModel.stats.dataPointsProcessed).toBeGreaterThan(0);
        expect(weatherModel.stats.dataPointsProcessed).toBeGreaterThan(0);
        expect(performanceModel.stats.dataPointsProcessed).toBeGreaterThan(0);
        
        // Test prediction recording
        trigger.recordPrediction('performance-predictor', 3600, 3550, 25); // 3:55 predicted vs 3:60 actual
        trigger.recordPrediction('tactical-analyzer', 0.8, 0.85, 15); // Attack probability
        
        const health = await trigger.healthCheck();
        expect(health.status).toBe('healthy');
        expect(health.models.totalModels).toBe(3);
        
        await trigger.stop();
    }, 10000);
});