import { Holding } from '../../types/portfolio';

/**
 * Isolated Test Fixtures for Portfolio Testing.
 * Strictly isolated to test suite (src/tests/*). NEVER imported in production code.
 */
export const TEST_BENCHMARK_HOLDINGS: Holding[] = [
  {
    id: 'bench_rel_1',
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries Limited',
    sector: 'Energy & Refining',
    isin: 'INE002A01018',
    quantity: 60,
    averageBuyPrice: 2820.0,
    buyDate: '2024-01-15',
    addedAt: '2024-01-15T00:00:00.000Z',
  },
  {
    id: 'bench_tcs_2',
    symbol: 'TCS',
    companyName: 'Tata Consultancy Services',
    sector: 'Information Technology',
    isin: 'INE467B01029',
    quantity: 40,
    averageBuyPrice: 3950.0,
    buyDate: '2024-02-10',
    addedAt: '2024-02-10T00:00:00.000Z',
  },
  {
    id: 'bench_hdfc_3',
    symbol: 'HDFCBANK',
    companyName: 'HDFC Bank Limited',
    sector: 'Banking - Private',
    isin: 'INE040A01034',
    quantity: 110,
    averageBuyPrice: 1710.0,
    buyDate: '2024-03-05',
    addedAt: '2024-03-05T00:00:00.000Z',
  },
  {
    id: 'bench_bajf_4',
    symbol: 'BAJFINANCE',
    companyName: 'Bajaj Finance Limited',
    sector: 'Financial Services - NBFC',
    isin: 'INE296A01024',
    quantity: 25,
    averageBuyPrice: 7150.0,
    buyDate: '2024-03-12',
    addedAt: '2024-03-12T00:00:00.000Z',
  },
];
