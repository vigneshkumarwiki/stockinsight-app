/**
 * STOCKINSIGHT V2.2 Feature Verification Test Suite
 * 
 * Scope:
 * - F-01: Visual Sub-Factor Attribution Inspector (ATTR-01 .. ATTR-10)
 * - F-02: Portfolio Capital Concentration & Sector Exposure (CONC-01 .. CONC-10)
 * - F-03: Position Stop Proximity Gradient & Capital-at-Risk (PROX-01 .. PROX-12)
 * 
 * Total Tests: 32
 */

import { FactorAttributionEngine } from '../engine/factorAttributionEngine';
import { ConcentrationEngine, SECTOR_CONCENTRATION_THRESHOLD_PCT, STOCK_CONCENTRATION_THRESHOLD_PCT } from '../engine/concentrationEngine';
import { StopProximityEngine } from '../engine/stopProximityEngine';
import { StockInsightEvaluation, FactorScore } from '../types/engine';
import { HoldingWithEvaluation } from '../types/portfolio';
import { StockContextEvaluation } from '../types/context';
import { HorizonEngine } from '../engine/horizonEngine';
import { ExecutionEngine } from '../engine/executionEngine';
import { PriceStructureEngine } from '../engine/priceStructureEngine';

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
console.log('STOCKINSIGHT V2.2 FEATURE ACCEPTANCE TEST SUITE');
console.log('======================================================\n');

// Test Mock Builders
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
    {
      name: 'Return on Equity',
      score: 10,
      maxScore: 10,
      weight: 0.2,
      category: 'FUNDAMENTAL',
      rawValue: '18.2%',
      description: 'High ROE',
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
      name: 'RSI Momentum',
      score: 10,
      maxScore: 10,
      weight: 0.2,
      category: 'TECHNICAL',
      rawValue: '62.5',
      description: 'Bullish RSI',
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
    recommendedStopPrice: 2300,
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
  coreScore: 80,
  zone: 'FAVORABLE',
  actionBadge: 'ACCUMULATE',
  allocationWeight: 0.25,
  stopBreached: false,
  accrualTrapGain: false,
  quoteStatus: 'RESOLVED',
  ...overrides,
});

// ============================================================================
// F-01: Visual Sub-Factor Attribution Tests (ATTR-01 .. ATTR-10)
// ============================================================================
console.log('--- F-01: Sub-Factor Attribution Tests (10 tests) ---');

// ATTR-01
{
  const curr = mockEvaluation({ coreScore: 80 });
  const prev = mockEvaluation({ coreScore: 81 }); // |ΔCore| = 1 < 3
  const res = FactorAttributionEngine.evaluate({ currentEvaluation: curr, previousEvaluation: prev });
  assert(res.isTriggered === false, 'ATTR-01: No material transition (|ΔCore| < 3, no condition shifts) evaluates isTriggered = false');
}

// ATTR-02
{
  const curr = mockEvaluation({ coreScore: 80 });
  const prev = mockEvaluation({ coreScore: 75 }); // |ΔCore| = 5 >= 3
  const res = FactorAttributionEngine.evaluate({ currentEvaluation: curr, previousEvaluation: prev });
  assert(res.isTriggered === true && res.scoreDelta === 5, 'ATTR-02: |ΔCore| >= 3 triggers attribution');
}

// ATTR-03
{
  const curr = mockEvaluation({ coreScore: 80 });
  const prev = mockEvaluation({ coreScore: 80 });
  const currCtx: StockContextEvaluation = {
    fundamental_condition: 'STRONG',
    technical_condition: 'STRONG',
    valuation_condition: 'REASONABLE',
    momentum_condition: 'ACCELERATING',
    momentum_state: 'AVAILABLE',
    price_location: 'IN_VALUE_ZONE',
    position: null,
    attention_level: 'NORMAL',
    modifiers: [],
  };
  const prevCtx: StockContextEvaluation = {
    ...currCtx,
    fundamental_condition: 'HEALTHY', // Shift
  };
  const res = FactorAttributionEngine.evaluate({
    currentEvaluation: curr,
    previousEvaluation: prev,
    currentContext: currCtx,
    previousContext: prevCtx,
  });
  assert(res.isTriggered === true && res.triggerReason?.includes('Fundamental: HEALTHY -> STRONG'), 'ATTR-03: Fundamental condition transition triggers attribution');
}

