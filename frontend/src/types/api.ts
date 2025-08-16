export interface ApiResponse<T> {
  data: T;
  status: number;
  statusText: string;
}

export interface PaginatedResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
  numberOfElements: number;
  empty: boolean;
}

export interface PaginationParams {
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface ApiError {
  message: string;
  status: number;
  timestamp: string;
  path: string;
}

export interface TeamStats {
  name: string;
  activeRiderCount: number;
  averageFtp: number;
  averageAge: number;
}

export interface RiderSearchParams extends PaginationParams {
  name?: string;
  team?: string;
  nationality?: string;
  specialization?: string;
  active?: boolean;
  minFtp?: number;
  minAge?: number;
  maxAge?: number;
  minHeight?: number;
  maxHeight?: number;
  minWeight?: number;
  maxWeight?: number;
}