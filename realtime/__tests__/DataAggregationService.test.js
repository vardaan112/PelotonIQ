/**
 * Comprehensive test suite for Data Aggregation & Conflict Resolution Service
 */

const { DataAggregationService, DataSource, AggregatedDataPoint } = require('../DataAggregationService');

describe('DataSource', () => {
    test('should create data source with default values', () => {
        const source = new DataSource('test-source');
        
        expect(source.sourceId).toBe('test-source');
        expect(source.name).toBe('test-source');
        expect(source.reliability).toBe(0.8);
        expect(source.priority).toBe(5);
        expect(source.isActive).toBe(true);
    });

    test('should create data source with custom config', () => {
        const config = {
            name: 'GPS Sensor',
            type: 'sensor',
            priority: 9,
            reliability: 0.95,
            latency: 500,
            accuracy: 0.98
        };
        
        const source = new DataSource('gps-1', config);
        
        expect(source.name).toBe('GPS Sensor');
        expect(source.type).toBe('sensor');
        expect(source.priority).toBe(9);
        expect(source.reliability).toBe(0.95);
        expect(source.accuracy).toBe(0.98);
    });

    test('should update statistics correctly', () => {
        const source = new DataSource('test-source');
        const initialErrorRate = source.stats.errorRate;
        
        source.updateStats(1000, false, true); // Error occurred
        
        expect(source.stats.messagesReceived).toBe(1);
        expect(source.stats.errorRate).toBeGreaterThan(initialErrorRate);
        expect(source.stats.lastUpdateTime).toBeInstanceOf(Date);
    });

    test('should calculate trust score correctly', () => {
        const source = new DataSource('test-source', { priority: 10, reliability: 0.9 });
        source.stats.lastUpdateTime = new Date();
        
        const trustScore = source.getTrustScore();
        
        expect(trustScore).toBeGreaterThan(0);
        expect(trustScore).toBeLessThanOrEqual(1);
    });

    test('should decrease trust score for old data', () => {
        const source = new DataSource('test-source', { priority: 10, reliability: 0.9 });
        
        // Set old update time
        source.stats.lastUpdateTime = new Date(Date.now() - 30000); // 30 seconds ago
        const oldTrustScore = source.getTrustScore();
        
        // Set recent update time
        source.stats.lastUpdateTime = new Date();
        const newTrustScore = source.getTrustScore();
        
        expect(newTrustScore).toBeGreaterThan(oldTrustScore);
    });
});

describe('AggregatedDataPoint', () => {
    test('should create aggregated data point', () => {
        const timestamp = new Date();
        const dataPoint = new AggregatedDataPoint('position:rider-1', timestamp);
        
        expect(dataPoint.key).toBe('position:rider-1');
        expect(dataPoint.timestamp).toBe(timestamp);
        expect(dataPoint.sources.size).toBe(0);
        expect(dataPoint.conflictLevel).toBe('none');
    });

    test('should add source data', () => {
        const dataPoint = new AggregatedDataPoint('position:rider-1', new Date());
        const timestamp = new Date();
        const value = { lat: 43.6047, lng: 1.4442 };
        
        dataPoint.addSourceData('gps-1', value, timestamp, { accuracy: 0.95 });
        
        expect(dataPoint.sources.size).toBe(1);
        expect(dataPoint.sources.get('gps-1').value).toEqual(value);
        expect(dataPoint.sources.get('gps-1').timestamp).toBe(timestamp);
    });

    test('should detect numeric conflicts', () => {
        const dataPoint = new AggregatedDataPoint('speed:rider-1', new Date());
        
        dataPoint.addSourceData('sensor-1', 45.0, new Date());
        dataPoint.addSourceData('sensor-2', 45.2, new Date());
        dataPoint.addSourceData('sensor-3', 55.0, new Date()); // More conflicting value
        
        expect(dataPoint.hasConflict(0.05)).toBe(true);
    });

    test('should detect non-numeric conflicts', () => {
        const dataPoint = new AggregatedDataPoint('weather:location-1', new Date());
        
        dataPoint.addSourceData('weather-1', 'sunny', new Date());
        dataPoint.addSourceData('weather-2', 'cloudy', new Date()); // Conflicting value
        
        expect(dataPoint.hasConflict()).toBe(true);
    });

    test('should not detect conflicts for similar values', () => {
        const dataPoint = new AggregatedDataPoint('speed:rider-1', new Date());
        
        dataPoint.addSourceData('sensor-1', 45.0, new Date());
        dataPoint.addSourceData('sensor-2', 45.1, new Date());
        dataPoint.addSourceData('sensor-3', 45.2, new Date());
        
        expect(dataPoint.hasConflict(0.05)).toBe(false);
    });
});

