export enum RaceType {
  ROAD_RACE = 'ROAD_RACE',
  TIME_TRIAL = 'TIME_TRIAL',
  CRITERIUM = 'CRITERIUM',
  MOUNTAIN_STAGE = 'MOUNTAIN_STAGE',
  SPRINT_STAGE = 'SPRINT_STAGE',
  HILL_CLIMB = 'HILL_CLIMB',
  GRAN_FONDO = 'GRAN_FONDO',
  CYCLOCROSS = 'CYCLOCROSS',
  TRACK_RACE = 'TRACK_RACE',
  ONE_DAY_CLASSIC = 'ONE_DAY_CLASSIC'
}

export enum RaceCategory {
  AMATEUR = 'AMATEUR',
  PROFESSIONAL = 'PROFESSIONAL',
  YOUTH = 'YOUTH',
  MASTERS = 'MASTERS',
  WOMENS = 'WOMENS',
  MIXED = 'MIXED'
}

export enum RaceStatus {
  PLANNED = 'PLANNED',
  REGISTRATION_OPEN = 'REGISTRATION_OPEN',
  REGISTRATION_CLOSED = 'REGISTRATION_CLOSED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  POSTPONED = 'POSTPONED'
}

export interface Race {
  id: number;
  name: string;
  description: string;
  raceDate: string;
  startTime: string;
  location: string;
  country: string;
  raceType: RaceType;
  category: RaceCategory;
  distanceKm: number;
  elevationGainM: number;
  maxParticipants: number;
  entryFee: number;
  prizeMoney: number;
  status: RaceStatus;
  weatherForecast?: string;
  temperatureCelsius?: number;
  registrationOpen: boolean;
  registrationDeadline?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface RaceFormData {
  name: string;
  description: string;
  raceDate: string;
  startTime: string;
  location: string;
  country: string;
  raceType: RaceType;
  category: RaceCategory;
  distanceKm: number;
  elevationGainM?: number;
  maxParticipants?: number;
  entryFee?: number;
  prizeMoney?: number;
  weatherForecast?: string;
  temperatureCelsius?: number;
  registrationOpen: boolean;
  registrationDeadline?: string;
}

export interface RaceFilters {
  raceType?: RaceType;
  category?: RaceCategory;
  status?: RaceStatus;
  location?: string;
  country?: string;
  dateFrom?: string;
  dateTo?: string;
  registrationOpen?: boolean;
}