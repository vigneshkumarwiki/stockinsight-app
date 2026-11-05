/**
 * Institutional Benchmark Stock Fixtures
 * Validated against official Upstox API data structures
 */

import { EvaluationInput } from '../engine';
import { UpstoxCandle } from '../types/upstox';

/**
 * Helper to generate 250 daily candles with a realistic trend
 */
function generateCandles(
  basePrice: number,
  trendSlope: number,
  volatility: number,
  baseVolume: number
): UpstoxCandle[] {
  const candles: UpstoxCandle[] = [];
  const now = new Date();
  let currentPrice = basePrice;

  // We generate 250 trading sessions (today down to 250 days ago)
  for (let i = 0; i < 260; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split('T')[0];

    // Add noise and trend
    const dailyReturn = (Math.sin(i * 0.15) * 0.015) + (Math.random() - 0.48) * volatility + trendSlope;
    const open = currentPrice;
    const close = open * (1 + dailyReturn);
    const high = Math.max(open, close) * (1 + Math.random() * 0.008);
    const low = Math.min(open, close) * (1 - Math.random() * 0.008);
    const volume = Math.floor(baseVolume * (0.8 + Math.random() * 0.5));

    candles.push([dateStr, open, high, low, close, volume, 0]);
    currentPrice = close;
  }

  // Restore latest candle to base price
  candles[0][4] = basePrice;
  return candles;
}

