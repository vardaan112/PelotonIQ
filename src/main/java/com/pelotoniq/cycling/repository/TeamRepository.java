package com.pelotoniq.cycling.repository;

import com.pelotoniq.cycling.entity.Team;
import com.pelotoniq.cycling.entity.TeamCategory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TeamRepository extends JpaRepository<Team, Long> {

    // Basic queries
    Optional<Team> findByName(String name);
    Optional<Team> findByCode(String code);
    boolean existsByName(String name);
    boolean existsByCode(String code);

    // Active teams
    Page<Team> findByActiveTrue(Pageable pageable);
    List<Team> findByActiveFalse();

    // By country
    Page<Team> findByCountry(String country, Pageable pageable);
    List<Team> findByCountryAndActiveTrue(String country);

    // By category
    Page<Team> findByCategory(TeamCategory category, Pageable pageable);
    List<Team> findByCategoryAndActiveTrue(TeamCategory category);

    // Professional teams
    @Query("SELECT t FROM Team t WHERE t.category IN ('WORLD_TOUR', 'PRO_TEAM', 'CONTINENTAL') AND t.active = true")
    List<Team> findProfessionalTeams();

    // WorldTour teams
    @Query("SELECT t FROM Team t WHERE t.category = 'WORLD_TOUR' AND t.active = true")
    List<Team> findWorldTourTeams();

    // Teams with available roster spots
    @Query("SELECT t FROM Team t WHERE t.active = true AND " +
           "(SELECT COUNT(r) FROM Rider r WHERE r.currentTeam = t AND r.active = true) < t.maxRosterSize")
    List<Team> findTeamsWithAvailableSpots();

    // Search teams by name
    @Query("SELECT t FROM Team t WHERE LOWER(t.name) LIKE LOWER(CONCAT('%', :name, '%')) AND t.active = true")
    List<Team> findByNameContainingIgnoreCase(@Param("name") String name);

    // Teams by founded year range
    List<Team> findByFoundedYearBetween(Integer startYear, Integer endYear);

    // Teams with budget range
    @Query("SELECT t FROM Team t WHERE t.annualBudget BETWEEN :minBudget AND :maxBudget AND t.active = true")
    List<Team> findByBudgetRange(@Param("minBudget") java.math.BigDecimal minBudget, 
                                @Param("maxBudget") java.math.BigDecimal maxBudget);

    // Statistics queries
    @Query("SELECT COUNT(t) FROM Team t WHERE t.country = :country AND t.active = true")
    long countActiveTeamsByCountry(@Param("country") String country);

    @Query("SELECT COUNT(t) FROM Team t WHERE t.category = :category AND t.active = true")
    long countActiveTeamsByCategory(@Param("category") TeamCategory category);

    @Query("SELECT AVG(t.maxRosterSize) FROM Team t WHERE t.active = true")
    Double findAverageRosterSize();

    @Query("SELECT AVG(t.annualBudget) FROM Team t WHERE t.annualBudget IS NOT NULL AND t.active = true")
    Double findAverageBudget();

    // Team with riders count
    @Query("SELECT t, COUNT(r) as riderCount FROM Team t " +
           "LEFT JOIN Rider r ON r.currentTeam = t AND r.active = true " +
           "WHERE t.active = true " +
           "GROUP BY t " +
           "ORDER BY riderCount DESC")
    List<Object[]> findTeamsWithRiderCount();

    // Teams participating in specific race
    @Query("SELECT t FROM Team t JOIN t.participatedRaces r WHERE r.id = :raceId")
    List<Team> findTeamsParticipatingInRace(@Param("raceId") Long raceId);

    // Teams by manager or director
    List<Team> findByManagerContainingIgnoreCaseOrDirectorContainingIgnoreCase(String manager, String director);

    // Teams established in specific decade
    @Query("SELECT t FROM Team t WHERE t.foundedYear IS NOT NULL AND " +
           "t.foundedYear >= :startYear AND t.foundedYear < :endYear AND t.active = true")
    List<Team> findTeamsEstablishedInDecade(@Param("startYear") Integer startYear, @Param("endYear") Integer endYear);

    // Top teams by rider count
    @Query("SELECT t FROM Team t " +
           "WHERE t.active = true " +
           "ORDER BY (SELECT COUNT(r) FROM Rider r WHERE r.currentTeam = t AND r.active = true) DESC")
    List<Team> findTopTeamsByRiderCount(Pageable pageable);

    // Teams needing riders
    @Query("SELECT t FROM Team t WHERE t.active = true AND " +
           "(SELECT COUNT(r) FROM Rider r WHERE r.currentTeam = t AND r.active = true) < " +
           "CASE WHEN t.category = 'WORLD_TOUR' THEN 22 " +
           "     WHEN t.category = 'PRO_TEAM' THEN 16 " +
           "     WHEN t.category = 'CONTINENTAL' THEN 12 " +
           "     ELSE 8 END")
    List<Team> findTeamsNeedingRiders();
}