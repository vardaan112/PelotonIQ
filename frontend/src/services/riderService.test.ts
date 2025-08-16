import { riderService } from './riderService';
import { apiClient } from './api';
import { RiderSpecialization } from '../types';
import { createMockRiders } from '../utils/testUtils';

// Mock the API client
jest.mock('./api');
const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('RiderService', () => {
  const mockRiders = createMockRiders(3);
  const mockPaginatedResponse = {
    content: mockRiders,
    totalElements: mockRiders.length,
    totalPages: 1,
    size: 20,
    number: 0,
    first: true,
    last: true,
    numberOfElements: mockRiders.length,
    empty: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllRiders', () => {
    it('fetches all riders with pagination parameters', async () => {
      mockApiClient.get.mockResolvedValue(mockPaginatedResponse);

      const params = { page: 0, size: 20, sortBy: 'lastName', sortDir: 'asc' as const };
      const result = await riderService.getAllRiders(params);

      expect(mockApiClient.get).toHaveBeenCalledWith('/riders', params);
      expect(result).toEqual(mockPaginatedResponse);
    });

    it('handles search parameters correctly', async () => {
      mockApiClient.get.mockResolvedValue(mockPaginatedResponse);

      const params = { 
        name: 'John',
        team: 'Team Alpha',
        specialization: RiderSpecialization.SPRINTER,
        active: true
      };
      await riderService.getAllRiders(params);

      expect(mockApiClient.get).toHaveBeenCalledWith('/riders', params);
    });
  });

  describe('getRiderById', () => {
    it('fetches rider by ID', async () => {
      const mockRider = mockRiders[0];
      mockApiClient.get.mockResolvedValue(mockRider);

      const result = await riderService.getRiderById(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/riders/1');
      expect(result).toEqual(mockRider);
    });
  });

  describe('getRiderByEmail', () => {
    it('fetches rider by email', async () => {
      const mockRider = mockRiders[0];
      mockApiClient.get.mockResolvedValue(mockRider);

      const result = await riderService.getRiderByEmail('test@example.com');

      expect(mockApiClient.get).toHaveBeenCalledWith('/riders/email/test@example.com');
      expect(result).toEqual(mockRider);
    });
  });

  describe('getActiveRiders', () => {
    it('fetches active riders', async () => {
      mockApiClient.get.mockResolvedValue(mockPaginatedResponse);

      const params = { page: 0, size: 10 };
      const result = await riderService.getActiveRiders(params);

      expect(mockApiClient.get).toHaveBeenCalledWith('/riders/active', params);
      expect(result).toEqual(mockPaginatedResponse);
    });
  });

  describe('getRidersByTeam', () => {
    it('fetches riders by team', async () => {
      mockApiClient.get.mockResolvedValue(mockPaginatedResponse);

      const params = { page: 0, size: 20 };
      const result = await riderService.getRidersByTeam('Team Alpha', params);

      expect(mockApiClient.get).toHaveBeenCalledWith('/riders/team/Team Alpha', params);
      expect(result).toEqual(mockPaginatedResponse);
    });
  });

  describe('getRidersBySpecialization', () => {
    it('fetches riders by specialization', async () => {
      mockApiClient.get.mockResolvedValue(mockPaginatedResponse);

      const params = { page: 0, size: 20 };
      const result = await riderService.getRidersBySpecialization(RiderSpecialization.SPRINTER, params);

      expect(mockApiClient.get).toHaveBeenCalledWith('/riders/specialization/SPRINTER', params);
      expect(result).toEqual(mockPaginatedResponse);
    });
  });

  describe('searchRidersByName', () => {
    it('searches riders by name', async () => {
      mockApiClient.get.mockResolvedValue(mockRiders);

      const result = await riderService.searchRidersByName('John');

      expect(mockApiClient.get).toHaveBeenCalledWith('/riders/search', { name: 'John' });
      expect(result).toEqual(mockRiders);
    });
  });

  describe('getTopRidersByFtp', () => {
    it('fetches top riders by FTP', async () => {
      mockApiClient.get.mockResolvedValue(mockRiders);

      const result = await riderService.getTopRidersByFtp(5);

      expect(mockApiClient.get).toHaveBeenCalledWith('/riders/top-ftp', { limit: 5 });
      expect(result).toEqual(mockRiders);
    });

    it('uses default limit when not provided', async () => {
      mockApiClient.get.mockResolvedValue(mockRiders);

      await riderService.getTopRidersByFtp();

      expect(mockApiClient.get).toHaveBeenCalledWith('/riders/top-ftp', { limit: 10 });
    });
  });

  describe('createRider', () => {
    it('creates a new rider', async () => {
      const newRider = mockRiders[0];
      const riderData = {
        firstName: newRider.firstName,
        lastName: newRider.lastName,
        email: newRider.email,
        team: newRider.team,
        nationality: newRider.nationality,
        dateOfBirth: newRider.dateOfBirth,
        specialization: newRider.specialization,
        ftpWatts: newRider.ftpWatts,
        heightCm: newRider.heightCm,
        weightKg: newRider.weightKg,
        active: newRider.active,
      };

      mockApiClient.post.mockResolvedValue(newRider);

      const result = await riderService.createRider(riderData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/riders', riderData);
      expect(result).toEqual(newRider);
    });
  });

  describe('updateRider', () => {
    it('updates an existing rider', async () => {
      const updatedRider = mockRiders[0];
      const riderData = {
        firstName: updatedRider.firstName,
        lastName: updatedRider.lastName,
        email: updatedRider.email,
        team: updatedRider.team,
        nationality: updatedRider.nationality,
        dateOfBirth: updatedRider.dateOfBirth,
        specialization: updatedRider.specialization,
        ftpWatts: updatedRider.ftpWatts,
        heightCm: updatedRider.heightCm,
        weightKg: updatedRider.weightKg,
        active: updatedRider.active,
      };

      mockApiClient.put.mockResolvedValue(updatedRider);

      const result = await riderService.updateRider(1, riderData);

      expect(mockApiClient.put).toHaveBeenCalledWith('/riders/1', riderData);
      expect(result).toEqual(updatedRider);
    });
  });

  describe('deleteRider', () => {
    it('deletes a rider', async () => {
      mockApiClient.delete.mockResolvedValue(undefined);

      await riderService.deleteRider(1);

      expect(mockApiClient.delete).toHaveBeenCalledWith('/riders/1');
    });
  });

  describe('activateRider', () => {
    it('activates a rider', async () => {
      const activatedRider = { ...mockRiders[0], active: true };
      mockApiClient.patch.mockResolvedValue(activatedRider);

      const result = await riderService.activateRider(1);

      expect(mockApiClient.patch).toHaveBeenCalledWith('/riders/1/activate');
      expect(result).toEqual(activatedRider);
    });
  });

  describe('deactivateRider', () => {
    it('deactivates a rider', async () => {
      const deactivatedRider = { ...mockRiders[0], active: false };
      mockApiClient.patch.mockResolvedValue(deactivatedRider);

      const result = await riderService.deactivateRider(1);

      expect(mockApiClient.patch).toHaveBeenCalledWith('/riders/1/deactivate');
      expect(result).toEqual(deactivatedRider);
    });
  });

  describe('checkEmailExists', () => {
    it('checks if email exists', async () => {
      mockApiClient.get.mockResolvedValue(true);

      const result = await riderService.checkEmailExists('test@example.com');

      expect(mockApiClient.get).toHaveBeenCalledWith('/riders/check-email', { email: 'test@example.com' });
      expect(result).toBe(true);
    });
  });
});