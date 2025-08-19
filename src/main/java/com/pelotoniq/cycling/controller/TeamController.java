package com.pelotoniq.cycling.controller;

import com.pelotoniq.cycling.entity.Team;
import com.pelotoniq.cycling.entity.TeamCategory;
import com.pelotoniq.cycling.repository.TeamRepository;
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

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/teams")
@Validated
@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:3001"})
public class TeamController {

    @Autowired
    private TeamRepository teamRepository;

    @GetMapping
    public ResponseEntity<Page<Team>> getAllTeams(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "name") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {
        
        Sort sort = sortDir.equalsIgnoreCase("desc") ? 
            Sort.by(sortBy).descending() : Sort.by(sortBy).ascending();
        
        Pageable pageable = PageRequest.of(page, size, sort);
        Page<Team> teams = teamRepository.findAll(pageable);
        
        return ResponseEntity.ok(teams);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Team> getTeamById(@PathVariable Long id) {
        Optional<Team> team = teamRepository.findById(id);
        
        return team.map(ResponseEntity::ok)
                   .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/name/{name}")
    public ResponseEntity<Team> getTeamByName(@PathVariable String name) {
        Optional<Team> team = teamRepository.findByName(name);
        
        return team.map(ResponseEntity::ok)
                   .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/code/{code}")
    public ResponseEntity<Team> getTeamByCode(@PathVariable String code) {
        Optional<Team> team = teamRepository.findByCode(code);
        
        return team.map(ResponseEntity::ok)
                   .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/active")
    public ResponseEntity<Page<Team>> getActiveTeams(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        
        Pageable pageable = PageRequest.of(page, size, Sort.by("name").ascending());
        Page<Team> teams = teamRepository.findByActiveTrue(pageable);
        
        return ResponseEntity.ok(teams);
    }

    @GetMapping("/inactive")
    public ResponseEntity<List<Team>> getInactiveTeams() {
        List<Team> teams = teamRepository.findByActiveFalse();
        return ResponseEntity.ok(teams);
    }

    @GetMapping("/category/{category}")
    public ResponseEntity<Page<Team>> getTeamsByCategory(
            @PathVariable TeamCategory category,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        
        Pageable pageable = PageRequest.of(page, size, Sort.by("name").ascending());
        Page<Team> teams = teamRepository.findByCategory(category, pageable);
        
        return ResponseEntity.ok(teams);
    }

    @GetMapping("/country/{country}")
    public ResponseEntity<Page<Team>> getTeamsByCountry(
            @PathVariable String country,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        
        Pageable pageable = PageRequest.of(page, size, Sort.by("name").ascending());
        Page<Team> teams = teamRepository.findByCountry(country, pageable);
        
        return ResponseEntity.ok(teams);
    }

    @GetMapping("/search")
    public ResponseEntity<List<Team>> searchTeamsByName(@RequestParam String name) {
        List<Team> teams = teamRepository.findByNameContainingIgnoreCase(name);
        return ResponseEntity.ok(teams);
    }

    @GetMapping("/world-tour")
    public ResponseEntity<List<Team>> getWorldTourTeams() {
        List<Team> teams = teamRepository.findByCategoryAndActiveTrue(TeamCategory.WORLD_TOUR);
        return ResponseEntity.ok(teams);
    }

    @GetMapping("/pro-teams")
    public ResponseEntity<List<Team>> getProTeams() {
        List<Team> teams = teamRepository.findByCategoryAndActiveTrue(TeamCategory.PRO_TEAM);
        return ResponseEntity.ok(teams);
    }

    @GetMapping("/continental")
    public ResponseEntity<List<Team>> getContinentalTeams() {
        List<Team> teams = teamRepository.findByCategoryAndActiveTrue(TeamCategory.CONTINENTAL);
        return ResponseEntity.ok(teams);
    }

    @GetMapping("/professional")
    public ResponseEntity<List<Team>> getProfessionalTeams() {
        List<Team> professionalTeams = teamRepository.findProfessionalTeams();
        return ResponseEntity.ok(professionalTeams);
    }

    @GetMapping("/stats/rider-count")
    public ResponseEntity<List<Object[]>> getTeamsWithRiderCount() {
        List<Object[]> stats = teamRepository.findTeamsWithRiderCount();
        return ResponseEntity.ok(stats);
    }

    @GetMapping("/stats/average-roster-size")
    public ResponseEntity<Double> getAverageRosterSize() {
        Double averageSize = teamRepository.findAverageRosterSize();
        return averageSize != null ? 
            ResponseEntity.ok(averageSize) : 
            ResponseEntity.noContent().build();
    }

    @GetMapping("/stats/average-budget")
    public ResponseEntity<Double> getAverageBudget() {
        Double averageBudget = teamRepository.findAverageBudget();
        return averageBudget != null ? 
            ResponseEntity.ok(averageBudget) : 
            ResponseEntity.noContent().build();
    }

    @PostMapping
    public ResponseEntity<?> createTeam(@Valid @RequestBody Team team) {
        try {
            // Check if team name already exists
            if (team.getName() != null && teamRepository.existsByName(team.getName())) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body("Team with name '" + team.getName() + "' already exists");
            }
            
            // Check if team code already exists (if provided)
            if (team.getCode() != null && teamRepository.existsByCode(team.getCode())) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body("Team with code '" + team.getCode() + "' already exists");
            }
            
            // Set default values if not provided
            if (team.getActive() == null) {
                team.setActive(true);
            }
            if (team.getMaxRosterSize() == null) {
                team.setMaxRosterSize(30);
            }
            
            Team savedTeam = teamRepository.save(team);
            return ResponseEntity.status(HttpStatus.CREATED).body(savedTeam);
            
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body("Error creating team: " + e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateTeam(@PathVariable Long id, @Valid @RequestBody Team team) {
        try {
            if (!teamRepository.existsById(id)) {
                return ResponseEntity.notFound().build();
            }
            
            // Check for name conflicts (excluding current team)
            if (team.getName() != null) {
                Optional<Team> existingTeamWithName = teamRepository.findByName(team.getName());
                if (existingTeamWithName.isPresent() && !existingTeamWithName.get().getId().equals(id)) {
                    return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body("Team with name '" + team.getName() + "' already exists");
                }
            }
            
            // Check for code conflicts (excluding current team)
            if (team.getCode() != null) {
                Optional<Team> existingTeamWithCode = teamRepository.findByCode(team.getCode());
                if (existingTeamWithCode.isPresent() && !existingTeamWithCode.get().getId().equals(id)) {
                    return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body("Team with code '" + team.getCode() + "' already exists");
                }
            }
            
            team.setId(id);
            Team updatedTeam = teamRepository.save(team);
            return ResponseEntity.ok(updatedTeam);
            
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body("Error updating team: " + e.getMessage());
        }
    }

    @PatchMapping("/{id}/activate")
    public ResponseEntity<Team> activateTeam(@PathVariable Long id) {
        Optional<Team> teamOpt = teamRepository.findById(id);
        
        if (teamOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        
        Team team = teamOpt.get();
        team.setActive(true);
        Team updatedTeam = teamRepository.save(team);
        
        return ResponseEntity.ok(updatedTeam);
    }

    @PatchMapping("/{id}/deactivate")
    public ResponseEntity<Team> deactivateTeam(@PathVariable Long id) {
        Optional<Team> teamOpt = teamRepository.findById(id);
        
        if (teamOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        
        Team team = teamOpt.get();
        team.setActive(false);
        Team updatedTeam = teamRepository.save(team);
        
        return ResponseEntity.ok(updatedTeam);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTeam(@PathVariable Long id) {
        if (!teamRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        
        teamRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/check-name")
    public ResponseEntity<Boolean> checkNameExists(@RequestParam String name) {
        boolean exists = teamRepository.existsByName(name);
        return ResponseEntity.ok(exists);
    }

    @GetMapping("/check-code")
    public ResponseEntity<Boolean> checkCodeExists(@RequestParam String code) {
        boolean exists = teamRepository.existsByCode(code);
        return ResponseEntity.ok(exists);
    }

    // Team-specific statistics endpoints
    @GetMapping("/{id}/rider-count")
    public ResponseEntity<Integer> getTeamRiderCount(@PathVariable Long id) {
        Optional<Team> team = teamRepository.findById(id);
        
        if (team.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        
        return ResponseEntity.ok(team.get().getCurrentRiderCount());
    }

    @GetMapping("/{id}/can-add-rider")
    public ResponseEntity<Boolean> canTeamAddRider(@PathVariable Long id) {
        Optional<Team> team = teamRepository.findById(id);
        
        if (team.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        
        return ResponseEntity.ok(team.get().canAddRider());
    }

    @GetMapping("/{id}/years-active")
    public ResponseEntity<Integer> getTeamYearsActive(@PathVariable Long id) {
        Optional<Team> team = teamRepository.findById(id);
        
        if (team.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        
        return ResponseEntity.ok(team.get().getYearsActive());
    }
}