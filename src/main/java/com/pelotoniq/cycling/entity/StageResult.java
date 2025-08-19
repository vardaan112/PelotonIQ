package com.pelotoniq.cycling.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "stage_results", indexes = {
    @Index(name = "idx_stage_result_stage", columnList = "stage_id"),
    @Index(name = "idx_stage_result_rider", columnList = "rider_id"),
    @Index(name = "idx_stage_result_position", columnList = "stage_id, position"),
    @Index(name = "idx_stage_result_time", columnList = "stage_id, finish_time_seconds"),
    @Index(name = "idx_stage_result_status", columnList = "status")
})
public class StageResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "stage_id", nullable = false)
    private Stage stage;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rider_id", nullable = false)
    private Rider rider;

    @Min(value = 1, message = "Position must be at least 1")
    @Max(value = 1000, message = "Position must not exceed 1000")
    @Column(name = "position")
    private Integer position;

    @Min(value = 0, message = "Finish time must be non-negative")
    @Column(name = "finish_time_seconds")
    private Long finishTimeSeconds;

    @Min(value = 0, message = "Time behind must be non-negative")
    @Column(name = "time_behind_seconds")
    private Long timeBehindSeconds;

    @Min(value = 0, message = "Points must be non-negative")
    @Max(value = 1000, message = "Points must not exceed 1000")
    @Column(name = "points")
    private Integer points = 0;

    @Min(value = 0, message = "Bonus seconds must be non-negative")
    @Max(value = 300, message = "Bonus seconds must not exceed 300")
    @Column(name = "bonus_seconds")
    private Integer bonusSeconds = 0;

    @Min(value = 0, message = "Penalty seconds must be non-negative")
    @Max(value = 3600, message = "Penalty seconds must not exceed 3600")
    @Column(name = "penalty_seconds")
    private Integer penaltySeconds = 0;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private ResultStatus status = ResultStatus.FINISHED;

    @Size(max = 500, message = "Status reason must not exceed 500 characters")
    @Column(name = "status_reason", length = 500)
    private String statusReason;

    // Performance metrics
    @DecimalMin(value = "0.0", message = "Average speed must be non-negative")
    @DecimalMax(value = "80.0", message = "Average speed must not exceed 80 km/h")
    @Digits(integer = 2, fraction = 2, message = "Average speed must have at most 2 integer digits and 2 decimal places")
    @Column(name = "average_speed_kmh", precision = 4, scale = 2)
    private BigDecimal averageSpeedKmh;

    @DecimalMin(value = "0.0", message = "Average power must be non-negative")
    @DecimalMax(value = "1000.0", message = "Average power must not exceed 1000 watts")
    @Digits(integer = 4, fraction = 1, message = "Average power must have at most 4 integer digits and 1 decimal place")
    @Column(name = "average_power_watts", precision = 5, scale = 1)
    private BigDecimal averagePowerWatts;

    @DecimalMin(value = "0.0", message = "Maximum power must be non-negative")
    @DecimalMax(value = "2000.0", message = "Maximum power must not exceed 2000 watts")
    @Digits(integer = 4, fraction = 1, message = "Maximum power must have at most 4 integer digits and 1 decimal place")
    @Column(name = "max_power_watts", precision = 5, scale = 1)
    private BigDecimal maxPowerWatts;

    @Min(value = 30, message = "Average heart rate must be at least 30 bpm")
    @Max(value = 250, message = "Average heart rate must not exceed 250 bpm")
    @Column(name = "average_heart_rate")
    private Integer averageHeartRate;

    @Min(value = 30, message = "Maximum heart rate must be at least 30 bpm")
    @Max(value = 250, message = "Maximum heart rate must not exceed 250 bpm")
    @Column(name = "max_heart_rate")
    private Integer maxHeartRate;

    @Min(value = 30, message = "Average cadence must be at least 30 rpm")
    @Max(value = 150, message = "Average cadence must not exceed 150 rpm")
    @Column(name = "average_cadence")
    private Integer averageCadence;

    @DecimalMin(value = "0.0", message = "Energy expenditure must be non-negative")
    @DecimalMax(value = "10000.0", message = "Energy expenditure must not exceed 10000 kJ")
    @Digits(integer = 5, fraction = 1, message = "Energy expenditure must have at most 5 integer digits and 1 decimal place")
    @Column(name = "energy_expenditure_kj", precision = 6, scale = 1)
    private BigDecimal energyExpenditureKj;

    @Column(name = "start_time")
    private LocalDateTime startTime;

    @Column(name = "finish_time")
    private LocalDateTime finishTime;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    // Constructors
    public StageResult() {}

    public StageResult(Stage stage, Rider rider, Integer position, Long finishTimeSeconds) {
        this.stage = stage;
        this.rider = rider;
        this.position = position;
        this.finishTimeSeconds = finishTimeSeconds;
        this.status = ResultStatus.FINISHED;
        this.points = 0;
        this.bonusSeconds = 0;
        this.penaltySeconds = 0;
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Stage getStage() {
        return stage;
    }

    public void setStage(Stage stage) {
        this.stage = stage;
    }

    public Rider getRider() {
        return rider;
    }

    public void setRider(Rider rider) {
        this.rider = rider;
    }

    public Integer getPosition() {
        return position;
    }

    public void setPosition(Integer position) {
        this.position = position;
    }

    public Long getFinishTimeSeconds() {
        return finishTimeSeconds;
    }

    public void setFinishTimeSeconds(Long finishTimeSeconds) {
        this.finishTimeSeconds = finishTimeSeconds;
    }

    public Long getTimeBehindSeconds() {
        return timeBehindSeconds;
    }

    public void setTimeBehindSeconds(Long timeBehindSeconds) {
        this.timeBehindSeconds = timeBehindSeconds;
    }

    public Integer getPoints() {
        return points;
    }

    public void setPoints(Integer points) {
        this.points = points;
    }

    public Integer getBonusSeconds() {
        return bonusSeconds;
    }

    public void setBonusSeconds(Integer bonusSeconds) {
        this.bonusSeconds = bonusSeconds;
    }

    public Integer getPenaltySeconds() {
        return penaltySeconds;
    }

    public void setPenaltySeconds(Integer penaltySeconds) {
        this.penaltySeconds = penaltySeconds;
    }

    public ResultStatus getStatus() {
        return status;
    }

    public void setStatus(ResultStatus status) {
        this.status = status;
    }

    public String getStatusReason() {
        return statusReason;
    }

    public void setStatusReason(String statusReason) {
        this.statusReason = statusReason;
    }

    public BigDecimal getAverageSpeedKmh() {
        return averageSpeedKmh;
    }

    public void setAverageSpeedKmh(BigDecimal averageSpeedKmh) {
        this.averageSpeedKmh = averageSpeedKmh;
    }

    public BigDecimal getAveragePowerWatts() {
        return averagePowerWatts;
    }

    public void setAveragePowerWatts(BigDecimal averagePowerWatts) {
        this.averagePowerWatts = averagePowerWatts;
    }

    public BigDecimal getMaxPowerWatts() {
        return maxPowerWatts;
    }

    public void setMaxPowerWatts(BigDecimal maxPowerWatts) {
        this.maxPowerWatts = maxPowerWatts;
    }

    public Integer getAverageHeartRate() {
        return averageHeartRate;
    }

    public void setAverageHeartRate(Integer averageHeartRate) {
        this.averageHeartRate = averageHeartRate;
    }

    public Integer getMaxHeartRate() {
        return maxHeartRate;
    }

    public void setMaxHeartRate(Integer maxHeartRate) {
        this.maxHeartRate = maxHeartRate;
    }

    public Integer getAverageCadence() {
        return averageCadence;
    }

    public void setAverageCadence(Integer averageCadence) {
        this.averageCadence = averageCadence;
    }

    public BigDecimal getEnergyExpenditureKj() {
        return energyExpenditureKj;
    }

    public void setEnergyExpenditureKj(BigDecimal energyExpenditureKj) {
        this.energyExpenditureKj = energyExpenditureKj;
    }

    public LocalDateTime getStartTime() {
        return startTime;
    }

    public void setStartTime(LocalDateTime startTime) {
        this.startTime = startTime;
    }

    public LocalDateTime getFinishTime() {
        return finishTime;
    }

    public void setFinishTime(LocalDateTime finishTime) {
        this.finishTime = finishTime;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    // Business methods
    public Duration getFinishDuration() {
        return finishTimeSeconds != null ? Duration.ofSeconds(finishTimeSeconds) : null;
    }

    public Duration getTimeBehind() {
        return timeBehindSeconds != null ? Duration.ofSeconds(timeBehindSeconds) : null;
    }

    public String getFormattedFinishTime() {
        if (finishTimeSeconds == null) return null;
        long hours = finishTimeSeconds / 3600;
        long minutes = (finishTimeSeconds % 3600) / 60;
        long seconds = finishTimeSeconds % 60;
        return String.format("%02d:%02d:%02d", hours, minutes, seconds);
    }

    public String getFormattedTimeBehind() {
        if (timeBehindSeconds == null || timeBehindSeconds == 0) return "";
        if (timeBehindSeconds < 60) return "+" + timeBehindSeconds + "s";
        long minutes = timeBehindSeconds / 60;
        long seconds = timeBehindSeconds % 60;
        return String.format("+%d:%02d", minutes, seconds);
    }

    public Long getAdjustedTimeSeconds() {
        if (finishTimeSeconds == null) return null;
        long adjusted = finishTimeSeconds;
        if (bonusSeconds != null) adjusted -= bonusSeconds;
        if (penaltySeconds != null) adjusted += penaltySeconds;
        return adjusted;
    }

    public boolean isValidFinish() {
        return status == ResultStatus.FINISHED && position != null && finishTimeSeconds != null;
    }

    public boolean didNotFinish() {
        return status == ResultStatus.DNF || status == ResultStatus.DNS || 
               status == ResultStatus.DSQ || status == ResultStatus.OTL;
    }

    public Double getPowerToWeightRatio() {
        if (averagePowerWatts == null || rider == null || rider.getWeightKg() == null) return null;
        return averagePowerWatts.doubleValue() / rider.getWeightKg();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        StageResult that = (StageResult) o;
        return Objects.equals(stage, that.stage) && Objects.equals(rider, that.rider);
    }

    @Override
    public int hashCode() {
        return Objects.hash(stage, rider);
    }

    @Override
    public String toString() {
        return "StageResult{" +
                "id=" + id +
                ", stage=" + (stage != null ? stage.getFullName() : null) +
                ", rider=" + (rider != null ? rider.getFullName() : null) +
                ", position=" + position +
                ", finishTime='" + getFormattedFinishTime() + '\'' +
                ", status=" + status +
                '}';
    }
}