package com.pelotoniq.cycling.repository;

import com.pelotoniq.cycling.entity.Rider;
import com.pelotoniq.cycling.entity.RiderSpecialization;
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

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
@DisplayName("RiderRepository Tests")
class RiderRepositoryTest {

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private RiderRepository riderRepository;

    private Rider rider1;
    private Rider rider2;
    private Rider rider3;
    private Rider inactiveRider;

    @BeforeEach
    void setUp() {
        rider1 = new Rider("John", "Doe", "john.doe@example.com", 
                         LocalDate.of(1995, 5, 15), "USA", "Team Sky", RiderSpecialization.SPRINTER);
        rider1.setHeightCm(180);
        rider1.setWeightKg(75);
        rider1.setFtpWatts(350.0);
        rider1.setActive(true);

        rider2 = new Rider("Jane", "Smith", "jane.smith@example.com", 
                         LocalDate.of(1992, 8, 22), "UK", "Team Ineos", RiderSpecialization.CLIMBER);
        rider2.setHeightCm(165);
        rider2.setWeightKg(58);
        rider2.setFtpWatts(320.0);
        rider2.setActive(true);

        rider3 = new Rider("Pierre", "Dubois", "pierre.dubois@example.com", 
                         LocalDate.of(1990, 3, 10), "France", "Team Sky", RiderSpecialization.ALL_ROUNDER);
        rider3.setHeightCm(178);
        rider3.setWeightKg(72);
        rider3.setFtpWatts(380.0);
        rider3.setActive(true);

        inactiveRider = new Rider("Maria", "Garcia", "maria.garcia@example.com", 
                                LocalDate.of(1988, 12, 5), "Spain", "Team Movistar", RiderSpecialization.TIME_TRIALIST);
        inactiveRider.setHeightCm(170);
        inactiveRider.setWeightKg(62);
        inactiveRider.setFtpWatts(340.0);
        inactiveRider.setActive(false);

        entityManager.persistAndFlush(rider1);
        entityManager.persistAndFlush(rider2);
        entityManager.persistAndFlush(rider3);
        entityManager.persistAndFlush(inactiveRider);
    }

    @Test
    @DisplayName("Should find rider by email")
    void shouldFindRiderByEmail() {
        Optional<Rider> found = riderRepository.findByEmail("john.doe@example.com");
        
        assertThat(found).isPresent();
        assertThat(found.get().getFirstName()).isEqualTo("John");
        assertThat(found.get().getLastName()).isEqualTo("Doe");
    }

    @Test
    @DisplayName("Should return empty when rider not found by email")
    void shouldReturnEmptyWhenRiderNotFoundByEmail() {
        Optional<Rider> found = riderRepository.findByEmail("nonexistent@example.com");
        
        assertThat(found).isEmpty();
    }

    @Test
    @DisplayName("Should check if rider exists by email")
    void shouldCheckIfRiderExistsByEmail() {
        boolean exists = riderRepository.existsByEmail("jane.smith@example.com");
        boolean notExists = riderRepository.existsByEmail("nonexistent@example.com");
        
        assertThat(exists).isTrue();
        assertThat(notExists).isFalse();
    }

    @Test
    @DisplayName("Should find riders by team")
    void shouldFindRidersByTeam() {
        List<Rider> teamSkyRiders = riderRepository.findByTeam("Team Sky");
        
        assertThat(teamSkyRiders).hasSize(2);
        assertThat(teamSkyRiders).extracting(Rider::getEmail)
                .containsExactlyInAnyOrder("john.doe@example.com", "pierre.dubois@example.com");
    }

    @Test
    @DisplayName("Should find riders by nationality")
    void shouldFindRidersByNationality() {
        List<Rider> usaRiders = riderRepository.findByNationality("USA");
        
        assertThat(usaRiders).hasSize(1);
        assertThat(usaRiders.get(0).getEmail()).isEqualTo("john.doe@example.com");
    }

    @Test
    @DisplayName("Should find riders by specialization")
    void shouldFindRidersBySpecialization() {
        List<Rider> sprinters = riderRepository.findBySpecialization(RiderSpecialization.SPRINTER);
        
        assertThat(sprinters).hasSize(1);
        assertThat(sprinters.get(0).getEmail()).isEqualTo("john.doe@example.com");
    }

