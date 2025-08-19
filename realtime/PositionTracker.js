/**
 * Real-time Position Tracking System for PelotonIQ
 * Processes and distributes live rider position updates with gap calculations and race state management
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
        new winston.transports.File({ filename: 'logs/position-tracker.log' }),
        new winston.transports.Console()
    ]
});

/**
 * Represents a rider's position and timing data
 */
class RiderPosition {
    constructor(data) {
        this.riderId = data.riderId;
        this.name = data.name;
        this.teamId = data.teamId;
        this.bibNumber = data.bibNumber;
        this.position = data.position || null;
        this.latitude = data.latitude || null;
        this.longitude = data.longitude || null;
        this.altitude = data.altitude || null;
        this.speed = data.speed || null;
        this.heading = data.heading || null;
        this.timestamp = new Date(data.timestamp);
        this.source = data.source || 'unknown';
        this.accuracy = data.accuracy || 'unknown';
        this.distanceFromStart = data.distanceFromStart || null;
        this.timeFromStart = data.timeFromStart || null;
        this.groupId = data.groupId || null;
        this.confidence = data.confidence || 1.0;
    }

    /**
     * Calculate distance between two positions using Haversine formula
     */
    distanceTo(otherPosition) {
        if (!this.latitude || !this.longitude || !otherPosition.latitude || !otherPosition.longitude) {
            return null;
        }

        const R = 6371000; // Earth's radius in meters
        const φ1 = this.latitude * Math.PI / 180;
        const φ2 = otherPosition.latitude * Math.PI / 180;
        const Δφ = (otherPosition.latitude - this.latitude) * Math.PI / 180;
        const Δλ = (otherPosition.longitude - this.longitude) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c; // Distance in meters
    }

    /**
     * Estimate position based on speed and time
     */
    interpolatePosition(futureTime, assumedSpeed = null) {
        if (!this.latitude || !this.longitude) {
            return null;
        }

        const speed = assumedSpeed || this.speed;
        if (!speed) return null;

        const timeDiff = (futureTime - this.timestamp) / 1000; // seconds
        const distance = speed * timeDiff;

        // Simple linear interpolation based on heading
        if (this.heading) {
            const headingRad = this.heading * Math.PI / 180;
            const deltaLat = (distance * Math.cos(headingRad)) / 111000; // Rough conversion
            const deltaLon = (distance * Math.sin(headingRad)) / (111000 * Math.cos(this.latitude * Math.PI / 180));

            return new RiderPosition({
                ...this,
                latitude: this.latitude + deltaLat,
                longitude: this.longitude + deltaLon,
                timestamp: futureTime,
                confidence: this.confidence * 0.8 // Reduce confidence for interpolated data
            });
        }

        return null;
    }

    /**
     * Check if position is valid
     */
    isValid() {
        return this.riderId && 
               this.timestamp && 
               (this.position !== null || (this.latitude && this.longitude));
    }

    /**
     * Convert to JSON representation
     */
    toJSON() {
        return {
            riderId: this.riderId,
            name: this.name,
            teamId: this.teamId,
            bibNumber: this.bibNumber,
            position: this.position,
            latitude: this.latitude,
            longitude: this.longitude,
            altitude: this.altitude,
            speed: this.speed,
            heading: this.heading,
            timestamp: this.timestamp.toISOString(),
            source: this.source,
            accuracy: this.accuracy,
            distanceFromStart: this.distanceFromStart,
            timeFromStart: this.timeFromStart,
            groupId: this.groupId,
            confidence: this.confidence
        };
    }
}

/**
 * Represents a group of riders
 */
class RiderGroup {
    constructor(id, riders = []) {
        this.id = id;
        this.riders = new Set(riders);
        this.size = this.riders.size;
        this.avgPosition = null;
        this.avgSpeed = null;
        this.gapToNext = null;
        this.gapToPrevious = null;
        this.groupType = 'peloton'; // peloton, breakaway, chase, solo
        this.lastUpdated = new Date();
        this.confidence = 1.0;
    }

    addRider(riderId) {
        this.riders.add(riderId);
        this.size = this.riders.size;
        this.lastUpdated = new Date();
    }

