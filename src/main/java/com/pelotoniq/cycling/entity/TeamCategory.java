package com.pelotoniq.cycling.entity;

public enum TeamCategory {
    WORLD_TOUR("UCI World Tour - Highest level professional teams"),
    PRO_TEAM("UCI Pro Team - Professional teams below World Tour level"),
    CONTINENTAL("UCI Continental Team - Regional professional teams"),
    NATIONAL("National Team - Country-based teams for international competition"),
    DEVELOPMENT("Development Team - Training and development squads"),
    AMATEUR("Amateur Team - Non-professional competitive teams"),
    CLUB("Club Team - Local cycling club teams");

    private final String description;

    TeamCategory(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }

    public boolean isProfessional() {
        return this == WORLD_TOUR || this == PRO_TEAM || this == CONTINENTAL;
    }

    public boolean canParticipateInWorldTour() {
        return this == WORLD_TOUR;
    }

    public boolean canParticipateInProRaces() {
        return isProfessional();
    }

    public boolean isNationalTeam() {
        return this == NATIONAL;
    }

    public boolean isDevelopmentLevel() {
        return this == DEVELOPMENT || this == AMATEUR || this == CLUB;
    }

    public int getMinimumRiderCount() {
        switch (this) {
            case WORLD_TOUR:
                return 22;
            case PRO_TEAM:
                return 16;
            case CONTINENTAL:
                return 12;
            case NATIONAL:
                return 8;
            default:
                return 6;
        }
    }

    public int getMaximumRiderCount() {
        switch (this) {
            case WORLD_TOUR:
                return 30;
            case PRO_TEAM:
                return 28;
            case CONTINENTAL:
                return 25;
            case NATIONAL:
                return 20;
            default:
                return 50;
        }
    }

    public boolean requiresUCILicense() {
        return isProfessional() || this == NATIONAL;
    }
}