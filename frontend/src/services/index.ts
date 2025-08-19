import { riderService } from './riderService';
import { raceService } from './raceService';
import { teamService } from './teamService';

export { apiClient } from './api';
export { riderService, RiderService } from './riderService';
export { raceService, RaceService } from './raceService';
export { teamService } from './teamService';

export const services = {
  rider: riderService,
  race: raceService,
  team: teamService,
};