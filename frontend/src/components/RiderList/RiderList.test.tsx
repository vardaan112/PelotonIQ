import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { render, createMockRiders } from '../../utils/testUtils';
import { RiderList } from './RiderList';
import { riderService } from '../../services';

// Mock the riderService
jest.mock('../../services', () => ({
  riderService: {
    getAllRiders: jest.fn(),
  },
}));

const mockRiderService = riderService as jest.Mocked<typeof riderService>;

describe('RiderList Component', () => {
  const mockRiders = createMockRiders(10);

  beforeEach(() => {
    mockRiderService.getAllRiders.mockResolvedValue({
      content: mockRiders,
      totalElements: mockRiders.length,
      totalPages: 1,
      size: 20,
      number: 0,
      first: true,
      last: true,
      numberOfElements: mockRiders.length,
      empty: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders rider list with correct data', async () => {
    render(<RiderList />);

    // Check if loading state is shown initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText(`Riders (${mockRiders.length})`)).toBeInTheDocument();
    });

    // Check if riders are displayed
    expect(screen.getByText('Rider1 Last1')).toBeInTheDocument();
    expect(screen.getByText('rider1@example.com')).toBeInTheDocument();
  });

  it('handles pagination correctly', async () => {
    render(<RiderList />);

    await waitFor(() => {
      expect(screen.getByText(`Riders (${mockRiders.length})`)).toBeInTheDocument();
    });

    // Check if pagination controls are present
    expect(screen.getByLabelText(/rows per page/i)).toBeInTheDocument();
  });

  it('applies search filter correctly', async () => {
    render(<RiderList />);

    await waitFor(() => {
      expect(screen.getByText(`Riders (${mockRiders.length})`)).toBeInTheDocument();
    });

    // Open filters
    const filterButton = screen.getByLabelText('Toggle Filters');
    fireEvent.click(filterButton);

    // Search for a specific rider
    const searchInput = screen.getByLabelText('Search by Name');
    fireEvent.change(searchInput, { target: { value: 'Rider1' } });

    // Verify API call was made with search parameter
    await waitFor(() => {
      expect(mockRiderService.getAllRiders).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Rider1',
        })
      );
    });
  });

  it('handles rider selection when selectable prop is true', async () => {
    const onRiderSelect = jest.fn();
    render(<RiderList selectable={true} onRiderSelect={onRiderSelect} />);

    await waitFor(() => {
      expect(screen.getByText(`Riders (${mockRiders.length})`)).toBeInTheDocument();
    });

    // Click on a rider row
    const riderRow = screen.getByText('Rider1 Last1').closest('tr');
    expect(riderRow).toBeInTheDocument();
    
    if (riderRow) {
      fireEvent.click(riderRow);
      expect(onRiderSelect).toHaveBeenCalledWith(mockRiders[0]);
    }
  });

  it('displays error state correctly', async () => {
    mockRiderService.getAllRiders.mockRejectedValue(new Error('API Error'));

    render(<RiderList />);

    await waitFor(() => {
      expect(screen.getByText('Error: API Error')).toBeInTheDocument();
    });
  });

  it('handles sorting correctly', async () => {
    render(<RiderList />);

    await waitFor(() => {
      expect(screen.getByText(`Riders (${mockRiders.length})`)).toBeInTheDocument();
    });

    // Click on FTP sort header
    const ftpSortButton = screen.getByText('FTP (W)');
    fireEvent.click(ftpSortButton);

    await waitFor(() => {
      expect(mockRiderService.getAllRiders).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: 'ftpWatts',
          sortDir: 'desc',
        })
      );
    });
  });

  it('calculates power to weight ratio correctly', async () => {
    render(<RiderList />);

    await waitFor(() => {
      expect(screen.getByText(`Riders (${mockRiders.length})`)).toBeInTheDocument();
    });

    // Check if power-to-weight ratio is calculated correctly
    // mockRiders[0] has 250W and 75kg, so ratio should be 3.33
    expect(screen.getByText('3.33')).toBeInTheDocument();
  });
});