import axios from 'axios';
import { apiClient } from './api';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('API Client', () => {
  beforeEach(() => {
    mockedAxios.create.mockReturnThis();
    mockedAxios.interceptors = {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates axios instance with correct configuration', () => {
    expect(mockedAxios.create).toHaveBeenCalledWith({
      baseURL: '/api/v1',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  it('sets up request and response interceptors', () => {
    expect(mockedAxios.interceptors.request.use).toHaveBeenCalled();
    expect(mockedAxios.interceptors.response.use).toHaveBeenCalled();
  });

  describe('HTTP Methods', () => {
    beforeEach(() => {
      mockedAxios.get = jest.fn().mockResolvedValue({ data: 'test' });
      mockedAxios.post = jest.fn().mockResolvedValue({ data: 'test' });
      mockedAxios.put = jest.fn().mockResolvedValue({ data: 'test' });
      mockedAxios.patch = jest.fn().mockResolvedValue({ data: 'test' });
      mockedAxios.delete = jest.fn().mockResolvedValue({ data: 'test' });
    });

    it('makes GET requests correctly', async () => {
      const result = await apiClient.get('/test', { param: 'value' });
      
      expect(mockedAxios.get).toHaveBeenCalledWith('/test', { params: { param: 'value' } });
      expect(result).toBe('test');
    });

    it('makes POST requests correctly', async () => {
      const data = { test: 'data' };
      const result = await apiClient.post('/test', data);
      
      expect(mockedAxios.post).toHaveBeenCalledWith('/test', data);
      expect(result).toBe('test');
    });

    it('makes PUT requests correctly', async () => {
      const data = { test: 'data' };
      const result = await apiClient.put('/test', data);
      
      expect(mockedAxios.put).toHaveBeenCalledWith('/test', data);
      expect(result).toBe('test');
    });

    it('makes PATCH requests correctly', async () => {
      const data = { test: 'data' };
      const result = await apiClient.patch('/test', data);
      
      expect(mockedAxios.patch).toHaveBeenCalledWith('/test', data);
      expect(result).toBe('test');
    });

    it('makes DELETE requests correctly', async () => {
      const result = await apiClient.delete('/test');
      
      expect(mockedAxios.delete).toHaveBeenCalledWith('/test');
      expect(result).toBe('test');
    });
  });

  describe('Error Handling', () => {
    it('transforms axios errors to API errors', async () => {
      const axiosError = {
        response: {
          data: { message: 'Server Error' },
          status: 500,
        },
        config: { url: '/test' },
        message: 'Network Error',
      };

      mockedAxios.get = jest.fn().mockRejectedValue(axiosError);

      await expect(apiClient.get('/test')).rejects.toEqual({
        message: 'Server Error',
        status: 500,
        timestamp: expect.any(String),
        path: '/test',
      });
    });

    it('handles errors without response', async () => {
      const axiosError = {
        message: 'Network Error',
        config: { url: '/test' },
      };

      mockedAxios.get = jest.fn().mockRejectedValue(axiosError);

      await expect(apiClient.get('/test')).rejects.toEqual({
        message: 'Network Error',
        status: 0,
        timestamp: expect.any(String),
        path: '/test',
      });
    });
  });
});