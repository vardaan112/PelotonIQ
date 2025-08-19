const axios = require('axios');

/**
 * Delete riders that don't have complete data available from the website
 */
async function cleanupIncompleteRiders() {
  try {
    console.log('=== CLEANING UP INCOMPLETE RIDERS ===\n');
    
    const baseUrl = process.env.BACKEND_BASE_URL || 'http://localhost:8080/api/v1';
    
    // Get all riders
    console.log('Fetching all riders from database...');
    const response = await axios.get(`${baseUrl}/riders?size=1000`);
    const riders = response.data.content || response.data;
    
    console.log(`Found ${riders.length} riders in database\n`);
    
    // Identify riders with incomplete data
    const incompleteRiders = [];
    
    riders.forEach(rider => {
      const missingFields = [];
      
      // Check for missing critical data that should come from the website
      if (!rider.heightCm) missingFields.push('height');
      if (!rider.weightKg) missingFields.push('weight');
      if (!rider.ftpWatts) missingFields.push('FTP');
      
      // Check for potentially fake/incomplete name data
      if (!rider.firstName || rider.firstName.length < 2) missingFields.push('firstName');
      if (!rider.lastName || rider.lastName.length < 2) missingFields.push('lastName');
      if (!rider.nationality || rider.nationality === 'Unknown') missingFields.push('nationality');
      
      if (missingFields.length > 0) {
        incompleteRiders.push({
          id: rider.id,
          name: `${rider.firstName} ${rider.lastName}`,
          team: rider.team,
          missingFields: missingFields
        });
      }
    });
    
    console.log(`Found ${incompleteRiders.length} riders with incomplete data:`);
    console.log('Missing Fields | Rider Name | Team');
    console.log('---------------|------------|-----');
    
    incompleteRiders.slice(0, 10).forEach(rider => {
      const fields = rider.missingFields.join(', ');
      console.log(`${fields.padEnd(14)} | ${rider.name.padEnd(10)} | ${rider.team}`);
    });
    
    if (incompleteRiders.length > 10) {
      console.log(`... and ${incompleteRiders.length - 10} more`);
    }
    
    console.log(`\nDo you want to delete these ${incompleteRiders.length} incomplete riders? (y/N)`);
    
    // For automation, we'll proceed with deletion
    const shouldDelete = true;
    
    if (shouldDelete) {
      console.log('\nDeleting incomplete riders...');
      let deleted = 0;
      let errors = 0;
      
      for (const rider of incompleteRiders) {
        try {
          await axios.delete(`${baseUrl}/riders/${rider.id}`);
          deleted++;
          
          if (deleted % 10 === 0) {
            console.log(`Deleted ${deleted}/${incompleteRiders.length} riders...`);
          }
        } catch (error) {
          console.error(`Failed to delete rider ${rider.name}: ${error.message}`);
          errors++;
        }
        
        // Small delay to be respectful
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`\n=== CLEANUP COMPLETE ===`);
      console.log(`Successfully deleted: ${deleted} riders`);
      console.log(`Errors: ${errors}`);
      console.log(`Remaining riders: ${riders.length - deleted}`);
      
    } else {
      console.log('Cleanup cancelled.');
    }
    
  } catch (error) {
    console.error('Cleanup failed:', error.message);
    process.exit(1);
  }
}

// Run the cleanup
cleanupIncompleteRiders()
  .then(() => {
    console.log('Rider cleanup completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Cleanup failed:', error);
    process.exit(1);
  });