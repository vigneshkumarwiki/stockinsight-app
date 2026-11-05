/**
 * STOCKINSIGHT V2.0 Context Engine Phase 1A Foundation Verification Suite
 * Tests canonical type contracts, pure adapters, missing data safety, and position decoupling.
 */

import { BENCHMARK_STOCKS } from '../api/benchmarkData.ts';
import { StockInsightPipeline } from '../engine/index.ts';
import { ContextInputAdapter, PositionContextAdapter } from '../engine/contextAdapters.ts';
import { StockInsightEvaluation } from '../types/engine.ts';
import { Holding, HoldingWithEvaluation } from '../types/portfolio.ts';
import {
  FundamentalCondition,
  TechnicalCondition,
  ValuationCondition,
  MomentumCondition,
  PriceLocation,
  PositionContext,
  AttentionLevel,
} from '../types/context.ts';

async function runPhase1ATests() {
  console.log('===========================================================');
  console.log('       STOCKINSIGHT V2.0 CONTEXT FOUNDATION (PHASE 1A)     ');
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

  // ============================================================
  // TEST GROUP 1: CANONICAL ENUM INTEGRITY & PROHIBITED STATES
  // ============================================================
  console.log('--- TEST GROUP 1: CANONICAL ENUM INTEGRITY ---');

  const validFundamental: FundamentalCondition[] = ['STRONG', 'HEALTHY', 'MIXED', 'WEAK', 'INCOMPLETE'];
  const validTechnical: TechnicalCondition[] = ['STRONG', 'POSITIVE', 'STABLE', 'WEAKENING', 'WEAK', 'INCOMPLETE'];
  const validValuation: ValuationCondition[] = ['REASONABLE', 'ELEVATED', 'UNAVAILABLE'];
  const validMomentum: MomentumCondition[] = ['IMPROVING', 'HEALTHY', 'COOLING', 'WEAK'];
  const validPriceLocation: PriceLocation[] = ['SUPPORT', 'MID_RANGE', 'RESISTANCE', 'EXTENDED'];
  const validPosition: PositionContext[] = ['STRONGLY_APPRECIATED', 'PROFITABLE', 'NEAR_BREAKEVEN', 'LOSS', 'SIGNIFICANT_LOSS'];
  const validAttention: AttentionLevel[] = ['NORMAL', 'WATCH', 'HIGH_ATTENTION', 'CRITICAL'];

  assert(validFundamental.length === 5, 'Canonical Fundamental states count === 5');
  assert(validTechnical.length === 6, 'Canonical Technical states count === 6');
  assert(validValuation.length === 3, 'Canonical Valuation states count === 3');
  assert(validMomentum.length === 4, 'Canonical Momentum states count === 4');
  assert(validPriceLocation.length === 4, 'Canonical Price Location states count === 4');
  assert(validPosition.length === 5, 'Canonical Position Context states count === 5');
  assert(validAttention.length === 4, 'Canonical Attention levels count === 4');

  // Verify prohibited states are not present
  const prohibitedList = ['ATTRACTIVE', 'DETERIORATING', 'RECOVERING', 'BELOW_SUPPORT', 'EXT-DN', 'BUY', 'SELL', 'ACCUMULATE', 'EXIT', 'STRONG_ACCRUAL_WARN'];
  const allContextEnums: string[] = [
    ...validFundamental,
    ...validTechnical,
    ...validValuation,
    ...validMomentum,
    ...validPriceLocation,
    ...validPosition,
    ...validAttention,
  ];

  const hasProhibited = prohibitedList.some((p) => allContextEnums.includes(p));
  assert(!hasProhibited, 'Prohibited states (BUY, SELL, ATTRACTIVE, EXT-DN, etc.) are strictly excluded');

  // ============================================================
  // TEST GROUP 2: CONTEXT INPUT ADAPTER FIDELITY & IMMUTABILITY
  // ============================================================
  console.log('\n--- TEST GROUP 2: CONTEXT INPUT ADAPTER FIDELITY ---');

  const relEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE']);
  const originalRelJson = JSON.stringify(relEval);

  const contextInput = ContextInputAdapter.fromEvaluation(relEval);

  // Check score preservation
  assert(contextInput.fundamentalScore === relEval.fundamentalScore, 'Preserves fundamentalScore exactly (24 === 24)');
  assert(contextInput.technicalScore === relEval.technicalScore, 'Preserves technicalScore exactly (2 === 2)');
  assert(contextInput.coreScore === relEval.coreScore, 'Preserves coreScore exactly (26 === 26)');
  assert(contextInput.decisionZone === relEval.zone, 'Preserves decisionZone exactly (CAUTION === CAUTION)');

  // Check price structure preservation
  assert(contextInput.priceStructure.ltp === relEval.execution.ltp, 'Preserves execution LTP');
  assert(contextInput.priceStructure.e1 === relEval.priceStructure?.entries.e1.price, 'Preserves Model D E1 price');
  assert(contextInput.priceStructure.s1 === relEval.priceStructure?.stops?.s1.price, 'Preserves Model D S1 price');
  assert(contextInput.priceStructure.t1 === relEval.priceStructure?.targets.t1.price, 'Preserves Model D T1 price');
  assert(contextInput.priceStructure.atr14 === relEval.priceStructure?.metadata.atr14, 'Preserves ATR14 value');

  // Check source immutability
  const postAdaptationRelJson = JSON.stringify(relEval);
  assert(originalRelJson === postAdaptationRelJson, 'ContextInputAdapter does NOT mutate the source evaluation');

  // ============================================================
  // TEST GROUP 3: MISSING DATA SAFETY & ZERO-COERCION BAN
  // ============================================================
  console.log('\n--- TEST GROUP 3: MISSING DATA SAFETY ---');

  const mockEvalMissing: StockInsightEvaluation = {
    ...relEval,
    fundamentalScore: 0,
    technicalScore: 0,
    coreScore: 0,
    fundamentalFactors: [],
    technicalFactors: [],
    priceStructure: undefined,
    execution: {
      ...relEval.execution,
      target: 0,
      stopLoss: 0,
      maxEntry: 0,
      ltp: 0,
    },
  };

  const missingInput = ContextInputAdapter.fromEvaluation(mockEvalMissing);

  assert(missingInput.valuation.pe === null, 'Missing P/E remains null (never coerced to 0)');
  assert(missingInput.valuation.pb === null, 'Missing P/B remains null (never coerced to 0)');
  assert(missingInput.valuation.evEbitda === null, 'Missing EV/EBITDA remains null (never coerced to 0)');
  assert(missingInput.valuation.state === 'MISSING', 'Missing factors yield state === "MISSING"');
  assert(missingInput.momentum.rsi14 === null, 'Missing RSI remains null (never coerced to 0)');
  assert(missingInput.momentum.roc20 === null, 'Missing ROC20 remains null (never coerced to 0)');
  assert(missingInput.momentum.state === 'MISSING', 'Missing momentum yields state === "MISSING"');
  assert(missingInput.priceStructure.e1 === null, 'Missing E1 remains null');
  assert(missingInput.priceStructure.t1 === 0 || missingInput.priceStructure.t1 === null, 'Missing priceStructure T1 is safely handled');
  assert(missingInput.priceStructure.state === 'UNAVAILABLE', 'Missing priceStructure yields state === "UNAVAILABLE"');

  // ============================================================
  // TEST GROUP 4: ETF & NON-REPORTING ASSET SAFETY
  // ============================================================
  console.log('\n--- TEST GROUP 4: ETF & NON-REPORTING ASSET SAFETY ---');

  const goldEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['GOLDBEES']);
  const goldContextInput = ContextInputAdapter.fromEvaluation(goldEval);

  assert(goldContextInput.isETF === true, 'ETF asset correctly identified as isETF === true');
  assert(goldContextInput.valuation.state === 'NOT_APPLICABLE', 'ETF valuation state is NOT_APPLICABLE');
  assert(goldContextInput.valuation.pe === null, 'ETF P/E is null');
  assert(goldContextInput.valuation.pb === null, 'ETF P/B is null');
  assert(goldContextInput.technicalScore === goldEval.technicalScore, 'ETF technicalScore evaluates normally (4 === 4)');
  assert(goldContextInput.priceStructure.e1 !== null, 'ETF Model D price structure evaluates normally');

  // ============================================================
  // TEST GROUP 5: POSITION CONTEXT ADAPTER & DECOUPLING
  // ============================================================
  console.log('\n--- TEST GROUP 5: POSITION CONTEXT ADAPTER & DECOUPLING ---');

  const heldHolding: Holding = {
    id: 'h1',
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries Limited',
    sector: 'Oil & Gas',
    quantity: 50,
    averageBuyPrice: 2500.00,
    addedAt: new Date().toISOString(),
  };

  const heldItem: HoldingWithEvaluation = {
    holding: heldHolding,
    quoteStatus: 'RESOLVED',
    currentLtp: 2950.40,
    investedValue: 125000,
    currentValue: 147520,
    pnl: 22520,
    pnlPercentage: 18.016,
    dayChange: 500,
    dayChangePercentage: 1.0,
    coreScore: 26,
    fundamentalScore: 24,
    technicalScore: 2,
    zone: 'CAUTION',
    stopLoss: 2835.33,
    stopBreached: false,
    accrualTrapGain: false,
    actionBadge: 'HOLD',
    actionExplanation: 'Hold position',
    evaluation: relEval,
  };

  const heldContext = PositionContextAdapter.fromHoldingWithEvaluation(heldItem);

  assert(heldContext.is_held === true, 'Held holding produces is_held === true');
  assert(heldContext.quantity === 50, 'Preserves held quantity (50)');
  assert(heldContext.averageBuyPrice === 2500.00, 'Preserves held averageBuyPrice (2500.00)');
  assert(heldContext.pnlPct === 18.016, 'Preserves P&L % (+18.016%)');
  assert(heldContext.stopLoss === 2835.33, 'Preserves Stop Loss level');
  assert(heldContext.stopBreached === false, 'Preserves stopBreached status (false)');

  // Unheld holding test
  const unheldItem: HoldingWithEvaluation = {
    ...heldItem,
    holding: { ...heldHolding, quantity: 0 },
  };

  const unheldContext = PositionContextAdapter.fromHoldingWithEvaluation(unheldItem);
  assert(unheldContext.is_held === false, 'Quantity === 0 produces is_held === false');
  assert(unheldContext.quantity === null, 'Unheld quantity is null');
  assert(unheldContext.averageBuyPrice === null, 'Unheld averageBuyPrice is null');
  assert(unheldContext.pnlPct === null, 'Unheld pnlPct is null');

  const nullHoldingContext = PositionContextAdapter.fromHoldingWithEvaluation(null);
  assert(nullHoldingContext.is_held === false, 'null holding produces is_held === false');

  // Verify Zero Feedback Invariant
  assert(
    contextInput.fundamentalScore === relEval.fundamentalScore,
    `User P&L (+18%) has ZERO feedback to Fundamental Score (${contextInput.fundamentalScore})`
  );
  assert(
    contextInput.technicalScore === relEval.technicalScore,
    `User P&L (+18%) has ZERO feedback to Technical Score (${contextInput.technicalScore})`
  );
  assert(
    contextInput.coreScore === relEval.coreScore,
    `User P&L (+18%) has ZERO feedback to Core Score (${contextInput.coreScore})`
  );

  console.log('\n===========================================================');
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('===========================================================');

  if (passed === total) {
    console.log('🚀 PHASE 1A CONTEXT FOUNDATION VERIFIED & VALIDATED!\n');
    return true;
  } else {
    console.error('❌ PHASE 1A FOUNDATION VALIDATION FAILED!\n');
    return false;
  }
}

runPhase1ATests().catch((err) => {
  console.error('Fatal error running Phase 1A tests:', err);
  process.exit(1);
});
