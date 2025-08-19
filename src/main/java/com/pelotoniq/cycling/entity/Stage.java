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
@Table(name = "stages", indexes = {
    @Index(name = "idx_stage_race", columnList = "race_id"),
    @Index(name = "idx_stage_number", columnList = "race_id, stage_number"),
    @Index(name = "idx_stage_date", columnList = "stage_date"),
    @Index(name = "idx_stage_type", columnList = "stage_type")
})
public class Stage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "race_id", nullable = false)
    private Race race;

    @NotNull(message = "Stage number is required")
    @Min(value = 1, message = "Stage number must be at least 1")
    @Max(value = 50, message = "Stage number must not exceed 50")
    @Column(name = "stage_number", nullable = false)
    private Integer stageNumber;

    @NotBlank(message = "Stage name is required")
    @Size(min = 3, max = 200, message = "Stage name must be between 3 and 200 characters")
    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @Size(max = 1000, message = "Description must not exceed 1000 characters")
    @Column(name = "description", length = 1000)
    private String description;

    @NotNull(message = "Stage date is required")
    @Column(name = "stage_date", nullable = false)
    private LocalDate stageDate;

    @NotNull(message = "Start time is required")
    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @NotBlank(message = "Start location is required")
    @Size(min = 2, max = 100, message = "Start location must be between 2 and 100 characters")
    @Column(name = "start_location", nullable = false, length = 100)
    private String startLocation;

    @NotBlank(message = "Finish location is required")
    @Size(min = 2, max = 100, message = "Finish location must be between 2 and 100 characters")
    @Column(name = "finish_location", nullable = false, length = 100)
    private String finishLocation;

    @Enumerated(EnumType.STRING)
    @NotNull(message = "Stage type is required")
    @Column(name = "stage_type", nullable = false)
    private StageType stageType;

    @DecimalMin(value = "0.1", message = "Distance must be at least 0.1 km")
    @DecimalMax(value = "400.0", message = "Distance must not exceed 400 km")
    @Digits(integer = 3, fraction = 2, message = "Distance must have at most 3 integer digits and 2 decimal places")
    @Column(name = "distance_km", precision = 5, scale = 2)
    private BigDecimal distanceKm;

    @Min(value = 0, message = "Elevation gain must be non-negative")
    @Max(value = 15000, message = "Elevation gain must not exceed 15,000 meters")
    @Column(name = "elevation_gain_m")
    private Integer elevationGainM;

    @Min(value = 0, message = "Start elevation must be non-negative")
    @Max(value = 9000, message = "Start elevation must not exceed 9,000 meters")
    @Column(name = "start_elevation_m")
    private Integer startElevationM;

    @Min(value = 0, message = "Finish elevation must be non-negative")
    @Max(value = 9000, message = "Finish elevation must not exceed 9,000 meters")
    @Column(name = "finish_elevation_m")
    private Integer finishElevationM;

    @Min(value = 0, message = "Maximum gradient must be non-negative")
    @Max(value = 35, message = "Maximum gradient must not exceed 35%")
    @Column(name = "max_gradient_percent")
    private Integer maxGradientPercent;

    @DecimalMin(value = "0.0", message = "Average speed must be non-negative")
    @DecimalMax(value = "80.0", message = "Average speed must not exceed 80 km/h")
    @Digits(integer = 2, fraction = 2, message = "Average speed must have at most 2 integer digits and 2 decimal places")
    @Column(name = "expected_avg_speed_kmh", precision = 4, scale = 2)
    private BigDecimal expectedAvgSpeedKmh;

    @Column(name = "time_limit_minutes")
    private Integer timeLimitMinutes;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private StageStatus status = StageStatus.PLANNED;

    @Size(max = 500, message = "Weather forecast must not exceed 500 characters")
    @Column(name = "weather_forecast", length = 500)
    private String weatherForecast;

    @Min(value = -50, message = "Temperature must be at least -50°C")
    @Max(value = 60, message = "Temperature must not exceed 60°C")
    @Column(name = "temperature_celsius")
    private Integer temperatureCelsius;

    @Min(value = 0, message = "Wind speed must be non-negative")
    @Max(value = 200, message = "Wind speed must not exceed 200 km/h")
    @Column(name = "wind_speed_kmh")
    private Integer windSpeedKmh;

    @Column(name = "neutralized_start", nullable = false)
    private Boolean neutralizedStart = false;

    @Column(name = "team_time_trial", nullable = false)
    private Boolean teamTimeTrial = false;

    // Points for different classifications
    @Min(value = 0, message = "Points must be non-negative")
    @Column(name = "stage_winner_points")
    private Integer stageWinnerPoints = 50;

    @Min(value = 0, message = "Points must be non-negative")
    @Column(name = "points_available")
    private Integer pointsAvailable = 100;

    // Relationships
    @OneToMany(mappedBy = "stage", fetch = FetchType.LAZY, cascade = CascadeType.ALL)
    private Set<StageResult> results = new HashSet<>();

    @OneToMany(mappedBy = "stage", fetch = FetchType.LAZY, cascade = CascadeType.ALL)
    private Set<StageClassification> classifications = new HashSet<>();

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Version
    @Column(name = "version")
    private Long version;

    // Constructors
    public Stage() {}

    public Stage(Race race, Integer stageNumber, String name, LocalDate stageDate, 
                LocalTime startTime, String startLocation, String finishLocation, StageType stageType) {
        this.race = race;
        this.stageNumber = stageNumber;
        this.name = name;
        this.stageDate = stageDate;
        this.startTime = startTime;
        this.startLocation = startLocation;
        this.finishLocation = finishLocation;
        this.stageType = stageType;
        this.status = StageStatus.PLANNED;
        this.neutralizedStart = false;
        this.teamTimeTrial = false;
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Race getRace() {
        return race;
    }

    public void setRace(Race race) {
        this.race = race;
    }

    public Integer getStageNumber() {
        return stageNumber;
    }

    public void setStageNumber(Integer stageNumber) {
        this.stageNumber = stageNumber;
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

    public LocalDate getStageDate() {
        return stageDate;
    }

    public void setStageDate(LocalDate stageDate) {
        this.stageDate = stageDate;
    }

    public LocalTime getStartTime() {
        return startTime;
    }

    public void setStartTime(LocalTime startTime) {
        this.startTime = startTime;
    }

    public String getStartLocation() {
        return startLocation;
    }

    public void setStartLocation(String startLocation) {
        this.startLocation = startLocation;
    }

    public String getFinishLocation() {
        return finishLocation;
    }

    public void setFinishLocation(String finishLocation) {
        this.finishLocation = finishLocation;
    }

    public StageType getStageType() {
        return stageType;
    }

    public void setStageType(StageType stageType) {
        this.stageType = stageType;
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

    public Integer getStartElevationM() {
        return startElevationM;
    }

    public void setStartElevationM(Integer startElevationM) {
        this.startElevationM = startElevationM;
    }

    public Integer getFinishElevationM() {
        return finishElevationM;
    }

    public void setFinishElevationM(Integer finishElevationM) {
        this.finishElevationM = finishElevationM;
    }

    public Integer getMaxGradientPercent() {
        return maxGradientPercent;
    }

    public void setMaxGradientPercent(Integer maxGradientPercent) {
        this.maxGradientPercent = maxGradientPercent;
    }

    public BigDecimal getExpectedAvgSpeedKmh() {
        return expectedAvgSpeedKmh;
    }

    public void setExpectedAvgSpeedKmh(BigDecimal expectedAvgSpeedKmh) {
        this.expectedAvgSpeedKmh = expectedAvgSpeedKmh;
    }

    public Integer getTimeLimitMinutes() {
        return timeLimitMinutes;
    }

    public void setTimeLimitMinutes(Integer timeLimitMinutes) {
        this.timeLimitMinutes = timeLimitMinutes;
    }

    public StageStatus getStatus() {
        return status;
    }

    public void setStatus(StageStatus status) {
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

    public Integer getWindSpeedKmh() {
        return windSpeedKmh;
    }

    public void setWindSpeedKmh(Integer windSpeedKmh) {
        this.windSpeedKmh = windSpeedKmh;
    }

    public Boolean getNeutralizedStart() {
        return neutralizedStart;
    }

    public void setNeutralizedStart(Boolean neutralizedStart) {
        this.neutralizedStart = neutralizedStart;
    }

    public Boolean getTeamTimeTrial() {
        return teamTimeTrial;
    }

    public void setTeamTimeTrial(Boolean teamTimeTrial) {
        this.teamTimeTrial = teamTimeTrial;
    }

    public Integer getStageWinnerPoints() {
        return stageWinnerPoints;
    }

    public void setStageWinnerPoints(Integer stageWinnerPoints) {
        this.stageWinnerPoints = stageWinnerPoints;
    }

    public Integer getPointsAvailable() {
        return pointsAvailable;
    }

    public void setPointsAvailable(Integer pointsAvailable) {
        this.pointsAvailable = pointsAvailable;
    }

    public Set<StageResult> getResults() {
        return results;
    }

    public void setResults(Set<StageResult> results) {
        this.results = results;
    }

    public Set<StageClassification> getClassifications() {
        return classifications;
    }

    public void setClassifications(Set<StageClassification> classifications) {
        this.classifications = classifications;
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
    public String getFullName() {
        return "Stage " + stageNumber + ": " + name;
    }

    public String getRoute() {
        return startLocation + " - " + finishLocation;
    }

    public Double getDifficultyScore() {
        if (distanceKm == null) return null;
        
        double score = distanceKm.doubleValue();
        
        // Add elevation factor
        if (elevationGainM != null) {
            score += elevationGainM * 0.01;
        }
        
        // Add gradient factor
        if (maxGradientPercent != null) {
            score += maxGradientPercent * 2.0;
        }
        
        return score;
    }

    public Double getClimbingDifficulty() {
        if (elevationGainM == null || distanceKm == null) return null;
        return elevationGainM.doubleValue() / distanceKm.doubleValue();
    }

    public boolean isMountainStage() {
        return stageType == StageType.MOUNTAIN_STAGE || stageType == StageType.HILL_FINISH;
    }

    public boolean isSprintStage() {
        return stageType == StageType.FLAT_STAGE || stageType == StageType.ROLLING_STAGE;
    }

    public boolean isTimeTrial() {
        return stageType == StageType.INDIVIDUAL_TIME_TRIAL || stageType == StageType.TEAM_TIME_TRIAL;
    }

    public boolean isCompleted() {
        return status == StageStatus.FINISHED;
    }

    public boolean canStart() {
        return status == StageStatus.PLANNED || status == StageStatus.READY;
    }

    public Integer getExpectedDurationMinutes() {
        if (distanceKm == null || expectedAvgSpeedKmh == null) return null;
        double hours = distanceKm.doubleValue() / expectedAvgSpeedKmh.doubleValue();
        return (int) Math.round(hours * 60);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Stage stage = (Stage) o;
        return Objects.equals(race, stage.race) && Objects.equals(stageNumber, stage.stageNumber);
    }

    @Override
    public int hashCode() {
        return Objects.hash(race, stageNumber);
    }

    @Override
    public String toString() {
        return "Stage{" +
                "id=" + id +
                ", stageNumber=" + stageNumber +
                ", name='" + name + '\'' +
                ", stageDate=" + stageDate +
                ", stageType=" + stageType +
                ", route='" + getRoute() + '\'' +
                ", status=" + status +
                '}';
    }
}