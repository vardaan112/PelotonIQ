/**
 * Tactical Event Detection System for PelotonIQ
 * Automatically detects and classifies tactical events like attacks, crashes, and mechanical issues during live races
 */

const EventEmitter = require('events');
const Redis = require('redis');
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
        new winston.transports.File({ filename: 'logs/tactical-events.log' }),
        new winston.transports.Console()
    ]
});

/**
 * Tactical event data structure
 */
class TacticalEvent {
    constructor(data) {
        this.id = data.id || this.generateEventId();
        this.type = data.type; // attack, crash, mechanical, breakaway, chase, sprint, etc.
        this.severity = data.severity || 'medium'; // low, medium, high, critical
        this.confidence = data.confidence || 1.0; // 0.0 - 1.0
        this.timestamp = new Date(data.timestamp);
        this.location = data.location || null; // {latitude, longitude, name}
        this.raceDistance = data.raceDistance || null; // Distance from start in meters
        this.involvedRiders = data.involvedRiders || []; // Array of rider IDs
        this.triggerData = data.triggerData || {}; // Original data that triggered detection
        this.description = data.description || '';
        this.impactAssessment = data.impactAssessment || null;
        this.source = data.source || 'auto_detection'; // auto_detection, manual, social_media, broadcast
        this.tags = data.tags || [];
        this.metadata = data.metadata || {};
        this.verificationStatus = data.verificationStatus || 'unverified'; // unverified, pending, verified, false_positive
        this.relatedEvents = data.relatedEvents || []; // IDs of related events
    }

    generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Calculate event impact on race dynamics
     */
    calculateImpact() {
        let impact = {
            raceFlow: 'minimal', // minimal, moderate, significant, major
            tacticalSignificance: 'low', // low, medium, high, critical
            affectedRiders: this.involvedRiders.length,
            estimatedTimeDelay: 0,
            groupSplit: false,
            gc_impact: false
        };

        switch (this.type) {
            case 'crash':
                impact.raceFlow = this.severity === 'critical' ? 'major' : 'significant';
                impact.tacticalSignificance = this.involvedRiders.length > 5 ? 'critical' : 'high';
                impact.estimatedTimeDelay = this.involvedRiders.length * 30; // 30 seconds per rider
                impact.groupSplit = this.involvedRiders.length > 3;
                impact.gc_impact = this.tags.includes('gc_contender');
                break;

            case 'attack':
                impact.raceFlow = 'significant';
                impact.tacticalSignificance = this.tags.includes('gc_attack') ? 'critical' : 'high';
                impact.groupSplit = true;
                impact.gc_impact = this.tags.includes('gc_contender');
                break;

            case 'mechanical':
                impact.raceFlow = this.tags.includes('team_leader') ? 'significant' : 'moderate';
                impact.tacticalSignificance = this.tags.includes('gc_contender') ? 'high' : 'medium';
                impact.estimatedTimeDelay = this.severity === 'high' ? 180 : 60; // Bike change vs quick fix
                impact.gc_impact = this.tags.includes('gc_contender');
                break;

            case 'breakaway':
                impact.raceFlow = 'significant';
                impact.tacticalSignificance = this.involvedRiders.length > 1 ? 'high' : 'medium';
                impact.groupSplit = true;
                break;

            case 'sprint':
                impact.raceFlow = 'significant';
                impact.tacticalSignificance = 'high';
                impact.groupSplit = false;
                break;

            case 'weather_event':
                impact.raceFlow = this.severity === 'high' ? 'major' : 'moderate';
                impact.tacticalSignificance = 'medium';
                impact.groupSplit = this.severity === 'high';
                break;

            default:
                impact.raceFlow = 'minimal';
                impact.tacticalSignificance = 'low';
        }

        this.impactAssessment = impact;
        return impact;
    }

    /**
     * Add verification information
     */
    verify(verificationData) {
        this.verificationStatus = verificationData.status;
        this.metadata.verification = {
            verifiedBy: verificationData.verifiedBy,
            verifiedAt: new Date(),
            notes: verificationData.notes || '',
            sources: verificationData.sources || []
        };
    }

    /**
     * Link related events
     */
    linkRelatedEvent(eventId, relationship = 'related') {
        if (!this.relatedEvents.find(rel => rel.eventId === eventId)) {
            this.relatedEvents.push({
                eventId: eventId,
                relationship: relationship, // related, consequence, precursor, concurrent
                timestamp: new Date()
            });
        }
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            severity: this.severity,
            confidence: this.confidence,
            timestamp: this.timestamp.toISOString(),
            location: this.location,
            raceDistance: this.raceDistance,
            involvedRiders: this.involvedRiders,
            triggerData: this.triggerData,
            description: this.description,
            impactAssessment: this.impactAssessment,
            source: this.source,
            tags: this.tags,
            metadata: this.metadata,
            verificationStatus: this.verificationStatus,
            relatedEvents: this.relatedEvents
        };
    }
}

