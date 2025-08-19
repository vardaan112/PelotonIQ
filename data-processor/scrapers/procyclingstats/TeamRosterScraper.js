const BaseScraper = require('../core/BaseScraper');
const moment = require('moment');
const { 
  logScrapingActivity, 
  logDataQuality, 
  logError,
  logValidation 
} = require('../../config/logger');

/**
 * TeamRosterScraper - Extracts team roster information from ProCyclingStats
 * Handles current and historical team compositions with rider contract details
 */
class TeamRosterScraper extends BaseScraper {
  constructor(options = {}) {
    super({
      name: 'TeamRosterScraper',
      baseUrl: process.env.PCS_BASE_URL || 'https://www.procyclingstats.com',
      ...options
    });
    
    // URL patterns for different team data
    this.urlPatterns = {
      teamProfile: '/team/{teamId}',
      teamRoster: '/team/{teamId}/roster',
      teamRosterByYear: '/team/{teamId}/{year}',
      teamHistory: '/team/{teamId}/history',
      teamStatistics: '/team/{teamId}/statistics',
      teamResults: '/team/{teamId}/results'
    };
    
    // Team category mapping
    this.teamCategoryMap = {
      'worldtour': 'WORLD_TOUR',
      'world tour': 'WORLD_TOUR',
      'wt': 'WORLD_TOUR',
      'proteam': 'PRO_TEAM',
      'pro team': 'PRO_TEAM',
      'pt': 'PRO_TEAM',
      'continental': 'CONTINENTAL',
      'cont': 'CONTINENTAL',
      'ct': 'CONTINENTAL',
      'national': 'NATIONAL',
      'development': 'DEVELOPMENT',
      'amateur': 'AMATEUR',
      'club': 'CLUB'
    };
    
    // Rider role mapping
    this.riderRoleMap = {
      'leader': 'TEAM_LEADER',
      'captain': 'CAPTAIN',
      'sprinter': 'SPRINTER_LEAD',
      'climber': 'CLIMBER_LEAD',
      'domestique': 'DOMESTIQUE',
      'neo-pro': 'TRAINEE',
      'stagiaire': 'TRAINEE',
      'rider': 'RIDER',
      'reserve': 'RESERVE'
    };
    
    this.logger.info('TeamRosterScraper initialized');
  }
  
