import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Rider, Race, RiderSpecialization, RaceType, RaceCategory, RaceStatus } from '../types';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <ThemeProvider theme={theme}>
      {children}
    </ThemeProvider>
  );
};

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: AllTheProviders, ...options });

export * from '@testing-library/react';
export { customRender as render };

// Mock data factories
export const createMockRider = (overrides: Partial<Rider> = {}): Rider => ({
  id: 1,
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  team: 'Team Alpha',
  nationality: 'USA',
  dateOfBirth: '1990-01-01',
  specialization: RiderSpecialization.ALL_ROUNDER,
  ftpWatts: 300,
  heightCm: 180,
  weightKg: 75,
  active: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  version: 1,
  ...overrides
});

export const createMockRace = (overrides: Partial<Race> = {}): Race => ({
  id: 1,
  name: 'Test Race',
  description: 'A test cycling race',
  raceDate: '2024-12-31',
  startTime: '09:00:00',
  location: 'Test City',
  country: 'Test Country',
  raceType: RaceType.ROAD_RACE,
  category: RaceCategory.PROFESSIONAL,
  distanceKm: 100,
  elevationGainM: 1000,
  maxParticipants: 100,
  entryFee: 50.00,
  prizeMoney: 10000.00,
  status: RaceStatus.PLANNED,
  registrationOpen: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  version: 1,
  ...overrides
});

export const createMockRiders = (count: number = 5): Rider[] => {
  return Array.from({ length: count }, (_, index) => 
    createMockRider({
      id: index + 1,
      firstName: `Rider${index + 1}`,
      lastName: `Last${index + 1}`,
      email: `rider${index + 1}@example.com`,
      ftpWatts: 250 + (index * 50),
      specialization: Object.values(RiderSpecialization)[index % Object.values(RiderSpecialization).length]
    })
  );
};

export const createMockRaces = (count: number = 3): Race[] => {
  return Array.from({ length: count }, (_, index) => 
    createMockRace({
      id: index + 1,
      name: `Race ${index + 1}`,
      raceDate: `2024-0${(index % 9) + 1}-01`,
      distanceKm: 80 + (index * 20)
    })
  );
};