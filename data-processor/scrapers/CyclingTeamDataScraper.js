/**
 * Cycling Team Data Scraper - Populates database with professional cycling teams and riders
 * Comprehensive scraper that collects WorldTour, ProTeam, and Continental team data
 */

const axios = require('axios');
const cheerio = require('cheerio');
const BaseScraper = require('./core/BaseScraper');
const TeamRosterScraper = require('./procyclingstats/TeamRosterScraper');
const RiderProfileScraper = require('./procyclingstats/RiderProfileScraper');
const { 
    logger, 
    createComponentLogger, 
    logScrapingActivity, 
    logError,
    logDataQuality 
} = require('../config/logger');

class CyclingTeamDataScraper extends BaseScraper {
    constructor(options = {}) {
        super({
            name: 'CyclingTeamDataScraper',
            baseUrl: 'https://www.procyclingstats.com',
            ...options
        });

        this.teamRosterScraper = new TeamRosterScraper(options);
        this.riderProfileScraper = new RiderProfileScraper(options);
        
        // Pre-defined team lists for different categories
        this.teamCategories = {
            worldTour: [
                'uae-team-emirates',
                'team-jumbo-visma',
                'ineos-grenadiers',
                'quick-step-alpha-vinyl-team',
                'team-dsm-firmenich-postnl',
                'bahrain-victorious',
                'alpecin-deceuninck',
                'trek-segafredo',
                'ag2r-citroen-team',
                'astana-qazaqstan-team',
                'bora-hansgrohe',
                'cofidis',
                'ef-education-easypost',
                'groupama-fdj',
                'israel-premier-tech',
                'lidl-trek',
                'movistar-team',
                'soudal-quick-step',
                'team-jayco-alula',
                'uno-x-mobility'
            ],
            proTeams: [
                'arkea-samsic',
                'burgos-bh',
                'caja-rural-seguros-rga',
                'corratec-selle-italia',
                'euskaltel-euskadi',
                'q36.5-pro-cycling-team',
                'red-bull-bora-hansgrohe',
                'team-novo-nordisk',
                'totalenergies',
                'tudor-pro-cycling-team'
            ],
            continental: [
                'bingoal-pauwels-sauces-wb',
                'sport-vlaanderen-baloise',
                'wallonie-bruxelles',
                'germany-national-team',
                'france-national-team',
                'italy-national-team',
                'spain-national-team',
                'netherlands-national-team',
                'belgium-national-team',
                'great-britain-national-team'
            ]
        };

        this.scrapingStats = {
            totalTeams: 0,
            successfulTeams: 0,
            failedTeams: 0,
            totalRiders: 0,
            successfulRiders: 0,
            failedRiders: 0,
            dataQualityScores: [],
            startTime: null,
            endTime: null
        };

        logger.info('CyclingTeamDataScraper initialized', {
            totalWorldTourTeams: this.teamCategories.worldTour.length,
            totalProTeams: this.teamCategories.proTeams.length,
            totalContinentalTeams: this.teamCategories.continental.length
        });
    }

