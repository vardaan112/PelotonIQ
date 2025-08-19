package com.pelotoniq.cycling.entity;

public enum TeamRole {
    RIDER("Rider - Active racing cyclist"),
    TEAM_LEADER("Team Leader - Primary rider for overall classification"),
    SPRINTER_LEAD("Sprinter Lead - Primary rider for sprint stages"),
    CLIMBER_LEAD("Climber Lead - Primary rider for mountain stages"),
    DOMESTIQUE("Domestique - Support rider"),
    CAPTAIN("Captain - Team captain and leader"),
    RESERVE("Reserve - Reserve rider"),
    TRAINEE("Trainee - Development/training rider"),
    COACH("Coach - Team coach"),
    DIRECTOR("Director - Sports director"),
    MECHANIC("Mechanic - Bike mechanic"),
    SOIGNEUR("Soigneur - Team caretaker"),
    DOCTOR("Doctor - Team medical doctor"),
    MANAGER("Manager - Team manager");

    private final String description;

    TeamRole(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }

    public boolean isRider() {
        return this == RIDER || this == TEAM_LEADER || this == SPRINTER_LEAD || 
               this == CLIMBER_LEAD || this == DOMESTIQUE || this == CAPTAIN || 
               this == RESERVE || this == TRAINEE;
    }

    public boolean isStaff() {
        return this == COACH || this == DIRECTOR || this == MECHANIC || 
               this == SOIGNEUR || this == DOCTOR || this == MANAGER;
    }

    public boolean isLeadershipRole() {
        return this == TEAM_LEADER || this == CAPTAIN || this == DIRECTOR || this == MANAGER;
    }

    public boolean isSpecialistRole() {
        return this == SPRINTER_LEAD || this == CLIMBER_LEAD;
    }

    public boolean isSupportRole() {
        return this == DOMESTIQUE || this == RESERVE;
    }

    public boolean isMedicalRole() {
        return this == DOCTOR || this == SOIGNEUR;
    }

    public boolean isTechnicalRole() {
        return this == MECHANIC || this == COACH;
    }

    public boolean canRaceInEvents() {
        return isRider() && this != RESERVE && this != TRAINEE;
    }

    public boolean requiresCyclingLicense() {
        return isRider();
    }

    public int getTypicalSalaryRange() {
        switch (this) {
            case TEAM_LEADER:
                return 1000000; // High-end leader
            case SPRINTER_LEAD:
            case CLIMBER_LEAD:
                return 500000; // Specialist leaders
            case CAPTAIN:
                return 300000; // Experienced captain
            case RIDER:
                return 100000; // Regular rider
            case DOMESTIQUE:
                return 75000; // Support rider
            case DIRECTOR:
            case MANAGER:
                return 150000; // Management
            case COACH:
                return 80000; // Coaching staff
            case DOCTOR:
                return 120000; // Medical staff
            default:
                return 50000; // Support staff
        }
    }
}