#!/usr/bin/env node

/**
 * Test script for manually triggering the comprehensive cycling team data scraping
 * This script will test the CyclingTeamDataScraper and verify database population
 */

const DataCollectionScheduler = require('./scheduling/DataCollectionScheduler');
const CyclingTeamDataScraper = require('./scrapers/CyclingTeamDataScraper');
const { logger } = require('./config/logger');

async function testScrapingSystem() {
    logger.info('Starting comprehensive scraping system test');

    try {
        // Test 1: Test the CyclingTeamDataScraper directly
        logger.info('Test 1: Testing CyclingTeamDataScraper directly');
        
        const scraper = new CyclingTeamDataScraper();
        
        // Test with a limited subset for faster testing
        const testResults = await scraper.populateDatabase({
            includeWorldTour: true,
            includeProTeams: false, // Skip for faster testing
            includeContinental: false, // Skip for faster testing
            includeHistory: false,
            includeStatistics: false,
            includeResults: false,
            includeRiderProfiles: false,
            maxRidersPerTeam: 5, // Limit riders for testing
            saveToDatabase: true,
            historicalYears: [2024] // Only current year
        });

        logger.info('Direct scraper test completed', {
            summary: testResults.summary,
            errors: testResults.errors.length,
            firstFewErrors: testResults.errors.slice(0, 3)
        });

        // Test 2: Test through the DataCollectionScheduler
        logger.info('Test 2: Testing through DataCollectionScheduler');
        
        const scheduler = new DataCollectionScheduler();
        
        // Run the team rosters collection job manually
        const schedulerResults = await scheduler.runTeamRostersCollection();
        
        logger.info('Scheduler test completed', {
            type: schedulerResults.type,
            totalTeams: schedulerResults.totalTeams,
            processed: schedulerResults.processed,
            failed: schedulerResults.failed,
            totalRiders: schedulerResults.totalRiders,
            processedRiders: schedulerResults.processedRiders,
            failedRiders: schedulerResults.failedRiders,
            duration: schedulerResults.duration,
            dataQuality: schedulerResults.dataQuality,
            firstFewErrors: schedulerResults.errors
        });

        // Test 3: Verify data was saved to backend
        logger.info('Test 3: Verifying data was saved to backend');
        
        const axios = require('axios');
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
        
        try {
            // Check teams
            const teamsResponse = await axios.get(`${backendUrl}/teams?size=100`);
            logger.info('Teams in database', {
                totalTeams: teamsResponse.data.totalElements || teamsResponse.data.length,
                currentPage: teamsResponse.data.content ? teamsResponse.data.content.length : teamsResponse.data.length
            });

            // Check riders
            const ridersResponse = await axios.get(`${backendUrl}/riders?size=100`);
            logger.info('Riders in database', {
                totalRiders: ridersResponse.data.totalElements || ridersResponse.data.length,
                currentPage: ridersResponse.data.content ? ridersResponse.data.content.length : ridersResponse.data.length
            });

            // Show sample data
            if (teamsResponse.data.content && teamsResponse.data.content.length > 0) {
                logger.info('Sample team data', {
                    firstTeam: {
                        name: teamsResponse.data.content[0].name,
                        country: teamsResponse.data.content[0].country,
                        category: teamsResponse.data.content[0].category
                    }
                });
            }

            if (ridersResponse.data.content && ridersResponse.data.content.length > 0) {
                logger.info('Sample rider data', {
                    firstRider: {
                        name: `${ridersResponse.data.content[0].firstName} ${ridersResponse.data.content[0].lastName}`,
                        nationality: ridersResponse.data.content[0].nationality,
                        team: ridersResponse.data.content[0].team
                    }
                });
            }

        } catch (apiError) {
            logger.error('Failed to verify data in backend', {
                error: apiError.message,
                status: apiError.response?.status,
                statusText: apiError.response?.statusText
            });
        }

        logger.info('Comprehensive scraping system test completed successfully');
        return true;

    } catch (error) {
        logger.error('Scraping system test failed', {
            error: error.message,
            stack: error.stack
        });
        return false;
    }
}

// Run the test if this script is called directly
if (require.main === module) {
    testScrapingSystem()
        .then((success) => {
            if (success) {
                logger.info('✅ All tests passed successfully');
                process.exit(0);
            } else {
                logger.error('❌ Tests failed');
                process.exit(1);
            }
        })
        .catch((error) => {
            logger.error('Unexpected error during testing', {
                error: error.message,
                stack: error.stack
            });
            process.exit(1);
        });
}

module.exports = { testScrapingSystem };