const BaseScraper = require('../core/BaseScraper');
const moment = require('moment');
const { 
  logScrapingActivity, 
  logDataQuality, 
  logError,
  logValidation 
} = require('../../config/logger');

/**
 * RiderProfileScraper - Extracts comprehensive rider profiles from ProCyclingStats
 * Handles biographical data, career statistics, team history, and performance metrics
 */
class RiderProfileScraper extends BaseScraper {
  constructor(options = {}) {
    super({
      name: 'RiderProfileScraper',
      baseUrl: process.env.PCS_BASE_URL || 'https://www.procyclingstats.com',
      ...options
    });
    
    // URL patterns for different rider data
    this.urlPatterns = {
      riderProfile: '/rider/{riderId}',
      riderResults: '/rider/{riderId}/results',
      riderResultsByYear: '/rider/{riderId}/results/{year}',
      riderStatistics: '/rider/{riderId}/statistics',
      riderTeamHistory: '/rider/{riderId}/teams',
      riderPalmares: '/rider/{riderId}/palmares'
    };
    
    // Specialization mapping
    this.specializationMap = {
      'sprinter': 'SPRINTER',
      'climber': 'CLIMBER', 
      'time trialist': 'TIME_TRIALIST',
      'time-trialist': 'TIME_TRIALIST',
      'tt specialist': 'TIME_TRIALIST',
      'all rounder': 'ALL_ROUNDER',
      'all-rounder': 'ALL_ROUNDER',
      'rouleur': 'ALL_ROUNDER',
      'domestique': 'DOMESTIQUE',
      'classics specialist': 'CLASSICS_SPECIALIST',
      'one day racer': 'CLASSICS_SPECIALIST',
      'puncheur': 'PUNCHEUR',
      'breakaway specialist': 'BREAKAWAY_SPECIALIST'
    };
    
    // Team role mapping
    this.teamRoleMap = {
      'leader': 'TEAM_LEADER',
      'captain': 'CAPTAIN',
      'sprinter': 'SPRINTER_LEAD',
      'climber': 'CLIMBER_LEAD',
      'domestique': 'DOMESTIQUE',
      'neo-pro': 'TRAINEE',
      'stagiaire': 'TRAINEE'
    };
    
    this.logger.info('RiderProfileScraper initialized');
  }
  