/**
 * Pattern matching engine for tactical events
 */
class PatternMatcher {
    constructor() {
        this.patterns = new Map();
        this.registerDefaultPatterns();
    }

    registerDefaultPatterns() {
        // Attack pattern
        this.registerPattern('attack', {
            name: 'Attack Detection',
            description: 'Sudden acceleration with gap creation',
            conditions: [
                {
                    field: 'speedIncrease',
                    operator: 'gt',
                    value: 3, // m/s increase
                    timeWindow: 10000 // within 10 seconds
                },
                {
                    field: 'positionImprovement',
                    operator: 'gt',
                    value: 5 // moved up 5+ positions
                },
                {
                    field: 'gapToGroup',
                    operator: 'gt',
                    value: 10 // 10+ second gap
                }
            ],
            confidence: 0.8,
            severity: 'medium'
        });

        // Crash pattern
        this.registerPattern('crash', {
            name: 'Crash Detection',
            description: 'Sudden stop or dramatic speed reduction',
            conditions: [
                {
                    field: 'speedDecrease',
                    operator: 'gt',
                    value: 10, // Sudden 10+ m/s decrease
                    timeWindow: 5000
                },
                {
                    field: 'positionDrop',
                    operator: 'gt',
                    value: 20 // Dropped 20+ positions
                }
            ],
            confidence: 0.9,
            severity: 'high'
        });

        // Mechanical issue pattern
        this.registerPattern('mechanical', {
            name: 'Mechanical Issue',
            description: 'Gradual speed reduction with position loss',
            conditions: [
                {
                    field: 'speedDecrease',
                    operator: 'gt',
                    value: 5,
                    timeWindow: 30000 // Over 30 seconds
                },
                {
                    field: 'positionDrop',
                    operator: 'gt',
                    value: 10
                },
                {
                    field: 'steadyDeceleration',
                    operator: 'eq',
                    value: true
                }
            ],
            confidence: 0.7,
            severity: 'medium'
        });

        // Breakaway pattern
        this.registerPattern('breakaway', {
            name: 'Breakaway Formation',
            description: 'Group of riders gaining time on peloton',
            conditions: [
                {
                    field: 'groupSize',
                    operator: 'between',
                    value: [2, 20] // 2-20 riders
                },
                {
                    field: 'gapToPeloton',
                    operator: 'gt',
                    value: 30 // 30+ seconds
                },
                {
                    field: 'sustainedGap',
                    operator: 'eq',
                    value: true,
                    timeWindow: 300000 // 5 minutes
                }
            ],
            confidence: 0.85,
            severity: 'medium'
        });

        // Sprint pattern
        this.registerPattern('sprint', {
            name: 'Sprint Detection',
            description: 'High-speed finish with close grouping',
            conditions: [
                {
                    field: 'averageSpeed',
                    operator: 'gt',
                    value: 16 // > 57.6 km/h
                },
                {
                    field: 'groupCompactness',
                    operator: 'lt',
                    value: 100 // Within 100 meters
                },
                {
                    field: 'distanceToFinish',
                    operator: 'lt',
                    value: 5000 // Within 5km of finish
                }
            ],
            confidence: 0.8,
            severity: 'medium'
        });

        // Chase pattern
        this.registerPattern('chase', {
            name: 'Chase Group',
            description: 'Group chasing breakaway or leaders',
            conditions: [
                {
                    field: 'groupSize',
                    operator: 'gt',
                    value: 5
                },
                {
                    field: 'speedIncrease',
                    operator: 'gt',
                    value: 2
                },
                {
                    field: 'gapDecreasing',
                    operator: 'eq',
                    value: true,
                    timeWindow: 180000 // 3 minutes
                }
            ],
            confidence: 0.75,
            severity: 'medium'
        });
    }

    registerPattern(type, pattern) {
        this.patterns.set(type, {
            ...pattern,
            type: type,
            registeredAt: new Date()
        });

        logger.debug('Pattern registered', { type, pattern: pattern.name });
    }

    matchPatterns(data) {
        const matches = [];

        for (const [type, pattern] of this.patterns) {
            const match = this.evaluatePattern(pattern, data);
            if (match.matches) {
                matches.push({
                    type: type,
                    pattern: pattern,
                    confidence: match.confidence,
                    matchedConditions: match.matchedConditions,
                    score: match.score
                });
            }
        }

        // Sort by confidence score
        return matches.sort((a, b) => b.confidence - a.confidence);
    }

    evaluatePattern(pattern, data) {
        const result = {
            matches: false,
            confidence: 0,
            matchedConditions: [],
            score: 0
        };

        let conditionsMet = 0;
        const totalConditions = pattern.conditions.length;

        for (const condition of pattern.conditions) {
            if (this.evaluateCondition(condition, data)) {
                conditionsMet++;
                result.matchedConditions.push(condition);
            }
        }

        const matchRatio = conditionsMet / totalConditions;
        
        // Require at least 70% of conditions to be met
        if (matchRatio >= 0.7) {
            result.matches = true;
            result.confidence = pattern.confidence * matchRatio;
            result.score = result.confidence * (pattern.severity === 'high' ? 1.2 : 
                                            pattern.severity === 'medium' ? 1.0 : 0.8);
        }

        return result;
    }