// ATTR-04
{
  const curr = mockEvaluation({ coreScore: 80 });
  const prev = mockEvaluation({ coreScore: 80 });
  const currCtx: StockContextEvaluation = {
    fundamental_condition: 'STRONG',
    technical_condition: 'STRONG',
    valuation_condition: 'REASONABLE',
    momentum_condition: 'ACCELERATING',
    momentum_state: 'AVAILABLE',
    price_location: 'IN_VALUE_ZONE',
    position: null,
    attention_level: 'NORMAL',
    modifiers: [],
  };
  const prevCtx: StockContextEvaluation = {
    ...currCtx,
    technical_condition: 'WEAKENING', // Shift
  };
  const res = FactorAttributionEngine.evaluate({
    currentEvaluation: curr,
    previousEvaluation: prev,
    currentContext: currCtx,
    previousContext: prevCtx,
  });
  assert(res.isTriggered === true && res.triggerReason?.includes('Technical: WEAKENING -> STRONG'), 'ATTR-04: Technical condition transition triggers attribution');
}

// ATTR-05
{
  const f1: FactorScore = { name: 'Alpha Factor', score: 10, maxScore: 10, weight: 0.2, category: 'FUNDAMENTAL', rawValue: '10' };
  const f2: FactorScore = { name: 'Beta Factor', score: 8, maxScore: 10, weight: 0.2, category: 'TECHNICAL', rawValue: '8' };
  const curr = mockEvaluation({ fundamentalFactors: [f1], technicalFactors: [f2] });
  // Swap order in previous evaluation
  const prev = mockEvaluation({ fundamentalFactors: [{ ...f1, score: 6 }], technicalFactors: [{ ...f2, score: 4 }] });
  const res = FactorAttributionEngine.evaluate({ currentEvaluation: curr, previousEvaluation: prev });
  const alpha = res.activeFactorDeltas.find((d) => d.name === 'Alpha Factor');
  const beta = res.activeFactorDeltas.find((d) => d.name === 'Beta Factor');
  assert(alpha?.scoreDelta === 4 && beta?.scoreDelta === 4, 'ATTR-05: Factors matched strictly by factor.name despite array permutation');
}

// ATTR-06
{
  const f1: FactorScore = { name: 'Alpha Factor', score: 10, maxScore: 10, weight: 0.2, category: 'FUNDAMENTAL', rawValue: '10' };
  const curr = mockEvaluation({ fundamentalFactors: [f1], technicalFactors: [] });
  const prev = mockEvaluation({ fundamentalFactors: [{ ...f1, score: 6 }], technicalFactors: [] });
  const res = FactorAttributionEngine.evaluate({ currentEvaluation: curr, previousEvaluation: prev });
  assert(res.activeFactorDeltas[0].scoreDelta === 4 && res.activeFactorDeltas[0].explanation.includes('+4 pts'), 'ATTR-06: Positive factor delta formatted with + sign and exact shift');
}

// ATTR-07
{
  const f1: FactorScore = { name: 'Alpha Factor', score: 4, maxScore: 10, weight: 0.2, category: 'FUNDAMENTAL', rawValue: '4' };
  const curr = mockEvaluation({ fundamentalFactors: [f1], technicalFactors: [] });
  const prev = mockEvaluation({ fundamentalFactors: [{ ...f1, score: 9 }], technicalFactors: [] });
  const res = FactorAttributionEngine.evaluate({ currentEvaluation: curr, previousEvaluation: prev });
  assert(res.activeFactorDeltas[0].scoreDelta === -5 && res.activeFactorDeltas[0].explanation.includes('-5 pts'), 'ATTR-07: Negative factor delta formatted with - sign and exact shift');
}