    @Test
    @DisplayName("Should find only active riders")
    void shouldFindOnlyActiveRiders() {
        List<Rider> activeRiders = riderRepository.findByActiveTrue();
        
        assertThat(activeRiders).hasSize(3);
        assertThat(activeRiders).extracting(Rider::getActive).containsOnly(true);
    }

    @Test
    @DisplayName("Should find only inactive riders")
    void shouldFindOnlyInactiveRiders() {
        List<Rider> inactiveRiders = riderRepository.findByActiveFalse();
        
        assertThat(inactiveRiders).hasSize(1);
        assertThat(inactiveRiders.get(0).getEmail()).isEqualTo("maria.garcia@example.com");
    }

    @Test
    @DisplayName("Should find riders by team with pagination")
    void shouldFindRidersByTeamWithPagination() {
        Pageable pageable = PageRequest.of(0, 1);
        Page<Rider> teamSkyPage = riderRepository.findByTeam("Team Sky", pageable);
        
        assertThat(teamSkyPage.getTotalElements()).isEqualTo(2);
        assertThat(teamSkyPage.getContent()).hasSize(1);
        assertThat(teamSkyPage.getTotalPages()).isEqualTo(2);
    }

    @Test
    @DisplayName("Should find riders by date of birth range")
    void shouldFindRidersByDateOfBirthRange() {
        LocalDate startDate = LocalDate.of(1990, 1, 1);
        LocalDate endDate = LocalDate.of(1995, 12, 31);
        
        List<Rider> riders = riderRepository.findByDateOfBirthBetween(startDate, endDate);
        
        assertThat(riders).hasSize(3);
        assertThat(riders).extracting(Rider::getEmail)
                .containsExactlyInAnyOrder("john.doe@example.com", "jane.smith@example.com", "pierre.dubois@example.com");
    }

    @Test
    @DisplayName("Should find riders by age range")
    void shouldFindRidersByAgeRange() {
        List<Rider> riders = riderRepository.findByAgeBetween(25, 40);
        
        assertThat(riders).hasSize(4);
    }

    @Test
    @DisplayName("Should find riders by minimum FTP")
    void shouldFindRidersByMinimumFtp() {
        List<Rider> riders = riderRepository.findByFtpWattsGreaterThanEqual(350.0);
        
        assertThat(riders).hasSize(2);
        assertThat(riders).extracting(Rider::getEmail)
                .containsExactlyInAnyOrder("john.doe@example.com", "pierre.dubois@example.com");
    }

    @Test
    @DisplayName("Should find riders by power-to-weight ratio")
    void shouldFindRidersByPowerToWeightRatio() {
        List<Rider> riders = riderRepository.findByPowerToWeightRatioGreaterThanEqual(5.0);
        
        assertThat(riders).hasSize(3);
        assertThat(riders).extracting(Rider::getEmail)
                .containsExactlyInAnyOrder("jane.smith@example.com", "pierre.dubois@example.com", "maria.garcia@example.com");
    }

    @Test
    @DisplayName("Should find riders by height range")
    void shouldFindRidersByHeightRange() {
        List<Rider> riders = riderRepository.findByHeightBetween(170, 180);
        
        assertThat(riders).hasSize(3);
        assertThat(riders).extracting(Rider::getEmail)
                .containsExactlyInAnyOrder("john.doe@example.com", "pierre.dubois@example.com", "maria.garcia@example.com");
    }

    @Test
    @DisplayName("Should find riders by weight range")
    void shouldFindRidersByWeightRange() {
        List<Rider> riders = riderRepository.findByWeightBetween(60, 75);
        
        assertThat(riders).hasSize(3);
    }

    @Test
    @DisplayName("Should find riders by name search")
    void shouldFindRidersByNameSearch() {
        List<Rider> riders = riderRepository.findByNameContainingIgnoreCase("john");
        
        assertThat(riders).hasSize(1);
        assertThat(riders.get(0).getEmail()).isEqualTo("john.doe@example.com");
    }

    @Test
    @DisplayName("Should find riders by name search case insensitive")
    void shouldFindRidersByNameSearchCaseInsensitive() {
        List<Rider> riders = riderRepository.findByNameContainingIgnoreCase("SMITH");
        
        assertThat(riders).hasSize(1);
        assertThat(riders.get(0).getEmail()).isEqualTo("jane.smith@example.com");
    }

