#!/usr/bin/env node

/**
 * Simple test script for testing a sample of cycling team data scraping
 * This will test just 1-2 teams to verify the scraping system works
 */

const CyclingTeamDataScraper = require('./scrapers/CyclingTeamDataScraper');
const { logger } = require('./config/logger');

async function testSampleScraping() {
    logger.info('Starting sample scraping system test');

    try {
        const scraper = new CyclingTeamDataScraper();
        
        // Temporarily override team lists to test just a few teams
        scraper.teamCategories.worldTour = ['uae-team-emirates', 'team-jumbo-visma']; // Only test 2 teams
        
        const testResults = await scraper.populateDatabase({
            includeWorldTour: true,
            includeProTeams: false,
            includeContinental: false,
            includeHistory: false,
            includeStatistics: false,
            includeResults: false,
            includeRiderProfiles: false,
            maxRidersPerTeam: 3, // Only get 3 riders per team for speed
            saveToDatabase: true,
            historicalYears: [2024]
        });

        logger.info('Sample scraping test completed', {
            summary: testResults.summary,
            errorCount: testResults.errors.length,
            sampleErrors: testResults.errors.slice(0, 2).map(e => e.error)
        });

        // Verify data was saved
        const axios = require('axios');
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080/api/v1';
        
        try {
            const teamsResponse = await axios.get(`${backendUrl}/teams?size=10`);
            const ridersResponse = await axios.get(`${backendUrl}/riders?size=10`);

            logger.info('Database verification results', {
                teamsInDatabase: teamsResponse.data.totalElements || teamsResponse.data.content?.length || 0,
                ridersInDatabase: ridersResponse.data.totalElements || ridersResponse.data.content?.length || 0,
                sampleTeam: teamsResponse.data.content?.[0]?.name || 'None',
                sampleRider: ridersResponse.data.content?.[0] ? 
                    `${ridersResponse.data.content[0].firstName} ${ridersResponse.data.content[0].lastName}` : 'None'
            });

            if ((teamsResponse.data.totalElements > 0 || teamsResponse.data.content?.length > 0) &&
                (ridersResponse.data.totalElements > 0 || ridersResponse.data.content?.length > 0)) {
                logger.info('✅ Sample scraping test PASSED - Teams and riders successfully populated!');
                return true;
            } else {
                logger.warn('❌ Sample scraping test FAILED - No data was populated');
                return false;
            }

        } catch (apiError) {
            logger.error('Failed to verify data in backend', {
                error: apiError.message,
                status: apiError.response?.status
            });
            return false;
        }

    } catch (error) {
        logger.error('Sample scraping system test failed', {
            error: error.message,
            stack: error.stack
        });
        return false;
    }
}

// Run the test if this script is called directly
if (require.main === module) {
    testSampleScraping()
        .then((success) => {
            if (success) {
                logger.info('🎉 Sample scraping test completed successfully!');
                process.exit(0);
            } else {
                logger.error('💥 Sample scraping test failed');
                process.exit(1);
            }
        })
        .catch((error) => {
            logger.error('Unexpected error during sample testing', {
                error: error.message
            });
            process.exit(1);
        });
}

module.exports = { testSampleScraping };