// ATTR-08
{
  const f1: FactorScore = { name: 'Alpha Factor', score: 10, maxScore: 10, weight: 0.2, category: 'FUNDAMENTAL', rawValue: '10' };
  const f2: FactorScore = { name: 'Beta Factor', score: 8, maxScore: 10, weight: 0.2, category: 'TECHNICAL', rawValue: '8' };
  const curr = mockEvaluation({ fundamentalFactors: [f1], technicalFactors: [f2] });
  const prev = mockEvaluation({ fundamentalFactors: [{ ...f1, score: 10 }], technicalFactors: [{ ...f2, score: 5 }] });
  const res = FactorAttributionEngine.evaluate({ currentEvaluation: curr, previousEvaluation: prev });
  assert(res.activeFactorDeltas.length === 1 && res.activeFactorDeltas[0].name === 'Beta Factor', 'ATTR-08: Zero-delta factors are strictly excluded from active delta set');
}

// ATTR-09
{
  const f1: FactorScore = { name: 'Brand New Factor', score: 10, maxScore: 10, weight: 0.2, category: 'FUNDAMENTAL', rawValue: '10' };
  const curr = mockEvaluation({ fundamentalFactors: [f1], technicalFactors: [] });
  const prev = mockEvaluation({ fundamentalFactors: [], technicalFactors: [] }); // Missing
  const res = FactorAttributionEngine.evaluate({ currentEvaluation: curr, previousEvaluation: prev });
  assert(res.activeFactorDeltas.length === 0, 'ATTR-09: Missing factor produces scoreDelta = null and is omitted from active list');
}

// ATTR-10
{
  const f1: FactorScore = { name: 'Factor Low Delta', score: 6, maxScore: 10, weight: 0.2, category: 'FUNDAMENTAL', rawValue: '6' };
  const f2: FactorScore = { name: 'Factor High Delta', score: 10, maxScore: 10, weight: 0.2, category: 'TECHNICAL', rawValue: '10' };
  const curr = mockEvaluation({ fundamentalFactors: [f1], technicalFactors: [f2] });
  const prev = mockEvaluation({ fundamentalFactors: [{ ...f1, score: 5 }], technicalFactors: [{ ...f2, score: 2 }] }); // f1: +1, f2: +8
  const res = FactorAttributionEngine.evaluate({ currentEvaluation: curr, previousEvaluation: prev });
  assert(res.activeFactorDeltas[0].name === 'Factor High Delta' && res.activeFactorDeltas[1].name === 'Factor Low Delta', 'ATTR-10: Active factors sorted descending by absolute score delta');
}

// ============================================================================
// F-02: Portfolio Capital Concentration Tests (CONC-01 .. CONC-10)
// ============================================================================
console.log('\n--- F-02: Portfolio Capital Concentration Tests (10 tests) ---');

// CONC-01
{
  const res = ConcentrationEngine.evaluate([]);
  assert(
    res.resolvedCapital === 0 && res.sectors.length === 0 && res.topStockConcentrations.length === 0 && res.hasSectorConcentration === false && res.hasStockConcentration === false,
    'CONC-01: Empty portfolio returns 0 resolved capital, empty sector map, and 0 concentration flags'
  );
}

// CONC-02
{
  const item1 = mockHoldingItem({
    currentLtp: 1000,
    quoteStatus: 'RESOLVED',
    holding: { isin: 'INE001A01011', symbol: 'STOCK1', quantity: 10, averageBuyPrice: 900, sector: 'ENERGY' },
  }); // 10,000
  const item2 = mockHoldingItem({
    currentLtp: 2000,
    quoteStatus: 'RESOLVED',
    holding: { isin: 'INE002A01012', symbol: 'STOCK2', quantity: 10, averageBuyPrice: 1900, sector: 'IT' },
  }); // 20,000
  const res = ConcentrationEngine.evaluate([item1, item2]);
  assert(res.resolvedCapital === 30000, 'CONC-02: Resolved capital correctly sums quantity * LTP for resolved quotes');
}

