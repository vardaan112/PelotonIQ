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
  Tabs,
  Tab,
  Alert,
  LinearProgress,
  Chip
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts';
import { Rider, RiderSpecialization, ChartData, PerformanceMetrics } from '../../types';
import { riderService } from '../../services';

interface PerformanceChartsProps {
  selectedTeam?: string;
  selectedRiders?: number[];
  onDataChange?: (metrics: PerformanceMetrics[]) => void;
}

export const PerformanceCharts: React.FC<PerformanceChartsProps> = ({
  selectedTeam,
  selectedRiders,
  onDataChange
}) => {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [performanceData, setPerformanceData] = useState<PerformanceMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [teamFilter, setTeamFilter] = useState(selectedTeam || '');
  const [specializationFilter, setSpecializationFilter] = useState<RiderSpecialization | ''>('');
  const [teams, setTeams] = useState<string[]>([]);

  useEffect(() => {
    fetchRiders();
  }, []);

  useEffect(() => {
    if (selectedTeam) {
      setTeamFilter(selectedTeam);
    }
  }, [selectedTeam]);

  useEffect(() => {
    if (riders.length > 0) {
      processPerformanceData();
    }
  }, [riders, teamFilter, specializationFilter, selectedRiders]);

  const fetchRiders = async () => {
    try {
      setLoading(true);
      const response = await riderService.getActiveRiders({ size: 1000 });
      setRiders(response.content);
      
      // Extract unique teams
      const uniqueTeams = Array.from(new Set(response.content.map(rider => rider.team))).sort();
      setTeams(uniqueTeams);
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

  const processPerformanceData = () => {
    let filteredRiders = riders;

    // Apply team filter
    if (teamFilter) {
      filteredRiders = filteredRiders.filter(rider => rider.team === teamFilter);
    }

    // Apply specialization filter
    if (specializationFilter) {
      filteredRiders = filteredRiders.filter(rider => rider.specialization === specializationFilter);
    }

    // Apply selected riders filter
    if (selectedRiders && selectedRiders.length > 0) {
      filteredRiders = filteredRiders.filter(rider => selectedRiders.includes(rider.id));
    }

    const metrics: PerformanceMetrics[] = filteredRiders.map(rider => ({
      riderId: rider.id,
      riderName: `${rider.firstName} ${rider.lastName}`,
      ftpWatts: rider.ftpWatts,
      powerToWeightRatio: Number((rider.ftpWatts / rider.weightKg).toFixed(2)),
      specialization: rider.specialization.replace(/_/g, ' '),
      team: rider.team,
      age: calculateAge(rider.dateOfBirth)
    }));

    setPerformanceData(metrics);
    onDataChange?.(metrics);
  };

  const getFtpDistributionData = (): ChartData[] => {
    const bins = [
      { range: '< 200W', min: 0, max: 200, count: 0 },
      { range: '200-250W', min: 200, max: 250, count: 0 },
      { range: '250-300W', min: 250, max: 300, count: 0 },
      { range: '300-350W', min: 300, max: 350, count: 0 },
      { range: '350-400W', min: 350, max: 400, count: 0 },
      { range: '> 400W', min: 400, max: Infinity, count: 0 }
    ];

    performanceData.forEach(rider => {
      const bin = bins.find(b => rider.ftpWatts >= b.min && rider.ftpWatts < b.max);
      if (bin) bin.count++;
    });

    return bins.map(bin => ({
      name: bin.range,
      value: bin.count
    }));
  };

  const getSpecializationDistributionData = (): ChartData[] => {
    const distribution: Record<string, number> = {};
    
    performanceData.forEach(rider => {
      distribution[rider.specialization] = (distribution[rider.specialization] || 0) + 1;
    });

    return Object.entries(distribution).map(([specialization, count]) => ({
      name: specialization,
      value: count,
      category: specialization
    }));
  };

  const getTeamComparisonData = (): ChartData[] => {
    const teamStats: Record<string, { totalFtp: number, count: number, totalPowerWeight: number }> = {};
    
    performanceData.forEach(rider => {
      if (!teamStats[rider.team]) {
        teamStats[rider.team] = { totalFtp: 0, count: 0, totalPowerWeight: 0 };
      }
      teamStats[rider.team].totalFtp += rider.ftpWatts;
      teamStats[rider.team].totalPowerWeight += rider.powerToWeightRatio;
      teamStats[rider.team].count++;
    });

    return Object.entries(teamStats).map(([team, stats]) => ({
      name: team.length > 15 ? team.substring(0, 15) + '...' : team,
      value: Math.round(stats.totalFtp / stats.count),
      category: 'Average FTP'
    }));
  };

  const getPowerToWeightScatterData = () => {
    return performanceData.map(rider => ({
      x: rider.ftpWatts,
      y: rider.powerToWeightRatio,
      name: rider.riderName,
      specialization: rider.specialization,
      team: rider.team
    }));
  };

  const getAgeGroupPerformanceData = (): ChartData[] => {
    const ageGroups = [
      { range: '18-24', min: 18, max: 24, riders: [] as PerformanceMetrics[] },
      { range: '25-29', min: 25, max: 29, riders: [] as PerformanceMetrics[] },
      { range: '30-34', min: 30, max: 34, riders: [] as PerformanceMetrics[] },
      { range: '35-39', min: 35, max: 39, riders: [] as PerformanceMetrics[] },
      { range: '40+', min: 40, max: Infinity, riders: [] as PerformanceMetrics[] }
    ];

    performanceData.forEach(rider => {
      const group = ageGroups.find(g => rider.age >= g.min && rider.age <= g.max);
      if (group) group.riders.push(rider);
    });

    return ageGroups
      .filter(group => group.riders.length > 0)
      .map(group => ({
        name: group.range,
        value: Math.round(group.riders.reduce((sum, rider) => sum + rider.ftpWatts, 0) / group.riders.length),
        category: 'Average FTP'
      }));
  };

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1', '#d084d0', '#ffb347', '#87ceeb'];

  const getSpecializationColor = (specialization: string): string => {
    const colors: Record<string, string> = {
      'SPRINTER': '#4CAF50',
      'CLIMBER': '#FF5722',
      'TIME TRIALIST': '#2196F3',
      'ALL ROUNDER': '#9C27B0',
      'DOMESTIQUE': '#607D8B',
      'CLASSICS SPECIALIST': '#FF9800',
      'BREAKAWAY SPECIALIST': '#8BC34A',
      'PUNCHEUR': '#E91E63'
    };
    return colors[specialization.toUpperCase().replace(' ', '_')] || '#000000';
  };

  if (loading) {
    return (
      <Box>
        <LinearProgress />
        <Typography align="center" sx={{ mt: 2 }}>Loading performance data...</Typography>
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
      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>Performance Analytics</Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <FormControl fullWidth>
              <InputLabel>Team</InputLabel>
              <Select
                value={teamFilter}
                label="Team"
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
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <FormControl fullWidth>
              <InputLabel>Specialization</InputLabel>
              <Select
                value={specializationFilter}
                label="Specialization"
                onChange={(e) => setSpecializationFilter(e.target.value as RiderSpecialization | '')}
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
          <Grid size={{ xs: 12, md: 4 }}>
            <Box sx={{ pt: 1 }}>
              <Chip label={`${performanceData.length} riders`} color="primary" />
              {teamFilter && <Chip label={teamFilter} color="secondary" sx={{ ml: 1 }} />}
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Chart Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} variant="scrollable" scrollButtons="auto">
          <Tab label="FTP Distribution" />
          <Tab label="Specializations" />
          <Tab label="Team Comparison" />
          <Tab label="Power vs Weight" />
          <Tab label="Age Groups" />
        </Tabs>
      </Paper>

      {/* Chart Content */}
      {activeTab === 0 && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>FTP Distribution</Typography>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={getFtpDistributionData()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#8884d8" name="Number of Riders" />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Statistics</Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">Average FTP</Typography>
                <Typography variant="h4" color="primary">
                  {performanceData.length > 0 ? 
                    Math.round(performanceData.reduce((sum, rider) => sum + rider.ftpWatts, 0) / performanceData.length) : 0}W
                </Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">Highest FTP</Typography>
                <Typography variant="h5">
                  {performanceData.length > 0 ? Math.max(...performanceData.map(r => r.ftpWatts)) : 0}W
                </Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">Average P/W Ratio</Typography>
                <Typography variant="h5">
                  {performanceData.length > 0 ? 
                    (performanceData.reduce((sum, rider) => sum + rider.powerToWeightRatio, 0) / performanceData.length).toFixed(2) : 0} W/kg
                </Typography>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}

      {activeTab === 1 && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Specialization Distribution</Typography>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={getSpecializationDistributionData()}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {getSpecializationDistributionData().map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={getSpecializationColor(entry.name)} 
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Specialization Performance</Typography>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={getSpecializationDistributionData()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    interval={0}
                  />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" name="Count">
                    {getSpecializationDistributionData().map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={getSpecializationColor(entry.name)} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        </Grid>
      )}

      {activeTab === 2 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Team Performance Comparison</Typography>
          <ResponsiveContainer width="100%" height={500}>
            <BarChart data={getTeamComparisonData()}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                angle={-45}
                textAnchor="end"
                height={120}
                interval={0}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#82ca9d" name="Average FTP (W)" />
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      )}

      {activeTab === 3 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Power vs Weight Analysis</Typography>
          <ResponsiveContainer width="100%" height={500}>
            <ScatterChart
              data={getPowerToWeightScatterData()}
              margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
            >
              <CartesianGrid />
              <XAxis 
                type="number" 
                dataKey="x" 
                name="FTP Watts" 
                domain={['dataMin - 20', 'dataMax + 20']}
              />
              <YAxis 
                type="number" 
                dataKey="y" 
                name="Power/Weight" 
                domain={['dataMin - 0.5', 'dataMax + 0.5']}
              />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <Box sx={{ bgcolor: 'background.paper', p: 1, border: 1, borderRadius: 1 }}>
                        <Typography variant="body2">{data.name}</Typography>
                        <Typography variant="caption">FTP: {data.x}W</Typography><br />
                        <Typography variant="caption">P/W: {data.y} W/kg</Typography><br />
                        <Typography variant="caption">{data.specialization}</Typography><br />
                        <Typography variant="caption">{data.team}</Typography>
                      </Box>
                    );
                  }
                  return null;
                }}
              />
              <Scatter dataKey="y" fill="#8884d8" />
            </ScatterChart>
          </ResponsiveContainer>
        </Paper>
      )}

      {activeTab === 4 && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Performance by Age Group</Typography>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={getAgeGroupPerformanceData()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#8884d8" 
                    fill="#8884d8" 
                    name="Average FTP (W)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Age Distribution</Typography>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={getAgeGroupPerformanceData()}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {getAgeGroupPerformanceData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};