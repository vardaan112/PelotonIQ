package com.pelotoniq.cycling.entity;

public enum RaceType {
    ROAD_RACE("Road Race - Traditional road cycling race on paved surfaces"),
    TIME_TRIAL("Time Trial - Individual or team race against the clock"),
    CRITERIUM("Criterium - Short lap race on a closed circuit"),
    MOUNTAIN_STAGE("Mountain Stage - Challenging stage with significant climbing"),
    SPRINT_STAGE("Sprint Stage - Flat stage designed for sprinters"),
    HILL_CLIMB("Hill Climb - Uphill race to a mountain top or summit"),
    GRAN_FONDO("Gran Fondo - Long-distance recreational/competitive ride"),
    CYCLOCROSS("Cyclocross - Off-road race with obstacles and varied terrain"),
    TRACK_RACE("Track Race - Velodrome racing on banked oval track"),
    ONE_DAY_CLASSIC("One Day Classic - Prestigious single-day professional race");

    private final String description;

    RaceType(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }

    public boolean isClimbingFocused() {
        return this == MOUNTAIN_STAGE || this == HILL_CLIMB;
    }

    public boolean isSprintFocused() {
        return this == SPRINT_STAGE || this == CRITERIUM;
    }

    public boolean isTimeTrialType() {
        return this == TIME_TRIAL;
    }

    public boolean isOffRoad() {
        return this == CYCLOCROSS;
    }

    public boolean isTrackBased() {
        return this == TRACK_RACE;
    }

    public boolean isProfessionalRace() {
        return this == ONE_DAY_CLASSIC || this == MOUNTAIN_STAGE || 
               this == SPRINT_STAGE || this == TIME_TRIAL;
    }

    public boolean isRecreationalFriendly() {
        return this == GRAN_FONDO || this == ROAD_RACE || this == HILL_CLIMB;
    }
}