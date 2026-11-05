/**
 * STOCKINSIGHT V2.1 Feature Verification Test Suite
 * 
 * Scope:
 * - F-01: Multi-Session Context Trajectory (TRAJ-01 .. TRAJ-10)
 * - F-02: Portfolio Quality Tilt & Capital Exposure (TILT-01 .. TILT-09)
 * - F-03: Deterministic Sub-Factor Score Attribution (ATTR-01 .. ATTR-10)
 * 
 * Total Tests: 29
 */

import { TrajectoryEngine, TrajectoryResult } from '../engine/trajectoryEngine';
import { QualityTiltEngine, PortfolioQualityTiltResult } from '../engine/qualityTiltEngine';
import { FactorAttributionEngine, FactorAttributionResult } from '../engine/factorAttributionEngine';
import { AnalyticalSnapshot, StockContextEvaluation } from '../types/context';
import { HoldingWithEvaluation } from '../types/portfolio';
import { StockInsightEvaluation, FactorScore } from '../types/engine';
import { CURRENT_MODEL_VERSION, CURRENT_SCHEMA_VERSION } from '../engine/snapshotSerializer';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, message?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ ${testName}: ${message || 'Assertion failed'}`);
  }
}

console.log('\n======================================================');
console.log('STOCKINSIGHT V2.1 FEATURE ACCEPTANCE TEST SUITE');
console.log('======================================================\n');

// ============================================================================
// F-01: Multi-Session Context Trajectory Tests (TRAJ-01 .. TRAJ-10)
// ============================================================================
console.log('--- F-01: Multi-Session Context Trajectory Tests (10 tests) ---');

const mockSnapshot = (overrides: Partial<AnalyticalSnapshot> = {}): AnalyticalSnapshot => ({
  snapshotId: 'INE002A01018_2026-09-25',
  isin: 'INE002A01018',
  symbol: 'RELIANCE',
  tradingSessionId: '2026-09-25',
  marketSessionState: 'REGULAR_MARKET',
  evaluatedAt: '2026-09-25T10:00:00.000Z',
  modelVersion: CURRENT_MODEL_VERSION,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  isQuarantined: false,
  coreScore: 78,
  fundamentalCondition: 'STRONG',
  technicalCondition: 'BULLISH',
  valuationCondition: 'FAIR',
  momentumCondition: 'STRONG_POSITIVE',
  priceLocation: 'IN_VALUE_ZONE',
  positionContext: {
    is_held: false,
    context: null,
    pnlPct: null,
    averageBuyPrice: null,
  },
  relationshipArchetype: 'SECULAR_COMPOUNDER',
  attentionLevel: 'NORMAL',
  primaryAttentionDriver: 'NONE',
  primaryHeadlineBadge: null,
  isETF: false,
  ...overrides,
});

// TRAJ-01
{
  const res = TrajectoryEngine.buildTrajectoryFromSnapshots([], 'INE002A01018');
  assert(res.isDayZero === true && res.points.length === 0, 'TRAJ-01: Empty snapshot history returns isDayZero = true');
}

// TRAJ-02
{
  const s1 = mockSnapshot({ tradingSessionId: '2026-09-25' });
  const res = TrajectoryEngine.buildTrajectoryFromSnapshots([s1], 'INE002A01018');
  assert(res.isDayZero === true && res.points.length === 1, 'TRAJ-02: Single snapshot history returns isDayZero = true with 1 point');
}

// TRAJ-03
{
  const s1 = mockSnapshot({ tradingSessionId: '2026-09-24' });
  const s2 = mockSnapshot({ tradingSessionId: '2026-09-25' });
  const res = TrajectoryEngine.buildTrajectoryFromSnapshots([s1, s2], 'INE002A01018');
  assert(res.isDayZero === false && res.points.length === 2, 'TRAJ-03: Two snapshots returns isDayZero = false');
}

// TRAJ-04
{
  const s1 = mockSnapshot({ tradingSessionId: '2026-09-28' });
  const s2 = mockSnapshot({ tradingSessionId: '2026-09-22' });
  const s3 = mockSnapshot({ tradingSessionId: '2026-09-25' });
  const res = TrajectoryEngine.buildTrajectoryFromSnapshots([s1, s2, s3], 'INE002A01018');
  const orderedDates = res.points.map((p) => p.tradingSessionId);
  assert(
    orderedDates[0] === '2026-09-22' && orderedDates[1] === '2026-09-25' && orderedDates[2] === '2026-09-28',
    'TRAJ-04: Snapshots are strictly ordered chronologically ascending'
  );
}

// TRAJ-05
{
  const s1 = mockSnapshot({ tradingSessionId: '2026-09-24', modelVersion: '1.2.1' as any });
  const s2 = mockSnapshot({ tradingSessionId: '2026-09-25', modelVersion: CURRENT_MODEL_VERSION });
  const res = TrajectoryEngine.buildTrajectoryFromSnapshots([s1, s2], 'INE002A01018');
  assert(res.points.length === 1 && res.points[0].tradingSessionId === '2026-09-25', 'TRAJ-05: Incompatible model versions are filtered out');
}

// TRAJ-06
{
  const s1 = mockSnapshot({ tradingSessionId: '2026-09-24', schemaVersion: 99 as any });
  const s2 = mockSnapshot({ tradingSessionId: '2026-09-25', schemaVersion: CURRENT_SCHEMA_VERSION });
  const res = TrajectoryEngine.buildTrajectoryFromSnapshots([s1, s2], 'INE002A01018');
  assert(res.points.length === 1 && res.points[0].tradingSessionId === '2026-09-25', 'TRAJ-06: Incompatible schema versions are filtered out');
}

// TRAJ-07
{
  const s1 = mockSnapshot({ tradingSessionId: '2026-09-24', isQuarantined: true });
  const s2 = mockSnapshot({ tradingSessionId: '2026-09-25', isQuarantined: false });
  const res = TrajectoryEngine.buildTrajectoryFromSnapshots([s1, s2], 'INE002A01018');
  assert(res.points.length === 1 && res.points[0].tradingSessionId === '2026-09-25', 'TRAJ-07: Quarantined snapshots are excluded');
}

// TRAJ-08
{
  const s1 = mockSnapshot({ isin: 'INE002A01018', tradingSessionId: '2026-09-24' });
  const s2 = mockSnapshot({ isin: 'INE009A01021', tradingSessionId: '2026-09-25' });
  const res = TrajectoryEngine.buildTrajectoryFromSnapshots([s1, s2], 'INE002A01018');
  assert(res.points.length === 1 && res.isin === 'INE002A01018', 'TRAJ-08: Cross-ISIN isolation strictly isolates target stock');
}

// TRAJ-09
{
  const snapshots: AnalyticalSnapshot[] = [];
  for (let i = 1; i <= 25; i++) {
    const day = i < 10 ? `0${i}` : `${i}`;
    snapshots.push(mockSnapshot({ tradingSessionId: `2026-08-${day}` }));
  }
  const res = TrajectoryEngine.buildTrajectoryFromSnapshots(snapshots, 'INE002A01018', undefined, 20);
  assert(res.points.length === 20 && res.points[19].tradingSessionId === '2026-08-25', 'TRAJ-09: Max session window capping slices latest 20');
}

// TRAJ-10
{
  const s1 = mockSnapshot({ tradingSessionId: '2026-09-24' });
  const s2 = mockSnapshot({ tradingSessionId: '2026-09-25' });
  const res = TrajectoryEngine.buildTrajectoryFromSnapshots([s1, s2], 'INE002A01018', '2026-09-25');
  assert(
    res.points[0].isCurrentSession === false && res.points[1].isCurrentSession === true,
    'TRAJ-10: Current session node is tagged isCurrentSession = true'
  );
}

// ============================================================================
// F-02: Portfolio Quality Tilt & Capital Exposure Tests (TILT-01 .. TILT-09)
// ============================================================================
console.log('\n--- F-02: Portfolio Quality Tilt & Capital Exposure Tests (9 tests) ---');

const mockEvaluation = (overrides: Partial<StockInsightEvaluation> = {}): StockInsightEvaluation => ({
  isin: 'INE002A01018',
  tradingSymbol: 'RELIANCE',
  companyName: 'Reliance Industries Ltd',
  sector: 'ENERGY',
  coreScore: 80,
  fundamentalScore: 40,
  technicalScore: 40,
  zone: 'FAVORABLE',
  zoneReason: 'Strong fundamentals and bullish technicals',
  evaluatedAt: '2026-09-25T10:00:00.000Z',
  dataSource: 'UPSTOX_LIVE',
  fundamentalFactors: [
    {
      name: 'Operating Margin Trend',
      score: 10,
      maxScore: 10,
      weight: 0.2,
      category: 'FUNDAMENTAL',
      rawValue: '24.5%',
      description: 'Operating margin expansion over 3 years',
    },
  ],
  technicalFactors: [
    {
      name: '200-Day Exponential Moving Average',
      score: 10,
      maxScore: 10,
      weight: 0.2,
      category: 'TECHNICAL',
      rawValue: '2300',
      description: 'Price above 200 EMA',
    },
    {
      name: '100-Day Simple Moving Average',
      score: 10,
      maxScore: 10,
      weight: 0.2,
      category: 'TECHNICAL',
      rawValue: '2350',
      description: 'Price above 100 SMA',
    },
    {
      name: 'Alignment Stack',
      score: 10,
      maxScore: 10,
      weight: 0.2,
      category: 'TECHNICAL',
      rawValue: 'Aligned',
      description: 'Stack aligned',
    },
  ],
  safety: {
    fundamentalFloorFailed: false,
    hardStopTriggered: false,
    trailingStopTriggered: false,
    accrualTrapTriggered: false,
    betaSizingActive: false,
    reasons: [],
    details: [],
  },
  execution: {
    ltp: 2500,
    atr14: 40,
    hardStopPrice: 2300,
    trailingStopPrice: 2400,
    technicalStopPrice: 2350,
    recommendedStopPrice: 2400,
    entryZoneMin: 2450,
    entryZoneMax: 2550,
    hardStopPct: 8,
    trailingStopPct: 4,
    technicalStopPct: 6,
    recommendedStopPct: 4,
    recommendedStopType: 'TRAILING',
    breakoutLevel: 2600,
    breakoutConfirmed: false,
  },
  priceStructure: {
    swingHigh: 2600,
    swingLow: 2400,
    swingHighDate: '2026-09-01',
    swingLowDate: '2026-08-15',
    adx14: 28,
    trendState: 'TRENDING_UP',
    supportLevels: [2400, 2350],
    resistanceLevels: [2600, 2700],
    pivotPoint: 2500,
    fiftyTwoWeekHigh: 3000,
    fiftyTwoWeekLow: 2200,
    distanceFrom52WHighPct: -16.67,
    distanceFrom52WLowPct: 13.64,
    stops: {
      s1: { price: 2300 },
    },
    metadata: {
      atr14: 40,
    },
  } as any,
  integrity: {
    status: 'COMPLETE',
    qualityScore: 100,
    missingFields: [],
    staleFields: [],
    discrepancies: [],
    criticalDefects: [],
    isDemoData: false,
    warnings: [],
  },
  ...overrides,
});

const mockHoldingItem = (overrides: Partial<HoldingWithEvaluation> = {}): HoldingWithEvaluation => ({
  holding: {
    isin: 'INE002A01018',
    symbol: 'RELIANCE',
    quantity: 10,
    averageBuyPrice: 2000,
    sector: 'ENERGY',
  },
  evaluation: mockEvaluation(),
  currentLtp: 2500,
  investedValue: 20000,
  currentValue: 25000,
  pnl: 5000,
  pnlPercentage: 25,
  coreScore: 75,
  zone: 'FAVORABLE',
  actionBadge: 'ACCUMULATE',
  allocationWeight: 0.25,
  stopBreached: false,
  accrualTrapGain: false,
  quoteStatus: 'RESOLVED',
  ...overrides,
});

// TILT-01
{
  const res = QualityTiltEngine.evaluate([]);
  assert(
    res.resolvedCapital === 0 && res.totalInvested === 0 && res.driverExposures.length === 0,
    'TILT-01: Empty portfolio returns 0 resolved capital and empty exposures'
  );
}

// TILT-02
{
  // Strong fund (40) + Bullish tech (40) -> ALIGNED_HIGH_QUALITY -> P2 -> P1_P2
  const item = mockHoldingItem({
    currentLtp: 2500,
    holding: { isin: 'INE002A01018', symbol: 'RELIANCE', quantity: 10, averageBuyPrice: 2000, sector: 'ENERGY' },
  });
  const res = QualityTiltEngine.evaluate([item]);
  assert(
    res.tiltBuckets.P1_P2.holdingCount === 1 && res.tiltBuckets.P1_P2.currentValue === 25000 && res.tiltBuckets.P1_P2.capitalWeightPct === 100,
    'TILT-02: Leadership (P1/P2) accumulates capital and computes 100% weight'
  );
}

// TILT-03
{
  // Healthy fund (30) + Stable tech (20) (ltp 960 >= ema200 950 and < sma100 980) -> CONSOLIDATING_QUALITY / CONSTRUCTIVE_EXPANSION -> P3
  const item = mockHoldingItem({
    currentLtp: 960,
    evaluation: mockEvaluation({
      fundamentalScore: 30,
      technicalScore: 20,
      coreScore: 50,
      execution: { ltp: 960 } as any,
      priceStructure: {
        stops: { s1: { price: 900 } },
        metadata: { atr14: 20 },
      } as any,
      technicalFactors: [
        { name: '200-Day Exponential Moving Average', score: 5, rawValue: '950', category: 'TECHNICAL' } as any,
        { name: '100-Day Simple Moving Average', score: 5, rawValue: '980', category: 'TECHNICAL' } as any,
        { name: 'Alignment Stack', score: 0, rawValue: 'Mixed', category: 'TECHNICAL' } as any,
      ],
    }),
    holding: { isin: 'INE009A01021', symbol: 'INFY', quantity: 20, averageBuyPrice: 900, sector: 'IT' },
  });
  const res = QualityTiltEngine.evaluate([item]);
  assert(
    res.tiltBuckets.P3.holdingCount === 1 && res.tiltBuckets.P3.currentValue === 19200 && res.tiltBuckets.P3.capitalWeightPct === 100,
    'TILT-03: Consolidation (P3) accumulates capital and computes 100% weight'
  );
}

// TILT-04
{
  // Sector = ETF -> P4
  const item = mockHoldingItem({
    currentLtp: 500,
    evaluation: mockEvaluation({
      sector: 'ETF',
      fundamentalStatus: 'NOT_APPLICABLE',
    }),
    holding: { isin: 'INF204KB17I5', symbol: 'GOLDBEES', quantity: 100, averageBuyPrice: 450, sector: 'ETF' },
  });
  const res = QualityTiltEngine.evaluate([item]);
  assert(
    res.tiltBuckets.P4.holdingCount === 1 && res.tiltBuckets.P4.currentValue === 50000 && res.tiltBuckets.P4.capitalWeightPct === 100,
    'TILT-04: ETF Core (P4) accumulates capital and computes 100% weight'
  );
}

// TILT-05
{
  // Weak fund (10) + Incomplete tech -> Cell 24 -> P5
  const item = mockHoldingItem({
    currentLtp: 100,
    evaluation: mockEvaluation({
      fundamentalScore: 10,
      technicalScore: 10,
      coreScore: 20,
      technicalFactors: [],
    }),
    holding: { isin: 'INE123A01011', symbol: 'RISKY', quantity: 100, averageBuyPrice: 90, sector: 'FIN' },
  });
  const res = QualityTiltEngine.evaluate([item]);
  assert(
    res.tiltBuckets.P5.holdingCount === 1 && res.tiltBuckets.P5.currentValue === 10000 && res.tiltBuckets.P5.capitalWeightPct === 100,
    'TILT-05: Risk / Divergence (P5) accumulates capital and computes 100% weight'
  );
}

// TILT-06
{
  const item1 = mockHoldingItem({
    currentLtp: 2000,
    quoteStatus: 'RESOLVED',
    holding: { isin: 'INE002A01018', symbol: 'RELIANCE', quantity: 10, averageBuyPrice: 1800, sector: 'ENERGY' },
  });
  const item2 = mockHoldingItem({
    currentLtp: null,
    quoteStatus: 'UNAVAILABLE',
    holding: { isin: 'INE999A01019', symbol: 'UNKNOWN', quantity: 50, averageBuyPrice: 100, sector: 'UNKNOWN' },
  });
  const res = QualityTiltEngine.evaluate([item1, item2]);
  assert(
    res.resolvedCapital === 20000 && res.unresolvedCapitalCount === 1 && res.tiltBuckets.P1_P2.capitalWeightPct === 100,
    'TILT-06: Unresolved holding is excluded from resolved capital and counted in unresolvedCapitalCount'
  );
}

// TILT-07
{
  const item1 = mockHoldingItem({
    currentLtp: 2000,
    holding: { isin: 'INE002A01018', symbol: 'RELIANCE', quantity: 10, averageBuyPrice: 1800, sector: 'ENERGY' },
  }); // P1/P2: 20,000 (50%)
  const item2 = mockHoldingItem({
    currentLtp: 500,
    evaluation: mockEvaluation({ sector: 'ETF', fundamentalStatus: 'NOT_APPLICABLE' }),
    holding: { isin: 'INF204KB17I5', symbol: 'GOLDBEES', quantity: 40, averageBuyPrice: 450, sector: 'ETF' },
  }); // P4: 20,000 (50%)
  const res = QualityTiltEngine.evaluate([item1, item2]);
  const sumWeights = res.tiltBuckets.P1_P2.capitalWeightPct + res.tiltBuckets.P4.capitalWeightPct;
  assert(
    res.resolvedCapital === 40000 && Math.round(sumWeights) === 100,
    'TILT-07: Sum of resolved capital weights equals 100%'
  );
}

// TILT-08
{
  const itemWithStop = mockHoldingItem({
    currentLtp: 2200,
    evaluation: mockEvaluation({
      execution: {
        ltp: 2200,
        atr14: 40,
        hardStopPrice: 2300,
        trailingStopPrice: 2300,
        technicalStopPrice: 2300,
        recommendedStopPrice: 2300,
        entryZoneMin: 2400,
        entryZoneMax: 2500,
        hardStopPct: 8,
        trailingStopPct: 4,
        technicalStopPct: 6,
        recommendedStopPct: 4,
        recommendedStopType: 'TRAILING',
        breakoutLevel: 2600,
        breakoutConfirmed: false,
      },
      priceStructure: {
        stops: { s1: { price: 2300 } },
        metadata: { atr14: 40 },
      } as any,
    }),
    holding: { isin: 'INE002A01018', symbol: 'RELIANCE', quantity: 10, averageBuyPrice: 2500, sector: 'ENERGY' },
  });
  const res = QualityTiltEngine.evaluate([itemWithStop]);
  assert(
    res.driverExposures.length > 0 && res.driverExposures[0].driver === 'CRITICAL_STOP_BREACH',
    'TILT-08: Attention driver clustering identifies CRITICAL_STOP_BREACH'
  );
}

// TILT-09
{
  const itemZeroLtp = mockHoldingItem({
    currentLtp: null,
    quoteStatus: 'UNAVAILABLE',
    holding: { isin: 'INE111A01011', symbol: 'NO_LTP', quantity: 100, averageBuyPrice: 50, sector: 'FIN' },
  });
  const res = QualityTiltEngine.evaluate([itemZeroLtp]);
  assert(
    res.resolvedCapital === 0 && res.tiltBuckets.P5.capitalWeightPct === 0,
    'TILT-09: Zero numeric coercion invariant (null LTP never coerced to 0 or averageBuyPrice)'
  );
}

// ============================================================================
// F-03: Deterministic Sub-Factor Score Attribution Tests (ATTR-01 .. ATTR-10)
// ============================================================================
console.log('\n--- F-03: Deterministic Sub-Factor Score Attribution Tests (10 tests) ---');

const factorA: FactorScore = {
  name: 'Operating Margin Trend',
  score: 80,
  maxScore: 100,
  weight: 0.2,
  category: 'FUNDAMENTAL',
  rawValue: '24.5%',
  description: 'Operating margin expansion over 3 years',
};

const factorB: FactorScore = {
  name: 'RSI Momentum',
  score: 65,
  maxScore: 100,
  weight: 0.15,
  category: 'TECHNICAL',
  rawValue: '58.2',
  description: '14-day RSI momentum',
};

const factorC: FactorScore = {
  name: 'Debt to Equity',
  score: 90,
  maxScore: 100,
  weight: 0.2,
  category: 'FUNDAMENTAL',
  rawValue: '0.12',
  description: 'Low leverage',
};

// ATTR-01
{
  const currEval = mockEvaluation({
    fundamentalFactors: [factorA, factorC],
    technicalFactors: [factorB],
  });
  // Swap order in previous evaluation
  const prevEval = mockEvaluation({
    fundamentalFactors: [
      { ...factorC, score: 70 },
      { ...factorA, score: 60 },
    ],
    technicalFactors: [{ ...factorB, score: 65 }],
  });
  const res = FactorAttributionEngine.evaluate({
    currentEvaluation: currEval,
    previousEvaluation: prevEval,
  });
  const factorAName = res.activeFactorDeltas.find((d) => d.name === 'Operating Margin Trend');
  assert(
    factorAName !== undefined && factorAName.scoreDelta === 20,
    'ATTR-01: Factor matching is strictly by factor.name regardless of array index'
  );
}

// ATTR-02
{
  const currEval = mockEvaluation({ coreScore: 78 });
  const prevEval = mockEvaluation({ coreScore: 74 }); // |ΔCore| = 4 >= 3
  const res = FactorAttributionEngine.evaluate({
    currentEvaluation: currEval,
    previousEvaluation: prevEval,
  });
  assert(res.isTriggered === true && res.scoreDelta === 4, 'ATTR-02: |ΔCore| >= 3 triggers attribution');
}

// ATTR-03
{
  const currEval = mockEvaluation({ coreScore: 75 });
  const prevEval = mockEvaluation({ coreScore: 74 }); // |ΔCore| = 1 < 3
  const res = FactorAttributionEngine.evaluate({
    currentEvaluation: currEval,
    previousEvaluation: prevEval,
  });
  assert(res.isTriggered === false && res.scoreDelta === 1, 'ATTR-03: |ΔCore| < 3 without condition change does NOT trigger attribution');
}

// ATTR-04
{
  const currEval = mockEvaluation({ coreScore: 75 });
  const prevEval = mockEvaluation({ coreScore: 75 });
  const currContext: StockContextEvaluation = {
    fundamental_condition: 'STRONG',
    technical_condition: 'BULLISH',
    valuation_condition: 'FAIR',
    momentum_condition: 'STRONG_POSITIVE',
    momentum_state: 'ACCELERATING',
    price_location: 'IN_VALUE_ZONE',
    position: null,
    attention_level: 'NORMAL',
    modifiers: [],
  };
  const prevContext: StockContextEvaluation = {
    ...currContext,
    fundamental_condition: 'MODERATE', // Condition transition
  };
  const res = FactorAttributionEngine.evaluate({
    currentEvaluation: currEval,
    previousEvaluation: prevEval,
    currentContext: currContext,
    previousContext: prevContext,
  });
  assert(
    res.isTriggered === true && res.triggerReason?.includes('Fundamental: MODERATE -> STRONG'),
    'ATTR-04: Categorical condition transition triggers attribution even when |ΔCore| = 0'
  );
}

// ATTR-05
{
  const currEval = mockEvaluation({
    fundamentalFactors: [{ ...factorA, score: 80 }],
    technicalFactors: [{ ...factorB, score: 65 }],
  });
  const prevEval = mockEvaluation({
    fundamentalFactors: [{ ...factorA, score: 80 }], // Delta = 0
    technicalFactors: [{ ...factorB, score: 50 }], // Delta = +15
  });
  const res = FactorAttributionEngine.evaluate({
    currentEvaluation: currEval,
    previousEvaluation: prevEval,
  });
  assert(
    res.activeFactorDeltas.length === 1 && res.activeFactorDeltas[0].name === 'RSI Momentum',
    'ATTR-05: Factors with scoreDelta === 0 are excluded from activeFactorDeltas'
  );
}

// ATTR-06
{
  const currEval = mockEvaluation({
    fundamentalFactors: [{ ...factorA, score: 80 }],
  });
  // Previous evaluation has NO factors
  const prevEval = mockEvaluation({
    fundamentalFactors: [],
  });
  const res = FactorAttributionEngine.evaluate({
    currentEvaluation: currEval,
    previousEvaluation: prevEval,
  });
  assert(res.activeFactorDeltas.length === 0, 'ATTR-06: Missing factor in previous evaluation produces null delta and omitted from active deltas');
}

// ATTR-07
{
  const currEval = mockEvaluation({
    fundamentalFactors: [
      { ...factorA, score: 85 }, // Delta: +5
      { ...factorC, score: 95 }, // Delta: +25
    ],
    technicalFactors: [
      { ...factorB, score: 50 }, // Delta: -15
    ],
  });
  const prevEval = mockEvaluation({
    fundamentalFactors: [
      { ...factorA, score: 80 },
      { ...factorC, score: 70 },
    ],
    technicalFactors: [
      { ...factorB, score: 65 },
    ],
  });
  const res = FactorAttributionEngine.evaluate({
    currentEvaluation: currEval,
    previousEvaluation: prevEval,
  });
  const sortedNames = res.activeFactorDeltas.map((d) => d.name);
  assert(
    sortedNames[0] === 'Debt to Equity' && sortedNames[1] === 'RSI Momentum' && sortedNames[2] === 'Operating Margin Trend',
    'ATTR-07: Active factor deltas are sorted in descending order of absolute score delta magnitude'
  );
}

// ATTR-08
{
  const currEval = mockEvaluation({
    fundamentalFactors: [{ ...factorA, score: 85, rawValue: '25%' }],
  });
  const prevEval = mockEvaluation({
    fundamentalFactors: [{ ...factorA, score: 75, rawValue: '20%' }],
  });
  const res = FactorAttributionEngine.evaluate({
    currentEvaluation: currEval,
    previousEvaluation: prevEval,
  });
  const explanation = res.activeFactorDeltas[0]?.explanation;
  assert(
    explanation?.includes('75 (20%)') && explanation?.includes('85 (25%)') && explanation?.includes('+10 pts'),
    'ATTR-08: Textual explanation includes exact numeric scores, raw metrics, and delta points without causal speculation'
  );
}

// ATTR-09
{
  const currEval = mockEvaluation({ fundamentalScore: 85, technicalScore: 70 });
  const prevEval = mockEvaluation({ fundamentalScore: 75, technicalScore: 75 });
  const res = FactorAttributionEngine.evaluate({
    currentEvaluation: currEval,
    previousEvaluation: prevEval,
  });
  assert(
    res.fundamentalScoreDelta === 10 && res.technicalScoreDelta === -5,
    'ATTR-09: Sub-axis score deltas match exact arithmetic differences'
  );
}

// ATTR-10
{
  const fCurr: FactorScore[] = [{ ...factorA, score: 85 }];
  const fPrev: FactorScore[] = [{ ...factorA, score: 75 }];
  const diff = FactorAttributionEngine.compareFactorArrays(fCurr, fPrev);
  assert(
    diff.length === 1 && diff[0].scoreDelta === 10 && diff[0].name === 'Operating Margin Trend',
    'ATTR-10: Pure helper compareFactorArrays accurately computes factor differences'
  );
}

console.log('\n======================================================');
console.log(`V2.1 TEST SUMMARY: Passed: ${passed} | Failed: ${failed} | Total: ${passed + failed}`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
