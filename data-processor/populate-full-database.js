#!/usr/bin/env node

/**
 * Full database population script for PelotonIQ
 * This will populate the database with all WorldTour teams and their riders
 */

const CyclingTeamDataScraper = require('./scrapers/CyclingTeamDataScraper');
const { logger } = require('./config/logger');

async function populateFullDatabase() {
    logger.info('Starting FULL database population for PelotonIQ');

    try {
        const scraper = new CyclingTeamDataScraper();
        
        // Full population with all teams
        const results = await scraper.populateDatabase({
            includeWorldTour: true,
            includeProTeams: true,
            includeContinental: false, // Skip continental for faster initial load
            includeHistory: false,
            includeStatistics: false,
            includeResults: false,
            includeRiderProfiles: false,
            maxRidersPerTeam: 10, // Get up to 10 riders per team
            saveToDatabase: true,
            historicalYears: [2024]
        });

        logger.info('🎉 FULL database population completed!', {
            summary: results.summary,
            errorCount: results.errors.length,
            duration: results.summary.duration
        });

        // Verify final results
        const axios = require('axios');
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080/api/v1';
        
        try {
            const teamsResponse = await axios.get(`${backendUrl}/teams?size=100`);
            const ridersResponse = await axios.get(`${backendUrl}/riders?size=100`);

            logger.info('🏆 Final database statistics', {
                totalTeams: teamsResponse.data.totalElements || teamsResponse.data.content?.length || 0,
                totalRiders: ridersResponse.data.totalElements || ridersResponse.data.content?.length || 0,
                teamSample: teamsResponse.data.content?.slice(0, 3).map(t => t.name) || [],
                riderSample: ridersResponse.data.content?.slice(0, 3).map(r => 
                    `${r.firstName} ${r.lastName} (${r.team})`
                ) || []
            });

            logger.info('✅ PelotonIQ database successfully populated with cycling teams and riders!');
            return true;

        } catch (apiError) {
            logger.error('Failed to verify final database state', {
                error: apiError.message
            });
            return false;
        }

    } catch (error) {
        logger.error('Full database population failed', {
            error: error.message,
            stack: error.stack
        });
        return false;
    }
}

// Run the full population
if (require.main === module) {
    populateFullDatabase()
        .then((success) => {
            if (success) {
                logger.info('🚀 PelotonIQ is ready with full team and rider data!');
                process.exit(0);
            } else {
                logger.error('❌ Database population failed');
                process.exit(1);
            }
        })
        .catch((error) => {
            logger.error('Unexpected error during database population', {
                error: error.message
            });
            process.exit(1);
        });
}

module.exports = { populateFullDatabase };