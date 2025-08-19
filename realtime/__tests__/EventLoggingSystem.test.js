/**
 * Comprehensive test suite for Event Logging & Historical Analysis System
 */

const { 
    EventLoggingSystem, 
    EventRecord, 
    EventStore, 
    HistoricalAnalyzer, 
    EventCategory, 
    EventSeverity 
} = require('../EventLoggingSystem');

describe('EventRecord', () => {
    test('should create event record with required fields', () => {
        const data = {
            category: EventCategory.RACE_EVENT,
            source: 'test-source',
            eventType: 'test-event',
            title: 'Test Event',
            description: 'This is a test event'
        };
        
        const record = new EventRecord(data);
        
        expect(record.category).toBe(EventCategory.RACE_EVENT);
        expect(record.source).toBe('test-source');
        expect(record.eventType).toBe('test-event');
        expect(record.title).toBe('Test Event');
        expect(record.id).toMatch(/^event_/);
        expect(record.timestamp).toBeInstanceOf(Date);
        expect(record.severity).toBe(EventSeverity.INFO);
    });

    test('should create event record with all fields', () => {
        const data = {
            category: EventCategory.TACTICAL_EVENT,
            source: 'tactical-system',
            eventType: 'attack',
            title: 'Rider Attack',
            description: 'Pogačar attacks on the climb',
            raceId: 'tour-de-france-2024',
            riderId: 'tadej-pogacar',
            teamId: 'uae-team-emirates',
            location: 'Col du Tourmalet',
            severity: EventSeverity.WARN,
            tags: ['attack', 'climb'],
            data: { power: 500, gap: '10 seconds' }
        };
        
        const record = new EventRecord(data);
        
        expect(record.category).toBe(EventCategory.TACTICAL_EVENT);
        expect(record.raceId).toBe('tour-de-france-2024');
        expect(record.riderId).toBe('tadej-pogacar');
        expect(record.teamId).toBe('uae-team-emirates');
        expect(record.location).toBe('Col du Tourmalet');
        expect(record.severity).toBe(EventSeverity.WARN);
        expect(record.tags).toEqual(['attack', 'climb']);
        expect(record.data.power).toBe(500);
    });

    test('should match filter criteria correctly', () => {
        const record = new EventRecord({
            category: EventCategory.RIDER_PERFORMANCE,
            source: 'sensor',
            eventType: 'performance_data',
            title: 'Performance Update',
            raceId: 'tour-de-france-2024',
            riderId: 'jonas-vingegaard',
            severity: EventSeverity.INFO,
            tags: ['performance', 'power']
        });
        
        // Should match category filter
        expect(record.matches({ category: EventCategory.RIDER_PERFORMANCE })).toBe(true);
        expect(record.matches({ category: EventCategory.RACE_EVENT })).toBe(false);
        
        // Should match severity filter
        expect(record.matches({ minSeverity: EventSeverity.TRACE })).toBe(true);
        expect(record.matches({ minSeverity: EventSeverity.WARN })).toBe(false);
        
        // Should match context filters
        expect(record.matches({ raceId: 'tour-de-france-2024' })).toBe(true);
        expect(record.matches({ raceId: 'giro-d-italia-2024' })).toBe(false);
        expect(record.matches({ riderId: 'jonas-vingegaard' })).toBe(true);
        
        // Should match tag filter
        expect(record.matches({ tags: ['performance'] })).toBe(true);
        expect(record.matches({ tags: ['tactics'] })).toBe(false);
    });

    test('should handle time range filters', () => {
        const oldTime = new Date(Date.now() - 10000);
        const newTime = new Date();
        
        const record = new EventRecord({
            category: EventCategory.RACE_EVENT,
            source: 'test',
            eventType: 'test',
            title: 'Test',
            timestamp: oldTime
        });
        
        expect(record.matches({ 
            startTime: new Date(Date.now() - 20000),
            endTime: new Date(Date.now() - 5000)
        })).toBe(true);
        
        expect(record.matches({ 
            startTime: newTime
        })).toBe(false);
    });

    test('should add tags correctly', () => {
        const record = new EventRecord({
            category: EventCategory.RACE_EVENT,
            source: 'test',
            eventType: 'test',
            title: 'Test',
            tags: ['initial']
        });
        
        record.addTag('new-tag');
        record.addTag('initial'); // Should not duplicate
        
        expect(record.tags).toEqual(['initial', 'new-tag']);
    });
});