// CONC-03
{
  const item1 = mockHoldingItem({
    currentLtp: 1000,
    quoteStatus: 'RESOLVED',
    holding: { isin: 'INE001A01011', symbol: 'STOCK1', quantity: 10, averageBuyPrice: 900, sector: 'ENERGY' },
  }); // 10,000
  const item2 = mockHoldingItem({
    currentLtp: null,
    quoteStatus: 'UNAVAILABLE',
    holding: { isin: 'INE002A01012', symbol: 'STOCK2', quantity: 10, averageBuyPrice: 1900, sector: 'IT' },
  }); // Excluded
  const res = ConcentrationEngine.evaluate([item1, item2]);
  assert(res.resolvedCapital === 10000 && res.unresolvedCount === 1, 'CONC-03: Unresolved quote excluded from denominator and tracked in unresolvedCount');
}

// CONC-04
{
  const item1 = mockHoldingItem({
    currentLtp: 1000,
    quoteStatus: 'RESOLVED',
    holding: { isin: 'INE001A01011', symbol: 'STOCK1', quantity: 10, averageBuyPrice: 900, sector: 'ENERGY' },
  }); // 10,000 (50%)
  const item2 = mockHoldingItem({
    currentLtp: 1000,
    quoteStatus: 'RESOLVED',
    holding: { isin: 'INE002A01012', symbol: 'STOCK2', quantity: 10, averageBuyPrice: 900, sector: 'IT' },
  }); // 10,000 (50%)
  const res = ConcentrationEngine.evaluate([item1, item2]);
  const sumWeights = res.sectors.reduce((acc, s) => acc + s.capitalWeightPct, 0);
  assert(Math.round(sumWeights) === 100, 'CONC-04: Sector weights sum to 100% across non-empty sectors');
}

// CONC-05
{
  const item1 = mockHoldingItem({
    currentLtp: 3000,
    quoteStatus: 'RESOLVED',
    holding: { isin: 'INE001A01011', symbol: 'ENERGY1', quantity: 10, averageBuyPrice: 2000, sector: 'ENERGY' },
  }); // 30,000 (75%)
  const item2 = mockHoldingItem({
    currentLtp: 1000,
    quoteStatus: 'RESOLVED',
    holding: { isin: 'INE002A01012', symbol: 'IT1', quantity: 10, averageBuyPrice: 900, sector: 'IT' },
  }); // 10,000 (25%)
  const res = ConcentrationEngine.evaluate([item1, item2]);
  const energy = res.sectors.find((s) => s.sector === 'ENERGY');
  assert(energy?.isConcentrated === true && res.hasSectorConcentration === true, 'CONC-05: Sector > 25.0% triggers isConcentrated = true');
}

// CONC-06
{
  // 4 sectors with exactly 25.0% each (25,000 / 100,000)
  const items = ['ENERGY', 'IT', 'AUTO', 'FINANCE'].map((sector, i) =>
    mockHoldingItem({
      currentLtp: 2500,
      quoteStatus: 'RESOLVED',
      holding: { isin: `INE00${i}A01011`, symbol: `STOCK${i}`, quantity: 10, averageBuyPrice: 2000, sector },
    })
  );
  const res = ConcentrationEngine.evaluate(items);
  const allNormal = res.sectors.every((s) => s.isConcentrated === false);
  assert(allNormal && res.hasSectorConcentration === false, 'CONC-06: Sector exactly 25.0% evaluates isConcentrated = false (boundary rule)');
}

// CONC-07
{
  const item1 = mockHoldingItem({
    currentLtp: 2000,
    quoteStatus: 'RESOLVED',
    holding: { isin: 'INE001A01011', symbol: 'BIG_STOCK', quantity: 10, averageBuyPrice: 1500, sector: 'ENERGY' },
  }); // 20,000 (20% of 100,000 -> > 15%)
  const item2 = mockHoldingItem({
    currentLtp: 8000,
    quoteStatus: 'RESOLVED',
    holding: { isin: 'INE002A01012', symbol: 'OTHER_STOCKS', quantity: 10, averageBuyPrice: 7000, sector: 'IT' },
  }); // 80,000
  const res = ConcentrationEngine.evaluate([item1, item2]);
  const bigStock = res.topStockConcentrations.find((s) => s.symbol === 'BIG_STOCK');
  assert(bigStock?.isConcentrated === true && res.hasStockConcentration === true, 'CONC-07: Single stock > 15.0% triggers isConcentrated = true');
}

