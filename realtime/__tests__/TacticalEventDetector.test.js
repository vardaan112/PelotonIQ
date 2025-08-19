/**
 * Comprehensive test suite for TacticalEventDetector
 * Tests all functionality including pattern matching, event correlation, and edge cases
 */

const { TacticalEventDetector, TacticalEvent, PatternMatcher, EventCorrelator } = require('../TacticalEventDetector');
const Redis = require('redis-mock');

// Mock Redis
jest.mock('redis', () => require('redis-mock'));

describe('TacticalEventDetector', () => {
    let detector;

    beforeEach(async () => {
        detector = new TacticalEventDetector({
            detectionInterval: 100, // Fast for testing
            confidenceThreshold: 0.5,
            eventRetention: 3600000, // 1 hour
            maxEventsInMemory: 100
        });

        await detector.start();
    });

    afterEach(async () => {
        if (detector && detector.isRunning) {
            await detector.stop();
        }
    });

    describe('TacticalEvent Class', () => {
        test('should create tactical event with all properties', () => {
            const eventData = {
                type: 'attack',
                severity: 'high',
                confidence: 0.9,
                timestamp: new Date(),
                location: { latitude: 45.0, longitude: 2.0 },
                raceDistance: 50000,
                involvedRiders: ['rider1', 'rider2'],
                description: 'Sudden attack detected',
                source: 'auto_detection',
                tags: ['sprint_attack']
            };

            const event = new TacticalEvent(eventData);

            expect(event.type).toBe('attack');
            expect(event.severity).toBe('high');
            expect(event.confidence).toBe(0.9);
            expect(event.involvedRiders).toEqual(['rider1', 'rider2']);
            expect(event.tags).toContain('sprint_attack');
            expect(event.id).toBeDefined();
        });

        test('should calculate impact correctly for crash events', () => {
            const crashEvent = new TacticalEvent({
                type: 'crash',
                severity: 'critical',
                involvedRiders: ['rider1', 'rider2', 'rider3', 'rider4', 'rider5', 'rider6'],
                tags: ['gc_contender'],
                timestamp: new Date()
            });

            const impact = crashEvent.calculateImpact();

            expect(impact.raceFlow).toBe('major');
            expect(impact.tacticalSignificance).toBe('critical');
            expect(impact.affectedRiders).toBe(6);
            expect(impact.estimatedTimeDelay).toBe(180); // 30 seconds per rider
            expect(impact.groupSplit).toBe(true);
            expect(impact.gc_impact).toBe(true);
        });

        test('should calculate impact correctly for attack events', () => {
            const attackEvent = new TacticalEvent({
                type: 'attack',
                severity: 'medium',
                involvedRiders: ['rider1'],
                tags: ['gc_attack', 'gc_contender'],
                timestamp: new Date()
            });

            const impact = attackEvent.calculateImpact();

            expect(impact.raceFlow).toBe('significant');
            expect(impact.tacticalSignificance).toBe('critical');
            expect(impact.groupSplit).toBe(true);
            expect(impact.gc_impact).toBe(true);
        });

        test('should calculate impact correctly for mechanical events', () => {
            const mechanicalEvent = new TacticalEvent({
                type: 'mechanical',
                severity: 'high',
                involvedRiders: ['rider1'],
                tags: ['gc_contender', 'team_leader'],
                timestamp: new Date()
            });

            const impact = mechanicalEvent.calculateImpact();

            expect(impact.raceFlow).toBe('significant');
            expect(impact.tacticalSignificance).toBe('high');
            expect(impact.estimatedTimeDelay).toBe(180); // Bike change
            expect(impact.gc_impact).toBe(true);
        });

        test('should verify events correctly', () => {
            const event = new TacticalEvent({
                type: 'attack',
                timestamp: new Date()
            });

            const verificationData = {
                status: 'verified',
                verifiedBy: 'user123',
                notes: 'Confirmed by video replay',
                sources: ['broadcast', 'social_media']
            };

            event.verify(verificationData);

            expect(event.verificationStatus).toBe('verified');
            expect(event.metadata.verification.verifiedBy).toBe('user123');
            expect(event.metadata.verification.notes).toBe('Confirmed by video replay');
            expect(event.metadata.verification.sources).toEqual(['broadcast', 'social_media']);
        });

        test('should link related events', () => {
            const event = new TacticalEvent({
                type: 'crash',
                timestamp: new Date()
            });

            event.linkRelatedEvent('related-event-123', 'consequence');

            expect(event.relatedEvents).toHaveLength(1);
            expect(event.relatedEvents[0].eventId).toBe('related-event-123');
            expect(event.relatedEvents[0].relationship).toBe('consequence');
        });

        test('should not duplicate related events', () => {
            const event = new TacticalEvent({
                type: 'crash',
                timestamp: new Date()
            });

            event.linkRelatedEvent('related-event-123', 'consequence');
            event.linkRelatedEvent('related-event-123', 'consequence'); // Duplicate

            expect(event.relatedEvents).toHaveLength(1);
        });

        test('should convert to JSON correctly', () => {
            const event = new TacticalEvent({
                type: 'attack',
                severity: 'medium',
                confidence: 0.8,
                timestamp: new Date(),
                involvedRiders: ['rider1'],
                tags: ['sprint_attack']
            });

            const json = event.toJSON();

            expect(json.type).toBe('attack');
            expect(json.severity).toBe('medium');
            expect(json.confidence).toBe(0.8);
            expect(json.involvedRiders).toEqual(['rider1']);
            expect(json.timestamp).toBeDefined();
            expect(json.id).toBeDefined();
        });
    });

    describe('PatternMatcher Class', () => {
        let patternMatcher;

        beforeEach(() => {
            patternMatcher = new PatternMatcher();
        });

        test('should register and store patterns', () => {
            const customPattern = {
                name: 'Custom Attack',
                description: 'Custom attack pattern',
                conditions: [
                    {
                        field: 'speedIncrease',
                        operator: 'gt',
                        value: 5
                    }
                ],
                confidence: 0.8,
                severity: 'high'
            };

            patternMatcher.registerPattern('custom_attack', customPattern);

            expect(patternMatcher.patterns.has('custom_attack')).toBe(true);
            expect(patternMatcher.patterns.get('custom_attack').name).toBe('Custom Attack');
        });

        test('should match attack patterns correctly', () => {
            const attackData = {
                speedIncrease: 4,
                positionImprovement: 8,
                gapToGroup: 15
            };

            const matches = patternMatcher.matchPatterns(attackData);
            const attackMatch = matches.find(m => m.type === 'attack');

            expect(attackMatch).toBeDefined();
            expect(attackMatch.confidence).toBeGreaterThan(0.5);
            expect(attackMatch.matchedConditions.length).toBeGreaterThan(0);
        });

        test('should match crash patterns correctly', () => {
            const crashData = {
                speedDecrease: 15,
                positionDrop: 25
            };

            const matches = patternMatcher.matchPatterns(crashData);
            const crashMatch = matches.find(m => m.type === 'crash');

            expect(crashMatch).toBeDefined();
            expect(crashMatch.confidence).toBeGreaterThan(0.8);
        });

        test('should match mechanical patterns correctly', () => {
            const mechanicalData = {
                speedDecrease: 7,
                positionDrop: 15,
                steadyDeceleration: true
            };

            const matches = patternMatcher.matchPatterns(mechanicalData);
            const mechanicalMatch = matches.find(m => m.type === 'mechanical');

            expect(mechanicalMatch).toBeDefined();
            expect(mechanicalMatch.confidence).toBeGreaterThan(0.5);
        });

        test('should match breakaway patterns correctly', () => {
            const breakawayData = {
                groupSize: 5,
                gapToPeloton: 45,
                sustainedGap: true
            };

            const matches = patternMatcher.matchPatterns(breakawayData);
            const breakawayMatch = matches.find(m => m.type === 'breakaway');

            expect(breakawayMatch).toBeDefined();
            expect(breakawayMatch.confidence).toBeGreaterThan(0.7);
        });

        test('should match sprint patterns correctly', () => {
            const sprintData = {
                averageSpeed: 18,
                groupCompactness: 80,
                distanceToFinish: 3000
            };

            const matches = patternMatcher.matchPatterns(sprintData);
            const sprintMatch = matches.find(m => m.type === 'sprint');

            expect(sprintMatch).toBeDefined();
            expect(sprintMatch.confidence).toBeGreaterThan(0.6);
        });

        test('should not match patterns when conditions not met', () => {
            const weakData = {
                speedIncrease: 1, // Too small
                positionImprovement: 2, // Too small
                gapToGroup: 5 // Too small
            };

            const matches = patternMatcher.matchPatterns(weakData);
            const attackMatch = matches.find(m => m.type === 'attack');

            expect(attackMatch).toBeUndefined();
        });

        test('should evaluate conditions correctly', () => {
            const testData = {
                speed: 15,
                position: 5,
                name: 'test rider',
                status: 'active'
            };

            // Test different operators
            expect(patternMatcher.evaluateCondition({ field: 'speed', operator: 'gt', value: 10 }, testData)).toBe(true);
            expect(patternMatcher.evaluateCondition({ field: 'speed', operator: 'lt', value: 20 }, testData)).toBe(true);
            expect(patternMatcher.evaluateCondition({ field: 'position', operator: 'eq', value: 5 }, testData)).toBe(true);
            expect(patternMatcher.evaluateCondition({ field: 'speed', operator: 'between', value: [10, 20] }, testData)).toBe(true);
            expect(patternMatcher.evaluateCondition({ field: 'status', operator: 'in', value: ['active', 'racing'] }, testData)).toBe(true);
            expect(patternMatcher.evaluateCondition({ field: 'name', operator: 'contains', value: 'test' }, testData)).toBe(true);
        });

        test('should handle nested field access', () => {
            const nestedData = {
                rider: {
                    performance: {
                        speed: 15
                    }
                }
            };

            const value = patternMatcher.getNestedValue(nestedData, 'rider.performance.speed');
            expect(value).toBe(15);

            const missingValue = patternMatcher.getNestedValue(nestedData, 'rider.missing.field');
            expect(missingValue).toBeUndefined();
        });

        test('should sort matches by confidence', () => {
            const data = {
                speedIncrease: 4,
                speedDecrease: 12,
                positionImprovement: 8,
                positionDrop: 25,
                gapToGroup: 15
            };

            const matches = patternMatcher.matchPatterns(data);

            // Should be sorted by confidence (crash should be higher than attack)
            expect(matches.length).toBeGreaterThan(1);
            expect(matches[0].confidence).toBeGreaterThanOrEqual(matches[1].confidence);
        });
    });

    describe('EventCorrelator Class', () => {
        let correlator;

        beforeEach(() => {
            correlator = new EventCorrelator();
        });

        test('should register correlation rules', () => {
            const customRule = {
                primaryType: 'attack',
                secondaryType: 'counter_attack',
                maxTimeGap: 60000,
                maxDistance: 1000,
                confidence: 0.8,
                relationship: 'consequence'
            };

            correlator.addCorrelationRule('attack_counter', customRule);

            expect(correlator.correlationRules.has('attack_counter')).toBe(true);
            expect(correlator.correlationRules.get('attack_counter').confidence).toBe(0.8);
        });

        test('should correlate crash and mechanical events', () => {
            const crashEvent = new TacticalEvent({
                type: 'crash',
                timestamp: new Date(),
                location: { latitude: 45.0, longitude: 2.0 },
                involvedRiders: ['rider1']
            });

            const mechanicalEvent = new TacticalEvent({
                type: 'mechanical',
                timestamp: new Date(Date.now() + 60000), // 1 minute later
                location: { latitude: 45.001, longitude: 2.001 }, // Very close
                involvedRiders: ['rider1']
            });

            const correlations = correlator.correlatEvents([crashEvent, mechanicalEvent]);

            expect(correlations).toHaveLength(1);
            expect(correlations[0].rule).toBe('crash_mechanical');
            expect(correlations[0].relationship).toBe('consequence');
            expect(correlations[0].confidence).toBe(0.8);
        });

        test('should correlate attack and chase events', () => {
            const attackEvent = new TacticalEvent({
                type: 'attack',
                timestamp: new Date(),
                location: { latitude: 45.0, longitude: 2.0 },
                involvedRiders: ['rider1']
            });

            const chaseEvent = new TacticalEvent({
                type: 'chase',
                timestamp: new Date(Date.now() + 90000), // 1.5 minutes later
                location: { latitude: 45.01, longitude: 2.01 }, // Close enough
                involvedRiders: ['rider2', 'rider3']
            });

            const correlations = correlator.correlatEvents([attackEvent, chaseEvent]);

            expect(correlations).toHaveLength(1);
            expect(correlations[0].rule).toBe('attack_chase');
            expect(correlations[0].relationship).toBe('consequence');
        });

        test('should correlate multiple crash events', () => {
            const crash1 = new TacticalEvent({
                type: 'crash',
                timestamp: new Date(),
                location: { latitude: 45.0, longitude: 2.0 },
                involvedRiders: ['rider1', 'rider2']
            });

            const crash2 = new TacticalEvent({
                type: 'crash',
                timestamp: new Date(Date.now() + 15000), // 15 seconds later
                location: { latitude: 45.0005, longitude: 2.0005 }, // Very close
                involvedRiders: ['rider3', 'rider4']
            });

            const correlations = correlator.correlatEvents([crash1, crash2]);

            expect(correlations).toHaveLength(1);
            expect(correlations[0].rule).toBe('multiple_crash');
            expect(correlations[0].relationship).toBe('concurrent');
            expect(correlations[0].confidence).toBe(0.95);
        });

        test('should not correlate events outside time window', () => {
            const event1 = new TacticalEvent({
                type: 'crash',
                timestamp: new Date(),
                location: { latitude: 45.0, longitude: 2.0 }
            });

            const event2 = new TacticalEvent({
                type: 'mechanical',
                timestamp: new Date(Date.now() + 300000), // 5 minutes later (too late)
                location: { latitude: 45.0, longitude: 2.0 }
            });

            const correlations = correlator.correlatEvents([event1, event2]);

            expect(correlations).toHaveLength(0);
        });

        test('should not correlate events outside distance threshold', () => {
            const event1 = new TacticalEvent({
                type: 'crash',
                timestamp: new Date(),
                location: { latitude: 45.0, longitude: 2.0 }
            });

            const event2 = new TacticalEvent({
                type: 'mechanical',
                timestamp: new Date(Date.now() + 60000), // 1 minute later
                location: { latitude: 46.0, longitude: 3.0 } // Too far
            });

            const correlations = correlator.correlatEvents([event1, event2]);

            expect(correlations).toHaveLength(0);
        });

        test('should calculate distance correctly', () => {
            const event1 = new TacticalEvent({
                type: 'crash',
                timestamp: new Date(),
                location: { latitude: 45.0, longitude: 2.0 }
            });

            const event2 = new TacticalEvent({
                type: 'mechanical',
                timestamp: new Date(),
                location: { latitude: 45.01, longitude: 2.01 }
            });

            const distance = correlator.calculateDistance(event1, event2);

            expect(distance).toBeGreaterThan(0);
            expect(distance).toBeLessThan(2000); // Should be roughly 1.4km
        });

        test('should handle events without location', () => {
            const event1 = new TacticalEvent({
                type: 'crash',
                timestamp: new Date()
                // No location
            });

            const event2 = new TacticalEvent({
                type: 'mechanical',
                timestamp: new Date()
                // No location
            });

            const distance = correlator.calculateDistance(event1, event2);
            expect(distance).toBe(0);
        });
    });

    describe('Event Detection', () => {
        test('should detect attack events from position data', async () => {
            let detectedEvent = null;
            detector.on('event-detected', (event) => {
                if (event.type === 'attack') {
                    detectedEvent = event;
                }
            });

            // Simulate attack pattern in position data
            const positionUpdates = [
                {
                    riderId: 'rider1',
                    position: 10,
                    speed: 12,
                    timestamp: new Date(Date.now() - 20000),
                    distanceFromStart: 50000
                },
                {
                    riderId: 'rider1',
                    position: 5, // Improved 5 positions
                    speed: 16, // Increased speed by 4 m/s
                    timestamp: new Date(Date.now() - 10000),
                    distanceFromStart: 50500
                },
                {
                    riderId: 'rider1',
                    position: 3, // Further improvement
                    speed: 17,
                    timestamp: new Date(),
                    distanceFromStart: 51000
                }
            ];

            detector.updatePositionData(positionUpdates);

            // Wait for detection cycle
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(detectedEvent).toBeDefined();
            expect(detectedEvent.type).toBe('attack');
            expect(detectedEvent.involvedRiders).toContain('rider1');
            expect(detectedEvent.confidence).toBeGreaterThan(0.5);
        });

        test('should detect crash events from position data', async () => {
            let detectedEvent = null;
            detector.on('event-detected', (event) => {
                if (event.type === 'crash') {
                    detectedEvent = event;
                }
            });

            // Simulate crash pattern
            const positionUpdates = [
                {
                    riderId: 'rider2',
                    position: 5,
                    speed: 15,
                    timestamp: new Date(Date.now() - 10000),
                    distanceFromStart: 50000
                },
                {
                    riderId: 'rider2',
                    position: 35, // Dropped 30 positions
                    speed: 2, // Sudden speed decrease
                    timestamp: new Date(),
                    distanceFromStart: 50100
                }
            ];

            detector.updatePositionData(positionUpdates);

            // Wait for detection cycle
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(detectedEvent).toBeDefined();
            expect(detectedEvent.type).toBe('crash');
            expect(detectedEvent.involvedRiders).toContain('rider2');
            expect(detectedEvent.severity).toBe('high');
        });

        test('should detect mechanical issues from position data', async () => {
            let detectedEvent = null;
            detector.on('event-detected', (event) => {
                if (event.type === 'mechanical') {
                    detectedEvent = event;
                }
            });

            // Simulate mechanical issue pattern
            const positionUpdates = [
                {
                    riderId: 'rider3',
                    position: 8,
                    speed: 14,
                    timestamp: new Date(Date.now() - 30000),
                    distanceFromStart: 50000
                },
                {
                    riderId: 'rider3',
                    position: 12,
                    speed: 10, // Gradual decrease
                    timestamp: new Date(Date.now() - 20000),
                    distanceFromStart: 50300
                },
                {
                    riderId: 'rider3',
                    position: 18,
                    speed: 7, // Further decrease
                    timestamp: new Date(Date.now() - 10000),
                    distanceFromStart: 50500
                },
                {
                    riderId: 'rider3',
                    position: 25, // Continued drop
                    speed: 5,
                    timestamp: new Date(),
                    distanceFromStart: 50650
                }
            ];

            detector.updatePositionData(positionUpdates);

            // Wait for detection cycle
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(detectedEvent).toBeDefined();
            expect(detectedEvent.type).toBe('mechanical');
            expect(detectedEvent.involvedRiders).toContain('rider3');
        });

        test('should not detect events below confidence threshold', async () => {
            detector.options.confidenceThreshold = 0.9; // Very high threshold

            let detectedEvent = null;
            detector.on('event-detected', (event) => {
                detectedEvent = event;
            });

            // Weak attack pattern
            const positionUpdates = [
                {
                    riderId: 'rider4',
                    position: 10,
                    speed: 12,
                    timestamp: new Date(Date.now() - 10000),
                    distanceFromStart: 50000
                },
                {
                    riderId: 'rider4',
                    position: 8, // Small improvement
                    speed: 13, // Small speed increase
                    timestamp: new Date(),
                    distanceFromStart: 50200
                }
            ];

            detector.updatePositionData(positionUpdates);

            // Wait for detection cycle
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(detectedEvent).toBeNull();
        });

        test('should merge similar events', async () => {
            let mergedEvent = null;
            detector.on('event-merged', (data) => {
                mergedEvent = data;
            });

            // Create first event
            const event1 = new TacticalEvent({
                type: 'crash',
                timestamp: new Date(),
                location: { latitude: 45.0, longitude: 2.0 },
                involvedRiders: ['rider1'],
                confidence: 0.8
            });

            await detector.processDetectedEvent(event1);

            // Create similar event
            const event2 = new TacticalEvent({
                type: 'crash',
                timestamp: new Date(Date.now() + 30000), // 30 seconds later
                location: { latitude: 45.001, longitude: 2.001 }, // Very close
                involvedRiders: ['rider2'],
                confidence: 0.7
            });

            await detector.processDetectedEvent(event2);

            expect(mergedEvent).toBeDefined();
            expect(mergedEvent.existingEventId).toBe(event1.id);

            // Check merged event
            const mergedEventData = detector.getEvent(event1.id);
            expect(mergedEventData.involvedRiders).toContain('rider1');
            expect(mergedEventData.involvedRiders).toContain('rider2');
        });

        test('should correlate events automatically', async () => {
            let correlationEvent = null;
            detector.on('events-correlated', (data) => {
                correlationEvent = data;
            });

            // Create crash event
            const crashEvent = new TacticalEvent({
                type: 'crash',
                timestamp: new Date(),
                location: { latitude: 45.0, longitude: 2.0 },
                involvedRiders: ['rider1']
            });

            await detector.processDetectedEvent(crashEvent);

            // Create mechanical event that should correlate
            const mechanicalEvent = new TacticalEvent({
                type: 'mechanical',
                timestamp: new Date(Date.now() + 90000), // 1.5 minutes later
                location: { latitude: 45.0005, longitude: 2.0005 }, // Very close
                involvedRiders: ['rider1']
            });

            await detector.processDetectedEvent(mechanicalEvent);

            // Process correlations
            const events = [crashEvent, mechanicalEvent];
            const correlations = detector.eventCorrelator.correlatEvents(events);
            await detector.processCorrelations(correlations);

            expect(correlationEvent).toBeDefined();
            expect(correlationEvent.primaryEvent).toBe(crashEvent.id);
            expect(correlationEvent.secondaryEvent).toBe(mechanicalEvent.id);
            expect(correlationEvent.relationship).toBe('consequence');
        });
    });

    describe('Group Event Detection', () => {
        test('should detect breakaway events', async () => {
            let detectedEvent = null;
            detector.on('event-detected', (event) => {
                if (event.type === 'breakaway') {
                    detectedEvent = event;
                }
            });

            // Mock race state with breakaway
            const raceState = {
                groups: [{
                    id: 'group1',
                    size: 4,
                    groupType: 'breakaway',
                    avgSpeed: 15,
                    gapToPrevious: 60, // 1 minute gap
                    riders: new Set(['rider1', 'rider2', 'rider3', 'rider4'])
                }],
                remainingKm: 40,
                tacticalSituation: 'stable'
            };

            detector.updateRaceState(raceState);

            // Wait for detection cycle
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(detectedEvent).toBeDefined();
            expect(detectedEvent.type).toBe('breakaway');
            expect(detectedEvent.involvedRiders).toHaveLength(4);
            expect(detectedEvent.description).toContain('Breakaway formed');
        });

        test('should detect sprint events', async () => {
            let detectedEvent = null;
            detector.on('event-detected', (event) => {
                if (event.type === 'sprint') {
                    detectedEvent = event;
                }
            });

            // Mock race state with sprint conditions
            const raceState = {
                groups: [{
                    id: 'group1',
                    size: 25,
                    groupType: 'peloton',
                    avgSpeed: 18, // High speed
                    riders: new Set(Array.from({length: 25}, (_, i) => `rider${i+1}`))
                }],
                remainingKm: 3, // Close to finish
                tacticalSituation: 'sprint'
            };

            detector.updateRaceState(raceState);

            // Wait for detection cycle
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(detectedEvent).toBeDefined();
            expect(detectedEvent.type).toBe('sprint');
            expect(detectedEvent.description).toContain('Sprint detected');
        });
    });

    describe('Event Management', () => {
        test('should store and retrieve events by ID', async () => {
            const event = new TacticalEvent({
                type: 'attack',
                timestamp: new Date(),
                involvedRiders: ['rider1']
            });

            await detector.processDetectedEvent(event);

            const retrievedEvent = detector.getEvent(event.id);
            expect(retrievedEvent).toBeDefined();
            expect(retrievedEvent.id).toBe(event.id);
            expect(retrievedEvent.type).toBe('attack');
        });

        test('should get events by type', async () => {
            const attackEvent = new TacticalEvent({
                type: 'attack',
                timestamp: new Date(),
                involvedRiders: ['rider1']
            });

            const crashEvent = new TacticalEvent({
                type: 'crash',
                timestamp: new Date(),
                involvedRiders: ['rider2']
            });

            await detector.processDetectedEvent(attackEvent);
            await detector.processDetectedEvent(crashEvent);

            const attackEvents = detector.getEventsByType('attack');
            expect(attackEvents).toHaveLength(1);
            expect(attackEvents[0].type).toBe('attack');

            const crashEvents = detector.getEventsByType('crash');
            expect(crashEvents).toHaveLength(1);
            expect(crashEvents[0].type).toBe('crash');
        });

        test('should get events by rider', async () => {
            const event1 = new TacticalEvent({
                type: 'attack',
                timestamp: new Date(),
                involvedRiders: ['rider1', 'rider2']
            });

            const event2 = new TacticalEvent({
                type: 'mechanical',
                timestamp: new Date(),
                involvedRiders: ['rider1']
            });

            await detector.processDetectedEvent(event1);
            await detector.processDetectedEvent(event2);

            const rider1Events = detector.getEventsByRider('rider1');
            expect(rider1Events).toHaveLength(2);

            const rider2Events = detector.getEventsByRider('rider2');
            expect(rider2Events).toHaveLength(1);
        });

        test('should get recent events', async () => {
            const event1 = new TacticalEvent({
                type: 'attack',
                timestamp: new Date(Date.now() - 10000),
                involvedRiders: ['rider1']
            });

            const event2 = new TacticalEvent({
                type: 'crash',
                timestamp: new Date(),
                involvedRiders: ['rider2']
            });

            await detector.processDetectedEvent(event1);
            await detector.processDetectedEvent(event2);

            const recentEvents = detector.getRecentEvents(10);
            expect(recentEvents).toHaveLength(2);
            expect(recentEvents[0].type).toBe('crash'); // More recent first
            expect(recentEvents[1].type).toBe('attack');
        });

        test('should verify events manually', async () => {
            let verificationEvent = null;
            detector.on('event-verified', (data) => {
                verificationEvent = data;
            });

            const event = new TacticalEvent({
                type: 'attack',
                timestamp: new Date(),
                involvedRiders: ['rider1']
            });

            await detector.processDetectedEvent(event);

            const verificationData = {
                status: 'verified',
                verifiedBy: 'admin',
                notes: 'Confirmed by video'
            };

            await detector.verifyEvent(event.id, verificationData);

            expect(verificationEvent).toBeDefined();
            expect(verificationEvent.eventId).toBe(event.id);
            expect(verificationEvent.status).toBe('verified');

            const verifiedEvent = detector.getEvent(event.id);
            expect(verifiedEvent.verificationStatus).toBe('verified');
        });

        test('should handle verification of non-existent event', async () => {
            await expect(
                detector.verifyEvent('non-existent-id', { status: 'verified' })
            ).rejects.toThrow('Event non-existent-id not found');
        });

        test('should clean up old events', async () => {
            // Set short retention for testing
            detector.options.eventRetention = 1000; // 1 second

            const oldEvent = new TacticalEvent({
                type: 'attack',
                timestamp: new Date(Date.now() - 2000), // 2 seconds ago
                involvedRiders: ['rider1']
            });

            await detector.processDetectedEvent(oldEvent);
            expect(detector.activeEvents.has(oldEvent.id)).toBe(true);

            // Trigger cleanup
            detector.cleanupOldEvents();

            expect(detector.activeEvents.has(oldEvent.id)).toBe(false);
        });
    });

    describe('Custom Patterns', () => {
        test('should add custom patterns', () => {
            let patternAddedEvent = null;
            detector.on('pattern-added', (data) => {
                patternAddedEvent = data;
            });

            const customPattern = {
                name: 'Team Attack',
                description: 'Coordinated team attack',
                conditions: [
                    {
                        field: 'teamMateCount',
                        operator: 'gt',
                        value: 2
                    },
                    {
                        field: 'speedIncrease',
                        operator: 'gt',
                        value: 3
                    }
                ],
                confidence: 0.8,
                severity: 'high'
            };

            detector.addCustomPattern('team_attack', customPattern);

            expect(patternAddedEvent).toBeDefined();
            expect(patternAddedEvent.type).toBe('team_attack');
            expect(patternAddedEvent.pattern.name).toBe('Team Attack');
        });
    });

    describe('Performance and Load Testing', () => {
        test('should handle large amounts of position data', async () => {
            const positionUpdates = [];

            // Generate 500 position updates
            for (let i = 1; i <= 500; i++) {
                positionUpdates.push({
                    riderId: `rider${i % 100 + 1}`, // 100 different riders
                    position: i % 200 + 1,
                    speed: 10 + Math.random() * 10,
                    timestamp: new Date(Date.now() - Math.random() * 60000),
                    distanceFromStart: 50000 + Math.random() * 10000
                });
            }

            const startTime = Date.now();
            detector.updatePositionData(positionUpdates);
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(1000); // Should process within 1 second
            expect(detector.positionData.size).toBeGreaterThan(0);
        });

        test('should limit memory usage', async () => {
            detector.options.maxEventsInMemory = 5;

            // Create more events than the limit
            for (let i = 0; i < 10; i++) {
                const event = new TacticalEvent({
                    type: 'attack',
                    timestamp: new Date(Date.now() + i * 1000),
                    involvedRiders: [`rider${i}`]
                });

                await detector.processDetectedEvent(event);
            }

            expect(detector.eventHistory.length).toBeLessThanOrEqual(5);
        });

        test('should maintain performance during rapid detections', async () => {
            const detectionPromises = [];

            // Create many concurrent events
            for (let i = 0; i < 50; i++) {
                const event = new TacticalEvent({
                    type: 'attack',
                    timestamp: new Date(),
                    involvedRiders: [`rider${i}`]
                });

                detectionPromises.push(detector.processDetectedEvent(event));
            }

            const startTime = Date.now();
            await Promise.all(detectionPromises);
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
            expect(detector.activeEvents.size).toBe(50);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle empty position data', async () => {
            detector.updatePositionData([]);
            
            // Should not crash
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(true).toBe(true);
        });

        test('should handle malformed position data', async () => {
            const malformedData = [
                { riderId: null, position: 'invalid', speed: 'not_a_number' },
                { riderId: 'rider1' }, // Missing required fields
                null,
                undefined
            ];

            // Should not crash
            detector.updatePositionData(malformedData);
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(true).toBe(true);
        });

        test('should handle events without location data', async () => {
            const event = new TacticalEvent({
                type: 'attack',
                timestamp: new Date(),
                involvedRiders: ['rider1']
                // No location
            });

            await detector.processDetectedEvent(event);

            const retrievedEvent = detector.getEvent(event.id);
            expect(retrievedEvent).toBeDefined();
            expect(retrievedEvent.location).toBeNull();
        });

        test('should handle concurrent event processing', async () => {
            const promises = [];

            // Process multiple events concurrently
            for (let i = 0; i < 20; i++) {
                const event = new TacticalEvent({
                    type: 'attack',
                    timestamp: new Date(),
                    involvedRiders: [`rider${i}`]
                });

                promises.push(detector.processDetectedEvent(event));
            }

            await Promise.all(promises);

            expect(detector.activeEvents.size).toBe(20);
        });

        test('should handle Redis connection errors gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Simulate Redis failure
            detector.redis = null;

            const event = new TacticalEvent({
                type: 'attack',
                timestamp: new Date(),
                involvedRiders: ['rider1']
            });

            // Should not crash
            await detector.storeEventInRedis(event);
            
            expect(true).toBe(true);
            consoleSpy.mockRestore();
        });

        test('should handle pattern matching with missing data', () => {
            const incompleteData = {
                speedIncrease: 5
                // Missing other fields
            };

            const matches = detector.patternMatcher.matchPatterns(incompleteData);
            
            // Should not crash and may or may not match patterns
            expect(Array.isArray(matches)).toBe(true);
        });
    });

    describe('Statistics and Monitoring', () => {
        test('should track detection statistics', async () => {
            const event = new TacticalEvent({
                type: 'attack',
                timestamp: new Date(),
                involvedRiders: ['rider1']
            });

            await detector.processDetectedEvent(event);

            const stats = detector.getStats();

            expect(stats.eventsDetected).toBe(1);
            expect(stats.activeEvents).toBe(1);
            expect(stats.isRunning).toBe(true);
            expect(stats.riderProfiles).toBeGreaterThan(0);
            expect(stats.patterns).toBeGreaterThan(0);
        });

        test('should track verification statistics', async () => {
            const event = new TacticalEvent({
                type: 'attack',
                timestamp: new Date(),
                involvedRiders: ['rider1']
            });

            await detector.processDetectedEvent(event);

            await detector.verifyEvent(event.id, {
                status: 'verified',
                verifiedBy: 'admin'
            });

            const stats = detector.getStats();
            expect(stats.eventsVerified).toBe(1);
        });

        test('should track false positive statistics', async () => {
            const event = new TacticalEvent({
                type: 'attack',
                timestamp: new Date(),
                involvedRiders: ['rider1']
            });

            await detector.processDetectedEvent(event);

            await detector.verifyEvent(event.id, {
                status: 'false_positive',
                verifiedBy: 'admin'
            });

            const stats = detector.getStats();
            expect(stats.falsePositives).toBe(1);
        });
    });

    describe('Lifecycle Management', () => {
        test('should start and stop cleanly', async () => {
            expect(detector.isRunning).toBe(true);
            expect(detector.detectionTimer).toBeDefined();

            await detector.stop();

            expect(detector.isRunning).toBe(false);
            expect(detector.detectionTimer).toBeNull();
        });

        test('should handle multiple start calls', async () => {
            expect(detector.isRunning).toBe(true);

            // Try to start again
            await detector.start();

            // Should still be running normally
            expect(detector.isRunning).toBe(true);
        });

        test('should save and load events during lifecycle', async () => {
            const event = new TacticalEvent({
                type: 'attack',
                timestamp: new Date(),
                involvedRiders: ['rider1']
            });

            await detector.processDetectedEvent(event);

            // Stop detector (should save events)
            await detector.stop();

            // Create new detector (should load events)
            const newDetector = new TacticalEventDetector({
                detectionInterval: 100,
                confidenceThreshold: 0.5
            });

            await newDetector.start();

            // Check if event was loaded
            const loadedEvent = newDetector.getEvent(event.id);
            expect(loadedEvent).toBeDefined();

            await newDetector.stop();
        });
    });
});

