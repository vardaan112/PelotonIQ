package com.pelotoniq.cycling.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

@Entity
@Table(name = "races", indexes = {
    @Index(name = "idx_race_date", columnList = "race_date"),
    @Index(name = "idx_race_type", columnList = "race_type"),
    @Index(name = "idx_race_status", columnList = "status"),
    @Index(name = "idx_race_location", columnList = "location")
})
public class Race {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank(message = "Race name is required")
    @Size(min = 3, max = 100, message = "Race name must be between 3 and 100 characters")
    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @NotBlank(message = "Description is required")
    @Size(min = 10, max = 1000, message = "Description must be between 10 and 1000 characters")
    @Column(name = "description", nullable = false, length = 1000)
    private String description;

    @NotNull(message = "Race date is required")
    @Future(message = "Race date must be in the future")
    @Column(name = "race_date", nullable = false)
    private LocalDate raceDate;

    @NotNull(message = "Start time is required")
    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @NotBlank(message = "Location is required")
    @Size(min = 3, max = 100, message = "Location must be between 3 and 100 characters")
    @Column(name = "location", nullable = false, length = 100)
    private String location;

    @NotBlank(message = "Country is required")
    @Size(min = 2, max = 50, message = "Country must be between 2 and 50 characters")
    @Column(name = "country", nullable = false, length = 50)
    private String country;

    @Enumerated(EnumType.STRING)
    @NotNull(message = "Race type is required")
    @Column(name = "race_type", nullable = false)
    private RaceType raceType;

    @Enumerated(EnumType.STRING)
    @NotNull(message = "Race category is required")
    @Column(name = "category", nullable = false)
    private RaceCategory category;

    @DecimalMin(value = "0.1", message = "Distance must be at least 0.1 km")
    @DecimalMax(value = "300.0", message = "Distance must not exceed 300 km")
    @Digits(integer = 3, fraction = 2, message = "Distance must have at most 3 integer digits and 2 decimal places")
    @Column(name = "distance_km", precision = 5, scale = 2)
    private BigDecimal distanceKm;

    @Min(value = 0, message = "Elevation gain must be non-negative")
    @Max(value = 10000, message = "Elevation gain must not exceed 10,000 meters")
    @Column(name = "elevation_gain_m")
    private Integer elevationGainM;

    @Min(value = 1, message = "Maximum participants must be at least 1")
    @Max(value = 1000, message = "Maximum participants must not exceed 1,000")
    @Column(name = "max_participants")
    private Integer maxParticipants;

    @DecimalMin(value = "0.00", message = "Entry fee must be non-negative")
    @DecimalMax(value = "10000.00", message = "Entry fee must not exceed 10,000")
    @Digits(integer = 5, fraction = 2, message = "Entry fee must have at most 5 integer digits and 2 decimal places")
    @Column(name = "entry_fee", precision = 7, scale = 2)
    private BigDecimal entryFee;

    @DecimalMin(value = "0.00", message = "Prize money must be non-negative")
    @DecimalMax(value = "1000000.00", message = "Prize money must not exceed 1,000,000")
    @Digits(integer = 8, fraction = 2, message = "Prize money must have at most 8 integer digits and 2 decimal places")
    @Column(name = "prize_money", precision = 10, scale = 2)
    private BigDecimal prizeMoney;

    @Enumerated(EnumType.STRING)
    @NotNull(message = "Race status is required")
    @Column(name = "status", nullable = false)
    private RaceStatus status = RaceStatus.PLANNED;

    @Size(max = 500, message = "Weather forecast must not exceed 500 characters")
    @Column(name = "weather_forecast", length = 500)
    private String weatherForecast;

    @Min(value = -50, message = "Temperature must be at least -50°C")
    @Max(value = 60, message = "Temperature must not exceed 60°C")
    @Column(name = "temperature_celsius")
    private Integer temperatureCelsius;

    @Column(name = "registration_open", nullable = false)
    private Boolean registrationOpen = false;

    @Column(name = "registration_deadline")
    private LocalDate registrationDeadline;

    @Column(name = "is_multi_stage", nullable = false)
    private Boolean isMultiStage = false;

