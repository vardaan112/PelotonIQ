package com.pelotoniq.cycling.entity;

public enum ResultStatus {
    FINISHED("Finished - Rider completed the stage successfully"),
    DNF("Did Not Finish - Rider started but did not complete the stage"),
    DNS("Did Not Start - Rider was registered but did not start"),
    DSQ("Disqualified - Rider was disqualified from the stage"),
    OTL("Outside Time Limit - Rider finished outside the time cutoff"),
    HD("Hors Delai - Rider finished outside time limit (French term)"),
    AB("Abandoned - Rider abandoned the stage due to circumstances"),
    NP("Not Placed - Rider participated but position not recorded"),
    DQ("Disqualified - Post-race disqualification"),
    RELEGATED("Relegated - Position changed due to rule violation"),
    PENDING("Pending - Result under review or investigation");

    private final String description;

    ResultStatus(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }

    public boolean isFinisher() {
        return this == FINISHED || this == RELEGATED;
    }

    public boolean didNotFinish() {
        return this == DNF || this == AB;
    }

    public boolean didNotStart() {
        return this == DNS;
    }

    public boolean wasDisqualified() {
        return this == DSQ || this == DQ;
    }

    public boolean isTimeRelated() {
        return this == OTL || this == HD;
    }

    public boolean countsForClassification() {
        return isFinisher() && this != PENDING;
    }

    public boolean receivesPoints() {
        return this == FINISHED;
    }

    public boolean receivesTimeBonus() {
        return this == FINISHED;
    }

    public boolean canBePromoted() {
        return this == RELEGATED || this == PENDING;
    }

    public boolean requiresInvestigation() {
        return this == PENDING || this == RELEGATED || this == DQ;
    }

    public boolean affectsTeamClassification() {
        return isFinisher() || this == OTL || this == HD;
    }

    public boolean canAppeal() {
        return wasDisqualified() || this == RELEGATED || this == OTL;
    }

    public boolean showsInResults() {
        return this != PENDING || isFinisher();
    }

    public String getDisplayCode() {
        switch (this) {
            case FINISHED:
                return "";
            case DNF:
                return "DNF";
            case DNS:
                return "DNS";
            case DSQ:
            case DQ:
                return "DSQ";
            case OTL:
                return "OTL";
            case HD:
                return "HD";
            case AB:
                return "AB";
            case NP:
                return "NP";
            case RELEGATED:
                return "REL";
            case PENDING:
                return "PND";
            default:
                return "UNK";
        }
    }

    public int getSortingPriority() {
        switch (this) {
            case FINISHED:
                return 1;
            case RELEGATED:
                return 2;
            case PENDING:
                return 3;
            case OTL:
            case HD:
                return 4;
            case DNF:
            case AB:
                return 5;
            case DSQ:
            case DQ:
                return 6;
            case NP:
                return 7;
            case DNS:
                return 8;
            default:
                return 9;
        }
    }
}