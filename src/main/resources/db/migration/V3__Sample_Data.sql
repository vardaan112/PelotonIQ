-- Sample Data for PelotonIQ Enhanced Schema
-- This provides realistic cycling data for development and testing

-- Insert sample riders with realistic cycling data
INSERT INTO riders (first_name, last_name, email, date_of_birth, nationality, team, specialization, height_cm, weight_kg, ftp_watts, active) VALUES
-- Team Sky / INEOS riders
('Chris', 'Froome', 'chris.froome@sky.com', '1985-05-20', 'United Kingdom', 'Team Sky', 'ALL_ROUNDER', 186, 66, 415, true),
('Geraint', 'Thomas', 'geraint.thomas@sky.com', '1986-05-25', 'United Kingdom', 'Team Sky', 'ALL_ROUNDER', 183, 67, 400, true),
('Egan', 'Bernal', 'egan.bernal@ineos.com', '1997-01-13', 'Colombia', 'INEOS Grenadiers', 'CLIMBER', 175, 60, 380, true),

-- Jumbo-Visma riders
('Primoz', 'Roglic', 'primoz.roglic@jumbo.com', '1989-10-29', 'Slovenia', 'Jumbo-Visma', 'ALL_ROUNDER', 177, 65, 425, true),
('Jonas', 'Vingegaard', 'jonas.vingegaard@jumbo.com', '1996-12-10', 'Denmark', 'Jumbo-Visma', 'CLIMBER', 175, 60, 395, true),
('Wout', 'van Aert', 'wout.vanaert@jumbo.com', '1994-09-15', 'Belgium', 'Jumbo-Visma', 'CLASSICS_SPECIALIST', 190, 78, 450, true),

-- Quick-Step riders
('Remco', 'Evenepoel', 'remco.evenepoel@quickstep.com', '2000-01-25', 'Belgium', 'Quick-Step Alpha Vinyl', 'ALL_ROUNDER', 171, 61, 390, true),
('Julian', 'Alaphilippe', 'julian.alaphilippe@quickstep.com', '1992-06-11', 'France', 'Quick-Step Alpha Vinyl', 'PUNCHEUR', 173, 62, 385, true),
('Mark', 'Cavendish', 'mark.cavendish@quickstep.com', '1985-05-21', 'United Kingdom', 'Quick-Step Alpha Vinyl', 'SPRINTER', 175, 70, 380, true),

-- UAE Team Emirates riders
('Tadej', 'Pogacar', 'tadej.pogacar@uae.com', '1998-09-21', 'Slovenia', 'UAE Team Emirates', 'ALL_ROUNDER', 176, 66, 420, true),
('Juan', 'Ayuso', 'juan.ayuso@uae.com', '2002-09-16', 'Spain', 'UAE Team Emirates', 'CLIMBER', 177, 63, 370, true),

-- Alpecin-Deceuninck riders
('Mathieu', 'van der Poel', 'mathieu.vanderpoel@alpecin.com', '1995-01-19', 'Netherlands', 'Alpecin-Deceuninck', 'CLASSICS_SPECIALIST', 184, 75, 460, true),
('Jasper', 'Philipsen', 'jasper.philipsen@alpecin.com', '1998-03-02', 'Belgium', 'Alpecin-Deceuninck', 'SPRINTER', 173, 67, 395, true),

-- Movistar riders
('Enric', 'Mas', 'enric.mas@movistar.com', '1995-01-07', 'Spain', 'Movistar Team', 'CLIMBER', 175, 64, 385, true),
('Alejandro', 'Valverde', 'alejandro.valverde@movistar.com', '1980-04-25', 'Spain', 'Movistar Team', 'ALL_ROUNDER', 173, 61, 390, true),

-- Astana riders
('Alexey', 'Lutsenko', 'alexey.lutsenko@astana.com', '1992-09-17', 'Kazakhstan', 'Astana Qazaqstan Team', 'ALL_ROUNDER', 180, 68, 400, true),
('Miguel Angel', 'Lopez', 'miguel.lopez@astana.com', '1994-02-04', 'Colombia', 'Astana Qazaqstan Team', 'CLIMBER', 169, 58, 375, true),

