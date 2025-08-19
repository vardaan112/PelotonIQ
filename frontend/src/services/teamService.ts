import { apiClient } from './api';

export interface Team {
  id: number;
  name: string;
  code?: string;
  description?: string;
  country: string;
  foundedYear?: number;
  manager?: string;
  director?: string;
  category: 'WORLD_TOUR' | 'PRO_TEAM' | 'CONTINENTAL' | 'NATIONAL' | 'CLUB';
  annualBudget?: number;
  maxRosterSize: number;
  website?: string;
  email?: string;
  active: boolean;
  riders: any[];
  memberships: any[];
  participatedRaces: any[];
  createdAt: string;
  updatedAt: string;
  version: number;
  currentRiderCount: number;
  yearsActive: number;
  professional: boolean;
}

export interface TeamApiResponse {
  content: Team[];
  pageable: {
    sort: {
      empty: boolean;
      unsorted: boolean;
      sorted: boolean;
    };
    offset: number;
    pageNumber: number;
    pageSize: number;
    paged: boolean;
    unpaged: boolean;
  };
  last: boolean;
  totalPages: number;
  totalElements: number;
  number: number;
  first: boolean;
  size: number;
  numberOfElements: number;
  sort: {
    empty: boolean;
    unsorted: boolean;
    sorted: boolean;
  };
  empty: boolean;
}

export interface TeamQueryParams {
  page?: number;
  size?: number;
  sort?: string;
  category?: string;
  active?: boolean;
}

class TeamService {
  async getAllTeams(params: TeamQueryParams = {}): Promise<TeamApiResponse> {
    const queryParams = {
      page: params.page || 0,
      size: params.size || 50,
      sort: params.sort || 'name,asc',
      ...(params.category && { category: params.category }),
      ...(params.active !== undefined && { active: params.active })
    };

    return apiClient.get<TeamApiResponse>('/teams', queryParams);
  }

  async getTeamById(id: number): Promise<Team> {
    return apiClient.get<Team>(`/teams/${id}`);
  }

  async getWorldTourTeams(): Promise<TeamApiResponse> {
    return this.getAllTeams({ category: 'WORLD_TOUR', size: 50 });
  }

  async getProTeams(): Promise<TeamApiResponse> {
    return this.getAllTeams({ category: 'PRO_TEAM', size: 50 });
  }

  async getActiveTeams(): Promise<TeamApiResponse> {
    return this.getAllTeams({ active: true, size: 100 });
  }

  async searchTeams(searchTerm: string): Promise<TeamApiResponse> {
    return apiClient.get<TeamApiResponse>('/teams/search', { q: searchTerm });
  }

  async createTeam(team: Partial<Team>): Promise<Team> {
    return apiClient.post<Team>('/teams', team);
  }

  async updateTeam(id: number, team: Partial<Team>): Promise<Team> {
    return apiClient.put<Team>(`/teams/${id}`, team);
  }

  async deleteTeam(id: number): Promise<void> {
    return apiClient.delete<void>(`/teams/${id}`);
  }
}

export const teamService = new TeamService();