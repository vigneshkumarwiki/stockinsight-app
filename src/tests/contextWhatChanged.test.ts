/**
 * STOCKINSIGHT V2.0 What Changed Engine Phase 1E Verification Suite
 * Tests 8 tracked categorical dimensions, CoreScore delta (|ΔCoreScore| >= 3),
 * Day-0 cold-start invariants, corrupted snapshot fallback, noise filtering,
 * ETF fundamental delta suppression, and evidence-safe wording.
 */

import { evaluateWhatChanged } from '../engine/contextWhatChanged.ts';
import {
  StockContextEvaluation,
  StateTransition,
  WhatChangedResult,
} from '../types/context.ts';

async function runWhatChangedTests() {
  console.log('===========================================================');
  console.log('       STOCKINSIGHT V2.0 WHAT CHANGED ENGINE (PHASE 1E)    ');
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

  // Base mock evaluation snapshot
  const baseEval: StockContextEvaluation = {
    fundamental_condition: 'STRONG',
    technical_condition: 'STRONG',
    valuation_condition: 'REASONABLE',
    momentum_condition: 'HEALTHY',
    momentum_state: 'AVAILABLE',
    price_location: 'SUPPORT',
    position: {
      is_held: false,
      context: null,
      pnlPct: null,
      averageBuyPrice: null,
    },
    attention_level: 'NORMAL',
    modifiers: [],
  };

  const testDate = '2026-09-28';

  // ============================================================
  // TEST GROUP 1: DAY-0 / COLD-START INVARIANTS
  // ============================================================
  console.log('--- TEST GROUP 1: DAY-0 / COLD-START INVARIANTS ---');

  const coldStartRes = evaluateWhatChanged(baseEval, null, 42, null, testDate);
  assert(coldStartRes.isColdStart === true, 'previous === null produces isColdStart: true');
  assert(coldStartRes.hasChanged === false, 'Cold start produces hasChanged: false');
  assert(coldStartRes.transitions.length === 0, 'Cold start produces transitions: []');
  assert(coldStartRes.scoreDelta === null, 'Cold start produces scoreDelta: null');
  assert(
    coldStartRes.summary === `Baseline established on ${testDate}. Delta tracking active for subsequent sessions.`,
    'Cold start produces exact canonical baseline summary'
  );
  assert(coldStartRes.evaluatedAt === testDate, 'evaluatedAt date is preserved');

  // ============================================================
  // TEST GROUP 2: INVALID / CORRUPTED SNAPSHOT FALLBACK
  // ============================================================
  console.log('\n--- TEST GROUP 2: INVALID SNAPSHOT FALLBACK ---');

  const invalidSnapshotRes = evaluateWhatChanged(baseEval, {} as any, 42, 40, testDate);
  assert(invalidSnapshotRes.isColdStart === true, 'Corrupted snapshot falls back to isColdStart: true');
  assert(invalidSnapshotRes.hasChanged === false, 'Corrupted snapshot produces hasChanged: false');
  assert(invalidSnapshotRes.transitions.length === 0, 'Corrupted snapshot produces transitions: []');

  // ============================================================
  // TEST GROUP 3: NOISE FILTERING & ZERO-CHANGE CASE
  // ============================================================
  console.log('\n--- TEST GROUP 3: NOISE FILTERING ---');

  // Identical snapshot with minor sub-threshold score tick (+1 pt)
  const noChangeRes = evaluateWhatChanged(baseEval, { ...baseEval }, 41, 40, testDate);
  assert(noChangeRes.hasChanged === false, 'Sub-threshold score change (|Δ| = 1) without categorical shift yields hasChanged: false');
  assert(noChangeRes.transitions.length === 0, 'Sub-threshold score change produces transitions: []');
  assert(noChangeRes.summary === 'No material analytical state change observed.', 'Produces exact noise-filter summary');
  assert(noChangeRes.scoreDelta === 1, 'scoreDelta is accurately calculated (1)');

  // ============================================================
  // TEST GROUP 4: 8 CATEGORICAL DIMENSIONS INDIVIDUALLY TESTED
  // ============================================================
  console.log('\n--- TEST GROUP 4: 8 CATEGORICAL DIMENSIONS ---');

  // 1. FundamentalCondition (STRONG -> HEALTHY)
  const fChange = evaluateWhatChanged(
    { ...baseEval, fundamental_condition: 'HEALTHY' },
    baseEval,
    35,
    35,
    testDate
  );
  assert(fChange.hasChanged === true, 'Fundamental change triggers hasChanged: true');
  assert(
    fChange.transitions.some(t => t.dimension === 'Fundamental Condition' && t.from === 'STRONG' && t.to === 'HEALTHY'),
    'Fundamental transition recorded: STRONG -> HEALTHY'
  );

  // 2. TechnicalCondition (STRONG -> WEAKENING)
  const tChange = evaluateWhatChanged(
    { ...baseEval, technical_condition: 'WEAKENING' },
    baseEval,
    30,
    30,
    testDate
  );
  assert(
    tChange.transitions.some(t => t.dimension === 'Technical Condition' && t.from === 'STRONG' && t.to === 'WEAKENING'),
    'Technical transition recorded: STRONG -> WEAKENING'
  );

  // 3. ValuationCondition (REASONABLE -> ELEVATED)
  const vChange = evaluateWhatChanged(
    { ...baseEval, valuation_condition: 'ELEVATED' },
    baseEval,
    30,
    30,
    testDate
  );
  assert(
    vChange.transitions.some(t => t.dimension === 'Valuation Condition' && t.from === 'REASONABLE' && t.to === 'ELEVATED'),
    'Valuation transition recorded: REASONABLE -> ELEVATED'
  );

  // 4. MomentumCondition (HEALTHY -> COOLING)
  const mChange = evaluateWhatChanged(
    { ...baseEval, momentum_condition: 'COOLING' },
    baseEval,
    30,
    30,
    testDate
  );
  assert(
    mChange.transitions.some(t => t.dimension === 'Momentum Condition' && t.from === 'HEALTHY' && t.to === 'COOLING'),
    'Momentum transition recorded: HEALTHY -> COOLING'
  );

  // 5. PriceLocation (SUPPORT -> EXTENDED)
  const pChange = evaluateWhatChanged(
    { ...baseEval, price_location: 'EXTENDED' },
    baseEval,
    30,
    30,
    testDate
  );
  assert(
    pChange.transitions.some(t => t.dimension === 'Price Location' && t.from === 'SUPPORT' && t.to === 'EXTENDED'),
    'Price Location transition recorded: SUPPORT -> EXTENDED'
  );

  // 6. PositionContext (UNHELD -> PROFITABLE)
  const posChange = evaluateWhatChanged(
    {
      ...baseEval,
      position: { is_held: true, context: 'PROFITABLE', pnlPct: 5.0, averageBuyPrice: 2800 },
    },
    baseEval,
    30,
    30,
    testDate
  );
  assert(
    posChange.transitions.some(t => t.dimension === 'Position Context' && t.from === 'UNHELD' && t.to === 'PROFITABLE'),
    'Position Context transition recorded: UNHELD -> PROFITABLE'
  );

  // 7. AttentionLevel (NORMAL -> HIGH_ATTENTION)
  const aChange = evaluateWhatChanged(
    { ...baseEval, attention_level: 'HIGH_ATTENTION' },
    baseEval,
    30,
    30,
    testDate
  );
  assert(
    aChange.transitions.some(t => t.dimension === 'Attention Level' && t.from === 'NORMAL' && t.to === 'HIGH_ATTENTION'),
    'Attention Level transition recorded: NORMAL -> HIGH_ATTENTION'
  );

  // 8. RelationshipArchetype (ALIGNED_HIGH_QUALITY -> QUALITY_IN_PULLBACK)
  const rChange = evaluateWhatChanged(
    { ...baseEval, fundamental_condition: 'STRONG', technical_condition: 'WEAKENING' },
    baseEval,
    30,
    30,
    testDate
  );
  assert(
    rChange.transitions.some(t => t.dimension === 'Relationship Archetype' && t.from === 'ALIGNED_HIGH_QUALITY' && t.to === 'QUALITY_IN_PULLBACK'),
    'Relationship Archetype transition recorded: ALIGNED_HIGH_QUALITY -> QUALITY_IN_PULLBACK'
  );

  // ============================================================
  // TEST GROUP 5: CORESCORE MATERIAL DELTA THRESHOLD (|Δ| >= 3)
  // ============================================================
  console.log('\n--- TEST GROUP 5: CORESCORE MATERIAL DELTA ---');

  // Delta exactly +3 points without categorical change
  const plus3Res = evaluateWhatChanged(baseEval, { ...baseEval }, 43, 40, testDate);
  assert(plus3Res.hasChanged === true, 'Score delta +3 triggers hasChanged: true');
  assert(plus3Res.scoreDelta === 3, 'scoreDelta is +3');
  assert(
    plus3Res.transitions.some(t => t.dimension === 'Core Score' && t.from === '40' && t.to === '43'),
    'Score transition emitted when no categorical shift exists: +3 pts'
  );

  // Delta exactly -3 points without categorical change
  const minus3Res = evaluateWhatChanged(baseEval, { ...baseEval }, 37, 40, testDate);
  assert(minus3Res.hasChanged === true, 'Score delta -3 triggers hasChanged: true');
  assert(minus3Res.scoreDelta === -3, 'scoreDelta is -3');
  assert(
    minus3Res.transitions.some(t => t.dimension === 'Core Score' && t.from === '40' && t.to === '37'),
    'Score transition emitted when no categorical shift exists: -3 pts'
  );

  // Null current score safety
  const nullScoreRes = evaluateWhatChanged(baseEval, { ...baseEval }, null, 40, testDate);
  assert(nullScoreRes.scoreDelta === null, 'Null current score yields scoreDelta: null (Never coerced to 0)');
  assert(nullScoreRes.hasChanged === false, 'Null current score without categorical shift yields hasChanged: false');

  // Null previous score safety
  const nullPrevScoreRes = evaluateWhatChanged(baseEval, { ...baseEval }, 40, null, testDate);
  assert(nullPrevScoreRes.scoreDelta === null, 'Null previous score yields scoreDelta: null');

  // ============================================================
  // TEST GROUP 6: ETF FUNDAMENTAL DELTA SUPPRESSION
  // ============================================================
  console.log('\n--- TEST GROUP 6: ETF FUNDAMENTAL DELTA SUPPRESSION ---');

  // When isETF === true, changing fundamental_condition MUST be ignored
  const etfPrev: StockContextEvaluation = { ...baseEval, fundamental_condition: 'INCOMPLETE' };
  const etfCurr: StockContextEvaluation = { ...baseEval, fundamental_condition: 'STRONG' }; // Hypothetical raw change
  const etfRes = evaluateWhatChanged(etfCurr, etfPrev, 20, 20, testDate, true);
  assert(
    !etfRes.transitions.some(t => t.dimension === 'Fundamental Condition'),
    'ETF: Fundamental Condition transitions are strictly suppressed'
  );

  // ============================================================
  // TEST GROUP 7: MULTIPLE TRANSITIONS COMPOSITION
  // ============================================================
  console.log('\n--- TEST GROUP 7: MULTIPLE TRANSITIONS ---');

  const multiChangeEval: StockContextEvaluation = {
    ...baseEval,
    technical_condition: 'WEAKENING',
    price_location: 'EXTENDED',
    attention_level: 'WATCH',
  };
  const multiChangeRes = evaluateWhatChanged(multiChangeEval, baseEval, 35, 40, testDate);
  assert(multiChangeRes.hasChanged === true, 'Multiple transitions trigger hasChanged: true');
  assert(multiChangeRes.transitions.length >= 3, 'Multiple transitions recorded');
  assert(multiChangeRes.scoreDelta === -5, 'Score delta is -5');

  // ============================================================
  // TEST GROUP 8: LANGUAGE SAFETY AUDIT
  // ============================================================
  console.log('\n--- TEST GROUP 8: LANGUAGE SAFETY AUDIT ---');

  const forbiddenTerms = [
    'buy', 'sell', 'accumulate', 'exit', 're-enter', 'wait for',
    'will recover', 'will fall', 'reversal expected', 'temporary correction',
    'smart money', 'institutional', 'caused by', 'driven by'
  ];

  let violations = 0;
  const sampleSummaries = [
    coldStartRes.summary, noChangeRes.summary, fChange.summary,
    tChange.summary, plus3Res.summary, multiChangeRes.summary
  ];

  for (const sum of sampleSummaries) {
    const textLower = sum.toLowerCase();
    for (const term of forbiddenTerms) {
      if (textLower.includes(term)) {
        violations++;
        console.error(`Violation in summary "${sum}": contains forbidden term "${term}"`);
      }
    }
  }
  assert(violations === 0, 'Zero forbidden/recommendation/predictive/causal terms across What Changed summaries');

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n===========================================================');
  console.log(`TOTAL WHAT CHANGED TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('===========================================================');

  if (passed === total) {
    console.log('🌟 ALL PHASE 1E WHAT CHANGED ENGINE TESTS VERIFIED & PASSED!\n');
  } else {
    console.error('💥 SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runWhatChangedTests().catch(err => {
  console.error('Fatal error in What Changed tests:', err);
  process.exit(1);
});