    removeRider(riderId) {
        this.riders.delete(riderId);
        this.size = this.riders.size;
        this.lastUpdated = new Date();
    }

    hasRider(riderId) {
        return this.riders.has(riderId);
    }

    updateMetrics(positions) {
        const groupPositions = Array.from(this.riders)
            .map(riderId => positions.get(riderId))
            .filter(pos => pos && pos.isValid());

        if (groupPositions.length === 0) return;

        // Calculate average position
        this.avgPosition = groupPositions.reduce((sum, pos) => sum + pos.position, 0) / groupPositions.length;

        // Calculate average speed
        const speeds = groupPositions.map(pos => pos.speed).filter(speed => speed !== null);
        if (speeds.length > 0) {
            this.avgSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
        }

        // Determine group type based on size and position
        this.updateGroupType(groupPositions);
        
        this.lastUpdated = new Date();
    }

    updateGroupType(positions) {
        if (this.size === 1) {
            this.groupType = 'solo';
        } else if (this.size < 5) {
            this.groupType = 'small_group';
        } else if (this.avgPosition <= 10) {
            this.groupType = 'breakaway';
        } else if (this.size > 50) {
            this.groupType = 'peloton';
        } else {
            this.groupType = 'chase_group';
        }
    }

    toJSON() {
        return {
            id: this.id,
            riders: Array.from(this.riders),
            size: this.size,
            avgPosition: this.avgPosition,
            avgSpeed: this.avgSpeed,
            gapToNext: this.gapToNext,
            gapToPrevious: this.gapToPrevious,
            groupType: this.groupType,
            lastUpdated: this.lastUpdated.toISOString(),
            confidence: this.confidence
        };
    }
}

/**
 * Race state management
 */
class RaceState {
    constructor() {
        this.status = 'not_started'; // not_started, racing, neutralized, finished
        this.stage = null;
        this.kilometer = 0;
        this.remainingKm = null;
        this.averageSpeed = null;
        this.fastestRider = null;
        this.leadingGroup = null;
        this.pelotonPosition = null;
        this.pelotonGap = null;
        this.totalRiders = 0;
        this.activeRiders = 0;
        this.lastUpdated = new Date();
        this.tacticalSituation = 'stable'; // stable, attacking, chasing, sprint, climb
    }

    update(data) {
        Object.assign(this, data);
        this.lastUpdated = new Date();
    }

    toJSON() {
        return {
            status: this.status,
            stage: this.stage,
            kilometer: this.kilometer,
            remainingKm: this.remainingKm,
            averageSpeed: this.averageSpeed,
            fastestRider: this.fastestRider,
            leadingGroup: this.leadingGroup,
            pelotonPosition: this.pelotonPosition,
            pelotonGap: this.pelotonGap,
            totalRiders: this.totalRiders,
            activeRiders: this.activeRiders,
            tacticalSituation: this.tacticalSituation,
            lastUpdated: this.lastUpdated.toISOString()
        };
    }
}

/**
 * Position Tracker - Main class for tracking rider positions
 */
