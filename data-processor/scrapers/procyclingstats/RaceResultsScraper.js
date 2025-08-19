const BaseScraper = require('../core/BaseScraper');
const moment = require('moment');
const { 
  logScrapingActivity, 
  logDataQuality, 
  logError,
  logValidation 
} = require('../../config/logger');

/**
 * RaceResultsScraper - Extracts comprehensive race results from ProCyclingStats
 * Handles stage results, classifications, and timing data for all race types
 */
class RaceResultsScraper extends BaseScraper {
  constructor(options = {}) {
    super({
      name: 'RaceResultsScraper',
      baseUrl: process.env.PCS_BASE_URL || 'https://www.procyclingstats.com',
      ...options
    });
    
    // URL patterns for different race result types
    this.urlPatterns = {
      raceResults: '/race/{raceId}',
      stageResults: '/race/{raceId}/{stageNumber}',
      generalClassification: '/race/{raceId}/gc',
      pointsClassification: '/race/{raceId}/points',
      mountainsClassification: '/race/{raceId}/kom',
      youthClassification: '/race/{raceId}/youth',
      teamClassification: '/race/{raceId}/teams',
      raceInfo: '/race/{raceId}/info',
      startList: '/race/{raceId}/startlist'
    };
    
    // Stage type mappings from HTML to our enum values
    this.stageTypeMap = {
      'flat stage': 'FLAT_STAGE',
      'hilly stage': 'ROLLING_STAGE',
      'mountain stage': 'MOUNTAIN_STAGE',
      'summit finish': 'SUMMIT_FINISH',
      'time trial': 'INDIVIDUAL_TIME_TRIAL',
      'individual time trial': 'INDIVIDUAL_TIME_TRIAL',
      'team time trial': 'TEAM_TIME_TRIAL',
      'prologue': 'PROLOGUE',
      'criterium': 'CRITERIUM',
      'cobbles': 'COBBLESTONE_STAGE'
    };
    
    // Result status mappings
    this.resultStatusMap = {
      'dnf': 'DNF',
      'dns': 'DNS',
      'dsq': 'DSQ', 
      'otl': 'OTL',
      'hd': 'HD',
      'ab': 'AB',
      'np': 'NP',
      'dq': 'DQ'
    };
    
    // Classification type mappings
    this.classificationTypeMap = {
      'gc': 'GENERAL_CLASSIFICATION',
      'points': 'POINTS_CLASSIFICATION',
      'kom': 'MOUNTAINS_CLASSIFICATION',
      'youth': 'YOUTH_CLASSIFICATION',
      'teams': 'TEAM_CLASSIFICATION'
    };
    
    this.logger.info('RaceResultsScraper initialized');
  }
  
