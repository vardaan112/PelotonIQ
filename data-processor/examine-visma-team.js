const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

/**
 * Examine the Visma-lease a Bike team page structure
 */
async function examineVismaTeamPage() {
  try {
    console.log('=== EXAMINING VISMA-LEASE A BIKE TEAM PAGE STRUCTURE ===\n');
    
    const teamUrl = 'https://www.procyclingstats.com/team/team-visma-lease-a-bike-2025';
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
    const filename = '/tmp/visma_team_page.html';
    fs.writeFileSync(filename, response.data);
    console.log(`Full HTML saved to: ${filename}\n`);
    
    // Look for all tables first
    console.log('=== ALL TABLES ===');
    $('table').each((i, table) => {
      const $table = $(table);
      const tableClass = $table.attr('class') || 'no-class';
      console.log(`Table ${i + 1}: class="${tableClass}"`);
      
      if (tableClass.includes('teamlist')) {
        console.log('  *** TEAMLIST TABLE ***');
        // Show headers
        $table.find('tr:first-child th, tr:first-child td').each((j, cell) => {
          console.log(`    Header ${j + 1}: "${$(cell).text().trim()}"`);
        });
        // Show first 3 data rows
        $table.find('tr').slice(1, 4).each((j, row) => {
          const $row = $(row);
          const cells = [];
          $row.find('td, th').each((k, cell) => {
            cells.push($(cell).text().trim());
          });
          console.log(`    Row ${j + 1}: ${cells.join(' | ')}`);
        });
      }
    });
    
    // Look specifically for teamlist elements
    console.log('\n=== TEAMLIST ELEMENTS ===');
    $('[class*="teamlist"]').each((i, element) => {
      const $element = $(element);
      const tagName = element.tagName.toLowerCase();
      const className = $element.attr('class');
      console.log(`${i + 1}. ${tagName}.${className}`);
      
      if (tagName === 'table') {
        console.log('  Headers:');
        $element.find('thead th, tr:first-child th, tr:first-child td').each((j, cell) => {
          console.log(`    ${j + 1}. "${$(cell).text().trim()}"`);
        });
        
        console.log('  Sample data:');
        $element.find('tbody tr, tr').slice(1, 4).each((j, row) => {
          const cells = [];
          $(row).find('td, th').each((k, cell) => {
            cells.push($(cell).text().trim());
          });
          if (cells.length > 0) {
            console.log(`    ${cells.join(' | ')}`);
          }
        });
      } else if (tagName === 'ul') {
        console.log('  List items:');
        $element.find('li').slice(0, 5).each((j, li) => {
          console.log(`    ${j + 1}. "${$(li).text().trim().substring(0, 100)}"`);
        });
      }
      console.log('');
    });
    
    // Look for famous rider names
    console.log('=== RIDER NAMES SEARCH ===');
    const famousRiders = ['VINGEGAARD', 'VAN AERT', 'ROGLIC', 'LAPORTE'];
    famousRiders.forEach(name => {
      const found = $(`*:contains("${name}")`);
      if (found.length > 0) {
        console.log(`Found "${name}" in ${found.length} elements`);
      }
    });
    
    console.log('\n=== EXAMINATION COMPLETE ===');
    
  } catch (error) {
    console.error('Examination failed:', error.message);
  }
}

// Run the examination
examineVismaTeamPage()
  .then(() => {
    console.log('Visma team page examination completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Examination failed:', error);
    process.exit(1);
  });