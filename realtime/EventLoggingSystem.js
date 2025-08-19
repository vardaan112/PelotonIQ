/**
 * Event Logging & Historical Analysis System for PelotonIQ
 * Comprehensive logging of all race events and historical data analysis
 */

const EventEmitter = require('events');
const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');
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
        new winston.transports.File({ filename: 'logs/event-logging.log' }),
        new winston.transports.Console()
    ]
});

/**
 * Event categories for classification
 */
const EventCategory = {
    RACE_EVENT: 'race_event',
    RIDER_PERFORMANCE: 'rider_performance',
    TACTICAL_EVENT: 'tactical_event',
    WEATHER_EVENT: 'weather_event',
    SYSTEM_EVENT: 'system_event',
    USER_ACTION: 'user_action',
    AI_PREDICTION: 'ai_prediction',
    DATA_QUALITY: 'data_quality'
};

/**
 * Event severity levels
 */
const EventSeverity = {
    TRACE: 1,
    DEBUG: 2,
    INFO: 3,
    WARN: 4,
    ERROR: 5,
    CRITICAL: 6
};

/**
 * Single event record with metadata
 */
class EventRecord {
    constructor(data) {
        this.id = data.id || this.generateId();
        this.timestamp = new Date(data.timestamp || Date.now());
        this.category = data.category;
        this.severity = data.severity || EventSeverity.INFO;
        this.source = data.source;
        
        // Core event data
        this.eventType = data.eventType;
        this.title = data.title;
        this.description = data.description || '';
        this.data = data.data || {};
        
        // Context identifiers
        this.raceId = data.raceId || null;
        this.stageId = data.stageId || null;
        this.riderId = data.riderId || null;
        this.teamId = data.teamId || null;
        this.location = data.location || null;
        
        // Metadata
        this.tags = data.tags || [];
        this.correlationId = data.correlationId || null;
        this.sessionId = data.sessionId || null;
        this.userId = data.userId || null;
        
        // Processing metadata
        this.processingTime = 0;
        this.indexed = false;
        this.archived = false;
        this.retentionDate = data.retentionDate ? new Date(data.retentionDate) : 
                           new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year default
    }

    generateId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Add tag to event
     */
    addTag(tag) {
        if (!this.tags.includes(tag)) {
            this.tags.push(tag);
        }
    }

    /**
     * Check if event matches filter criteria
     */
    matches(filters) {
        // Category filter
        if (filters.category && this.category !== filters.category) {
            return false;
        }

        // Severity filter (minimum level)
        if (filters.minSeverity && this.severity < filters.minSeverity) {
            return false;
        }

        // Time range filter
        if (filters.startTime && this.timestamp < filters.startTime) {
            return false;
        }
        if (filters.endTime && this.timestamp > filters.endTime) {
            return false;
        }

        // Context filters
        if (filters.raceId && this.raceId !== filters.raceId) {
            return false;
        }
        if (filters.riderId && this.riderId !== filters.riderId) {
            return false;
        }
        if (filters.teamId && this.teamId !== filters.teamId) {
            return false;
        }

        // Tag filter
        if (filters.tags && filters.tags.length > 0) {
            const hasMatchingTag = filters.tags.some(tag => this.tags.includes(tag));
            if (!hasMatchingTag) {
                return false;
            }
        }

        // Source filter
        if (filters.source && this.source !== filters.source) {
            return false;
        }

        return true;
    }

    toJSON() {
        return {
            id: this.id,
            timestamp: this.timestamp,
            category: this.category,
            severity: this.severity,
            source: this.source,
            eventType: this.eventType,
            title: this.title,
            description: this.description,
            data: this.data,
            raceId: this.raceId,
            stageId: this.stageId,
            riderId: this.riderId,
            teamId: this.teamId,
            location: this.location,
            tags: this.tags,
            correlationId: this.correlationId,
            sessionId: this.sessionId,
            userId: this.userId,
            processingTime: this.processingTime,
            indexed: this.indexed,
            archived: this.archived,
            retentionDate: this.retentionDate
        };
    }
}

/**
 * Historical analysis query builder and executor
 */
