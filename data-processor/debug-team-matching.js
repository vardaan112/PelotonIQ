const RiderCollectionScraper = require('./scrapers/RiderCollectionScraper');

/**
 * Debug the team matching process
 */
async function debugTeamMatching() {
  try {
    console.log('=== DEBUGGING TEAM MATCHING ===\n');
    
    const scraper = new RiderCollectionScraper();
    
    // Test team from our database
    const testTeam = {
      id: 11,
      name: 'Team ag2r-citroen-team',
      country: 'France',
      category: 'WORLD_TOUR'
    };
    
    console.log(`Testing team matching for: "${testTeam.name}"\n`);
    
    // Get list of all teams from ProCyclingStats
    const teamsListUrl = `${scraper.teamRosterScraper.baseUrl}/teams.php`;
    const $ = await scraper.teamRosterScraper.scrapePage(teamsListUrl);
    
    // Look for team links - updated selector
    const teamLinks = [];
    $('a[href*="team/"]').each((i, link) => {
      const $link = $(link);
      const href = $link.attr('href');
      const text = $link.text().trim();
      
      if (text && href && href.includes('2025')) { // Focus on 2025 teams
        const score = scraper.calculateTeamNameSimilarity(testTeam.name.toLowerCase(), text.toLowerCase());
        teamLinks.push({
          url: href,
          text: text,
          score: score
        });
      }
    });
    
    // Sort by similarity score
    teamLinks.sort((a, b) => b.score - a.score);
    
    console.log(`Found ${teamLinks.length} team links on ProCyclingStats\n`);
    console.log('Top 10 matches for "Team ag2r-citroen-team":');
    console.log('Score | Team Name');
    console.log('------|----------');
    
    teamLinks.slice(0, 10).forEach(team => {
      console.log(`${team.score.toFixed(3)} | ${team.text}`);
    });
    
    console.log('\nAll teams containing "ag2r" or "decathlon":');
    const ag2rTeams = teamLinks.filter(team => 
      team.text.toLowerCase().includes('ag2r') || 
      team.text.toLowerCase().includes('decathlon')
    );
    
    ag2rTeams.forEach(team => {
      console.log(`${team.score.toFixed(3)} | ${team.text} -> ${team.url}`);
    });
    
    // Test our similarity algorithm with the actual AG2R team name
    if (ag2rTeams.length > 0) {
      console.log('\nTesting similarity calculation:');
      const actualTeamName = ag2rTeams[0].text;
      const score = scraper.calculateTeamNameSimilarity(testTeam.name, actualTeamName);
      console.log(`"${testTeam.name}" vs "${actualTeamName}" = ${score.toFixed(3)}`);
      
      // Break down the calculation
      console.log('\nDetailed similarity breakdown:');
      const words1 = testTeam.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
      const words2 = actualTeamName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
      console.log(`Words in our team name: [${words1.join(', ')}]`);
      console.log(`Words in PCS team name: [${words2.join(', ')}]`);
    }
    
    console.log('\n=== DEBUG COMPLETE ===');
    
  } catch (error) {
    console.error('Debug failed:', error.message);
  }
}

// Run the debug
debugTeamMatching()
  .then(() => {
    console.log('Team matching debug completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Debug failed:', error);
    process.exit(1);
  });