-- Additional riders for variety
('Peter', 'Sagan', 'peter.sagan@team.com', '1990-01-26', 'Slovakia', 'Team Sky', 'CLASSICS_SPECIALIST', 184, 73, 410, true),
('Caleb', 'Ewan', 'caleb.ewan@team.com', '1994-07-11', 'Australia', 'Quick-Step Alpha Vinyl', 'SPRINTER', 165, 67, 385, true),
('Dylan', 'Groenewegen', 'dylan.groenewegen@team.com', '1993-06-21', 'Netherlands', 'Jumbo-Visma', 'SPRINTER', 180, 69, 395, true),
('Tony', 'Martin', 'tony.martin@team.com', '1985-04-23', 'Germany', 'Jumbo-Visma', 'TIME_TRIALIST', 186, 75, 420, true),
('Nairo', 'Quintana', 'nairo.quintana@team.com', '1990-02-04', 'Colombia', 'Movistar Team', 'CLIMBER', 167, 58, 380, true),
('Warren', 'Barguil', 'warren.barguil@team.com', '1991-10-28', 'France', 'Team Sky', 'CLIMBER', 181, 65, 375, true);

-- Update riders to link them to their teams
UPDATE riders SET current_team_id = (SELECT id FROM teams WHERE name = 'Team Sky') 
WHERE team = 'Team Sky';

UPDATE riders SET current_team_id = (SELECT id FROM teams WHERE name = 'INEOS Grenadiers') 
WHERE team = 'INEOS Grenadiers';

UPDATE riders SET current_team_id = (SELECT id FROM teams WHERE name = 'Jumbo-Visma') 
WHERE team = 'Jumbo-Visma';

UPDATE riders SET current_team_id = (SELECT id FROM teams WHERE name = 'Quick-Step Alpha Vinyl') 
WHERE team = 'Quick-Step Alpha Vinyl';

UPDATE riders SET current_team_id = (SELECT id FROM teams WHERE name = 'UAE Team Emirates') 
WHERE team = 'UAE Team Emirates';

UPDATE riders SET current_team_id = (SELECT id FROM teams WHERE name = 'Alpecin-Deceuninck') 
WHERE team = 'Alpecin-Deceuninck';

UPDATE riders SET current_team_id = (SELECT id FROM teams WHERE name = 'Movistar Team') 
WHERE team = 'Movistar Team';

UPDATE riders SET current_team_id = (SELECT id FROM teams WHERE name = 'Astana Qazaqstan Team') 
WHERE team = 'Astana Qazaqstan Team';

-- Insert team memberships for current riders
INSERT INTO team_memberships (rider_id, team_id, start_date, role, is_captain, jersey_number)
SELECT 
    r.id,
    r.current_team_id,
    CURRENT_DATE - INTERVAL '1 year',
    CASE 
        WHEN r.first_name IN ('Chris', 'Geraint', 'Primoz', 'Tadej', 'Mathieu', 'Remco') THEN 'TEAM_LEADER'
        WHEN r.specialization = 'SPRINTER' THEN 'SPRINTER_LEAD'
        WHEN r.specialization = 'CLIMBER' THEN 'CLIMBER_LEAD'
        ELSE 'RIDER'
    END,
    r.first_name IN ('Chris', 'Geraint', 'Primoz', 'Tadej', 'Mathieu', 'Remco'),
    (ROW_NUMBER() OVER (PARTITION BY r.current_team_id ORDER BY r.id)) + 1
FROM riders r 
WHERE r.current_team_id IS NOT NULL;

-- Insert sample races including multi-stage events
INSERT INTO races (name, description, race_date, start_time, location, country, race_type, category, 
                  distance_km, elevation_gain_m, max_participants, entry_fee, prize_money, status, 
                  registration_open, is_multi_stage, total_stages, overall_distance_km, overall_elevation_gain_m) VALUES

-- Grand Tours
('Tour de France 2024', 'The most prestigious cycling race in the world, covering 21 stages across France', 
 '2024-07-06', '12:00:00', 'Nice', 'France', 'ROAD_RACE', 'WORLD_TOUR', 
 NULL, NULL, 176, 0, 2500000, 'PLANNED', true, true, 21, 3492.8, 52230),

('Giro d''Italia 2024', 'The first Grand Tour of the season, showcasing Italy''s diverse terrain', 
 '2024-05-04', '13:30:00', 'Torino', 'Italy', 'ROAD_RACE', 'WORLD_TOUR', 
 NULL, NULL, 176, 0, 1800000, 'PLANNED', true, true, 21, 3447.6, 51300),

