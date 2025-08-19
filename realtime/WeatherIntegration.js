/**
 * Weather Integration System for PelotonIQ
 * Integrates real-time weather data with race monitoring and provides weather-aware tactical insights
 */

const EventEmitter = require('events');
const axios = require('axios');
const Redis = require('redis');
const winston = require('winston');
const NodeCache = require('node-cache');
const geolib = require('geolib');

// Configure logging
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/weather-integration.log' }),
        new winston.transports.Console()
    ]
});

/**
 * Weather data point structure
 */
class WeatherData {
    constructor(data) {
        this.location = {
            latitude: data.latitude,
            longitude: data.longitude,
            name: data.locationName || null,
            altitude: data.altitude || null
        };
        this.timestamp = new Date(data.timestamp);
        this.temperature = data.temperature; // Celsius
        this.humidity = data.humidity; // Percentage
        this.pressure = data.pressure; // hPa
        this.windSpeed = data.windSpeed; // m/s
        this.windDirection = data.windDirection; // Degrees
        this.windGust = data.windGust || null; // m/s
        this.precipitation = data.precipitation || 0; // mm/h
        this.visibility = data.visibility || null; // km
        this.cloudCover = data.cloudCover || null; // Percentage
        this.uvIndex = data.uvIndex || null;
        this.condition = data.condition || 'unknown'; // clear, clouds, rain, snow, etc.
        this.source = data.source;
        this.confidence = data.confidence || 1.0;
        this.forecastHours = data.forecastHours || 0; // 0 for current, >0 for forecast
        
        // Derived values
        this.apparentTemperature = this.calculateApparentTemperature();
        this.dewPoint = this.calculateDewPoint();
        this.heatIndex = this.calculateHeatIndex();
        this.windChill = this.calculateWindChill();
        this.weatherSeverity = this.calculateWeatherSeverity();
    }

    /**
     * Calculate apparent temperature (feels like)
     */
    calculateApparentTemperature() {
        if (this.temperature === null || this.windSpeed === null || this.humidity === null) {
            return null;
        }

        // Simplified apparent temperature calculation
        const windKmh = this.windSpeed * 3.6;
        const vapor = (this.humidity / 100) * 6.105 * Math.exp(17.27 * this.temperature / (237.7 + this.temperature));
        
        return this.temperature + 0.33 * vapor - 0.7 * windKmh - 4.0;
    }

    /**
     * Calculate dew point
     */
    calculateDewPoint() {
        if (this.temperature === null || this.humidity === null) {
            return null;
        }

        const a = 17.27;
        const b = 237.7;
        const alpha = ((a * this.temperature) / (b + this.temperature)) + Math.log(this.humidity / 100);
        
        return (b * alpha) / (a - alpha);
    }

    /**
     * Calculate heat index
     */
    calculateHeatIndex() {
        if (this.temperature === null || this.humidity === null || this.temperature < 27) {
            return null;
        }

        const T = this.temperature;
        const RH = this.humidity;
        
        // Simplified heat index calculation
        const HI = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (RH * 0.094));
        
        if (HI >= 80) {
            // Full regression equation for higher temperatures
            const c1 = -42.379;
            const c2 = 2.04901523;
            const c3 = 10.14333127;
            const c4 = -0.22475541;
            const c5 = -0.00683783;
            const c6 = -0.05481717;
            const c7 = 0.00122874;
            const c8 = 0.00085282;
            const c9 = -0.00000199;
            
            return c1 + c2*T + c3*RH + c4*T*RH + c5*T*T + c6*RH*RH + c7*T*T*RH + c8*T*RH*RH + c9*T*T*RH*RH;
        }
        
