package com.pelotoniq.cycling.controller;

import com.pelotoniq.cycling.entity.Rider;
import com.pelotoniq.cycling.entity.RiderSpecialization;
import com.pelotoniq.cycling.repository.RiderRepository;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/riders")
@Validated
public class RiderController {

    @Autowired
    private RiderRepository riderRepository;

    @GetMapping
    public ResponseEntity<Page<Rider>> getAllRiders(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "id") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {
        
        Sort sort = sortDir.equalsIgnoreCase("desc") ? 
            Sort.by(sortBy).descending() : Sort.by(sortBy).ascending();
        
        Pageable pageable = PageRequest.of(page, size, sort);
        Page<Rider> riders = riderRepository.findAll(pageable);
        
        return ResponseEntity.ok(riders);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Rider> getRiderById(@PathVariable Long id) {
        Optional<Rider> rider = riderRepository.findById(id);
        
        return rider.map(ResponseEntity::ok)
                   .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/email/{email}")
    public ResponseEntity<Rider> getRiderByEmail(@PathVariable String email) {
        Optional<Rider> rider = riderRepository.findByEmail(email);
        
        return rider.map(ResponseEntity::ok)
                   .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/active")
    public ResponseEntity<Page<Rider>> getActiveRiders(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        
        Pageable pageable = PageRequest.of(page, size);
        Page<Rider> riders = riderRepository.findByActiveTrue(pageable);
        
        return ResponseEntity.ok(riders);
    }

    @GetMapping("/inactive")
    public ResponseEntity<List<Rider>> getInactiveRiders() {
        List<Rider> riders = riderRepository.findByActiveFalse();
        return ResponseEntity.ok(riders);
    }

    @GetMapping("/team/{team}")
    public ResponseEntity<Page<Rider>> getRidersByTeam(
            @PathVariable String team,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        
        Pageable pageable = PageRequest.of(page, size);
        Page<Rider> riders = riderRepository.findByTeam(team, pageable);
        
        return ResponseEntity.ok(riders);
    }

    @GetMapping("/nationality/{nationality}")
    public ResponseEntity<Page<Rider>> getRidersByNationality(
            @PathVariable String nationality,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        
        Pageable pageable = PageRequest.of(page, size);
        Page<Rider> riders = riderRepository.findByNationality(nationality, pageable);
        
        return ResponseEntity.ok(riders);
    }

    @GetMapping("/specialization/{specialization}")
    public ResponseEntity<Page<Rider>> getRidersBySpecialization(
            @PathVariable RiderSpecialization specialization,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        
        Pageable pageable = PageRequest.of(page, size);
        Page<Rider> riders = riderRepository.findBySpecialization(specialization, pageable);
        
        return ResponseEntity.ok(riders);
    }

    @GetMapping("/search")
    public ResponseEntity<List<Rider>> searchRidersByName(@RequestParam String name) {
        List<Rider> riders = riderRepository.findByNameContainingIgnoreCase(name);
        return ResponseEntity.ok(riders);
    }

    @GetMapping("/age-range")
    public ResponseEntity<List<Rider>> getRidersByAgeRange(
            @RequestParam int minAge,
            @RequestParam int maxAge) {
        
        List<Rider> riders = riderRepository.findByAgeBetween(minAge, maxAge);
        return ResponseEntity.ok(riders);
    }

    @GetMapping("/birth-date-range")
    public ResponseEntity<List<Rider>> getRidersByBirthDateRange(
            @RequestParam LocalDate startDate,
            @RequestParam LocalDate endDate) {
        
        List<Rider> riders = riderRepository.findByDateOfBirthBetween(startDate, endDate);
        return ResponseEntity.ok(riders);
    }

    @GetMapping("/ftp/min/{minFtp}")
    public ResponseEntity<List<Rider>> getRidersByMinFtp(@PathVariable Double minFtp) {
        List<Rider> riders = riderRepository.findByFtpWattsGreaterThanEqual(minFtp);
        return ResponseEntity.ok(riders);
    }

    @GetMapping("/power-weight-ratio/min/{minRatio}")
    public ResponseEntity<List<Rider>> getRidersByMinPowerToWeightRatio(@PathVariable Double minRatio) {
        List<Rider> riders = riderRepository.findByPowerToWeightRatioGreaterThanEqual(minRatio);
        return ResponseEntity.ok(riders);
    }

    @GetMapping("/height-range")
    public ResponseEntity<List<Rider>> getRidersByHeightRange(
            @RequestParam Integer minHeight,
            @RequestParam Integer maxHeight) {
        
        List<Rider> riders = riderRepository.findByHeightBetween(minHeight, maxHeight);
        return ResponseEntity.ok(riders);
    }

    @GetMapping("/weight-range")
    public ResponseEntity<List<Rider>> getRidersByWeightRange(
            @RequestParam Integer minWeight,
            @RequestParam Integer maxWeight) {
        
        List<Rider> riders = riderRepository.findByWeightBetween(minWeight, maxWeight);
        return ResponseEntity.ok(riders);
    }

    @GetMapping("/top-ftp")
    public ResponseEntity<List<Rider>> getTopRidersByFtp(
            @RequestParam(defaultValue = "10") int limit) {
        
        Pageable pageable = PageRequest.of(0, limit);
        List<Rider> riders = riderRepository.findTopRidersByFtp(pageable);
        
        return ResponseEntity.ok(riders);
    }

    @GetMapping("/top-power-weight-ratio")
    public ResponseEntity<List<Rider>> getTopRidersByPowerToWeightRatio(
            @RequestParam(defaultValue = "10") int limit) {
        
        Pageable pageable = PageRequest.of(0, limit);
        List<Rider> riders = riderRepository.findTopRidersByPowerToWeightRatio(pageable);
        
        return ResponseEntity.ok(riders);
    }

    @GetMapping("/stats/team/{team}/count")
    public ResponseEntity<Long> getActiveRiderCountByTeam(@PathVariable String team) {
        long count = riderRepository.countActiveRidersByTeam(team);
        return ResponseEntity.ok(count);
    }

    @GetMapping("/stats/nationality/{nationality}/count")
    public ResponseEntity<Long> getActiveRiderCountByNationality(@PathVariable String nationality) {
        long count = riderRepository.countActiveRidersByNationality(nationality);
        return ResponseEntity.ok(count);
    }

    @GetMapping("/stats/team/{team}/average-ftp")
    public ResponseEntity<Double> getAverageFtpByTeam(@PathVariable String team) {
        Double averageFtp = riderRepository.findAverageFtpByTeam(team);
        
        return averageFtp != null ? 
            ResponseEntity.ok(averageFtp) : 
            ResponseEntity.noContent().build();
    }

    @GetMapping("/stats/team/{team}/average-age")
    public ResponseEntity<Double> getAverageAgeByTeam(@PathVariable String team) {
        Double averageAge = riderRepository.findAverageAgeByTeam(team);
        
        return averageAge != null ? 
            ResponseEntity.ok(averageAge) : 
            ResponseEntity.noContent().build();
    }

    @PostMapping
    public ResponseEntity<Rider> createRider(@Valid @RequestBody Rider rider) {
        if (riderRepository.existsByEmail(rider.getEmail())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
        
        Rider savedRider = riderRepository.save(rider);
        return ResponseEntity.status(HttpStatus.CREATED).body(savedRider);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Rider> updateRider(@PathVariable Long id, @Valid @RequestBody Rider rider) {
        if (!riderRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        
        if (rider.getEmail() != null) {
            Optional<Rider> existingRiderWithEmail = riderRepository.findByEmail(rider.getEmail());
            if (existingRiderWithEmail.isPresent() && !existingRiderWithEmail.get().getId().equals(id)) {
                return ResponseEntity.status(HttpStatus.CONFLICT).build();
            }
        }
        
        rider.setId(id);
        Rider updatedRider = riderRepository.save(rider);
        return ResponseEntity.ok(updatedRider);
    }

    @PatchMapping("/{id}/activate")
    public ResponseEntity<Rider> activateRider(@PathVariable Long id) {
        Optional<Rider> riderOpt = riderRepository.findById(id);
        
        if (riderOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        
        Rider rider = riderOpt.get();
        rider.setActive(true);
        Rider updatedRider = riderRepository.save(rider);
        
        return ResponseEntity.ok(updatedRider);
    }

    @PatchMapping("/{id}/deactivate")
    public ResponseEntity<Rider> deactivateRider(@PathVariable Long id) {
        Optional<Rider> riderOpt = riderRepository.findById(id);
        
        if (riderOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        
        Rider rider = riderOpt.get();
        rider.setActive(false);
        Rider updatedRider = riderRepository.save(rider);
        
        return ResponseEntity.ok(updatedRider);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteRider(@PathVariable Long id) {
        if (!riderRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        
        riderRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/check-email")
    public ResponseEntity<Boolean> checkEmailExists(@RequestParam String email) {
        boolean exists = riderRepository.existsByEmail(email);
        return ResponseEntity.ok(exists);
    }
}