package com.pelotoniq.cycling.repository;

import com.pelotoniq.cycling.entity.Race;
import com.pelotoniq.cycling.entity.RaceCategory;
import com.pelotoniq.cycling.entity.RaceStatus;
import com.pelotoniq.cycling.entity.RaceType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
@DisplayName("RaceRepository Tests")
class RaceRepositoryTest {

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private RaceRepository raceRepository;

    private Race race1;
    private Race race2;
    private Race race3;
    private Race cancelledRace;

    @BeforeEach
    void setUp() {
        race1 = new Race("Tour de Test", "Mountain stage through scenic routes", 
                       LocalDate.of(2026, 6, 15), LocalTime.of(9, 0),
                       "Alpine Valley", "Switzerland", RaceType.ROAD_RACE, RaceCategory.PRO_SERIES);
        race1.setStatus(RaceStatus.PLANNED);
        race1.setDistanceKm(new BigDecimal("120.5"));
        race1.setElevationGainM(2500);
        race1.setEntryFee(new BigDecimal("75.00"));
        race1.setPrizeMoney(new BigDecimal("50000.00"));
        race1.setMaxParticipants(150);
        race1.setRegistrationOpen(true);
        race1.setRegistrationDeadline(LocalDate.of(2026, 6, 1));
        race1.setTemperatureCelsius(22);
        race1.setWeatherForecast("Sunny with light winds");

        race2 = new Race("City Sprint Challenge", "Fast-paced urban criterium racing", 
                       LocalDate.of(2026, 7, 20), LocalTime.of(18, 30),
                       "Downtown Circuit", "USA", RaceType.CRITERIUM, RaceCategory.AMATEUR);
        race2.setStatus(RaceStatus.REGISTRATION_OPEN);
        race2.setDistanceKm(new BigDecimal("45.0"));
        race2.setElevationGainM(200);
        race2.setEntryFee(new BigDecimal("25.00"));
        race2.setPrizeMoney(new BigDecimal("5000.00"));
        race2.setMaxParticipants(80);
        race2.setRegistrationOpen(true);
        race2.setRegistrationDeadline(LocalDate.of(2026, 7, 15));
        race2.setTemperatureCelsius(28);

        race3 = new Race("Mountain Time Trial", "Individual time trial up challenging climb", 
                       LocalDate.of(2026, 8, 10), LocalTime.of(14, 0),
                       "Mont Ventoux", "France", RaceType.TIME_TRIAL, RaceCategory.WORLD_TOUR);
        race3.setStatus(RaceStatus.FINISHED);
        race3.setDistanceKm(new BigDecimal("21.5"));
        race3.setElevationGainM(1600);
        race3.setEntryFee(new BigDecimal("150.00"));
        race3.setPrizeMoney(new BigDecimal("100000.00"));
        race3.setMaxParticipants(200);
        race3.setRegistrationOpen(false);
        race3.setRegistrationDeadline(LocalDate.of(2026, 7, 25));
        race3.setTemperatureCelsius(18);
        race3.setWeatherForecast("Cloudy with possible afternoon rain");

        cancelledRace = new Race("Cancelled Classic", "Unfortunately cancelled due to weather", 
                               LocalDate.of(2026, 9, 5), LocalTime.of(10, 30),
                               "Coastal Road", "UK", RaceType.ONE_DAY_CLASSIC, RaceCategory.CONTINENTAL);
        cancelledRace.setStatus(RaceStatus.CANCELLED);
        cancelledRace.setDistanceKm(new BigDecimal("180.0"));
        cancelledRace.setElevationGainM(1200);
        cancelledRace.setEntryFee(new BigDecimal("100.00"));
        cancelledRace.setPrizeMoney(new BigDecimal("25000.00"));
        cancelledRace.setMaxParticipants(120);
        cancelledRace.setRegistrationOpen(false);
        cancelledRace.setRegistrationDeadline(LocalDate.of(2026, 8, 20));
        cancelledRace.setTemperatureCelsius(15);

        entityManager.persistAndFlush(race1);
        entityManager.persistAndFlush(race2);
        entityManager.persistAndFlush(race3);
        entityManager.persistAndFlush(cancelledRace);
    }