export const BENCHMARK_STOCKS: Record<string, EvaluationInput> = {
  // 1. RELIANCE (Industrial Benchmark)
  RELIANCE: {
    dataSource: 'DEMO',
    quote: {
      instrument_token: 'NSE_EQ|INE002A01018',
      timestamp: new Date().toISOString(),
      last_price: 2950.40,
      open: 2940.0,
      high: 2965.0,
      low: 2932.0,
      close: 2950.40,
      volume: 4500000,
      average_price: 2948.2,
      net_change: 18.5,
      total_buy_quantity: 120000,
      total_sell_quantity: 95000,
      lower_circuit_limit: 2655.0,
      upper_circuit_limit: 3245.0,
      yearly_high: 3024.90,
      yearly_low: 2220.30,
      depth: {
        buy: [{ price: 2950.00, quantity: 1500, orders: 12 }],
        sell: [{ price: 2950.80, quantity: 1200, orders: 10 }],
      },
    },
    candles: generateCandles(2950.40, 0.0008, 0.012, 4500000),
    profile: {
      status: 'success',
      data: {
        company_name: 'Reliance Industries Limited',
        isin: 'INE002A01018',
        sector_name: 'Oil & Gas - Refining & Marketing',
        industry_name: 'Diversified Conglomerate',
        description: 'Reliance Industries is an Indian multinational conglomerate with operations in energy, petrochemicals, retail, and telecommunications.',
        sector_market_cap_inr: 2500000,
      },
    },
    keyRatios: {
      status: 'success',
      data: [
        { name: 'P/E', company_value: '26.4', sector_value: '22.1' },
        { name: 'P/B', company_value: '2.4', sector_value: '2.1' },
        { name: 'EV/EBITDA', company_value: '12.8', sector_value: '13.5' },
        { name: 'ROE', company_value: '9.6%', sector_value: '11.2%' },
        { name: 'ROCE', company_value: '10.8%', sector_value: '12.5%' },
        { name: 'ROA', company_value: '4.8%', sector_value: '5.2%' },
      ],
    },
    annualIncome: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        income_statement: [
          {
            category: 'revenue',
            history: [
              { period: 'Jun 2026', value: 982671, change: '+7.15%' },
              { period: 'Mar 2024', value: 917121, change: '+3.10%' },
              { period: 'Mar 2023', value: 889569, change: '+25.1%' },
              { period: 'Mar 2022', value: 710906 },
            ],
          },
          {
            category: 'operating_profit',
            history: [
              { period: 'Jun 2026', value: 164383, change: '+4.5%' },
              { period: 'Mar 2024', value: 157200, change: '+5.1%' },
              { period: 'Mar 2023', value: 149500 },
              { period: 'Mar 2022', value: 125000 },
            ],
          },
          {
            category: 'net_profit',
            history: [
              { period: 'Jun 2026', value: 80787, change: '+2.74%' },
              { period: 'Mar 2024', value: 78633, change: '+6.74%' },
              { period: 'Mar 2023', value: 73670, change: '+11.3%' },
              { period: 'Mar 2022', value: 66184 },
            ],
          },
        ],
      },
    },
    quarterlyIncome: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'quarterly',
        units_in: 'crore',
        income_statement: [
          {
            category: 'net_profit',
            history: [
              { period: 'Dec 2024', value: 19500, change: '+4.5%' },
              { period: 'Sep 2024', value: 19100 },
            ],
          },
        ],
      },
    },
    balanceSheet: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        history: [
          { period: 'Jun 2026', total_asset: 1950121, total_liability: 940495 },
          { period: 'Mar 2024', total_asset: 1755986, total_liability: 830198 },
        ],
        full_statement: [
          {
            particular: 'Equity Capital',
            history: [{ period: 'Jun 2026', value: 1009626 }],
          },
        ],
      },
    },
    cashFlow: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        cash_flow: [
          {
            category: 'operating',
            history: [
              { period: 'Jun 2026', value: 178703, change: '+12.5%' },
              { period: 'Mar 2024', value: 158788, change: '+38.0%' },
              { period: 'Mar 2023', value: 115032 },
              { period: 'Mar 2022', value: 110654 },
            ],
          },
        ],
      },
    },
    shareHoldings: {
      status: 'success',
      data: {
        history: [
          {
            period: 'Dec 2024',
            promoter: 50.3,
            promoter_pledged: 0.0,
            fii: 22.1,
            dii: 16.5,
            public: 11.1,
          },
        ],
      },
    },
  },

  // 2. TCS (Cash Rich IT Services)
  TCS: {
    dataSource: 'DEMO',
    quote: {
      instrument_token: 'NSE_EQ|INE467B01029',
      timestamp: new Date().toISOString(),
      last_price: 4120.0,
      open: 4105.0,
      high: 4145.0,
      low: 4095.0,
      close: 4120.0,
      volume: 1850000,
      average_price: 4118.0,
      net_change: 24.0,
      total_buy_quantity: 85000,
      total_sell_quantity: 60000,
      lower_circuit_limit: 3708.0,
      upper_circuit_limit: 4532.0,
      yearly_high: 4585.0,
      yearly_low: 3312.0,
      depth: {
        buy: [{ price: 4119.00, quantity: 800, orders: 8 }],
        sell: [{ price: 4121.00, quantity: 950, orders: 9 }],
      },
    },
    candles: generateCandles(4120.0, 0.001, 0.010, 1850000),
    profile: {
      status: 'success',
      data: {
        company_name: 'Tata Consultancy Services Limited',
        isin: 'INE467B01029',
        sector_name: 'Information Technology - Software Services',
        industry_name: 'IT Services',
        description: 'TCS is an Indian multinational information technology services and consulting company.',
        sector_market_cap_inr: 1500000,
      },
    },
    keyRatios: {
      status: 'success',
      data: [
        { name: 'P/E', company_value: '31.2', sector_value: '29.5' },
        { name: 'P/B', company_value: '13.8', sector_value: '8.4' },
        { name: 'ROE', company_value: '48.2%', sector_value: '26.5%' },
        { name: 'ROCE', company_value: '62.5%', sector_value: '33.2%' },
        { name: 'EV/EBITDA', company_value: '22.4', sector_value: '19.8' },
        { name: 'Debt to Equity', company_value: '0.00' },
      ],
    },
    annualIncome: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        income_statement: [
          {
            category: 'revenue',
            history: [
              { period: 'Jun 2026', value: 245000, change: '+6.8%' },
              { period: 'Mar 2024', value: 240893, change: '+6.8%' },
              { period: 'Mar 2023', value: 225458 },
              { period: 'Mar 2022', value: 191754 },
            ],
          },
          {
            category: 'operating_profit',
            history: [
              { period: 'Jun 2026', value: 65000, change: '+7.1%' },
              { period: 'Mar 2024', value: 60700 },
              { period: 'Mar 2023', value: 55400 },
              { period: 'Mar 2022', value: 49800 },
            ],
          },
          {
            category: 'net_profit',
            history: [
              { period: 'Jun 2026', value: 46800, change: '+7.2%' },
              { period: 'Mar 2024', value: 43600 },
              { period: 'Mar 2023', value: 40500 },
              { period: 'Mar 2022', value: 38300 },
            ],
          },
        ],
      },
    },
    quarterlyIncome: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'quarterly',
        units_in: 'crore',
        income_statement: [
          {
            category: 'net_profit',
            history: [{ period: 'Dec 2024', value: 11900, change: '+5.0%' }],
          },
        ],
      },
    },
    balanceSheet: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        history: [{ period: 'Jun 2026', total_asset: 145000, total_liability: 12500 }],
        full_statement: [
          { particular: 'Total Shareholders Equity', history: [{ period: 'Jun 2026', value: 132500 }] },
        ],
      },
    },
    cashFlow: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        cash_flow: [
          {
            category: 'operating',
            history: [
              { period: 'Jun 2026', value: 44200 },
              { period: 'Mar 2024', value: 41500 },
              { period: 'Mar 2023', value: 38200 },
              { period: 'Mar 2022', value: 36500 },
            ],
          },
        ],
      },
    },
    shareHoldings: {
      status: 'success',
      data: {
        history: [
          {
            period: 'Dec 2024',
            promoter: 71.8,
            promoter_pledged: 0.0,
            fii: 12.5,
            dii: 10.2,
            public: 5.5,
          },
        ],
      },
    },
  },

  // 3. HDFCBANK (Tier 1 Commercial Bank)
  HDFCBANK: {
    dataSource: 'DEMO',
    quote: {
      instrument_token: 'NSE_EQ|INE040A01034',
      timestamp: new Date().toISOString(),
      last_price: 1680.0,
      open: 1675.0,
      high: 1692.0,
      low: 1670.0,
      close: 1680.0,
      volume: 12500000,
      average_price: 1682.5,
      net_change: 12.0,
      total_buy_quantity: 450000,
      total_sell_quantity: 380000,
      lower_circuit_limit: 1512.0,
      upper_circuit_limit: 1848.0,
      yearly_high: 1794.0,
      yearly_low: 1363.0,
      depth: {
        buy: [{ price: 1679.50, quantity: 2000, orders: 12 }],
        sell: [{ price: 1680.50, quantity: 1500, orders: 8 }],
      },
    },
    candles: generateCandles(1680.0, 0.0006, 0.011, 12500000),
    profile: {
      status: 'success',
      data: {
        company_name: 'HDFC Bank Limited',
        isin: 'INE040A01034',
        sector_name: 'Private Sector Bank',
        industry_name: 'Banking & Financial Services',
        description: 'HDFC Bank is India’s largest private sector bank by assets and market capitalization.',
        sector_market_cap_inr: 1800000,
      },
    },
    keyRatios: {
      status: 'success',
      data: [
        { name: 'P/E', company_value: '18.2', sector_value: '19.5' },
        { name: 'P/B', company_value: '2.6', sector_value: '2.5' },
        { name: 'ROA', company_value: '1.92%', sector_value: '1.45%' },
        { name: 'ROE', company_value: '16.5%', sector_value: '14.0%' },
      ],
    },
    annualIncome: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        income_statement: [
          {
            category: 'revenue',
            history: [
              { period: 'Jun 2026', value: 315000 },
              { period: 'Mar 2024', value: 250000 },
              { period: 'Mar 2023', value: 192000 },
              { period: 'Mar 2022', value: 157000 },
            ],
          },
          {
            category: 'net_profit',
            history: [
              { period: 'Jun 2026', value: 68500, change: '+18.2%' },
              { period: 'Mar 2024', value: 57900 },
              { period: 'Mar 2023', value: 46100 },
              { period: 'Mar 2022', value: 38000 },
            ],
          },
        ],
      },
    },
    quarterlyIncome: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'quarterly',
        units_in: 'crore',
        income_statement: [
          {
            category: 'net_profit',
            history: [{ period: 'Dec 2024', value: 17200, change: '+15.2%' }],
          },
        ],
      },
    },
    balanceSheet: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        history: [{ period: 'Jun 2026', total_asset: 3600000, total_liability: 3150000 }],
        full_statement: [
          { particular: 'Total Shareholders Equity', history: [{ period: 'Jun 2026', value: 450000 }] },
        ],
      },
    },
    cashFlow: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        cash_flow: [{ category: 'operating', history: [{ period: 'Jun 2026', value: 45000 }] }],
      },
    },
    shareHoldings: {
      status: 'success',
      data: {
        history: [
          {
            period: 'Dec 2024',
            promoter: 0.0, // Widely held institutionally
            promoter_pledged: 0.0,
            fii: 51.5,
            dii: 31.8,
            public: 16.7,
          },
        ],
      },
    },
  },

  // 4. BAJFINANCE (High Growth NBFC)
  BAJFINANCE: {
    dataSource: 'DEMO',
    quote: {
      instrument_token: 'NSE_EQ|INE296A01024',
      timestamp: new Date().toISOString(),
      last_price: 7240.0,
      open: 7180.0,
      high: 7290.0,
      low: 7150.0,
      close: 7240.0,
      volume: 1100000,
      average_price: 7230.0,
      net_change: 65.0,
      total_buy_quantity: 65000,
      total_sell_quantity: 48000,
      lower_circuit_limit: 6516.0,
      upper_circuit_limit: 7964.0,
      yearly_high: 8190.0,
      yearly_low: 6160.0,
      depth: {
        buy: [{ price: 7238.00, quantity: 400, orders: 6 }],
        sell: [{ price: 7242.00, quantity: 350, orders: 5 }],
      },
    },
    candles: generateCandles(7240.0, 0.0009, 0.014, 1100000),
    profile: {
      status: 'success',
      data: {
        company_name: 'Bajaj Finance Limited',
        isin: 'INE296A01024',
        sector_name: 'Non Banking Financial Company (NBFC)',
        industry_name: 'Consumer Finance',
        description: 'Bajaj Finance is a leading Indian non-banking financial company focused on lending and deposits.',
        sector_market_cap_inr: 850000,
      },
    },
    keyRatios: {
      status: 'success',
      data: [
        { name: 'P/E', company_value: '28.5', sector_value: '22.0' },
        { name: 'P/B', company_value: '5.2', sector_value: '3.5' },
        { name: 'ROA', company_value: '4.6%', sector_value: '2.8%' },
        { name: 'ROE', company_value: '22.1%', sector_value: '16.5%' },
      ],
    },
    annualIncome: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        income_statement: [
          {
            category: 'revenue',
            history: [
              { period: 'Jun 2026', value: 58000 },
              { period: 'Mar 2024', value: 45000 },
              { period: 'Mar 2023', value: 35000 },
              { period: 'Mar 2022', value: 27000 },
            ],
          },
          {
            category: 'net_profit',
            history: [
              { period: 'Jun 2026', value: 16500, change: '+22.5%' },
              { period: 'Mar 2024', value: 13500 },
              { period: 'Mar 2023', value: 10800 },
              { period: 'Mar 2022', value: 7000 },
            ],
          },
        ],
      },
    },
    quarterlyIncome: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'quarterly',
        units_in: 'crore',
        income_statement: [
          {
            category: 'net_profit',
            history: [{ period: 'Dec 2024', value: 4250, change: '+18.0%' }],
          },
        ],
      },
    },
    balanceSheet: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        history: [{ period: 'Jun 2026', total_asset: 380000, total_liability: 295000 }],
        full_statement: [
          { particular: 'Total Shareholders Equity', history: [{ period: 'Jun 2026', value: 85000 }] },
        ],
      },
    },
    cashFlow: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        cash_flow: [{ category: 'operating', history: [{ period: 'Jun 2026', value: 12000 }] }],
      },
    },
    shareHoldings: {
      status: 'success',
      data: {
        history: [
          {
            period: 'Dec 2024',
            promoter: 54.8,
            promoter_pledged: 0.0,
            fii: 20.8,
            dii: 14.1,
            public: 10.3,
          },
        ],
      },
    },
  },

  // 6. GOLDBEES (Commodity ETF Benchmark - Verified ₹125.00)
  GOLDBEES: {
    dataSource: 'OFFLINE_MOCK',
    quote: {
      instrument_token: 'NSE_EQ|INF204KB17I5',
      timestamp: new Date().toISOString(),
      last_price: 125.0,
      open: 124.5,
      high: 125.8,
      low: 124.2,
      close: 125.0,
      volume: 6800000,
      average_price: 124.9,
      net_change: 0.8,
      total_buy_quantity: 450000,
      total_sell_quantity: 380000,
      lower_circuit_limit: 100.0,
      upper_circuit_limit: 150.0,
      yearly_high: 132.5,
      yearly_low: 65.0,
      depth: {
        buy: [{ price: 124.95, quantity: 25000 }],
        sell: [{ price: 125.05, quantity: 18000 }],
      },
    },
    candles: generateCandles(125.0, 0.0008, 0.009, 6800000),
    profile: {
      status: 'success',
      data: {
        company_name: 'Nippon India ETF Gold BeES',
        isin: 'INF204KB17I5',
        sector_name: 'Exchange Traded Fund - Commodity (Gold)',
        industry_name: 'Gold ETF',
        description: 'Open-ended scheme tracking domestic price of physical gold (99.5% purity).',
      },
    },
    keyRatios: {
      status: 'success',
      data: [
        { name: 'P/E', company_value: '1.0', sector_value: '1.0' },
        { name: 'P/B', company_value: '1.0', sector_value: '1.0' },
        { name: 'ROE', company_value: '16.5%', sector_value: '16.5%' },
        { name: 'ROA', company_value: '16.5%', sector_value: '16.5%' },
      ],
    },
    annualIncome: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        income_statement: [
          {
            category: 'revenue',
            history: [{ period: 'Mar 2024', value: 12000, change: '+25.0%' }],
          },
          {
            category: 'net_profit',
            history: [
              { period: 'Mar 2024', value: 1800, change: '+22.0%' },
              { period: 'Mar 2023', value: 1475 },
              { period: 'Mar 2022', value: 1200 },
              { period: 'Mar 2021', value: 980 },
            ],
          },
        ],
      },
    },
    quarterlyIncome: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'quarterly',
        units_in: 'crore',
        income_statement: [
          {
            category: 'net_profit',
            history: [{ period: 'Dec 2024', value: 480, change: '+15.0%' }],
          },
        ],
      },
    },
    balanceSheet: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        history: [{ period: 'Jun 2026', total_asset: 12000, total_liability: 100 }],
        full_statement: [
          { particular: 'Total Shareholders Equity', history: [{ period: 'Jun 2026', value: 11900 }] },
        ],
      },
    },
    cashFlow: {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        cash_flow: [{ category: 'operating', history: [{ period: 'Jun 2026', value: 1800 }] }],
      },
    },
    shareHoldings: {
      status: 'success',
      data: {
        history: [
          {
            period: 'Dec 2024',
            promoter: 0.0,
            promoter_pledged: 0.0,
            fii: 15.0,
            dii: 35.0,
            public: 50.0,
          },
        ],
      },
    },
  },
  ZYDUSLIFE: {
    dataSource: 'DEMO',
    quote: {
      instrument_token: 'NSE_EQ|INE010B01027',
      timestamp: new Date().toISOString(),
      last_price: 1040.0,
      open: 1030.0,
      high: 1050.0,
      low: 1025.0,
      close: 1040.0,
      volume: 1200000,
      average_price: 1038.0,
      net_change: 12.0,
      total_buy_quantity: 45000,
      total_sell_quantity: 38000,
      lower_circuit_limit: 936.0,
      upper_circuit_limit: 1144.0,
    },
    candles: generateCandles(1040.0, 0.001, 0.015, 1200000),
    profile: { status: 'success', data: { company_name: 'Zydus Lifesciences Limited', isin: 'INE010B01027', sector_name: 'Pharmaceuticals' } },
    keyRatios: { status: 'success', data: [{ name: 'P/E', company_value: '24.5', sector_value: '28.0' }] },
    annualIncome: { status: 'success', data: { type: 'consolidated', time_period: 'yearly', units_in: 'crore', income_statement: [] } },
    quarterlyIncome: { status: 'success', data: { type: 'consolidated', time_period: 'quarterly', units_in: 'crore', income_statement: [] } },
    balanceSheet: { status: 'success', data: { type: 'consolidated', time_period: 'yearly', units_in: 'crore', history: [{ period: 'Mar 2026', total_asset: 20000, total_liability: 5000 }], full_statement: [] } },
    cashFlow: { status: 'success', data: { type: 'consolidated', time_period: 'yearly', units_in: 'crore', cash_flow: [] } },
    shareHoldings: { status: 'success', data: { history: [{ period: 'Dec 2024', promoter: 74.0, promoter_pledged: 0.0, fii: 10.0, dii: 10.0, public: 6.0 }] } },
  },
  TMCV: {
    dataSource: 'DEMO',
    quote: {
      instrument_token: 'NSE_EQ|INE1TAE01010',
      timestamp: new Date().toISOString(),
      last_price: 780.0,
      open: 775.0,
      high: 790.0,
      low: 770.0,
      close: 780.0,
      volume: 850000,
      average_price: 778.0,
      net_change: 8.0,
      total_buy_quantity: 30000,
      total_sell_quantity: 25000,
      lower_circuit_limit: 702.0,
      upper_circuit_limit: 858.0,
    },
    candles: generateCandles(780.0, 0.001, 0.015, 850000),
    profile: { status: 'success', data: { company_name: 'Tata Motors Commercial Vehicles Limited', isin: 'INE1TAE01010', sector_name: 'Automobiles - Commercial' } },
    keyRatios: { status: 'success', data: [{ name: 'P/E', company_value: '18.2', sector_value: '22.0' }] },
    annualIncome: { status: 'success', data: { type: 'consolidated', time_period: 'yearly', units_in: 'crore', income_statement: [] } },
    quarterlyIncome: { status: 'success', data: { type: 'consolidated', time_period: 'quarterly', units_in: 'crore', income_statement: [] } },
    balanceSheet: { status: 'success', data: { type: 'consolidated', time_period: 'yearly', units_in: 'crore', history: [{ period: 'Mar 2026', total_asset: 15000, total_liability: 4000 }], full_statement: [] } },
    cashFlow: { status: 'success', data: { type: 'consolidated', time_period: 'yearly', units_in: 'crore', cash_flow: [] } },
    shareHoldings: { status: 'success', data: { history: [{ period: 'Dec 2024', promoter: 46.0, promoter_pledged: 0.0, fii: 18.0, dii: 20.0, public: 16.0 }] } },
  },
  TMPV: {
    dataSource: 'DEMO',
    quote: {
      instrument_token: 'NSE_EQ|INE155A01022',
      timestamp: new Date().toISOString(),
      last_price: 940.0,
      open: 930.0,
      high: 955.0,
      low: 925.0,
      close: 940.0,
      volume: 1500000,
      average_price: 938.0,
      net_change: 15.0,
      total_buy_quantity: 60000,
      total_sell_quantity: 50000,
      lower_circuit_limit: 846.0,
      upper_circuit_limit: 1034.0,
    },
    candles: generateCandles(940.0, 0.001, 0.015, 1500000),
    profile: { status: 'success', data: { company_name: 'Tata Motors Passenger Vehicles Limited', isin: 'INE155A01022', sector_name: 'Automobiles - Passenger' } },
    keyRatios: { status: 'success', data: [{ name: 'P/E', company_value: '21.4', sector_value: '24.0' }] },
    annualIncome: { status: 'success', data: { type: 'consolidated', time_period: 'yearly', units_in: 'crore', income_statement: [] } },
    quarterlyIncome: { status: 'success', data: { type: 'consolidated', time_period: 'quarterly', units_in: 'crore', income_statement: [] } },
    balanceSheet: { status: 'success', data: { type: 'consolidated', time_period: 'yearly', units_in: 'crore', history: [{ period: 'Mar 2026', total_asset: 25000, total_liability: 6000 }], full_statement: [] } },
    cashFlow: { status: 'success', data: { type: 'consolidated', time_period: 'yearly', units_in: 'crore', cash_flow: [] } },
    shareHoldings: { status: 'success', data: { history: [{ period: 'Dec 2024', promoter: 46.0, promoter_pledged: 0.0, fii: 18.0, dii: 20.0, public: 16.0 }] } },
  },
};

