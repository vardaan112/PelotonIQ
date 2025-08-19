import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { Dashboard, ErrorBoundary } from './components';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00d4aa',
      light: '#4df7d6',
      dark: '#00a37b',
      contrastText: '#000000',
    },
    secondary: {
      main: '#ff6b9d',
      light: '#ffb3d6',
      dark: '#cc386e',
      contrastText: '#000000',
    },
    background: {
      default: '#0a0e1a',
      paper: '#1a1f2e',
    },
    text: {
      primary: '#ffffff',
      secondary: '#b0b7c3',
    },
    divider: '#2a2f3f',
    success: {
      main: '#00d4aa',
      light: '#4df7d6',
      dark: '#00a37b',
    },
    warning: {
      main: '#ffb347',
      light: '#ffd280',
      dark: '#cc8f1c',
    },
    error: {
      main: '#ff6b9d',
      light: '#ffb3d6',
      dark: '#cc386e',
    },
    info: {
      main: '#4fc3f7',
      light: '#82e4ff',
      dark: '#29b6f6',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Arial", sans-serif',
    h1: {
      fontWeight: 600,
      background: 'linear-gradient(135deg, #00d4aa 0%, #4fc3f7 100%)',
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    },
    h2: {
      fontWeight: 600,
      background: 'linear-gradient(135deg, #00d4aa 0%, #4fc3f7 100%)',
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    },
    h3: {
      fontWeight: 600,
    },
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f2e 50%, #252a3a 100%)',
          minHeight: '100vh',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'linear-gradient(135deg, rgba(26, 31, 46, 0.9) 0%, rgba(37, 42, 58, 0.9) 100%)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(135deg, rgba(0, 212, 170, 0.1) 0%, rgba(79, 195, 247, 0.1) 100%)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'linear-gradient(135deg, rgba(26, 31, 46, 0.9) 0%, rgba(37, 42, 58, 0.9) 100%)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: 'none',
          fontWeight: 600,
        },
        contained: {
          background: 'linear-gradient(135deg, #00d4aa 0%, #4fc3f7 100%)',
          color: '#000000',
          boxShadow: '0 4px 15px rgba(0, 212, 170, 0.4)',
          '&:hover': {
            background: 'linear-gradient(135deg, #4df7d6 0%, #82e4ff 100%)',
            boxShadow: '0 6px 20px rgba(0, 212, 170, 0.6)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: 4,
        },
        bar: {
          background: 'linear-gradient(135deg, #00d4aa 0%, #4fc3f7 100%)',
        },
      },
    },
  },
});

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Dashboard />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