    @Test
    @DisplayName("Should find race by name")
    void shouldFindRaceByName() {
        List<Race> races = raceRepository.findByName("Tour de Test");
        
        assertThat(races).hasSize(1);
        assertThat(races.get(0).getName()).isEqualTo("Tour de Test");
        assertThat(races.get(0).getLocation()).isEqualTo("Alpine Valley");
    }

    @Test
    @DisplayName("Should check if race exists by name")
    void shouldCheckIfRaceExistsByName() {
        boolean exists = raceRepository.existsByName("City Sprint Challenge");
        boolean notExists = raceRepository.existsByName("Non-existent Race");
        
        assertThat(exists).isTrue();
        assertThat(notExists).isFalse();
    }

    @Test
    @DisplayName("Should find races by location")
    void shouldFindRacesByLocation() {
        List<Race> races = raceRepository.findByLocation("Alpine Valley");
        
        assertThat(races).hasSize(1);
        assertThat(races.get(0).getName()).isEqualTo("Tour de Test");
    }

    @Test
    @DisplayName("Should find races by country")
    void shouldFindRacesByCountry() {
        List<Race> races = raceRepository.findByCountry("USA");
        
        assertThat(races).hasSize(1);
        assertThat(races.get(0).getName()).isEqualTo("City Sprint Challenge");
    }

    @Test
    @DisplayName("Should find races by race type")
    void shouldFindRacesByRaceType() {
        List<Race> races = raceRepository.findByRaceType(RaceType.TIME_TRIAL);
        
        assertThat(races).hasSize(1);
        assertThat(races.get(0).getName()).isEqualTo("Mountain Time Trial");
    }

    @Test
    @DisplayName("Should find races by category")
    void shouldFindRacesByCategory() {
        List<Race> races = raceRepository.findByCategory(RaceCategory.WORLD_TOUR);
        
        assertThat(races).hasSize(1);
        assertThat(races.get(0).getName()).isEqualTo("Mountain Time Trial");
    }

    @Test
    @DisplayName("Should find races by status")
    void shouldFindRacesByStatus() {
        List<Race> races = raceRepository.findByStatus(RaceStatus.REGISTRATION_OPEN);
        
        assertThat(races).hasSize(1);
        assertThat(races.get(0).getName()).isEqualTo("City Sprint Challenge");
    }

    @Test
    @DisplayName("Should find races with open registration")
    void shouldFindRacesWithOpenRegistration() {
        List<Race> races = raceRepository.findByRegistrationOpenTrue();
        
        assertThat(races).hasSize(2);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("Tour de Test", "City Sprint Challenge");
    }

    @Test
    @DisplayName("Should find races with closed registration")
    void shouldFindRacesWithClosedRegistration() {
        List<Race> races = raceRepository.findByRegistrationOpenFalse();
        
        assertThat(races).hasSize(2);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("Mountain Time Trial", "Cancelled Classic");
    }

    @Test
    @DisplayName("Should find races by location with pagination")
    void shouldFindRacesByLocationWithPagination() {
        Pageable pageable = PageRequest.of(0, 1);
        Page<Race> racePage = raceRepository.findByLocation("Alpine Valley", pageable);
        
        assertThat(racePage.getTotalElements()).isEqualTo(1);
        assertThat(racePage.getContent()).hasSize(1);
        assertThat(racePage.getTotalPages()).isEqualTo(1);
    }

    @Test
    @DisplayName("Should find races by date range")
    void shouldFindRacesByDateRange() {
        LocalDate startDate = LocalDate.of(2026, 6, 1);
        LocalDate endDate = LocalDate.of(2026, 7, 31);
        
        List<Race> races = raceRepository.findByRaceDateBetween(startDate, endDate);
        
        assertThat(races).hasSize(2);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("Tour de Test", "City Sprint Challenge");
    }

    @Test
    @DisplayName("Should find upcoming races")
    void shouldFindUpcomingRaces() {
        LocalDate currentDate = LocalDate.of(2026, 7, 1);
        
        List<Race> races = raceRepository.findUpcomingRaces(currentDate);
        
        assertThat(races).hasSize(3);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("City Sprint Challenge", "Mountain Time Trial", "Cancelled Classic");
    }

