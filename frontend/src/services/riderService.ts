import { apiClient } from './api';
import { 
  Rider, 
  RiderFormData, 
  PaginatedResponse, 
  RiderSearchParams,
  RiderSpecialization 
} from '../types';

export class RiderService {
  
  async getAllRiders(params: RiderSearchParams = {}): Promise<PaginatedResponse<Rider>> {
    return apiClient.get<PaginatedResponse<Rider>>('/riders', params);
  }

  async getRiderById(id: number): Promise<Rider> {
    return apiClient.get<Rider>(`/riders/${id}`);
  }

  async getRiderByEmail(email: string): Promise<Rider> {
    return apiClient.get<Rider>(`/riders/email/${email}`);
  }

  async getActiveRiders(params: { page?: number; size?: number } = {}): Promise<PaginatedResponse<Rider>> {
    return apiClient.get<PaginatedResponse<Rider>>('/riders/active', params);
  }

  async getInactiveRiders(): Promise<Rider[]> {
    return apiClient.get<Rider[]>('/riders/inactive');
  }

  async getRidersByTeam(team: string, params: { page?: number; size?: number } = {}): Promise<PaginatedResponse<Rider>> {
    return apiClient.get<PaginatedResponse<Rider>>(`/riders/team/${team}`, params);
  }

  async getRidersByNationality(nationality: string, params: { page?: number; size?: number } = {}): Promise<PaginatedResponse<Rider>> {
    return apiClient.get<PaginatedResponse<Rider>>(`/riders/nationality/${nationality}`, params);
  }

  async getRidersBySpecialization(specialization: RiderSpecialization, params: { page?: number; size?: number } = {}): Promise<PaginatedResponse<Rider>> {
    return apiClient.get<PaginatedResponse<Rider>>(`/riders/specialization/${specialization}`, params);
  }

  async searchRidersByName(name: string): Promise<Rider[]> {
    return apiClient.get<Rider[]>('/riders/search', { name });
  }

  async getRidersByAgeRange(minAge: number, maxAge: number): Promise<Rider[]> {
    return apiClient.get<Rider[]>('/riders/age-range', { minAge, maxAge });
  }

  async getRidersByBirthDateRange(startDate: string, endDate: string): Promise<Rider[]> {
    return apiClient.get<Rider[]>('/riders/birth-date-range', { startDate, endDate });
  }

  async getRidersByMinFtp(minFtp: number): Promise<Rider[]> {
    return apiClient.get<Rider[]>(`/riders/ftp/min/${minFtp}`);
  }

  async getRidersByMinPowerToWeightRatio(minRatio: number): Promise<Rider[]> {
    return apiClient.get<Rider[]>(`/riders/power-weight-ratio/min/${minRatio}`);
  }

  async getRidersByHeightRange(minHeight: number, maxHeight: number): Promise<Rider[]> {
    return apiClient.get<Rider[]>('/riders/height-range', { minHeight, maxHeight });
  }

  async getRidersByWeightRange(minWeight: number, maxWeight: number): Promise<Rider[]> {
    return apiClient.get<Rider[]>('/riders/weight-range', { minWeight, maxWeight });
  }

  async getTopRidersByFtp(limit: number = 10): Promise<Rider[]> {
    return apiClient.get<Rider[]>('/riders/top-ftp', { limit });
  }

  async getTopRidersByPowerToWeightRatio(limit: number = 10): Promise<Rider[]> {
    return apiClient.get<Rider[]>('/riders/top-power-weight-ratio', { limit });
  }

  async getActiveRiderCountByTeam(team: string): Promise<number> {
    return apiClient.get<number>(`/riders/stats/team/${team}/count`);
  }

  async getActiveRiderCountByNationality(nationality: string): Promise<number> {
    return apiClient.get<number>(`/riders/stats/nationality/${nationality}/count`);
  }

  async getAverageFtpByTeam(team: string): Promise<number> {
    return apiClient.get<number>(`/riders/stats/team/${team}/average-ftp`);
  }

  async getAverageAgeByTeam(team: string): Promise<number> {
    return apiClient.get<number>(`/riders/stats/team/${team}/average-age`);
  }

  async createRider(rider: RiderFormData): Promise<Rider> {
    return apiClient.post<Rider>('/riders', rider);
  }

  async updateRider(id: number, rider: RiderFormData): Promise<Rider> {
    return apiClient.put<Rider>(`/riders/${id}`, rider);
  }

  async activateRider(id: number): Promise<Rider> {
    return apiClient.patch<Rider>(`/riders/${id}/activate`);
  }

  async deactivateRider(id: number): Promise<Rider> {
    return apiClient.patch<Rider>(`/riders/${id}/deactivate`);
  }

  async deleteRider(id: number): Promise<void> {
    return apiClient.delete<void>(`/riders/${id}`);
  }

  async checkEmailExists(email: string): Promise<boolean> {
    return apiClient.get<boolean>('/riders/check-email', { email });
  }
}

export const riderService = new RiderService();