import React, { Component, ReactNode } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  AlertTitle,
  Stack,
} from '@mui/material';
import {
  Error as ErrorIcon,
  Refresh,
  Wifi,
  CloudOff,
} from '@mui/icons-material';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  isNetworkError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
    isNetworkError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    const isNetworkError = error.message.includes('fetch') || 
                          error.message.includes('Network') ||
                          error.message.includes('Failed to fetch') ||
                          error.message.includes('ERR_NETWORK');
    
    return {
      hasError: true,
      errorMessage: error.message,
      isNetworkError,
    };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      errorMessage: '',
      isNetworkError: false,
    });
    
    // Reload the page to reset the app state
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f2e 50%, #252a3a 100%)',
            p: 3,
          }}
        >
          <Card sx={{ maxWidth: 600, width: '100%' }}>
            <CardContent sx={{ p: 4 }}>
              <Stack spacing={3} alignItems="center" textAlign="center">
                {this.state.isNetworkError ? (
                  <CloudOff sx={{ fontSize: 64, color: 'error.main' }} />
                ) : (
                  <ErrorIcon sx={{ fontSize: 64, color: 'error.main' }} />
                )}
                
                <Typography variant="h4" component="h1">
                  {this.state.isNetworkError ? 'Connection Error' : 'Something went wrong'}
                </Typography>
                
                {this.state.isNetworkError ? (
                  <Alert severity="warning" sx={{ width: '100%' }}>
                    <AlertTitle>Backend Server Offline</AlertTitle>
                    The Spring Boot API server appears to be offline. Please ensure:
                    <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                      <li>The Spring Boot application is running on port 8080</li>
                      <li>You have internet connectivity</li>
                      <li>The database is accessible</li>
                    </ul>
                  </Alert>
                ) : (
                  <Alert severity="error" sx={{ width: '100%' }}>
                    <AlertTitle>Application Error</AlertTitle>
                    {this.state.errorMessage || 'An unexpected error occurred in the application.'}
                  </Alert>
                )}
                
                <Stack direction="row" spacing={2}>
                  <Button
                    variant="contained"
                    startIcon={<Refresh />}
                    onClick={this.handleRetry}
                    size="large"
                  >
                    Retry
                  </Button>
                  
                  {this.state.isNetworkError && (
                    <Button
                      variant="outlined"
                      startIcon={<Wifi />}
                      onClick={() => window.open('http://localhost:8080/api/v1', '_blank')}
                      size="large"
                    >
                      Check API Status
                    </Button>
                  )}
                </Stack>
                
                <Typography variant="body2" color="text.secondary">
                  If the problem persists, please check the browser console for more details.
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      );
    }

    return this.props.children;
  }
}