  /**
   * Main scraping method for race results
   */
  async scrape(raceId, options = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting race results scraping', {
        raceId,
        options,
        sessionId: this.sessionId
      });
      
      const results = {
        raceId,
        raceInfo: null,
        stages: [],
        classifications: {
          general: [],
          points: [],
          mountains: [],
          youth: [],
          teams: []
        },
        startList: [],
        scrapedAt: new Date().toISOString(),
        dataQuality: {}
      };
      
      // Get race information first
      results.raceInfo = await this.scrapeRaceInfo(raceId);
      
      // Determine if this is a multi-stage race
      const isMultiStage = results.raceInfo.isMultiStage;
      
      if (isMultiStage) {
        // Scrape all stages
        results.stages = await this.scrapeAllStages(raceId, results.raceInfo.totalStages || 21);
        
        // Scrape final classifications
        results.classifications = await this.scrapeAllClassifications(raceId);
      } else {
        // Single stage race - scrape main results
        const stageResult = await this.scrapeSingleStageResults(raceId);
        results.stages = [stageResult];
      }
      
      // Scrape start list if available
      if (options.includeStartList !== false) {
        results.startList = await this.scrapeStartList(raceId);
      }
      
      // Calculate data quality metrics
      results.dataQuality = this.calculateDataQuality(results);
      
      logDataQuality('race-results', results.dataQuality, {
        raceId,
        sessionId: this.sessionId,
        duration: Date.now() - startTime
      });
      
      logScrapingActivity(
        this.name,
        'race-scraping-completed',
        `race-${raceId}`,
        'success',
        {
          sessionId: this.sessionId,
          stagesScraped: results.stages.length,
          classificationsScraped: Object.keys(results.classifications).length,
          totalRiders: results.startList.length,
          dataQuality: results.dataQuality.overallScore
        }
      );
      
      return results;
      
    } catch (error) {
      logError(error, {
        raceId,
        scraper: this.name,
        sessionId: this.sessionId,
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Scrape basic race information
   */
  async scrapeRaceInfo(raceId) {
    const url = this.buildUrl('raceInfo', { raceId });
    
    try {
      const $ = await this.scrapePage(url);
      
      const raceInfo = {
        name: this.extractRaceName($),
        date: this.extractRaceDate($),
        location: this.extractRaceLocation($),
        country: this.extractRaceCountry($),
        category: this.extractRaceCategory($),
        distance: this.extractRaceDistance($),
        isMultiStage: this.isMultiStageRace($),
        totalStages: this.extractTotalStages($),
        raceType: this.extractRaceType($),
        profileType: this.extractProfileType($),
        website: url
      };
      
      // Validate race info
      const validation = this.validateRaceInfo(raceInfo);
      logValidation('race-info', validation, { raceId, sessionId: this.sessionId });
      
      return raceInfo;
      
    } catch (error) {
      this.logger.error('Failed to scrape race info', {
        raceId,
        url,
        error: error.message
      });
      
      // Return minimal race info to allow other scraping to continue
      return {
        name: `Race ${raceId}`,
        date: null,
        location: 'Unknown',
        country: 'Unknown',
        category: 'UNKNOWN',
        distance: null,
        isMultiStage: false,
        totalStages: 1,
        raceType: 'ROAD_RACE',
        profileType: 'unknown',
        website: url
      };
    }
  }
  
  /**
   * Scrape all stages of a multi-stage race
   */
  async scrapeAllStages(raceId, totalStages) {
    const stages = [];
    
    this.logger.info('Scraping multi-stage race', {
      raceId,
      totalStages,
      sessionId: this.sessionId
    });
    
    for (let stageNumber = 1; stageNumber <= totalStages; stageNumber++) {
      try {
        await this.sleep(this.config.delayBetweenRequests);
        
        const stageResult = await this.scrapeStageResults(raceId, stageNumber);
        if (stageResult && stageResult.results.length > 0) {
          stages.push(stageResult);
        }
        
        this.logger.debug('Stage scraped successfully', {
          raceId,
          stageNumber,
          resultsCount: stageResult?.results?.length || 0
        });
        
      } catch (error) {
        this.logger.warn('Failed to scrape stage', {
          raceId,
          stageNumber,
          error: error.message
        });
        
        // Continue with next stage rather than failing entire scraping
        continue;
      }
    }
    
    return stages;
  }
  
  /**
   * Scrape results for a specific stage
   */
  async scrapeStageResults(raceId, stageNumber) {
    const url = this.buildUrl('stageResults', { raceId, stageNumber });
    
    try {
      const $ = await this.scrapePage(url);
      
      const stageInfo = {
        stageNumber,
        name: this.extractStageName($),
        date: this.extractStageDate($),
        distance: this.extractStageDistance($),
        startLocation: this.extractStageStartLocation($),
        finishLocation: this.extractStageFinishLocation($),
        stageType: this.extractStageType($),
        elevationGain: this.extractStageElevation($),
        winner: this.extractStageWinner($),
        averageSpeed: this.extractAverageSpeed($)
      };
      
      const results = this.extractStageResultsTable($);
      
      return {
        stage: stageInfo,
        results: results,
        scrapedAt: new Date().toISOString()
      };
      
    } catch (error) {
      this.logger.error('Failed to scrape stage results', {
        raceId,
        stageNumber,
        url,
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Scrape single stage race results
   */
  async scrapeSingleStageResults(raceId) {
    const url = this.buildUrl('raceResults', { raceId });
    
    try {
      const $ = await this.scrapePage(url);
      
      const stageInfo = {
        stageNumber: 1,
        name: this.extractRaceName($),
        date: this.extractRaceDate($),
        distance: this.extractRaceDistance($),
        startLocation: this.extractRaceLocation($),
        finishLocation: this.extractRaceLocation($),
        stageType: this.extractRaceType($),
        elevationGain: this.extractRaceElevation($),
        winner: this.extractRaceWinner($),
        averageSpeed: this.extractAverageSpeed($)
      };
      
      const results = this.extractStageResultsTable($);
      
      return {
        stage: stageInfo,
        results: results,
        scrapedAt: new Date().toISOString()
      };
      
    } catch (error) {
      this.logger.error('Failed to scrape single stage results', {
        raceId,
        url,
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Scrape all classification standings
   */
  async scrapeAllClassifications(raceId) {
    const classifications = {};
    
    for (const [key, classificationType] of Object.entries(this.classificationTypeMap)) {
      try {
        await this.sleep(this.config.delayBetweenRequests);
        
        const classification = await this.scrapeClassification(raceId, key);
        classifications[key] = classification;
        
      } catch (error) {
        this.logger.warn('Failed to scrape classification', {
          raceId,
          classificationType: key,
          error: error.message
        });
        
        classifications[key] = [];
      }
    }
    
    return classifications;
  }
  
  /**
   * Scrape specific classification standings
   */
  async scrapeClassification(raceId, classificationType) {
    const urlKey = classificationType === 'gc' ? 'generalClassification' : 
                   classificationType === 'points' ? 'pointsClassification' :
                   classificationType === 'kom' ? 'mountainsClassification' :
                   classificationType === 'youth' ? 'youthClassification' :
                   'teamClassification';
    
    const url = this.buildUrl(urlKey, { raceId });
    
    try {
      const $ = await this.scrapePage(url);
      return this.extractClassificationTable($, classificationType);
      
    } catch (error) {
      this.logger.error('Failed to scrape classification', {
        raceId,
        classificationType,
        url,
        error: error.message
      });
      
      return [];
    }
  }
  
  /**
   * Scrape race start list
   */
  async scrapeStartList(raceId) {
    const url = this.buildUrl('startList', { raceId });
    
    try {
      const $ = await this.scrapePage(url);
      return this.extractStartListTable($);
      
    } catch (error) {
      this.logger.warn('Failed to scrape start list', {
        raceId,
        url,
        error: error.message
      });
      
      return [];
    }
  }
  
  /**
   * Extract stage results table
   */
  extractStageResultsTable($) {
    const results = [];
    
    // Look for results table - common selectors
    const tableSelectors = [
      'table.results',
      'table.restable',
      'table[class*=\"result\"]',
      '.result-cont table',
      'table.basic'
    ];
    
    let $table = null;
    for (const selector of tableSelectors) {
      $table = $(selector).first();
      if ($table.length > 0) break;
    }
    
    if (!$table || $table.length === 0) {
      this.logger.warn('No results table found');
      return results;
    }
    
    // Extract header to understand column positions
    const headers = [];
    $table.find('thead tr th, thead tr td').each((i, th) => {
      headers.push($(th).text().trim().toLowerCase());
    });
    
    // Map common column headers to our field names
    const columnMap = this.createColumnMap(headers);
    
    // Extract each result row
    $table.find('tbody tr').each((i, row) => {
      const $row = $(row);
      
      // Skip header rows or empty rows
      if ($row.hasClass('thead') || $row.find('td').length === 0) {
        return;
      }
      
      const result = this.extractResultFromRow($row, columnMap);
      
      if (result && result.rider && result.rider.name) {
        results.push(result);
      }
    });
    
    return results;
  }
  
  /**
   * Extract classification table
   */
  extractClassificationTable($, classificationType) {
    const standings = [];
    
    // Classification tables often have different selectors
    const tableSelectors = [
      'table.results',
      'table.restable', 
      '.classification-table',
      'table.basic'
    ];
    
    let $table = null;
    for (const selector of tableSelectors) {
      $table = $(selector).first();
      if ($table.length > 0) break;
    }
    
    if (!$table || $table.length === 0) {
      return standings;
    }
    
    // Extract header
    const headers = [];
    $table.find('thead tr th, thead tr td').each((i, th) => {
      headers.push($(th).text().trim().toLowerCase());
    });
    
    const columnMap = this.createColumnMap(headers);
    
    // Extract standings
    $table.find('tbody tr').each((i, row) => {
      const $row = $(row);
      
      if ($row.hasClass('thead') || $row.find('td').length === 0) {
        return;
      }
      
      const standing = this.extractClassificationFromRow($row, columnMap, classificationType);
      
      if (standing && standing.rider && standing.rider.name) {
        standings.push(standing);
      }
    });
    
    return standings;
  }
  
  /**
   * Extract start list table
   */
  extractStartListTable($) {
    const startList = [];
    
    const tableSelectors = [
      'table.startlist',
      'table.results',
      'table.basic'
    ];
    
    let $table = null;
    for (const selector of tableSelectors) {
      $table = $(selector).first();
      if ($table.length > 0) break;
    }
    
    if (!$table || $table.length === 0) {
      return startList;
    }
    
    // Extract riders from start list
    $table.find('tbody tr').each((i, row) => {
      const $row = $(row);
      
      const rider = this.extractRiderFromStartList($row);
      if (rider && rider.name) {
        startList.push(rider);
      }
    });
    
    return startList;
  }
  
  /**
   * Extract individual result from table row
   */
  extractResultFromRow($row, columnMap) {
    const cells = $row.find('td');
    
    if (cells.length === 0) {
      return null;
    }
    
    const result = {
      position: null,
      rider: {
        name: null,
        team: null,
        nationality: null,
        bibNumber: null
      },
      time: {
        finishTime: null,
        timeBehind: null,
        finishTimeSeconds: null,
        timeBehindSeconds: null
      },
      points: null,
      status: 'FINISHED',
      bonusSeconds: null,
      penaltySeconds: null
    };
    
    // Extract position
    if (columnMap.position !== -1) {
      const posText = $(cells[columnMap.position]).text().trim();
      result.position = this.parsePosition(posText);
    }
    
    // Extract rider info
    if (columnMap.rider !== -1) {
      const riderCell = $(cells[columnMap.rider]);
      result.rider = this.extractRiderInfo(riderCell);
    }
    
    // Extract time
    if (columnMap.time !== -1) {
      const timeText = $(cells[columnMap.time]).text().trim();
      result.time = this.parseTimeData(timeText);
    }
    
    // Extract time behind
    if (columnMap.gap !== -1) {
      const gapText = $(cells[columnMap.gap]).text().trim();
      result.time.timeBehind = gapText;
      result.time.timeBehindSeconds = this.parseTimeToSeconds(gapText);
    }
    
    // Extract points
    if (columnMap.points !== -1) {
      const pointsText = $(cells[columnMap.points]).text().trim();
      result.points = this.parsePoints(pointsText);
    }
    
    // Extract status (DNF, DNS, etc.)
    const statusText = $row.text().toLowerCase();
    for (const [key, value] of Object.entries(this.resultStatusMap)) {
      if (statusText.includes(key)) {
        result.status = value;
        break;
      }
    }
    
    return result;
  }
  
  /**
   * Extract classification standing from row
   */
  extractClassificationFromRow($row, columnMap, classificationType) {
    const cells = $row.find('td');
    
    if (cells.length === 0) {
      return null;
    }
    
    const standing = {
      position: null,
      rider: {
        name: null,
        team: null,
        nationality: null
      },
      points: null,
      time: null,
      timeBehind: null,
      classificationType: this.classificationTypeMap[classificationType] || 'GENERAL_CLASSIFICATION'
    };
    
    // Extract position
    if (columnMap.position !== -1) {
      const posText = $(cells[columnMap.position]).text().trim();
      standing.position = this.parsePosition(posText);
    }
    
    // Extract rider info
    if (columnMap.rider !== -1) {
      const riderCell = $(cells[columnMap.rider]);
      standing.rider = this.extractRiderInfo(riderCell);
    }
    
    // Extract points (for points/mountains classifications)
    if (columnMap.points !== -1) {
      const pointsText = $(cells[columnMap.points]).text().trim();
      standing.points = this.parsePoints(pointsText);
    }
    
    // Extract time (for GC)
    if (columnMap.time !== -1) {
      const timeText = $(cells[columnMap.time]).text().trim();
      standing.time = timeText;
    }
    
    // Extract time behind
    if (columnMap.gap !== -1) {
      const gapText = $(cells[columnMap.gap]).text().trim();
      standing.timeBehind = gapText;
    }
    
    return standing;
  }
  
  /**
   * Extract rider information from start list row
   */
  extractRiderFromStartList($row) {
    const cells = $row.find('td');
    
    if (cells.length === 0) {
      return null;
    }
    
    const rider = {
      bibNumber: null,
      name: null,
      team: null,
      nationality: null,
      age: null,
      category: null
    };
    
    // Common patterns for start list extraction
    cells.each((i, cell) => {
      const $cell = $(cell);
      const text = $cell.text().trim();
      
      // Try to identify content based on patterns
      if (i === 0 && /^\d+$/.test(text)) {
        rider.bibNumber = parseInt(text);
      } else if ($cell.find('a').length > 0) {
        // Links usually contain rider names
        rider.name = $cell.find('a').text().trim();
      } else if (text.length > 3 && !rider.name) {
        rider.name = text;
      } else if (text.match(/^[A-Z]{2,3}$/)) {
        // Country codes
        rider.nationality = text;
      } else if (text.includes('Team') || text.length > 10) {
        // Likely team name
        rider.team = text;
      }
    });
    
    return rider.name ? rider : null;
  }
  
  /**
   * Create column mapping from table headers
   */
  createColumnMap(headers) {
    const columnMap = {
      position: -1,
      rider: -1,
      team: -1,
      time: -1,
      gap: -1,
      points: -1,
      bonus: -1,
      penalty: -1
    };
    
    headers.forEach((header, index) => {
      const cleanHeader = header.toLowerCase().replace(/[^a-z]/g, '');
      
      if (cleanHeader.includes('pos') || cleanHeader.includes('rank') || cleanHeader === '#') {
        columnMap.position = index;
      } else if (cleanHeader.includes('rider') || cleanHeader.includes('name')) {
        columnMap.rider = index;
      } else if (cleanHeader.includes('team')) {
        columnMap.team = index;
      } else if (cleanHeader.includes('time') && !cleanHeader.includes('behind')) {
        columnMap.time = index;
      } else if (cleanHeader.includes('gap') || cleanHeader.includes('behind') || cleanHeader.includes('+')) {
        columnMap.gap = index;
      } else if (cleanHeader.includes('point') || cleanHeader.includes('pts')) {
        columnMap.points = index;
      } else if (cleanHeader.includes('bonus')) {
        columnMap.bonus = index;
      } else if (cleanHeader.includes('penalty') || cleanHeader.includes('pen')) {
        columnMap.penalty = index;
      }
    });
    
    return columnMap;
  }
  
  /**
   * Extract rider information from cell
   */
  extractRiderInfo($cell) {
    const rider = {
      name: null,
      team: null,
      nationality: null,
      bibNumber: null
    };
    
    // Extract rider name (usually in a link)
    const $link = $cell.find('a').first();
    if ($link.length > 0) {
      rider.name = $link.text().trim();
    } else {
      rider.name = $cell.text().trim();
    }
    
    // Extract team (often in parentheses or separate element)
    const teamMatch = $cell.text().match(/\\(([^)]+)\\)/);
    if (teamMatch) {
      rider.team = teamMatch[1];
    }
    
    // Extract nationality (often as flag or country code)
    const $flag = $cell.find('.flag, .country');
    if ($flag.length > 0) {
      rider.nationality = $flag.attr('title') || $flag.text().trim();
    }
    
    // Clean up rider name
    if (rider.name) {
      rider.name = rider.name.replace(/\\s*\\([^)]*\\)\\s*/, '').trim();
    }
    
    return rider;
  }
  
  /**
   * Parse position text to number
   */
  parsePosition(posText) {
    if (!posText) return null;
    
    const cleanPos = posText.replace(/[^0-9]/g, '');
    const position = parseInt(cleanPos);
    
    return isNaN(position) ? null : position;
  }
  
  /**
   * Parse time data and convert to seconds
   */
  parseTimeData(timeText) {
    if (!timeText) {
      return {
        finishTime: null,
        finishTimeSeconds: null
      };
    }
    
    const timeSeconds = this.parseTimeToSeconds(timeText);
    
    return {
      finishTime: timeText,
      finishTimeSeconds: timeSeconds
    };
  }
  
  /**
   * Convert time string to seconds
   */
  parseTimeToSeconds(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') {
      return null;
    }
    
    // Remove common prefixes/suffixes
    const cleanTime = timeStr.replace(/^[+\\-]/, '').trim();
    
    // Handle "same time" or similar
    if (cleanTime.toLowerCase().includes('same') || cleanTime === '' || cleanTime === '-') {
      return 0;
    }
    
    // Parse different time formats
    
    // Format: HH:MM:SS or H:MM:SS
    let match = cleanTime.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const seconds = parseInt(match[3]);
      return hours * 3600 + minutes * 60 + seconds;
    }
    
    // Format: MM:SS or M:SS
    match = cleanTime.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      return minutes * 60 + seconds;
    }
    
    // Format: XXs (seconds only)
    match = cleanTime.match(/^(\d+)s?$/);
    if (match) {
      return parseInt(match[1]);
    }
    
    // Format: XXm XXs or XX' XX\"
    match = cleanTime.match(/^(\d+)[m'](\s*(\d+)[s"]?)?$/);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = match[3] ? parseInt(match[3]) : 0;
      return minutes * 60 + seconds;
    }
    
    this.logger.debug('Could not parse time format', { timeStr, cleanTime });
    return null;
  }
  
  /**
   * Parse points value
   */
  parsePoints(pointsText) {
    if (!pointsText) return null;
    
    const cleanPoints = pointsText.replace(/[^0-9]/g, '');
    const points = parseInt(cleanPoints);
    
    return isNaN(points) ? null : points;
  }
  
  /**
   * Extract various race/stage information fields
   */
  extractRaceName($) {
    return $('.main h1').first().text().trim() || 
           $('h1.race-title').text().trim() ||
           $('title').text().split(' - ')[0] ||
           'Unknown Race';
  }
  
  extractRaceDate($) {
    const dateSelectors = [
      '.race-date',
      '.date',
      '[class*=\"date\"]'
    ];
    
    for (const selector of dateSelectors) {
      const dateText = $(selector).first().text().trim();
      if (dateText) {
        const parsedDate = moment(dateText, ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'MMMM DD, YYYY']);
        if (parsedDate.isValid()) {
          return parsedDate.format('YYYY-MM-DD');
        }
      }
    }
    
    return null;
  }
  
  extractRaceLocation($) {
    return $('.race-location').text().trim() || 
           $('.location').text().trim() ||
           'Unknown';
  }
  
  extractRaceCountry($) {
    const flagEl = $('.flag').first();
    return flagEl.attr('title') || flagEl.attr('alt') || 'Unknown';
  }
  
  extractRaceCategory($) {
    const categoryText = $('.race-category, .category').text().trim().toUpperCase();
    
    // Map to our enum values
    if (categoryText.includes('WORLD TOUR')) return 'WORLD_TOUR';
    if (categoryText.includes('PRO SERIES')) return 'PRO_SERIES';
    if (categoryText.includes('CONTINENTAL')) return 'CONTINENTAL';
    if (categoryText.includes('NATIONAL')) return 'NATIONAL';
    
    return 'PROFESSIONAL';
  }
  
  extractRaceDistance($) {
    const distanceText = $('.distance, .race-distance').text();
    const match = distanceText.match(/(\d+(?:\.\d+)?)\s*km/i);
    return match ? parseFloat(match[1]) : null;
  }
  
  isMultiStageRace($) {
    const pageText = $.text().toLowerCase();
    return pageText.includes('stage') && 
           (pageText.includes('gc') || pageText.includes('general classification') ||
            pageText.includes('overall') || $('.stage-nav').length > 0);
  }
  
  extractTotalStages($) {
    const stageLinks = $('.stage-nav a, .stages a').length;
    return stageLinks > 0 ? stageLinks : 1;
  }
  
  extractRaceType($) {
    const typeText = $('.race-type, .type').text().trim().toLowerCase();
    
    if (typeText.includes('time trial')) return 'TIME_TRIAL';
    if (typeText.includes('criterium')) return 'CRITERIUM';
    if (typeText.includes('classic')) return 'ONE_DAY_CLASSIC';
    
    return 'ROAD_RACE';
  }
  
  extractProfileType($) {
    const profileText = $('.profile, .race-profile').text().toLowerCase();
    
    if (profileText.includes('mountain')) return 'mountain';
    if (profileText.includes('hill')) return 'hilly';
    if (profileText.includes('flat')) return 'flat';
    
    return 'mixed';
  }
  
  extractStageName($) {
    return $('.stage-title h1, .stage-name').first().text().trim() || 'Stage';
  }
  
  extractStageDate($) {
    return this.extractRaceDate($);
  }
  
  extractStageDistance($) {
    return this.extractRaceDistance($);
  }
  
  extractStageStartLocation($) {
    const startText = $('.start-location, .stage-start').text().trim();
    return startText || 'Unknown';
  }
  
  extractStageFinishLocation($) {
    const finishText = $('.finish-location, .stage-finish').text().trim();
    return finishText || 'Unknown';
  }
  
  extractStageType($) {
    const typeText = $('.stage-type, .profile').text().toLowerCase();
    
    for (const [key, value] of Object.entries(this.stageTypeMap)) {
      if (typeText.includes(key)) {
        return value;
      }
    }
    
    return 'FLAT_STAGE';
  }
  
  extractStageElevation($) {
    const elevText = $('.elevation, .climb').text();
    const match = elevText.match(/(\d+)\s*m/i);
    return match ? parseInt(match[1]) : null;
  }
  
  extractStageWinner($) {
    const winnerEl = $('.winner a, .first-place a').first();
    return winnerEl.text().trim() || null;
  }
  
  extractRaceWinner($) {
    return this.extractStageWinner($);
  }
  
  extractRaceElevation($) {
    return this.extractStageElevation($);
  }
  
  extractAverageSpeed($) {
    const speedText = $('.avg-speed, .average-speed').text();
    const match = speedText.match(/(\d+(?:\.\d+)?)\s*km\/h/i);
    return match ? parseFloat(match[1]) : null;
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
   * Validate race information
   */
  validateRaceInfo(raceInfo) {
    const errors = [];
    const warnings = [];
    
    if (!raceInfo.name || raceInfo.name === 'Unknown Race') {
      errors.push('Race name is missing or invalid');
    }
    
    if (!raceInfo.date) {
      warnings.push('Race date could not be determined');
    }
    
    if (raceInfo.location === 'Unknown') {
      warnings.push('Race location could not be determined');
    }
    
    if (raceInfo.isMultiStage && (!raceInfo.totalStages || raceInfo.totalStages < 2)) {
      warnings.push('Multi-stage race detected but stage count seems incorrect');
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
  calculateDataQuality(results) {
    const metrics = {
      raceInfoCompleteness: 0,
      stageDataCompleteness: 0,
      resultCompleteness: 0,
      classificationCompleteness: 0,
      overallScore: 0
    };
    
    // Race info completeness
    const raceInfoFields = ['name', 'date', 'location', 'country', 'category'];
    const completeRaceFields = raceInfoFields.filter(field => 
      results.raceInfo[field] && results.raceInfo[field] !== 'Unknown'
    );
    metrics.raceInfoCompleteness = completeRaceFields.length / raceInfoFields.length;
    
    // Stage data completeness
    if (results.stages.length > 0) {
      const stageCompleteness = results.stages.map(stage => {
        const stageFields = ['name', 'date', 'distance', 'stageType'];
        const completeStageFields = stageFields.filter(field => 
          stage.stage[field] && stage.stage[field] !== 'Unknown'
        );
        return completeStageFields.length / stageFields.length;
      });
      
      metrics.stageDataCompleteness = stageCompleteness.reduce((a, b) => a + b, 0) / stageCompleteness.length;
    }
    
    // Result completeness
    const totalResults = results.stages.reduce((sum, stage) => sum + stage.results.length, 0);
    const completeResults = results.stages.reduce((sum, stage) => {
      return sum + stage.results.filter(result => 
        result.rider.name && result.position
      ).length;
    }, 0);
    
    metrics.resultCompleteness = totalResults > 0 ? completeResults / totalResults : 0;
    
    // Classification completeness
    const classificationKeys = Object.keys(results.classifications);
    const nonEmptyClassifications = classificationKeys.filter(key => 
      results.classifications[key].length > 0
    );
    
    metrics.classificationCompleteness = classificationKeys.length > 0 ? 
      nonEmptyClassifications.length / classificationKeys.length : 0;
    
    // Overall score (weighted average)
    metrics.overallScore = (
      metrics.raceInfoCompleteness * 0.2 +
      metrics.stageDataCompleteness * 0.3 +
      metrics.resultCompleteness * 0.4 +
      metrics.classificationCompleteness * 0.1
    );
    
    return metrics;
  }
}

module.exports = RaceResultsScraper;