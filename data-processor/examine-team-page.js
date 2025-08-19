const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

/**
 * Examine a specific team page to understand rider structure
 */
async function examineTeamPage() {
  try {
    console.log('=== EXAMINING TEAM PAGE STRUCTURE ===\n');
    
    const teamUrl = 'https://www.procyclingstats.com/team/uae-team-emirates-xrg-2025';
    console.log(`Examining: ${teamUrl}\n`);
    
    const response = await axios.get(teamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });
    
    console.log(`Status: ${response.status}`);
    console.log(`Content-Length: ${response.data.length} characters\n`);
    
    const $ = cheerio.load(response.data);
    
    // Save the full HTML for inspection
    const filename = '/tmp/uae_team_page.html';
    fs.writeFileSync(filename, response.data);
    console.log(`Full HTML saved to: ${filename}\n`);
    
    // Look for rider-related elements
    console.log('=== RIDER ANALYSIS ===');
    
    // Check for links to riders
    console.log('1. Rider links:');
    const riderLinks = [];
    $('a[href*="/rider/"]').each((i, link) => {
      const $link = $(link);
      const href = $link.attr('href');
      const text = $link.text().trim();
      
      if (text && text.length > 2 && text.length < 50) {
        riderLinks.push({ text, href });
        if (riderLinks.length <= 10) {
          console.log(`  - "${text}" -> ${href}`);
        }
      }
    });
    console.log(`Total rider links found: ${riderLinks.length}\n`);
    
    // Look for tables that might contain rider data
    console.log('2. Tables analysis:');
    $('table').each((i, table) => {
      const $table = $(table);
      const tableId = $table.attr('id') || 'no-id';
      const tableClass = $table.attr('class') || 'no-class';
      
      console.log(`Table ${i + 1}: id="${tableId}", class="${tableClass}"`);
      
      // Check if this table contains rider data
      const tableText = $table.text().toLowerCase();
      const hasRiderData = tableText.includes('rider') || 
                          tableText.includes('name') || 
                          tableText.includes('age') ||
                          tableText.includes('nationality');
      
      if (hasRiderData) {
        console.log('  *** This table appears to contain rider data ***');
        
        // Extract headers
        console.log('  Headers:');
        $table.find('thead tr th, thead tr td, tr:first-child th, tr:first-child td').each((j, cell) => {
          const cellText = $(cell).text().trim();
          if (cellText && cellText.length < 30) {
            console.log(`    ${j + 1}. "${cellText}"`);
          }
        });
        
        // Extract first few data rows
        console.log('  Sample data rows:');
        $table.find('tbody tr, tr').slice(1, 6).each((j, row) => {
          const $row = $(row);
          const cellTexts = [];
          $row.find('td, th').each((k, cell) => {
            const cellText = $(cell).text().trim();
            if (cellText && cellText.length < 50) {
              cellTexts.push(cellText);
            }
          });
          
          if (cellTexts.length > 0) {
            console.log(`    Row ${j + 1}: ${cellTexts.join(' | ')}`);
            
            // Check for rider links in this row
            $row.find('a[href*="/rider/"]').each((k, link) => {
              const riderHref = $(link).attr('href');
              const riderText = $(link).text().trim();
              console.log(`      -> Rider link: "${riderText}" (${riderHref})`);
            });
          }
        });
      }
      console.log('');
    });
    
    // Look for any rider-specific classes or IDs
    console.log('3. Rider-specific elements:');
    const riderSelectors = [
      '[class*="rider"]',
      '[id*="rider"]',
      '.roster',
      '.team-roster',
      '.lineup',
      '.riders-list'
    ];
    
    riderSelectors.forEach(selector => {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`Found ${elements.length} elements matching "${selector}"`);
        elements.slice(0, 3).each((i, el) => {
          const $el = $(el);
          const text = $el.text().trim().substring(0, 100);
          console.log(`  - ${text}...`);
        });
      }
    });
    
    // Extract any structured data
    console.log('\n4. Structured data search:');
    $('script[type="application/ld+json"]').each((i, script) => {
      const content = $(script).html();
      if (content) {
        console.log(`Found JSON-LD data: ${content.substring(0, 200)}...`);
      }
    });
    
    console.log('\n=== EXAMINATION COMPLETE ===');
    
  } catch (error) {
    console.error('Examination failed:', error.message);
  }
}

// Run the examination
examineTeamPage()
  .then(() => {
    console.log('Team page examination completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Examination failed:', error);
    process.exit(1);
  });