import { apiClient } from './api';
import { 
  Race, 
  RaceFormData, 
  PaginatedResponse, 
  RaceType,
  RaceCategory,
  RaceStatus
} from '../types';

export class RaceService {
  
  async getAllRaces(params: { 
    page?: number; 
    size?: number; 
    sortBy?: string; 
    sortDir?: 'asc' | 'desc' 
  } = {}): Promise<PaginatedResponse<Race>> {
    return apiClient.get<PaginatedResponse<Race>>('/races', params);
  }

  async getRaceById(id: number): Promise<Race> {
    return apiClient.get<Race>(`/races/${id}`);
  }

  async getRacesByType(raceType: RaceType, params: { page?: number; size?: number } = {}): Promise<PaginatedResponse<Race>> {
    return apiClient.get<PaginatedResponse<Race>>(`/races/type/${raceType}`, params);
  }

  async getRacesByCategory(category: RaceCategory, params: { page?: number; size?: number } = {}): Promise<PaginatedResponse<Race>> {
    return apiClient.get<PaginatedResponse<Race>>(`/races/category/${category}`, params);
  }

  async getRacesByStatus(status: RaceStatus, params: { page?: number; size?: number } = {}): Promise<PaginatedResponse<Race>> {
    return apiClient.get<PaginatedResponse<Race>>(`/races/status/${status}`, params);
  }

  async getRacesByLocation(location: string, params: { page?: number; size?: number } = {}): Promise<PaginatedResponse<Race>> {
    return apiClient.get<PaginatedResponse<Race>>(`/races/location/${location}`, params);
  }

  async getRacesByCountry(country: string, params: { page?: number; size?: number } = {}): Promise<PaginatedResponse<Race>> {
    return apiClient.get<PaginatedResponse<Race>>(`/races/country/${country}`, params);
  }

  async getRacesByDateRange(startDate: string, endDate: string): Promise<Race[]> {
    return apiClient.get<Race[]>('/races/date-range', { startDate, endDate });
  }

  async getUpcomingRaces(limit: number = 10): Promise<Race[]> {
    return apiClient.get<Race[]>('/races/upcoming', { limit });
  }

  async getRacesWithOpenRegistration(): Promise<Race[]> {
    return apiClient.get<Race[]>('/races/registration-open');
  }

  async searchRacesByName(name: string): Promise<Race[]> {
    return apiClient.get<Race[]>('/races/search', { name });
  }

  async getRacesByDistanceRange(minDistance: number, maxDistance: number): Promise<Race[]> {
    return apiClient.get<Race[]>('/races/distance-range', { minDistance, maxDistance });
  }

  async getRacesByElevationRange(minElevation: number, maxElevation: number): Promise<Race[]> {
    return apiClient.get<Race[]>('/races/elevation-range', { minElevation, maxElevation });
  }

  async getRacesByEntryFeeRange(minFee: number, maxFee: number): Promise<Race[]> {
    return apiClient.get<Race[]>('/races/entry-fee-range', { minFee, maxFee });
  }

  async createRace(race: RaceFormData): Promise<Race> {
    return apiClient.post<Race>('/races', race);
  }

  async updateRace(id: number, race: RaceFormData): Promise<Race> {
    return apiClient.put<Race>(`/races/${id}`, race);
  }

  async updateRaceStatus(id: number, status: RaceStatus): Promise<Race> {
    return apiClient.patch<Race>(`/races/${id}/status`, { status });
  }

  async openRegistration(id: number): Promise<Race> {
    return apiClient.patch<Race>(`/races/${id}/open-registration`);
  }

  async closeRegistration(id: number): Promise<Race> {
    return apiClient.patch<Race>(`/races/${id}/close-registration`);
  }

  async deleteRace(id: number): Promise<void> {
    return apiClient.delete<void>(`/races/${id}`);
  }

  async registerRiderForRace(raceId: number, riderId: number): Promise<void> {
    return apiClient.post<void>(`/races/${raceId}/register/${riderId}`);
  }

  async unregisterRiderFromRace(raceId: number, riderId: number): Promise<void> {
    return apiClient.delete<void>(`/races/${raceId}/unregister/${riderId}`);
  }

  async getRaceParticipants(raceId: number): Promise<any[]> {
    return apiClient.get<any[]>(`/races/${raceId}/participants`);
  }
}

export const raceService = new RaceService();