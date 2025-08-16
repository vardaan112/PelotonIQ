import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { render, createMockRiders } from '../../utils/testUtils';
import { TeamBuilder } from './TeamBuilder';
import { riderService } from '../../services';

// Mock the riderService
jest.mock('../../services', () => ({
  riderService: {
    getActiveRiders: jest.fn(),
  },
}));

const mockRiderService = riderService as jest.Mocked<typeof riderService>;

describe('TeamBuilder Component', () => {
  const mockRiders = createMockRiders(5);

  beforeEach(() => {
    mockRiderService.getActiveRiders.mockResolvedValue({
      content: mockRiders,
      totalElements: mockRiders.length,
      totalPages: 1,
      size: 1000,
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

  it('renders team builder interface correctly', async () => {
    render(<TeamBuilder />);

    // Check if loading state is shown initially
    expect(screen.getByText('Loading riders...')).toBeInTheDocument();

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Team Configuration')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Team Name')).toBeInTheDocument();
    expect(screen.getByText('Add Rider')).toBeInTheDocument();
    expect(screen.getByText('Team Statistics')).toBeInTheDocument();
  });

  it('allows team name input', async () => {
    render(<TeamBuilder />);

    await waitFor(() => {
      expect(screen.getByLabelText('Team Name')).toBeInTheDocument();
    });

    const teamNameInput = screen.getByLabelText('Team Name');
    fireEvent.change(teamNameInput, { target: { value: 'Test Team' } });

    expect(teamNameInput).toHaveValue('Test Team');
  });

  it('opens rider selection dialog', async () => {
    render(<TeamBuilder />);

    await waitFor(() => {
      expect(screen.getByText('Add Rider')).toBeInTheDocument();
    });

    const addRiderButton = screen.getByText('Add Rider');
    fireEvent.click(addRiderButton);

    expect(screen.getByText('Add Rider to Team')).toBeInTheDocument();
    expect(screen.getByLabelText('Search Riders')).toBeInTheDocument();
  });

  it('adds rider to team correctly', async () => {
    render(<TeamBuilder />);

    await waitFor(() => {
      expect(screen.getByText('Add Rider')).toBeInTheDocument();
    });

    // Open add rider dialog
    const addRiderButton = screen.getByText('Add Rider');
    fireEvent.click(addRiderButton);

    // Click on a rider to add
    await waitFor(() => {
      expect(screen.getByText('Rider1 Last1')).toBeInTheDocument();
    });

    const riderItem = screen.getByText('Rider1 Last1');
    fireEvent.click(riderItem);

    // Check if rider was added to selected riders
    await waitFor(() => {
      expect(screen.getByText('Selected Riders (1)')).toBeInTheDocument();
    });
  });

  it('calculates team statistics correctly', async () => {
    render(<TeamBuilder />);

    await waitFor(() => {
      expect(screen.getByText('Add Rider')).toBeInTheDocument();
    });

    // Add a rider first
    const addRiderButton = screen.getByText('Add Rider');
    fireEvent.click(addRiderButton);

    await waitFor(() => {
      expect(screen.getByText('Rider1 Last1')).toBeInTheDocument();
    });

    const riderItem = screen.getByText('Rider1 Last1');
    fireEvent.click(riderItem);

    // Check team statistics
    await waitFor(() => {
      expect(screen.getByText('Members: 1')).toBeInTheDocument();
      expect(screen.getByText('Average FTP: 250W')).toBeInTheDocument();
    });
  });

  it('prevents creating team without name', async () => {
    const onTeamCreate = jest.fn();
    render(<TeamBuilder onTeamCreate={onTeamCreate} />);

    await waitFor(() => {
      expect(screen.getByText('Create Team')).toBeInTheDocument();
    });

    const createButton = screen.getByText('Create Team');
    expect(createButton).toBeDisabled();
  });

  it('prevents creating team without riders', async () => {
    const onTeamCreate = jest.fn();
    render(<TeamBuilder onTeamCreate={onTeamCreate} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Team Name')).toBeInTheDocument();
    });

    // Add team name but no riders
    const teamNameInput = screen.getByLabelText('Team Name');
    fireEvent.change(teamNameInput, { target: { value: 'Test Team' } });

    const createButton = screen.getByText('Create Team');
    expect(createButton).toBeDisabled();
  });

  it('removes rider from team correctly', async () => {
    render(<TeamBuilder />);

    await waitFor(() => {
      expect(screen.getByText('Add Rider')).toBeInTheDocument();
    });

    // Add a rider first
    const addRiderButton = screen.getByText('Add Rider');
    fireEvent.click(addRiderButton);

    await waitFor(() => {
      expect(screen.getByText('Rider1 Last1')).toBeInTheDocument();
    });

    const riderItem = screen.getByText('Rider1 Last1');
    fireEvent.click(riderItem);

    // Verify rider was added
    await waitFor(() => {
      expect(screen.getByText('Selected Riders (1)')).toBeInTheDocument();
    });

    // Remove the rider
    const removeButton = screen.getByText('Remove');
    fireEvent.click(removeButton);

    // Check if rider was removed
    await waitFor(() => {
      expect(screen.getByText('Selected Riders (0)')).toBeInTheDocument();
    });
  });
});