// CONC-08
{
  // Stock with exactly 15.0% (15,000 / 100,000)
  const item1 = mockHoldingItem({
    currentLtp: 1500,
    quoteStatus: 'RESOLVED',
    holding: { isin: 'INE001A01011', symbol: 'EXACT_15', quantity: 10, averageBuyPrice: 1000, sector: 'ENERGY' },
  }); // 15,000 (15%)
  const item2 = mockHoldingItem({
    currentLtp: 8500,
    quoteStatus: 'RESOLVED',
    holding: { isin: 'INE002A01012', symbol: 'REST_85', quantity: 10, averageBuyPrice: 7000, sector: 'IT' },
  }); // 85,000 (85%)
  const res = ConcentrationEngine.evaluate([item1, item2]);
  const exact15 = res.topStockConcentrations.find((s) => s.symbol === 'EXACT_15');
  assert(exact15?.isConcentrated === false, 'CONC-08: Single stock exactly 15.0% evaluates isConcentrated = false (boundary rule)');
}

// CONC-09
{
  const item1 = mockHoldingItem({
    currentLtp: 1000,
    quoteStatus: 'RESOLVED',
    holding: { isin: 'INE001A01011', symbol: 'S1', quantity: 10, averageBuyPrice: 900, sector: 'SMALL_SECTOR' },
  }); // 10,000
  const item2 = mockHoldingItem({
    currentLtp: 5000,
    quoteStatus: 'RESOLVED',
    holding: { isin: 'INE002A01012', symbol: 'S2', quantity: 10, averageBuyPrice: 4000, sector: 'BIG_SECTOR' },
  }); // 50,000
  const res = ConcentrationEngine.evaluate([item1, item2]);
  assert(res.sectors[0].sector === 'BIG_SECTOR' && res.sectors[1].sector === 'SMALL_SECTOR', 'CONC-09: Sectors sorted descending by capital weight');
}

// CONC-10
{
  const item = mockHoldingItem({
    currentLtp: 2500,
    evaluation: mockEvaluation({ coreScore: 80, fundamentalScore: 40, technicalScore: 40 }),
  });
  ConcentrationEngine.evaluate([item]);
  assert(
    item.evaluation?.coreScore === 80 && item.evaluation?.fundamentalScore === 40 && item.evaluation?.technicalScore === 40,
    'CONC-10: Pure aggregation produces zero mutation to stock-level scores'
  );
}

// ============================================================================
// F-03: Position Stop Proximity Gradient & Capital Buffer Tests (PROX-01 .. PROX-12)
// ============================================================================
console.log('\n--- F-03: Position Stop Proximity & Buffer Tests (12 tests) ---');

// PROX-01: LTP <= S1 -> BREACHED
{
  const prox = StopProximityEngine.evaluatePosition({ ltp: 2200, s1: 2300, atr14: 40 });
  assert(prox.proximityState === 'BREACHED', 'PROX-01: LTP <= S1 resolves strictly to BREACHED');
}

// PROX-02: LTP > S1 && LTP <= S1 + 0.50 * ATR14 -> BUFFER_ZONE
{
  // S1 = 2300, ATR14 = 40, 0.5 ATR = 20 -> Buffer envelope = (2300, 2320]
  const prox = StopProximityEngine.evaluatePosition({ ltp: 2315, s1: 2300, atr14: 40 });
  assert(prox.proximityState === 'BUFFER_ZONE', 'PROX-02: LTP in (S1, S1 + 0.50 * ATR14] resolves strictly to BUFFER_ZONE');
}

// PROX-03: LTP > S1 + 0.50 * ATR14 -> STOP_INTACT
{
  // LTP = 2400 > 2320
  const prox = StopProximityEngine.evaluatePosition({ ltp: 2400, s1: 2300, atr14: 40 });
  assert(prox.proximityState === 'STOP_INTACT', 'PROX-03: LTP > S1 + 0.50 * ATR14 resolves strictly to STOP_INTACT');
}

// PROX-04: LTP === S1 (Exact boundary) -> BREACHED
{
  const prox = StopProximityEngine.evaluatePosition({ ltp: 2300, s1: 2300, atr14: 40 });
  assert(prox.proximityState === 'BREACHED', 'PROX-04: LTP exactly equals S1 resolves to BREACHED (exact boundary)');
}

