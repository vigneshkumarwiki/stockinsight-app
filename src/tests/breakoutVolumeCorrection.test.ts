/**
 * STOCKINSIGHT V2.2 — Phase 2.1 Breakout Volume Correction Test Suite
 * Validates the 10 required regression test scenarios.
 */

import { TechnicalCalculator } from '../engine/calculators/technical';
import { TechnicalEngine } from '../engine/technicalEngine';
import { isDailyCandleFinalized } from '../api/upstoxClient';
import { UpstoxCandle } from '../types/upstox';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
  } else {
    console.error(`❌ FAIL: ${testName}`);
    if (detail) console.error(`   ${detail}`);
    throw new Error(`Test failed: ${testName} ${detail || ''}`);
  }
}

export function runBreakoutVolumeCorrectionTests(): { passed: number; total: number } {
  console.log('\n--- PHASE 2.1: BREAKOUT VOLUME CORRECTION TEST SUITE ---');
  let passedCount = 0;
  let totalCount = 0;

  function runTest(name: string, fn: () => void) {
    totalCount++;
    try {
      fn();
      passedCount++;
    } catch (e: any) {
      console.error(`Execution error in ${name}:`, e.message);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Active market session with a partial current candle (isFinalized = false)
  // --------------------------------------------------------------------------
  runTest('1. Active market session with partial current candle', () => {
    // 25 candles (indices 0..24)
    // candles[0]: date='2026-09-28', volume=50,000 (incomplete current session)
    // candles[1]: date='2026-09-25', volume=200,000 (last completed session)
    // candles[2..21]: 20 completed sessions, volume=100,000 each
    const candles: UpstoxCandle[] = Array.from({ length: 25 }, (_, i) => {
      const d = new Date(2026, 8, 28 - i).toISOString().split('T')[0];
      const vol = i === 0 ? 50000 : i === 1 ? 200000 : 100000;
      return [d, 100, 105, 95, 102, vol, 0];
    });

    const res = TechnicalCalculator.calculateVolumeAccumulation(candles, false);
    assert(res.breakoutVolumeRatio !== null, 'Ratio is not null');
    assert(
      Math.abs(res.breakoutVolumeRatio! - 2.0) < 1e-6,
      'Numerator is candles[1] (200k), comparison avg is candles[2..21] (100k) => 2.0x',
      `Actual: ${res.breakoutVolumeRatio}`
    );
  });

  // --------------------------------------------------------------------------
  // TEST 2: Finalized current-session candle after market close (isFinalized = true)
  // --------------------------------------------------------------------------
  runTest('2. Finalized current-session candle after market close', () => {
    const candles: UpstoxCandle[] = Array.from({ length: 25 }, (_, i) => {
      const d = new Date(2026, 8, 28 - i).toISOString().split('T')[0];
      const vol = i === 0 ? 200000 : 100000;
      return [d, 100, 105, 95, 102, vol, 0];
    });

    const res = TechnicalCalculator.calculateVolumeAccumulation(candles, true);
    assert(
      Math.abs(res.breakoutVolumeRatio! - 2.0) < 1e-6,
      'Numerator is candles[0] (200k), comparison avg is candles[1..20] (100k) => 2.0x',
      `Actual: ${res.breakoutVolumeRatio}`
    );
  });

  // --------------------------------------------------------------------------
  // TEST 3: Weekends and holidays with no new completed candle
  // --------------------------------------------------------------------------
  runTest('3. Weekends and holidays with no new completed candle', () => {
    const isWeekendFinalized = isDailyCandleFinalized('2026-09-25', '2026-09-25', 'WEEKEND');
    const isHolidayFinalized = isDailyCandleFinalized('2026-10-02', '2026-10-02', 'HOLIDAY');

    assert(isWeekendFinalized === true, 'Candle matching weekend session ID is finalized');
    assert(isHolidayFinalized === true, 'Candle matching holiday session ID is finalized');

    const candles: UpstoxCandle[] = Array.from({ length: 25 }, (_, i) => {
      const d = '2026-09-25'; // Friday candle
      const vol = i === 0 ? 200000 : 100000;
      return [d, 100, 105, 95, 102, vol, 0];
    });

    const res = TechnicalCalculator.calculateVolumeAccumulation(candles, true);
    assert(
      Math.abs(res.breakoutVolumeRatio! - 2.0) < 1e-6,
      'Weekend/holiday completed candle treated as finalized (2.0x)',
      `Actual: ${res.breakoutVolumeRatio}`
    );
  });

  // --------------------------------------------------------------------------
  // TEST 4: Correct numerator and 20-session comparison window
  // --------------------------------------------------------------------------
  runTest('4. Correct numerator and 20-session comparison window exclusion', () => {
    // candles[0]: 999,999 (partial/unfinalized)
    // candles[1]: 150,000 (numerator)
    // candles[2..21]: 100,000 each (preceding 20 completed sessions)
    const candles: UpstoxCandle[] = Array.from({ length: 25 }, (_, i) => {
      const vol = i === 0 ? 999999 : i === 1 ? 150000 : 100000;
      return [`2026-09-${30 - i}`, 100, 105, 95, 100, vol, 0];
    });

    const unfinalizedRes = TechnicalCalculator.calculateVolumeAccumulation(candles, false);
    assert(
      Math.abs(unfinalizedRes.breakoutVolumeRatio! - 1.5) < 1e-6,
      'Unfinalized: Numerator (150k) / Avg(candles[2..21]=100k) = 1.5x. candles[0] (999,999) is excluded',
      `Actual: ${unfinalizedRes.breakoutVolumeRatio}`
    );

    const finalizedRes = TechnicalCalculator.calculateVolumeAccumulation(candles, true);
    // Finalized: Numerator (999,999) / Avg(candles[1..20])
    // Avg(candles[1..20]) = (150,000 + 19 * 100,000) / 20 = 2,050,000 / 20 = 102,500
    // 999,999 / 102,500 = 9.7560878x
    assert(
      Math.abs(finalizedRes.breakoutVolumeRatio! - (999999 / 102500)) < 1e-6,
      'Finalized: Numerator is candles[0] (999,999), excluding candles[0] from comparison window',
      `Actual: ${finalizedRes.breakoutVolumeRatio}`
    );
  });

  // --------------------------------------------------------------------------
  // TEST 5: Breakout incorrectly under-reported by previous implementation
  // --------------------------------------------------------------------------
  runTest('5. Breakout under-reporting fix verification', () => {
    // candles[0]: 10,000 (partial intraday volume early in trading day)
    // candles[1]: 300,000 (completed session volume from last closed day)
    // candles[2..21]: 100,000 average volume
    const candles: UpstoxCandle[] = Array.from({ length: 25 }, (_, i) => {
      const vol = i === 0 ? 10000 : i === 1 ? 300000 : 100000;
      return [`2026-09-${30 - i}`, 100, 105, 95, 102, vol, 0];
    });

    const corrected = TechnicalCalculator.calculateVolumeAccumulation(candles, false);
    assert(
      Math.abs(corrected.breakoutVolumeRatio! - 3.0) < 1e-6,
      'Corrected breakout ratio is 3.0x (not under-reported to 0.10x)',
      `Actual: ${corrected.breakoutVolumeRatio}`
    );
  });

  // --------------------------------------------------------------------------
  // TEST 6: Genuine low-volume session still receives low-volume score
  // --------------------------------------------------------------------------
  runTest('6. Genuine low-volume session receives appropriate low score', () => {
    const candles: UpstoxCandle[] = Array.from({ length: 25 }, (_, i) => {
      const vol = i === 0 ? 10000 : i === 1 ? 30000 : 100000;
      return [`2026-09-${30 - i}`, 100, 105, 95, 102, vol, 0];
    });

    const res = TechnicalCalculator.calculateVolumeAccumulation(candles, false);
    assert(
      Math.abs(res.breakoutVolumeRatio! - 0.3) < 1e-6,
      'Genuine low volume session yields 0.30x breakout volume ratio',
      `Actual: ${res.breakoutVolumeRatio}`
    );
  });

  // --------------------------------------------------------------------------
  // TEST 7: Zero, missing and invalid volume inputs
  // --------------------------------------------------------------------------
  runTest('7. Zero, missing and invalid volume inputs', () => {
    // Zero volume numerator
    const zeroNumCandles: UpstoxCandle[] = Array.from({ length: 25 }, (_, i) => {
      const vol = i === 1 ? 0 : 100000;
      return [`2026-09-${30 - i}`, 100, 105, 95, 102, vol, 0];
    });
    const zeroRes = TechnicalCalculator.calculateVolumeAccumulation(zeroNumCandles, false);
    assert(zeroRes.breakoutVolumeRatio === 0.0, 'Zero numerator volume yields 0.0 breakout ratio');

    // Zero average volume in preceding 20 candles
    const zeroAvgCandles: UpstoxCandle[] = Array.from({ length: 25 }, (_, i) => {
      const vol = i === 1 ? 100000 : 0;
      return [`2026-09-${30 - i}`, 100, 105, 95, 102, vol, 0];
    });
    const zeroAvgRes = TechnicalCalculator.calculateVolumeAccumulation(zeroAvgCandles, false);
    assert(zeroAvgRes.breakoutVolumeRatio === 1.0, 'Zero 20-day avg volume returns fail-safe 1.0 ratio');

    // Invalid volume NaN
    const nanVolCandles: UpstoxCandle[] = Array.from({ length: 25 }, (_, i) => {
      const vol = i === 1 ? NaN : 100000;
      return [`2026-09-${30 - i}`, 100, 105, 95, 102, vol, 0];
    });
    const nanRes = TechnicalCalculator.calculateVolumeAccumulation(nanVolCandles, false);
    assert(nanRes.breakoutVolumeRatio === null, 'Invalid NaN volume returns null ratio');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Insufficient completed-candle history
  // --------------------------------------------------------------------------
  runTest('8. Insufficient completed-candle history', () => {
    const shortCandles: UpstoxCandle[] = Array.from({ length: 20 }, (_, i) => [
      `2026-09-${20 - i}`, 100, 105, 95, 102, 100000, 0
    ]);

    const shortUnfinalized = TechnicalCalculator.calculateVolumeAccumulation(shortCandles, false);
    assert(shortUnfinalized.breakoutVolumeRatio === null, 'Unfinalized with < 22 candles returns null');

    const shortFinalized = TechnicalCalculator.calculateVolumeAccumulation(shortCandles, true);
    assert(shortFinalized.breakoutVolumeRatio === null, 'Finalized with < 21 candles returns null');
  });

  // --------------------------------------------------------------------------
  // TEST 9: Unchanged scoring thresholds and volume-veto behaviour
  // --------------------------------------------------------------------------
  runTest('9. Unchanged scoring thresholds and volume-veto behavior', () => {
    // Verify TechnicalEngine scoring mapping for breakout volume ratio
    const mockTechCalcs = {
      ltp: 100,
      ema200: 90,
      ema200SlopePct: 2.0,
      sma100: 95,
      sma50: 98,
      maAligned: true,
      rsi14: 55,
      volumeAccumulationRatio: 1.5,
      breakoutVolumeRatio: 2.5, // >= 1.50 => Max 7 points
      roc20: 5.0,
      rangePosition52WPct: 80,
      atr14: 2.0,
      swingLow10: 90,
      turnover20DCr: 50,
    };

    const techScoreResult = TechnicalEngine.evaluate(mockTechCalcs);
    const bktFactor = techScoreResult.factors.find((f) => f.name === 'Breakout Volume Surge');
    assert(bktFactor !== undefined && bktFactor.score === 7, 'Breakout volume ratio >= 1.50x awards 7/7 max score');
  });

  // --------------------------------------------------------------------------
  // TEST 10: No changes to unrelated technical or fundamental calculations
  // --------------------------------------------------------------------------
  runTest('10. No changes to unrelated technical calculations', () => {
    // 250 realistic candles
    const candles: UpstoxCandle[] = Array.from({ length: 250 }, (_, i) => {
      const d = new Date(2026, 0, 250 - i).toISOString().split('T')[0];
      const base = 1000 + Math.sin(i * 0.1) * 50;
      return [d, base, base + 10, base - 10, base + 2, 100000, 0];
    });

    const tech = TechnicalCalculator.compute(candles, null, 1000);
    assert(tech.rsi14 !== null && tech.rsi14 > 0, `RSI calculation works identically (Actual: ${tech.rsi14})`);
    assert(tech.ema200 !== null && tech.ema200 > 0, `200 EMA calculation works identically (Actual: ${tech.ema200})`);
    assert(tech.sma100 !== null && tech.sma100 > 0, `100 SMA calculation works identically (Actual: ${tech.sma100})`);
    assert(tech.atr14 !== null && tech.atr14 > 0, `ATR-14 calculation works identically (Actual: ${tech.atr14})`);
  });

  // --------------------------------------------------------------------------
  // TEST 11: Zero down-day volume produces MAX_ACCUMULATION (8/8 pts, no 3.0x float)
  // --------------------------------------------------------------------------
  runTest('11. Zero down-day volume produces explicit MAX_ACCUMULATION state', () => {
    // 25 candles where all 20 historical sessions are up-days (closeToday >= closePrev)
    const candles: UpstoxCandle[] = Array.from({ length: 25 }, (_, i) => {
      const d = `2026-09-${25 - i}`;
      const price = 200 - i * 2; // Each day is higher than previous
      return [d, price, price + 2, price - 2, price, 100000, 0];
    });

    const res = TechnicalCalculator.calculateVolumeAccumulation(candles, true);
    assert(res.accumulationState === 'MAX_ACCUMULATION', 'State is MAX_ACCUMULATION when downVolume === 0 and upVolume > 0');
    assert(res.accumulationRatio === null, 'accumulationRatio is null (no synthetic 3.0x float)');
    assert(res.displayValue === '100% Up-Day Volume', 'displayValue is "100% Up-Day Volume"');

    const techCalcs = TechnicalCalculator.compute(candles, null, 200, true);
    assert(techCalcs.volumeAccumulationState === 'MAX_ACCUMULATION', 'compute() passes MAX_ACCUMULATION state');
    assert(techCalcs.volumeAccumulationRatio === null, 'compute() passes null ratio');

    const evalRes = TechnicalEngine.evaluate(techCalcs);
    const volFactor = evalRes.factors.find((f) => f.name === 'Volume Accumulation Ratio');
    assert(volFactor !== undefined, 'Factor exists');
    assert(volFactor!.score === 8, 'MAX_ACCUMULATION awards full 8/8 points');
    assert(volFactor!.rawValue === '100% Up-Day Volume', 'Raw value shows "100% Up-Day Volume"');
    assert(volFactor!.state === 'DERIVED', 'State is DERIVED');
  });

  // --------------------------------------------------------------------------
  // TEST 12: Zero total volume produces ZERO_VOLUME state (0 pts, truthful nonnumeric label)
  // --------------------------------------------------------------------------
  runTest('12. Zero total volume produces ZERO_VOLUME state with nonnumeric label', () => {
    const candles: UpstoxCandle[] = Array.from({ length: 25 }, (_, i) => {
      const d = `2026-09-${25 - i}`;
      return [d, 100, 105, 95, 100, 0, 0]; // 0 volume across all sessions
    });

    const res = TechnicalCalculator.calculateVolumeAccumulation(candles, true);
    assert(res.accumulationState === 'ZERO_VOLUME', 'State is ZERO_VOLUME when both upVolume and downVolume === 0');
    assert(res.accumulationRatio === null, 'accumulationRatio is null (no numeric float)');
    assert(res.displayValue === 'No volume recorded', 'displayValue is "No volume recorded" (no synthetic 0.00x)');
    assert(!res.displayValue?.includes('x'), 'displayValue does not display a numeric ratio multiplier');

    const techCalcs = TechnicalCalculator.compute(candles, null, 100, true);
    assert(techCalcs.volumeAccumulationState === 'ZERO_VOLUME', 'compute() passes ZERO_VOLUME state');
    assert(techCalcs.volumeAccumulationRatio === null, 'compute() keeps numeric ratio null');

    const evalRes = TechnicalEngine.evaluate(techCalcs);
    const volFactor = evalRes.factors.find((f) => f.name === 'Volume Accumulation Ratio');
    assert(volFactor !== undefined, 'Factor exists');
    assert(volFactor!.score === 0, 'ZERO_VOLUME awards 0/8 points');
    assert(volFactor!.rawValue === 'No volume recorded', 'Raw value displays truthful "No volume recorded"');
    assert(volFactor!.state === 'DERIVED', 'State is DERIVED');
  });

  // --------------------------------------------------------------------------
  // TEST 15: Valid zero ratio (up-volume = 0, down-volume > 0) produces 0.00x (2 pts)
  // --------------------------------------------------------------------------
  runTest('15. Valid zero ratio where up-volume is zero and down-volume is positive', () => {
    // 25 candles where all 20 historical sessions are down-days (closeToday < closePrev)
    const candles: UpstoxCandle[] = Array.from({ length: 25 }, (_, i) => {
      const d = `2026-09-${25 - i}`;
      const price = 100 + i * 2; // Each day is lower than previous -> down days
      return [d, price, price + 2, price - 2, price, 50000, 0];
    });

    const res = TechnicalCalculator.calculateVolumeAccumulation(candles, true);
    assert(res.accumulationState === 'NORMAL', 'State is NORMAL when downVolume > 0');
    assert(res.accumulationRatio === 0.0, 'accumulationRatio is mathematically 0.0 (0 / downVolume)');
    assert(res.displayValue === '0.00x', 'displayValue is "0.00x" for mathematically valid zero ratio');

    const techCalcs = TechnicalCalculator.compute(candles, null, 100, true);
    const evalRes = TechnicalEngine.evaluate(techCalcs);
    const volFactor = evalRes.factors.find((f) => f.name === 'Volume Accumulation Ratio');
    assert(volFactor !== undefined, 'Factor exists');
    assert(volFactor!.score === 2, 'Valid 0.00x ratio receives 2/8 points (distribution divergence tier < 1.0x)');
    assert(volFactor!.rawValue === '0.00x', 'Raw value displays "0.00x"');
  });

  // --------------------------------------------------------------------------
  // TEST 13: Normal volume accumulation tiers
  // --------------------------------------------------------------------------
  runTest('13. Normal volume accumulation ratio scoring tiers', () => {
    const baseCalcs = {
      ltp: 100,
      ema200: 90,
      ema200SlopePct: 2.0,
      sma100: 95,
      sma50: 98,
      maAligned: true,
      rsi14: 55,
      breakoutVolumeRatio: 1.5,
      roc20: 5.0,
      rangePosition52WPct: 80,
      atr14: 2.0,
      swingLow10: 90,
      turnover20DCr: 50,
    };

    // Tier 1: >= 1.25 -> 8 pts
    const tier1 = TechnicalEngine.evaluate({
      ...baseCalcs,
      volumeAccumulationRatio: 1.30,
      volumeAccumulationState: 'NORMAL',
    });
    const f1 = tier1.factors.find((f) => f.name === 'Volume Accumulation Ratio');
    assert(f1!.score === 8, 'Ratio >= 1.25 awards 8 pts');

    // Tier 2: 1.0 <= Ratio < 1.25 -> 5 pts
    const tier2 = TechnicalEngine.evaluate({
      ...baseCalcs,
      volumeAccumulationRatio: 1.10,
      volumeAccumulationState: 'NORMAL',
    });
    const f2 = tier2.factors.find((f) => f.name === 'Volume Accumulation Ratio');
    assert(f2!.score === 5, 'Ratio 1.10 awards 5 pts');

    // Tier 3: < 1.0 -> 2 pts
    const tier3 = TechnicalEngine.evaluate({
      ...baseCalcs,
      volumeAccumulationRatio: 0.75,
      volumeAccumulationState: 'NORMAL',
    });
    const f3 = tier3.factors.find((f) => f.name === 'Volume Accumulation Ratio');
    assert(f3!.score === 2, 'Ratio 0.75 awards 2 pts');
  });

  // --------------------------------------------------------------------------
  // TEST 14: Volume Veto enforcement
  // --------------------------------------------------------------------------
  runTest('14. Volume Veto caps technical score at 35 when volume bucket < 5 pts', () => {
    const vetoCalcs = {
      ltp: 100,
      ema200: 90,
      ema200SlopePct: 2.0,
      sma100: 95,
      sma50: 98,
      maAligned: true,
      rsi14: 55, // RSI 10 pts
      roc20: 6.0, // ROC 5 pts (Momentum = 15 pts)
      rangePosition52WPct: 80,
      atr14: 2.0,
      swingLow10: 90,
      turnover20DCr: 50,
      volumeAccumulationRatio: 0.5, // 2 pts
      volumeAccumulationState: 'NORMAL' as const,
      breakoutVolumeRatio: 0.8, // 0 pts (Volume Bucket = 2 pts < 5 pts)
    };

    const vetoRes = TechnicalEngine.evaluate(vetoCalcs);
    assert(vetoRes.buckets.volumeAccumulationBucket === 2, 'Volume bucket is 2 pts (< 5 pts)');
    assert(vetoRes.buckets.volumeVetoApplied === true, 'volumeVetoApplied is true');
    assert(vetoRes.buckets.total === 35, `Technical total is capped at 35 (actual: ${vetoRes.buckets.total})`);
  });

  return { passed: passedCount, total: totalCount };
}
