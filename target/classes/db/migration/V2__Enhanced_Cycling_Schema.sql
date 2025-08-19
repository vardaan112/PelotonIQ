-- Enhanced PelotonIQ Database Schema Migration
-- This migration extends the existing riders and races tables with comprehensive cycling data model

-- Create Teams table
CREATE TABLE teams (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(20) UNIQUE,
    description VARCHAR(1000),
    country VARCHAR(50) NOT NULL,
    founded_year INTEGER,
    manager VARCHAR(100),
    director VARCHAR(100),
    category VARCHAR(50) NOT NULL DEFAULT 'CONTINENTAL',
    annual_budget DECIMAL(10,2) CHECK (annual_budget >= 0 AND annual_budget <= 50000000),
    max_roster_size INTEGER DEFAULT 30 CHECK (max_roster_size >= 8 AND max_roster_size <= 50),
    website VARCHAR(500),
    email VARCHAR(100),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT DEFAULT 0,
    
    -- Constraints
    CONSTRAINT chk_team_founded_year CHECK (founded_year IS NULL OR (founded_year >= 1800 AND founded_year <= EXTRACT(YEAR FROM CURRENT_DATE))),
    CONSTRAINT chk_team_email_format CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_team_category CHECK (category IN ('WORLD_TOUR', 'PRO_TEAM', 'CONTINENTAL', 'NATIONAL', 'DEVELOPMENT', 'AMATEUR', 'CLUB'))
);

-- Create indexes for teams
CREATE INDEX idx_team_name ON teams(name);
CREATE INDEX idx_team_country ON teams(country);
CREATE INDEX idx_team_category ON teams(category);
CREATE INDEX idx_team_active ON teams(active);

-- Create Team Memberships table for historical rider-team relationships
CREATE TABLE team_memberships (
    id BIGSERIAL PRIMARY KEY,
    rider_id BIGINT NOT NULL,
    team_id BIGINT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    role VARCHAR(50) NOT NULL DEFAULT 'RIDER',
    annual_salary DECIMAL(10,2) CHECK (annual_salary IS NULL OR (annual_salary >= 0 AND annual_salary <= 10000000)),
    jersey_number INTEGER CHECK (jersey_number IS NULL OR (jersey_number >= 1 AND jersey_number <= 999)),
    is_captain BOOLEAN NOT NULL DEFAULT false,
    notes VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    CONSTRAINT fk_membership_rider FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE,
    CONSTRAINT fk_membership_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    
    -- Business logic constraints
    CONSTRAINT chk_membership_dates CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT chk_membership_role CHECK (role IN ('RIDER', 'TEAM_LEADER', 'SPRINTER_LEAD', 'CLIMBER_LEAD', 'DOMESTIQUE', 'CAPTAIN', 'RESERVE', 'TRAINEE', 'COACH', 'DIRECTOR', 'MECHANIC', 'SOIGNEUR', 'DOCTOR', 'MANAGER')),
    
    -- Unique constraint to prevent overlapping memberships for same rider/team
    CONSTRAINT uk_membership_rider_team_start UNIQUE (rider_id, team_id, start_date)
);

-- Create indexes for team memberships
CREATE INDEX idx_membership_rider ON team_memberships(rider_id);
CREATE INDEX idx_membership_team ON team_memberships(team_id);
CREATE INDEX idx_membership_dates ON team_memberships(start_date, end_date);
CREATE INDEX idx_membership_active ON team_memberships(rider_id, end_date);