    @Test
    @DisplayName("Should count active riders by team")
    void shouldCountActiveRidersByTeam() {
        long count = riderRepository.countActiveRidersByTeam("Team Sky");
        
        assertThat(count).isEqualTo(2);
    }

    @Test
    @DisplayName("Should count active riders by nationality")
    void shouldCountActiveRidersByNationality() {
        long count = riderRepository.countActiveRidersByNationality("USA");
        
        assertThat(count).isEqualTo(1);
    }

    @Test
    @DisplayName("Should find team rider counts")
    void shouldFindTeamRiderCounts() {
        List<Object[]> counts = riderRepository.findTeamRiderCounts();
        
        assertThat(counts).hasSize(2);
        assertThat(counts.get(0)[0]).isEqualTo("Team Sky");
        assertThat(counts.get(0)[1]).isEqualTo(2L);
    }

    @Test
    @DisplayName("Should find nationality rider counts")
    void shouldFindNationalityRiderCounts() {
        List<Object[]> counts = riderRepository.findNationalityRiderCounts();
        
        assertThat(counts).isNotEmpty();
        assertThat(counts).allMatch(count -> count.length == 2);
    }

    @Test
    @DisplayName("Should find specialization rider counts")
    void shouldFindSpecializationRiderCounts() {
        List<Object[]> counts = riderRepository.findSpecializationRiderCounts();
        
        assertThat(counts).hasSize(3);
        assertThat(counts).allMatch(count -> count.length == 2);
    }

    @Test
    @DisplayName("Should find average FTP by team")
    void shouldFindAverageFtpByTeam() {
        Double averageFtp = riderRepository.findAverageFtpByTeam("Team Sky");
        
        assertThat(averageFtp).isEqualTo(365.0);
    }

    @Test
    @DisplayName("Should find average age by team")
    void shouldFindAverageAgeByTeam() {
        Double averageAge = riderRepository.findAverageAgeByTeam("Team Sky");
        
        assertThat(averageAge).isPositive();
    }

    @Test
    @DisplayName("Should find top riders by FTP")
    void shouldFindTopRidersByFtp() {
        Pageable pageable = PageRequest.of(0, 2);
        List<Rider> topRiders = riderRepository.findTopRidersByFtp(pageable);
        
        assertThat(topRiders).hasSize(2);
        assertThat(topRiders.get(0).getFtpWatts()).isGreaterThanOrEqualTo(topRiders.get(1).getFtpWatts());
    }

    @Test
    @DisplayName("Should find top riders by power-to-weight ratio")
    void shouldFindTopRidersByPowerToWeightRatio() {
        Pageable pageable = PageRequest.of(0, 3);
        List<Rider> topRiders = riderRepository.findTopRidersByPowerToWeightRatio(pageable);
        
        assertThat(topRiders).hasSize(3);
        
        for (int i = 0; i < topRiders.size() - 1; i++) {
            Rider current = topRiders.get(i);
            Rider next = topRiders.get(i + 1);
            double currentRatio = current.getFtpWatts() / current.getWeightKg();
            double nextRatio = next.getFtpWatts() / next.getWeightKg();
            assertThat(currentRatio).isGreaterThanOrEqualTo(nextRatio);
        }
    }

    @Test
    @DisplayName("Should handle empty results gracefully")
    void shouldHandleEmptyResultsGracefully() {
        List<Rider> riders = riderRepository.findByTeam("Non-existent Team");
        
        assertThat(riders).isEmpty();
    }

    @Test
    @DisplayName("Should handle null parameters in custom queries")
    void shouldHandleNullParametersInCustomQueries() {
        List<Rider> riders = riderRepository.findByFtpWattsGreaterThanEqual(null);
        
        assertThat(riders).isEmpty();
    }

    @Test
    @DisplayName("Should find riders with minimum race count")
    void shouldFindRidersWithMinimumRaceCount() {
        List<Rider> riders = riderRepository.findByMinimumRaceCount(0);
        
        assertThat(riders).hasSize(4);
    }

    @Test
    @DisplayName("Should return empty list for high minimum race count")
    void shouldReturnEmptyListForHighMinimumRaceCount() {
        List<Rider> riders = riderRepository.findByMinimumRaceCount(10);
        
        assertThat(riders).isEmpty();
    }
}