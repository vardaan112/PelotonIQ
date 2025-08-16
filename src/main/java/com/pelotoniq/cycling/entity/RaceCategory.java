package com.pelotoniq.cycling.entity;

public enum RaceCategory {
    WORLD_TOUR("World Tour - Highest level of professional cycling"),
    PRO_SERIES("Pro Series - Professional races below World Tour level"),
    CONTINENTAL("Continental - Regional professional racing circuit"),
    NATIONAL("National - National championship level racing"),
    REGIONAL("Regional - Local and regional competitive racing"),
    AMATEUR("Amateur - Non-professional competitive racing"),
    RECREATIONAL("Recreational - Casual and fun rides for all levels"),
    YOUTH("Youth - Racing categories for young cyclists"),
    MASTERS("Masters - Racing categories for older cyclists (35+)"),
    WOMEN_ONLY("Women Only - Dedicated women's racing categories"),
    MIXED("Mixed - Open to all genders and skill levels");

    private final String description;

    RaceCategory(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }

    public boolean isProfessional() {
        return this == WORLD_TOUR || this == PRO_SERIES || this == CONTINENTAL;
    }

    public boolean isCompetitive() {
        return isProfessional() || this == NATIONAL || this == REGIONAL || this == AMATEUR;
    }

    public boolean isAgeSpecific() {
        return this == YOUTH || this == MASTERS;
    }

    public boolean isGenderSpecific() {
        return this == WOMEN_ONLY;
    }

    public boolean isOpenToAll() {
        return this == RECREATIONAL || this == MIXED;
    }

    public int getMinimumAgeRequirement() {
        switch (this) {
            case YOUTH:
                return 10;
            case AMATEUR:
            case REGIONAL:
            case NATIONAL:
                return 16;
            case CONTINENTAL:
            case PRO_SERIES:
            case WORLD_TOUR:
                return 18;
            case MASTERS:
                return 35;
            default:
                return 0; // No age restriction
        }
    }

    public int getMaximumAgeLimit() {
        switch (this) {
            case YOUTH:
                return 18;
            default:
                return 999; // No upper age limit
        }
    }
}