    @Test
    @DisplayName("Should find past races")
    void shouldFindPastRaces() {
        LocalDate currentDate = LocalDate.of(2026, 7, 1);
        
        List<Race> races = raceRepository.findPastRaces(currentDate);
        
        assertThat(races).hasSize(1);
        assertThat(races.get(0).getName()).isEqualTo("Tour de Test");
    }

    @Test
    @DisplayName("Should find races open for registration")
    void shouldFindRacesOpenForRegistration() {
        LocalDate currentDate = LocalDate.of(2026, 5, 1);
        
        List<Race> races = raceRepository.findRacesOpenForRegistration(currentDate);
        
        assertThat(races).hasSize(2);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("Tour de Test", "City Sprint Challenge");
    }

    @Test
    @DisplayName("Should find races by distance range")
    void shouldFindRacesByDistanceRange() {
        BigDecimal minDistance = new BigDecimal("40.0");
        BigDecimal maxDistance = new BigDecimal("130.0");
        
        List<Race> races = raceRepository.findByDistanceRange(minDistance, maxDistance);
        
        assertThat(races).hasSize(2);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("Tour de Test", "City Sprint Challenge");
    }

    @Test
    @DisplayName("Should find races by elevation range")
    void shouldFindRacesByElevationRange() {
        Integer minElevation = 1000;
        Integer maxElevation = 2000;
        
        List<Race> races = raceRepository.findByElevationRange(minElevation, maxElevation);
        
        assertThat(races).hasSize(2);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("Mountain Time Trial", "Cancelled Classic");
    }

    @Test
    @DisplayName("Should find races by entry fee range")
    void shouldFindRacesByEntryFeeRange() {
        BigDecimal minFee = new BigDecimal("50.00");
        BigDecimal maxFee = new BigDecimal("200.00");
        
        List<Race> races = raceRepository.findByEntryFeeRange(minFee, maxFee);
        
        assertThat(races).hasSize(3);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("Tour de Test", "Mountain Time Trial", "Cancelled Classic");
    }

    @Test
    @DisplayName("Should find races by minimum prize money")
    void shouldFindRacesByMinimumPrizeMoney() {
        BigDecimal minPrize = new BigDecimal("20000.00");
        
        List<Race> races = raceRepository.findByMinimumPrizeMoney(minPrize);
        
        assertThat(races).hasSize(3);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("Tour de Test", "Mountain Time Trial", "Cancelled Classic");
    }

    @Test
    @DisplayName("Should find races by minimum capacity")
    void shouldFindRacesByMinimumCapacity() {
        Integer minCapacity = 100;
        
        List<Race> races = raceRepository.findByMinimumCapacity(minCapacity);
        
        assertThat(races).hasSize(3);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("Tour de Test", "Mountain Time Trial", "Cancelled Classic");
    }

    @Test
    @DisplayName("Should find races by keyword search")
    void shouldFindRacesByKeywordSearch() {
        List<Race> races = raceRepository.findByNameOrDescriptionContainingIgnoreCase("mountain");
        
        assertThat(races).hasSize(2);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("Tour de Test", "Mountain Time Trial");
    }

    @Test
    @DisplayName("Should find races by keyword search case insensitive")
    void shouldFindRacesByKeywordSearchCaseInsensitive() {
        List<Race> races = raceRepository.findByNameOrDescriptionContainingIgnoreCase("SPRINT");
        
        assertThat(races).hasSize(1);
        assertThat(races.get(0).getName()).isEqualTo("City Sprint Challenge");
    }

    @Test
    @DisplayName("Should find races with minimum participant count")
    void shouldFindRacesWithMinimumParticipantCount() {
        List<Race> races = raceRepository.findByMinimumParticipantCount(0);
        
        assertThat(races).hasSize(4);
    }

    @Test
    @DisplayName("Should find races with available spots")
    void shouldFindRacesWithAvailableSpots() {
        List<Race> races = raceRepository.findRacesWithAvailableSpots();
        
        assertThat(races).hasSize(4);
    }

    @Test
    @DisplayName("Should find full races")
    void shouldFindFullRaces() {
        List<Race> races = raceRepository.findFullRaces();
        
        assertThat(races).isEmpty();
    }

