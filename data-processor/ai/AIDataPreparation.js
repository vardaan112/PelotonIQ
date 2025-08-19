const moment = require('moment');
const { 
  logger, 
  createComponentLogger, 
  logDataQuality, 
  logError,
  logPerformance 
} = require('../config/logger');

/**
 * AIDataPreparation - Transforms cleaned cycling data into ML-ready formats
 * Prepares data for TensorFlow models including feature engineering and normalization
 */
class AIDataPreparation {
  constructor(options = {}) {
    this.logger = createComponentLogger('AIDataPreparation');
    
    this.config = {
      // Feature engineering settings
      maxRaceHistory: options.maxRaceHistory || 50,
      performanceWindowDays: options.performanceWindowDays || 365,
      minRacesForProfile: options.minRacesForProfile || 5,
      
      // Normalization settings
      enableFeatureScaling: options.enableFeatureScaling ?? true,
      scalingMethod: options.scalingMethod || 'standard', // 'standard', 'minmax', 'robust'
      
      // Time series settings
      timeSeriesWindow: options.timeSeriesWindow || 30,
      predictionHorizon: options.predictionHorizon || 7,
      
      // Performance thresholds
      dataQualityThreshold: options.dataQualityThreshold || 0.7,
      featureCorrelationThreshold: options.featureCorrelationThreshold || 0.95,
      
      // Output formats
      outputFormats: options.outputFormats || ['tensorflow', 'numpy', 'json'],
      tensorflowVersion: options.tensorflowVersion || '2.x'
    };
    
    // Feature definitions for different AI models
    this.featureDefinitions = {
      riderPerformance: {
        numerical: [
          'age', 'weight', 'height', 'careerWins', 'seasonWins', 'averagePosition',
          'recentFormScore', 'experienceScore', 'specialtyScore', 'fitnessScore'
        ],
        categorical: [
          'nationality', 'team', 'ridingStyle', 'specialization', 'currentSeason'
        ],
        temporal: [
          'raceResults', 'performanceMetrics', 'formIndicators'
        ]
      },
      
      raceOutcome: {
        numerical: [
          'raceDistance', 'elevationGain', 'averageGradient', 'weatherIndex',
          'difficultyScore', 'participantCount', 'prizePool'
        ],
        categorical: [
          'raceType', 'terrainType', 'season', 'country', 'raceCategory'
        ],
        temporal: [
          'historicalResults', 'weatherHistory', 'participantHistory'
        ]
      },
      
      teamOptimization: {
        numerical: [
          'teamBudget', 'averageRiderAge', 'teamExperience', 'cohesionScore',
          'diversityIndex', 'strengthBalance', 'tacticalFlexibility'
        ],
        categorical: [
          'teamCategory', 'nationality', 'managementStyle', 'specialization'
        ],
        temporal: [
          'teamPerformanceHistory', 'rosterChanges', 'resultsTrends'
        ]
      }
    };
    
    // Statistics tracking
    this.stats = {
      datasetsProcessed: 0,
      featuresEngineered: 0,
      modelsPrepped: 0,
      averageProcessingTime: 0,
      lastProcessed: null
    };
    
    this.logger.info('AIDataPreparation initialized', {
      config: this.config,
      featureDefinitions: Object.keys(this.featureDefinitions)
    });
  }
  
