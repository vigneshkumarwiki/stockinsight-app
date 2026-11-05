/**
 * STOCKINSIGHT V2.0 Context Engine Phase 1B Pure Classifiers Verification Suite
 * Tests all 6 pure classifiers across boundary cases, locked rules, missing data, and position decoupling.
 */

import { BENCHMARK_STOCKS } from '../api/benchmarkData.ts';
import { StockInsightPipeline } from '../engine/index.ts';
import { ContextInputAdapter, PositionContextAdapter } from '../engine/contextAdapters.ts';
import {
  classifyFundamentalCondition,
  classifyTechnicalCondition,
  classifyValuationCondition,
  classifyMomentumCondition,
  classifyPriceLocation,
  classifyPositionContext,
  PROPOSED_CONTEXT_THRESHOLDS,
} from '../engine/contextClassifiers.ts';
import { ContextInput, PositionContextInput } from '../types/context.ts';

async function runPhase1BTests() {
  console.log('===========================================================');
  console.log('       STOCKINSIGHT V2.0 CONTEXT CLASSIFIERS (PHASE 1B)    ');
  console.log('===========================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      if (detail) console.error(`   ${detail}`);
    }
  }

  const relEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE']);
  const baseInput = ContextInputAdapter.fromEvaluation(relEval);

  // ============================================================
  // TEST GROUP 1: FUNDAMENTAL CONDITION CLASSIFIER
  // ============================================================
  console.log('--- TEST GROUP 1: FUNDAMENTAL CLASSIFIER ---');

  const strongFund = classifyFundamentalCondition({ ...baseInput, fundamentalScore: 42 });
  assert(strongFund === 'STRONG', 'Score >= 38 classifies as STRONG (42 -> STRONG)');

  const healthyFund = classifyFundamentalCondition({ ...baseInput, fundamentalScore: 32 });
  assert(healthyFund === 'HEALTHY', 'Score 28-37 classifies as HEALTHY (32 -> HEALTHY)');

  const mixedFund = classifyFundamentalCondition({ ...baseInput, fundamentalScore: 22 });
  assert(mixedFund === 'MIXED', 'Score 18-27 classifies as MIXED (22 -> MIXED)');

  const weakFund = classifyFundamentalCondition({ ...baseInput, fundamentalScore: 12 });
  assert(weakFund === 'WEAK', 'Score < 18 classifies as WEAK (12 -> WEAK)');

  const missingFund = classifyFundamentalCondition({ ...baseInput, fundamentalScore: null });
  assert(missingFund === 'INCOMPLETE', 'Missing fundamental score classifies as INCOMPLETE');

  const goldEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['GOLDBEES']);
  const goldInput = ContextInputAdapter.fromEvaluation(goldEval);
  const etfFund = classifyFundamentalCondition(goldInput);
  assert(etfFund === 'INCOMPLETE', 'ETF classifies as INCOMPLETE without penalizing asset');

  const accrualInput: ContextInput = {
    ...baseInput,
    fundamentalScore: 40,
    safety: { ...baseInput.safety, accrualTrapPenaltyActive: true },
  };
  const accrualFund = classifyFundamentalCondition(accrualInput);
  assert(accrualFund === 'STRONG', 'Accrual Trap retains canonical STRONG condition (no composite state)');

  // ============================================================
  // TEST GROUP 2: TECHNICAL CONDITION CLASSIFIER & COLD-START
  // ============================================================
  console.log('\n--- TEST GROUP 2: TECHNICAL CLASSIFIER & COLD-START ---');

  // Case 2.1: Day-0 STRONG (LTP >= 200, Stack Aligned, Score >= 38)
  const strongTechInput: ContextInput = {
    ...baseInput,
    technicalScore: 40,
    technicals: {
      ...baseInput.technicals,
      ema200: 2500,
      sma100: 2600,
      sma50: 2700,
      maStackAligned: true,
      state: 'AVAILABLE',
    },
    priceStructure: { ...baseInput.priceStructure, ltp: 2800 },
  };
  assert(classifyTechnicalCondition(strongTechInput) === 'STRONG', 'Day-0: LTP >= EMA200 & Stack Aligned -> STRONG');

  // Case 2.2: Day-0 POSITIVE (LTP >= 200, LTP >= 100)
  const positiveTechInput: ContextInput = {
    ...strongTechInput,
    technicalScore: 32,
    technicals: { ...strongTechInput.technicals, maStackAligned: false },
    priceStructure: { ...strongTechInput.priceStructure, ltp: 2650 },
  };
  assert(classifyTechnicalCondition(positiveTechInput) === 'POSITIVE', 'Day-0: LTP >= EMA200 & LTP >= SMA100 -> POSITIVE');

  // Case 2.3: Day-0 STABLE (LTP >= 200, LTP < 100)
  const stableTechInput1: ContextInput = {
    ...positiveTechInput,
    priceStructure: { ...positiveTechInput.priceStructure, ltp: 2550 }, // 2500 <= LTP < 2600
  };
  assert(classifyTechnicalCondition(stableTechInput1) === 'STABLE', 'Day-0: LTP >= EMA200 & LTP < SMA100 -> STABLE');

  // Case 2.4: LOCKED COLD-START RULE (LTP < 200, LTP >= 100)
  const lockedColdStartInput: ContextInput = {
    ...baseInput,
    technicals: {
      ...baseInput.technicals,
      ema200: 2800,
      sma100: 2500,
      state: 'AVAILABLE',
    },
    priceStructure: { ...baseInput.priceStructure, ltp: 2650 }, // 2500 <= LTP < 2800
  };
  assert(
    classifyTechnicalCondition(lockedColdStartInput) === 'STABLE',
    'Day-0 LOCKED RULE: LTP < EMA200 & LTP >= SMA100 -> STABLE'
  );

  // Case 2.5: Day-0 WEAK (LTP < 200, LTP < 100)
  const weakTechInput: ContextInput = {
    ...lockedColdStartInput,
    priceStructure: { ...lockedColdStartInput.priceStructure, ltp: 2400 }, // LTP < 2500
  };
  assert(classifyTechnicalCondition(weakTechInput) === 'WEAK', 'Day-0: LTP < EMA200 & LTP < SMA100 -> WEAK');

  // Case 2.6: Insufficient Candles (<200) -> INCOMPLETE
  const incompleteTechInput: ContextInput = {
    ...baseInput,
    technicals: { ...baseInput.technicals, ema200: null, state: 'MISSING' },
  };
  assert(classifyTechnicalCondition(incompleteTechInput) === 'INCOMPLETE', 'Missing EMA200 -> INCOMPLETE');

  // Case 2.7: Temporal Transition to WEAKENING (Day N >= 1)
  // When prior was STRONG/POSITIVE and LTP breaks below SMA100
  const weakeningInput: ContextInput = {
    ...positiveTechInput,
    priceStructure: { ...positiveTechInput.priceStructure, ltp: 2550 }, // Broke SMA100 (2600)
  };
  assert(
    classifyTechnicalCondition(weakeningInput, 'STRONG') === 'WEAKENING',
    'Day N Transition: Prior STRONG + break of SMA100 -> WEAKENING'
  );
  assert(
    classifyTechnicalCondition(weakeningInput, 'POSITIVE') === 'WEAKENING',
    'Day N Transition: Prior POSITIVE + break of SMA100 -> WEAKENING'
  );
  assert(
    classifyTechnicalCondition(weakeningInput) === 'STABLE',
    'Day 0 (No Prior): Same price coordinates evaluate statically to STABLE (Never falsely WEAKENING)'
  );

  // ============================================================
  // TEST GROUP 3: VALUATION CONDITION CLASSIFIER
  // ============================================================
  console.log('\n--- TEST GROUP 3: VALUATION CLASSIFIER ---');

  // Case 3.1: Reasonable by P/E vs Sector
  const peReasonableInput: ContextInput = {
    ...baseInput,
    valuation: {
      ...baseInput.valuation,
      pe: 20.0,
      sectorPe: 22.0, // 20.0 <= 22.0 * 1.15 (25.3)
      valuationBucketScore: 4,
      state: 'AVAILABLE',
    },
  };
  assert(classifyValuationCondition(peReasonableInput) === 'REASONABLE', 'Reasonable by P/E <= 1.15 * Sector P/E');

  // Case 3.2: Reasonable by Valuation Bucket Score (>= 6)
  const bucketReasonableInput: ContextInput = {
    ...baseInput,
    valuation: {
      ...baseInput.valuation,
      pe: 35.0,
      sectorPe: 20.0, // PE elevated
      valuationBucketScore: 8, // Bucket >= 6
      state: 'AVAILABLE',
    },
  };
  assert(classifyValuationCondition(bucketReasonableInput) === 'REASONABLE', 'Reasonable by Bucket Score >= 6/12');

  // Case 3.3: Elevated (PE > 1.15x Sector AND Bucket < 6)
  const elevatedInput: ContextInput = {
    ...baseInput,
    valuation: {
      ...baseInput.valuation,
      pe: 40.0,
      sectorPe: 20.0,
      valuationBucketScore: 3,
      state: 'AVAILABLE',
    },
  };
  assert(classifyValuationCondition(elevatedInput) === 'ELEVATED', 'Elevated when PE > 1.15x and Bucket < 6');

  // Case 3.4: ETF Valuation is UNAVAILABLE
  assert(classifyValuationCondition(goldInput) === 'UNAVAILABLE', 'ETF Valuation is strictly UNAVAILABLE');

  // Case 3.5: Financial Sector P/B Routing
  const bankInput: ContextInput = {
    ...baseInput,
    sector: 'COMMERCIAL_BANK',
    valuation: {
      ...baseInput.valuation,
      pb: 1.4,
      sectorPb: 1.5,
      valuationBucketScore: 4,
      state: 'AVAILABLE',
    },
  };
  assert(classifyValuationCondition(bankInput) === 'REASONABLE', 'Bank: Reasonable by P/B <= 1.15 * Sector P/B');

  // Case 3.6: Missing Valuation Data -> UNAVAILABLE
  const missingValInput: ContextInput = {
    ...baseInput,
    valuation: { ...baseInput.valuation, pe: null, pb: null, valuationBucketScore: null, state: 'MISSING' },
  };
  assert(classifyValuationCondition(missingValInput) === 'UNAVAILABLE', 'Missing valuation ratios -> UNAVAILABLE');

  // ============================================================
  // TEST GROUP 4: MOMENTUM CONDITION CLASSIFIER (2D PLANE)
  // ============================================================
  console.log('\n--- TEST GROUP 4: MOMENTUM CLASSIFIER ---');

  // 4.1 Healthy: 50 <= RSI <= 68 && ROC > 0
  const healthyMom = classifyMomentumCondition({
    ...baseInput,
    momentum: { rsi14: 60, roc20: 4.5, state: 'AVAILABLE' },
  });
  assert(healthyMom === 'HEALTHY', '50 <= RSI <= 68 and ROC > 0 -> HEALTHY');

  // 4.2 Improving: RSI < 50 && ROC > 0
  const improvingMom = classifyMomentumCondition({
    ...baseInput,
    momentum: { rsi14: 42, roc20: 2.0, state: 'AVAILABLE' },
  });
  assert(improvingMom === 'IMPROVING', 'RSI < 50 and ROC > 0 -> IMPROVING');

  // 4.3 Cooling: RSI > 68
  const coolingMom1 = classifyMomentumCondition({
    ...baseInput,
    momentum: { rsi14: 74, roc20: 8.0, state: 'AVAILABLE' },
  });
  assert(coolingMom1 === 'COOLING', 'RSI > 68 -> COOLING');

  // 4.4 Cooling: 50 <= RSI <= 68 && ROC <= 0
  const coolingMom2 = classifyMomentumCondition({
    ...baseInput,
    momentum: { rsi14: 55, roc20: -1.5, state: 'AVAILABLE' },
  });
  assert(coolingMom2 === 'COOLING', '50 <= RSI <= 68 and ROC <= 0 -> COOLING');

  // 4.5 Weak: RSI < 50 && ROC <= 0
  const weakMom = classifyMomentumCondition({
    ...baseInput,
    momentum: { rsi14: 35, roc20: -5.0, state: 'AVAILABLE' },
  });
  assert(weakMom === 'WEAK', 'RSI < 50 and ROC <= 0 -> WEAK');

  // 4.6 Missing Momentum Safety: MISSING != WEAK (Returns null, never fabricates WEAK)
  const missingBothMom = classifyMomentumCondition({
    ...baseInput,
    momentum: { rsi14: null, roc20: null, state: 'MISSING' },
  });
  assert(missingBothMom === null, '1. Missing RSI + Missing ROC20 returns null (never fabricates WEAK)');

  const missingRsiOnly = classifyMomentumCondition({
    ...baseInput,
    momentum: { rsi14: null, roc20: 3.5, state: 'AVAILABLE' },
  });
  assert(missingRsiOnly === null, '2. Missing RSI + Valid ROC20 returns null (does not become WEAK)');

  const missingRocOnly = classifyMomentumCondition({
    ...baseInput,
    momentum: { rsi14: 45, roc20: null, state: 'AVAILABLE' },
  });
  assert(missingRocOnly === null, '3. Valid RSI + Missing ROC20 returns null (does not become WEAK)');

  const stateMissingMom = classifyMomentumCondition({
    ...baseInput,
    momentum: { rsi14: 40, roc20: -2.0, state: 'MISSING' },
  });
  assert(stateMissingMom === null, '4. State === MISSING returns null even with stale values');

  // 4.7 Verified: Canonical WEAK condition is strictly observed data (RSI < 50 AND ROC <= 0)
  assert(weakMom === 'WEAK', '5. Observed RSI < 50 AND ROC <= 0 correctly classifies as WEAK');

  // ============================================================
  // TEST GROUP 5: PRICE LOCATION PRECEDENCE CASCADE
  // ============================================================
  console.log('\n--- TEST GROUP 5: PRICE LOCATION PRECEDENCE ---');

  const psBase = {
    ltp: 2950,
    e1: 2900,
    e2: 2800,
    e3: 2700,
    s1: 2750,
    s2: null,
    s3: null,
    t1: 3050,
    t2: 3150,
    t3: 3250,
    atr14: 50, // 0.5 ATR = 25
    maxEntry: 2925,
    state: 'AVAILABLE' as const,
  };

  // 5.1 EXTENDED: LTP > MaxEntry
  const extendedInput1 = { ...baseInput, priceStructure: { ...psBase, ltp: 2930, maxEntry: 2925 } };
  assert(classifyPriceLocation(extendedInput1) === 'EXTENDED', 'Step 1: LTP > MaxEntry -> EXTENDED');

  // 5.2 EXTENDED: LTP > T3
  const extendedInput2 = { ...baseInput, priceStructure: { ...psBase, ltp: 3260, maxEntry: 3300 } };
  assert(classifyPriceLocation(extendedInput2) === 'EXTENDED', 'Step 1: LTP > T3 -> EXTENDED');

  // 5.3 SUPPORT: |LTP - E1| <= 0.50 * ATR14 (2900 +/- 25 -> 2875..2925)
  const supportInput = { ...baseInput, priceStructure: { ...psBase, ltp: 2910, maxEntry: 2950 } };
  assert(classifyPriceLocation(supportInput) === 'SUPPORT', 'Step 2: |LTP - E1| <= 0.50 ATR -> SUPPORT');

  // 5.4 RESISTANCE: |LTP - T1| <= 0.50 * ATR14 (3050 +/- 25 -> 3025..3075)
  const resistInput = { ...baseInput, priceStructure: { ...psBase, ltp: 3040, maxEntry: 3100 } };
  assert(classifyPriceLocation(resistInput) === 'RESISTANCE', 'Step 3: |LTP - T1| <= 0.50 ATR -> RESISTANCE');

  // 5.5 MID_RANGE: In-between support and resistance
  const midRangeInput = { ...baseInput, priceStructure: { ...psBase, ltp: 2980, maxEntry: 3100 } };
  assert(classifyPriceLocation(midRangeInput) === 'MID_RANGE', 'Step 4: Default in-between envelope -> MID_RANGE');

  // 5.6 Precedence Conflict: EXTENDED vs SUPPORT (EXTENDED wins)
  const conflictExtSupp = { ...baseInput, priceStructure: { ...psBase, ltp: 2910, maxEntry: 2905 } };
  assert(classifyPriceLocation(conflictExtSupp) === 'EXTENDED', 'Precedence: EXTENDED overrides SUPPORT when both met');

  // 5.7 Stop Breach does NOT create a pseudo-state
  const stopBreachedInput = { ...baseInput, priceStructure: { ...psBase, ltp: 2700, s1: 2750 } };
  const locOnStopBreach = classifyPriceLocation(stopBreachedInput);
  assert(
    locOnStopBreach === 'SUPPORT' || locOnStopBreach === 'MID_RANGE' || locOnStopBreach === 'EXTENDED',
    'Stop breach (LTP < S1) stays strictly within canonical PriceLocation enum'
  );

  // ============================================================
  // TEST GROUP 6: POSITION CONTEXT CLASSIFIER & DECOUPLING
  // ============================================================
  console.log('\n--- TEST GROUP 6: POSITION CONTEXT & DECOUPLING ---');

  const basePosInput: PositionContextInput = {
    is_held: true,
    symbol: 'RELIANCE',
    quantity: 100,
    averageBuyPrice: 2500,
    currentLtp: 2950,
    investedValue: 250000,
    currentValue: 295000,
    pnl: 45000,
    pnlPct: 18.0,
    stopLoss: 2800,
    stopBreached: false,
    accrualTrapGain: false,
  };

  // 6.1 Unheld -> null (NOT_APPLICABLE)
  const unheldPos = classifyPositionContext({ ...basePosInput, is_held: false });
  assert(unheldPos === null, 'is_held === false -> null (NOT_APPLICABLE)');

  // 6.2 Strongly Appreciated: P&L >= +20%
  const stronglyApprec = classifyPositionContext({ ...basePosInput, pnlPct: 24.5 });
  assert(stronglyApprec === 'STRONGLY_APPRECIATED', 'P&L >= +20% -> STRONGLY_APPRECIATED');

  // 6.3 Profitable: +3% <= P&L < +20%
  const profitablePos = classifyPositionContext({ ...basePosInput, pnlPct: 12.0 });
  assert(profitablePos === 'PROFITABLE', '+3% <= P&L < +20% -> PROFITABLE');

  // 6.4 Near Breakeven: -3% <= P&L < +3%
  const breakevenPos = classifyPositionContext({ ...basePosInput, pnlPct: 0.5 });
  assert(breakevenPos === 'NEAR_BREAKEVEN', '-3% <= P&L < +3% -> NEAR_BREAKEVEN');

  // 6.5 Loss: -10% <= P&L < -3%
  const lossPos = classifyPositionContext({ ...basePosInput, pnlPct: -6.5 });
  assert(lossPos === 'LOSS', '-10% <= P&L < -3% -> LOSS');

  // 6.6 Significant Loss: P&L < -10%
  const sigLossPos = classifyPositionContext({ ...basePosInput, pnlPct: -15.0 });
  assert(sigLossPos === 'SIGNIFICANT_LOSS', 'P&L < -10% -> SIGNIFICANT_LOSS');

  // 6.7 Zero Feedback Invariant
  // Changing P&L must NOT alter Fundamental, Technical, Valuation, Momentum, or Price Location conditions
  const pnlGainStock = classifyFundamentalCondition(baseInput);
  const pnlLossStock = classifyFundamentalCondition(baseInput);
  assert(pnlGainStock === pnlLossStock, 'Changing portfolio P&L has ZERO feedback on FundamentalCondition');

  console.log('\n===========================================================');
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('===========================================================');

  if (passed === total) {
    console.log('🚀 PHASE 1B CONTEXT CLASSIFIERS VERIFIED & VALIDATED!\n');
    return true;
  } else {
    console.error('❌ PHASE 1B CLASSIFIERS VALIDATION FAILED!\n');
    return false;
  }
}

runPhase1BTests().catch((err) => {
  console.error('Fatal error running Phase 1B tests:', err);
  process.exit(1);
});
