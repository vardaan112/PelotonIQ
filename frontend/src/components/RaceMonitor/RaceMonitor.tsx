import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Avatar,
  LinearProgress,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  Stop,
  Refresh,
  Timer,
  Speed,
  Flag,
  Person,
  Timeline,
  TrendingUp
} from '@mui/icons-material';
import { Race, Rider, RaceStatus } from '../../types';
import { raceService, riderService } from '../../services';

interface RaceMonitorProps {
  selectedRaceId?: number;
  onRaceChange?: (race: Race) => void;
}

interface RaceParticipant extends Rider {
  currentPosition: number;
  currentSpeed: number; // km/h
  distanceCovered: number; // km
  timeElapsed: string; // HH:MM:SS
  estimatedFinishTime: string;
  status: 'active' | 'dnf' | 'finished';
}

interface RaceData {
  race: Race;
  participants: RaceParticipant[];
  elapsedTime: number; // seconds
  isRunning: boolean;
  leaderboard: RaceParticipant[];
}

export const RaceMonitor: React.FC<RaceMonitorProps> = ({
  selectedRaceId,
  onRaceChange
}) => {
  const [races, setRaces] = useState<Race[]>([]);
  const [currentRaceId, setCurrentRaceId] = useState<number | null>(selectedRaceId || null);
  const [raceData, setRaceData] = useState<RaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchRaces();
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (currentRaceId) {
      initializeRaceMonitoring();
    }
  }, [currentRaceId]);

  const fetchRaces = async () => {
    try {
      setLoading(true);
      const response = await raceService.getAllRaces({ size: 100 });
      const activeRaces = response.content.filter(race => 
        race.status === RaceStatus.IN_PROGRESS || race.status === RaceStatus.PLANNED
      );
      setRaces(activeRaces);
      
      if (activeRaces.length > 0 && !currentRaceId) {
        setCurrentRaceId(activeRaces[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch races');
    } finally {
      setLoading(false);
    }
  };

  const initializeRaceMonitoring = async () => {
    if (!currentRaceId) return;
    
    try {
      const race = await raceService.getRaceById(currentRaceId);
      const riders = await riderService.getActiveRiders({ size: 50 });
      
      // Simulate race participants (in real app, this would come from race registration)
      const participantCount = Math.min(riders.content.length, 20);
      const participants: RaceParticipant[] = riders.content
        .slice(0, participantCount)
        .map((rider, index) => ({
          ...rider,
          currentPosition: index + 1,
          currentSpeed: 35 + Math.random() * 10, // 35-45 km/h
          distanceCovered: 0,
          timeElapsed: '00:00:00',
          estimatedFinishTime: '--:--:--',
          status: 'active' as const
        }));

      setRaceData({
        race,
        participants,
        elapsedTime: 0,
        isRunning: race.status === RaceStatus.IN_PROGRESS,
        leaderboard: [...participants].sort((a, b) => a.currentPosition - b.currentPosition)
      });

      onRaceChange?.(race);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize race monitoring');
    }
  };

  const startRaceSimulation = () => {
    if (!raceData) return;

    setRaceData(prev => prev ? { ...prev, isRunning: true } : null);
    
    intervalRef.current = setInterval(() => {
      setRaceData(prev => {
        if (!prev || !prev.isRunning) return prev;

        const updatedParticipants = prev.participants.map(participant => {
          if (participant.status !== 'active') return participant;

          // Simulate speed variation based on rider specialization
          let speedMultiplier = 1;
          switch (participant.specialization) {
            case 'SPRINTER':
              speedMultiplier = 1.1;
              break;
            case 'CLIMBER':
              speedMultiplier = 0.95;
              break;
            case 'TIME_TRIALIST':
              speedMultiplier = 1.05;
              break;
            default:
              speedMultiplier = 1;
          }

          const baseSpeed = 35 + (participant.ftpWatts / 300) * 10;
          const currentSpeed = baseSpeed * speedMultiplier + (Math.random() - 0.5) * 5;
          const distanceIncrement = (currentSpeed / 3600) * 2; // 2-second intervals
          const newDistance = participant.distanceCovered + distanceIncrement;

          // Check if finished
          const raceDistance = prev.race.distanceKm ? Number(prev.race.distanceKm) : 100;
          const isFinished = newDistance >= raceDistance;

          const newElapsedSeconds = prev.elapsedTime + 2;
          const timeElapsed = formatTime(newElapsedSeconds);
          
          const estimatedTotalTime = raceDistance / (newDistance / newElapsedSeconds);
          const estimatedFinishTime = formatTime(estimatedTotalTime);

          return {
            ...participant,
            currentSpeed: Math.max(0, currentSpeed),
            distanceCovered: Math.min(newDistance, raceDistance),
            timeElapsed,
            estimatedFinishTime: isFinished ? timeElapsed : estimatedFinishTime,
            status: isFinished ? 'finished' as const : participant.status
          };
        });

        // Update positions based on distance covered
        const sortedByDistance = [...updatedParticipants]
          .filter(p => p.status === 'active' || p.status === 'finished')
          .sort((a, b) => b.distanceCovered - a.distanceCovered);

        const withUpdatedPositions = updatedParticipants.map(participant => {
          const position = sortedByDistance.findIndex(p => p.id === participant.id) + 1;
          return { ...participant, currentPosition: position || participant.currentPosition };
        });

        return {
          ...prev,
          participants: withUpdatedPositions,
          elapsedTime: prev.elapsedTime + 2,
          leaderboard: sortedByDistance.slice(0, 10)
        };
      });
    }, 2000); // Update every 2 seconds
  };

  const pauseRaceSimulation = () => {
    setRaceData(prev => prev ? { ...prev, isRunning: false } : null);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const stopRaceSimulation = () => {
    pauseRaceSimulation();
    if (currentRaceId) {
      initializeRaceMonitoring();
    }
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const calculateProgress = (participant: RaceParticipant): number => {
    if (!raceData?.race.distanceKm) return 0;
    return Math.min((participant.distanceCovered / Number(raceData.race.distanceKm)) * 100, 100);
  };

  const getPositionColor = (position: number): string => {
    if (position === 1) return '#FFD700'; // Gold
    if (position === 2) return '#C0C0C0'; // Silver  
    if (position === 3) return '#CD7F32'; // Bronze
    return '#757575'; // Default gray
  };

  if (loading) {
    return (
      <Box>
        <LinearProgress />
        <Typography align="center" sx={{ mt: 2 }}>Loading races...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
    );
  }

  return (
    <Box>
      {/* Race Selection and Controls */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <FormControl fullWidth>
              <InputLabel>Select Race</InputLabel>
              <Select
                value={currentRaceId || ''}
                label="Select Race"
                onChange={(e) => setCurrentRaceId(Number(e.target.value))}
              >
                {races.map((race) => (
                  <MenuItem key={race.id} value={race.id}>
                    {race.name} - {race.location}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                color="success"
                startIcon={<PlayArrow />}
                onClick={startRaceSimulation}
                disabled={!raceData || raceData.isRunning}
              >
                Start
              </Button>
              <Button
                variant="contained"
                color="warning"
                startIcon={<Pause />}
                onClick={pauseRaceSimulation}
                disabled={!raceData || !raceData.isRunning}
              >
                Pause
              </Button>
              <Button
                variant="contained"
                color="error"
                startIcon={<Stop />}
                onClick={stopRaceSimulation}
                disabled={!raceData}
              >
                Reset
              </Button>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            {raceData && (
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="h6">
                  <Timer sx={{ mr: 1, verticalAlign: 'middle' }} />
                  {formatTime(raceData.elapsedTime)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Race Time
                </Typography>
              </Box>
            )}
          </Grid>
        </Grid>
      </Paper>

      {raceData && (
        <>
          {/* Race Information */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h5" gutterBottom>
              {raceData.race.name}
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Typography variant="body2" color="text.secondary">Location</Typography>
                <Typography variant="body1">{raceData.race.location}, {raceData.race.country}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Typography variant="body2" color="text.secondary">Distance</Typography>
                <Typography variant="body1">{raceData.race.distanceKm} km</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Typography variant="body2" color="text.secondary">Type</Typography>
                <Typography variant="body1">{raceData.race.raceType.replace(/_/g, ' ')}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Typography variant="body2" color="text.secondary">Participants</Typography>
                <Typography variant="body1">{raceData.participants.length}</Typography>
              </Grid>
            </Grid>
          </Paper>

          {/* Tabs */}
          <Paper sx={{ mb: 2 }}>
            <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
              <Tab icon={<Timeline />} label="Live Tracking" />
              <Tab icon={<Flag />} label="Leaderboard" />
              <Tab icon={<TrendingUp />} label="Statistics" />
            </Tabs>
          </Paper>

          {/* Tab Content */}
          {activeTab === 0 && (
            <Grid container spacing={2}>
              {raceData.participants.slice(0, 8).map((participant) => (
                <Grid key={participant.id} size={{ xs: 12, sm: 6, lg: 3 }}>
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <Avatar 
                          sx={{ 
                            bgcolor: getPositionColor(participant.currentPosition),
                            mr: 2,
                            fontWeight: 'bold'
                          }}
                        >
                          #{participant.currentPosition}
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle1">
                            {participant.firstName} {participant.lastName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {participant.team}
                          </Typography>
                        </Box>
                      </Box>
                      
                      <LinearProgress 
                        variant="determinate" 
                        value={calculateProgress(participant)}
                        sx={{ mb: 2, height: 8, borderRadius: 4 }}
                      />
                      
                      <Grid container spacing={1}>
                        <Grid size={6}>
                          <Typography variant="caption" color="text.secondary">Distance</Typography>
                          <Typography variant="body2">
                            {participant.distanceCovered.toFixed(1)} km
                          </Typography>
                        </Grid>
                        <Grid size={6}>
                          <Typography variant="caption" color="text.secondary">Speed</Typography>
                          <Typography variant="body2">
                            {participant.currentSpeed.toFixed(1)} km/h
                          </Typography>
                        </Grid>
                        <Grid size={6}>
                          <Typography variant="caption" color="text.secondary">Time</Typography>
                          <Typography variant="body2">{participant.timeElapsed}</Typography>
                        </Grid>
                        <Grid size={6}>
                          <Typography variant="caption" color="text.secondary">Status</Typography>
                          <Chip 
                            label={participant.status.toUpperCase()} 
                            size="small"
                            color={
                              participant.status === 'finished' ? 'success' :
                              participant.status === 'active' ? 'primary' : 'error'
                            }
                          />
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}

          {activeTab === 1 && (
            <Paper>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Position</TableCell>
                      <TableCell>Rider</TableCell>
                      <TableCell>Team</TableCell>
                      <TableCell align="right">Distance</TableCell>
                      <TableCell align="right">Speed</TableCell>
                      <TableCell align="right">Time</TableCell>
                      <TableCell align="center">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {raceData.leaderboard.map((participant) => (
                      <TableRow key={participant.id}>
                        <TableCell>
                          <Avatar 
                            sx={{ 
                              bgcolor: getPositionColor(participant.currentPosition),
                              width: 32,
                              height: 32,
                              fontSize: '0.875rem',
                              fontWeight: 'bold'
                            }}
                          >
                            {participant.currentPosition}
                          </Avatar>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {participant.firstName} {participant.lastName}
                          </Typography>
                        </TableCell>
                        <TableCell>{participant.team}</TableCell>
                        <TableCell align="right">
                          {participant.distanceCovered.toFixed(1)} km
                        </TableCell>
                        <TableCell align="right">
                          {participant.currentSpeed.toFixed(1)} km/h
                        </TableCell>
                        <TableCell align="right">{participant.timeElapsed}</TableCell>
                        <TableCell align="center">
                          <Chip 
                            label={participant.status.toUpperCase()} 
                            size="small"
                            color={
                              participant.status === 'finished' ? 'success' :
                              participant.status === 'active' ? 'primary' : 'error'
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {activeTab === 2 && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>Race Statistics</Typography>
                  <List>
                    <ListItem>
                      <ListItemText 
                        primary="Average Speed" 
                        secondary={`${(raceData.participants.reduce((sum, p) => sum + p.currentSpeed, 0) / raceData.participants.length).toFixed(1)} km/h`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText 
                        primary="Fastest Rider" 
                        secondary={`${Math.max(...raceData.participants.map(p => p.currentSpeed)).toFixed(1)} km/h`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText 
                        primary="Active Participants" 
                        secondary={raceData.participants.filter(p => p.status === 'active').length}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText 
                        primary="Finished" 
                        secondary={raceData.participants.filter(p => p.status === 'finished').length}
                      />
                    </ListItem>
                  </List>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>Leaders</Typography>
                  <List>
                    {raceData.leaderboard.slice(0, 5).map((participant, index) => (
                      <ListItem key={participant.id}>
                        <ListItemIcon>
                          <Avatar 
                            sx={{ 
                              bgcolor: getPositionColor(index + 1),
                              width: 32,
                              height: 32,
                              fontSize: '0.875rem'
                            }}
                          >
                            {index + 1}
                          </Avatar>
                        </ListItemIcon>
                        <ListItemText 
                          primary={`${participant.firstName} ${participant.lastName}`}
                          secondary={`${participant.distanceCovered.toFixed(1)} km - ${participant.currentSpeed.toFixed(1)} km/h`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              </Grid>
            </Grid>
          )}
        </>
      )}
    </Box>
  );
};