import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  Chip,
  Alert,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
  Avatar,
  List,
  ListItem,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Divider,
  Button,
  Badge
} from '@mui/material';
import {
  Search,
  Groups,
  Flag,
  DateRange,
  Person,
  Business,
  Public
} from '@mui/icons-material';
import { teamService, Team } from '../../services/teamService';

interface TeamManagementProps {
  onTeamSelect?: (team: Team) => void;
}

export const TeamManagement: React.FC<TeamManagementProps> = ({
  onTeamSelect
}) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [filteredTeams, setFilteredTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  useEffect(() => {
    fetchTeams();
  }, []);

  useEffect(() => {
    filterTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, categoryFilter, searchTerm]);

  const fetchTeams = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch all teams with a large page size to get all teams
      const response = await teamService.getAllTeams({ size: 100 });
      setTeams(response.content);
      
      console.log('Teams loaded:', response.content.length);
    } catch (err: any) {
      console.error('Failed to fetch teams:', err);
      setError(err.message || 'Failed to fetch teams');
    } finally {
      setLoading(false);
    }
  };

  const filterTeams = () => {
    let filtered = teams;

    if (categoryFilter) {
      filtered = filtered.filter(team => team.category === categoryFilter);
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(team =>
        team.name.toLowerCase().includes(search) ||
        team.country.toLowerCase().includes(search) ||
        (team.manager && team.manager.toLowerCase().includes(search))
      );
    }

    setFilteredTeams(filtered);
  };

  const handleTeamClick = (team: Team) => {
    setSelectedTeam(team);
    onTeamSelect?.(team);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'WORLD_TOUR':
        return 'primary';
      case 'PRO_TEAM':
        return 'secondary';
      case 'CONTINENTAL':
        return 'info';
      default:
        return 'default';
    }
  };

  const getCategoryDisplay = (category: string) => {
    return category.replace(/_/g, ' ');
  };

  const getTeamStats = () => {
    const worldTourCount = teams.filter(t => t.category === 'WORLD_TOUR').length;
    const proTeamCount = teams.filter(t => t.category === 'PRO_TEAM').length;
    const continentalCount = teams.filter(t => t.category === 'CONTINENTAL').length;
    const otherCount = teams.length - worldTourCount - proTeamCount - continentalCount;

    return { worldTourCount, proTeamCount, continentalCount, otherCount };
  };

  if (loading) {
    return (
      <Box>
        <LinearProgress />
        <Typography align="center" sx={{ mt: 2 }}>Loading teams...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
        <Button onClick={fetchTeams} sx={{ ml: 2 }}>
          Retry
        </Button>
      </Alert>
    );
  }

  const stats = getTeamStats();

  return (
    <Box>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          <Groups sx={{ mr: 1, verticalAlign: 'middle' }} />
          Professional Cycling Teams
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Manage and explore professional cycling teams from around the world.
        </Typography>
        
        {/* Stats */}
        <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip 
            label={`${teams.length} Total Teams`} 
            color="primary" 
            icon={<Groups />}
          />
          <Chip 
            label={`${stats.worldTourCount} WorldTour`} 
            color="primary" 
            variant="outlined"
          />
          <Chip 
            label={`${stats.proTeamCount} Pro Teams`} 
            color="secondary" 
            variant="outlined"
          />
          {stats.continentalCount > 0 && (
            <Chip 
              label={`${stats.continentalCount} Continental`} 
              color="info" 
              variant="outlined"
            />
          )}
        </Box>
      </Paper>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Filter Teams
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <TextField
              fullWidth
              label="Search Teams"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
              }}
              placeholder="Search by name, country, or manager..."
            />
          </Box>
          
          <Box sx={{ minWidth: 200 }}>
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={categoryFilter}
                label="Category"
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <MenuItem value="">All Categories</MenuItem>
                <MenuItem value="WORLD_TOUR">WorldTour</MenuItem>
                <MenuItem value="PRO_TEAM">Pro Team</MenuItem>
                <MenuItem value="CONTINENTAL">Continental</MenuItem>
              </Select>
            </FormControl>
          </Box>
          
          <Box sx={{ minWidth: 150 }}>
            <Typography variant="body2" color="text.secondary">
              Showing {filteredTeams.length} of {teams.length} teams
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {/* Teams List */}
        <Box sx={{ flex: selectedTeam ? 2 : 1, minWidth: 600 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Teams ({filteredTeams.length})
            </Typography>
            
            {filteredTeams.length === 0 ? (
              <Alert severity="info">
                No teams found matching your criteria.
              </Alert>
            ) : (
              <List>
                {filteredTeams.map((team, index) => (
                  <React.Fragment key={team.id}>
                    <ListItem disablePadding>
                      <ListItemButton
                        onClick={() => handleTeamClick(team)}
                        selected={selectedTeam?.id === team.id}
                        sx={{ 
                          borderRadius: 1,
                          mb: 1,
                          '&:hover': { bgcolor: 'action.hover' }
                        }}
                      >
                        <ListItemAvatar>
                          <Avatar sx={{ bgcolor: getCategoryColor(team.category) + '.main' }}>
                            <Groups />
                          </Avatar>
                        </ListItemAvatar>
                        
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="subtitle1" component="span">
                                {team.name.replace('Team ', '')}
                              </Typography>
                              <Chip 
                                label={getCategoryDisplay(team.category)} 
                                size="small" 
                                color={getCategoryColor(team.category) as any}
                                variant="outlined"
                              />
                            </Box>
                          }
                          secondary={
                            <Box>
                              <Typography variant="body2" color="text.secondary">
                                <Flag sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                                {team.country}
                                {team.foundedYear && (
                                  <>
                                    <DateRange sx={{ fontSize: 16, ml: 1, mr: 0.5, verticalAlign: 'middle' }} />
                                    Founded {team.foundedYear}
                                  </>
                                )}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Max Roster: {team.maxRosterSize} riders • 
                                {team.active ? ' Active' : ' Inactive'} • 
                                {team.professional ? ' Professional' : ' Amateur'}
                              </Typography>
                            </Box>
                          }
                        />
                        
                        <Box sx={{ textAlign: 'right' }}>
                          <Badge 
                            badgeContent={team.currentRiderCount} 
                            color="primary"
                            showZero
                          >
                            <Person />
                          </Badge>
                        </Box>
                      </ListItemButton>
                    </ListItem>
                    {index < filteredTeams.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </Paper>
        </Box>

        {/* Team Details */}
        {selectedTeam && (
          <Box sx={{ flex: 1, minWidth: 300 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Team Details
              </Typography>
              
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {selectedTeam.name.replace('Team ', '')}
                  </Typography>
                  
                  <Box sx={{ mb: 2 }}>
                    <Chip 
                      label={getCategoryDisplay(selectedTeam.category)} 
                      color={getCategoryColor(selectedTeam.category) as any}
                      sx={{ mb: 1 }}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Flag fontSize="small" />
                      <Typography variant="body2">
                        {selectedTeam.country}
                      </Typography>
                    </Box>
                    
                    {selectedTeam.foundedYear && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DateRange fontSize="small" />
                        <Typography variant="body2">
                          Founded {selectedTeam.foundedYear}
                        </Typography>
                      </Box>
                    )}
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Groups fontSize="small" />
                      <Typography variant="body2">
                        Max Roster: {selectedTeam.maxRosterSize} riders
                      </Typography>
                    </Box>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Person fontSize="small" />
                      <Typography variant="body2">
                        Current Riders: {selectedTeam.currentRiderCount}
                      </Typography>
                    </Box>

                    {selectedTeam.manager && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Business fontSize="small" />
                        <Typography variant="body2">
                          Manager: {selectedTeam.manager}
                        </Typography>
                      </Box>
                    )}

                    {selectedTeam.website && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Public fontSize="small" />
                        <Typography variant="body2" component="a" href={selectedTeam.website} target="_blank">
                          {selectedTeam.website}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary">
                      Created: {new Date(selectedTeam.createdAt).toLocaleDateString()}
                    </Typography>
                    <br />
                    <Typography variant="caption" color="text.secondary">
                      Last Updated: {new Date(selectedTeam.updatedAt).toLocaleDateString()}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Paper>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default TeamManagement;