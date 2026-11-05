/**
 * STOCKINSIGHT V2.0 Attention Engine Phase 1D Verification Suite
 * Tests all canonical attention drivers, precedence hierarchy, boundary conditions,
 * watchlist invariants, evidence safety, determinism, and position decoupling.
 */

import { BENCHMARK_STOCKS } from '../api/benchmarkData.ts';
import { StockInsightPipeline } from '../engine/index.ts';
import { ContextInputAdapter, PositionContextAdapter } from '../engine/contextAdapters.ts';
import {
  classifyFundamentalCondition,
  classifyTechnicalCondition,
  classifyPriceLocation,
} from '../engine/contextClassifiers.ts';
import { evaluateRelationship } from '../engine/contextRelationships.ts';
import { evaluateAttention } from '../engine/contextAttention.ts';
import {
  ContextInput,
  PositionContextInput,
  RelationshipResult,
  PriceLocation,
  AttentionLevel,
  AttentionDriverType,
} from '../types/context.ts';

async function runPhase1DTests() {
  console.log('===========================================================');
  console.log('       STOCKINSIGHT V2.0 ATTENTION ENGINE (PHASE 1D)       ');
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

  // Helper baseline objects
  const relEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE']);
  const baseInput: ContextInput = {
    ...ContextInputAdapter.fromEvaluation(relEval),
    priceStructure: {
      ltp: 2950,
      e1: 2900,
      e2: null,
      e3: null,
      s1: 2800,
      s2: null,
      s3: null,
      t1: 3100,
      t2: null,
      t3: 3300,
      atr14: 50,
      maxEntry: 3000,
      state: 'AVAILABLE',
    },
    integrity: {
      status: 'PASSED',
      isQuarantined: false,
      reasons: [],
    },
    safety: {
      accrualTrapPenaltyActive: false,
      fundamentalFloorFailed: false,
      highSlippageRisk: false,
    },
  };

  const unheldPosition: PositionContextInput = {
    is_held: false,
    symbol: 'RELIANCE',
    quantity: null,
    averageBuyPrice: null,
    currentLtp: 2950,
    investedValue: null,
    currentValue: null,
    pnl: null,
    pnlPct: null,
    stopLoss: null,
    stopBreached: false,
    accrualTrapGain: false,
  };

  const heldPosition: PositionContextInput = {
    is_held: true,
    symbol: 'RELIANCE',
    quantity: 50,
    averageBuyPrice: 2850,
    currentLtp: 2950,
    investedValue: 142500,
    currentValue: 147500,
    pnl: 5000,
    pnlPct: 3.51,
    stopLoss: 2800,
    stopBreached: false,
    accrualTrapGain: false,
  };

  const normalRelationship: RelationshipResult = evaluateRelationship('STRONG', 'STRONG'); // Cell 01 (P2)
  const p1Relationship: RelationshipResult = evaluateRelationship('STRONG', 'WEAK'); // Cell 05 (P1)
  const cell30Relationship: RelationshipResult = evaluateRelationship('INCOMPLETE', 'INCOMPLETE'); // Cell 30 (P5)

  // ============================================================
  // TEST GROUP 1: BASELINE NORMAL STATE
  // ============================================================
  console.log('--- TEST GROUP 1: BASELINE NORMAL STATE ---');

  const normalRes = evaluateAttention(baseInput, unheldPosition, normalRelationship, 'SUPPORT');
  assert(normalRes.level === 'NORMAL', 'Baseline unheld asset evaluates to AttentionLevel: NORMAL');
  assert(normalRes.primaryDriver === 'NONE', 'Baseline primary driver is NONE');
  assert(normalRes.drivers.length === 1 && normalRes.drivers[0].type === 'NONE', 'Baseline drivers contains only NONE');
  assert(normalRes.isHeldAlert === false, 'Baseline isHeldAlert is false');

  const normalHeldRes = evaluateAttention(baseInput, heldPosition, normalRelationship, 'SUPPORT');
  assert(normalHeldRes.level === 'NORMAL', 'Held asset within safe envelope evaluates to AttentionLevel: NORMAL');

  // ============================================================
  // TEST GROUP 2: CRITICAL DRIVERS
  // ============================================================
  console.log('\n--- TEST GROUP 2: CRITICAL DRIVERS ---');

  // 1. CRITICAL_STOP_BREACH (LTP < S1 on held position)
  const breachedInput: ContextInput = {
    ...baseInput,
    priceStructure: { ...baseInput.priceStructure, ltp: 2750, s1: 2800 },
  };
  const breachRes = evaluateAttention(breachedInput, heldPosition, normalRelationship, 'SUPPORT');
  assert(breachRes.level === 'CRITICAL', 'LTP < S1 on held position triggers AttentionLevel: CRITICAL');
  assert(breachRes.primaryDriver === 'CRITICAL_STOP_BREACH', 'Primary driver is CRITICAL_STOP_BREACH');
  assert(breachRes.isHeldAlert === true, 'isHeldAlert is true on stop breach');

  // 2. DATA_QUARANTINE (integrity.status === 'QUARANTINED')
  const quarantinedInput: ContextInput = {
    ...baseInput,
    integrity: { ...baseInput.integrity, status: 'QUARANTINED', isQuarantined: true },
  };
  const quarantineRes = evaluateAttention(quarantinedInput, unheldPosition, normalRelationship, 'SUPPORT');
  assert(quarantineRes.level === 'CRITICAL', 'integrity.status === "QUARANTINED" triggers AttentionLevel: CRITICAL');
  assert(quarantineRes.primaryDriver === 'DATA_QUARANTINE', 'Primary driver is DATA_QUARANTINE');
  assert(quarantineRes.isHeldAlert === false, 'isHeldAlert is false on data quarantine');

  // ============================================================
  // TEST GROUP 3: HIGH_ATTENTION DRIVERS
  // ============================================================
  console.log('\n--- TEST GROUP 3: HIGH_ATTENTION DRIVERS ---');

  // 3. STOP_APPROACHING (S1 <= LTP <= S1 + 0.50 ATR14 on held position)
  // S1 = 2800, ATR14 = 50 -> Buffer = 2800 to 2825. LTP = 2815 -> in buffer
  const approachingInput: ContextInput = {
    ...baseInput,
    priceStructure: { ...baseInput.priceStructure, ltp: 2815, s1: 2800, atr14: 50 },
  };
  const approachingRes = evaluateAttention(approachingInput, heldPosition, normalRelationship, 'SUPPORT');
  assert(approachingRes.level === 'HIGH_ATTENTION', 'LTP in stop buffer triggers AttentionLevel: HIGH_ATTENTION');
  assert(approachingRes.primaryDriver === 'STOP_APPROACHING', 'Primary driver is STOP_APPROACHING');
  assert(approachingRes.isHeldAlert === true, 'isHeldAlert is true on stop approaching');

  // 4. DATA_INSUFFICIENT (Relationship Cell 30: INCOMPLETE x INCOMPLETE)
  const cell30Res = evaluateAttention(baseInput, unheldPosition, cell30Relationship, 'SUPPORT');
  assert(cell30Res.level === 'HIGH_ATTENTION', 'Relationship Cell 30 triggers AttentionLevel: HIGH_ATTENTION');
  assert(cell30Res.primaryDriver === 'DATA_INSUFFICIENT', 'Primary driver is DATA_INSUFFICIENT');

  // ============================================================
  // TEST GROUP 4: WATCH DRIVERS
  // ============================================================
  console.log('\n--- TEST GROUP 4: WATCH DRIVERS ---');

  // 5. ACCRUAL_TRAP (accrualTrapPenaltyActive === true)
  const accrualInput: ContextInput = {
    ...baseInput,
    safety: { ...baseInput.safety, accrualTrapPenaltyActive: true },
  };
  const accrualRes = evaluateAttention(accrualInput, unheldPosition, normalRelationship, 'SUPPORT');
  assert(accrualRes.level === 'WATCH', 'accrualTrapPenaltyActive === true triggers AttentionLevel: WATCH');
  assert(accrualRes.primaryDriver === 'ACCRUAL_TRAP', 'Primary driver is ACCRUAL_TRAP');

  // 6. PRICE_EXTENDED (PriceLocation === EXTENDED / LTP > MaxEntry)
  const extendedInput: ContextInput = {
    ...baseInput,
    priceStructure: { ...baseInput.priceStructure, ltp: 3050, maxEntry: 3000 },
  };
  const extendedRes = evaluateAttention(extendedInput, unheldPosition, normalRelationship, 'EXTENDED');
  assert(extendedRes.level === 'WATCH', 'PriceLocation: EXTENDED triggers AttentionLevel: WATCH');
  assert(extendedRes.primaryDriver === 'PRICE_EXTENDED', 'Primary driver is PRICE_EXTENDED');

  // 7. ANALYTICAL_DIVERGENCE (Relationship Priority P1: Cells 05, 19, 22, 23)
  const p1Res = evaluateAttention(baseInput, unheldPosition, p1Relationship, 'SUPPORT');
  assert(p1Res.level === 'WATCH', 'Relationship Priority P1 triggers AttentionLevel: WATCH (Never CRITICAL)');
  assert(p1Res.primaryDriver === 'ANALYTICAL_DIVERGENCE', 'Primary driver is ANALYTICAL_DIVERGENCE');

  // ============================================================
  // TEST GROUP 5: MULTI-DRIVER PRECEDENCE RESOLUTION
  // ============================================================
  console.log('\n--- TEST GROUP 5: MULTI-DRIVER PRECEDENCE RESOLUTION ---');

  // Precedence Case A: Stop Breach (P1) + Data Insufficient (P4) + Accrual Trap (P5)
  const multiInputA: ContextInput = {
    ...baseInput,
    priceStructure: { ...baseInput.priceStructure, ltp: 2750, s1: 2800 },
    safety: { ...baseInput.safety, accrualTrapPenaltyActive: true },
  };
  const multiResA = evaluateAttention(multiInputA, heldPosition, cell30Relationship, 'SUPPORT');
  assert(multiResA.level === 'CRITICAL', 'Multi-driver A has level CRITICAL');
  assert(multiResA.primaryDriver === 'CRITICAL_STOP_BREACH', 'Primary driver is CRITICAL_STOP_BREACH (P1 > P4 > P5)');
  assert(multiResA.drivers.length === 3, 'All 3 active drivers are preserved in drivers array');
  assert(
    multiResA.drivers[0].type === 'CRITICAL_STOP_BREACH' &&
    multiResA.drivers[1].type === 'DATA_INSUFFICIENT' &&
    multiResA.drivers[2].type === 'ACCRUAL_TRAP',
    'Drivers are sorted strictly by locked descending precedence'
  );

  // Precedence Case B: Data Quarantine (P2) vs Stop Approaching (P3)
  const multiInputB: ContextInput = {
    ...baseInput,
    priceStructure: { ...baseInput.priceStructure, ltp: 2815, s1: 2800, atr14: 50 },
    integrity: { ...baseInput.integrity, status: 'QUARANTINED' },
  };
  const multiResB = evaluateAttention(multiInputB, heldPosition, normalRelationship, 'SUPPORT');
  assert(multiResB.level === 'CRITICAL', 'Data Quarantine + Stop Approaching yields CRITICAL');
  assert(multiResB.primaryDriver === 'DATA_QUARANTINE', 'DATA_QUARANTINE (P2) takes precedence over STOP_APPROACHING (P3)');

  // Precedence Case C: Stop Approaching (P3) vs Accrual Trap (P6) vs P1 Divergence (P8)
  const multiResC = evaluateAttention(approachingInput, heldPosition, p1Relationship, 'SUPPORT');
  assert(multiResC.level === 'HIGH_ATTENTION', 'Stop Approaching + P1 Divergence yields HIGH_ATTENTION');
  assert(multiResC.primaryDriver === 'STOP_APPROACHING', 'STOP_APPROACHING (P3) takes precedence over ANALYTICAL_DIVERGENCE (P8)');

  // Precedence Case D: Accrual Trap (P6) vs Price Extended (P7) vs P1 Divergence (P8)
  const multiInputD: ContextInput = {
    ...baseInput,
    priceStructure: { ...baseInput.priceStructure, ltp: 3050, maxEntry: 3000 },
    safety: { ...baseInput.safety, accrualTrapPenaltyActive: true },
  };
  const multiResD = evaluateAttention(multiInputD, unheldPosition, p1Relationship, 'EXTENDED');
  assert(multiResD.level === 'WATCH', 'Accrual Trap + Price Extended + P1 Divergence yields WATCH');
  assert(multiResD.primaryDriver === 'ACCRUAL_TRAP', 'ACCRUAL_TRAP (P6) takes precedence over PRICE_EXTENDED (P7) and ANALYTICAL_DIVERGENCE (P8)');
  assert(multiResD.drivers.length === 3, 'All 3 Watch drivers preserved');

  // ============================================================
  // TEST GROUP 6: WATCHLIST & UNHELD ASSET INVARIANTS
  // ============================================================
  console.log('\n--- TEST GROUP 6: WATCHLIST & UNHELD ASSET INVARIANTS ---');

  // Unheld stock trading below S1 (LTP < S1) MUST NOT trigger CRITICAL_STOP_BREACH
  const unheldBelowS1 = evaluateAttention(breachedInput, unheldPosition, normalRelationship, 'SUPPORT');
  assert(unheldBelowS1.level === 'NORMAL', 'Unheld stock with LTP < S1 does NOT trigger CRITICAL_STOP_BREACH (Capped at NORMAL/WATCH)');
  assert(unheldBelowS1.primaryDriver === 'NONE', 'Unheld stock with LTP < S1 primary driver is NONE');
  assert(unheldBelowS1.isHeldAlert === false, 'isHeldAlert is false for unheld asset');

  // Unheld stock trading in stop buffer MUST NOT trigger STOP_APPROACHING
  const unheldInBuffer = evaluateAttention(approachingInput, unheldPosition, normalRelationship, 'SUPPORT');
  assert(unheldInBuffer.level === 'NORMAL', 'Unheld stock in stop buffer does NOT trigger STOP_APPROACHING');
  assert(unheldInBuffer.primaryDriver === 'NONE', 'Unheld stock in stop buffer primary driver is NONE');

  // Unheld stock with DATA_QUARANTINE still triggers CRITICAL
  const unheldQuarantine = evaluateAttention(quarantinedInput, unheldPosition, normalRelationship, 'SUPPORT');
  assert(unheldQuarantine.level === 'CRITICAL', 'Unheld stock with DATA_QUARANTINE still triggers CRITICAL');
  assert(unheldQuarantine.primaryDriver === 'DATA_QUARANTINE', 'Unheld stock DATA_QUARANTINE primary driver is DATA_QUARANTINE');

  // ============================================================
  // TEST GROUP 7: BOUNDARY CONDITIONS
  // ============================================================
  console.log('\n--- TEST GROUP 7: BOUNDARY CONDITIONS ---');

  // S1 = 2800, ATR14 = 50 -> Stop buffer: [2800, 2825]
  // Boundary 1: LTP exactly equal to S1 (2800) -> STOP_APPROACHING
  const ltpAtS1Input: ContextInput = {
    ...baseInput,
    priceStructure: { ...baseInput.priceStructure, ltp: 2800, s1: 2800, atr14: 50 },
  };
  const atS1Res = evaluateAttention(ltpAtS1Input, heldPosition, normalRelationship, 'SUPPORT');
  assert(atS1Res.primaryDriver === 'STOP_APPROACHING', 'LTP exactly equal to S1 (2800) is STOP_APPROACHING (LTP >= S1)');

  // Boundary 2: LTP just below S1 (2799.99) -> CRITICAL_STOP_BREACH
  const ltpBelowS1Input: ContextInput = {
    ...baseInput,
    priceStructure: { ...baseInput.priceStructure, ltp: 2799.99, s1: 2800, atr14: 50 },
  };
  const belowS1Res = evaluateAttention(ltpBelowS1Input, heldPosition, normalRelationship, 'SUPPORT');
  assert(belowS1Res.primaryDriver === 'CRITICAL_STOP_BREACH', 'LTP just below S1 (2799.99) is CRITICAL_STOP_BREACH (LTP < S1)');

  // Boundary 3: LTP exactly S1 + 0.50 ATR14 (2825.00) -> STOP_APPROACHING
  const ltpAtBufferEdgeInput: ContextInput = {
    ...baseInput,
    priceStructure: { ...baseInput.priceStructure, ltp: 2825.00, s1: 2800, atr14: 50 },
  };
  const atBufferEdgeRes = evaluateAttention(ltpAtBufferEdgeInput, heldPosition, normalRelationship, 'SUPPORT');
  assert(atBufferEdgeRes.primaryDriver === 'STOP_APPROACHING', 'LTP exactly at buffer edge S1 + 0.50 ATR (2825.00) is STOP_APPROACHING');

  // Boundary 4: LTP just above buffer edge (2825.01) -> NORMAL
  const ltpAboveBufferEdgeInput: ContextInput = {
    ...baseInput,
    priceStructure: { ...baseInput.priceStructure, ltp: 2825.01, s1: 2800, atr14: 50 },
  };
  const aboveBufferEdgeRes = evaluateAttention(ltpAboveBufferEdgeInput, heldPosition, normalRelationship, 'SUPPORT');
  assert(aboveBufferEdgeRes.primaryDriver === 'NONE', 'LTP just above buffer edge (2825.01) is NORMAL (NONE)');

  // Boundary 5: LTP exactly MaxEntry (3000.00) -> NORMAL (LTP > MaxEntry required for EXTENDED)
  const ltpAtMaxEntryInput: ContextInput = {
    ...baseInput,
    priceStructure: { ...baseInput.priceStructure, ltp: 3000.00, maxEntry: 3000.00 },
  };
  const atMaxEntryRes = evaluateAttention(ltpAtMaxEntryInput, unheldPosition, normalRelationship, 'RESISTANCE');
  assert(atMaxEntryRes.primaryDriver === 'NONE', 'LTP exactly equal to MaxEntry (3000.00) is NOT extended');

  // Boundary 6: LTP just above MaxEntry (3000.01) -> PRICE_EXTENDED
  const ltpAboveMaxEntryInput: ContextInput = {
    ...baseInput,
    priceStructure: { ...baseInput.priceStructure, ltp: 3000.01, maxEntry: 3000.00 },
  };
  const aboveMaxEntryRes = evaluateAttention(ltpAboveMaxEntryInput, unheldPosition, normalRelationship, 'EXTENDED');
  assert(aboveMaxEntryRes.primaryDriver === 'PRICE_EXTENDED', 'LTP just above MaxEntry (3000.01) is PRICE_EXTENDED');

  // ============================================================
  // TEST GROUP 8: ETF & MISSING DATA SAFETY
  // ============================================================
  console.log('\n--- TEST GROUP 8: ETF & MISSING DATA SAFETY ---');

  // ETF asset with INCOMPLETE fundamentals evaluates to NORMAL / NONE
  const etfEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['GOLDBEES']);
  const etfInput = ContextInputAdapter.fromEvaluation(etfEval);
  const etfRel = evaluateRelationship('INCOMPLETE', 'STRONG'); // Cell 25 (P4)
  const etfAttention = evaluateAttention(etfInput, unheldPosition, etfRel, 'SUPPORT');
  assert(etfAttention.level === 'NORMAL', 'ETF asset with NOT_APPLICABLE fundamentals evaluates to AttentionLevel: NORMAL');
  assert(etfAttention.primaryDriver === 'NONE', 'ETF asset primary driver is NONE');

  // Single-axis incomplete (Cells 06, 12, 18, 24) evaluates to NORMAL (suppressed)
  const singleIncompleteRel = evaluateRelationship('STRONG', 'INCOMPLETE'); // Cell 06 (P5)
  const singleIncompleteAttention = evaluateAttention(baseInput, unheldPosition, singleIncompleteRel, 'SUPPORT');
  assert(singleIncompleteAttention.level === 'NORMAL', 'Single-axis incomplete technical evaluates to NORMAL (no false alarm)');

  // TARGET_PROXIMITY strictly absent check
  assert(
    !('TARGET_PROXIMITY' in (normalRes as any)) &&
    normalRes.drivers.every(d => (d.type as string) !== 'TARGET_PROXIMITY'),
    'TARGET_PROXIMITY is strictly excluded from Phase 1D AttentionDriverType'
  );

  // ============================================================
  // TEST GROUP 9: DETERMINISM, IMMUTABILITY & LANGUAGE SAFETY
  // ============================================================
  console.log('\n--- TEST GROUP 9: DETERMINISM & LANGUAGE SAFETY ---');

  const detRes1 = evaluateAttention(baseInput, heldPosition, normalRelationship, 'SUPPORT');
  const detRes2 = evaluateAttention(baseInput, heldPosition, normalRelationship, 'SUPPORT');
  assert(
    JSON.stringify(detRes1) === JSON.stringify(detRes2),
    'Deterministic execution: identical inputs always yield identical outputs'
  );

  // Immutability: Mutating output does not affect future evaluations
  const mutRes = evaluateAttention(baseInput, heldPosition, normalRelationship, 'SUPPORT');
  (mutRes as any).level = 'CRITICAL';
  (mutRes as any).primaryDriver = 'CRITICAL_STOP_BREACH';
  const freshRes = evaluateAttention(baseInput, heldPosition, normalRelationship, 'SUPPORT');
  assert(
    freshRes.level === 'NORMAL' && freshRes.primaryDriver === 'NONE',
    'Immutability: mutating output object does not affect future evaluation results'
  );

  // Evidence-safe language audit
  const forbiddenTerms = [
    'buy', 'sell', 'accumulate', 'exit', 're-enter', 'wait for',
    'should buy', 'should sell', 'will recover', 'will fall',
    'reversal expected', 'temporary correction', 'breakout expected',
    'smart money', 'institutional', 'target reached'
  ];

  let violations = 0;
  const sampleResults = [normalRes, breachRes, quarantineRes, approachingRes, cell30Res, accrualRes, extendedRes, p1Res];
  for (const res of sampleResults) {
    for (const d of res.drivers) {
      const descLower = d.description.toLowerCase();
      for (const term of forbiddenTerms) {
        if (descLower.includes(term)) {
          violations++;
          console.error(`Violation in Driver ${d.type}: contains forbidden term "${term}"`);
        }
      }
    }
  }
  assert(violations === 0, 'Zero forbidden/recommendation/predictive terms across all driver descriptions');

  // ============================================================
  // TEST GROUP 10: BENCHMARK STOCKS INTEGRATION
  // ============================================================
  console.log('\n--- TEST GROUP 10: BENCHMARK STOCKS INTEGRATION ---');

  for (const [symbol, benchmark] of Object.entries(BENCHMARK_STOCKS)) {
    const evalResult = StockInsightPipeline.evaluate(benchmark);
    const contextInput = ContextInputAdapter.fromEvaluation(evalResult);
    const positionInput = PositionContextAdapter.fromHoldingWithEvaluation(null);
    const fundCond = classifyFundamentalCondition(contextInput);
    const techCond = classifyTechnicalCondition(contextInput);
    const priceLoc = classifyPriceLocation(contextInput);
    const relationship = evaluateRelationship(fundCond, techCond);
    const attention = evaluateAttention(contextInput, positionInput, relationship, priceLoc);

    assert(
      ['NORMAL', 'WATCH', 'HIGH_ATTENTION', 'CRITICAL'].includes(attention.level) &&
      !!attention.primaryDriver &&
      attention.drivers.length >= 1,
      `Benchmark stock ${symbol} evaluated through full V2.0 Context Engine: Level ${attention.level} (${attention.primaryDriver})`
    );
  }


  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n===========================================================');
  console.log(`TOTAL ATTENTION TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('===========================================================');

  if (passed === total) {
    console.log('🌟 ALL PHASE 1D ATTENTION ENGINE TESTS VERIFIED & PASSED!\n');
  } else {
    console.error('💥 SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runPhase1DTests().catch(err => {
  console.error('Fatal error in Phase 1D tests:', err);
  process.exit(1);
});
