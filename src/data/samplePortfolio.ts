import { Holding } from '../types/portfolio';

/**
 * Standard Institutional 4-Stock Benchmark Portfolio
 * Provided as an optional one-click demo loader for users to preview
 * risk radar, quality tilt, and concentration analytics.
 */
export const SAMPLE_BENCHMARK_PORTFOLIO: Holding[] = [
  {
    id: 'sample_rel_1',
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
    id: 'sample_tcs_2',
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
    id: 'sample_hdfc_3',
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
    id: 'sample_bajf_4',
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
