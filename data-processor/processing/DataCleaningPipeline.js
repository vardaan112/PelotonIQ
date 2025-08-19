const _ = require('lodash');
const moment = require('moment');
const Joi = require('joi');
const { 
  logger, 
  createComponentLogger, 
  logDataQuality, 
  logError,
  logValidation,
  logPerformance 
} = require('../config/logger');

/**
 * DataCleaningPipeline - Transforms raw scraped data into standardized, validated formats
 * Handles name standardization, time conversion, data validation, and quality scoring
 */
class DataCleaningPipeline {
  constructor(options = {}) {
    this.logger = createComponentLogger('DataCleaningPipeline');
    this.config = {
      enableValidation: options.enableValidation ?? true,
      qualityThreshold: options.qualityThreshold || parseFloat(process.env.DATA_QUALITY_THRESHOLD) || 0.85,
      strictMode: options.strictMode ?? false,
      preserveOriginal: options.preserveOriginal ?? true
    };
    
    // Name standardization patterns
    this.namePatterns = {
      // Common name variations
      replacements: {
        'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
        'á': 'a', 'à': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a',
        'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
        'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o',
        'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
        'ñ': 'n', 'ç': 'c',
        'ý': 'y', 'ÿ': 'y'
      },
      
      // Common team name variations
      teamMappings: {
        'Team Jumbo-Visma': 'Jumbo-Visma',
        'Team INEOS Grenadiers': 'INEOS Grenadiers',
        'Team Sky': 'Sky',
        'Quick-Step Alpha Vinyl Team': 'Quick-Step Alpha Vinyl',
        'UAE Team Emirates': 'UAE Team Emirates',
        'Deceuninck - Quick-Step': 'Quick-Step Alpha Vinyl',
        'Team DSM': 'DSM',
        'AG2R Citroën Team': 'AG2R Citroën',
        'Groupama - FDJ': 'Groupama-FDJ'
      },
      
      // Common rider name issues
      riderNamePatterns: [
        { pattern: /\\s+/g, replacement: ' ' }, // Multiple spaces
        { pattern: /^\\s+|\\s+$/g, replacement: '' }, // Leading/trailing spaces
        { pattern: /\\([^)]*\\)/g, replacement: '' }, // Remove parentheses content
        { pattern: /\\s*-\\s*/g, replacement: '-' }, // Standardize hyphens
        { pattern: /\\s*\\.\\s*/g, replacement: '. ' } // Standardize periods
      ]
    };
    
    // Validation schemas
    this.schemas = this.createValidationSchemas();
    
    // Statistics tracking
    this.stats = {
      processed: 0,
      cleaned: 0,
      validated: 0,
      failed: 0,
      qualityScores: [],
      errors: [],
      warnings: []
    };
    
