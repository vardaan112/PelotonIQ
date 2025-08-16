export enum RiderSpecialization {
  SPRINTER = 'SPRINTER',
  CLIMBER = 'CLIMBER', 
  TIME_TRIALIST = 'TIME_TRIALIST',
  ALL_ROUNDER = 'ALL_ROUNDER',
  DOMESTIQUE = 'DOMESTIQUE',
  CLASSICS_SPECIALIST = 'CLASSICS_SPECIALIST',
  BREAKAWAY_SPECIALIST = 'BREAKAWAY_SPECIALIST',
  PUNCHEUR = 'PUNCHEUR'
}

export interface Rider {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  team: string;
  nationality: string;
  dateOfBirth: string;
  specialization: RiderSpecialization;
  ftpWatts: number;
  heightCm: number;
  weightKg: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface RiderFormData {
  firstName: string;
  lastName: string;
  email: string;
  team: string;
  nationality: string;
  dateOfBirth: string;
  specialization: RiderSpecialization;
  ftpWatts: number;
  heightCm: number;
  weightKg: number;
  active: boolean;
}

export interface RiderFilters {
  team?: string;
  nationality?: string;
  specialization?: RiderSpecialization;
  active?: boolean;
  minFtp?: number;
  maxFtp?: number;
  minAge?: number;
  maxAge?: number;
  search?: string;
}