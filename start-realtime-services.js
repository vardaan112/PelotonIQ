#!/usr/bin/env node

/**
 * Start Real-time Services for PelotonIQ Testing
 */

const WebSocketManager = require('./realtime/WebSocketManager');
const { PositionTracker } = require('./realtime/PositionTracker');
const { WeatherIntegration } = require('./realtime/WeatherIntegration');
const { TacticalEventDetector } = require('./realtime/TacticalEventDetector');
const { KafkaEventStreaming } = require('./realtime/KafkaEventStreaming');

console.log('🚴‍♂️ Starting PelotonIQ Real-time Services...\n');

async function startServices() {
    try {
        // 1. Start WebSocket Manager
        console.log('📡 Starting WebSocket Manager...');
        const wsManager = new WebSocketManager({
            port: 8081,
            enableAuth: false, // Disable for testing
            enableRateLimit: false
        });
        
        await wsManager.start();
        console.log('✅ WebSocket Manager started on port 8081\n');

        // 2. Initialize Position Tracker
        console.log('📍 Initializing Position Tracker...');
        const positionTracker = new PositionTracker({
            updateInterval: 1000,
            maxPositionHistory: 100
        });
        console.log('✅ Position Tracker initialized\n');

        // 3. Initialize Weather Integration
        console.log('🌤️ Initializing Weather Integration...');
        const weatherIntegration = new WeatherIntegration({
            sources: {
                openweather: { enabled: false }, // Disable API calls for testing
                weatherapi: { enabled: false }
            },
            cacheEnabled: true,
            updateInterval: 30000
        });
        console.log('✅ Weather Integration initialized\n');

        // 4. Initialize Tactical Event Detector
        console.log('🎯 Initializing Tactical Event Detector...');
        const tacticalDetector = new TacticalEventDetector({
            patternMatchingEnabled: true,
            correlationWindowMs: 60000,
            confidenceThreshold: 0.7
        });
        console.log('✅ Tactical Event Detector initialized\n');

        // 5. Try to start Kafka (optional - may fail if Kafka not running)
        console.log('📨 Attempting to start Kafka Event Streaming...');
        try {
            const kafkaStreaming = new KafkaEventStreaming({
                brokers: ['localhost:9092'],
                clientId: 'pelotoniq-test',
                groupId: 'pelotoniq-test-group'
            });
            
            // Set a timeout for Kafka connection
            const kafkaPromise = kafkaStreaming.start();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Kafka connection timeout')), 5000)
            );
            
            await Promise.race([kafkaPromise, timeoutPromise]);
            console.log('✅ Kafka Event Streaming started\n');
            
        } catch (error) {
            console.log('⚠️ Kafka not available (optional):', error.message);
            console.log('   Real-time services will work without Kafka\n');
        }

        // Setup inter-service connections
        console.log('🔗 Setting up service connections...');
        
        // Connect Position Tracker to WebSocket Manager
        positionTracker.on('position-update', (data) => {
            wsManager.broadcastToRace(data.raceId, 'position-update', data);
        });
        
        positionTracker.on('group-formation', (data) => {
            wsManager.broadcastToRace(data.raceId, 'group-formation', data);
        });

        // Connect Weather Integration to WebSocket Manager
        weatherIntegration.on('weather-update', (data) => {
            wsManager.broadcast('weather-update', data);
        });
        
        weatherIntegration.on('weather-alert', (data) => {
            wsManager.broadcast('weather-alert', data);
        });

        // Connect Tactical Detector to WebSocket Manager
        tacticalDetector.on('tactical-event', (data) => {
            wsManager.broadcastToRace(data.raceId, 'tactical-event', data);
        });

        console.log('✅ Service connections established\n');

        // Simulate some test data
        console.log('🎬 Starting simulation with test data...');
        await simulateRaceData(positionTracker, weatherIntegration, tacticalDetector);

        console.log('🎉 All Real-time Services Started Successfully!');
        console.log('\n📋 Service Status:');
        console.log('   • WebSocket Server: ws://localhost:8081');
        console.log('   • Position Tracker: Active');
        console.log('   • Weather Integration: Active'); 
        console.log('   • Tactical Detector: Active');
        console.log('\n🌐 Application URLs:');
        console.log('   • Frontend: http://localhost:3000');
        console.log('   • Backend API: http://localhost:8080');
        console.log('   • WebSocket: ws://localhost:8081');
        
        // Keep services running
        console.log('\n⏰ Services will continue running...');
        console.log('Press Ctrl+C to stop all services');
        
    } catch (error) {
        console.error('❌ Error starting real-time services:', error.message);
        process.exit(1);
    }
}

async function simulateRaceData(positionTracker, weatherIntegration, tacticalDetector) {
    const raceId = 'tour-de-france-2024-stage-1';
    
    // Simulate position updates
    console.log('📍 Simulating position updates...');
    const riders = [
        { id: 'rider-1', name: 'Tadej Pogačar', team: 'UAE Team Emirates' },
        { id: 'rider-2', name: 'Jonas Vingegaard', team: 'Visma-Lease a Bike' },
        { id: 'rider-3', name: 'Remco Evenepoel', team: 'Soudal Quick-Step' }
    ];
    
    let simulationStep = 0;
    const simulationInterval = setInterval(() => {
        riders.forEach((rider, index) => {
            const position = {
                riderId: rider.id,
                raceId: raceId,
                timestamp: new Date(),
                coordinates: {
                    lat: 43.6047 + (simulationStep * 0.001) + (index * 0.0001),
                    lng: 1.4442 + (simulationStep * 0.001) + (index * 0.0001)
                },
                speed: 45 + Math.random() * 10,
                altitude: 200 + Math.random() * 50,
                power: 350 + Math.random() * 100,
                heartRate: 160 + Math.random() * 20,
                cadence: 90 + Math.random() * 10
            };
            
            positionTracker.updateRiderPosition(position);
        });
        
        simulationStep++;
        
        // Stop simulation after 30 steps
        if (simulationStep >= 30) {
            clearInterval(simulationInterval);
            console.log('✅ Position simulation complete');
        }
    }, 2000);
    
    // Simulate weather data
    console.log('🌤️ Simulating weather updates...');
    setTimeout(() => {
        const weatherData = {
            raceId: raceId,
            location: { lat: 43.6047, lng: 1.4442 },
            temperature: 24,
            windSpeed: 15,
            windDirection: 180,
            humidity: 65,
            pressure: 1013,
            conditions: 'partly_cloudy',
            visibility: 10,
            timestamp: new Date()
        };
        
        weatherIntegration.processWeatherUpdate('simulation', weatherData);
        console.log('✅ Weather simulation sent');
    }, 3000);
    
    // Simulate tactical events
    console.log('🎯 Simulating tactical events...');
    setTimeout(() => {
        const tacticalEvent = {
            eventType: 'attack',
            raceId: raceId,
            riderId: 'rider-1',
            position: { lat: 43.6047, lng: 1.4442 },
            timestamp: new Date(),
            confidence: 0.85,
            metadata: {
                attackStrength: 'strong',
                groupSize: 1,
                timeGap: 5
            }
        };
        
        tacticalDetector.emit('tactical-event', tacticalEvent);
        console.log('✅ Tactical event simulation sent');
    }, 5000);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down real-time services...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down real-time services...');
    process.exit(0);
});

// Start services
startServices().catch(console.error);