        return HI;
    }

    /**
     * Calculate wind chill
     */
    calculateWindChill() {
        if (this.temperature === null || this.windSpeed === null || this.temperature > 10) {
            return null;
        }

        const T = this.temperature;
        const V = this.windSpeed * 3.6; // Convert to km/h
        
        if (V < 4.8) {
            return T; // No wind chill for very low wind speeds
        }
        
        return 13.12 + 0.6215 * T - 11.37 * Math.pow(V, 0.16) + 0.3965 * T * Math.pow(V, 0.16);
    }

    /**
     * Calculate weather severity (0-10 scale)
     */
    calculateWeatherSeverity() {
        let severity = 0;
        
        // Temperature extremes
        if (this.temperature !== null) {
            if (this.temperature > 35 || this.temperature < 0) severity += 3;
            else if (this.temperature > 30 || this.temperature < 5) severity += 2;
            else if (this.temperature > 25 || this.temperature < 10) severity += 1;
        }
        
        // Wind
        if (this.windSpeed !== null) {
            if (this.windSpeed > 15) severity += 3; // > 54 km/h
            else if (this.windSpeed > 10) severity += 2; // > 36 km/h
            else if (this.windSpeed > 7) severity += 1; // > 25 km/h
        }
        
        // Precipitation
        if (this.precipitation > 10) severity += 3; // Heavy rain
        else if (this.precipitation > 2.5) severity += 2; // Moderate rain
        else if (this.precipitation > 0.1) severity += 1; // Light rain
        
        // Visibility
        if (this.visibility !== null && this.visibility < 1) severity += 2;
        
        return Math.min(10, severity);
    }

    /**
     * Get performance impact assessment
     */
    getPerformanceImpact() {
        const impact = {
            overall: 'minimal', // minimal, moderate, significant, severe
            factors: [],
            recommendations: []
        };

        let impactScore = 0;

        // Temperature impact
        if (this.temperature !== null) {
            if (this.temperature > 32) {
                impactScore += 3;
                impact.factors.push('Extreme heat');
                impact.recommendations.push('Increase hydration frequency');
            } else if (this.temperature > 28) {
                impactScore += 2;
                impact.factors.push('High temperature');
                impact.recommendations.push('Monitor for heat stress');
            } else if (this.temperature < 5) {
                impactScore += 2;
                impact.factors.push('Cold conditions');
                impact.recommendations.push('Ensure proper clothing layers');
            }
        }

        // Wind impact
        if (this.windSpeed !== null) {
            if (this.windSpeed > 12) {
                impactScore += 3;
                impact.factors.push('Strong crosswinds/headwinds');
                impact.recommendations.push('Adjust pacing strategy for wind resistance');
            } else if (this.windSpeed > 8) {
                impactScore += 2;
                impact.factors.push('Moderate wind');
                impact.recommendations.push('Consider drafting strategies');
            }
        }

        // Precipitation impact
        if (this.precipitation > 5) {
            impactScore += 3;
            impact.factors.push('Heavy rain');
            impact.recommendations.push('Reduce cornering speeds, increase following distance');
        } else if (this.precipitation > 1) {
            impactScore += 2;
            impact.factors.push('Rain');
            impact.recommendations.push('Exercise caution on descents');
        }

        // Overall impact level
        if (impactScore >= 7) impact.overall = 'severe';
        else if (impactScore >= 5) impact.overall = 'significant';
        else if (impactScore >= 3) impact.overall = 'moderate';

        return impact;
    }

    toJSON() {
        return {
            location: this.location,
            timestamp: this.timestamp.toISOString(),
            temperature: this.temperature,
            humidity: this.humidity,
            pressure: this.pressure,
            windSpeed: this.windSpeed,
            windDirection: this.windDirection,
            windGust: this.windGust,
            precipitation: this.precipitation,
            visibility: this.visibility,
            cloudCover: this.cloudCover,
            uvIndex: this.uvIndex,
            condition: this.condition,
            source: this.source,
            confidence: this.confidence,
            forecastHours: this.forecastHours,
            apparentTemperature: this.apparentTemperature,
            dewPoint: this.dewPoint,
            heatIndex: this.heatIndex,
            windChill: this.windChill,
            weatherSeverity: this.weatherSeverity,
            performanceImpact: this.getPerformanceImpact()
        };
    }
}

/**
 * Route weather profile
 */
class RouteWeatherProfile {
    constructor(route) {
        this.route = route; // Array of {latitude, longitude, distance, altitude}
        this.weatherPoints = new Map(); // distance -> WeatherData
        this.lastUpdated = new Date();
        this.completeness = 0; // Percentage of route with weather data
    }

    addWeatherPoint(distance, weatherData) {
        this.weatherPoints.set(distance, weatherData);
        this.updateCompleteness();
        this.lastUpdated = new Date();
    }

