package com.pelotoniq.cycling.entity;

public enum ClassificationType {
    GENERAL_CLASSIFICATION("General Classification - Overall time-based ranking"),
    POINTS_CLASSIFICATION("Points Classification - Sprinter's ranking based on points"),
    MOUNTAINS_CLASSIFICATION("Mountains Classification - King of the Mountains ranking"),
    YOUTH_CLASSIFICATION("Youth Classification - Best young rider classification"),
    TEAM_CLASSIFICATION("Team Classification - Best team overall ranking"),
    STAGE_WINNER("Stage Winner - Winner of individual stage"),
    INTERMEDIATE_SPRINT("Intermediate Sprint - Sprint points during stage"),
    MOUNTAIN_SPRINT("Mountain Sprint - Mountain points during stage"),
    COMBATIVITY("Combativity Award - Most aggressive rider"),
    LANTERNE_ROUGE("Lanterne Rouge - Last place in general classification");

    private final String description;

    ClassificationType(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }

    public boolean isOverallClassification() {
        return this == GENERAL_CLASSIFICATION || this == POINTS_CLASSIFICATION ||
               this == MOUNTAINS_CLASSIFICATION || this == YOUTH_CLASSIFICATION ||
               this == TEAM_CLASSIFICATION;
    }

    public boolean isStageSpecific() {
        return this == STAGE_WINNER || this == INTERMEDIATE_SPRINT ||
               this == MOUNTAIN_SPRINT || this == COMBATIVITY;
    }

    public boolean isTimeBasedClassification() {
        return this == GENERAL_CLASSIFICATION || this == YOUTH_CLASSIFICATION ||
               this == TEAM_CLASSIFICATION;
    }

    public boolean isPointsBasedClassification() {
        return this == POINTS_CLASSIFICATION || this == MOUNTAINS_CLASSIFICATION;
    }

    public boolean hasJersey() {
        return this == GENERAL_CLASSIFICATION || this == POINTS_CLASSIFICATION ||
               this == MOUNTAINS_CLASSIFICATION || this == YOUTH_CLASSIFICATION;
    }

    public boolean isTeamClassification() {
        return this == TEAM_CLASSIFICATION;
    }

    public boolean isIndividualClassification() {
        return !isTeamClassification();
    }

    public boolean isSpecialAward() {
        return this == COMBATIVITY || this == LANTERNE_ROUGE;
    }

    public String getJerseyColor() {
        switch (this) {
            case GENERAL_CLASSIFICATION:
                return "Yellow";
            case POINTS_CLASSIFICATION:
                return "Green";
            case MOUNTAINS_CLASSIFICATION:
                return "Polka Dot";
            case YOUTH_CLASSIFICATION:
                return "White";
            case TEAM_CLASSIFICATION:
                return "Team Colors";
            default:
                return null;
        }
    }

    public String getAbbreviation() {
        switch (this) {
            case GENERAL_CLASSIFICATION:
                return "GC";
            case POINTS_CLASSIFICATION:
                return "PC";
            case MOUNTAINS_CLASSIFICATION:
                return "KOM";
            case YOUTH_CLASSIFICATION:
                return "YC";
            case TEAM_CLASSIFICATION:
                return "TC";
            case STAGE_WINNER:
                return "SW";
            case INTERMEDIATE_SPRINT:
                return "IS";
            case MOUNTAIN_SPRINT:
                return "MS";
            case COMBATIVITY:
                return "COM";
            case LANTERNE_ROUGE:
                return "LR";
            default:
                return "UNK";
        }
    }

    public int getMaxPointsPerStage() {
        switch (this) {
            case POINTS_CLASSIFICATION:
                return 50; // Varies by stage type
            case MOUNTAINS_CLASSIFICATION:
                return 20; // Varies by mountain category
            case INTERMEDIATE_SPRINT:
                return 10;
            case MOUNTAIN_SPRINT:
                return 5;
            default:
                return 0;
        }
    }

    public boolean requiresAgeLimit() {
        return this == YOUTH_CLASSIFICATION;
    }

    public int getAgeLimit() {
        return this == YOUTH_CLASSIFICATION ? 25 : 0;
    }

    public boolean countsTowardsWorldRanking() {
        return isOverallClassification() && !isTeamClassification();
    }

    public int getDisplayPriority() {
        switch (this) {
            case GENERAL_CLASSIFICATION:
                return 1;
            case POINTS_CLASSIFICATION:
                return 2;
            case MOUNTAINS_CLASSIFICATION:
                return 3;
            case YOUTH_CLASSIFICATION:
                return 4;
            case TEAM_CLASSIFICATION:
                return 5;
            case STAGE_WINNER:
                return 6;
            case COMBATIVITY:
                return 7;
            case INTERMEDIATE_SPRINT:
                return 8;
            case MOUNTAIN_SPRINT:
                return 9;
            case LANTERNE_ROUGE:
                return 10;
            default:
                return 99;
        }
    }
}