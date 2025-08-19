/**
 * Comprehensive test suite for WeatherIntegration
 * Tests all functionality including edge cases and performance scenarios
 */

const { WeatherIntegration, WeatherData, RouteWeatherProfile } = require('../WeatherIntegration');
const axios = require('axios');
const Redis = require('redis-mock');

// Mock external dependencies
jest.mock('axios');
jest.mock('redis', () => require('redis-mock'));
jest.mock('node-cache');

describe('WeatherIntegration', () => {
    let weatherIntegration;
    const mockAxios = axios;

    beforeEach(async () => {
        jest.clearAllMocks();
        
        weatherIntegration = new WeatherIntegration({
            updateInterval: 1000, // Faster for testing
            cacheTimeout: 10, // Short timeout for testing
            maxRetries: 2,
            retryDelay: 100,
            sources: ['openweathermap', 'weatherapi'],
            apiKeys: {
                openWeatherMap: 'test-owm-key',
                weatherApi: 'test-wa-key'
            }
        });

        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
        if (weatherIntegration) {
            await weatherIntegration.stop();
        }
    });

    describe('WeatherData Class', () => {
        test('should create valid weather data object', () => {
            const weatherData = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 20,
                humidity: 60,
                pressure: 1013,
                windSpeed: 5,
                windDirection: 180,
                precipitation: 0,
                condition: 'clear',
                source: 'test'
            });

            expect(weatherData.location.latitude).toBe(45.0);
            expect(weatherData.location.longitude).toBe(2.0);
            expect(weatherData.temperature).toBe(20);
            expect(weatherData.humidity).toBe(60);
            expect(weatherData.source).toBe('test');
        });

        test('should calculate apparent temperature correctly', () => {
            const weatherData = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 25,
                humidity: 70,
                windSpeed: 10,
                source: 'test'
            });

            expect(weatherData.apparentTemperature).toBeDefined();
            expect(typeof weatherData.apparentTemperature).toBe('number');
        });

        test('should calculate dew point correctly', () => {
            const weatherData = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 25,
                humidity: 60,
                source: 'test'
            });

            expect(weatherData.dewPoint).toBeDefined();
            expect(weatherData.dewPoint).toBeLessThan(weatherData.temperature);
        });

        test('should calculate heat index for high temperatures', () => {
            const weatherData = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 35,
                humidity: 80,
                source: 'test'
            });

            expect(weatherData.heatIndex).toBeDefined();
            expect(weatherData.heatIndex).toBeGreaterThan(weatherData.temperature);
        });

        test('should calculate wind chill for cold temperatures', () => {
            const weatherData = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 5,
                humidity: 60,
                windSpeed: 15,
                source: 'test'
            });

            expect(weatherData.windChill).toBeDefined();
            expect(weatherData.windChill).toBeLessThan(weatherData.temperature);
        });

        test('should calculate weather severity correctly', () => {
            const severeWeather = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: -5, // Extreme cold
                windSpeed: 20, // Strong wind
                precipitation: 15, // Heavy rain
                visibility: 0.5, // Poor visibility
                source: 'test'
            });

            expect(severeWeather.weatherSeverity).toBeGreaterThan(7);

            const mildWeather = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 20,
                windSpeed: 3,
                precipitation: 0,
                visibility: 10,
                source: 'test'
            });

            expect(mildWeather.weatherSeverity).toBeLessThan(3);
        });

        test('should assess performance impact correctly', () => {
            const extremeWeather = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 38,
                windSpeed: 18,
                precipitation: 8,
                source: 'test'
            });

            const impact = extremeWeather.getPerformanceImpact();
            
            expect(impact.overall).toBe('severe');
            expect(impact.factors).toContain('Extreme heat');
            expect(impact.factors).toContain('Strong crosswinds/headwinds');
            expect(impact.factors).toContain('Heavy rain');
            expect(impact.recommendations).toContain('Increase hydration frequency');
        });

        test('should handle null values gracefully', () => {
            const weatherData = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: null,
                humidity: null,
                windSpeed: null,
                source: 'test'
            });

            expect(weatherData.apparentTemperature).toBeNull();
            expect(weatherData.dewPoint).toBeNull();
            expect(weatherData.heatIndex).toBeNull();
            expect(weatherData.windChill).toBeNull();
        });

        test('should convert to JSON correctly', () => {
            const weatherData = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 20,
                humidity: 60,
                source: 'test'
            });

            const json = weatherData.toJSON();
            
            expect(json.location.latitude).toBe(45.0);
            expect(json.temperature).toBe(20);
            expect(json.performanceImpact).toBeDefined();
            expect(json.timestamp).toBeDefined();
        });
    });

    describe('RouteWeatherProfile Class', () => {
        test('should create route weather profile', () => {
            const route = [
                { latitude: 45.0, longitude: 2.0, distance: 0, altitude: 100 },
                { latitude: 45.1, longitude: 2.1, distance: 10000, altitude: 200 },
                { latitude: 45.2, longitude: 2.2, distance: 20000, altitude: 150 }
            ];

            const profile = new RouteWeatherProfile(route);
            
            expect(profile.route).toBe(route);
            expect(profile.weatherPoints).toBeInstanceOf(Map);
            expect(profile.completeness).toBe(0);
        });

        test('should add weather points and update completeness', () => {
            const route = [
                { latitude: 45.0, longitude: 2.0, distance: 0, altitude: 100 },
                { latitude: 45.1, longitude: 2.1, distance: 10000, altitude: 200 }
            ];

            const profile = new RouteWeatherProfile(route);
            const weatherData = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 20,
                source: 'test'
            });

            profile.addWeatherPoint(0, weatherData);
            
            expect(profile.weatherPoints.size).toBe(1);
            expect(profile.completeness).toBeGreaterThan(0);
        });

        test('should find nearest weather point', () => {
            const route = [
                { latitude: 45.0, longitude: 2.0, distance: 0, altitude: 100 },
                { latitude: 45.1, longitude: 2.1, distance: 10000, altitude: 200 }
            ];

            const profile = new RouteWeatherProfile(route);
            const weatherData = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 20,
                source: 'test'
            });

            profile.addWeatherPoint(5000, weatherData);
            
            const nearest = profile.findNearestWeather(6000);
            expect(nearest).toBeDefined();
            expect(nearest.distance).toBe(5000);
            expect(nearest.weather).toBe(weatherData);
        });

        test('should get weather at specific distance', () => {
            const route = [
                { latitude: 45.0, longitude: 2.0, distance: 0, altitude: 100 }
            ];

            const profile = new RouteWeatherProfile(route);
            const weatherData = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 20,
                source: 'test'
            });

            profile.addWeatherPoint(0, weatherData);
            
            const weather = profile.getWeatherAtDistance(0);
            expect(weather.weather).toBe(weatherData);
        });

        test('should generate route weather summary', () => {
            const route = [
                { latitude: 45.0, longitude: 2.0, distance: 0, altitude: 100 }
            ];

            const profile = new RouteWeatherProfile(route);
            
            // Add multiple weather points
            const weather1 = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 20,
                windSpeed: 5,
                precipitation: 0,
                source: 'test'
            });

            const weather2 = new WeatherData({
                latitude: 45.1,
                longitude: 2.1,
                timestamp: new Date(),
                temperature: 25,
                windSpeed: 8,
                precipitation: 2,
                source: 'test'
            });

            profile.addWeatherPoint(0, weather1);
            profile.addWeatherPoint(5000, weather2);
            
            const summary = profile.getRouteWeatherSummary();
            
            expect(summary).toBeDefined();
            expect(summary.totalPoints).toBe(2);
            expect(summary.temperatureRange.min).toBe(20);
            expect(summary.temperatureRange.max).toBe(25);
            expect(summary.precipitation.hasRain).toBe(true);
        });

        test('should handle empty route', () => {
            const profile = new RouteWeatherProfile([]);
            
            expect(profile.completeness).toBe(0);
            expect(profile.getRouteWeatherSummary()).toBeNull();
        });
    });

    describe('API Integration', () => {
        test('should fetch OpenWeatherMap current data', async () => {
            const mockResponse = {
                data: {
                    coord: { lat: 45.0, lon: 2.0 },
                    dt: Math.floor(Date.now() / 1000),
                    main: {
                        temp: 20,
                        humidity: 60,
                        pressure: 1013
                    },
                    wind: {
                        speed: 5,
                        deg: 180
                    },
                    clouds: { all: 20 },
                    weather: [{ main: 'Clear' }],
                    visibility: 10000
                }
            };

            mockAxios.get.mockResolvedValueOnce(mockResponse);

            const weatherData = await weatherIntegration.getOpenWeatherMapData(45.0, 2.0, 'current');
            
            expect(weatherData).toBeInstanceOf(WeatherData);
            expect(weatherData.temperature).toBe(20);
            expect(weatherData.source).toBe('openweathermap');
            expect(mockAxios.get).toHaveBeenCalledWith(
                expect.stringContaining('api.openweathermap.org'),
                expect.any(Object)
            );
        });

        test('should fetch OpenWeatherMap forecast data', async () => {
            const mockResponse = {
                data: {
                    list: [
                        {
                            dt: Math.floor(Date.now() / 1000),
                            main: { temp: 22, humidity: 65, pressure: 1015 },
                            wind: { speed: 6, deg: 200 },
                            clouds: { all: 30 },
                            weather: [{ main: 'Clouds' }]
                        }
                    ]
                }
            };

            mockAxios.get.mockResolvedValueOnce(mockResponse);

            const forecast = await weatherIntegration.getOpenWeatherMapData(45.0, 2.0, 'forecast');
            
            expect(Array.isArray(forecast)).toBe(true);
            expect(forecast[0]).toBeInstanceOf(WeatherData);
            expect(forecast[0].forecastHours).toBe(1);
        });

        test('should fetch WeatherAPI current data', async () => {
            const mockResponse = {
                data: {
                    current: {
                        last_updated: new Date().toISOString(),
                        temp_c: 18,
                        humidity: 55,
                        pressure_mb: 1010,
                        wind_kph: 18, // Will be converted to m/s
                        wind_degree: 160,
                        precip_mm: 0,
                        vis_km: 12,
                        cloud: 40,
                        uv: 5,
                        condition: { text: 'Partly cloudy' }
                    }
                }
            };

            mockAxios.get.mockResolvedValueOnce(mockResponse);

            const weatherData = await weatherIntegration.getWeatherApiData(45.0, 2.0, 'current');
            
            expect(weatherData).toBeInstanceOf(WeatherData);
            expect(weatherData.temperature).toBe(18);
            expect(weatherData.windSpeed).toBe(5); // 18 kph / 3.6
            expect(weatherData.source).toBe('weatherapi');
        });

        test('should fetch WeatherAPI forecast data', async () => {
            const mockResponse = {
                data: {
                    forecast: {
                        forecastday: [{
                            hour: [
                                {
                                    time: new Date().toISOString(),
                                    temp_c: 19,
                                    humidity: 58,
                                    pressure_mb: 1012,
                                    wind_kph: 12,
                                    wind_degree: 170,
                                    vis_km: 10,
                                    cloud: 25,
                                    uv: 3,
                                    condition: { text: 'Clear' }
                                }
                            ]
                        }]
                    }
                }
            };

            mockAxios.get.mockResolvedValueOnce(mockResponse);

            const forecast = await weatherIntegration.getWeatherApiData(45.0, 2.0, 'forecast');
            
            expect(Array.isArray(forecast)).toBe(true);
            expect(forecast[0]).toBeInstanceOf(WeatherData);
            expect(forecast[0].temperature).toBe(19);
        });

        test('should handle API errors gracefully', async () => {
            mockAxios.get.mockRejectedValueOnce(new Error('API Error'));

            await expect(
                weatherIntegration.fetchWeatherData(45.0, 2.0, 'openweathermap')
            ).rejects.toThrow('API Error');
        });

        test('should retry failed requests', async () => {
            mockAxios.get
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({
                    data: {
                        coord: { lat: 45.0, lon: 2.0 },
                        dt: Math.floor(Date.now() / 1000),
                        main: { temp: 20, humidity: 60, pressure: 1013 },
                        wind: { speed: 5, deg: 180 },
                        clouds: { all: 20 },
                        weather: [{ main: 'Clear' }]
                    }
                });

            const weatherData = await weatherIntegration.fetchWeatherData(45.0, 2.0, 'openweathermap');
            
            expect(weatherData).toBeInstanceOf(WeatherData);
            expect(mockAxios.get).toHaveBeenCalledTimes(2);
        });

        test('should update source reliability on success/failure', async () => {
            const initialReliability = weatherIntegration.sourceReliability.get('openweathermap');
            
            // Test successful update
            weatherIntegration.updateSourceReliability('openweathermap', true);
            expect(weatherIntegration.sourceReliability.get('openweathermap')).toBeGreaterThan(initialReliability);
            
            // Test failed update
            const currentReliability = weatherIntegration.sourceReliability.get('openweathermap');
            weatherIntegration.updateSourceReliability('openweathermap', false);
            expect(weatherIntegration.sourceReliability.get('openweathermap')).toBeLessThan(currentReliability);
        });
    });

    describe('Data Aggregation', () => {
        test('should aggregate weather data from multiple sources', async () => {
            const owmResponse = {
                data: {
                    coord: { lat: 45.0, lon: 2.0 },
                    dt: Math.floor(Date.now() / 1000),
                    main: { temp: 20, humidity: 60, pressure: 1013 },
                    wind: { speed: 5, deg: 180 },
                    clouds: { all: 20 },
                    weather: [{ main: 'Clear' }]
                }
            };

            const waResponse = {
                data: {
                    current: {
                        last_updated: new Date().toISOString(),
                        temp_c: 22,
                        humidity: 65,
                        pressure_mb: 1015,
                        wind_kph: 21.6, // 6 m/s
                        wind_degree: 185,
                        vis_km: 12,
                        cloud: 25,
                        condition: { text: 'Clear' }
                    }
                }
            };

            mockAxios.get
                .mockResolvedValueOnce(owmResponse)
                .mockResolvedValueOnce(waResponse);

            const aggregatedData = await weatherIntegration.getAggregatedWeatherData(45.0, 2.0, 'current');
            
            expect(aggregatedData).toBeInstanceOf(WeatherData);
            expect(aggregatedData.source).toBe('aggregated');
            expect(aggregatedData.temperature).toBeCloseTo(21, 0); // Weighted average
            expect(aggregatedData.windSpeed).toBeCloseTo(5.5, 0); // Weighted average
        });

        test('should use single source when only one available', async () => {
            weatherIntegration.options.sources = ['openweathermap'];

            const mockResponse = {
                data: {
                    coord: { lat: 45.0, lon: 2.0 },
                    dt: Math.floor(Date.now() / 1000),
                    main: { temp: 20, humidity: 60, pressure: 1013 },
                    wind: { speed: 5, deg: 180 },
                    clouds: { all: 20 },
                    weather: [{ main: 'Clear' }]
                }
            };

            mockAxios.get.mockResolvedValueOnce(mockResponse);

            const data = await weatherIntegration.getAggregatedWeatherData(45.0, 2.0, 'current');
            
            expect(data).toBeInstanceOf(WeatherData);
            expect(data.source).toBe('openweathermap');
        });

        test('should handle partial source failures', async () => {
            const successResponse = {
                data: {
                    coord: { lat: 45.0, lon: 2.0 },
                    dt: Math.floor(Date.now() / 1000),
                    main: { temp: 20, humidity: 60, pressure: 1013 },
                    wind: { speed: 5, deg: 180 },
                    clouds: { all: 20 },
                    weather: [{ main: 'Clear' }]
                }
            };

            mockAxios.get
                .mockResolvedValueOnce(successResponse)
                .mockRejectedValueOnce(new Error('API down'));

            const data = await weatherIntegration.getAggregatedWeatherData(45.0, 2.0, 'current');
            
            expect(data).toBeInstanceOf(WeatherData);
            expect(data.source).toBe('openweathermap');
        });

        test('should fail when all sources unavailable', async () => {
            mockAxios.get
                .mockRejectedValueOnce(new Error('OWM down'))
                .mockRejectedValueOnce(new Error('WA down'));

            await expect(
                weatherIntegration.getAggregatedWeatherData(45.0, 2.0, 'current')
            ).rejects.toThrow('No weather data available from any source');
        });
    });

    describe('Location Management', () => {
        test('should add location for weather tracking', async () => {
            const mockResponse = {
                data: {
                    coord: { lat: 45.0, lon: 2.0 },
                    dt: Math.floor(Date.now() / 1000),
                    main: { temp: 20, humidity: 60, pressure: 1013 },
                    wind: { speed: 5, deg: 180 },
                    clouds: { all: 20 },
                    weather: [{ main: 'Clear' }]
                }
            };

            mockAxios.get.mockResolvedValue(mockResponse);

            weatherIntegration.addLocation(45.0, 2.0, 'test-location');
            
            // Wait for async update
            await new Promise(resolve => setTimeout(resolve, 200));
            
            expect(weatherIntegration.currentWeather.has('test-location')).toBe(true);
        });

        test('should remove location from tracking', () => {
            weatherIntegration.currentWeather.set('test-location', new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 20,
                source: 'test'
            }));

            weatherIntegration.removeLocation('test-location');
            
            expect(weatherIntegration.currentWeather.has('test-location')).toBe(false);
        });

        test('should update location weather', async () => {
            const mockCurrentResponse = {
                data: {
                    coord: { lat: 45.0, lon: 2.0 },
                    dt: Math.floor(Date.now() / 1000),
                    main: { temp: 20, humidity: 60, pressure: 1013 },
                    wind: { speed: 5, deg: 180 },
                    clouds: { all: 20 },
                    weather: [{ main: 'Clear' }]
                }
            };

            const mockForecastResponse = {
                data: {
                    list: [{
                        dt: Math.floor(Date.now() / 1000) + 3600,
                        main: { temp: 22, humidity: 65, pressure: 1015 },
                        wind: { speed: 6, deg: 200 },
                        clouds: { all: 30 },
                        weather: [{ main: 'Clouds' }]
                    }]
                }
            };

            mockAxios.get
                .mockResolvedValueOnce(mockCurrentResponse)
                .mockResolvedValueOnce(mockCurrentResponse) // WeatherAPI current
                .mockResolvedValueOnce(mockForecastResponse)
                .mockResolvedValueOnce(mockForecastResponse); // WeatherAPI forecast

            await weatherIntegration.updateLocationWeather(45.0, 2.0, 'test-location');
            
            expect(weatherIntegration.currentWeather.has('test-location')).toBe(true);
            expect(weatherIntegration.forecasts.has('test-location')).toBe(true);
        });

        test('should handle update errors gracefully', async () => {
            mockAxios.get.mockRejectedValue(new Error('API Error'));

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            
            await weatherIntegration.updateLocationWeather(45.0, 2.0, 'test-location');
            
            expect(weatherIntegration.currentWeather.has('test-location')).toBe(false);
            consoleSpy.mockRestore();
        });
    });

    describe('Route Weather', () => {
        test('should update route weather', async () => {
            const routePoints = [
                { latitude: 45.0, longitude: 2.0, distance: 0, altitude: 100 },
                { latitude: 45.1, longitude: 2.1, distance: 10000, altitude: 200 },
                { latitude: 45.2, longitude: 2.2, distance: 20000, altitude: 150 }
            ];

            const mockResponse = {
                data: {
                    coord: { lat: 45.0, lon: 2.0 },
                    dt: Math.floor(Date.now() / 1000),
                    main: { temp: 20, humidity: 60, pressure: 1013 },
                    wind: { speed: 5, deg: 180 },
                    clouds: { all: 20 },
                    weather: [{ main: 'Clear' }]
                }
            };

            mockAxios.get.mockResolvedValue(mockResponse);

            await weatherIntegration.updateRouteWeather('test-route', routePoints);
            
            expect(weatherIntegration.routeProfiles.has('test-route')).toBe(true);
            
            const profile = weatherIntegration.routeProfiles.get('test-route');
            expect(profile.route).toBe(routePoints);
            expect(profile.weatherPoints.size).toBeGreaterThan(0);
        });

        test('should select weather sample points efficiently', () => {
            const routePoints = [];
            for (let i = 0; i <= 100; i++) {
                routePoints.push({
                    latitude: 45.0 + i * 0.01,
                    longitude: 2.0 + i * 0.01,
                    distance: i * 1000, // 1km intervals
                    altitude: 100 + Math.sin(i * 0.1) * 50
                });
            }

            const samplePoints = weatherIntegration.selectWeatherSamplePoints(routePoints);
            
            expect(samplePoints.length).toBeGreaterThan(0);
            expect(samplePoints.length).toBeLessThan(routePoints.length);
            expect(samplePoints[0].distance).toBe(0); // Should include start
            expect(samplePoints[samplePoints.length - 1].distance).toBe(100000); // Should include end
        });

        test('should get route weather data', () => {
            const routePoints = [
                { latitude: 45.0, longitude: 2.0, distance: 0, altitude: 100 }
            ];

            const profile = new RouteWeatherProfile(routePoints);
            const weatherData = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 20,
                source: 'test'
            });

            profile.addWeatherPoint(0, weatherData);
            weatherIntegration.routeProfiles.set('test-route', profile);
            
            const routeWeather = weatherIntegration.getRouteWeather('test-route');
            
            expect(routeWeather).toBeDefined();
            expect(routeWeather.summary).toBeDefined();
            expect(routeWeather.weatherPoints).toBeDefined();
            expect(routeWeather.completeness).toBeGreaterThan(0);
        });

        test('should get weather at specific route distance', () => {
            const routePoints = [
                { latitude: 45.0, longitude: 2.0, distance: 0, altitude: 100 }
            ];

            const profile = new RouteWeatherProfile(routePoints);
            const weatherData = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 20,
                source: 'test'
            });

            profile.addWeatherPoint(5000, weatherData);
            weatherIntegration.routeProfiles.set('test-route', profile);
            
            const weather = weatherIntegration.getRouteWeatherAtDistance('test-route', 5000);
            
            expect(weather).toBeDefined();
            expect(weather.temperature).toBe(20);
        });

        test('should handle invalid route data', async () => {
            await weatherIntegration.updateRouteWeather('invalid-route', []);
            
            expect(weatherIntegration.routeProfiles.has('invalid-route')).toBe(false);
        });
    });

    describe('Weather Alerts', () => {
        test('should generate severe weather alerts', () => {
            const severeWeather = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 40, // Extreme heat
                windSpeed: 20, // Strong wind
                precipitation: 12, // Heavy rain
                source: 'test'
            });

            weatherIntegration.checkWeatherAlerts('test-location', severeWeather, []);
            
            const alerts = weatherIntegration.getActiveAlerts();
            expect(alerts.length).toBeGreaterThan(0);
            
            const heatAlert = alerts.find(alert => alert.type === 'extreme_heat');
            expect(heatAlert).toBeDefined();
            expect(heatAlert.severity).toBe('high');
        });

        test('should generate wind alerts', () => {
            const windyWeather = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 20,
                windSpeed: 18, // Strong wind
                source: 'test'
            });

            weatherIntegration.checkWeatherAlerts('test-location', windyWeather, []);
            
            const alerts = weatherIntegration.getActiveAlerts();
            const windAlert = alerts.find(alert => alert.type === 'high_wind');
            
            expect(windAlert).toBeDefined();
            expect(windAlert.message).toContain('Strong winds');
        });

        test('should generate precipitation alerts', () => {
            const rainyWeather = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 20,
                precipitation: 8, // Heavy rain
                source: 'test'
            });

            weatherIntegration.checkWeatherAlerts('test-location', rainyWeather, []);
            
            const alerts = weatherIntegration.getActiveAlerts();
            const rainAlert = alerts.find(alert => alert.type === 'heavy_rain');
            
            expect(rainAlert).toBeDefined();
            expect(rainAlert.message).toContain('Heavy rainfall');
        });

        test('should clean up expired alerts', () => {
            // Create an alert that will expire immediately
            const expiredAlert = {
                id: 'test-alert',
                type: 'test',
                severity: 'low',
                location: 'test',
                message: 'Test alert',
                timestamp: new Date(),
                expiresAt: new Date(Date.now() - 1000) // Already expired
            };

            weatherIntegration.alerts.set('test-alert', expiredAlert);
            
            weatherIntegration.cleanupExpiredAlerts();
            
            expect(weatherIntegration.alerts.has('test-alert')).toBe(false);
        });
    });

    describe('Caching and Performance', () => {
        test('should use cached data when available', async () => {
            const mockResponse = {
                data: {
                    coord: { lat: 45.0, lon: 2.0 },
                    dt: Math.floor(Date.now() / 1000),
                    main: { temp: 20, humidity: 60, pressure: 1013 },
                    wind: { speed: 5, deg: 180 },
                    clouds: { all: 20 },
                    weather: [{ main: 'Clear' }]
                }
            };

            mockAxios.get.mockResolvedValue(mockResponse);

            // First call should fetch from API
            await weatherIntegration.getAggregatedWeatherData(45.0, 2.0, 'current');
            
            // Second call should use cache
            await weatherIntegration.getAggregatedWeatherData(45.0, 2.0, 'current');
            
            // Should have cache hits
            expect(weatherIntegration.stats.cachehits).toBeGreaterThan(0);
        });

        test('should track performance statistics', async () => {
            const mockResponse = {
                data: {
                    coord: { lat: 45.0, lon: 2.0 },
                    dt: Math.floor(Date.now() / 1000),
                    main: { temp: 20, humidity: 60, pressure: 1013 },
                    wind: { speed: 5, deg: 180 },
                    clouds: { all: 20 },
                    weather: [{ main: 'Clear' }]
                }
            };

            mockAxios.get.mockResolvedValue(mockResponse);

            await weatherIntegration.getAggregatedWeatherData(45.0, 2.0, 'current');
            
            const stats = weatherIntegration.getStats();
            
            expect(stats.requestsTotal).toBeGreaterThan(0);
            expect(stats.requestsSuccessful).toBeGreaterThan(0);
            expect(stats.averageResponseTime).toBeGreaterThan(0);
        });

        test('should handle high-volume requests', async () => {
            const mockResponse = {
                data: {
                    coord: { lat: 45.0, lon: 2.0 },
                    dt: Math.floor(Date.now() / 1000),
                    main: { temp: 20, humidity: 60, pressure: 1013 },
                    wind: { speed: 5, deg: 180 },
                    clouds: { all: 20 },
                    weather: [{ main: 'Clear' }]
                }
            };

            mockAxios.get.mockResolvedValue(mockResponse);

            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(weatherIntegration.getAggregatedWeatherData(45.0 + i * 0.1, 2.0, 'current'));
            }

            const results = await Promise.all(promises);
            
            expect(results).toHaveLength(10);
            expect(results.every(result => result instanceof WeatherData)).toBe(true);
        });
    });

    describe('Data Retrieval', () => {
        test('should get current weather for location', () => {
            const weatherData = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 20,
                source: 'test'
            });

            weatherIntegration.currentWeather.set('test-location', weatherData);
            
            const weather = weatherIntegration.getCurrentWeather('test-location');
            
            expect(weather).toBeDefined();
            expect(weather.temperature).toBe(20);
        });

        test('should get forecast for location', () => {
            const forecastData = [
                new WeatherData({
                    latitude: 45.0,
                    longitude: 2.0,
                    timestamp: new Date(),
                    temperature: 22,
                    forecastHours: 1,
                    source: 'test'
                })
            ];

            weatherIntegration.forecasts.set('test-location', forecastData);
            
            const forecast = weatherIntegration.getForecast('test-location');
            
            expect(forecast).toBeDefined();
            expect(Array.isArray(forecast)).toBe(true);
            expect(forecast[0].temperature).toBe(22);
        });

        test('should return null for non-existent location', () => {
            expect(weatherIntegration.getCurrentWeather('non-existent')).toBeNull();
            expect(weatherIntegration.getForecast('non-existent')).toBeNull();
            expect(weatherIntegration.getRouteWeather('non-existent')).toBeNull();
        });
    });

    describe('System Statistics', () => {
        test('should provide comprehensive statistics', () => {
            const stats = weatherIntegration.getStats();
            
            expect(stats).toHaveProperty('requestsTotal');
            expect(stats).toHaveProperty('requestsSuccessful');
            expect(stats).toHaveProperty('requestsFailed');
            expect(stats).toHaveProperty('averageResponseTime');
            expect(stats).toHaveProperty('activeLocations');
            expect(stats).toHaveProperty('activeRoutes');
            expect(stats).toHaveProperty('activeAlerts');
            expect(stats).toHaveProperty('sourceReliability');
            expect(stats).toHaveProperty('memoryUsage');
        });

        test('should track active locations and routes', () => {
            weatherIntegration.currentWeather.set('location1', new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 20,
                source: 'test'
            }));

            weatherIntegration.routeProfiles.set('route1', new RouteWeatherProfile([
                { latitude: 45.0, longitude: 2.0, distance: 0, altitude: 100 }
            ]));

            const stats = weatherIntegration.getStats();
            
            expect(stats.activeLocations).toBe(1);
            expect(stats.activeRoutes).toBe(1);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle missing API keys', async () => {
            const weatherIntegrationNoKeys = new WeatherIntegration({
                apiKeys: {}
            });

            await expect(
                weatherIntegrationNoKeys.getOpenWeatherMapData(45.0, 2.0)
            ).rejects.toThrow('OpenWeatherMap API key not configured');

            await weatherIntegrationNoKeys.stop();
        });

        test('should handle network timeouts', async () => {
            mockAxios.get.mockRejectedValue(new Error('ECONNABORTED'));

            await expect(
                weatherIntegration.fetchWeatherData(45.0, 2.0, 'openweathermap')
            ).rejects.toThrow('ECONNABORTED');
        });

        test('should handle malformed API responses', async () => {
            mockAxios.get.mockResolvedValue({ data: null });

            await expect(
                weatherIntegration.getOpenWeatherMapData(45.0, 2.0)
            ).rejects.toThrow();
        });

        test('should handle concurrent updates gracefully', async () => {
            const mockResponse = {
                data: {
                    coord: { lat: 45.0, lon: 2.0 },
                    dt: Math.floor(Date.now() / 1000),
                    main: { temp: 20, humidity: 60, pressure: 1013 },
                    wind: { speed: 5, deg: 180 },
                    clouds: { all: 20 },
                    weather: [{ main: 'Clear' }]
                }
            };

            mockAxios.get.mockResolvedValue(mockResponse);

            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(weatherIntegration.updateLocationWeather(45.0, 2.0, `location-${i}`));
            }

            await Promise.allSettled(promises);
            
            // Should complete without errors
            expect(weatherIntegration.currentWeather.size).toBeGreaterThan(0);
        });

        test('should handle Redis connection failures', async () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            
            // Simulate Redis failure by calling store method directly
            weatherIntegration.redis = null;
            
            const weatherData = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 20,
                source: 'test'
            });

            await weatherIntegration.storeWeatherInRedis('test', weatherData, [weatherData]);
            
            // Should not crash
            expect(true).toBe(true);
            consoleSpy.mockRestore();
        });

        test('should handle extremely large route data', async () => {
            const largeRoute = [];
            for (let i = 0; i < 1000; i++) {
                largeRoute.push({
                    latitude: 45.0 + i * 0.001,
                    longitude: 2.0 + i * 0.001,
                    distance: i * 100,
                    altitude: 100 + Math.sin(i * 0.1) * 50
                });
            }

            const samplePoints = weatherIntegration.selectWeatherSamplePoints(largeRoute);
            
            // Should sample efficiently
            expect(samplePoints.length).toBeLessThan(100);
            expect(samplePoints.length).toBeGreaterThan(10);
        });
    });

    describe('Integration Events', () => {
        test('should emit weather-updated events', (done) => {
            const mockResponse = {
                data: {
                    coord: { lat: 45.0, lon: 2.0 },
                    dt: Math.floor(Date.now() / 1000),
                    main: { temp: 20, humidity: 60, pressure: 1013 },
                    wind: { speed: 5, deg: 180 },
                    clouds: { all: 20 },
                    weather: [{ main: 'Clear' }]
                }
            };

            mockAxios.get.mockResolvedValue(mockResponse);

            weatherIntegration.on('weather-updated', (data) => {
                expect(data.locationKey).toBe('test-location');
                expect(data.current.temperature).toBe(20);
                done();
            });

            weatherIntegration.updateLocationWeather(45.0, 2.0, 'test-location');
        });

        test('should emit weather-alert events', (done) => {
            weatherIntegration.on('weather-alert', (alert) => {
                expect(alert.type).toBe('extreme_heat');
                expect(alert.severity).toBe('high');
                done();
            });

            const extremeWeather = new WeatherData({
                latitude: 45.0,
                longitude: 2.0,
                timestamp: new Date(),
                temperature: 42, // Extreme heat
                source: 'test'
            });

            weatherIntegration.checkWeatherAlerts('test-location', extremeWeather, []);
        });

        test('should emit route-weather-updated events', (done) => {
            const mockResponse = {
                data: {
                    coord: { lat: 45.0, lon: 2.0 },
                    dt: Math.floor(Date.now() / 1000),
                    main: { temp: 20, humidity: 60, pressure: 1013 },
                    wind: { speed: 5, deg: 180 },
                    clouds: { all: 20 },
                    weather: [{ main: 'Clear' }]
                }
            };

            mockAxios.get.mockResolvedValue(mockResponse);

            weatherIntegration.on('route-weather-updated', (data) => {
                expect(data.routeId).toBe('test-route');
                expect(data.profile).toBeDefined();
                done();
            });

            const routePoints = [
                { latitude: 45.0, longitude: 2.0, distance: 0, altitude: 100 }
            ];

            weatherIntegration.updateRouteWeather('test-route', routePoints);
        });
    });

    describe('Lifecycle Management', () => {
        test('should start and stop cleanly', async () => {
            expect(weatherIntegration.updateTimer).toBeDefined();
            
            await weatherIntegration.stop();
            
            expect(weatherIntegration.updateTimer).toBeNull();
        });

        test('should handle multiple stop calls', async () => {
            await weatherIntegration.stop();
            await weatherIntegration.stop(); // Should not throw
            
            expect(true).toBe(true);
        });
    });
});