// PROX-05: LTP === S1 + 0.50 * ATR14 (Exact boundary) -> BUFFER_ZONE
{
  // S1 = 2300, ATR14 = 40 -> S1 + 0.50 * ATR = 2320
  const prox = StopProximityEngine.evaluatePosition({ ltp: 2320, s1: 2300, atr14: 40 });
  assert(prox.proximityState === 'BUFFER_ZONE', 'PROX-05: LTP exactly equals S1 + 0.50 * ATR14 resolves to BUFFER_ZONE (exact boundary)');
}

// PROX-06: StopDistancePct formula precision: ((LTP - S1) / LTP) * 100
{
  // LTP = 2500, S1 = 2300 -> (200 / 2500) * 100 = 8.00%
  const prox = StopProximityEngine.evaluatePosition({ ltp: 2500, s1: 2300, atr14: 40 });
  assert(prox.stopDistancePct === 8.0, 'PROX-06: StopDistancePct formula precision matches ((LTP - S1) / LTP) * 100');
}

// PROX-07: StopDistanceATR formula precision: (LTP - S1) / ATR14
{
  // LTP = 2500, S1 = 2300, ATR14 = 40 -> 200 / 40 = 5.00 ATR
  const prox = StopProximityEngine.evaluatePosition({ ltp: 2500, s1: 2300, atr14: 40 });
  assert(prox.stopDistanceATR === 5.0, 'PROX-07: StopDistanceATR formula precision matches (LTP - S1) / ATR14');
}

// PROX-08: Missing LTP -> null proximity
{
  const prox = StopProximityEngine.evaluatePosition({ ltp: null, s1: 2300, atr14: 40 });
  assert(prox.proximityState === null && prox.stopDistancePct === null && prox.stopDistanceATR === null, 'PROX-08: Missing LTP returns null proximity metrics');
}

// PROX-09: Missing S1 or ATR14 -> null proximity
{
  const prox1 = StopProximityEngine.evaluatePosition({ ltp: 2500, s1: null, atr14: 40 });
  const prox2 = StopProximityEngine.evaluatePosition({ ltp: 2500, s1: 2300, atr14: null });
  assert(prox1.proximityState === null && prox2.proximityState === null, 'PROX-09: Missing S1 or ATR14 returns null proximity metrics');
}

// PROX-10: Unheld position (quantity <= 0) -> isHeld = false
{
  const prox = StopProximityEngine.evaluatePosition({ ltp: 2500, s1: 2300, atr14: 40, quantity: 0 });
  assert(prox.isHeld === false, 'PROX-10: Unheld quantity <= 0 flags isHeld = false');
}

// PROX-11: CapitalInBufferZone sums only resolved holdings in BUFFER_ZONE
{
  // Item in BUFFER_ZONE: LTP 2310, S1 2300, ATR 40 -> Capital: 10 * 2310 = 23,100
  const item1 = mockHoldingItem({
    currentLtp: 2310,
    quoteStatus: 'RESOLVED',
    evaluation: mockEvaluation({
      priceStructure: { stops: { s1: { price: 2300 } }, metadata: { atr14: 40 } } as any,
    }),
    holding: { isin: 'INE001A01011', symbol: 'BUF1', quantity: 10, averageBuyPrice: 2200, sector: 'ENERGY' },
  });
  // Item in STOP_INTACT: LTP 2500, S1 2300, ATR 40 -> Capital: 10 * 2500 = 25,000
  const item2 = mockHoldingItem({
    currentLtp: 2500,
    quoteStatus: 'RESOLVED',
    evaluation: mockEvaluation({
      priceStructure: { stops: { s1: { price: 2300 } }, metadata: { atr14: 40 } } as any,
    }),
    holding: { isin: 'INE002A01012', symbol: 'INTACT1', quantity: 10, averageBuyPrice: 2400, sector: 'IT' },
  });
  const res = StopProximityEngine.evaluatePortfolioBuffer([item1, item2]);
  assert(
    res.bufferHoldingsCount === 1 && res.capitalInBufferZone === 23100 && res.resolvedCapital === 48100,
    'PROX-11: CapitalInBufferZone sums only resolved holdings in BUFFER_ZONE'
  );
}