class HistoricalAnalyzer {
    constructor(eventStore) {
        this.eventStore = eventStore;
        this.analysisCache = new Map();
        this.cacheTimeout = 300000; // 5 minutes
    }

    /**
     * Analyze rider performance trends over time
     */
    async analyzeRiderPerformance(riderId, timeRange = {}, options = {}) {
        const cacheKey = `rider_${riderId}_${JSON.stringify(timeRange)}`;
        const cached = this.getCachedAnalysis(cacheKey);
        if (cached) return cached;

        const filters = {
            riderId,
            category: EventCategory.RIDER_PERFORMANCE,
            ...timeRange
        };

        const events = await this.eventStore.queryEvents(filters);
        
        const analysis = {
            riderId,
            timeRange,
            totalEvents: events.length,
            performance: {
                averageSpeed: 0,
                maxSpeed: 0,
                totalDistance: 0,
                powerOutput: [],
                heartRate: [],
                elevationGain: 0
            },
            trends: {
                speedTrend: [],
                powerTrend: [],
                heartRateTrend: []
            },
            achievements: [],
            incidents: []
        };

        // Process events
        for (const event of events) {
            const data = event.data;
            
            if (data.speed) {
                analysis.performance.averageSpeed = 
                    (analysis.performance.averageSpeed * (analysis.totalEvents - 1) + data.speed) / analysis.totalEvents;
                analysis.performance.maxSpeed = Math.max(analysis.performance.maxSpeed, data.speed);
                analysis.trends.speedTrend.push({ timestamp: event.timestamp, value: data.speed });
            }
            
            if (data.power) {
                analysis.performance.powerOutput.push(data.power);
                analysis.trends.powerTrend.push({ timestamp: event.timestamp, value: data.power });
            }
            
            if (data.heartRate) {
                analysis.performance.heartRate.push(data.heartRate);
                analysis.trends.heartRateTrend.push({ timestamp: event.timestamp, value: data.heartRate });
            }

            if (data.distance) {
                analysis.performance.totalDistance += data.distance;
            }

            if (data.elevation) {
                analysis.performance.elevationGain += Math.max(0, data.elevation);
            }

            // Identify achievements and incidents
            if (event.tags.includes('achievement')) {
                analysis.achievements.push({
                    timestamp: event.timestamp,
                    type: data.achievementType,
                    description: event.description
                });
            }

            if (event.tags.includes('incident')) {
                analysis.incidents.push({
                    timestamp: event.timestamp,
                    type: data.incidentType,
                    description: event.description
                });
            }
        }

        // Calculate statistical insights
        if (analysis.performance.powerOutput.length > 0) {
            const powers = analysis.performance.powerOutput;
            analysis.performance.avgPower = powers.reduce((a, b) => a + b, 0) / powers.length;
            analysis.performance.maxPower = Math.max(...powers);
        }

        if (analysis.performance.heartRate.length > 0) {
            const hrs = analysis.performance.heartRate;
            analysis.performance.avgHeartRate = hrs.reduce((a, b) => a + b, 0) / hrs.length;
            analysis.performance.maxHeartRate = Math.max(...hrs);
        }

        this.cacheAnalysis(cacheKey, analysis);
        return analysis;
    }