    /**
     * Main scraping method - populate database with all cycling teams and riders
     */
    async populateDatabase(options = {}) {
        this.scrapingStats.startTime = new Date();
        
        try {
            logger.info('Starting comprehensive cycling team data population', {
                sessionId: this.sessionId,
                options
            });

            const results = {
                teams: [],
                riders: [],
                summary: {
                    totalTeams: 0,
                    successfulTeams: 0,
                    failedTeams: 0,
                    totalRiders: 0,
                    successfulRiders: 0,
                    failedRiders: 0
                },
                errors: [],
                dataQuality: {}
            };

            // Scrape all team categories
            if (options.includeWorldTour !== false) {
                const worldTourResults = await this.scrapeTeamCategory('WORLD_TOUR', this.teamCategories.worldTour, options);
                this.mergeResults(results, worldTourResults);
            }

            if (options.includeProTeams !== false) {
                const proTeamResults = await this.scrapeTeamCategory('PRO_TEAM', this.teamCategories.proTeams, options);
                this.mergeResults(results, proTeamResults);
            }

            if (options.includeContinental !== false) {
                const continentalResults = await this.scrapeTeamCategory('CONTINENTAL', this.teamCategories.continental, options);
                this.mergeResults(results, continentalResults);
            }

            // Store data in backend database
            if (options.saveToDatabase !== false) {
                await this.saveToDatabase(results);
            }

            this.scrapingStats.endTime = new Date();
            const duration = this.scrapingStats.endTime - this.scrapingStats.startTime;

            // Calculate final statistics
            results.summary = {
                totalTeams: results.teams.length,
                successfulTeams: results.teams.filter(t => t.status === 'success').length,
                failedTeams: results.teams.filter(t => t.status === 'failed').length,
                totalRiders: results.riders.length,
                successfulRiders: results.riders.filter(r => r.status === 'success').length,
                failedRiders: results.riders.filter(r => r.status === 'failed').length,
                duration: `${duration}ms`,
                dataQuality: this.calculateOverallDataQuality(results)
            };

            logScrapingActivity(
                this.name,
                'database-population-completed',
                'cycling-teams-database',
                'success',
                results.summary
            );

            logger.info('Database population completed successfully', {
                sessionId: this.sessionId,
                summary: results.summary
            });

            return results;

        } catch (error) {
            this.scrapingStats.endTime = new Date();
            
            logError(error, {
                operation: 'database-population',
                sessionId: this.sessionId,
                duration: this.scrapingStats.endTime - this.scrapingStats.startTime
            });

            throw error;
        }
    }

    /**
     * Scrape a specific team category
     */
    async scrapeTeamCategory(category, teamIds, options = {}) {
        logger.info(`Starting ${category} teams scraping`, {
            category,
            teamsCount: teamIds.length,
            sessionId: this.sessionId
        });

        const results = {
            teams: [],
            riders: [],
            errors: []
        };

        for (let i = 0; i < teamIds.length; i++) {
            const teamId = teamIds[i];
            
            try {
                logger.debug(`Scraping team ${i + 1}/${teamIds.length}: ${teamId}`, {
                    teamId,
                    category,
                    progress: `${Math.round(((i + 1) / teamIds.length) * 100)}%`
                });

                // Scrape team data
                const teamData = await this.teamRosterScraper.scrape(teamId, {
                    includeCurrentRoster: true,
                    includeHistory: options.includeHistory !== false,
                    includeStatistics: options.includeStatistics !== false,
                    includeRecentResults: options.includeResults !== false,
                    historicalYears: options.historicalYears || [2024, 2023, 2022]
                });

                if (teamData && teamData.teamInfo) {
                    // Enhance team data with category
                    teamData.teamInfo.category = category;
                    teamData.teamInfo.teamId = teamId;
                    
                    results.teams.push({
                        teamId,
                        category,
                        status: 'success',
                        data: teamData,
                        scrapedAt: new Date()
                    });

                    this.scrapingStats.successfulTeams++;

                    // Process team riders
                    if (teamData.currentRoster && teamData.currentRoster.length > 0) {
                        const riderResults = await this.processTeamRiders(teamId, teamData.currentRoster, options);
                        results.riders.push(...riderResults);
                    }

                    // Log data quality
                    if (teamData.dataQuality) {
                        this.scrapingStats.dataQualityScores.push(teamData.dataQuality.overallScore);
                        
                        logDataQuality(`team-${category.toLowerCase()}`, teamData.dataQuality, {
                            teamId,
                            category,
                            sessionId: this.sessionId
                        });
                    }
                } else {
                    throw new Error('No team data returned from scraper');
                }

            } catch (error) {
                logger.warn(`Failed to scrape team: ${teamId}`, {
                    teamId,
                    category,
                    error: error.message,
                    sessionId: this.sessionId
                });

                results.teams.push({
                    teamId,
                    category,
                    status: 'failed',
                    error: error.message,
                    attemptedAt: new Date()
                });

                results.errors.push({
                    type: 'team-scraping-failed',
                    teamId,
                    category,
                    error: error.message
                });

                this.scrapingStats.failedTeams++;
            }

            // Rate limiting delay between teams
            await this.sleep(2000);
        }

        logger.info(`Completed ${category} teams scraping`, {
            category,
            totalTeams: teamIds.length,
            successfulTeams: results.teams.filter(t => t.status === 'success').length,
            failedTeams: results.teams.filter(t => t.status === 'failed').length,
            totalRiders: results.riders.length,
            sessionId: this.sessionId
        });

        return results;
    }