('Vuelta a España 2024', 'The final Grand Tour, known for its challenging mountain stages', 
 '2024-08-17', '15:00:00', 'Lisbon', 'Portugal', 'ROAD_RACE', 'WORLD_TOUR', 
 NULL, NULL, 176, 0, 1500000, 'PLANNED', true, true, 21, 3364.0, 59500),

-- One-day classics
('Paris-Roubaix 2024', 'The Hell of the North - cobblestone classic', 
 '2024-04-14', '11:30:00', 'Compiègne', 'France', 'ONE_DAY_CLASSIC', 'WORLD_TOUR', 
 257.2, 760, 200, 50, 120000, 'PLANNED', true, false, NULL, NULL, NULL),

('Tour of Flanders 2024', 'Monument of cycling through Belgian hills and cobbles', 
 '2024-03-31', '10:15:00', 'Antwerp', 'Belgium', 'ONE_DAY_CLASSIC', 'WORLD_TOUR', 
 273.9, 2440, 200, 50, 120000, 'PLANNED', true, false, NULL, NULL, NULL),

('Milan-San Remo 2024', 'La Primavera - the longest one-day race', 
 '2024-03-23', '10:00:00', 'Milan', 'Italy', 'ONE_DAY_CLASSIC', 'WORLD_TOUR', 
 293.0, 2703, 200, 50, 120000, 'PLANNED', true, false, NULL, NULL, NULL),

-- Stage races
('Paris-Nice 2024', 'Race to the Sun - early season stage race', 
 '2024-03-10', '13:00:00', 'Mantes-la-Ville', 'France', 'ROAD_RACE', 'WORLD_TOUR', 
 NULL, NULL, 140, 25, 300000, 'PLANNED', true, true, 8, 1067.8, 8420),

('Tirreno-Adriatico 2024', 'Race of the Two Seas across Italy', 
 '2024-03-04', '12:30:00', 'Lido di Camaiore', 'Italy', 'ROAD_RACE', 'WORLD_TOUR', 
 NULL, NULL, 140, 25, 250000, 'PLANNED', true, true, 7, 1178.5, 7890),

-- Time trials
('World Championships ITT 2024', 'Individual Time Trial World Championship', 
 '2024-09-22', '14:00:00', 'Zurich', 'Switzerland', 'TIME_TRIAL', 'WORLD_TOUR', 
 46.1, 890, 60, 100, 50000, 'PLANNED', true, false, NULL, NULL, NULL),

-- Criteriums and local races
('Tour de Criterium 2024', 'Fast-paced criterium racing', 
 '2024-07-20', '19:00:00', 'Brussels', 'Belgium', 'CRITERIUM', 'PROFESSIONAL', 
 1.8, 25, 80, 20, 15000, 'PLANNED', true, false, NULL, NULL, NULL);

-- Insert sample stages for Tour de France 2024
INSERT INTO stages (race_id, stage_number, name, description, stage_date, start_time, start_location, finish_location,
                   stage_type, distance_km, elevation_gain_m, expected_avg_speed_kmh, stage_winner_points, points_available) 
SELECT r.id, stage_num, stage_name, stage_desc, stage_date, start_time, start_loc, finish_loc, 
       stage_type, distance, elevation, avg_speed, 50, 100
FROM races r,
(VALUES 
    (1, 'Nice > Nice', 'Individual Time Trial opening stage', '2024-07-06', '14:00:00', 'Nice', 'Nice', 'INDIVIDUAL_TIME_TRIAL', 33.0, 860, 48.5),
    (2, 'Nice > Nice', 'Hilly stage around Nice', '2024-07-07', '13:15:00', 'Nice', 'Nice', 'HILL_FINISH', 199.2, 3100, 42.8),
    (3, 'Nice > Sisteron', 'Rolling stage through Provence', '2024-07-08', '13:30:00', 'Nice', 'Sisteron', 'ROLLING_STAGE', 188.6, 2650, 44.2),
    (4, 'Sisteron > Barcelonnette', 'Mountain stage in the Alps', '2024-07-09', '12:45:00', 'Sisteron', 'Barcelonnette', 'MOUNTAIN_STAGE', 181.8, 3200, 39.5),
    (5, 'Gap > Privas', 'Long transitional stage', '2024-07-10', '11:30:00', 'Gap', 'Privas', 'FLAT_STAGE', 218.5, 1850, 46.8),
    (21, 'Monaco > Nice', 'Final time trial', '2024-07-28', '15:30:00', 'Monaco', 'Nice', 'INDIVIDUAL_TIME_TRIAL', 34.4, 650, 49.2)
) AS stage_data(stage_num, stage_name, stage_desc, stage_date, start_time, start_loc, finish_loc, stage_type, distance, elevation, avg_speed)
WHERE r.name = 'Tour de France 2024';