    /**
     * Analyze tactical patterns in races
     */
    async analyzeTacticalPatterns(raceId, options = {}) {
        const cacheKey = `tactical_${raceId}_${JSON.stringify(options)}`;
        const cached = this.getCachedAnalysis(cacheKey);
        if (cached) return cached;

        const filters = {
            raceId,
            category: EventCategory.TACTICAL_EVENT
        };

        const events = await this.eventStore.queryEvents(filters);
        
        const analysis = {
            raceId,
            totalTacticalEvents: events.length,
            patterns: {
                attacks: [],
                breakaways: [],
                sprints: [],
                climbs: []
            },
            timeline: [],
            keyMoments: [],
            teamStrategies: new Map()
        };

        // Group events by type
        for (const event of events) {
            const eventData = {
                timestamp: event.timestamp,
                riderId: event.riderId,
                teamId: event.teamId,
                data: event.data,
                location: event.location
            };

            analysis.timeline.push(eventData);

            switch (event.eventType) {
                case 'attack':
                    analysis.patterns.attacks.push(eventData);
                    break;
                case 'breakaway':
                    analysis.patterns.breakaways.push(eventData);
                    break;
                case 'sprint':
                    analysis.patterns.sprints.push(eventData);
                    break;
                case 'climb':
                    analysis.patterns.climbs.push(eventData);
                    break;
            }

            // Track team strategies
            if (event.teamId) {
                if (!analysis.teamStrategies.has(event.teamId)) {
                    analysis.teamStrategies.set(event.teamId, {
                        teamId: event.teamId,
                        actions: [],
                        successRate: 0
                    });
                }
                analysis.teamStrategies.get(event.teamId).actions.push(eventData);
            }

            // Identify key moments
            if (event.tags.includes('key_moment') || event.severity >= EventSeverity.WARN) {
                analysis.keyMoments.push(eventData);
            }
        }

        // Convert team strategies map to array
        analysis.teamStrategies = Array.from(analysis.teamStrategies.values());

        // Sort timeline chronologically
        analysis.timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        analysis.keyMoments.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        this.cacheAnalysis(cacheKey, analysis);
        return analysis;
    }

    /**
     * Generate race summary report
     */
    async generateRaceSummary(raceId, options = {}) {
        const cacheKey = `race_summary_${raceId}`;
        const cached = this.getCachedAnalysis(cacheKey);
        if (cached) return cached;

        const filters = { raceId };
        const events = await this.eventStore.queryEvents(filters);
        
        const summary = {
            raceId,
            generatedAt: new Date(),
            overview: {
                totalEvents: events.length,
                duration: 0,
                participants: new Set(),
                teams: new Set()
            },
            eventBreakdown: {
                [EventCategory.RACE_EVENT]: 0,
                [EventCategory.RIDER_PERFORMANCE]: 0,
                [EventCategory.TACTICAL_EVENT]: 0,
                [EventCategory.WEATHER_EVENT]: 0
            },
            timeline: [],
            highlights: [],
            statistics: {}
        };

        let startTime = null;
        let endTime = null;

        // Process all events
        for (const event of events) {
            if (!startTime || event.timestamp < startTime) {
                startTime = event.timestamp;
            }
            if (!endTime || event.timestamp > endTime) {
                endTime = event.timestamp;
            }

            if (event.riderId) summary.overview.participants.add(event.riderId);
            if (event.teamId) summary.overview.teams.add(event.teamId);
            
            summary.eventBreakdown[event.category] = 
                (summary.eventBreakdown[event.category] || 0) + 1;

            // Collect highlights
            if (event.tags.includes('highlight') || event.severity >= EventSeverity.WARN) {
                summary.highlights.push({
                    timestamp: event.timestamp,
                    title: event.title,
                    description: event.description,
                    category: event.category,
                    riderId: event.riderId,
                    teamId: event.teamId
                });
            }

            summary.timeline.push({
                timestamp: event.timestamp,
                category: event.category,
                title: event.title,
                riderId: event.riderId,
                teamId: event.teamId
            });
        }

        // Calculate race duration
        if (startTime && endTime) {
            summary.overview.duration = endTime.getTime() - startTime.getTime();
        }

        summary.overview.participants = summary.overview.participants.size;
        summary.overview.teams = summary.overview.teams.size;

        // Sort timeline
        summary.timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        summary.highlights.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        this.cacheAnalysis(cacheKey, summary);
        return summary;
    }

    /**
     * Cache analysis results
     */
    cacheAnalysis(key, analysis) {
        this.analysisCache.set(key, {
            data: analysis,
            timestamp: Date.now()
        });
    }

    /**
     * Get cached analysis if still valid
     */
    getCachedAnalysis(key) {
        const cached = this.analysisCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        if (cached) {
            this.analysisCache.delete(key);
        }
        return null;
    }

    /**
     * Clear analysis cache
     */
    clearCache() {
        this.analysisCache.clear();
    }
}

/**
 * Event storage and indexing system
 */
