const RiderCollectionScraper = require('./scrapers/RiderCollectionScraper');
const { logger } = require('./config/logger');

/**
 * Test the real rider scraping with a single team
 */
async function testRealScraper() {
  const scraper = new RiderCollectionScraper({
    delayBetweenRequests: 3000, // 3 seconds to be respectful
    timeout: 30000
  });
  
  try {
    logger.info('Testing real rider scraping with one team...');
    
    // Get one team from backend to test with
    const teams = await scraper.fetchAllTeamsFromBackend();
    if (teams.length === 0) {
      throw new Error('No teams found in database');
    }
    
    const testTeam = teams[0]; // Just test with first team
    logger.info(`Testing with team: ${testTeam.name}`);
    
    const result = await scraper.scrapeTeamRiders(testTeam, {
      includeDetailedProfiles: false
    });
    
    logger.info('Real rider scraping test completed!', {
      teamName: result.teamName,
      ridersFound: result.ridersFound,
      ridersCreated: result.ridersCreated,
      errors: result.errors.length
    });
    
    console.log('\n=== REAL RIDER SCRAPING TEST RESULTS ===');
    console.log(`Team: ${result.teamName}`);
    console.log(`Riders Found: ${result.ridersFound}`);
    console.log(`Riders Created: ${result.ridersCreated}`);
    console.log(`Errors: ${result.errors.length}`);
    
    if (result.riders.length > 0) {
      console.log('\n=== SAMPLE RIDERS ===');
      result.riders.slice(0, 3).forEach(rider => {
        console.log(`${rider.firstName} ${rider.lastName} (${rider.nationality}) - ${rider.specialization}`);
      });
    }
    
    if (result.errors.length > 0) {
      console.log('\n=== ERRORS ===');
      result.errors.forEach(error => {
        console.log(`${error.riderName}: ${error.error}`);
      });
    }
    
  } catch (error) {
    logger.error('Real rider scraping test failed', {
      error: error.message,
      stack: error.stack
    });
    
    console.error('\n=== TEST FAILED ===');
    console.error('Error:', error.message);
    
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testRealScraper()
    .then(() => {
      logger.info('Real rider scraping test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Real rider scraping test failed', { error: error.message });
      console.error('Test failed:', error.message);
      process.exit(1);
    });
}

module.exports = { testRealScraper };