    @Min(value = 1, message = "Total stages must be at least 1")
    @Max(value = 50, message = "Total stages must not exceed 50")
    @Column(name = "total_stages")
    private Integer totalStages;

    @DecimalMin(value = "0.0", message = "Overall distance must be non-negative")
    @Digits(integer = 6, fraction = 2, message = "Overall distance must have at most 6 integer digits and 2 decimal places")
    @Column(name = "overall_distance_km", precision = 8, scale = 2)
    private BigDecimal overallDistanceKm;

    @Min(value = 0, message = "Overall elevation gain must be non-negative")
    @Column(name = "overall_elevation_gain_m")
    private Integer overallElevationGainM;

    // Relationships
    @OneToMany(mappedBy = "race", fetch = FetchType.LAZY, cascade = CascadeType.ALL)
    private Set<Stage> stages = new HashSet<>();

    @ManyToMany(mappedBy = "participatedRaces", fetch = FetchType.LAZY)
    private Set<Team> participatingTeams = new HashSet<>();

    @ManyToMany(mappedBy = "races", fetch = FetchType.LAZY)
    private Set<Rider> participants = new HashSet<>();

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
    public Race() {}

    // Constructor for creating new races
    public Race(String name, String description, LocalDate raceDate, LocalTime startTime,
                String location, String country, RaceType raceType, RaceCategory category) {
        this.name = name;
        this.description = description;
        this.raceDate = raceDate;
        this.startTime = startTime;
        this.location = location;
        this.country = country;
        this.raceType = raceType;
        this.category = category;
        this.status = RaceStatus.PLANNED;
        this.registrationOpen = false;
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public LocalDate getRaceDate() {
        return raceDate;
    }

    public void setRaceDate(LocalDate raceDate) {
        this.raceDate = raceDate;
    }

    public LocalTime getStartTime() {
        return startTime;
    }

    public void setStartTime(LocalTime startTime) {
        this.startTime = startTime;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public String getCountry() {
        return country;
    }

    public void setCountry(String country) {
        this.country = country;
    }

    public RaceType getRaceType() {
        return raceType;
    }

    public void setRaceType(RaceType raceType) {
        this.raceType = raceType;
    }

    public RaceCategory getCategory() {
        return category;
    }

    public void setCategory(RaceCategory category) {
        this.category = category;
    }

    public BigDecimal getDistanceKm() {
        return distanceKm;
    }

    public void setDistanceKm(BigDecimal distanceKm) {
        this.distanceKm = distanceKm;
    }

    public Integer getElevationGainM() {
        return elevationGainM;
    }

    public void setElevationGainM(Integer elevationGainM) {
        this.elevationGainM = elevationGainM;
    }

    public Integer getMaxParticipants() {
        return maxParticipants;
    }

    public void setMaxParticipants(Integer maxParticipants) {
        this.maxParticipants = maxParticipants;
    }

    public BigDecimal getEntryFee() {
        return entryFee;
    }

    public void setEntryFee(BigDecimal entryFee) {
        this.entryFee = entryFee;
    }

    public BigDecimal getPrizeMoney() {
        return prizeMoney;
    }

    public void setPrizeMoney(BigDecimal prizeMoney) {
        this.prizeMoney = prizeMoney;
    }

    public RaceStatus getStatus() {
        return status;
    }

    public void setStatus(RaceStatus status) {
        this.status = status;
    }

    public String getWeatherForecast() {
        return weatherForecast;
    }

    public void setWeatherForecast(String weatherForecast) {
        this.weatherForecast = weatherForecast;
    }

    public Integer getTemperatureCelsius() {
        return temperatureCelsius;
    }

    public void setTemperatureCelsius(Integer temperatureCelsius) {
        this.temperatureCelsius = temperatureCelsius;
    }

    public Boolean getRegistrationOpen() {
        return registrationOpen;
    }

    public void setRegistrationOpen(Boolean registrationOpen) {
        this.registrationOpen = registrationOpen;
    }

    public LocalDate getRegistrationDeadline() {
        return registrationDeadline;
    }

    public void setRegistrationDeadline(LocalDate registrationDeadline) {
        this.registrationDeadline = registrationDeadline;
    }

    public Boolean getIsMultiStage() {
        return isMultiStage;
    }

    public void setIsMultiStage(Boolean isMultiStage) {
        this.isMultiStage = isMultiStage;
    }

    public Integer getTotalStages() {
        return totalStages;
    }

    public void setTotalStages(Integer totalStages) {
        this.totalStages = totalStages;
    }

    public BigDecimal getOverallDistanceKm() {
        return overallDistanceKm;
    }

    public void setOverallDistanceKm(BigDecimal overallDistanceKm) {
        this.overallDistanceKm = overallDistanceKm;
    }

    public Integer getOverallElevationGainM() {
        return overallElevationGainM;
    }

    public void setOverallElevationGainM(Integer overallElevationGainM) {
        this.overallElevationGainM = overallElevationGainM;
    }

    public Set<Stage> getStages() {
        return stages;
    }

    public void setStages(Set<Stage> stages) {
        this.stages = stages;
    }

    public Set<Team> getParticipatingTeams() {
        return participatingTeams;
    }

    public void setParticipatingTeams(Set<Team> participatingTeams) {
        this.participatingTeams = participatingTeams;
    }

    public Set<Rider> getParticipants() {
        return participants;
    }

    public void setParticipants(Set<Rider> participants) {
        this.participants = participants;
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

    // Business methods
    public String getFullLocation() {
        return location + ", " + country;
    }

    public boolean isRegistrationActive() {
        return registrationOpen && 
               (registrationDeadline == null || LocalDate.now().isBefore(registrationDeadline)) &&
               status == RaceStatus.PLANNED;
    }

    public boolean isUpcoming() {
        return raceDate != null && raceDate.isAfter(LocalDate.now());
    }

    public int getCurrentParticipantCount() {
        return participants != null ? participants.size() : 0;
    }

    public boolean isFull() {
        return maxParticipants != null && getCurrentParticipantCount() >= maxParticipants;
    }

    public boolean canRegister() {
        return isRegistrationActive() && !isFull();
    }

    public Double getDifficultyScore() {
        if (isMultiStage && overallDistanceKm != null) {
            double score = overallDistanceKm.doubleValue();
            if (overallElevationGainM != null) {
                score += overallElevationGainM * 0.01;
            }
            return score;
        } else if (distanceKm != null) {
            double score = distanceKm.doubleValue();
            if (elevationGainM != null) {
                score += elevationGainM * 0.01;
            }
            return score;
        }
        return null;
    }

    public int getCompletedStages() {
        return (int) stages.stream().filter(s -> s.isCompleted()).count();
    }

    public boolean isGrandTour() {
        return isMultiStage && totalStages != null && totalStages >= 15;
    }

    public boolean isStageRace() {
        return isMultiStage && totalStages != null && totalStages > 1;
    }

    public Stage getCurrentStage() {
        return stages.stream()
                .filter(s -> s.getStatus() == StageStatus.RACING || s.getStatus() == StageStatus.NEUTRALIZED)
                .findFirst()
                .orElse(null);
    }

    public Stage getNextStage() {
        return stages.stream()
                .filter(s -> s.canStart())
                .min((s1, s2) -> s1.getStageNumber().compareTo(s2.getStageNumber()))
                .orElse(null);
    }

    public int getTeamCount() {
        return participatingTeams != null ? participatingTeams.size() : 0;
    }

    // Helper methods for participant management
    public boolean addParticipant(Rider rider) {
        if (canRegister() && rider != null) {
            return participants.add(rider);
        }
        return false;
    }

    public boolean removeParticipant(Rider rider) {
        if (rider != null && status == RaceStatus.PLANNED) {
            return participants.remove(rider);
        }
        return false;
    }

    // equals and hashCode based on business key (name + raceDate + location)
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Race race = (Race) o;
        return Objects.equals(name, race.name) &&
               Objects.equals(raceDate, race.raceDate) &&
               Objects.equals(location, race.location);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name, raceDate, location);
    }

    @Override
    public String toString() {
        return "Race{" +
                "id=" + id +
                ", name='" + name + '\'' +
                ", raceDate=" + raceDate +
                ", location='" + location + '\'' +
                ", raceType=" + raceType +
                ", category=" + category +
                ", status=" + status +
                ", participants=" + getCurrentParticipantCount() +
                '}';
    }
}