class EventStore {
    constructor(options = {}) {
        this.events = new Map(); // eventId -> EventRecord
        this.indexes = {
            timestamp: new Map(),    // timestamp -> Set of eventIds
            category: new Map(),     // category -> Set of eventIds
            raceId: new Map(),       // raceId -> Set of eventIds
            riderId: new Map(),      // riderId -> Set of eventIds
            teamId: new Map(),       // teamId -> Set of eventIds
            source: new Map(),       // source -> Set of eventIds
            tags: new Map()          // tag -> Set of eventIds
        };
        
        this.options = {
            maxMemoryEvents: options.maxMemoryEvents || 100000,
            persistencePath: options.persistencePath || './data/events',
            enablePersistence: options.enablePersistence !== false,
            indexBatchSize: options.indexBatchSize || 1000,
            ...options
        };

        this.stats = {
            totalEvents: 0,
            eventsInMemory: 0,
            eventsPersisted: 0,
            indexSize: 0,
            queryCount: 0,
            averageQueryTime: 0
        };
    }

    /**
     * Store an event
     */
    async storeEvent(eventRecord) {
        const startTime = performance.now();
        
        // Store in memory
        this.events.set(eventRecord.id, eventRecord);
        
        // Update indexes
        this.updateIndexes(eventRecord);
        
        this.stats.totalEvents++;
        this.stats.eventsInMemory = this.events.size;
        this.stats.indexSize = this.calculateIndexSize();
        
        // Persist if enabled
        if (this.options.enablePersistence) {
            await this.persistEvent(eventRecord);
            this.stats.eventsPersisted++;
        }

        // Check memory limits
        if (this.events.size > this.options.maxMemoryEvents) {
            await this.archiveOldEvents();
        }

        eventRecord.processingTime = performance.now() - startTime;
        eventRecord.indexed = true;
        
        return eventRecord.id;
    }

    /**
     * Query events with filters
     */
    async queryEvents(filters, options = {}) {
        const startTime = performance.now();
        
        let candidateIds = new Set();
        let firstFilter = true;

        // Use indexes to find candidate events
        if (filters.category) {
            const categoryIds = this.indexes.category.get(filters.category) || new Set();
            candidateIds = firstFilter ? categoryIds : this.intersectSets(candidateIds, categoryIds);
            firstFilter = false;
        }

        if (filters.raceId) {
            const raceIds = this.indexes.raceId.get(filters.raceId) || new Set();
            candidateIds = firstFilter ? raceIds : this.intersectSets(candidateIds, raceIds);
            firstFilter = false;
        }

        if (filters.riderId) {
            const riderIds = this.indexes.riderId.get(filters.riderId) || new Set();
            candidateIds = firstFilter ? riderIds : this.intersectSets(candidateIds, riderIds);
            firstFilter = false;
        }

        if (filters.teamId) {
            const teamIds = this.indexes.teamId.get(filters.teamId) || new Set();
            candidateIds = firstFilter ? teamIds : this.intersectSets(candidateIds, teamIds);
            firstFilter = false;
        }

        if (filters.source) {
            const sourceIds = this.indexes.source.get(filters.source) || new Set();
            candidateIds = firstFilter ? sourceIds : this.intersectSets(candidateIds, sourceIds);
            firstFilter = false;
        }

        // If no specific filters, get all events
        if (firstFilter) {
            candidateIds = new Set(this.events.keys());
        }

        // Filter and collect matching events
        const matchingEvents = [];
        for (const eventId of candidateIds) {
            const event = this.events.get(eventId);
            if (event && event.matches(filters)) {
                matchingEvents.push(event);
            }
        }

        // Apply sorting
        const sortBy = options.sortBy || 'timestamp';
        const sortOrder = options.sortOrder || 'desc';
        
        matchingEvents.sort((a, b) => {
            let aVal = a[sortBy];
            let bVal = b[sortBy];
            
            if (aVal instanceof Date) {
                aVal = aVal.getTime();
                bVal = bVal.getTime();
            }
            
            if (sortOrder === 'desc') {
                return bVal - aVal;
            }
            return aVal - bVal;
        });

        // Apply pagination
        const limit = options.limit || matchingEvents.length;
        const offset = options.offset || 0;
        const results = matchingEvents.slice(offset, offset + limit);

        // Update query statistics
        const queryTime = performance.now() - startTime;
        this.stats.queryCount++;
        this.stats.averageQueryTime = 
            (this.stats.averageQueryTime * (this.stats.queryCount - 1) + queryTime) / this.stats.queryCount;

        return results;
    }

