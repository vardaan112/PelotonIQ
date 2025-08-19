// Business Metrics Exporter for PelotonIQ
// Collects and exposes business KPIs as Prometheus metrics

const express = require('express');
const client = require('prom-client');
const { Pool } = require('pg');
const redis = require('redis');
const axios = require('axios');
const winston = require('winston');

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'business-metrics.log' })
  ]
});

// Initialize Prometheus client
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Business Metrics Definitions
const userRegistrationsTotal = new client.Counter({
  name: 'pelotoniq_user_registrations_total',
  help: 'Total number of user registrations',
  labelNames: ['source', 'plan_type']
});

const activeUsersGauge = new client.Gauge({
  name: 'pelotoniq_active_users',
  help: 'Number of active users in the last 24 hours',
  labelNames: ['time_period']
});

const teamsCreatedTotal = new client.Counter({
  name: 'pelotoniq_teams_created_total',
  help: 'Total number of teams created',
  labelNames: ['team_type', 'subscription_tier']
});

const raceAnalysesTotal = new client.Counter({
  name: 'pelotoniq_race_analyses_total',
  help: 'Total number of race analyses performed',
  labelNames: ['race_type', 'analysis_type']
});

const modelPredictionsTotal = new client.Counter({
  name: 'pelotoniq_model_predictions_total',
  help: 'Total number of model predictions made',
  labelNames: ['model_name', 'prediction_type']
});

const modelAccuracyGauge = new client.Gauge({
  name: 'pelotoniq_model_accuracy',
  help: 'Current model accuracy percentage',
  labelNames: ['model_name', 'metric_type']
});

const revenueGauge = new client.Gauge({
  name: 'pelotoniq_revenue_usd',
  help: 'Revenue in USD',
  labelNames: ['period', 'revenue_type']
});

const subscriptionMetrics = new client.Gauge({
  name: 'pelotoniq_subscriptions',
  help: 'Subscription metrics',
  labelNames: ['tier', 'status', 'metric_type']
});

const dataQualityScore = new client.Gauge({
  name: 'pelotoniq_data_quality_score',
  help: 'Data quality score (0-100)',
  labelNames: ['data_source', 'quality_dimension']
});

const apiUsageMetrics = new client.Gauge({
  name: 'pelotoniq_api_usage',
  help: 'API usage metrics',
  labelNames: ['endpoint', 'method', 'metric_type']
});

const userEngagementScore = new client.Gauge({
  name: 'pelotoniq_user_engagement_score',
  help: 'User engagement score (0-100)',
  labelNames: ['user_segment', 'engagement_type']
});

const systemPerformanceScore = new client.Gauge({
  name: 'pelotoniq_system_performance_score',
  help: 'System performance score (0-100)',
  labelNames: ['component', 'performance_metric']
});

// Register all metrics
register.registerMetric(userRegistrationsTotal);
register.registerMetric(activeUsersGauge);
register.registerMetric(teamsCreatedTotal);
register.registerMetric(raceAnalysesTotal);
register.registerMetric(modelPredictionsTotal);
register.registerMetric(modelAccuracyGauge);
register.registerMetric(revenueGauge);
register.registerMetric(subscriptionMetrics);
register.registerMetric(dataQualityScore);
register.registerMetric(apiUsageMetrics);
register.registerMetric(userEngagementScore);
register.registerMetric(systemPerformanceScore);

// Database connection
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://pelotoniq_user:password@localhost:5432/pelotoniq',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis connection
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  logger.error('Redis client error:', err);
});

redisClient.connect();

class BusinessMetricsCollector {
  constructor() {
    this.collectInterval = 60000; // 1 minute
    this.isCollecting = false;
  }