    this.logger.info('DataCleaningPipeline initialized', {
      config: this.config
    });
  }
  
  /**
   * Main processing method for race results data
   */
  async processRaceResults(rawData, options = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Processing race results data', {
        raceId: rawData.raceId,
        stagesCount: rawData.stages?.length || 0,
        options
      });
      
      const cleanedData = {
        ...rawData,
        processedAt: new Date().toISOString(),
        dataQuality: {},
        validationResults: {}
      };
      
      // Clean race information
      if (cleanedData.raceInfo) {
        cleanedData.raceInfo = this.cleanRaceInfo(cleanedData.raceInfo);
      }
      
      // Clean stages and results
      if (cleanedData.stages && Array.isArray(cleanedData.stages)) {
        cleanedData.stages = await Promise.all(
          cleanedData.stages.map(stage => this.cleanStageData(stage))
        );
      }
      
      // Clean classifications
      if (cleanedData.classifications) {
        cleanedData.classifications = this.cleanClassifications(cleanedData.classifications);
      }
      
      // Clean start list
      if (cleanedData.startList && Array.isArray(cleanedData.startList)) {
        cleanedData.startList = cleanedData.startList.map(rider => this.cleanRiderInfo(rider));
      }
      
      // Validate cleaned data
      if (this.config.enableValidation) {
        cleanedData.validationResults = this.validateRaceResults(cleanedData);
      }
      
      // Calculate data quality
      cleanedData.dataQuality = this.calculateRaceResultsQuality(cleanedData);
      
      // Update statistics
      this.updateStats(cleanedData);
      
      logDataQuality('race-results-cleaned', cleanedData.dataQuality, {
        raceId: rawData.raceId,
        duration: Date.now() - startTime,
        stagesProcessed: cleanedData.stages?.length || 0
      });
      
      return cleanedData;
      
    } catch (error) {
      this.stats.failed++;
      logError(error, {
        raceId: rawData.raceId,
        operation: 'race-results-cleaning',
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Main processing method for rider profile data
   */
  async processRiderProfile(rawData, options = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Processing rider profile data', {
        riderId: rawData.riderId,
        riderName: rawData.personalInfo?.name,
        options
      });
      
      const cleanedData = {
        ...rawData,
        processedAt: new Date().toISOString(),
        dataQuality: {},
        validationResults: {}
      };
      
      // Clean personal information
      if (cleanedData.personalInfo) {
        cleanedData.personalInfo = this.cleanPersonalInfo(cleanedData.personalInfo);
      }
      
      // Clean career statistics
      if (cleanedData.careerStats) {
        cleanedData.careerStats = this.cleanCareerStats(cleanedData.careerStats);
      }
      
      // Clean team history
      if (cleanedData.teamHistory && Array.isArray(cleanedData.teamHistory)) {
        cleanedData.teamHistory = cleanedData.teamHistory.map(entry => 
          this.cleanTeamHistoryEntry(entry)
        );
      }
      
      // Clean recent results
      if (cleanedData.recentResults && Array.isArray(cleanedData.recentResults)) {
        cleanedData.recentResults = cleanedData.recentResults.map(result => 
          this.cleanRaceResult(result)
        );
      }
      
      // Clean palmares
      if (cleanedData.palmares && Array.isArray(cleanedData.palmares)) {
        cleanedData.palmares = cleanedData.palmares.map(entry => 
          this.cleanPalmaresEntry(entry)
        );
      }
      
      // Validate cleaned data
      if (this.config.enableValidation) {
        cleanedData.validationResults = this.validateRiderProfile(cleanedData);
      }
      
      // Calculate data quality
      cleanedData.dataQuality = this.calculateRiderProfileQuality(cleanedData);
      
      // Update statistics
      this.updateStats(cleanedData);
      
      logDataQuality('rider-profile-cleaned', cleanedData.dataQuality, {
        riderId: rawData.riderId,
        duration: Date.now() - startTime,
        riderName: cleanedData.personalInfo?.name
      });
      
      return cleanedData;
      
    } catch (error) {
      this.stats.failed++;
      logError(error, {
        riderId: rawData.riderId,
        operation: 'rider-profile-cleaning',
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Clean race information
   */
  cleanRaceInfo(raceInfo) {
    const cleaned = { ...raceInfo };
    
    // Standardize race name
    if (cleaned.name) {
      cleaned.name = this.standardizeText(cleaned.name);
      cleaned.name = cleaned.name.replace(/\\s+/g, ' ').trim();
    }
    
    // Standardize and validate date
    if (cleaned.date) {
      cleaned.date = this.standardizeDate(cleaned.date);
    }
    
    // Standardize location
    if (cleaned.location) {
      cleaned.location = this.standardizeText(cleaned.location);
    }
    
    // Standardize country
    if (cleaned.country) {
      cleaned.country = this.standardizeCountry(cleaned.country);
    }
    
    // Validate and standardize distance
    if (cleaned.distance) {
      cleaned.distance = this.standardizeDistance(cleaned.distance);
    }
    
    // Validate stage information for multi-stage races
    if (cleaned.isMultiStage) {
      if (!cleaned.totalStages || cleaned.totalStages < 2) {
        cleaned.totalStages = null;
        this.logger.warn('Multi-stage race with invalid stage count', {
          raceName: cleaned.name,
          totalStages: cleaned.totalStages
        });
      }
    }
    
    return cleaned;
  }
  
  /**
   * Clean stage data
   */
  async cleanStageData(stageData) {
    const cleaned = { ...stageData };
    
    // Clean stage information
    if (cleaned.stage) {
      cleaned.stage = {
        ...cleaned.stage,
        name: this.standardizeText(cleaned.stage.name),
        startLocation: this.standardizeText(cleaned.stage.startLocation),
        finishLocation: this.standardizeText(cleaned.stage.finishLocation),
        date: this.standardizeDate(cleaned.stage.date),
        distance: this.standardizeDistance(cleaned.stage.distance),
        elevationGain: this.standardizeElevation(cleaned.stage.elevationGain),
        averageSpeed: this.standardizeSpeed(cleaned.stage.averageSpeed)
      };
      
      // Validate stage number
      if (cleaned.stage.stageNumber && (cleaned.stage.stageNumber < 1 || cleaned.stage.stageNumber > 50)) {
        this.logger.warn('Invalid stage number', {
          stageNumber: cleaned.stage.stageNumber,
          stageName: cleaned.stage.name
        });
      }
    }
    
    // Clean stage results
    if (cleaned.results && Array.isArray(cleaned.results)) {
      cleaned.results = cleaned.results
        .map(result => this.cleanStageResult(result))
        .filter(result => result !== null);
      
      // Sort by position
      cleaned.results.sort((a, b) => (a.position || 999) - (b.position || 999));
      
      // Validate position sequence
      this.validatePositionSequence(cleaned.results);
    }
    
    return cleaned;
  }
  
  /**
   * Clean individual stage result
   */
  cleanStageResult(result) {
    if (!result || !result.rider || !result.rider.name) {
      return null;
    }
    
    const cleaned = {
      position: this.standardizePosition(result.position),
      rider: this.cleanRiderInfo(result.rider),
      time: this.cleanTimeData(result.time),
      points: this.standardizePoints(result.points),
      status: this.standardizeResultStatus(result.status),
      bonusSeconds: this.standardizeSeconds(result.bonusSeconds),
      penaltySeconds: this.standardizeSeconds(result.penaltySeconds)
    };
    
    // Validate result consistency
    if (cleaned.status !== 'FINISHED' && cleaned.position) {
      this.logger.warn('Non-finished rider has position', {
        rider: cleaned.rider.name,
        status: cleaned.status,
        position: cleaned.position
      });
    }
    
    return cleaned;
  }
  
  /**
   * Clean classifications data
   */
  cleanClassifications(classifications) {
    const cleaned = {};
    
    for (const [key, standings] of Object.entries(classifications)) {
      if (Array.isArray(standings)) {
        cleaned[key] = standings
          .map(standing => this.cleanClassificationStanding(standing))
          .filter(standing => standing !== null)
          .sort((a, b) => (a.position || 999) - (b.position || 999));
      } else {
        cleaned[key] = standings;
      }
    }
    
    return cleaned;
  }
  
  /**
   * Clean classification standing
   */
  cleanClassificationStanding(standing) {
    if (!standing || !standing.rider || !standing.rider.name) {
      return null;
    }
    
    return {
      position: this.standardizePosition(standing.position),
      rider: this.cleanRiderInfo(standing.rider),
      points: this.standardizePoints(standing.points),
      time: this.standardizeTime(standing.time),
      timeBehind: this.standardizeTime(standing.timeBehind),
      classificationType: standing.classificationType
    };
  }
  
  /**
   * Clean rider information
   */
  cleanRiderInfo(rider) {
    if (!rider) {
      return null;
    }
    
    const cleaned = {
      name: this.standardizeRiderName(rider.name),
      team: this.standardizeTeamName(rider.team),
      nationality: this.standardizeCountry(rider.nationality),
      bibNumber: this.standardizeBibNumber(rider.bibNumber)
    };
    
    // Remove null/undefined values
    Object.keys(cleaned).forEach(key => {
      if (cleaned[key] === null || cleaned[key] === undefined || cleaned[key] === '') {
        delete cleaned[key];
      }
    });
    
    return cleaned.name ? cleaned : null;
  }
  
  /**
   * Clean personal information for rider profiles
   */
  cleanPersonalInfo(personalInfo) {
    const cleaned = { ...personalInfo };
    
    // Standardize names
    if (cleaned.name) {
      cleaned.name = this.standardizeRiderName(cleaned.name);
      
      // Update first/last name if main name was cleaned
      const nameParts = cleaned.name.split(' ');
      cleaned.firstName = nameParts[0];
      cleaned.lastName = nameParts.slice(1).join(' ');
    }
    
    // Standardize team
    if (cleaned.team) {
      cleaned.team = this.standardizeTeamName(cleaned.team);
    }
    
    // Standardize nationality
    if (cleaned.nationality) {
      cleaned.nationality = this.standardizeCountry(cleaned.nationality);
    }
    
    // Validate and standardize dates
    if (cleaned.dateOfBirth) {
      cleaned.dateOfBirth = this.standardizeDate(cleaned.dateOfBirth);
      
      // Recalculate age if date was changed
      if (cleaned.dateOfBirth) {
        const birthDate = moment(cleaned.dateOfBirth);
        if (birthDate.isValid()) {
          cleaned.age = moment().diff(birthDate, 'years');
        }
      }
    }
    
    // Validate physical measurements
    if (cleaned.height) {
      cleaned.height = this.standardizeHeight(cleaned.height);
    }
    
    if (cleaned.weight) {
      cleaned.weight = this.standardizeWeight(cleaned.weight);
    }
    
    // Validate year values
    if (cleaned.turnedPro) {
      cleaned.turnedPro = this.standardizeYear(cleaned.turnedPro);
    }
    
    return cleaned;
  }
  
  /**
   * Clean career statistics
   */
  cleanCareerStats(careerStats) {
    const cleaned = { ...careerStats };
    
    // Ensure all numeric fields are proper numbers
    const numericFields = ['totalWins', 'podiums', 'top10s', 'racesDays', 'points', 'seasons'];
    
    numericFields.forEach(field => {
      if (cleaned[field] !== null && cleaned[field] !== undefined) {
        const num = parseInt(cleaned[field]);
        cleaned[field] = isNaN(num) ? 0 : Math.max(0, num);
      }
    });
    
    // Validate logical consistency
    if (cleaned.totalWins > cleaned.podiums) {
      cleaned.podiums = Math.max(cleaned.podiums, cleaned.totalWins);
    }
    
    if (cleaned.podiums > cleaned.top10s) {
      cleaned.top10s = Math.max(cleaned.top10s, cleaned.podiums);
    }
    
    return cleaned;
  }
  
  /**
   * Clean team history entry
   */
  cleanTeamHistoryEntry(entry) {
    const cleaned = {
      teamName: this.standardizeTeamName(entry.teamName),
      startYear: this.standardizeYear(entry.startYear),
      endYear: this.standardizeYear(entry.endYear),
      role: entry.role,
      isCurrentTeam: Boolean(entry.isCurrentTeam)
    };
    
    // Validate year range
    if (cleaned.startYear && cleaned.endYear && cleaned.startYear > cleaned.endYear) {
      this.logger.warn('Invalid team history date range', {
        teamName: cleaned.teamName,
        startYear: cleaned.startYear,
        endYear: cleaned.endYear
      });
      
      // Swap if only off by one year (likely data entry error)
      if (cleaned.startYear - cleaned.endYear === 1) {
        [cleaned.startYear, cleaned.endYear] = [cleaned.endYear, cleaned.startYear];
      }
    }
    
    return cleaned.teamName ? cleaned : null;
  }
  
  /**
   * Clean race result entry
   */
  cleanRaceResult(result) {
    return {
      date: this.standardizeDate(result.date),
      raceName: this.standardizeText(result.raceName),
      category: result.category,
      position: this.standardizePosition(result.position),
      points: this.standardizePoints(result.points),
      team: this.standardizeTeamName(result.team)
    };
  }
  
  /**
   * Clean palmares entry
   */
  cleanPalmaresEntry(entry) {
    return {
      raceName: this.standardizeText(entry.raceName),
      year: this.standardizeYear(entry.year),
      category: entry.category,
      position: this.standardizePosition(entry.position) || 1,
      importance: entry.importance
    };
  }
  
  /**
   * Clean time data structure
   */
  cleanTimeData(timeData) {
    if (!timeData || typeof timeData !== 'object') {
      return {
        finishTime: null,
        finishTimeSeconds: null,
        timeBehind: null,
        timeBehindSeconds: null
      };
    }
    
    return {
      finishTime: this.standardizeTime(timeData.finishTime),
      finishTimeSeconds: this.standardizeSeconds(timeData.finishTimeSeconds),
      timeBehind: this.standardizeTime(timeData.timeBehind),
      timeBehindSeconds: this.standardizeSeconds(timeData.timeBehindSeconds)
    };
  }
  
  /**
   * Standardization helper methods
   */
  standardizeText(text) {
    if (!text || typeof text !== 'string') {
      return null;
    }
    
    let cleaned = text.trim();
    
    // Remove multiple spaces
    cleaned = cleaned.replace(/\\s+/g, ' ');
    
    // Standard unicode normalization
    cleaned = cleaned.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
    
    return cleaned || null;
  }
  
  standardizeRiderName(name) {
    if (!name) return null;
    
    let cleaned = this.standardizeText(name);
    if (!cleaned) return null;
    
    // Apply rider name patterns
    this.namePatterns.riderNamePatterns.forEach(({ pattern, replacement }) => {
      cleaned = cleaned.replace(pattern, replacement);
    });
    
    // Apply character replacements
    Object.entries(this.namePatterns.replacements).forEach(([char, replacement]) => {
      cleaned = cleaned.replace(new RegExp(char, 'g'), replacement);
    });
    
    // Capitalize properly
    cleaned = cleaned.split(' ')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
    
    return cleaned.trim() || null;
  }
  
  standardizeTeamName(teamName) {
    if (!teamName) return null;
    
    let cleaned = this.standardizeText(teamName);
    if (!cleaned) return null;
    
    // Check for known team mappings
    if (this.namePatterns.teamMappings[cleaned]) {
      return this.namePatterns.teamMappings[cleaned];
    }
    
    // Remove common prefixes/suffixes
    cleaned = cleaned.replace(/^Team\\s+/i, '');
    cleaned = cleaned.replace(/\\s+Team$/i, '');
    
    return cleaned.trim() || null;
  }
  
  standardizeCountry(country) {
    if (!country || country === 'Unknown') return null;
    
    let cleaned = this.standardizeText(country);
    if (!cleaned) return null;
    
    // Convert to standard country codes or names
    const countryMappings = {
      'GBR': 'United Kingdom',
      'UK': 'United Kingdom',
      'USA': 'United States',
      'US': 'United States',
      'NED': 'Netherlands',
      'GER': 'Germany',
      'FRA': 'France',
      'ITA': 'Italy',
      'ESP': 'Spain',
      'BEL': 'Belgium',
      'SUI': 'Switzerland',
      'AUS': 'Australia',
      'CAN': 'Canada'
    };
    
    return countryMappings[cleaned.toUpperCase()] || cleaned;
  }
  
  standardizeDate(dateStr) {
    if (!dateStr) return null;
    
    const date = moment(dateStr, [
      'YYYY-MM-DD',
      'DD/MM/YYYY',
      'MM/DD/YYYY',
      'DD-MM-YYYY',
      'YYYY/MM/DD',
      'MMMM DD, YYYY',
      'DD MMMM YYYY'
    ]);
    
    if (!date.isValid()) {
      return null;
    }
    
    // Validate reasonable date range for cycling
    const minYear = 1900;
    const maxYear = new Date().getFullYear() + 2;
    
    if (date.year() < minYear || date.year() > maxYear) {
      return null;
    }
    
    return date.format('YYYY-MM-DD');
  }
  
  standardizeTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') {
      return null;
    }
    
    // Remove extra whitespace and common prefixes
    let cleaned = timeStr.trim().replace(/^[+\\-]/, '');
    
    // Handle "same time" cases
    if (cleaned.toLowerCase().includes('same') || cleaned === '' || cleaned === '-') {
      return '00:00:00';
    }
    
    // Try to parse and standardize format
    const timeRegex = /^(\\d{1,2}):(\\d{2})(?::(\\d{2}))?$/;
    const match = cleaned.match(timeRegex);
    
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const seconds = parseInt(match[3] || '0');
      
      // Validate time components
      if (minutes >= 60 || seconds >= 60) {
        return null;
      }
      
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    return null;
  }
  
  standardizeSeconds(seconds) {
    if (seconds === null || seconds === undefined) {
      return null;
    }
    
    const num = parseInt(seconds);
    if (isNaN(num)) {
      return null;
    }
    
    // Validate reasonable range (0 to 24 hours)
    if (num < 0 || num > 86400) {
      return null;
    }
    
    return num;
  }
  
  standardizePosition(position) {
    if (position === null || position === undefined) {
      return null;
    }
    
    const num = parseInt(position);
    if (isNaN(num) || num < 1 || num > 1000) {
      return null;
    }
    
    return num;
  }
  
  standardizePoints(points) {
    if (points === null || points === undefined) {
      return null;
    }
    
    const num = parseInt(points);
    if (isNaN(num) || num < 0 || num > 10000) {
      return null;
    }
    
    return num;
  }
  
  standardizeDistance(distance) {
    if (distance === null || distance === undefined) {
      return null;
    }
    
    const num = parseFloat(distance);
    if (isNaN(num) || num <= 0 || num > 1000) {
      return null;
    }
    
    return Math.round(num * 100) / 100; // Round to 2 decimal places
  }
  
  standardizeElevation(elevation) {
    if (elevation === null || elevation === undefined) {
      return null;
    }
    
    const num = parseInt(elevation);
    if (isNaN(num) || num < 0 || num > 15000) {
      return null;
    }
    
    return num;
  }
  
  standardizeSpeed(speed) {
    if (speed === null || speed === undefined) {
      return null;
    }
    
    const num = parseFloat(speed);
    if (isNaN(num) || num <= 0 || num > 80) {
      return null;
    }
    
    return Math.round(num * 100) / 100;
  }
  
  standardizeHeight(height) {
    if (height === null || height === undefined) {
      return null;
    }
    
    const num = parseInt(height);
    if (isNaN(num) || num < 140 || num > 220) {
      return null;
    }
    
    return num;
  }
  
  standardizeWeight(weight) {
    if (weight === null || weight === undefined) {
      return null;
    }
    
    const num = parseInt(weight);
    if (isNaN(num) || num < 40 || num > 120) {
      return null;
    }
    
    return num;
  }
  
  standardizeYear(year) {
    if (year === null || year === undefined) {
      return null;
    }
    
    const num = parseInt(year);
    const currentYear = new Date().getFullYear();
    
    if (isNaN(num) || num < 1970 || num > currentYear + 2) {
      return null;
    }
    
    return num;
  }
  
  standardizeBibNumber(bibNumber) {
    if (bibNumber === null || bibNumber === undefined) {
      return null;
    }
    
    const num = parseInt(bibNumber);
    if (isNaN(num) || num < 1 || num > 999) {
      return null;
    }
    
    return num;
  }
  
  standardizeResultStatus(status) {
    if (!status) return 'FINISHED';
    
    const statusMappings = {
      'dnf': 'DNF',
      'dns': 'DNS',
      'dsq': 'DSQ',
      'dq': 'DSQ',
      'otl': 'OTL',
      'hd': 'HD',
      'ab': 'AB',
      'np': 'NP',
      'relegated': 'RELEGATED',
      'pending': 'PENDING',
      'finished': 'FINISHED'
    };
    
    const normalized = status.toLowerCase().trim();
    return statusMappings[normalized] || 'FINISHED';
  }
  
  /**
   * Validation methods
   */
  createValidationSchemas() {
    return {
      raceResults: Joi.object({
        raceId: Joi.string().required(),
        raceInfo: Joi.object({
          name: Joi.string().required(),
          date: Joi.string().pattern(/^\\d{4}-\\d{2}-\\d{2}$/).allow(null),
          location: Joi.string().allow(null),
          country: Joi.string().allow(null),
          distance: Joi.number().positive().allow(null)
        }).required(),
        stages: Joi.array().items(Joi.object({
          stage: Joi.object({
            stageNumber: Joi.number().integer().min(1).max(50),
            name: Joi.string().required(),
            distance: Joi.number().positive().allow(null)
          }),
          results: Joi.array().items(Joi.object({
            position: Joi.number().integer().min(1).allow(null),
            rider: Joi.object({
              name: Joi.string().required()
            }).required()
          }))
        }))
      }),
      
      riderProfile: Joi.object({
        riderId: Joi.string().required(),
        personalInfo: Joi.object({
          name: Joi.string().required(),
          dateOfBirth: Joi.string().pattern(/^\\d{4}-\\d{2}-\\d{2}$/).allow(null),
          nationality: Joi.string().allow(null),
          height: Joi.number().integer().min(140).max(220).allow(null),
          weight: Joi.number().integer().min(40).max(120).allow(null)
        }).required()
      })
    };
  }
  
  validateRaceResults(data) {
    const { error, value } = this.schemas.raceResults.validate(data, {
      abortEarly: false,
      allowUnknown: true
    });
    
    const result = {
      isValid: !error,
      errors: error ? error.details.map(detail => detail.message) : [],
      warnings: []
    };
    
    logValidation('race-results', result, {
      raceId: data.raceId
    });
    
    return result;
  }
  
  validateRiderProfile(data) {
    const { error, value } = this.schemas.riderProfile.validate(data, {
      abortEarly: false,
      allowUnknown: true
    });
    
    const result = {
      isValid: !error,
      errors: error ? error.details.map(detail => detail.message) : [],
      warnings: []
    };
    
    logValidation('rider-profile', result, {
      riderId: data.riderId
    });
    
    return result;
  }
  
  validatePositionSequence(results) {
    const positions = results
      .filter(r => r.position && r.status === 'FINISHED')
      .map(r => r.position)
      .sort((a, b) => a - b);
    
    // Check for gaps or duplicates
    let expectedPosition = 1;
    const issues = [];
    
    for (const position of positions) {
      if (position !== expectedPosition) {
        if (position > expectedPosition) {
          issues.push(`Missing position(s) ${expectedPosition}-${position - 1}`);
        } else {
          issues.push(`Duplicate position ${position}`);
        }
      }
      expectedPosition = position + 1;
    }
    
    if (issues.length > 0) {
      this.logger.warn('Position sequence validation issues', { issues });
    }
  }
  
  /**
   * Quality calculation methods
   */
  calculateRaceResultsQuality(data) {
    const metrics = {
      raceInfoCompleteness: 0,
      stageDataCompleteness: 0,
      resultCompleteness: 0,
      dataConsistency: 0,
      overallScore: 0
    };
    
    // Race info completeness
    const raceInfoFields = ['name', 'date', 'location', 'country'];
    const completeRaceFields = raceInfoFields.filter(field => 
      data.raceInfo[field] && data.raceInfo[field] !== 'Unknown'
    );
    metrics.raceInfoCompleteness = completeRaceFields.length / raceInfoFields.length;
    
    // Stage data completeness
    if (data.stages && data.stages.length > 0) {
      const stageCompleteness = data.stages.map(stage => {
        const stageFields = ['name', 'distance', 'stageType'];
        const completeStageFields = stageFields.filter(field => 
          stage.stage[field] && stage.stage[field] !== 'Unknown'
        );
        return completeStageFields.length / stageFields.length;
      });
      
      metrics.stageDataCompleteness = stageCompleteness.reduce((a, b) => a + b, 0) / stageCompleteness.length;
    }
    
    // Result completeness
    const totalResults = data.stages ? data.stages.reduce((sum, stage) => sum + stage.results.length, 0) : 0;
    const completeResults = data.stages ? data.stages.reduce((sum, stage) => {
      return sum + stage.results.filter(result => 
        result.rider.name && result.position
      ).length;
    }, 0) : 0;
    
    metrics.resultCompleteness = totalResults > 0 ? completeResults / totalResults : 0;
    
    // Data consistency (penalties for validation errors)
    let consistencyScore = 1.0;
    if (data.validationResults && data.validationResults.errors) {
      consistencyScore = Math.max(0, 1.0 - (data.validationResults.errors.length * 0.1));
    }
    metrics.dataConsistency = consistencyScore;
    
    // Overall score (weighted average)
    metrics.overallScore = (
      metrics.raceInfoCompleteness * 0.2 +
      metrics.stageDataCompleteness * 0.3 +
      metrics.resultCompleteness * 0.4 +
      metrics.dataConsistency * 0.1
    );
    
    return metrics;
  }
  
  calculateRiderProfileQuality(data) {
    const metrics = {
      personalInfoCompleteness: 0,
      careerDataAvailability: 0,
      historicalDataDepth: 0,
      dataConsistency: 0,
      overallScore: 0
    };
    
    // Personal info completeness
    const personalFields = ['name', 'dateOfBirth', 'nationality', 'team', 'height', 'weight'];
    const completePersonalFields = personalFields.filter(field => 
      data.personalInfo[field] && 
      data.personalInfo[field] !== 'Unknown'
    );
    metrics.personalInfoCompleteness = completePersonalFields.length / personalFields.length;
    
    // Career data availability
    let careerScore = 0;
    if (data.careerStats && Object.keys(data.careerStats).length > 0) careerScore += 0.5;
    if (data.recentResults && data.recentResults.length > 0) careerScore += 0.3;
    if (data.palmares && data.palmares.length > 0) careerScore += 0.2;
    metrics.careerDataAvailability = Math.min(1.0, careerScore);
    
    // Historical data depth
    let historyScore = 0;
    if (data.teamHistory && data.teamHistory.length > 1) historyScore += 0.4;
    if (data.recentResults && data.recentResults.length > 10) historyScore += 0.3;
    if (data.palmares && data.palmares.length > 5) historyScore += 0.3;
    metrics.historicalDataDepth = Math.min(1.0, historyScore);
    
    // Data consistency
    let consistencyScore = 1.0;
    if (data.validationResults && data.validationResults.errors) {
      consistencyScore = Math.max(0, 1.0 - (data.validationResults.errors.length * 0.1));
    }
    metrics.dataConsistency = consistencyScore;
    
    // Overall score
    metrics.overallScore = (
      metrics.personalInfoCompleteness * 0.3 +
      metrics.careerDataAvailability * 0.3 +
      metrics.historicalDataDepth * 0.2 +
      metrics.dataConsistency * 0.2
    );
    
    return metrics;
  }
  
  /**
   * Update processing statistics
   */
  updateStats(data) {
    this.stats.processed++;
    
    if (data.dataQuality) {
      this.stats.qualityScores.push(data.dataQuality.overallScore);
      
      if (data.dataQuality.overallScore >= this.config.qualityThreshold) {
        this.stats.cleaned++;
      }
    }
    
    if (data.validationResults && data.validationResults.isValid) {
      this.stats.validated++;
    }
    
    // Log statistics periodically
    if (this.stats.processed % 100 === 0) {
      this.logStatistics();
    }
  }
  
  /**
   * Get processing statistics
   */
  getStatistics() {
    const avgQuality = this.stats.qualityScores.length > 0 ? 
      this.stats.qualityScores.reduce((a, b) => a + b, 0) / this.stats.qualityScores.length : 0;
    
    return {
      processed: this.stats.processed,
      cleaned: this.stats.cleaned,
      validated: this.stats.validated,
      failed: this.stats.failed,
      averageQuality: Math.round(avgQuality * 100) / 100,
      cleaningRate: this.stats.processed > 0 ? (this.stats.cleaned / this.stats.processed * 100).toFixed(2) + '%' : '0%',
      validationRate: this.stats.processed > 0 ? (this.stats.validated / this.stats.processed * 100).toFixed(2) + '%' : '0%',
      totalErrors: this.stats.errors.length,
      totalWarnings: this.stats.warnings.length
    };
  }
  
  /**
   * Log current statistics
   */
  logStatistics() {
    const stats = this.getStatistics();
    this.logger.info('Data cleaning statistics', stats);
  }
  
  /**
   * Reset statistics
   */
  resetStatistics() {
    this.stats = {
      processed: 0,
      cleaned: 0,
      validated: 0,
      failed: 0,
      qualityScores: [],
      errors: [],
      warnings: []
    };
    
    this.logger.info('Statistics reset');
  }
}

module.exports = DataCleaningPipeline;