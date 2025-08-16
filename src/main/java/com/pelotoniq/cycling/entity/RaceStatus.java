package com.pelotoniq.cycling.entity;

public enum RaceStatus {
    PLANNED("Planned - Race is scheduled but not yet open for registration"),
    REGISTRATION_OPEN("Registration Open - Participants can register for the race"),
    REGISTRATION_CLOSED("Registration Closed - Registration deadline has passed"),
    READY("Ready - All preparations complete, race about to start"),
    IN_PROGRESS("In Progress - Race is currently underway"),
    FINISHED("Finished - Race has completed successfully"),
    CANCELLED("Cancelled - Race has been cancelled"),
    POSTPONED("Postponed - Race has been delayed to a future date"),
    ABANDONED("Abandoned - Race was started but not completed due to circumstances");

    private final String description;

    RaceStatus(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }

    public boolean canAcceptRegistrations() {
        return this == PLANNED || this == REGISTRATION_OPEN;
    }

    public boolean canModifyDetails() {
        return this == PLANNED || this == REGISTRATION_OPEN || this == REGISTRATION_CLOSED;
    }

    public boolean isActive() {
        return this == IN_PROGRESS;
    }

    public boolean isCompleted() {
        return this == FINISHED || this == CANCELLED || this == ABANDONED;
    }

    public boolean canStart() {
        return this == READY || this == REGISTRATION_CLOSED;
    }

    public boolean canCancel() {
        return this == PLANNED || this == REGISTRATION_OPEN || 
               this == REGISTRATION_CLOSED || this == READY;
    }

    public boolean canPostpone() {
        return this == PLANNED || this == REGISTRATION_OPEN || 
               this == REGISTRATION_CLOSED || this == READY;
    }

    public boolean requiresResults() {
        return this == FINISHED;
    }

    public boolean allowsRefunds() {
        return this == CANCELLED || this == POSTPONED;
    }
}