  async collectUserMetrics() {
    try {
      // User registrations by day
      const registrationsQuery = `
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          registration_source,
          subscription_tier,
          COUNT(*) as count
        FROM users 
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY date, registration_source, subscription_tier
      `;
      
      const registrations = await dbPool.query(registrationsQuery);
      registrations.rows.forEach(row => {
        userRegistrationsTotal.labels(row.registration_source, row.subscription_tier).inc(row.count);
      });

      // Active users
      const activeUsersQuery = `
        SELECT 
          COUNT(DISTINCT user_id) as daily_active,
          COUNT(DISTINCT CASE WHEN last_activity >= NOW() - INTERVAL '7 days' THEN user_id END) as weekly_active,
          COUNT(DISTINCT CASE WHEN last_activity >= NOW() - INTERVAL '30 days' THEN user_id END) as monthly_active
        FROM user_sessions 
        WHERE last_activity >= NOW() - INTERVAL '30 days'
      `;
      
      const activeUsers = await dbPool.query(activeUsersQuery);
      if (activeUsers.rows.length > 0) {
        const row = activeUsers.rows[0];
        activeUsersGauge.labels('daily').set(parseInt(row.daily_active));
        activeUsersGauge.labels('weekly').set(parseInt(row.weekly_active));
        activeUsersGauge.labels('monthly').set(parseInt(row.monthly_active));
      }

      logger.info('User metrics collected successfully');
    } catch (error) {
      logger.error('Error collecting user metrics:', error);
    }
  }

  async collectTeamMetrics() {
    try {
      const teamsQuery = `
        SELECT 
          team_type,
          subscription_tier,
          COUNT(*) as count
        FROM teams 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY team_type, subscription_tier
      `;
      
      const teams = await dbPool.query(teamsQuery);
      teams.rows.forEach(row => {
        teamsCreatedTotal.labels(row.team_type, row.subscription_tier).inc(row.count);
      });

      logger.info('Team metrics collected successfully');
    } catch (error) {
      logger.error('Error collecting team metrics:', error);
    }
  }

  async collectRaceAnalysisMetrics() {
    try {
      const analysesQuery = `
        SELECT 
          race_type,
          analysis_type,
          COUNT(*) as count
        FROM race_analyses 
        WHERE created_at >= NOW() - INTERVAL '1 hour'
        GROUP BY race_type, analysis_type
      `;
      
      const analyses = await dbPool.query(analysesQuery);
      analyses.rows.forEach(row => {
        raceAnalysesTotal.labels(row.race_type, row.analysis_type).inc(row.count);
      });

      logger.info('Race analysis metrics collected successfully');
    } catch (error) {
      logger.error('Error collecting race analysis metrics:', error);
    }
  }

  async collectMLMetrics() {
    try {
      // Model predictions
      const predictionsQuery = `
        SELECT 
          model_name,
          prediction_type,
          COUNT(*) as count
        FROM model_predictions 
        WHERE created_at >= NOW() - INTERVAL '1 hour'
        GROUP BY model_name, prediction_type
      `;
      
      const predictions = await dbPool.query(predictionsQuery);
      predictions.rows.forEach(row => {
        modelPredictionsTotal.labels(row.model_name, row.prediction_type).inc(row.count);
      });

      // Model accuracy
      const accuracyQuery = `
        SELECT 
          model_name,
          metric_type,
          AVG(accuracy_score) as avg_accuracy
        FROM model_performance_metrics 
        WHERE created_at >= NOW() - INTERVAL '1 hour'
        GROUP BY model_name, metric_type
      `;
      
      const accuracy = await dbPool.query(accuracyQuery);
      accuracy.rows.forEach(row => {
        modelAccuracyGauge.labels(row.model_name, row.metric_type).set(parseFloat(row.avg_accuracy) * 100);
      });

      logger.info('ML metrics collected successfully');
    } catch (error) {
      logger.error('Error collecting ML metrics:', error);
    }
  }