    evaluateCondition(condition, data) {
        const value = this.getNestedValue(data, condition.field);
        if (value === undefined || value === null) return false;

        switch (condition.operator) {
            case 'gt':
                return value > condition.value;
            case 'lt':
                return value < condition.value;
            case 'eq':
                return value === condition.value;
            case 'gte':
                return value >= condition.value;
            case 'lte':
                return value <= condition.value;
            case 'between':
                return Array.isArray(condition.value) && 
                       value >= condition.value[0] && 
                       value <= condition.value[1];
            case 'in':
                return Array.isArray(condition.value) && 
                       condition.value.includes(value);
            case 'contains':
                return typeof value === 'string' && 
                       value.toLowerCase().includes(condition.value.toLowerCase());
            default:
                return false;
        }
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => 
            current && current[key] !== undefined ? current[key] : undefined, obj);
    }
}

/**
 * Multi-source event correlation engine
 */
class EventCorrelator {
    constructor() {
        this.correlationRules = new Map();
        this.temporalWindow = 300000; // 5 minutes
        this.spatialThreshold = 1000; // 1km
        this.registerDefaultRules();
    }

    registerDefaultRules() {
        // Crash-mechanical correlation
        this.addCorrelationRule('crash_mechanical', {
            primaryType: 'crash',
            secondaryType: 'mechanical',
            maxTimeGap: 180000, // 3 minutes
            maxDistance: 500, // 500 meters
            confidence: 0.8,
            relationship: 'consequence'
        });

        // Attack-chase correlation
        this.addCorrelationRule('attack_chase', {
            primaryType: 'attack',
            secondaryType: 'chase',
            maxTimeGap: 120000, // 2 minutes
            maxDistance: 2000, // 2km
            confidence: 0.9,
            relationship: 'consequence'
        });

        // Multiple crash correlation
        this.addCorrelationRule('multiple_crash', {
            primaryType: 'crash',
            secondaryType: 'crash',
            maxTimeGap: 30000, // 30 seconds
            maxDistance: 200, // 200 meters
            confidence: 0.95,
            relationship: 'concurrent'
        });
    }

    addCorrelationRule(name, rule) {
        this.correlationRules.set(name, rule);
    }

    correlatEvents(events) {
        const correlations = [];
        
        for (let i = 0; i < events.length; i++) {
            for (let j = i + 1; j < events.length; j++) {
                const correlation = this.findCorrelation(events[i], events[j]);
                if (correlation) {
                    correlations.push(correlation);
                }
            }
        }

        return correlations;
    }

    findCorrelation(event1, event2) {
        for (const [ruleName, rule] of this.correlationRules) {
            if (this.matchesRule(event1, event2, rule)) {
                return {
                    rule: ruleName,
                    primaryEvent: event1,
                    secondaryEvent: event2,
                    confidence: rule.confidence,
                    relationship: rule.relationship,
                    timeDifference: Math.abs(event2.timestamp - event1.timestamp),
                    spatialDistance: this.calculateDistance(event1, event2)
                };
            }
        }
        return null;
    }

    matchesRule(event1, event2, rule) {
        // Check event types
        const typeMatch = (event1.type === rule.primaryType && event2.type === rule.secondaryType) ||
                         (event1.type === rule.secondaryType && event2.type === rule.primaryType);
        
        if (!typeMatch) return false;

        // Check temporal proximity
        const timeDiff = Math.abs(event2.timestamp - event1.timestamp);
        if (timeDiff > rule.maxTimeGap) return false;

        // Check spatial proximity
        const distance = this.calculateDistance(event1, event2);
        if (distance > rule.maxDistance) return false;

        return true;
    }

    calculateDistance(event1, event2) {
        if (!event1.location || !event2.location) return 0;

        const lat1 = event1.location.latitude;
        const lon1 = event1.location.longitude;
        const lat2 = event2.location.latitude;
        const lon2 = event2.location.longitude;

        const R = 6371000; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }
}

/**
 * Main Tactical Event Detection System
 */