    /**
     * Get event by ID
     */
    getEvent(eventId) {
        return this.events.get(eventId) || null;
    }

    /**
     * Delete event
     */
    async deleteEvent(eventId) {
        const event = this.events.get(eventId);
        if (!event) return false;

        this.events.delete(eventId);
        this.removeFromIndexes(event);
        
        this.stats.eventsInMemory = this.events.size;
        this.stats.indexSize = this.calculateIndexSize();
        
        return true;
    }

    /**
     * Update indexes for an event
     */
    updateIndexes(event) {
        // Timestamp index
        const timestampKey = Math.floor(event.timestamp.getTime() / 60000); // 1-minute buckets
        if (!this.indexes.timestamp.has(timestampKey)) {
            this.indexes.timestamp.set(timestampKey, new Set());
        }
        this.indexes.timestamp.get(timestampKey).add(event.id);

        // Category index
        if (!this.indexes.category.has(event.category)) {
            this.indexes.category.set(event.category, new Set());
        }
        this.indexes.category.get(event.category).add(event.id);

        // Context indexes
        if (event.raceId) {
            if (!this.indexes.raceId.has(event.raceId)) {
                this.indexes.raceId.set(event.raceId, new Set());
            }
            this.indexes.raceId.get(event.raceId).add(event.id);
        }

        if (event.riderId) {
            if (!this.indexes.riderId.has(event.riderId)) {
                this.indexes.riderId.set(event.riderId, new Set());
            }
            this.indexes.riderId.get(event.riderId).add(event.id);
        }

        if (event.teamId) {
            if (!this.indexes.teamId.has(event.teamId)) {
                this.indexes.teamId.set(event.teamId, new Set());
            }
            this.indexes.teamId.get(event.teamId).add(event.id);
        }

        if (event.source) {
            if (!this.indexes.source.has(event.source)) {
                this.indexes.source.set(event.source, new Set());
            }
            this.indexes.source.get(event.source).add(event.id);
        }

        // Tag indexes
        for (const tag of event.tags) {
            if (!this.indexes.tags.has(tag)) {
                this.indexes.tags.set(tag, new Set());
            }
            this.indexes.tags.get(tag).add(event.id);
        }
    }

    /**
     * Remove event from all indexes
     */
    removeFromIndexes(event) {
        // Remove from all relevant indexes
        const timestampKey = Math.floor(event.timestamp.getTime() / 60000);
        this.indexes.timestamp.get(timestampKey)?.delete(event.id);
        this.indexes.category.get(event.category)?.delete(event.id);
        
        if (event.raceId) this.indexes.raceId.get(event.raceId)?.delete(event.id);
        if (event.riderId) this.indexes.riderId.get(event.riderId)?.delete(event.id);
        if (event.teamId) this.indexes.teamId.get(event.teamId)?.delete(event.id);
        if (event.source) this.indexes.source.get(event.source)?.delete(event.id);
        
        for (const tag of event.tags) {
            this.indexes.tags.get(tag)?.delete(event.id);
        }
    }

    /**
     * Calculate total index size
     */
    calculateIndexSize() {
        let size = 0;
        for (const index of Object.values(this.indexes)) {
            size += index.size;
            for (const set of index.values()) {
                size += set.size;
            }
        }
        return size;
    }

    /**
     * Intersect two sets
     */
    intersectSets(set1, set2) {
        const result = new Set();
        for (const item of set1) {
            if (set2.has(item)) {
                result.add(item);
            }
        }
        return result;
    }

    /**
     * Persist event to storage
     */
    async persistEvent(event) {
        if (!this.options.enablePersistence) return;

        try {
            const eventPath = path.join(this.options.persistencePath, 
                event.timestamp.getFullYear().toString(),
                (event.timestamp.getMonth() + 1).toString().padStart(2, '0'));
            
            await fs.mkdir(eventPath, { recursive: true });
            
            const filename = `${event.timestamp.getDate().toString().padStart(2, '0')}_events.jsonl`;
            const filepath = path.join(eventPath, filename);
            
            const eventLine = JSON.stringify(event.toJSON()) + '\n';
            await fs.appendFile(filepath, eventLine);
            
        } catch (error) {
            logger.error('Failed to persist event', {
                eventId: event.id,
                error: error.message
            });
        }
    }