describe('TacticalEvent Edge Cases', () => {
    test('should handle event with all null values', () => {
        const event = new TacticalEvent({
            type: 'test',
            timestamp: new Date(),
            location: null,
            raceDistance: null,
            involvedRiders: null,
            triggerData: null,
            description: null,
            impactAssessment: null,
            source: null,
            tags: null,
            metadata: null
        });

        expect(event.type).toBe('test');
        expect(event.involvedRiders).toEqual([]);
        expect(event.tags).toEqual([]);
        expect(event.metadata).toEqual({});
    });

    test('should generate unique IDs', () => {
        const event1 = new TacticalEvent({ type: 'test', timestamp: new Date() });
        const event2 = new TacticalEvent({ type: 'test', timestamp: new Date() });

        expect(event1.id).not.toBe(event2.id);
        expect(event1.id).toMatch(/^event_\d+_[a-z0-9]+$/);
    });

    test('should handle impact calculation with no rider data', () => {
        const event = new TacticalEvent({
            type: 'unknown_type',
            timestamp: new Date(),
            involvedRiders: [],
            tags: []
        });

        const impact = event.calculateImpact();

        expect(impact.raceFlow).toBe('minimal');
        expect(impact.tacticalSignificance).toBe('low');
        expect(impact.affectedRiders).toBe(0);
        expect(impact.groupSplit).toBe(false);
        expect(impact.gc_impact).toBe(false);
    });
});