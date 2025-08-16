package com.pelotoniq.cycling.repository;

import com.pelotoniq.cycling.entity.Rider;
import com.pelotoniq.cycling.entity.RiderSpecialization;
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
public interface RiderRepository extends JpaRepository<Rider, Long> {

    Optional<Rider> findByEmail(String email);

    boolean existsByEmail(String email);

    List<Rider> findByTeam(String team);

    List<Rider> findByNationality(String nationality);

    List<Rider> findBySpecialization(RiderSpecialization specialization);

    List<Rider> findByActiveTrue();

    List<Rider> findByActiveFalse();

    Page<Rider> findByTeam(String team, Pageable pageable);

    Page<Rider> findByNationality(String nationality, Pageable pageable);

    Page<Rider> findBySpecialization(RiderSpecialization specialization, Pageable pageable);

    Page<Rider> findByActiveTrue(Pageable pageable);

    @Query("SELECT r FROM Rider r WHERE r.dateOfBirth BETWEEN :startDate AND :endDate")
    List<Rider> findByDateOfBirthBetween(@Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    @Query("SELECT r FROM Rider r WHERE YEAR(CURRENT_DATE) - YEAR(r.dateOfBirth) BETWEEN :minAge AND :maxAge")
    List<Rider> findByAgeBetween(@Param("minAge") int minAge, @Param("maxAge") int maxAge);

    @Query("SELECT r FROM Rider r WHERE r.ftpWatts >= :minFtp")
    List<Rider> findByFtpWattsGreaterThanEqual(@Param("minFtp") Double minFtp);

    @Query("SELECT r FROM Rider r WHERE r.ftpWatts IS NOT NULL AND r.weightKg IS NOT NULL AND r.ftpWatts / r.weightKg >= :minRatio")
    List<Rider> findByPowerToWeightRatioGreaterThanEqual(@Param("minRatio") Double minRatio);

    @Query("SELECT r FROM Rider r WHERE r.heightCm BETWEEN :minHeight AND :maxHeight")
    List<Rider> findByHeightBetween(@Param("minHeight") Integer minHeight, @Param("maxHeight") Integer maxHeight);

    @Query("SELECT r FROM Rider r WHERE r.weightKg BETWEEN :minWeight AND :maxWeight")
    List<Rider> findByWeightBetween(@Param("minWeight") Integer minWeight, @Param("maxWeight") Integer maxWeight);

    @Query("SELECT r FROM Rider r WHERE LOWER(r.firstName) LIKE LOWER(CONCAT('%', :name, '%')) OR LOWER(r.lastName) LIKE LOWER(CONCAT('%', :name, '%'))")
    List<Rider> findByNameContainingIgnoreCase(@Param("name") String name);

    @Query("SELECT r FROM Rider r WHERE SIZE(r.races) >= :minRaces")
    List<Rider> findByMinimumRaceCount(@Param("minRaces") int minRaces);

    @Query("SELECT COUNT(r) FROM Rider r WHERE r.team = :team AND r.active = true")
    long countActiveRidersByTeam(@Param("team") String team);

    @Query("SELECT COUNT(r) FROM Rider r WHERE r.nationality = :nationality AND r.active = true")
    long countActiveRidersByNationality(@Param("nationality") String nationality);

    @Query("SELECT r.team, COUNT(r) FROM Rider r WHERE r.active = true GROUP BY r.team ORDER BY COUNT(r) DESC")
    List<Object[]> findTeamRiderCounts();

    @Query("SELECT r.nationality, COUNT(r) FROM Rider r WHERE r.active = true GROUP BY r.nationality ORDER BY COUNT(r) DESC")
    List<Object[]> findNationalityRiderCounts();

    @Query("SELECT r.specialization, COUNT(r) FROM Rider r WHERE r.active = true GROUP BY r.specialization ORDER BY COUNT(r) DESC")
    List<Object[]> findSpecializationRiderCounts();

    @Query("SELECT AVG(r.ftpWatts) FROM Rider r WHERE r.ftpWatts IS NOT NULL AND r.team = :team")
    Double findAverageFtpByTeam(@Param("team") String team);

    @Query("SELECT AVG(YEAR(CURRENT_DATE) - YEAR(r.dateOfBirth)) FROM Rider r WHERE r.team = :team")
    Double findAverageAgeByTeam(@Param("team") String team);

    @Query("SELECT r FROM Rider r WHERE r.active = true ORDER BY r.ftpWatts DESC")
    List<Rider> findTopRidersByFtp(Pageable pageable);

    @Query("SELECT r FROM Rider r WHERE r.active = true AND r.ftpWatts IS NOT NULL AND r.weightKg IS NOT NULL ORDER BY (r.ftpWatts / r.weightKg) DESC")
    List<Rider> findTopRidersByPowerToWeightRatio(Pageable pageable);
}