class TacticalEventDetector extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            detectionInterval: options.detectionInterval || 5000, // 5 seconds
            eventRetention: options.eventRetention || 86400000, // 24 hours
            confidenceThreshold: options.confidenceThreshold || 0.6,
            socialMediaEnabled: options.socialMediaEnabled || false,
            broadcastDataEnabled: options.broadcastDataEnabled || false,
            redisUrl: options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
            maxEventsInMemory: options.maxEventsInMemory || 1000,
            ...options
        };

        // Core components
        this.patternMatcher = new PatternMatcher();
        this.eventCorrelator = new EventCorrelator();

        // Data storage
        this.activeEvents = new Map(); // eventId -> TacticalEvent
        this.eventHistory = []; // Sliding window of recent events
        this.riderProfiles = new Map(); // riderId -> rider performance profile
        this.raceState = null; // Current race state from position tracker

        // Data sources
        this.positionData = new Map(); // riderId -> recent position history
        this.socialMediaFeeds = new Map(); // sourceId -> feed data
        this.broadcastData = new Map(); // sourceId -> broadcast annotations

        // Performance tracking
        this.stats = {
            eventsDetected: 0,
            eventsVerified: 0,
            falsePositives: 0,
            averageDetectionTime: 0,
            patternMatches: 0,
            correlationsFound: 0,
            lastDetectionTime: null
        };

        // Internal state
        this.redis = null;
        this.detectionTimer = null;
        this.isRunning = false;

        this.initializeRedis();
        this.buildRiderProfiles();
    }

    /**
     * Initialize Redis connection
     */
    async initializeRedis() {
        try {
            this.redis = Redis.createClient({ url: this.options.redisUrl });
            
            this.redis.on('error', (err) => {
                logger.error('Redis connection error:', err);
                this.emit('redis-error', err);
            });

            await this.redis.connect();
            logger.info('Tactical Event Detector Redis connection established');
            
        } catch (error) {
            logger.error('Failed to initialize Redis:', error);
            throw error;
        }
    }

    /**
     * Build rider performance profiles for better detection
     */
    buildRiderProfiles() {
        // This would typically load from historical data
        // For now, create basic profiles
        const defaultProfile = {
            averageSpeed: 14, // m/s
            maxSpeed: 22,
            sprintCapability: 0.5, // 0-1 scale
            climbingAbility: 0.5,
            attackFrequency: 0.1, // attacks per race
            crashHistory: 0,
            mechanicalHistory: 0,
            lastUpdated: new Date()
        };

        // Create profiles for test riders
        for (let i = 1; i <= 200; i++) {
            this.riderProfiles.set(`rider${i}`, {
                ...defaultProfile,
                riderId: `rider${i}`,
                sprintCapability: Math.random(),
                climbingAbility: Math.random(),
                attackFrequency: Math.random() * 0.3
            });
        }

        logger.info('Rider profiles initialized', { profileCount: this.riderProfiles.size });
    }

    /**
     * Start event detection
     */
    async start() {
        if (this.isRunning) {
            logger.warn('Tactical event detector already running');
            return;
        }

        this.isRunning = true;

        // Start detection loop
        this.detectionTimer = setInterval(() => {
            this.performDetection();
        }, this.options.detectionInterval);

        // Load recent events from Redis
        await this.loadRecentEvents();

        logger.info('Tactical event detection started', {
            detectionInterval: this.options.detectionInterval,
            confidenceThreshold: this.options.confidenceThreshold
        });

        this.emit('detector-started');
    }

    /**
     * Stop event detection
     */
    async stop() {
        this.isRunning = false;

        if (this.detectionTimer) {
            clearInterval(this.detectionTimer);
            this.detectionTimer = null;
        }

        // Save active events to Redis
        await this.saveActiveEvents();

        if (this.redis) {
            await this.redis.quit();
        }

        logger.info('Tactical event detection stopped');
        this.emit('detector-stopped');
    }

    /**
     * Update position data for riders
     */
    updatePositionData(positionUpdates) {
        const startTime = performance.now();

        for (const update of positionUpdates) {
            const riderId = update.riderId;
            
            if (!this.positionData.has(riderId)) {
                this.positionData.set(riderId, []);
            }

            const history = this.positionData.get(riderId);
            history.push({
                ...update,
                timestamp: new Date(update.timestamp),
                processingTime: new Date()
            });

            // Keep only last 10 minutes of data
            const cutoff = Date.now() - 600000;
            const filtered = history.filter(pos => pos.timestamp.getTime() > cutoff);
            this.positionData.set(riderId, filtered);
        }

        // Trigger detection if we have significant new data
        if (positionUpdates.length > 10) {
            setImmediate(() => this.performDetection());
        }

        logger.debug('Position data updated', {
            updates: positionUpdates.length,
            processingTime: performance.now() - startTime
        });
    }

    /**
     * Update race state information
     */
    updateRaceState(raceState) {
        this.raceState = {
            ...raceState,
            lastUpdated: new Date()
        };

        logger.debug('Race state updated', { 
            tacticalSituation: raceState.tacticalSituation,
            activeRiders: raceState.activeRiders
        });
    }

    /**
     * Main detection logic
     */
    async performDetection() {
        if (!this.isRunning) return;

        const startTime = performance.now();

        try {
            // Analyze position data for patterns
            const detectedEvents = await this.analyzePositionPatterns();
            
            // Correlate with social media if enabled
            if (this.options.socialMediaEnabled) {
                await this.correlateSocialMedia(detectedEvents);
            }

            // Correlate with broadcast data if enabled
            if (this.options.broadcastDataEnabled) {
                await this.correlateBroadcastData(detectedEvents);
            }

            // Find correlations between events
            const correlations = this.eventCorrelator.correlatEvents(detectedEvents);
            await this.processCorrelations(correlations);

            // Process and store new events
            for (const event of detectedEvents) {
                await this.processDetectedEvent(event);
            }

            // Clean up old events
            this.cleanupOldEvents();

            // Update statistics
            const detectionTime = performance.now() - startTime;
            this.updateDetectionStats(detectionTime, detectedEvents.length);

            this.emit('detection-cycle-completed', {
                eventsDetected: detectedEvents.length,
                correlationsFound: correlations.length,
                detectionTime: detectionTime
            });

        } catch (error) {
            logger.error('Error in detection cycle', { error: error.message });
            this.emit('detection-error', error);
        }
    }

    /**
     * Analyze position data for tactical patterns
     */
    async analyzePositionPatterns() {
        const detectedEvents = [];
        const riders = Array.from(this.positionData.keys());

        for (const riderId of riders) {
            const history = this.positionData.get(riderId);
            if (history.length < 3) continue; // Need minimum data

            // Analyze individual rider patterns
            const riderEvents = await this.analyzeRiderBehavior(riderId, history);
            detectedEvents.push(...riderEvents);
        }

        // Analyze group patterns
        const groupEvents = await this.analyzeGroupBehavior();
        detectedEvents.push(...groupEvents);

        return detectedEvents;
    }

    /**
     * Analyze individual rider behavior
     */
    async analyzeRiderBehavior(riderId, history) {
        const events = [];
        const profile = this.riderProfiles.get(riderId) || {};

        // Calculate movement metrics
        const metrics = this.calculateRiderMetrics(history);
        
        // Prepare data for pattern matching
        const patternData = {
            riderId: riderId,
            speedIncrease: metrics.speedIncrease,
            speedDecrease: metrics.speedDecrease,
            positionImprovement: metrics.positionImprovement,
            positionDrop: metrics.positionDrop,
            gapToGroup: metrics.gapToGroup,
            steadyDeceleration: metrics.steadyDeceleration,
            currentSpeed: metrics.currentSpeed,
            averageSpeed: metrics.averageSpeed,
            profile: profile
        };

        // Match against patterns
        const matches = this.patternMatcher.matchPatterns(patternData);

        for (const match of matches) {
            if (match.confidence >= this.options.confidenceThreshold) {
                const event = new TacticalEvent({
                    type: match.type,
                    severity: match.pattern.severity,
                    confidence: match.confidence,
                    timestamp: history[history.length - 1].timestamp,
                    location: this.extractLocation(history[history.length - 1]),
                    raceDistance: history[history.length - 1].distanceFromStart,
                    involvedRiders: [riderId],
                    triggerData: {
                        metrics: metrics,
                        patternMatch: match,
                        positionHistory: history.slice(-5) // Last 5 positions
                    },
                    description: this.generateEventDescription(match.type, riderId, metrics),
                    source: 'auto_detection',
                    tags: this.generateEventTags(riderId, match.type, profile)
                });

                event.calculateImpact();
                events.push(event);

                this.stats.patternMatches++;
            }
        }

        return events;
    }

    /**
     * Calculate rider movement metrics
     */
    calculateRiderMetrics(history) {
        if (history.length < 2) return {};

        const current = history[history.length - 1];
        const previous = history[history.length - 2];
        const start = history[0];

        const metrics = {
            speedIncrease: 0,
            speedDecrease: 0,
            positionImprovement: 0,
            positionDrop: 0,
            gapToGroup: current.timeFromStart || 0,
            steadyDeceleration: false,
            currentSpeed: current.speed || 0,
            averageSpeed: 0
        };

        // Speed changes
        if (current.speed && previous.speed) {
            const speedDiff = current.speed - previous.speed;
            if (speedDiff > 0) {
                metrics.speedIncrease = speedDiff;
            } else {
                metrics.speedDecrease = Math.abs(speedDiff);
            }
        }

        // Position changes
        if (current.position && previous.position) {
            const positionDiff = previous.position - current.position; // Positive = improved
            if (positionDiff > 0) {
                metrics.positionImprovement = positionDiff;
            } else {
                metrics.positionDrop = Math.abs(positionDiff);
            }
        }

        // Average speed
        const speeds = history.map(h => h.speed).filter(s => s > 0);
        if (speeds.length > 0) {
            metrics.averageSpeed = speeds.reduce((sum, s) => sum + s, 0) / speeds.length;
        }

        // Steady deceleration check
        if (history.length >= 3) {
            const recent = history.slice(-3);
            const decelerating = recent.every((pos, i) => 
                i === 0 || pos.speed < recent[i-1].speed
            );
            metrics.steadyDeceleration = decelerating;
        }

        return metrics;
    }

    /**
     * Analyze group behavior patterns
     */
    async analyzeGroupBehavior() {
        const events = [];
        
        if (!this.raceState || !this.raceState.groups) {
            return events;
        }

        // Analyze each group
        for (const group of this.raceState.groups) {
            const groupData = {
                groupId: group.id,
                groupSize: group.size,
                groupType: group.groupType,
                avgSpeed: group.avgSpeed,
                gapToPeloton: group.gapToPrevious || 0,
                sustainedGap: await this.checkSustainedGap(group),
                distanceToFinish: this.calculateDistanceToFinish(),
                groupCompactness: this.calculateGroupCompactness(group)
            };

            const matches = this.patternMatcher.matchPatterns(groupData);

            for (const match of matches) {
                if (match.confidence >= this.options.confidenceThreshold) {
                    const event = new TacticalEvent({
                        type: match.type,
                        severity: match.pattern.severity,
                        confidence: match.confidence,
                        timestamp: new Date(),
                        involvedRiders: Array.from(group.riders),
                        triggerData: {
                            groupData: groupData,
                            patternMatch: match
                        },
                        description: this.generateGroupEventDescription(match.type, group),
                        source: 'auto_detection',
                        tags: this.generateGroupEventTags(match.type, group)
                    });

                    event.calculateImpact();
                    events.push(event);
                }
            }
        }

        return events;
    }

    /**
     * Check if a group has maintained a sustained gap
     */
    async checkSustainedGap(group) {
        // This would check historical gap data
        // For now, simulate based on group type
        return group.groupType === 'breakaway' && group.gapToPrevious > 30;
    }

    /**
     * Calculate distance to finish line
     */
    calculateDistanceToFinish() {
        if (!this.raceState || !this.raceState.remainingKm) {
            return 50000; // Default 50km
        }
        return this.raceState.remainingKm * 1000;
    }

    /**
     * Calculate group compactness
     */
    calculateGroupCompactness(group) {
        // Estimate based on group size and type
        const baseCompactness = {
            'solo': 0,
            'small_group': 50,
            'chase_group': 100,
            'peloton': 200
        };

        return baseCompactness[group.groupType] || 100;
    }

    /**
     * Process detected event
     */
    async processDetectedEvent(event) {
        // Check for duplicates
        const existingEvent = this.findSimilarEvent(event);
        if (existingEvent) {
            await this.mergeEvents(existingEvent, event);
            return;
        }

        // Store event
        this.activeEvents.set(event.id, event);
        this.eventHistory.push(event);

        // Limit memory usage
        if (this.eventHistory.length > this.options.maxEventsInMemory) {
            this.eventHistory.shift();
        }

        // Store in Redis
        await this.storeEventInRedis(event);

        // Emit event
        this.emit('event-detected', event.toJSON());

        this.stats.eventsDetected++;
        this.stats.lastDetectionTime = new Date();

        logger.info('Tactical event detected', {
            eventId: event.id,
            type: event.type,
            severity: event.severity,
            confidence: event.confidence,
            involvedRiders: event.involvedRiders.length
        });
    }

    /**
     * Find similar existing event
     */
    findSimilarEvent(newEvent) {
        const timeWindow = 60000; // 1 minute
        const distanceThreshold = 500; // 500 meters

        for (const [eventId, existingEvent] of this.activeEvents) {
            // Check temporal proximity
            const timeDiff = Math.abs(newEvent.timestamp - existingEvent.timestamp);
            if (timeDiff > timeWindow) continue;

            // Check event type
            if (newEvent.type !== existingEvent.type) continue;

            // Check spatial proximity
            if (newEvent.location && existingEvent.location) {
                const distance = this.eventCorrelator.calculateDistance(newEvent, existingEvent);
                if (distance > distanceThreshold) continue;
            }

            // Check rider overlap
            const riderOverlap = newEvent.involvedRiders.filter(rid => 
                existingEvent.involvedRiders.includes(rid)
            );
            
            if (riderOverlap.length > 0) {
                return existingEvent;
            }
        }

        return null;
    }

    /**
     * Merge similar events
     */
    async mergeEvents(existingEvent, newEvent) {
        // Combine rider lists
        const allRiders = new Set([...existingEvent.involvedRiders, ...newEvent.involvedRiders]);
        existingEvent.involvedRiders = Array.from(allRiders);

        // Update confidence (weighted average)
        const totalWeight = existingEvent.confidence + newEvent.confidence;
        existingEvent.confidence = totalWeight / 2;

        // Merge trigger data
        if (!existingEvent.triggerData.merged) {
            existingEvent.triggerData.merged = [];
        }
        existingEvent.triggerData.merged.push(newEvent.triggerData);

        // Recalculate impact
        existingEvent.calculateImpact();

        // Update in Redis
        await this.storeEventInRedis(existingEvent);

        this.emit('event-merged', {
            existingEventId: existingEvent.id,
            mergedEventData: newEvent.toJSON()
        });

        logger.debug('Events merged', {
            existingEventId: existingEvent.id,
            involvedRiders: existingEvent.involvedRiders.length
        });
    }

    /**
     * Process event correlations
     */
    async processCorrelations(correlations) {
        for (const correlation of correlations) {
            // Link events
            correlation.primaryEvent.linkRelatedEvent(
                correlation.secondaryEvent.id, 
                correlation.relationship
            );
            correlation.secondaryEvent.linkRelatedEvent(
                correlation.primaryEvent.id, 
                correlation.relationship
            );

            // Emit correlation event
            this.emit('events-correlated', {
                primaryEvent: correlation.primaryEvent.id,
                secondaryEvent: correlation.secondaryEvent.id,
                relationship: correlation.relationship,
                confidence: correlation.confidence
            });

            this.stats.correlationsFound++;

            logger.info('Events correlated', {
                rule: correlation.rule,
                primaryEvent: correlation.primaryEvent.id,
                secondaryEvent: correlation.secondaryEvent.id,
                relationship: correlation.relationship
            });
        }
    }

    /**
     * Generate event description
     */
    generateEventDescription(type, riderId, metrics) {
        const profile = this.riderProfiles.get(riderId) || {};
        
        switch (type) {
            case 'attack':
                return `Rider ${riderId} launched an attack, increasing speed by ${metrics.speedIncrease.toFixed(1)} m/s and gaining ${metrics.positionImprovement} positions`;
            
            case 'crash':
                return `Potential crash involving rider ${riderId}, with sudden speed decrease of ${metrics.speedDecrease.toFixed(1)} m/s and position drop of ${metrics.positionDrop}`;
            
            case 'mechanical':
                return `Mechanical issue detected for rider ${riderId}, showing gradual deceleration and position loss`;
            
            default:
                return `Tactical event (${type}) detected involving rider ${riderId}`;
        }
    }

    /**
     * Generate group event description
     */
    generateGroupEventDescription(type, group) {
        switch (type) {
            case 'breakaway':
                return `Breakaway formed with ${group.size} riders, gap of ${group.gapToPrevious} seconds to peloton`;
            
            case 'sprint':
                return `Sprint detected with ${group.size} riders at ${group.avgSpeed.toFixed(1)} m/s average speed`;
            
            case 'chase':
                return `Chase group of ${group.size} riders increasing pace to close gap`;
            
            default:
                return `Group tactical event (${type}) with ${group.size} riders`;
        }
    }

    /**
     * Generate event tags
     */
    generateEventTags(riderId, eventType, profile) {
        const tags = [];
        
        // Rider classification tags
        if (profile.sprintCapability > 0.8) tags.push('sprinter');
        if (profile.climbingAbility > 0.8) tags.push('climber');
        if (profile.attackFrequency > 0.2) tags.push('aggressive_rider');
        
        // Event context tags
        if (eventType === 'attack' && profile.sprintCapability > 0.7) {
            tags.push('sprint_attack');
        }
        
        // Race situation tags
        if (this.raceState) {
            if (this.raceState.remainingKm < 10) tags.push('finale');
            if (this.raceState.tacticalSituation === 'climb') tags.push('mountain_stage');
        }

        return tags;
    }

    /**
     * Generate group event tags
     */
    generateGroupEventTags(eventType, group) {
        const tags = [];
        
        tags.push(group.groupType);
        
        if (group.size === 1) tags.push('solo');
        else if (group.size <= 5) tags.push('small_group');
        else if (group.size > 20) tags.push('large_group');
        
        if (eventType === 'breakaway' && group.gapToPrevious > 120) {
            tags.push('dangerous_break');
        }

        return tags;
    }

    /**
     * Extract location from position data
     */
    extractLocation(positionData) {
        if (positionData.latitude && positionData.longitude) {
            return {
                latitude: positionData.latitude,
                longitude: positionData.longitude,
                name: positionData.locationName || null
            };
        }
        return null;
    }

    /**
     * Correlate with social media feeds
     */
    async correlateSocialMedia(events) {
        // This would integrate with social media APIs
        // For now, simulate basic correlation
        logger.debug('Social media correlation not implemented');
    }

    /**
     * Correlate with broadcast data
     */
    async correlateBroadcastData(events) {
        // This would integrate with broadcast feed data
        // For now, simulate basic correlation
        logger.debug('Broadcast data correlation not implemented');
    }

    /**
     * Store event in Redis
     */
    async storeEventInRedis(event) {
        try {
            const key = `tactical_event:${event.id}`;
            const data = JSON.stringify(event.toJSON());
            
            await this.redis.setEx(key, this.options.eventRetention / 1000, data);
            
            // Add to event timeline
            await this.redis.zAdd('tactical_events:timeline', {
                score: event.timestamp.getTime(),
                value: event.id
            });

            // Keep only recent events in timeline
            const cutoff = Date.now() - this.options.eventRetention;
            await this.redis.zRemRangeByScore('tactical_events:timeline', 0, cutoff);

        } catch (error) {
            logger.warn('Failed to store event in Redis', {
                eventId: event.id,
                error: error.message
            });
        }
    }

    /**
     * Load recent events from Redis
     */
    async loadRecentEvents() {
        try {
            const eventIds = await this.redis.zRange('tactical_events:timeline', 0, -1);
            
            for (const eventId of eventIds) {
                const key = `tactical_event:${eventId}`;
                const data = await this.redis.get(key);
                
                if (data) {
                    const eventData = JSON.parse(data);
                    const event = new TacticalEvent(eventData);
                    this.activeEvents.set(event.id, event);
                }
            }

            logger.info('Recent events loaded from Redis', { 
                eventCount: this.activeEvents.size 
            });

        } catch (error) {
            logger.warn('Failed to load recent events', { error: error.message });
        }
    }

    /**
     * Save active events to Redis
     */
    async saveActiveEvents() {
        try {
            const savePromises = [];
            
            for (const [eventId, event] of this.activeEvents) {
                savePromises.push(this.storeEventInRedis(event));
            }

            await Promise.all(savePromises);
            
            logger.info('Active events saved to Redis', { 
                eventCount: this.activeEvents.size 
            });

        } catch (error) {
            logger.warn('Failed to save active events', { error: error.message });
        }
    }

    /**
     * Clean up old events
     */
    cleanupOldEvents() {
        const cutoff = Date.now() - this.options.eventRetention;
        const expiredEvents = [];

        for (const [eventId, event] of this.activeEvents) {
            if (event.timestamp.getTime() < cutoff) {
                expiredEvents.push(eventId);
            }
        }

        for (const eventId of expiredEvents) {
            this.activeEvents.delete(eventId);
        }

        // Clean up event history
        this.eventHistory = this.eventHistory.filter(event => 
            event.timestamp.getTime() >= cutoff
        );

        if (expiredEvents.length > 0) {
            logger.debug('Cleaned up expired events', { 
                expiredCount: expiredEvents.length 
            });
        }
    }

    /**
     * Update detection statistics
     */
    updateDetectionStats(detectionTime, eventsDetected) {
        const alpha = 0.1; // Smoothing factor
        this.stats.averageDetectionTime = 
            this.stats.averageDetectionTime * (1 - alpha) + detectionTime * alpha;
    }

    /**
     * Get event by ID
     */
    getEvent(eventId) {
        const event = this.activeEvents.get(eventId);
        return event ? event.toJSON() : null;
    }

    /**
     * Get events by type
     */
    getEventsByType(eventType, limit = 50) {
        return Array.from(this.activeEvents.values())
            .filter(event => event.type === eventType)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .map(event => event.toJSON());
    }

    /**
     * Get recent events
     */
    getRecentEvents(limit = 100) {
        return this.eventHistory
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .map(event => event.toJSON());
    }

    /**
     * Get events by rider
     */
    getEventsByRider(riderId, limit = 20) {
        return Array.from(this.activeEvents.values())
            .filter(event => event.involvedRiders.includes(riderId))
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .map(event => event.toJSON());
    }

    /**
     * Verify event manually
     */
    async verifyEvent(eventId, verificationData) {
        const event = this.activeEvents.get(eventId);
        if (!event) {
            throw new Error(`Event ${eventId} not found`);
        }

        event.verify(verificationData);
        await this.storeEventInRedis(event);

        if (verificationData.status === 'verified') {
            this.stats.eventsVerified++;
        } else if (verificationData.status === 'false_positive') {
            this.stats.falsePositives++;
        }

        this.emit('event-verified', {
            eventId: eventId,
            status: verificationData.status,
            verifiedBy: verificationData.verifiedBy
        });

        logger.info('Event verified', {
            eventId: eventId,
            status: verificationData.status,
            verifiedBy: verificationData.verifiedBy
        });
    }

    /**
     * Add custom pattern
     */
    addCustomPattern(type, pattern) {
        this.patternMatcher.registerPattern(type, pattern);
        
        this.emit('pattern-added', { type, pattern });
        
        logger.info('Custom pattern added', { type, pattern: pattern.name });
    }

    /**
     * Get system statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeEvents: this.activeEvents.size,
            eventHistory: this.eventHistory.length,
            riderProfiles: this.riderProfiles.size,
            patterns: this.patternMatcher.patterns.size,
            correlationRules: this.eventCorrelator.correlationRules.size,
            isRunning: this.isRunning,
            memoryUsage: process.memoryUsage()
        };
    }
}

module.exports = { TacticalEventDetector, TacticalEvent, PatternMatcher, EventCorrelator };