    updateCompleteness() {
        if (this.route.length === 0) {
            this.completeness = 0;
            return;
        }

        const routeLength = this.route[this.route.length - 1].distance;
        const coverageDistance = routeLength / 10; // Check every 10% of route
        let coveredSegments = 0;

        for (let i = 0; i < 10; i++) {
            const checkDistance = i * coverageDistance;
            const nearestWeather = this.findNearestWeather(checkDistance);
            
            if (nearestWeather && Math.abs(nearestWeather.distance - checkDistance) < coverageDistance) {
                coveredSegments++;
            }
        }

        this.completeness = (coveredSegments / 10) * 100;
    }

    findNearestWeather(distance) {
        let nearest = null;
        let minDistance = Infinity;

        for (const [pointDistance, weatherData] of this.weatherPoints) {
            const dist = Math.abs(pointDistance - distance);
            if (dist < minDistance) {
                minDistance = dist;
                nearest = { distance: pointDistance, weather: weatherData };
            }
        }

        return nearest;
    }

    getWeatherAtDistance(distance) {
        return this.findNearestWeather(distance);
    }

    getRouteWeatherSummary() {
        const weatherPoints = Array.from(this.weatherPoints.values());
        
        if (weatherPoints.length === 0) {
            return null;
        }

        const summary = {
            totalPoints: weatherPoints.length,
            completeness: this.completeness,
            temperatureRange: {
                min: Math.min(...weatherPoints.map(w => w.temperature).filter(t => t !== null)),
                max: Math.max(...weatherPoints.map(w => w.temperature).filter(t => t !== null))
            },
            windSpeedRange: {
                min: Math.min(...weatherPoints.map(w => w.windSpeed).filter(w => w !== null)),
                max: Math.max(...weatherPoints.map(w => w.windSpeed).filter(w => w !== null))
            },
            precipitation: {
                total: weatherPoints.reduce((sum, w) => sum + (w.precipitation || 0), 0),
                hasRain: weatherPoints.some(w => w.precipitation > 0)
            },
            overallSeverity: Math.max(...weatherPoints.map(w => w.weatherSeverity))
        };

        return summary;
    }
}

/**
 * Weather Integration System
 */