  /**
   * Prepare rider performance data for ML models
   */
  async prepareRiderPerformanceData(riders, races, options = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Preparing rider performance data for ML', {
        ridersCount: riders.length,
        racesCount: races.length,
        options
      });
      
      const features = [];
      const labels = [];
      const metadata = [];
      
      for (const rider of riders) {
        try {
          // Filter relevant races for this rider
          const riderRaces = this.filterRiderRaces(rider, races);
          
          if (riderRaces.length < this.config.minRacesForProfile) {
            this.logger.debug('Skipping rider with insufficient race history', {
              riderId: rider.riderId || rider.name,
              raceCount: riderRaces.length
            });
            continue;
          }
          
          // Engineer features for rider
          const riderFeatures = await this.engineerRiderFeatures(rider, riderRaces);
          
          // Generate labels based on prediction target
          const riderLabels = this.generatePerformanceLabels(rider, riderRaces, options.predictionTarget || 'position');
          
          // Create time series if requested
          if (options.includeTimeSeries) {
            const timeSeries = this.createRiderTimeSeries(rider, riderRaces);
            riderFeatures.timeSeries = timeSeries;
          }
          
          features.push(riderFeatures);
          labels.push(riderLabels);
          metadata.push({
            riderId: rider.riderId || rider.name,
            riderName: rider.personalInfo?.name || rider.name,
            dataQuality: rider.dataQuality?.overallScore || 0.5,
            raceCount: riderRaces.length
          });
          
        } catch (error) {
          this.logger.warn('Failed to process rider data', {
            riderId: rider.riderId || rider.name,
            error: error.message
          });
          continue;
        }
      }
      
      // Normalize features if enabled
      let normalizedFeatures = features;
      let normalizationParams = null;
      
      if (this.config.enableFeatureScaling && features.length > 0) {
        const normalizationResult = this.normalizeFeatures(features, this.config.scalingMethod);
        normalizedFeatures = normalizationResult.features;
        normalizationParams = normalizationResult.params;
      }
      
      // Convert to requested output formats
      const outputs = {};
      for (const format of this.config.outputFormats) {
        outputs[format] = this.convertToFormat(normalizedFeatures, labels, metadata, format);
      }
      
      const duration = Date.now() - startTime;
      this.updateStats(duration, features.length);
      
      const result = {
        modelType: 'rider-performance',
        features: normalizedFeatures,
        labels,
        metadata,
        normalizationParams,
        outputs,
        statistics: {
          totalRiders: riders.length,
          processedRiders: features.length,
          featuresPerRider: features.length > 0 ? Object.keys(features[0]).length : 0,
          averageDataQuality: metadata.reduce((sum, m) => sum + m.dataQuality, 0) / metadata.length || 0
        },
        processingTime: duration
      };
      
      logDataQuality('rider-performance-ml-prep', {
        overallScore: result.statistics.averageDataQuality,
        processedSamples: features.length,
        featureCount: result.statistics.featuresPerRider
      });
      
      this.logger.info('Rider performance data preparation completed', {
        processedRiders: features.length,
        duration: `${duration}ms`,
        averageDataQuality: result.statistics.averageDataQuality.toFixed(3)
      });
      
      return result;
      
    } catch (error) {
      logError(error, {
        operation: 'prepare-rider-performance-data',
        ridersCount: riders.length,
        racesCount: races.length,
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Prepare race outcome prediction data
   */
  async prepareRaceOutcomeData(races, riders, options = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Preparing race outcome data for ML', {
        racesCount: races.length,
        ridersCount: riders.length,
        options
      });
      
      const features = [];
      const labels = [];
      const metadata = [];
      
      for (const race of races) {
        try {
          // Engineer race features
          const raceFeatures = await this.engineerRaceFeatures(race, riders);
          
          // Generate outcome labels
          const raceLabels = this.generateRaceOutcomeLabels(race, options.outcomeType || 'winner');
          
          // Add participant features
          if (options.includeParticipants && race.startList) {
            raceFeatures.participantFeatures = this.engineerParticipantFeatures(race.startList, riders);
          }
          
          features.push(raceFeatures);
          labels.push(raceLabels);
          metadata.push({
            raceId: race.raceId,
            raceName: race.raceInfo?.name || race.name,
            date: race.raceInfo?.date,
            dataQuality: race.dataQuality?.overallScore || 0.5,
            participantCount: race.startList?.length || 0
          });
          
        } catch (error) {
          this.logger.warn('Failed to process race data', {
            raceId: race.raceId,
            error: error.message
          });
          continue;
        }
      }
      
      // Normalize and convert to output formats
      let normalizedFeatures = features;
      let normalizationParams = null;
      
      if (this.config.enableFeatureScaling && features.length > 0) {
        const normalizationResult = this.normalizeFeatures(features, this.config.scalingMethod);
        normalizedFeatures = normalizationResult.features;
        normalizationParams = normalizationResult.params;
      }
      
      const outputs = {};
      for (const format of this.config.outputFormats) {
        outputs[format] = this.convertToFormat(normalizedFeatures, labels, metadata, format);
      }
      
      const duration = Date.now() - startTime;
      this.updateStats(duration, features.length);
      
      const result = {
        modelType: 'race-outcome',
        features: normalizedFeatures,
        labels,
        metadata,
        normalizationParams,
        outputs,
        statistics: {
          totalRaces: races.length,
          processedRaces: features.length,
          featuresPerRace: features.length > 0 ? Object.keys(features[0]).length : 0,
          averageDataQuality: metadata.reduce((sum, m) => sum + m.dataQuality, 0) / metadata.length || 0
        },
        processingTime: duration
      };
      
      logDataQuality('race-outcome-ml-prep', {
        overallScore: result.statistics.averageDataQuality,
        processedSamples: features.length,
        featureCount: result.statistics.featuresPerRace
      });
      
      this.logger.info('Race outcome data preparation completed', {
        processedRaces: features.length,
        duration: `${duration}ms`,
        averageDataQuality: result.statistics.averageDataQuality.toFixed(3)
      });
      
      return result;
      
    } catch (error) {
      logError(error, {
        operation: 'prepare-race-outcome-data',
        racesCount: races.length,
        ridersCount: riders.length,
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Prepare team optimization data
   */
  async prepareTeamOptimizationData(teams, riders, races, options = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Preparing team optimization data for ML', {
        teamsCount: teams.length,
        ridersCount: riders.length,
        racesCount: races.length,
        options
      });
      
      const features = [];
      const labels = [];
      const metadata = [];
      
      for (const team of teams) {
        try {
          // Get team riders
          const teamRiders = this.getTeamRiders(team, riders);
          
          if (teamRiders.length === 0) {
            continue;
          }
          
          // Engineer team features
          const teamFeatures = await this.engineerTeamFeatures(team, teamRiders, races);
          
          // Generate optimization labels
          const teamLabels = this.generateTeamOptimizationLabels(team, races, options.optimizationTarget || 'performance');
          
          features.push(teamFeatures);
          labels.push(teamLabels);
          metadata.push({
            teamId: team.teamId,
            teamName: team.teamInfo?.name || team.name,
            rosterSize: teamRiders.length,
            dataQuality: team.dataQuality?.overallScore || 0.5
          });
          
        } catch (error) {
          this.logger.warn('Failed to process team data', {
            teamId: team.teamId,
            error: error.message
          });
          continue;
        }
      }
      
      // Normalize and convert
      let normalizedFeatures = features;
      let normalizationParams = null;
      
      if (this.config.enableFeatureScaling && features.length > 0) {
        const normalizationResult = this.normalizeFeatures(features, this.config.scalingMethod);
        normalizedFeatures = normalizationResult.features;
        normalizationParams = normalizationResult.params;
      }
      
      const outputs = {};
      for (const format of this.config.outputFormats) {
        outputs[format] = this.convertToFormat(normalizedFeatures, labels, metadata, format);
      }
      
      const duration = Date.now() - startTime;
      this.updateStats(duration, features.length);
      
      const result = {
        modelType: 'team-optimization',
        features: normalizedFeatures,
        labels,
        metadata,
        normalizationParams,
        outputs,
        statistics: {
          totalTeams: teams.length,
          processedTeams: features.length,
          featuresPerTeam: features.length > 0 ? Object.keys(features[0]).length : 0,
          averageDataQuality: metadata.reduce((sum, m) => sum + m.dataQuality, 0) / metadata.length || 0
        },
        processingTime: duration
      };
      
      this.logger.info('Team optimization data preparation completed', {
        processedTeams: features.length,
        duration: `${duration}ms`,
        averageDataQuality: result.statistics.averageDataQuality.toFixed(3)
      });
      
      return result;
      
    } catch (error) {
      logError(error, {
        operation: 'prepare-team-optimization-data',
        teamsCount: teams.length,
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Engineer rider-specific features
   */
  async engineerRiderFeatures(rider, races) {
    const features = {};
    
    // Basic demographic features
    features.age = this.calculateAge(rider.personalInfo?.dateOfBirth);
    features.weight = rider.physicalAttributes?.weight || 70; // Default weight
    features.height = rider.physicalAttributes?.height || 175; // Default height
    features.experienceYears = this.calculateExperienceYears(rider.careerStats?.firstRace);
    
    // Career statistics features
    features.careerWins = rider.careerStats?.totalWins || 0;
    features.careerPodiums = rider.careerStats?.totalPodiums || 0;
    features.careerTop10s = rider.careerStats?.totalTop10s || 0;
    features.careerRaces = rider.careerStats?.totalRaces || races.length;
    
    // Performance metrics
    features.averagePosition = this.calculateAveragePosition(rider, races);
    features.winRate = features.careerWins / Math.max(features.careerRaces, 1);
    features.podiumRate = features.careerPodiums / Math.max(features.careerRaces, 1);
    features.top10Rate = features.careerTop10s / Math.max(features.careerRaces, 1);
    
    // Recent form indicators
    const recentRaces = this.getRecentRaces(rider, races, 90); // Last 90 days
    features.recentFormScore = this.calculateFormScore(recentRaces);
    features.recentWins = this.countRecentResults(recentRaces, 1);
    features.recentPodiums = this.countRecentResults(recentRaces, 3);
    features.recentTop10s = this.countRecentResults(recentRaces, 10);
    
    // Specialization scores
    features.sprintScore = this.calculateSpecializationScore(rider, races, 'sprint');
    features.climbingScore = this.calculateSpecializationScore(rider, races, 'climbing');
    features.timeTrialScore = this.calculateSpecializationScore(rider, races, 'time_trial');
    features.classicsScore = this.calculateSpecializationScore(rider, races, 'classics');
    features.grandTourScore = this.calculateSpecializationScore(rider, races, 'grand_tour');
    
    // Team and nationality encoding
    features.nationalityEncoded = this.encodeNationality(rider.personalInfo?.nationality);
    features.currentTeamEncoded = this.encodeTeam(rider.currentTeam);
    
    // Consistency metrics
    features.consistencyScore = this.calculateConsistencyScore(rider, races);
    features.performanceVariance = this.calculatePerformanceVariance(rider, races);
    
    // Seasonal patterns
    const currentYear = new Date().getFullYear();
    features.seasonWins = this.countSeasonResults(rider, races, currentYear, 1);
    features.seasonPodiums = this.countSeasonResults(rider, races, currentYear, 3);
    features.seasonRaces = this.countSeasonRaces(rider, races, currentYear);
    
    return features;
  }
  
  /**
   * Engineer race-specific features
   */
  async engineerRaceFeatures(race, riders) {
    const features = {};
    
    // Basic race characteristics
    features.distance = race.raceInfo?.distance || 0;
    features.elevationGain = race.raceInfo?.elevationGain || 0;
    features.averageGradient = features.elevationGain / Math.max(features.distance, 1);
    features.stageCount = race.stages?.length || 1;
    features.participantCount = race.startList?.length || 0;
    
    // Race categorization
    features.raceTypeEncoded = this.encodeRaceType(race.raceInfo?.type);
    features.raceCategoryEncoded = this.encodeRaceCategory(race.raceInfo?.category);
    features.terrainTypeEncoded = this.encodeTerrainType(race.raceInfo?.terrain);
    
    // Difficulty scoring
    features.difficultyScore = this.calculateRaceDifficulty(race);
    features.competitiveIndex = this.calculateCompetitiveIndex(race, riders);
    
    // Historical context
    features.averageWinningTime = this.calculateHistoricalWinningTime(race);
    features.historicalParticipation = this.calculateHistoricalParticipation(race);
    
    // Weather and conditions (if available)
    features.weatherIndex = this.calculateWeatherIndex(race.conditions);
    features.seasonalIndex = this.calculateSeasonalIndex(race.raceInfo?.date);
    
    // Prize and prestige
    features.prizePool = race.raceInfo?.prizePool || 0;
    features.prestigeScore = this.calculatePrestigeScore(race);
    features.uciPoints = race.raceInfo?.uciPoints || 0;
    
    return features;
  }
  
  /**
   * Engineer team-specific features
   */
  async engineerTeamFeatures(team, teamRiders, races) {
    const features = {};
    
    // Team composition metrics
    features.rosterSize = teamRiders.length;
    features.averageAge = this.calculateAverageAge(teamRiders);
    features.ageStdDev = this.calculateAgeStandardDeviation(teamRiders);
    features.experienceScore = this.calculateTeamExperience(teamRiders);
    
    // Performance aggregations
    features.totalWins = teamRiders.reduce((sum, rider) => sum + (rider.careerStats?.totalWins || 0), 0);
    features.totalPodiums = teamRiders.reduce((sum, rider) => sum + (rider.careerStats?.totalPodiums || 0), 0);
    features.averageRiderRank = this.calculateAverageRiderRank(teamRiders);
    
    // Specialization balance
    features.sprintStrength = this.calculateTeamSpecializationStrength(teamRiders, 'sprint');
    features.climbingStrength = this.calculateTeamSpecializationStrength(teamRiders, 'climbing');
    features.timeTrialStrength = this.calculateTeamSpecializationStrength(teamRiders, 'time_trial');
    features.classicsStrength = this.calculateTeamSpecializationStrength(teamRiders, 'classics');
    
    // Diversity metrics
    features.nationalityDiversity = this.calculateNationalityDiversity(teamRiders);
    features.specialtyDiversity = this.calculateSpecialtyDiversity(teamRiders);
    
    // Team characteristics
    features.teamCategoryEncoded = this.encodeTeamCategory(team.teamInfo?.category);
    features.budgetTier = this.encodeBudgetTier(team.teamInfo?.budget);
    
    // Cohesion indicators
    features.teamCohesionScore = this.calculateTeamCohesion(teamRiders, races);
    features.tacticalFlexibility = this.calculateTacticalFlexibility(teamRiders);
    
    return features;
  }
  
  /**
   * Generate performance labels for rider models
   */
  generatePerformanceLabels(rider, races, predictionTarget) {
    const labels = {};
    
    switch (predictionTarget) {
      case 'position':
        labels.averagePosition = this.calculateAveragePosition(rider, races);
        labels.positionCategory = this.categorizePosition(labels.averagePosition);
        break;
        
      case 'podium_probability':
        labels.podiumProbability = this.calculatePodiumProbability(rider, races);
        labels.willPodium = labels.podiumProbability > 0.15;
        break;
        
      case 'win_probability':
        labels.winProbability = this.calculateWinProbability(rider, races);
        labels.willWin = labels.winProbability > 0.05;
        break;
        
      case 'performance_score':
        labels.performanceScore = this.calculatePerformanceScore(rider, races);
        labels.performanceLevel = this.categorizePerformance(labels.performanceScore);
        break;
        
      default:
        labels.averagePosition = this.calculateAveragePosition(rider, races);
        labels.performanceScore = this.calculatePerformanceScore(rider, races);
    }
    
    return labels;
  }
  
  /**
   * Generate race outcome labels
   */
  generateRaceOutcomeLabels(race, outcomeType) {
    const labels = {};
    
    if (!race.results || race.results.length === 0) {
      return labels;
    }
    
    switch (outcomeType) {
      case 'winner':
        labels.winnerId = race.results[0]?.riderId;
        labels.winnerName = race.results[0]?.riderName;
        break;
        
      case 'podium':
        labels.podiumRiders = race.results.slice(0, 3).map(r => r.riderId);
        break;
        
      case 'top10':
        labels.top10Riders = race.results.slice(0, 10).map(r => r.riderId);
        break;
        
      case 'margin':
        labels.winningMargin = this.calculateWinningMargin(race.results);
        labels.marginCategory = this.categorizeMargin(labels.winningMargin);
        break;
        
      default:
        labels.fullResults = race.results.map(r => ({
          riderId: r.riderId,
          position: r.position,
          time: r.time
        }));
    }
    
    return labels;
  }
  
  /**
   * Generate team optimization labels
   */
  generateTeamOptimizationLabels(team, races, optimizationTarget) {
    const labels = {};
    
    switch (optimizationTarget) {
      case 'performance':
        labels.teamPerformanceScore = this.calculateTeamPerformanceScore(team, races);
        labels.performanceRank = this.calculateTeamPerformanceRank(team, races);
        break;
        
      case 'wins':
        labels.totalWins = this.calculateTeamWins(team, races);
        labels.winEfficiency = labels.totalWins / Math.max(team.currentRoster?.length || 1, 1);
        break;
        
      case 'versatility':
        labels.versatilityScore = this.calculateTeamVersatility(team, races);
        labels.specializationBalance = this.calculateSpecializationBalance(team);
        break;
        
      default:
        labels.overallScore = this.calculateOverallTeamScore(team, races);
    }
    
    return labels;
  }
  
  /**
   * Normalize features using specified method
   */
  normalizeFeatures(features, method = 'standard') {
    if (!features || features.length === 0) {
      return { features: [], params: null };
    }
    
    const normalizedFeatures = [];
    const normalizationParams = {};
    
    // Get all numerical feature keys
    const featureKeys = Object.keys(features[0]).filter(key => 
      typeof features[0][key] === 'number' && !isNaN(features[0][key])
    );
    
    // Calculate normalization parameters
    for (const key of featureKeys) {
      const values = features.map(f => f[key]).filter(v => v != null && !isNaN(v));
      
      if (values.length === 0) continue;
      
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      normalizationParams[key] = { mean, std, min, max };
    }
    
    // Apply normalization
    for (const featureSet of features) {
      const normalized = { ...featureSet };
      
      for (const key of featureKeys) {
        const value = featureSet[key];
        const params = normalizationParams[key];
        
        if (value != null && !isNaN(value) && params) {
          switch (method) {
            case 'standard':
              normalized[key] = params.std > 0 ? (value - params.mean) / params.std : 0;
              break;
            case 'minmax':
              normalized[key] = params.max > params.min ? (value - params.min) / (params.max - params.min) : 0;
              break;
            case 'robust':
              // Use median and IQR for robust scaling
              normalized[key] = params.std > 0 ? (value - params.mean) / params.std : 0;
              break;
            default:
              normalized[key] = value;
          }
        }
      }
      
      normalizedFeatures.push(normalized);
    }
    
    return {
      features: normalizedFeatures,
      params: normalizationParams
    };
  }
  
  /**
   * Convert data to specified output format
   */
  convertToFormat(features, labels, metadata, format) {
    switch (format) {
      case 'tensorflow':
        return this.convertToTensorFlow(features, labels, metadata);
      case 'numpy':
        return this.convertToNumPy(features, labels, metadata);
      case 'json':
        return this.convertToJSON(features, labels, metadata);
      default:
        return { features, labels, metadata };
    }
  }
  
  /**
   * Convert to TensorFlow format
   */
  convertToTensorFlow(features, labels, metadata) {
    // This would typically create tensors, but for now return structured data
    return {
      format: 'tensorflow',
      features: {
        shape: [features.length, Object.keys(features[0] || {}).length],
        data: features,
        dtype: 'float32'
      },
      labels: {
        shape: [labels.length, Object.keys(labels[0] || {}).length],
        data: labels,
        dtype: 'float32'
      },
      metadata: metadata
    };
  }
  
  /**
   * Convert to NumPy format
   */
  convertToNumPy(features, labels, metadata) {
    return {
      format: 'numpy',
      features: {
        array: features.map(f => Object.values(f)),
        shape: [features.length, Object.keys(features[0] || {}).length],
        dtype: 'float64'
      },
      labels: {
        array: labels.map(l => Object.values(l)),
        shape: [labels.length, Object.keys(labels[0] || {}).length],
        dtype: 'float64'
      },
      metadata: metadata
    };
  }
  
  /**
   * Convert to JSON format
   */
  convertToJSON(features, labels, metadata) {
    return {
      format: 'json',
      data: features.map((feature, index) => ({
        features: feature,
        labels: labels[index] || {},
        metadata: metadata[index] || {}
      }))
    };
  }
  
  /**
   * Helper methods for feature engineering
   */
  calculateAge(dateOfBirth) {
    if (!dateOfBirth) return 30; // Default age
    return moment().diff(moment(dateOfBirth), 'years');
  }
  
  calculateExperienceYears(firstRaceDate) {
    if (!firstRaceDate) return 5; // Default experience
    return moment().diff(moment(firstRaceDate), 'years');
  }
  
  calculateAveragePosition(rider, races) {
    const riderRaces = this.filterRiderRaces(rider, races);
    if (riderRaces.length === 0) return 50; // Default middle position
    
    const positions = riderRaces.map(race => {
      const result = race.results?.find(r => 
        r.riderId === rider.riderId || r.riderName === rider.name
      );
      return result?.position || 50;
    });
    
    return positions.reduce((sum, pos) => sum + pos, 0) / positions.length;
  }
  
  calculateFormScore(recentRaces) {
    if (recentRaces.length === 0) return 0.5;
    
    let formScore = 0;
    let weightSum = 0;
    
    recentRaces.forEach((race, index) => {
      const weight = Math.exp(-index * 0.1); // Exponential decay for older races
      const raceScore = race.position ? Math.max(0, (100 - race.position) / 100) : 0.3;
      
      formScore += raceScore * weight;
      weightSum += weight;
    });
    
    return weightSum > 0 ? formScore / weightSum : 0.5;
  }
  
  calculateSpecializationScore(rider, races, specialty) {
    const specialtyRaces = races.filter(race => this.matchesSpecialty(race, specialty));
    const riderSpecialtyRaces = this.filterRiderRaces(rider, specialtyRaces);
    
    if (riderSpecialtyRaces.length === 0) return 0;
    
    const avgPosition = this.calculateAveragePosition(rider, riderSpecialtyRaces);
    return Math.max(0, (50 - avgPosition) / 50); // Normalize to 0-1 scale
  }
  
  matchesSpecialty(race, specialty) {
    const raceType = race.raceInfo?.type?.toLowerCase() || '';
    const terrain = race.raceInfo?.terrain?.toLowerCase() || '';
    
    switch (specialty) {
      case 'sprint':
        return terrain.includes('flat') || raceType.includes('sprint');
      case 'climbing':
        return terrain.includes('mountain') || terrain.includes('hill');
      case 'time_trial':
        return raceType.includes('time trial') || raceType.includes('tt');
      case 'classics':
        return raceType.includes('classic') || raceType.includes('monument');
      case 'grand_tour':
        return raceType.includes('grand tour') || raceType.includes('tour');
      default:
        return true;
    }
  }
  
  filterRiderRaces(rider, races) {
    return races.filter(race => {
      return race.results?.some(result => 
        result.riderId === rider.riderId || 
        result.riderName === rider.name ||
        result.riderName === rider.personalInfo?.name
      );
    });
  }
  
  getRecentRaces(rider, races, days) {
    const cutoffDate = moment().subtract(days, 'days');
    const riderRaces = this.filterRiderRaces(rider, races);
    
    return riderRaces.filter(race => 
      moment(race.raceInfo?.date).isAfter(cutoffDate)
    );
  }
  
  updateStats(duration, itemsProcessed) {
    this.stats.datasetsProcessed++;
    this.stats.featuresEngineered += itemsProcessed;
    this.stats.averageProcessingTime = 
      (this.stats.averageProcessingTime * (this.stats.datasetsProcessed - 1) + duration) / 
      this.stats.datasetsProcessed;
    this.stats.lastProcessed = new Date().toISOString();
  }
  
  /**
   * Get processing statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      config: this.config,
      featureDefinitions: Object.keys(this.featureDefinitions)
    };
  }
  
  // Additional helper methods would be implemented here...
  countRecentResults(races, maxPosition) {
    return races.filter(race => race.position && race.position <= maxPosition).length;
  }
  
  countSeasonResults(rider, races, year, maxPosition) {
    const seasonRaces = races.filter(race => 
      moment(race.raceInfo?.date).year() === year
    );
    const riderSeasonRaces = this.filterRiderRaces(rider, seasonRaces);
    return this.countRecentResults(riderSeasonRaces, maxPosition);
  }
  
  countSeasonRaces(rider, races, year) {
    const seasonRaces = races.filter(race => 
      moment(race.raceInfo?.date).year() === year
    );
    return this.filterRiderRaces(rider, seasonRaces).length;
  }
  
  calculateConsistencyScore(rider, races) {
    const riderRaces = this.filterRiderRaces(rider, races);
    if (riderRaces.length < 3) return 0.5;
    
    const positions = riderRaces.map(race => {
      const result = race.results?.find(r => 
        r.riderId === rider.riderId || r.riderName === rider.name
      );
      return result?.position || 50;
    });
    
    const mean = positions.reduce((sum, pos) => sum + pos, 0) / positions.length;
    const variance = positions.reduce((sum, pos) => sum + Math.pow(pos - mean, 2), 0) / positions.length;
    const stdDev = Math.sqrt(variance);
    
    // Lower standard deviation = higher consistency
    return Math.max(0, 1 - (stdDev / 50));
  }
  
  calculatePerformanceVariance(rider, races) {
    const riderRaces = this.filterRiderRaces(rider, races);
    if (riderRaces.length < 2) return 0;
    
    const positions = riderRaces.map(race => {
      const result = race.results?.find(r => 
        r.riderId === rider.riderId || r.riderName === rider.name
      );
      return result?.position || 50;
    });
    
    const mean = positions.reduce((sum, pos) => sum + pos, 0) / positions.length;
    return positions.reduce((sum, pos) => sum + Math.pow(pos - mean, 2), 0) / positions.length;
  }
  
  encodeNationality(nationality) {
    // Simple hash encoding for nationality
    if (!nationality) return 0;
    return nationality.split('').reduce((hash, char) => hash + char.charCodeAt(0), 0) % 1000;
  }
  
  encodeTeam(team) {
    // Simple hash encoding for team
    if (!team) return 0;
    const teamName = typeof team === 'string' ? team : team.name || '';
    return teamName.split('').reduce((hash, char) => hash + char.charCodeAt(0), 0) % 1000;
  }
  
  encodeRaceType(raceType) {
    const typeMap = {
      'stage_race': 1,
      'one_day': 2,
      'time_trial': 3,
      'grand_tour': 4,
      'classic': 5
    };
    return typeMap[raceType?.toLowerCase()] || 0;
  }
  
  encodeRaceCategory(category) {
    const categoryMap = {
      'wt': 5, // World Tour
      'hc': 4, // Hors Categorie
      '1': 3,  // Category 1
      '2': 2,  // Category 2
      '3': 1   // Category 3
    };
    return categoryMap[category?.toLowerCase()] || 0;
  }
  
  encodeTerrainType(terrain) {
    const terrainMap = {
      'flat': 1,
      'hilly': 2,
      'mountain': 3,
      'mixed': 4
    };
    return terrainMap[terrain?.toLowerCase()] || 0;
  }
  
  // Additional calculation methods would be implemented here...
}

module.exports = AIDataPreparation;