const winston = require('winston');
const path = require('path');

// Custom log levels with priorities
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
    scraping: 5
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
    scraping: 'cyan'
  }
};

// Add colors to winston
winston.addColors(customLevels.colors);

// Custom format for log messages
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.printf(
    ({ timestamp, level, message, service, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      const serviceStr = service ? `[${service}] ` : '';
      return `${timestamp} ${level}: ${serviceStr}${message} ${metaStr}`;
    }
  )
);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
require('fs').mkdirSync(logsDir, { recursive: true });

// Create logger instance
const logger = winston.createLogger({
  levels: customLevels.levels,
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'pelotoniq-data-processor',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10,
      tailable: true
    }),
    
    // Scraping specific log file
    new winston.transports.File({
      filename: path.join(logsDir, 'scraping.log'),
      level: 'scraping',
      maxsize: 10485760, // 10MB
      maxFiles: 7,
      tailable: true
    }),
    
    // HTTP requests log
    new winston.transports.File({
      filename: path.join(logsDir, 'http.log'),
      level: 'http',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    })
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log')
    })
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log')
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Create specialized loggers for different components
const createComponentLogger = (component) => {
  return logger.child({ component });
};

// Performance logging utility
const logPerformance = (operation, startTime, metadata = {}) => {
  const duration = Date.now() - startTime;
  logger.info('Performance metric', {
    operation,
    duration: `${duration}ms`,
    ...metadata
  });
  return duration;
};

// Request logging utility
const logRequest = (method, url, statusCode, responseTime, metadata = {}) => {
  logger.http('HTTP Request', {
    method,
    url,
    statusCode,
    responseTime: `${responseTime}ms`,
    ...metadata
  });
};

// Scraping activity logging
const logScrapingActivity = (scraper, action, target, result, metadata = {}) => {
  logger.log('scraping', 'Scraping activity', {
    scraper,
    action,
    target,
    result,
    timestamp: new Date().toISOString(),
    ...metadata
  });
};

// Data quality logging
const logDataQuality = (source, metrics, metadata = {}) => {
  logger.info('Data quality metrics', {
    source,
    metrics,
    timestamp: new Date().toISOString(),
    ...metadata
  });
};

// Error logging with context
const logError = (error, context = {}) => {
  logger.error('Application error', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    context,
    timestamp: new Date().toISOString()
  });
};

// Alert logging
const logAlert = (alertType, message, severity = 'warning', metadata = {}) => {
  const logLevel = severity === 'critical' ? 'error' : 'warn';
  logger[logLevel]('Alert triggered', {
    alertType,
    message,
    severity,
    timestamp: new Date().toISOString(),
    ...metadata
  });
};

// Rate limiting logging
const logRateLimit = (identifier, limit, current, metadata = {}) => {
  logger.warn('Rate limit approached', {
    identifier,
    limit,
    current,
    utilization: `${(current / limit * 100).toFixed(2)}%`,
    ...metadata
  });
};

// Data validation logging
const logValidation = (entity, validationResult, metadata = {}) => {
  const logLevel = validationResult.isValid ? 'info' : 'warn';
  logger[logLevel]('Data validation', {
    entity,
    isValid: validationResult.isValid,
    errors: validationResult.errors || [],
    warnings: validationResult.warnings || [],
    ...metadata
  });
};

module.exports = {
  logger,
  createComponentLogger,
  logPerformance,
  logRequest,
  logScrapingActivity,
  logDataQuality,
  logError,
  logAlert,
  logRateLimit,
  logValidation
};