/**
 * STOCKINSIGHT V2.0 Phase 2A Session Snapshot & Persistence Test Suite
 * 
 * Strict Invariants:
 * 1. SNAP-01 through SNAP-17 complete coverage.
 * 2. Deterministic execution with zero flaky timing dependencies.
 * 3. 100% assertions against canonical snapshot contract and What Changed integration.
 */

import { SessionResolver } from '../engine/sessionResolver';
import {
  SnapshotSerializer,
  CURRENT_MODEL_VERSION,
  CURRENT_SCHEMA_VERSION,
} from '../engine/snapshotSerializer';
import { SnapshotStore } from '../services/snapshotStore';
import { evaluateWhatChanged } from '../engine/contextWhatChanged';
import { ContextInputAdapter, PositionContextAdapter } from '../engine/contextAdapters';
import { evaluateAttention } from '../engine/contextAttention';
import { evaluateHeadline } from '../engine/contextHeadline';
import { evaluateRelationship } from '../engine/contextRelationships';
import { classifyFundamentalCondition, classifyTechnicalCondition, classifyPriceLocation } from '../engine/contextClassifiers';
import { StockInsightPipeline } from '../engine';
import { BENCHMARK_STOCKS } from '../api/benchmarkData.ts';
import { AnalyticalSnapshot, ContextInput } from '../types/context';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runSnapshotPersistenceTests() {
  console.log('===========================================================');
  console.log('     STOCKINSIGHT V2.0 SESSION SNAPSHOT TESTS (PHASE 2A)   ');
  console.log('===========================================================');

  await SnapshotStore.clearAll();

  // Benchmark setup
  const relEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE']);
  const relContext = ContextInputAdapter.fromEvaluation(relEval);
  const relPos = PositionContextAdapter.fromHoldingWithEvaluation(null);
  const relFundCond = classifyFundamentalCondition(relContext);
  const relTechCond = classifyTechnicalCondition(relContext);
  const relPriceLoc = classifyPriceLocation(relContext);
  const relRel = evaluateRelationship(relFundCond, relTechCond);
  const relAtt = evaluateAttention(relContext, relPos, relRel, relPriceLoc);
  const relHead = evaluateHeadline(relRel, relAtt, false);

  // ============================================================
  // SNAP-01: CREATE VALID SNAPSHOT
  // ============================================================
  console.log('\n--- SNAP-01: CREATE VALID SNAPSHOT ---');
  const snapshotT1 = SnapshotSerializer.serialize({
    evaluation: relEval,
    contextInput: relContext,
    attentionResult: relAtt,
    headlineResult: relHead,
    holding: null,
    tradingSessionId: '2026-09-25',
    sessionState: 'CLOSED_OVERNIGHT',
    evaluatedAt: new Date('2026-09-25T16:00:00+05:30'),
  });

  assert(SnapshotSerializer.validate(snapshotT1), 'SNAP-01: Snapshot passes structural validation');
  assert(snapshotT1.isin === 'INE002A01018', 'SNAP-01: ISIN matches authoritative context');
  assert(snapshotT1.symbol === 'RELIANCE', 'SNAP-01: Symbol matches');
  assert(snapshotT1.coreScore === relEval.coreScore, 'SNAP-01: Core score accurately serialized');
  assert(snapshotT1.modelVersion === CURRENT_MODEL_VERSION, 'SNAP-01: Model version is 2.0.0');
  assert(snapshotT1.schemaVersion === CURRENT_SCHEMA_VERSION, 'SNAP-01: Schema version is 1');

  // ============================================================
  // SNAP-02: CANONICAL SNAPSHOT ID
  // ============================================================
  console.log('\n--- SNAP-02: CANONICAL SNAPSHOT ID ---');
  assert(
    snapshotT1.snapshotId === 'INE002A01018_2026-09-25',
    'SNAP-02: Snapshot primary key is strictly ${isin}_${tradingSessionId}'
  );

  // ============================================================
  // SNAP-03: SAME-SESSION REFRESH DOES NOT CREATE DUPLICATES
  // ============================================================
  console.log('\n--- SNAP-03: SAME-SESSION DEDUPLICATION ---');
  await SnapshotStore.saveSnapshot(snapshotT1);

  // Simulate intra-day refreshes at 10:00, 11:30, 14:00 on the same date
  const refresh1 = { ...snapshotT1, evaluatedAt: '2026-09-25T10:00:00.000Z' };
  const refresh2 = { ...snapshotT1, evaluatedAt: '2026-09-25T11:30:00.000Z' };
  const refresh3 = { ...snapshotT1, evaluatedAt: '2026-09-25T14:00:00.000Z' };

  await SnapshotStore.saveSnapshot(refresh1);
  await SnapshotStore.saveSnapshot(refresh2);
  await SnapshotStore.saveSnapshot(refresh3);

  const relSnapshots = await SnapshotStore.getAllSnapshotsForIsin('INE002A01018');
  assert(
    relSnapshots.length === 1,
    `SNAP-03: Exactly 1 record exists in storage for session 2026-09-25 (Actual: ${relSnapshots.length})`
  );

  // ============================================================
  // SNAP-04: DIFFERENT SESSION CREATES DISTINCT SNAPSHOT
  // ============================================================
  console.log('\n--- SNAP-04: MULTI-SESSION PERSISTENCE ---');
  const snapshotT2 = SnapshotSerializer.serialize({
    evaluation: relEval,
    contextInput: relContext,
    attentionResult: relAtt,
    headlineResult: relHead,
    holding: null,
    tradingSessionId: '2026-09-28',
    sessionState: 'OPEN',
    evaluatedAt: new Date('2026-09-28T10:30:00+05:30'),
  });

  await SnapshotStore.saveSnapshot(snapshotT2);
  const multiSessionRecords = await SnapshotStore.getAllSnapshotsForIsin('INE002A01018');
  assert(
    multiSessionRecords.length === 2,
    `SNAP-04: Two distinct sessions (2026-09-25 and 2026-09-28) persist independently (Actual: ${multiSessionRecords.length})`
  );

  // ============================================================
  // SNAP-05: PREVIOUS SNAPSHOT SELECTION
  // ============================================================
  console.log('\n--- SNAP-05: PREVIOUS SNAPSHOT SELECTION ---');
  const prevSnapshot = await SnapshotStore.getPreviousSnapshot('INE002A01018', '2026-09-28');
  assert(prevSnapshot !== null, 'SNAP-05: Previous snapshot found for session 2026-09-28');
  assert(
    prevSnapshot?.tradingSessionId === '2026-09-25',
    'SNAP-05: Previous snapshot is strictly the latest completed prior session (2026-09-25)'
  );

  // ============================================================
  // SNAP-06: NO PREVIOUS SNAPSHOT -> DAY-0 COLD START
  // ============================================================
  console.log('\n--- SNAP-06: DAY-0 COLD START INVARIANT ---');
  const day0Prev = await SnapshotStore.getPreviousSnapshot('INE002A01018', '2026-09-25');
  assert(day0Prev === null, 'SNAP-06: No earlier snapshot before 2026-09-25 returns null');

  const currContextEval = SnapshotSerializer.toContextEvaluation(snapshotT1);
  const whatChangedDay0 = evaluateWhatChanged(
    currContextEval,
    null,
    snapshotT1.coreScore,
    null,
    new Date('2026-09-25T16:00:00+05:30')
  );

  assert(whatChangedDay0.isColdStart === true, 'SNAP-06: Day-0 produces isColdStart: true');
  assert(whatChangedDay0.hasChanged === false, 'SNAP-06: Day-0 produces hasChanged: false');
  assert(whatChangedDay0.transitions.length === 0, 'SNAP-06: Day-0 produces 0 transitions');
  assert(whatChangedDay0.scoreDelta === null, 'SNAP-06: Day-0 produces scoreDelta: null');

  // ============================================================
  // SNAP-07: WRONG ISIN CANNOT BECOME PREVIOUS SNAPSHOT
  // ============================================================
  console.log('\n--- SNAP-07: MULTI-STOCK ISOLATION ---');
  const tcsEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['TCS']);
  const tcsContext = ContextInputAdapter.fromEvaluation(tcsEval);
  const tcsAtt = evaluateAttention(tcsContext, relPos, relRel, relPriceLoc);
  const tcsHead = evaluateHeadline(relRel, tcsAtt, false);

  const tcsSnapshot = SnapshotSerializer.serialize({
    evaluation: tcsEval,
    contextInput: tcsContext,
    attentionResult: tcsAtt,
    headlineResult: tcsHead,
    tradingSessionId: '2026-09-25',
    evaluatedAt: new Date('2026-09-25T16:00:00+05:30'),
  });
  await SnapshotStore.saveSnapshot(tcsSnapshot);

  // Query previous snapshot for TCS on 2026-09-28 when TCS has 2026-09-25
  const tcsPrev = await SnapshotStore.getPreviousSnapshot('INE467B01029', '2026-09-28');
  assert(tcsPrev?.isin === 'INE467B01029', 'SNAP-07: TCS previous snapshot matches TCS ISIN');
  assert(tcsPrev?.isin !== 'INE002A01018', 'SNAP-07: RELIANCE snapshot never leaks into TCS baseline');

  // Query previous snapshot for HDFCBANK (which has no records)
  const hdfcPrev = await SnapshotStore.getPreviousSnapshot('INE040A01034', '2026-09-28');
  assert(hdfcPrev === null, 'SNAP-07: Unrecorded ISIN safely evaluates to null (no leakage)');

  // ============================================================
  // SNAP-08: INCOMPATIBLE MODEL VERSION IGNORED
  // ============================================================
  console.log('\n--- SNAP-08: MODEL VERSION INTEGRITY ---');
  const staleModelSnap: AnalyticalSnapshot = {
    ...snapshotT1,
    snapshotId: 'INE002A01018_2026-09-24',
    tradingSessionId: '2026-09-24',
    modelVersion: '1.2.0', // Incompatible legacy model
  };
  await SnapshotStore.saveSnapshot(staleModelSnap);

  // If only 2026-09-24 (v1.2.0) was available before 2026-09-25:
  const queryPriorTo25 = await SnapshotStore.getPreviousSnapshot('INE002A01018', '2026-09-25');
  assert(
    queryPriorTo25 === null,
    'SNAP-08: Incompatible modelVersion (1.2.0) is strictly ignored for previous snapshot selection'
  );

  // ============================================================
  // SNAP-09: INCOMPATIBLE SCHEMA VERSION IGNORED
  // ============================================================
  console.log('\n--- SNAP-09: SCHEMA VERSION INTEGRITY ---');
  const incompatibleSchemaSnap: AnalyticalSnapshot = {
    ...snapshotT1,
    snapshotId: 'INE002A01018_2026-09-23',
    tradingSessionId: '2026-09-23',
    schemaVersion: 99, // Incompatible future schema
  };
  await SnapshotStore.saveSnapshot(incompatibleSchemaSnap);

  const queryPriorTo24 = await SnapshotStore.getPreviousSnapshot('INE002A01018', '2026-09-24');
  assert(
    queryPriorTo24 === null,
    'SNAP-09: Incompatible schemaVersion (99) is strictly ignored for previous snapshot selection'
  );

  // ============================================================
  // SNAP-10: PERSISTENCE FAILURE SAFETY -> DAY-0
  // ============================================================
  console.log('\n--- SNAP-10: PERSISTENCE FAILURE SAFETY ---');
  // Attempt invalid snapshot validation
  const invalidSnap = { isin: 'INVALID' } as any;
  const saveInvalidRes = await SnapshotStore.saveSnapshot(invalidSnap);
  assert(saveInvalidRes === false, 'SNAP-10: Invalid snapshot correctly rejected by saveSnapshot');

  // Deserializing invalid object falls back safely in What Changed
  const whatChangedSafe = evaluateWhatChanged(
    currContextEval,
    invalidSnap,
    42,
    null,
    new Date()
  );
  assert(whatChangedSafe.isColdStart === true, 'SNAP-10: Corrupted previous state triggers safe Day-0 cold start');
  assert(whatChangedSafe.hasChanged === false, 'SNAP-10: Corrupted previous state produces hasChanged: false');

  // ============================================================
  // SNAP-11: INVALID CURRENT EVALUATION DOES NOT OVERWRITE VALID HISTORY
  // ============================================================
  console.log('\n--- SNAP-11: INVALID EVALUATION PROTECTION ---');
  const validSaved = await SnapshotStore.getSnapshot('INE002A01018_2026-09-25');
  assert(validSaved !== null, 'SNAP-11: Valid historical snapshot exists in storage');

  // Attempting to overwrite with un-validated payload does not mutate existing record
  const corruptPayload = { snapshotId: 'INE002A01018_2026-09-25', isin: 'CORRUPTED' } as any;
  await SnapshotStore.saveSnapshot(corruptPayload);

  const recordAfterAttempt = await SnapshotStore.getSnapshot('INE002A01018_2026-09-25');
  assert(
    recordAfterAttempt?.symbol === 'RELIANCE',
    'SNAP-11: Valid historical record is preserved intact against corrupted overwrite attempts'
  );

  // ============================================================
  // SNAP-12: POSITION CHANGES DO NOT MUTATE MARKET-STATE SNAPSHOT FIELDS
  // ============================================================
  console.log('\n--- SNAP-12: POSITION CONTEXT ISOLATION ---');
  const unheldSnap = SnapshotSerializer.serialize({
    evaluation: relEval,
    contextInput: relContext,
    attentionResult: relAtt,
    headlineResult: relHead,
    holding: null,
    tradingSessionId: '2026-09-28',
  });

  const heldProfitHolding = {
    holding: {
      symbol: 'RELIANCE',
      quantity: 100,
      averageBuyPrice: 2600,
      isin: 'INE002A01018',
    },
    currentLtp: 2950.40,
    investedValue: 260000,
    currentValue: 295040,
    pnl: 35040,
    pnlPercentage: 13.47, // > 10% -> STRONGLY_APPRECIATED
    stopLoss: 2749.03,
    stopBreached: false,
  } as any;
  const heldSnap = SnapshotSerializer.serialize({
    evaluation: relEval,
    contextInput: relContext,
    attentionResult: relAtt,
    headlineResult: relHead,
    holding: heldProfitHolding,
    tradingSessionId: '2026-09-28',
  });

  assert(unheldSnap.positionContext.is_held === false, 'SNAP-12: Unheld holding yields is_held: false');
  assert(unheldSnap.positionContext.context === null, 'SNAP-12: Unheld holding yields context: null');
  assert(heldSnap.positionContext.is_held === true, 'SNAP-12: Held holding yields is_held: true');
  assert(heldSnap.positionContext.context === 'STRONGLY_APPRECIATED', 'SNAP-12: Profitable holding yields context: STRONGLY_APPRECIATED');
  assert(
    unheldSnap.fundamentalCondition === heldSnap.fundamentalCondition &&
    unheldSnap.technicalCondition === heldSnap.technicalCondition &&
    unheldSnap.valuationCondition === heldSnap.valuationCondition &&
    unheldSnap.priceLocation === heldSnap.priceLocation,
    'SNAP-12: User position changes do NOT alter stock market-state dimensions'
  );

  // ============================================================
  // SNAP-13: MARKET-CLOSED STATE PRESERVES SETTLED VALUES
  // ============================================================
  console.log('\n--- SNAP-13: MARKET-CLOSED BEHAVIOR ---');
  const weekendResolution = SessionResolver.resolve(new Date('2026-09-27T12:00:00+05:30')); // Sunday
  assert(weekendResolution.marketSessionState === 'WEEKEND', 'SNAP-13: Sunday resolves to WEEKEND');
  assert(
    weekendResolution.tradingSessionId === '2026-09-25',
    'SNAP-13: Weekend anchors to last completed trading day Friday (2026-09-25)'
  );

  const overnightResolution = SessionResolver.resolve(new Date('2026-09-28T22:00:00+05:30')); // Monday Night
  assert(
    overnightResolution.marketSessionState === 'CLOSED_OVERNIGHT',
    'SNAP-13: 22:00 IST resolves to CLOSED_OVERNIGHT'
  );

  // ============================================================
  // SNAP-14: TMCV / TMPV ISOLATION
  // ============================================================
  console.log('\n--- SNAP-14: TMCV / TMPV ISOLATION ---');
  const tmcvSnap = SnapshotSerializer.serialize({
    evaluation: { ...relEval, isin: 'INE1TAE01010', tradingSymbol: 'TMCV' },
    contextInput: { ...relContext, isin: 'INE1TAE01010', symbol: 'TMCV' },
    attentionResult: relAtt,
    headlineResult: relHead,
    tradingSessionId: '2026-09-25',
  });

  const tmpvSnap = SnapshotSerializer.serialize({
    evaluation: { ...relEval, isin: 'INE155A01022', tradingSymbol: 'TMPV' },
    contextInput: { ...relContext, isin: 'INE155A01022', symbol: 'TMPV' },
    attentionResult: relAtt,
    headlineResult: relHead,
    tradingSessionId: '2026-09-25',
  });

  await SnapshotStore.saveSnapshot(tmcvSnap);
  await SnapshotStore.saveSnapshot(tmpvSnap);

  const tmcvPrev = await SnapshotStore.getPreviousSnapshot('INE1TAE01010', '2026-09-28');
  const tmpvPrev = await SnapshotStore.getPreviousSnapshot('INE155A01022', '2026-09-28');

  assert(tmcvPrev?.symbol === 'TMCV', 'SNAP-14: TMCV previous snapshot is TMCV');
  assert(tmpvPrev?.symbol === 'TMPV', 'SNAP-14: TMPV previous snapshot is TMPV');
  assert(tmcvPrev?.snapshotId !== tmpvPrev?.snapshotId, 'SNAP-14: TMCV and TMPV snapshots are 100% isolated');

  // ============================================================
  // SNAP-15: WHAT CHANGED INTEGRATION VIA SNAPSHOT STORE
  // ============================================================
  console.log('\n--- SNAP-15: WHAT CHANGED INTEGRATION ---');
  // Create state transition between 2026-09-25 and 2026-09-28 for RELIANCE
  const prevRelSnap = await SnapshotStore.getPreviousSnapshot('INE002A01018', '2026-09-28');
  assert(prevRelSnap !== null, 'SNAP-15: Valid prior session snapshot retrieved from store');

  // Modified current state (Technical condition shifted from STRONG to WEAKENING)
  const modifiedContext: ContextInput = {
    ...relContext,
    technicals: {
      ...relContext.technicals,
      rsi14: 35, // Dropped
    },
    priceStructure: {
      ...relContext.priceStructure,
      ltp: 2700, // Below S1 (2749)
    },
  };
  const modTechCond = classifyTechnicalCondition(modifiedContext);
  const modFundCond = classifyFundamentalCondition(modifiedContext);
  const modRel = evaluateRelationship(modFundCond, modTechCond);
  const modAtt = evaluateAttention(modifiedContext, relPos, modRel, 'EXTENDED');
  const modHead = evaluateHeadline(modRel, modAtt, false);

  const currentSnap = SnapshotSerializer.serialize({
    evaluation: { ...relEval, coreScore: 35 },
    contextInput: modifiedContext,
    attentionResult: modAtt,
    headlineResult: modHead,
    tradingSessionId: '2026-09-28',
  });

  const currContext = SnapshotSerializer.toContextEvaluation(currentSnap);
  const prevContext = SnapshotSerializer.toContextEvaluation(prevRelSnap!);

  const whatChangedRes = evaluateWhatChanged(
    currContext,
    prevContext,
    currentSnap.coreScore,
    prevRelSnap!.coreScore,
    new Date('2026-09-28T10:30:00+05:30')
  );

  assert(whatChangedRes.hasChanged === true, 'SNAP-15: What Changed detected state transitions');
  assert(whatChangedRes.isColdStart === false, 'SNAP-15: isColdStart is false when previous snapshot exists');
  assert(whatChangedRes.transitions.length > 0, 'SNAP-15: Meaningful state transitions emitted');

  // ============================================================
  // SNAP-16: CORE SCORE DELTA THRESHOLD
  // ============================================================
  console.log('\n--- SNAP-16: CORE SCORE DELTA THRESHOLD ---');
  // Sub-threshold change (|Δ| = 1 pt) without categorical change
  const subThresholdRes = evaluateWhatChanged(
    prevContext,
    prevContext,
    41, // from 40 -> +1 pt
    40,
    new Date()
  );
  assert(subThresholdRes.hasChanged === false, 'SNAP-16: |ΔCoreScore| < 3 does NOT trigger What Changed');

  // Material change (|Δ| = 3 pts)
  const materialThresholdRes = evaluateWhatChanged(
    prevContext,
    prevContext,
    43, // from 40 -> +3 pts
    40,
    new Date()
  );
  assert(materialThresholdRes.hasChanged === true, 'SNAP-16: |ΔCoreScore| >= 3 triggers What Changed');
  assert(materialThresholdRes.scoreDelta === 3, 'SNAP-16: scoreDelta accurately recorded as +3');

  // ============================================================
  // SNAP-17: ZERO STALE_FILING IN V2.0 SNAPSHOT CONTRACT
  // ============================================================
  console.log('\n--- SNAP-17: ZERO STALE_FILING VERIFICATION ---');
  const snapshotKeys = Object.keys(currentSnap);
  assert(!snapshotKeys.includes('staleFiling'), 'SNAP-17: "staleFiling" field does NOT exist in AnalyticalSnapshot');
  assert(!snapshotKeys.includes('filingAge'), 'SNAP-17: "filingAge" field does NOT exist in AnalyticalSnapshot');
  assert(!snapshotKeys.includes('freshnessDays'), 'SNAP-17: "freshnessDays" field does NOT exist in AnalyticalSnapshot');

  console.log('\n===========================================================');
  console.log('🌟 ALL 17 PHASE 2A SNAPSHOT PERSISTENCE TESTS PASSED!       ');
  console.log('===========================================================');
}

runSnapshotPersistenceTests().catch((err) => {
  console.error('Fatal error in Phase 2A tests:', err);
  process.exit(1);
});