  /**
   * Main scraping method for rider profile
   */
  async scrape(riderId, options = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting rider profile scraping', {
        riderId,
        options,
        sessionId: this.sessionId
      });
      
      const profile = {
        riderId,
        personalInfo: null,
        careerStats: null,
        teamHistory: [],
        recentResults: [],
        palmares: [],
        performanceMetrics: null,
        scrapedAt: new Date().toISOString(),
        dataQuality: {}
      };
      
      // Scrape main profile information
      profile.personalInfo = await this.scrapePersonalInfo(riderId);
      
      // Scrape career statistics
      if (options.includeStats !== false) {
        profile.careerStats = await this.scrapeCareerStatistics(riderId);
      }
      
      // Scrape team history
      if (options.includeTeamHistory !== false) {
        profile.teamHistory = await this.scrapeTeamHistory(riderId);
      }
      
      // Scrape recent results
      if (options.includeRecentResults !== false) {
        const year = options.resultsYear || new Date().getFullYear();
        profile.recentResults = await this.scrapeRecentResults(riderId, year);
      }
      
      // Scrape palmares (major wins)
      if (options.includePalmares !== false) {
        profile.palmares = await this.scrapePalmares(riderId);
      }
      
      // Calculate performance metrics
      if (options.includePerformanceMetrics !== false) {
        profile.performanceMetrics = this.calculatePerformanceMetrics(profile);
      }
      
      // Calculate data quality
      profile.dataQuality = this.calculateDataQuality(profile);
      
      logDataQuality('rider-profile', profile.dataQuality, {
        riderId,
        sessionId: this.sessionId,
        duration: Date.now() - startTime
      });
      
      logScrapingActivity(
        this.name,
        'rider-profile-completed',
        `rider-${riderId}`,
        'success',
        {
          sessionId: this.sessionId,
          teamHistoryEntries: profile.teamHistory.length,
          recentResults: profile.recentResults.length,
          palmaresEntries: profile.palmares.length,
          dataQuality: profile.dataQuality.overallScore
        }
      );
      
      return profile;
      
    } catch (error) {
      logError(error, {
        riderId,
        scraper: this.name,
        sessionId: this.sessionId,
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Scrape personal information from rider profile
   */
  async scrapePersonalInfo(riderId) {
    const url = this.buildUrl('riderProfile', { riderId });
    
    try {
      const $ = await this.scrapePage(url);
      
      const personalInfo = {
        name: this.extractRiderName($),
        firstName: null,
        lastName: null,
        dateOfBirth: this.extractDateOfBirth($),
        age: null,
        nationality: this.extractNationality($),
        team: this.extractCurrentTeam($),
        specialization: this.extractSpecialization($),
        height: this.extractHeight($),
        weight: this.extractWeight($),
        turnedPro: this.extractTurnedProYear($),
        isActive: this.extractActiveStatus($),
        profileUrl: url,
        photoUrl: this.extractPhotoUrl($),
        socialMedia: this.extractSocialMedia($)
      };
      
      // Derive first/last name and age
      if (personalInfo.name) {
        const nameParts = personalInfo.name.trim().split(' ');
        personalInfo.firstName = nameParts[0];
        personalInfo.lastName = nameParts.slice(1).join(' ');
      }
      
      if (personalInfo.dateOfBirth) {
        const birthDate = moment(personalInfo.dateOfBirth);
        if (birthDate.isValid()) {
          personalInfo.age = moment().diff(birthDate, 'years');
        }
      }
      
      // Validate personal info
      const validation = this.validatePersonalInfo(personalInfo);
      logValidation('rider-personal-info', validation, { 
        riderId, 
        sessionId: this.sessionId 
      });
      
      return personalInfo;
      
    } catch (error) {
      this.logger.error('Failed to scrape personal info', {
        riderId,
        url,
        error: error.message
      });
      
      // Return minimal info to allow other scraping to continue
      return {
        name: `Rider ${riderId}`,
        firstName: null,
        lastName: null,
        dateOfBirth: null,
        age: null,
        nationality: 'Unknown',
        team: 'Unknown',
        specialization: 'ALL_ROUNDER',
        height: null,
        weight: null,
        turnedPro: null,
        isActive: true,
        profileUrl: url,
        photoUrl: null,
        socialMedia: {}
      };
    }
  }
  
  /**
   * Scrape career statistics
   */
  async scrapeCareerStatistics(riderId) {
    const url = this.buildUrl('riderStatistics', { riderId });
    
    try {
      const $ = await this.scrapePage(url);
      
      const stats = {
        totalWins: this.extractTotalWins($),
        podiums: this.extractPodiums($),
        top10s: this.extractTop10s($),
        racesDays: this.extractRaceDays($),
        points: this.extractCareerPoints($),
        seasons: this.extractSeasons($),
        grandTours: this.extractGrandTourStats($),
        oneDay: this.extractOneDayStats($),
        timeTrials: this.extractTimeTrialStats($),
        winsByCategory: this.extractWinsByCategory($),
        winsByYear: this.extractWinsByYear($),
        performanceByMonth: this.extractPerformanceByMonth($)
      };
      
      return stats;
      
    } catch (error) {
      this.logger.warn('Failed to scrape career statistics', {
        riderId,
        url,
        error: error.message
      });
      
      return {
        totalWins: 0,
        podiums: 0,
        top10s: 0,
        racesDays: 0,
        points: 0,
        seasons: 0,
        grandTours: {},
        oneDay: {},
        timeTrials: {},
        winsByCategory: {},
        winsByYear: {},
        performanceByMonth: {}
      };
    }
  }
  
  /**
   * Scrape team history
   */
  async scrapeTeamHistory(riderId) {
    const url = this.buildUrl('riderTeamHistory', { riderId });
    
    try {
      const $ = await this.scrapePage(url);
      
      const teamHistory = [];
      
      // Look for team history table
      const $table = $('table').filter((i, table) => {
        const tableText = $(table).text().toLowerCase();
        return tableText.includes('team') || tableText.includes('year');
      }).first();
      
      if ($table.length > 0) {
        $table.find('tbody tr').each((i, row) => {
          const $row = $(row);
          const teamEntry = this.extractTeamHistoryEntry($row);
          
          if (teamEntry && teamEntry.teamName) {
            teamHistory.push(teamEntry);
          }
        });
      }
      
      // Sort by year (most recent first)
      teamHistory.sort((a, b) => (b.endYear || 9999) - (a.endYear || 9999));
      
      return teamHistory;
      
    } catch (error) {
      this.logger.warn('Failed to scrape team history', {
        riderId,
        url,
        error: error.message
      });
      
      return [];
    }
  }
  
  /**
   * Scrape recent results
   */
  async scrapeRecentResults(riderId, year) {
    const url = this.buildUrl('riderResultsByYear', { riderId, year });
    
    try {
      const $ = await this.scrapePage(url);
      
      const results = [];
      
      // Look for results table
      const $table = $('table.results, table.basic').first();
      
      if ($table.length > 0) {
        // Extract headers
        const headers = [];
        $table.find('thead tr th, thead tr td').each((i, th) => {
          headers.push($(th).text().trim().toLowerCase());
        });
        
        const columnMap = this.createResultsColumnMap(headers);
        
        // Extract results
        $table.find('tbody tr').each((i, row) => {
          const $row = $(row);
          const result = this.extractResultEntry($row, columnMap);
          
          if (result && result.raceName) {
            results.push(result);
          }
        });
      }
      
      return results;
      
    } catch (error) {
      this.logger.warn('Failed to scrape recent results', {
        riderId,
        year,
        url,
        error: error.message
      });
      
      return [];
    }
  }
  
  /**
   * Scrape palmares (major wins and achievements)
   */
  async scrapePalmares(riderId) {
    const url = this.buildUrl('riderPalmares', { riderId });
    
    try {
      const $ = await this.scrapePage(url);
      
      const palmares = [];
      
      // Look for palmares sections
      $('.palmares-section, .achievements').each((i, section) => {
        const $section = $(section);
        const category = $section.find('h3, .category-title').text().trim();
        
        $section.find('.achievement, .win').each((j, achievement) => {
          const $achievement = $(achievement);
          const palmaresEntry = this.extractPalmaresEntry($achievement, category);
          
          if (palmaresEntry && palmaresEntry.raceName) {
            palmares.push(palmaresEntry);
          }
        });
      });
      
      // If no structured palmares found, look for wins table
      if (palmares.length === 0) {
        const $winsTable = $('table').filter((i, table) => {
          const tableText = $(table).text().toLowerCase();
          return tableText.includes('wins') || tableText.includes('victories');
        }).first();
        
        if ($winsTable.length > 0) {
          $winsTable.find('tbody tr').each((i, row) => {
            const $row = $(row);
            const win = this.extractWinEntry($row);
            
            if (win && win.raceName) {
              palmares.push(win);
            }
          });
        }
      }
      
      // Sort by year (most recent first)
      palmares.sort((a, b) => (b.year || 0) - (a.year || 0));
      
      return palmares;
      
    } catch (error) {
      this.logger.warn('Failed to scrape palmares', {
        riderId,
        url,
        error: error.message
      });
      
      return [];
    }
  }
  
  /**
   * Extract personal information fields
   */
  extractRiderName($) {
    return $('.rider-name h1, .name h1, h1.main-title').first().text().trim() ||
           $('title').text().split(' - ')[0] ||
           'Unknown Rider';
  }
  
  extractDateOfBirth($) {
    const dobSelectors = [
      '.date-of-birth',
      '.born',
      '.birth-date',
      '[class*=\"birth\"]',
      '[class*=\"born\"]'
    ];
    
    for (const selector of dobSelectors) {
      const dobText = $(selector).text().trim();
      if (dobText) {
        const date = moment(dobText, ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'MMMM DD, YYYY']);
        if (date.isValid()) {
          return date.format('YYYY-MM-DD');
        }
      }
    }
    
    // Look for birth date in rider info box
    const infoText = $('.rider-info, .profile-info').text();
    const birthMatch = infoText.match(/born[:\\s]*(\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{4}|\\d{4}[\\/-]\\d{1,2}[\\/-]\\d{1,2})/i);
    if (birthMatch) {
      const date = moment(birthMatch[1], ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']);
      if (date.isValid()) {
        return date.format('YYYY-MM-DD');
      }
    }
    
    return null;
  }
  
  extractNationality($) {
    // Look for flag or country indicators
    const $flag = $('.flag, .country-flag, .nationality').first();
    
    if ($flag.length > 0) {
      return $flag.attr('title') || $flag.attr('alt') || $flag.text().trim();
    }
    
    // Look for country code or name in text
    const infoText = $('.rider-info, .profile-info').text();
    const countryMatch = infoText.match(/\\b([A-Z]{2,3})\\b/);
    if (countryMatch) {
      return countryMatch[1];
    }
    
    return 'Unknown';
  }
  
  extractCurrentTeam($) {
    const teamSelectors = [
      '.current-team',
      '.team',
      '.team-name',
      '[class*=\"team\"]'
    ];
    
    for (const selector of teamSelectors) {
      const teamName = $(selector).first().text().trim();
      if (teamName && teamName.length > 2) {
        return teamName;
      }
    }
    
    // Look for team in rider info
    const infoText = $('.rider-info, .profile-info').text();
    const teamMatch = infoText.match(/team[:\\s]*([^\\n]+)/i);
    if (teamMatch) {
      return teamMatch[1].trim();
    }
    
    return 'Unknown';
  }
  
  extractSpecialization($) {
    const specializationText = $('.specialization, .rider-type, .category').text().toLowerCase();
    
    for (const [key, value] of Object.entries(this.specializationMap)) {
      if (specializationText.includes(key)) {
        return value;
      }
    }
    
    // Try to infer from other text on page
    const pageText = $('body').text().toLowerCase();
    
    if (pageText.includes('sprint') && !pageText.includes('climb')) {
      return 'SPRINTER';
    } else if (pageText.includes('climb') && !pageText.includes('sprint')) {
      return 'CLIMBER';
    } else if (pageText.includes('time trial') || pageText.includes('chrono')) {
      return 'TIME_TRIALIST';
    } else if (pageText.includes('classic') && !pageText.includes('grand tour')) {
      return 'CLASSICS_SPECIALIST';
    }
    
    return 'ALL_ROUNDER';
  }
  
  extractHeight($) {
    const heightText = $('.height, .rider-height').text();
    const heightMatch = heightText.match(/(\\d+)\\s*cm/i);
    return heightMatch ? parseInt(heightMatch[1]) : null;
  }
  
  extractWeight($) {
    const weightText = $('.weight, .rider-weight').text();
    const weightMatch = weightText.match(/(\\d+)\\s*kg/i);
    return weightMatch ? parseInt(weightMatch[1]) : null;
  }
  
  extractTurnedProYear($) {
    const proText = $('.turned-pro, .pro-since').text();
    const yearMatch = proText.match(/(\\d{4})/);
    return yearMatch ? parseInt(yearMatch[1]) : null;
  }
  
  extractActiveStatus($) {
    const pageText = $('body').text().toLowerCase();
    
    if (pageText.includes('retired') || pageText.includes('inactive')) {
      return false;
    }
    
    // Check if there are recent results
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;
    
    if (pageText.includes(currentYear.toString()) || pageText.includes(lastYear.toString())) {
      return true;
    }
    
    return true; // Default to active
  }
  
  extractPhotoUrl($) {
    const $photo = $('.rider-photo img, .profile-photo img, .rider-image img').first();
    
    if ($photo.length > 0) {
      const photoUrl = $photo.attr('src');
      return photoUrl ? this.resolveUrl(photoUrl) : null;
    }
    
    return null;
  }
  
  extractSocialMedia($) {
    const socialMedia = {};
    
    // Look for social media links
    $('.social-links a, .social a').each((i, link) => {
      const $link = $(link);
      const href = $link.attr('href');
      const text = $link.text().toLowerCase();
      
      if (href) {
        if (href.includes('twitter.com') || text.includes('twitter')) {
          socialMedia.twitter = href;
        } else if (href.includes('instagram.com') || text.includes('instagram')) {
          socialMedia.instagram = href;
        } else if (href.includes('facebook.com') || text.includes('facebook')) {
          socialMedia.facebook = href;
        } else if (href.includes('strava.com') || text.includes('strava')) {
          socialMedia.strava = href;
        }
      }
    });
    
    return socialMedia;
  }
  
  /**
   * Extract career statistics fields
   */
  extractTotalWins($) {
    const winsText = $('.total-wins, .wins, .victories').text();
    const winsMatch = winsText.match(/(\\d+)/);
    return winsMatch ? parseInt(winsMatch[1]) : 0;
  }
  
  extractPodiums($) {
    const podiumsText = $('.podiums, .top3').text();
    const podiumsMatch = podiumsText.match(/(\\d+)/);
    return podiumsMatch ? parseInt(podiumsMatch[1]) : 0;
  }
  
  extractTop10s($) {
    const top10Text = $('.top10, .top-10').text();
    const top10Match = top10Text.match(/(\\d+)/);
    return top10Match ? parseInt(top10Match[1]) : 0;
  }
  
  extractRaceDays($) {
    const raceDaysText = $('.race-days, .days').text();
    const raceDaysMatch = raceDaysText.match(/(\\d+)/);
    return raceDaysMatch ? parseInt(raceDaysMatch[1]) : 0;
  }
  
  extractCareerPoints($) {
    const pointsText = $('.points, .uci-points').text();
    const pointsMatch = pointsText.match(/(\\d+)/);
    return pointsMatch ? parseInt(pointsMatch[1]) : 0;
  }
  
  extractSeasons($) {
    const seasonsText = $('.seasons, .years').text();
    const seasonsMatch = seasonsText.match(/(\\d+)/);
    return seasonsMatch ? parseInt(seasonsMatch[1]) : 0;
  }
  
  extractGrandTourStats($) {
    return {
      participations: 0,
      finishes: 0,
      stageWins: 0,
      podiums: 0
    };
  }
  
  extractOneDayStats($) {
    return {
      wins: 0,
      podiums: 0,
      top10s: 0
    };
  }
  
  extractTimeTrialStats($) {
    return {
      wins: 0,
      podiums: 0,
      averageSpeed: null
    };
  }
  
  extractWinsByCategory($) {
    return {};
  }
  
  extractWinsByYear($) {
    return {};
  }
  
  extractPerformanceByMonth($) {
    return {};
  }
  
  /**
   * Extract team history entry from table row
   */
  extractTeamHistoryEntry($row) {
    const cells = $row.find('td');
    
    if (cells.length < 2) {
      return null;
    }
    
    const entry = {
      teamName: null,
      startYear: null,
      endYear: null,
      role: 'RIDER',
      isCurrentTeam: false
    };
    
    // Extract year range (usually first column)
    const yearText = $(cells[0]).text().trim();
    const yearMatch = yearText.match(/(\\d{4})(?:[-–](\\d{4}|present))?/);
    
    if (yearMatch) {
      entry.startYear = parseInt(yearMatch[1]);
      if (yearMatch[2] && yearMatch[2] !== 'present') {
        entry.endYear = parseInt(yearMatch[2]);
      } else if (yearMatch[2] === 'present') {
        entry.isCurrentTeam = true;
      }
    }
    
    // Extract team name (usually second column)
    const teamCell = $(cells[1]);
    entry.teamName = teamCell.find('a').text().trim() || teamCell.text().trim();
    
    // Extract role if available (third column)
    if (cells.length > 2) {
      const roleText = $(cells[2]).text().trim().toLowerCase();
      for (const [key, value] of Object.entries(this.teamRoleMap)) {
        if (roleText.includes(key)) {
          entry.role = value;
          break;
        }
      }
    }
    
    return entry.teamName ? entry : null;
  }
  
  /**
   * Extract result entry from table row
   */
  extractResultEntry($row, columnMap) {
    const cells = $row.find('td');
    
    if (cells.length === 0) {
      return null;
    }
    
    const result = {
      date: null,
      raceName: null,
      category: null,
      position: null,
      points: null,
      team: null
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
    
    if (columnMap.position !== -1 && cells[columnMap.position]) {
      const posText = $(cells[columnMap.position]).text().trim();
      const posMatch = posText.match(/(\\d+)/);
      result.position = posMatch ? parseInt(posMatch[1]) : null;
    }
    
    if (columnMap.points !== -1 && cells[columnMap.points]) {
      const pointsText = $(cells[columnMap.points]).text().trim();
      const pointsMatch = pointsText.match(/(\\d+)/);
      result.points = pointsMatch ? parseInt(pointsMatch[1]) : null;
    }
    
    return result.raceName ? result : null;
  }
  
  /**
   * Extract palmares entry
   */
  extractPalmaresEntry($element, category) {
    const entry = {
      raceName: null,
      year: null,
      category: category || 'General',
      position: 1, // Assume wins unless specified
      importance: 'medium'
    };
    
    const text = $element.text().trim();
    
    // Extract year
    const yearMatch = text.match(/(\\d{4})/);
    if (yearMatch) {
      entry.year = parseInt(yearMatch[1]);
    }
    
    // Extract race name (remove year)
    entry.raceName = text.replace(/\\d{4}/, '').trim();
    
    // Determine importance based on race name
    const raceName = entry.raceName.toLowerCase();
    if (raceName.includes('tour de france') || 
        raceName.includes('giro') || 
        raceName.includes('vuelta')) {
      entry.importance = 'very-high';
    } else if (raceName.includes('world') || 
               raceName.includes('olympic') ||
               raceName.includes('roubaix') ||
               raceName.includes('flanders')) {
      entry.importance = 'high';
    } else if (raceName.includes('stage') || raceName.includes('national')) {
      entry.importance = 'medium';
    } else {
      entry.importance = 'low';
    }
    
    return entry.raceName ? entry : null;
  }
  
  /**
   * Extract win entry from table row
   */
  extractWinEntry($row) {
    const cells = $row.find('td');
    
    if (cells.length < 2) {
      return null;
    }
    
    const win = {
      year: null,
      raceName: null,
      category: 'General',
      position: 1,
      importance: 'medium'
    };
    
    // First column usually year
    const yearText = $(cells[0]).text().trim();
    const yearMatch = yearText.match(/(\\d{4})/);
    if (yearMatch) {
      win.year = parseInt(yearMatch[1]);
    }
    
    // Second column usually race name
    const raceCell = $(cells[1]);
    win.raceName = raceCell.find('a').text().trim() || raceCell.text().trim();
    
    return win.raceName ? win : null;
  }
  
  /**
   * Create column mapping for results table
   */
  createResultsColumnMap(headers) {
    const columnMap = {
      date: -1,
      race: -1,
      category: -1,
      position: -1,
      points: -1,
      team: -1
    };
    
    headers.forEach((header, index) => {
      const cleanHeader = header.toLowerCase().replace(/[^a-z]/g, '');
      
      if (cleanHeader.includes('date')) {
        columnMap.date = index;
      } else if (cleanHeader.includes('race') || cleanHeader.includes('name')) {
        columnMap.race = index;
      } else if (cleanHeader.includes('cat') || cleanHeader.includes('class')) {
        columnMap.category = index;
      } else if (cleanHeader.includes('pos') || cleanHeader.includes('rank')) {
        columnMap.position = index;
      } else if (cleanHeader.includes('point') || cleanHeader.includes('pts')) {
        columnMap.points = index;
      } else if (cleanHeader.includes('team')) {
        columnMap.team = index;
      }
    });
    
    return columnMap;
  }
  
  /**
   * Calculate performance metrics from profile data
   */
  calculatePerformanceMetrics(profile) {
    const metrics = {
      careerSpan: null,
      winRate: null,
      podiumRate: null,
      peakYears: [],
      consistency: null,
      specialization: null,
      currentForm: null
    };
    
    // Calculate career span
    if (profile.personalInfo.turnedPro) {
      const currentYear = new Date().getFullYear();
      metrics.careerSpan = currentYear - profile.personalInfo.turnedPro;
    }
    
    // Calculate win rate
    if (profile.careerStats.totalWins && profile.careerStats.racesDays) {
      metrics.winRate = (profile.careerStats.totalWins / profile.careerStats.racesDays * 100).toFixed(2);
    }
    
    // Calculate podium rate
    if (profile.careerStats.podiums && profile.careerStats.racesDays) {
      metrics.podiumRate = (profile.careerStats.podiums / profile.careerStats.racesDays * 100).toFixed(2);
    }
    
    // Determine specialization strength
    metrics.specialization = profile.personalInfo.specialization;
    
    // Calculate current form based on recent results
    if (profile.recentResults.length > 0) {
      const recentWins = profile.recentResults.filter(r => r.position === 1).length;
      const recentPodiums = profile.recentResults.filter(r => r.position && r.position <= 3).length;
      
      if (recentWins > 5) {
        metrics.currentForm = 'excellent';
      } else if (recentWins > 2 || recentPodiums > 10) {
        metrics.currentForm = 'good';
      } else if (recentPodiums > 5) {
        metrics.currentForm = 'average';
      } else {
        metrics.currentForm = 'poor';
      }
    }
    
    return metrics;
  }
  
  /**
   * Build URL from pattern and parameters
   */
  buildUrl(patternKey, params) {
    let url = this.baseUrl + this.urlPatterns[patternKey];
    
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`{${key}}`, value);
    }
    
    return url;
  }
  
  /**
   * Resolve relative URL to absolute
   */
  resolveUrl(url) {
    if (!url) return null;
    
    if (url.startsWith('http')) {
      return url;
    } else if (url.startsWith('//')) {
      return 'https:' + url;
    } else if (url.startsWith('/')) {
      return this.baseUrl + url;
    } else {
      return this.baseUrl + '/' + url;
    }
  }
  
  /**
   * Validate personal information
   */
  validatePersonalInfo(personalInfo) {
    const errors = [];
    const warnings = [];
    
    if (!personalInfo.name || personalInfo.name === 'Unknown Rider') {
      errors.push('Rider name is missing or invalid');
    }
    
    if (!personalInfo.dateOfBirth) {
      warnings.push('Date of birth could not be determined');
    }
    
    if (personalInfo.nationality === 'Unknown') {
      warnings.push('Nationality could not be determined');
    }
    
    if (personalInfo.team === 'Unknown') {
      warnings.push('Current team could not be determined');
    }
    
    if (!personalInfo.height || !personalInfo.weight) {
      warnings.push('Physical measurements are missing');
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
  calculateDataQuality(profile) {
    const metrics = {
      personalInfoCompleteness: 0,
      careerStatsCompleteness: 0,
      teamHistoryCompleteness: 0,
      resultsCompleteness: 0,
      palmaresCompleteness: 0,
      overallScore: 0
    };
    
    // Personal info completeness
    const personalFields = ['name', 'dateOfBirth', 'nationality', 'team', 'specialization'];
    const completePersonalFields = personalFields.filter(field => 
      profile.personalInfo[field] && 
      profile.personalInfo[field] !== 'Unknown' && 
      profile.personalInfo[field] !== 'Unknown Rider'
    );
    metrics.personalInfoCompleteness = completePersonalFields.length / personalFields.length;
    
    // Career stats completeness
    if (profile.careerStats) {
      const statsFields = ['totalWins', 'podiums', 'racesDays', 'seasons'];
      const completeStatsFields = statsFields.filter(field => 
        profile.careerStats[field] !== null && profile.careerStats[field] !== undefined
      );
      metrics.careerStatsCompleteness = completeStatsFields.length / statsFields.length;
    }
    
    // Team history availability
    metrics.teamHistoryCompleteness = profile.teamHistory.length > 0 ? 1 : 0;
    
    // Results availability
    metrics.resultsCompleteness = profile.recentResults.length > 0 ? 1 : 0;
    
    // Palmares availability
    metrics.palmaresCompleteness = profile.palmares.length > 0 ? 1 : 0;
    
    // Overall score (weighted average)
    metrics.overallScore = (
      metrics.personalInfoCompleteness * 0.4 +
      metrics.careerStatsCompleteness * 0.2 +
      metrics.teamHistoryCompleteness * 0.2 +
      metrics.resultsCompleteness * 0.1 +
      metrics.palmaresCompleteness * 0.1
    );
    
    return metrics;
  }
}

module.exports = RiderProfileScraper;