describe('EventStore', () => {
    let store;

    beforeEach(() => {
        store = new EventStore({
            maxMemoryEvents: 100,
            enablePersistence: false
        });
    });

    test('should store and retrieve events', async () => {
        const record = new EventRecord({
            category: EventCategory.RACE_EVENT,
            source: 'test',
            eventType: 'test',
            title: 'Test Event'
        });
        
        const eventId = await store.storeEvent(record);
        
        expect(eventId).toBe(record.id);
        expect(store.getEvent(eventId)).toBe(record);
        expect(store.stats.totalEvents).toBe(1);
        expect(store.stats.eventsInMemory).toBe(1);
        expect(record.indexed).toBe(true);
    });

    test('should build indexes correctly', async () => {
        const records = [
            new EventRecord({
                category: EventCategory.RACE_EVENT,
                source: 'test',
                eventType: 'start',
                title: 'Race Start',
                raceId: 'tour-de-france-2024'
            }),
            new EventRecord({
                category: EventCategory.TACTICAL_EVENT,
                source: 'test',
                eventType: 'attack',
                title: 'Attack',
                raceId: 'tour-de-france-2024',
                riderId: 'tadej-pogacar'
            })
        ];
        
        for (const record of records) {
            await store.storeEvent(record);
        }
        
        expect(store.indexes.category.has(EventCategory.RACE_EVENT)).toBe(true);
        expect(store.indexes.category.has(EventCategory.TACTICAL_EVENT)).toBe(true);
        expect(store.indexes.raceId.has('tour-de-france-2024')).toBe(true);
        expect(store.indexes.riderId.has('tadej-pogacar')).toBe(true);
    });

    test('should query events with filters', async () => {
        const records = [
            new EventRecord({
                category: EventCategory.RACE_EVENT,
                source: 'test',
                eventType: 'start',
                title: 'Race Start',
                raceId: 'tour-de-france-2024',
                severity: EventSeverity.INFO
            }),
            new EventRecord({
                category: EventCategory.TACTICAL_EVENT,
                source: 'test',
                eventType: 'attack',
                title: 'Attack',
                raceId: 'tour-de-france-2024',
                riderId: 'tadej-pogacar',
                severity: EventSeverity.WARN
            }),
            new EventRecord({
                category: EventCategory.RACE_EVENT,
                source: 'test',
                eventType: 'finish',
                title: 'Race Finish',
                raceId: 'giro-d-italia-2024',
                severity: EventSeverity.INFO
            })
        ];
        
        for (const record of records) {
            await store.storeEvent(record);
        }
        
        // Query by category
        let results = await store.queryEvents({ category: EventCategory.RACE_EVENT });
        expect(results).toHaveLength(2);
        
        // Query by race
        results = await store.queryEvents({ raceId: 'tour-de-france-2024' });
        expect(results).toHaveLength(2);
        
        // Query by rider
        results = await store.queryEvents({ riderId: 'tadej-pogacar' });
        expect(results).toHaveLength(1);
        
        // Query with multiple filters
        results = await store.queryEvents({ 
            category: EventCategory.RACE_EVENT,
            raceId: 'tour-de-france-2024'
        });
        expect(results).toHaveLength(1);
        expect(results[0].eventType).toBe('start');
        
        // Query with limit and offset
        results = await store.queryEvents({}, { limit: 2, offset: 1 });
        expect(results).toHaveLength(2);
        
        expect(store.stats.queryCount).toBeGreaterThan(0);
        expect(store.stats.averageQueryTime).toBeGreaterThan(0);
    });

    test('should delete events correctly', async () => {
        const record = new EventRecord({
            category: EventCategory.RACE_EVENT,
            source: 'test',
            eventType: 'test',
            title: 'Test Event'
        });
        
        const eventId = await store.storeEvent(record);
        expect(store.getEvent(eventId)).toBeTruthy();
        
        const deleted = await store.deleteEvent(eventId);
        expect(deleted).toBe(true);
        expect(store.getEvent(eventId)).toBeNull();
        expect(store.stats.eventsInMemory).toBe(0);
        
        // Try deleting non-existent event
        const notDeleted = await store.deleteEvent('non-existent');
        expect(notDeleted).toBe(false);
    });

    test('should handle sorting options', async () => {
        const oldTime = new Date(Date.now() - 10000);
        const newTime = new Date();
        
        const records = [
            new EventRecord({
                category: EventCategory.RACE_EVENT,
                source: 'test',
                eventType: 'first',
                title: 'First Event',
                timestamp: newTime
            }),
            new EventRecord({
                category: EventCategory.RACE_EVENT,
                source: 'test',
                eventType: 'second',
                title: 'Second Event',
                timestamp: oldTime
            })
        ];
        
        for (const record of records) {
            await store.storeEvent(record);
        }
        
        // Default sort (desc by timestamp)
        let results = await store.queryEvents({});
        expect(results[0].eventType).toBe('first'); // Newer first
        expect(results[1].eventType).toBe('second');
        
        // Ascending sort
        results = await store.queryEvents({}, { sortOrder: 'asc' });
        expect(results[0].eventType).toBe('second'); // Older first
        expect(results[1].eventType).toBe('first');
    });
});

