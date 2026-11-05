/**
 * STOCKINSIGHT V2.0 Phase 2B Verification Suite
 * Tests:
 * 1. Market Session State & Authoritative NSE Calendar Resolution (IST)
 * 2. Multi-Quote Batching & Error Handling (Up to 500 keys, zero fan-out)
 * 3. Daily Candle Dynamic Bounds & Finalization Invariant
 * 4. Closed-Market Behavior & Zero Synthetic Transition Protection
 * 5. Snapshot Persistence & What Changed Integration
 * 6. Non-Fabrication & Anti-Fallback Protection (Null LTP on failure, zero 0-coercion)
 */

import { SessionResolver } from '../engine/sessionResolver';
import {
  getNseHolidayInfo,
  isNseTradingHoliday,
  getNseSpecialSession,
  NSE_HOLIDAYS_2025,
  NSE_HOLIDAYS_2026,
  NSE_SPECIAL_SESSIONS,
} from '../data/nseHolidays';
import { UpstoxClient, isDailyCandleFinalized, RequestQueue, UpstoxApiError } from '../api/upstoxClient';
import { SnapshotStore } from '../services/snapshotStore';
import { SnapshotSerializer, CURRENT_MODEL_VERSION } from '../engine/snapshotSerializer';
import { ContextInputAdapter, PositionContextAdapter } from '../engine/contextAdapters';
import { classifyFundamentalCondition, classifyTechnicalCondition, classifyPriceLocation } from '../engine/contextClassifiers';
import { evaluateRelationship } from '../engine/contextRelationships';
import { evaluateAttention } from '../engine/contextAttention';
import { evaluateHeadline } from '../engine/contextHeadline';
import { evaluateWhatChanged } from '../engine/contextWhatChanged';
import { StockInsightPipeline } from '../engine';
import { BENCHMARK_STOCKS } from '../api/benchmarkData';
import { StockInsightEvaluation } from '../types/engine';
import { Holding } from '../types/portfolio';

declare const process: any;

