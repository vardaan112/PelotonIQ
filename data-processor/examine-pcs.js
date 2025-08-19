const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

/**
 * Examine ProCyclingStats website structure to understand what we're working with
 */
async function examinePCS() {
  try {
    console.log('=== EXAMINING PROCYCLINGSTATS.COM ===\n');
    
    // Test different URLs to understand the site structure
    const testUrls = [
      'https://www.procyclingstats.com',
      'https://www.procyclingstats.com/teams.php',
      'https://www.procyclingstats.com/search.php?s=UAE',
      'https://www.procyclingstats.com/search.php?s=team',
      'https://www.procyclingstats.com/rankings/me/teams'
    ];
    
    for (let i = 0; i < testUrls.length; i++) {
      const url = testUrls[i];
      console.log(`\n=== ${i + 1}. Testing: ${url} ===`);
      
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          timeout: 10000
        });
        
        console.log(`Status: ${response.status}`);
        console.log(`Content-Type: ${response.headers['content-type']}`);
        console.log(`Content-Length: ${response.data.length} characters`);
        
        const $ = cheerio.load(response.data);
        
        // Look for team-related elements
        console.log('\nLooking for team-related elements:');
        const teamElements = $('a[href*="team"], .team, [class*="team"]');
        console.log(`Found ${teamElements.length} elements with "team" in them`);
        
        if (teamElements.length > 0) {
          console.log('Sample team elements:');
          teamElements.slice(0, 5).each((i, el) => {
            const $el = $(el);
            const href = $el.attr('href');
            const text = $el.text().trim();
            if (text && text.length > 2) {
              console.log(`  - "${text}" (${href})`);
            }
          });
        }
        
        // Look for any links
        console.log('\nAll links containing "team":');
        $('a').each((i, link) => {
          const $link = $(link);
          const href = $link.attr('href');
          const text = $link.text().trim();
          
          if (href && (href.includes('team') || text.toLowerCase().includes('team'))) {
            console.log(`  - "${text}" -> ${href}`);
          }
        });
        
        // Save the HTML for manual inspection
        const filename = `/tmp/pcs_page_${i + 1}.html`;
        fs.writeFileSync(filename, response.data);
        console.log(`\nSaved full HTML to: ${filename}`);
        
        // Wait between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`Error fetching ${url}:`, error.message);
      }
    }
    
    // Try to access a known team page directly
    console.log('\n\n=== TRYING DIRECT TEAM ACCESS ===');
    const directTeamUrls = [
      'https://www.procyclingstats.com/team/uae-team-emirates-2024',
      'https://www.procyclingstats.com/team/jumbo-visma-2024',
      'https://www.procyclingstats.com/team/ineos-grenadiers-2024'
    ];
    
    for (const url of directTeamUrls) {
      console.log(`\nTrying: ${url}`);
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          timeout: 10000
        });
        
        console.log(`✓ SUCCESS: Status ${response.status}`);
        
        const $ = cheerio.load(response.data);
        
        // Look for riders
        console.log('Looking for riders:');
        const riderElements = $('a[href*="rider"], .rider, [class*="rider"]');
        console.log(`Found ${riderElements.length} rider-related elements`);
        
        if (riderElements.length > 0) {
          console.log('Sample riders:');
          riderElements.slice(0, 10).each((i, el) => {
            const $el = $(el);
            const href = $el.attr('href');
            const text = $el.text().trim();
            if (text && text.length > 2 && text.length < 50) {
              console.log(`  - "${text}" (${href})`);
            }
          });
        }
        
        // Look for any table data
        console.log('\nLooking for tables:');
        $('table').each((i, table) => {
          const $table = $(table);
          const tableText = $table.text().toLowerCase();
          
          if (tableText.includes('rider') || tableText.includes('name')) {
            console.log(`Table ${i + 1} seems to contain rider data`);
            
            $table.find('tr').slice(0, 3).each((j, row) => {
              const $row = $(row);
              const cellTexts = [];
              $row.find('td, th').each((k, cell) => {
                const cellText = $(cell).text().trim();
                if (cellText && cellText.length < 30) {
                  cellTexts.push(cellText);
                }
              });
              if (cellTexts.length > 0) {
                console.log(`  Row ${j + 1}: ${cellTexts.join(' | ')}`);
              }
            });
          }
        });
        
        break; // Found a working team page
        
      } catch (error) {
        console.log(`✗ FAILED: ${error.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
  } catch (error) {
    console.error('Examination failed:', error);
  }
}

// Run the examination
examinePCS()
  .then(() => {
    console.log('\n=== EXAMINATION COMPLETE ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('Examination failed:', error);
    process.exit(1);
  });