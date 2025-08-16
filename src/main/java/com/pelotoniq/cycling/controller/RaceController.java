package com.pelotoniq.cycling.controller;

import com.pelotoniq.cycling.entity.Race;
import com.pelotoniq.cycling.entity.RaceCategory;
import com.pelotoniq.cycling.entity.RaceStatus;
import com.pelotoniq.cycling.entity.RaceType;
import com.pelotoniq.cycling.repository.RaceRepository;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/races")
@CrossOrigin(origins = "*")
public class RaceController {

    @Autowired
    private RaceRepository raceRepository;

    @GetMapping
    public ResponseEntity<Page<Race>> getAllRaces(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "raceDate") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {
        
        Sort sort = sortDir.equalsIgnoreCase("desc") ? 
            Sort.by(sortBy).descending() : Sort.by(sortBy).ascending();
        Pageable pageable = PageRequest.of(page, size, sort);
        Page<Race> races = raceRepository.findAll(pageable);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Race> getRaceById(@PathVariable Long id) {
        Optional<Race> race = raceRepository.findById(id);
        return race.map(ResponseEntity::ok)
                  .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<Race> createRace(@Valid @RequestBody Race race) {
        Race savedRace = raceRepository.save(race);
        return ResponseEntity.status(HttpStatus.CREATED).body(savedRace);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Race> updateRace(@PathVariable Long id, @Valid @RequestBody Race race) {
        if (!raceRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        race.setId(id);
        Race updatedRace = raceRepository.save(race);
        return ResponseEntity.ok(updatedRace);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteRace(@PathVariable Long id) {
        if (!raceRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        raceRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/search")
    public ResponseEntity<List<Race>> searchRacesByName(@RequestParam String keyword) {
        List<Race> races = raceRepository.findByNameOrDescriptionContainingIgnoreCase(keyword);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/location/{location}")
    public ResponseEntity<List<Race>> getRacesByLocation(@PathVariable String location) {
        List<Race> races = raceRepository.findByLocation(location);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/country/{country}")
    public ResponseEntity<List<Race>> getRacesByCountry(@PathVariable String country) {
        List<Race> races = raceRepository.findByCountry(country);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/type/{type}")
    public ResponseEntity<List<Race>> getRacesByType(@PathVariable RaceType type) {
        List<Race> races = raceRepository.findByRaceType(type);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/category/{category}")
    public ResponseEntity<List<Race>> getRacesByCategory(@PathVariable RaceCategory category) {
        List<Race> races = raceRepository.findByCategory(category);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/status/{status}")
    public ResponseEntity<List<Race>> getRacesByStatus(@PathVariable RaceStatus status) {
        List<Race> races = raceRepository.findByStatus(status);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/date-range")
    public ResponseEntity<List<Race>> getRacesByDateRange(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        List<Race> races = raceRepository.findByRaceDateBetween(startDate, endDate);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/upcoming")
    public ResponseEntity<List<Race>> getUpcomingRaces() {
        List<Race> races = raceRepository.findUpcomingRaces(LocalDate.now());
        return ResponseEntity.ok(races);
    }

    @GetMapping("/past")
    public ResponseEntity<List<Race>> getPastRaces() {
        List<Race> races = raceRepository.findPastRaces(LocalDate.now());
        return ResponseEntity.ok(races);
    }

    @GetMapping("/today")
    public ResponseEntity<List<Race>> getTodayRaces() {
        List<Race> races = raceRepository.findByRaceDateBetween(LocalDate.now(), LocalDate.now());
        return ResponseEntity.ok(races);
    }

    @GetMapping("/distance-range")
    public ResponseEntity<List<Race>> getRacesByDistanceRange(
            @RequestParam BigDecimal minDistance,
            @RequestParam BigDecimal maxDistance) {
        List<Race> races = raceRepository.findByDistanceRange(minDistance, maxDistance);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/elevation-range")
    public ResponseEntity<List<Race>> getRacesByElevationRange(
            @RequestParam Integer minElevation,
            @RequestParam Integer maxElevation) {
        List<Race> races = raceRepository.findByElevationRange(minElevation, maxElevation);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/prize-range")
    public ResponseEntity<List<Race>> getRacesByPrizeRange(
            @RequestParam BigDecimal minPrize,
            @RequestParam BigDecimal maxPrize) {
        List<Race> races = raceRepository.findByMinimumPrizeMoney(minPrize);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/registration-fee-range")
    public ResponseEntity<List<Race>> getRacesByRegistrationFeeRange(
            @RequestParam BigDecimal minFee,
            @RequestParam BigDecimal maxFee) {
        List<Race> races = raceRepository.findByEntryFeeRange(minFee, maxFee);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/max-participants-range")
    public ResponseEntity<List<Race>> getRacesByMaxParticipantsRange(
            @RequestParam Integer minParticipants,
            @RequestParam Integer maxParticipants) {
        List<Race> races = raceRepository.findByMinimumCapacity(minParticipants);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/registration-open")
    public ResponseEntity<List<Race>> getRacesWithOpenRegistration() {
        List<Race> races = raceRepository.findRacesOpenForRegistration(LocalDate.now());
        return ResponseEntity.ok(races);
    }

    @GetMapping("/time-range")
    public ResponseEntity<List<Race>> getRacesByTimeRange(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime startTime,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime endTime) {
        List<Race> races = raceRepository.findByStartTimeRange(startTime, endTime);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/high-prize")
    public ResponseEntity<List<Race>> getHighPrizeRaces(@RequestParam(defaultValue = "10000") BigDecimal minPrize) {
        List<Race> races = raceRepository.findByMinimumPrizeMoney(minPrize);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/min-capacity")
    public ResponseEntity<List<Race>> getMinCapacityRaces(@RequestParam(defaultValue = "100") Integer minCapacity) {
        List<Race> races = raceRepository.findByMinimumCapacity(minCapacity);
        return ResponseEntity.ok(races);
    }

    @GetMapping("/longest-by-type")
    public ResponseEntity<List<Race>> getLongestRacesByType() {
        List<Race> races = raceRepository.findLongestRacesByType();
        return ResponseEntity.ok(races);
    }

    @GetMapping("/highest-prize")
    public ResponseEntity<List<Race>> getHighestPrizeRaces() {
        List<Race> races = raceRepository.findHighestPrizeMoneyRaces();
        return ResponseEntity.ok(races);
    }

    @GetMapping("/most-challenging")
    public ResponseEntity<List<Race>> getMostChallengingRaces() {
        List<Race> races = raceRepository.findMostChallengingRaces();
        return ResponseEntity.ok(races);
    }

    @GetMapping("/available-spots")
    public ResponseEntity<List<Race>> getRacesWithAvailableSpots() {
        List<Race> races = raceRepository.findRacesWithAvailableSpots();
        return ResponseEntity.ok(races);
    }

    @GetMapping("/full-races")
    public ResponseEntity<List<Race>> getFullRaces() {
        List<Race> races = raceRepository.findFullRaces();
        return ResponseEntity.ok(races);
    }

    @GetMapping("/statistics/count-by-type")
    public ResponseEntity<List<Object[]>> getCountByType(@RequestParam(defaultValue = "2026") Integer year) {
        List<Object[]> stats = raceRepository.findRaceTypeCountsByYear(year);
        return ResponseEntity.ok(stats);
    }

    @GetMapping("/statistics/count-by-category")
    public ResponseEntity<List<Object[]>> getCountByCategory(@RequestParam(defaultValue = "2026") Integer year) {
        List<Object[]> stats = raceRepository.findCategoryCountsByYear(year);
        return ResponseEntity.ok(stats);
    }

    @GetMapping("/statistics/count-by-country")
    public ResponseEntity<List<Object[]>> getCountByCountry(@RequestParam(defaultValue = "2026") Integer year) {
        List<Object[]> stats = raceRepository.findCountryRaceCountsByYear(year);
        return ResponseEntity.ok(stats);
    }

    @GetMapping("/statistics/count-by-location")
    public ResponseEntity<List<Object[]>> getCountByLocation(@RequestParam(defaultValue = "2026") Integer year) {
        List<Object[]> stats = raceRepository.findLocationRaceCountsByYear(year);
        return ResponseEntity.ok(stats);
    }

    @GetMapping("/statistics/average-distance-by-type")
    public ResponseEntity<BigDecimal> getAverageDistanceByType(@RequestParam RaceType raceType) {
        BigDecimal avgDistance = raceRepository.findAverageDistanceByRaceType(raceType);
        return ResponseEntity.ok(avgDistance != null ? avgDistance : BigDecimal.ZERO);
    }

    @GetMapping("/statistics/average-elevation-by-country")
    public ResponseEntity<Double> getAverageElevationByCountry(@RequestParam String country) {
        Double avgElevation = raceRepository.findAverageElevationByCountry(country);
        return ResponseEntity.ok(avgElevation != null ? avgElevation : 0.0);
    }

    @GetMapping("/statistics/average-entry-fee-by-category")
    public ResponseEntity<BigDecimal> getAverageEntryFeeByCategory(@RequestParam RaceCategory category) {
        BigDecimal avgFee = raceRepository.findAverageEntryFeeByCategory(category);
        return ResponseEntity.ok(avgFee != null ? avgFee : BigDecimal.ZERO);
    }

    @GetMapping("/statistics/total-prize-by-country-year")
    public ResponseEntity<BigDecimal> getTotalPrizeByCountryAndYear(
            @RequestParam String country,
            @RequestParam(defaultValue = "2026") Integer year) {
        BigDecimal totalPrize = raceRepository.findTotalPrizeMoneyByCountryAndYear(country, year);
        return ResponseEntity.ok(totalPrize != null ? totalPrize : BigDecimal.ZERO);
    }

    @GetMapping("/statistics/count-by-location-status")
    public ResponseEntity<Long> getCountByLocationAndStatus(
            @RequestParam String location,
            @RequestParam RaceStatus status) {
        long count = raceRepository.countByLocationAndStatus(location, status);
        return ResponseEntity.ok(count);
    }

    @GetMapping("/statistics/count-by-country-year")
    public ResponseEntity<Long> getCountByCountryAndYear(
            @RequestParam String country,
            @RequestParam(defaultValue = "2026") Integer year) {
        long count = raceRepository.countByCountryAndYear(country, year);
        return ResponseEntity.ok(count);
    }

    @GetMapping("/with-weather-forecast")
    public ResponseEntity<List<Race>> getRacesWithWeatherForecast() {
        List<Race> races = raceRepository.findRacesWithWeatherForecast();
        return ResponseEntity.ok(races);
    }

    @GetMapping("/without-weather-forecast")
    public ResponseEntity<List<Race>> getRacesWithoutWeatherForecast() {
        List<Race> races = raceRepository.findRacesWithoutWeatherForecast();
        return ResponseEntity.ok(races);
    }

    @GetMapping("/active-upcoming")
    public ResponseEntity<List<Race>> getActiveUpcomingRaces() {
        List<Race> races = raceRepository.findActiveUpcomingRaces(LocalDate.now());
        return ResponseEntity.ok(races);
    }

    @GetMapping("/cancelled-postponed")
    public ResponseEntity<List<Race>> getCancelledOrPostponedRaces() {
        List<Race> races = raceRepository.findCancelledOrPostponedRaces(LocalDate.now());
        return ResponseEntity.ok(races);
    }
}