describe('HistoricalAnalyzer', () => {
    let store;
    let analyzer;

    beforeEach(() => {
        store = new EventStore({ enablePersistence: false });
        analyzer = new HistoricalAnalyzer(store);
    });

    test('should analyze rider performance', async () => {
        // Create performance events
        const performanceEvents = [
            new EventRecord({
                category: EventCategory.RIDER_PERFORMANCE,
                source: 'sensor',
                eventType: 'performance_data',
                title: 'Performance Update',
                riderId: 'tadej-pogacar',
                data: { speed: 45.0, power: 400, heartRate: 170, distance: 1.5 }
            }),
            new EventRecord({
                category: EventCategory.RIDER_PERFORMANCE,
                source: 'sensor',
                eventType: 'performance_data',
                title: 'Performance Update',
                riderId: 'tadej-pogacar',
                data: { speed: 47.0, power: 420, heartRate: 175, distance: 1.2 }
            }),
            new EventRecord({
                category: EventCategory.RIDER_PERFORMANCE,
                source: 'sensor',
                eventType: 'achievement',
                title: 'Stage Win',
                riderId: 'tadej-pogacar',
                tags: ['achievement'],
                data: { achievementType: 'stage_win' }
            })
        ];

        for (const event of performanceEvents) {
            await store.storeEvent(event);
        }

        const analysis = await analyzer.analyzeRiderPerformance('tadej-pogacar');

        expect(analysis.riderId).toBe('tadej-pogacar');
        expect(analysis.totalEvents).toBe(3);
        expect(analysis.performance.averageSpeed).toBeCloseTo(46.0, 1);
        expect(analysis.performance.maxSpeed).toBe(47.0);
        expect(analysis.performance.totalDistance).toBe(2.7);
        expect(analysis.achievements).toHaveLength(1);
        expect(analysis.achievements[0].type).toBe('stage_win');
    });

    test('should analyze tactical patterns', async () => {
        const tacticalEvents = [
            new EventRecord({
                category: EventCategory.TACTICAL_EVENT,
                source: 'tactical-detector',
                eventType: 'attack',
                title: 'Attack',
                raceId: 'tour-de-france-2024',
                riderId: 'tadej-pogacar',
                teamId: 'uae-team-emirates',
                location: 'Col du Tourmalet'
            }),
            new EventRecord({
                category: EventCategory.TACTICAL_EVENT,
                source: 'tactical-detector',
                eventType: 'breakaway',
                title: 'Breakaway',
                raceId: 'tour-de-france-2024',
                riderId: 'wout-van-aert',
                teamId: 'jumbo-visma'
            }),
            new EventRecord({
                category: EventCategory.TACTICAL_EVENT,
                source: 'tactical-detector',
                eventType: 'sprint',
                title: 'Sprint',
                raceId: 'tour-de-france-2024',
                riderId: 'mark-cavendish',
                teamId: 'astana',
                tags: ['key_moment']
            })
        ];

        for (const event of tacticalEvents) {
            await store.storeEvent(event);
        }

        const analysis = await analyzer.analyzeTacticalPatterns('tour-de-france-2024');

        expect(analysis.raceId).toBe('tour-de-france-2024');
        expect(analysis.totalTacticalEvents).toBe(3);
        expect(analysis.patterns.attacks).toHaveLength(1);
        expect(analysis.patterns.breakaways).toHaveLength(1);
        expect(analysis.patterns.sprints).toHaveLength(1);
        expect(analysis.keyMoments).toHaveLength(1);
        expect(analysis.teamStrategies).toHaveLength(3);
        expect(analysis.timeline).toHaveLength(3);
    });

    test('should generate race summary', async () => {
        const raceEvents = [
            new EventRecord({
                category: EventCategory.RACE_EVENT,
                source: 'race-system',
                eventType: 'race_start',
                title: 'Race Start',
                raceId: 'tour-de-france-2024',
                riderId: 'rider-1',
                teamId: 'team-1',
                timestamp: new Date(Date.now() - 10000)
            }),
            new EventRecord({
                category: EventCategory.TACTICAL_EVENT,
                source: 'tactical-detector',
                eventType: 'attack',
                title: 'Attack',
                raceId: 'tour-de-france-2024',
                riderId: 'rider-2',
                teamId: 'team-2',
                tags: ['highlight'],
                timestamp: new Date(Date.now() - 5000)
            }),
            new EventRecord({
                category: EventCategory.RACE_EVENT,
                source: 'race-system',
                eventType: 'race_finish',
                title: 'Race Finish',
                raceId: 'tour-de-france-2024',
                riderId: 'rider-1',
                teamId: 'team-1',
                timestamp: new Date()
            })
        ];

        for (const event of raceEvents) {
            await store.storeEvent(event);
        }

        const summary = await analyzer.generateRaceSummary('tour-de-france-2024');

        expect(summary.raceId).toBe('tour-de-france-2024');
        expect(summary.overview.totalEvents).toBe(3);
        expect(summary.overview.participants).toBe(2); // unique riders
        expect(summary.overview.teams).toBe(2); // unique teams
        expect(summary.overview.duration).toBeGreaterThan(0);
        expect(summary.highlights).toHaveLength(1);
        expect(summary.timeline).toHaveLength(3);
        expect(summary.eventBreakdown[EventCategory.RACE_EVENT]).toBe(2);
        expect(summary.eventBreakdown[EventCategory.TACTICAL_EVENT]).toBe(1);
    });

    test('should cache analysis results', async () => {
        const performanceEvent = new EventRecord({
            category: EventCategory.RIDER_PERFORMANCE,
            source: 'sensor',
            eventType: 'performance_data',
            title: 'Performance Update',
            riderId: 'test-rider',
            data: { speed: 45.0 }
        });

        await store.storeEvent(performanceEvent);

        // First call should generate analysis
        const analysis1 = await analyzer.analyzeRiderPerformance('test-rider');
        
        // Second call should return cached result
        const analysis2 = await analyzer.analyzeRiderPerformance('test-rider');
        
        expect(analysis1).toBe(analysis2); // Same object reference from cache
        
        // Clear cache
        analyzer.clearCache();
        
        // Third call should generate new analysis
        const analysis3 = await analyzer.analyzeRiderPerformance('test-rider');
        expect(analysis3).not.toBe(analysis1); // Different object reference
    });
});