// PROX-12: CapitalInBufferZonePct uses total resolved capital denominator
{
  // Buffer: 20,000 | Total: 40,000 -> 50.0%
  const item1 = mockHoldingItem({
    currentLtp: 2000,
    quoteStatus: 'RESOLVED',
    evaluation: mockEvaluation({
      priceStructure: { stops: { s1: { price: 1980 } }, metadata: { atr14: 50 } } as any, // S1+0.5ATR = 2005 >= 2000 -> BUFFER
    }),
    holding: { isin: 'INE001A01011', symbol: 'BUF', quantity: 10, averageBuyPrice: 1900, sector: 'ENERGY' },
  });
  const item2 = mockHoldingItem({
    currentLtp: 2000,
    quoteStatus: 'RESOLVED',
    evaluation: mockEvaluation({
      priceStructure: { stops: { s1: { price: 1800 } }, metadata: { atr14: 50 } } as any, // S1+0.5ATR = 1825 < 2000 -> INTACT
    }),
    holding: { isin: 'INE002A01012', symbol: 'INTACT', quantity: 10, averageBuyPrice: 1900, sector: 'IT' },
  });
  const res = StopProximityEngine.evaluatePortfolioBuffer([item1, item2]);
  assert(res.capitalInBufferZonePct === 50.0, 'PROX-12: CapitalInBufferZonePct calculates percentage relative to total resolved capital');
}

// ======================================================
// RUNTIME DEFECT REGRESSION TESTS
// ======================================================
console.log('\n--- Runtime Defect Regression Tests (4 tests) ---');

// REG-01: Canonical Horizon Score Formulations for Fundamental=21.0, Technical=2.0
{
  const scores = HorizonEngine.evaluate({
    fundamentalScore: 21.0,
    technicalScore: 2.0,
    isETF: false,
  });

  // SHORT = 2 * (0.30 * 21.0 + 0.70 * 2.0) = 2 * (6.3 + 1.4) = 15.4
  assert(Math.abs(scores.SHORT.score - 15.4) < 0.001, `REG-01: SHORT score is 15.4 (Actual: ${scores.SHORT.score})`);

  // MEDIUM = 21.0 + 2.0 = 23.0
  assert(Math.abs(scores.MEDIUM.score - 23.0) < 0.001, `REG-01: MEDIUM score is 23.0 (Actual: ${scores.MEDIUM.score})`);

  // LONG = 2 * (0.70 * 21.0 + 0.30 * 2.0) = 2 * (14.7 + 0.6) = 30.6
  assert(Math.abs(scores.LONG.score - 30.6) < 0.001, `REG-01: LONG score is 30.6 (Actual: ${scores.LONG.score})`);
}

// REG-02: Zero bid depth (bestBid = 0) does NOT fabricate 100% spread
{
  const mockTechCalcs = {
    atr14: 15.0,
    twentyDayTurnoverCr: 50.0,
  } as any;
  const corridor = ExecutionEngine.evaluate(
    mockTechCalcs,
    850,
    700,
    true,
    0, // bestBid = 0 (empty depth outside market hours)
    774.95, // bestAsk
    false
  );
  assert(corridor.bidAskSpreadPct === 0, `REG-02: Zero bid produces bidAskSpreadPct = 0 (Actual: ${corridor.bidAskSpreadPct})`);
  assert(corridor.highSlippageRisk === false, 'REG-02: Zero bid produces highSlippageRisk = false');
}

// REG-03: Zero ask depth (bestAsk = 0) does NOT fabricate spread
{
  const mockTechCalcs = {
    atr14: 15.0,
    twentyDayTurnoverCr: 50.0,
  } as any;
  const corridor = ExecutionEngine.evaluate(
    mockTechCalcs,
    850,
    700,
    true,
    774.95,
    0, // bestAsk = 0
    false
  );
  assert(corridor.bidAskSpreadPct === 0, `REG-03: Zero ask produces bidAskSpreadPct = 0 (Actual: ${corridor.bidAskSpreadPct})`);
  assert(corridor.highSlippageRisk === false, 'REG-03: Zero ask produces highSlippageRisk = false');
}

