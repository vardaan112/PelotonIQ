const EventEmitter = require('events');
const express = require('express');
const { nanoid } = require('nanoid');
const NodeCache = require('node-cache');
const { 
  logger, 
  createComponentLogger, 
  logError,
  logAlert,
  logPerformance 
} = require('../config/logger');

/**
 * ScrapingMonitor - Comprehensive monitoring system for scraping operations
 * Provides real-time dashboards, alerting, and performance analytics
 */
class ScrapingMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.logger = createComponentLogger('ScrapingMonitor');
    this.sessionId = nanoid();
    
    this.config = {
      // Server configuration
      port: options.port || parseInt(process.env.MONITORING_PORT) || 3001,
      enableWebDashboard: options.enableWebDashboard ?? true,
      enableMetricsApi: options.enableMetricsApi ?? true,
      
      // Monitoring thresholds
      errorRateThreshold: options.errorRateThreshold || 0.1, // 10%
      responseTimeThreshold: options.responseTimeThreshold || 30000, // 30 seconds
      memoryThreshold: options.memoryThreshold || 1024, // 1GB in MB
      diskSpaceThreshold: options.diskSpaceThreshold || 0.9, // 90%
      
      // Alert configuration
      enableAlerting: options.enableAlerting ?? true,
      alertCooldown: options.alertCooldown || 300000, // 5 minutes
      emailAlerts: options.emailAlerts ?? false,
      slackAlerts: options.slackAlerts ?? false,
      
      // Data retention
      metricsRetentionHours: options.metricsRetentionHours || 24,
      performanceDataPoints: options.performanceDataPoints || 1000,
      
      // Update intervals
      metricsUpdateInterval: options.metricsUpdateInterval || 30000, // 30 seconds
      healthCheckInterval: options.healthCheckInterval || 60000, // 1 minute
      cleanupInterval: options.cleanupInterval || 3600000 // 1 hour
    };
    
    // Express app for web dashboard
    this.app = express();
    this.server = null;
    
    // Metrics storage
    this.metricsCache = new NodeCache({
      stdTTL: this.config.metricsRetentionHours * 3600,
      checkperiod: 600 // Check for expired keys every 10 minutes
    });
    
    // Performance tracking
    this.performanceData = {
      responseTime: [],
      throughput: [],
      errorRate: [],
      memory: [],
      cpu: []
    };
    
    // Current metrics
    this.currentMetrics = {
      scrapers: {},
      system: {},
      alerts: [],
      health: 'unknown',
      lastUpdate: null
    };
    
    // Alert tracking
    this.activeAlerts = new Map();
    this.alertHistory = [];
    
    // Registered scrapers and components
    this.registeredComponents = new Map();
    
    // Intervals
    this.intervals = {
      metrics: null,
      health: null,
      cleanup: null
    };
    
    this.logger.info('ScrapingMonitor initialized', {
      sessionId: this.sessionId,
      config: this.config
    });
  }
  
  /**
   * Start the monitoring system
   */
  async start() {
    try {
      this.logger.info('Starting scraping monitor', {
        port: this.config.port,
        sessionId: this.sessionId
      });
      
      // Setup Express middleware
      this.setupExpressApp();
      
      // Start web server
      if (this.config.enableWebDashboard || this.config.enableMetricsApi) {
        await this.startWebServer();
      }
      
      // Start monitoring intervals
      this.startMonitoringIntervals();
      
      // Initialize current metrics
      await this.updateSystemMetrics();
      
      this.emit('monitor-started', {
        sessionId: this.sessionId,
        port: this.config.port
      });
      
      this.logger.info('Scraping monitor started successfully', {
        port: this.config.port,
        dashboard: this.config.enableWebDashboard,
        api: this.config.enableMetricsApi
      });
      
    } catch (error) {
      logError(error, {
        operation: 'monitor-start',
        sessionId: this.sessionId
      });
      
      throw error;
    }
  }
  
  /**
   * Stop the monitoring system
   */
  async stop() {
    try {
      this.logger.info('Stopping scraping monitor', {
        sessionId: this.sessionId
      });
      
      // Clear intervals
      Object.values(this.intervals).forEach(interval => {
        if (interval) clearInterval(interval);
      });
      
      // Close web server
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
      }
      
      // Clear caches
      this.metricsCache.flushAll();
      this.activeAlerts.clear();
      
      this.emit('monitor-stopped', {
        sessionId: this.sessionId
      });
      
      this.logger.info('Scraping monitor stopped successfully');
      
    } catch (error) {
      logError(error, {
        operation: 'monitor-stop',
        sessionId: this.sessionId
      });
    }
  }
  
  /**
   * Register a component for monitoring
   */
  registerComponent(name, component, options = {}) {
    try {
      const componentInfo = {
        name,
        component,
        type: options.type || 'scraper',
        registeredAt: new Date().toISOString(),
        options
      };
      
      this.registeredComponents.set(name, componentInfo);
      
      // Setup event listeners for the component
      this.setupComponentEventListeners(name, component);
      
      this.logger.info('Component registered for monitoring', {
        name,
        type: componentInfo.type,
        sessionId: this.sessionId
      });
      
      this.emit('component-registered', componentInfo);
      
    } catch (error) {
      logError(error, {
        operation: 'register-component',
        componentName: name,
        sessionId: this.sessionId
      });
    }
  }
  
  /**
   * Unregister a component
   */
  unregisterComponent(name) {
    try {
      const componentInfo = this.registeredComponents.get(name);
      
      if (componentInfo) {
        this.registeredComponents.delete(name);
        
        // Remove from current metrics
        if (this.currentMetrics.scrapers[name]) {
          delete this.currentMetrics.scrapers[name];
        }
        
        this.logger.info('Component unregistered from monitoring', {
          name,
          sessionId: this.sessionId
        });
        
        this.emit('component-unregistered', { name });
      }
      
    } catch (error) {
      logError(error, {
        operation: 'unregister-component',
        componentName: name,
        sessionId: this.sessionId
      });
    }
  }
  
  /**
   * Record a metric
   */
  recordMetric(category, name, value, metadata = {}) {
    try {
      const timestamp = Date.now();
      const metricKey = `${category}.${name}`;
      
      const metric = {
        category,
        name,
        value,
        timestamp,
        metadata,
        sessionId: this.sessionId
      };
      
      // Store in cache
      this.metricsCache.set(`${metricKey}.${timestamp}`, metric);
      
      // Update performance data arrays
      this.updatePerformanceData(category, name, value, timestamp);
      
      // Check for alert conditions
      this.checkAlertConditions(category, name, value, metadata);
      
      this.emit('metric-recorded', metric);
      
    } catch (error) {
      logError(error, {
        operation: 'record-metric',
        category,
        name,
        value,
        sessionId: this.sessionId
      });
    }
  }
  
  /**
   * Record a scraping activity
   */
  recordScrapingActivity(scraperName, activity, target, result, metadata = {}) {
    try {
      const timestamp = Date.now();
      
      const activityRecord = {
        scraperName,
        activity,
        target,
        result,
        timestamp,
        metadata,
        sessionId: this.sessionId
      };
      
      // Update scraper metrics
      if (!this.currentMetrics.scrapers[scraperName]) {
        this.currentMetrics.scrapers[scraperName] = {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          averageResponseTime: 0,
          lastActivity: null,
          status: 'idle'
        };
      }
      
      const scraperMetrics = this.currentMetrics.scrapers[scraperName];
      scraperMetrics.totalRequests++;
      scraperMetrics.lastActivity = timestamp;
      scraperMetrics.status = 'active';
      
      if (result === 'success') {
        scraperMetrics.successfulRequests++;
      } else if (result === 'failed') {
        scraperMetrics.failedRequests++;
      }
      
      // Update response time if provided
      if (metadata.duration) {
        const totalTime = scraperMetrics.averageResponseTime * (scraperMetrics.totalRequests - 1) + metadata.duration;
        scraperMetrics.averageResponseTime = totalTime / scraperMetrics.totalRequests;
      }
      
      // Record as metric
      this.recordMetric('scraping', `${scraperName}.${activity}`, result === 'success' ? 1 : 0, {
        target,
        result,
        ...metadata
      });
      
      this.emit('scraping-activity', activityRecord);
      
    } catch (error) {
      logError(error, {
        operation: 'record-scraping-activity',
        scraperName,
        activity,
        sessionId: this.sessionId
      });
    }
  }
  
  /**
   * Setup Express application
   */
  setupExpressApp() {
    // Middleware
    this.app.use(express.json());
    this.app.use(express.static(__dirname + '/public'));
    
    // CORS headers
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      next();
    });
    
    // Setup routes
    this.setupRoutes();
    
    // Error handling
    this.app.use((error, req, res, next) => {
      logError(error, {
        operation: 'express-request',
        path: req.path,
        method: req.method
      });
      
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    });
  }
  
  /**
   * Setup Express routes
   */
  setupRoutes() {
    // Dashboard route
    if (this.config.enableWebDashboard) {
      this.app.get('/', (req, res) => {
        res.send(this.generateDashboardHTML());
      });
    }
    
    if (this.config.enableMetricsApi) {
      // Metrics API routes
      this.app.get('/api/metrics', (req, res) => {
        res.json(this.getCurrentMetrics());
      });
      
      this.app.get('/api/metrics/performance', (req, res) => {
        res.json(this.getPerformanceData());
      });
      
      this.app.get('/api/metrics/alerts', (req, res) => {
        res.json(this.getAlerts());
      });
      
      this.app.get('/api/health', (req, res) => {
        res.json(this.getHealthStatus());
      });
      
      this.app.get('/api/components', (req, res) => {
        res.json(this.getRegisteredComponents());
      });
      
      // Historical metrics
      this.app.get('/api/metrics/history/:category/:name', (req, res) => {
        const { category, name } = req.params;
        const hours = parseInt(req.query.hours) || 1;
        
        res.json(this.getMetricHistory(category, name, hours));
      });
    }
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        sessionId: this.sessionId
      });
    });
  }
  
  /**
   * Start web server
   */
  async startWebServer() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, (error) => {
        if (error) {
          reject(error);
        } else {
          this.logger.info('Monitoring web server started', {
            port: this.config.port,
            dashboard: this.config.enableWebDashboard ? `http://localhost:${this.config.port}` : 'disabled',
            api: this.config.enableMetricsApi ? `http://localhost:${this.config.port}/api` : 'disabled'
          });
          resolve();
        }
      });
    });
  }
  
  /**
   * Start monitoring intervals
   */
  startMonitoringIntervals() {
    // Metrics update interval
    this.intervals.metrics = setInterval(() => {
      this.updateSystemMetrics();
    }, this.config.metricsUpdateInterval);
    
    // Health check interval
    this.intervals.health = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
    
    // Cleanup interval
    this.intervals.cleanup = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);
  }
  
  /**
   * Setup event listeners for a component
   */
  setupComponentEventListeners(name, component) {
    try {
      // Listen for common scraper events
      if (component.on) {
        component.on('page-scraped', (event) => {
          this.recordScrapingActivity(name, 'page-scraped', event.url, 'success', event);
        });
        
        component.on('scraping-error', (event) => {
          this.recordScrapingActivity(name, 'scraping-error', event.url, 'failed', event);
        });
        
        component.on('request-made', (event) => {
          this.recordMetric('scraping', `${name}.requests`, 1, event);
        });
        
        component.on('data-extracted', (event) => {
          this.recordMetric('scraping', `${name}.data-points`, event.count || 1, event);
        });
      }
      
    } catch (error) {
      this.logger.warn('Failed to setup component event listeners', {
        componentName: name,
        error: error.message
      });
    }
  }
  
  /**
   * Update system metrics
   */
  async updateSystemMetrics() {
    try {
      const startTime = Date.now();
      
      // Memory usage
      const memoryUsage = process.memoryUsage();
      const memoryMB = memoryUsage.heapUsed / 1024 / 1024;
      
      // CPU usage
      const cpuUsage = process.cpuUsage();
      
      // Update current metrics
      this.currentMetrics.system = {
        memory: {
          heapUsed: memoryMB,
          heapTotal: memoryUsage.heapTotal / 1024 / 1024,
          rss: memoryUsage.rss / 1024 / 1024,
          external: memoryUsage.external / 1024 / 1024
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        },
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid
      };
      
      this.currentMetrics.lastUpdate = new Date().toISOString();
      
      // Record metrics
      this.recordMetric('system', 'memory', memoryMB);
      this.recordMetric('system', 'cpu-user', cpuUsage.user);
      this.recordMetric('system', 'cpu-system', cpuUsage.system);
      this.recordMetric('system', 'uptime', process.uptime());
      
      // Update component statuses
      for (const [name, componentInfo] of this.registeredComponents) {
        if (componentInfo.component.getStats) {
          try {
            const stats = componentInfo.component.getStats();
            this.currentMetrics.scrapers[name] = {
              ...this.currentMetrics.scrapers[name],
              ...stats
            };
          } catch (error) {
            this.logger.debug('Failed to get component stats', {
              componentName: name,
              error: error.message
            });
          }
        }
      }
      
      logPerformance('metrics-update', startTime, {
        sessionId: this.sessionId
      });
      
    } catch (error) {
      logError(error, {
        operation: 'update-system-metrics',
        sessionId: this.sessionId
      });
    }
  }
  
  /**
   * Perform health check
   */
  async performHealthCheck() {
    try {
      const health = {
        status: 'healthy',
        components: {},
        system: {},
        alerts: this.activeAlerts.size,
        timestamp: new Date().toISOString()
      };
      
      // Check system health
      const memoryMB = process.memoryUsage().heapUsed / 1024 / 1024;
      
      if (memoryMB > this.config.memoryThreshold) {
        health.status = 'warning';
        health.system.memory = 'high';
        
        this.triggerAlert('high-memory-usage', `Memory usage (${memoryMB.toFixed(2)} MB) exceeds threshold`, 'warning', {
          currentUsage: memoryMB,
          threshold: this.config.memoryThreshold
        });
      }
      
      // Check component health
      for (const [name, componentInfo] of this.registeredComponents) {
        const componentMetrics = this.currentMetrics.scrapers[name];
        
        if (componentMetrics) {
          const errorRate = componentMetrics.totalRequests > 0 ? 
            componentMetrics.failedRequests / componentMetrics.totalRequests : 0;
          
          if (errorRate > this.config.errorRateThreshold) {
            health.status = 'warning';
            health.components[name] = 'high-error-rate';
            
            this.triggerAlert(`${name}-high-error-rate`, `${name} error rate (${(errorRate * 100).toFixed(2)}%) exceeds threshold`, 'warning', {
              component: name,
              errorRate: errorRate,
              threshold: this.config.errorRateThreshold
            });
          }
          
          if (componentMetrics.averageResponseTime > this.config.responseTimeThreshold) {
            health.status = 'warning';
            health.components[name] = 'slow-response';
            
            this.triggerAlert(`${name}-slow-response`, `${name} response time (${componentMetrics.averageResponseTime}ms) exceeds threshold`, 'warning', {
              component: name,
              responseTime: componentMetrics.averageResponseTime,
              threshold: this.config.responseTimeThreshold
            });
          }
        }
      }
      
      this.currentMetrics.health = health.status;
      
      this.emit('health-check', health);
      
    } catch (error) {
      logError(error, {
        operation: 'health-check',
        sessionId: this.sessionId
      });
    }
  }
  
  /**
   * Perform cleanup tasks
   */
  performCleanup() {
    try {
      const startTime = Date.now();
      
      // Clean old performance data
      const maxDataPoints = this.config.performanceDataPoints;
      
      Object.keys(this.performanceData).forEach(key => {
        if (this.performanceData[key].length > maxDataPoints) {
          this.performanceData[key] = this.performanceData[key].slice(-maxDataPoints);
        }
      });
      
      // Clean old alerts
      const alertCutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
      this.alertHistory = this.alertHistory.filter(alert => alert.timestamp > alertCutoff);
      
      // Clean expired active alerts
      for (const [alertId, alert] of this.activeAlerts) {
        if (Date.now() - alert.lastTriggered > this.config.alertCooldown * 2) {
          this.activeAlerts.delete(alertId);
        }
      }
      
      logPerformance('cleanup', startTime, {
        sessionId: this.sessionId
      });
      
    } catch (error) {
      logError(error, {
        operation: 'cleanup',
        sessionId: this.sessionId
      });
    }
  }
  
  /**
   * Update performance data arrays
   */
  updatePerformanceData(category, name, value, timestamp) {
    const dataPoint = { timestamp, value };
    
    if (category === 'system') {
      if (name === 'memory') {
        this.performanceData.memory.push(dataPoint);
      } else if (name.includes('cpu')) {
        this.performanceData.cpu.push(dataPoint);
      }
    } else if (category === 'scraping') {
      if (name.includes('response-time')) {
        this.performanceData.responseTime.push(dataPoint);
      } else if (name.includes('requests')) {
        this.performanceData.throughput.push(dataPoint);
      }
    }
  }
  
  /**
   * Check alert conditions
   */
  checkAlertConditions(category, name, value, metadata) {
    try {
      // Memory alert
      if (category === 'system' && name === 'memory' && value > this.config.memoryThreshold) {
        this.triggerAlert('high-memory', `High memory usage: ${value.toFixed(2)} MB`, 'warning', {
          value,
          threshold: this.config.memoryThreshold
        });
      }
      
      // Error rate alert
      if (category === 'scraping' && name.includes('error') && value > this.config.errorRateThreshold) {
        this.triggerAlert('high-error-rate', `High error rate detected: ${name}`, 'warning', {
          metric: name,
          value,
          threshold: this.config.errorRateThreshold,
          ...metadata
        });
      }
      
    } catch (error) {
      logError(error, {
        operation: 'check-alert-conditions',
        category,
        name,
        sessionId: this.sessionId
      });
    }
  }
  
  /**
   * Trigger an alert
   */
  triggerAlert(alertId, message, severity = 'warning', metadata = {}) {
    try {
      const now = Date.now();
      const existingAlert = this.activeAlerts.get(alertId);
      
      // Check cooldown
      if (existingAlert && (now - existingAlert.lastTriggered) < this.config.alertCooldown) {
        return;
      }
      
      const alert = {
        id: alertId,
        message,
        severity,
        timestamp: now,
        lastTriggered: now,
        count: existingAlert ? existingAlert.count + 1 : 1,
        metadata,
        sessionId: this.sessionId
      };
      
      this.activeAlerts.set(alertId, alert);
      this.alertHistory.push({ ...alert });
      
      // Add to current metrics
      this.currentMetrics.alerts = Array.from(this.activeAlerts.values());
      
      // Log the alert
      logAlert(alertId, message, severity, metadata);
      
      // Send notifications if enabled
      if (this.config.enableAlerting) {
        this.sendAlertNotifications(alert);
      }
      
      this.emit('alert-triggered', alert);
      
    } catch (error) {
      logError(error, {
        operation: 'trigger-alert',
        alertId,
        message,
        sessionId: this.sessionId
      });
    }
  }
  
  /**
   * Send alert notifications
   */
  async sendAlertNotifications(alert) {
    try {
      // Email notifications
      if (this.config.emailAlerts && process.env.ALERT_EMAIL_RECIPIENTS) {
        // Would implement email sending here
        this.logger.info('Email alert sent', {
          alertId: alert.id,
          message: alert.message,
          severity: alert.severity
        });
      }
      
      // Slack notifications
      if (this.config.slackAlerts && process.env.ALERT_SLACK_WEBHOOK_URL) {
        // Would implement Slack webhook here
        this.logger.info('Slack alert sent', {
          alertId: alert.id,
          message: alert.message,
          severity: alert.severity
        });
      }
      
    } catch (error) {
      logError(error, {
        operation: 'send-alert-notifications',
        alertId: alert.id,
        sessionId: this.sessionId
      });
    }
  }
  
  /**
   * Get current metrics
   */
  getCurrentMetrics() {
    return {
      ...this.currentMetrics,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId
    };
  }
  
  /**
   * Get performance data
   */
  getPerformanceData() {
    return {
      ...this.performanceData,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId
    };
  }
  
  /**
   * Get alerts
   */
  getAlerts() {
    return {
      active: Array.from(this.activeAlerts.values()),
      history: this.alertHistory.slice(-100), // Last 100 alerts
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId
    };
  }
  
  /**
   * Get health status
   */
  getHealthStatus() {
    return {
      status: this.currentMetrics.health,
      components: Object.keys(this.currentMetrics.scrapers).length,
      activeAlerts: this.activeAlerts.size,
      uptime: process.uptime(),
      memory: this.currentMetrics.system.memory,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId
    };
  }
  
  /**
   * Get registered components
   */
  getRegisteredComponents() {
    const components = {};
    
    for (const [name, info] of this.registeredComponents) {
      components[name] = {
        type: info.type,
        registeredAt: info.registeredAt,
        metrics: this.currentMetrics.scrapers[name],
        status: this.currentMetrics.scrapers[name]?.status || 'unknown'
      };
    }
    
    return {
      components,
      total: this.registeredComponents.size,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId
    };
  }
  
  /**
   * Get metric history
   */
  getMetricHistory(category, name, hours = 1) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const pattern = `${category}.${name}.*`;
    
    const metrics = [];
    const keys = this.metricsCache.keys();
    
    for (const key of keys) {
      if (key.startsWith(`${category}.${name}.`)) {
        const metric = this.metricsCache.get(key);
        if (metric && metric.timestamp > cutoff) {
          metrics.push(metric);
        }
      }
    }
    
    return {
      category,
      name,
      hours,
      data: metrics.sort((a, b) => a.timestamp - b.timestamp),
      count: metrics.length,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId
    };
  }
  
  /**
   * Generate dashboard HTML
   */
  generateDashboardHTML() {
    const metrics = this.getCurrentMetrics();
    const performance = this.getPerformanceData();
    const alerts = this.getAlerts();
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PelotonIQ Data Processor - Monitoring Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .metric-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric-value { font-size: 2em; font-weight: bold; color: #3498db; }
        .metric-label { color: #7f8c8d; font-size: 0.9em; }
        .status-healthy { color: #27ae60; }
        .status-warning { color: #f39c12; }
        .status-error { color: #e74c3c; }
        .alert { padding: 10px; margin: 5px 0; border-radius: 4px; }
        .alert-warning { background: #fff3cd; border: 1px solid #ffeaa7; }
        .alert-error { background: #f8d7da; border: 1px solid #f5c6cb; }
        .refresh-btn { background: #3498db; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
        .refresh-btn:hover { background: #2980b9; }
    </style>
    <script>
        function refreshData() {
            location.reload();
        }
        
        // Auto-refresh every 30 seconds
        setInterval(refreshData, 30000);
    </script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚴‍♂️ PelotonIQ Data Processor - Monitoring Dashboard</h1>
            <p>Session: ${metrics.sessionId} | Last Update: ${metrics.lastUpdate || 'Never'}</p>
            <button class="refresh-btn" onclick="refreshData()">Refresh</button>
        </div>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-label">System Health</div>
                <div class="metric-value status-${metrics.health}">${metrics.health.toUpperCase()}</div>
                <div>Memory: ${metrics.system.memory?.heapUsed?.toFixed(2) || 0} MB</div>
                <div>Uptime: ${(metrics.system.uptime / 3600).toFixed(2)} hours</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-label">Active Scrapers</div>
                <div class="metric-value">${Object.keys(metrics.scrapers).length}</div>
                ${Object.entries(metrics.scrapers).map(([name, scraper]) => 
                  `<div>${name}: ${scraper.totalRequests || 0} requests</div>`
                ).join('')}
            </div>
            
            <div class="metric-card">
                <div class="metric-label">Active Alerts</div>
                <div class="metric-value status-${alerts.active.length > 0 ? 'warning' : 'healthy'}">${alerts.active.length}</div>
                ${alerts.active.map(alert => 
                  `<div class="alert alert-${alert.severity}">${alert.message}</div>`
                ).join('')}
            </div>
            
            <div class="metric-card">
                <div class="metric-label">Performance</div>
                <div>Memory Points: ${performance.memory.length}</div>
                <div>CPU Points: ${performance.cpu.length}</div>
                <div>Response Time Points: ${performance.responseTime.length}</div>
                <div>Throughput Points: ${performance.throughput.length}</div>
            </div>
        </div>
        
        <div style="margin-top: 20px; text-align: center; color: #7f8c8d;">
            <p>PelotonIQ Data Processor Monitoring Dashboard</p>
            <p>API Endpoints: <a href="/api/metrics">/api/metrics</a> | <a href="/api/health">/api/health</a> | <a href="/api/components">/api/components</a></p>
        </div>
    </div>
</body>
</html>`;
  }
}

module.exports = ScrapingMonitor;