-- Create Stages table for multi-stage races
CREATE TABLE stages (
    id BIGSERIAL PRIMARY KEY,
    race_id BIGINT NOT NULL,
    stage_number INTEGER NOT NULL CHECK (stage_number >= 1 AND stage_number <= 50),
    name VARCHAR(200) NOT NULL,
    description VARCHAR(1000),
    stage_date DATE NOT NULL,
    start_time TIME NOT NULL,
    start_location VARCHAR(100) NOT NULL,
    finish_location VARCHAR(100) NOT NULL,
    stage_type VARCHAR(50) NOT NULL,
    distance_km DECIMAL(5,2) CHECK (distance_km IS NULL OR (distance_km >= 0.1 AND distance_km <= 400)),
    elevation_gain_m INTEGER CHECK (elevation_gain_m IS NULL OR (elevation_gain_m >= 0 AND elevation_gain_m <= 15000)),
    start_elevation_m INTEGER CHECK (start_elevation_m IS NULL OR (start_elevation_m >= 0 AND start_elevation_m <= 9000)),
    finish_elevation_m INTEGER CHECK (finish_elevation_m IS NULL OR (finish_elevation_m >= 0 AND finish_elevation_m <= 9000)),
    max_gradient_percent INTEGER CHECK (max_gradient_percent IS NULL OR (max_gradient_percent >= 0 AND max_gradient_percent <= 35)),
    expected_avg_speed_kmh DECIMAL(4,2) CHECK (expected_avg_speed_kmh IS NULL OR (expected_avg_speed_kmh >= 0 AND expected_avg_speed_kmh <= 80)),
    time_limit_minutes INTEGER CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
    status VARCHAR(50) NOT NULL DEFAULT 'PLANNED',
    weather_forecast VARCHAR(500),
    temperature_celsius INTEGER CHECK (temperature_celsius IS NULL OR (temperature_celsius >= -50 AND temperature_celsius <= 60)),
    wind_speed_kmh INTEGER CHECK (wind_speed_kmh IS NULL OR (wind_speed_kmh >= 0 AND wind_speed_kmh <= 200)),
    neutralized_start BOOLEAN NOT NULL DEFAULT false,
    team_time_trial BOOLEAN NOT NULL DEFAULT false,
    stage_winner_points INTEGER DEFAULT 50 CHECK (stage_winner_points >= 0),
    points_available INTEGER DEFAULT 100 CHECK (points_available >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT DEFAULT 0,
    
    -- Foreign key constraints
    CONSTRAINT fk_stage_race FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE CASCADE,
    
    -- Business logic constraints
    CONSTRAINT chk_stage_type CHECK (stage_type IN ('FLAT_STAGE', 'ROLLING_STAGE', 'HILL_FINISH', 'MOUNTAIN_STAGE', 'SUMMIT_FINISH', 'INDIVIDUAL_TIME_TRIAL', 'TEAM_TIME_TRIAL', 'PROLOGUE', 'CRITERIUM', 'COBBLESTONE_STAGE', 'GRAVEL_STAGE', 'MIXED_TERRAIN')),
    CONSTRAINT chk_stage_status CHECK (status IN ('PLANNED', 'READY', 'NEUTRALIZED', 'RACING', 'FINISHED', 'CANCELLED', 'POSTPONED', 'ABANDONED', 'NEUTRALIZED_FINISH')),
    
    -- Unique constraint for race/stage number combination
    CONSTRAINT uk_stage_race_number UNIQUE (race_id, stage_number)
);

-- Create indexes for stages
CREATE INDEX idx_stage_race ON stages(race_id);
CREATE INDEX idx_stage_number ON stages(race_id, stage_number);
CREATE INDEX idx_stage_date ON stages(stage_date);
CREATE INDEX idx_stage_type ON stages(stage_type);

-- Create Stage Results table for individual stage performance
CREATE TABLE stage_results (
    id BIGSERIAL PRIMARY KEY,
    stage_id BIGINT NOT NULL,
    rider_id BIGINT NOT NULL,
    position INTEGER CHECK (position IS NULL OR (position >= 1 AND position <= 1000)),
    finish_time_seconds BIGINT CHECK (finish_time_seconds IS NULL OR finish_time_seconds >= 0),
    time_behind_seconds BIGINT CHECK (time_behind_seconds IS NULL OR time_behind_seconds >= 0),
    points INTEGER DEFAULT 0 CHECK (points >= 0 AND points <= 1000),
    bonus_seconds INTEGER DEFAULT 0 CHECK (bonus_seconds >= 0 AND bonus_seconds <= 300),
    penalty_seconds INTEGER DEFAULT 0 CHECK (penalty_seconds >= 0 AND penalty_seconds <= 3600),
    status VARCHAR(50) NOT NULL DEFAULT 'FINISHED',
    status_reason VARCHAR(500),
    
    -- Performance metrics
    average_speed_kmh DECIMAL(4,2) CHECK (average_speed_kmh IS NULL OR (average_speed_kmh >= 0 AND average_speed_kmh <= 80)),
    average_power_watts DECIMAL(5,1) CHECK (average_power_watts IS NULL OR (average_power_watts >= 0 AND average_power_watts <= 1000)),
    max_power_watts DECIMAL(5,1) CHECK (max_power_watts IS NULL OR (max_power_watts >= 0 AND max_power_watts <= 2000)),
    average_heart_rate INTEGER CHECK (average_heart_rate IS NULL OR (average_heart_rate >= 30 AND average_heart_rate <= 250)),
    max_heart_rate INTEGER CHECK (max_heart_rate IS NULL OR (max_heart_rate >= 30 AND max_heart_rate <= 250)),
    average_cadence INTEGER CHECK (average_cadence IS NULL OR (average_cadence >= 30 AND average_cadence <= 150)),
    energy_expenditure_kj DECIMAL(6,1) CHECK (energy_expenditure_kj IS NULL OR (energy_expenditure_kj >= 0 AND energy_expenditure_kj <= 10000)),
    
    start_time TIMESTAMP,
    finish_time TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    CONSTRAINT fk_stage_result_stage FOREIGN KEY (stage_id) REFERENCES stages(id) ON DELETE CASCADE,
    CONSTRAINT fk_stage_result_rider FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE,
    
    -- Business logic constraints
    CONSTRAINT chk_result_status CHECK (status IN ('FINISHED', 'DNF', 'DNS', 'DSQ', 'OTL', 'HD', 'AB', 'NP', 'DQ', 'RELEGATED', 'PENDING')),
    CONSTRAINT chk_result_times CHECK (finish_time IS NULL OR start_time IS NULL OR finish_time >= start_time),
    
    -- Unique constraint for stage/rider combination
    CONSTRAINT uk_stage_result_stage_rider UNIQUE (stage_id, rider_id)
);

-- Create indexes for stage results
CREATE INDEX idx_stage_result_stage ON stage_results(stage_id);
CREATE INDEX idx_stage_result_rider ON stage_results(rider_id);
CREATE INDEX idx_stage_result_position ON stage_results(stage_id, position);
CREATE INDEX idx_stage_result_time ON stage_results(stage_id, finish_time_seconds);
CREATE INDEX idx_stage_result_status ON stage_results(status);

-- Create Stage Classifications table for various race standings
CREATE TABLE stage_classifications (
    id BIGSERIAL PRIMARY KEY,
    stage_id BIGINT NOT NULL,
    rider_id BIGINT NOT NULL,
    classification_type VARCHAR(50) NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 1 AND position <= 1000),
    points INTEGER DEFAULT 0 CHECK (points >= 0 AND points <= 1000),
    cumulative_points INTEGER DEFAULT 0 CHECK (cumulative_points >= 0),
    cumulative_time_seconds BIGINT CHECK (cumulative_time_seconds IS NULL OR cumulative_time_seconds >= 0),
    time_behind_leader_seconds BIGINT CHECK (time_behind_leader_seconds IS NULL OR time_behind_leader_seconds >= 0),
    jersey_awarded BOOLEAN NOT NULL DEFAULT false,
    notes VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    CONSTRAINT fk_classification_stage FOREIGN KEY (stage_id) REFERENCES stages(id) ON DELETE CASCADE,
    CONSTRAINT fk_classification_rider FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE,
    
    -- Business logic constraints
    CONSTRAINT chk_classification_type CHECK (classification_type IN ('GENERAL_CLASSIFICATION', 'POINTS_CLASSIFICATION', 'MOUNTAINS_CLASSIFICATION', 'YOUTH_CLASSIFICATION', 'TEAM_CLASSIFICATION', 'STAGE_WINNER', 'INTERMEDIATE_SPRINT', 'MOUNTAIN_SPRINT', 'COMBATIVITY', 'LANTERNE_ROUGE')),
    
    -- Unique constraint for stage/rider/classification combination
    CONSTRAINT uk_classification_stage_rider_type UNIQUE (stage_id, rider_id, classification_type)
);