  async collectRevenueMetrics() {
    try {
      const revenueQuery = `
        SELECT 
          SUM(CASE WHEN created_at >= CURRENT_DATE THEN amount ELSE 0 END) as daily_revenue,
          SUM(CASE WHEN created_at >= DATE_TRUNC('week', CURRENT_DATE) THEN amount ELSE 0 END) as weekly_revenue,
          SUM(CASE WHEN created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN amount ELSE 0 END) as monthly_revenue,
          SUM(CASE WHEN payment_type = 'subscription' AND created_at >= CURRENT_DATE THEN amount ELSE 0 END) as daily_subscription_revenue,
          SUM(CASE WHEN payment_type = 'one_time' AND created_at >= CURRENT_DATE THEN amount ELSE 0 END) as daily_onetime_revenue
        FROM payments 
        WHERE status = 'completed' AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
      `;
      
      const revenue = await dbPool.query(revenueQuery);
      if (revenue.rows.length > 0) {
        const row = revenue.rows[0];
        revenueGauge.labels('daily', 'total').set(parseFloat(row.daily_revenue) || 0);
        revenueGauge.labels('weekly', 'total').set(parseFloat(row.weekly_revenue) || 0);
        revenueGauge.labels('monthly', 'total').set(parseFloat(row.monthly_revenue) || 0);
        revenueGauge.labels('daily', 'subscription').set(parseFloat(row.daily_subscription_revenue) || 0);
        revenueGauge.labels('daily', 'one_time').set(parseFloat(row.daily_onetime_revenue) || 0);
      }

      logger.info('Revenue metrics collected successfully');
    } catch (error) {
      logger.error('Error collecting revenue metrics:', error);
    }
  }

  async collectSubscriptionMetrics() {
    try {
      const subscriptionsQuery = `
        SELECT 
          tier,
          status,
          COUNT(*) as count,
          SUM(monthly_value) as total_value,
          AVG(monthly_value) as avg_value
        FROM subscriptions 
        GROUP BY tier, status
      `;
      
      const subscriptions = await dbPool.query(subscriptionsQuery);
      subscriptions.rows.forEach(row => {
        subscriptionMetrics.labels(row.tier, row.status, 'count').set(parseInt(row.count));
        subscriptionMetrics.labels(row.tier, row.status, 'total_value').set(parseFloat(row.total_value) || 0);
        subscriptionMetrics.labels(row.tier, row.status, 'avg_value').set(parseFloat(row.avg_value) || 0);
      });

      logger.info('Subscription metrics collected successfully');
    } catch (error) {
      logger.error('Error collecting subscription metrics:', error);
    }
  }

  async collectDataQualityMetrics() {
    try {
      const qualityQuery = `
        SELECT 
          data_source,
          quality_dimension,
          AVG(score) as avg_score
        FROM data_quality_scores 
        WHERE created_at >= NOW() - INTERVAL '1 hour'
        GROUP BY data_source, quality_dimension
      `;
      
      const quality = await dbPool.query(qualityQuery);
      quality.rows.forEach(row => {
        dataQualityScore.labels(row.data_source, row.quality_dimension).set(parseFloat(row.avg_score));
      });

      logger.info('Data quality metrics collected successfully');
    } catch (error) {
      logger.error('Error collecting data quality metrics:', error);
    }
  }

  async collectEngagementMetrics() {
    try {
      const engagementQuery = `
        SELECT 
          user_segment,
          AVG(session_duration) as avg_session_duration,
          AVG(pages_per_session) as avg_pages_per_session,
          COUNT(DISTINCT user_id) as active_users
        FROM user_engagement_metrics 
        WHERE date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY user_segment
      `;
      
      const engagement = await dbPool.query(engagementQuery);
      engagement.rows.forEach(row => {
        // Convert to engagement score (0-100)
        const sessionScore = Math.min((parseFloat(row.avg_session_duration) / 1800) * 50, 50); // Max 30 min = 50 points
        const pageScore = Math.min((parseFloat(row.avg_pages_per_session) / 10) * 50, 50); // Max 10 pages = 50 points
        const totalScore = sessionScore + pageScore;
        
        userEngagementScore.labels(row.user_segment, 'overall').set(totalScore);
        userEngagementScore.labels(row.user_segment, 'session_duration').set(sessionScore);
        userEngagementScore.labels(row.user_segment, 'page_views').set(pageScore);
      });

      logger.info('Engagement metrics collected successfully');
    } catch (error) {
      logger.error('Error collecting engagement metrics:', error);
    }
  }