class WeatherIntegration extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            updateInterval: options.updateInterval || 300000, // 5 minutes
            forecastHours: options.forecastHours || 6,
            apiKeys: {
                openWeatherMap: options.openWeatherMapKey || process.env.OPENWEATHERMAP_API_KEY,
                weatherApi: options.weatherApiKey || process.env.WEATHER_API_KEY,
                visualCrossing: options.visualCrossingKey || process.env.VISUAL_CROSSING_API_KEY
            },
            sources: options.enabledSources || ['openweathermap', 'weatherapi'],
            cacheTimeout: options.cacheTimeout || 300, // 5 minutes
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000,
            redisUrl: options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
            ...options
        };

        // Data storage
        this.currentWeather = new Map(); // locationKey -> WeatherData
        this.forecasts = new Map(); // locationKey -> Array of WeatherData
        this.routeProfiles = new Map(); // routeId -> RouteWeatherProfile
        this.alerts = new Map(); // alertId -> weather alert
        
        // Source management
        this.sourceReliability = new Map(); // sourceId -> reliability score
        this.lastSuccessfulUpdate = new Map(); // sourceId -> timestamp
        this.failureCount = new Map(); // sourceId -> count

        // Caching
        this.cache = new NodeCache({ 
            stdTTL: this.options.cacheTimeout,
            checkperiod: 60,
            useClones: false
        });

        // Performance tracking
        this.stats = {
            requestsTotal: 0,
            requestsSuccessful: 0,
            requestsFailed: 0,
            averageResponseTime: 0,
            cachehits: 0,
            lastUpdate: null
        };

        this.redis = null;
        this.updateTimer = null;
        this.isUpdating = false;

        this.initializeRedis();
        this.initializeSources();
        this.startUpdates();
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
            logger.info('Weather Integration Redis connection established');
            
        } catch (error) {
            logger.error('Failed to initialize Redis:', error);
            throw error;
        }
    }

    /**
     * Initialize weather data sources
     */
    initializeSources() {
        const sources = ['openweathermap', 'weatherapi', 'visualcrossing'];
        
        for (const source of sources) {
            this.sourceReliability.set(source, 0.8); // Initial reliability
            this.failureCount.set(source, 0);
        }

        logger.info('Weather sources initialized', { 
            sources: this.options.sources 
        });
    }

    /**
     * Get weather data from OpenWeatherMap
     */
    async getOpenWeatherMapData(latitude, longitude, type = 'current') {
        const apiKey = this.options.apiKeys.openWeatherMap;
        if (!apiKey) {
            throw new Error('OpenWeatherMap API key not configured');
        }

        let url;
        if (type === 'current') {
            url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`;
        } else if (type === 'forecast') {
            url = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`;
        }

        const response = await axios.get(url, { timeout: 10000 });
        const data = response.data;

        if (type === 'current') {
            return new WeatherData({
                latitude: latitude,
                longitude: longitude,
                timestamp: new Date(data.dt * 1000),
                temperature: data.main.temp,
                humidity: data.main.humidity,
                pressure: data.main.pressure,
                windSpeed: data.wind?.speed || 0,
                windDirection: data.wind?.deg || 0,
                windGust: data.wind?.gust || null,
                precipitation: data.rain?.['1h'] || data.snow?.['1h'] || 0,
                visibility: data.visibility ? data.visibility / 1000 : null,
                cloudCover: data.clouds?.all || null,
                condition: data.weather[0]?.main?.toLowerCase() || 'unknown',
                source: 'openweathermap',
                confidence: 0.9
            });
        } else {
            // Process forecast data
            return data.list.slice(0, this.options.forecastHours).map((item, index) => {
                return new WeatherData({
                    latitude: latitude,
                    longitude: longitude,
                    timestamp: new Date(item.dt * 1000),
                    temperature: item.main.temp,
                    humidity: item.main.humidity,
                    pressure: item.main.pressure,
                    windSpeed: item.wind?.speed || 0,
                    windDirection: item.wind?.deg || 0,
                    windGust: item.wind?.gust || null,
                    precipitation: item.rain?.['3h'] || item.snow?.['3h'] || 0,
                    visibility: item.visibility ? item.visibility / 1000 : null,
                    cloudCover: item.clouds?.all || null,
                    condition: item.weather[0]?.main?.toLowerCase() || 'unknown',
                    source: 'openweathermap',
                    confidence: 0.9 - (index * 0.1), // Decreasing confidence for future forecasts
                    forecastHours: index + 1
                });
            });
        }
    }

    /**
     * Get weather data from WeatherAPI
     */
    async getWeatherApiData(latitude, longitude, type = 'current') {
        const apiKey = this.options.apiKeys.weatherApi;
        if (!apiKey) {
            throw new Error('WeatherAPI key not configured');
        }

        let url;
        if (type === 'current') {
            url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${latitude},${longitude}&aqi=no`;
        } else if (type === 'forecast') {
            const hours = Math.min(this.options.forecastHours, 24); // WeatherAPI limits
            url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${latitude},${longitude}&hours=${hours}&aqi=no`;
        }

        const response = await axios.get(url, { timeout: 10000 });
        const data = response.data;

        if (type === 'current') {
            const current = data.current;
            return new WeatherData({
                latitude: latitude,
                longitude: longitude,
                timestamp: new Date(current.last_updated),
                temperature: current.temp_c,
                humidity: current.humidity,
                pressure: current.pressure_mb,
                windSpeed: current.wind_kph / 3.6, // Convert to m/s
                windDirection: current.wind_degree,
                windGust: current.gust_kph ? current.gust_kph / 3.6 : null,
                precipitation: current.precip_mm || 0,
                visibility: current.vis_km,
                cloudCover: current.cloud,
                uvIndex: current.uv,
                condition: current.condition.text.toLowerCase(),
                source: 'weatherapi',
                confidence: 0.85
            });
        } else {
            // Process forecast data
            const forecastHours = data.forecast.forecastday[0].hour;
            return forecastHours.slice(0, this.options.forecastHours).map((hour, index) => {
                return new WeatherData({
                    latitude: latitude,
                    longitude: longitude,
                    timestamp: new Date(hour.time),
                    temperature: hour.temp_c,
                    humidity: hour.humidity,
                    pressure: hour.pressure_mb,
                    windSpeed: hour.wind_kph / 3.6,
                    windDirection: hour.wind_degree,
                    windGust: hour.gust_kph ? hour.gust_kph / 3.6 : null,
                    precipitation: hour.precip_mm || 0,
                    visibility: hour.vis_km,
                    cloudCover: hour.cloud,
                    uvIndex: hour.uv,
                    condition: hour.condition.text.toLowerCase(),
                    source: 'weatherapi',
                    confidence: 0.85 - (index * 0.05),
                    forecastHours: index + 1
                });
            });
        }
    }

    /**
     * Fetch weather data with retry logic
     */
    async fetchWeatherData(latitude, longitude, source, type = 'current') {
        const startTime = Date.now();
        let attempt = 0;
        
        while (attempt < this.options.maxRetries) {
            try {
                let data;
                
                switch (source) {
                    case 'openweathermap':
                        data = await this.getOpenWeatherMapData(latitude, longitude, type);
                        break;
                    case 'weatherapi':
                        data = await this.getWeatherApiData(latitude, longitude, type);
                        break;
                    default:
                        throw new Error(`Unsupported weather source: ${source}`);
                }

                // Update source reliability on success
                this.updateSourceReliability(source, true);
                this.lastSuccessfulUpdate.set(source, new Date());
                
                // Update stats
                this.stats.requestsSuccessful++;
                this.stats.averageResponseTime = this.updateAverage(
                    this.stats.averageResponseTime,
                    Date.now() - startTime,
                    this.stats.requestsTotal
                );

                return data;

            } catch (error) {
                attempt++;
                this.updateSourceReliability(source, false);
                
                logger.warn(`Weather fetch attempt ${attempt} failed`, {
                    source,
                    latitude,
                    longitude,
                    error: error.message
                });

                if (attempt >= this.options.maxRetries) {
                    this.stats.requestsFailed++;
                    throw error;
                }

                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, this.options.retryDelay * attempt));
            }
        }
    }

    /**
     * Update source reliability based on success/failure
     */
    updateSourceReliability(source, success) {
        const currentReliability = this.sourceReliability.get(source) || 0.5;
        let adjustment = success ? 0.02 : -0.05;
        
        const newReliability = Math.max(0.1, Math.min(1.0, currentReliability + adjustment));
        this.sourceReliability.set(source, newReliability);

        if (success) {
            this.failureCount.set(source, 0);
        } else {
            this.failureCount.set(source, (this.failureCount.get(source) || 0) + 1);
        }
    }

    /**
     * Get aggregated weather data from multiple sources
     */
    async getAggregatedWeatherData(latitude, longitude, type = 'current') {
        const cacheKey = `weather:${latitude}:${longitude}:${type}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached) {
            this.stats.cachehits++;
            return cached;
        }

        const results = [];
        const errors = [];

        // Fetch from all enabled sources
        for (const source of this.options.sources) {
            try {
                this.stats.requestsTotal++;
                const data = await this.fetchWeatherData(latitude, longitude, source, type);
                results.push({ source, data, reliability: this.sourceReliability.get(source) });
                
            } catch (error) {
                errors.push({ source, error: error.message });
            }
        }

        if (results.length === 0) {
            throw new Error(`No weather data available from any source: ${errors.map(e => e.error).join(', ')}`);
        }

        // Aggregate results based on source reliability
        const aggregatedData = this.aggregateWeatherResults(results, type);
        
        // Cache the result
        this.cache.set(cacheKey, aggregatedData);
        
        return aggregatedData;
    }

    /**
     * Aggregate weather results from multiple sources
     */
    aggregateWeatherResults(results, type) {
        if (results.length === 1) {
            return results[0].data;
        }

        // For forecasts, return the most reliable source
        if (type === 'forecast') {
            const mostReliable = results.reduce((max, current) => 
                current.reliability > max.reliability ? current : max
            );
            return mostReliable.data;
        }

        // For current weather, create weighted average
        const totalWeight = results.reduce((sum, r) => sum + r.reliability, 0);
        const weightedData = {};

        // Aggregate numerical values
        const numericalFields = ['temperature', 'humidity', 'pressure', 'windSpeed', 'windDirection', 'precipitation'];
        
        for (const field of numericalFields) {
            let weightedSum = 0;
            let weightSum = 0;
            
            for (const result of results) {
                const value = result.data[field];
                if (value !== null && value !== undefined) {
                    weightedSum += value * result.reliability;
                    weightSum += result.reliability;
                }
            }
            
            weightedData[field] = weightSum > 0 ? weightedSum / weightSum : null;
        }

        // Use most reliable source for categorical data
        const mostReliable = results.reduce((max, current) => 
            current.reliability > max.reliability ? current : max
        );

        return new WeatherData({
            latitude: mostReliable.data.location.latitude,
            longitude: mostReliable.data.location.longitude,
            timestamp: new Date(),
            temperature: weightedData.temperature,
            humidity: weightedData.humidity,
            pressure: weightedData.pressure,
            windSpeed: weightedData.windSpeed,
            windDirection: weightedData.windDirection,
            precipitation: weightedData.precipitation,
            visibility: mostReliable.data.visibility,
            cloudCover: mostReliable.data.cloudCover,
            uvIndex: mostReliable.data.uvIndex,
            condition: mostReliable.data.condition,
            source: 'aggregated',
            confidence: totalWeight / results.length
        });
    }

    /**
     * Update weather for specific location
     */
    async updateLocationWeather(latitude, longitude, locationKey = null) {
        try {
            const key = locationKey || `${latitude},${longitude}`;
            
            // Get current weather
            const currentWeather = await this.getAggregatedWeatherData(latitude, longitude, 'current');
            this.currentWeather.set(key, currentWeather);
            
            // Get forecast
            const forecast = await this.getAggregatedWeatherData(latitude, longitude, 'forecast');
            this.forecasts.set(key, Array.isArray(forecast) ? forecast : [forecast]);
            
            // Store in Redis
            await this.storeWeatherInRedis(key, currentWeather, forecast);
            
            // Emit update event
            this.emit('weather-updated', {
                locationKey: key,
                latitude,
                longitude,
                current: currentWeather.toJSON(),
                forecast: Array.isArray(forecast) ? forecast.map(f => f.toJSON()) : [forecast.toJSON()]
            });

            // Check for weather alerts
            this.checkWeatherAlerts(key, currentWeather, forecast);

            logger.debug('Weather updated for location', { locationKey: key, latitude, longitude });
            
        } catch (error) {
            logger.error('Failed to update weather for location', {
                latitude,
                longitude,
                locationKey,
                error: error.message
            });
            
            this.emit('weather-error', {
                latitude,
                longitude,
                locationKey,
                error: error.message
            });
        }
    }

    /**
     * Update weather for entire race route
     */
    async updateRouteWeather(routeId, routePoints) {
        try {
            if (!Array.isArray(routePoints) || routePoints.length === 0) {
                throw new Error('Invalid route points provided');
            }

            const profile = new RouteWeatherProfile(routePoints);
            
            // Sample weather points along the route (every 20km or significant elevation change)
            const weatherPoints = this.selectWeatherSamplePoints(routePoints);
            
            const weatherPromises = weatherPoints.map(async (point) => {
                try {
                    const weather = await this.getAggregatedWeatherData(
                        point.latitude, 
                        point.longitude, 
                        'current'
                    );
                    return { point, weather };
                } catch (error) {
                    logger.warn('Failed to get weather for route point', {
                        routeId,
                        point,
                        error: error.message
                    });
                    return null;
                }
            });

            const weatherResults = await Promise.all(weatherPromises);
            
            // Add weather data to profile
            for (const result of weatherResults) {
                if (result) {
                    profile.addWeatherPoint(result.point.distance, result.weather);
                }
            }

            this.routeProfiles.set(routeId, profile);
            
            // Store route weather in Redis
            await this.storeRouteWeatherInRedis(routeId, profile);
            
            this.emit('route-weather-updated', {
                routeId,
                profile: profile.getRouteWeatherSummary(),
                completeness: profile.completeness
            });

            logger.info('Route weather updated', {
                routeId,
                pointsCount: weatherPoints.length,
                completeness: profile.completeness
            });

        } catch (error) {
            logger.error('Failed to update route weather', {
                routeId,
                error: error.message
            });
        }
    }

    /**
     * Select optimal points for weather sampling along route
     */
    selectWeatherSamplePoints(routePoints) {
        const samplePoints = [];
        const maxDistance = routePoints[routePoints.length - 1].distance;
        const sampleInterval = Math.max(20000, maxDistance / 20); // Sample every 20km or 1/20th of route
        
        let lastSampleDistance = 0;
        let lastAltitude = routePoints[0].altitude || 0;
        
        for (const point of routePoints) {
            const distanceSinceLastSample = point.distance - lastSampleDistance;
            const altitudeChange = Math.abs((point.altitude || 0) - lastAltitude);
            
            // Sample if: sufficient distance, significant altitude change, or start/end
            if (point.distance === 0 || // Start
                point.distance === maxDistance || // End
                distanceSinceLastSample >= sampleInterval || // Regular interval
                altitudeChange > 500) { // Significant elevation change
                
                samplePoints.push(point);
                lastSampleDistance = point.distance;
                lastAltitude = point.altitude || 0;
            }
        }
        
        return samplePoints;
    }

    /**
     * Check for weather alerts
     */
    checkWeatherAlerts(locationKey, current, forecast) {
        const alerts = [];
        
        // Current weather alerts
        if (current.weatherSeverity >= 7) {
            alerts.push({
                id: `severe-${locationKey}-${Date.now()}`,
                type: 'severe_weather',
                severity: 'high',
                location: locationKey,
                message: 'Severe weather conditions detected',
                details: current.getPerformanceImpact(),
                timestamp: new Date(),
                expiresAt: new Date(Date.now() + 3600000) // 1 hour
            });
        }

        // Temperature alerts
        if (current.temperature > 35) {
            alerts.push({
                id: `heat-${locationKey}-${Date.now()}`,
                type: 'extreme_heat',
                severity: 'high',
                location: locationKey,
                message: `Extreme heat warning: ${current.temperature}°C`,
                timestamp: new Date(),
                expiresAt: new Date(Date.now() + 3600000)
            });
        } else if (current.temperature < 0) {
            alerts.push({
                id: `cold-${locationKey}-${Date.now()}`,
                type: 'extreme_cold',
                severity: 'medium',
                location: locationKey,
                message: `Freezing conditions: ${current.temperature}°C`,
                timestamp: new Date(),
                expiresAt: new Date(Date.now() + 3600000)
            });
        }

        // Wind alerts
        if (current.windSpeed > 15) {
            alerts.push({
                id: `wind-${locationKey}-${Date.now()}`,
                type: 'high_wind',
                severity: 'medium',
                location: locationKey,
                message: `Strong winds: ${Math.round(current.windSpeed * 3.6)} km/h`,
                timestamp: new Date(),
                expiresAt: new Date(Date.now() + 3600000)
            });
        }

        // Precipitation alerts
        if (current.precipitation > 5) {
            alerts.push({
                id: `rain-${locationKey}-${Date.now()}`,
                type: 'heavy_rain',
                severity: 'medium',
                location: locationKey,
                message: `Heavy rainfall: ${current.precipitation} mm/h`,
                timestamp: new Date(),
                expiresAt: new Date(Date.now() + 3600000)
            });
        }

        // Store and emit alerts
        for (const alert of alerts) {
            this.alerts.set(alert.id, alert);
            this.emit('weather-alert', alert);
        }

        // Clean up expired alerts
        this.cleanupExpiredAlerts();
    }

    /**
     * Clean up expired alerts
     */
    cleanupExpiredAlerts() {
        const now = new Date();
        const expiredAlerts = [];
        
        for (const [alertId, alert] of this.alerts) {
            if (alert.expiresAt < now) {
                expiredAlerts.push(alertId);
            }
        }
        
        for (const alertId of expiredAlerts) {
            this.alerts.delete(alertId);
        }
    }

    /**
     * Store weather data in Redis
     */
    async storeWeatherInRedis(locationKey, current, forecast) {
        try {
            const currentKey = `weather:current:${locationKey}`;
            const forecastKey = `weather:forecast:${locationKey}`;
            
            await this.redis.setEx(currentKey, 900, JSON.stringify(current.toJSON())); // 15 minutes
            
            const forecastData = Array.isArray(forecast) ? 
                forecast.map(f => f.toJSON()) : 
                [forecast.toJSON()];
            await this.redis.setEx(forecastKey, 3600, JSON.stringify(forecastData)); // 1 hour
            
        } catch (error) {
            logger.warn('Failed to store weather in Redis', {
                locationKey,
                error: error.message
            });
        }
    }

    /**
     * Store route weather in Redis
     */
    async storeRouteWeatherInRedis(routeId, profile) {
        try {
            const key = `weather:route:${routeId}`;
            const data = {
                route: profile.route,
                weatherPoints: Object.fromEntries(
                    Array.from(profile.weatherPoints.entries()).map(([dist, weather]) => [
                        dist,
                        weather.toJSON()
                    ])
                ),
                summary: profile.getRouteWeatherSummary(),
                lastUpdated: profile.lastUpdated.toISOString(),
                completeness: profile.completeness
            };
            
            await this.redis.setEx(key, 1800, JSON.stringify(data)); // 30 minutes
            
        } catch (error) {
            logger.warn('Failed to store route weather in Redis', {
                routeId,
                error: error.message
            });
        }
    }

    /**
     * Get current weather for location
     */
    getCurrentWeather(locationKey) {
        const weather = this.currentWeather.get(locationKey);
        return weather ? weather.toJSON() : null;
    }

    /**
     * Get forecast for location
     */
    getForecast(locationKey) {
        const forecast = this.forecasts.get(locationKey);
        return forecast ? forecast.map(f => f.toJSON()) : null;
    }

    /**
     * Get route weather profile
     */
    getRouteWeather(routeId) {
        const profile = this.routeProfiles.get(routeId);
        return profile ? {
            summary: profile.getRouteWeatherSummary(),
            weatherPoints: Object.fromEntries(
                Array.from(profile.weatherPoints.entries()).map(([dist, weather]) => [
                    dist,
                    weather.toJSON()
                ])
            ),
            completeness: profile.completeness,
            lastUpdated: profile.lastUpdated.toISOString()
        } : null;
    }

    /**
     * Get weather at specific route distance
     */
    getRouteWeatherAtDistance(routeId, distance) {
        const profile = this.routeProfiles.get(routeId);
        if (!profile) return null;
        
        const weatherPoint = profile.getWeatherAtDistance(distance);
        return weatherPoint ? weatherPoint.weather.toJSON() : null;
    }

    /**
     * Get active weather alerts
     */
    getActiveAlerts() {
        this.cleanupExpiredAlerts();
        return Array.from(this.alerts.values());
    }

    /**
     * Update moving average
     */
    updateAverage(currentAvg, newValue, count) {
        return (currentAvg * (count - 1) + newValue) / count;
    }

    /**
     * Start automatic weather updates
     */
    startUpdates() {
        this.updateTimer = setInterval(() => {
            this.performScheduledUpdates();
        }, this.options.updateInterval);

        logger.info('Weather updates started', {
            interval: this.options.updateInterval
        });
    }

    /**
     * Perform scheduled weather updates
     */
    async performScheduledUpdates() {
        if (this.isUpdating) return;
        
        this.isUpdating = true;
        
        try {
            // Update weather for all tracked locations
            const updatePromises = [];
            
            for (const locationKey of this.currentWeather.keys()) {
                const [lat, lon] = locationKey.split(',').map(parseFloat);
                updatePromises.push(this.updateLocationWeather(lat, lon, locationKey));
            }
            
            // Update route weather profiles
            for (const [routeId, profile] of this.routeProfiles) {
                updatePromises.push(this.updateRouteWeather(routeId, profile.route));
            }
            
            await Promise.allSettled(updatePromises);
            
            this.stats.lastUpdate = new Date();
            
        } catch (error) {
            logger.error('Error in scheduled weather updates', { error: error.message });
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Add location for weather tracking
     */
    addLocation(latitude, longitude, locationKey = null) {
        const key = locationKey || `${latitude},${longitude}`;
        
        // Immediately update weather for this location
        this.updateLocationWeather(latitude, longitude, key);
        
        logger.info('Location added for weather tracking', {
            locationKey: key,
            latitude,
            longitude
        });
    }

    /**
     * Remove location from weather tracking
     */
    removeLocation(locationKey) {
        this.currentWeather.delete(locationKey);
        this.forecasts.delete(locationKey);
        
        logger.info('Location removed from weather tracking', { locationKey });
    }

    /**
     * Get system statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeLocations: this.currentWeather.size,
            activeRoutes: this.routeProfiles.size,
            activeAlerts: this.alerts.size,
            sourceReliability: Object.fromEntries(this.sourceReliability),
            cacheStats: this.cache.getStats(),
            memoryUsage: process.memoryUsage()
        };
    }

    /**
     * Stop weather updates and cleanup
     */
    async stop() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }

        if (this.redis) {
            await this.redis.quit();
        }

        this.cache.flushAll();
        
        logger.info('Weather integration stopped');
    }
}

module.exports = { WeatherIntegration, WeatherData, RouteWeatherProfile };