-- Create indexes for stage classifications
CREATE INDEX idx_classification_stage ON stage_classifications(stage_id);
CREATE INDEX idx_classification_rider ON stage_classifications(rider_id);
CREATE INDEX idx_classification_type ON stage_classifications(classification_type);
CREATE INDEX idx_classification_position ON stage_classifications(stage_id, classification_type, position);

-- Create Team Race Participation junction table
CREATE TABLE team_race_participation (
    team_id BIGINT NOT NULL,
    race_id BIGINT NOT NULL,
    
    -- Foreign key constraints
    CONSTRAINT fk_participation_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    CONSTRAINT fk_participation_race FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE CASCADE,
    
    -- Primary key
    PRIMARY KEY (team_id, race_id)
);

-- Create indexes for team race participation
CREATE INDEX idx_participation_team ON team_race_participation(team_id);
CREATE INDEX idx_participation_race ON team_race_participation(race_id);

-- Add current_team_id to riders table to link to current team
ALTER TABLE riders ADD COLUMN current_team_id BIGINT;
ALTER TABLE riders ADD CONSTRAINT fk_rider_current_team FOREIGN KEY (current_team_id) REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX idx_rider_current_team ON riders(current_team_id);

-- Update races table to support multi-stage races
ALTER TABLE races ADD COLUMN is_multi_stage BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE races ADD COLUMN total_stages INTEGER CHECK (total_stages IS NULL OR (total_stages >= 1 AND total_stages <= 50));
ALTER TABLE races ADD COLUMN overall_distance_km DECIMAL(6,2) CHECK (overall_distance_km IS NULL OR overall_distance_km >= 0);
ALTER TABLE races ADD COLUMN overall_elevation_gain_m INTEGER CHECK (overall_elevation_gain_m IS NULL OR overall_elevation_gain_m >= 0);

