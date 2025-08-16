import { riderService } from './riderService';
import { raceService } from './raceService';

export { apiClient } from './api';
export { riderService, RiderService } from './riderService';
export { raceService, RaceService } from './raceService';

export const services = {
  rider: riderService,
  race: raceService,
};