    /**
     * Process individual riders from a team roster
     */
    async processTeamRiders(teamId, roster, options = {}) {
        const riderResults = [];

        // Limit rider processing if specified
        const maxRiders = options.maxRidersPerTeam || roster.length;
        const ridersToProcess = roster.slice(0, maxRiders);

        for (const riderEntry of ridersToProcess) {
            try {
                if (!riderEntry.rider || !riderEntry.rider.name) {
                    continue;
                }

                // Create a rider ID from the name (simplified)
                const riderId = this.createRiderIdFromName(riderEntry.rider.name);

                // Enhanced rider data
                const riderData = {
                    riderId,
                    name: riderEntry.rider.name,
                    nationality: riderEntry.rider.nationality,
                    dateOfBirth: riderEntry.rider.dateOfBirth,
                    age: riderEntry.rider.age,
                    currentTeam: teamId,
                    role: riderEntry.role,
                    jerseyNumber: riderEntry.jerseyNumber,
                    isCaptain: riderEntry.isCaptain || false,
                    isActive: riderEntry.isActive || true,
                    contractStart: riderEntry.contractStart,
                    contractEnd: riderEntry.contractEnd,
                    scrapedAt: new Date()
                };

                // Optionally scrape detailed rider profile
                if (options.includeRiderProfiles && options.maxDetailedRiders && 
                    riderResults.filter(r => r.status === 'success').length < options.maxDetailedRiders) {
                    
                    try {
                        const profileData = await this.riderProfileScraper.scrape(riderId, {
                            includeCareerStats: true,
                            includeRecentResults: true
                        });

                        if (profileData) {
                            Object.assign(riderData, {
                                careerStats: profileData.careerStats,
                                recentResults: profileData.recentResults,
                                specialties: profileData.specialties,
                                physicalAttributes: profileData.physicalAttributes
                            });
                        }

                        // Small delay for detailed scraping
                        await this.sleep(1000);

                    } catch (profileError) {
                        logger.debug(`Failed to get detailed profile for rider: ${riderData.name}`, {
                            riderId,
                            teamId,
                            error: profileError.message
                        });
                        // Continue without detailed profile data
                    }
                }

                riderResults.push({
                    riderId,
                    teamId,
                    status: 'success',
                    data: riderData,
                    scrapedAt: new Date()
                });

                this.scrapingStats.successfulRiders++;

            } catch (error) {
                logger.debug(`Failed to process rider: ${riderEntry.rider?.name || 'unknown'}`, {
                    teamId,
                    error: error.message
                });

                riderResults.push({
                    riderId: this.createRiderIdFromName(riderEntry.rider?.name || 'unknown'),
                    teamId,
                    status: 'failed',
                    error: error.message,
                    attemptedAt: new Date()
                });

                this.scrapingStats.failedRiders++;
            }
        }

        this.scrapingStats.totalRiders += riderResults.length;

        return riderResults;
    }

