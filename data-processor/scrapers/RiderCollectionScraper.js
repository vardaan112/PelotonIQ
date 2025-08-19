const RiderProfileScraper = require('./procyclingstats/RiderProfileScraper');
const TeamRosterScraper = require('./procyclingstats/TeamRosterScraper');
const BaseScraper = require('./core/BaseScraper');
const axios = require('axios');
const moment = require('moment');
const { 
  logScrapingActivity, 
  logDataQuality, 
  logError,
  logValidation 
} = require('../config/logger');

/**
 * RiderCollectionScraper - Comprehensive rider data collection system
 * Coordinates between team rosters and individual rider profiles
 */
class RiderCollectionScraper extends BaseScraper {
  constructor(options = {}) {
    super({
      name: 'RiderCollectionScraper',
      baseUrl: process.env.BACKEND_BASE_URL || 'http://localhost:8080/api/v1',
      ...options
    });
    
    this.teamRosterScraper = new TeamRosterScraper();
    this.riderProfileScraper = new RiderProfileScraper();
    
    // Specialization mapping from ProCyclingStats to backend enum
    this.specializationMap = {
      'SPRINTER': 'SPRINTER',
      'CLIMBER': 'CLIMBER',
      'TIME_TRIALIST': 'TIME_TRIALIST',
      'ALL_ROUNDER': 'ALL_ROUNDER',
      'DOMESTIQUE': 'DOMESTIQUE',
      'CLASSICS_SPECIALIST': 'CLASSICS_SPECIALIST',
      'BREAKAWAY_SPECIALIST': 'BREAKAWAY_SPECIALIST',
      'PUNCHEUR': 'PUNCHEUR'
    };
    
    // Default rider values
    this.defaultRiderValues = {
      specialization: 'ALL_ROUNDER',
      ftpWatts: this.generateRealisticFTP(),
      heightCm: this.generateRealisticHeight(),
      weightKg: this.generateRealisticWeight(),
      active: true
    };
    
    this.logger.info('RiderCollectionScraper initialized');
  }
  
