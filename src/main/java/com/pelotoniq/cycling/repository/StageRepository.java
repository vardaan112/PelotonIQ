package com.pelotoniq.cycling.repository;

import com.pelotoniq.cycling.entity.Stage;
import com.pelotoniq.cycling.entity.StageType;
import com.pelotoniq.cycling.entity.StageStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface StageRepository extends JpaRepository<Stage, Long> {

    // Stages by race
    List<Stage> findByRaceIdOrderByStageNumber(Long raceId);
    Page<Stage> findByRaceId(Long raceId, Pageable pageable);

    // Stage by race and number
    Optional<Stage> findByRaceIdAndStageNumber(Long raceId, Integer stageNumber);

    // Stages by date
    List<Stage> findByStageDate(LocalDate stageDate);
    List<Stage> findByStageDateBetween(LocalDate startDate, LocalDate endDate);

    // Stages by type
    List<Stage> findByStageType(StageType stageType);
    Page<Stage> findByStageType(StageType stageType, Pageable pageable);

    // Stages by status
    List<Stage> findByStatus(StageStatus status);
    Page<Stage> findByStatus(StageStatus status, Pageable pageable);

    // Active/racing stages
    @Query("SELECT s FROM Stage s WHERE s.status IN ('NEUTRALIZED', 'RACING')")
    List<Stage> findActiveStages();

    // Upcoming stages
    @Query("SELECT s FROM Stage s WHERE s.status IN ('PLANNED', 'READY') AND s.stageDate >= CURRENT_DATE ORDER BY s.stageDate, s.startTime")
    List<Stage> findUpcomingStages();

    // Today's stages
    @Query("SELECT s FROM Stage s WHERE s.stageDate = CURRENT_DATE ORDER BY s.startTime")
    List<Stage> findTodaysStages();

    // Completed stages
    @Query("SELECT s FROM Stage s WHERE s.status = 'FINISHED' ORDER BY s.stageDate DESC")
    List<Stage> findCompletedStages();

    // Mountain stages
    @Query("SELECT s FROM Stage s WHERE s.stageType IN ('MOUNTAIN_STAGE', 'SUMMIT_FINISH', 'HILL_FINISH')")
    List<Stage> findMountainStages();

    // Sprint stages
    @Query("SELECT s FROM Stage s WHERE s.stageType IN ('FLAT_STAGE', 'CRITERIUM')")
    List<Stage> findSprintStages();

    // Time trial stages
    @Query("SELECT s FROM Stage s WHERE s.stageType IN ('INDIVIDUAL_TIME_TRIAL', 'TEAM_TIME_TRIAL', 'PROLOGUE')")
    List<Stage> findTimeTrialStages();

    // Stages by difficulty (based on elevation and distance)
    @Query("SELECT s FROM Stage s WHERE " +
           "(s.elevationGainM IS NOT NULL AND s.elevationGainM > :minElevation) OR " +
           "(s.distanceKm IS NOT NULL AND s.distanceKm > :minDistance) " +
           "ORDER BY s.elevationGainM DESC, s.distanceKm DESC")
    List<Stage> findDifficultStages(@Param("minElevation") Integer minElevation, 
                                   @Param("minDistance") java.math.BigDecimal minDistance);

    // Stages by location
    @Query("SELECT s FROM Stage s WHERE LOWER(s.startLocation) LIKE LOWER(CONCAT('%', :location, '%')) OR " +
           "LOWER(s.finishLocation) LIKE LOWER(CONCAT('%', :location, '%'))")
    List<Stage> findByLocationContaining(@Param("location") String location);

    // Statistics queries
    @Query("SELECT COUNT(s) FROM Stage s WHERE s.race.id = :raceId")
    long countStagesByRace(@Param("raceId") Long raceId);

    @Query("SELECT COUNT(s) FROM Stage s WHERE s.stageType = :stageType")
    long countStagesByType(@Param("stageType") StageType stageType);

    @Query("SELECT AVG(s.distanceKm) FROM Stage s WHERE s.distanceKm IS NOT NULL")
    Double findAverageStageDistance();

    @Query("SELECT AVG(s.elevationGainM) FROM Stage s WHERE s.elevationGainM IS NOT NULL")
    Double findAverageElevationGain();

    @Query("SELECT MAX(s.distanceKm) FROM Stage s WHERE s.distanceKm IS NOT NULL")
    java.math.BigDecimal findLongestStageDistance();

    @Query("SELECT MAX(s.elevationGainM) FROM Stage s WHERE s.elevationGainM IS NOT NULL")
    Integer findHighestElevationGain();

    // Stages requiring specific weather conditions
    @Query("SELECT s FROM Stage s WHERE s.temperatureCelsius IS NOT NULL AND " +
           "s.temperatureCelsius BETWEEN :minTemp AND :maxTemp")
    List<Stage> findStagesByTemperatureRange(@Param("minTemp") Integer minTemp, @Param("maxTemp") Integer maxTemp);

    // Stages with time limits
    @Query("SELECT s FROM Stage s WHERE s.timeLimitMinutes IS NOT NULL ORDER BY s.timeLimitMinutes")
    List<Stage> findStagesWithTimeLimit();

    // Stages by expected duration
    @Query("SELECT s FROM Stage s WHERE s.expectedAvgSpeedKmh IS NOT NULL AND s.distanceKm IS NOT NULL " +
           "ORDER BY (s.distanceKm / s.expectedAvgSpeedKmh) DESC")
    List<Stage> findStagesOrderedByExpectedDuration();

    // Team time trial stages
    @Query("SELECT s FROM Stage s WHERE s.teamTimeTrial = true")
    List<Stage> findTeamTimeTrialStages();

    // Neutralized start stages
    @Query("SELECT s FROM Stage s WHERE s.neutralizedStart = true")
    List<Stage> findNeutralizedStartStages();

    // High points stages
    @Query("SELECT s FROM Stage s WHERE s.pointsAvailable IS NOT NULL AND s.pointsAvailable > :minPoints ORDER BY s.pointsAvailable DESC")
    List<Stage> findHighPointsStages(@Param("minPoints") Integer minPoints);

    // Stages by race type and stage type combination
    @Query("SELECT s FROM Stage s JOIN s.race r WHERE r.raceType = :raceType AND s.stageType = :stageType")
    List<Stage> findByRaceTypeAndStageType(@Param("raceType") com.pelotoniq.cycling.entity.RaceType raceType, 
                                          @Param("stageType") StageType stageType);

    // Count stages by status for a race
    @Query("SELECT s.status, COUNT(s) FROM Stage s WHERE s.race.id = :raceId GROUP BY s.status")
    List<Object[]> countStagesByStatusForRace(@Param("raceId") Long raceId);
}