    /**
     * Save scraped data to backend database via API
     */
    async saveToDatabase(results) {
        logger.info('Saving scraped data to database', {
            teamsCount: results.teams.filter(t => t.status === 'success').length,
            ridersCount: results.riders.filter(r => r.status === 'success').length,
            sessionId: this.sessionId
        });

        try {
            // API endpoint for the Spring Boot backend (includes context path)
            const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080/api/v1';
            
            // Save teams
            const successfulTeams = results.teams.filter(t => t.status === 'success');
            for (const teamResult of successfulTeams) {
                try {
                    const teamPayload = {
                        name: teamResult.data.teamInfo.name || teamResult.teamId, // Required field
                        code: teamResult.data.teamInfo.code,
                        description: teamResult.data.teamInfo.description,
                        country: teamResult.data.teamInfo.country || 'Unknown', // Required field with fallback
                        foundedYear: teamResult.data.teamInfo.founded || teamResult.data.teamInfo.foundedYear,
                        category: teamResult.data.teamInfo.category || 'WORLD_TOUR', // Required field with fallback
                        manager: teamResult.data.teamInfo.manager,
                        director: teamResult.data.teamInfo.director,
                        website: teamResult.data.teamInfo.website,
                        email: teamResult.data.teamInfo.email,
                        annualBudget: teamResult.data.teamInfo.budget || teamResult.data.teamInfo.annualBudget,
                        maxRosterSize: teamResult.data.teamInfo.maxRosterSize || 30,
                        active: teamResult.data.teamInfo.isActive !== false // Default to true unless explicitly false
                    };

                    await axios.post(`${backendUrl}/teams`, teamPayload, {
                        timeout: 10000,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    logger.debug(`Team saved successfully: ${teamResult.teamId}`);

                } catch (error) {
                    logger.warn(`Failed to save team: ${teamResult.teamId}`, {
                        error: error.message
                    });
                }

                // Rate limiting for API calls
                await this.sleep(200);
            }

            // Save riders
            const successfulRiders = results.riders.filter(r => r.status === 'success');
            for (const riderResult of successfulRiders) {
                try {
                    const riderPayload = {
                        id: riderResult.riderId,
                        name: riderResult.data.name,
                        nationality: riderResult.data.nationality,
                        dateOfBirth: riderResult.data.dateOfBirth,
                        age: riderResult.data.age,
                        currentTeam: riderResult.data.currentTeam,
                        role: riderResult.data.role || 'RIDER',
                        jerseyNumber: riderResult.data.jerseyNumber,
                        isCaptain: riderResult.data.isCaptain || false,
                        isActive: riderResult.data.isActive !== false,
                        contractStart: riderResult.data.contractStart,
                        contractEnd: riderResult.data.contractEnd,
                        specialties: riderResult.data.specialties || [],
                        physicalAttributes: riderResult.data.physicalAttributes || {}
                    };

                    await axios.post(`${backendUrl}/riders`, riderPayload, {
                        timeout: 10000,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    logger.debug(`Rider saved successfully: ${riderResult.data.name}`);

                } catch (error) {
                    logger.warn(`Failed to save rider: ${riderResult.data.name}`, {
                        error: error.message
                    });
                }

                // Rate limiting for API calls
                await this.sleep(100);
            }

            logger.info('Database save completed successfully', {
                teamsSaved: successfulTeams.length,
                ridersSaved: successfulRiders.length,
                sessionId: this.sessionId
            });

        } catch (error) {
            logger.error('Failed to save data to database', {
                error: error.message,
                sessionId: this.sessionId
            });
            throw error;
        }
    }

    /**
     * Helper methods
     */
    createRiderIdFromName(name) {
        if (!name) return 'unknown-rider';
        
        return name
            .toLowerCase()
            .replace(/[^a-z\s]/g, '') // Remove non-letter characters except spaces
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .substring(0, 50); // Limit length
    }

    mergeResults(target, source) {
        target.teams.push(...source.teams);
        target.riders.push(...source.riders);
        target.errors.push(...source.errors);
    }

    calculateOverallDataQuality(results) {
        const scores = this.scrapingStats.dataQualityScores;
        if (scores.length === 0) return { overallScore: 0, teamsAnalyzed: 0 };

        const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        
        return {
            overallScore: averageScore,
            teamsAnalyzed: scores.length,
            minScore: Math.min(...scores),
            maxScore: Math.max(...scores),
            distribution: {
                excellent: scores.filter(s => s >= 0.9).length,
                good: scores.filter(s => s >= 0.7 && s < 0.9).length,
                fair: scores.filter(s => s >= 0.5 && s < 0.7).length,
                poor: scores.filter(s => s < 0.5).length
            }
        };
    }

    /**
     * Get scraping statistics
     */
    getStats() {
        return {
            ...this.scrapingStats,
            averageDataQuality: this.scrapingStats.dataQualityScores.length > 0 ?
                this.scrapingStats.dataQualityScores.reduce((a, b) => a + b, 0) / this.scrapingStats.dataQualityScores.length : 0
        };
    }
}

module.exports = CyclingTeamDataScraper;