describe('DataAggregationService', () => {
    let service;

    beforeEach(() => {
        service = new DataAggregationService({
            aggregationWindow: 100,
            maxDataAge: 1000,
            conflictThreshold: 0.05
        });
    });

    afterEach(async () => {
        if (service.isRunning) {
            await service.stop();
        }
    });

    test('should initialize service correctly', () => {
        expect(service.isRunning).toBe(false);
        expect(service.dataSources.size).toBe(0);
        expect(service.aggregationBuffer.size).toBe(0);
        expect(service.resolutionStrategies.size).toBeGreaterThan(0);
    });

    test('should start and stop service', async () => {
        expect(service.isRunning).toBe(false);
        
        await service.start();
        expect(service.isRunning).toBe(true);
        expect(service.aggregationTimer).toBeDefined();
        
        await service.stop();
        expect(service.isRunning).toBe(false);
        expect(service.aggregationTimer).toBeNull();
    });

    test('should register and unregister data sources', () => {
        const config = { name: 'GPS Sensor', priority: 8, reliability: 0.9 };
        
        const source = service.registerSource('gps-1', config);
        
        expect(source).toBeInstanceOf(DataSource);
        expect(service.dataSources.size).toBe(1);
        expect(service.stats.sourcesActive).toBe(1);
        
        service.unregisterSource('gps-1');
        
        expect(service.dataSources.size).toBe(0);
        expect(service.stats.sourcesActive).toBe(0);
    });

    test('should ingest data from registered sources', () => {
        service.registerSource('gps-1', { priority: 8 });
        
        const mockEmit = jest.fn();
        service.emit = mockEmit;
        
        service.ingestData('gps-1', 'position', 'rider-1', 
            { lat: 43.6047, lng: 1.4442 }, new Date());
        
        expect(service.aggregationBuffer.size).toBe(1);
        expect(service.stats.totalDataPoints).toBe(1);
        expect(mockEmit).toHaveBeenCalledWith('data-ingested', expect.any(Object));
    });

    test('should reject data from unregistered sources', () => {
        service.ingestData('unknown-source', 'position', 'rider-1', 
            { lat: 43.6047, lng: 1.4442 }, new Date());
        
        expect(service.aggregationBuffer.size).toBe(0);
        expect(service.stats.totalDataPoints).toBe(0);
    });

    test('should detect conflicts during ingestion', () => {
        service.registerSource('sensor-1', { priority: 8 });
        service.registerSource('sensor-2', { priority: 7 });
        
        const mockEmit = jest.fn();
        service.emit = mockEmit;
        
        // Add conflicting data
        service.ingestData('sensor-1', 'speed', 'rider-1', 45.0, new Date());
        service.ingestData('sensor-2', 'speed', 'rider-1', 55.0, new Date());
        
        expect(mockEmit).toHaveBeenCalledWith('conflict-detected', expect.any(Object));
        expect(service.stats.conflictsDetected).toBe(1);
    });

    test('should process aggregation buffer', async () => {
        await service.start();
        
        service.registerSource('sensor-1', { priority: 8 });
        service.registerSource('sensor-2', { priority: 7 });
        
        // Add data that should be aggregated
        service.ingestData('sensor-1', 'speed', 'rider-1', 45.0, new Date());
        service.ingestData('sensor-2', 'speed', 'rider-1', 46.0, new Date());
        
        // Wait for aggregation window
        await new Promise(resolve => setTimeout(resolve, 150));
        
        expect(service.resolvedData.size).toBe(1);
        const resolved = service.getResolvedData('speed:rider-1');
        expect(resolved).toBeDefined();
        expect(resolved.resolvedValue).toBeCloseTo(45.5, 1); // Weighted average
    });

    describe('Resolution Strategies', () => {
        beforeEach(() => {
            service.registerSource('high-priority', { priority: 10, reliability: 0.9 });
            service.registerSource('medium-priority', { priority: 5, reliability: 0.8 });
            service.registerSource('low-priority', { priority: 2, reliability: 0.7 });
        });

        test('weighted average resolution', () => {
            const dataPoint = new AggregatedDataPoint('test:key', new Date());
            dataPoint.addSourceData('high-priority', 100, new Date());
            dataPoint.addSourceData('medium-priority', 80, new Date());
            dataPoint.addSourceData('low-priority', 60, new Date());
            
            const result = service.weightedAverageResolution(dataPoint);
            
            expect(result).toBeDefined();
            expect(result.value).toBeGreaterThan(80); // Should be weighted toward higher priority
            expect(result.confidence).toBeGreaterThan(0);
        });

        test('highest priority resolution', () => {
            const dataPoint = new AggregatedDataPoint('test:key', new Date());
            dataPoint.addSourceData('high-priority', 100, new Date());
            dataPoint.addSourceData('medium-priority', 80, new Date());
            dataPoint.addSourceData('low-priority', 60, new Date());
            
            const result = service.highestPriorityResolution(dataPoint);
            
            expect(result).toBeDefined();
            expect(result.value).toBe(100); // Should pick highest priority value
            expect(result.confidence).toBeCloseTo(0.9, 1);
        });

        test('majority vote resolution', () => {
            const dataPoint = new AggregatedDataPoint('test:key', new Date());
            dataPoint.addSourceData('high-priority', 'sunny', new Date());
            dataPoint.addSourceData('medium-priority', 'sunny', new Date());
            dataPoint.addSourceData('low-priority', 'cloudy', new Date());
            
            const result = service.majorityVoteResolution(dataPoint);
            
            expect(result).toBeDefined();
            expect(result.value).toBe('sunny'); // Majority value
            expect(result.confidence).toBeGreaterThan(0);
        });

        test('temporal priority resolution', () => {
            const oldTime = new Date(Date.now() - 5000);
            const newTime = new Date();
            
            const dataPoint = new AggregatedDataPoint('test:key', new Date());
            dataPoint.addSourceData('source-1', 'old-value', oldTime);
            dataPoint.addSourceData('source-2', 'new-value', newTime);
            
            const result = service.temporalPriorityResolution(dataPoint);
            
            expect(result).toBeDefined();
            expect(result.value).toBe('new-value'); // Most recent value
            expect(result.confidence).toBeGreaterThan(0);
        });

        test('source reliability resolution', () => {
            const dataPoint = new AggregatedDataPoint('test:key', new Date());
            dataPoint.addSourceData('high-priority', 'reliable-value', new Date());
            dataPoint.addSourceData('medium-priority', 'medium-value', new Date());
            dataPoint.addSourceData('low-priority', 'unreliable-value', new Date());
            
            const result = service.sourceReliabilityResolution(dataPoint);
            
            expect(result).toBeDefined();
            expect(result.value).toBe('reliable-value'); // Most reliable source
            expect(result.confidence).toBeGreaterThan(0.8);
        });
    });

    test('should calculate conflict levels correctly', () => {
        const service = new DataAggregationService();
        
        // High conflict - larger variance
        const highConflictPoint = new AggregatedDataPoint('test:key', new Date());
        highConflictPoint.addSourceData('s1', 100, new Date());
        highConflictPoint.addSourceData('s2', 200, new Date());
        expect(service.calculateConflictLevel(highConflictPoint)).toBe('high');
        
        // Medium conflict
        const mediumConflictPoint = new AggregatedDataPoint('test:key', new Date());
        mediumConflictPoint.addSourceData('s1', 100, new Date());
        mediumConflictPoint.addSourceData('s2', 120, new Date());
        expect(service.calculateConflictLevel(mediumConflictPoint)).toBe('medium');
        
        // Low conflict
        const lowConflictPoint = new AggregatedDataPoint('test:key', new Date());
        lowConflictPoint.addSourceData('s1', 100, new Date());
        lowConflictPoint.addSourceData('s2', 107, new Date());
        expect(service.calculateConflictLevel(lowConflictPoint)).toBe('low');
        
        // No conflict
        const noConflictPoint = new AggregatedDataPoint('test:key', new Date());
        noConflictPoint.addSourceData('s1', 100, new Date());
        noConflictPoint.addSourceData('s2', 100.1, new Date());
        expect(service.calculateConflictLevel(noConflictPoint)).toBe('none');
    });

    test('should perform health checks', () => {
        const source1 = service.registerSource('active-source', { priority: 8 });
        const source2 = service.registerSource('inactive-source', { priority: 6 });
        
        // Simulate active source
        source1.stats.lastUpdateTime = new Date();
        
        // Simulate inactive source
        source2.stats.lastUpdateTime = new Date(Date.now() - 35000); // 35 seconds ago
        
        service.performHealthChecks();
        
        expect(source1.isActive).toBe(true);
        expect(source2.isActive).toBe(false);
        expect(service.stats.sourcesActive).toBe(1);
    });

    test('should calculate data quality score', () => {
        service.registerSource('good-source', { reliability: 0.9 });
        service.registerSource('bad-source', { reliability: 0.5 });
        
        service.calculateDataQualityScore();
        
        expect(service.stats.dataQualityScore).toBeGreaterThan(0);
        expect(service.stats.dataQualityScore).toBeLessThanOrEqual(1);
    });

    test('should handle edge cases', () => {
        // Test with no sources
        expect(service.getResolvedData('nonexistent')).toBeUndefined();
        expect(service.getAllDataSources()).toEqual([]);
        
        // Test with empty aggregation
        const emptyPoint = new AggregatedDataPoint('empty:key', new Date());
        const result = service.resolveDataPoint(emptyPoint);
        expect(result).toBeNull();
    });

    test('should provide comprehensive statistics', () => {
        service.registerSource('test-source', { priority: 8 });
        service.ingestData('test-source', 'position', 'rider-1', 
            { lat: 43.6047, lng: 1.4442 }, new Date());
        
        const stats = service.getStats();
        
        expect(stats).toHaveProperty('totalDataPoints');
        expect(stats).toHaveProperty('conflictsDetected');
        expect(stats).toHaveProperty('sourcesActive');
        expect(stats).toHaveProperty('dataQualityScore');
        expect(stats).toHaveProperty('bufferSize');
        expect(stats).toHaveProperty('isRunning');
    });

    test('should perform health check', async () => {
        await service.start();
        service.registerSource('test-source', { priority: 8, reliability: 0.9 });
        
        const health = await service.healthCheck();
        
        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('service');
        expect(health).toHaveProperty('sources');
        expect(health).toHaveProperty('performance');
        expect(['healthy', 'degraded']).toContain(health.status);
    });

    test('should handle performance stress test', async () => {
        await service.start();
        
        // Register multiple sources
        for (let i = 0; i < 10; i++) {
            service.registerSource(`source-${i}`, { priority: i + 1, reliability: 0.8 + i * 0.02 });
        }
        
        // Ingest large amount of data
        const startTime = performance.now();
        for (let i = 0; i < 1000; i++) {
            const sourceId = `source-${i % 10}`;
            service.ingestData(sourceId, 'position', `rider-${i % 20}`, 
                { lat: 43.6047 + Math.random() * 0.1, lng: 1.4442 + Math.random() * 0.1 }, 
                new Date());
        }
        const ingestionTime = performance.now() - startTime;
        
        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 200));
        
        expect(ingestionTime).toBeLessThan(1000); // Should process 1000 points in under 1 second
        expect(service.stats.totalDataPoints).toBe(1000);
        expect(service.resolvedData.size).toBeGreaterThan(0);
        
        const stats = service.getStats();
        expect(stats.averageResolutionTime).toBeGreaterThan(0);
    }, 10000);

    test('should emit all expected events', () => {
        const events = [];
        const originalEmit = service.emit;
        service.emit = function(event, data) {
            events.push({ event, data });
            return originalEmit.call(this, event, data);
        };

        service.registerSource('test-source', { priority: 8 });
        service.ingestData('test-source', 'position', 'rider-1', 
            { lat: 43.6047, lng: 1.4442 }, new Date());
        
        const eventTypes = events.map(e => e.event);
        expect(eventTypes).toContain('source-registered');
        expect(eventTypes).toContain('data-ingested');
    });
});