  /**
   * Main scraping method for team roster
   */
  async scrape(teamId, options = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting team roster scraping', {
        teamId,
        options,
        sessionId: this.sessionId
      });
      
      const teamData = {
        teamId,
        teamInfo: null,
        currentRoster: [],
        historicalRosters: {},
        teamStatistics: null,
        recentResults: [],
        scrapedAt: new Date().toISOString(),
        dataQuality: {}
      };
      
      // Scrape team information
      teamData.teamInfo = await this.scrapeTeamInfo(teamId);
      
      // Scrape current roster
      if (options.includeCurrentRoster !== false) {
        teamData.currentRoster = await this.scrapeCurrentRoster(teamId);
      }
      
      // Scrape historical rosters
      if (options.includeHistory !== false) {
        const years = options.historicalYears || this.getRecentYears(5);
        teamData.historicalRosters = await this.scrapeHistoricalRosters(teamId, years);
      }
      
      // Scrape team statistics
      if (options.includeStatistics !== false) {
        teamData.teamStatistics = await this.scrapeTeamStatistics(teamId);
      }
      
      // Scrape recent results
      if (options.includeRecentResults !== false) {
        teamData.recentResults = await this.scrapeTeamResults(teamId, options.resultsYear);
      }
      
      // Calculate data quality
      teamData.dataQuality = this.calculateDataQuality(teamData);
      
      logDataQuality('team-roster', teamData.dataQuality, {
        teamId,
        sessionId: this.sessionId,
        duration: Date.now() - startTime
      });
      
      logScrapingActivity(
        this.name,
        'team-scraping-completed',
        `team-${teamId}`,
        'success',
        {
          sessionId: this.sessionId,
          currentRosterSize: teamData.currentRoster.length,
          historicalYears: Object.keys(teamData.historicalRosters).length,
          dataQuality: teamData.dataQuality.overallScore
        }
      );
      
      return teamData;
      
    } catch (error) {
      logError(error, {
        teamId,
        scraper: this.name,
        sessionId: this.sessionId,
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Scrape team information
   */
  async scrapeTeamInfo(teamId) {
    const url = this.buildUrl('teamProfile', { teamId });
    
    try {
      const $ = await this.scrapePage(url);
      
      const teamInfo = {
        name: this.extractTeamName($),
        fullName: this.extractTeamFullName($),
        code: this.extractTeamCode($),
        country: this.extractTeamCountry($),
        founded: this.extractFoundedYear($),
        category: this.extractTeamCategory($),
        manager: this.extractManager($),
        director: this.extractDirector($),
        website: this.extractWebsite($),
        sponsors: this.extractSponsors($),
        colors: this.extractTeamColors($),
        bike: this.extractBike($),
        equipment: this.extractEquipment($),
        budget: this.extractBudget($),
        isActive: this.extractActiveStatus($),
        profileUrl: url
      };
      
      // Validate team info
      const validation = this.validateTeamInfo(teamInfo);
      logValidation('team-info', validation, { teamId, sessionId: this.sessionId });
      
      return teamInfo;
      
    } catch (error) {
      this.logger.error('Failed to scrape team info', {
        teamId,
        url,
        error: error.message
      });
      
      // Return minimal info to allow other scraping to continue
      return {
        name: `Team ${teamId}`,
        fullName: null,
        code: null,
        country: 'Unknown',
        founded: null,
        category: 'UNKNOWN',
        manager: null,
        director: null,
        website: null,
        sponsors: [],
        colors: [],
        bike: null,
        equipment: {},
        budget: null,
        isActive: true,
        profileUrl: url
      };
    }
  }
  
  /**
   * Scrape current team roster
   */
  async scrapeCurrentRoster(teamId) {
    const url = this.buildUrl('teamRoster', { teamId });
    
    try {
      const $ = await this.scrapePage(url);
      
      const roster = [];
      
      // Look for roster table
      const $table = this.findRosterTable($);
      
      if ($table && $table.length > 0) {
        // Extract headers to understand column positions
        const headers = [];
        $table.find('thead tr th, thead tr td').each((i, th) => {
          headers.push($(th).text().trim().toLowerCase());
        });
        
        const columnMap = this.createRosterColumnMap(headers);
        
        // Extract each rider
        $table.find('tbody tr').each((i, row) => {
          const $row = $(row);
          
          // Skip header rows or empty rows
          if ($row.hasClass('thead') || $row.find('td').length === 0) {
            return;
          }
          
          const riderEntry = this.extractRiderFromRosterRow($row, columnMap);
          
          if (riderEntry && riderEntry.rider && riderEntry.rider.name) {
            roster.push(riderEntry);
          }
        });
      }
      
      return roster;
      
    } catch (error) {
      this.logger.warn('Failed to scrape current roster', {
        teamId,
        url,
        error: error.message
      });
      
      return [];
    }
  }
  
  /**
   * Scrape historical rosters for multiple years
   */
  async scrapeHistoricalRosters(teamId, years) {
    const historicalRosters = {};
    
    for (const year of years) {
      try {
        await this.sleep(this.config.delayBetweenRequests);
        
        const roster = await this.scrapeRosterByYear(teamId, year);
        if (roster.length > 0) {
          historicalRosters[year] = roster;
        }
        
        this.logger.debug('Historical roster scraped', {
          teamId,
          year,
          rosterSize: roster.length
        });
        
      } catch (error) {
        this.logger.warn('Failed to scrape historical roster', {
          teamId,
          year,
          error: error.message
        });
        
        // Continue with next year
        continue;
      }
    }
    
    return historicalRosters;
  }
  
  /**
   * Scrape roster for specific year
   */
  async scrapeRosterByYear(teamId, year) {
    const url = this.buildUrl('teamRosterByYear', { teamId, year });
    
    try {
      const $ = await this.scrapePage(url);
      
      const roster = [];
      
      // Look for roster table
      const $table = this.findRosterTable($);
      
      if ($table && $table.length > 0) {
        const headers = [];
        $table.find('thead tr th, thead tr td').each((i, th) => {
          headers.push($(th).text().trim().toLowerCase());
        });
        
        const columnMap = this.createRosterColumnMap(headers);
        
        // Extract riders
        $table.find('tbody tr').each((i, row) => {
          const $row = $(row);
          
          if ($row.hasClass('thead') || $row.find('td').length === 0) {
            return;
          }
          
          const riderEntry = this.extractRiderFromRosterRow($row, columnMap, year);
          
          if (riderEntry && riderEntry.rider && riderEntry.rider.name) {
            roster.push(riderEntry);
          }
        });
      }
      
      return roster;
      
    } catch (error) {
      this.logger.error('Failed to scrape roster by year', {
        teamId,
        year,
        url,
        error: error.message
      });
      
      return [];
    }
  }
  
  /**
   * Scrape team statistics
   */
  async scrapeTeamStatistics(teamId) {
    const url = this.buildUrl('teamStatistics', { teamId });
    
    try {
      const $ = await this.scrapePage(url);
      
      const statistics = {
        totalWins: this.extractTotalWins($),
        totalPodiums: this.extractTotalPodiums($),
        totalTop10s: this.extractTotalTop10s($),
        totalRaceDays: this.extractTotalRaceDays($),
        totalPoints: this.extractTotalPoints($),
        winsByCategory: this.extractWinsByCategory($),
        winsByYear: this.extractWinsByYear($),
        topRiders: this.extractTopRiders($),
        grandTourStats: this.extractGrandTourStats($),
        classicsStats: this.extractClassicsStats($)
      };
      
      return statistics;
      
    } catch (error) {
      this.logger.warn('Failed to scrape team statistics', {
        teamId,
        url,
        error: error.message
      });
      
      return {
        totalWins: 0,
        totalPodiums: 0,
        totalTop10s: 0,
        totalRaceDays: 0,
        totalPoints: 0,
        winsByCategory: {},
        winsByYear: {},
        topRiders: [],
        grandTourStats: {},
        classicsStats: {}
      };
    }
  }
  
  /**
   * Scrape team results
   */
  async scrapeTeamResults(teamId, year) {
    const url = this.buildUrl('teamResults', { teamId });
    
    try {
      const $ = await this.scrapePage(url);
      
      const results = [];
      
      // Look for results table
      const $table = $('table.results, table.basic').first();
      
      if ($table.length > 0) {
        const headers = [];
        $table.find('thead tr th, thead tr td').each((i, th) => {
          headers.push($(th).text().trim().toLowerCase());
        });
        
        const columnMap = this.createResultsColumnMap(headers);
        
        // Extract results
        $table.find('tbody tr').each((i, row) => {
          const $row = $(row);
          
          if ($row.hasClass('thead') || $row.find('td').length === 0) {
            return;
          }
          
          const result = this.extractTeamResultFromRow($row, columnMap);
          
          if (result && result.raceName) {
            results.push(result);
          }
        });
      }
      
      return results;
      
    } catch (error) {
      this.logger.warn('Failed to scrape team results', {
        teamId,
        year,
        url,
        error: error.message
      });
      
      return [];
    }
  }
  
  /**
   * Find roster table in page
   */
  findRosterTable($) {
    const tableSelectors = [
      'table.roster',
      'table.riders',
      'table.team-roster',
      'table.results',
      'table.basic'
    ];
    
    for (const selector of tableSelectors) {
      const $table = $(selector).first();
      if ($table.length > 0) {
        // Verify it's actually a roster table by checking content
        const tableText = $table.text().toLowerCase();
        if (tableText.includes('rider') || tableText.includes('name') || tableText.includes('age')) {
          return $table;
        }
      }
    }
    
    // Fallback: find any table that looks like it contains rider data
    return $('table').filter((i, table) => {
      const tableText = $(table).text().toLowerCase();
      return tableText.includes('rider') && (tableText.includes('age') || tableText.includes('nationality'));
    }).first();
  }
  
  /**
   * Extract rider from roster table row
   */
  extractRiderFromRosterRow($row, columnMap, year = null) {
    const cells = $row.find('td');
    
    if (cells.length === 0) {
      return null;
    }
    
    const riderEntry = {
      rider: {
        name: null,
        nationality: null,
        dateOfBirth: null,
        age: null
      },
      role: 'RIDER',
      jerseyNumber: null,
      contractStart: year,
      contractEnd: null,
      salary: null,
      isCaptain: false,
      isActive: true
    };
    
    // Extract rider name
    if (columnMap.rider !== -1 && cells[columnMap.rider]) {
      const riderCell = $(cells[columnMap.rider]);
      riderEntry.rider.name = this.extractRiderName(riderCell);
    }
    
    // Extract nationality
    if (columnMap.nationality !== -1 && cells[columnMap.nationality]) {
      const nationalityCell = $(cells[columnMap.nationality]);
      riderEntry.rider.nationality = this.extractNationality(nationalityCell);
    }
    
    // Extract age
    if (columnMap.age !== -1 && cells[columnMap.age]) {
      const ageText = $(cells[columnMap.age]).text().trim();
      const age = parseInt(ageText);
      if (!isNaN(age) && age > 15 && age < 50) {
        riderEntry.rider.age = age;
        
        // Calculate approximate birth year
        const currentYear = new Date().getFullYear();
        const birthYear = currentYear - age;
        riderEntry.rider.dateOfBirth = `${birthYear}-01-01`; // Approximate
      }
    }
    
    // Extract date of birth (if available directly)
    if (columnMap.dateOfBirth !== -1 && cells[columnMap.dateOfBirth]) {
      const dobText = $(cells[columnMap.dateOfBirth]).text().trim();
      const date = moment(dobText, ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY']);
      if (date.isValid()) {
        riderEntry.rider.dateOfBirth = date.format('YYYY-MM-DD');
        riderEntry.rider.age = moment().diff(date, 'years');
      }
    }
    
    // Extract jersey number
    if (columnMap.jerseyNumber !== -1 && cells[columnMap.jerseyNumber]) {
      const numberText = $(cells[columnMap.jerseyNumber]).text().trim();
      const number = parseInt(numberText);
      if (!isNaN(number) && number > 0 && number < 1000) {
        riderEntry.jerseyNumber = number;
      }
    }
    
    // Extract role
    if (columnMap.role !== -1 && cells[columnMap.role]) {
      const roleText = $(cells[columnMap.role]).text().trim().toLowerCase();
      for (const [key, value] of Object.entries(this.riderRoleMap)) {
        if (roleText.includes(key)) {
          riderEntry.role = value;
          break;
        }
      }
      
      // Check if captain
      if (roleText.includes('captain') || roleText.includes('leader')) {
        riderEntry.isCaptain = true;
      }
    }
    
    return riderEntry.rider.name ? riderEntry : null;
  }
  
  /**
   * Extract team result from table row
   */
  extractTeamResultFromRow($row, columnMap) {
    const cells = $row.find('td');
    
    if (cells.length === 0) {
      return null;
    }
    
    const result = {
      date: null,
      raceName: null,
      category: null,
      riderName: null,
      position: null,
      points: null
    };
    
    // Extract based on column mapping
    if (columnMap.date !== -1 && cells[columnMap.date]) {
      const dateText = $(cells[columnMap.date]).text().trim();
      const date = moment(dateText, ['DD/MM', 'MM/DD', 'YYYY-MM-DD']);
      if (date.isValid()) {
        result.date = date.format('YYYY-MM-DD');
      }
    }
    
    if (columnMap.race !== -1 && cells[columnMap.race]) {
      const raceCell = $(cells[columnMap.race]);
      result.raceName = raceCell.find('a').text().trim() || raceCell.text().trim();
    }
    
    if (columnMap.rider !== -1 && cells[columnMap.rider]) {
      const riderCell = $(cells[columnMap.rider]);
      result.riderName = riderCell.find('a').text().trim() || riderCell.text().trim();
    }
    
    if (columnMap.position !== -1 && cells[columnMap.position]) {
      const posText = $(cells[columnMap.position]).text().trim();
      const posMatch = posText.match(/(\d+)/);
      result.position = posMatch ? parseInt(posMatch[1]) : null;
    }
    
    if (columnMap.points !== -1 && cells[columnMap.points]) {
      const pointsText = $(cells[columnMap.points]).text().trim();
      const pointsMatch = pointsText.match(/(\d+)/);
      result.points = pointsMatch ? parseInt(pointsMatch[1]) : null;
    }
    
    return result.raceName ? result : null;
  }
  
  /**
   * Create column mapping for roster table
   */
  createRosterColumnMap(headers) {
    const columnMap = {
      rider: -1,
      nationality: -1,
      age: -1,
      dateOfBirth: -1,
      jerseyNumber: -1,
      role: -1,
      position: -1
    };
    
    headers.forEach((header, index) => {
      const cleanHeader = header.toLowerCase().replace(/[^a-z]/g, '');
      
      if (cleanHeader.includes('rider') || cleanHeader.includes('name')) {
        columnMap.rider = index;
      } else if (cleanHeader.includes('nat') || cleanHeader.includes('country')) {
        columnMap.nationality = index;
      } else if (cleanHeader.includes('age')) {
        columnMap.age = index;
      } else if (cleanHeader.includes('born') || cleanHeader.includes('birth')) {
        columnMap.dateOfBirth = index;
      } else if (cleanHeader.includes('number') || cleanHeader.includes('jersey')) {
        columnMap.jerseyNumber = index;
      } else if (cleanHeader.includes('role') || cleanHeader.includes('position')) {
        columnMap.role = index;
      }
    });
    
    return columnMap;
  }
  
  /**
   * Create column mapping for results table
   */
  createResultsColumnMap(headers) {
    const columnMap = {
      date: -1,
      race: -1,
      rider: -1,
      position: -1,
      points: -1,
      category: -1
    };
    
    headers.forEach((header, index) => {
      const cleanHeader = header.toLowerCase().replace(/[^a-z]/g, '');
      
      if (cleanHeader.includes('date')) {
        columnMap.date = index;
      } else if (cleanHeader.includes('race') || cleanHeader.includes('event')) {
        columnMap.race = index;
      } else if (cleanHeader.includes('rider') || cleanHeader.includes('name')) {
        columnMap.rider = index;
      } else if (cleanHeader.includes('pos') || cleanHeader.includes('rank')) {
        columnMap.position = index;
      } else if (cleanHeader.includes('point') || cleanHeader.includes('pts')) {
        columnMap.points = index;
      } else if (cleanHeader.includes('cat') || cleanHeader.includes('class')) {
        columnMap.category = index;
      }
    });
    
    return columnMap;
  }
  
  /**
   * Extract team information fields
   */
  extractTeamName($) {
    return $('.team-name h1, .name h1, h1.main-title').first().text().trim() ||
           $('title').text().split(' - ')[0] ||
           'Unknown Team';
  }
  
  extractTeamFullName($) {
    const fullNameEl = $('.team-full-name, .full-name');
    return fullNameEl.length > 0 ? fullNameEl.text().trim() : null;
  }
  
  extractTeamCode($) {
    const codeEl = $('.team-code, .code');
    if (codeEl.length > 0) {
      return codeEl.text().trim().toUpperCase();
    }
    
    // Try to extract from team name (first 3 letters)
    const teamName = this.extractTeamName($);
    if (teamName && teamName !== 'Unknown Team') {
      const words = teamName.split(' ');
      if (words.length >= 2) {
        return (words[0].substring(0, 2) + words[1].substring(0, 1)).toUpperCase();
      } else {
        return teamName.substring(0, 3).toUpperCase();
      }
    }
    
    return null;
  }
  
  extractTeamCountry($) {
    const $flag = $('.flag, .country-flag, .nationality').first();
    
    if ($flag.length > 0) {
      return $flag.attr('title') || $flag.attr('alt') || $flag.text().trim();
    }
    
    return 'Unknown';
  }
  
  extractFoundedYear($) {
    const foundedText = $('.founded, .established, .since').text();
    const yearMatch = foundedText.match(/(\d{4})/);
    return yearMatch ? parseInt(yearMatch[1]) : null;
  }
  
  extractTeamCategory($) {
    const categoryText = $('.category, .division, .level').text().toLowerCase();
    
    for (const [key, value] of Object.entries(this.teamCategoryMap)) {
      if (categoryText.includes(key)) {
        return value;
      }
    }
    
    // Try to infer from other page text
    const pageText = $('body').text().toLowerCase();
    
    if (pageText.includes('world tour') || pageText.includes('worldtour')) {
      return 'WORLD_TOUR';
    } else if (pageText.includes('pro team') || pageText.includes('proteam')) {
      return 'PRO_TEAM';
    } else if (pageText.includes('continental')) {
      return 'CONTINENTAL';
    }
    
    return 'PROFESSIONAL';
  }
  
  extractManager($) {
    const managerText = $('.manager, .team-manager').text().trim();
    return managerText || null;
  }
  
  extractDirector($) {
    const directorText = $('.director, .sports-director, .ds').text().trim();
    return directorText || null;
  }
  
  extractWebsite($) {
    const $websiteLink = $('a[href*="http"]').filter((i, link) => {
      const href = $(link).attr('href');
      return href && !href.includes('procyclingstats.com') && !href.includes('twitter') && !href.includes('facebook');
    }).first();
    
    return $websiteLink.length > 0 ? $websiteLink.attr('href') : null;
  }
  
  extractSponsors($) {
    const sponsors = [];
    
    $('.sponsors, .sponsor').each((i, sponsorEl) => {
      const sponsorName = $(sponsorEl).text().trim();
      if (sponsorName && sponsorName.length > 2) {
        sponsors.push(sponsorName);
      }
    });
    
    return sponsors;
  }
  
  extractTeamColors($) {
    const colors = [];
    
    $('.colors, .team-colors').each((i, colorEl) => {
      const color = $(colorEl).text().trim();
      if (color && color.length > 2) {
        colors.push(color);
      }
    });
    
    return colors;
  }
  
  extractBike($) {
    const bikeText = $('.bike, .bicycle, .equipment').text();
    const bikeMatch = bikeText.match(/bike[:\s]*([^,\n]+)/i);
    return bikeMatch ? bikeMatch[1].trim() : null;
  }
  
  extractEquipment($) {
    const equipment = {};
    
    const equipmentText = $('.equipment, .sponsors').text();
    
    // Try to extract common equipment types
    const bikeMatch = equipmentText.match(/bike[:\s]*([^,\n]+)/i);
    if (bikeMatch) equipment.bike = bikeMatch[1].trim();
    
    const wheelMatch = equipmentText.match(/wheel[:\s]*([^,\n]+)/i);
    if (wheelMatch) equipment.wheels = wheelMatch[1].trim();
    
    const clothingMatch = equipmentText.match(/clothing[:\s]*([^,\n]+)/i);
    if (clothingMatch) equipment.clothing = clothingMatch[1].trim();
    
    return equipment;
  }
  
  extractBudget($) {
    const budgetText = $('.budget, .salary').text();
    const budgetMatch = budgetText.match(/[\d,]+/);
    return budgetMatch ? budgetMatch[0].replace(/,/g, '') : null;
  }
  
  extractActiveStatus($) {
    const pageText = $('body').text().toLowerCase();
    
    if (pageText.includes('disbanded') || pageText.includes('inactive') || pageText.includes('former')) {
      return false;
    }
    
    const currentYear = new Date().getFullYear();
    if (pageText.includes(currentYear.toString())) {
      return true;
    }
    
    return true; // Default to active
  }
  
  extractRiderName($cell) {
    const $link = $cell.find('a').first();
    if ($link.length > 0) {
      return $link.text().trim();
    }
    
    return $cell.text().trim();
  }
  
  extractNationality($cell) {
    const $flag = $cell.find('.flag, .country');
    if ($flag.length > 0) {
      return $flag.attr('title') || $flag.attr('alt') || $flag.text().trim();
    }
    
    const text = $cell.text().trim();
    if (text.match(/^[A-Z]{2,3}$/)) {
      return text;
    }
    
    return null;
  }
  
  /**
   * Extract statistics fields (placeholder implementations)
   */
  extractTotalWins($) {
    return 0; // Would extract from statistics page
  }
  
  extractTotalPodiums($) {
    return 0;
  }
  
  extractTotalTop10s($) {
    return 0;
  }
  
  extractTotalRaceDays($) {
    return 0;
  }
  
  extractTotalPoints($) {
    return 0;
  }
  
  extractWinsByCategory($) {
    return {};
  }
  
  extractWinsByYear($) {
    return {};
  }
  
  extractTopRiders($) {
    return [];
  }
  
  extractGrandTourStats($) {
    return {};
  }
  
  extractClassicsStats($) {
    return {};
  }
  
  /**
   * Helper methods
   */
  getRecentYears(count) {
    const currentYear = new Date().getFullYear();
    const years = [];
    
    for (let i = 0; i < count; i++) {
      years.push(currentYear - i);
    }
    
    return years;
  }
  
  buildUrl(patternKey, params) {
    let url = this.baseUrl + this.urlPatterns[patternKey];
    
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`{${key}}`, value);
    }
    
    return url;
  }
  
  /**
   * Validate team information
   */
  validateTeamInfo(teamInfo) {
    const errors = [];
    const warnings = [];
    
    if (!teamInfo.name || teamInfo.name === 'Unknown Team') {
      errors.push('Team name is missing or invalid');
    }
    
    if (teamInfo.country === 'Unknown') {
      warnings.push('Team country could not be determined');
    }
    
    if (!teamInfo.founded || teamInfo.founded < 1900 || teamInfo.founded > new Date().getFullYear()) {
      warnings.push('Team founded year is missing or invalid');
    }
    
    if (!teamInfo.category || teamInfo.category === 'UNKNOWN') {
      warnings.push('Team category could not be determined');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Calculate data quality metrics
   */
  calculateDataQuality(teamData) {
    const metrics = {
      teamInfoCompleteness: 0,
      rosterCompleteness: 0,
      historicalDataDepth: 0,
      dataConsistency: 0,
      overallScore: 0
    };
    
    // Team info completeness
    const teamInfoFields = ['name', 'country', 'founded', 'category', 'manager'];
    const completeTeamFields = teamInfoFields.filter(field => 
      teamData.teamInfo[field] && 
      teamData.teamInfo[field] !== 'Unknown' && 
      teamData.teamInfo[field] !== 'Unknown Team'
    );
    metrics.teamInfoCompleteness = completeTeamFields.length / teamInfoFields.length;
    
    // Roster completeness
    if (teamData.currentRoster.length > 0) {
      const rosterCompleteness = teamData.currentRoster.map(entry => {
        const riderFields = ['name', 'nationality', 'age'];
        const completeRiderFields = riderFields.filter(field => 
          entry.rider[field] && entry.rider[field] !== 'Unknown'
        );
        return completeRiderFields.length / riderFields.length;
      });
      
      metrics.rosterCompleteness = rosterCompleteness.reduce((a, b) => a + b, 0) / rosterCompleteness.length;
    }
    
    // Historical data depth
    const historicalYears = Object.keys(teamData.historicalRosters).length;
    metrics.historicalDataDepth = Math.min(1.0, historicalYears / 5); // Normalize to 5 years
    
    // Data consistency (assume good if no validation errors)
    metrics.dataConsistency = 1.0;
    
    // Overall score (weighted average)
    metrics.overallScore = (
      metrics.teamInfoCompleteness * 0.3 +
      metrics.rosterCompleteness * 0.4 +
      metrics.historicalDataDepth * 0.2 +
      metrics.dataConsistency * 0.1
    );
    
    return metrics;
  }
}

module.exports = TeamRosterScraper;