class PositionTracker extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            updateInterval: options.updateInterval || 1000, // 1 second
            positionTimeout: options.positionTimeout || 30000, // 30 seconds
            interpolationEnabled: options.interpolationEnabled !== false,
            groupDetectionEnabled: options.groupDetectionEnabled !== false,
            groupDistanceThreshold: options.groupDistanceThreshold || 100, // meters
            groupTimeThreshold: options.groupTimeThreshold || 10, // seconds
            maxInterpolationTime: options.maxInterpolationTime || 10000, // 10 seconds
            redisUrl: options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
            confidenceThreshold: options.confidenceThreshold || 0.5,
            ...options
        };

        // Data storage
        this.positions = new Map(); // riderId -> RiderPosition
        this.groups = new Map(); // groupId -> RiderGroup
        this.raceState = new RaceState();
        this.positionHistory = new Map(); // riderId -> Array of RiderPosition
        this.timingPoints = new Map(); // pointId -> timing data
        
        // Source management
        this.dataSources = new Map(); // sourceId -> source info
        this.sourceReliability = new Map(); // sourceId -> reliability score
        this.lastUpdates = new Map(); // sourceId -> timestamp

        // Performance tracking
        this.stats = {
            positionsProcessed: 0,
            groupsDetected: 0,
            interpolationsPerformed: 0,
            errors: 0,
            averageProcessingTime: 0,
            lastProcessingTime: 0
        };

        // Internal state
        this.redis = null;
        this.updateTimer = null;
        this.isProcessing = false;

        this.initializeRedis();
        this.startProcessing();
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
            logger.info('Position Tracker Redis connection established');
            
        } catch (error) {
            logger.error('Failed to initialize Redis:', error);
            throw error;
        }
    }

    /**
     * Register a data source
     */
    registerDataSource(sourceId, info) {
        this.dataSources.set(sourceId, {
            id: sourceId,
            name: info.name,
            type: info.type, // gps, timing, manual, estimated
            priority: info.priority || 5, // 1-10, higher is better
            accuracy: info.accuracy || 'medium', // high, medium, low
            updateFrequency: info.updateFrequency || 1000,
            lastSeen: new Date(),
            isActive: true,
            ...info
        });

        this.sourceReliability.set(sourceId, info.initialReliability || 0.8);

        logger.info('Data source registered', { sourceId, info });
        this.emit('source-registered', { sourceId, info });
    }

    /**
     * Process incoming position update
     */
    async processPositionUpdate(data) {
        const startTime = performance.now();

        try {
            // Validate input data
            if (!this.validatePositionData(data)) {
                logger.warn('Invalid position data received', { data });
                this.stats.errors++;
                return false;
            }

            const position = new RiderPosition(data);
            
            // Update source reliability
            this.updateSourceReliability(data.source, position);

            // Check if this is a newer position
            const currentPosition = this.positions.get(position.riderId);
            if (currentPosition && currentPosition.timestamp >= position.timestamp) {
                logger.debug('Ignoring older position update', {
                    riderId: position.riderId,
                    currentTime: currentPosition.timestamp,
                    newTime: position.timestamp
                });
                return false;
            }

            // Store position
            this.positions.set(position.riderId, position);
            this.updatePositionHistory(position);

            // Update statistics
            this.stats.positionsProcessed++;
            
            // Store in Redis for persistence
            await this.storePositionInRedis(position);

            // Emit position update event
            this.emit('position-updated', position);

            // Update processing time statistics
            const processingTime = performance.now() - startTime;
            this.updateProcessingStats(processingTime);

            return true;

        } catch (error) {
            logger.error('Error processing position update', { error: error.message, data });
            this.stats.errors++;
            return false;
        }
    }

    /**
     * Validate position data
     */
    validatePositionData(data) {
        if (!data || !data.riderId || !data.timestamp) {
            return false;
        }

        // Check if timestamp is reasonable (not too far in future/past)
        const timestamp = new Date(data.timestamp);
        const now = new Date();
        const timeDiff = Math.abs(now - timestamp);
        
        if (timeDiff > 3600000) { // 1 hour
            logger.warn('Position timestamp too far from current time', {
                riderId: data.riderId,
                timestamp: timestamp,
                timeDiff: timeDiff
            });
            return false;
        }

        // Check if position data makes sense
        if (data.position !== null && (data.position < 1 || data.position > 300)) {
            return false;
        }

        // Check GPS coordinates if provided
        if (data.latitude && (data.latitude < -90 || data.latitude > 90)) {
            return false;
        }
        
        if (data.longitude && (data.longitude < -180 || data.longitude > 180)) {
            return false;
        }

        // Check speed is reasonable (max 100 km/h)
        if (data.speed && data.speed > 27.78) { // 100 km/h in m/s
            logger.warn('Unrealistic speed detected', {
                riderId: data.riderId,
                speed: data.speed
            });
            return false;
        }

        return true;
    }

    /**
     * Update source reliability based on data quality
     */
    updateSourceReliability(sourceId, position) {
        if (!sourceId) return;

        const currentReliability = this.sourceReliability.get(sourceId) || 0.5;
        let adjustment = 0;

        // Positive adjustments
        if (position.confidence > 0.9) adjustment += 0.01;
        if (position.accuracy === 'high') adjustment += 0.01;
        if (position.speed && position.speed > 0 && position.speed < 25) adjustment += 0.005;

        // Negative adjustments
        if (position.confidence < 0.5) adjustment -= 0.02;
        if (position.accuracy === 'low') adjustment -= 0.01;

        const newReliability = Math.max(0.1, Math.min(1.0, currentReliability + adjustment));
        this.sourceReliability.set(sourceId, newReliability);

        // Update last seen time
        this.lastUpdates.set(sourceId, new Date());
    }

    /**
     * Update position history for rider
     */
    updatePositionHistory(position) {
        if (!this.positionHistory.has(position.riderId)) {
            this.positionHistory.set(position.riderId, []);
        }

        const history = this.positionHistory.get(position.riderId);
        history.push(position);

        // Keep only last 100 positions
        if (history.length > 100) {
            history.shift();
        }
    }

    /**
     * Store position in Redis
     */
    async storePositionInRedis(position) {
        try {
            const key = `position:${position.riderId}`;
            const data = JSON.stringify(position.toJSON());
            
            await this.redis.setEx(key, 3600, data); // Expire after 1 hour
            
            // Also store in sorted set for time-based queries
            await this.redis.zAdd('positions:timeline', {
                score: position.timestamp.getTime(),
                value: `${position.riderId}:${position.timestamp.getTime()}`
            });

        } catch (error) {
            logger.warn('Failed to store position in Redis', {
                riderId: position.riderId,
                error: error.message
            });
        }
    }

    /**
     * Calculate time gaps between riders/groups
     */
    calculateGaps() {
        const sortedPositions = Array.from(this.positions.values())
            .filter(pos => pos.position !== null && pos.timeFromStart !== null)
            .sort((a, b) => a.position - b.position);

        const gaps = new Map();

        for (let i = 1; i < sortedPositions.length; i++) {
            const current = sortedPositions[i];
            const previous = sortedPositions[i - 1];
            
            const timeGap = current.timeFromStart - previous.timeFromStart;
            gaps.set(current.riderId, {
                riderId: current.riderId,
                position: current.position,
                gapToPrevious: timeGap,
                gapToLeader: current.timeFromStart - sortedPositions[0].timeFromStart,
                previousRider: previous.riderId
            });
        }

        // Leader has no gap
        if (sortedPositions.length > 0) {
            gaps.set(sortedPositions[0].riderId, {
                riderId: sortedPositions[0].riderId,
                position: 1,
                gapToPrevious: 0,
                gapToLeader: 0,
                previousRider: null
            });
        }

        return gaps;
    }

    /**
     * Detect rider groups based on proximity and timing
     */
    detectGroups() {
        if (!this.options.groupDetectionEnabled) return;

        const startTime = performance.now();
        const newGroups = new Map();
        const processedRiders = new Set();

        // Get all valid positions sorted by race position
        const sortedPositions = Array.from(this.positions.values())
            .filter(pos => pos.isValid() && pos.position !== null)
            .sort((a, b) => a.position - b.position);

        let groupId = 1;

        for (const position of sortedPositions) {
            if (processedRiders.has(position.riderId)) continue;

            const group = new RiderGroup(`group_${groupId++}`, [position.riderId]);
            processedRiders.add(position.riderId);

            // Find nearby riders to add to this group
            for (const otherPosition of sortedPositions) {
                if (processedRiders.has(otherPosition.riderId)) continue;

                if (this.areRidersInSameGroup(position, otherPosition)) {
                    group.addRider(otherPosition.riderId);
                    processedRiders.add(otherPosition.riderId);
                }
            }

            group.updateMetrics(this.positions);
            newGroups.set(group.id, group);
        }

        // Update groups
        this.groups.clear();
        for (const [groupId, group] of newGroups) {
            this.groups.set(groupId, group);
        }

        // Calculate gaps between groups
        this.calculateGroupGaps();

        this.stats.groupsDetected = this.groups.size;
        this.emit('groups-updated', Array.from(this.groups.values()));

        logger.debug('Group detection completed', {
            groupsDetected: this.groups.size,
            processingTime: performance.now() - startTime
        });
    }

    /**
     * Check if two riders should be in the same group
     */
    areRidersInSameGroup(pos1, pos2) {
        // Time-based grouping
        if (pos1.timeFromStart && pos2.timeFromStart) {
            const timeDiff = Math.abs(pos1.timeFromStart - pos2.timeFromStart);
            if (timeDiff <= this.options.groupTimeThreshold) {
                return true;
            }
        }

        // Distance-based grouping (if GPS available)
        if (pos1.latitude && pos1.longitude && pos2.latitude && pos2.longitude) {
            const distance = pos1.distanceTo(pos2);
            if (distance && distance <= this.options.groupDistanceThreshold) {
                return true;
            }
        }

        // Position-based grouping (fallback)
        const positionDiff = Math.abs(pos1.position - pos2.position);
        return positionDiff <= 5; // Within 5 positions
    }

    /**
     * Calculate gaps between groups
     */
    calculateGroupGaps() {
        const sortedGroups = Array.from(this.groups.values())
            .sort((a, b) => a.avgPosition - b.avgPosition);

        for (let i = 0; i < sortedGroups.length; i++) {
            const group = sortedGroups[i];
            
            if (i > 0) {
                const previousGroup = sortedGroups[i - 1];
                group.gapToPrevious = this.calculateGroupGap(previousGroup, group);
            }
            
            if (i < sortedGroups.length - 1) {
                const nextGroup = sortedGroups[i + 1];
                group.gapToNext = this.calculateGroupGap(group, nextGroup);
            }
        }
    }

    /**
     * Calculate gap between two groups
     */
    calculateGroupGap(group1, group2) {
        // Find the best time data available for each group
        const group1Riders = Array.from(group1.riders)
            .map(riderId => this.positions.get(riderId))
            .filter(pos => pos && pos.timeFromStart !== null);

        const group2Riders = Array.from(group2.riders)
            .map(riderId => this.positions.get(riderId))
            .filter(pos => pos && pos.timeFromStart !== null);

        if (group1Riders.length === 0 || group2Riders.length === 0) {
            return null;
        }

        // Use the fastest rider from group1 and slowest from group2
        const group1BestTime = Math.min(...group1Riders.map(pos => pos.timeFromStart));
        const group2BestTime = Math.min(...group2Riders.map(pos => pos.timeFromStart));

        return Math.abs(group2BestTime - group1BestTime);
    }

    /**
     * Interpolate positions for missing data
     */
    interpolatePositions() {
        if (!this.options.interpolationEnabled) return;

        const now = new Date();
        let interpolationsPerformed = 0;

        for (const [riderId, position] of this.positions) {
            const timeSinceUpdate = now - position.timestamp;
            
            // Only interpolate if data is recent but not too old
            if (timeSinceUpdate > 5000 && timeSinceUpdate < this.options.maxInterpolationTime) {
                const interpolatedPosition = position.interpolatePosition(now);
                
                if (interpolatedPosition) {
                    this.positions.set(riderId, interpolatedPosition);
                    interpolationsPerformed++;
                    
                    this.emit('position-interpolated', {
                        riderId: riderId,
                        originalTime: position.timestamp,
                        interpolatedTime: now,
                        confidence: interpolatedPosition.confidence
                    });
                }
            }
        }

        this.stats.interpolationsPerformed += interpolationsPerformed;
        
        if (interpolationsPerformed > 0) {
            logger.debug('Position interpolation completed', {
                interpolations: interpolationsPerformed
            });
        }
    }

    /**
     * Clean up stale positions
     */
    cleanupStalePositions() {
        const now = new Date();
        const staleCutoff = now.getTime() - this.options.positionTimeout;
        const staleRiders = [];

        for (const [riderId, position] of this.positions) {
            if (position.timestamp.getTime() < staleCutoff) {
                staleRiders.push(riderId);
            }
        }

        for (const riderId of staleRiders) {
            this.positions.delete(riderId);
            this.positionHistory.delete(riderId);
            
            logger.debug('Removed stale position', { riderId });
            this.emit('position-removed', { riderId, reason: 'stale' });
        }

        if (staleRiders.length > 0) {
            logger.info('Cleaned up stale positions', { count: staleRiders.length });
        }
    }

    /**
     * Update race state based on current positions
     */
    updateRaceState() {
        const positions = Array.from(this.positions.values());
        if (positions.length === 0) return;

        const validPositions = positions.filter(pos => pos.isValid());
        
        // Update basic race statistics
        this.raceState.totalRiders = positions.length;
        this.raceState.activeRiders = validPositions.length;

        // Calculate average speed
        const speeds = validPositions
            .map(pos => pos.speed)
            .filter(speed => speed !== null && speed > 0);
            
        if (speeds.length > 0) {
            this.raceState.averageSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
        }

        // Find fastest rider
        if (speeds.length > 0) {
            const fastestSpeed = Math.max(...speeds);
            const fastestRider = validPositions.find(pos => pos.speed === fastestSpeed);
            this.raceState.fastestRider = fastestRider ? fastestRider.riderId : null;
        }

        // Determine tactical situation
        this.analyzeTacticalSituation();

        // Update leading group and peloton info
        this.updateGroupInfo();

        this.emit('race-state-updated', this.raceState.toJSON());
    }

    /**
     * Analyze current tactical situation
     */
    analyzeTacticalSituation() {
        const groups = Array.from(this.groups.values());
        
        if (groups.length === 0) {
            this.raceState.tacticalSituation = 'stable';
            return;
        }

        // Sort groups by average position
        groups.sort((a, b) => a.avgPosition - b.avgPosition);

        const leadingGroup = groups[0];
        const peloton = groups.find(g => g.groupType === 'peloton') || groups[groups.length - 1];

        // Check for breakaway situation
        if (leadingGroup.groupType === 'breakaway' && leadingGroup.gapToNext > 60) {
            this.raceState.tacticalSituation = 'breakaway';
        }
        // Check for chase situation
        else if (groups.length > 2 && groups[1].groupType === 'chase_group') {
            this.raceState.tacticalSituation = 'chasing';
        }
        // Check for attacking based on speed differences
        else if (this.detectAttacking()) {
            this.raceState.tacticalSituation = 'attacking';
        }
        // Check for sprint preparation
        else if (this.detectSprintPreparation()) {
            this.raceState.tacticalSituation = 'sprint';
        }
        // Check for climbing
        else if (this.detectClimbing()) {
            this.raceState.tacticalSituation = 'climb';
        }
        else {
            this.raceState.tacticalSituation = 'stable';
        }
    }

    /**
     * Detect attacking situation
     */
    detectAttacking() {
        const recentPositions = this.getRecentPositionChanges(30000); // Last 30 seconds
        
        // Look for rapid position changes
        let significantMoves = 0;
        for (const changes of recentPositions.values()) {
            if (changes.positionChange > 5) { // Moved up more than 5 positions
                significantMoves++;
            }
        }

        return significantMoves > 3; // Multiple riders attacking
    }

    /**
     * Detect sprint preparation
     */
    detectSprintPreparation() {
        // Look for high speeds and close grouping
        const positions = Array.from(this.positions.values());
        const highSpeeds = positions.filter(pos => pos.speed && pos.speed > 15).length; // > 54 km/h
        const closeGroup = this.groups.size === 1 || 
                          (this.groups.size === 2 && Array.from(this.groups.values())[0].size > 20);

        return highSpeeds > 10 && closeGroup;
    }

    /**
     * Detect climbing situation
     */
    detectClimbing() {
        // Look for slower speeds and altitude gain
        const positions = Array.from(this.positions.values());
        const lowSpeeds = positions.filter(pos => pos.speed && pos.speed < 8).length; // < 29 km/h
        const altitudeData = positions.filter(pos => pos.altitude !== null);

        if (altitudeData.length > 5) {
            const avgAltitude = altitudeData.reduce((sum, pos) => sum + pos.altitude, 0) / altitudeData.length;
            const recentAltitudes = altitudeData.slice(-5).map(pos => pos.altitude);
            const altitudeGain = Math.max(...recentAltitudes) - Math.min(...recentAltitudes);
            
            return lowSpeeds > positions.length * 0.5 && altitudeGain > 50; // Significant altitude gain
        }

        return lowSpeeds > positions.length * 0.7; // Most riders going slow
    }

    /**
     * Get recent position changes for riders
     */
    getRecentPositionChanges(timeWindow) {
        const now = new Date();
        const cutoff = now.getTime() - timeWindow;
        const changes = new Map();

        for (const [riderId, history] of this.positionHistory) {
            const recentPositions = history.filter(pos => pos.timestamp.getTime() >= cutoff);
            
            if (recentPositions.length >= 2) {
                const oldest = recentPositions[0];
                const newest = recentPositions[recentPositions.length - 1];
                
                changes.set(riderId, {
                    riderId: riderId,
                    positionChange: oldest.position - newest.position, // Positive means moved up
                    timeSpan: newest.timestamp - oldest.timestamp,
                    speedChange: newest.speed - oldest.speed
                });
            }
        }

        return changes;
    }

    /**
     * Update group information in race state
     */
    updateGroupInfo() {
        const groups = Array.from(this.groups.values());
        
        if (groups.length === 0) return;

        // Sort groups by position
        groups.sort((a, b) => a.avgPosition - b.avgPosition);

        // Leading group
        this.raceState.leadingGroup = groups[0].toJSON();

        // Find peloton
        const peloton = groups.find(g => g.groupType === 'peloton');
        if (peloton) {
            this.raceState.pelotonPosition = peloton.avgPosition;
            this.raceState.pelotonGap = peloton.gapToPrevious || 0;
        }
    }

    /**
     * Get current positions for all riders
     */
    getCurrentPositions() {
        return Array.from(this.positions.values()).map(pos => pos.toJSON());
    }

    /**
     * Get current groups
     */
    getCurrentGroups() {
        return Array.from(this.groups.values()).map(group => group.toJSON());
    }

    /**
     * Get position for specific rider
     */
    getRiderPosition(riderId) {
        const position = this.positions.get(riderId);
        return position ? position.toJSON() : null;
    }

    /**
     * Get position history for rider
     */
    getRiderHistory(riderId, limit = 50) {
        const history = this.positionHistory.get(riderId) || [];
        return history.slice(-limit).map(pos => pos.toJSON());
    }

    /**
     * Get race gaps
     */
    getRaceGaps() {
        return this.calculateGaps();
    }

    /**
     * Start processing loop
     */
    startProcessing() {
        this.updateTimer = setInterval(() => {
            this.processUpdate();
        }, this.options.updateInterval);

        logger.info('Position tracker processing started', {
            updateInterval: this.options.updateInterval
        });
    }

    /**
     * Main processing update cycle
     */
    async processUpdate() {
        if (this.isProcessing) return;
        
        this.isProcessing = true;
        const startTime = performance.now();

        try {
            // Clean up stale positions
            this.cleanupStalePositions();

            // Interpolate missing positions
            this.interpolatePositions();

            // Detect groups
            this.detectGroups();

            // Update race state
            this.updateRaceState();

            // Update processing time
            this.stats.lastProcessingTime = performance.now() - startTime;

        } catch (error) {
            logger.error('Error in processing update', { error: error.message });
            this.stats.errors++;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Update processing statistics
     */
    updateProcessingStats(processingTime) {
        const alpha = 0.1; // Smoothing factor for moving average
        this.stats.averageProcessingTime = 
            this.stats.averageProcessingTime * (1 - alpha) + processingTime * alpha;
    }

    /**
     * Get current statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeRiders: this.positions.size,
            activeGroups: this.groups.size,
            dataSources: this.dataSources.size,
            memoryUsage: process.memoryUsage()
        };
    }

    /**
     * Stop processing and cleanup
     */
    async stop() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }

        if (this.redis) {
            await this.redis.quit();
        }

        logger.info('Position tracker stopped');
    }
}

module.exports = { PositionTracker, RiderPosition, RiderGroup, RaceState };