    @Test
    @DisplayName("Should count races by location and status")
    void shouldCountRacesByLocationAndStatus() {
        long count = raceRepository.countByLocationAndStatus("Alpine Valley", RaceStatus.PLANNED);
        
        assertThat(count).isEqualTo(1);
    }

    @Test
    @DisplayName("Should count races by country and year")
    void shouldCountRacesByCountryAndYear() {
        long count = raceRepository.countByCountryAndYear("USA", 2026);
        
        assertThat(count).isEqualTo(1);
    }

    @Test
    @DisplayName("Should find location race counts by year")
    void shouldFindLocationRaceCountsByYear() {
        List<Object[]> counts = raceRepository.findLocationRaceCountsByYear(2026);
        
        assertThat(counts).hasSize(4);
        assertThat(counts).allMatch(count -> count.length == 2);
    }

    @Test
    @DisplayName("Should find country race counts by year")
    void shouldFindCountryRaceCountsByYear() {
        List<Object[]> counts = raceRepository.findCountryRaceCountsByYear(2026);
        
        assertThat(counts).hasSize(4);
        assertThat(counts).allMatch(count -> count.length == 2);
    }

    @Test
    @DisplayName("Should find race type counts by year")
    void shouldFindRaceTypeCountsByYear() {
        List<Object[]> counts = raceRepository.findRaceTypeCountsByYear(2026);
        
        assertThat(counts).hasSize(4);
        assertThat(counts).allMatch(count -> count.length == 2);
    }

    @Test
    @DisplayName("Should find category counts by year")
    void shouldFindCategoryCountsByYear() {
        List<Object[]> counts = raceRepository.findCategoryCountsByYear(2026);
        
        assertThat(counts).hasSize(4);
        assertThat(counts).allMatch(count -> count.length == 2);
    }

    @Test
    @DisplayName("Should find average distance by race type")
    void shouldFindAverageDistanceByRaceType() {
        BigDecimal avgDistance = raceRepository.findAverageDistanceByRaceType(RaceType.TIME_TRIAL);
        
        assertThat(avgDistance).isEqualByComparingTo(new BigDecimal("21.5"));
    }

    @Test
    @DisplayName("Should find average elevation by country")
    void shouldFindAverageElevationByCountry() {
        Double avgElevation = raceRepository.findAverageElevationByCountry("Switzerland");
        
        assertThat(avgElevation).isEqualTo(2500.0);
    }

    @Test
    @DisplayName("Should find average entry fee by category")
    void shouldFindAverageEntryFeeByCategory() {
        BigDecimal avgFee = raceRepository.findAverageEntryFeeByCategory(RaceCategory.AMATEUR);
        
        assertThat(avgFee).isEqualByComparingTo(new BigDecimal("25.0"));
    }

    @Test
    @DisplayName("Should find total prize money by country and year")
    void shouldFindTotalPrizeMoneyByCountryAndYear() {
        BigDecimal totalPrize = raceRepository.findTotalPrizeMoneyByCountryAndYear("France", 2026);
        
        assertThat(totalPrize).isEqualTo(new BigDecimal("100000.00"));
    }

    @Test
    @DisplayName("Should find races by temperature range")
    void shouldFindRacesByTemperatureRange() {
        List<Race> races = raceRepository.findByTemperatureRange(20, 30);
        
        assertThat(races).hasSize(2);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("Tour de Test", "City Sprint Challenge");
    }

    @Test
    @DisplayName("Should find races by start time range")
    void shouldFindRacesByStartTimeRange() {
        LocalTime startTime = LocalTime.of(8, 0);
        LocalTime endTime = LocalTime.of(12, 0);
        
        List<Race> races = raceRepository.findByStartTimeRange(startTime, endTime);
        
        assertThat(races).hasSize(2);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("Tour de Test", "Cancelled Classic");
    }

    @Test
    @DisplayName("Should find races with weather forecast")
    void shouldFindRacesWithWeatherForecast() {
        List<Race> races = raceRepository.findRacesWithWeatherForecast();
        
        assertThat(races).hasSize(2);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("Tour de Test", "Mountain Time Trial");
    }

