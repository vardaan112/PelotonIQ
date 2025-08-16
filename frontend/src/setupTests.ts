import '@testing-library/jest-dom';

// Mock axios to avoid ESM issues in tests
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  })),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
}));

// Mock recharts to avoid canvas rendering issues in tests
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => children,
  BarChart: () => <div data-testid="bar-chart" />,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  PieChart: () => <div data-testid="pie-chart" />,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  ScatterChart: () => <div data-testid="scatter-chart" />,
  Scatter: () => <div data-testid="scatter" />,
  LineChart: () => <div data-testid="line-chart" />,
  Line: () => <div data-testid="line" />,
  Area: () => <div data-testid="area" />,
  AreaChart: () => <div data-testid="area-chart" />,
}));

// Mock console.error to reduce noise in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});