package com.pelotoniq.cycling.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

@Entity
@Table(name = "teams", indexes = {
    @Index(name = "idx_team_name", columnList = "name", unique = true),
    @Index(name = "idx_team_country", columnList = "country"),
    @Index(name = "idx_team_category", columnList = "category"),
    @Index(name = "idx_team_active", columnList = "active")
})
public class Team {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank(message = "Team name is required")
    @Size(min = 2, max = 100, message = "Team name must be between 2 and 100 characters")
    @Column(name = "name", nullable = false, unique = true, length = 100)
    private String name;

    @Size(max = 20, message = "Team code must not exceed 20 characters")
    @Column(name = "code", length = 20, unique = true)
    private String code;

    @Size(max = 1000, message = "Description must not exceed 1000 characters")
    @Column(name = "description", length = 1000)
    private String description;

    @NotBlank(message = "Country is required")
    @Size(min = 2, max = 50, message = "Country must be between 2 and 50 characters")
    @Column(name = "country", nullable = false, length = 50)
    private String country;

    @Column(name = "founded_year")
    private Integer foundedYear;

    @Size(max = 100, message = "Manager name must not exceed 100 characters")
    @Column(name = "manager", length = 100)
    private String manager;

    @Size(max = 100, message = "Director name must not exceed 100 characters")
    @Column(name = "director", length = 100)
    private String director;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false)
    private TeamCategory category = TeamCategory.CONTINENTAL;

    @DecimalMin(value = "0.00", message = "Budget must be non-negative")
    @DecimalMax(value = "50000000.00", message = "Budget must not exceed 50 million")
    @Digits(integer = 8, fraction = 2, message = "Budget must have at most 8 integer digits and 2 decimal places")
    @Column(name = "annual_budget", precision = 10, scale = 2)
    private BigDecimal annualBudget;

    @Min(value = 8, message = "Minimum roster size is 8 riders")
    @Max(value = 50, message = "Maximum roster size is 50 riders")
    @Column(name = "max_roster_size")
    private Integer maxRosterSize = 30;

    @Size(max = 500, message = "Website URL must not exceed 500 characters")
    @Column(name = "website", length = 500)
    private String website;

    @Size(max = 100, message = "Email must not exceed 100 characters")
    @Email(message = "Email should be valid")
    @Column(name = "email", length = 100)
    private String email;

    @Column(name = "active", nullable = false)
    private Boolean active = true;

    // Relationships
    @OneToMany(mappedBy = "currentTeam", fetch = FetchType.LAZY, cascade = CascadeType.ALL)
    private Set<Rider> riders = new HashSet<>();

    @OneToMany(mappedBy = "team", fetch = FetchType.LAZY, cascade = CascadeType.ALL)
    private Set<TeamMembership> memberships = new HashSet<>();

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "team_race_participation",
        joinColumns = @JoinColumn(name = "team_id"),
        inverseJoinColumns = @JoinColumn(name = "race_id")
    )
    private Set<Race> participatedRaces = new HashSet<>();

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
    public Team() {}

    public Team(String name, String country, TeamCategory category) {
        this.name = name;
        this.country = country;
        this.category = category;
        this.active = true;
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

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getCountry() {
        return country;
    }

    public void setCountry(String country) {
        this.country = country;
    }

    public Integer getFoundedYear() {
        return foundedYear;
    }

    public void setFoundedYear(Integer foundedYear) {
        this.foundedYear = foundedYear;
    }

    public String getManager() {
        return manager;
    }

    public void setManager(String manager) {
        this.manager = manager;
    }

    public String getDirector() {
        return director;
    }

    public void setDirector(String director) {
        this.director = director;
    }

    public TeamCategory getCategory() {
        return category;
    }

    public void setCategory(TeamCategory category) {
        this.category = category;
    }

    public BigDecimal getAnnualBudget() {
        return annualBudget;
    }

    public void setAnnualBudget(BigDecimal annualBudget) {
        this.annualBudget = annualBudget;
    }

    public Integer getMaxRosterSize() {
        return maxRosterSize;
    }

    public void setMaxRosterSize(Integer maxRosterSize) {
        this.maxRosterSize = maxRosterSize;
    }

    public String getWebsite() {
        return website;
    }

    public void setWebsite(String website) {
        this.website = website;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public Boolean getActive() {
        return active;
    }

    public void setActive(Boolean active) {
        this.active = active;
    }

    public Set<Rider> getRiders() {
        return riders;
    }

    public void setRiders(Set<Rider> riders) {
        this.riders = riders;
    }

    public Set<TeamMembership> getMemberships() {
        return memberships;
    }

    public void setMemberships(Set<TeamMembership> memberships) {
        this.memberships = memberships;
    }

    public Set<Race> getParticipatedRaces() {
        return participatedRaces;
    }

    public void setParticipatedRaces(Set<Race> participatedRaces) {
        this.participatedRaces = participatedRaces;
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
    public int getCurrentRiderCount() {
        return riders != null ? (int) riders.stream().filter(r -> r.getActive()).count() : 0;
    }

    public boolean canAddRider() {
        return getCurrentRiderCount() < maxRosterSize;
    }

    public int getYearsActive() {
        return foundedYear != null ? LocalDate.now().getYear() - foundedYear : 0;
    }

    public boolean isProfessional() {
        return category == TeamCategory.WORLD_TOUR || category == TeamCategory.PRO_TEAM;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Team team = (Team) o;
        return Objects.equals(name, team.name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name);
    }

    @Override
    public String toString() {
        return "Team{" +
                "id=" + id +
                ", name='" + name + '\'' +
                ", country='" + country + '\'' +
                ", category=" + category +
                ", active=" + active +
                ", riders=" + getCurrentRiderCount() +
                '}';
    }
}