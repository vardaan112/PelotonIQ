import React, { useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  CssBaseline,
  Container,
  Paper,
  IconButton,
  Badge,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  People,
  EmojiEvents,
  Timeline,
  BarChart,
  Assignment
} from '@mui/icons-material';
import { 
  RiderList, 
  TeamBuilder, 
  RaceMonitor, 
  PerformanceCharts, 
  TeamSelection 
} from '../';
import { Rider, Race, DashboardState } from '../../types';

const drawerWidth = 240;

interface NavigationItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  component: React.ReactNode;
}

export const Dashboard: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboardState, setDashboardState] = useState<DashboardState>({
    selectedRiders: [],
    selectedRaces: [],
    activeTab: 'overview'
  });

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setDashboardState(prev => ({ ...prev, activeTab: tabId }));
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const handleSelectionChange = (riders: Rider[], races: Race[]) => {
    setDashboardState(prev => ({
      ...prev,
      selectedRiders: riders.map(r => r.id),
      selectedRaces: races.map(r => r.id)
    }));
  };

  const navigationItems: NavigationItem[] = [
    {
      id: 'overview',
      label: 'Team Selection',
      icon: <Assignment />,
      component: (
        <TeamSelection 
          onSelectionChange={handleSelectionChange}
          maxRiders={15}
          maxRaces={10}
        />
      )
    },
    {
      id: 'riders',
      label: 'Riders',
      icon: <People />,
      component: (
        <RiderList 
          selectable={true}
          onRiderSelect={(rider) => console.log('Rider selected:', rider)}
        />
      )
    },
    {
      id: 'team-builder',
      label: 'Team Builder',
      icon: <EmojiEvents />,
      component: (
        <TeamBuilder 
          onTeamCreate={(team) => console.log('Team created:', team)}
        />
      )
    },
    {
      id: 'race-monitor',
      label: 'Race Monitor',
      icon: <Timeline />,
      component: (
        <RaceMonitor 
          onRaceChange={(race) => console.log('Race changed:', race)}
        />
      )
    },
    {
      id: 'analytics',
      label: 'Performance Analytics',
      icon: <BarChart />,
      component: (
        <PerformanceCharts 
          selectedRiders={dashboardState.selectedRiders}
          onDataChange={(metrics) => console.log('Performance data:', metrics)}
        />
      )
    }
  ];

  const currentNavItem = navigationItems.find(item => item.id === activeTab) || navigationItems[0];

  const drawer = (
    <div>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          PelotonIQ
        </Typography>
      </Toolbar>
      <List>
        {navigationItems.map((item) => (
          <ListItem key={item.id} disablePadding>
            <ListItemButton 
              selected={activeTab === item.id}
              onClick={() => handleTabChange(item.id)}
            >
              <ListItemIcon>
                {activeTab === item.id ? (
                  <Badge color="primary" variant="dot">
                    {item.icon}
                  </Badge>
                ) : (
                  item.icon
                )}
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          
          <DashboardIcon sx={{ mr: 2 }} />
          
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {currentNavItem.label}
          </Typography>
          
          {dashboardState.selectedRiders.length > 0 && (
            <Badge badgeContent={dashboardState.selectedRiders.length} color="secondary">
              <People />
            </Badge>
          )}
          
          {dashboardState.selectedRaces.length > 0 && (
            <Badge badgeContent={dashboardState.selectedRaces.length} color="secondary" sx={{ ml: 2 }}>
              <EmojiEvents />
            </Badge>
          )}
        </Toolbar>
      </AppBar>

      {/* Navigation Drawer */}
      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
        aria-label="navigation menu"
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        
        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh',
          bgcolor: 'background.default'
        }}
      >
        <Toolbar />
        
        <Container maxWidth="xl">
          {currentNavItem.component}
        </Container>
      </Box>
    </Box>
  );
};