    @Test
    @DisplayName("Should find races without weather forecast")
    void shouldFindRacesWithoutWeatherForecast() {
        List<Race> races = raceRepository.findRacesWithoutWeatherForecast();
        
        assertThat(races).hasSize(2);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("City Sprint Challenge", "Cancelled Classic");
    }

    @Test
    @DisplayName("Should find active upcoming races")
    void shouldFindActiveUpcomingRaces() {
        LocalDate currentDate = LocalDate.of(2026, 5, 1);
        
        List<Race> races = raceRepository.findActiveUpcomingRaces(currentDate);
        
        assertThat(races).hasSize(2);
        assertThat(races).extracting(Race::getName)
                .containsExactlyInAnyOrder("Tour de Test", "City Sprint Challenge");
    }

    @Test
    @DisplayName("Should find cancelled or postponed races")
    void shouldFindCancelledOrPostponedRaces() {
        LocalDate currentDate = LocalDate.of(2026, 5, 1);
        
        List<Race> races = raceRepository.findCancelledOrPostponedRaces(currentDate);
        
        assertThat(races).hasSize(1);
        assertThat(races.get(0).getName()).isEqualTo("Cancelled Classic");
    }

    @Test
    @DisplayName("Should find longest races by type")
    void shouldFindLongestRacesByType() {
        List<Race> races = raceRepository.findLongestRacesByType();
        
        assertThat(races).hasSize(4);
    }

    @Test
    @DisplayName("Should find highest prize money races")
    void shouldFindHighestPrizeMoneyRaces() {
        List<Race> races = raceRepository.findHighestPrizeMoneyRaces();
        
        assertThat(races).hasSize(1);
        assertThat(races.get(0).getName()).isEqualTo("Mountain Time Trial");
    }

    @Test
    @DisplayName("Should find most challenging races")
    void shouldFindMostChallengingRaces() {
        List<Race> races = raceRepository.findMostChallengingRaces();
        
        assertThat(races).hasSize(1);
        assertThat(races.get(0).getName()).isEqualTo("Tour de Test");
    }

    @Test
    @DisplayName("Should find races ordered by distance desc")
    void shouldFindRacesOrderedByDistanceDesc() {
        Pageable pageable = PageRequest.of(0, 2);
        List<Race> races = raceRepository.findRacesOrderedByDistanceDesc(pageable);
        
        assertThat(races).hasSize(2);
        assertThat(races.get(0).getDistanceKm()).isGreaterThanOrEqualTo(races.get(1).getDistanceKm());
    }

    @Test
    @DisplayName("Should find races ordered by prize money desc")
    void shouldFindRacesOrderedByPrizeMoneyDesc() {
        Pageable pageable = PageRequest.of(0, 3);
        List<Race> races = raceRepository.findRacesOrderedByPrizeMoneyDesc(pageable);
        
        assertThat(races).hasSize(3);
        assertThat(races.get(0).getPrizeMoney()).isGreaterThanOrEqualTo(races.get(1).getPrizeMoney());
        assertThat(races.get(1).getPrizeMoney()).isGreaterThanOrEqualTo(races.get(2).getPrizeMoney());
    }

    @Test
    @DisplayName("Should find most popular races")
    void shouldFindMostPopularRaces() {
        Pageable pageable = PageRequest.of(0, 4);
        List<Race> races = raceRepository.findMostPopularRaces(pageable);
        
        assertThat(races).hasSize(4);
    }

    @Test
    @DisplayName("Should handle empty results gracefully")
    void shouldHandleEmptyResultsGracefully() {
        List<Race> races = raceRepository.findByLocation("Non-existent Location");
        
        assertThat(races).isEmpty();
    }

    @Test
    @DisplayName("Should handle null parameters in custom queries")
    void shouldHandleNullParametersInCustomQueries() {
        List<Race> races = raceRepository.findByMinimumPrizeMoney(null);
        
        assertThat(races).isEmpty();
    }

    @Test
    @DisplayName("Should return empty list for high minimum participant count")
    void shouldReturnEmptyListForHighMinimumParticipantCount() {
        List<Race> races = raceRepository.findByMinimumParticipantCount(1000);
        
        assertThat(races).isEmpty();
    }
}