const axios = require('axios');

/**
 * Delete riders that have NULL FTP (auto-generated all-rounders without real data)
 */
async function deleteNullFTPRiders() {
  try {
    console.log('=== DELETING RIDERS WITH NULL FTP ===\n');
    
    const baseUrl = process.env.BACKEND_BASE_URL || 'http://localhost:8080/api/v1';
    
    // Get all riders
    console.log('Fetching all riders from database...');
    const response = await axios.get(`${baseUrl}/riders?size=1000`);
    const riders = response.data.content || response.data;
    
    console.log(`Found ${riders.length} riders in database\n`);
    
    // Find riders with NULL FTP
    const nullFTPRiders = riders.filter(rider => 
      rider.ftpWatts === null || rider.ftpWatts === undefined
    );
    
    console.log(`Found ${nullFTPRiders.length} riders with NULL FTP:`);
    console.log('ID | Name | Team | Specialization');
    console.log('---|------|------|----------------');
    
    nullFTPRiders.slice(0, 10).forEach(rider => {
      console.log(`${rider.id.toString().padEnd(3)} | ${(rider.firstName + ' ' + rider.lastName).padEnd(20)} | ${rider.team?.padEnd(15) || 'N/A'.padEnd(15)} | ${rider.specialization}`);
    });
    
    if (nullFTPRiders.length > 10) {
      console.log(`... and ${nullFTPRiders.length - 10} more`);
    }
    
    if (nullFTPRiders.length > 0) {
      console.log(`\nDeleting ${nullFTPRiders.length} riders with NULL FTP...`);
      let deleted = 0;
      let errors = 0;
      
      for (const rider of nullFTPRiders) {
        try {
          await axios.delete(`${baseUrl}/riders/${rider.id}`);
          deleted++;
          
          if (deleted % 10 === 0) {
            console.log(`Deleted ${deleted}/${nullFTPRiders.length} riders...`);
          }
        } catch (error) {
          console.error(`Failed to delete rider ${rider.firstName} ${rider.lastName}: ${error.message}`);
          errors++;
        }
        
        // Small delay to be respectful
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`\n=== DELETION COMPLETE ===`);
      console.log(`Successfully deleted: ${deleted} riders`);
      console.log(`Errors: ${errors}`);
      console.log(`Remaining riders: ${riders.length - deleted}`);
    } else {
      console.log('No riders with NULL FTP found.');
    }
    
  } catch (error) {
    console.error('Deletion failed:', error.message);
    process.exit(1);
  }
}

// Run the deletion
deleteNullFTPRiders()
  .then(() => {
    console.log('NULL FTP rider deletion completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Deletion failed:', error);
    process.exit(1);
  });