import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Chip,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Typography,
  Toolbar,
  IconButton,
  Tooltip,
  Card,
  CardContent
} from '@mui/material';
import {
  Search,
  FilterList,
  PersonAdd,
  Edit,
  Delete,
  Visibility
} from '@mui/icons-material';
import { Rider, RiderSpecialization, PaginatedResponse } from '../../types';
import { riderService } from '../../services';

interface RiderListProps {
  onRiderSelect?: (rider: Rider) => void;
  onRiderEdit?: (rider: Rider) => void;
  onRiderDelete?: (riderId: number) => void;
  selectable?: boolean;
}

export const RiderList: React.FC<RiderListProps> = ({
  onRiderSelect,
  onRiderEdit,
  onRiderDelete,
  selectable = false
}) => {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [sortBy, setSortBy] = useState('lastName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [totalElements, setTotalElements] = useState(0);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [nationalityFilter, setNationalityFilter] = useState('');
  const [specializationFilter, setSpecializationFilter] = useState<RiderSpecialization | ''>('');
  const [activeFilter, setActiveFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchRiders = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params: any = {
        page,
        size: rowsPerPage,
        sortBy,
        sortDir
      };
      
      if (searchTerm) params.name = searchTerm;
      if (teamFilter) params.team = teamFilter;
      if (nationalityFilter) params.nationality = nationalityFilter;
      if (specializationFilter) params.specialization = specializationFilter;
      if (activeFilter !== '') params.active = activeFilter === 'true';

      const response: PaginatedResponse<Rider> = await riderService.getAllRiders(params);
      setRiders(response.content);
      setTotalElements(response.totalElements);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch riders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiders();
  }, [page, rowsPerPage, sortBy, sortDir, searchTerm, teamFilter, nationalityFilter, specializationFilter, activeFilter]);

  const handleSort = (property: string) => {
    const isAsc = sortBy === property && sortDir === 'asc';
    setSortDir(isAsc ? 'desc' : 'asc');
    setSortBy(property);
  };

  const handlePageChange = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
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

  if (error) {
    return (
      <Card>
        <CardContent>
          <Typography color="error">Error: {error}</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box>
      <Paper>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Riders ({totalElements})
          </Typography>
          <Tooltip title="Toggle Filters">
            <IconButton onClick={() => setShowFilters(!showFilters)}>
              <FilterList />
            </IconButton>
          </Tooltip>
        </Toolbar>

        {showFilters && (
          <Box sx={{ p: 2 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="Search by Name"
                  variant="outlined"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: <Search sx={{ mr: 1 }} />
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="Team"
                  variant="outlined"
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="Nationality"
                  variant="outlined"
                  value={nationalityFilter}
                  onChange={(e) => setNationalityFilter(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <FormControl fullWidth>
                  <InputLabel>Specialization</InputLabel>
                  <Select
                    value={specializationFilter}
                    label="Specialization"
                    onChange={(e) => setSpecializationFilter(e.target.value as RiderSpecialization | '')}
                  >
                    <MenuItem value="">All</MenuItem>
                    {Object.values(RiderSpecialization).map((spec) => (
                      <MenuItem key={spec} value={spec}>
                        {spec.replace(/_/g, ' ')}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={activeFilter}
                    label="Status"
                    onChange={(e) => setActiveFilter(e.target.value as string)}
                  >
                    <MenuItem value="">All</MenuItem>
                    <MenuItem value="true">Active</MenuItem>
                    <MenuItem value="false">Inactive</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        )}

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={sortBy === 'lastName'}
                    direction={sortBy === 'lastName' ? sortDir : 'asc'}
                    onClick={() => handleSort('lastName')}
                  >
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell>Team</TableCell>
                <TableCell>Nationality</TableCell>
                <TableCell>Specialization</TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortBy === 'ftpWatts'}
                    direction={sortBy === 'ftpWatts' ? sortDir : 'asc'}
                    onClick={() => handleSort('ftpWatts')}
                  >
                    FTP (W)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">P/W Ratio</TableCell>
                <TableCell align="right">Age</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : riders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    No riders found
                  </TableCell>
                </TableRow>
              ) : (
                riders.map((rider) => (
                  <TableRow 
                    key={rider.id}
                    hover
                    onClick={selectable ? () => onRiderSelect?.(rider) : undefined}
                    sx={{ cursor: selectable ? 'pointer' : 'default' }}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {rider.firstName} {rider.lastName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {rider.email}
                      </Typography>
                    </TableCell>
                    <TableCell>{rider.team}</TableCell>
                    <TableCell>{rider.nationality}</TableCell>
                    <TableCell>
                      <Chip
                        label={rider.specialization.replace(/_/g, ' ')}
                        size="small"
                        sx={{
                          backgroundColor: getSpecializationColor(rider.specialization),
                          color: 'white',
                          fontWeight: 'bold'
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">{rider.ftpWatts}</TableCell>
                    <TableCell align="right">
                      {calculatePowerToWeight(rider.ftpWatts, rider.weightKg)}
                    </TableCell>
                    <TableCell align="right">
                      {calculateAge(rider.dateOfBirth)}
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={rider.active ? 'Active' : 'Inactive'}
                        color={rider.active ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Box>
                        {onRiderSelect && (
                          <Tooltip title="View Details">
                            <IconButton 
                              size="small" 
                              onClick={(e) => {
                                e.stopPropagation();
                                onRiderSelect(rider);
                              }}
                            >
                              <Visibility />
                            </IconButton>
                          </Tooltip>
                        )}
                        {onRiderEdit && (
                          <Tooltip title="Edit Rider">
                            <IconButton 
                              size="small" 
                              onClick={(e) => {
                                e.stopPropagation();
                                onRiderEdit(rider);
                              }}
                            >
                              <Edit />
                            </IconButton>
                          </Tooltip>
                        )}
                        {onRiderDelete && (
                          <Tooltip title="Delete Rider">
                            <IconButton 
                              size="small" 
                              color="error"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRiderDelete(rider.id);
                              }}
                            >
                              <Delete />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          rowsPerPageOptions={[10, 20, 50, 100]}
          component="div"
          count={totalElements}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handlePageChange}
          onRowsPerPageChange={handleRowsPerPageChange}
        />
      </Paper>
    </Box>
  );
};