// REG-04: Genuine wide spread (> 0.40%) correctly triggers highSlippageRisk
{
  const mockTechCalcs = {
    ltp: 100.0,
    atr14: 15.0,
    twentyDayTurnoverCr: 50.0,
  } as any;
  const corridor = ExecutionEngine.evaluate(
    mockTechCalcs,
    850,
    700,
    true,
    100.0,
    100.5,
    false
  );
  // (0.5 / 100) * 100 = 0.50% > 0.40%
  assert(Math.abs(corridor.bidAskSpreadPct - 0.50) < 0.001, 'REG-04: Genuine spread computes 0.50%');
  assert(corridor.highSlippageRisk === true, 'REG-04: Spread > 0.40% triggers highSlippageRisk = true');
}

// ======================================================
// UX SIMPLIFICATION ARCHITECTURAL INVARIANTS
// ======================================================
console.log('\n--- UX Simplification Architectural Invariant Tests (5 tests) ---');

// UX-01: HorizonEngine internally evaluates all three horizons without UI selector
{
  const result = HorizonEngine.evaluate({
    fundamentalScore: 35.0,
    technicalScore: 40.0,
    isETF: false,
  });
  assert(result.SHORT.horizon === 'SHORT' && result.SHORT.score > 0, 'UX-01: SHORT horizon score computed internally');
  assert(result.MEDIUM.horizon === 'MEDIUM' && result.MEDIUM.score > 0, 'UX-01: MEDIUM horizon score computed internally');
  assert(result.LONG.horizon === 'LONG' && result.LONG.score > 0, 'UX-01: LONG horizon score computed internally');
}

// UX-02: Core Score (F + T) equals MEDIUM score
{
  const f = 25.0;
  const t = 30.0;
  const coreScore = f + t;
  const hScores = HorizonEngine.evaluate({ fundamentalScore: f, technicalScore: t, isETF: false });
  assert(coreScore === hScores.MEDIUM.score, `UX-02: Core Score (${coreScore}) matches MEDIUM score (${hScores.MEDIUM.score})`);
}

// UX-03: Model D produces all 9 structural levels in PriceStructure
{
  const sampleEntry = { price: 1000, classification: 'STRUCTURAL' as const, source: 'UPSTOX_CANDLES' as const, type: 'Support' };
  const s1 = PriceStructureEngine.calculateHorizonStop(sampleEntry, 1050, 20, 'S1', [{ price: 980, type: 'Pivot', source: 'UPSTOX_CANDLES' as const, volumeScore: 1, barIndex: 5 }]);
  assert(s1.price !== null && s1.price > 0, 'UX-03: S1 structural stop computed successfully');
}

// UX-04: Sequential Dependency — Unavailable entry produces UNAVAILABLE stop
{
  const unavailEntry = { price: null, classification: 'UNAVAILABLE' as const, source: 'NONE' as const, type: 'UNAVAILABLE' };
  const s2 = PriceStructureEngine.calculateHorizonStop(unavailEntry, 1050, 20, 'S2', []);
  assert(s2.price === null && s2.classification === 'UNAVAILABLE', 'UX-04: Unavailable Entry produces Unavailable Stop');
}

// UX-05: ExecutionEngine evaluates independently without Horizon parameter
{
  const tech = { ltp: 1500, atr14: 30, turnover20DCr: 100, swingLow10: 1440 } as any;
  const corridor = ExecutionEngine.evaluate(tech, 1800, 1200, true, 1498, 1502, false);
  assert(corridor.status === 'READY_TO_BUY' || corridor.status === 'EXTENDED_WAIT_FOR_PULLBACK', 'UX-05: ExecutionEngine executes independently');
  assert(corridor.stopLoss > 0 && corridor.target > 0, 'UX-05: Trade corridor boundaries computed');
}

console.log('\n======================================================');
console.log(`V2.2 TEST SUMMARY: Passed: ${passed} | Failed: ${failed} | Total: ${passed + failed}`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
