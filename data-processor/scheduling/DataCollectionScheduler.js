const cron = require('node-cron');
const EventEmitter = require('events');
const { nanoid } = require('nanoid');
const RaceResultsScraper = require('../scrapers/procyclingstats/RaceResultsScraper');
const RiderProfileScraper = require('../scrapers/procyclingstats/RiderProfileScraper');
const CyclingTeamDataScraper = require('../scrapers/CyclingTeamDataScraper');
const DataCleaningPipeline = require('../processing/DataCleaningPipeline');
const { 
  logger, 
  createComponentLogger, 
  logScrapingActivity, 
  logError,
  logAlert,
  logPerformance 
} = require('../config/logger');

/**
 * DataCollectionScheduler - Manages automated data collection with intelligent scheduling
 * Handles failure recovery, priority-based scheduling, and performance monitoring
 */
class DataCollectionScheduler extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.logger = createComponentLogger('DataCollectionScheduler');
    this.sessionId = nanoid();
    
    this.config = {
      // Schedule configurations from environment or defaults
      schedules: {
        raceResults: process.env.SCHEDULE_RACE_RESULTS || '0 2 * * *', // Daily at 2 AM
        riderProfiles: process.env.SCHEDULE_RIDER_PROFILES || '0 3 * * 0', // Weekly on Sunday at 3 AM
        teamRosters: process.env.SCHEDULE_TEAM_ROSTERS || '0 4 * * 1', // Weekly on Monday at 4 AM
        dataCleanup: process.env.SCHEDULE_DATA_CLEANUP || '0 1 * * 0' // Weekly on Sunday at 1 AM
      },
      
      // Retry configuration
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 300000, // 5 minutes
      
      // Performance thresholds
      maxJobDuration: options.maxJobDuration || 3600000, // 1 hour
      maxConcurrentJobs: options.maxConcurrentJobs || 3,
      
      // Data collection targets
      priority: {
        high: ['current-season-races', 'active-riders'],
        medium: ['recent-races', 'team-rosters'],
        low: ['historical-data', 'archived-riders']
      },
      
      // Resource management
      enableResourceMonitoring: options.enableResourceMonitoring ?? true,
      memoryThresholdMB: options.memoryThresholdMB || 1024,
      
      // Failure handling
      enableFailureRecovery: options.enableFailureRecovery ?? true,
      alertOnFailures: options.alertOnFailures ?? true
    };
    
    // Job management
    this.activeJobs = new Map();
    this.scheduledJobs = new Map();
    this.jobHistory = [];
    this.failedJobs = new Map();
    
    // Components
    this.raceResultsScraper = new RaceResultsScraper();
    this.riderProfileScraper = new RiderProfileScraper();
    this.cyclingTeamDataScraper = new CyclingTeamDataScraper();
    this.dataCleaningPipeline = new DataCleaningPipeline();
    
    // Statistics
    this.stats = {
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      retriedJobs: 0,
      averageJobDuration: 0,
      lastRunTime: null,
      uptime: Date.now()
    };
    
    this.logger.info('DataCollectionScheduler initialized', {
      sessionId: this.sessionId,
      config: this.config,
      schedules: this.config.schedules
    });
    
    this.setupEventHandlers();
  }
  
  /**
   * Start the scheduler with all configured jobs
   */
  start() {
    try {
      this.logger.info('Starting data collection scheduler', {
        sessionId: this.sessionId,
        scheduledJobsCount: Object.keys(this.config.schedules).length
      });
      
      // Schedule race results collection
      this.scheduleJob('race-results', this.config.schedules.raceResults, () => {
        return this.runRaceResultsCollection();
      }, 'high');
      
      // Schedule rider profiles collection
      this.scheduleJob('rider-profiles', this.config.schedules.riderProfiles, () => {
        return this.runRiderProfilesCollection();
      }, 'medium');
      
      // Schedule team rosters collection
      this.scheduleJob('team-rosters', this.config.schedules.teamRosters, () => {
        return this.runTeamRostersCollection();
      }, 'medium');
      
      // Schedule data cleanup
      this.scheduleJob('data-cleanup', this.config.schedules.dataCleanup, () => {
        return this.runDataCleanup();
      }, 'low');
      
      // Schedule health checks
      this.scheduleJob('health-check', '*/15 * * * *', () => { // Every 15 minutes
        return this.runHealthCheck();
      }, 'high');
      
      // Schedule resource monitoring
      if (this.config.enableResourceMonitoring) {
        this.scheduleJob('resource-monitor', '*/5 * * * *', () => { // Every 5 minutes
          return this.monitorResources();
        }, 'low');
      }
      
      // Schedule failure recovery
      if (this.config.enableFailureRecovery) {
        this.scheduleJob('failure-recovery', '*/30 * * * *', () => { // Every 30 minutes
          return this.retryFailedJobs();
        }, 'medium');
      }
      
      this.emit('scheduler-started', {
        sessionId: this.sessionId,
        scheduledJobs: Array.from(this.scheduledJobs.keys())
      });
      
      this.logger.info('Data collection scheduler started successfully', {
        scheduledJobs: this.scheduledJobs.size,
        activeJobs: this.activeJobs.size
      });
      
    } catch (error) {
      logError(error, {
        operation: 'scheduler-start',
        sessionId: this.sessionId
      });
      
      throw error;
    }
  }
  
  /**
   * Stop the scheduler and cleanup resources
   */
  stop() {
    this.logger.info('Stopping data collection scheduler', {
      sessionId: this.sessionId,
      activeJobs: this.activeJobs.size
    });
    
    // Cancel all scheduled jobs
    for (const [jobName, task] of this.scheduledJobs) {
      task.destroy();
      this.logger.debug('Cancelled scheduled job', { jobName });
    }
    
    // Wait for active jobs to complete or force termination
    const activeJobPromises = Array.from(this.activeJobs.values()).map(job => 
      this.terminateJob(job.id, 'scheduler-shutdown')
    );
    
    Promise.allSettled(activeJobPromises).then(() => {
      this.scheduledJobs.clear();
      this.activeJobs.clear();
      
      this.emit('scheduler-stopped', {
        sessionId: this.sessionId,
        stats: this.getStatistics()
      });
      
      this.logger.info('Data collection scheduler stopped successfully');
    });
  }
  
  /**
   * Schedule a job with cron expression
   */
  scheduleJob(jobName, cronExpression, jobFunction, priority = 'medium') {
    try {
      // Validate cron expression
      if (!cron.validate(cronExpression)) {
        throw new Error(`Invalid cron expression: ${cronExpression}`);
      }
      
      const task = cron.schedule(cronExpression, async () => {
        await this.executeJob(jobName, jobFunction, priority);
      }, {
        scheduled: false,
        timezone: 'UTC'
      });
      
      this.scheduledJobs.set(jobName, task);
      
      this.logger.debug('Job scheduled successfully', {
        jobName,
        cronExpression,
        priority,
        sessionId: this.sessionId
      });
      
      // Start the task
      task.start();
      
    } catch (error) {
      logError(error, {
        operation: 'schedule-job',
        jobName,
        cronExpression,
        sessionId: this.sessionId
      });
      
      throw error;
    }
  }
  
  /**
   * Execute a job with monitoring and error handling
   */
  async executeJob(jobName, jobFunction, priority = 'medium') {
    const jobId = nanoid();
    const startTime = Date.now();
    
    try {
      // Check if we can start a new job
      if (this.activeJobs.size >= this.config.maxConcurrentJobs) {
        this.logger.warn('Maximum concurrent jobs reached, queueing job', {
          jobName,
          jobId,
          activeJobs: this.activeJobs.size,
          maxConcurrent: this.config.maxConcurrentJobs
        });
        
        // Queue the job for later execution
        setTimeout(() => this.executeJob(jobName, jobFunction, priority), 60000); // Retry in 1 minute
        return;
      }
      
      // Create job record
      const job = {
        id: jobId,
        name: jobName,
        priority,
        startTime,
        status: 'running',
        retries: 0,
        sessionId: this.sessionId
      };
      
      this.activeJobs.set(jobId, job);
      this.stats.totalJobs++;
      
      this.logger.info('Starting scheduled job', {
        jobName,
        jobId,
        priority,
        activeJobs: this.activeJobs.size,
        sessionId: this.sessionId
      });
      
      logScrapingActivity(
        'DataCollectionScheduler',
        'job-started',
        jobName,
        'started',
        {
          jobId,
          priority,
          sessionId: this.sessionId
        }
      );
      
      // Set timeout for job execution
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Job execution timeout')), this.config.maxJobDuration);
      });
      
      // Execute the job function
      const resultPromise = jobFunction();
      const result = await Promise.race([resultPromise, timeoutPromise]);
      
      // Job completed successfully
      const duration = Date.now() - startTime;
      job.status = 'completed';
      job.duration = duration;
      job.result = result;
      
      this.activeJobs.delete(jobId);
      this.jobHistory.push(job);
      this.stats.successfulJobs++;
      this.stats.lastRunTime = new Date().toISOString();
      
      // Update average duration
      this.updateAverageJobDuration(duration);
      
      this.logger.info('Scheduled job completed successfully', {
        jobName,
        jobId,
        duration: `${duration}ms`,
        sessionId: this.sessionId
      });
      
      logScrapingActivity(
        'DataCollectionScheduler',
        'job-completed',
        jobName,
        'success',
        {
          jobId,
          duration,
          sessionId: this.sessionId
        }
      );
      
      this.emit('job-completed', {
        jobName,
        jobId,
        duration,
        result,
        sessionId: this.sessionId
      });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const job = this.activeJobs.get(jobId);
      
      if (job) {
        job.status = 'failed';
        job.duration = duration;
        job.error = error.message;
        
        this.activeJobs.delete(jobId);
        this.stats.failedJobs++;
        
        // Add to failed jobs for retry
        this.failedJobs.set(jobId, {
          ...job,
          lastAttempt: Date.now(),
          nextRetry: Date.now() + this.config.retryDelay
        });
      }
      
      logError(error, {
        operation: 'scheduled-job-execution',
        jobName,
        jobId,
        duration,
        sessionId: this.sessionId
      });
      
      logScrapingActivity(
        'DataCollectionScheduler',
        'job-failed',
        jobName,
        'failed',
        {
          jobId,
          duration,
          error: error.message,
          sessionId: this.sessionId
        }
      );
      
      if (this.config.alertOnFailures) {
        logAlert(
          'scheduled-job-failure',
          `Scheduled job '${jobName}' failed: ${error.message}`,
          'warning',
          {
            jobName,
            jobId,
            error: error.message,
            sessionId: this.sessionId
          }
        );
      }
      
      this.emit('job-failed', {
        jobName,
        jobId,
        duration,
        error: error.message,
        sessionId: this.sessionId
      });
      
      throw error;
    }
  }
  
  /**
   * Run race results collection job
   */
  async runRaceResultsCollection() {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting race results collection job');
      
      // Get list of races to scrape (this would typically come from a database or API)
      const raceIds = await this.getCurrentSeasonRaces();
      
      const results = [];
      let processed = 0;
      let failed = 0;
      
      for (const raceId of raceIds) {
        try {
          // Scrape race results
          const raceData = await this.raceResultsScraper.scrape(raceId, {
            includeStartList: true
          });
          
          // Clean the data
          const cleanedData = await this.dataCleaningPipeline.processRaceResults(raceData);
          
          // Store the data (implementation would depend on your storage solution)
          await this.storeRaceResults(cleanedData);
          
          results.push({
            raceId,
            status: 'success',
            dataQuality: cleanedData.dataQuality.overallScore,
            stagesCount: cleanedData.stages?.length || 0
          });
          
          processed++;
          
          // Rate limiting delay
          await this.sleep(2000);
          
        } catch (error) {
          this.logger.warn('Failed to process race', {
            raceId,
            error: error.message
          });
          
          results.push({
            raceId,
            status: 'failed',
            error: error.message
          });
          
          failed++;
        }
      }
      
      const duration = Date.now() - startTime;
      
      this.logger.info('Race results collection completed', {
        totalRaces: raceIds.length,
        processed,
        failed,
        duration: `${duration}ms`
      });
      
      return {
        type: 'race-results-collection',
        totalRaces: raceIds.length,
        processed,
        failed,
        results,
        duration
      };
      
    } catch (error) {
      logError(error, {
        operation: 'race-results-collection',
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Run rider profiles collection job
   */
  async runRiderProfilesCollection() {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting rider profiles collection job');
      
      // Get list of riders to scrape
      const riderIds = await this.getActiveRiders();
      
      const results = [];
      let processed = 0;
      let failed = 0;
      
      for (const riderId of riderIds) {
        try {
          // Scrape rider profile
          const riderData = await this.riderProfileScraper.scrape(riderId, {
            includeRecentResults: true,
            includeTeamHistory: true,
            includePalmares: true
          });
          
          // Clean the data
          const cleanedData = await this.dataCleaningPipeline.processRiderProfile(riderData);
          
          // Store the data
          await this.storeRiderProfile(cleanedData);
          
          results.push({
            riderId,
            status: 'success',
            dataQuality: cleanedData.dataQuality.overallScore,
            riderName: cleanedData.personalInfo?.name
          });
          
          processed++;
          
          // Rate limiting delay
          await this.sleep(3000);
          
        } catch (error) {
          this.logger.warn('Failed to process rider', {
            riderId,
            error: error.message
          });
          
          results.push({
            riderId,
            status: 'failed',
            error: error.message
          });
          
          failed++;
        }
      }
      
      const duration = Date.now() - startTime;
      
      this.logger.info('Rider profiles collection completed', {
        totalRiders: riderIds.length,
        processed,
        failed,
        duration: `${duration}ms`
      });
      
      return {
        type: 'rider-profiles-collection',
        totalRiders: riderIds.length,
        processed,
        failed,
        results,
        duration
      };
      
    } catch (error) {
      logError(error, {
        operation: 'rider-profiles-collection',
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Run team rosters collection job
   */
  async runTeamRostersCollection() {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting team rosters collection job');
      
      // Use the comprehensive cycling team data scraper
      const scrapingResults = await this.cyclingTeamDataScraper.populateDatabase({
        includeWorldTour: true,
        includeProTeams: true,
        includeContinental: process.env.INCLUDE_CONTINENTAL_TEAMS === 'true',
        includeHistory: false, // Skip history for faster initial population
        includeStatistics: false,
        includeResults: false,
        includeRiderProfiles: false, // Skip detailed profiles for initial population
        maxRidersPerTeam: parseInt(process.env.MAX_RIDERS_PER_TEAM) || 30,
        saveToDatabase: true,
        historicalYears: [2024] // Only current year for initial population
      });
      
      const duration = Date.now() - startTime;
      
      this.logger.info('Team rosters collection completed', {
        totalTeams: scrapingResults.summary.totalTeams,
        successfulTeams: scrapingResults.summary.successfulTeams,
        failedTeams: scrapingResults.summary.failedTeams,
        totalRiders: scrapingResults.summary.totalRiders,
        successfulRiders: scrapingResults.summary.successfulRiders,
        failedRiders: scrapingResults.summary.failedRiders,
        duration: `${duration}ms`,
        dataQuality: scrapingResults.summary.dataQuality?.overallScore || 0
      });
      
      return {
        type: 'team-rosters-collection',
        totalTeams: scrapingResults.summary.totalTeams,
        processed: scrapingResults.summary.successfulTeams,
        failed: scrapingResults.summary.failedTeams,
        totalRiders: scrapingResults.summary.totalRiders,
        processedRiders: scrapingResults.summary.successfulRiders,
        failedRiders: scrapingResults.summary.failedRiders,
        duration,
        dataQuality: scrapingResults.summary.dataQuality,
        errors: scrapingResults.errors.length > 0 ? scrapingResults.errors.slice(0, 10) : [] // Log first 10 errors
      };
      
    } catch (error) {
      logError(error, {
        operation: 'team-rosters-collection',
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Run data cleanup job
   */
  async runDataCleanup() {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting data cleanup job');
      
      // Clean up old job history
      const cutoffDate = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
      const initialHistoryLength = this.jobHistory.length;
      
      this.jobHistory = this.jobHistory.filter(job => job.startTime > cutoffDate);
      
      // Clean up old failed jobs
      const initialFailedLength = this.failedJobs.size;
      
      for (const [jobId, job] of this.failedJobs) {
        if (job.startTime < cutoffDate || job.retries >= this.config.maxRetries) {
          this.failedJobs.delete(jobId);
        }
      }
      
      // Reset statistics periodically
      if (this.stats.totalJobs > 10000) {
        this.stats = {
          ...this.stats,
          totalJobs: Math.floor(this.stats.totalJobs / 2),
          successfulJobs: Math.floor(this.stats.successfulJobs / 2),
          failedJobs: Math.floor(this.stats.failedJobs / 2),
          retriedJobs: Math.floor(this.stats.retriedJobs / 2)
        };
      }
      
      const duration = Date.now() - startTime;
      const removedHistory = initialHistoryLength - this.jobHistory.length;
      const removedFailed = initialFailedLength - this.failedJobs.size;
      
      this.logger.info('Data cleanup completed', {
        removedHistoryEntries: removedHistory,
        removedFailedJobs: removedFailed,
        currentHistorySize: this.jobHistory.length,
        currentFailedJobsSize: this.failedJobs.size,
        duration: `${duration}ms`
      });
      
      return {
        type: 'data-cleanup',
        removedHistoryEntries: removedHistory,
        removedFailedJobs: removedFailed,
        duration
      };
      
    } catch (error) {
      logError(error, {
        operation: 'data-cleanup',
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Run health check job
   */
  async runHealthCheck() {
    try {
      const health = {
        timestamp: new Date().toISOString(),
        scheduler: {
          status: 'healthy',
          activeJobs: this.activeJobs.size,
          scheduledJobs: this.scheduledJobs.size,
          failedJobs: this.failedJobs.size,
          uptime: Date.now() - this.stats.uptime
        },
        scrapers: {
          raceResults: 'healthy', // Would implement actual health checks
          riderProfiles: 'healthy'
        },
        memory: process.memoryUsage(),
        sessionId: this.sessionId
      };
      
      // Check for concerning metrics
      if (this.activeJobs.size >= this.config.maxConcurrentJobs) {
        health.scheduler.status = 'warning';
        logAlert(
          'high-job-concurrency',
          `Active jobs (${this.activeJobs.size}) at maximum limit`,
          'warning',
          { sessionId: this.sessionId }
        );
      }
      
      if (this.failedJobs.size > 10) {
        health.scheduler.status = 'warning';
        logAlert(
          'high-failed-jobs',
          `High number of failed jobs: ${this.failedJobs.size}`,
          'warning',
          { sessionId: this.sessionId }
        );
      }
      
      this.emit('health-check', health);
      
      return health;
      
    } catch (error) {
      logError(error, {
        operation: 'health-check',
        sessionId: this.sessionId
      });
      
      return {
        timestamp: new Date().toISOString(),
        scheduler: { status: 'unhealthy', error: error.message },
        sessionId: this.sessionId
      };
    }
  }
  
  /**
   * Monitor system resources
   */
  async monitorResources() {
    try {
      const memoryUsage = process.memoryUsage();
      const memoryMB = memoryUsage.heapUsed / 1024 / 1024;
      
      if (memoryMB > this.config.memoryThresholdMB) {
        logAlert(
          'high-memory-usage',
          `Memory usage (${memoryMB.toFixed(2)} MB) exceeds threshold (${this.config.memoryThresholdMB} MB)`,
          'warning',
          {
            memoryUsage: memoryMB,
            threshold: this.config.memoryThresholdMB,
            sessionId: this.sessionId
          }
        );
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          this.logger.info('Forced garbage collection due to high memory usage');
        }
      }
      
      return {
        memory: memoryUsage,
        memoryMB: memoryMB,
        cpuUsage: process.cpuUsage(),
        activeJobs: this.activeJobs.size
      };
      
    } catch (error) {
      logError(error, {
        operation: 'resource-monitoring',
        sessionId: this.sessionId
      });
      
      return { error: error.message };
    }
  }
  
  /**
   * Retry failed jobs
   */
  async retryFailedJobs() {
    const startTime = Date.now();
    
    try {
      const now = Date.now();
      const jobsToRetry = Array.from(this.failedJobs.values())
        .filter(job => 
          job.nextRetry <= now && 
          job.retries < this.config.maxRetries
        );
      
      if (jobsToRetry.length === 0) {
        return { retriedJobs: 0, duration: Date.now() - startTime };
      }
      
      this.logger.info('Retrying failed jobs', {
        jobsToRetry: jobsToRetry.length,
        sessionId: this.sessionId
      });
      
      let retriedCount = 0;
      
      for (const job of jobsToRetry) {
        try {
          // Remove from failed jobs
          this.failedJobs.delete(job.id);
          
          // Increment retry count
          job.retries++;
          
          // Find and re-execute the job function
          // This is a simplified approach - in practice you'd need to store job functions
          this.logger.info('Retrying job', {
            jobName: job.name,
            jobId: job.id,
            retryAttempt: job.retries
          });
          
          // For now, just log the retry attempt
          this.stats.retriedJobs++;
          retriedCount++;
          
        } catch (error) {
          // Put back in failed jobs with updated retry info
          job.lastAttempt = now;
          job.nextRetry = now + (this.config.retryDelay * Math.pow(2, job.retries)); // Exponential backoff
          this.failedJobs.set(job.id, job);
          
          this.logger.warn('Job retry failed', {
            jobName: job.name,
            jobId: job.id,
            retryAttempt: job.retries,
            error: error.message
          });
        }
      }
      
      const duration = Date.now() - startTime;
      
      this.logger.info('Failed jobs retry completed', {
        retriedJobs: retriedCount,
        remainingFailedJobs: this.failedJobs.size,
        duration: `${duration}ms`
      });
      
      return {
        retriedJobs: retriedCount,
        remainingFailedJobs: this.failedJobs.size,
        duration
      };
      
    } catch (error) {
      logError(error, {
        operation: 'retry-failed-jobs',
        duration: Date.now() - startTime,
        sessionId: this.sessionId
      });
      
      throw error;
    }
  }
  
  /**
   * Terminate a running job
   */
  async terminateJob(jobId, reason = 'manual-termination') {
    const job = this.activeJobs.get(jobId);
    
    if (!job) {
      this.logger.warn('Attempted to terminate non-existent job', { jobId, reason });
      return false;
    }
    
    try {
      job.status = 'terminated';
      job.terminationReason = reason;
      job.duration = Date.now() - job.startTime;
      
      this.activeJobs.delete(jobId);
      this.jobHistory.push(job);
      
      this.logger.info('Job terminated', {
        jobName: job.name,
        jobId,
        reason,
        duration: job.duration
      });
      
      logScrapingActivity(
        'DataCollectionScheduler',
        'job-terminated',
        job.name,
        'terminated',
        {
          jobId,
          reason,
          duration: job.duration,
          sessionId: this.sessionId
        }
      );
      
      this.emit('job-terminated', {
        jobName: job.name,
        jobId,
        reason,
        duration: job.duration
      });
      
      return true;
      
    } catch (error) {
      logError(error, {
        operation: 'job-termination',
        jobId,
        reason,
        sessionId: this.sessionId
      });
      
      return false;
    }
  }
  
  /**
   * Get current season races (placeholder implementation)
   */
  async getCurrentSeasonRaces() {
    // This would typically query a database or API
    // For now, return some example race IDs
    return [
      'tour-de-france-2024',
      'giro-italia-2024',
      'vuelta-espana-2024',
      'paris-roubaix-2024',
      'tour-flanders-2024'
    ];
  }
  
  /**
   * Get active riders (placeholder implementation)
   */
  async getActiveRiders() {
    // This would typically query a database or API
    // For now, return some example rider IDs
    return [
      'tadej-pogacar',
      'jonas-vingegaard',
      'primoz-roglic',
      'remco-evenepoel',
      'mathieu-van-der-poel'
    ];
  }
  
  /**
   * Store race results (placeholder implementation)
   */
  async storeRaceResults(data) {
    // This would typically store data in a database
    this.logger.debug('Storing race results', {
      raceId: data.raceId,
      dataQuality: data.dataQuality.overallScore
    });
    
    return true;
  }
  
  /**
   * Store rider profile (placeholder implementation)
   */
  async storeRiderProfile(data) {
    // This would typically store data in a database
    this.logger.debug('Storing rider profile', {
      riderId: data.riderId,
      riderName: data.personalInfo?.name,
      dataQuality: data.dataQuality.overallScore
    });
    
    return true;
  }
  
  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // Handle scraper events
    this.raceResultsScraper.on('page-scraped', (event) => {
      this.emit('scraper-activity', {
        scraper: 'race-results',
        event: 'page-scraped',
        ...event
      });
    });
    
    this.riderProfileScraper.on('page-scraped', (event) => {
      this.emit('scraper-activity', {
        scraper: 'rider-profiles',
        event: 'page-scraped',
        ...event
      });
    });
    
    // Handle process signals
    process.on('SIGINT', () => {
      this.logger.info('Received SIGINT, stopping scheduler gracefully');
      this.stop();
    });
    
    process.on('SIGTERM', () => {
      this.logger.info('Received SIGTERM, stopping scheduler gracefully');
      this.stop();
    });
  }
  
  /**
   * Update average job duration
   */
  updateAverageJobDuration(duration) {
    const totalJobs = this.stats.successfulJobs + this.stats.failedJobs;
    this.stats.averageJobDuration = 
      ((this.stats.averageJobDuration * (totalJobs - 1)) + duration) / totalJobs;
  }
  
  /**
   * Get comprehensive statistics
   */
  getStatistics() {
    const uptime = Date.now() - this.stats.uptime;
    const successRate = this.stats.totalJobs > 0 ? 
      (this.stats.successfulJobs / this.stats.totalJobs * 100).toFixed(2) : 0;
    
    return {
      sessionId: this.sessionId,
      uptime: `${Math.round(uptime / 1000)}s`,
      totalJobs: this.stats.totalJobs,
      successfulJobs: this.stats.successfulJobs,
      failedJobs: this.stats.failedJobs,
      retriedJobs: this.stats.retriedJobs,
      successRate: `${successRate}%`,
      averageJobDuration: `${Math.round(this.stats.averageJobDuration)}ms`,
      activeJobs: this.activeJobs.size,
      scheduledJobs: this.scheduledJobs.size,
      failedJobsAwaitingRetry: this.failedJobs.size,
      lastRunTime: this.stats.lastRunTime,
      jobHistorySize: this.jobHistory.length
    };
  }
  
  /**
   * Sleep utility function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DataCollectionScheduler;