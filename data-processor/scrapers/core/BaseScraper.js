const axios = require('axios');
const cheerio = require('cheerio');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const UserAgent = require('user-agents');
const robotsParser = require('robots-parser');
const retry = require('retry');
const EventEmitter = require('events');
const { nanoid } = require('nanoid');
const { 
  logger, 
  createComponentLogger, 
  logRequest, 
  logScrapingActivity, 
  logError,
  logRateLimit,
  logPerformance 
} = require('../../config/logger');

/**
 * BaseScraper - Abstract base class for all web scrapers
 * Provides common functionality for rate limiting, error handling, and HTTP requests
 */
class BaseScraper extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.name = options.name || 'BaseScraper';
    this.baseUrl = options.baseUrl || '';
    this.logger = createComponentLogger(this.name);
    this.sessionId = nanoid();
    
    // Configuration
    this.config = {
      // Rate limiting
      requestsPerMinute: options.requestsPerMinute || parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE) || 30,
      requestsPerHour: options.requestsPerHour || parseInt(process.env.RATE_LIMIT_REQUESTS_PER_HOUR) || 1000,
      
      // Request settings
      timeout: options.timeout || parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000,
      retryAttempts: options.retryAttempts || parseInt(process.env.RETRY_ATTEMPTS) || 3,
      retryDelay: options.retryDelay || parseInt(process.env.RETRY_DELAY_MS) || 1000,
      delayBetweenRequests: options.delayBetweenRequests || parseInt(process.env.PCS_DELAY_BETWEEN_REQUESTS_MS) || 2000,
      
      // Behavior
      respectRobotsTxt: options.respectRobotsTxt ?? (process.env.PCS_RESPECT_ROBOTS_TXT === 'true'),
      validateResponse: options.validateResponse ?? true,
      enableCaching: options.enableCaching ?? true,
      
      // User agent rotation
      rotateUserAgents: options.rotateUserAgents ?? true,
      customUserAgent: options.customUserAgent || process.env.PCS_USER_AGENT
    };
    
    // Initialize rate limiters
    this.rateLimiters = {
      perMinute: new RateLimiterMemory({
        keyGenerator: () => 'global',
        points: this.config.requestsPerMinute,
        duration: 60, // 1 minute
        blockDuration: 60 // Block for 1 minute when limit exceeded
      }),
      perHour: new RateLimiterMemory({
        keyGenerator: () => 'global',
        points: this.config.requestsPerHour,
        duration: 3600, // 1 hour
        blockDuration: 3600 // Block for 1 hour when limit exceeded
      })
    };
    
    // Initialize HTTP client
    this.httpClient = this.createHttpClient();
    
    // User agent management
    this.userAgents = new UserAgent();
    this.currentUserAgent = this.config.customUserAgent || this.userAgents.toString();
    
    // Robots.txt cache
    this.robotsCache = new Map();
    
    // Request tracking
    this.requestStats = {
      total: 0,
      successful: 0,
      failed: 0,
      startTime: Date.now(),
      lastRequestTime: null,
      averageResponseTime: 0
    };
    
    // Error tracking
    this.errorStats = {
      networkErrors: 0,
      timeoutErrors: 0,
      httpErrors: 0,
      parseErrors: 0,
      rateLimitErrors: 0,
      robotsBlocked: 0
    };
    
    this.logger.info('BaseScraper initialized', {
      sessionId: this.sessionId,
      config: this.config,
      name: this.name
    });
  }
  
  /**
   * Create and configure HTTP client with interceptors
   */
  createHttpClient() {
    const client = axios.create({
      timeout: this.config.timeout,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      }
    });
    
    // Request interceptor
    client.interceptors.request.use(
      (config) => {
        config.metadata = { startTime: Date.now() };
        
        // Set user agent
        config.headers['User-Agent'] = this.getCurrentUserAgent();
        
        // Add request ID for tracking
        config.headers['X-Request-ID'] = nanoid();
        
        this.logger.debug('Making HTTP request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          headers: config.headers,
          requestId: config.headers['X-Request-ID']
        });
        
        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error', { error: error.message });
        return Promise.reject(error);
      }
    );
    
    // Response interceptor
    client.interceptors.response.use(
      (response) => {
        const responseTime = Date.now() - response.config.metadata.startTime;
        
        logRequest(
          response.config.method?.toUpperCase(),
          response.config.url,
          response.status,
          responseTime,
          {
            sessionId: this.sessionId,
            scraper: this.name,
            requestId: response.config.headers['X-Request-ID'],
            dataSize: response.headers['content-length'] || 0
          }
        );
        
        this.updateRequestStats(true, responseTime);
        
        return response;
      },
      (error) => {
        const responseTime = error.config?.metadata ? 
          Date.now() - error.config.metadata.startTime : 0;
        
        this.updateRequestStats(false, responseTime);
        this.updateErrorStats(error);
        
        logRequest(
          error.config?.method?.toUpperCase() || 'UNKNOWN',
          error.config?.url || 'UNKNOWN',
          error.response?.status || 0,
          responseTime,
          {
            sessionId: this.sessionId,
            scraper: this.name,
            requestId: error.config?.headers?.['X-Request-ID'],
            error: error.message,
            errorType: this.categorizeError(error)
          }
        );
        
        return Promise.reject(error);
      }
    );
    
    return client;
  }
  
  /**
   * Get current user agent, rotating if enabled
   */
  getCurrentUserAgent() {
    if (this.config.rotateUserAgents && !this.config.customUserAgent) {
      // Rotate user agent every 10 requests
      if (this.requestStats.total % 10 === 0) {
        this.currentUserAgent = this.userAgents.toString();
      }
    }
    return this.currentUserAgent;
  }
  
  /**
   * Check robots.txt compliance for a URL
   */
  async checkRobotsCompliance(url) {
    if (!this.config.respectRobotsTxt) {
      return true;
    }
    
    try {
      const urlObj = new URL(url);
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
      
      // Check cache first
      if (this.robotsCache.has(robotsUrl)) {
        const robots = this.robotsCache.get(robotsUrl);
        const allowed = robots.isAllowed(url, this.currentUserAgent);
        
        if (!allowed) {
          this.errorStats.robotsBlocked++;
          this.logger.warn('Request blocked by robots.txt', {
            url,
            robotsUrl,
            userAgent: this.currentUserAgent
          });
        }
        
        return allowed;
      }
      
      // Fetch robots.txt
      const response = await this.httpClient.get(robotsUrl, {
        timeout: 5000, // Shorter timeout for robots.txt
        validateStatus: (status) => status < 500 // Accept 4xx as valid response
      });
      
      const robots = robotsParser(robotsUrl, response.data);
      this.robotsCache.set(robotsUrl, robots);
      
      const allowed = robots.isAllowed(url, this.currentUserAgent);
      
      if (!allowed) {
        this.errorStats.robotsBlocked++;
        this.logger.warn('Request blocked by robots.txt', {
          url,
          robotsUrl,
          userAgent: this.currentUserAgent
        });
      }
      
      return allowed;
      
    } catch (error) {
      // If robots.txt can't be fetched, allow the request
      this.logger.debug('Could not fetch robots.txt, allowing request', {
        url,
        error: error.message
      });
      return true;
    }
  }
  
  /**
   * Apply rate limiting before making requests
   */
  async applyRateLimit() {
    try {
      // Check both rate limiters
      await Promise.all([
        this.rateLimiters.perMinute.consume('global'),
        this.rateLimiters.perHour.consume('global')
      ]);
      
      // Log rate limit usage occasionally
      if (this.requestStats.total % 50 === 0) {
        const minuteStats = await this.rateLimiters.perMinute.get('global');
        const hourStats = await this.rateLimiters.perHour.get('global');
        
        logRateLimit(
          'per-minute',
          this.config.requestsPerMinute,
          minuteStats?.remainingHits || 0,
          { sessionId: this.sessionId, scraper: this.name }
        );
        
        logRateLimit(
          'per-hour',
          this.config.requestsPerHour,
          hourStats?.remainingHits || 0,
          { sessionId: this.sessionId, scraper: this.name }
        );
      }
      
    } catch (rateLimitError) {
      this.errorStats.rateLimitErrors++;
      
      const waitTime = rateLimitError.msBeforeNext || 60000;
      this.logger.warn('Rate limit exceeded, waiting', {
        waitTime: `${waitTime}ms`,
        sessionId: this.sessionId,
        scraper: this.name
      });
      
      await this.sleep(waitTime);
      
      // Retry rate limiting
      return this.applyRateLimit();
    }
  }
  
  /**
   * Make HTTP request with retry logic and error handling
   */
  async makeRequest(url, options = {}) {
    const startTime = Date.now();
    
    try {
      // Check robots.txt compliance
      const robotsAllowed = await this.checkRobotsCompliance(url);
      if (!robotsAllowed) {
        throw new Error('Request blocked by robots.txt');
      }
      
      // Apply rate limiting
      await this.applyRateLimit();
      
      // Add delay between requests
      if (this.requestStats.lastRequestTime) {
        const timeSinceLastRequest = Date.now() - this.requestStats.lastRequestTime;
        if (timeSinceLastRequest < this.config.delayBetweenRequests) {
          const delay = this.config.delayBetweenRequests - timeSinceLastRequest;
          await this.sleep(delay);
        }
      }
      
      // Configure retry operation
      const operation = retry.operation({
        retries: this.config.retryAttempts,
        factor: 2,
        minTimeout: this.config.retryDelay,
        maxTimeout: this.config.retryDelay * 8,
        randomize: true
      });
      
      return new Promise((resolve, reject) => {
        operation.attempt(async (currentAttempt) => {
          try {
            this.logger.debug('Attempting request', {
              url,
              attempt: currentAttempt,
              maxAttempts: this.config.retryAttempts + 1,
              sessionId: this.sessionId
            });
            
            const response = await this.httpClient.get(url, {
              ...options,
              timeout: this.config.timeout
            });
            
            // Validate response if enabled
            if (this.config.validateResponse) {
              this.validateResponse(response);
            }
            
            this.requestStats.lastRequestTime = Date.now();
            
            logScrapingActivity(
              this.name,
              'request-success',
              url,
              'success',
              {
                sessionId: this.sessionId,
                attempt: currentAttempt,
                responseSize: response.headers['content-length'] || 0,
                statusCode: response.status
              }
            );
            
            resolve(response);
            
          } catch (error) {
            this.logger.debug('Request attempt failed', {
              url,
              attempt: currentAttempt,
              error: error.message,
              errorType: this.categorizeError(error)
            });
            
            // Check if we should retry
            if (operation.retry(error)) {
              this.logger.debug('Retrying request', {
                url,
                nextAttempt: currentAttempt + 1,
                delay: operation._timeouts[currentAttempt] || 'unknown'
              });
              return;
            }
            
            logScrapingActivity(
              this.name,
              'request-failed',
              url,
              'failed',
              {
                sessionId: this.sessionId,
                finalAttempt: currentAttempt,
                error: error.message,
                errorType: this.categorizeError(error)
              }
            );
            
            reject(operation.mainError());
          }
        });
      });
      
    } catch (error) {
      logError(error, {
        url,
        scraper: this.name,
        sessionId: this.sessionId,
        duration: logPerformance('request-failed', startTime)
      });
      
      throw error;
    }
  }
  
  /**
   * Parse HTML response using Cheerio
   */
  parseHtml(html, url = 'unknown') {
    try {
      const startTime = Date.now();
      const $ = cheerio.load(html);
      
      logPerformance('html-parsing', startTime, {
        url,
        scraper: this.name,
        sessionId: this.sessionId,
        htmlSize: html.length
      });
      
      logScrapingActivity(
        this.name,
        'html-parsed',
        url,
        'success',
        {
          sessionId: this.sessionId,
          htmlSize: html.length,
          elementCount: $('*').length
        }
      );
      
      return $;
      
    } catch (error) {
      this.errorStats.parseErrors++;
      
      logError(error, {
        url,
        scraper: this.name,
        sessionId: this.sessionId,
        operation: 'html-parsing',
        htmlSize: html?.length || 0
      });
      
      throw new Error(`Failed to parse HTML: ${error.message}`);
    }
  }
  
  /**
   * Scrape a single page and return parsed HTML
   */
  async scrapePage(url, options = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Scraping page', {
        url,
        scraper: this.name,
        sessionId: this.sessionId
      });
      
      const response = await this.makeRequest(url, options);
      const $ = this.parseHtml(response.data, url);
      
      logPerformance('page-scraping', startTime, {
        url,
        scraper: this.name,
        sessionId: this.sessionId,
        statusCode: response.status,
        responseSize: response.headers['content-length'] || 0
      });
      
      this.emit('page-scraped', {
        url,
        statusCode: response.status,
        size: response.headers['content-length'] || 0,
        duration: Date.now() - startTime
      });
      
      return $;
      
    } catch (error) {
      this.emit('scraping-error', {
        url,
        error: error.message,
        errorType: this.categorizeError(error),
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Validate HTTP response
   */
  validateResponse(response) {
    // Check status code
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Check content type
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/xml')) {
      this.logger.warn('Unexpected content type', {
        contentType,
        url: response.config.url,
        expectedTypes: ['text/html', 'text/xml']
      });
    }
    
    // Check response size
    const contentLength = parseInt(response.headers['content-length'] || '0');
    if (contentLength > 0 && contentLength < 100) {
      this.logger.warn('Response size unusually small', {
        contentLength,
        url: response.config.url
      });
    }
    
    // Check for common error indicators in HTML
    if (typeof response.data === 'string') {
      const lowerData = response.data.toLowerCase();
      
      const errorIndicators = [
        'error 404',
        'page not found',
        'access denied',
        'forbidden',
        'rate limit',
        'captcha',
        'blocked',
        'temporarily unavailable'
      ];
      
      for (const indicator of errorIndicators) {
        if (lowerData.includes(indicator)) {
          throw new Error(`Response contains error indicator: ${indicator}`);
        }
      }
    }
  }
  
  /**
   * Categorize error types for statistics
   */
  categorizeError(error) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return 'timeout';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return 'network';
    } else if (error.response && error.response.status) {
      if (error.response.status === 429) {
        return 'rate-limit';
      } else if (error.response.status >= 400 && error.response.status < 500) {
        return 'client-error';
      } else if (error.response.status >= 500) {
        return 'server-error';
      }
    } else if (error.message.includes('robots.txt')) {
      return 'robots-blocked';
    } else if (error.message.includes('parse') || error.message.includes('cheerio')) {
      return 'parse-error';
    }
    
    return 'unknown';
  }
  
  /**
   * Update request statistics
   */
  updateRequestStats(success, responseTime) {
    this.requestStats.total++;
    
    if (success) {
      this.requestStats.successful++;
    } else {
      this.requestStats.failed++;
    }
    
    // Update average response time
    const totalTime = this.requestStats.averageResponseTime * (this.requestStats.total - 1) + responseTime;
    this.requestStats.averageResponseTime = totalTime / this.requestStats.total;
  }
  
  /**
   * Update error statistics
   */
  updateErrorStats(error) {
    const errorType = this.categorizeError(error);
    
    switch (errorType) {
      case 'network':
        this.errorStats.networkErrors++;
        break;
      case 'timeout':
        this.errorStats.timeoutErrors++;
        break;
      case 'rate-limit':
        this.errorStats.rateLimitErrors++;
        break;
      case 'robots-blocked':
        this.errorStats.robotsBlocked++;
        break;
      case 'parse-error':
        this.errorStats.parseErrors++;
        break;
      default:
        this.errorStats.httpErrors++;
    }
  }
  
  /**
   * Get comprehensive scraper statistics
   */
  getStats() {
    const uptime = Date.now() - this.requestStats.startTime;
    const successRate = this.requestStats.total > 0 ? 
      (this.requestStats.successful / this.requestStats.total * 100).toFixed(2) : 0;
    
    return {
      sessionId: this.sessionId,
      scraper: this.name,
      uptime: `${Math.round(uptime / 1000)}s`,
      requests: this.requestStats,
      errors: this.errorStats,
      successRate: `${successRate}%`,
      averageResponseTime: `${Math.round(this.requestStats.averageResponseTime)}ms`,
      requestsPerMinute: this.requestStats.total > 0 ? 
        Math.round(this.requestStats.total / (uptime / 60000)) : 0
    };
  }
  
  /**
   * Sleep utility function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    this.logger.info('Destroying scraper', {
      sessionId: this.sessionId,
      stats: this.getStats()
    });
    
    this.removeAllListeners();
    this.robotsCache.clear();
  }
  
  /**
   * Abstract method to be implemented by subclasses
   */
  async scrape() {
    throw new Error('scrape() method must be implemented by subclass');
  }
}

module.exports = BaseScraper;