describe('EventLoggingSystem', () => {
    let system;

    beforeEach(() => {
        system = new EventLoggingSystem({
            maxEventsPerSecond: 10,
            analysisInterval: 100,
            enablePersistence: false
        });
    });

    afterEach(async () => {
        if (system.isRunning) {
            await system.stop();
        }
    });

    test('should initialize system correctly', () => {
        expect(system.isRunning).toBe(false);
        expect(system.eventStore).toBeDefined();
        expect(system.historicalAnalyzer).toBeDefined();
        expect(system.stats.totalEventsLogged).toBe(0);
    });

    test('should start and stop system', async () => {
        expect(system.isRunning).toBe(false);
        
        await system.start();
        expect(system.isRunning).toBe(true);
        expect(system.analysisTimer).toBeDefined();
        
        await system.stop();
        expect(system.isRunning).toBe(false);
        expect(system.analysisTimer).toBeNull();
    });

    test('should log events', async () => {
        await system.start();

        const mockEmit = jest.fn();
        system.emit = mockEmit;

        const eventId = await system.logEvent({
            category: EventCategory.RACE_EVENT,
            source: 'test-source',
            eventType: 'test-event',
            title: 'Test Event',
            description: 'This is a test'
        });

        expect(eventId).toMatch(/^event_/);
        expect(system.eventQueue.length).toBe(1);
        expect(mockEmit).toHaveBeenCalledWith('event-logged', expect.any(Object));

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(system.stats.totalEventsLogged).toBe(1);
    });

    test('should validate required fields', async () => {
        await system.start();

        // Missing category
        await expect(system.logEvent({
            source: 'test-source',
            eventType: 'test-event'
        })).rejects.toThrow('Event must have category, source, and eventType');

        // Missing source
        await expect(system.logEvent({
            category: EventCategory.RACE_EVENT,
            eventType: 'test-event'
        })).rejects.toThrow('Event must have category, source, and eventType');

        // Missing eventType
        await expect(system.logEvent({
            category: EventCategory.RACE_EVENT,
            source: 'test-source'
        })).rejects.toThrow('Event must have category, source, and eventType');
    });

    test('should enforce rate limiting', async () => {
        await system.start();

        const initialDropped = system.stats.eventsDropped;

        // Send events up to rate limit
        for (let i = 0; i < 15; i++) { // More than maxEventsPerSecond (10)
            await system.logEvent({
                category: EventCategory.RACE_EVENT,
                source: 'test-source',
                eventType: 'test-event',
                title: `Event ${i}`
            });
        }

        expect(system.stats.eventsDropped).toBeGreaterThan(initialDropped);
    });

    test('should query historical events', async () => {
        await system.start();

        // Log multiple events
        await system.logEvent({
            category: EventCategory.RACE_EVENT,
            source: 'test-source',
            eventType: 'start',
            title: 'Race Start',
            raceId: 'test-race'
        });

        await system.logEvent({
            category: EventCategory.TACTICAL_EVENT,
            source: 'test-source',
            eventType: 'attack',
            title: 'Attack',
            raceId: 'test-race',
            riderId: 'test-rider'
        });

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Query events
        const raceEvents = await system.queryEvents({ 
            category: EventCategory.RACE_EVENT 
        });
        
        const tacticalEvents = await system.queryEvents({ 
            category: EventCategory.TACTICAL_EVENT 
        });

        expect(raceEvents).toHaveLength(1);
        expect(tacticalEvents).toHaveLength(1);
        expect(raceEvents[0].eventType).toBe('start');
        expect(tacticalEvents[0].eventType).toBe('attack');
    });

    test('should provide helper methods for common event types', async () => {
        await system.start();

        // Race event
        const raceEventId = await system.logRaceEvent('test-race', 'start', 'Race Start', 'The race has begun');
        expect(raceEventId).toBeDefined();

        // Rider performance
        const perfEventId = await system.logRiderPerformance('test-rider', 'test-race', { 
            speed: 45, power: 400 
        });
        expect(perfEventId).toBeDefined();

        // Tactical event
        const tacticalEventId = await system.logTacticalEvent(
            'test-race', 'test-rider', 'test-team', 'attack', 'Rider attacks'
        );
        expect(tacticalEventId).toBeDefined();

        // Weather event
        const weatherEventId = await system.logWeatherEvent('test-race', 'Paris', { 
            temperature: 25, conditions: 'sunny' 
        });
        expect(weatherEventId).toBeDefined();

        // System event
        const systemEventId = await system.logSystemEvent(
            'startup', 'System Started', 'PelotonIQ system started successfully'
        );
        expect(systemEventId).toBeDefined();

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(system.stats.totalEventsLogged).toBe(5);
    });

    test('should perform historical analysis', async () => {
        await system.start();

        // Log performance events
        await system.logRiderPerformance('test-rider', 'test-race', { 
            speed: 45, power: 400, heartRate: 170 
        });
        await system.logRiderPerformance('test-rider', 'test-race', { 
            speed: 47, power: 420, heartRate: 175 
        });

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Analyze performance
        const analysis = await system.analyzeRiderPerformance('test-rider');
        expect(analysis.riderId).toBe('test-rider');
        expect(analysis.totalEvents).toBe(2);
        expect(analysis.performance.averageSpeed).toBeCloseTo(46, 1);
    });

    test('should handle high-load stress test', async () => {
        await system.start();

        const eventCount = 500;
        const startTime = performance.now();

        // Log many events rapidly
        const promises = [];
        for (let i = 0; i < eventCount; i++) {
            promises.push(system.logEvent({
                category: EventCategory.RIDER_PERFORMANCE,
                source: 'stress-test',
                eventType: 'performance_data',
                title: `Event ${i}`,
                riderId: `rider-${i % 10}`,
                raceId: 'stress-test-race',
                data: { speed: 40 + Math.random() * 20 }
            }));
        }

        await Promise.allSettled(promises);
        const loggingTime = performance.now() - startTime;

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        expect(loggingTime).toBeLessThan(5000); // Should log 500 events in under 5 seconds
        expect(system.stats.totalEventsLogged).toBeGreaterThan(eventCount * 0.8); // Allow for some rate limiting
    }, 10000);

    test('should provide comprehensive statistics', async () => {
        await system.start();

        await system.logEvent({
            category: EventCategory.RACE_EVENT,
            source: 'test',
            eventType: 'test',
            title: 'Test'
        });

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 50));

        const stats = system.getStats();

        expect(stats).toHaveProperty('totalEventsLogged');
        expect(stats).toHaveProperty('eventsDropped');
        expect(stats).toHaveProperty('averageProcessingTime');
        expect(stats).toHaveProperty('eventStore');
        expect(stats).toHaveProperty('queueLength');
        expect(stats).toHaveProperty('isRunning');
        expect(stats).toHaveProperty('uptime');
        expect(stats.totalEventsLogged).toBeGreaterThan(0);
    });

    test('should perform health check', async () => {
        await system.start();

        const health = await system.healthCheck();

        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('system');
        expect(health).toHaveProperty('storage');
        expect(health).toHaveProperty('performance');
        expect(['healthy', 'degraded', 'stopped']).toContain(health.status);
        expect(health.system.isRunning).toBe(true);
    });

    test('should run scheduled analysis', async () => {
        await system.start();

        const mockEmit = jest.fn();
        system.emit = mockEmit;

        // Wait for at least one analysis cycle
        await new Promise(resolve => setTimeout(resolve, 150));

        expect(system.stats.analysisJobsRun).toBeGreaterThan(0);
        expect(mockEmit).toHaveBeenCalledWith('analysis-completed', expect.any(Object));
    });

    test('should emit all expected events', async () => {
        const events = [];
        const originalEmit = system.emit;
        system.emit = function(event, data) {
            events.push({ event, data });
            return originalEmit.call(this, event, data);
        };

        await system.start();
        
        await system.logEvent({
            category: EventCategory.RACE_EVENT,
            source: 'test',
            eventType: 'test',
            title: 'Test Event'
        });

        // Wait for processing and analysis
        await new Promise(resolve => setTimeout(resolve, 200));
        
        await system.stop();

        const eventTypes = events.map(e => e.event);
        expect(eventTypes).toContain('system-started');
        expect(eventTypes).toContain('event-logged');
        expect(eventTypes).toContain('analysis-completed');
        expect(eventTypes).toContain('system-stopped');
    });
});

