#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import core components
const DataCollectionScheduler = require('./scheduling/DataCollectionScheduler');
const RaceResultsScraper = require('./scrapers/procyclingstats/RaceResultsScraper');
const RiderProfileScraper = require('./scrapers/procyclingstats/RiderProfileScraper');
const TeamRosterScraper = require('./scrapers/procyclingstats/TeamRosterScraper');
const DataCleaningPipeline = require('./processing/DataCleaningPipeline');
const ScrapingMonitor = require('./monitoring/ScrapingMonitor');
const ErrorRecoveryManager = require('./recovery/ErrorRecoveryManager');
const AIDataPreparation = require('./ai/AIDataPreparation');
const { logger, logError } = require('./config/logger');

/**
 * PelotonIQ Data Processor - Main Entry Point
 * Comprehensive web scraping and data processing system for cycling data
 */
class PelotonIQDataProcessor {
  constructor() {
    this.logger = logger;
    this.scheduler = null;
    this.monitor = null;
    this.recoveryManager = null;
    this.aiDataPrep = null;
    this.isRunning = false;
    
    // Configuration
    this.config = {
      mode: process.env.NODE_ENV || 'development',
      scrapingEnabled: process.env.SCRAPING_ENABLED === 'true',
      monitoringEnabled: process.env.MONITORING_ENABLED === 'true',
      schedulingEnabled: true
    };
    
    this.logger.info('PelotonIQ Data Processor initialized', {
      version: this.getVersion(),
      config: this.config,
      nodeVersion: process.version
    });
  }
  
  /**
   * Start the data processor
   */
  async start() {
    try {
      this.logger.info('Starting PelotonIQ Data Processor', {
        mode: this.config.mode,
        pid: process.pid
      });
      
      // Validate environment
      this.validateEnvironment();
      
      // Initialize error recovery manager
      this.recoveryManager = new ErrorRecoveryManager({
        enableAutomaticRecovery: true,
        enableIntegrityChecks: true,
        enableDataBackup: true
      });
      
      // Initialize AI data preparation
      this.aiDataPrep = new AIDataPreparation({
        enableFeatureScaling: true,
        outputFormats: ['tensorflow', 'json']
      });
      
      // Start monitoring if enabled
      if (this.config.monitoringEnabled) {
        this.monitor = new ScrapingMonitor({
          port: parseInt(process.env.MONITORING_PORT) || 3001,
          enableWebDashboard: true,
          enableMetricsApi: true,
          enableAlerting: true
        });
        
        await this.monitor.start();
      }
      
      // Start scheduler if enabled
      if (this.config.schedulingEnabled) {
        this.scheduler = new DataCollectionScheduler({
          enableResourceMonitoring: this.config.monitoringEnabled,
          enableFailureRecovery: true,
          alertOnFailures: true
        });
        
        // Setup scheduler event handlers
        this.setupSchedulerEventHandlers();
        
        // Register components with monitor if available
        if (this.monitor) {
          this.monitor.registerComponent('DataCollectionScheduler', this.scheduler, { type: 'scheduler' });
          this.monitor.registerComponent('ErrorRecoveryManager', this.recoveryManager, { type: 'recovery' });
          this.monitor.registerComponent('AIDataPreparation', this.aiDataPrep, { type: 'ai' });
        }
        
        // Start the scheduler
        this.scheduler.start();
      }
      
      this.isRunning = true;
      
      this.logger.info('PelotonIQ Data Processor started successfully', {
        schedulerActive: !!this.scheduler,
        uptime: new Date().toISOString()
      });
      
      // Keep the process running
      this.keepAlive();
      
    } catch (error) {
      logError(error, {
        operation: 'data-processor-start',
        config: this.config
      });
      
      process.exit(1);
    }
  }
  
  /**
   * Stop the data processor gracefully
   */
  async stop() {
    try {
      this.logger.info('Stopping PelotonIQ Data Processor');
      
      this.isRunning = false;
      
      if (this.scheduler) {
        this.scheduler.stop();
        this.scheduler = null;
      }
      
      if (this.monitor) {
        await this.monitor.stop();
        this.monitor = null;
      }
      
      this.logger.info('PelotonIQ Data Processor stopped successfully');
      
    } catch (error) {
      logError(error, {
        operation: 'data-processor-stop'
      });
    }
  }
  
