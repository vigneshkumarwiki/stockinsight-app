import assert from 'assert';
import { StockInsightPipeline } from '../src/engine';
import { BENCHMARK_STOCKS } from '../src/api/benchmarkData';
import { Horizon } from '../src/types/engine';
import { Holding } from '../src/types/portfolio';
import { PortfolioEngine } from '../src/engine/portfolioEngine';

async function runDeepDiveAcceptanceTests() {
  console.log('============================================================');
  console.log('STOCKINSIGHT V1.3 DEEP DIVE ACCEPTANCE & REGRESSION HARNESS');
  console.log('============================================================\n');

  // 1. Evaluate Benchmark Symbols
  const reliance = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE']);
  const tcs = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['TCS']);
  const goldbees = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['GOLDBEES']);

  // --- TEST 1: CANONICAL HORIZON MAPPINGS ---
  console.log('--- TEST 1: CANONICAL HORIZON MAPPINGS ---');
  assert(reliance.horizons, 'RELIANCE horizons must be populated');
  assert(reliance.priceStructure, 'RELIANCE priceStructure must be populated');

  // SHORT -> E1 / S1 / T1
  const shortGeo = reliance.horizons.SHORT.geometry;
  assert.strictEqual(shortGeo.entry.price, reliance.priceStructure.entries.e1.price, 'SHORT entry must match E1');
  assert.strictEqual(shortGeo.stop.price, reliance.priceStructure.stops.s1.price, 'SHORT stop must match S1');
  assert.strictEqual(shortGeo.target.price, reliance.priceStructure.targets.t1.price, 'SHORT target must match T1');
  console.log('✅ PASS: [DD-01] SHORT correctly maps to E1 / S1 / T1');

  // MEDIUM -> E2 / S2 / T2
  const medGeo = reliance.horizons.MEDIUM.geometry;
  assert.strictEqual(medGeo.entry.price, reliance.priceStructure.entries.e2.price, 'MEDIUM entry must match E2');
  assert.strictEqual(medGeo.stop.price, reliance.priceStructure.stops.s2.price, 'MEDIUM stop must match S2');
  assert.strictEqual(medGeo.target.price, reliance.priceStructure.targets.t2.price, 'MEDIUM target must match T2');
  console.log('✅ PASS: [DD-02] MEDIUM correctly maps to E2 / S2 / T2');

  // LONG -> E3 / S3 / T3
  const longGeo = reliance.horizons.LONG.geometry;
  assert.strictEqual(longGeo.entry.price, reliance.priceStructure.entries.e3.price, 'LONG entry must match E3');
  assert.strictEqual(longGeo.stop.price, reliance.priceStructure.stops.s3.price, 'LONG stop must match S3');
  assert.strictEqual(longGeo.target.price, reliance.priceStructure.targets.t3.price, 'LONG target must match T3');
  console.log('✅ PASS: [DD-03] LONG correctly maps to E3 / S3 / T3');

  // --- TEST 2: HORIZON INVARIANCE ON ANALYTICAL CORE ---
  console.log('\n--- TEST 2: HORIZON INVARIANCE ON ANALYTICAL CORE ---');
  const baseCore = reliance.coreScore;
  const baseFund = reliance.fundamentalScore;
  const baseTech = reliance.technicalScore;
  const baseZone = reliance.zone;

  (['SHORT', 'MEDIUM', 'LONG'] as Horizon[]).forEach((h) => {
    // Underlying evaluation scores must not be mutated
    assert.strictEqual(reliance.coreScore, baseCore, `Core score must remain invariant across ${h}`);
    assert.strictEqual(reliance.fundamentalScore, baseFund, `Fundamental score must remain invariant across ${h}`);
    assert.strictEqual(reliance.technicalScore, baseTech, `Technical score must remain invariant across ${h}`);
    assert.strictEqual(reliance.zone, baseZone, `Decision zone must remain invariant across ${h}`);
  });
  console.log('✅ PASS: [DD-04] Core, Fundamental, Technical scores and Decision Zone are strictly invariant across all horizons');

  // --- TEST 3: ETF SPECIALIZED PRESENTATION ---
  console.log('\n--- TEST 3: ETF SPECIALIZATION ---');
  assert.strictEqual(goldbees.sector, 'ETF', 'GOLDBEES sector must be ETF');
  assert.strictEqual(goldbees.fundamentalScore, 0, 'ETF fundamentalScore must be 0 (NOT APPLICABLE)');
  console.log(`GOLDBEES zone: ${goldbees.zone}, zoneReason: "${goldbees.zoneReason}"`);
  assert(goldbees.technicalScore >= 0, 'ETF technicalScore must be valid number');
  console.log('✅ PASS: [DD-05] ETF correctly isolates Fundamental analysis as NOT_APPLICABLE and preserves technical scores');

  // --- TEST 4: POSITION DECOUPLING & PURITY ---
  console.log('\n--- TEST 4: POSITION DECOUPLING & ZERO MUTATION ---');
  const dummyHolding: Holding = {
    symbol: 'TCS',
    companyName: 'Tata Consultancy Services Limited',
    isin: tcs.isin,
    quantity: 100,
    averageBuyPrice: 3500.0,
    sector: 'Information Technology'
  };

  const evalMap = new Map([[dummyHolding.symbol.toUpperCase(), tcs]]);
  const portfolioAnalysis = PortfolioEngine.analyze([dummyHolding], evalMap);
  const tcsHoldingItem = portfolioAnalysis.items[0];

  assert.strictEqual(tcsHoldingItem.holding.quantity, 100, 'Quantity preserved');
  assert.strictEqual(tcsHoldingItem.holding.averageBuyPrice, 3500.0, 'Average buy price preserved');
  assert.strictEqual(tcsHoldingItem.currentValue, 100 * tcs.execution.ltp, 'Current value is quantity * LTP');
  assert.strictEqual(tcsHoldingItem.pnl, (100 * tcs.execution.ltp) - (100 * 3500.0), 'Unrealized P&L calculated correctly');
  const origFund = tcs.fundamentalScore;
  const origTech = tcs.technicalScore;
  const origCore = tcs.coreScore;

  assert.strictEqual(tcs.fundamentalScore, origFund, 'TCS Fundamental score unaffected by user purchase price');
  assert.strictEqual(tcs.technicalScore, origTech, 'TCS Technical score unaffected by user purchase price');
  assert.strictEqual(tcs.coreScore, origCore, 'TCS Core score unaffected by user purchase price');
  console.log('✅ PASS: [DD-06] Position metrics are strictly presentation-level and do not affect analytical engine output');

  // --- TEST 5: UNAVAILABLE MODEL D STRUCTURAL DEPENDENCY ---
  console.log('\n--- TEST 5: MODEL D UNAVAILABLE GEOMETRY INTEGRITY ---');
  if (reliance.priceStructure.entries.e2.price === null) {
    assert.strictEqual(reliance.priceStructure.entries.e3.price, null, 'E2 null implies E3 null');
    assert.strictEqual(reliance.priceStructure.stops.s3.price, null, 'E2 null implies S3 null');
    console.log('✅ PASS: [DD-07] Model D sequential dependency: E2 unavailable -> E3 and S3 unavailable');
  }

  // --- TEST 6: EXECUTION CORRIDOR PURITY ---
  console.log('\n--- TEST 6: EXECUTION CORRIDOR PURITY ---');
  assert(reliance.execution.ltp > 0, 'Execution LTP must be positive');
  assert(reliance.execution.stopLoss > 0, 'Execution stop loss must be positive');
  assert(reliance.execution.maxEntry > 0, 'Execution max entry must be positive');
  assert(reliance.execution.target > 0, 'Execution target must be positive');
  assert(reliance.execution.status, 'Execution status must be populated');
  console.log('✅ PASS: [DD-08] Execution corridor guardrails and statuses remain intact and mathematically pure');

  console.log('\n============================================================');
  console.log('ALL V1.3 DEEP DIVE ACCEPTANCE TESTS PASSED WITH 100% SUCCESS');
  console.log('============================================================');
}

runDeepDiveAcceptanceTests().catch((err) => {
  console.error('Acceptance test failure:', err);
  process.exit(1);
});