describe('Integration Tests', () => {
    test('should integrate with other real-time components', async () => {
        const system = new EventLoggingSystem({
            maxEventsPerSecond: 100,
            analysisInterval: 100,
            enablePersistence: false
        });

        await system.start();

        // Simulate real-time events from various components
        const raceId = 'tour-de-france-2024';
        const riderId = 'tadej-pogacar';
        const teamId = 'uae-team-emirates';

        // Race start event
        await system.logRaceEvent(raceId, 'race_start', 'Stage 15 Start', 'Mountain stage begins');

        // Position updates from WebSocket manager
        await system.logEvent({
            category: EventCategory.RIDER_PERFORMANCE,
            source: 'websocket-manager',
            eventType: 'position_update',
            title: 'Position Update',
            raceId,
            riderId,
            data: { lat: 43.6047, lng: 1.4442, speed: 45.5, altitude: 1200 }
        });

        // Weather update from weather integration
        await system.logWeatherEvent(raceId, 'Col du Tourmalet', {
            temperature: 18,
            windSpeed: 25,
            conditions: 'partly_cloudy',
            visibility: 'good'
        });

        // Tactical event from tactical detector
        await system.logTacticalEvent(raceId, riderId, teamId, 'attack', 
            'Pogačar attacks with 5km to go', { gap: '15 seconds', gradient: 8.5 });

        // AI prediction event
        await system.logEvent({
            category: EventCategory.AI_PREDICTION,
            source: 'ai-model-update-trigger',
            eventType: 'prediction_update',
            title: 'Performance Prediction',
            raceId,
            riderId,
            data: { 
                predictedFinishTime: '4:32:15', 
                confidence: 0.87,
                modelVersion: '2.1.3'
            }
        });

        // Data quality issue from aggregation service
        await system.logEvent({
            category: EventCategory.DATA_QUALITY,
            source: 'data-aggregation-service',
            eventType: 'conflict_detected',
            title: 'Data Conflict',
            raceId,
            riderId,
            severity: EventSeverity.WARN,
            data: { conflictType: 'speed_mismatch', sources: ['gps', 'power-meter'] }
        });

        // Wait for all events to be processed
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify events were logged
        const stats = system.getStats();
        expect(stats.totalEventsLogged).toBe(6);

        // Query events by category
        const raceEvents = await system.queryEvents({ category: EventCategory.RACE_EVENT });
        const performanceEvents = await system.queryEvents({ category: EventCategory.RIDER_PERFORMANCE });
        const tacticalEvents = await system.queryEvents({ category: EventCategory.TACTICAL_EVENT });

        expect(raceEvents).toHaveLength(1);
        expect(performanceEvents).toHaveLength(1);
        expect(tacticalEvents).toHaveLength(1);

        // Generate comprehensive race analysis
        const raceSummary = await system.generateRaceSummary(raceId);
        expect(raceSummary.raceId).toBe(raceId);
        expect(raceSummary.overview.totalEvents).toBe(6);
        expect(raceSummary.overview.participants).toBe(1);
        expect(raceSummary.overview.teams).toBe(1);

        // Analyze rider performance
        const riderAnalysis = await system.analyzeRiderPerformance(riderId);
        expect(riderAnalysis.riderId).toBe(riderId);
        expect(riderAnalysis.totalEvents).toBe(1);

        // Analyze tactical patterns
        const tacticalAnalysis = await system.analyzeTacticalPatterns(raceId);
        expect(tacticalAnalysis.raceId).toBe(raceId);
        expect(tacticalAnalysis.totalTacticalEvents).toBe(1);
        expect(tacticalAnalysis.patterns.attacks).toHaveLength(1);

        // Verify system health
        const health = await system.healthCheck();
        expect(health.status).toBe('healthy');
        expect(health.storage.eventsInMemory).toBe(6);

        await system.stop();
    });
});