-- Insert sample stages for Giro d'Italia 2024
INSERT INTO stages (race_id, stage_number, name, description, stage_date, start_time, start_location, finish_location,
                   stage_type, distance_km, elevation_gain_m, expected_avg_speed_kmh, stage_winner_points, points_available)
SELECT r.id, stage_num, stage_name, stage_desc, stage_date, start_time, start_loc, finish_loc, 
       stage_type, distance, elevation, avg_speed, 50, 100
FROM races r,
(VALUES 
    (1, 'Torino > Torino', 'Opening time trial', '2024-05-04', '14:30:00', 'Torino', 'Torino', 'INDIVIDUAL_TIME_TRIAL', 9.6, 180, 51.2),
    (2, 'Alba > Sestrières', 'First mountain test', '2024-05-05', '12:15:00', 'Alba', 'Sestrières', 'SUMMIT_FINISH', 152.5, 3400, 38.9),
    (3, 'Fossano > Canelli', 'Sprint stage through Piedmont', '2024-05-06', '13:00:00', 'Fossano', 'Canelli', 'FLAT_STAGE', 166.0, 1200, 47.5),
    (20, 'Palazzolo > Monte Grappa', 'Queen mountain stage', '2024-05-25', '11:45:00', 'Palazzolo', 'Monte Grappa', 'SUMMIT_FINISH', 184.6, 4850, 36.2),
    (21, 'Verona > Verona', 'Final time trial', '2024-05-26', '15:00:00', 'Verona', 'Verona', 'INDIVIDUAL_TIME_TRIAL', 17.4, 220, 49.8)
) AS stage_data(stage_num, stage_name, stage_desc, stage_date, start_time, start_loc, finish_loc, stage_type, distance, elevation, avg_speed)
WHERE r.name = 'Giro d''Italia 2024';

-- Link teams to races they're participating in
INSERT INTO team_race_participation (team_id, race_id)
SELECT t.id, r.id
FROM teams t
CROSS JOIN races r
WHERE t.category IN ('WORLD_TOUR', 'PRO_TEAM') 
AND r.category = 'WORLD_TOUR'
AND t.active = true;

-- Insert sample stage results for completed fictional races
-- We'll create a smaller completed race for demonstration
INSERT INTO races (name, description, race_date, start_time, location, country, race_type, category, 
                  distance_km, elevation_gain_m, max_participants, entry_fee, prize_money, status, 
                  registration_open, is_multi_stage, total_stages) VALUES
('Tour of California 2023', 'Completed stage race for demo purposes', 
 '2023-05-15', '12:00:00', 'Sacramento', 'United States', 'ROAD_RACE', 'PRO_SERIES', 
 NULL, NULL, 120, 50, 200000, 'FINISHED', false, true, 5);

-- Insert stages for the completed race
INSERT INTO stages (race_id, stage_number, name, stage_date, start_time, start_location, finish_location,
                   stage_type, distance_km, elevation_gain_m, status, stage_winner_points)
SELECT r.id, stage_num, stage_name, stage_date, '13:00:00', start_loc, finish_loc, 
       stage_type, distance, elevation, 'FINISHED', 50
FROM races r,
(VALUES 
    (1, 'Sacramento Prologue', '2023-05-15', 'Sacramento', 'Sacramento', 'PROLOGUE', 8.2, 45),
    (2, 'Stage 1: Modesto - San Jose', '2023-05-16', 'Modesto', 'San Jose', 'FLAT_STAGE', 186.4, 890),
    (3, 'Stage 2: San Jose - Monterey', '2023-05-17', 'San Jose', 'Monterey', 'ROLLING_STAGE', 151.2, 1650),
    (4, 'Stage 3: Monterey - Big Sur', '2023-05-18', 'Monterey', 'Big Sur', 'HILL_FINISH', 142.8, 2340),
    (5, 'Stage 4: Santa Barbara ITT', '2023-05-19', 'Santa Barbara', 'Santa Barbara', 'INDIVIDUAL_TIME_TRIAL', 26.1, 420)
) AS stage_data(stage_num, stage_name, stage_date, start_loc, finish_loc, stage_type, distance, elevation)
WHERE r.name = 'Tour of California 2023';