  /**
   * Run a one-time scraping operation
   */
  async runScraping(type, target, options = {}) {
    try {
      this.logger.info('Running one-time scraping operation', {
        type,
        target,
        options
      });
      
      let result;
      
      switch (type) {
        case 'race-results':
          result = await this.scrapeRaceResults(target, options);
          break;
          
        case 'rider-profile':
          result = await this.scrapeRiderProfile(target, options);
          break;
          
        case 'team-roster':
          result = await this.scrapeTeamRoster(target, options);
          break;
          
        default:
          throw new Error(`Unknown scraping type: ${type}`);
      }
      
      this.logger.info('Scraping operation completed', {
        type,
        target,
        dataQuality: result.dataQuality?.overallScore,
        duration: result.duration
      });
      
      return result;
      
    } catch (error) {
      logError(error, {
        operation: 'one-time-scraping',
        type,
        target,
        options
      });
      
      throw error;
    }
  }
  
  /**
   * Scrape race results
   */
  async scrapeRaceResults(raceId, options = {}) {
    const startTime = Date.now();
    
    try {
      const scraper = new RaceResultsScraper();
      const pipeline = new DataCleaningPipeline();
      
      // Scrape raw data
      const rawData = await scraper.scrape(raceId, options);
      
      // Clean and validate data
      const cleanedData = await pipeline.processRaceResults(rawData, options);
      
      const duration = Date.now() - startTime;
      
      return {
        ...cleanedData,
        duration,
        scrapingStats: scraper.getStats()
      };
      
    } catch (error) {
      logError(error, {
        operation: 'scrape-race-results',
        raceId,
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Scrape rider profile
   */
  async scrapeRiderProfile(riderId, options = {}) {
    const startTime = Date.now();
    
    try {
      const scraper = new RiderProfileScraper();
      const pipeline = new DataCleaningPipeline();
      
      // Scrape raw data
      const rawData = await scraper.scrape(riderId, options);
      
      // Clean and validate data
      const cleanedData = await pipeline.processRiderProfile(rawData, options);
      
      const duration = Date.now() - startTime;
      
      return {
        ...cleanedData,
        duration,
        scrapingStats: scraper.getStats()
      };
      
    } catch (error) {
      logError(error, {
        operation: 'scrape-rider-profile',
        riderId,
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Scrape team roster
   */
  async scrapeTeamRoster(teamId, options = {}) {
    const startTime = Date.now();
    
    try {
      const scraper = new TeamRosterScraper();
      const pipeline = new DataCleaningPipeline();
      
      // Register with monitor if available
      if (this.monitor) {
        this.monitor.registerComponent('TeamRosterScraper', scraper, { type: 'scraper' });
      }
      
      // Scrape raw data
      const rawData = await scraper.scrape(teamId, options);
      
      // Clean and validate data (placeholder for team roster pipeline)
      const cleanedData = {
        ...rawData,
        duration: Date.now() - startTime
      };
      
      const duration = Date.now() - startTime;
      
      return {
        ...cleanedData,
        duration,
        scrapingStats: scraper.getStats ? scraper.getStats() : {}
      };
      
    } catch (error) {
      logError(error, {
        operation: 'scrape-team-roster',
        teamId,
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Get system status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      scheduler: this.scheduler ? {
        active: true,
        statistics: this.scheduler.getStatistics()
      } : { active: false },
      config: this.config,
      version: this.getVersion(),
      nodeVersion: process.version
    };
  }
  
  /**
   * Setup scheduler event handlers
   */
  setupSchedulerEventHandlers() {
    if (!this.scheduler) return;
    
    this.scheduler.on('job-completed', (event) => {
      this.logger.info('Scheduled job completed', event);
    });
    
    this.scheduler.on('job-failed', (event) => {
      this.logger.error('Scheduled job failed', event);
    });
    
    this.scheduler.on('health-check', (health) => {
      if (health.scheduler.status !== 'healthy') {
        this.logger.warn('Scheduler health check warning', health);
      }
    });
    
    this.scheduler.on('scraper-activity', (event) => {
      this.logger.debug('Scraper activity', event);
    });
  }
  
  /**
   * Validate environment configuration
   */
  validateEnvironment() {
    const requiredEnvVars = [
      'NODE_ENV'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      this.logger.warn('Missing environment variables', {
        missingVars,
        note: 'Using default values'
      });
    }
    
    // Validate URLs
    const baseUrl = process.env.PCS_BASE_URL || 'https://www.procyclingstats.com';
    try {
      new URL(baseUrl);
    } catch (error) {
      throw new Error(`Invalid PCS_BASE_URL: ${baseUrl}`);
    }
    
    // Validate numeric configurations
    const numericConfigs = {
      'RATE_LIMIT_REQUESTS_PER_MINUTE': 30,
      'REQUEST_TIMEOUT_MS': 30000,
      'RETRY_ATTEMPTS': 3
    };
    
    for (const [key, defaultValue] of Object.entries(numericConfigs)) {
      const value = process.env[key];
      if (value && isNaN(parseInt(value))) {
        this.logger.warn(`Invalid numeric configuration: ${key}=${value}, using default: ${defaultValue}`);
      }
    }
    
    this.logger.info('Environment validation completed');
  }
  
  /**
   * Get application version
   */
  getVersion() {
    try {
      const packagePath = path.join(__dirname, 'package.json');
      if (fs.existsSync(packagePath)) {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        return packageJson.version;
      }
    } catch (error) {
      this.logger.debug('Could not read version from package.json');
    }
    
    return '1.0.0';
  }
  
  /**
   * Keep the process alive
   */
  keepAlive() {
    setInterval(() => {
      if (this.isRunning && this.config.mode === 'development') {
        this.logger.debug('Data processor heartbeat', {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024 + ' MB'
        });
      }
    }, 300000); // Every 5 minutes in development
  }
}

// CLI handling
async function main() {
  const processor = new PelotonIQDataProcessor();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const command = args[0];
  
  try {
    switch (command) {
      case 'start':
        await processor.start();
        break;
        
      case 'scrape':
        const type = args[1];
        const target = args[2];
        const options = args[3] ? JSON.parse(args[3]) : {};
        
        if (!type || !target) {
          console.error('Usage: node index.js scrape <type> <target> [options]');
          console.error('Types: race-results, rider-profile, team-roster');
          process.exit(1);
        }
        
        const result = await processor.runScraping(type, target, options);
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
        break;
        
      case 'status':
        const status = processor.getStatus();
        console.log(JSON.stringify(status, null, 2));
        process.exit(0);
        break;
        
      case 'test':
        // Run basic functionality tests
        logger.info('Running basic functionality tests');
        
        // Test scraper creation
        const testScraper = new RaceResultsScraper();
        logger.info('RaceResultsScraper created successfully');
        
        // Test data pipeline
        const testPipeline = new DataCleaningPipeline();
        logger.info('DataCleaningPipeline created successfully');
        
        logger.info('All basic tests passed');
        process.exit(0);
        break;
        
      default:
        console.log('PelotonIQ Data Processor');
        console.log('');
        console.log('Usage:');
        console.log('  node index.js start                           Start the data processor with scheduler');
        console.log('  node index.js scrape <type> <target> [opts]   Run one-time scraping operation');
        console.log('  node index.js status                          Show system status');
        console.log('  node index.js test                            Run basic functionality tests');
        console.log('');
        console.log('Scraping types:');
        console.log('  race-results    Scrape race results and classifications');
        console.log('  rider-profile   Scrape rider biographical and career data');
        console.log('  team-roster     Scrape team roster information');
        console.log('');
        console.log('Examples:');
        console.log('  node index.js scrape race-results tour-de-france-2024');
        console.log('  node index.js scrape rider-profile tadej-pogacar');
        console.log('  node index.js scrape team-roster uae-team-emirates');
        process.exit(0);
    }
    
  } catch (error) {
    logError(error, {
      operation: 'cli-command',
      command,
      args
    });
    
    process.exit(1);
  }
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully');
    await processor.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    await processor.stop();
    process.exit(0);
  });
  
  process.on('uncaughtException', (error) => {
    logError(error, {
      operation: 'uncaught-exception',
      fatal: true
    });
    
    processor.stop().then(() => {
      process.exit(1);
    });
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logError(new Error(`Unhandled Rejection: ${reason}`), {
      operation: 'unhandled-rejection',
      promise: promise.toString()
    });
  });
}

// Run the CLI if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = PelotonIQDataProcessor;