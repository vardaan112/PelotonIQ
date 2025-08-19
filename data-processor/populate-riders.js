const RiderCollectionScraper = require('./scrapers/RiderCollectionScraper');
const { logger } = require('./config/logger');

/**
 * Populate database with realistic rider data for all teams
 */
async function populateRiders() {
  const scraper = new RiderCollectionScraper({
    delayBetweenRequests: 1000, // 1 second between requests
    timeout: 30000 // 30 second timeout
  });
  
  try {
    logger.info('Starting rider population process...');
    
    const results = await scraper.scrapeAllTeamRiders({
      includeDetailedProfiles: false, // Skip detailed scraping for speed
      rosterSize: null // Use dynamic roster sizes
    });
    
    logger.info('Rider population completed!', {
      teamsProcessed: results.teamsProcessed,
      ridersFound: results.ridersFound,
      ridersCreated: results.ridersCreated,
      ridersUpdated: results.ridersUpdated,
      errors: results.errors.length
    });
    
    // Log summary by team
    console.log('\n=== RIDER POPULATION SUMMARY ===');
    console.log(`Teams Processed: ${results.teamsProcessed}`);
    console.log(`Total Riders Found: ${results.ridersFound}`);
    console.log(`New Riders Created: ${results.ridersCreated}`);
    console.log(`Riders Updated: ${results.ridersUpdated}`);
    console.log(`Errors: ${results.errors.length}`);
    
    if (results.teamResults.length > 0) {
      console.log('\n=== TEAM BREAKDOWN ===');
      results.teamResults.forEach(team => {
        console.log(`${team.teamName}: ${team.ridersCreated} new, ${team.ridersUpdated} updated, ${team.errors.length} errors`);
      });
    }
    
    if (results.errors.length > 0) {
      console.log('\n=== ERRORS ===');
      results.errors.forEach(error => {
        console.log(`${error.teamName}: ${error.error}`);
      });
    }
    
    console.log('\n=== DATABASE POPULATED SUCCESSFULLY ===');
    
  } catch (error) {
    logger.error('Rider population failed', {
      error: error.message,
      stack: error.stack
    });
    
    console.error('\n=== RIDER POPULATION FAILED ===');
    console.error('Error:', error.message);
    
    process.exit(1);
  }
}

// Run the population if this script is executed directly
if (require.main === module) {
  populateRiders()
    .then(() => {
      logger.info('Rider population script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Rider population script failed', { error: error.message });
      console.error('Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { populateRiders };