    /**
     * Archive old events to free memory
     */
    async archiveOldEvents() {
        const eventArray = Array.from(this.events.values());
        eventArray.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        const eventsToArchive = eventArray.slice(0, Math.floor(this.events.size * 0.2)); // Archive 20%
        
        for (const event of eventsToArchive) {
            if (this.options.enablePersistence) {
                await this.persistEvent(event);
            }
            
            this.events.delete(event.id);
            this.removeFromIndexes(event);
            event.archived = true;
        }
        
        this.stats.eventsInMemory = this.events.size;
        
        logger.info('Archived old events', {
            archivedCount: eventsToArchive.length,
            remainingInMemory: this.events.size
        });
    }

    /**
     * Get storage statistics
     */
    getStats() {
        return { ...this.stats };
    }
}

/**
 * Main Event Logging & Historical Analysis System
 */
class EventLoggingSystem extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            enableRealTimeLogging: options.enableRealTimeLogging !== false,
            enableHistoricalAnalysis: options.enableHistoricalAnalysis !== false,
            maxEventsPerSecond: options.maxEventsPerSecond || 1000,
            logLevel: options.logLevel || EventSeverity.INFO,
            persistencePath: options.persistencePath || './data/events',
            analysisInterval: options.analysisInterval || 300000, // 5 minutes
            retentionPolicy: options.retentionPolicy || {
                default: 365 * 24 * 60 * 60 * 1000, // 1 year
                critical: 5 * 365 * 24 * 60 * 60 * 1000, // 5 years
                debug: 7 * 24 * 60 * 60 * 1000 // 1 week
            },
            ...options
        };

        // Components
        this.eventStore = new EventStore({
            persistencePath: this.options.persistencePath,
            enablePersistence: this.options.enableRealTimeLogging
        });
        
        this.historicalAnalyzer = new HistoricalAnalyzer(this.eventStore);
        
        // Rate limiting
        this.eventQueue = [];
        this.processingQueue = false;
        this.rateLimiter = {
            events: 0,
            resetTime: Date.now() + 1000
        };
        
        // Statistics
        this.stats = {
            totalEventsLogged: 0,
            eventsDropped: 0,
            averageProcessingTime: 0,
            analysisJobsRun: 0,
            systemUptime: Date.now()
        };

        // Internal state
        this.isRunning = false;
        this.analysisTimer = null;
        
        this.initializeSystem();
    }

    /**
     * Initialize logging system
     */
    initializeSystem() {
        logger.info('Event Logging & Historical Analysis System initialized', {
            enableRealTimeLogging: this.options.enableRealTimeLogging,
            enableHistoricalAnalysis: this.options.enableHistoricalAnalysis,
            maxEventsPerSecond: this.options.maxEventsPerSecond
        });
    }

    /**
     * Start the logging system
     */
    async start() {
        if (this.isRunning) {
            throw new Error('Event Logging System is already running');
        }

        this.isRunning = true;

        // Start periodic analysis if enabled
        if (this.options.enableHistoricalAnalysis) {
            this.analysisTimer = setInterval(() => {
                this.runScheduledAnalysis();
            }, this.options.analysisInterval);
        }

        // Start queue processing
        this.processEventQueue();

        this.emit('system-started');
        logger.info('Event Logging System started');
    }

    /**
     * Stop the logging system
     */
    async stop() {
        if (!this.isRunning) return;

        this.isRunning = false;

        if (this.analysisTimer) {
            clearInterval(this.analysisTimer);
            this.analysisTimer = null;
        }

        // Process remaining events in queue
        await this.flushEventQueue();

        this.emit('system-stopped');
        logger.info('Event Logging System stopped');
    }

    /**
     * Log an event
     */
    async logEvent(eventData) {
        // Validate required fields
        if (!eventData.category || !eventData.source || !eventData.eventType) {
            throw new Error('Event must have category, source, and eventType');
        }

        // Check rate limiting
        if (!this.checkRateLimit()) {
            this.stats.eventsDropped++;
            logger.warn('Event dropped due to rate limiting', { source: eventData.source });
            return null;
        }

        // Create event record
        const eventRecord = new EventRecord(eventData);
        
        // Add to processing queue
        this.eventQueue.push(eventRecord);
        
        // Emit event for real-time subscribers
        this.emit('event-logged', eventRecord.toJSON());
        
        return eventRecord.id;
    }

    /**
     * Process event queue
     */
    async processEventQueue() {
        if (this.processingQueue || !this.isRunning) return;
        
        this.processingQueue = true;
        
        while (this.eventQueue.length > 0 && this.isRunning) {
            const batch = this.eventQueue.splice(0, 100); // Process in batches
            
            const processingPromises = batch.map(async (eventRecord) => {
                try {
                    await this.eventStore.storeEvent(eventRecord);
                    this.stats.totalEventsLogged++;
                    
                    // Update average processing time
                    const alpha = 0.1;
                    this.stats.averageProcessingTime = 
                        this.stats.averageProcessingTime * (1 - alpha) + 
                        eventRecord.processingTime * alpha;
                        
                } catch (error) {
                    logger.error('Failed to store event', {
                        eventId: eventRecord.id,
                        error: error.message
                    });
                    this.stats.eventsDropped++;
                }
            });
            
            await Promise.allSettled(processingPromises);
            
            // Brief pause between batches
            if (this.eventQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        
        this.processingQueue = false;
        
        // Schedule next processing cycle if queue has items
        if (this.eventQueue.length > 0 && this.isRunning) {
            setTimeout(() => this.processEventQueue(), 100);
        }
    }

    /**
     * Flush event queue
     */
    async flushEventQueue() {
        while (this.eventQueue.length > 0) {
            await this.processEventQueue();
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    /**
     * Check rate limiting
     */
    checkRateLimit() {
        const now = Date.now();
        
        if (now >= this.rateLimiter.resetTime) {
            this.rateLimiter.events = 0;
            this.rateLimiter.resetTime = now + 1000;
        }
        
        if (this.rateLimiter.events >= this.options.maxEventsPerSecond) {
            return false;
        }
        
        this.rateLimiter.events++;
        return true;
    }

    /**
     * Query historical events
     */
    async queryEvents(filters, options = {}) {
        return await this.eventStore.queryEvents(filters, options);
    }

    /**
     * Get event by ID
     */
    getEvent(eventId) {
        return this.eventStore.getEvent(eventId);
    }

    /**
     * Analyze rider performance
     */
    async analyzeRiderPerformance(riderId, timeRange = {}, options = {}) {
        return await this.historicalAnalyzer.analyzeRiderPerformance(riderId, timeRange, options);
    }

    /**
     * Analyze tactical patterns
     */
    async analyzeTacticalPatterns(raceId, options = {}) {
        return await this.historicalAnalyzer.analyzeTacticalPatterns(raceId, options);
    }

    /**
     * Generate race summary
     */
    async generateRaceSummary(raceId, options = {}) {
        return await this.historicalAnalyzer.generateRaceSummary(raceId, options);
    }

    /**
     * Run scheduled analysis jobs
     */
    async runScheduledAnalysis() {
        if (!this.options.enableHistoricalAnalysis) return;
        
        try {
            // Perform cleanup of expired events
            await this.performRetentionCleanup();
            
            // Update analysis cache
            this.historicalAnalyzer.clearCache();
            
            this.stats.analysisJobsRun++;
            
            this.emit('analysis-completed', {
                timestamp: new Date(),
                jobsRun: this.stats.analysisJobsRun
            });
            
        } catch (error) {
            logger.error('Scheduled analysis failed', { error: error.message });
        }
    }

    /**
     * Perform retention policy cleanup
     */
    async performRetentionCleanup() {
        const now = Date.now();
        let cleanedCount = 0;
        
        const filters = {
            endTime: new Date(now - this.options.retentionPolicy.default)
        };
        
        const expiredEvents = await this.eventStore.queryEvents(filters);
        
        for (const event of expiredEvents) {
            // Check if event has special retention requirements
            const retentionPeriod = this.getRetentionPeriod(event);
            
            if (now - event.timestamp.getTime() > retentionPeriod) {
                await this.eventStore.deleteEvent(event.id);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            logger.info('Retention cleanup completed', { cleanedCount });
        }
    }

    /**
     * Get retention period for event
     */
    getRetentionPeriod(event) {
        if (event.severity >= EventSeverity.CRITICAL) {
            return this.options.retentionPolicy.critical;
        }
        if (event.severity <= EventSeverity.DEBUG) {
            return this.options.retentionPolicy.debug;
        }
        return this.options.retentionPolicy.default;
    }

    /**
     * Get system statistics
     */
    getStats() {
        return {
            ...this.stats,
            eventStore: this.eventStore.getStats(),
            queueLength: this.eventQueue.length,
            rateLimiter: this.rateLimiter,
            isRunning: this.isRunning,
            uptime: Date.now() - this.stats.systemUptime
        };
    }

    /**
     * Health check
     */
    async healthCheck() {
        const stats = this.getStats();
        
        const health = {
            status: 'healthy',
            system: {
                isRunning: this.isRunning,
                queueLength: this.eventQueue.length,
                processingQueue: this.processingQueue
            },
            storage: {
                eventsInMemory: stats.eventStore.eventsInMemory,
                eventsPersisted: stats.eventStore.eventsPersisted,
                indexSize: stats.eventStore.indexSize
            },
            performance: {
                averageProcessingTime: stats.averageProcessingTime,
                averageQueryTime: stats.eventStore.averageQueryTime,
                eventsPerSecond: this.rateLimiter.events,
                dropRate: stats.eventsDropped / Math.max(1, stats.totalEventsLogged)
            },
            stats
        };

        // Determine health status
        if (!this.isRunning) {
            health.status = 'stopped';
        } else if (health.performance.dropRate > 0.05) {
            health.status = 'degraded';
        } else if (health.system.queueLength > 1000) {
            health.status = 'degraded';
        } else if (health.performance.averageProcessingTime > 100) {
            health.status = 'degraded';
        }

        return health;
    }

    /**
     * Helper methods for common event types
     */
    async logRaceEvent(raceId, eventType, title, description, data = {}) {
        return await this.logEvent({
            category: EventCategory.RACE_EVENT,
            source: 'race-system',
            eventType,
            title,
            description,
            raceId,
            data,
            severity: EventSeverity.INFO
        });
    }

    async logRiderPerformance(riderId, raceId, performanceData) {
        return await this.logEvent({
            category: EventCategory.RIDER_PERFORMANCE,
            source: 'performance-tracker',
            eventType: 'performance_update',
            title: `Performance data for ${riderId}`,
            riderId,
            raceId,
            data: performanceData,
            severity: EventSeverity.TRACE
        });
    }

    async logTacticalEvent(raceId, riderId, teamId, eventType, description, data = {}) {
        return await this.logEvent({
            category: EventCategory.TACTICAL_EVENT,
            source: 'tactical-detector',
            eventType,
            title: `Tactical event: ${eventType}`,
            description,
            raceId,
            riderId,
            teamId,
            data,
            severity: EventSeverity.INFO,
            tags: ['tactical', eventType]
        });
    }

    async logWeatherEvent(raceId, location, weatherData) {
        return await this.logEvent({
            category: EventCategory.WEATHER_EVENT,
            source: 'weather-service',
            eventType: 'weather_update',
            title: 'Weather update',
            description: `Weather conditions at ${location}`,
            raceId,
            location,
            data: weatherData,
            severity: EventSeverity.INFO
        });
    }

    async logSystemEvent(eventType, title, description, data = {}, severity = EventSeverity.INFO) {
        return await this.logEvent({
            category: EventCategory.SYSTEM_EVENT,
            source: 'pelotoniq-system',
            eventType,
            title,
            description,
            data,
            severity
        });
    }
}

module.exports = {
    EventLoggingSystem,
    EventRecord,
    EventStore,
    HistoricalAnalyzer,
    EventCategory,
    EventSeverity
};