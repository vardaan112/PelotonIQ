package com.pelotoniq.cycling.repository;

import com.pelotoniq.cycling.entity.Race;
import com.pelotoniq.cycling.entity.RaceCategory;
import com.pelotoniq.cycling.entity.RaceStatus;
import com.pelotoniq.cycling.entity.RaceType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface RaceRepository extends JpaRepository<Race, Long> {

    List<Race> findByName(String name);

    boolean existsByName(String name);

    List<Race> findByLocation(String location);

    List<Race> findByCountry(String country);

    List<Race> findByRaceType(RaceType raceType);

    List<Race> findByCategory(RaceCategory category);

    List<Race> findByStatus(RaceStatus status);

    List<Race> findByRegistrationOpenTrue();

    List<Race> findByRegistrationOpenFalse();

    Page<Race> findByLocation(String location, Pageable pageable);

    Page<Race> findByCountry(String country, Pageable pageable);

    Page<Race> findByRaceType(RaceType raceType, Pageable pageable);

    Page<Race> findByCategory(RaceCategory category, Pageable pageable);

    Page<Race> findByStatus(RaceStatus status, Pageable pageable);

    @Query("SELECT r FROM Race r WHERE r.raceDate BETWEEN :startDate AND :endDate")
    List<Race> findByRaceDateBetween(@Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    @Query("SELECT r FROM Race r WHERE r.raceDate >= :date")
    List<Race> findUpcomingRaces(@Param("date") LocalDate date);

    @Query("SELECT r FROM Race r WHERE r.raceDate < :date")
    List<Race> findPastRaces(@Param("date") LocalDate date);

    @Query("SELECT r FROM Race r WHERE r.registrationDeadline >= :date AND r.registrationOpen = true")
    List<Race> findRacesOpenForRegistration(@Param("date") LocalDate date);

    @Query("SELECT r FROM Race r WHERE r.distanceKm BETWEEN :minDistance AND :maxDistance")
    List<Race> findByDistanceRange(@Param("minDistance") BigDecimal minDistance, @Param("maxDistance") BigDecimal maxDistance);

    @Query("SELECT r FROM Race r WHERE r.elevationGainM BETWEEN :minElevation AND :maxElevation")
    List<Race> findByElevationRange(@Param("minElevation") Integer minElevation, @Param("maxElevation") Integer maxElevation);

    @Query("SELECT r FROM Race r WHERE r.entryFee BETWEEN :minFee AND :maxFee")
    List<Race> findByEntryFeeRange(@Param("minFee") BigDecimal minFee, @Param("maxFee") BigDecimal maxFee);

    @Query("SELECT r FROM Race r WHERE r.prizeMoney >= :minPrize")
    List<Race> findByMinimumPrizeMoney(@Param("minPrize") BigDecimal minPrize);

    @Query("SELECT r FROM Race r WHERE r.maxParticipants >= :minCapacity")
    List<Race> findByMinimumCapacity(@Param("minCapacity") Integer minCapacity);

    @Query("SELECT r FROM Race r WHERE LOWER(r.name) LIKE LOWER(CONCAT('%', :keyword, '%')) OR LOWER(r.description) LIKE LOWER(CONCAT('%', :keyword, '%'))")
    List<Race> findByNameOrDescriptionContainingIgnoreCase(@Param("keyword") String keyword);

    @Query("SELECT r FROM Race r WHERE SIZE(r.participants) >= :minParticipants")
    List<Race> findByMinimumParticipantCount(@Param("minParticipants") int minParticipants);

    @Query("SELECT r FROM Race r WHERE SIZE(r.participants) < r.maxParticipants")
    List<Race> findRacesWithAvailableSpots();

    @Query("SELECT r FROM Race r WHERE SIZE(r.participants) >= r.maxParticipants")
    List<Race> findFullRaces();

    @Query("SELECT COUNT(r) FROM Race r WHERE r.location = :location AND r.status = :status")
    long countByLocationAndStatus(@Param("location") String location, @Param("status") RaceStatus status);

    @Query("SELECT COUNT(r) FROM Race r WHERE r.country = :country AND YEAR(r.raceDate) = :year")
    long countByCountryAndYear(@Param("country") String country, @Param("year") int year);

    @Query("SELECT r.location, COUNT(r) FROM Race r WHERE YEAR(r.raceDate) = :year GROUP BY r.location ORDER BY COUNT(r) DESC")
    List<Object[]> findLocationRaceCountsByYear(@Param("year") int year);

    @Query("SELECT r.country, COUNT(r) FROM Race r WHERE YEAR(r.raceDate) = :year GROUP BY r.country ORDER BY COUNT(r) DESC")
    List<Object[]> findCountryRaceCountsByYear(@Param("year") int year);

    @Query("SELECT r.raceType, COUNT(r) FROM Race r WHERE YEAR(r.raceDate) = :year GROUP BY r.raceType ORDER BY COUNT(r) DESC")
    List<Object[]> findRaceTypeCountsByYear(@Param("year") int year);

    @Query("SELECT r.category, COUNT(r) FROM Race r WHERE YEAR(r.raceDate) = :year GROUP BY r.category ORDER BY COUNT(r) DESC")
    List<Object[]> findCategoryCountsByYear(@Param("year") int year);

    @Query("SELECT AVG(r.distanceKm) FROM Race r WHERE r.raceType = :raceType")
    BigDecimal findAverageDistanceByRaceType(@Param("raceType") RaceType raceType);

    @Query("SELECT AVG(r.elevationGainM) FROM Race r WHERE r.country = :country")
    Double findAverageElevationByCountry(@Param("country") String country);

    @Query("SELECT AVG(r.entryFee) FROM Race r WHERE r.category = :category")
    BigDecimal findAverageEntryFeeByCategory(@Param("category") RaceCategory category);

    @Query("SELECT SUM(r.prizeMoney) FROM Race r WHERE r.country = :country AND YEAR(r.raceDate) = :year")
    BigDecimal findTotalPrizeMoneyByCountryAndYear(@Param("country") String country, @Param("year") int year);

    @Query("SELECT r FROM Race r WHERE r.distanceKm = (SELECT MAX(r2.distanceKm) FROM Race r2 WHERE r2.raceType = r.raceType)")
    List<Race> findLongestRacesByType();

    @Query("SELECT r FROM Race r WHERE r.prizeMoney = (SELECT MAX(r2.prizeMoney) FROM Race r2)")
    List<Race> findHighestPrizeMoneyRaces();

    @Query("SELECT r FROM Race r WHERE r.elevationGainM = (SELECT MAX(r2.elevationGainM) FROM Race r2)")
    List<Race> findMostChallengingRaces();

    @Query("SELECT r FROM Race r ORDER BY r.distanceKm DESC")
    List<Race> findRacesOrderedByDistanceDesc(Pageable pageable);

    @Query("SELECT r FROM Race r ORDER BY r.prizeMoney DESC")
    List<Race> findRacesOrderedByPrizeMoneyDesc(Pageable pageable);

    @Query("SELECT r FROM Race r ORDER BY SIZE(r.participants) DESC")
    List<Race> findMostPopularRaces(Pageable pageable);

    @Query("SELECT r FROM Race r WHERE r.temperatureCelsius BETWEEN :minTemp AND :maxTemp")
    List<Race> findByTemperatureRange(@Param("minTemp") Integer minTemp, @Param("maxTemp") Integer maxTemp);

    @Query("SELECT r FROM Race r WHERE r.startTime BETWEEN :startTime AND :endTime")
    List<Race> findByStartTimeRange(@Param("startTime") LocalTime startTime, @Param("endTime") LocalTime endTime);

    @Query("SELECT r FROM Race r WHERE r.weatherForecast IS NOT NULL")
    List<Race> findRacesWithWeatherForecast();

    @Query("SELECT r FROM Race r WHERE r.weatherForecast IS NULL")
    List<Race> findRacesWithoutWeatherForecast();

    @Query("SELECT r FROM Race r WHERE r.status IN ('PLANNED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED') AND r.raceDate >= :currentDate")
    List<Race> findActiveUpcomingRaces(@Param("currentDate") LocalDate currentDate);

    @Query("SELECT r FROM Race r WHERE r.status IN ('CANCELLED', 'POSTPONED') AND r.raceDate >= :currentDate")
    List<Race> findCancelledOrPostponedRaces(@Param("currentDate") LocalDate currentDate);
}