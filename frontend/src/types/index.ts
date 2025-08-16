export * from './rider';
export * from './race';
export * from './api';

export interface DashboardState {
  selectedRiders: number[];
  selectedRaces: number[];
  activeTab: string;
}

export interface ChartData {
  name: string;
  value: number;
  category?: string;
  specialization?: string;
}

export interface PerformanceMetrics {
  riderId: number;
  riderName: string;
  ftpWatts: number;
  powerToWeightRatio: number;
  specialization: string;
  team: string;
  age: number;
}

export interface TeamComposition {
  teamName: string;
  riders: PerformanceMetrics[];
  averageFtp: number;
  totalMembers: number;
  specializationDistribution: Record<string, number>;
}