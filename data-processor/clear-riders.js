const axios = require('axios');
const { logger } = require('./config/logger');

/**
 * Clear all existing riders from the database before repopulating with real data
 */
async function clearRiders() {
  const baseUrl = process.env.BACKEND_BASE_URL || 'http://localhost:8080/api/v1';
  
  try {
    logger.info('Starting to clear existing riders...');
    
    // Get all riders first
    const ridersResponse = await axios.get(`${baseUrl}/riders?size=1000`);
    const riders = ridersResponse.data.content || [];
    
    logger.info(`Found ${riders.length} riders to delete`);
    
    // Delete each rider
    let deletedCount = 0;
    for (const rider of riders) {
      try {
        await axios.delete(`${baseUrl}/riders/${rider.id}`);
        deletedCount++;
        
        if (deletedCount % 50 === 0) {
          logger.info(`Deleted ${deletedCount}/${riders.length} riders...`);
        }
      } catch (error) {
        logger.warn(`Failed to delete rider ${rider.id}: ${error.message}`);
      }
    }
    
    logger.info(`Successfully deleted ${deletedCount} riders`);
    console.log(`\n=== CLEARED ${deletedCount} RIDERS ===`);
    
  } catch (error) {
    logger.error('Failed to clear riders', {
      error: error.message,
      stack: error.stack
    });
    
    console.error('\n=== FAILED TO CLEAR RIDERS ===');
    console.error('Error:', error.message);
    
    process.exit(1);
  }
}

// Run the clearing if this script is executed directly
if (require.main === module) {
  clearRiders()
    .then(() => {
      logger.info('Rider clearing completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Rider clearing failed', { error: error.message });
      console.error('Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { clearRiders };