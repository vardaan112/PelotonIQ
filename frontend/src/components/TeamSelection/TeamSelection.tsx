import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Avatar,
  Alert,
  LinearProgress
} from '@mui/material';
import {
  Person,
  Flag,
  Groups,
  Speed,
  Assignment
} from '@mui/icons-material';
import { Rider, Race, RaceStatus } from '../../types';
import { riderService, raceService } from '../../services';

interface TeamSelectionProps {
  onSelectionChange?: (riders: Rider[], races: Race[]) => void;
  maxRiders?: number;
  maxRaces?: number;
}

export const TeamSelection: React.FC<TeamSelectionProps> = ({
  onSelectionChange,
  maxRiders = 10,
  maxRaces = 5
}) => {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRiders, setSelectedRiders] = useState<Rider[]>([]);
  const [selectedRaces, setSelectedRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    onSelectionChange?.(selectedRiders, selectedRaces);
  }, [selectedRiders, selectedRaces, onSelectionChange]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ridersResponse, racesResponse] = await Promise.all([
        riderService.getActiveRiders({ size: 200 }),
        raceService.getAllRaces({ size: 100 })
      ]);

      setRiders(ridersResponse.content);
      
      // Filter races to show only upcoming and in-progress races
      const relevantRaces = racesResponse.content.filter(race => 
        race.status === RaceStatus.PLANNED || 
        race.status === RaceStatus.REGISTRATION_OPEN ||
        race.status === RaceStatus.IN_PROGRESS
      );
      setRaces(relevantRaces);

      // Extract unique teams
      const uniqueTeams = Array.from(new Set(ridersResponse.content.map(rider => rider.team))).sort();
      setTeams(uniqueTeams);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const addRider = (riderId: number) => {
    const rider = riders.find(r => r.id === riderId);
    if (rider && !selectedRiders.find(r => r.id === riderId) && selectedRiders.length < maxRiders) {
      setSelectedRiders([...selectedRiders, rider]);
    }
  };

  const removeRider = (riderId: number) => {
    setSelectedRiders(selectedRiders.filter(r => r.id !== riderId));
  };

  const addRace = (raceId: number) => {
    const race = races.find(r => r.id === raceId);
    if (race && !selectedRaces.find(r => r.id === raceId) && selectedRaces.length < maxRaces) {
      setSelectedRaces([...selectedRaces, race]);
    }
  };

  const removeRace = (raceId: number) => {
    setSelectedRaces(selectedRaces.filter(r => r.id !== raceId));
  };

  const getAvailableRiders = () => {
    let availableRiders = riders.filter(rider => 
      !selectedRiders.find(sr => sr.id === rider.id)
    );

    if (teamFilter) {
      availableRiders = availableRiders.filter(rider => rider.team === teamFilter);
    }

    return availableRiders;
  };

  const getAvailableRaces = () => {
    return races.filter(race => 
      !selectedRaces.find(sr => sr.id === race.id)
    );
  };

  const calculateAge = (dateOfBirth: string): number => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const getTeamStats = () => {
    if (selectedRiders.length === 0) return null;

    const avgFtp = Math.round(selectedRiders.reduce((sum, rider) => sum + rider.ftpWatts, 0) / selectedRiders.length);
    const avgAge = Math.round(selectedRiders.reduce((sum, rider) => sum + calculateAge(rider.dateOfBirth), 0) / selectedRiders.length);
    
    const specializations: Record<string, number> = {};
    selectedRiders.forEach(rider => {
      const spec = rider.specialization.replace(/_/g, ' ');
      specializations[spec] = (specializations[spec] || 0) + 1;
    });

    return { avgFtp, avgAge, specializations };
  };

  const clearSelections = () => {
    setSelectedRiders([]);
    setSelectedRaces([]);
  };

  if (loading) {
    return (
      <Box>
        <LinearProgress />
        <Typography align="center" sx={{ mt: 2 }}>Loading selection data...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
    );
  }

  const teamStats = getTeamStats();

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Team & Race Selection
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Select riders and races for your cycling team management dashboard.
        </Typography>
        
        <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip 
            label={`${selectedRiders.length}/${maxRiders} Riders`} 
            color={selectedRiders.length > 0 ? 'primary' : 'default'} 
          />
          <Chip 
            label={`${selectedRaces.length}/${maxRaces} Races`} 
            color={selectedRaces.length > 0 ? 'primary' : 'default'} 
          />
          <Button 
            size="small" 
            onClick={clearSelections}
            disabled={selectedRiders.length === 0 && selectedRaces.length === 0}
          >
            Clear All
          </Button>
        </Box>
      </Paper>

      <Grid container spacing={3}>
        {/* Rider Selection */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              <Person sx={{ mr: 1, verticalAlign: 'middle' }} />
              Select Riders
            </Typography>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Filter by Team</InputLabel>
              <Select
                value={teamFilter}
                label="Filter by Team"
                onChange={(e) => setTeamFilter(e.target.value)}
              >
                <MenuItem value="">All Teams</MenuItem>
                {teams.map((team) => (
                  <MenuItem key={team} value={team}>
                    {team}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Add Rider</InputLabel>
              <Select
                value=""
                label="Add Rider"
                onChange={(e) => addRider(Number(e.target.value))}
                disabled={selectedRiders.length >= maxRiders}
              >
                {getAvailableRiders().map((rider) => (
                  <MenuItem key={rider.id} value={rider.id}>
                    {rider.firstName} {rider.lastName} - {rider.team} ({rider.ftpWatts}W)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedRiders.length === 0 ? (
              <Alert severity="info">No riders selected</Alert>
            ) : (
              <List>
                {selectedRiders.map((rider) => (
                  <ListItem 
                    key={rider.id}
                    sx={{ 
                      border: '1px solid #e0e0e0', 
                      borderRadius: 1, 
                      mb: 1,
                      bgcolor: 'background.paper'
                    }}
                  >
                    <ListItemIcon>
                      <Avatar sx={{ bgcolor: 'primary.main' }}>
                        <Person />
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText
                      primary={`${rider.firstName} ${rider.lastName}`}
                      secondary={
                        <Box>
                          <Typography variant="caption" display="block">
                            {rider.team} • {rider.specialization.replace(/_/g, ' ')}
                          </Typography>
                          <Typography variant="caption" display="block">
                            FTP: {rider.ftpWatts}W • Age: {calculateAge(rider.dateOfBirth)}
                          </Typography>
                        </Box>
                      }
                    />
                    <Button
                      size="small"
                      color="error"
                      onClick={() => removeRider(rider.id)}
                    >
                      Remove
                    </Button>
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>

          {/* Team Statistics */}
          {teamStats && (
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                <Groups sx={{ mr: 1, verticalAlign: 'middle' }} />
                Team Statistics
              </Typography>
              
              <Grid container spacing={2}>
                <Grid size={6}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Average FTP</Typography>
                    <Typography variant="h6" color="primary">{teamStats.avgFtp}W</Typography>
                  </Box>
                </Grid>
                <Grid size={6}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Average Age</Typography>
                    <Typography variant="h6">{teamStats.avgAge} years</Typography>
                  </Box>
                </Grid>
              </Grid>

              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Specializations
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {Object.entries(teamStats.specializations).map(([spec, count]) => (
                    <Chip 
                      key={spec} 
                      label={`${spec}: ${count}`} 
                      size="small" 
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Box>
            </Paper>
          )}
        </Grid>

        {/* Race Selection */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              <Flag sx={{ mr: 1, verticalAlign: 'middle' }} />
              Select Races
            </Typography>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Add Race</InputLabel>
              <Select
                value=""
                label="Add Race"
                onChange={(e) => addRace(Number(e.target.value))}
                disabled={selectedRaces.length >= maxRaces}
              >
                {getAvailableRaces().map((race) => (
                  <MenuItem key={race.id} value={race.id}>
                    {race.name} - {race.location} ({new Date(race.raceDate).toLocaleDateString()})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedRaces.length === 0 ? (
              <Alert severity="info">No races selected</Alert>
            ) : (
              <List>
                {selectedRaces.map((race) => (
                  <ListItem 
                    key={race.id}
                    sx={{ 
                      border: '1px solid #e0e0e0', 
                      borderRadius: 1, 
                      mb: 1,
                      bgcolor: 'background.paper'
                    }}
                  >
                    <ListItemIcon>
                      <Avatar sx={{ bgcolor: 'secondary.main' }}>
                        <Flag />
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText
                      primary={race.name}
                      secondary={
                        <Box>
                          <Typography variant="caption" display="block">
                            {race.location}, {race.country}
                          </Typography>
                          <Typography variant="caption" display="block">
                            {new Date(race.raceDate).toLocaleDateString()} • {race.raceType.replace(/_/g, ' ')}
                          </Typography>
                          <Typography variant="caption" display="block">
                            Distance: {race.distanceKm}km
                          </Typography>
                        </Box>
                      }
                    />
                    <Button
                      size="small"
                      color="error"
                      onClick={() => removeRace(race.id)}
                    >
                      Remove
                    </Button>
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};