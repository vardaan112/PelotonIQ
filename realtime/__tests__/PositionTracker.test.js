/**
 * Comprehensive test suite for PositionTracker
 * Tests all functionality including edge cases and performance scenarios
 */

const { PositionTracker, RiderPosition, RiderGroup, RaceState } = require('../PositionTracker');
const Redis = require('redis-mock');

// Mock Redis
jest.mock('redis', () => require('redis-mock'));

describe('PositionTracker', () => {
    let positionTracker;

    beforeEach(() => {
        positionTracker = new PositionTracker({
            updateInterval: 100, // Faster for testing
            positionTimeout: 5000,
            groupDistanceThreshold: 50,
            groupTimeThreshold: 5
        });
    });

    afterEach(async () => {
        if (positionTracker) {
            await positionTracker.stop();
        }
    });

    describe('RiderPosition Class', () => {
        test('should create valid rider position', () => {
            const data = {
                riderId: 'rider1',
                name: 'Test Rider',
                teamId: 'team1',
                bibNumber: 1,
                position: 1,
                latitude: 45.0,
                longitude: 2.0,
                speed: 15.0,
                timestamp: new Date().toISOString()
            };

            const position = new RiderPosition(data);
            
            expect(position.riderId).toBe('rider1');
            expect(position.name).toBe('Test Rider');
            expect(position.position).toBe(1);
            expect(position.isValid()).toBe(true);
        });

        test('should calculate distance between positions', () => {
            const pos1 = new RiderPosition({
                riderId: 'rider1',
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date()
            });

            const pos2 = new RiderPosition({
                riderId: 'rider2',
                latitude: 45.01,
                longitude: 2.01,
                timestamp: new Date()
            });

            const distance = pos1.distanceTo(pos2);
            expect(distance).toBeGreaterThan(0);
            expect(distance).toBeLessThan(2000); // Should be roughly 1.4km
        });

        test('should interpolate position based on speed and heading', () => {
            const position = new RiderPosition({
                riderId: 'rider1',
                latitude: 45.0,
                longitude: 2.0,
                speed: 10, // m/s
                heading: 90, // East
                timestamp: new Date()
            });

            const futureTime = new Date(Date.now() + 10000); // 10 seconds later
            const interpolated = position.interpolatePosition(futureTime);

            expect(interpolated).not.toBeNull();
            expect(interpolated.longitude).toBeGreaterThan(position.longitude);
            expect(interpolated.confidence).toBeLessThan(position.confidence);
        });

        test('should handle invalid position data', () => {
            const invalidData = {
                riderId: 'rider1',
                latitude: 91, // Invalid latitude
                longitude: 181, // Invalid longitude
                timestamp: new Date()
            };

            const position = new RiderPosition(invalidData);
            expect(position.latitude).toBe(91); // Should store even if invalid
        });

        test('should convert to JSON correctly', () => {
            const data = {
                riderId: 'rider1',
                name: 'Test Rider',
                position: 1,
                timestamp: new Date()
            };

            const position = new RiderPosition(data);
            const json = position.toJSON();

            expect(json.riderId).toBe('rider1');
            expect(json.name).toBe('Test Rider');
            expect(json.timestamp).toBeDefined();
        });
    });

    describe('RiderGroup Class', () => {
        test('should create and manage rider groups', () => {
            const group = new RiderGroup('group1', ['rider1', 'rider2']);
            
            expect(group.id).toBe('group1');
            expect(group.size).toBe(2);
            expect(group.hasRider('rider1')).toBe(true);
            expect(group.hasRider('rider3')).toBe(false);
        });

        test('should add and remove riders', () => {
            const group = new RiderGroup('group1');
            
            group.addRider('rider1');
            expect(group.size).toBe(1);
            expect(group.hasRider('rider1')).toBe(true);
            
            group.removeRider('rider1');
            expect(group.size).toBe(0);
            expect(group.hasRider('rider1')).toBe(false);
        });

        test('should update group metrics', () => {
            const group = new RiderGroup('group1', ['rider1', 'rider2']);
            
            const positions = new Map();
            positions.set('rider1', new RiderPosition({
                riderId: 'rider1',
                position: 1,
                speed: 15,
                timestamp: new Date()
            }));
            positions.set('rider2', new RiderPosition({
                riderId: 'rider2',
                position: 2,
                speed: 14,
                timestamp: new Date()
            }));

            group.updateMetrics(positions);
            
            expect(group.avgPosition).toBe(1.5);
            expect(group.avgSpeed).toBe(14.5);
        });

        test('should determine group type correctly', () => {
            const soloGroup = new RiderGroup('solo', ['rider1']);
            const smallGroup = new RiderGroup('small', ['rider1', 'rider2', 'rider3']);
            const largeGroup = new RiderGroup('large', Array.from({length: 60}, (_, i) => `rider${i}`));

            const positions = new Map();
            // Add some basic positions
            for (let i = 0; i < 60; i++) {
                positions.set(`rider${i}`, new RiderPosition({
                    riderId: `rider${i}`,
                    position: i + 1,
                    speed: 15,
                    timestamp: new Date()
                }));
            }

            soloGroup.updateMetrics(positions);
            smallGroup.updateMetrics(positions);
            largeGroup.updateMetrics(positions);

            expect(soloGroup.groupType).toBe('solo');
            expect(smallGroup.groupType).toBe('small_group');
            expect(largeGroup.groupType).toBe('peloton');
        });
    });

    describe('Data Source Management', () => {
        test('should register data sources', () => {
            const sourceInfo = {
                name: 'GPS Tracker',
                type: 'gps',
                priority: 8,
                accuracy: 'high'
            };

            positionTracker.registerDataSource('gps-1', sourceInfo);
            
            expect(positionTracker.dataSources.has('gps-1')).toBe(true);
            expect(positionTracker.sourceReliability.has('gps-1')).toBe(true);
        });

        test('should update source reliability', () => {
            positionTracker.registerDataSource('test-source', {
                name: 'Test Source',
                initialReliability: 0.7
            });

            const highQualityPosition = new RiderPosition({
                riderId: 'rider1',
                position: 1,
                confidence: 0.95,
                accuracy: 'high',
                source: 'test-source',
                timestamp: new Date()
            });

            positionTracker.updateSourceReliability('test-source', highQualityPosition);
            
            const reliability = positionTracker.sourceReliability.get('test-source');
            expect(reliability).toBeGreaterThan(0.7);
        });
    });

    describe('Position Processing', () => {
        test('should process valid position updates', async () => {
            const positionData = {
                riderId: 'rider1',
                name: 'Test Rider',
                position: 1,
                latitude: 45.0,
                longitude: 2.0,
                speed: 15.0,
                timestamp: new Date().toISOString(),
                source: 'test-source'
            };

            const result = await positionTracker.processPositionUpdate(positionData);
            
            expect(result).toBe(true);
            expect(positionTracker.positions.has('rider1')).toBe(true);
            expect(positionTracker.stats.positionsProcessed).toBe(1);
        });

        test('should reject invalid position data', async () => {
            const invalidData = {
                riderId: '', // Invalid rider ID
                position: 1,
                timestamp: new Date().toISOString()
            };

            const result = await positionTracker.processPositionUpdate(invalidData);
            
            expect(result).toBe(false);
            expect(positionTracker.stats.errors).toBeGreaterThan(0);
        });

        test('should ignore older position updates', async () => {
            const newerData = {
                riderId: 'rider1',
                position: 1,
                timestamp: new Date().toISOString(),
                source: 'test-source'
            };

            const olderData = {
                riderId: 'rider1',
                position: 2,
                timestamp: new Date(Date.now() - 10000).toISOString(), // 10 seconds ago
                source: 'test-source'
            };

            await positionTracker.processPositionUpdate(newerData);
            const result = await positionTracker.processPositionUpdate(olderData);
            
            expect(result).toBe(false);
            expect(positionTracker.positions.get('rider1').position).toBe(1);
        });

        test('should validate position data correctly', () => {
            const validData = {
                riderId: 'rider1',
                position: 1,
                latitude: 45.0,
                longitude: 2.0,
                speed: 15.0,
                timestamp: new Date().toISOString()
            };

            const invalidLatitude = { ...validData, latitude: 91 };
            const invalidLongitude = { ...validData, longitude: 181 };
            const invalidSpeed = { ...validData, speed: 100 }; // Too fast
            const oldTimestamp = { ...validData, timestamp: new Date(Date.now() - 7200000).toISOString() }; // 2 hours ago

            expect(positionTracker.validatePositionData(validData)).toBe(true);
            expect(positionTracker.validatePositionData(invalidLatitude)).toBe(false);
            expect(positionTracker.validatePositionData(invalidLongitude)).toBe(false);
            expect(positionTracker.validatePositionData(invalidSpeed)).toBe(false);
            expect(positionTracker.validatePositionData(oldTimestamp)).toBe(false);
        });
    });

    describe('Group Detection', () => {
        test('should detect rider groups correctly', async () => {
            // Add multiple riders with similar positions
            const riders = [
                { riderId: 'rider1', position: 1, timeFromStart: 3600 },
                { riderId: 'rider2', position: 2, timeFromStart: 3601 },
                { riderId: 'rider3', position: 3, timeFromStart: 3602 },
                { riderId: 'rider4', position: 15, timeFromStart: 3700 },
                { riderId: 'rider5', position: 16, timeFromStart: 3701 }
            ];

            for (const rider of riders) {
                await positionTracker.processPositionUpdate({
                    ...rider,
                    timestamp: new Date().toISOString(),
                    source: 'test-source'
                });
            }

            positionTracker.detectGroups();
            
            expect(positionTracker.groups.size).toBeGreaterThan(0);
            
            // Should have at least 2 groups (leading group and chase group)
            const groups = Array.from(positionTracker.groups.values());
            expect(groups.length).toBeGreaterThanOrEqual(2);
        });

        test('should calculate group gaps correctly', async () => {
            const riders = [
                { riderId: 'rider1', position: 1, timeFromStart: 3600 },
                { riderId: 'rider2', position: 10, timeFromStart: 3650 }
            ];

            for (const rider of riders) {
                await positionTracker.processPositionUpdate({
                    ...rider,
                    timestamp: new Date().toISOString(),
                    source: 'test-source'
                });
            }

            positionTracker.detectGroups();
            
            const groups = Array.from(positionTracker.groups.values())
                .sort((a, b) => a.avgPosition - b.avgPosition);
            
            if (groups.length >= 2) {
                expect(groups[1].gapToPrevious).toBe(50); // 50 seconds gap
            }
        });

        test('should handle riders in same group based on proximity', () => {
            const pos1 = new RiderPosition({
                riderId: 'rider1',
                position: 1,
                timeFromStart: 3600,
                timestamp: new Date()
            });

            const pos2 = new RiderPosition({
                riderId: 'rider2',
                position: 2,
                timeFromStart: 3602, // 2 seconds behind
                timestamp: new Date()
            });

            const pos3 = new RiderPosition({
                riderId: 'rider3',
                position: 20,
                timeFromStart: 3700, // 100 seconds behind
                timestamp: new Date()
            });

            expect(positionTracker.areRidersInSameGroup(pos1, pos2)).toBe(true);
            expect(positionTracker.areRidersInSameGroup(pos1, pos3)).toBe(false);
        });
    });

    describe('Gap Calculations', () => {
        test('should calculate time gaps correctly', async () => {
            const riders = [
                { riderId: 'rider1', position: 1, timeFromStart: 3600 },
                { riderId: 'rider2', position: 2, timeFromStart: 3610 },
                { riderId: 'rider3', position: 3, timeFromStart: 3620 }
            ];

            for (const rider of riders) {
                await positionTracker.processPositionUpdate({
                    ...rider,
                    timestamp: new Date().toISOString(),
                    source: 'test-source'
                });
            }

            const gaps = positionTracker.calculateGaps();
            
            expect(gaps.size).toBe(3);
            expect(gaps.get('rider1').gapToPrevious).toBe(0); // Leader
            expect(gaps.get('rider2').gapToPrevious).toBe(10); // 10 seconds
            expect(gaps.get('rider3').gapToPrevious).toBe(10); // 10 seconds
            expect(gaps.get('rider3').gapToLeader).toBe(20); // 20 seconds to leader
        });
    });

    describe('Position Interpolation', () => {
        test('should interpolate missing positions', async () => {
            const oldTimestamp = new Date(Date.now() - 8000); // 8 seconds ago
            
            await positionTracker.processPositionUpdate({
                riderId: 'rider1',
                position: 1,
                latitude: 45.0,
                longitude: 2.0,
                speed: 10,
                heading: 90,
                timestamp: oldTimestamp.toISOString(),
                source: 'test-source'
            });

            const originalPosition = positionTracker.positions.get('rider1');
            const originalLongitude = originalPosition.longitude;

            positionTracker.interpolatePositions();

            const interpolatedPosition = positionTracker.positions.get('rider1');
            expect(interpolatedPosition.longitude).toBeGreaterThan(originalLongitude);
            expect(interpolatedPosition.confidence).toBeLessThan(1.0);
            expect(positionTracker.stats.interpolationsPerformed).toBeGreaterThan(0);
        });

        test('should not interpolate very old positions', async () => {
            const veryOldTimestamp = new Date(Date.now() - 20000); // 20 seconds ago
            
            await positionTracker.processPositionUpdate({
                riderId: 'rider1',
                position: 1,
                longitude: 2.0,
                timestamp: veryOldTimestamp.toISOString(),
                source: 'test-source'
            });

            const originalLongitude = positionTracker.positions.get('rider1').longitude;
            positionTracker.interpolatePositions();

            expect(positionTracker.positions.get('rider1').longitude).toBe(originalLongitude);
        });
    });

    describe('Stale Position Cleanup', () => {
        test('should remove stale positions', async () => {
            const staleTimestamp = new Date(Date.now() - 10000); // 10 seconds ago (beyond timeout)
            
            await positionTracker.processPositionUpdate({
                riderId: 'rider1',
                position: 1,
                timestamp: staleTimestamp.toISOString(),
                source: 'test-source'
            });

            expect(positionTracker.positions.has('rider1')).toBe(true);

            positionTracker.cleanupStalePositions();

            expect(positionTracker.positions.has('rider1')).toBe(false);
        });

        test('should keep fresh positions', async () => {
            await positionTracker.processPositionUpdate({
                riderId: 'rider1',
                position: 1,
                timestamp: new Date().toISOString(),
                source: 'test-source'
            });

            positionTracker.cleanupStalePositions();

            expect(positionTracker.positions.has('rider1')).toBe(true);
        });
    });

    describe('Race State Analysis', () => {
        test('should update race state correctly', async () => {
            const riders = [
                { riderId: 'rider1', position: 1, speed: 15 },
                { riderId: 'rider2', position: 2, speed: 14 },
                { riderId: 'rider3', position: 3, speed: 13 }
            ];

            for (const rider of riders) {
                await positionTracker.processPositionUpdate({
                    ...rider,
                    timestamp: new Date().toISOString(),
                    source: 'test-source'
                });
            }

            positionTracker.updateRaceState();

            expect(positionTracker.raceState.totalRiders).toBe(3);
            expect(positionTracker.raceState.activeRiders).toBe(3);
            expect(positionTracker.raceState.averageSpeed).toBe(14);
            expect(positionTracker.raceState.fastestRider).toBe('rider1');
        });

        test('should detect breakaway situation', async () => {
            // Create breakaway scenario
            await positionTracker.processPositionUpdate({
                riderId: 'breakaway1',
                position: 1,
                timeFromStart: 3600,
                timestamp: new Date().toISOString(),
                source: 'test-source'
            });

            // Main peloton far behind
            for (let i = 20; i <= 30; i++) {
                await positionTracker.processPositionUpdate({
                    riderId: `peloton${i}`,
                    position: i,
                    timeFromStart: 3700, // 100 seconds behind
                    timestamp: new Date().toISOString(),
                    source: 'test-source'
                });
            }

            positionTracker.detectGroups();
            positionTracker.updateRaceState();

            expect(positionTracker.raceState.tacticalSituation).toBe('breakaway');
        });

        test('should detect sprint situation', async () => {
            // Create sprint scenario - many riders close together at high speed
            for (let i = 1; i <= 20; i++) {
                await positionTracker.processPositionUpdate({
                    riderId: `sprinter${i}`,
                    position: i,
                    speed: 16, // High speed (57.6 km/h)
                    timeFromStart: 3600 + i, // Very close together
                    timestamp: new Date().toISOString(),
                    source: 'test-source'
                });
            }

            positionTracker.detectGroups();
            positionTracker.updateRaceState();

            expect(positionTracker.raceState.tacticalSituation).toBe('sprint');
        });

        test('should detect climbing situation', async () => {
            // Create climbing scenario - slow speeds
            for (let i = 1; i <= 10; i++) {
                await positionTracker.processPositionUpdate({
                    riderId: `climber${i}`,
                    position: i,
                    speed: 6, // Slow climbing speed
                    altitude: 1000 + i * 10, // Gaining altitude
                    timestamp: new Date().toISOString(),
                    source: 'test-source'
                });
            }

            positionTracker.updateRaceState();

            expect(positionTracker.raceState.tacticalSituation).toBe('climb');
        });
    });

    describe('Performance and Load Testing', () => {
        test('should handle large number of position updates', async () => {
            const updatePromises = [];
            const startTime = Date.now();

            // Process 1000 position updates
            for (let i = 1; i <= 1000; i++) {
                updatePromises.push(positionTracker.processPositionUpdate({
                    riderId: `rider${i}`,
                    position: i,
                    speed: 10 + Math.random() * 10,
                    timestamp: new Date().toISOString(),
                    source: 'test-source'
                }));
            }

            await Promise.all(updatePromises);
            const endTime = Date.now();

            expect(positionTracker.positions.size).toBe(1000);
            expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
            expect(positionTracker.stats.errors).toBe(0);
        });

        test('should maintain performance during group detection', async () => {
            // Add many riders
            for (let i = 1; i <= 200; i++) {
                await positionTracker.processPositionUpdate({
                    riderId: `rider${i}`,
                    position: i,
                    timeFromStart: 3600 + Math.floor(i / 10) * 30, // Groups of 10 riders
                    timestamp: new Date().toISOString(),
                    source: 'test-source'
                });
            }

            const startTime = Date.now();
            positionTracker.detectGroups();
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
            expect(positionTracker.groups.size).toBeGreaterThan(0);
        });

        test('should handle rapid position updates for same rider', async () => {
            const riderId = 'rapid-rider';
            const updatePromises = [];

            // Send 100 rapid updates for same rider
            for (let i = 0; i < 100; i++) {
                updatePromises.push(positionTracker.processPositionUpdate({
                    riderId: riderId,
                    position: 1,
                    timestamp: new Date(Date.now() + i * 100).toISOString(), // Every 100ms
                    source: 'test-source'
                }));
            }

            await Promise.all(updatePromises);

            expect(positionTracker.positions.has(riderId)).toBe(true);
            const history = positionTracker.positionHistory.get(riderId);
            expect(history.length).toBeLessThanOrEqual(100); // Should limit history
        });
    });

    describe('Data Retrieval', () => {
        test('should get current positions', async () => {
            await positionTracker.processPositionUpdate({
                riderId: 'rider1',
                position: 1,
                name: 'Test Rider',
                timestamp: new Date().toISOString(),
                source: 'test-source'
            });

            const positions = positionTracker.getCurrentPositions();
            
            expect(positions).toBeInstanceOf(Array);
            expect(positions.length).toBe(1);
            expect(positions[0].riderId).toBe('rider1');
            expect(positions[0].name).toBe('Test Rider');
        });

        test('should get rider position by ID', async () => {
            await positionTracker.processPositionUpdate({
                riderId: 'rider1',
                position: 1,
                timestamp: new Date().toISOString(),
                source: 'test-source'
            });

            const position = positionTracker.getRiderPosition('rider1');
            expect(position).not.toBeNull();
            expect(position.riderId).toBe('rider1');

            const nonExistent = positionTracker.getRiderPosition('nonexistent');
            expect(nonExistent).toBeNull();
        });

        test('should get rider history', async () => {
            const riderId = 'rider1';
            
            // Add multiple position updates
            for (let i = 0; i < 5; i++) {
                await positionTracker.processPositionUpdate({
                    riderId: riderId,
                    position: 1,
                    timestamp: new Date(Date.now() + i * 1000).toISOString(),
                    source: 'test-source'
                });
            }

            const history = positionTracker.getRiderHistory(riderId);
            expect(history).toBeInstanceOf(Array);
            expect(history.length).toBe(5);
        });

        test('should get current groups', async () => {
            // Add riders and detect groups
            for (let i = 1; i <= 5; i++) {
                await positionTracker.processPositionUpdate({
                    riderId: `rider${i}`,
                    position: i,
                    timeFromStart: 3600 + i,
                    timestamp: new Date().toISOString(),
                    source: 'test-source'
                });
            }

            positionTracker.detectGroups();
            const groups = positionTracker.getCurrentGroups();
            
            expect(groups).toBeInstanceOf(Array);
            expect(groups.length).toBeGreaterThan(0);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle missing rider data gracefully', async () => {
            const result = await positionTracker.processPositionUpdate(null);
            expect(result).toBe(false);
            expect(positionTracker.stats.errors).toBeGreaterThan(0);
        });

        test('should handle duplicate rider IDs in groups', () => {
            const group = new RiderGroup('test-group');
            
            group.addRider('rider1');
            group.addRider('rider1'); // Duplicate
            
            expect(group.size).toBe(1); // Should not duplicate
        });

        test('should handle position updates with missing coordinates', async () => {
            const result = await positionTracker.processPositionUpdate({
                riderId: 'rider1',
                position: 1,
                latitude: null,
                longitude: null,
                timestamp: new Date().toISOString(),
                source: 'test-source'
            });

            expect(result).toBe(true); // Should still process
            const position = positionTracker.getRiderPosition('rider1');
            expect(position.latitude).toBeNull();
            expect(position.longitude).toBeNull();
        });

        test('should handle concurrent position updates', async () => {
            const promises = [];
            
            // Send concurrent updates for different riders
            for (let i = 1; i <= 50; i++) {
                promises.push(positionTracker.processPositionUpdate({
                    riderId: `rider${i}`,
                    position: i,
                    timestamp: new Date().toISOString(),
                    source: 'test-source'
                }));
            }

            const results = await Promise.all(promises);
            
            expect(results.every(result => result === true)).toBe(true);
            expect(positionTracker.positions.size).toBe(50);
        });

        test('should handle empty group metrics calculation', () => {
            const group = new RiderGroup('empty-group');
            const positions = new Map();
            
            group.updateMetrics(positions);
            
            expect(group.avgPosition).toBeNull();
            expect(group.avgSpeed).toBeNull();
        });

        test('should handle interpolation with missing speed data', () => {
            const position = new RiderPosition({
                riderId: 'rider1',
                latitude: 45.0,
                longitude: 2.0,
                speed: null, // Missing speed
                heading: 90,
                timestamp: new Date()
            });

            const futureTime = new Date(Date.now() + 5000);
            const interpolated = position.interpolatePosition(futureTime);
            
            expect(interpolated).toBeNull(); // Should not interpolate without speed
        });

        test('should handle very large time gaps', async () => {
            await positionTracker.processPositionUpdate({
                riderId: 'rider1',
                position: 1,
                timeFromStart: 3600,
                timestamp: new Date().toISOString(),
                source: 'test-source'
            });

            await positionTracker.processPositionUpdate({
                riderId: 'rider2',
                position: 2,
                timeFromStart: 7200, // 1 hour behind
                timestamp: new Date().toISOString(),
                source: 'test-source'
            });

            const gaps = positionTracker.calculateGaps();
            const rider2Gap = gaps.get('rider2');
            
            expect(rider2Gap.gapToPrevious).toBe(3600); // 1 hour
            expect(rider2Gap.gapToLeader).toBe(3600);
        });

        test('should handle malformed JSON in position history', async () => {
            await positionTracker.processPositionUpdate({
                riderId: 'rider1',
                position: 1,
                timestamp: new Date().toISOString(),
                source: 'test-source',
                extraData: { nested: { very: { deep: 'data' } } } // Complex nested data
            });

            const history = positionTracker.getRiderHistory('rider1');
            expect(history).toBeInstanceOf(Array);
            expect(history.length).toBe(1);
        });
    });

    describe('Memory Management', () => {
        test('should limit position history size', async () => {
            const riderId = 'rider1';
            
            // Add more than 100 position updates
            for (let i = 0; i < 150; i++) {
                await positionTracker.processPositionUpdate({
                    riderId: riderId,
                    position: 1,
                    timestamp: new Date(Date.now() + i * 1000).toISOString(),
                    source: 'test-source'
                });
            }

            const history = positionTracker.positionHistory.get(riderId);
            expect(history.length).toBeLessThanOrEqual(100); // Should be limited
        });

        test('should cleanup resources on stop', async () => {
            await positionTracker.processPositionUpdate({
                riderId: 'rider1',
                position: 1,
                timestamp: new Date().toISOString(),
                source: 'test-source'
            });

            expect(positionTracker.positions.size).toBe(1);
            
            await positionTracker.stop();
            
            // Check that timers are cleared
            expect(positionTracker.updateTimer).toBeNull();
        });
    });

    describe('Statistics and Monitoring', () => {
        test('should track processing statistics', async () => {
            const initialStats = positionTracker.getStats();
            
            await positionTracker.processPositionUpdate({
                riderId: 'rider1',
                position: 1,
                timestamp: new Date().toISOString(),
                source: 'test-source'
            });

            const updatedStats = positionTracker.getStats();
            
            expect(updatedStats.positionsProcessed).toBeGreaterThan(initialStats.positionsProcessed);
            expect(updatedStats.activeRiders).toBe(1);
        });

        test('should track interpolation statistics', async () => {
            const oldTimestamp = new Date(Date.now() - 8000);
            
            await positionTracker.processPositionUpdate({
                riderId: 'rider1',
                position: 1,
                speed: 10,
                heading: 90,
                timestamp: oldTimestamp.toISOString(),
                source: 'test-source'
            });

            const initialInterpolations = positionTracker.stats.interpolationsPerformed;
            positionTracker.interpolatePositions();
            
            expect(positionTracker.stats.interpolationsPerformed).toBeGreaterThan(initialInterpolations);
        });

        test('should track error statistics', async () => {
            const initialErrors = positionTracker.stats.errors;
            
            // Send invalid data
            await positionTracker.processPositionUpdate({
                riderId: '', // Invalid
                timestamp: new Date().toISOString()
            });

            expect(positionTracker.stats.errors).toBeGreaterThan(initialErrors);
        });
    });
});