-- Insert sample stage results
INSERT INTO stage_results (stage_id, rider_id, position, finish_time_seconds, time_behind_seconds, points, 
                          average_speed_kmh, average_power_watts, average_heart_rate, status)
SELECT s.id, r.id, 
       ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY RANDOM()), 
       CASE 
           WHEN s.stage_type = 'PROLOGUE' THEN 600 + (ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY RANDOM()) - 1) * 3
           WHEN s.stage_type = 'INDIVIDUAL_TIME_TRIAL' THEN 1920 + (ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY RANDOM()) - 1) * 8
           ELSE 14400 + (ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY RANDOM()) - 1) * 15
       END,
       CASE 
           WHEN ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY RANDOM()) = 1 THEN 0
           ELSE (ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY RANDOM()) - 1) * 5
       END,
       CASE 
           WHEN ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY RANDOM()) <= 10 THEN 21 - ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY RANDOM())
           ELSE 0
       END,
       42.5 + RANDOM() * 8,
       280 + RANDOM() * 120,
       150 + RANDOM() * 25,
       'FINISHED'
FROM stages s
JOIN races race ON s.race_id = race.id
CROSS JOIN (SELECT id FROM riders ORDER BY RANDOM() LIMIT 15) r
WHERE race.name = 'Tour of California 2023';

-- Insert sample classifications
INSERT INTO stage_classifications (stage_id, rider_id, classification_type, position, points, cumulative_points,
                                 cumulative_time_seconds, time_behind_leader_seconds, jersey_awarded)
SELECT DISTINCT ON (s.id, sr.rider_id, ct.classification_type) 
       s.id, sr.rider_id, ct.classification_type,
       ROW_NUMBER() OVER (PARTITION BY s.id, ct.classification_type ORDER BY 
           CASE 
               WHEN ct.classification_type IN ('GENERAL_CLASSIFICATION', 'YOUTH_CLASSIFICATION') THEN sr.finish_time_seconds
               ELSE sr.points DESC
           END),
       CASE 
           WHEN ct.classification_type IN ('POINTS_CLASSIFICATION', 'MOUNTAINS_CLASSIFICATION') THEN sr.points
           ELSE 0
       END,
       CASE 
           WHEN ct.classification_type IN ('POINTS_CLASSIFICATION', 'MOUNTAINS_CLASSIFICATION') THEN sr.points * s.stage_number
           ELSE 0
       END,
       CASE 
           WHEN ct.classification_type IN ('GENERAL_CLASSIFICATION', 'YOUTH_CLASSIFICATION') THEN sr.finish_time_seconds * s.stage_number
           ELSE NULL
       END,
       sr.time_behind_seconds,
       false
FROM stages s
JOIN stage_results sr ON s.id = sr.stage_id
CROSS JOIN (VALUES ('GENERAL_CLASSIFICATION'), ('POINTS_CLASSIFICATION'), ('MOUNTAINS_CLASSIFICATION')) AS ct(classification_type)
JOIN races race ON s.race_id = race.id
WHERE race.name = 'Tour of California 2023';

-- Update jersey awarded for leaders
UPDATE stage_classifications 
SET jersey_awarded = true 
WHERE position = 1 AND classification_type IN ('GENERAL_CLASSIFICATION', 'POINTS_CLASSIFICATION', 'MOUNTAINS_CLASSIFICATION');

-- Add some realistic constraints and business logic
UPDATE riders SET team = 
    CASE 
        WHEN current_team_id IS NOT NULL THEN (SELECT name FROM teams WHERE id = current_team_id)
        ELSE team
    END;

-- Ensure FTP values are realistic for specializations
UPDATE riders SET ftp_watts = 
    CASE specialization
        WHEN 'SPRINTER' THEN ftp_watts + 20
        WHEN 'TIME_TRIALIST' THEN ftp_watts + 35
        WHEN 'CLIMBER' THEN GREATEST(ftp_watts - 15, 350)
        WHEN 'DOMESTIQUE' THEN GREATEST(ftp_watts - 10, 340)
        ELSE ftp_watts
    END;