  async collectSystemPerformanceMetrics() {
    try {
      // Get metrics from Prometheus
      const prometheusUrl = process.env.PROMETHEUS_URL || 'http://prometheus:9090';
      
      // API response time score
      const apiLatencyResponse = await axios.get(
        `${prometheusUrl}/api/v1/query?query=histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="pelotoniq-backend"}[5m]))`
      );
      
      if (apiLatencyResponse.data.data.result.length > 0) {
        const latency = parseFloat(apiLatencyResponse.data.data.result[0].value[1]);
        const latencyScore = Math.max(0, 100 - (latency * 50)); // 2s = 0 points, 0s = 100 points
        systemPerformanceScore.labels('api', 'response_time').set(latencyScore);
      }

      // Error rate score
      const errorRateResponse = await axios.get(
        `${prometheusUrl}/api/v1/query?query=rate(http_requests_total{job="pelotoniq-backend",status=~"5.."}[5m]) / rate(http_requests_total{job="pelotoniq-backend"}[5m])`
      );
      
      if (errorRateResponse.data.data.result.length > 0) {
        const errorRate = parseFloat(errorRateResponse.data.data.result[0].value[1]);
        const errorScore = Math.max(0, 100 - (errorRate * 1000)); // 10% error = 0 points, 0% = 100 points
        systemPerformanceScore.labels('api', 'error_rate').set(errorScore);
      }

      logger.info('System performance metrics collected successfully');
    } catch (error) {
      logger.error('Error collecting system performance metrics:', error);
    }
  }

  async collectAllMetrics() {
    if (this.isCollecting) {
      logger.warn('Metrics collection already in progress, skipping...');
      return;
    }

    this.isCollecting = true;
    logger.info('Starting business metrics collection...');

    try {
      await Promise.all([
        this.collectUserMetrics(),
        this.collectTeamMetrics(),
        this.collectRaceAnalysisMetrics(),
        this.collectMLMetrics(),
        this.collectRevenueMetrics(),
        this.collectSubscriptionMetrics(),
        this.collectDataQualityMetrics(),
        this.collectEngagementMetrics(),
        this.collectSystemPerformanceMetrics()
      ]);

      logger.info('Business metrics collection completed successfully');
    } catch (error) {
      logger.error('Error during metrics collection:', error);
    } finally {
      this.isCollecting = false;
    }
  }

  start() {
    logger.info(`Starting business metrics collector with interval: ${this.collectInterval}ms`);
    
    // Initial collection
    this.collectAllMetrics();
    
    // Set up periodic collection
    setInterval(() => {
      this.collectAllMetrics();
    }, this.collectInterval);
  }
}

// Express app setup
const app = express();
const port = process.env.PORT || 8080;

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error('Error serving metrics:', error);
    res.status(500).end();
  }
});

// Business metrics summary endpoint
app.get('/business-summary', async (req, res) => {
  try {
    const summary = {
      timestamp: new Date().toISOString(),
      metrics: {
        users: {
          total_active_daily: activeUsersGauge.get().values.find(v => v.labels.time_period === 'daily')?.value || 0,
          total_active_weekly: activeUsersGauge.get().values.find(v => v.labels.time_period === 'weekly')?.value || 0,
          total_active_monthly: activeUsersGauge.get().values.find(v => v.labels.time_period === 'monthly')?.value || 0
        },
        revenue: {
          daily: revenueGauge.get().values.find(v => v.labels.period === 'daily' && v.labels.revenue_type === 'total')?.value || 0,
          weekly: revenueGauge.get().values.find(v => v.labels.period === 'weekly' && v.labels.revenue_type === 'total')?.value || 0,
          monthly: revenueGauge.get().values.find(v => v.labels.period === 'monthly' && v.labels.revenue_type === 'total')?.value || 0
        },
        system_health: {
          api_performance: systemPerformanceScore.get().values.find(v => v.labels.component === 'api' && v.labels.performance_metric === 'response_time')?.value || 0,
          error_rate: systemPerformanceScore.get().values.find(v => v.labels.component === 'api' && v.labels.performance_metric === 'error_rate')?.value || 0
        }
      }
    };
    
    res.json(summary);
  } catch (error) {
    logger.error('Error generating business summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// Start the collector and server
const collector = new BusinessMetricsCollector();

app.listen(port, () => {
  logger.info(`Business metrics exporter listening on port ${port}`);
  collector.start();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await dbPool.end();
  await redisClient.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await dbPool.end();
  await redisClient.quit();
  process.exit(0);
});