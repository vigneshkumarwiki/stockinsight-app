import { SearchService } from '../src/api/searchService';
import { UpstoxClient } from '../src/api/upstoxClient';
import { StockInsightPipeline } from '../src/engine';
import { TechnicalCalculator } from '../src/engine/calculators/technical';
import { FundamentalsDatabase } from '../src/data/fundamentalsDatabase';
import { NSE_INSTRUMENTS_MASTER } from '../src/data/nseInstruments';

async function detailedForensic() {
  console.log('=== DETAILED TECHNICAL & IDENTITY FORENSIC ===');

  // 1. Check all instruments sharing ISIN INE155A01022
  const isinMatches = NSE_INSTRUMENTS_MASTER.filter(i => i.isin === 'INE155A01022');
  console.log('Instruments sharing ISIN INE155A01022:', isinMatches.map(i => ({ symbol: i.symbol, name: i.name, isin: i.isin, instrumentKey: i.instrumentKey, lastPrice: i.lastPrice })));

  // 2. Technical calculations on Fallback vs Live
  const client = new UpstoxClient();
  const tmcvEvalFallback = await client.getEvaluationData('TMCV');
  const tmpvEvalFallback = await client.getEvaluationData('TMPV');

  console.log('\n--- FALLBACK MODE (Synthetic candles from distinct lastPrice 780 vs 940) ---');
  console.log('TMCV Fallback LTP:', tmcvEvalFallback.quote.last_price, 'Candles count:', tmcvEvalFallback.candles.length);
  console.log('TMPV Fallback LTP:', tmpvEvalFallback.quote.last_price, 'Candles count:', tmpvEvalFallback.candles.length);

  const tmcvTech = TechnicalCalculator.compute(tmcvEvalFallback.candles, undefined, tmcvEvalFallback.quote.last_price);
  const tmpvTech = TechnicalCalculator.compute(tmpvEvalFallback.candles, undefined, tmpvEvalFallback.quote.last_price);

  console.log('TMCV Tech:', { ltp: tmcvEvalFallback.quote.last_price, ema200: tmcvTech.ema200, sma100: tmcvTech.sma100, rsi14: tmcvTech.rsi14, roc20: tmcvTech.roc20, atr14: tmcvTech.atr14 });
  console.log('TMPV Tech:', { ltp: tmpvEvalFallback.quote.last_price, ema200: tmpvTech.ema200, sma100: tmpvTech.sma100, rsi14: tmpvTech.rsi14, roc20: tmpvTech.roc20, atr14: tmpvTech.atr14 });

  // 3. Simulated LIVE mode (Upstox returns quote for NSE_EQ|INE155A01022 with LTP = 299)
  console.log('\n--- SIMULATED UPSTOX LIVE MODE (Single quote returned for NSE_EQ|INE155A01022) ---');
  const liveQuote299 = {
    instrument_token: 'NSE_EQ|INE155A01022',
    timestamp: '2026-03-24T10:00:00.000Z',
    last_price: 299.15,
    open: 295.0,
    high: 302.5,
    low: 293.0,
    close: 297.0,
    volume: 18500000,
    average_price: 298.5,
    net_change: 2.15,
    total_buy_quantity: 450000,
    total_sell_quantity: 380000,
    lower_circuit_limit: 237.6,
    upper_circuit_limit: 356.4,
  };

  // Upstox historical candles for NSE_EQ|INE155A01022
  const liveCandles299 = UpstoxClient.generateSyntheticCandles(299.15);

  const tmcvLiveInput = {
    symbol: 'TMCV',
    dataSource: 'UPSTOX_LIVE' as const,
    quote: { ...liveQuote299 },
    candles: liveCandles299,
    profile: FundamentalsDatabase.getFundamentals('TMCV', 'INE155A01022').profile,
    keyRatios: FundamentalsDatabase.getFundamentals('TMCV', 'INE155A01022').keyRatios,
    annualIncome: FundamentalsDatabase.getFundamentals('TMCV', 'INE155A01022').annualIncome,
    quarterlyIncome: FundamentalsDatabase.getFundamentals('TMCV', 'INE155A01022').quarterlyIncome,
    balanceSheet: FundamentalsDatabase.getFundamentals('TMCV', 'INE155A01022').balanceSheet,
    cashFlow: FundamentalsDatabase.getFundamentals('TMCV', 'INE155A01022').cashFlow,
    shareHoldings: FundamentalsDatabase.getFundamentals('TMCV', 'INE155A01022').shareHoldings,
  };

  const tmpvLiveInput = {
    symbol: 'TMPV',
    dataSource: 'UPSTOX_LIVE' as const,
    quote: { ...liveQuote299 },
    candles: liveCandles299,
    profile: FundamentalsDatabase.getFundamentals('TMPV', 'INE155A01022').profile,
    keyRatios: FundamentalsDatabase.getFundamentals('TMPV', 'INE155A01022').keyRatios,
    annualIncome: FundamentalsDatabase.getFundamentals('TMPV', 'INE155A01022').annualIncome,
    quarterlyIncome: FundamentalsDatabase.getFundamentals('TMPV', 'INE155A01022').quarterlyIncome,
    balanceSheet: FundamentalsDatabase.getFundamentals('TMPV', 'INE155A01022').balanceSheet,
    cashFlow: FundamentalsDatabase.getFundamentals('TMPV', 'INE155A01022').cashFlow,
    shareHoldings: FundamentalsDatabase.getFundamentals('TMPV', 'INE155A01022').shareHoldings,
  };

  const tmcvLiveEval = StockInsightPipeline.evaluate(tmcvLiveInput, 'TMCV');
  const tmpvLiveEval = StockInsightPipeline.evaluate(tmpvLiveInput, 'TMPV');

  console.log('TMCV Live Eval: LTP =', tmcvLiveEval.execution.ltp, '| Stop =', tmcvLiveEval.execution.stopLoss, '| Core =', tmcvLiveEval.coreScore, '| Fund =', tmcvLiveEval.fundamentalScore, '| Tech =', tmcvLiveEval.technicalScore);
  console.log('TMPV Live Eval: LTP =', tmpvLiveEval.execution.ltp, '| Stop =', tmpvLiveEval.execution.stopLoss, '| Core =', tmpvLiveEval.coreScore, '| Fund =', tmpvLiveEval.fundamentalScore, '| Tech =', tmpvLiveEval.technicalScore);

  console.log('\nIdentity collision summary:');
  console.log('Both instruments request key: NSE_EQ|INE155A01022');
  console.log('Both receive quote for key: NSE_EQ|INE155A01022 (LTP 299.15)');
  console.log('Both receive candles for key: NSE_EQ|INE155A01022');
  console.log('Technical score for TMCV:', tmcvLiveEval.technicalScore, 'TMPV:', tmpvLiveEval.technicalScore);
  console.log('Price Structure Stop for TMCV:', tmcvLiveEval.execution.stopLoss, 'TMPV:', tmpvLiveEval.execution.stopLoss);
}

detailedForensic().catch(console.error);