-- Create triggers to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stages_updated_at BEFORE UPDATE ON stages 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to check team membership overlap
CREATE OR REPLACE FUNCTION check_team_membership_overlap()
RETURNS TRIGGER AS $$
BEGIN
    -- Check for overlapping memberships for the same rider
    IF EXISTS (
        SELECT 1 FROM team_memberships tm
        WHERE tm.rider_id = NEW.rider_id 
        AND tm.id != COALESCE(NEW.id, -1)
        AND (
            (NEW.start_date BETWEEN tm.start_date AND COALESCE(tm.end_date, '9999-12-31')) OR
            (COALESCE(NEW.end_date, '9999-12-31') BETWEEN tm.start_date AND COALESCE(tm.end_date, '9999-12-31')) OR
            (NEW.start_date <= tm.start_date AND COALESCE(NEW.end_date, '9999-12-31') >= COALESCE(tm.end_date, '9999-12-31'))
        )
    ) THEN
        RAISE EXCEPTION 'Team membership dates overlap with existing membership for rider %', NEW.rider_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_membership_overlap BEFORE INSERT OR UPDATE ON team_memberships
    FOR EACH ROW EXECUTE FUNCTION check_team_membership_overlap();

-- Create function to automatically update rider's current team
CREATE OR REPLACE FUNCTION update_rider_current_team()
RETURNS TRIGGER AS $$
BEGIN
    -- Update current team for the rider if this is the most recent active membership
    IF NEW.end_date IS NULL OR NEW.end_date > CURRENT_DATE THEN
        UPDATE riders 
        SET current_team_id = NEW.team_id 
        WHERE id = NEW.rider_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_current_team AFTER INSERT OR UPDATE ON team_memberships
    FOR EACH ROW EXECUTE FUNCTION update_rider_current_team();

