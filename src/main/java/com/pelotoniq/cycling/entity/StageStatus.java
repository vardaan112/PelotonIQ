package com.pelotoniq.cycling.entity;

public enum StageStatus {
    PLANNED("Planned - Stage is scheduled but not ready to start"),
    READY("Ready - Stage is ready to begin"),
    NEUTRALIZED("Neutralized - Stage has started but racing has not begun"),
    RACING("Racing - Stage is actively underway"),
    FINISHED("Finished - Stage has completed successfully"),
    CANCELLED("Cancelled - Stage has been cancelled"),
    POSTPONED("Postponed - Stage has been delayed"),
    ABANDONED("Abandoned - Stage was started but not completed"),
    NEUTRALIZED_FINISH("Neutralized Finish - Stage finished under neutral conditions");

    private final String description;

    StageStatus(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }

    public boolean canStart() {
        return this == PLANNED || this == READY;
    }

    public boolean isActive() {
        return this == NEUTRALIZED || this == RACING;
    }

    public boolean isCompleted() {
        return this == FINISHED || this == CANCELLED || this == ABANDONED || this == NEUTRALIZED_FINISH;
    }

    public boolean canModify() {
        return this == PLANNED || this == READY;
    }

    public boolean canCancel() {
        return this == PLANNED || this == READY || this == NEUTRALIZED;
    }

    public boolean canPostpone() {
        return this == PLANNED || this == READY;
    }

    public boolean hasResults() {
        return this == FINISHED || this == NEUTRALIZED_FINISH;
    }

    public boolean allowsLiveUpdates() {
        return this == NEUTRALIZED || this == RACING;
    }

    public boolean requiresResultsEntry() {
        return this == FINISHED;
    }

    public boolean allowsTimingData() {
        return isActive() || hasResults();
    }

    public boolean canAbandon() {
        return this == NEUTRALIZED || this == RACING;
    }

    public boolean requiresInvestigation() {
        return this == ABANDONED || this == NEUTRALIZED_FINISH;
    }

    public boolean countsForClassification() {
        return this == FINISHED;
    }
}