const RiderCollectionScraper = require('./scrapers/RiderCollectionScraper');
const { logger } = require('./config/logger');

/**
 * Test what teams are available on ProCyclingStats
 */
async function testPCSTeams() {
  const scraper = new RiderCollectionScraper({
    delayBetweenRequests: 3000,
    timeout: 30000
  });
  
  try {
    logger.info('Testing ProCyclingStats team search...');
    
    // Test with well-known team names
    const knownTeams = [
      'AG2R Citroen Team',
      'Jumbo-Visma', 
      'INEOS Grenadiers',
      'UAE Team Emirates',
      'Team DSM',
      'Quick-Step Alpha Vinyl'
    ];
    
    for (const teamName of knownTeams) {
      try {
        console.log(`\n=== Testing: ${teamName} ===`);
        
        const searchUrl = `${scraper.teamRosterScraper.baseUrl}/search.php?s=${encodeURIComponent(teamName)}`;
        console.log(`Search URL: ${searchUrl}`);
        
        const $ = await scraper.teamRosterScraper.scrapePage(searchUrl);
        
        console.log('Team links found:');
        const teamLinks = [];
        $('a[href*="/team/"]').each((i, link) => {
          const $link = $(link);
          const href = $link.attr('href');
          const text = $link.text().trim();
          
          if (text && text.length > 3) {
            teamLinks.push({ href, text });
            console.log(`  - ${text} (${href})`);
          }
        });
        
        if (teamLinks.length === 0) {
          console.log('  No team links found');
        }
        
        // Wait between requests
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (error) {
        console.error(`  Error testing ${teamName}: ${error.message}`);
      }
    }
    
  } catch (error) {
    logger.error('ProCyclingStats team test failed', {
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
  testPCSTeams()
    .then(() => {
      logger.info('ProCyclingStats team test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('ProCyclingStats team test failed', { error: error.message });
      console.error('Test failed:', error.message);
      process.exit(1);
    });
}

module.exports = { testPCSTeams };