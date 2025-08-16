package com.pelotoniq.cycling.entity;

public enum RiderSpecialization {
    SPRINTER("Sprinter - Excels in flat stages and sprint finishes"),
    CLIMBER("Climber - Specializes in mountain stages and steep climbs"),
    TIME_TRIALIST("Time Trialist - Expert in individual time trials"),
    ALL_ROUNDER("All-Rounder - Versatile rider capable in multiple terrains"),
    DOMESTIQUE("Domestique - Support rider who assists team leaders"),
    CLASSICS_SPECIALIST("Classics Specialist - Expert in one-day classic races"),
    BREAKAWAY_SPECIALIST("Breakaway Specialist - Skilled at escaping the peloton"),
    PUNCHEUR("Puncheur - Strong on short, steep climbs and rolling terrain");

    private final String description;

    RiderSpecialization(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }

    public boolean isClimbingSpecialist() {
        return this == CLIMBER || this == PUNCHEUR;
    }

    public boolean isSprintSpecialist() {
        return this == SPRINTER;
    }

    public boolean isTimeTrialSpecialist() {
        return this == TIME_TRIALIST || this == ALL_ROUNDER;
    }

    public boolean isSupportRole() {
        return this == DOMESTIQUE;
    }
}