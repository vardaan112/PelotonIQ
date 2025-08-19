package com.pelotoniq.cycling.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

@Entity
@Table(name = "riders", indexes = {
    @Index(name = "idx_rider_email", columnList = "email", unique = true),
    @Index(name = "idx_rider_team", columnList = "team"),
    @Index(name = "idx_rider_nationality", columnList = "nationality")
})
public class Rider {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank(message = "First name is required")
    @Size(min = 2, max = 50, message = "First name must be between 2 and 50 characters")
    @Column(name = "first_name", nullable = false, length = 50)
    private String firstName;

    @NotBlank(message = "Last name is required")
    @Size(min = 2, max = 50, message = "Last name must be between 2 and 50 characters")
    @Column(name = "last_name", nullable = false, length = 50)
    private String lastName;

    @NotBlank(message = "Email is required")
    @Email(message = "Email should be valid")
    @Column(name = "email", nullable = false, unique = true, length = 100)
    private String email;

    @NotNull(message = "Date of birth is required")
    @Past(message = "Date of birth must be in the past")
    @Column(name = "date_of_birth", nullable = false)
    private LocalDate dateOfBirth;

    @NotBlank(message = "Nationality is required")
    @Size(min = 2, max = 50, message = "Nationality must be between 2 and 50 characters")
    @Column(name = "nationality", nullable = false, length = 50)
    private String nationality;

    @NotBlank(message = "Team is required")
    @Size(min = 2, max = 100, message = "Team name must be between 2 and 100 characters")
    @Column(name = "team", nullable = false, length = 100)
    private String team;

    @Enumerated(EnumType.STRING)
    @Column(name = "specialization", nullable = false)
    private RiderSpecialization specialization;

    @Min(value = 40, message = "Height must be at least 40 cm")
    @Max(value = 250, message = "Height must not exceed 250 cm")
    @Column(name = "height_cm")
    private Integer heightCm;

    @Min(value = 30, message = "Weight must be at least 30 kg")
    @Max(value = 200, message = "Weight must not exceed 200 kg")
    @Column(name = "weight_kg")
    private Integer weightKg;

    @DecimalMin(value = "0.0", message = "FTP must be non-negative")
    @DecimalMax(value = "1000.0", message = "FTP must not exceed 1000 watts")
    @Column(name = "ftp_watts")
    private Double ftpWatts;

    @Column(name = "active", nullable = false)
    private Boolean active = true;

    // Relationships
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "current_team_id")
    private Team currentTeam;

    @OneToMany(mappedBy = "rider", fetch = FetchType.LAZY, cascade = CascadeType.ALL)
    private Set<TeamMembership> teamMemberships = new HashSet<>();

    @OneToMany(mappedBy = "rider", fetch = FetchType.LAZY, cascade = CascadeType.ALL)
    private Set<StageResult> stageResults = new HashSet<>();

    @OneToMany(mappedBy = "rider", fetch = FetchType.LAZY, cascade = CascadeType.ALL)
    private Set<StageClassification> classifications = new HashSet<>();

    @ManyToMany(fetch = FetchType.LAZY, cascade = {CascadeType.PERSIST, CascadeType.MERGE})
    @JoinTable(
        name = "race_participants",
        joinColumns = @JoinColumn(name = "rider_id"),
        inverseJoinColumns = @JoinColumn(name = "race_id")
    )
    private Set<Race> races = new HashSet<>();

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Version
    @Column(name = "version")
    private Long version;

    // Default constructor (required by JPA)
    public Rider() {}

    // Constructor for creating new riders
    public Rider(String firstName, String lastName, String email, LocalDate dateOfBirth, 
                String nationality, String team, RiderSpecialization specialization) {
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.dateOfBirth = dateOfBirth;
        this.nationality = nationality;
        this.team = team;
        this.specialization = specialization;
        this.active = true;
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public LocalDate getDateOfBirth() {
        return dateOfBirth;
    }

    public void setDateOfBirth(LocalDate dateOfBirth) {
        this.dateOfBirth = dateOfBirth;
    }

    public String getNationality() {
        return nationality;
    }

    public void setNationality(String nationality) {
        this.nationality = nationality;
    }

    public String getTeam() {
        return team;
    }

    public void setTeam(String team) {
        this.team = team;
    }

    public RiderSpecialization getSpecialization() {
        return specialization;
    }

    public void setSpecialization(RiderSpecialization specialization) {
        this.specialization = specialization;
    }

    public Integer getHeightCm() {
        return heightCm;
    }

    public void setHeightCm(Integer heightCm) {
        this.heightCm = heightCm;
    }

    public Integer getWeightKg() {
        return weightKg;
    }

    public void setWeightKg(Integer weightKg) {
        this.weightKg = weightKg;
    }

    public Double getFtpWatts() {
        return ftpWatts;
    }

    public void setFtpWatts(Double ftpWatts) {
        this.ftpWatts = ftpWatts;
    }

    public Boolean getActive() {
        return active;
    }

    public void setActive(Boolean active) {
        this.active = active;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public Long getVersion() {
        return version;
    }

    public Team getCurrentTeam() {
        return currentTeam;
    }

    public void setCurrentTeam(Team currentTeam) {
        this.currentTeam = currentTeam;
    }

    public Set<TeamMembership> getTeamMemberships() {
        return teamMemberships;
    }

    public void setTeamMemberships(Set<TeamMembership> teamMemberships) {
        this.teamMemberships = teamMemberships;
    }

    public Set<StageResult> getStageResults() {
        return stageResults;
    }

    public void setStageResults(Set<StageResult> stageResults) {
        this.stageResults = stageResults;
    }

    public Set<StageClassification> getClassifications() {
        return classifications;
    }

    public void setClassifications(Set<StageClassification> classifications) {
        this.classifications = classifications;
    }

    public Set<Race> getRaces() {
        return races;
    }

    public void setRaces(Set<Race> races) {
        this.races = races;
    }

    // Business methods
    public String getFullName() {
        return firstName + " " + lastName;
    }

    public int getAge() {
        return LocalDate.now().getYear() - dateOfBirth.getYear();
    }

    public Double getPowerToWeightRatio() {
        if (ftpWatts != null && weightKg != null && weightKg > 0) {
            return ftpWatts / weightKg;
        }
        return null;
    }

    public String getCurrentTeamName() {
        return currentTeam != null ? currentTeam.getName() : team;
    }

    public boolean hasCurrentTeam() {
        return currentTeam != null;
    }

    public TeamMembership getCurrentMembership() {
        return teamMemberships.stream()
                .filter(tm -> tm.isActive())
                .findFirst()
                .orElse(null);
    }

    public boolean isActiveInTeam(Team team) {
        return teamMemberships.stream()
                .anyMatch(tm -> tm.getTeam().equals(team) && tm.isActive());
    }

    public int getTotalRacesCompleted() {
        return (int) stageResults.stream()
                .filter(sr -> sr.isValidFinish())
                .count();
    }

    public int getTotalStageWins() {
        return (int) stageResults.stream()
                .filter(sr -> sr.getPosition() != null && sr.getPosition() == 1)
                .count();
    }

    // equals and hashCode based on business key (email)
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Rider rider = (Rider) o;
        return Objects.equals(email, rider.email);
    }

    @Override
    public int hashCode() {
        return Objects.hash(email);
    }

    @Override
    public String toString() {
        return "Rider{" +
                "id=" + id +
                ", firstName='" + firstName + '\'' +
                ", lastName='" + lastName + '\'' +
                ", email='" + email + '\'' +
                ", team='" + team + '\'' +
                ", specialization=" + specialization +
                ", active=" + active +
                '}';
    }
}