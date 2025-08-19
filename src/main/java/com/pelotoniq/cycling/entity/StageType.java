package com.pelotoniq.cycling.entity;

public enum StageType {
    FLAT_STAGE("Flat Stage - Predominantly flat terrain favoring sprinters"),
    ROLLING_STAGE("Rolling Stage - Undulating terrain with small hills"),
    HILL_FINISH("Hill Finish - Stage ending with a climb"),
    MOUNTAIN_STAGE("Mountain Stage - High mountains with significant climbing"),
    SUMMIT_FINISH("Summit Finish - Stage finishing at the top of a mountain"),
    INDIVIDUAL_TIME_TRIAL("Individual Time Trial - Solo race against the clock"),
    TEAM_TIME_TRIAL("Team Time Trial - Team race against the clock"),
    PROLOGUE("Prologue - Short individual time trial opening a stage race"),
    CRITERIUM("Criterium - Multiple laps on a short circuit"),
    COBBLESTONE_STAGE("Cobblestone Stage - Stage featuring cobblestone sections"),
    GRAVEL_STAGE("Gravel Stage - Stage on unpaved gravel roads"),
    MIXED_TERRAIN("Mixed Terrain - Combination of different road surfaces");

    private final String description;

    StageType(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }

    public boolean favorsSprintersOnly() {
        return this == FLAT_STAGE || this == CRITERIUM;
    }

    public boolean favorsClimbersOnly() {
        return this == MOUNTAIN_STAGE || this == SUMMIT_FINISH || this == HILL_FINISH;
    }

    public boolean favorsTimeTrialists() {
        return this == INDIVIDUAL_TIME_TRIAL || this == TEAM_TIME_TRIAL || this == PROLOGUE;
    }

    public boolean favorsClassicsSpecialists() {
        return this == COBBLESTONE_STAGE || this == GRAVEL_STAGE;
    }

    public boolean favorsAllRounders() {
        return this == ROLLING_STAGE || this == MIXED_TERRAIN;
    }

    public boolean isTimeTrial() {
        return this == INDIVIDUAL_TIME_TRIAL || this == TEAM_TIME_TRIAL || this == PROLOGUE;
    }

    public boolean isMountainStage() {
        return this == MOUNTAIN_STAGE || this == SUMMIT_FINISH || this == HILL_FINISH;
    }

    public boolean isSpecializedTerrain() {
        return this == COBBLESTONE_STAGE || this == GRAVEL_STAGE || this == MIXED_TERRAIN;
    }

    public boolean allowsTeamwork() {
        return !isTimeTrial() || this == TEAM_TIME_TRIAL;
    }

    public boolean requiresSpecialEquipment() {
        return isTimeTrial() || this == COBBLESTONE_STAGE || this == GRAVEL_STAGE;
    }

    public int getTypicalDurationMinutes() {
        switch (this) {
            case PROLOGUE:
                return 15;
            case INDIVIDUAL_TIME_TRIAL:
                return 60;
            case TEAM_TIME_TRIAL:
                return 45;
            case CRITERIUM:
                return 90;
            case FLAT_STAGE:
            case ROLLING_STAGE:
                return 240;
            case HILL_FINISH:
                return 270;
            case MOUNTAIN_STAGE:
            case SUMMIT_FINISH:
                return 300;
            case COBBLESTONE_STAGE:
            case GRAVEL_STAGE:
                return 360;
            default:
                return 240;
        }
    }

    public double getDifficultyMultiplier() {
        switch (this) {
            case PROLOGUE:
                return 0.5;
            case FLAT_STAGE:
                return 1.0;
            case CRITERIUM:
                return 1.2;
            case ROLLING_STAGE:
                return 1.5;
            case INDIVIDUAL_TIME_TRIAL:
                return 1.8;
            case TEAM_TIME_TRIAL:
                return 1.6;
            case HILL_FINISH:
                return 2.0;
            case COBBLESTONE_STAGE:
            case GRAVEL_STAGE:
                return 2.5;
            case MOUNTAIN_STAGE:
                return 3.0;
            case SUMMIT_FINISH:
                return 3.5;
            case MIXED_TERRAIN:
                return 2.2;
            default:
                return 1.0;
        }
    }
}