describe('Integration Tests', () => {
    test('should integrate with real-time components', async () => {
        const service = new DataAggregationService({
            aggregationWindow: 50,
            maxDataAge: 500
        });
        
        await service.start();
        
        // Register sources similar to real-time components
        service.registerSource('position-tracker', { 
            name: 'Position Tracker', 
            type: 'sensor', 
            priority: 9, 
            reliability: 0.95 
        });
        
        service.registerSource('weather-service', { 
            name: 'Weather Service', 
            type: 'api', 
            priority: 7, 
            reliability: 0.85 
        });
        
        service.registerSource('tactical-detector', { 
            name: 'Tactical Event Detector', 
            type: 'ai', 
            priority: 8, 
            reliability: 0.9 
        });
        
        // Simulate real-time data flow
        const raceId = 'tour-de-france-2024';
        const riderId = 'tadej-pogacar';
        
        // Position updates
        service.ingestData('position-tracker', 'position', `${raceId}:${riderId}`, {
            lat: 43.6047,
            lng: 1.4442,
            speed: 45.5,
            altitude: 150
        }, new Date());
        
        // Weather updates
        service.ingestData('weather-service', 'weather', raceId, {
            temperature: 24,
            windSpeed: 15,
            conditions: 'partly_cloudy'
        }, new Date());
        
        // Tactical events
        service.ingestData('tactical-detector', 'tactical_event', `${raceId}:attack:${riderId}`, {
            eventType: 'attack',
            confidence: 0.85,
            timeGap: 5
        }, new Date());
        
        // Wait for aggregation
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const resolvedData = service.getAllResolvedData();
        const stats = service.getStats();
        
        expect(Object.keys(resolvedData).length).toBeGreaterThan(0);
        expect(stats.totalDataPoints).toBe(3);
        expect(stats.sourcesActive).toBe(3);
        expect(stats.dataQualityScore).toBeGreaterThan(0.8);
        
        await service.stop();
    });
});