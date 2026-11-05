/**
 * STOCKINSIGHT V2.2 — Stage 4A Corporate Action & Price Integrity Test Suite
 * Validates forward splits, reverse splits, bonus issues, invalid ratios,
 * automated step-discontinuity fallbacks, candle sorting, deduplication, and OHLC sanity.
 */

import { TechnicalCalculator } from '../engine/calculators/technical';
import { UpstoxCandle, UpstoxCorporateActionsResponse } from '../types/upstox';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
  } else {
    console.error(`❌ FAIL: ${testName}`);
    if (detail) console.error(`   ${detail}`);
    throw new Error(`Test failed: ${testName} ${detail || ''}`);
  }
}

export function runCorporateActionAndPriceIntegrityTests(): { passed: number; total: number } {
  console.log('\n--- STAGE 4A: CORPORATE ACTION & PRICE INTEGRITY TEST SUITE ---');
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
  // TEST 1: Forward Split 1:5 via Corporate Actions API
  // --------------------------------------------------------------------------
  runTest('1. Forward Split (1:5) scales pre-split prices by 0.20x and volume by 5x', () => {
    const rawCandles: UpstoxCandle[] = [
      ['2024-11-01', 1200, 1220, 1190, 1210, 500000, 0], // Post split
      ['2024-10-25', 6000, 6100, 5950, 6050, 100000, 0], // Pre split
      ['2024-10-24', 5980, 6080, 5920, 6000, 100000, 0], // Pre split
    ];
    const corporateActions: UpstoxCorporateActionsResponse = {
      status: 'success',
      data: [{ name: 'Split', ratio: '1:5', expiry_date: '2024-10-28' }],
    };

    const adjusted = TechnicalCalculator.adjustCandlesForCorporateActions(rawCandles, corporateActions);
    assert(adjusted[0][4] === 1210, 'Post-split candle unchanged (1210)');
    assert(adjusted[1][4] === 1210.0, `Pre-split close (6050) adjusted to 1210.0 (Actual: ${adjusted[1][4]})`);
    assert(adjusted[2][4] === 1200.0, `Pre-split close (6000) adjusted to 1200.0 (Actual: ${adjusted[2][4]})`);
    assert(adjusted[1][5] === 500000, `Pre-split volume (100k) expanded by 5x to 500k (Actual: ${adjusted[1][5]})`);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Reverse Split 5:1 (Consolidation) via Corporate Actions API
  // --------------------------------------------------------------------------
  runTest('2. Reverse Split (5:1 consolidation) scales pre-split prices by 5.0x and volume by 0.2x', () => {
    const rawCandles: UpstoxCandle[] = [
      ['2024-11-01', 500, 510, 490, 500, 10000, 0], // Post consolidation (500/share)
      ['2024-10-25', 100, 105, 95, 100, 50000, 0],  // Pre consolidation (100/share)
      ['2024-10-24', 98, 102, 96, 100, 50000, 0],   // Pre consolidation
    ];
    const corporateActions: UpstoxCorporateActionsResponse = {
      status: 'success',
      data: [{ name: 'Split', ratio: '5:1', expiry_date: '2024-10-28' }],
    };

    const adjusted = TechnicalCalculator.adjustCandlesForCorporateActions(rawCandles, corporateActions);
    assert(adjusted[0][4] === 500, 'Post-split candle unchanged (500)');
    assert(adjusted[1][4] === 500.0, `Pre-split close (100) scaled by 5.0x to 500.0 (Actual: ${adjusted[1][4]})`);
    assert(adjusted[2][4] === 500.0, `Pre-split close (100) scaled by 5.0x to 500.0 (Actual: ${adjusted[2][4]})`);
    assert(adjusted[1][5] === 10000, `Pre-split volume (50k) scaled down by 5x to 10k (Actual: ${adjusted[1][5]})`);
  });

  // --------------------------------------------------------------------------
  // TEST 3: Bonus Issue 1:1 and 2:1 via Corporate Actions API
  // --------------------------------------------------------------------------
  runTest('3. Bonus Issue (1:1 and 2:1) scales pre-bonus prices and expands volume correctly', () => {
    // 1:1 Bonus
    const candles1to1: UpstoxCandle[] = [
      ['2024-11-01', 100, 105, 95, 100, 20000, 0], // Post bonus
      ['2024-10-25', 200, 210, 190, 200, 10000, 0], // Pre bonus
    ];
    const bonusActions1to1: UpstoxCorporateActionsResponse = {
      status: 'success',
      data: [{ name: 'Bonus', ratio: '1:1', expiry_date: '2024-10-28' }],
    };
    const res1to1 = TechnicalCalculator.adjustCandlesForCorporateActions(candles1to1, bonusActions1to1);
    assert(res1to1[1][4] === 100.0, `1:1 Bonus: Pre-bonus close (200) adjusted by 0.5x to 100.0 (Actual: ${res1to1[1][4]})`);
    assert(res1to1[1][5] === 20000, `1:1 Bonus: Pre-bonus volume (10k) expanded by 2x to 20k (Actual: ${res1to1[1][5]})`);

    // 2:1 Bonus (2 bonus for 1 existing -> 3 total shares -> factor = 1/3)
    const candles2to1: UpstoxCandle[] = [
      ['2024-11-01', 100, 105, 95, 100, 30000, 0], // Post bonus
      ['2024-10-25', 300, 315, 285, 300, 10000, 0], // Pre bonus
    ];
    const bonusActions2to1: UpstoxCorporateActionsResponse = {
      status: 'success',
      data: [{ name: 'Bonus', ratio: '2:1', expiry_date: '2024-10-28' }],
    };
    const res2to1 = TechnicalCalculator.adjustCandlesForCorporateActions(candles2to1, bonusActions2to1);
    assert(res2to1[1][4] === 100.0, `2:1 Bonus: Pre-bonus close (300) adjusted by 1/3 to 100.0 (Actual: ${res2to1[1][4]})`);
    assert(res2to1[1][5] === 30000, `2:1 Bonus: Pre-bonus volume (10k) expanded by 3x to 30k (Actual: ${res2to1[1][5]})`);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Invalid and Malformed Ratios
  // --------------------------------------------------------------------------
  runTest('4. Invalid and malformed ratios do not distort prices', () => {
    const rawCandles: UpstoxCandle[] = [
      ['2024-11-01', 100, 105, 95, 100, 10000, 0],
      ['2024-10-25', 100, 105, 95, 100, 10000, 0],
    ];
    const invalidActions: UpstoxCorporateActionsResponse = {
      status: 'success',
      data: [
        { name: 'Split', ratio: '0:0', expiry_date: '2024-10-28' },
        { name: 'Split', ratio: '-1:5', expiry_date: '2024-10-28' },
        { name: 'Split', ratio: 'invalid', expiry_date: '2024-10-28' },
        { name: 'Split', ratio: '', expiry_date: '2024-10-28' },
      ],
    };

    const res = TechnicalCalculator.adjustCandlesForCorporateActions(rawCandles, invalidActions);
    assert(res[1][4] === 100, 'Price remains unadjusted when ratio is invalid/malformed');
    assert(res[1][5] === 10000, 'Volume remains unadjusted when ratio is invalid/malformed');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Automated Step-Discontinuity Detection Fallback
  // --------------------------------------------------------------------------
  runTest('5. Automated step-discontinuity fallback catches unadjusted splits without metadata', () => {
    // 2:1 Forward Split without corporate action metadata
    const split2to1Candles: UpstoxCandle[] = [
      ['2024-11-01', 50, 52, 48, 50, 20000, 0],   // Post split open 50
      ['2024-10-25', 100, 105, 95, 100, 10000, 0], // Pre split close 100 (ratio 2.0x drop)
    ];
    const res2to1 = TechnicalCalculator.adjustCandlesForCorporateActions(split2to1Candles, null);
    assert(res2to1[1][4] === 50.0, 'Automatic fallback adjusts 2:1 pre-split close from 100 to 50.0');

    // 5:1 Forward Split without corporate action metadata
    const split5to1Candles: UpstoxCandle[] = [
      ['2024-11-01', 20, 21, 19, 20, 50000, 0],    // Post split open 20
      ['2024-10-25', 100, 105, 95, 100, 10000, 0], // Pre split close 100 (ratio 5.0x drop)
    ];
    const res5to1 = TechnicalCalculator.adjustCandlesForCorporateActions(split5to1Candles, null);
    assert(res5to1[1][4] === 20.0, 'Automatic fallback adjusts 5:1 pre-split close from 100 to 20.0');

    // 2:1 Reverse Split without corporate action metadata
    const rev2to1Candles: UpstoxCandle[] = [
      ['2024-11-01', 100, 105, 95, 100, 10000, 0],  // Post consolidation open 100
      ['2024-10-25', 50, 52, 48, 50, 20000, 0],     // Pre consolidation close 50 (surge 2.0x)
    ];
    const resRev2to1 = TechnicalCalculator.adjustCandlesForCorporateActions(rev2to1Candles, null);
    assert(resRev2to1[1][4] === 100.0, 'Automatic fallback adjusts 2:1 pre-consolidation close from 50 to 100.0');
  });

  // --------------------------------------------------------------------------
  // TEST 6: Candle Sorting and Deduplication
  // --------------------------------------------------------------------------
  runTest('6. Unsorted and duplicate candles are sanitized to clean descending unique series', () => {
    const mixedCandles: UpstoxCandle[] = [
      ['2024-10-24T00:00:00Z', 100, 105, 95, 100, 1000, 0], // Day 1
      ['2024-10-26T00:00:00Z', 104, 108, 102, 106, 1200, 0], // Day 3
      ['2024-10-25T00:00:00Z', 102, 106, 98, 104, 1100, 0], // Day 2
      ['2024-10-26T00:00:00Z', 104, 108, 102, 106, 1200, 0], // Duplicate Day 3
    ];

    const sanitized = TechnicalCalculator.adjustCandlesForCorporateActions(mixedCandles, null);
    assert(sanitized.length === 3, `Deduplication reduced 4 candles to 3 (Actual: ${sanitized.length})`);
    assert(sanitized[0][0].startsWith('2024-10-26'), 'Index 0 is latest (2024-10-26)');
    assert(sanitized[1][0].startsWith('2024-10-25'), 'Index 1 is middle (2024-10-25)');
    assert(sanitized[2][0].startsWith('2024-10-24'), 'Index 2 is oldest (2024-10-24)');
  });

  // --------------------------------------------------------------------------
  // TEST 7: OHLC Sanity & Invalid Price Filtering
  // --------------------------------------------------------------------------
  runTest('7. Corrupted candles (high < low, negative price, NaN, non-finite) are discarded', () => {
    const dirtyCandles: any[] = [
      ['2024-10-28', 100, 105, 95, 102, 1000, 0],  // Valid
      ['2024-10-27', 100, 90, 110, 100, 1000, 0],   // Inverted high < low (high 90, low 110) -> Discard
      ['2024-10-26', -50, 105, 95, 100, 1000, 0],   // Negative open -> Discard
      ['2024-10-25', 100, 105, 95, NaN, 1000, 0],   // NaN close -> Discard
      ['2024-10-24', 100, 105, 95, Infinity, 1000, 0], // Infinite close -> Discard
      ['invalid-date', 100, 105, 95, 100, 1000, 0], // Invalid timestamp -> Discard
      ['2024-10-23', 98, 102, 96, 100, 1000, 0],   // Valid
    ];

    const cleaned = TechnicalCalculator.adjustCandlesForCorporateActions(dirtyCandles, null);
    assert(cleaned.length === 2, `5 corrupted candles filtered out, exactly 2 valid candles remain (Actual: ${cleaned.length})`);
    assert(cleaned[0][0] === '2024-10-28', 'First valid candle is 2024-10-28');
    assert(cleaned[1][0] === '2024-10-23', 'Second valid candle is 2024-10-23');
  });

  return { passed: passedCount, total: totalCount };
}
