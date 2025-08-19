package com.pelotoniq.cycling.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "stage_classifications", indexes = {
    @Index(name = "idx_classification_stage", columnList = "stage_id"),
    @Index(name = "idx_classification_rider", columnList = "rider_id"),
    @Index(name = "idx_classification_type", columnList = "classification_type"),
    @Index(name = "idx_classification_position", columnList = "stage_id, classification_type, position")
})
public class StageClassification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "stage_id", nullable = false)
    private Stage stage;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rider_id", nullable = false)
    private Rider rider;

    @Enumerated(EnumType.STRING)
    @NotNull(message = "Classification type is required")
    @Column(name = "classification_type", nullable = false)
    private ClassificationType classificationType;

    @Min(value = 1, message = "Position must be at least 1")
    @Max(value = 1000, message = "Position must not exceed 1000")
    @Column(name = "position", nullable = false)
    private Integer position;

    @Min(value = 0, message = "Points must be non-negative")
    @Max(value = 1000, message = "Points must not exceed 1000")
    @Column(name = "points")
    private Integer points = 0;

    @Min(value = 0, message = "Cumulative points must be non-negative")
    @Column(name = "cumulative_points")
    private Integer cumulativePoints = 0;

    @Min(value = 0, message = "Time must be non-negative")
    @Column(name = "cumulative_time_seconds")
    private Long cumulativeTimeSeconds;

    @Min(value = 0, message = "Time behind must be non-negative")
    @Column(name = "time_behind_leader_seconds")
    private Long timeBehindLeaderSeconds;

    @Column(name = "jersey_awarded", nullable = false)
    private Boolean jerseyAwarded = false;

    @Size(max = 500, message = "Notes must not exceed 500 characters")
    @Column(name = "notes", length = 500)
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    // Constructors
    public StageClassification() {}

    public StageClassification(Stage stage, Rider rider, ClassificationType classificationType, 
                             Integer position, Integer points) {
        this.stage = stage;
        this.rider = rider;
        this.classificationType = classificationType;
        this.position = position;
        this.points = points;
        this.cumulativePoints = points;
        this.jerseyAwarded = false;
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

    public ClassificationType getClassificationType() {
        return classificationType;
    }

    public void setClassificationType(ClassificationType classificationType) {
        this.classificationType = classificationType;
    }

    public Integer getPosition() {
        return position;
    }

    public void setPosition(Integer position) {
        this.position = position;
    }

    public Integer getPoints() {
        return points;
    }

    public void setPoints(Integer points) {
        this.points = points;
    }

    public Integer getCumulativePoints() {
        return cumulativePoints;
    }

    public void setCumulativePoints(Integer cumulativePoints) {
        this.cumulativePoints = cumulativePoints;
    }

    public Long getCumulativeTimeSeconds() {
        return cumulativeTimeSeconds;
    }

    public void setCumulativeTimeSeconds(Long cumulativeTimeSeconds) {
        this.cumulativeTimeSeconds = cumulativeTimeSeconds;
    }

    public Long getTimeBehindLeaderSeconds() {
        return timeBehindLeaderSeconds;
    }

    public void setTimeBehindLeaderSeconds(Long timeBehindLeaderSeconds) {
        this.timeBehindLeaderSeconds = timeBehindLeaderSeconds;
    }

    public Boolean getJerseyAwarded() {
        return jerseyAwarded;
    }

    public void setJerseyAwarded(Boolean jerseyAwarded) {
        this.jerseyAwarded = jerseyAwarded;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    // Business methods
    public boolean isLeader() {
        return position == 1;
    }

    public boolean hasJersey() {
        return jerseyAwarded && isLeader();
    }

    public String getFormattedCumulativeTime() {
        if (cumulativeTimeSeconds == null) return null;
        long hours = cumulativeTimeSeconds / 3600;
        long minutes = (cumulativeTimeSeconds % 3600) / 60;
        long seconds = cumulativeTimeSeconds % 60;
        return String.format("%02d:%02d:%02d", hours, minutes, seconds);
    }

    public String getFormattedTimeBehind() {
        if (timeBehindLeaderSeconds == null || timeBehindLeaderSeconds == 0) return "";
        if (timeBehindLeaderSeconds < 60) return "+" + timeBehindLeaderSeconds + "s";
        long minutes = timeBehindLeaderSeconds / 60;
        long seconds = timeBehindLeaderSeconds % 60;
        return String.format("+%d:%02d", minutes, seconds);
    }

    public String getJerseyColor() {
        if (!hasJersey()) return null;
        switch (classificationType) {
            case GENERAL_CLASSIFICATION:
                return "Yellow";
            case POINTS_CLASSIFICATION:
                return "Green";
            case MOUNTAINS_CLASSIFICATION:
                return "Polka Dot";
            case YOUTH_CLASSIFICATION:
                return "White";
            case TEAM_CLASSIFICATION:
                return "Team";
            default:
                return "Special";
        }
    }

    public boolean isTimeBasedClassification() {
        return classificationType == ClassificationType.GENERAL_CLASSIFICATION ||
               classificationType == ClassificationType.YOUTH_CLASSIFICATION;
    }

    public boolean isPointsBasedClassification() {
        return classificationType == ClassificationType.POINTS_CLASSIFICATION ||
               classificationType == ClassificationType.MOUNTAINS_CLASSIFICATION;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        StageClassification that = (StageClassification) o;
        return Objects.equals(stage, that.stage) && 
               Objects.equals(rider, that.rider) && 
               classificationType == that.classificationType;
    }

    @Override
    public int hashCode() {
        return Objects.hash(stage, rider, classificationType);
    }

    @Override
    public String toString() {
        return "StageClassification{" +
                "id=" + id +
                ", stage=" + (stage != null ? stage.getFullName() : null) +
                ", rider=" + (rider != null ? rider.getFullName() : null) +
                ", classificationType=" + classificationType +
                ", position=" + position +
                ", points=" + (isPointsBasedClassification() ? cumulativePoints : null) +
                ", time=" + (isTimeBasedClassification() ? getFormattedCumulativeTime() : null) +
                ", jersey=" + hasJersey() +
                '}';
    }
}