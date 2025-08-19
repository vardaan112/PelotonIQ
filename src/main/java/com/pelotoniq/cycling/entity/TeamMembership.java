package com.pelotoniq.cycling.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "team_memberships", indexes = {
    @Index(name = "idx_membership_rider", columnList = "rider_id"),
    @Index(name = "idx_membership_team", columnList = "team_id"),
    @Index(name = "idx_membership_dates", columnList = "start_date, end_date"),
    @Index(name = "idx_membership_active", columnList = "rider_id, end_date")
})
public class TeamMembership {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rider_id", nullable = false)
    private Rider rider;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @NotNull(message = "Start date is required")
    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false)
    private TeamRole role = TeamRole.RIDER;

    @DecimalMin(value = "0.00", message = "Salary must be non-negative")
    @DecimalMax(value = "10000000.00", message = "Salary must not exceed 10 million")
    @Digits(integer = 8, fraction = 2, message = "Salary must have at most 8 integer digits and 2 decimal places")
    @Column(name = "annual_salary", precision = 10, scale = 2)
    private BigDecimal annualSalary;

    @Min(value = 1, message = "Jersey number must be at least 1")
    @Max(value = 999, message = "Jersey number must not exceed 999")
    @Column(name = "jersey_number")
    private Integer jerseyNumber;

    @Column(name = "is_captain", nullable = false)
    private Boolean isCaptain = false;

    @Size(max = 500, message = "Notes must not exceed 500 characters")
    @Column(name = "notes", length = 500)
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    // Constructors
    public TeamMembership() {}

    public TeamMembership(Rider rider, Team team, LocalDate startDate, TeamRole role) {
        this.rider = rider;
        this.team = team;
        this.startDate = startDate;
        this.role = role;
        this.isCaptain = false;
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Rider getRider() {
        return rider;
    }

    public void setRider(Rider rider) {
        this.rider = rider;
    }

    public Team getTeam() {
        return team;
    }

    public void setTeam(Team team) {
        this.team = team;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public void setStartDate(LocalDate startDate) {
        this.startDate = startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public void setEndDate(LocalDate endDate) {
        this.endDate = endDate;
    }

    public TeamRole getRole() {
        return role;
    }

    public void setRole(TeamRole role) {
        this.role = role;
    }

    public BigDecimal getAnnualSalary() {
        return annualSalary;
    }

    public void setAnnualSalary(BigDecimal annualSalary) {
        this.annualSalary = annualSalary;
    }

    public Integer getJerseyNumber() {
        return jerseyNumber;
    }

    public void setJerseyNumber(Integer jerseyNumber) {
        this.jerseyNumber = jerseyNumber;
    }

    public Boolean getIsCaptain() {
        return isCaptain;
    }

    public void setIsCaptain(Boolean isCaptain) {
        this.isCaptain = isCaptain;
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
    public boolean isActive() {
        return endDate == null || endDate.isAfter(LocalDate.now());
    }

    public boolean isActiveOn(LocalDate date) {
        return !startDate.isAfter(date) && (endDate == null || !endDate.isBefore(date));
    }

    public long getDurationInDays() {
        LocalDate end = endDate != null ? endDate : LocalDate.now();
        return java.time.temporal.ChronoUnit.DAYS.between(startDate, end);
    }

    public int getDurationInYears() {
        LocalDate end = endDate != null ? endDate : LocalDate.now();
        return end.getYear() - startDate.getYear();
    }

    public boolean overlaps(TeamMembership other) {
        if (other == null) return false;
        
        LocalDate thisEnd = this.endDate != null ? this.endDate : LocalDate.MAX;
        LocalDate otherEnd = other.endDate != null ? other.endDate : LocalDate.MAX;
        
        return !this.startDate.isAfter(otherEnd) && !thisEnd.isBefore(other.startDate);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        TeamMembership that = (TeamMembership) o;
        return Objects.equals(rider, that.rider) &&
               Objects.equals(team, that.team) &&
               Objects.equals(startDate, that.startDate);
    }

    @Override
    public int hashCode() {
        return Objects.hash(rider, team, startDate);
    }

    @Override
    public String toString() {
        return "TeamMembership{" +
                "id=" + id +
                ", rider=" + (rider != null ? rider.getFullName() : null) +
                ", team=" + (team != null ? team.getName() : null) +
                ", startDate=" + startDate +
                ", endDate=" + endDate +
                ", role=" + role +
                ", active=" + isActive() +
                '}';
    }
}