async function runSessionRefreshTests() {
  console.log('===========================================================');
  console.log('     STOCKINSIGHT V2.0 PHASE 2B VERIFICATION SUITE         ');
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
  // GROUP 1: SESSION RESOLUTION & AUTHORITATIVE NSE CALENDAR
  // ============================================================
  console.log('--- GROUP 1: SESSION RESOLUTION & AUTHORITATIVE NSE CALENDAR ---');

  // SESSION-01: Normal weekday intraday -> OPEN
  const normalTradingDay = new Date('2026-09-28T11:30:00+05:30'); // Monday 11:30 IST
  const res01 = SessionResolver.resolve(normalTradingDay);
  assert(res01.marketSessionState === 'OPEN', 'SESSION-01: Normal weekday 11:30 IST resolves to OPEN');
  assert(res01.tradingSessionId === '2026-09-28', 'SESSION-01: TradingSessionId is today (2026-09-28)');

  // SESSION-02: Weekend -> WEEKEND anchored to Friday
  const weekendSunday = new Date('2026-09-27T14:00:00+05:30'); // Sunday 14:00 IST
  const res02 = SessionResolver.resolve(weekendSunday);
  assert(res02.marketSessionState === 'WEEKEND', 'SESSION-02: Sunday resolves to WEEKEND');
  assert(res02.tradingSessionId === '2026-09-25', 'SESSION-02: Weekend anchors to last completed Friday (2026-09-25)');

  // SESSION-03: NSE Official Holiday -> HOLIDAY anchored to previous trading day
  const holidayIndependenceDay = new Date('2026-08-15T10:00:00+05:30'); // 15 Aug 2026 (Saturday / Holiday)
  const holidayGandhiJayanti = new Date('2026-10-02T11:00:00+05:30'); // 2 Oct 2026 (Friday - Mahatma Gandhi Jayanti)
  const res03 = SessionResolver.resolve(holidayGandhiJayanti);
  assert(res03.marketSessionState === 'HOLIDAY', 'SESSION-03: Official NSE holiday resolves to HOLIDAY');
  assert(res03.holidayName === 'Mahatma Gandhi Jayanti', 'SESSION-03: Holiday name is populated accurately');
  assert(res03.tradingSessionId === '2026-10-01', 'SESSION-03: Holiday anchors to prior trading day (2026-10-01)');

  // SESSION-04: Special Muhurat Trading Session -> SPECIAL_SESSION
  const muhuratActive = new Date('2026-11-08T18:30:00+05:30'); // Diwali Muhurat 2026 (18:15 - 19:15)
  const res04 = SessionResolver.resolve(muhuratActive);
  assert(res04.marketSessionState === 'SPECIAL_SESSION', 'SESSION-04: Active Muhurat window resolves to SPECIAL_SESSION');
  assert(res04.tradingSessionId === '2026-11-08', 'SESSION-04: Special session date is today (2026-11-08)');
  assert(Boolean(res04.specialSessionName?.includes('Muhurat')), 'SESSION-04: Special session name identified');

  // SESSION-05: Overnight hours -> CLOSED_OVERNIGHT
  const overnightEvening = new Date('2026-09-28T22:30:00+05:30'); // Monday 22:30 IST
  const res05 = SessionResolver.resolve(overnightEvening);
  assert(res05.marketSessionState === 'CLOSED_OVERNIGHT', 'SESSION-05: 22:30 IST resolves to CLOSED_OVERNIGHT');
  assert(res05.tradingSessionId === '2026-09-28', 'SESSION-05: Post-16:00 overnight anchors to today completed session');

  const overnightEarlyMorning = new Date('2026-09-29T04:30:00+05:30'); // Tuesday 04:30 IST (Pre-market)
  const res05Early = SessionResolver.resolve(overnightEarlyMorning);
  assert(res05Early.marketSessionState === 'CLOSED_OVERNIGHT', 'SESSION-05: 04:30 IST resolves to CLOSED_OVERNIGHT');
  assert(res05Early.tradingSessionId === '2026-09-28', 'SESSION-05: Early morning pre-09:00 anchors to prior trading day');

  // ============================================================
  // GROUP 2: NSE HOLIDAYS MODULE CHECKS
  // ============================================================
  console.log('\n--- GROUP 2: NSE HOLIDAYS MODULE CHECKS ---');
  assert(isNseTradingHoliday('2025-08-15') === true, 'HOL-01: 2025-08-15 recognized as Independence Day');
  assert(isNseTradingHoliday('2026-01-26') === true, 'HOL-02: 2026-01-26 recognized as Republic Day');
  assert(isNseTradingHoliday('2026-09-28') === false, 'HOL-03: Regular trading day 2026-09-28 is not a holiday');
  assert(getNseSpecialSession('2026-11-08')?.marketOpen === '18:15', 'HOL-04: Muhurat 2026 trading hours configured');

  // Boundary check for dates outside 2025-2026
  const outOfRange = getNseHolidayInfo('2028-05-15');
  assert(outOfRange === null, 'HOL-05: Out-of-range date returns null (defensive fallback)');

  // ============================================================
  // GROUP 3: QUOTE BATCHING & UPSTOX CLIENT CONTRACTS
  // ============================================================
  console.log('\n--- GROUP 3: QUOTE BATCHING CONTRACTS ---');
  const client = new UpstoxClient();

  // REFRESH-01: RequestQueue pacing invariant
  assert(RequestQueue.getMaxConcurrent() === 2, 'REFRESH-01: Max concurrency is strictly 2');
  assert(RequestQueue.getMinIntervalMs() === 200, 'REFRESH-01: Min request interval is strictly 200ms');

  // REFRESH-02: Multi-quote batching key formatting & deduplication
  const batchKeys = ['RELIANCE', 'TCS', 'HDFCBANK', 'BAJFINANCE', 'NSE_EQ|INE002A01018', 'reliance'];
  // Test batch method exists and handles inputs without throwing
  const batchResult = await client.fetchMarketQuotesBatch(batchKeys);
  assert(typeof batchResult === 'object', 'REFRESH-02: fetchMarketQuotesBatch returns key-value map');
  assert('NSE_EQ|INE002A01018' in batchResult, 'REFRESH-02: Formats and maps RELIANCE ISIN key');
  assert('NSE_EQ|INE467B01029' in batchResult, 'REFRESH-02: Formats and maps TCS ISIN key');

  // REFRESH-03: Empty batch returns empty map
  const emptyBatch = await client.fetchMarketQuotesBatch([]);
  assert(Object.keys(emptyBatch).length === 0, 'REFRESH-03: Empty batch returns empty map');

  // ============================================================
  // GROUP 4: CANDLE FINALIZATION CONTRACT
  // ============================================================
  console.log('\n--- GROUP 4: CANDLE FINALIZATION CONTRACT ---');

  // CANDLE-01: Past candle strictly before today's session is finalized
  assert(
    isDailyCandleFinalized('2026-09-25', '2026-09-28', 'OPEN') === true,
    'CANDLE-01: Historical candle from prior date (2026-09-25 < 2026-09-28) is finalized during OPEN'
  );

  // CANDLE-02: Active intraday candle during OPEN is NOT finalized
  assert(
    isDailyCandleFinalized('2026-09-28', '2026-09-28', 'OPEN') === false,
    'CANDLE-02: Active intraday candle (2026-09-28 == 2026-09-28) during OPEN is NOT finalized'
  );

  // CANDLE-03: Intraday candle becomes finalized after market close
  assert(
    isDailyCandleFinalized('2026-09-28', '2026-09-28', 'POST_CLOSE') === true,
    'CANDLE-03: Today candle is finalized in POST_CLOSE'
  );
  assert(
    isDailyCandleFinalized('2026-09-28', '2026-09-28', 'CLOSED_OVERNIGHT') === true,
    'CANDLE-03: Today candle is finalized in CLOSED_OVERNIGHT'
  );

  // CANDLE-04: Future candle is never finalized
  assert(
    isDailyCandleFinalized('2026-09-29', '2026-09-28', 'OPEN') === false,
    'CANDLE-04: Future candle timestamp is not finalized'
  );

  // ============================================================
  // GROUP 5: ANTI-FALLBACK & DATA INTEGRITY INVARIANTS
  // ============================================================
  console.log('\n--- GROUP 5: ANTI-FALLBACK & DATA INTEGRITY INVARIANTS ---');

  // FAIL-01: Missing LTP in failed quote is null, never numeric 0
  const unheldHolding: Holding = {
    id: 'test_h1',
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries',
    sector: 'Energy',
    isin: 'INE002A01018',
    quantity: 10,
    averageBuyPrice: 2800,
    addedAt: '2026-01-01',
  };

  const posContextMissing = PositionContextAdapter.fromHoldingWithEvaluation({
    ...unheldHolding,
    currentLtp: null,
    quoteStatus: 'UNAVAILABLE',
  } as any);

  assert(posContextMissing.currentLtp === null, 'FAIL-01: Missing LTP evaluates strictly to null');
  assert(posContextMissing.currentLtp !== 0, 'FAIL-02: Missing LTP is strictly NOT equal to 0');
  assert(
    posContextMissing.currentLtp !== unheldHolding.averageBuyPrice,
    'FAIL-01: Missing LTP is never coerced to averageBuyPrice'
  );

  // FAIL-03: Zero quote status is UNAVAILABLE
  assert(posContextMissing.currentValue === null, 'FAIL-03: Current value is null when LTP is unavailable');
  assert(posContextMissing.pnl === null, 'FAIL-03: PnL is null when LTP is unavailable');

  // ============================================================
  // GROUP 6: SNAPSHOT PERSISTENCE & WHAT CHANGED HANDOFF
  // ============================================================
  console.log('\n--- GROUP 6: SNAPSHOT PERSISTENCE & WHAT CHANGED HANDOFF ---');
  await SnapshotStore.clearAll();

  // Create baseline evaluation
  const relFixture = BENCHMARK_STOCKS.RELIANCE;
  const relEval = StockInsightPipeline.evaluate(relFixture, 'RELIANCE');
  const relContext = ContextInputAdapter.fromEvaluation(relEval);
  const relPos = PositionContextAdapter.fromHoldingWithEvaluation(null);
  const relFund = classifyFundamentalCondition(relContext);
  const relTech = classifyTechnicalCondition(relContext);
  const relPriceLoc = classifyPriceLocation(relContext);
  const relRelationship = evaluateRelationship(relFund, relTech);
  const relAttention = evaluateAttention(relContext, relPos, relRelationship, relPriceLoc);
  const relHeadline = evaluateHeadline(relRelationship, relAttention, false);

  // SNAP-01: Day 0 Cold Start
  const day0Snapshot = await SnapshotStore.getPreviousSnapshot('INE002A01018', '2026-09-25');
  assert(day0Snapshot === null, 'SNAP-01: Day 0 lookup returns null');

  const day0WhatChanged = evaluateWhatChanged(
    {
      fundamental_condition: relFund,
      technical_condition: relTech,
      valuation_condition: 'REASONABLE',
      momentum_condition: 'HEALTHY',
      momentum_state: 'AVAILABLE',
      price_location: relPriceLoc,
      position: { is_held: false, context: null, pnlPct: null, averageBuyPrice: null },
      attention_level: relAttention.level,
      modifiers: [],
    },
    null,
    relEval.coreScore,
    null
  );
  assert(day0WhatChanged.isColdStart === true, 'SNAP-01: Day 0 produces isColdStart: true');
  assert(day0WhatChanged.hasChanged === false, 'SNAP-01: Day 0 produces hasChanged: false');

  // SNAP-02: Same-session save and update
  const snapSession1 = SnapshotSerializer.serialize({
    evaluation: relEval,
    contextInput: relContext,
    attentionResult: relAttention,
    headlineResult: relHeadline,
    holding: null,
    tradingSessionId: '2026-09-25',
    sessionState: 'CLOSED_OVERNIGHT',
  });
  await SnapshotStore.saveSnapshot(snapSession1);

  // Intraday update to same session
  const snapSession1Update = { ...snapSession1, evaluatedAt: '2026-09-25T15:30:00.000Z' };
  await SnapshotStore.saveSnapshot(snapSession1Update);

  const storedSnapshots = await SnapshotStore.getAllSnapshotsForIsin('INE002A01018');
  assert(storedSnapshots.length === 1, 'SNAP-02: Same session updates existing snapshot idempotently (length === 1)');

  // SNAP-03: Next session comparison
  const snapSession2 = SnapshotSerializer.serialize({
    evaluation: relEval,
    contextInput: relContext,
    attentionResult: relAttention,
    headlineResult: relHeadline,
    holding: null,
    tradingSessionId: '2026-09-28',
    sessionState: 'OPEN',
  });
  await SnapshotStore.saveSnapshot(snapSession2);

  const prevForSession2 = await SnapshotStore.getPreviousSnapshot('INE002A01018', '2026-09-28');
  assert(prevForSession2 !== null, 'SNAP-03: Prior session snapshot retrieved for 2026-09-28');
  assert(prevForSession2?.tradingSessionId === '2026-09-25', 'SNAP-03: Prior session ID is 2026-09-25');

  // CHANGE-01: State transition detected when underlying state changes
  const prevContextEval = SnapshotSerializer.toContextEvaluation(prevForSession2!);
  const currentContextChanged = {
    ...prevContextEval,
    technical_condition: 'WEAK' as const,
  };
  const changeResult = evaluateWhatChanged(
    currentContextChanged,
    prevContextEval,
    relEval.coreScore - 5,
    relEval.coreScore
  );
  assert(changeResult.hasChanged === true, 'CHANGE-01: Material state change is detected');
  assert(changeResult.transitions.length > 0, 'CHANGE-01: Emits transition records');

  // CHANGE-02: No false transition when state is identical
  const noChangeResult = evaluateWhatChanged(
    prevContextEval,
    prevContextEval,
    relEval.coreScore,
    relEval.coreScore
  );
  assert(noChangeResult.hasChanged === false, 'CHANGE-02: Identical state produces hasChanged: false');

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n===========================================================');
  console.log(`TOTAL PHASE 2B TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('===========================================================');

  if (total !== passed) {
    throw new Error(`Phase 2B Verification Failed: ${total - passed} test(s) failed`);
  }
}

runSessionRefreshTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
