import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  LinearProgress
} from '@mui/material';
import {
  Person,
  Speed,
  Height,
  FitnessCenter,
  EmojiEvents,
  Groups,
  Add,
  Remove
} from '@mui/icons-material';
import { Rider, RiderSpecialization, PerformanceMetrics, TeamComposition } from '../../types';
import { riderService } from '../../services';

interface TeamBuilderProps {
  onTeamCreate?: (team: TeamComposition) => void;
  onTeamUpdate?: (team: TeamComposition) => void;
  initialTeam?: TeamComposition;
}

export const TeamBuilder: React.FC<TeamBuilderProps> = ({
  onTeamCreate,
  onTeamUpdate,
  initialTeam
}) => {
  const [availableRiders, setAvailableRiders] = useState<Rider[]>([]);
  const [selectedRiders, setSelectedRiders] = useState<Rider[]>([]);
  const [teamName, setTeamName] = useState(initialTeam?.teamName || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [filterSpecialization, setFilterSpecialization] = useState<RiderSpecialization | ''>('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchAvailableRiders();
    if (initialTeam) {
      setTeamName(initialTeam.teamName);
      // Convert PerformanceMetrics back to Rider objects if needed
    }
  }, [initialTeam]);

  const fetchAvailableRiders = async () => {
    try {
      setLoading(true);
      const response = await riderService.getActiveRiders({ size: 1000 });
      setAvailableRiders(response.content);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch riders');
    } finally {
      setLoading(false);
    }
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

  const calculatePowerToWeight = (ftpWatts: number, weightKg: number): number => {
    return Number((ftpWatts / weightKg).toFixed(2));
  };

  const getTeamStats = (): {
    averageFtp: number;
    averageAge: number;
    totalMembers: number;
    specializationDistribution: Record<string, number>;
  } => {
    if (selectedRiders.length === 0) {
      return {
        averageFtp: 0,
        averageAge: 0,
        totalMembers: 0,
        specializationDistribution: {}
      };
    }

    const totalFtp = selectedRiders.reduce((sum, rider) => sum + rider.ftpWatts, 0);
    const totalAge = selectedRiders.reduce((sum, rider) => sum + calculateAge(rider.dateOfBirth), 0);
    
    const specializationCounts: Record<string, number> = {};
    selectedRiders.forEach(rider => {
      const spec = rider.specialization;
      specializationCounts[spec] = (specializationCounts[spec] || 0) + 1;
    });

    return {
      averageFtp: Math.round(totalFtp / selectedRiders.length),
      averageAge: Math.round(totalAge / selectedRiders.length),
      totalMembers: selectedRiders.length,
      specializationDistribution: specializationCounts
    };
  };

  const addRiderToTeam = (rider: Rider) => {
    if (!selectedRiders.find(r => r.id === rider.id)) {
      setSelectedRiders([...selectedRiders, rider]);
    }
    setShowAddDialog(false);
  };

  const removeRiderFromTeam = (riderId: number) => {
    setSelectedRiders(selectedRiders.filter(r => r.id !== riderId));
  };

  const handleCreateTeam = () => {
    if (!teamName.trim()) {
      setError('Team name is required');
      return;
    }

    if (selectedRiders.length === 0) {
      setError('Please select at least one rider');
      return;
    }

    const stats = getTeamStats();
    const teamComposition: TeamComposition = {
      teamName: teamName.trim(),
      riders: selectedRiders.map(rider => ({
        riderId: rider.id,
        riderName: `${rider.firstName} ${rider.lastName}`,
        ftpWatts: rider.ftpWatts,
        powerToWeightRatio: calculatePowerToWeight(rider.ftpWatts, rider.weightKg),
        specialization: rider.specialization.replace(/_/g, ' '),
        team: rider.team,
        age: calculateAge(rider.dateOfBirth)
      })),
      ...stats
    };

    if (initialTeam) {
      onTeamUpdate?.(teamComposition);
    } else {
      onTeamCreate?.(teamComposition);
    }
  };

  const getFilteredRiders = () => {
    return availableRiders.filter(rider => {
      const matchesSearch = !searchTerm || 
        `${rider.firstName} ${rider.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rider.team.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesSpecialization = !filterSpecialization || rider.specialization === filterSpecialization;
      
      const notAlreadySelected = !selectedRiders.find(r => r.id === rider.id);
      
      return matchesSearch && matchesSpecialization && notAlreadySelected;
    });
  };

  const getSpecializationColor = (specialization: RiderSpecialization): string => {
    const colors: Record<RiderSpecialization, string> = {
      [RiderSpecialization.SPRINTER]: '#4CAF50',
      [RiderSpecialization.CLIMBER]: '#FF5722',
      [RiderSpecialization.TIME_TRIALIST]: '#2196F3',
      [RiderSpecialization.ALL_ROUNDER]: '#9C27B0',
      [RiderSpecialization.DOMESTIQUE]: '#607D8B',
      [RiderSpecialization.CLASSICS_SPECIALIST]: '#FF9800',
      [RiderSpecialization.BREAKAWAY_SPECIALIST]: '#8BC34A',
      [RiderSpecialization.PUNCHEUR]: '#E91E63'
    };
    return colors[specialization] || '#000000';
  };

  const stats = getTeamStats();

  if (loading) {
    return (
      <Box>
        <LinearProgress />
        <Typography align="center" sx={{ mt: 2 }}>Loading riders...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <Grid container spacing={3}>
        {/* Team Configuration */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Team Configuration
            </Typography>
            
            <TextField
              fullWidth
              label="Team Name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              sx={{ mb: 2 }}
              required
            />

            <Button
              fullWidth
              variant="contained"
              startIcon={<Add />}
              onClick={() => setShowAddDialog(true)}
              sx={{ mb: 2 }}
            >
              Add Rider
            </Button>

            <Button
              fullWidth
              variant="contained"
              color="primary"
              onClick={handleCreateTeam}
              disabled={!teamName.trim() || selectedRiders.length === 0}
            >
              {initialTeam ? 'Update Team' : 'Create Team'}
            </Button>
          </Paper>

          {/* Team Statistics */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Team Statistics
            </Typography>
            
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Members: {stats.totalMembers}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Average FTP: {stats.averageFtp}W
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Average Age: {stats.averageAge} years
              </Typography>
            </Box>

            <Divider sx={{ my: 2 }} />
            
            <Typography variant="subtitle2" gutterBottom>
              Specialization Distribution
            </Typography>
            {Object.entries(stats.specializationDistribution).map(([spec, count]) => (
              <Box key={spec} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Chip
                  label={spec.replace(/_/g, ' ')}
                  size="small"
                  sx={{
                    backgroundColor: getSpecializationColor(spec as RiderSpecialization),
                    color: 'white',
                    mr: 1,
                    minWidth: 120
                  }}
                />
                <Typography variant="body2">{count}</Typography>
              </Box>
            ))}
          </Paper>
        </Grid>

        {/* Selected Riders */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Selected Riders ({selectedRiders.length})
            </Typography>
            
            {selectedRiders.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Groups sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography variant="body1" color="text.secondary">
                  No riders selected. Click "Add Rider" to build your team.
                </Typography>
              </Box>
            ) : (
              <List>
                {selectedRiders.map((rider, index) => (
                  <React.Fragment key={rider.id}>
                    <ListItem
                      sx={{
                        border: '1px solid #e0e0e0',
                        borderRadius: 1,
                        mb: 1,
                        bgcolor: 'background.paper'
                      }}
                    >
                      <ListItemIcon>
                        <Avatar sx={{ bgcolor: getSpecializationColor(rider.specialization) }}>
                          <Person />
                        </Avatar>
                      </ListItemIcon>
                      
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle1">
                              {rider.firstName} {rider.lastName}
                            </Typography>
                            <Chip
                              label={rider.specialization.replace(/_/g, ' ')}
                              size="small"
                              sx={{
                                backgroundColor: getSpecializationColor(rider.specialization),
                                color: 'white'
                              }}
                            />
                          </Box>
                        }
                        secondary={
                          <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Speed fontSize="small" />
                              <Typography variant="caption">{rider.ftpWatts}W</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <EmojiEvents fontSize="small" />
                              <Typography variant="caption">
                                {calculatePowerToWeight(rider.ftpWatts, rider.weightKg)} W/kg
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Typography variant="caption">
                                {calculateAge(rider.dateOfBirth)} years
                              </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              {rider.team}
                            </Typography>
                          </Box>
                        }
                      />
                      
                      <Button
                        size="small"
                        color="error"
                        startIcon={<Remove />}
                        onClick={() => removeRiderFromTeam(rider.id)}
                      >
                        Remove
                      </Button>
                    </ListItem>
                    {index < selectedRiders.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Add Rider Dialog */}
      <Dialog 
        open={showAddDialog} 
        onClose={() => setShowAddDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Add Rider to Team</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2, mt: 1 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Search Riders"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Name or team..."
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Specialization</InputLabel>
                  <Select
                    value={filterSpecialization}
                    label="Specialization"
                    onChange={(e) => setFilterSpecialization(e.target.value as RiderSpecialization | '')}
                  >
                    <MenuItem value="">All Specializations</MenuItem>
                    {Object.values(RiderSpecialization).map((spec) => (
                      <MenuItem key={spec} value={spec}>
                        {spec.replace(/_/g, ' ')}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
          
          <List sx={{ maxHeight: 400, overflow: 'auto' }}>
            {getFilteredRiders().map((rider) => (
              <ListItem
                key={rider.id}
                onClick={() => addRiderToTeam(rider)}
                sx={{
                  border: '1px solid #e0e0e0',
                  borderRadius: 1,
                  mb: 1,
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: 'action.hover'
                  }
                }}
              >
                <ListItemIcon>
                  <Avatar sx={{ bgcolor: getSpecializationColor(rider.specialization) }}>
                    <Person />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary={`${rider.firstName} ${rider.lastName}`}
                  secondary={
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Typography variant="caption">
                        {rider.specialization.replace(/_/g, ' ')}
                      </Typography>
                      <Typography variant="caption">
                        {rider.ftpWatts}W
                      </Typography>
                      <Typography variant="caption">
                        {rider.team}
                      </Typography>
                    </Box>
                  }
                />
              </ListItem>
            ))}
            {getFilteredRiders().length === 0 && (
              <ListItem>
                <ListItemText
                  primary="No riders found"
                  secondary="Try adjusting your search criteria"
                />
              </ListItem>
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddDialog(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};