  /**
   * Scrape all riders for existing teams in database
   */
  async scrapeAllTeamRiders(options = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting comprehensive rider collection', {
        options,
        sessionId: this.sessionId
      });
      
      // Get all teams from backend
      const teams = await this.fetchAllTeamsFromBackend();
      this.logger.info(`Found ${teams.length} teams to process`);
      
      const results = {
        teamsProcessed: 0,
        ridersFound: 0,
        ridersCreated: 0,
        ridersUpdated: 0,
        errors: [],
        teamResults: []
      };
      
      // Process each team
      for (const team of teams) {
        try {
          await this.sleep(this.config.delayBetweenRequests);
          
          const teamResult = await this.scrapeTeamRiders(team, options);
          results.teamResults.push(teamResult);
          results.teamsProcessed++;
          results.ridersFound += teamResult.ridersFound;
          results.ridersCreated += teamResult.ridersCreated;
          results.ridersUpdated += teamResult.ridersUpdated;
          
          this.logger.info(`Team ${team.name} processed`, {
            ridersFound: teamResult.ridersFound,
            ridersCreated: teamResult.ridersCreated,
            sessionId: this.sessionId
          });
          
        } catch (error) {
          this.logger.error(`Failed to process team ${team.name}`, {
            teamId: team.id,
            error: error.message
          });
          
          results.errors.push({
            teamId: team.id,
            teamName: team.name,
            error: error.message
          });
        }
      }
      
      logScrapingActivity(
        this.name,
        'rider-collection-completed',
        'all-teams',
        'success',
        {
          sessionId: this.sessionId,
          teamsProcessed: results.teamsProcessed,
          ridersFound: results.ridersFound,
          ridersCreated: results.ridersCreated,
          duration: Date.now() - startTime
        }
      );
      
      return results;
      
    } catch (error) {
      logError(error, {
        scraper: this.name,
        sessionId: this.sessionId,
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Scrape riders for a specific team
   */
  async scrapeTeamRiders(team, options = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info(`Scraping riders for team: ${team.name}`, {
        teamId: team.id,
        sessionId: this.sessionId
      });
      
      const result = {
        teamId: team.id,
        teamName: team.name,
        ridersFound: 0,
        ridersCreated: 0,
        ridersUpdated: 0,
        errors: [],
        riders: []
      };
      
      // Only scrape real riders from ProCyclingStats - no generated fallbacks
      let teamRiders = [];
      try {
        teamRiders = await this.scrapeRealTeamRiders(team, options);
        this.logger.info(`Found ${teamRiders.length} real riders for ${team.name}`);
      } catch (scrapeError) {
        this.logger.error(`Failed to scrape real riders for ${team.name}: ${scrapeError.message}`);
        // No fallback - only use real data from the website
        teamRiders = [];
      }
      
      result.ridersFound = teamRiders.length;
      
      // Process each rider
      for (const riderData of teamRiders) {
        try {
          // Check if rider already exists
          const existingRider = await this.checkRiderExists(riderData.email);
          
          if (existingRider) {
            // Update existing rider
            const updatedRider = await this.updateRider(existingRider.id, riderData);
            result.ridersUpdated++;
            result.riders.push(updatedRider);
            
          } else {
            // Create new rider
            const newRider = await this.createRider(riderData);
            result.ridersCreated++;
            result.riders.push(newRider);
          }
          
        } catch (error) {
          this.logger.error(`Failed to process rider ${riderData.firstName} ${riderData.lastName}`, {
            error: error.message
          });
          
          result.errors.push({
            riderName: `${riderData.firstName} ${riderData.lastName}`,
            error: error.message
          });
        }
      }
      
      return result;
      
    } catch (error) {
      this.logger.error(`Failed to scrape team riders`, {
        teamId: team.id,
        teamName: team.name,
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Scrape real riders from ProCyclingStats for a team
   */
  async scrapeRealTeamRiders(team, options = {}) {
    try {
      // Try to find the team on ProCyclingStats
      const teamUrl = await this.findTeamOnPCS(team);
      if (!teamUrl) {
        throw new Error(`Could not find team ${team.name} on ProCyclingStats`);
      }
      
      // Scrape the team page directly to get rider data
      const fullTeamUrl = `${this.teamRosterScraper.baseUrl}/${teamUrl}`;
      const $ = await this.teamRosterScraper.scrapePage(fullTeamUrl);
      
      const realRiders = [];
      
      // Extract riders from the various tables on the team page
      const ridersData = this.extractRidersFromTeamPage($, team);
      
      // Process each rider
      for (const riderInfo of ridersData) {
        try {
          // Convert the scraped rider data to our format
          const riderData = await this.convertScrapedRiderData(riderInfo, team);
          if (riderData) {
            realRiders.push(riderData);
          }
        } catch (error) {
          this.logger.warn(`Failed to process rider ${riderInfo.name}: ${error.message}`);
        }
      }
      
      // Only use real riders from the website - no generated supplementation
      this.logger.info(`Found ${realRiders.length} real riders for ${team.name}`);
      
      return realRiders;
      
    } catch (error) {
      this.logger.error(`Failed to scrape real riders for team ${team.name}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Find team URL on ProCyclingStats by using the teams list
   */
  async findTeamOnPCS(team) {
    try {
      // Get list of all teams from ProCyclingStats
      const teamsListUrl = `${this.teamRosterScraper.baseUrl}/teams.php`;
      const $ = await this.teamRosterScraper.scrapePage(teamsListUrl);
      
      // Look for team links
      const teamLinks = [];
      $('a[href*="team/"]').each((i, link) => {
        const $link = $(link);
        const href = $link.attr('href');
        const text = $link.text().trim();
        
        if (text && href && href.includes('2025')) { // Focus on 2025 teams
          const score = this.calculateTeamNameSimilarity(team.name.toLowerCase(), text.toLowerCase());
          teamLinks.push({
            url: href,
            text: text,
            score: score
          });
        }
      });
      
      // Sort by similarity score and return best match
      if (teamLinks.length > 0) {
        teamLinks.sort((a, b) => b.score - a.score);
        const bestMatch = teamLinks[0];
        
        this.logger.info(`Best match for "${team.name}": "${bestMatch.text}" (score: ${bestMatch.score})`);
        
        if (bestMatch.score > 0.2) { // Even lower threshold for better matching
          return bestMatch.url;
        }
      }
      
      return null;
      
    } catch (error) {
      this.logger.error(`Failed to find team ${team.name} on PCS: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Extract riders from ProCyclingStats team page with enhanced data extraction
   */
  extractRidersFromTeamPage($, team) {
    const ridersMap = new Map(); // To collect all rider data
    
    // First pass: collect all rider names from all tables
    $('table[class*="teamlist"]').each((i, table) => {
      const $table = $(table);
      
      // Get headers to understand table structure
      const headers = [];
      $table.find('tr:first-child th, tr:first-child td').each((j, cell) => {
        headers.push($(cell).text().trim().toLowerCase());
      });
      
      // Skip header row and process data rows
      $table.find('tr').slice(1).each((j, row) => {
        const $row = $(row);
        const cells = $row.find('td, th');
        
        if (cells.length < 2) return;
        
        let riderName = null;
        let age = null;
        let specialty = null;
        let points = null;
        
        // Extract data from each cell based on header position
        cells.each((k, cell) => {
          const cellText = $(cell).text().trim();
          const header = headers[k] || '';
          
          // Identify rider name
          if ((header.includes('rider') || header === 'ridername') && cellText) {
            // Clean rider name format
            if (this.isValidRiderName(cellText)) {
              riderName = cellText;
            }
          }
          
          // Extract age
          if (header.includes('age') && cellText) {
            const ageMatch = cellText.match(/^(\d{2})/);
            if (ageMatch) {
              age = parseInt(ageMatch[1]);
            }
          }
          
          // Extract specialty
          if (header.includes('specialty') && cellText) {
            if (['Climber', 'Sprinter', 'All-rounder', 'Classics', 'Time trial', 'One-day races'].some(s => cellText.includes(s))) {
              specialty = cellText;
            }
          }
          
          // Extract points
          if (header.includes('points') && cellText && cellText.match(/^\d+$/)) {
            points = parseInt(cellText);
          }
        });
        
        // If we found a rider name, add or update the rider data
        if (riderName) {
          if (!ridersMap.has(riderName)) {
            ridersMap.set(riderName, {
              name: riderName,
              age: null,
              specialty: null,
              points: null
            });
          }
          
          const riderData = ridersMap.get(riderName);
          if (age) riderData.age = age;
          if (specialty) riderData.specialty = specialty;
          if (points) riderData.points = points;
        }
      });
    });
    
    // Also check the UL list for additional riders
    $('ul[class*="teamlist"]').each((i, list) => {
      const $list = $(list);
      $list.find('li').each((j, item) => {
        const text = $(item).text().trim();
        // Extract rider name from format like "1 ARMIRAIL Bruno31"
        const match = text.match(/^\d+\s+([A-ZÀ-Ž]+\s+[A-Za-zÀ-ž]+)/);
        if (match) {
          const riderName = match[1];
          if (!ridersMap.has(riderName)) {
            ridersMap.set(riderName, {
              name: riderName,
              age: null,
              specialty: null,
              points: null
            });
          }
        }
      });
    });
    
    const riders = Array.from(ridersMap.values());
    
    this.logger.info(`Extracted ${riders.length} riders from team page for ${team.name}`);
    riders.forEach(rider => {
      this.logger.debug(`Rider: ${rider.name}, Age: ${rider.age || 'N/A'}, Specialty: ${rider.specialty || 'N/A'}`);
    });
    
    return riders;
  }
  
  /**
   * Check if a text string looks like a valid rider name
   */
  isValidRiderName(text) {
    if (!text || text.length < 3) return false;
    
    // Should be letters, spaces, hyphens, apostrophes only
    const namePattern = /^[A-ZÀ-Ža-zÀ-ž\s'-]+$/;
    if (!namePattern.test(text)) return false;
    
    // Should have at least one uppercase letter
    if (!/[A-ZÀ-Ž]/.test(text)) return false;
    
    // Should contain a space (first name + last name)
    if (!text.includes(' ')) return false;
    
    // Should not start with a number
    if (/^\d/.test(text)) return false;
    
    // Should be longer than common abbreviations
    if (text.length < 6) return false;
    
    // Common non-name words to exclude
    const excludeWords = ['rider', 'points', 'ranking', 'age', 'specialty', 'team'];
    if (excludeWords.some(word => text.toLowerCase().includes(word))) return false;
    
    return true;
  }

  /**
   * Calculate similarity between team names with enhanced matching
   */
  calculateTeamNameSimilarity(name1, name2) {
    // Normalize names: replace dashes/dots with spaces, remove special chars
    const normalize = (name) => name.toLowerCase()
      .replace(/[-_.]/g, ' ')  // Replace dashes, dots, underscores with spaces
      .replace(/[^a-z0-9\s]/g, '')  // Remove other special chars
      .replace(/\s+/g, ' ')  // Normalize multiple spaces
      .trim();
    
    const clean1 = normalize(name1);
    const clean2 = normalize(name2);
    
    // Exact match
    if (clean1 === clean2) return 1.0;
    
    // Contains match
    if (clean1.includes(clean2) || clean2.includes(clean1)) return 0.9;
    
    // Word-based similarity with enhanced matching
    const words1 = clean1.split(/\s+/).filter(w => w.length > 2);
    const words2 = clean2.split(/\s+/).filter(w => w.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    let matches = 0;
    for (const word1 of words1) {
      for (const word2 of words2) {
        // Exact word match
        if (word1 === word2) {
          matches += 1.0;
          break;
        }
        // Partial word match
        if (word1.includes(word2) || word2.includes(word1)) {
          matches += 0.8;
          break;
        }
        // Handle common team name variations
        if (this.areWordVariations(word1, word2)) {
          matches += 0.7;
          break;
        }
      }
    }
    
    return matches / Math.max(words1.length, words2.length);
  }
  
  /**
   * Check if two words are common variations in cycling team names
   */
  areWordVariations(word1, word2) {
    const variations = {
      'ag2r': ['decathlon'],
      'decathlon': ['ag2r'],
      'team': ['squad', 'cycling'],
      'uae': ['emirates'],
      'emirates': ['uae'],
      'visma': ['lease'],
      'lease': ['visma'],
      'bike': ['cycling'],
      'cycling': ['bike'],
      'bora': ['hansgrohe'],
      'hansgrohe': ['bora'],
      'red': ['bull'],
      'bull': ['red']
    };
    
    return variations[word1]?.includes(word2) || variations[word2]?.includes(word1);
  }
  
  /**
   * Convert scraped rider data to our backend format
   */
  async convertScrapedRiderData(riderInfo, team) {
    // Parse name into first and last name
    const nameParts = riderInfo.name.trim().split(' ');
    let firstName = nameParts[0] || 'Unknown';
    let lastName = nameParts.slice(1).join(' ') || 'Rider';
    
    // Handle common cycling name format "LASTNAME Firstname"
    if (firstName === firstName.toUpperCase() && lastName.includes(' ')) {
      // Format is "LASTNAME Firstname" - switch them
      const allParts = riderInfo.name.trim().split(' ');
      lastName = allParts[0];
      firstName = allParts.slice(1).join(' ');
    }
    
    // Generate email
    const email = this.generateEmail(firstName, lastName, team.name);
    
    // Calculate date of birth from age if available
    let dateOfBirth = this.generateDateOfBirth();
    if (riderInfo.age && riderInfo.age > 18 && riderInfo.age < 50) {
      const birthYear = new Date().getFullYear() - riderInfo.age;
      const month = Math.floor(Math.random() * 12) + 1;
      const day = Math.floor(Math.random() * 28) + 1;
      dateOfBirth = `${birthYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
    
    // Map specialty
    const specialization = this.mapSpecialization(riderInfo.specialty) || 'ALL_ROUNDER';
    
    // Generate realistic physical data based on specialty and cycling standards
    const physicalData = this.generateRealisticPhysicalData(specialization, riderInfo.age);
    
    return {
      firstName: firstName,
      lastName: lastName,
      email: email,
      dateOfBirth: dateOfBirth,
      nationality: this.inferNationalityFromTeam(team),
      team: team.name,
      specialization: specialization,
      heightCm: physicalData.height,
      weightKg: physicalData.weight,
      ftpWatts: physicalData.ftp,
      active: true
    };
  }
  
  /**
   * Generate realistic physical data based on rider specialty
   */
  generateRealisticPhysicalData(specialization, age) {
    let baseHeight = 175; // cm
    let baseWeight = 70; // kg  
    let baseFTP = 350; // watts
    
    // Adjust based on specialization
    switch (specialization) {
      case 'SPRINTER':
        baseHeight = 178; // Sprinters tend to be taller/bigger
        baseWeight = 75;
        baseFTP = 380; // Very high power for short bursts
        break;
        
      case 'CLIMBER':
        baseHeight = 172; // Climbers tend to be smaller/lighter
        baseWeight = 65;
        baseFTP = 390; // High power-to-weight ratio
        break;
        
      case 'TIME_TRIALIST':
        baseHeight = 180; // TT riders tend to be bigger for aerodynamics
        baseWeight = 75;
        baseFTP = 410; // Highest sustained power
        break;
        
      case 'CLASSICS_SPECIALIST':
        baseHeight = 176;
        baseWeight = 72;
        baseFTP = 375; // High power for one-day efforts
        break;
        
      case 'PUNCHEUR':
        baseHeight = 174;
        baseWeight = 68;
        baseFTP = 365; // Good power for short climbs
        break;
        
      case 'DOMESTIQUE':
        baseHeight = 175;
        baseWeight = 70;
        baseFTP = 340; // Solid but not exceptional
        break;
        
      default: // ALL_ROUNDER
        baseHeight = 175;
        baseWeight = 70;
        baseFTP = 350;
        break;
    }
    
    // Add age-based adjustments (peak around 25-30)
    if (age) {
      if (age < 25) {
        baseFTP -= (25 - age) * 3; // Younger riders slightly less developed
      } else if (age > 32) {
        baseFTP -= (age - 32) * 2; // Older riders slight decline
      }
    }
    
    // Add realistic variation
    const heightVariation = (Math.random() - 0.5) * 12; // +/- 6cm
    const weightVariation = (Math.random() - 0.5) * 10; // +/- 5kg
    const ftpVariation = (Math.random() - 0.5) * 60; // +/- 30W
    
    return {
      height: Math.round(baseHeight + heightVariation),
      weight: Math.round(baseWeight + weightVariation),
      ftp: Math.round(baseFTP + ftpVariation)
    };
  }
  
  /**
   * Map ProCyclingStats specialization to our enum
   */
  mapSpecialization(pcsSpecialization) {
    if (!pcsSpecialization) return null;
    
    const mapping = {
      'sprinter': 'SPRINTER',
      'climber': 'CLIMBER',
      'time trialist': 'TIME_TRIALIST',
      'time-trialist': 'TIME_TRIALIST',
      'time trial': 'TIME_TRIALIST',
      'all rounder': 'ALL_ROUNDER',
      'all-rounder': 'ALL_ROUNDER',
      'domestique': 'DOMESTIQUE',
      'classics specialist': 'CLASSICS_SPECIALIST',
      'classics': 'CLASSICS_SPECIALIST',
      'puncheur': 'PUNCHEUR'
    };
    
    const key = pcsSpecialization.toLowerCase();
    return mapping[key] || 'ALL_ROUNDER';
  }
  
  /**
   * Estimate FTP from specialty
   */
  estimateFTPFromSpecialty(specialty) {
    if (!specialty) return null;
    
    let baseFTP = 300; // Default
    const spec = specialty.toLowerCase();
    
    if (spec.includes('sprint')) {
      baseFTP = 370; // Sprinters have very high power
    } else if (spec.includes('climb')) {
      baseFTP = 390; // Climbers have high sustained power
    } else if (spec.includes('time')) {
      baseFTP = 420; // Time trialists have highest sustained power
    } else if (spec.includes('classics')) {
      baseFTP = 360; // Classics riders have high power
    } else if (spec.includes('domestique')) {
      baseFTP = 320; // Solid but not exceptional
    }
    
    // Add some variation
    const variation = (Math.random() - 0.5) * 80; // +/- 40W
    return Math.round(baseFTP + variation);
  }
  
  /**
   * Infer nationality from team country
   */
  inferNationalityFromTeam(team) {
    const countryToNationality = {
      'France': 'France',
      'Belgium': 'Belgium',
      'Netherlands': 'Netherlands',
      'Spain': 'Spain',
      'Italy': 'Italy',
      'Germany': 'Germany',
      'UK': 'Great Britain',
      'United States': 'United States',
      'Australia': 'Australia',
      'Denmark': 'Denmark'
    };
    
    return countryToNationality[team.country] || 'Unknown';
  }
  
  /**
   * Estimate FTP from rider profile data
   */
  estimateFTPFromRider(rider) {
    // Base estimation on rider type and performance
    let baseFTP = 300; // Default
    
    if (rider.specialization) {
      const spec = rider.specialization.toLowerCase();
      if (spec.includes('sprint')) {
        baseFTP = 350; // Sprinters typically have higher power
      } else if (spec.includes('climb')) {
        baseFTP = 380; // Climbers have high power-to-weight
      } else if (spec.includes('time')) {
        baseFTP = 400; // Time trialists have very high sustained power
      } else if (spec.includes('domestique')) {
        baseFTP = 320; // Solid but not exceptional
      }
    }
    
    // Add some variation
    const variation = (Math.random() - 0.5) * 100; // +/- 50W
    return Math.round(baseFTP + variation);
  }

  /**
   * Generate realistic rider data for a team
   */
  async generateTeamRiders(team, options = {}) {
    const riders = [];
    const rosterSize = options.rosterSize || this.getTeamRosterSize(team.category);
    
    // Common cycling nationalities by team country
    const nationalityByCountry = {
      'France': ['France', 'Belgium', 'Netherlands', 'Switzerland'],
      'Belgium': ['Belgium', 'Netherlands', 'France', 'Germany'],
      'Netherlands': ['Netherlands', 'Belgium', 'Germany', 'Denmark'],
      'Spain': ['Spain', 'Colombia', 'France', 'Italy'],
      'Italy': ['Italy', 'France', 'Slovenia', 'Spain'],
      'Germany': ['Germany', 'Austria', 'Switzerland', 'Netherlands'],
      'UK': ['Great Britain', 'Ireland', 'Australia', 'New Zealand'],
      'United States': ['United States', 'Canada', 'Colombia', 'Australia'],
      'Australia': ['Australia', 'New Zealand', 'Great Britain', 'Canada'],
      'Denmark': ['Denmark', 'Norway', 'Sweden', 'Netherlands']
    };
    
    const possibleNationalities = nationalityByCountry[team.country] || 
                                 ['France', 'Belgium', 'Netherlands', 'Spain', 'Italy'];
    
    // Generate riders
    for (let i = 0; i < rosterSize; i++) {
      const rider = {
        firstName: this.generateFirstName(),
        lastName: this.generateLastName(),
        email: null, // Will be generated from name
        dateOfBirth: this.generateDateOfBirth(),
        nationality: this.randomChoice(possibleNationalities),
        team: team.name,
        specialization: this.generateSpecialization(),
        heightCm: this.generateRealisticHeight(),
        weightKg: this.generateRealisticWeight(),
        ftpWatts: this.generateRealisticFTP(),
        active: true
      };
      
      // Generate email from name
      rider.email = this.generateEmail(rider.firstName, rider.lastName, team.name);
      
      riders.push(rider);
    }
    
    return riders;
  }
  
  /**
   * Backend API methods
   */
  async fetchAllTeamsFromBackend() {
    try {
      const response = await axios.get(`${this.baseUrl}/teams?size=100`);
      return response.data.content || response.data;
    } catch (error) {
      this.logger.error('Failed to fetch teams from backend', {
        error: error.message,
        status: error.response?.status
      });
      throw error;
    }
  }
  
  async checkRiderExists(email) {
    try {
      const response = await axios.get(`${this.baseUrl}/riders/check-email`, {
        params: { email }
      });
      
      if (response.data === true) {
        // Get rider by email
        const riderResponse = await axios.get(`${this.baseUrl}/riders/email/${encodeURIComponent(email)}`);
        return riderResponse.data;
      }
      
      return null;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }
  
  async createRider(riderData) {
    try {
      const response = await axios.post(`${this.baseUrl}/riders`, riderData);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create rider', {
        riderData,
        error: error.message,
        status: error.response?.status,
        responseData: error.response?.data
      });
      throw error;
    }
  }
  
  async updateRider(riderId, riderData) {
    try {
      const response = await axios.put(`${this.baseUrl}/riders/${riderId}`, riderData);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to update rider', {
        riderId,
        riderData,
        error: error.message,
        status: error.response?.status
      });
      throw error;
    }
  }
  
  /**
   * Data generation helpers
   */
  generateFirstName() {
    const names = [
      'Alexander', 'Antoine', 'Baptiste', 'Benjamin', 'Carlos', 'Christian', 'Cyril',
      'Daniel', 'David', 'Diego', 'Eduardo', 'Fabio', 'Fernando', 'Francesco',
      'Gabriel', 'Guillaume', 'Henri', 'Ivan', 'Jacques', 'Jean', 'Jose', 'Julian',
      'Kevin', 'Laurent', 'Leonardo', 'Lucas', 'Manuel', 'Marco', 'Matteo', 'Michael',
      'Nicolas', 'Olivier', 'Pablo', 'Patrick', 'Pedro', 'Pierre', 'Rafael', 'Ricardo',
      'Roberto', 'Samuel', 'Sebastian', 'Stefan', 'Thomas', 'Victor', 'Vincent', 'Xavier'
    ];
    return this.randomChoice(names);
  }
  
  generateLastName() {
    const names = [
      'Alaphilippe', 'Bardet', 'Bernal', 'Cavendish', 'Contador', 'Dumoulin', 'Evenepoel',
      'Froome', 'Gaviria', 'Greipel', 'Hirschi', 'Jakobsen', 'Kelderman', 'Kwiatkowski',
      'López', 'Martin', 'Nibali', 'Pedersen', 'Quintana', 'Roglic', 'Sagan', 'Thomas',
      'Uran', 'Van der Poel', 'Van Avermaet', 'Vingegaard', 'Wout van Aert', 'Yates',
      'Almeida', 'Bennett', 'Clarke', 'Demare', 'Ewan', 'Formolo', 'Ganna', 'Hayter',
      'Impey', 'Jungels', 'Kristoff', 'Laporte', 'Matthews', 'Nizzolo', 'OConnor', 'Pinot'
    ];
    return this.randomChoice(names);
  }
  
  generateDateOfBirth() {
    // Generate age between 20-40 years
    const age = Math.floor(Math.random() * 21) + 20; // 20-40
    const birthYear = new Date().getFullYear() - age;
    const month = Math.floor(Math.random() * 12) + 1;
    const day = Math.floor(Math.random() * 28) + 1; // Safe day range
    
    return `${birthYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }
  
  generateSpecialization() {
    const specializations = [
      'SPRINTER', 'CLIMBER', 'TIME_TRIALIST', 'ALL_ROUNDER', 
      'DOMESTIQUE', 'CLASSICS_SPECIALIST', 'PUNCHEUR'
    ];
    
    // Weighted selection (more all-rounders and domestiques)
    const weights = [0.15, 0.15, 0.1, 0.25, 0.2, 0.1, 0.05];
    return this.weightedRandomChoice(specializations, weights);
  }
  
  generateRealisticHeight() {
    // Height between 160-195 cm, normal distribution around 175
    return Math.floor(Math.random() * 35) + 160;
  }
  
  generateRealisticWeight() {
    // Weight between 55-85 kg, normal distribution around 70
    return Math.floor(Math.random() * 30) + 55;
  }
  
  generateRealisticFTP() {
    // FTP between 250-450 watts, with specialization influence
    const baseFTP = Math.floor(Math.random() * 200) + 250;
    return Math.round(baseFTP);
  }
  
  generateEmail(firstName, lastName, teamName) {
    const cleanFirstName = firstName.toLowerCase().replace(/[^a-z]/g, '');
    const cleanLastName = lastName.toLowerCase().replace(/[^a-z]/g, '');
    const cleanTeamName = teamName.toLowerCase().replace(/[^a-z]/g, '').substring(0, 10);
    
    const domain = Math.random() > 0.5 ? 'gmail.com' : `${cleanTeamName}.pro`;
    
    return `${cleanFirstName}.${cleanLastName}@${domain}`;
  }
  
  getTeamRosterSize(category) {
    switch (category) {
      case 'WORLD_TOUR':
        return Math.floor(Math.random() * 5) + 25; // 25-30 riders
      case 'PRO_TEAM':
        return Math.floor(Math.random() * 5) + 20; // 20-25 riders
      case 'CONTINENTAL':
        return Math.floor(Math.random() * 5) + 15; // 15-20 riders
      default:
        return Math.floor(Math.random() * 5) + 18; // 18-23 riders
    }
  }
  
  /**
   * Utility methods
   */
  randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
  }
  
  weightedRandomChoice(items, weights) {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return items[i];
      }
    }
    
    return items[items.length - 1]; // Fallback
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = RiderCollectionScraper;