-- Insert sample teams to work with existing data
INSERT INTO teams (name, code, country, category, founded_year, manager, director, max_roster_size, active) VALUES
('Team Sky', 'SKY', 'United Kingdom', 'WORLD_TOUR', 2010, 'Dave Brailsford', 'Nicolas Portal', 30, true),
('Quick-Step Alpha Vinyl', 'QST', 'Belgium', 'WORLD_TOUR', 2003, 'Patrick Lefevere', 'Tom Steels', 30, true),
('Jumbo-Visma', 'TJV', 'Netherlands', 'WORLD_TOUR', 2006, 'Richard Plugge', 'Merijn Zeeman', 30, true),
('UAE Team Emirates', 'UAE', 'United Arab Emirates', 'WORLD_TOUR', 2017, 'Mauro Gianetti', 'Joxean Fernandez', 30, true),
('INEOS Grenadiers', 'INE', 'United Kingdom', 'WORLD_TOUR', 2010, 'Dave Brailsford', 'Rod Ellingworth', 30, true),
('Alpecin-Deceuninck', 'ADC', 'Belgium', 'PRO_TEAM', 2009, 'Christoph Roodhooft', 'Christoph Roodhooft', 28, true),
('Movistar Team', 'MOV', 'Spain', 'WORLD_TOUR', 1980, 'Eusebio Unzue', 'Patxi Vila', 30, true),
('Astana Qazaqstan Team', 'AST', 'Kazakhstan', 'WORLD_TOUR', 2007, 'Alexandre Vinokourov', 'Giuseppe Martinelli', 30, true);

-- Create basic database views for common queries
CREATE VIEW rider_current_teams AS
SELECT 
    r.id as rider_id,
    r.first_name,
    r.last_name,
    r.email,
    r.nationality,
    r.specialization,
    r.active as rider_active,
    t.id as team_id,
    t.name as team_name,
    t.code as team_code,
    t.country as team_country,
    t.category as team_category
FROM riders r
LEFT JOIN teams t ON r.current_team_id = t.id;

CREATE VIEW race_stage_summary AS
SELECT 
    r.id as race_id,
    r.name as race_name,
    r.race_date,
    r.location,
    r.country,
    r.race_type,
    r.status as race_status,
    COUNT(s.id) as total_stages,
    SUM(s.distance_km) as total_distance_km,
    SUM(s.elevation_gain_m) as total_elevation_gain_m
FROM races r
LEFT JOIN stages s ON r.id = s.race_id
GROUP BY r.id, r.name, r.race_date, r.location, r.country, r.race_type, r.status;

CREATE VIEW team_rider_count AS
SELECT 
    t.id as team_id,
    t.name as team_name,
    t.country,
    t.category,
    COUNT(r.id) as active_rider_count,
    t.max_roster_size,
    (t.max_roster_size - COUNT(r.id)) as available_spots
FROM teams t
LEFT JOIN riders r ON t.id = r.current_team_id AND r.active = true
WHERE t.active = true
GROUP BY t.id, t.name, t.country, t.category, t.max_roster_size;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pelotoniq_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO pelotoniq_user;

-- Add comments for documentation
COMMENT ON TABLE teams IS 'Professional cycling teams with roster and management information';
COMMENT ON TABLE team_memberships IS 'Historical record of rider team memberships with dates and roles';
COMMENT ON TABLE stages IS 'Individual stages within multi-stage races';
COMMENT ON TABLE stage_results IS 'Performance results for riders in individual stages';
COMMENT ON TABLE stage_classifications IS 'Classification standings (GC, points, mountains, etc.) after each stage';
COMMENT ON TABLE team_race_participation IS 'Junction table tracking team participation in races';

COMMENT ON VIEW rider_current_teams IS 'Current team assignments for all riders';
COMMENT ON VIEW race_stage_summary IS 'Summary statistics for races including stage counts and totals';
COMMENT ON VIEW team_rider_count IS 'Team roster counts and available capacity';