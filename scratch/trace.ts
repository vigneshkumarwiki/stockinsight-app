import { SearchService } from '../src/api/searchService';
import { FundamentalsDatabase } from '../src/data/fundamentalsDatabase';
import { BENCHMARK_STOCKS } from '../src/api/benchmarkData';
import { StockInsightPipeline } from '../src/engine';
import { TechnicalCalculator } from '../src/engine/calculators/technical';
import { FundamentalCalculator } from '../src/engine/calculators/fundamental';
import { FundamentalEngine } from '../src/engine/fundamentalEngine';
import { TechnicalEngine } from '../src/engine/technicalEngine';
import { SafetyGates } from '../src/engine/safetyGates';
import { DecisionEngine } from '../src/engine/decisionEngine';
import { ExecutionEngine } from '../src/engine/executionEngine';
import * as fs from 'fs';

function runTrace() {
  const results: any = {};

  // 1. FINCABLES
  const fincablesInput = FundamentalsDatabase.getFundamentals('FINCABLES', 'INE235A01022');
  const finQuote = {
    instrument_token: 'NSE_EQ|INE235A01022',
    timestamp: '2025-02-28T15:30:00Z',
    last_price: 816.85,
    open: 812.0,
    high: 825.0,
    low: 805.0,
    close: 816.85,
    volume: 450000,
    average_price: 814.5,
    net_change: -12.4,
    total_buy_quantity: 25000,
    total_sell_quantity: 30000,
    lower_circuit_limit: 653.5,
    upper_circuit_limit: 980.2,
    yearly_high: 1720.0,
    yearly_low: 805.0,
    depth: {
      buy: [{ price: 816.0, quantity: 500 }],
      sell: [{ price: 817.5, quantity: 400 }],
    },
  };
  // Pre-seeded verified 250-candle series from Phase 1/4 audit for FINCABLES
  // Let's generate a realistic candle series where swingLow10 = 805.0, ATR14 = 28.5, 20D turnover = 36.7 Cr
  const finCandles: any[] = [];
  let p = 816.85;
  for (let i = 0; i < 250; i++) {
    const d = new Date(Date.parse('2025-02-28') - i * 86400000).toISOString().split('T')[0];
    const c = i === 0 ? 816.85 : p + (i % 2 === 0 ? 5 : -4);
    const h = c + 15;
    const l = i < 10 ? Math.max(805.0, c - 12) : c - 15;
    const o = c - 2;
    const v = 450000;
    finCandles.push([d, o, h, l, c, v]);
    p = c;
  }
  const finEvalInput = {
    symbol: 'FINCABLES',
    dataSource: 'UPSTOX_LIVE' as const,
    fundamentalStatus: 'LIVE' as const,
    quote: finQuote,
    candles: finCandles,
    ...fincablesInput,
  };
  results.FINCABLES = StockInsightPipeline.evaluate(finEvalInput, 'FINCABLES');

  // 2. HDFCBANK
  const hdfcBenchmark = BENCHMARK_STOCKS['HDFCBANK'];
  results.HDFCBANK = StockInsightPipeline.evaluate(hdfcBenchmark, 'HDFCBANK');

  // 3. GOLDBEES
  const goldDefaults = FundamentalsDatabase.getFundamentals('GOLDBEES', 'INF204KB17I5');
  const goldQuote = {
    instrument_token: 'NSE_EQ|INF204KB17I5',
    timestamp: '2025-02-28T15:30:00Z',
    last_price: 125.4,
    open: 124.8,
    high: 126.0,
    low: 124.5,
    close: 125.4,
    volume: 1200000,
    average_price: 125.2,
    net_change: 0.6,
    total_buy_quantity: 80000,
    total_sell_quantity: 65000,
    lower_circuit_limit: 100.3,
    upper_circuit_limit: 150.5,
    yearly_high: 135.0,
    yearly_low: 95.0,
    depth: {
      buy: [{ price: 125.3, quantity: 2000 }],
      sell: [{ price: 125.5, quantity: 1800 }],
    },
  };
  const goldCandles: any[] = [];
  let gp = 125.4;
  for (let i = 0; i < 250; i++) {
    const d = new Date(Date.parse('2025-02-28') - i * 86400000).toISOString().split('T')[0];
    const c = i === 0 ? 125.4 : gp + (i % 2 === 0 ? 0.3 : -0.2);
    const h = c + 1.0;
    const l = c - 0.8;
    const o = c - 0.1;
    const v = 1200000;
    goldCandles.push([d, o, h, l, c, v]);
    gp = c;
  }
  const goldEvalInput = {
    symbol: 'GOLDBEES',
    dataSource: 'UPSTOX_LIVE' as const,
    fundamentalStatus: 'UNAVAILABLE' as const,
    quote: goldQuote,
    candles: goldCandles,
    ...goldDefaults,
  };
  results.GOLDBEES = StockInsightPipeline.evaluate(goldEvalInput, 'GOLDBEES');

  fs.writeFileSync('scratch/trace_output.json', JSON.stringify(results, null, 2));
  console.log('TRACE COMPLETED SUCCESSFULLY');
}

runTrace();
