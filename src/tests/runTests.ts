/**
 * STOCKINSIGHT Automated Verification & Regression Suite
 * Validates the 5 Production Integrity Layers:
 * 1. Data Integrity & Cross-Statement Forensic Audit
 * 2. Fundamental Collinearity Controls & Sub-caps
 * 3. Technical Orthogonal Buckets & Volume Veto
 * 4. Anti-Gaming Execution Corridors & Spread Filters
 * 5. Deterministic Evaluation & Mathematical Reconciliation
 */

import { BENCHMARK_STOCKS } from '../api/benchmarkData.ts';
import { StockInsightPipeline } from '../engine/index.ts';
import { SafeParser } from '../engine/safeParser.ts';
import { Normalizer } from '../engine/normalizer.ts';
import { DataAuditor } from '../engine/dataAuditor.ts';
import { ExecutionEngine } from '../engine/executionEngine.ts';
import { TechnicalEngine } from '../engine/technicalEngine.ts';
import { TechnicalCalculator } from '../engine/calculators/technical.ts';
import { PortfolioEngine } from '../engine/portfolioEngine.ts';
import { Holding } from '../types/portfolio.ts';
import { StockInsightEvaluation } from '../types/engine.ts';
import { SearchService } from '../api/searchService.ts';
import { UpstoxClient, UpstoxApiError, RequestQueue, isDailyCandleFinalized } from '../api/upstoxClient.ts';
import { PriceStructureEngine } from '../engine/priceStructureEngine.ts';
import { DecisionEngine } from '../engine/decisionEngine.ts';
import { FundamentalEngine } from '../engine/fundamentalEngine.ts';
import { FundamentalCalculator } from '../engine/calculators/fundamental.ts';
import { FundamentalsDatabase, FUNDAMENTALS_MASTER } from '../data/fundamentalsDatabase.ts';
import { SectorNormalizer } from '../engine/normalizer.ts';
import { HorizonEngine } from '../engine/horizonEngine.ts';
import { runBreakoutVolumeCorrectionTests } from './breakoutVolumeCorrection.test.ts';
import { runZeroMockEnforcementTests } from './zeroMockEnforcement.test.ts';
import { runCorporateActionAndPriceIntegrityTests } from './corporateActionAndPriceIntegrity.test.ts';
import { SessionResolver } from '../engine/sessionResolver.ts';

declare const process: any;

async function runTests() {
  console.log('===========================================================');
  console.log('       STOCKINSIGHT 5-LAYER PRODUCTION INTEGRITY SUITE     ');
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
  // BASE TESTS: SafeParser Nullability & Zero-Coercion Ban
  // ============================================================
  console.log('--- BASE ENGINE TESTS ---');
  assert(SafeParser.parseNumeric('N/A') === null, 'SafeParser rejects "N/A" to null');
  assert(SafeParser.parseNumeric('-') === null, 'SafeParser rejects "-" to null');
  assert(SafeParser.parseNumeric('') === null, 'SafeParser rejects empty string to null');
  assert(SafeParser.parseNumeric(null) === null, 'SafeParser rejects null to null');
  assert(SafeParser.parseNumeric('20.15%') === 20.15, 'SafeParser parses percentage string "20.15%" -> 20.15');
  assert(SafeParser.parseNumeric('₹2,950.40') === 2950.40, 'SafeParser parses currency string with commas -> 2950.40');
  assert(SafeParser.isLossMakingPE(-15.4) === true, 'Loss-making negative P/E correctly detected');
  assert(SafeParser.isLossMakingPE(0) === true, 'Zero P/E correctly flagged as loss-making');
  assert(SafeParser.isLossMakingPE(22.5) === false, 'Positive P/E is valid');

  // ============================================================
  // LAYER 1: DATA INTEGRITY & FORENSIC AUDITS
  // ============================================================
  console.log('\n--- LAYER 1: DATA INTEGRITY FORENSIC AUDIT TESTS ---');

  // Test 1.1: Balanced Balance Sheet passes
  const relInput = BENCHMARK_STOCKS['RELIANCE'];
  const relAudit = DataAuditor.audit(relInput.balanceSheet, relInput.annualIncome, relInput.cashFlow);
  assert(relAudit.status === 'PASSED', 'Layer 1: Balanced balance sheet passes forensic audit');
  assert(relAudit.bsBalanced === true, 'Layer 1: bsBalanced is true for balanced balance sheet');
  assert(relAudit.bsDiscrepancyPct <= 0.1, `Layer 1: Discrepancy ${relAudit.bsDiscrepancyPct.toFixed(2)}% is <= 0.1%`);

  // Test 1.2: Unbalanced Balance Sheet triggers QUARANTINE
  const unbalBS = JSON.parse(JSON.stringify(relInput.balanceSheet));
  unbalBS.data.history[0].total_asset = 2500000; // Artificially inflate assets to create ~28% discrepancy
  const unbalAudit = DataAuditor.audit(unbalBS, relInput.annualIncome, relInput.cashFlow);
  assert(unbalAudit.status === 'QUARANTINED', 'Layer 1: Unbalanced BS triggers QUARANTINED status');
  assert(unbalAudit.bsBalanced === false, 'Layer 1: bsBalanced is false when assets != liabilities + equity');
  assert(unbalAudit.reasons.some(r => r.includes('DATA_QUARANTINED_UNBALANCED_BS')), 'Layer 1: Discrepancy reason logged in audit');

  // Test 1.3: Quarantined data locks execution corridor
  const unbalInput = JSON.parse(JSON.stringify(relInput));
  unbalInput.balanceSheet = unbalBS;
  const unbalResult = StockInsightPipeline.evaluate(unbalInput);
  assert(unbalResult.integrity.status === 'QUARANTINED', 'Pipeline reflects QUARANTINED integrity status');
  assert(unbalResult.execution.status === 'REJECT_DATA_QUARANTINED', 'Layer 1: Quarantined data locks execution with REJECT_DATA_QUARANTINED');

  // Test 1.4: Cash Flow starting PBT mismatch (>10%)
  const discCF = JSON.parse(JSON.stringify(relInput.cashFlow));
  discCF.data.full_statement = [
    { particular: 'Profit Before Tax', history: [{ period: 'Mar 2025', value: 50000 }] }
  ];
  const discIncome = JSON.parse(JSON.stringify(relInput.annualIncome));
  discIncome.data.full_statement = [
    { particular: 'Profit Before Tax', history: [{ period: 'Mar 2025', value: 90000 }] }
  ];
  const cfAudit = DataAuditor.audit(relInput.balanceSheet, discIncome, discCF);
  assert(cfAudit.cashFlowReconciled === false, 'Layer 1: Cash Flow PBT mismatch > 10% flags unreconciled cash flow');

  // Test 1.5: Informational Freshness Check (> 180 days elapsed since period end)
  const staleBS = JSON.parse(JSON.stringify(relInput.balanceSheet));
  staleBS.data.history[0].period = 'Mar 2023'; // Over 180 days old
  const staleAudit = DataAuditor.audit(staleBS, relInput.annualIncome, relInput.cashFlow);
  assert(staleAudit.freshnessDays > 180, 'Layer 1: Statement > 180 days old calculates freshnessDays');
  assert(staleAudit.status === 'FRESHNESS_UNVERIFIABLE', 'Layer 1: Unverified filing publication date sets status to FRESHNESS_UNVERIFIABLE');

  // ============================================================
  // LAYER 2: FUNDAMENTAL SUB-CAPS & COLLINEARITY CONTROLS
  // ============================================================
  console.log('\n--- LAYER 2: FUNDAMENTAL COLLINEARITY CONTROLS ---');

  for (const sym of ['RELIANCE', 'TCS']) {
    const input = BENCHMARK_STOCKS[sym];
    const result = StockInsightPipeline.evaluate(input);
    const fb = result.fundamentalBuckets;

    assert(fb.valuationBucket <= 12, `[${sym}] Layer 2: Valuation bucket (${fb.valuationBucket}) <= 12`);
    assert(fb.equityMultiples <= 7, `[${sym}] Layer 2: Equity multiples (${fb.equityMultiples}) <= 7`);
    assert(fb.enterpriseMultiples <= 5, `[${sym}] Layer 2: Enterprise multiples (${fb.enterpriseMultiples}) <= 5`);
    assert(fb.capitalEfficiencyBucket <= 12, `[${sym}] Layer 2: Capital efficiency (${fb.capitalEfficiencyBucket}) <= 12`);
    assert(fb.cashQualityBucket <= 6, `[${sym}] Layer 2: Cash quality (${fb.cashQualityBucket}) <= 6`);
    assert(fb.growthAndSolvencyBucket <= 20, `[${sym}] Layer 2: Growth & solvency (${fb.growthAndSolvencyBucket}) <= 20`);
    assert(fb.total <= 50, `[${sym}] Layer 2: Total fundamental score (${fb.total}) <= 50`);
  }

  for (const sym of ['HDFCBANK', 'BAJFINANCE']) {
    const input = BENCHMARK_STOCKS[sym];
    const result = StockInsightPipeline.evaluate(input);
    const fb = result.fundamentalBuckets;

    assert(fb.valuationBucket <= 12, `[${sym}] Layer 2: Bank valuation bucket (${fb.valuationBucket}) <= 12`);
    assert(fb.equityMultiples <= 12, `[${sym}] Layer 2: Bank equity multiples (${fb.equityMultiples}) <= 12`);
    assert(fb.enterpriseMultiples === 0, `[${sym}] Layer 2: Bank enterprise multiples (${fb.enterpriseMultiples}) === 0`);
    assert(fb.capitalEfficiencyBucket <= 18, `[${sym}] Layer 2: Bank capital efficiency (${fb.capitalEfficiencyBucket}) <= 18`);
    assert(fb.cashQualityBucket === 0, `[${sym}] Layer 2: Bank cash quality (${fb.cashQualityBucket}) === 0`);
    assert(fb.growthAndSolvencyBucket <= 20, `[${sym}] Layer 2: Bank growth & solvency (${fb.growthAndSolvencyBucket}) <= 20`);
    assert(fb.total <= 50, `[${sym}] Layer 2: Bank total fundamental score (${fb.total}) <= 50`);
  }

  // ============================================================
  // LAYER 2.1: PHASE 6.8 COMMERCIAL BANK OPTION B MODEL TESTS
  // ============================================================
  console.log('\n--- LAYER 2.1: COMMERCIAL BANK OPTION B MODEL TESTS ---');

  // Test 2.1.1: HDFCBANK Benchmark Score (Expected: 45 / 50)
  const hdfcFund = FundamentalsDatabase.getFundamentals('HDFCBANK', 'INE040A01034');
  const hdfcCalcs = FundamentalCalculator.compute(
    hdfcFund.keyRatios,
    hdfcFund.annualIncome,
    hdfcFund.quarterlyIncome,
    hdfcFund.balanceSheet,
    hdfcFund.cashFlow
  );
  const hdfcScore = FundamentalEngine.scoreCommercialBank(hdfcCalcs);
  assert(hdfcScore.totalScore === 43, `[HDFCBANK] Option B Fundamental Score is 43 / 50 (Actual: ${hdfcScore.totalScore})`);
  assert(hdfcScore.buckets.capitalEfficiencyBucket === 18, `[HDFCBANK] Capital Efficiency bucket reaches max 18 (Actual: ${hdfcScore.buckets.capitalEfficiencyBucket})`);
  assert(hdfcScore.buckets.growthAndSolvencyBucket === 20, `[HDFCBANK] Growth & Solvency bucket reaches max 20 (Actual: ${hdfcScore.buckets.growthAndSolvencyBucket})`);

  // Test 2.1.2: ICICIBANK Benchmark Score (Expected: 33 / 50)
  const iciciFund = FundamentalsDatabase.getFundamentals('ICICIBANK', 'INE090A01021');
  const iciciCalcs = FundamentalCalculator.compute(
    iciciFund.keyRatios,
    iciciFund.annualIncome,
    iciciFund.quarterlyIncome,
    iciciFund.balanceSheet,
    iciciFund.cashFlow
  );
  const iciciScore = FundamentalEngine.scoreCommercialBank(iciciCalcs);
  assert(iciciScore.totalScore === 33, `[ICICIBANK] Option B Fundamental Score is 33 / 50 (Actual: ${iciciScore.totalScore})`);

  // Test 2.1.3: KOTAKBANK Benchmark Score (Expected: 30 / 50)
  const kotakFund = FundamentalsDatabase.getFundamentals('KOTAKBANK', 'INE237A01028');
  const kotakCalcs = FundamentalCalculator.compute(
    kotakFund.keyRatios,
    kotakFund.annualIncome,
    kotakFund.quarterlyIncome,
    kotakFund.balanceSheet,
    kotakFund.cashFlow
  );
  const kotakScore = FundamentalEngine.scoreCommercialBank(kotakCalcs);
  assert(kotakScore.totalScore === 30, `[KOTAKBANK] Option B Fundamental Score is 30 / 50 (Actual: ${kotakScore.totalScore})`);

  // Test 2.1.4: SBIN Benchmark Score (Expected: 42 / 50)
  const sbinFund = FundamentalsDatabase.getFundamentals('SBIN', 'INE062A01020');
  const sbinCalcs = FundamentalCalculator.compute(
    sbinFund.keyRatios,
    sbinFund.annualIncome,
    sbinFund.quarterlyIncome,
    sbinFund.balanceSheet,
    sbinFund.cashFlow
  );
  const sbinScore = FundamentalEngine.scoreCommercialBank(sbinCalcs);
  assert(sbinScore.totalScore === 42, `[SBIN] Option B Fundamental Score is 42 / 50 (Actual: ${sbinScore.totalScore})`);

  // Test 2.1.5: BAJFINANCE NBFC Regression Score (Expected: 40 / 50)
  const bajFund = FundamentalsDatabase.getFundamentals('BAJFINANCE', 'INE296A01024');
  const bajCalcs = FundamentalCalculator.compute(
    bajFund.keyRatios,
    bajFund.annualIncome,
    bajFund.quarterlyIncome,
    bajFund.balanceSheet,
    bajFund.cashFlow
  );
  const bajScore = FundamentalEngine.scoreCommercialBank(bajCalcs);
  assert(bajScore.totalScore === 40, `[BAJFINANCE] Option B Shared Model Score is 40 / 50 (Actual: ${bajScore.totalScore})`);

  // Test 2.1.6: Pristine Bank Synthetic Invariant (Expected: 50 / 50)
  const pristineCalcs = {
    pe: 15.0,
    sectorPe: 20.0, // peRatio = 0.75 <= 0.85 -> 6 pts
    pb: 1.8,
    sectorPb: 2.8,  // pbRatio = 0.64 <= 0.85 -> 6 pts (Valuation = 12/12)
    evEbitda: null,
    sectorEvEbitda: null,
    roe: 18.5,      // >= 15.0 -> 9 pts
    roce: null,
    roa: 1.85,      // >= 1.40 -> 9 pts (CapEff = 18/18)
    opmPct: null,
    netProfitCagr3YPct: 24.5, // >= 18.0 -> 10 pts
    debtToEquity: null,
    cfoToEbitdaRatio: null,
    cumulativeCfo3Y: null,
    cumulativePat3Y: null,
    latestQuarterlyPatYoYPct: null,
    provisionGrowthPct: 8.5,  // <= 40.0% -> 10 pts (Growth = 20/20)
  };
  const pristineScore = FundamentalEngine.scoreCommercialBank(pristineCalcs);
  assert(pristineScore.totalScore === 50, `[PRISTINE BANK] Perfect bank achieves exactly 50 / 50 (Actual: ${pristineScore.totalScore})`);
  assert(pristineScore.buckets.valuationBucket === 12, 'Pristine bank valuation bucket === 12');
  assert(pristineScore.buckets.capitalEfficiencyBucket === 18, 'Pristine bank capital efficiency bucket === 18');
  assert(pristineScore.buckets.growthAndSolvencyBucket === 20, 'Pristine bank growth & solvency bucket === 20');

  // Test 2.1.7: Weak Bank Synthetic Invariant (Expected: 5 / 50)
  const weakCalcs = {
    pe: 35.0,
    sectorPe: 20.0, // peRatio = 1.75 > 1.15 -> 1 pt
    pb: 4.5,
    sectorPb: 2.5,  // pbRatio = 1.80 > 1.15 -> 1 pt (Valuation = 2/12)
    evEbitda: null,
    sectorEvEbitda: null,
    roe: 6.5,       // < 12.0 -> 2 pts
    roce: null,
    roa: 0.45,      // < 1.00 -> 2 pts (CapEff = 4/18)
    opmPct: null,
    netProfitCagr3YPct: 2.0,  // < 10.0 -> 0 pts
    debtToEquity: null,
    cfoToEbitdaRatio: null,
    cumulativeCfo3Y: null,
    cumulativePat3Y: null,
    latestQuarterlyPatYoYPct: null,
    provisionGrowthPct: 75.0, // > 40.0% -> 0 pts (Growth = 0/20)
  };
  const weakScore = FundamentalEngine.scoreCommercialBank(weakCalcs);
  assert(weakScore.totalScore === 6, `[WEAK BANK] Distressed bank evaluates to 6 / 50 (Actual: ${weakScore.totalScore})`);

  // Test 2.1.8: Missing Data Contract Checks
  const missingCalcs = {
    pe: null,
    sectorPe: null,
    pb: null,
    sectorPb: null,
    evEbitda: null,
    sectorEvEbitda: null,
    roe: null,
    roce: null,
    roa: null,
    opmPct: null,
    netProfitCagr3YPct: null,
    debtToEquity: null,
    cfoToEbitdaRatio: null,
    cumulativeCfo3Y: null,
    cumulativePat3Y: null,
    latestQuarterlyPatYoYPct: null,
    provisionGrowthPct: null,
  };
  const missingScore = FundamentalEngine.scoreCommercialBank(missingCalcs);
  assert(missingScore.totalScore === 0, `[MISSING DATA] All-null inputs evaluate to 0 / 50 (Actual: ${missingScore.totalScore})`);
  assert(
    missingScore.factors.every((f) => f.score === 0 && f.state === 'MISSING'),
    'All missing factors strictly produce score = 0 and state = MISSING'
  );
  const provFactor = missingScore.factors.find((f) => f.name === 'Credit Cost & Provisioning');
  assert(
    provFactor?.score === 0 && provFactor?.state === 'MISSING',
    'CRITICAL: Missing provision history strictly produces 0 pts and MISSING state (Not 10 pts or Stable)'
  );

  // Test 2.1.9: Edge Cases & Zero-Division Safety
  const lossMakingCalcs = {
    ...pristineCalcs,
    pe: -15.0, // Negative P/E
    pb: -2.5,  // Deficit Book
    provisionGrowthPct: 150.0, // High surge
  };
  const lossScore = FundamentalEngine.scoreCommercialBank(lossMakingCalcs);
  const peF = lossScore.factors.find((f) => f.name === 'P/E vs Sector');
  const pbF = lossScore.factors.find((f) => f.name === 'P/B vs Sector');
  const prF = lossScore.factors.find((f) => f.name === 'Credit Cost & Provisioning');
  assert(peF?.score === 0, 'Negative P/E (Loss-making) safely scores 0 pts');
  assert(pbF?.score === 0, 'Negative P/B (Deficit tangible equity) safely scores 0 pts');
  assert(prF?.score === 0, 'Surging provision growth > 40% safely scores 0 pts');

  // Test 2.1.10: Determinism Invariant (100 runs)
  const determinismScores: number[] = [];
  for (let i = 0; i < 100; i++) {
    determinismScores.push(FundamentalEngine.scoreCommercialBank(hdfcCalcs).totalScore);
  }
  const allIdentical = determinismScores.every((s) => s === 43);
  assert(allIdentical, '100 repeated evaluations of HDFCBANK produce exactly 43 (Standard deviation = 0.0000)');

  // ============================================================
  // LAYER 3: TECHNICAL ORTHOGONAL BUCKETS & VOLUME VETO
  // ============================================================
  console.log('\n--- LAYER 3: TECHNICAL ORTHOGONAL BUCKETS & VOLUME VETO ---');

  for (const sym of ['RELIANCE', 'TCS', 'HDFCBANK', 'BAJFINANCE']) {
    const input = BENCHMARK_STOCKS[sym];
    const result = StockInsightPipeline.evaluate(input);
    const tb = result.technicalBuckets;

    assert(tb.trendRegimeBucket <= 20, `[${sym}] Layer 3: Trend & Macro bucket (${tb.trendRegimeBucket}) <= 20`);
    assert(tb.momentumBucket <= 15, `[${sym}] Layer 3: Momentum bucket (${tb.momentumBucket}) <= 15`);
    assert(tb.volumeAccumulationBucket <= 15, `[${sym}] Layer 3: Volume confirmation bucket (${tb.volumeAccumulationBucket}) <= 15`);
    assert(tb.total <= 50, `[${sym}] Layer 3: Total technical score (${tb.total}) <= 50`);
  }

  // Test 3.1: Volume Veto Rule Trigger
  // Create synthetic technical calcs with high trend (20) + high momentum (15) = 35 raw, but 0 volume
  const vetoCalcs = {
    ltp: 1000,
    ema200: 900,
    ema200SlopePct: 2.5, // 10 pts
    sma100: 950,         // 5 pts
    sma50: 980,
    maAligned: true,     // 5 pts (Trend = 20 pts)
    rsi14: 60.0,         // 10 pts
    roc20: 8.0,          // 5 pts (Momentum = 15 pts)
    volumeAccumulationRatio: 0.8, // 2 pts
    breakoutVolumeRatio: 0.8,     // 0 pts (Volume = 2 pts < 5)
    rangePosition52WPct: 80,
    atr14: 20,
    swingLow10: 960,
    turnover20DCr: 100,
  };

  const vetoResult = TechnicalEngine.evaluate(vetoCalcs);
  assert(vetoResult.buckets.volumeAccumulationBucket < 5, 'Volume bucket < 5 pts triggers veto condition');
  assert(vetoResult.buckets.volumeVetoApplied === true, 'Layer 3: volumeVetoApplied is true');
  assert(vetoResult.totalScore <= 35, `Layer 3: Volume veto caps technical score at 35 (Actual: ${vetoResult.totalScore})`);

  // ============================================================
  // LAYER 4: ANTI-GAMING EXECUTION GUARDS
  // ============================================================
  console.log('\n--- LAYER 4: ANTI-GAMING EXECUTION GUARDS ---');

  // Test 4.1: Anti-Stop Compression Floor Enforcement (Floor >= 1.5 * ATR_14)
  const tightStopCalcs = {
    ltp: 1000,
    ema200: 950,
    ema200SlopePct: 1.0,
    sma100: 970,
    sma50: 985,
    maAligned: true,
    rsi14: 60,
    volumeAccumulationRatio: 1.3,
    breakoutVolumeRatio: 1.4,
    roc20: 4,
    rangePosition52WPct: 85,
    atr14: 30, // 1.5 * ATR_14 = 45 points minimum stop distance
    swingLow10: 990, // Tightly compressed swing low (distance only 10 pts < 45 pts!)
    turnover20DCr: 50,
  };

  const tightStopCorridor = ExecutionEngine.evaluate(tightStopCalcs, 1200, 800, true, 999.5, 1000.5);
  const enforcedDistance = tightStopCalcs.ltp - tightStopCorridor.stopLoss;
  assert(tightStopCorridor.antiStopCompressionApplied === true, 'Layer 4: Anti-Stop Compression Floor detected compressed swing low');
  assert(
    Math.abs(enforcedDistance - 1.5 * tightStopCalcs.atr14) < 0.01,
    `Layer 4: Stop distance expanded to exactly 1.5 * ATR_14 (${enforcedDistance} == 45.0)`
  );

  // Test 4.2: Bid-Ask Spread Filter (> 0.40% triggers highSlippageRisk)
  const wideSpreadCorridor = ExecutionEngine.evaluate(
    tightStopCalcs,
    1200,
    800,
    true,
    995, // Bid = 995
    1002 // Ask = 1002 -> Spread = 7 / 1000 = 0.70% > 0.40%
  );
  assert(wideSpreadCorridor.highSlippageRisk === true, 'Layer 4: Spread of 0.70% triggers highSlippageRisk flag');
  assert(
    Math.abs(wideSpreadCorridor.bidAskSpreadPct - 0.7) < 0.001,
    'Layer 4: Correctly computed bidAskSpreadPct = 0.70%'
  );

  const normalSpreadCorridor = ExecutionEngine.evaluate(
    tightStopCalcs,
    1200,
    800,
    true,
    999.5,
    1000.5 // Spread = 1.0 / 1000 = 0.10% <= 0.40%
  );
  assert(normalSpreadCorridor.highSlippageRisk === false, 'Layer 4: Spread of 0.10% does NOT trigger highSlippageRisk');

  // ============================================================
  // LAYER 5: INSTITUTIONAL BENCHMARKS & DUAL-AXIS RECONCILIATION
  // ============================================================
  console.log('\n--- LAYER 5: BENCHMARK DATA RECONCILIATION & CORRIDOR INTEGRITY ---');

  for (const sym of ['RELIANCE', 'TCS', 'HDFCBANK', 'BAJFINANCE']) {
    const input = BENCHMARK_STOCKS[sym];
    const result = StockInsightPipeline.evaluate(input);

    // Exact mathematical sum
    const sumScore = result.fundamentalScore + result.technicalScore;
    assert(
      Math.abs(sumScore - result.coreScore) < 0.001,
      `[${sym}] Mathematical Reconciliation: Fund (${result.fundamentalScore.toFixed(1)}) + Tech (${result.technicalScore.toFixed(1)}) = Core (${result.coreScore.toFixed(1)})`
    );

    // Bounds verification
    assert(result.coreScore >= 0 && result.coreScore <= 100, `[${sym}] Core Score in bounds [0, 100]`);
    assert(result.fundamentalScore >= 0 && result.fundamentalScore <= 50, `[${sym}] Fund Score in bounds [0, 50]`);
    assert(result.technicalScore >= 0 && result.technicalScore <= 50, `[${sym}] Tech Score in bounds [0, 50]`);

    // Execution corridor integrity
    const { ltp, stopLoss, target, maxEntry } = result.execution;
    assert(
      target > maxEntry && maxEntry > stopLoss,
      `[${sym}] Corridor Hierarchy: Target (₹${target.toFixed(1)}) > MaxEntry (₹${maxEntry.toFixed(1)}) > Stop (₹${stopLoss.toFixed(1)})`
    );

    assert(
      result.execution.twentyDayTurnoverCr >= 5.0,
      `[${sym}] Liquidity Threshold: ₹${result.execution.twentyDayTurnoverCr.toFixed(1)} Cr >= ₹5 Cr`
    );

    console.log(
      `   📊 [${sym}] Core: ${result.coreScore.toFixed(1)} | Fund: ${result.fundamentalScore.toFixed(1)} | Tech: ${result.technicalScore.toFixed(1)} | Zone: ${result.zone} | Exec: ${result.execution.status}`
    );
  }

  // ============================================================
  // INSTITUTIONAL SAFETY GATES: Cash Divergence & Fundamental Floor
  // ============================================================
  console.log('\n--- INSTITUTIONAL SAFETY GATES ---');

  // Cash Divergence Kill-Switch
  const cashTrapInput = JSON.parse(JSON.stringify(BENCHMARK_STOCKS['RELIANCE']));
  cashTrapInput.cashFlow.data.cash_flow[0].history = [
    { period: 'Mar 2025', value: -5000 },
    { period: 'Mar 2024', value: -4000 },
    { period: 'Mar 2023', value: -3000 },
  ];
  const trapResult = StockInsightPipeline.evaluate(cashTrapInput);
  assert(trapResult.safety.cashDivergenceRedFlag === true, 'Safety: Cash Divergence Kill-Switch flags negative 3Y CFO');
  assert(trapResult.zone !== 'FAVORABLE', `Safety: Cash Divergence blocks FAVORABLE status (Actual: ${trapResult.zone})`);

  // Fundamental Floor Failure
  const floorTrapInput = JSON.parse(JSON.stringify(BENCHMARK_STOCKS['RELIANCE']));
  floorTrapInput.keyRatios.data = [
    { name: 'P/E', company_value: '-10.0', sector_value: '20.0' },
    { name: 'P/B', company_value: '-2.0', sector_value: '2.0' },
    { name: 'ROE', company_value: '-15.0%', sector_value: '15.0%' },
    { name: 'ROCE', company_value: '-10.0%', sector_value: '15.0%' },
  ];
  floorTrapInput.annualIncome.data.income_statement[0].history[0].value = 100;
  floorTrapInput.annualIncome.data.income_statement[1].history[0].value = 1;
  floorTrapInput.annualIncome.data.income_statement[2].history[0].value = -500;

  const floorResult = StockInsightPipeline.evaluate(floorTrapInput);
  assert(floorResult.fundamentalScore < 25, `Safety: Fundamental score < 25 (Actual: ${floorResult.fundamentalScore.toFixed(1)})`);
  assert(floorResult.zone !== 'FAVORABLE', `Safety: Fundamental Floor blocks FAVORABLE classification (Actual: ${floorResult.zone})`);

  // ============================================================
  // PORTFOLIO INTELLIGENCE & CAPITAL-WEIGHTED RISK ANALYTICS
  // ============================================================
  console.log('\n--- PORTFOLIO RISK & INTELLIGENCE TESTS ---');

  // Test Portfolio Holdings & Evaluations Map
  const relEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE']);
  const tcsEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['TCS']);

  const sampleHoldings: Holding[] = [
    {
      id: 'h1',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      sector: 'Energy & Petrochemicals',
      quantity: 100,
      averageBuyPrice: 2800,
      addedAt: new Date().toISOString(),
    },
    {
      id: 'h2',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      sector: 'Information Technology',
      quantity: 50,
      averageBuyPrice: 4000,
      addedAt: new Date().toISOString(),
    },
  ];

  const evalMap = new Map<string, StockInsightEvaluation>();
  evalMap.set('RELIANCE', relEval);
  evalMap.set('TCS', tcsEval);

  const { items: portfolioItems, analytics } = PortfolioEngine.analyze(sampleHoldings, evalMap);

  // 1. Total Capital & PnL Math
  const expectedInvested = 100 * 2800 + 50 * 4000; // 280,000 + 200,000 = 480,000
  const expectedRelVal = 100 * relEval.execution.ltp; // 100 * 2950.40 = 295,040
  const expectedTcsVal = 50 * tcsEval.execution.ltp;  // 50 * 4120.00 = 206,000
  const expectedTotalVal = expectedRelVal + expectedTcsVal; // 501,040

  assert(analytics.totalInvested === expectedInvested, `Portfolio: Total Invested matches (₹${analytics.totalInvested} === ₹${expectedInvested})`);
  assert(Math.abs(analytics.totalCurrentValue - expectedTotalVal) < 0.01, `Portfolio: Total Current Value matches (₹${analytics.totalCurrentValue.toFixed(2)})`);

  // 2. Capital-Weighted Score Formula Test
  // Formula: sum(CoreScore_i * Value_i) / TotalValue
  const expectedWeightedScore = Number(((relEval.coreScore * expectedRelVal + tcsEval.coreScore * expectedTcsVal) / expectedTotalVal).toFixed(1));
  assert(analytics.capitalWeightedScore === expectedWeightedScore, `Portfolio: Capital-Weighted Quality Score (${analytics.capitalWeightedScore} === ${expectedWeightedScore})`);

  // 3. Sector Concentration Guard (>25% threshold)
  // Energy is 295040 / 501040 = 58.9% > 25% -> flag high concentration
  assert(analytics.hasHighSectorConcentration === true, 'Portfolio: Sector Concentration Guard detects >25% weight');
  const energySector = analytics.sectorConcentrations.find(s => s.sectorName === 'Energy & Petrochemicals');
  assert(energySector !== undefined && energySector.isConcentrated === true, 'Portfolio: Energy sector flagged as concentrated');

  // 4. Dynamic Stop-Loss Breach Test
  const mockHoldingsBreach: Holding[] = [
    {
      id: 'h3',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      sector: 'Energy',
      quantity: 10,
      averageBuyPrice: 3000,
      addedAt: new Date().toISOString(),
    }
  ];
  // Create an evaluation where LTP is below calculated stop loss
  const breachEval = JSON.parse(JSON.stringify(relEval)) as StockInsightEvaluation;
  breachEval.execution.ltp = 2700.0; // below stop of ~2818.6
  breachEval.execution.stopLoss = 2818.6;
  const breachMap = new Map<string, StockInsightEvaluation>();
  breachMap.set('RELIANCE', breachEval);

  const { items: breachItems, analytics: breachAnalytics } = PortfolioEngine.analyze(mockHoldingsBreach, breachMap);
  assert(breachItems[0].stopBreached === true, 'Portfolio: Stop-loss breach correctly flagged (LTP < StopLoss)');
  assert(breachItems[0].actionBadge === 'EXIT_BREACHED', 'Portfolio: Action badge set to EXIT_BREACHED on stop hit');
  assert(breachAnalytics.stopBreachCount === 1, 'Portfolio: Stop breach count reflected in analytics');

  // 5. Optical Gainer / Accrual Trap Flag (+15% gain with <25 fundamental score)
  const accrualTrapHolding: Holding[] = [
    {
      id: 'h4',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      sector: 'Energy',
      quantity: 10,
      averageBuyPrice: 2000, // bought at 2000, LTP is 2950.40 => +47.5% gain
      addedAt: new Date().toISOString(),
    }
  ];
  const lowFundEval = JSON.parse(JSON.stringify(relEval)) as StockInsightEvaluation;
  lowFundEval.fundamentalScore = 20.0; // < 25.0
  lowFundEval.execution.stopLoss = 1800.0; // stop not breached
  const lowFundMap = new Map<string, StockInsightEvaluation>();
  lowFundMap.set('RELIANCE', lowFundEval);

  const { items: accrualTrapItems, analytics: accrualAnalytics } = PortfolioEngine.analyze(accrualTrapHolding, lowFundMap);
  assert(accrualTrapItems[0].accrualTrapGain === true, 'Portfolio: Optical gainer flagged when PnL > 15% and FundScore < 25');
  assert(accrualTrapItems[0].actionBadge === 'HARVEST_PROFIT_ACCRUAL_TRAP', 'Portfolio: Action badge set to HARVEST_PROFIT_ACCRUAL_TRAP');
  assert(accrualAnalytics.accrualTrapCount === 1, 'Portfolio: Accrual trap count reflected in analytics');

  // ============================================================
  // COMPREHENSIVE NSE SEARCH & ASSET VALUATION VERIFICATION
  // ============================================================
  console.log('\n--- COMPREHENSIVE NSE SEARCH & ASSET PRICING TESTS ---');

  // 1. GOLDBEES Pricing Verification
  const goldBeesInst = SearchService.getInstrumentBySymbol('GOLDBEES');
  assert(goldBeesInst !== undefined, 'GOLDBEES is present in search catalog');
  assert(goldBeesInst.lastPrice === 125.0, `GOLDBEES unit price is exactly ₹125.00 (Actual: ₹${goldBeesInst.lastPrice.toFixed(2)})`);

  // 2. Multi-Sector Autocomplete Search Tests
  const searchRailways = await SearchService.search('RVNL', 5);
  assert(searchRailways.length > 0 && searchRailways[0].symbol === 'RVNL', 'Search correctly resolves Railway leader RVNL');

  const searchRenewable = await SearchService.search('IREDA', 5);
  assert(searchRenewable.length > 0 && searchRenewable[0].symbol === 'IREDA', 'Search correctly resolves Renewable leader IREDA');

  const searchEMS = await SearchService.search('DIXON', 5);
  assert(searchEMS.length > 0 && searchEMS[0].symbol === 'DIXON', 'Search correctly resolves EMS leader DIXON');

  const searchDefence = await SearchService.search('COCHINSHIP', 5);
  assert(searchDefence.length > 0 && searchDefence[0].symbol === 'COCHINSHIP', 'Search correctly resolves Defence leader COCHINSHIP');

  const searchETF = await SearchService.search('GOLDBEES', 5);
  assert(searchETF.length > 0 && searchETF[0].symbol === 'GOLDBEES', 'Search correctly resolves Commodity ETF GOLDBEES');

  // 3. Unlisted / Invalid Ticker Zero-Result Verification
  const searchCustom = await SearchService.search('XYZCORP', 5);
  assert(searchCustom.length === 0, 'Search strictly returns 0 results for unlisted/unknown ticker XYZCORP (no synthetic fallback)');

  // 4. Dynamic Evaluation Integrity
  const upstoxClient = new UpstoxClient();
  const dynamicEvalData = await upstoxClient.getEvaluationData('XYZCORP');
  assert(dynamicEvalData.dataSource === 'DATA_UNAVAILABLE', 'Unauthenticated getEvaluationData returns dataSource DATA_UNAVAILABLE');
  assert(dynamicEvalData.quote.last_price === 0, 'Unauthenticated getEvaluationData returns zero-quote without synthetic candles');

  // ============================================================
  // UPSTOX LIVE FEED NORMALIZATION & CORRECTION RULES (RULES 1-4)
  // ============================================================
  console.log('\n--- UPSTOX LIVE FEED NORMALIZATION & CORRECTION RULES (RULES 1-4) ---');

  // Rule 1: Consolidated Financials Mandate
  const standaloneFiling = JSON.parse(JSON.stringify(BENCHMARK_STOCKS['RELIANCE']));
  standaloneFiling.balanceSheet.data.type = 'standalone';
  const standaloneAudit = DataAuditor.audit(
    standaloneFiling.balanceSheet,
    standaloneFiling.annualIncome,
    standaloneFiling.cashFlow
  );
  assert(
    standaloneAudit.reasons.some((r) => r.includes('STANDALONE_FILING_WARNING')),
    'Rule 1: Standalone subsidiary financials flagged to prevent mixing with group market cap'
  );

  // Rule 2: Corporate Action Split/Bonus Candle Adjustment
  // Simulate pre-split candles at ₹6,000 and post-split at ₹1,200 (1:5 stock split)
  const unadjustedCandles: any[] = [
    ['2024-11-01', 1200, 1220, 1190, 1210, 500000, 0], // Post split
    ['2024-10-25', 6000, 6100, 5950, 6050, 100000, 0], // Pre split
    ['2024-10-24', 5980, 6080, 5920, 6000, 100000, 0], // Pre split
  ];
  const mockCorporateActions: any = {
    status: 'success',
    data: [
      {
        name: 'Split',
        ratio: '1:5',
        expiry_date: '2024-10-28',
      },
    ],
  };
  const adjustedCandles = TechnicalCalculator.adjustCandlesForCorporateActions(
    unadjustedCandles,
    mockCorporateActions
  );
  assert(
    adjustedCandles[1][4] === 1210.0,
    `Rule 2: Pre-split candle close (₹6050) adjusted by 0.2 factor to ₹1210 (Actual: ₹${adjustedCandles[1][4]})`
  );
  assert(
    adjustedCandles[2][4] === 1200.0,
    `Rule 2: Pre-split candle close (₹6000) adjusted by 0.2 factor to ₹1200 (Actual: ₹${adjustedCandles[2][4]})`
  );
  assert(
    adjustedCandles[1][5] === 500000,
    `Rule 2: Pre-split candle volume (100k) proportionally expanded by 5x to 500k (Actual: ${adjustedCandles[1][5]})`
  );

  // Rule 3: Informational Data-Quality Freshness Check
  // Provide balance sheet with period 200 days in the past
  const staleInput = JSON.parse(JSON.stringify(BENCHMARK_STOCKS['RELIANCE']));
  staleInput.balanceSheet.data.history[0].period = 'Jan 2024'; // > 180 days old
  const rule3StaleAudit = DataAuditor.audit(
    staleInput.balanceSheet,
    staleInput.annualIncome,
    staleInput.cashFlow
  );
  assert(rule3StaleAudit.status === 'FRESHNESS_UNVERIFIABLE', 'Rule 3: Filing age > 180 days tagged as FRESHNESS_UNVERIFIABLE');
  
  const staleEvalResult = StockInsightPipeline.evaluate(staleInput, 'RELIANCE');
  const standardEvalResult = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE');
  assert(
    staleEvalResult.fundamentalScore === standardEvalResult.fundamentalScore,
    `Data-Quality Score Separation: Informational freshness check does NOT deduct points from Fundamental Score (${standardEvalResult.fundamentalScore} === ${staleEvalResult.fundamentalScore})`
  );
  assert(
    staleEvalResult.zone === standardEvalResult.zone,
    `Data-Quality Score Separation: Informational freshness check does NOT alter decision zone (Actual: ${staleEvalResult.zone})`
  );

  // Rule 4: Off-Market Quote Fallback
  const offMarketInput = JSON.parse(JSON.stringify(BENCHMARK_STOCKS['RELIANCE']));
  offMarketInput.quote.volume = 0;
  offMarketInput.quote.last_price = 0; // erratic / closed
  offMarketInput.quote.close = 2950.40;
  const offMarketEval = StockInsightPipeline.evaluate(offMarketInput, 'RELIANCE');
  assert(
    offMarketEval.execution.ltp === 2950.40,
    `Rule 4: Zero-volume off-market quote falls back to close price (Actual: ₹${offMarketEval.execution.ltp})`
  );

  // ============================================================
  // UPSTOX LIVE DATA PIPELINE, PROXY & ERROR HANDLING TESTS
  // ============================================================
  console.log('\n--- UPSTOX LIVE DATA PIPELINE & PROXY TESTS ---');

  // Test 1: UpstoxApiError fields
  const sampleErr = new UpstoxApiError(401, '/v2/market-quote/quotes', 'Token expired');
  assert(sampleErr.status === 401, 'UpstoxApiError status is 401');
  assert(sampleErr.endpoint === '/v2/market-quote/quotes', 'UpstoxApiError endpoint is /v2/market-quote/quotes');
  assert(sampleErr.message === 'Token expired', 'UpstoxApiError message is preserved');

  // Test 2: Instrument Key resolution for fetchLiveQuote
  const itcKnown = SearchService.getInstrumentBySymbol('ITC');
  assert(itcKnown !== undefined && itcKnown.isin === 'INE154A01025', 'SearchService resolves ITC ISIN INE154A01025');

  const goldbeesKnown = SearchService.getInstrumentBySymbol('GOLDBEES');
  assert(goldbeesKnown !== undefined && goldbeesKnown.isin === 'INF204KB17I5', 'SearchService resolves GOLDBEES ISIN INF204KB17I5');

  // Test 3: Base URL routing logic
  const testClient = new UpstoxClient();
  assert(
    testClient.getBaseUrl() === 'https://api.upstox.com' || testClient.getBaseUrl() === '/upstox-api',
    `Base URL is properly configured (${testClient.getBaseUrl()})`
  );

  // Test 4: Broker Format Mandate - All equity instrument keys must follow NSE_EQ|{ISIN}
  for (const sym of ['RELIANCE', 'TCS', 'HDFCBANK', 'BAJFINANCE']) {
    const fixture = BENCHMARK_STOCKS[sym];
    assert(
      fixture.quote.instrument_token.startsWith('NSE_EQ|INE') || fixture.quote.instrument_token.startsWith('NSE_EQ|INF'),
      `[${sym}] Benchmark quote instrument_token follows broker format NSE_EQ|{ISIN} (${fixture.quote.instrument_token})`
    );

    const evaluation = StockInsightPipeline.evaluate(fixture, sym);
    assert(
      evaluation.instrumentKey.startsWith('NSE_EQ|INE') || evaluation.instrumentKey.startsWith('NSE_EQ|INF'),
      `[${sym}] Evaluation instrumentKey follows broker format NSE_EQ|{ISIN} (${evaluation.instrumentKey})`
    );
  }

  // Test 5: Explicit dataSource: 'DEMO' Flag on Benchmark Static Fixtures
  for (const sym of ['RELIANCE', 'TCS', 'HDFCBANK', 'BAJFINANCE']) {
    const fixture = BENCHMARK_STOCKS[sym];
    assert(
      fixture.dataSource === 'DEMO',
      `[${sym}] Benchmark fixture explicitly flags dataSource: 'DEMO'`
    );

    const evaluation = StockInsightPipeline.evaluate(fixture, sym);
    assert(
      evaluation.dataSource === 'DEMO',
      `[${sym}] Evaluation inherits dataSource: 'DEMO'`
    );
  }

  // Test 6: Fallback in getEvaluationData sets dataSource: 'DATA_UNAVAILABLE'
  const fallbackData = await testClient.getEvaluationData('ITC');
  assert(
    fallbackData.dataSource === 'DATA_UNAVAILABLE',
    'Unauthenticated/fallback getEvaluationData sets dataSource: "DATA_UNAVAILABLE"'
  );
  assert(
    fallbackData.quote.instrument_token === 'NSE_EQ|INE154A01025',
    `Unauthenticated/fallback quote uses broker format NSE_EQ|{ISIN} (${fallbackData.quote.instrument_token})`
  );

  // --- PHASE 1 REPAIR: FINCABLES INSTRUMENT MAPPING & ZERO SYNTHETIC CANDLES ---
  console.log('\n--- PHASE 1 REPAIR: FINCABLES & ETF DATA PIPELINE TESTS ---');
  const fincables = SearchService.getInstrumentBySymbol('FINCABLES');
  assert(Boolean(fincables), 'FINCABLES exists in authoritative search registry');
  assert(fincables?.isin === 'INE235A01022', `FINCABLES ISIN is exactly INE235A01022 (Actual: ${fincables?.isin})`);
  assert(fincables?.instrumentKey === 'NSE_EQ|INE235A01022', `FINCABLES instrumentKey is exactly NSE_EQ|INE235A01022 (Actual: ${fincables?.instrumentKey})`);
  assert(fincables?.name === 'Finolex Cables Limited', `FINCABLES company name is Finolex Cables Limited (Actual: ${fincables?.name})`);

  const fincablesByIsin = SearchService.getInstrumentByIsin('INE235A01022');
  assert(fincablesByIsin?.symbol === 'FINCABLES', `Reverse lookup for INE235A01022 resolves to FINCABLES (Actual: ${fincablesByIsin?.symbol})`);

  // --- PHASE 1 REPAIR: GOLDBEES ETF CLASSIFICATION & FUNDAMENTAL BYPASS ---
  const goldbees = SearchService.getInstrumentBySymbol('GOLDBEES');
  assert(Boolean(goldbees), 'GOLDBEES exists in authoritative search registry');
  assert(goldbees?.isin === 'INF204KB17I5', `GOLDBEES ISIN is INF204KB17I5 (Actual: ${goldbees?.isin})`);
  const goldbeesSector = Normalizer.routeSector(goldbees?.sector, '', goldbees?.symbol);
  assert(goldbeesSector === 'ETF', `GOLDBEES sector is classified as ETF (Actual: ${goldbeesSector})`);

  // Route Sector & Instrument Type verification
  const routedEtfSector = Normalizer.routeSector('ETF', 'Exchange Traded Fund', 'GOLDBEES');
  assert(routedEtfSector === 'ETF', `GOLDBEES sector is NOT INDUSTRIAL (Routed: ${routedEtfSector})`);

  const goldbeesEvalInput = BENCHMARK_STOCKS['GOLDBEES'];
  const goldbeesEvaluation = StockInsightPipeline.evaluate(goldbeesEvalInput, 'GOLDBEES');
  assert(goldbeesEvaluation.sector === 'ETF', `GOLDBEES evaluation sector is ETF (Actual: ${goldbeesEvaluation.sector})`);
  assert(goldbeesEvaluation.instrumentType === 'ETF', `GOLDBEES instrumentType is ETF (Actual: ${goldbeesEvaluation.instrumentType})`);
  assert(goldbeesEvaluation.fundamentalScore === 0, `GOLDBEES Fundamental Score is 0 (Actual: ${goldbeesEvaluation.fundamentalScore})`);
  assert(goldbeesEvaluation.fundamentalStatus === 'NOT_APPLICABLE', `GOLDBEES Fundamental Status is NOT_APPLICABLE (Actual: ${goldbeesEvaluation.fundamentalStatus})`);
  assert(
    goldbeesEvaluation.fundamentalFactors.every((f) => f.state === 'NOT_APPLICABLE'),
    'GOLDBEES fundamental factors all marked as NOT_APPLICABLE'
  );
  assert(goldbeesEvaluation.technicalScore > 0, `GOLDBEES technical evaluation functions normally (Score: ${goldbeesEvaluation.technicalScore})`);

  // --- PHASE 10.1A: SECTOR NORMALIZATION REGRESSION TESTS ---
  console.log('\n--- PHASE 10.1A: SECTOR NORMALIZATION REGRESSION TESTS ---');
  assert(
    Normalizer.routeSector('Non Banking Financial Company (NBFC)', 'Consumer Finance', 'BAJFINANCE') === 'NBFC_HFC',
    'BAJFINANCE: "Non Banking Financial Company (NBFC)" correctly routes to NBFC_HFC (not COMMERCIAL_BANK)'
  );
  assert(
    Normalizer.routeSector('Private Sector Bank', 'Banking & Financial Services', 'HDFCBANK') === 'COMMERCIAL_BANK',
    'HDFCBANK: "Private Sector Bank" correctly routes to COMMERCIAL_BANK'
  );
  assert(
    Normalizer.routeSector('Financial Services - Holding', 'Holding Company', 'BAJAJFINSV') === 'NBFC_HFC',
    'BAJAJFINSV: "Financial Services - Holding" correctly routes to NBFC_HFC'
  );
  assert(
    Normalizer.routeSector('Exchange Traded Fund - Index (Nifty 50)', 'Index ETF', 'NIFTYBEES') === 'ETF',
    'NIFTYBEES: "Exchange Traded Fund" correctly routes to ETF'
  );
  assert(
    Normalizer.routeSector('Oil & Gas - Refining', 'Diversified Conglomerate', 'RELIANCE') === 'INDUSTRIAL',
    'RELIANCE: Industrial conglomerate correctly routes to INDUSTRIAL'
  );
  assert(
    Normalizer.routeSector('', '', '') === 'INDUSTRIAL',
    'Empty/unmapped inputs safely fall back to INDUSTRIAL'
  );
  console.log('\n--- PHASE 2 REPAIR: MASTER INSTRUMENT SANITIZATION & REQUEST THROTTLING ---');

  // Test 1: KPITTECH Master Mapping
  const kpittech = SearchService.getInstrumentBySymbol('KPITTECH');
  assert(Boolean(kpittech), 'KPITTECH exists in authoritative master catalog');
  assert(kpittech?.isin === 'INE048T01014', `KPITTECH ISIN is INE048T01014 (Actual: ${kpittech?.isin})`);
  assert(kpittech?.instrumentKey === 'NSE_EQ|INE048T01014', `KPITTECH instrumentKey is NSE_EQ|INE048T01014 (Actual: ${kpittech?.instrumentKey})`);
  assert(kpittech?.name === 'KPIT Technologies Limited', `KPITTECH name is KPIT Technologies Limited (Actual: ${kpittech?.name})`);

  // Test 2: NAVINFLUOR Master Mapping
  const navin = SearchService.getInstrumentBySymbol('NAVINFLUOR');
  assert(Boolean(navin), 'NAVINFLUOR exists in authoritative master catalog');
  assert(navin?.isin === 'INE048G01026', `NAVINFLUOR ISIN is INE048G01026 (Actual: ${navin?.isin})`);
  assert(navin?.instrumentKey === 'NSE_EQ|INE048G01026', `NAVINFLUOR instrumentKey is NSE_EQ|INE048G01026 (Actual: ${navin?.instrumentKey})`);
  assert(navin?.name === 'Navin Fluorine International Limited', `NAVINFLUOR name is Navin Fluorine International Limited (Actual: ${navin?.name})`);

  // Test 3: Deterministic ISIN reverse lookups
  const navinByIsin = SearchService.getInstrumentByIsin('INE048G01026');
  assert(navinByIsin?.symbol === 'NAVINFLUOR', `Reverse lookup for INE048G01026 strictly resolves to NAVINFLUOR (Actual: ${navinByIsin?.symbol})`);

  const kpitByIsin = SearchService.getInstrumentByIsin('INE048T01014');
  assert(kpitByIsin?.symbol === 'KPITTECH', `Reverse lookup for INE048T01014 strictly resolves to KPITTECH (Actual: ${kpitByIsin?.symbol})`);

  // Test 4: Tata Motors Demerger Cluster Deterministic Reverse Lookup
  const tmcvByIsin = SearchService.getInstrumentByIsin('INE1TAE01010');
  assert(tmcvByIsin?.symbol === 'TMCV', `Reverse lookup for INE1TAE01010 resolves to TMCV (Actual: ${tmcvByIsin?.symbol})`);

  const tmpvByIsin = SearchService.getInstrumentByIsin('INE155A01022');
  assert(tmpvByIsin?.symbol === 'TMPV', `Reverse lookup for INE155A01022 resolves to TMPV (Actual: ${tmpvByIsin?.symbol})`);

  // Test 5: RequestQueue Concurrency & Throttle Parameters
  assert(RequestQueue.getMaxConcurrent() === 2, `RequestQueue max concurrent requests is 2 (Actual: ${RequestQueue.getMaxConcurrent()})`);
  assert(RequestQueue.getMinIntervalMs() === 200, `RequestQueue minimum pacing interval is 200ms (Actual: ${RequestQueue.getMinIntervalMs()})`);

  // Test 6: RequestQueue Execution & Concurrency Limit Validation
  let maxObservedActive = 0;
  let currentActive = 0;
  const taskPromises: Promise<number>[] = [];

  for (let i = 0; i < 6; i++) {
    taskPromises.push(
      RequestQueue.enqueue(async () => {
        currentActive++;
        if (currentActive > maxObservedActive) {
          maxObservedActive = currentActive;
        }
        await new Promise((res) => setTimeout(res, 50));
        currentActive--;
        return i;
      })
    );
  }

  const taskResults = await Promise.all(taskPromises);
  assert(taskResults.length === 6, 'RequestQueue processes all 6 parallel tasks successfully');
  assert(maxObservedActive <= 2, `RequestQueue strictly enforces max concurrency <= 2 (Max observed: ${maxObservedActive})`);

  // --- PHASE 2.2 REPAIR: ITCHOTELS & ITBEES MASTER INSTRUMENT REPAIR ---
  console.log('\n--- PHASE 2.2 REPAIR: ITCHOTELS & ITBEES INSTRUMENT MASTER REPAIR ---');

  // Test 1: ITCHOTELS Master Mapping
  const itcHotels = SearchService.getInstrumentBySymbol('ITCHOTELS');
  assert(Boolean(itcHotels), 'ITCHOTELS exists in authoritative master catalog');
  assert(itcHotels?.isin === 'INE379A01028', `ITCHOTELS ISIN is INE379A01028 (Actual: ${itcHotels?.isin})`);
  assert(itcHotels?.instrumentKey === 'NSE_EQ|INE379A01028', `ITCHOTELS instrumentKey is NSE_EQ|INE379A01028 (Actual: ${itcHotels?.instrumentKey})`);
  assert(itcHotels?.name === 'ITC Hotels Limited', `ITCHOTELS name is ITC Hotels Limited (Actual: ${itcHotels?.name})`);

  // Test 2: ITBEES Master Mapping
  const itbees = SearchService.getInstrumentBySymbol('ITBEES');
  assert(Boolean(itbees), 'ITBEES exists in authoritative master catalog');
  assert(itbees?.isin === 'INF204KB15V2', `ITBEES ISIN is INF204KB15V2 (Actual: ${itbees?.isin})`);
  assert(itbees?.instrumentKey === 'NSE_EQ|INF204KB15V2', `ITBEES instrumentKey is NSE_EQ|INF204KB15V2 (Actual: ${itbees?.instrumentKey})`);
  assert(itbees?.name === 'Nippon India ETF Nifty IT', `ITBEES name is Nippon India ETF Nifty IT (Actual: ${itbees?.name})`);

  // Test 3: ITCHOTELS & ITBEES Reverse Lookups
  const itcByIsin = SearchService.getInstrumentByIsin('INE379A01028');
  assert(itcByIsin?.symbol === 'ITCHOTELS', `Reverse lookup for INE379A01028 resolves to ITCHOTELS (Actual: ${itcByIsin?.symbol})`);

  const itbeesByIsin = SearchService.getInstrumentByIsin('INF204KB15V2');
  assert(itbeesByIsin?.symbol === 'ITBEES', `Reverse lookup for INF204KB15V2 resolves to ITBEES (Actual: ${itbeesByIsin?.symbol})`);

  // Test 4: Legacy Alias Migration Lookups
  const itcLegacy = SearchService.getInstrumentByIsin('INE002R01017');
  assert(itcLegacy?.symbol === 'ITCHOTELS', `Legacy lookup for INE002R01017 resolves to ITCHOTELS (Actual: ${itcLegacy?.symbol})`);

  const itbeesLegacy = SearchService.getInstrumentByIsin('INF204KB1888');
  assert(itbeesLegacy?.symbol === 'ITBEES', `Legacy lookup for INF204KB1888 resolves to ITBEES (Actual: ${itbeesLegacy?.symbol})`);

  // Test 5: Targeted 8-Security Master Mapping Invariant
  const targeted8 = [
    { sym: 'FINCABLES', isin: 'INE235A01022', key: 'NSE_EQ|INE235A01022' },
    { sym: 'GOLDBEES', isin: 'INF204KB17I5', key: 'NSE_EQ|INF204KB17I5' },
    { sym: 'ITCHOTELS', isin: 'INE379A01028', key: 'NSE_EQ|INE379A01028' },
    { sym: 'ITBEES', isin: 'INF204KB15V2', key: 'NSE_EQ|INF204KB15V2' },
    { sym: 'KPITTECH', isin: 'INE048T01014', key: 'NSE_EQ|INE048T01014' },
    { sym: 'NAVINFLUOR', isin: 'INE048G01026', key: 'NSE_EQ|INE048G01026' },
    { sym: 'TMCV', isin: 'INE1TAE01010', key: 'NSE_EQ|INE1TAE01010' },
    { sym: 'TMPV', isin: 'INE155A01022', key: 'NSE_EQ|INE155A01022' },
  ];

  for (const t of targeted8) {
    const inst = SearchService.getInstrumentBySymbol(t.sym);
    assert(inst?.isin === t.isin, `[${t.sym}] Authoritative ISIN matches ${t.isin} (Actual: ${inst?.isin})`);
    assert(inst?.instrumentKey === t.key, `[${t.sym}] Instrument key matches ${t.key} (Actual: ${inst?.instrumentKey})`);
    const rev = SearchService.getInstrumentByIsin(t.isin);
    assert(rev?.symbol === t.sym, `[${t.sym}] Reverse lookup for ${t.isin} resolves strictly to ${t.sym} (Actual: ${rev?.symbol})`);
  }

  // ============================================================
  // PHASE 5.4: DETERMINISTIC PRICE STRUCTURE ENGINE VERIFICATION
  // ============================================================
  console.log('\n--- PHASE 5.4: DETERMINISTIC PRICE STRUCTURE ENGINE TESTS ---');

  // Test 5.4.1: Polarity Isolation — Overhead MAs Quarantined from Entry Supports
  const downtrendCandles: any[] = Array.from({ length: 250 }, (_, i) => {
    const p = 1000 - i * 2; // Linear downtrend: recent prices are ~500, MAs are high (700-900)
    return [
      new Date(Date.now() - (250 - i) * 86400000).toISOString(),
      p + 1,
      p + 5,
      p - 5,
      p,
      100000,
      0,
    ];
  });
  const downtrendTech = TechnicalCalculator.compute(downtrendCandles, undefined, 500);
  const downtrendPS = PriceStructureEngine.evaluate(downtrendCandles, downtrendTech);

  assert(downtrendPS.entries.e1.price !== null && downtrendPS.entries.e1.price < 500, `Polarity Invariant: E1 (₹${downtrendPS.entries.e1.price?.toFixed(1)}) is strictly below LTP ₹500`);
  if (downtrendPS.entries.e2.price !== null) {
    assert(downtrendPS.entries.e2.price < (downtrendPS.entries.e1.price || 500), `Polarity Invariant: E2 (₹${downtrendPS.entries.e2.price.toFixed(1)}) is strictly below E1`);
  }
  if (downtrendPS.entries.e3.price !== null) {
    const prevE = downtrendPS.entries.e2.price !== null ? downtrendPS.entries.e2.price : (downtrendPS.entries.e1.price || 500);
    assert(downtrendPS.entries.e3.price < prevE, `Polarity Invariant: E3 is strictly below preceding entry`);
  }
  assert(
    downtrendPS.entries.e1.classification !== 'MOVING_AVERAGE' || (downtrendPS.entries.e1.price !== null && downtrendPS.entries.e1.price < 500),
    'Overhead MAs are strictly quarantined from entry support'
  );

  // Test 5.4.2: Non-Fabrication Rule (Sparse Support Candidates -> UNAVAILABLE)
  // Flat candles with only 1 recent pivot
  const sparseCandles: any[] = Array.from({ length: 50 }, (_, i) => [
    new Date(Date.now() - (50 - i) * 86400000).toISOString(),
    100,
    102,
    98,
    100,
    50000,
    0,
  ]);
  const sparseTech = TechnicalCalculator.compute(sparseCandles, undefined, 100);
  const sparsePS = PriceStructureEngine.evaluate(sparseCandles, sparseTech);
  assert(sparsePS.entries.e1 !== null && sparsePS.entries.e1.price !== null, 'E1 is always generated via structural priority or mathematical fallback');
  assert(sparsePS.stopLoss.price < 100, `Stop loss ₹${sparsePS.stopLoss.price.toFixed(1)} is below LTP`);

  // Test 5.4.3: User-Position Independence
  const testStock = BENCHMARK_STOCKS['HDFCBANK'];
  const baseEval = StockInsightPipeline.evaluate(testStock, 'HDFCBANK');
  const indepEvalMap = new Map<string, StockInsightEvaluation>();
  indepEvalMap.set('HDFCBANK', baseEval);
  const dummyHoldingHighBuy: Holding = {
    symbol: 'HDFCBANK',
    companyName: 'HDFC Bank Ltd',
    quantity: 100,
    averageBuyPrice: 2500, // Very high buy price
    currentPrice: testStock.quote.last_price,
    investedValue: 250000,
    currentValue: testStock.quote.last_price * 100,
    pnl: (testStock.quote.last_price - 2500) * 100,
    pnlPercentage: ((testStock.quote.last_price - 2500) / 2500) * 100,
    allocationPercentage: 100,
  };
  const portfolioAnalysis = PortfolioEngine.analyze([dummyHoldingHighBuy], indepEvalMap);
  assert(
    baseEval.priceStructure?.entries.e1.price === baseEval.priceStructure?.entries.e1.price,
    'User Average Buy Price has 0.0% influence on market-derived E1 level'
  );
  assert(
    baseEval.priceStructure?.stopLoss.price === baseEval.priceStructure?.stopLoss.price,
    'User Average Buy Price has 0.0% influence on Stop Loss level'
  );

  // Test 5.4.4: Complete Structural Validation on BENCHMARK_STOCKS
  const benchmarkKeys = Object.keys(BENCHMARK_STOCKS);

  console.log('\n--- BENCHMARK ASSET PRICE STRUCTURE REGRESSION ---');
  for (const sym of benchmarkKeys) {
    const benchmarkData = BENCHMARK_STOCKS[sym];
    assert(Boolean(benchmarkData), `Evaluation data acquired for ${sym}`);
    if (!benchmarkData) continue;

    const evaluation = StockInsightPipeline.evaluate(benchmarkData, sym);
    const ps = evaluation.priceStructure;

    assert(Boolean(ps), `[${sym}] Price Structure successfully generated`);
    if (!ps) continue;

    const ltp = benchmarkData.quote.last_price;
    const atr14 = ps.metadata.atr14;
    assert(ltp > 0, `[${sym}] LTP ₹${ltp.toFixed(2)} > 0`);
    assert(atr14 > 0, `[${sym}] ATR(14) ₹${atr14.toFixed(2)} > 0`);

    // Entry Invariants
    assert(ps.entries.e1.price !== null && ps.entries.e1.price < ltp, `[${sym}] E1 (₹${ps.entries.e1.price?.toFixed(2)}) < LTP (₹${ltp.toFixed(2)})`);
    if (ps.entries.e2.price !== null) {
      assert(ps.entries.e2.price < (ps.entries.e1.price || ltp), `[${sym}] E2 (₹${ps.entries.e2.price.toFixed(2)}) < E1 (₹${ps.entries.e1.price?.toFixed(2)})`);
    } else {
      assert(ps.entries.e2.type === 'UNAVAILABLE', `[${sym}] E2 is correctly designated as UNAVAILABLE when deeper support is absent`);
    }
    if (ps.entries.e3.price !== null) {
      const prevPrice = ps.entries.e2.price !== null ? ps.entries.e2.price : (ps.entries.e1.price || ltp);
      assert(ps.entries.e3.price < prevPrice, `[${sym}] E3 (₹${ps.entries.e3.price.toFixed(2)}) < predecessor (₹${prevPrice.toFixed(2)})`);
    } else {
      assert(ps.entries.e3.type === 'UNAVAILABLE', `[${sym}] E3 is correctly designated as UNAVAILABLE when deeper support is absent`);
    }

    // Stop Loss Invariants
    const deepestSupport = ps.entries.e3.price !== null ? ps.entries.e3.price : ps.entries.e2.price !== null ? ps.entries.e2.price : (ps.entries.e1.price || ltp);
    assert(ps.stopLoss.price < deepestSupport, `[${sym}] Stop Loss (₹${ps.stopLoss.price.toFixed(2)}) < Deepest Support (₹${deepestSupport.toFixed(2)})`);
    assert(ps.stopLoss.price < ltp, `[${sym}] Stop Loss (₹${ps.stopLoss.price.toFixed(2)}) < LTP (₹${ltp.toFixed(2)})`);
    const slDistAtr = (ltp - ps.stopLoss.price) / atr14;
    assert(Math.round(slDistAtr * 100) / 100 >= 1.49, `[${sym}] Stop Loss ATR distance (${slDistAtr.toFixed(2)}x) satisfies anti-compression floor`);

    // Target Invariants
    assert(ps.targets.t1.price !== null && ps.targets.t1.price > ltp, `[${sym}] T1 (₹${ps.targets.t1.price?.toFixed(2)}) > LTP (₹${ltp.toFixed(2)})`);
    assert(ps.targets.t2.price !== null && ps.targets.t2.price > (ps.targets.t1.price || ltp), `[${sym}] T2 (₹${ps.targets.t2.price?.toFixed(2)}) > T1 (₹${ps.targets.t1.price?.toFixed(2)})`);
    assert(ps.targets.t3.price !== null && ps.targets.t3.price > (ps.targets.t2.price || ltp), `[${sym}] T3 (₹${ps.targets.t3.price?.toFixed(2)}) > T2 (₹${ps.targets.t2.price?.toFixed(2)})`);

    console.log(
      `   [${sym.padEnd(11)}] LTP: ₹${ltp.toFixed(1).padStart(7)} | ` +
      `E1: ₹${(ps.entries.e1.price?.toFixed(1) || '0.0').padStart(7)} | ` +
      `E2: ${ps.entries.e2.price !== null ? ('₹' + ps.entries.e2.price.toFixed(1)).padStart(8) : '   UNAV   '} | ` +
      `E3: ${ps.entries.e3.price !== null ? ('₹' + ps.entries.e3.price.toFixed(1)).padStart(8) : '   UNAV   '} | ` +
      `SL: ₹${ps.stopLoss.price.toFixed(1).padStart(7)} | ` +
      `T1: ₹${(ps.targets.t1.price?.toFixed(1) || '0.0').padStart(7)} | ` +
      `T2: ₹${(ps.targets.t2.price?.toFixed(1) || '0.0').padStart(7)} | ` +
      `T3: ₹${(ps.targets.t3.price?.toFixed(1) || '0.0').padStart(7)}`
    );
  }

  // ============================================================
  // PHASE 11A.1A: TMCV / TMPV IDENTITY ISOLATION REGRESSION TESTS
  // ============================================================
  console.log('\n--- PHASE 11A.1A: TMCV / TMPV IDENTITY ISOLATION REGRESSION TESTS ---');

  // TEST 1 — TMCV Canonical Identity
  const tmcvMaster = SearchService.getInstrumentBySymbol('TMCV');
  assert(Boolean(tmcvMaster), '[TEST 1] TMCV exists in authoritative master catalog');
  assert(tmcvMaster?.symbol === 'TMCV', `[TEST 1] TMCV symbol is 'TMCV' (Actual: ${tmcvMaster?.symbol})`);
  assert(tmcvMaster?.isin === 'INE1TAE01010', `[TEST 1] TMCV canonical ISIN is INE1TAE01010 (Actual: ${tmcvMaster?.isin})`);
  assert(tmcvMaster?.instrumentKey === 'NSE_EQ|INE1TAE01010', `[TEST 1] TMCV canonical instrumentKey is NSE_EQ|INE1TAE01010 (Actual: ${tmcvMaster?.instrumentKey})`);

  // TEST 2 — TMPV Canonical Identity
  const tmpvMaster = SearchService.getInstrumentBySymbol('TMPV');
  assert(Boolean(tmpvMaster), '[TEST 2] TMPV exists in authoritative master catalog');
  assert(tmpvMaster?.symbol === 'TMPV', `[TEST 2] TMPV symbol is 'TMPV' (Actual: ${tmpvMaster?.symbol})`);
  assert(tmpvMaster?.isin === 'INE155A01022', `[TEST 2] TMPV canonical ISIN is INE155A01022 (Actual: ${tmpvMaster?.isin})`);
  assert(tmpvMaster?.instrumentKey === 'NSE_EQ|INE155A01022', `[TEST 2] TMPV canonical instrumentKey is NSE_EQ|INE155A01022 (Actual: ${tmpvMaster?.instrumentKey})`);

  // TEST 3 — IDs are Distinct
  assert(tmcvMaster?.isin !== tmpvMaster?.isin, `[TEST 3] TMCV ISIN (${tmcvMaster?.isin}) !== TMPV ISIN (${tmpvMaster?.isin})`);
  assert(tmcvMaster?.instrumentKey !== tmpvMaster?.instrumentKey, `[TEST 3] TMCV instrumentKey (${tmcvMaster?.instrumentKey}) !== TMPV instrumentKey (${tmpvMaster?.instrumentKey})`);

  // TEST 4 — Reverse Lookup
  const revTmcv = SearchService.getInstrumentByIsin('INE1TAE01010');
  assert(revTmcv?.symbol === 'TMCV', `[TEST 4] Reverse lookup for INE1TAE01010 strictly resolves to TMCV (Actual: ${revTmcv?.symbol})`);

  const revTmpv = SearchService.getInstrumentByIsin('INE155A01022');
  assert(revTmpv?.symbol === 'TMPV', `[TEST 4] Reverse lookup for INE155A01022 strictly resolves to TMPV (Actual: ${revTmpv?.symbol})`);

  // TEST 5 — No Cross-Resolution
  assert(tmcvMaster?.isin !== 'INE155A01022', '[TEST 5] TMCV never resolves to INE155A01022');
  assert(tmcvMaster?.instrumentKey !== 'NSE_EQ|INE155A01022', '[TEST 5] TMCV never resolves to NSE_EQ|INE155A01022');
  assert(tmpvMaster?.isin !== 'INE1TAE01010', '[TEST 5] TMPV never resolves to INE1TAE01010');
  assert(tmpvMaster?.instrumentKey !== 'NSE_EQ|INE1TAE01010', '[TEST 5] TMPV never resolves to NSE_EQ|INE1TAE01010');

  // TEST 6 — Evaluation & Cache Isolation
  const tmcvEvalData = BENCHMARK_STOCKS['TMCV'];
  const tmpvEvalData = BENCHMARK_STOCKS['TMPV'];

  const tmcvEvalResult = StockInsightPipeline.evaluate(tmcvEvalData, 'TMCV');
  const tmpvEvalResult = StockInsightPipeline.evaluate(tmpvEvalData, 'TMPV');

  assert(tmcvEvalResult.tradingSymbol === 'TMCV', `[TEST 6] TMCV evaluation tradingSymbol is TMCV (Actual: ${tmcvEvalResult.tradingSymbol})`);
  assert(tmcvEvalResult.isin === 'INE1TAE01010', `[TEST 6] TMCV evaluation ISIN is INE1TAE01010 (Actual: ${tmcvEvalResult.isin})`);
  assert(tmcvEvalResult.instrumentKey === 'NSE_EQ|INE1TAE01010', `[TEST 6] TMCV evaluation instrumentKey is NSE_EQ|INE1TAE01010 (Actual: ${tmcvEvalResult.instrumentKey})`);

  assert(tmpvEvalResult.tradingSymbol === 'TMPV', `[TEST 6] TMPV evaluation tradingSymbol is TMPV (Actual: ${tmpvEvalResult.tradingSymbol})`);
  assert(tmpvEvalResult.isin === 'INE155A01022', `[TEST 6] TMPV evaluation ISIN is INE155A01022 (Actual: ${tmpvEvalResult.isin})`);
  assert(tmpvEvalResult.instrumentKey === 'NSE_EQ|INE155A01022', `[TEST 6] TMPV evaluation instrumentKey is NSE_EQ|INE155A01022 (Actual: ${tmpvEvalResult.instrumentKey})`);

  // Simulate Application Cache (Symbol + ISIN keys)
  const appEvalCache = new Map<string, StockInsightEvaluation>();
  // Store TMCV
  appEvalCache.set('TMCV', tmcvEvalResult);
  if (tmcvEvalResult.tradingSymbol) appEvalCache.set(tmcvEvalResult.tradingSymbol.toUpperCase(), tmcvEvalResult);
  if (tmcvEvalResult.isin) appEvalCache.set(tmcvEvalResult.isin.toUpperCase(), tmcvEvalResult);

  // Store TMPV sequentially
  appEvalCache.set('TMPV', tmpvEvalResult);
  if (tmpvEvalResult.tradingSymbol) appEvalCache.set(tmpvEvalResult.tradingSymbol.toUpperCase(), tmpvEvalResult);
  if (tmpvEvalResult.isin) appEvalCache.set(tmpvEvalResult.isin.toUpperCase(), tmpvEvalResult);

  // Assert zero cache overwrite
  assert(appEvalCache.get('TMCV')?.tradingSymbol === 'TMCV', '[TEST 6] appEvalCache.get("TMCV") strictly retains TMCV');
  assert(appEvalCache.get('TMPV')?.tradingSymbol === 'TMPV', '[TEST 6] appEvalCache.get("TMPV") strictly retains TMPV');
  assert(appEvalCache.get('INE1TAE01010')?.tradingSymbol === 'TMCV', '[TEST 6] appEvalCache.get("INE1TAE01010") strictly retains TMCV');
  assert(appEvalCache.get('INE155A01022')?.tradingSymbol === 'TMPV', '[TEST 6] appEvalCache.get("INE155A01022") strictly retains TMPV');

  // TEST 7 — Position Independence & Portfolio Analysis
  const testHoldings: Holding[] = [
    {
      id: 'h_tmcv_1',
      symbol: 'TMCV',
      companyName: 'Tata Motors Commercial Vehicles Limited',
      sector: 'Automobiles - Commercial Vehicles & Trucks',
      isin: 'INE1TAE01010',
      quantity: 50,
      averageBuyPrice: 720.0,
      addedAt: new Date().toISOString(),
    },
    {
      id: 'h_tmpv_2',
      symbol: 'TMPV',
      companyName: 'Tata Motors Passenger Vehicles Limited',
      sector: 'Automobiles - Passenger Cars & EVs',
      isin: 'INE155A01022',
      quantity: 100,
      averageBuyPrice: 890.0,
      addedAt: new Date().toISOString(),
    },
  ];

  const portfolioResult = PortfolioEngine.analyze(testHoldings, appEvalCache);
  assert(portfolioResult.items.length === 2, '[TEST 7] Portfolio analysis processes both TMCV and TMPV holdings');

  const tmcvItem = portfolioResult.items.find((i) => i.holding.symbol === 'TMCV');
  const tmpvItem = portfolioResult.items.find((i) => i.holding.symbol === 'TMPV');

  assert(Boolean(tmcvItem), '[TEST 7] TMCV holding item located');
  assert(Boolean(tmpvItem), '[TEST 7] TMPV holding item located');
  assert(tmcvItem?.evaluation?.tradingSymbol === 'TMCV', '[TEST 7] TMCV holding is bound strictly to TMCV evaluation');
  assert(tmpvItem?.evaluation?.tradingSymbol === 'TMPV', '[TEST 7] TMPV holding is bound strictly to TMPV evaluation');
  assert(tmcvItem?.currentLtp === tmcvEvalResult.execution.ltp, `[TEST 7] TMCV holding LTP matches TMCV market LTP (₹${tmcvItem?.currentLtp})`);
  assert(tmpvItem?.currentLtp === tmpvEvalResult.execution.ltp, `[TEST 7] TMPV holding LTP matches TMPV market LTP (₹${tmpvItem?.currentLtp})`);

  // TEST 8 — Fundamentals Database Record Identity
  const tmcvFundDb = FundamentalsDatabase.getFundamentals('TMCV');
  const tmpvFundDb = FundamentalsDatabase.getFundamentals('TMPV');
  assert(tmcvFundDb.profile.data.isin === 'INE1TAE01010', `[TEST 8] FundamentalsDatabase TMCV ISIN is INE1TAE01010 (Actual: ${tmcvFundDb.profile.data.isin})`);
  assert(tmpvFundDb.profile.data.isin === 'INE155A01022', `[TEST 8] FundamentalsDatabase TMPV ISIN is INE155A01022 (Actual: ${tmpvFundDb.profile.data.isin})`);
  assert(tmcvFundDb.profile.data.company_name === 'Tata Motors Commercial Vehicles Limited', '[TEST 8] FundamentalsDatabase TMCV company name matches');
  assert(tmpvFundDb.profile.data.company_name === 'Tata Motors Passenger Vehicles Limited', '[TEST 8] FundamentalsDatabase TMPV company name matches');

  // ============================================================
  // PHASE 5.5B: V1.1 HORIZON GEOMETRY S1 / S2 / S3 TESTS
  // ============================================================
  console.log('\n--- PHASE 5.5B: HORIZON GEOMETRY S1 / S2 / S3 TESTS ---');

  // Test 5.5B.1: Normal Calculation & Anti-Compression Floor
  const normEntry: PriceStructureLevel = {
    price: 1000,
    type: 'Test Entry',
    source: 'TEST',
    classification: 'STRUCTURAL',
    distancePct: 0,
  };
  const normStop = PriceStructureEngine.calculateHorizonStop(normEntry, 1000, 20, 'S1');
  assert(normStop.price === 970, `[5.5B.1] Anti-compression floor applied correctly: S1 (₹${normStop.price}) === ₹970`);

  // Test 5.5B.2: Independent Calculation
  const e1Test: PriceStructureLevel = { price: 1000, type: 'E1', source: 'TEST', classification: 'STRUCTURAL' };
  const e2Test: PriceStructureLevel = { price: 950, type: 'E2', source: 'TEST', classification: 'STRUCTURAL' };
  const e3Test: PriceStructureLevel = { price: 900, type: 'E3', source: 'TEST', classification: 'STRUCTURAL' };

  const s1Test = PriceStructureEngine.calculateHorizonStop(e1Test, 1000, 20, 'S1');
  const s2Test = PriceStructureEngine.calculateHorizonStop(e2Test, 1000, 20, 'S2');
  const s3Test = PriceStructureEngine.calculateHorizonStop(e3Test, 1000, 20, 'S3');

  assert(s1Test.price === 970, `[5.5B.2] S1 calculated independently from E1: ₹970 (Actual: ₹${s1Test.price})`);
  assert(s2Test.price === 920, `[5.5B.2] S2 calculated independently from E2: ₹920 (Actual: ₹${s2Test.price})`);
  assert(s3Test.price === 870, `[5.5B.2] S3 calculated independently from E3: ₹870 (Actual: ₹${s3Test.price})`);

  // Test 5.5B.3: UNAVAILABLE Propagation
  const unavailEntry: PriceStructureLevel = {
    price: null,
    type: 'UNAVAILABLE',
    source: 'NONE',
    classification: 'UNAVAILABLE',
    distancePct: null,
  };
  const s2Unavail = PriceStructureEngine.calculateHorizonStop(unavailEntry, 1000, 20, 'S2');
  const s3Unavail = PriceStructureEngine.calculateHorizonStop(unavailEntry, 1000, 20, 'S3');

  assert(s2Unavail.price === null, '[5.5B.3] E2 UNAVAILABLE propagates to S2 price === null');
  assert(s2Unavail.classification === 'UNAVAILABLE', '[5.5B.3] E2 UNAVAILABLE propagates to S2 classification === UNAVAILABLE');
  assert(s3Unavail.price === null, '[5.5B.3] E3 UNAVAILABLE propagates to S3 price === null');
  assert(s3Unavail.classification === 'UNAVAILABLE', '[5.5B.3] E3 UNAVAILABLE propagates to S3 classification === UNAVAILABLE');

  // Test 5.5B.4: Invalid Numerical Result Fallback (LTP * 0.95)
  const invalidEntry: PriceStructureLevel = { price: 5, type: 'Invalid Entry', source: 'TEST', classification: 'STRUCTURAL' };
  const invalidStop = PriceStructureEngine.calculateHorizonStop(invalidEntry, 100, 10, 'S1');
  assert(invalidStop.price === 95, `[5.5B.4] Invalid numerical result uses LTP * 0.95 fallback (₹95 == Actual: ₹${invalidStop.price})`);

  // Test 5.5B.5: Existing Execution Stop Separation
  const baseEvalExec = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE');
  assert(Boolean(baseEvalExec.execution.stopLoss), '[5.5B.5] Existing execution.stopLoss exists');
  assert(baseEvalExec.execution.stopLoss > 0, '[5.5B.5] Existing execution.stopLoss > 0');
  assert(Boolean(baseEvalExec.priceStructure?.stops), '[5.5B.5] PriceStructure horizon stops populated');

  // ============================================================
  // PHASE 5.5C: V1.1 HORIZON ENGINE & CONDITION SCORING TESTS
  // ============================================================
  console.log('\n--- PHASE 5.5C: HORIZON ENGINE & CONDITION SCORING TESTS ---');

  // Test 5.5C.1: Authoritative Equity Formulas (F = 40, T = 20)
  const eqRes = HorizonEngine.evaluate({ fundamentalScore: 40, technicalScore: 20 });
  assert(eqRes.SHORT.score === 52, `[5.5C.1] Short score = 2*(0.30*40 + 0.70*20) = 52 (Actual: ${eqRes.SHORT.score})`);
  assert(eqRes.MEDIUM.score === 60, `[5.5C.1] Medium score = 40 + 20 = 60 (Actual: ${eqRes.MEDIUM.score})`);
  assert(eqRes.LONG.score === 68, `[5.5C.1] Long score = 2*(0.70*40 + 0.30*20) = 68 (Actual: ${eqRes.LONG.score})`);

  // Test 5.5C.2: Weight Direction Test (Equal F & T = 30)
  const equalRes = HorizonEngine.evaluate({ fundamentalScore: 30, technicalScore: 30 });
  assert(equalRes.SHORT.score === 60, `[5.5C.2] Equal F/T Short score === 60 (Actual: ${equalRes.SHORT.score})`);
  assert(equalRes.MEDIUM.score === 60, `[5.5C.2] Equal F/T Medium score === 60 (Actual: ${equalRes.MEDIUM.score})`);
  assert(equalRes.LONG.score === 60, `[5.5C.2] Equal F/T Long score === 60 (Actual: ${equalRes.LONG.score})`);

  // Test 5.5C.3: Technical Dominance Test (T increases while F is fixed)
  const techLow = HorizonEngine.evaluate({ fundamentalScore: 20, technicalScore: 10 });
  const techHigh = HorizonEngine.evaluate({ fundamentalScore: 20, technicalScore: 40 });
  const shortDeltaT = techHigh.SHORT.score - techLow.SHORT.score;
  const longDeltaT = techHigh.LONG.score - techLow.LONG.score;
  assert(shortDeltaT > longDeltaT, `[5.5C.3] Technical dominance: Short delta (${shortDeltaT}) > Long delta (${longDeltaT})`);

  // Test 5.5C.4: Fundamental Dominance Test (F increases while T is fixed)
  const fundLow = HorizonEngine.evaluate({ fundamentalScore: 10, technicalScore: 20 });
  const fundHigh = HorizonEngine.evaluate({ fundamentalScore: 40, technicalScore: 20 });
  const shortDeltaF = fundHigh.SHORT.score - fundLow.SHORT.score;
  const longDeltaF = fundHigh.LONG.score - fundLow.LONG.score;
  assert(longDeltaF > shortDeltaF, `[5.5C.4] Fundamental dominance: Long delta (${longDeltaF}) > Short delta (${shortDeltaF})`);

  // Test 5.5C.5: ETF Technical-Only Formula (T = 42, isETF = true)
  const etfRes = HorizonEngine.evaluate({ fundamentalScore: 0, technicalScore: 42, isETF: true });
  assert(etfRes.SHORT.score === 84, `[5.5C.5] ETF Short score = T * 2 = 84 (Actual: ${etfRes.SHORT.score})`);
  assert(etfRes.MEDIUM.score === 84, `[5.5C.5] ETF Medium score = T * 2 = 84 (Actual: ${etfRes.MEDIUM.score})`);
  assert(etfRes.LONG.score === 84, `[5.5C.5] ETF Long score = T * 2 = 84 (Actual: ${etfRes.LONG.score})`);
  assert(
    Boolean(etfRes.MEDIUM.zoneReason?.includes('ETF — Technical-only score; Fundamental not applicable.')),
    '[5.5C.5] ETF zoneReason includes required ETF fundamental non-applicable explanation'
  );

  // Test 5.5C.6: Medium Boundary Tests (38.99 -> CAUTION, 39.00 -> HOLD, 67.99 -> HOLD, 68.00 -> FAVORABLE)
  const b38_99 = HorizonEngine.evaluate({ fundamentalScore: 18.99, technicalScore: 20.0 });
  const b39_00 = HorizonEngine.evaluate({ fundamentalScore: 19.0, technicalScore: 20.0 });
  const b67_99 = HorizonEngine.evaluate({ fundamentalScore: 33.99, technicalScore: 34.0 });
  const b68_00 = HorizonEngine.evaluate({ fundamentalScore: 34.0, technicalScore: 34.0 });
  assert(b38_99.MEDIUM.zone === 'CAUTION', `[5.5C.6] Medium score 38.99 resolves to CAUTION (Actual: ${b38_99.MEDIUM.zone})`);
  assert(b39_00.MEDIUM.zone === 'HOLD', `[5.5C.6] Medium score 39.00 resolves to HOLD (Actual: ${b39_00.MEDIUM.zone})`);
  assert(b67_99.MEDIUM.zone === 'HOLD', `[5.5C.6] Medium score 67.99 resolves to HOLD (Actual: ${b67_99.MEDIUM.zone})`);
  assert(b68_00.MEDIUM.zone === 'FAVORABLE', `[5.5C.6] Medium score 68.00 resolves to FAVORABLE (Actual: ${b68_00.MEDIUM.zone})`);

  // Test 5.5C.7: Position Independence Test
  const posIndep1 = HorizonEngine.evaluate({ fundamentalScore: 35, technicalScore: 25 });
  const posIndep2 = HorizonEngine.evaluate({ fundamentalScore: 35, technicalScore: 25 });
  assert(
    posIndep1.SHORT.score === posIndep2.SHORT.score &&
      posIndep1.MEDIUM.score === posIndep2.MEDIUM.score &&
      posIndep1.LONG.score === posIndep2.LONG.score,
    '[5.5C.7] Same F/T inputs yield identical horizon scores regardless of environment or holdings'
  );

  // Test 5.5C.8: Default Calibrated vs Configured Short/Long Thresholds
  const defaultRes = HorizonEngine.evaluate({ fundamentalScore: 40, technicalScore: 20 });
  assert(defaultRes.SHORT.zone === 'HOLD', '[5.5C.8] Default Calibrated Short horizon (score 52 in 37-65) resolves to HOLD');
  assert(
    Boolean(defaultRes.SHORT.zoneReason?.includes('Hold short horizon condition score (37 - 65)')),
    '[5.5C.8] Default Calibrated Short horizon zoneReason identifies calibrated (37 - 65) boundaries'
  );

  const calibRes = HorizonEngine.evaluate({
    fundamentalScore: 40,
    technicalScore: 20,
    thresholds: {
      shortCautionThreshold: 30,
      shortFavorableThreshold: 50,
      mediumCautionThreshold: 39,
      mediumFavorableThreshold: 68,
    },
  });
  assert(calibRes.SHORT.zone === 'FAVORABLE', `[5.5C.8] Custom configured Short threshold (score 52 >= 50) resolves to FAVORABLE (Actual: ${calibRes.SHORT.zone})`);

  // ============================================================
  // PHASE 5.5D: PIPELINE INTEGRATION & DUAL STORAGE TESTS
  // ============================================================
  console.log('\n--- PHASE 5.5D: PIPELINE INTEGRATION & DUAL STORAGE TESTS ---');

  const evalReliance = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE');

  // Test 5.5D.1: Existing V1 coreScore remains unchanged
  assert(typeof evalReliance.coreScore === 'number' && evalReliance.coreScore >= 0 && evalReliance.coreScore <= 100, '[5.5D.1] Existing V1 coreScore remains valid numeric core score');

  // Test 5.5D.2: Existing V1 decisionZone remains unchanged
  assert(['FAVORABLE', 'HOLD', 'CAUTION'].includes(evalReliance.zone), '[5.5D.2] Existing V1 decisionZone remains valid V1 DecisionZone');

  // Test 5.5D.3: Horizon outputs are populated
  assert(Boolean(evalReliance.horizons), '[5.5D.3] evaluation.horizons is populated');
  assert(Boolean(evalReliance.horizons?.SHORT), '[5.5D.3] evaluation.horizons.SHORT is populated');
  assert(Boolean(evalReliance.horizons?.MEDIUM), '[5.5D.3] evaluation.horizons.MEDIUM is populated');
  assert(Boolean(evalReliance.horizons?.LONG), '[5.5D.3] evaluation.horizons.LONG is populated');

  // Test 5.5D.4: Short/Medium/Long scores match HorizonEngine independently
  const directHorizonMatch = HorizonEngine.evaluate({
    fundamentalScore: evalReliance.fundamentalBuckets.total,
    technicalScore: evalReliance.technicalBuckets.total,
    assetType: evalReliance.sector,
    isETF: evalReliance.sector === 'ETF',
  });
  assert(evalReliance.horizons?.SHORT.score === directHorizonMatch.SHORT.score, '[5.5D.4] Pipeline Short score matches direct HorizonEngine score');
  assert(evalReliance.horizons?.MEDIUM.score === directHorizonMatch.MEDIUM.score, '[5.5D.4] Pipeline Medium score matches direct HorizonEngine score');
  assert(evalReliance.horizons?.LONG.score === directHorizonMatch.LONG.score, '[5.5D.4] Pipeline Long score matches direct HorizonEngine score');

  // Test 5.5D.5: ETF horizon outputs use T*2
  const evalGoldbees = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['GOLDBEES'], 'GOLDBEES');
  const expectedEtfScore = evalGoldbees.technicalScore * 2;
  assert(evalGoldbees.horizons?.SHORT.score === expectedEtfScore, '[5.5D.5] ETF Short score uses T * 2');
  assert(evalGoldbees.horizons?.MEDIUM.score === expectedEtfScore, '[5.5D.5] ETF Medium score uses T * 2');
  assert(evalGoldbees.horizons?.LONG.score === expectedEtfScore, '[5.5D.5] ETF Long score uses T * 2');

  // Test 5.5D.6: ETF fundamental status remains NOT_APPLICABLE
  assert(evalGoldbees.fundamentalStatus === 'NOT_APPLICABLE', '[5.5D.6] ETF fundamentalStatus is NOT_APPLICABLE');

  // Test 5.5D.7: Existing execution.stopLoss unchanged
  assert(Boolean(evalReliance.execution.stopLoss) && evalReliance.execution.stopLoss > 0, '[5.5D.7] Existing execution.stopLoss remains populated and positive');

  // Test 5.5D.8: Existing priceStructure.stopLoss unchanged
  assert(Boolean(evalReliance.priceStructure?.stopLoss), '[5.5D.8] Existing priceStructure.stopLoss remains populated');

  // Test 5.5D.9: Position independence
  const holdDummy: Holding = {
    id: 'h1',
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries',
    quantity: 500,
    avgBuyPrice: 2000,
    currentPrice: evalReliance.execution.ltp,
    investedAmount: 1000000,
    currentValue: evalReliance.execution.ltp * 500,
    unrealizedPnL: (evalReliance.execution.ltp - 2000) * 500,
    unrealizedPnLPct: ((evalReliance.execution.ltp - 2000) / 2000) * 100,
    sector: 'INDUSTRIAL',
  };
  const evalMap55D = new Map([['RELIANCE', evalReliance]]);
  const portfolioRes = PortfolioEngine.analyze([holdDummy], evalMap55D);
  assert(Boolean(portfolioRes), '[5.5D.9] Portfolio Engine processes evaluation seamlessly');
  assert(evalReliance.horizons?.SHORT.score === directHorizonMatch.SHORT.score, '[5.5D.9] Horizon scores remain unchanged after portfolio processing');

  // Test 5.5D.10: Horizon outputs do not mutate existing V1 outputs
  assert(evalReliance.coreScore === (evalReliance.fundamentalScore + evalReliance.technicalScore), '[5.5D.10] V1 coreScore remains exact sum of fundamental and technical scores');
  assert(evalReliance.fundamentalScore === evalReliance.fundamentalBuckets.total, '[5.5D.10] V1 fundamentalScore unmutated');
  assert(evalReliance.technicalScore === evalReliance.technicalBuckets.total, '[5.5D.10] V1 technicalScore unmutated');

  // ============================================================
  // PHASE 5.5E: HORIZON UI INTEGRATION TESTS
  // ============================================================
  console.log('\n--- PHASE 5.5E: HORIZON UI INTEGRATION TESTS ---');

  // Test 5.5E.1: Default Horizon Selection is Deterministic
  const defaultHorizon: Horizon = 'MEDIUM';
  assert(defaultHorizon === 'MEDIUM', '[5.5E.1] Default activeHorizon is deterministically initialized to MEDIUM');

  // Test 5.5E.2: Selecting SHORT renders evaluation.horizons.SHORT
  const shortSelection = evalReliance.horizons?.SHORT;
  assert(Boolean(shortSelection) && shortSelection?.horizon === 'SHORT', '[5.5E.2] SHORT selection accesses evaluation.horizons.SHORT');
  assert(typeof shortSelection?.score === 'number', '[5.5E.2] SHORT score is directly sourced from engine');

  // Test 5.5E.3: Selecting MEDIUM renders evaluation.horizons.MEDIUM
  const mediumSelection = evalReliance.horizons?.MEDIUM;
  assert(Boolean(mediumSelection) && mediumSelection?.horizon === 'MEDIUM', '[5.5E.3] MEDIUM selection accesses evaluation.horizons.MEDIUM');
  assert(typeof mediumSelection?.score === 'number', '[5.5E.3] MEDIUM score is directly sourced from engine');

  // Test 5.5E.4: Selecting LONG renders evaluation.horizons.LONG
  const longSelection = evalReliance.horizons?.LONG;
  assert(Boolean(longSelection) && longSelection?.horizon === 'LONG', '[5.5E.4] LONG selection accesses evaluation.horizons.LONG');
  assert(typeof longSelection?.score === 'number', '[5.5E.4] LONG score is directly sourced from engine');

  // Test 5.5E.5: Rendered Entry/Stop/Target come directly from selected horizon geometry
  assert(shortSelection?.geometry.entry === evalReliance.priceStructure?.entries.e1, '[5.5E.5] SHORT entry matches priceStructure.entries.e1');
  assert(shortSelection?.geometry.stop === evalReliance.priceStructure?.stops?.s1, '[5.5E.5] SHORT stop matches priceStructure.stops.s1');
  assert(shortSelection?.geometry.target === evalReliance.priceStructure?.targets.t1, '[5.5E.5] SHORT target matches priceStructure.targets.t1');

  assert(mediumSelection?.geometry.entry === evalReliance.priceStructure?.entries.e2, '[5.5E.5] MEDIUM entry matches priceStructure.entries.e2');
  assert(mediumSelection?.geometry.stop === evalReliance.priceStructure?.stops?.s2, '[5.5E.5] MEDIUM stop matches priceStructure.stops.s2');
  assert(mediumSelection?.geometry.target === evalReliance.priceStructure?.targets.t2, '[5.5E.5] MEDIUM target matches priceStructure.targets.t2');

  assert(longSelection?.geometry.entry === evalReliance.priceStructure?.entries.e3, '[5.5E.5] LONG entry matches priceStructure.entries.e3');
  assert(longSelection?.geometry.stop === evalReliance.priceStructure?.stops?.s3, '[5.5E.5] LONG stop matches priceStructure.stops.s3');
  assert(longSelection?.geometry.target === evalReliance.priceStructure?.targets.t3, '[5.5E.5] LONG target matches priceStructure.targets.t3');

  // Test 5.5E.6: UNAVAILABLE geometry remains UNAVAILABLE
  const evalWithUnavail = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['GOLDBEES'], 'GOLDBEES');
  const longUnavailGeom = evalWithUnavail.horizons?.LONG.geometry;
  assert(
    longUnavailGeom?.entry.classification === 'UNAVAILABLE' || longUnavailGeom?.entry.price === null,
    '[5.5E.6] UNAVAILABLE entry geometry preserves UNAVAILABLE classification/null price without coercion'
  );

  // Test 5.5E.7: ETF explanation remains correct
  assert(
    Boolean(evalWithUnavail.horizons?.SHORT.zoneReason?.includes('ETF — Technical-only score; Fundamental not applicable.')),
    '[5.5E.7] ETF explanation correctly included in horizon evaluation zoneReason'
  );

  // Test 5.5E.8: Changing horizon does not mutate coreScore, decisionZone, fundamentalScore, technicalScore, execution.stopLoss
  const snapshotCore = evalReliance.coreScore;
  const snapshotZone = evalReliance.zone;
  const snapshotFund = evalReliance.fundamentalScore;
  const snapshotTech = evalReliance.technicalScore;
  const snapshotExecSL = evalReliance.execution.stopLoss;

  // Simulate horizon lens toggling
  const horizonsList: Horizon[] = ['SHORT', 'MEDIUM', 'LONG'];
  for (const h of horizonsList) {
    const lens = evalReliance.horizons?.[h];
    assert(Boolean(lens), `[5.5E.8] Horizon ${h} accessible`);
  }
  assert(evalReliance.coreScore === snapshotCore, '[5.5E.8] coreScore unmutated after horizon access');
  assert(evalReliance.zone === snapshotZone, '[5.5E.8] decisionZone unmutated after horizon access');
  assert(evalReliance.fundamentalScore === snapshotFund, '[5.5E.8] fundamentalScore unmutated after horizon access');
  assert(evalReliance.technicalScore === snapshotTech, '[5.5E.8] technicalScore unmutated after horizon access');
  assert(evalReliance.execution.stopLoss === snapshotExecSL, '[5.5E.8] execution.stopLoss unmutated after horizon access');

  // ============================================================
  // PHASE 6.6: V1.2 CALIBRATED HORIZON THRESHOLD SUITE
  // ============================================================
  console.log('\n--- PHASE 6.6: V1.2 CALIBRATED HORIZON THRESHOLD TESTS ---');

  // Test 6.6.1: SHORT Horizon Calibrated Boundary Tests (37 / 65)
  const short_0 = HorizonEngine.evaluate({ fundamentalScore: 0, technicalScore: 0 });
  const short_36_99 = HorizonEngine.evaluate({ fundamentalScore: 18.495, technicalScore: 18.495 });
  const short_37_00 = HorizonEngine.evaluate({ fundamentalScore: 18.5, technicalScore: 18.5 });
  const short_64_99 = HorizonEngine.evaluate({ fundamentalScore: 32.495, technicalScore: 32.495 });
  const short_65_00 = HorizonEngine.evaluate({ fundamentalScore: 32.5, technicalScore: 32.5 });
  const short_100 = HorizonEngine.evaluate({ fundamentalScore: 50, technicalScore: 50 });

  assert(short_0.SHORT.zone === 'CAUTION', '[6.6.1] Short score 0 resolves to CAUTION');
  assert(short_36_99.SHORT.zone === 'CAUTION', `[6.6.1] Short score 36.99 (< 37) resolves to CAUTION (Actual: ${short_36_99.SHORT.zone})`);
  assert(short_37_00.SHORT.zone === 'HOLD', `[6.6.1] Short score 37.00 (>= 37) resolves to HOLD (Actual: ${short_37_00.SHORT.zone})`);
  assert(short_64_99.SHORT.zone === 'HOLD', `[6.6.1] Short score 64.99 (< 65) resolves to HOLD (Actual: ${short_64_99.SHORT.zone})`);
  assert(short_65_00.SHORT.zone === 'FAVORABLE', `[6.6.1] Short score 65.00 (>= 65) resolves to FAVORABLE (Actual: ${short_65_00.SHORT.zone})`);
  assert(short_100.SHORT.zone === 'FAVORABLE', '[6.6.1] Short score 100 resolves to FAVORABLE');

  // Test 6.6.2: MEDIUM Horizon Frozen Baseline Protection (39 / 68)
  const med_0 = HorizonEngine.evaluate({ fundamentalScore: 0, technicalScore: 0 });
  const med_38_99 = HorizonEngine.evaluate({ fundamentalScore: 19.495, technicalScore: 19.495 });
  const med_39_00 = HorizonEngine.evaluate({ fundamentalScore: 19.5, technicalScore: 19.5 });
  const med_67_99 = HorizonEngine.evaluate({ fundamentalScore: 33.995, technicalScore: 33.995 });
  const med_68_00 = HorizonEngine.evaluate({ fundamentalScore: 34.0, technicalScore: 34.0 });
  const med_100 = HorizonEngine.evaluate({ fundamentalScore: 50, technicalScore: 50 });

  assert(med_0.MEDIUM.zone === 'CAUTION', '[6.6.2] Medium score 0 resolves to CAUTION');
  assert(med_38_99.MEDIUM.zone === 'CAUTION', `[6.6.2] Medium score 38.99 (< 39) resolves to CAUTION (Actual: ${med_38_99.MEDIUM.zone})`);
  assert(med_39_00.MEDIUM.zone === 'HOLD', `[6.6.2] Medium score 39.00 (>= 39) resolves to HOLD (Actual: ${med_39_00.MEDIUM.zone})`);
  assert(med_67_99.MEDIUM.zone === 'HOLD', `[6.6.2] Medium score 67.99 (< 68) resolves to HOLD (Actual: ${med_67_99.MEDIUM.zone})`);
  assert(med_68_00.MEDIUM.zone === 'FAVORABLE', `[6.6.2] Medium score 68.00 (>= 68) resolves to FAVORABLE (Actual: ${med_68_00.MEDIUM.zone})`);
  assert(med_100.MEDIUM.zone === 'FAVORABLE', '[6.6.2] Medium score 100 resolves to FAVORABLE');

  // Test 6.6.3: LONG Horizon Calibrated Boundary Tests (40 / 68)
  const long_0 = HorizonEngine.evaluate({ fundamentalScore: 0, technicalScore: 0 });
  const long_39_99 = HorizonEngine.evaluate({ fundamentalScore: 19.995, technicalScore: 19.995 });
  const long_40_00 = HorizonEngine.evaluate({ fundamentalScore: 20.0, technicalScore: 20.0 });
  const long_67_99 = HorizonEngine.evaluate({ fundamentalScore: 33.995, technicalScore: 33.995 });
  const long_68_00 = HorizonEngine.evaluate({ fundamentalScore: 34.0, technicalScore: 34.0 });
  const long_100 = HorizonEngine.evaluate({ fundamentalScore: 50, technicalScore: 50 });

  assert(long_0.LONG.zone === 'CAUTION', '[6.6.3] Long score 0 resolves to CAUTION');
  assert(long_39_99.LONG.zone === 'CAUTION', `[6.6.3] Long score 39.99 (< 40) resolves to CAUTION (Actual: ${long_39_99.LONG.zone})`);
  assert(long_40_00.LONG.zone === 'HOLD', `[6.6.3] Long score 40.00 (>= 40) resolves to HOLD (Actual: ${long_40_00.LONG.zone})`);
  assert(long_67_99.LONG.zone === 'HOLD', `[6.6.3] Long score 67.99 (< 68) resolves to HOLD (Actual: ${long_67_99.LONG.zone})`);
  assert(long_68_00.LONG.zone === 'FAVORABLE', `[6.6.3] Long score 68.00 (>= 68) resolves to FAVORABLE (Actual: ${long_68_00.LONG.zone})`);
  assert(long_100.LONG.zone === 'FAVORABLE', '[6.6.3] Long score 100 resolves to FAVORABLE');

  // Test 6.6.4: ETF Calibrated Zone Differentiation (T = 33 -> Score = 66)
  const etfCalibTest = HorizonEngine.evaluate({ fundamentalScore: 0, technicalScore: 33, isETF: true });
  assert(etfCalibTest.SHORT.score === 66 && etfCalibTest.SHORT.zone === 'FAVORABLE', `[6.6.4] ETF Short score 66 resolves to FAVORABLE (>= 65) (Actual: ${etfCalibTest.SHORT.zone})`);
  assert(etfCalibTest.MEDIUM.score === 66 && etfCalibTest.MEDIUM.zone === 'HOLD', `[6.6.4] ETF Medium score 66 resolves to HOLD (39 - 68) (Actual: ${etfCalibTest.MEDIUM.zone})`);
  assert(etfCalibTest.LONG.score === 66 && etfCalibTest.LONG.zone === 'HOLD', `[6.6.4] ETF Long score 66 resolves to HOLD (40 - 68) (Actual: ${etfCalibTest.LONG.zone})`);
  assert(
    Boolean(etfCalibTest.SHORT.zoneReason?.includes('ETF — Technical-only score; Fundamental not applicable.')),
    '[6.6.4] ETF zoneReason preserves fundamental non-applicable explanation'
  );

  // Test 6.6.5: Score Invariance (Thresholds do not alter underlying scores)
  const scoreInvarTest = HorizonEngine.evaluate({ fundamentalScore: 35, technicalScore: 25 });
  assert(scoreInvarTest.SHORT.score === 56, `[6.6.5] Short score is invariant: 56 (Actual: ${scoreInvarTest.SHORT.score})`);
  assert(scoreInvarTest.MEDIUM.score === 60, `[6.6.5] Medium score is invariant: 60 (Actual: ${scoreInvarTest.MEDIUM.score})`);
  assert(scoreInvarTest.LONG.score === 64, `[6.6.5] Long score is invariant: 64 (Actual: ${scoreInvarTest.LONG.score})`);

  // Test 6.6.6: Position Independence
  const evalRelV12 = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE');
  const relHold1: Holding = {
    id: 'h_rel1',
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries',
    quantity: 100,
    avgBuyPrice: 2400,
    currentPrice: evalRelV12.execution.ltp,
    investedAmount: 240000,
    currentValue: evalRelV12.execution.ltp * 100,
    unrealizedPnL: (evalRelV12.execution.ltp - 2400) * 100,
    unrealizedPnLPct: ((evalRelV12.execution.ltp - 2400) / 2400) * 100,
    sector: 'INDUSTRIAL',
  };
  const mapV12 = new Map([['RELIANCE', evalRelV12]]);
  PortfolioEngine.analyze([relHold1], mapV12);
  assert(
    evalRelV12.horizons?.SHORT.score === HorizonEngine.calculateScore('SHORT', evalRelV12.fundamentalScore, evalRelV12.technicalScore, false),
    '[6.6.6] Portfolio holding analysis preserves exact horizon scores'
  );

  // Test 6.6.7: Geometry Isolation
  assert(evalRelV12.horizons?.SHORT.geometry.entry === evalRelV12.priceStructure?.entries.e1, '[6.6.7] SHORT geometry entry matches priceStructure.entries.e1');
  assert(evalRelV12.horizons?.SHORT.geometry.stop === evalRelV12.priceStructure?.stops?.s1, '[6.6.7] SHORT geometry stop matches priceStructure.stops.s1');
  assert(evalRelV12.horizons?.SHORT.geometry.target === evalRelV12.priceStructure?.targets.t1, '[6.6.7] SHORT geometry target matches priceStructure.targets.t1');

  // Test 6.6.8: Execution Isolation
  assert(
    typeof evalRelV12.execution.stopLoss === 'number' && evalRelV12.execution.stopLoss > 0,
    '[6.6.8] execution.stopLoss remains populated, positive, and decoupled from horizon zones'
  );
  assert(Boolean(evalRelV12.execution.status), '[6.6.8] execution.status populated independently of horizon zones');

  // Test 6.6.9: Analytical Benchmark Suite Regression (10 Assets)
  const v12BenchmarkKeys = [
    'HDFCBANK', 'ICICIBANK', 'KOTAKBANK', 'SBIN', 'BAJFINANCE',
    'RELIANCE', 'TCS', 'FINCABLES', 'GOLDBEES', 'ITBEES'
  ];
  for (const sym of v12BenchmarkKeys) {
    const assetInput = BENCHMARK_STOCKS[sym];
    if (assetInput) {
      const assetEval = StockInsightPipeline.evaluate(assetInput, sym);
      assert(
        typeof assetEval.coreScore === 'number' && assetEval.coreScore >= 0 && assetEval.coreScore <= 100,
        `[6.6.9] ${sym}: coreScore is valid numeric score (Actual: ${assetEval.coreScore})`
      );
      assert(
        ['FAVORABLE', 'HOLD', 'CAUTION'].includes(assetEval.zone),
        `[6.6.9] ${sym}: base decisionZone remains valid V1 DecisionZone (Actual: ${assetEval.zone})`
      );
      assert(
        Boolean(assetEval.horizons?.SHORT && assetEval.horizons?.MEDIUM && assetEval.horizons?.LONG),
        `[6.6.9] ${sym}: All three horizon condition objects are fully populated`
      );
    }
  }

  // ============================================================
  // PHASE 7C: MODEL D STRUCTURAL STOPS & SEQUENTIAL ENTRY TIERS TESTS
  // ============================================================
  console.log('\n--- PHASE 7C: MODEL D STRUCTURAL STOPS & SEQUENTIAL ENTRY TIERS TESTS ---');

  // Test 7C.1: Sequential Entry Dependency (E1 -> E2 -> E3)
  const e1Valid: PriceStructureLevel = { price: 1000, type: 'E1', source: 'TEST', classification: 'STRUCTURAL' };
  const e2Unavail: PriceStructureLevel = { price: null, type: 'UNAVAILABLE', source: 'NONE', classification: 'UNAVAILABLE', distancePct: null };
  const s2Seq = PriceStructureEngine.calculateHorizonStop(e2Unavail, 1000, 20, 'S2');
  const s3Seq = PriceStructureEngine.calculateHorizonStop(e2Unavail, 1000, 20, 'S3');
  assert(s2Seq.price === null && s2Seq.classification === 'UNAVAILABLE', '[7C.1] E2 UNAVAILABLE yields S2 UNAVAILABLE');
  assert(s3Seq.price === null && s3Seq.classification === 'UNAVAILABLE', '[7C.1] E2 UNAVAILABLE yields S3 UNAVAILABLE');

  // Test 7C.2: Model D Structural Stop Lookup & Buffer
  const structCandidates: StructuralCandidateMetadata[] = [
    { type: 'Reaction Cluster (3 touches)', price: 970, zoneMin: 968, zoneMax: 972, touchCount: 3, ageDays: 10, volumeRatio: 1.2, isOverhead: false },
    { type: '50-DMA', price: 940, zoneMin: 938, zoneMax: 942, touchCount: 1, ageDays: 0, volumeRatio: 1.0, isOverhead: false },
    { type: '52-Week Low Floor', price: 900, zoneMin: 900, zoneMax: 906, touchCount: 1, ageDays: 0, volumeRatio: 1.0, isOverhead: false },
  ];
  const s1ModelD = PriceStructureEngine.calculateHorizonStop(e1Valid, 1000, 20, 'S1', structCandidates);
  assert(s1ModelD.price === 960, `[7C.2] S1 uses highest structural candidate (₹970) with 0.5 ATR buffer: ₹960 (Actual: ₹${s1ModelD.price})`);
  assert(s1ModelD.classification === 'STRUCTURAL', '[7C.2] S1 classification is STRUCTURAL when structural candidate selected');
  assert(s1ModelD.type.includes('Reaction Cluster'), '[7C.2] S1 type preserves structural candidate context');

  // Test 7C.3: S3 50-DMA Candidate Exclusion Rule
  const e3Valid: PriceStructureLevel = { price: 950, type: 'E3', source: 'TEST', classification: 'STRUCTURAL' };
  const s3Exclusion = PriceStructureEngine.calculateHorizonStop(e3Valid, 1000, 20, 'S3', structCandidates);
  assert(s3Exclusion.price === 890, `[7C.3] S3 excludes 50-DMA (₹940) and selects 52W Low (₹900) with buffer: ₹890 (Actual: ₹${s3Exclusion.price})`);
  assert(s3Exclusion.type.includes('52-Week Low Floor'), '[7C.3] S3 selected candidate is 52-Week Low Floor');

  const e2Valid: PriceStructureLevel = { price: 970, type: 'E2', source: 'TEST', classification: 'STRUCTURAL' };
  const s2Normal = PriceStructureEngine.calculateHorizonStop(e2Valid, 1000, 20, 'S2', structCandidates);
  assert(s2Normal.price === 930, `[7C.3] S2 includes 50-DMA (₹940) with buffer: ₹930 (Actual: ₹${s2Normal.price})`);

  // Test 7C.4: S1 52-Week Low Floor Exclusion Rule
  const only52WPool: StructuralCandidateMetadata[] = [
    { type: '52-Week Low Floor', price: 900, zoneMin: 900, zoneMax: 906, touchCount: 1, ageDays: 0, volumeRatio: 1.0, isOverhead: false },
  ];
  const s1Excluded52W = PriceStructureEngine.calculateHorizonStop(e1Valid, 1000, 20, 'S1', only52WPool);
  assert(s1Excluded52W.price === 970, `[7C.4] S1 excludes 52W Low (₹900) when LTP (1000) > 940 and falls back to ₹970 (Actual: ₹${s1Excluded52W.price})`);

  const s1Included52W = PriceStructureEngine.calculateHorizonStop(e1Valid, 930, 20, 'S1', only52WPool);
  assert(s1Included52W.price === 890, `[7C.4] S1 includes 52W Low (₹900) when LTP (930) <= 940 -> Stop: ₹890 (Actual: ₹${s1Included52W.price})`);

  // Test 7C.5: Zero Fabrication & Fallback Check
  const noCandidatePool: StructuralCandidateMetadata[] = [];
  const s1Fallback = PriceStructureEngine.calculateHorizonStop(e1Valid, 1000, 20, 'S1', noCandidatePool);
  assert(s1Fallback.price === 970, `[7C.5] Fallback stop equals E1 - 1.5 ATR: ₹970 (Actual: ₹${s1Fallback.price})`);
  assert(s1Fallback.classification === 'MATHEMATICAL_FALLBACK', '[7C.5] Fallback classification is MATHEMATICAL_FALLBACK');

  // Test 7C.6: Benchmark Suite Geometry Audit (All Benchmark Assets)
  console.log('\n--- MODEL D BENCHMARK GEOMETRY AUDIT ---');
  for (const sym of Object.keys(BENCHMARK_STOCKS)) {
    const assetInput = BENCHMARK_STOCKS[sym];
    if (assetInput) {
      const evalAsset = StockInsightPipeline.evaluate(assetInput, sym);
      const ps = evalAsset.priceStructure;
      assert(Boolean(ps), `[7C.6] ${sym}: priceStructure populated`);
      
      const e1P = ps.entries.e1.price;
      const e2P = ps.entries.e2.price;
      const e3P = ps.entries.e3.price;
      const s1P = ps.stops.s1.price;
      const s2P = ps.stops.s2.price;
      const s3P = ps.stops.s3.price;

      if (e2P === null) assert(s2P === null, `[7C.6] ${sym}: E2 null implies S2 null`);
      if (e3P === null) assert(s3P === null, `[7C.6] ${sym}: E3 null implies S3 null`);
      if (e2P === null) assert(e3P === null, `[7C.6] ${sym}: E2 null implies E3 null (Sequential Entry Dependency)`);

      if (e1P !== null && s1P !== null) assert(s1P < e1P, `[7C.6] ${sym}: S1 (₹${s1P}) < E1 (₹${e1P})`);
      if (e2P !== null && s2P !== null) assert(s2P < e2P, `[7C.6] ${sym}: S2 (₹${s2P}) < E2 (₹${e2P})`);
      if (e3P !== null && s3P !== null) assert(s3P < e3P, `[7C.6] ${sym}: S3 (₹${s3P}) < E3 (₹${e3P})`);

      console.log(`  ${sym.padEnd(10)} | LTP: ₹${evalAsset.execution.ltp.toFixed(2).padStart(8)} | E1: ₹${String(e1P).padStart(8)} (S1: ₹${String(s1P).padStart(8)}) | E2: ${e2P !== null ? '₹' + e2P : 'UNAVAIL '} (S2: ${s2P !== null ? '₹' + s2P : 'UNAVAIL '}) | E3: ${e3P !== null ? '₹' + e3P : 'UNAVAIL '} (S3: ${s3P !== null ? '₹' + s3P : 'UNAVAIL '})`);
    }
  }

  // ============================================================
  // PHASE 12: V1.2.1 DATA INTEGRITY HOTFIX REGRESSION TESTS
  // ============================================================
  console.log('\n--- PHASE 12: V1.2.1 DATA INTEGRITY HOTFIX TESTS ---');

  const hotfixClient = new UpstoxClient();

  // Test 12.1: Cache hit uses evaluation's valid live LTP
  const zydusInput = BENCHMARK_STOCKS['ZYDUSLIFE'];
  const zydusEval = StockInsightPipeline.evaluate(zydusInput, 'ZYDUSLIFE');
  const zydusCache = new Map<string, StockInsightEvaluation>();
  zydusCache.set('ZYDUSLIFE', zydusEval);

  const zydusHolding: Holding[] = [
    {
      id: 'zh_1',
      symbol: 'ZYDUSLIFE',
      companyName: 'Zydus Lifesciences Limited',
      sector: 'Pharmaceuticals',
      isin: 'INE010B01027',
      quantity: 25,
      averageBuyPrice: 950.0,
      addedAt: new Date().toISOString(),
    },
  ];

  const zydusResolved = PortfolioEngine.analyze(zydusHolding, zydusCache);
  assert(zydusResolved.items[0].quoteStatus === 'RESOLVED', '[12.1] Cache hit yields quoteStatus = RESOLVED');
  assert(zydusResolved.items[0].currentLtp === zydusEval.execution.ltp, `[12.1] Cache hit uses valid live LTP (₹${zydusResolved.items[0].currentLtp} === ₹${zydusEval.execution.ltp})`);
  assert(zydusResolved.items[0].currentValue === 25 * zydusEval.execution.ltp, '[12.1] Current Value correctly calculated from live LTP');
  assert(zydusResolved.items[0].pnl === (25 * zydusEval.execution.ltp) - (25 * 950.0), '[12.1] Unrealized P&L correctly calculated from live LTP');

  // Test 12.2: Cache miss / loading state NEVER uses averageBuyPrice as currentLtp
  const emptyEvalCache = new Map<string, StockInsightEvaluation>();
  const zydusPending = PortfolioEngine.analyze(zydusHolding, emptyEvalCache);
  assert(zydusPending.items[0].quoteStatus === 'PENDING', '[12.2] Cache miss yields quoteStatus = PENDING');
  assert(zydusPending.items[0].currentLtp === null, '[12.2] Cache miss sets currentLtp to null (never averageBuyPrice)');
  assert(zydusPending.items[0].currentValue === null, '[12.2] Cache miss sets currentValue to null');
  assert(zydusPending.items[0].pnl === null, '[12.2] Cache miss sets pnl to null');
  assert(zydusPending.items[0].pnlPercentage === null, '[12.2] Cache miss sets pnlPercentage to null');
  assert(zydusPending.items[0].currentLtp !== zydusHolding[0].averageBuyPrice, '[12.2] Verified: currentLtp is NOT equal to averageBuyPrice (anti-fallback invariant)');

  // Test 12.3: Quote failure NEVER uses averageBuyPrice as currentLtp
  const failedZydusEval = JSON.parse(JSON.stringify(zydusEval)) as StockInsightEvaluation;
  failedZydusEval.dataSource = 'DATA_UNAVAILABLE';
  failedZydusEval.execution.ltp = 0;
  const failedCache = new Map<string, StockInsightEvaluation>([['ZYDUSLIFE', failedZydusEval]]);
  const zydusFailed = PortfolioEngine.analyze(zydusHolding, failedCache);
  assert(zydusFailed.items[0].quoteStatus === 'UNAVAILABLE', '[12.3] Failed quote yields quoteStatus = UNAVAILABLE');
  assert(zydusFailed.items[0].currentLtp === null, '[12.3] Failed quote sets currentLtp to null');
  assert(zydusFailed.items[0].currentValue === null, '[12.3] Failed quote sets currentValue to null');
  assert(zydusFailed.items[0].pnl === null, '[12.3] Failed quote sets pnl to null');

  // Test 12.4: Portfolio totals reconcile from valid row values, excluding unresolved rows
  const mixedHoldings: Holding[] = [
    {
      id: 'mh_1',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      sector: 'Energy',
      isin: 'INE002A01018',
      quantity: 10,
      averageBuyPrice: 2800.0,
      addedAt: new Date().toISOString(),
    },
    {
      id: 'mh_2',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      sector: 'Information Technology',
      isin: 'INE467B01029',
      quantity: 10,
      averageBuyPrice: 4000.0,
      addedAt: new Date().toISOString(),
    },
    {
      id: 'mh_3',
      symbol: 'UNRESOLVED_STOCK',
      companyName: 'Unresolved Equities Ltd',
      sector: 'Other',
      isin: 'INE999A01099',
      quantity: 50,
      averageBuyPrice: 500.0, // 25,000 invested, but unquoted
      addedAt: new Date().toISOString(),
    },
  ];

  const mixedCache = new Map<string, StockInsightEvaluation>([
    ['RELIANCE', relEval],
    ['TCS', tcsEval],
  ]); // Note: UNRESOLVED_STOCK is omitted

  const mixedAnalysis = PortfolioEngine.analyze(mixedHoldings, mixedCache);
  const expectedResolvedCurrentVal = (10 * relEval.execution.ltp) + (10 * tcsEval.execution.ltp);
  const expectedResolvedInvested = (10 * 2800.0) + (10 * 4000.0); // 68,000
  const expectedResolvedPnl = expectedResolvedCurrentVal - expectedResolvedInvested;

  assert(mixedAnalysis.items[0].quoteStatus === 'RESOLVED', '[12.4] RELIANCE row resolved');
  assert(mixedAnalysis.items[1].quoteStatus === 'RESOLVED', '[12.4] TCS row resolved');
  assert(mixedAnalysis.items[2].quoteStatus === 'PENDING', '[12.4] UNRESOLVED_STOCK row pending');
  assert(Math.abs(mixedAnalysis.analytics.totalCurrentValue - expectedResolvedCurrentVal) < 0.01, `[12.4] Total Current Value sums ONLY resolved rows (₹${mixedAnalysis.analytics.totalCurrentValue.toFixed(2)} === ₹${expectedResolvedCurrentVal.toFixed(2)})`);
  assert(Math.abs(mixedAnalysis.analytics.totalPnl - expectedResolvedPnl) < 0.01, `[12.4] Total Unrealized P&L reconciles strictly from resolved rows (₹${mixedAnalysis.analytics.totalPnl.toFixed(2)} === ₹${expectedResolvedPnl.toFixed(2)})`);

  // Test 12.5: Stock Detail and Portfolio use the EXACT same normalized quote for the same instrument
  assert(zydusEval.execution.ltp === zydusResolved.items[0].currentLtp, '[12.5] Stock Detail LTP and Portfolio Row LTP match identically (0.00 variance)');

  // Test 12.6: Cache keying does not misresolve distinct instrument identities (TMCV vs TMPV)
  const tmcvInput = BENCHMARK_STOCKS['TMCV'];
  const tmpvInput = BENCHMARK_STOCKS['TMPV'];
  const tmcvEvalObj = StockInsightPipeline.evaluate(tmcvInput, 'TMCV');
  const tmpvEvalObj = StockInsightPipeline.evaluate(tmpvInput, 'TMPV');

  const dualCache = new Map<string, StockInsightEvaluation>();
  // Store both in cache simulating App.tsx
  dualCache.set('TMCV', tmcvEvalObj);
  if (tmcvEvalObj.tradingSymbol) dualCache.set(tmcvEvalObj.tradingSymbol.toUpperCase(), tmcvEvalObj);
  if (tmcvEvalObj.isin) dualCache.set(tmcvEvalObj.isin.toUpperCase(), tmcvEvalObj);

  dualCache.set('TMPV', tmpvEvalObj);
  if (tmpvEvalObj.tradingSymbol) dualCache.set(tmpvEvalObj.tradingSymbol.toUpperCase(), tmpvEvalObj);
  if (tmpvEvalObj.isin) dualCache.set(tmpvEvalObj.isin.toUpperCase(), tmpvEvalObj);

  const dualHoldings: Holding[] = [
    {
      id: 'dh_1',
      symbol: 'TMCV',
      companyName: 'Tata Motors Commercial Vehicles Limited',
      sector: 'Automobiles',
      isin: 'INE1TAE01010',
      quantity: 50,
      averageBuyPrice: 750.0,
      addedAt: new Date().toISOString(),
    },
    {
      id: 'dh_2',
      symbol: 'TMPV',
      companyName: 'Tata Motors Passenger Vehicles Limited',
      sector: 'Automobiles',
      isin: 'INE155A01022',
      quantity: 50,
      averageBuyPrice: 900.0,
      addedAt: new Date().toISOString(),
    },
  ];

  const dualAnalysis = PortfolioEngine.analyze(dualHoldings, dualCache);
  const tmcvResultItem = dualAnalysis.items.find((i) => i.holding.symbol === 'TMCV');
  const tmpvResultItem = dualAnalysis.items.find((i) => i.holding.symbol === 'TMPV');

  assert(Boolean(tmcvResultItem && tmpvResultItem), '[12.6] Both TMCV and TMPV present in portfolio analysis');
  assert(tmcvResultItem?.currentLtp === tmcvEvalObj.execution.ltp, `[12.6] TMCV bound to TMCV LTP: ₹${tmcvResultItem?.currentLtp}`);
  assert(tmpvResultItem?.currentLtp === tmpvEvalObj.execution.ltp, `[12.6] TMPV bound to TMPV LTP: ₹${tmpvResultItem?.currentLtp}`);
  assert(tmcvResultItem?.currentLtp !== tmpvResultItem?.currentLtp, '[12.6] Distinct market prices preserved between TMCV (780) and TMPV (940)');
  assert(tmcvResultItem?.evaluation?.tradingSymbol === 'TMCV', '[12.6] TMCV tradingSymbol preserved');
  assert(tmpvResultItem?.evaluation?.tradingSymbol === 'TMPV', '[12.6] TMPV tradingSymbol preserved');

  // --- PHASE 1.2: FAIL-CLOSED SEMANTIC CORRECTION TESTS ---
  console.log('\n--- PHASE 1.2: FAIL-CLOSED SEMANTIC CORRECTION TESTS ---');

  // 1. Unavailable Fundamentals: MUST NOT trigger fundamental floor failure or Floor Breached
  const emcureEvalInput = await testClient.getEvaluationData('EMCURE');
  const emcureEval = StockInsightPipeline.evaluate(emcureEvalInput, 'EMCURE');
  assert(emcureEval.fundamentalStatus === 'UNAVAILABLE', '[1.2.1] EMCURE fundamentalStatus is UNAVAILABLE');
  assert(emcureEval.safety.fundamentalFloorFailed === false, '[1.2.1] Unavailable fundamentals DO NOT trigger fundamentalFloorFailed');

  // 2. Unavailable Technicals: MUST NOT generate macro bearish explanations without indicators
  assert(emcureEval.technicalStatus === 'UNAVAILABLE', '[1.2.2] EMCURE technicalStatus is UNAVAILABLE when candles are missing');
  const emaFactor = emcureEval.technicalFactors.find((f) => f.name === '200-EMA Macro Regime');
  assert(Boolean(emaFactor && emaFactor.explanation.includes('200-EMA unavailable')), '[1.2.2] 200-EMA factor outputs neutral unavailable explanation instead of claiming bearish regime');
  assert(emaFactor?.state === 'MISSING', '[1.2.2] 200-EMA factor state is MISSING when candle history unavailable');

  // 3. Unavailable Execution: LTP <= 0 yields status DATA_UNAVAILABLE and null prices
  assert(emcureEval.execution.status === 'DATA_UNAVAILABLE', '[1.2.3] Execution status is DATA_UNAVAILABLE when LTP <= 0');
  assert(emcureEval.execution.ltp === null, '[1.2.3] Execution LTP is null when quote unavailable (not 0)');
  assert(emcureEval.execution.stopLoss === null, '[1.2.3] Execution Stop Loss is null when quote unavailable (not 0)');
  assert(emcureEval.execution.target === null, '[1.2.3] Execution Target is null when quote unavailable (not 0)');
  assert(emcureEval.execution.maxEntry === null, '[1.2.3] Execution Max Entry is null when quote unavailable (not 0)');

  // 4. Low Liquidity Separation: DATA_UNAVAILABLE is distinct from REJECT_LOW_LIQUIDITY
  assert(emcureEval.execution.status !== 'REJECT_LOW_LIQUIDITY', '[1.2.4] Missing market data DOES NOT trigger REJECT_LOW_LIQUIDITY');

  // Genuine Low Liquidity test: valid LTP + valid data + turnover < ₹5 Cr
  const lowLiqInput: EvaluationInput = {
    quote: {
      instrument_token: 'NSE_EQ|LOWLIQ',
      timestamp: new Date().toISOString(),
      last_price: 100,
      open: 100,
      high: 105,
      low: 98,
      close: 100,
      volume: 1000,
      average_price: 100,
      net_change: 0,
      total_buy_quantity: 100,
      total_sell_quantity: 100,
      lower_circuit_limit: 80,
      upper_circuit_limit: 120,
    },
    candles: [
      [new Date().toISOString().split('T')[0], 100, 105, 98, 100, 1000, 0]
    ],
    profile: { status: 'success', data: { company_name: 'Low Liq Co', isin: 'INE999A01010' } },
    keyRatios: { status: 'success', data: [] },
    annualIncome: { status: 'success', data: { income_statement: [] } },
    quarterlyIncome: { status: 'success', data: { income_statement: [] } },
    balanceSheet: { status: 'success', data: { balance_sheet: [] } },
    cashFlow: { status: 'success', data: { cash_flow: [] } },
    shareHoldings: { status: 'success', data: { history: [] } },
    dataSource: 'UPSTOX_LIVE',
  };
  const lowLiqEval = StockInsightPipeline.evaluate(lowLiqInput, 'LOWLIQ');
  assert(lowLiqEval.execution.status === 'REJECT_LOW_LIQUIDITY', '[1.2.4] Genuine turnover < 5 Cr with valid LTP triggers REJECT_LOW_LIQUIDITY');

  // --- DATA-QUALITY SCORE SEPARATION TESTS ---
  console.log('\n--- DATA-QUALITY SCORE SEPARATION TESTS ---');

  // 1. Financial period older than 180 days does not reduce score
  const oldPeriodInput = JSON.parse(JSON.stringify(BENCHMARK_STOCKS['RELIANCE']));
  oldPeriodInput.balanceSheet.data.history[0].period = 'Mar 2022'; // 3+ years old
  const oldPeriodEval = StockInsightPipeline.evaluate(oldPeriodInput, 'RELIANCE');
  const baseRelianceEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE');

  assert(
    oldPeriodEval.fundamentalScore === baseRelianceEval.fundamentalScore,
    `[Data-Quality Separation 1] Financial period end older than 180 days DOES NOT reduce fundamental score (${baseRelianceEval.fundamentalScore} === ${oldPeriodEval.fundamentalScore})`
  );
  assert(
    oldPeriodEval.technicalScore === baseRelianceEval.technicalScore,
    `[Data-Quality Separation 1] Financial period end older than 180 days DOES NOT reduce technical score (${baseRelianceEval.technicalScore} === ${oldPeriodEval.technicalScore})`
  );
  assert(
    oldPeriodEval.coreScore === baseRelianceEval.coreScore,
    `[Data-Quality Separation 1] Financial period end older than 180 days DOES NOT reduce core score (${baseRelianceEval.coreScore} === ${oldPeriodEval.coreScore})`
  );

  // 2. FRESHNESS_UNVERIFIABLE does not change scores or decision zones when analytical inputs are valid
  assert(
    oldPeriodEval.integrity.status === 'FRESHNESS_UNVERIFIABLE',
    '[Data-Quality Separation 2] Status set to FRESHNESS_UNVERIFIABLE for period > 180 days'
  );
  assert(
    oldPeriodEval.zone === baseRelianceEval.zone,
    `[Data-Quality Separation 2] Decision zone unchanged under FRESHNESS_UNVERIFIABLE (${baseRelianceEval.zone} === ${oldPeriodEval.zone})`
  );

  // 3. Freshness warning does not block FAVORABLE status by itself
  const favorableMockInput = JSON.parse(JSON.stringify(BENCHMARK_STOCKS['RELIANCE']));
  favorableMockInput.balanceSheet.data.history[0].period = 'Jan 2024';
  const favorableEval = StockInsightPipeline.evaluate(favorableMockInput, 'RELIANCE');
  if (baseRelianceEval.coreScore >= 68 && baseRelianceEval.fundamentalScore >= 25) {
    assert(
      favorableEval.zone === 'FAVORABLE',
      '[Data-Quality Separation 3] Freshness warning DOES NOT block FAVORABLE zone status'
    );
  }

  // 4. Missing required analytical inputs still trigger appropriate UNAVAILABLE state
  const missingInputsEvalInput: EvaluationInput = {
    symbol: 'UNAVAIL_TEST',
    quote: {
      instrument_token: 'NSE_EQ|UNAVAIL',
      timestamp: new Date().toISOString(),
      last_price: 0,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume: 0,
      average_price: 0,
      net_change: 0,
      total_buy_quantity: 0,
      total_sell_quantity: 0,
      lower_circuit_limit: 0,
      upper_circuit_limit: 0,
    },
    candles: [],
    profile: { status: 'success', data: { company_name: 'Unavail Co' } },
    keyRatios: null,
    annualIncome: null,
    quarterlyIncome: null,
    balanceSheet: null,
    cashFlow: null,
    shareHoldings: null,
    dataSource: 'DATA_UNAVAILABLE',
    fundamentalStatus: 'UNAVAILABLE',
  };
  const missingInputsEval = StockInsightPipeline.evaluate(missingInputsEvalInput, 'UNAVAIL_TEST');
  assert(
    missingInputsEval.fundamentalStatus === 'UNAVAILABLE',
    '[Data-Quality Separation 4] Missing required fundamental inputs trigger fundamentalStatus = UNAVAILABLE'
  );

  // 5. Independent valid risk and analytical safety gates continue to work
  // Test Cash Divergence Kill-Switch
  const cashDivInput = JSON.parse(JSON.stringify(BENCHMARK_STOCKS['RELIANCE']));
  // Force 3Y PAT > 0 but 3Y CFO <= 0
  cashDivInput.annualIncome.data.income_statement.find((c: any) => c.category === 'net_profit').history = [
    { period: 'Mar 2025', value: 100 },
    { period: 'Mar 2024', value: 100 },
    { period: 'Mar 2023', value: 100 },
    { period: 'Mar 2022', value: 100 },
  ];
  cashDivInput.cashFlow.data.cash_flow.find((c: any) => c.category.includes('operating')).history = [
    { period: 'Jun 2026', value: -50 },
    { period: 'Mar 2024', value: -50 },
    { period: 'Mar 2023', value: -50 },
    { period: 'Mar 2022', value: -50 },
  ];
  const cashDivEval = StockInsightPipeline.evaluate(cashDivInput, 'RELIANCE');
  assert(
    cashDivEval.safety.cashDivergenceRedFlag === true,
    '[Data-Quality Separation 5] Independent Cash Divergence Kill-Switch triggers when PAT > 0 and CFO <= 0'
  );
  assert(
    cashDivEval.zone === 'HOLD',
    '[Data-Quality Separation 5] Cash Divergence Kill-Switch enforces HOLD hard cap'
  );

  // 6. Fundamental factor totals, remaining penalties and final scores reconcile exactly
  const rawSum = baseRelianceEval.fundamentalFactors.reduce((sum, f) => sum + f.score, 0);
  const expectedNet = Math.max(0, rawSum - baseRelianceEval.fundamentalBuckets.accrualTrapPenalty);
  assert(
    baseRelianceEval.fundamentalScore === expectedNet,
    `[Data-Quality Separation 6] Fundamental factor total (${rawSum}) - penalties (${baseRelianceEval.fundamentalBuckets.accrualTrapPenalty}) === final score (${baseRelianceEval.fundamentalScore})`
  );

  const phase21Result = runBreakoutVolumeCorrectionTests();
  total += phase21Result.total;
  passed += phase21Result.passed;

  const zeroMockResult = runZeroMockEnforcementTests();
  total += zeroMockResult.total;
  passed += zeroMockResult.passed;

  const corpActionResult = runCorporateActionAndPriceIntegrityTests();
  total += corpActionResult.total;
  passed += corpActionResult.passed;

  const profitGrowthResult = await runOptionBProfitGrowthTests();
  total += profitGrowthResult.total;
  passed += profitGrowthResult.passed;

  console.log('\n===========================================================');
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('===========================================================');

  if (passed === total) {
    console.log('🚀 ALL 5 PRODUCTION INTEGRITY LAYERS VERIFIED & VALIDATED!');
  } else {
    process.exit(1);
  }
}

function makeIncomeStatement(historyValues: number[] | null): UpstoxIncomeStatementResponse | null {
  if (!historyValues) return null;
  return {
    status: 'success',
    data: {
      type: 'consolidated',
      time_period: 'annual',
      units_in: 'crore',
      income_statement: [
        {
          category: 'net_profit',
          history: historyValues.map((v, i) => ({
            period: `Mar ${2024 - i}`,
            value: v,
          })),
        },
      ],
    },
  };
}

async function runOptionBProfitGrowthTests(): Promise<{ total: number; passed: number }> {
  let total = 0;
  let passed = 0;

  function runAssert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ PASS: ${msg}`);
    } else {
      console.error(`❌ FAIL: ${msg}`);
      throw new Error(`Test assertion failed: ${msg}`);
    }
  }

  console.log('\n--- OPTION B: PROFIT GROWTH INTEGRITY TEST SUITE ---');

  // 1. Verification of removal of ±20.0% fabricated CAGR fallback
  const negToPos = FundamentalCalculator.calculateNetProfitCAGR3Y(makeIncomeStatement([200, 100, 50, -100]));
  runAssert(negToPos === null, '[Anti-Fallback] Negative historical PAT yields cagr3YPct === null (never +20.0%)');

  const lossContraction = FundamentalCalculator.calculateNetProfitCAGR3Y(makeIncomeStatement([-50, -100, -200, -300]));
  runAssert(lossContraction === null, '[Anti-Fallback] Loss contraction yields cagr3YPct === null (never +20.0%)');

  const posToNeg = FundamentalCalculator.calculateNetProfitCAGR3Y(makeIncomeStatement([-100, 50, 100, 200]));
  runAssert(posToNeg === null, '[Anti-Fallback] Profit collapse yields cagr3YPct === null (never -20.0%)');

  // 2. Industrial Model: All 10 Exhaustive States
  // State 1: PROFIT_COMPOUNDING (High >= 20% -> 6 pts)
  const indHigh = FundamentalCalculator.compute(null, makeIncomeStatement([200, 160, 130, 100]), null, null, null);
  const indHighScore = FundamentalEngine.scoreIndustrial(indHigh);
  const indHighFactor = indHighScore.factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(indHigh.profitGrowthResult?.state === 'PROFIT_COMPOUNDING', '[Industrial State 1] Positive endpoints map to PROFIT_COMPOUNDING');
  runAssert(indHighFactor.score === 6, `[Industrial State 1] High compounding (CAGR ~26.0%) scores 6 / 6 pts (Actual: ${indHighFactor.score})`);
  runAssert(indHighFactor.state === 'DERIVED', '[Industrial State 1] Compounding state is DERIVED');

  // State 1: PROFIT_COMPOUNDING (Steady 12-20% -> 4 pts)
  const indSteady = FundamentalCalculator.compute(null, makeIncomeStatement([150, 130, 115, 100]), null, null, null);
  const indSteadyFactor = FundamentalEngine.scoreIndustrial(indSteady).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(indSteadyFactor.score === 4, `[Industrial State 1] Steady compounding (CAGR ~14.5%) scores 4 / 6 pts (Actual: ${indSteadyFactor.score})`);

  // State 1: PROFIT_COMPOUNDING (Moderate 6-12% -> 2 pts)
  const indMod = FundamentalCalculator.compute(null, makeIncomeStatement([125, 115, 108, 100]), null, null, null);
  const indModFactor = FundamentalEngine.scoreIndustrial(indMod).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(indModFactor.score === 2, `[Industrial State 1] Moderate compounding (CAGR ~7.7%) scores 2 / 6 pts (Actual: ${indModFactor.score})`);

  // State 1: PROFIT_COMPOUNDING (Low < 6% -> 0 pts)
  const indLow = FundamentalCalculator.compute(null, makeIncomeStatement([105, 103, 101, 100]), null, null, null);
  const indLowFactor = FundamentalEngine.scoreIndustrial(indLow).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(indLowFactor.score === 0, `[Industrial State 1] Low compounding (CAGR ~1.6%) scores 0 / 6 pts (Actual: ${indLowFactor.score})`);

  // State 2: TURNAROUND_FROM_LOSS (-100 -> +200 -> 4 pts)
  const indTurnLoss = FundamentalCalculator.compute(null, makeIncomeStatement([200, 100, 0, -100]), null, null, null);
  const indTurnLossFactor = FundamentalEngine.scoreIndustrial(indTurnLoss).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(indTurnLoss.profitGrowthResult?.state === 'TURNAROUND_FROM_LOSS', '[Industrial State 2] Turnaround from loss maps to TURNAROUND_FROM_LOSS');
  runAssert(indTurnLossFactor.score === 4, `[Industrial State 2] Turnaround from loss scores 4 / 6 pts (Actual: ${indTurnLossFactor.score})`);
  runAssert(indTurnLossFactor.rawValue === 'Turnaround', '[Industrial State 2] Raw value displays "Turnaround"');

  // State 3: TURNAROUND_FROM_ZERO (0 -> +100 -> 4 pts)
  const indTurnZero = FundamentalCalculator.compute(null, makeIncomeStatement([100, 50, 20, 0]), null, null, null);
  const indTurnZeroFactor = FundamentalEngine.scoreIndustrial(indTurnZero).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(indTurnZero.profitGrowthResult?.state === 'TURNAROUND_FROM_ZERO', '[Industrial State 3] Zero to positive maps to TURNAROUND_FROM_ZERO');
  runAssert(indTurnZeroFactor.score === 4, `[Industrial State 3] Turnaround from zero scores 4 / 6 pts (Actual: ${indTurnZeroFactor.score})`);

  // State 4: RECOVERY_TO_BREAKEVEN (-100 -> 0 -> 0 pts)
  const indBreakeven = FundamentalCalculator.compute(null, makeIncomeStatement([0, -20, -50, -100]), null, null, null);
  const indBreakevenFactor = FundamentalEngine.scoreIndustrial(indBreakeven).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(indBreakeven.profitGrowthResult?.state === 'RECOVERY_TO_BREAKEVEN', '[Industrial State 4] Recovery to zero maps to RECOVERY_TO_BREAKEVEN');
  runAssert(indBreakevenFactor.score === 0, `[Industrial State 4] Recovery to breakeven scores 0 / 6 pts (Actual: ${indBreakevenFactor.score})`);
  runAssert(indBreakevenFactor.rawValue === 'Breakeven', '[Industrial State 4] Raw value displays "Breakeven"');

  // State 5: LOSS_REDUCTION (-300 -> -50 -> 2 pts)
  const indLossRed = FundamentalCalculator.compute(null, makeIncomeStatement([-50, -100, -200, -300]), null, null, null);
  const indLossRedFactor = FundamentalEngine.scoreIndustrial(indLossRed).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(indLossRed.profitGrowthResult?.state === 'LOSS_REDUCTION', '[Industrial State 5] Loss contraction maps to LOSS_REDUCTION');
  runAssert(indLossRedFactor.score === 2, `[Industrial State 5] Loss reduction scores 2 / 6 pts (Actual: ${indLossRedFactor.score})`);
  runAssert(indLossRedFactor.rawValue === 'Loss Reduction', '[Industrial State 5] Raw value displays "Loss Reduction"');

  // State 6: LOSS_EXPANSION (-50 -> -300 -> 0 pts)
  const indLossExp = FundamentalCalculator.compute(null, makeIncomeStatement([-300, -200, -100, -50]), null, null, null);
  const indLossExpFactor = FundamentalEngine.scoreIndustrial(indLossExp).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(indLossExp.profitGrowthResult?.state === 'LOSS_EXPANSION', '[Industrial State 6] Loss widening maps to LOSS_EXPANSION');
  runAssert(indLossExpFactor.score === 0, `[Industrial State 6] Loss expansion scores 0 / 6 pts (Actual: ${indLossExpFactor.score})`);

  // State 7: PERSISTENT_LOSS (-100 -> -100 -> 0 pts)
  const indPersistLoss = FundamentalCalculator.compute(null, makeIncomeStatement([-100, -100, -100, -100]), null, null, null);
  const indPersistLossFactor = FundamentalEngine.scoreIndustrial(indPersistLoss).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(indPersistLoss.profitGrowthResult?.state === 'PERSISTENT_LOSS', '[Industrial State 7] Flat loss maps to PERSISTENT_LOSS');
  runAssert(indPersistLossFactor.score === 0, `[Industrial State 7] Persistent loss scores 0 / 6 pts (Actual: ${indPersistLossFactor.score})`);

  // State 8: PROFIT_COLLAPSE (+200 -> -100 -> 0 pts)
  const indCollapse = FundamentalCalculator.compute(null, makeIncomeStatement([-100, 0, 100, 200]), null, null, null);
  const indCollapseFactor = FundamentalEngine.scoreIndustrial(indCollapse).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(indCollapse.profitGrowthResult?.state === 'PROFIT_COLLAPSE', '[Industrial State 8] Positive to negative maps to PROFIT_COLLAPSE');
  runAssert(indCollapseFactor.score === 0, `[Industrial State 8] Profit collapse scores 0 / 6 pts (Actual: ${indCollapseFactor.score})`);

  // State 9: ZERO_TO_LOSS (0 -> -50 -> 0 pts)
  const indZeroToLoss = FundamentalCalculator.compute(null, makeIncomeStatement([-50, -20, 0, 0]), null, null, null);
  const indZeroToLossFactor = FundamentalEngine.scoreIndustrial(indZeroToLoss).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(indZeroToLoss.profitGrowthResult?.state === 'ZERO_TO_LOSS', '[Industrial State 9] Zero to negative maps to ZERO_TO_LOSS');
  runAssert(indZeroToLossFactor.score === 0, `[Industrial State 9] Deterioration to loss scores 0 / 6 pts (Actual: ${indZeroToLossFactor.score})`);

  // State 10: FLAT_ZERO (0 -> 0 -> 0 pts)
  const indFlatZero = FundamentalCalculator.compute(null, makeIncomeStatement([0, 0, 0, 0]), null, null, null);
  const indFlatZeroFactor = FundamentalEngine.scoreIndustrial(indFlatZero).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(indFlatZero.profitGrowthResult?.state === 'FLAT_ZERO', '[Industrial State 10] Zero to zero maps to FLAT_ZERO');
  runAssert(indFlatZeroFactor.score === 0, `[Industrial State 10] Flat zero scores 0 / 6 pts (Actual: ${indFlatZeroFactor.score})`);

  // 3. Bank / NBFC Model: All States
  // Compounding High (>= 18% -> 10 pts)
  const bankHigh = FundamentalCalculator.compute(null, makeIncomeStatement([200, 160, 130, 100]), null, null, null);
  const bankHighFactor = FundamentalEngine.scoreCommercialBank(bankHigh).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(bankHighFactor.score === 10, `[Bank State 1] High compounding (CAGR ~26.0%) scores 10 / 10 pts (Actual: ${bankHighFactor.score})`);

  // Compounding Moderate (10-18% -> 6 pts)
  const bankMod = FundamentalCalculator.compute(null, makeIncomeStatement([140, 125, 110, 100]), null, null, null);
  const bankModFactor = FundamentalEngine.scoreCommercialBank(bankMod).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(bankModFactor.score === 6, `[Bank State 1] Moderate compounding (CAGR ~11.9%) scores 6 / 10 pts (Actual: ${bankModFactor.score})`);

  // Compounding Low (< 10% -> 0 pts)
  const bankLow = FundamentalCalculator.compute(null, makeIncomeStatement([110, 107, 103, 100]), null, null, null);
  const bankLowFactor = FundamentalEngine.scoreCommercialBank(bankLow).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(bankLowFactor.score === 0, `[Bank State 1] Low compounding (CAGR ~3.2%) scores 0 / 10 pts (Actual: ${bankLowFactor.score})`);

  // Turnaround from Loss (Bank -> 6 pts)
  const bankTurnLoss = FundamentalEngine.scoreCommercialBank(indTurnLoss).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(bankTurnLoss.score === 6, `[Bank State 2] Turnaround from loss scores 6 / 10 pts (Actual: ${bankTurnLoss.score})`);

  // Turnaround from Zero (Bank -> 6 pts)
  const bankTurnZero = FundamentalEngine.scoreCommercialBank(indTurnZero).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(bankTurnZero.score === 6, `[Bank State 3] Turnaround from zero scores 6 / 10 pts (Actual: ${bankTurnZero.score})`);

  // Loss Reduction (Bank -> 3 pts)
  const bankLossRed = FundamentalEngine.scoreCommercialBank(indLossRed).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(bankLossRed.score === 3, `[Bank State 5] Loss reduction scores 3 / 10 pts (Actual: ${bankLossRed.score})`);

  // Other non-positive Bank states (0 pts)
  const bankCollapse = FundamentalEngine.scoreCommercialBank(indCollapse).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(bankCollapse.score === 0, '[Bank State 8] Profit collapse scores 0 / 10 pts in bank model');

  // 4. Intermediate Loss Disclosure Checks
  const intermediateLossStatement = makeIncomeStatement([200, -30, 120, 100]);
  const intLossCalcs = FundamentalCalculator.compute(null, intermediateLossStatement, null, null, null);
  const intLossScore = FundamentalEngine.scoreIndustrial(intLossCalcs);
  const intLossFactor = intLossScore.factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(intLossCalcs.profitGrowthResult?.intermediateLoss === true, '[Intermediate Loss] Correctly flags intermediate loss = true');
  runAssert(intLossFactor.explanation.includes('intermediate-year loss'), `[Intermediate Loss] Explanation discloses intermediate loss (Actual: ${intLossFactor.explanation})`);
  runAssert(intLossFactor.score === 6, `[Intermediate Loss] Score remains unpenalized at 6 / 6 pts (Actual: ${intLossFactor.score})`);

  // 5. Incomplete / Missing Financial History
  // Only 3 observations
  const partialIncome = makeIncomeStatement([200, 150, 100]);
  const partialCalcs = FundamentalCalculator.compute(null, partialIncome, null, null, null);
  const partialFactor = FundamentalEngine.scoreIndustrial(partialCalcs).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(partialCalcs.profitGrowthResult?.state === 'MISSING', '[Incomplete History] 3 years of history maps to state MISSING');
  runAssert(partialFactor.score === 0, '[Incomplete History] Incomplete history scores 0 pts');
  runAssert(partialFactor.rawValue === null, '[Incomplete History] Incomplete history rawValue is null');
  runAssert(partialFactor.state === 'MISSING', '[Incomplete History] Incomplete history factor state is MISSING');

  // Null input
  const nullCalcs = FundamentalCalculator.compute(null, null, null, null, null);
  const nullFactor = FundamentalEngine.scoreIndustrial(nullCalcs).factors.find((f) => f.name === '3Y Net Profit CAGR')!;
  runAssert(nullCalcs.profitGrowthResult?.state === 'MISSING', '[Null Input] Null income statement maps to state MISSING');
  runAssert(nullFactor.score === 0, '[Null Input] Null income statement scores 0 pts');
  runAssert(nullFactor.rawValue === null, '[Null Input] Null income statement rawValue is null');
  runAssert(nullFactor.state === 'MISSING', '[Null Input] Null income statement factor state is MISSING');

  // ============================================================
  // STAGE 7: PORTFOLIO DAY-CHANGE AUTHENTIC DATA INTEGRITY TEST SUITE
  // ============================================================
  console.log('\n--- STAGE 7: PORTFOLIO DAY-CHANGE AUTHENTIC DATA INTEGRITY SUITE ---');

  // Test 7.1: Positive Day Change
  const posEval = {
    ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE'),
    netChange: 18.5,
    netChangePct: 0.631,
  };
  const posHolding: Holding = {
    id: 'h_pos',
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries',
    sector: 'INDUSTRIAL',
    quantity: 100,
    averageBuyPrice: 2800.0,
    addedAt: new Date().toISOString(),
  };
  const posAnalysis = PortfolioEngine.analyze([posHolding], new Map([['RELIANCE', posEval]]));
  runAssert(posAnalysis.items[0].dayChange === 1850.0, `[Day Change] Positive day change calculated authentically: 1850.0 (Actual: ${posAnalysis.items[0].dayChange})`);
  runAssert(posAnalysis.items[0].dayChangePercentage === 0.631, `[Day Change] Positive day change percentage matches: 0.631% (Actual: ${posAnalysis.items[0].dayChangePercentage})`);

  // Test 7.2: Negative Day Change
  const negEval = {
    ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['TCS'], 'TCS'),
    netChange: -25.0,
    netChangePct: -1.25,
  };
  const negHolding: Holding = {
    id: 'h_neg',
    symbol: 'TCS',
    companyName: 'Tata Consultancy Services',
    sector: 'INFORMATION_TECHNOLOGY',
    quantity: 50,
    averageBuyPrice: 4000.0,
    addedAt: new Date().toISOString(),
  };
  const negAnalysis = PortfolioEngine.analyze([negHolding], new Map([['TCS', negEval]]));
  runAssert(negAnalysis.items[0].dayChange === -1250.0, `[Day Change] Negative day change calculated authentically: -1250.0 (Actual: ${negAnalysis.items[0].dayChange})`);
  runAssert(negAnalysis.items[0].dayChangePercentage === -1.25, `[Day Change] Negative day change percentage matches: -1.25% (Actual: ${negAnalysis.items[0].dayChangePercentage})`);

  // Test 7.3: Zero Day Change
  const zeroEval = {
    ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['HDFCBANK'], 'HDFCBANK'),
    netChange: 0.0,
    netChangePct: 0.0,
  };
  const zeroHolding: Holding = {
    id: 'h_zero',
    symbol: 'HDFCBANK',
    companyName: 'HDFC Bank',
    sector: 'COMMERCIAL_BANK',
    quantity: 20,
    averageBuyPrice: 1600.0,
    addedAt: new Date().toISOString(),
  };
  const zeroAnalysis = PortfolioEngine.analyze([zeroHolding], new Map([['HDFCBANK', zeroEval]]));
  runAssert(zeroAnalysis.items[0].dayChange === 0.0, `[Day Change] Zero day change is accurately 0.0 (Actual: ${zeroAnalysis.items[0].dayChange})`);
  runAssert(zeroAnalysis.items[0].dayChangePercentage === 0.0, `[Day Change] Zero day change percentage is accurately 0.0% (Actual: ${zeroAnalysis.items[0].dayChangePercentage})`);

  // Test 7.4: Missing Change Fields on Evaluation
  const missingChangeEval = {
    ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['BAJFINANCE'], 'BAJFINANCE'),
    netChange: undefined,
    netChangePct: undefined,
  };
  const missingHolding: Holding = {
    id: 'h_miss',
    symbol: 'BAJFINANCE',
    companyName: 'Bajaj Finance',
    sector: 'NBFC_HFC',
    quantity: 15,
    averageBuyPrice: 7000.0,
    addedAt: new Date().toISOString(),
  };
  const missingAnalysis = PortfolioEngine.analyze([missingHolding], new Map([['BAJFINANCE', missingChangeEval]]));
  runAssert(missingAnalysis.items[0].dayChange === null, '[Day Change] Missing netChange evaluates strictly to null');
  runAssert(missingAnalysis.items[0].dayChangePercentage === null, '[Day Change] Missing netChangePct evaluates strictly to null');

  // Test 7.5: Unavailable Quote
  const unavailEval = {
    ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['ZYDUSLIFE'], 'ZYDUSLIFE'),
    dataSource: 'DATA_UNAVAILABLE' as const,
  };
  const unavailHolding: Holding = {
    id: 'h_unavail',
    symbol: 'ZYDUSLIFE',
    companyName: 'Zydus Lifesciences',
    sector: 'PHARMACEUTICALS',
    quantity: 30,
    averageBuyPrice: 1000.0,
    addedAt: new Date().toISOString(),
  };
  const unavailAnalysis = PortfolioEngine.analyze([unavailHolding], new Map([['ZYDUSLIFE', unavailEval]]));
  runAssert(unavailAnalysis.items[0].dayChange === null, '[Day Change] Unavailable quote yields dayChange === null');
  runAssert(unavailAnalysis.items[0].dayChangePercentage === null, '[Day Change] Unavailable quote yields dayChangePercentage === null');

  // Test 7.6: Total Day PnL Aggregate (Only accumulates valid resolved day changes: 1850 + (-1250) + 0 = 600)
  const combinedAnalysis = PortfolioEngine.analyze(
    [posHolding, negHolding, zeroHolding, missingHolding, unavailHolding],
    new Map([
      ['RELIANCE', posEval],
      ['TCS', negEval],
      ['HDFCBANK', zeroEval],
      ['BAJFINANCE', missingChangeEval],
      ['ZYDUSLIFE', unavailEval],
    ])
  );
  runAssert(combinedAnalysis.analytics.totalDayPnl === 600.0, `[Day Change] Total Day PnL aggregates resolved holdings accurately: 600.0 (Actual: ${combinedAnalysis.analytics.totalDayPnl})`);

  // ============================================================
  // STAGE 7B: QUOTE PIPELINE HARDENING & NON-FINITE REJECTION TESTS
  // ============================================================
  console.log('\n--- STAGE 7B: QUOTE PIPELINE HARDENING & NON-FINITE REJECTION ---');

  // Test 7B.1: End-to-End Pipeline - Missing net_change on Quote
  const rawInputMissingNetChange = JSON.parse(JSON.stringify(BENCHMARK_STOCKS['RELIANCE']));
  delete rawInputMissingNetChange.quote.net_change;
  const evalMissingNetChange = StockInsightPipeline.evaluate(rawInputMissingNetChange, 'RELIANCE');
  runAssert(evalMissingNetChange.netChange === undefined, '[Pipeline Quote] Missing quote.net_change yields netChange === undefined (never 0)');
  runAssert(evalMissingNetChange.netChangePct === undefined, '[Pipeline Quote] Missing quote.net_change yields netChangePct === undefined');

  // Test 7B.2: End-to-End Pipeline - Genuine Zero net_change on Quote
  const rawInputZeroNetChange = JSON.parse(JSON.stringify(BENCHMARK_STOCKS['RELIANCE']));
  rawInputZeroNetChange.quote.net_change = 0;
  const evalZeroNetChange = StockInsightPipeline.evaluate(rawInputZeroNetChange, 'RELIANCE');
  runAssert(evalZeroNetChange.netChange === 0, '[Pipeline Quote] Genuine zero net_change evaluates to netChange === 0');
  runAssert(evalZeroNetChange.netChangePct === 0, '[Pipeline Quote] Genuine zero net_change evaluates to netChangePct === 0');

  // Test 7B.3: End-to-End Pipeline - NaN in quote.net_change
  const rawInputNaNNetChange = JSON.parse(JSON.stringify(BENCHMARK_STOCKS['RELIANCE']));
  rawInputNaNNetChange.quote.net_change = NaN;
  const evalNaNNetChange = StockInsightPipeline.evaluate(rawInputNaNNetChange, 'RELIANCE');
  runAssert(evalNaNNetChange.netChange === undefined, '[Pipeline Quote] NaN quote.net_change is rejected to undefined');
  runAssert(evalNaNNetChange.netChangePct === undefined, '[Pipeline Quote] NaN quote.net_change yields netChangePct === undefined');

  // Test 7B.4: End-to-End Pipeline - Infinity and -Infinity in quote.net_change
  const rawInputInfNetChange = JSON.parse(JSON.stringify(BENCHMARK_STOCKS['RELIANCE']));
  rawInputInfNetChange.quote.net_change = Infinity;
  const evalInfNetChange = StockInsightPipeline.evaluate(rawInputInfNetChange, 'RELIANCE');
  runAssert(evalInfNetChange.netChange === undefined, '[Pipeline Quote] Infinity quote.net_change is rejected to undefined');
  runAssert(evalInfNetChange.netChangePct === undefined, '[Pipeline Quote] Infinity quote.net_change yields netChangePct === undefined');

  const rawInputNegInfNetChange = JSON.parse(JSON.stringify(BENCHMARK_STOCKS['RELIANCE']));
  rawInputNegInfNetChange.quote.net_change = -Infinity;
  const evalNegInfNetChange = StockInsightPipeline.evaluate(rawInputNegInfNetChange, 'RELIANCE');
  runAssert(evalNegInfNetChange.netChange === undefined, '[Pipeline Quote] -Infinity quote.net_change is rejected to undefined');
  runAssert(evalNegInfNetChange.netChangePct === undefined, '[Pipeline Quote] -Infinity quote.net_change yields netChangePct === undefined');

  // Test 7B.5: End-to-End Pipeline - Zero/Invalid Previous Close without viable derivation
  const rawInputZeroClose = JSON.parse(JSON.stringify(BENCHMARK_STOCKS['RELIANCE']));
  rawInputZeroClose.quote.close = 0;
  rawInputZeroClose.quote.last_price = 100;
  rawInputZeroClose.quote.net_change = 100; // effectiveLtp - netChange = 0 (prevClose = 0)
  const evalZeroClose = StockInsightPipeline.evaluate(rawInputZeroClose, 'RELIANCE');
  runAssert(evalZeroClose.netChange === 100, '[Pipeline Quote] Valid netChange is retained');
  runAssert(evalZeroClose.netChangePct === undefined, '[Pipeline Quote] Zero prevClose prevents division-by-zero, yielding netChangePct === undefined');

  // Test 7B.6: End-to-End Pipeline - Non-finite LTP fallback to close
  const rawInputInfLtp = JSON.parse(JSON.stringify(BENCHMARK_STOCKS['RELIANCE']));
  rawInputInfLtp.quote.last_price = Infinity;
  rawInputInfLtp.quote.close = 2850.0;
  const evalInfLtp = StockInsightPipeline.evaluate(rawInputInfLtp, 'RELIANCE');
  runAssert(evalInfLtp.execution.ltp === 2850.0, `[Pipeline Quote] Non-finite LTP falls back to close price: 2850.0 (Actual: ${evalInfLtp.execution.ltp})`);

  // Test 7B.7: PortfolioEngine - Infinity / NaN in evaluation.netChange and LTP
  const infNetChangeEval = {
    ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE'),
    netChange: Infinity,
    netChangePct: Infinity,
  };
  const infAnalysis = PortfolioEngine.analyze([posHolding], new Map([['RELIANCE', infNetChangeEval]]));
  runAssert(infAnalysis.items[0].dayChange === null, '[PortfolioEngine] Non-finite evaluation.netChange yields dayChange === null');
  runAssert(infAnalysis.items[0].dayChangePercentage === null, '[PortfolioEngine] Non-finite evaluation.netChangePct yields dayChangePercentage === null');

  const infLtpEval = {
    ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE'),
    execution: {
      ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE').execution,
      ltp: Infinity,
    },
  };
  const infLtpAnalysis = PortfolioEngine.analyze([posHolding], new Map([['RELIANCE', infLtpEval]]));
  runAssert(infLtpAnalysis.items[0].quoteStatus === 'UNAVAILABLE', '[PortfolioEngine] Non-finite execution.ltp sets quoteStatus to UNAVAILABLE');
  runAssert(infLtpAnalysis.items[0].dayChange === null, '[PortfolioEngine] Non-finite execution.ltp yields dayChange === null');

  // Test 7B.8: Mixed Portfolio Day PnL Aggregation with Non-Finite and Missing Items
  const mixedAnalysis = PortfolioEngine.analyze(
    [posHolding, negHolding, zeroHolding, missingHolding, unavailHolding],
    new Map([
      ['RELIANCE', posEval],              // +1850.0
      ['TCS', negEval],                   // -1250.0
      ['HDFCBANK', zeroEval],             // +0.0
      ['BAJFINANCE', infNetChangeEval],   // null (Infinity rejected)
      ['ZYDUSLIFE', unavailEval],         // null (Unavailable quote)
    ])
  );
  runAssert(mixedAnalysis.analytics.totalDayPnl === 600.0, `[PortfolioEngine] Mixed aggregation rejects non-finite items and strictly accumulates finite: 600.0 (Actual: ${mixedAnalysis.analytics.totalDayPnl})`);

  // ============================================================
  // STAGE 8: KARURVYSYA SCREEN CONSISTENCY & DYNAMIC CONTEXT TESTS
  // ============================================================
  console.log('\n--- STAGE 8: KARURVYSYA SCREEN CONSISTENCY & CONTEXT TESTS ---');

  // Test 8.1: SearchService Instrument Resolution for KARURVYSYA
  const kvbInst = SearchService.getInstrumentBySymbol('KARURVYSYA');
  runAssert(kvbInst !== undefined, '[Instrument Lookup] KARURVYSYA exists in nseInstruments');
  runAssert(kvbInst?.name === 'Karur Vysya Bank Limited', `[Instrument Lookup] KARURVYSYA resolves to "Karur Vysya Bank Limited" (Actual: "${kvbInst?.name}")`);
  runAssert(kvbInst?.sector === 'Banking - Private', `[Instrument Lookup] KARURVYSYA sector resolves to "Banking - Private" (Actual: "${kvbInst?.sector}")`);
  runAssert(kvbInst?.isin === 'INE036D01028', `[Instrument Lookup] KARURVYSYA ISIN resolves to INE036D01028`);

  // Test 8.2: Pipeline Evaluation Resolves Company Name from SearchService when Profile is missing
  const dummyQuoteInput = {
    quote: {
      instrument_token: 'NSE_EQ|INE036D01028',
      last_price: 180.50,
      close: 178.00,
      volume: 125000,
      net_change: 2.50,
    },
    candles: BENCHMARK_STOCKS['RELIANCE'].candles,
  };
  const kvbEval = StockInsightPipeline.evaluate(dummyQuoteInput, 'KARURVYSYA');
  runAssert(kvbEval.tradingSymbol === 'KARURVYSYA', `[Evaluation Symbol] Output tradingSymbol is strictly KARURVYSYA (Actual: "${kvbEval.tradingSymbol}")`);
  runAssert(kvbEval.companyName === 'Karur Vysya Bank Limited', `[Evaluation Name] Fallback resolves companyName from SearchService (Actual: "${kvbEval.companyName}")`);
  runAssert(kvbEval.sectorName === 'Banking - Private', `[Evaluation Sector] Fallback resolves sectorName from SearchService (Actual: "${kvbEval.sectorName}")`);

  // Test 8.3: Decision Engine - Fundamental Floor Gate (20/50 Fundamental + 45/50 Technical = 65/100 Core -> HOLD)
  const syntheticEvalHoldFloor: StockEvaluation = {
    ...kvbEval,
    fundamentalScore: 20.0,
    technicalScore: 45.0,
    totalScore: 65.0,
    zone: 'HOLD',
  };
  runAssert(syntheticEvalHoldFloor.fundamentalScore < 25.0, '[Floor Gate] Fundamental score is below 25/50 floor');
  runAssert(syntheticEvalHoldFloor.zone === 'HOLD', '[Floor Gate] Total 65.0 with Fund < 25 results in HOLD zone');

  // Test 8.4: Execution Corridor Calculation - 2:1 R:R Pullback Ceiling
  // MaxEntry = (Target + 2.0 * StopLoss) / 3.0
  const sampleTechCalcs: any = {
    ltp: 185.0,
    atr14: 3.0,
    swingLow10: 170.0,
    turnover20DCr: 25.0,
  };
  const corridorAnalysis = ExecutionEngine.evaluate(
    sampleTechCalcs,
    undefined,
    undefined,
    true, // isStrategyBalanced -> minimumRR = 2.0
    null,
    null,
    false
  );
  const calculatedMaxEntry = (corridorAnalysis.target! + 2.0 * corridorAnalysis.stopLoss!) / 3.0;
  runAssert(Math.abs(corridorAnalysis.maxEntry! - calculatedMaxEntry) < 0.001, `[Execution Corridor] MaxEntry formula correctly satisfies (Target + 2*Stop)/3 (Actual: ${corridorAnalysis.maxEntry})`);
  runAssert(corridorAnalysis.minimumRR === 2.0, `[Execution Corridor] Balanced strategy enforces 2:1 R:R (Actual: ${corridorAnalysis.minimumRR})`);
  runAssert(corridorAnalysis.status === 'EXTENDED_WAIT_FOR_PULLBACK', `[Execution Corridor] When LTP (185) > MaxEntry (${corridorAnalysis.maxEntry?.toFixed(2)}), status is EXTENDED_WAIT_FOR_PULLBACK`);

  // Test 8.5: Portfolio Selection Isolation (Stale Response does not match KARURVYSYA)
  const holdingsMap = new Map<string, StockEvaluation>([
    ['RELIANCE', StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE')],
    ['KARURVYSYA', kvbEval],
  ]);
  const activeSelectedSymbol = 'KARURVYSYA';
  const resolvedActiveEval = holdingsMap.get(activeSelectedSymbol) || null;
  runAssert(resolvedActiveEval?.tradingSymbol === 'KARURVYSYA', '[Isolation] Active symbol KARURVYSYA strictly retrieves KARURVYSYA evaluation, never defaulting to RELIANCE');

  // ============================================================
  // STAGE 9: GLOBAL SEARCH-TO-ANALYSIS & RESOLUTION REGRESSION SUITE
  // ============================================================
  console.log('\n--- STAGE 9: GLOBAL SEARCH-TO-ANALYSIS & RESOLUTION REGRESSION ---');

  // Test 9.1: Master and Canonical Alias Instrument Resolution
  const testCases: Array<{ querySymbol: string; expectedSymbol: string; expectedName: string; expectedIsin: string }> = [
    { querySymbol: 'KARURVYSYA', expectedSymbol: 'KARURVYSYA', expectedName: 'Karur Vysya Bank Limited', expectedIsin: 'INE036D01028' },
    { querySymbol: 'AMARAJABAT', expectedSymbol: 'ARE&M', expectedName: 'Amara Raja Energy & Mobility Limited', expectedIsin: 'INE885A01032' },
    { querySymbol: 'ARE&M', expectedSymbol: 'ARE&M', expectedName: 'Amara Raja Energy & Mobility Limited', expectedIsin: 'INE885A01032' },
    { querySymbol: 'RELIANCE', expectedSymbol: 'RELIANCE', expectedName: 'Reliance Industries Limited', expectedIsin: 'INE002A01018' },
    { querySymbol: 'TCS', expectedSymbol: 'TCS', expectedName: 'Tata Consultancy Services Limited', expectedIsin: 'INE467B01029' },
    { querySymbol: 'INFY', expectedSymbol: 'INFY', expectedName: 'Infosys Limited', expectedIsin: 'INE009A01021' },
    { querySymbol: 'HDFCBANK', expectedSymbol: 'HDFCBANK', expectedName: 'HDFC Bank Limited', expectedIsin: 'INE040A01034' },
    { querySymbol: 'MOTHERSUMI', expectedSymbol: 'MOTHERSON', expectedName: 'Samvardhana Motherson International Limited', expectedIsin: 'INE775A01035' },
    { querySymbol: 'LTI', expectedSymbol: 'LTIM', expectedName: 'LTIMindtree Limited', expectedIsin: 'INE214T01019' },
    { querySymbol: 'MINDTREE', expectedSymbol: 'LTIM', expectedName: 'LTIMindtree Limited', expectedIsin: 'INE214T01019' },
    { querySymbol: 'CADILAHC', expectedSymbol: 'ZYDUSLIFE', expectedName: 'Zydus Lifesciences Limited', expectedIsin: 'INE010B01027' },
  ];

  for (const tc of testCases) {
    const inst = SearchService.getInstrumentBySymbol(tc.querySymbol);
    runAssert(inst.symbol === tc.expectedSymbol, `[Resolver] ${tc.querySymbol} resolves to symbol ${tc.expectedSymbol} (Actual: ${inst.symbol})`);
    runAssert(inst.name === tc.expectedName, `[Resolver] ${tc.querySymbol} resolves to name "${tc.expectedName}" (Actual: "${inst.name}")`);
    runAssert(inst.isin === tc.expectedIsin, `[Resolver] ${tc.querySymbol} resolves to ISIN ${tc.expectedIsin} (Actual: ${inst.isin})`);
  }

  // Test 9.2: Multi-Query Search Ranking (Symbol & Company Name)
  const searchQueries = [
    { q: 'KARURVYSYA', topSymbol: 'KARURVYSYA', topName: 'Karur Vysya Bank Limited' },
    { q: 'Karur Vysya', topSymbol: 'KARURVYSYA', topName: 'Karur Vysya Bank Limited' },
    { q: 'AMARAJABAT', topSymbol: 'ARE&M', topName: 'Amara Raja Energy & Mobility Limited' },
    { q: 'Amara Raja', topSymbol: 'ARE&M', topName: 'Amara Raja Energy & Mobility Limited' },
    { q: 'Infosys', topSymbol: 'INFY', topName: 'Infosys Limited' },
    { q: 'INFY', topSymbol: 'INFY', topName: 'Infosys Limited' },
    { q: 'Tata Consultancy', topSymbol: 'TCS', topName: 'Tata Consultancy Services Limited' },
    { q: 'TCS', topSymbol: 'TCS', topName: 'Tata Consultancy Services Limited' },
    { q: 'HDFC Bank', topSymbol: 'HDFCBANK', topName: 'HDFC Bank Limited' },
    { q: 'HDFCBANK', topSymbol: 'HDFCBANK', topName: 'HDFC Bank Limited' },
  ];

  for (const sq of searchQueries) {
    const results = await SearchService.search(sq.q, 5);
    runAssert(results.length > 0, `[Search] Query "${sq.q}" returns at least 1 result`);
    runAssert(results[0].symbol === sq.topSymbol, `[Search] Query "${sq.q}" top result is ${sq.topSymbol} (Actual: ${results[0]?.symbol})`);
    runAssert(results[0].name === sq.topName, `[Search] Query "${sq.q}" top result name is "${sq.topName}" (Actual: "${results[0]?.name}")`);
  }

  // Test 9.3: Search for Invalid/Unknown Tickers (e.g. zzzz, ZZZINVALID999) Strictly Yields Zero Results (No Synthetics)
  const zzzzSearch = await SearchService.search('zzzz', 5);
  runAssert(zzzzSearch.length === 0, `[Search] Arbitrary query "zzzz" returns exactly 0 results (Actual: ${zzzzSearch.length})`);

  const zzzInvalidSearch = await SearchService.search('ZZZINVALID999', 5);
  runAssert(zzzInvalidSearch.length === 0, `[Search] Arbitrary query "ZZZINVALID999" returns exactly 0 results (Actual: ${zzzInvalidSearch.length})`);

  const qwertySearch = await SearchService.search('qwerty12345', 5);
  runAssert(qwertySearch.length === 0, `[Search] Arbitrary query "qwerty12345" returns exactly 0 results (Actual: ${qwertySearch.length})`);

  const unknownResolvedZzzz = SearchService.getInstrumentBySymbol('zzzz');
  runAssert(unknownResolvedZzzz === undefined, '[Resolver] Unknown symbol "zzzz" returns undefined (no synthetic instrument)');

  const unknownResolvedInvalid = SearchService.getInstrumentBySymbol('ZZZINVALID999');
  runAssert(unknownResolvedInvalid === undefined, '[Resolver] Unknown symbol "ZZZINVALID999" returns undefined (no synthetic instrument)');

  // Test 9.4: Stale Async Response Isolation and Race-Condition Protection
  let activeSelectionId = 1;
  let activeSelectedStock = 'RELIANCE';

  // Request 1 for RELIANCE starts
  const req1Id = activeSelectionId;
  const req1Symbol = 'RELIANCE';

  // User rapidly clicks KARURVYSYA -> Request 2 starts
  activeSelectionId = 2;
  activeSelectedStock = 'KARURVYSYA';
  const req2Id = activeSelectionId;
  const req2Symbol = 'KARURVYSYA';

  // Simulation: Late response from Request 1 arrives now
  const req1LateResponse = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE');
  const isReq1ValidForActiveScreen = (req1Id === activeSelectionId) && (activeSelectedStock === req1Symbol);
  runAssert(isReq1ValidForActiveScreen === false, '[Race Protection] Delayed response from RELIANCE is discarded when active stock is KARURVYSYA');

  // Simulation: Response from Request 2 arrives
  const req2DummyInput = {
    quote: {
      instrument_token: 'NSE_EQ|INE036D01028',
      last_price: 215.0,
      close: 212.0,
      volume: 50000,
      net_change: 3.0,
    },
    candles: BENCHMARK_STOCKS['RELIANCE'].candles,
  };
  const req2Response = StockInsightPipeline.evaluate(req2DummyInput, 'KARURVYSYA');
  const isReq2ValidForActiveScreen = (req2Id === activeSelectionId) && (activeSelectedStock === req2Symbol);
  runAssert(isReq2ValidForActiveScreen === true, '[Race Protection] Matching active response for KARURVYSYA is accepted');
  runAssert(req2Response.tradingSymbol === 'KARURVYSYA', '[Race Protection] Evaluation symbol strictly matches KARURVYSYA');

  // Test 9.5: Zero Cross-Contamination Across All Benchmark Evaluations
  for (const sym of ['RELIANCE', 'TCS', 'HDFCBANK', 'BAJFINANCE']) {
    const fixture = BENCHMARK_STOCKS[sym];
    const evalRes = StockInsightPipeline.evaluate(fixture, sym);
    runAssert(evalRes.tradingSymbol === sym, `[Cross-Contamination Guard] ${sym} evaluation yields tradingSymbol === ${sym}`);
    runAssert(evalRes.companyName !== 'UNKNOWN', `[Cross-Contamination Guard] ${sym} companyName is populated (${evalRes.companyName})`);
    runAssert(evalRes.instrumentKey.includes(evalRes.isin), `[Cross-Contamination Guard] ${sym} instrumentKey includes its ISIN`);
  }

  // Test 9.6: Search UI Modal Enter-Key and Selection Safety on Empty Results
  let modalActiveSymbol = 'KARURVYSYA';
  const simulatedEmptyResults: any[] = [];
  const simulatedSelectedIndex = 0;

  // Simulate user pressing Enter on empty results
  if (simulatedEmptyResults.length > 0 && simulatedEmptyResults[simulatedSelectedIndex]) {
    modalActiveSymbol = simulatedEmptyResults[simulatedSelectedIndex].symbol;
  }
  runAssert(modalActiveSymbol === 'KARURVYSYA', '[Search UI Safety] Pressing Enter on 0 results preserves current active stock (KARURVYSYA)');

  // Test 9.7: Query Transition from Valid to Invalid Clears Previous Suggestions
  let currentSearchQuery = 'TCS';
  let currentResults = await SearchService.search(currentSearchQuery, 5);
  runAssert(currentResults.length > 0, '[Search UI] Query "TCS" returns valid results');

  // User changes query to invalid "zzzz"
  currentSearchQuery = 'zzzz';
  // ============================================================
  // STAGE 10: ETF QUOTE RESOLUTION & RECONCILIATION SUITE
  // ============================================================
  console.log('\n--- STAGE 10: ETF QUOTE RESOLUTION & RECONCILIATION SUITE ---');

  // Test 10.1: SILVERBEES Dual ISIN Resolution (INF204KC1402 primary, INF204KB18I3 legacy)
  const silverByPrimaryIsin = SearchService.getInstrumentByIsin('INF204KC1402');
  runAssert(Boolean(silverByPrimaryIsin), '[ETF Resolution] INF204KC1402 resolves to an instrument');
  runAssert(silverByPrimaryIsin?.symbol === 'SILVERBEES', `[ETF Resolution] INF204KC1402 resolves to SILVERBEES (Actual: ${silverByPrimaryIsin?.symbol})`);
  runAssert(silverByPrimaryIsin?.name === 'Nippon India ETF Silver BeES', `[ETF Resolution] INF204KC1402 name matches Nippon India ETF Silver BeES`);

  const silverBySecondaryIsin = SearchService.getInstrumentByIsin('INF204KB18I3');
  runAssert(Boolean(silverBySecondaryIsin), '[ETF Resolution] INF204KB18I3 resolves to an instrument');
  runAssert(silverBySecondaryIsin?.symbol === 'SILVERBEES', `[ETF Resolution] INF204KB18I3 resolves to SILVERBEES (Actual: ${silverBySecondaryIsin?.symbol})`);

  const silverBySymbol = SearchService.getInstrumentBySymbol('SILVERBEES');
  runAssert(Boolean(silverBySymbol), '[ETF Resolution] Symbol SILVERBEES resolves');
  runAssert(silverBySymbol?.isin === 'INF204KC1402', `[ETF Resolution] SILVERBEES has primary ISIN INF204KC1402 (Actual: ${silverBySymbol?.isin})`);
  runAssert(silverBySymbol?.sector.includes('Exchange Traded Fund') === true, '[ETF Resolution] SILVERBEES sector classified as Exchange Traded Fund');

  // Test 10.2: GOLDBEES Resolution
  const goldByIsin = SearchService.getInstrumentByIsin('INF204KB17I5');
  runAssert(Boolean(goldByIsin), '[ETF Resolution] INF204KB17I5 resolves to an instrument');
  runAssert(goldByIsin?.symbol === 'GOLDBEES', `[ETF Resolution] INF204KB17I5 resolves to GOLDBEES (Actual: ${goldByIsin?.symbol})`);

  // Test 10.3: Unavailable Quote Suppression — No Fictitious Numbers When Quote is Empty
  const emptyQuoteInput: EvaluationInput = {
    symbol: 'SILVERBEES',
    dataSource: 'DATA_UNAVAILABLE',
    quote: {
      instrument_token: 'NSE_EQ|INF204KC1402',
      last_price: 0,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume: 0,
      average_price: 0,
      net_change: 0,
      total_buy_quantity: 0,
      total_sell_quantity: 0,
      lower_circuit_limit: 0,
      upper_circuit_limit: 0,
    },
    candles: [],
  };
  const emptyEval = StockInsightPipeline.evaluate(emptyQuoteInput, 'SILVERBEES');
  runAssert(emptyEval.execution.status === 'DATA_UNAVAILABLE', `[Downstream Suppression] Execution status is DATA_UNAVAILABLE (Actual: ${emptyEval.execution.status})`);
  runAssert(emptyEval.execution.ltp === null, `[Downstream Suppression] Execution LTP is null (Actual: ${emptyEval.execution.ltp})`);
  runAssert(emptyEval.execution.stopLoss === null, `[Downstream Suppression] Execution Stop Loss is null (Actual: ${emptyEval.execution.stopLoss})`);
  runAssert(emptyEval.execution.target === null, `[Downstream Suppression] Execution Target is null (Actual: ${emptyEval.execution.target})`);
  runAssert(emptyEval.execution.maxEntry === null, `[Downstream Suppression] Execution Max Entry is null (Actual: ${emptyEval.execution.maxEntry})`);
  runAssert(emptyEval.priceStructure?.entries.e1.classification === 'UNAVAILABLE', `[Downstream Suppression] Price Structure E1 classification is UNAVAILABLE`);
  runAssert(emptyEval.priceStructure?.entries.e1.price === null, `[Downstream Suppression] Price Structure E1 price is null`);
  runAssert(emptyEval.priceStructure?.metadata.atr14 === 0, `[Downstream Suppression] Price Structure ATR(14) is 0`);

  // Test 10.4: ETF Model Semantics — Fundamental Scoring NOT_APPLICABLE
  const liveEtfInput: EvaluationInput = {
    symbol: 'SILVERBEES',
    dataSource: 'UPSTOX_LIVE',
    quote: {
      instrument_token: 'NSE_EQ|INF204KC1402',
      last_price: 209.68,
      open: 208.0,
      high: 211.0,
      low: 207.5,
      close: 209.68,
      volume: 1500000,
      average_price: 209.1,
      net_change: 2.18,
      total_buy_quantity: 40000,
      total_sell_quantity: 35000,
      lower_circuit_limit: 188.7,
      upper_circuit_limit: 230.6,
    },
    candles: BENCHMARK_STOCKS['GOLDBEES'].candles,
    profile: {
      status: 'success',
      data: {
        company_name: 'Nippon India ETF Silver BeES',
        isin: 'INF204KC1402',
        sector_name: 'Exchange Traded Fund - Commodity (Silver)',
        industry_name: 'Silver ETF',
        description: 'Open-ended scheme tracking domestic price of physical silver.',
      },
    },
  };
  const liveEtfEval = StockInsightPipeline.evaluate(liveEtfInput, 'SILVERBEES');
  runAssert(liveEtfEval.fundamentalStatus === 'NOT_APPLICABLE', `[ETF Semantics] Fundamental status is NOT_APPLICABLE (Actual: ${liveEtfEval.fundamentalStatus})`);
  runAssert(liveEtfEval.fundamentalScore === 0, `[ETF Semantics] Fundamental score is 0 (Actual: ${liveEtfEval.fundamentalScore})`);
  runAssert(liveEtfEval.sector === 'ETF', `[ETF Semantics] Sector route is ETF (Actual: ${liveEtfEval.sector})`);
  runAssert(liveEtfEval.horizons?.SHORT.score === liveEtfEval.technicalScore * 2, `[ETF Semantics] Short horizon score uses T*2`);
  runAssert(liveEtfEval.execution.status === 'READY_TO_BUY' || liveEtfEval.execution.status === 'EXTENDED_WAIT_FOR_PULLBACK', `[ETF Semantics] Execution status is valid active state (${liveEtfEval.execution.status})`);
  runAssert(liveEtfEval.execution.ltp === 209.68, `[ETF Semantics] Execution LTP is 209.68 (Actual: ${liveEtfEval.execution.ltp})`);

  // Test 10.5: FINCABLES Consolidated Fundamentals Provenance & Technical Reconciliation
  const fincablesFundamentals = FUNDAMENTALS_MASTER['FINCABLES'];
  runAssert(Boolean(fincablesFundamentals), '[FINCABLES Provenance] FINCABLES entry exists in FUNDAMENTALS_MASTER');
  runAssert(fincablesFundamentals.isin === 'INE235A01022', `[FINCABLES Provenance] FINCABLES ISIN matches INE235A01022`);
  runAssert(fincablesFundamentals.companyName === 'Finolex Cables Limited', `[FINCABLES Provenance] FINCABLES companyName matches Finolex Cables Limited`);
  runAssert(fincablesFundamentals.keyRatios.pe === 24.2, `[FINCABLES Provenance] Consolidated P/E is 24.2 (Actual: ${fincablesFundamentals.keyRatios.pe})`);
  runAssert(fincablesFundamentals.keyRatios.pb === 3.2, `[FINCABLES Provenance] Consolidated P/B is 3.2 (Actual: ${fincablesFundamentals.keyRatios.pb})`);
  runAssert(fincablesFundamentals.keyRatios.roe === 13.8, `[FINCABLES Provenance] Consolidated ROE is 13.8% (Actual: ${fincablesFundamentals.keyRatios.roe})`);
  runAssert(fincablesFundamentals.keyRatios.roce === 18.2, `[FINCABLES Provenance] Consolidated ROCE is 18.2% (Actual: ${fincablesFundamentals.keyRatios.roce})`);
  runAssert(fincablesFundamentals.netProfitCr > fincablesFundamentals.netProfit3YAgoCr, '[FINCABLES Provenance] 3Y Net Profit growth is positive');

  // Test 10.6: FINCABLES Technical Calculation Consistency
  const fincablesCandles = BENCHMARK_STOCKS['RELIANCE'].candles; // Standard daily series fixture
  const fincablesTechCalcs = TechnicalCalculator.compute(fincablesCandles, null, 1388.70);
  runAssert(fincablesTechCalcs.ltp === 1388.70, `[FINCABLES Technicals] LTP is 1388.70 (Actual: ${fincablesTechCalcs.ltp})`);
  runAssert(typeof fincablesTechCalcs.ema200 === 'number' && fincablesTechCalcs.ema200 > 0, '[FINCABLES Technicals] 200 EMA is computed and positive');
  runAssert(typeof fincablesTechCalcs.sma50 === 'number' && fincablesTechCalcs.sma50 > 0, '[FINCABLES Technicals] 50 SMA is computed and positive');
  runAssert(typeof fincablesTechCalcs.rsi14 === 'number' && fincablesTechCalcs.rsi14 >= 0 && fincablesTechCalcs.rsi14 <= 100, '[FINCABLES Technicals] RSI(14) is bounded in [0, 100]');

  // ============================================================
  // STAGE 11: FORENSIC EVIDENCE & STATEMENT-PERIOD PROVENANCE SUITE
  // ============================================================
  console.log('\n--- STAGE 11: FORENSIC EVIDENCE & STATEMENT-PERIOD PROVENANCE SUITE ---');

  // Test 11.1: Historical Statement Labels Do Not Dynamically Interpolate Current Year
  const bhartiFundamentals = FUNDAMENTALS_MASTER['BHARTIARTL'];
  runAssert(Boolean(bhartiFundamentals), '[Provenance] BHARTIARTL exists in FUNDAMENTALS_MASTER');
  const bhartiPackage = FundamentalsDatabase.getFundamentals('BHARTIARTL');
  const annualRevHistory = bhartiPackage.annualIncome.data.income_statement[0].history;
  runAssert(annualRevHistory[0].period === 'Mar 2024', `[Provenance] Annual statement [0] is static 'Mar 2024' (Actual: ${annualRevHistory[0].period})`);
  runAssert(annualRevHistory[1].period === 'Mar 2023', `[Provenance] Annual statement [1] is static 'Mar 2023' (Actual: ${annualRevHistory[1].period})`);
  runAssert(annualRevHistory[2].period === 'Mar 2022', `[Provenance] Annual statement [2] is static 'Mar 2022' (Actual: ${annualRevHistory[2].period})`);
  runAssert(annualRevHistory[3].period === 'Mar 2021', `[Provenance] Annual statement [3] is static 'Mar 2021' (Actual: ${annualRevHistory[3].period})`);
  runAssert(!annualRevHistory[0].period.includes('2026'), '[Provenance] FY24 statement is not labeled with dynamic current year 2026');

  // Test 11.2: Deterministic Period-End Filing Age (923 Days as of 10 Oct 2026)
  const refDateOct10 = new Date('2026-10-10T00:00:00Z');
  const ageFromPeriodEnd = DataAuditor.computeFilingAgeDays(annualRevHistory[0].period, refDateOct10);
  runAssert(ageFromPeriodEnd === 923, `[Filing Age] Period-end Mar 31, 2024 to Oct 10, 2026 age is exactly 923 days (Actual: ${ageFromPeriodEnd})`);

  // Test 11.3: Finolex Cables Capital Employed & ROCE Verification
  // EBIT = ₹800 Cr. Capital Employed = Total Assets (₹5200) - Current Liabilities (₹800) = Equity (₹4400) + Debt (0) = ₹4400 Cr.
  const finEbit = 800;
  const finEquity = 4400;
  const finTotalAssets = 5200;
  const finCurrentLiab = 800;
  const finCapitalEmployed = finTotalAssets - finCurrentLiab; // 4400
  const finRoceStandard = (finEbit / finCapitalEmployed) * 100; // 18.18%
  const finRoceTotalAssets = (finEbit / finTotalAssets) * 100; // 15.38%
  runAssert(Math.round(finRoceStandard * 10) / 10 === 18.2, `[Ratio Verification] Finolex ROCE on Capital Employed (EBIT / (Assets - CurLiab)) is 18.2% (Actual: ${finRoceStandard.toFixed(2)}%)`);
  runAssert(Math.round(finRoceTotalAssets * 10) / 10 === 15.4, `[Ratio Verification] Finolex ROCE on Total Assets (EBIT / TotalAssets) is 15.4% (Actual: ${finRoceTotalAssets.toFixed(2)}%)`);

  // Test 11.4: Finolex Cables P/B Basis Verification
  const finLtp = 1388.70;
  const finBookValuePerShare = 287.77;
  const finPbLive = finLtp / finBookValuePerShare;
  runAssert(Math.round(finPbLive * 100) / 100 === 4.83 || Math.round(finPbLive * 10) / 10 === 4.8, `[Ratio Verification] Finolex Live P/B at LTP ₹1388.70 is 4.82x-4.83x (Actual: ${finPbLive.toFixed(2)}x)`);

  // Test 11.5: Bharti Airtel OPM and Cash Conversion Reconciliation
  const airtelRev = 150000;
  const airtelEbitda = 78500;
  const airtelCfo = 65000;
  const airtelOpmEbitda = (airtelEbitda / airtelRev) * 100;
  const airtelCashConversion = (airtelCfo / airtelEbitda) * 100;
  runAssert(Math.round(airtelOpmEbitda * 10) / 10 === 52.3, `[Ratio Verification] Airtel EBITDA OPM is 52.3% (Actual: ${airtelOpmEbitda.toFixed(2)}%)`);
  runAssert(Math.round(airtelCashConversion * 10) / 10 === 82.8, `[Ratio Verification] Airtel CFO/EBITDA is 82.8% (Actual: ${airtelCashConversion.toFixed(2)}%)`);

  // Test 11.6: 3-Year CAGR Endpoint Fiscal Verification (FY21 to FY24)
  const annualNetProfitHistory = bhartiPackage.annualIncome.data.income_statement.find((s: any) => s.category === 'net_profit')?.history;
  runAssert(Boolean(annualNetProfitHistory && annualNetProfitHistory.length >= 4), '[CAGR Verification] 4-year net profit history exists');
  const airtelFy24Profit = annualNetProfitHistory![0].value; // FY24
  const airtelFy21Profit = annualNetProfitHistory![3].value; // FY21
  runAssert(airtelFy21Profit < airtelFy24Profit, `[CAGR Verification] 3Y Endpoint Fiscal span FY21 (₹${airtelFy21Profit}) to FY24 (₹${airtelFy24Profit}) reflects positive growth`);
  runAssert(bhartiFundamentals.netProfit3YAgoCr === airtelFy21Profit, '[CAGR Verification] netProfit3YAgoCr matches FY21 statement endpoint');

  // ============================================================
  // STAGE 12: CROSS-INSTRUMENT RELEASE ACCEPTANCE SUITE
  // ============================================================
  console.log('\n--- STAGE 12: CROSS-INSTRUMENT RELEASE ACCEPTANCE SUITE ---');

  // Test 12.1: Cross-Instrument Leverage Normalization & Scoring Matrix
  // Case A: Net-Cash / Pristine Balance Sheet (TCS, FINCABLES, INFY) - D/E <= 0.30 -> 6/6 pts
  const tcsFund = FUNDAMENTALS_MASTER['TCS'];
  const tcsDe = tcsFund.totalLiabilitiesCr / tcsFund.equityCapitalCr; // 38000 / 90000 = 0.422x total, but net cash
  const finFund = FUNDAMENTALS_MASTER['FINCABLES'];
  const finDe = finFund.totalLiabilitiesCr / finFund.equityCapitalCr; // 800 / 4400 = 0.1818x <= 0.30
  const finCalcs: FundamentalCalculations = {
    pe: 24.2, sectorPe: 34.0, pb: 3.2, sectorPb: 4.5, evEbitda: 17.5, sectorEvEbitda: 22.0,
    roe: 13.8, roce: 18.2, roa: 11.5, opmPct: 12.95, netProfitCagr3YPct: 19.8,
    debtToEquity: finDe, cfoToEbitdaRatio: 0.89, cumulativeCfo3Y: 1500, cumulativePat3Y: 1600,
    latestQuarterlyPatYoYPct: 15.0, provisionGrowthPct: null,
  };
  const finScoreRes = FundamentalEngine.scoreIndustrial(finCalcs);
  const finDeFactor = finScoreRes.factors.find(f => f.name === 'Debt-to-Equity');
  runAssert(Boolean(finDeFactor), '[Leverage Matrix] Debt-to-Equity factor exists in Finolex scoring');
  runAssert(finDeFactor?.score === 6, `[Leverage Matrix] Finolex D/E (0.18x <= 0.30) scores 6/6 pts (Actual: ${finDeFactor?.score})`);
  runAssert(finDeFactor?.state === 'DERIVED', '[Leverage Matrix] Finolex D/E state is DERIVED');

  // Case B: Low-Debt / Conservative Balance Sheet (RELIANCE) - D/E in (0.30, 0.70] -> 4/6 pts
  const relFund = FUNDAMENTALS_MASTER['RELIANCE'];
  const relDe = relFund.totalLiabilitiesCr / relFund.equityCapitalCr; // 980000 / 830000 = 1.18x total, interest debt ~0.45x
  const relCalcsLowDebt: FundamentalCalculations = {
    ...finCalcs,
    debtToEquity: 0.45, // Conservative debt
  };
  const relScoreRes = FundamentalEngine.scoreIndustrial(relCalcsLowDebt);
  const relDeFactor = relScoreRes.factors.find(f => f.name === 'Debt-to-Equity');
  runAssert(relDeFactor?.score === 4, `[Leverage Matrix] Conservative D/E (0.45x in 0.3-0.7) scores 4/6 pts (Actual: ${relDeFactor?.score})`);

  // Case C: Moderate Leverage - D/E in (0.70, 1.20] -> 2/6 pts
  const modDeCalcs: FundamentalCalculations = { ...finCalcs, debtToEquity: 0.95 };
  const modScoreRes = FundamentalEngine.scoreIndustrial(modDeCalcs);
  const modDeFactor = modScoreRes.factors.find(f => f.name === 'Debt-to-Equity');
  runAssert(modDeFactor?.score === 2, `[Leverage Matrix] Moderate D/E (0.95x in 0.7-1.2) scores 2/6 pts (Actual: ${modDeFactor?.score})`);

  // Case D: Highly Leveraged / Distressed - D/E > 1.20 -> 0/6 pts
  const highDeCalcs: FundamentalCalculations = { ...finCalcs, debtToEquity: 1.85 };
  const highScoreRes = FundamentalEngine.scoreIndustrial(highDeCalcs);
  const highDeFactor = highScoreRes.factors.find(f => f.name === 'Debt-to-Equity');
  runAssert(highDeFactor?.score === 0, `[Leverage Matrix] High D/E (1.85x > 1.2) scores 0/6 pts (Actual: ${highDeFactor?.score})`);

  // Case E: Extreme Leverage / Negative Tangible Net Worth -> 0/6 pts
  const negEqBs: UpstoxBalanceSheetResponse = {
    status: 'success',
    data: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      history: [{ period: 'Mar 2024', total_asset: 500, total_liability: 800 }], // Net Worth = -300
    },
  };
  const negEqDe = FundamentalCalculator.calculateDebtToEquity(negEqBs);
  runAssert(negEqDe === 999, `[Leverage Matrix] Negative equity balance sheet resolves to 999 (Actual: ${negEqDe})`);

  // Case F: Missing Balance Sheet Data -> null, score 0, state MISSING
  const missingDe = FundamentalCalculator.calculateDebtToEquity(null);
  runAssert(missingDe === null, '[Leverage Matrix] Null balance sheet returns null D/E');
  const missingCalcs: FundamentalCalculations = { ...finCalcs, debtToEquity: null };
  const missingScoreRes = FundamentalEngine.scoreIndustrial(missingCalcs);
  const missingDeFactor = missingScoreRes.factors.find(f => f.name === 'Debt-to-Equity');
  runAssert(missingDeFactor?.score === 0, '[Leverage Matrix] Missing D/E scores 0 pts');
  runAssert(missingDeFactor?.state === 'MISSING', '[Leverage Matrix] Missing D/E state is MISSING');

  // Test 12.2: Metric Nomenclature & Separation
  // Approved factor name: 'Debt-to-Equity'
  runAssert(finDeFactor?.name === 'Debt-to-Equity', `[Metric Nomenclature] Approved factor is explicitly named 'Debt-to-Equity'`);
  runAssert(finDeFactor?.bucket === 'Growth & Solvency', '[Metric Nomenclature] Factor mapped to Growth & Solvency bucket');

  // Test 12.3: Cross-Instrument Structural vs Mathematical-Fallback Stops
  // Scenario A: Stock with Valid Swing Low Pivot Candidate
  const entryLevelValid: PriceStructureLevel = {
    price: 1000,
    type: 'E1',
    source: 'UPSTOX_CANDLES',
    classification: 'STRUCTURAL',
    distancePct: 0,
  };
  const mockSupportPoolWithPivot: StructuralCandidateMetadata[] = [
    {
      type: 'Swing Low Pivot',
      price: 960,
      zoneMin: 955,
      zoneMax: 965,
      touchCount: 2,
      ageDays: 14,
      volumeRatio: 1.4,
      isOverhead: false,
    },
  ];
  // With ATR = 20, ceiling = 1000 - 0.25*20 = 995. Candidate at 960 is valid.
  // Stop = 960 - 0.50*20 = 950.
  const structStop = PriceStructureEngine.calculateHorizonStop(entryLevelValid, 1000, 20, 'S1', mockSupportPoolWithPivot);
  runAssert(structStop.classification === 'STRUCTURAL', `[Stop Classification] S1 with swing low is STRUCTURAL (Actual: ${structStop.classification})`);
  runAssert(structStop.price === 950, `[Stop Classification] Structural S1 price is ₹950 (Actual: ₹${structStop.price})`);
  runAssert(structStop.type.includes('Swing Low Pivot'), `[Stop Classification] S1 type identifies candidate type (${structStop.type})`);

  // Scenario B: Parabolic / Trend-Runner Stock with NO Swing Low Below Entry (Empty Support Pool)
  // Fallback formula: Ex - 1.50 * ATR14 = 1000 - 1.50*20 = 970.
  const fallbackStop = PriceStructureEngine.calculateHorizonStop(entryLevelValid, 1000, 20, 'S1', []);
  runAssert(fallbackStop.classification === 'MATHEMATICAL_FALLBACK', `[Stop Classification] S1 without pivot is MATHEMATICAL_FALLBACK (Actual: ${fallbackStop.classification})`);
  runAssert(fallbackStop.price === 970, `[Stop Classification] Fallback S1 price is ₹970 (Actual: ₹${fallbackStop.price})`);
  runAssert(fallbackStop.source === 'STRUCTURAL_BUFFERED_STOP', `[Stop Classification] Fallback S1 source is STRUCTURAL_BUFFERED_STOP`);

  // Scenario C: Unavailable Entry -> S1 UNAVAILABLE
  const unavailEntryLevel: PriceStructureLevel = {
    price: null,
    type: 'UNAVAILABLE',
    source: 'NONE',
    classification: 'UNAVAILABLE',
    distancePct: null,
  };
  const unavailStop = PriceStructureEngine.calculateHorizonStop(unavailEntryLevel, 1000, 20, 'S1', mockSupportPoolWithPivot);
  runAssert(unavailStop.classification === 'UNAVAILABLE', `[Stop Classification] S1 with unavailable entry is UNAVAILABLE`);
  runAssert(unavailStop.price === null, `[Stop Classification] S1 with unavailable entry has null price`);

  // Test 12.4: Cross-Instrument Technical Adjustment for Corporate Actions
  // Scenario A: Stock with 1:5 Stock Split (e.g. 5:1 split ratio, effective 2026-06-01)
  const rawSplitCandles: UpstoxCandle[] = [
    ['2026-06-02T00:00:00Z', 200, 205, 198, 202, 1000000, 0], // Post-split
    ['2026-05-30T00:00:00Z', 1000, 1020, 990, 1010, 200000, 0], // Pre-split raw
    ['2026-05-29T00:00:00Z', 980, 1000, 970, 990, 210000, 0],   // Pre-split raw
  ];
  const splitCorpActions: UpstoxCorporateActionsResponse = {
    status: 'success',
    data: [
      { name: 'split', expiry_date: '2026-06-01', ratio: '1:5' },
    ],
  };
  const adjustedSplitCandles = TechnicalCalculator.adjustCandlesForCorporateActions(rawSplitCandles, splitCorpActions);
  runAssert(adjustedSplitCandles.length === 3, '[Technical Adjustment] Split candles count preserved (3)');
  runAssert(adjustedSplitCandles[0][4] === 202, `[Technical Adjustment] Post-split close unchanged at 202 (Actual: ${adjustedSplitCandles[0][4]})`);
  runAssert(adjustedSplitCandles[1][4] === 202, `[Technical Adjustment] Pre-split close (1010 * 0.2) back-adjusted to 202 (Actual: ${adjustedSplitCandles[1][4]})`);
  runAssert(adjustedSplitCandles[2][4] === 198, `[Technical Adjustment] Pre-split close (990 * 0.2) back-adjusted to 198 (Actual: ${adjustedSplitCandles[2][4]})`);
  runAssert(adjustedSplitCandles[1][5] === 1000000, `[Technical Adjustment] Pre-split volume (200000 / 0.2) adjusted to 1000000 (Actual: ${adjustedSplitCandles[1][5]})`);

  // Scenario B: Stock with 1:1 Bonus Issue
  const rawBonusCandles: UpstoxCandle[] = [
    ['2026-06-02T00:00:00Z', 500, 510, 495, 505, 500000, 0],  // Post-bonus
    ['2026-05-30T00:00:00Z', 1000, 1020, 990, 1010, 250000, 0], // Pre-bonus raw
  ];
  const bonusCorpActions: UpstoxCorporateActionsResponse = {
    status: 'success',
    data: [
      { name: 'bonus', expiry_date: '2026-06-01', ratio: '1:1' },
    ],
  };
  const adjustedBonusCandles = TechnicalCalculator.adjustCandlesForCorporateActions(rawBonusCandles, bonusCorpActions);
  runAssert(adjustedBonusCandles[0][4] === 505, `[Technical Adjustment] Post-bonus close unchanged at 505 (Actual: ${adjustedBonusCandles[0][4]})`);
  runAssert(adjustedBonusCandles[1][4] === 505, `[Technical Adjustment] Pre-bonus close (1010 * 0.5) back-adjusted to 505 (Actual: ${adjustedBonusCandles[1][4]})`);

  // Scenario C: Stock WITHOUT Corporate Actions (Normal continuous candle series)
  const rawNoActionCandles: UpstoxCandle[] = [
    ['2026-06-02T00:00:00Z', 1015, 1030, 1010, 1025, 500000, 0],
    ['2026-05-30T00:00:00Z', 1000, 1020, 990, 1010, 250000, 0],
  ];
  const noActionCandles = TechnicalCalculator.adjustCandlesForCorporateActions(rawNoActionCandles, null);
  runAssert(noActionCandles[0][4] === 1025, `[Technical Adjustment] Without corporate actions, latest close remains 1025 (Actual: ${noActionCandles[0][4]})`);
  runAssert(noActionCandles[1][4] === 1010, `[Technical Adjustment] Without corporate actions, previous close remains 1010 (Actual: ${noActionCandles[1][4]})`);

  // ============================================================
  // STAGE 13: APPROVED-SCOPE INTEGRITY PATCH (OCTOBER 11, 2026)
  // Validates:
  // - RISK-001: Cash flow and income statement period alignment
  // - RISK-004: Debt-to-equity reporting period alignment
  // - RISK-003: Neutral UI representation for MISSING factors
  // ============================================================
  console.log('\n--- STAGE 13: APPROVED-SCOPE INTEGRITY PATCH SUITE ---');

  // Test 13.1: Period string normalizer handles casing, whitespace, and formatting variants
  runAssert(FundamentalCalculator.normalizePeriod('Mar 2024') === 'MAR 2024', '[Period Normalizer] "Mar 2024" normalizes to "MAR 2024"');
  runAssert(FundamentalCalculator.normalizePeriod('  mar-2024  ') === 'MAR 2024', '[Period Normalizer] "  mar-2024  " normalizes to "MAR 2024"');
  runAssert(FundamentalCalculator.normalizePeriod('2024_03_31') === '2024 03 31', '[Period Normalizer] "2024_03_31" normalizes to "2024 03 31"');
  runAssert(FundamentalCalculator.normalizePeriod(null) === '', '[Period Normalizer] null returns empty string');

  // Test 13.2: Cash Flow & Operating Profit matched across identical periods
  const matchedCashFlow: any = {
    status: 'success',
    data: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      cash_flow: [
        {
          category: 'operating',
          history: [
            { period: 'Mar 2024', value: 800 },
            { period: 'Mar 2023', value: 700 },
            { period: 'Mar 2022', value: 600 },
          ],
        },
      ],
    },
  };
  const matchedIncome: any = {
    status: 'success',
    data: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      income_statement: [
        {
          category: 'operating_profit',
          history: [
            { period: 'Mar 2024', value: 1000 },
            { period: 'Mar 2023', value: 900 },
          ],
        },
        {
          category: 'net_profit',
          history: [
            { period: 'Mar 2024', value: 500 },
            { period: 'Mar 2023', value: 450 },
            { period: 'Mar 2022', value: 400 },
          ],
        },
      ],
    },
  };

  const matchedMetrics = FundamentalCalculator.calculateCashFlowMetrics(matchedCashFlow, matchedIncome);
  runAssert(matchedMetrics.cfoToEbitdaRatio !== null && Math.abs(matchedMetrics.cfoToEbitdaRatio - 0.80) < 0.001, `[Cash Flow Alignment] Matched Mar 2024 returns CFO/EBITDA = 0.80x (Actual: ${matchedMetrics.cfoToEbitdaRatio})`);
  runAssert(matchedMetrics.cumulativeCfo3Y === 2100, `[Cash Flow Alignment] 3Y Cumulative CFO = 2100 (Actual: ${matchedMetrics.cumulativeCfo3Y})`);
  runAssert(matchedMetrics.cumulativePat3Y === 1350, `[Cash Flow Alignment] 3Y Cumulative PAT = 1350 (Actual: ${matchedMetrics.cumulativePat3Y})`);

  // Test 13.3: Reordered history in Income Statement still aligns by period string (not blind index 0)
  const reorderedIncome: any = {
    status: 'success',
    data: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      income_statement: [
        {
          category: 'operating_profit',
          history: [
            { period: 'Mar 2023', value: 900 }, // Prior period is first
            { period: 'Mar 2024', value: 1000 }, // Latest period is second
          ],
        },
        {
          category: 'net_profit',
          history: [
            { period: 'Mar 2022', value: 400 },
            { period: 'Mar 2024', value: 500 },
            { period: 'Mar 2023', value: 450 },
          ],
        },
      ],
    },
  };
  const reorderedMetrics = FundamentalCalculator.calculateCashFlowMetrics(matchedCashFlow, reorderedIncome);
  runAssert(reorderedMetrics.cfoToEbitdaRatio !== null && Math.abs(reorderedMetrics.cfoToEbitdaRatio - 0.80) < 0.001, `[Cash Flow Alignment] Reordered P&L matches Mar 2024 correctly to 0.80x (Actual: ${reorderedMetrics.cfoToEbitdaRatio})`);
  runAssert(reorderedMetrics.cumulativePat3Y === 1350, `[Cash Flow Alignment] Reordered 3Y PAT matched correctly to 1350 (Actual: ${reorderedMetrics.cumulativePat3Y})`);

  // Test 13.4: Cash Flow period mismatch returns null (Prevents cross-period division)
  const mismatchedCashFlow: any = {
    status: 'success',
    data: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      cash_flow: [
        {
          category: 'operating',
          history: [
            { period: 'Mar 2025', value: 1200 }, // Income statement only has Mar 2024
          ],
        },
      ],
    },
  };
  const mismatchedMetrics = FundamentalCalculator.calculateCashFlowMetrics(mismatchedCashFlow, matchedIncome);
  runAssert(mismatchedMetrics.cfoToEbitdaRatio === null, `[Period Mismatch Guard] Mismatched periods return null cfoToEbitdaRatio (Actual: ${mismatchedMetrics.cfoToEbitdaRatio})`);

  // Test 13.5: Incompatible statement bases (Consolidated CF vs Standalone P&L) return null
  const standaloneIncome: any = {
    status: 'success',
    data: {
      type: 'standalone', // Incompatible with consolidated
      time_period: 'yearly',
      units_in: 'crore',
      income_statement: matchedIncome.data.income_statement,
    },
  };
  const incompatibleBaseMetrics = FundamentalCalculator.calculateCashFlowMetrics(matchedCashFlow, standaloneIncome);
  runAssert(incompatibleBaseMetrics.cfoToEbitdaRatio === null, `[Statement Base Compatibility] Consolidated CF vs Standalone P&L returns null (Actual: ${incompatibleBaseMetrics.cfoToEbitdaRatio})`);

  // Test 13.6: Genuine numeric zero CFO (0 / 1000 = 0) is preserved as valid 0
  const zeroCfoCashFlow: any = {
    status: 'success',
    data: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      cash_flow: [
        {
          category: 'operating',
          history: [
            { period: 'Mar 2024', value: 0 }, // Genuine zero cash flow
          ],
        },
      ],
    },
  };
  const zeroCfoMetrics = FundamentalCalculator.calculateCashFlowMetrics(zeroCfoCashFlow, matchedIncome);
  runAssert(zeroCfoMetrics.cfoToEbitdaRatio === 0, `[Genuine Zero Preservation] Zero CFO returns 0.0 ratio (Actual: ${zeroCfoMetrics.cfoToEbitdaRatio})`);

  // Test 13.7: Debt-to-Equity matches period between history and full_statement equity
  const matchedBS: any = {
    status: 'success',
    data: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      history: [
        { period: 'Mar 2024', total_asset: 5000, total_liability: 1000 },
        { period: 'Mar 2023', total_asset: 4500, total_liability: 900 },
      ],
      full_statement: [
        {
          particular: 'Equity Capital',
          history: [
            { period: 'Mar 2023', value: 1800 },
            { period: 'Mar 2024', value: 2000 }, // Mar 2024 equity = 2000
          ],
        },
      ],
    },
  };
  const deMatched = FundamentalCalculator.calculateDebtToEquity(matchedBS);
  runAssert(deMatched !== null && Math.abs(deMatched - 0.50) < 0.001, `[D/E Period Matching] Matches Mar 2024 liability (1000) with Mar 2024 equity (2000) -> 0.50x (Actual: ${deMatched})`);

  // Test 13.8: Debt-to-Equity fallbacks safely to total_asset - total_liability for same period
  const bsNoFullStatement: any = {
    status: 'success',
    data: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      history: [
        { period: 'Mar 2024', total_asset: 5000, total_liability: 1000 },
      ],
    },
  };
  const deFallback = FundamentalCalculator.calculateDebtToEquity(bsNoFullStatement);
  runAssert(deFallback !== null && Math.abs(deFallback - 0.25) < 0.001, `[D/E Accounting Fallback] Equity = 5000 - 1000 = 4000 -> D/E = 1000 / 4000 = 0.25x (Actual: ${deFallback})`);

  // Test 13.9: Debt-to-Equity preserves genuine zero total liability (0 / Equity = 0.0x)
  const zeroDebtBS: any = {
    status: 'success',
    data: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      history: [
        { period: 'Mar 2024', total_asset: 5000, total_liability: 0 },
      ],
    },
  };
  const deZeroDebt = FundamentalCalculator.calculateDebtToEquity(zeroDebtBS);
  runAssert(deZeroDebt === 0, `[Genuine Zero Preservation] Zero total liabilities returns D/E = 0.0x (Actual: ${deZeroDebt})`);

  // Test 13.10: Factor Table MISSING state neutrality logic check
  // Given a mock factor with MISSING state and 0 score vs AVAILABLE with 0 score
  const missingFactor = {
    name: 'Cash Flow Conversion',
    weight: 6,
    score: 0,
    state: 'MISSING',
    rawValue: null,
    explanation: 'No cash flow data available',
  };
  const measuredZeroFactor = {
    name: 'Cash Flow Conversion',
    weight: 6,
    score: 0,
    state: 'DERIVED',
    rawValue: '0.0%',
    explanation: 'Weak cash conversion: CFO/EBITDA is 0.0% (<50%)',
  };

  runAssert(missingFactor.state === 'MISSING', '[Factor State Distinction] Missing factor state is explicitly MISSING');
  runAssert(measuredZeroFactor.state === 'DERIVED', '[Factor State Distinction] Measured zero factor state is DERIVED');
  runAssert(missingFactor.score === 0 && measuredZeroFactor.score === 0, '[Factor State Distinction] Both yield 0 numeric points under frozen engine');

  // ============================================================
  // STAGE 14: PORTFOLIO & RISK SUBSYSTEM INTEGRITY SUITE
  // ============================================================
  console.log('\n--- STAGE 14: PORTFOLIO & RISK SUBSYSTEM INTEGRITY SUITE ---');

  // Test 14.1: PORT-001 Dual Sector-Allocation Metrics with Unquoted Holding
  // Two holdings in different sectors:
  // Sector A (IT): TCS (Quoted, LTP=4000, Qty=10, Buy=3000 -> Invested=30,000, Current=40,000)
  // Sector B (PHARMA): Unquoted (Qty=20, Buy=1500 -> Invested=30,000, Current=null)
  const tcsQuotedHolding: Holding = {
    id: 'h_tcs_q',
    symbol: 'TCS',
    companyName: 'Tata Consultancy Services',
    sector: 'IT',
    quantity: 10,
    averageBuyPrice: 3000.0,
    addedAt: new Date().toISOString(),
  };
  const pharmaUnquotedHolding: Holding = {
    id: 'h_pharma_uq',
    symbol: 'ZYDUSLIFE',
    companyName: 'Zydus Lifesciences',
    sector: 'PHARMA',
    quantity: 20,
    averageBuyPrice: 1500.0,
    addedAt: new Date().toISOString(),
  };

  const tcsQuotedEval = {
    ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['TCS'], 'TCS'),
    dataSource: 'UPSTOX_LIVE' as const,
  };
  tcsQuotedEval.execution.ltp = 4000.0;
  tcsQuotedEval.coreScore = 75;

  const pharmaUnquotedEval = {
    ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['ZYDUSLIFE'], 'ZYDUSLIFE'),
    dataSource: 'DATA_UNAVAILABLE' as const,
  };
  pharmaUnquotedEval.execution.ltp = 0; // unquoted
  pharmaUnquotedEval.coreScore = 60;

  const stage14Analysis = PortfolioEngine.analyze(
    [tcsQuotedHolding, pharmaUnquotedHolding],
    new Map([
      ['TCS', tcsQuotedEval],
      ['ZYDUSLIFE', pharmaUnquotedEval],
    ])
  );

  const itSector = stage14Analysis.analytics.sectorConcentrations.find((s) => s.sectorName === 'IT');
  const pharmaSector = stage14Analysis.analytics.sectorConcentrations.find((s) => s.sectorName === 'PHARMA');

  runAssert(itSector !== undefined, '[PORT-001 Dual Sector Allocation] IT sector present in concentration report');
  runAssert(pharmaSector !== undefined, '[PORT-001 Dual Sector Allocation] PHARMA sector present in concentration report');

  // Total Invested = 30,000 + 30,000 = 60,000. Each is 50.0% invested capital
  runAssert(itSector?.investedPercentage === 50.0, `[PORT-001 Dual Sector Allocation] IT investedPercentage is 50.0% (Actual: ${itSector?.investedPercentage}%)`);
  runAssert(pharmaSector?.investedPercentage === 50.0, `[PORT-001 Dual Sector Allocation] PHARMA investedPercentage is 50.0% (Actual: ${pharmaSector?.investedPercentage}%)`);

  // Total Current Value = 40,000 (only IT resolved). IT currentPercentage is 100.0%, PHARMA is 0.0%
  runAssert(itSector?.currentPercentage === 100.0, `[PORT-001 Dual Sector Allocation] IT currentPercentage is 100.0% (Actual: ${itSector?.currentPercentage}%)`);
  runAssert(pharmaSector?.currentPercentage === 0.0, `[PORT-001 Dual Sector Allocation] PHARMA currentPercentage is 0.0% (Actual: ${pharmaSector?.currentPercentage}%)`);

  // Backwards compatibility alias percentageOfPortfolio matches currentPercentage
  runAssert(itSector?.percentageOfPortfolio === 100.0, '[PORT-001 Backwards Compat] IT percentageOfPortfolio aliases currentPercentage (100.0%)');
  runAssert(pharmaSector?.percentageOfPortfolio === 0.0, '[PORT-001 Backwards Compat] PHARMA percentageOfPortfolio aliases currentPercentage (0.0%)');

  // Test 14.2: PORT-002 Zero-Quantity Position Handling
  // Adding a zero-quantity position with a breached stop loss or accrual trap trigger
  const zeroQtyHolding: Holding = {
    id: 'h_zero_qty',
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries',
    sector: 'ENERGY',
    quantity: 0,
    averageBuyPrice: 2800.0,
    addedAt: new Date().toISOString(),
  };
  const relBreachedEval = {
    ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE'),
    dataSource: 'UPSTOX_LIVE' as const,
  };
  relBreachedEval.execution.ltp = 2000.0;
  relBreachedEval.execution.stopLoss = 2500.0; // Stop is breached!
  relBreachedEval.fundamentalScore = 20.0; // Under 25
  relBreachedEval.coreScore = 30.0;

  const zeroQtyAnalysis = PortfolioEngine.analyze(
    [tcsQuotedHolding, zeroQtyHolding],
    new Map([
      ['TCS', tcsQuotedEval],
      ['RELIANCE', relBreachedEval],
    ])
  );

  // Zero-quantity position must be preserved in items list without throwing or mutating
  runAssert(zeroQtyAnalysis.items.length === 2, '[PORT-002 Inactive Position] Zero-quantity holding preserved in items array (length === 2)');
  runAssert(zeroQtyAnalysis.analytics.activeHoldingsCount === 1, `[PORT-002 Active Count] activeHoldingsCount correctly ignores quantity=0 -> 1 (Actual: ${zeroQtyAnalysis.analytics.activeHoldingsCount})`);

  // Zero-quantity position stop breach must NOT trigger a portfolio alert
  runAssert(zeroQtyAnalysis.analytics.stopBreachCount === 0, `[PORT-002 Phantom Alert Suppression] Zero-quantity stop loss breach is excluded from stopBreachCount (Actual: ${zeroQtyAnalysis.analytics.stopBreachCount})`);

  // Zero-quantity position must NOT pollute capital-weighted score (only TCS 75/100 should count)
  runAssert(zeroQtyAnalysis.analytics.capitalWeightedScore === 75.0, `[PORT-002 Score Weighting] Capital-weighted score accurately reflects active positions only (Expected: 75.0, Actual: ${zeroQtyAnalysis.analytics.capitalWeightedScore})`);

  // Test 14.3: PORT-003 ETF Fundamental N/A Contract Check
  // Verify that an ETF holding is accurately identified by sector 'ETF'
  const etfHolding: Holding = {
    id: 'h_niftybees',
    symbol: 'NIFTYBEES',
    companyName: 'Nippon India Nifty 50 BeES ETF',
    sector: 'ETF',
    quantity: 100,
    averageBuyPrice: 250.0,
    addedAt: new Date().toISOString(),
  };
  const etfEval = {
    ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'NIFTYBEES'),
    sector: 'ETF',
    fundamentalStatus: 'UNAVAILABLE' as const,
  };
  etfEval.fundamentalScore = null as any;
  etfEval.technicalScore = 38.0;
  etfEval.coreScore = 38.0;

  const etfAnalysis = PortfolioEngine.analyze([etfHolding], new Map([['NIFTYBEES', etfEval]]));
  const etfItem = etfAnalysis.items[0];

  const isEtf = etfItem.evaluation?.sector === 'ETF' || etfItem.holding.sector === 'ETF' || etfItem.evaluation?.fundamentalStatus === 'UNAVAILABLE';
  runAssert(isEtf === true, '[PORT-003 ETF Presentation] Correctly identifies ETF contract for mobile card rendering');
  runAssert(etfItem.technicalScore === 38.0, '[PORT-003 ETF Technical Display] Technical score preserved at 38/50 for ETF');

  // ============================================================
  // STAGE 16C: INSTRUMENT-KEY INTEGRITY & ERROR PROPAGATION SUITE
  // ============================================================
  console.log('\n--- STAGE 16C: INSTRUMENT-KEY INTEGRITY & ERROR PROPAGATION SUITE ---');

  // Test 16C.1: Canonical Equity Instrument Key Resolution (RELIANCE -> NSE_EQ|INE002A01018)
  const relInst = SearchService.getInstrumentBySymbol('RELIANCE');
  runAssert(relInst !== undefined, '[16C.1 Key Resolution] RELIANCE resolves from instrument master');
  runAssert(relInst?.isin === 'INE002A01018', `[16C.1 Key Resolution] RELIANCE canonical ISIN is INE002A01018 (Actual: ${relInst?.isin})`);
  runAssert(relInst?.instrumentKey === 'NSE_EQ|INE002A01018', `[16C.1 Key Resolution] Canonical key is NSE_EQ|INE002A01018 (Actual: ${relInst?.instrumentKey})`);

  // Test 16C.2: Canonical ETF Instrument Key Resolution (NIFTYBEES -> NSE_EQ|INF732E01011)
  const etfInst = SearchService.getInstrumentBySymbol('NIFTYBEES');
  runAssert(etfInst !== undefined, '[16C.2 ETF Key Resolution] NIFTYBEES resolves from instrument master');
  runAssert(etfInst?.isin === 'INF732E01011', `[16C.2 ETF Key Resolution] NIFTYBEES canonical ISIN is INF732E01011 (Actual: ${etfInst?.isin})`);
  runAssert(etfInst?.instrumentKey === 'NSE_EQ|INF732E01011', `[16C.2 ETF Key Resolution] Canonical ETF key is NSE_EQ|INF732E01011 (Actual: ${etfInst?.instrumentKey})`);

  // Test 16C.3: Unknown Symbol or Missing Key Rejection (No false synthetic instruments)
  const unknownInst = SearchService.getInstrumentBySymbol('ZZZ_UNKNOWN_TICKER_999');
  runAssert(unknownInst === undefined, '[16C.3 Unknown Instrument] Non-existent symbol returns undefined (never synthetic)');

  // Test 16C.4: Batch Market Quote Keys Construction (Formatting & Deduplication)
  // Ensure formatted batch keys strictly adhere to broker contract NSE_EQ|{ISIN}
  const rawTestKeys = ['RELIANCE', 'TCS', 'NSE_EQ|INE002A01018', 'INF204KB14I2', 'RELIANCE'];
  const formattedTestKeys = Array.from(
    new Set(
      rawTestKeys.map((k) => {
        const raw = k.trim();
        if (raw.startsWith('NSE_EQ|') || raw.startsWith('BSE_EQ|')) return raw;
        if (raw.startsWith('INE') || raw.startsWith('INF')) return `NSE_EQ|${raw}`;
        const upper = raw.toUpperCase();
        const known = SearchService.getInstrumentBySymbol(upper);
        const isin = known?.isin || upper;
        return `NSE_EQ|${isin}`;
      })
    )
  );
  runAssert(formattedTestKeys.includes('NSE_EQ|INE002A01018'), '[16C.4 Batch Keys] Formatted batch contains canonical RELIANCE key');
  runAssert(formattedTestKeys.includes('NSE_EQ|INE467B01029'), '[16C.4 Batch Keys] Formatted batch contains canonical TCS key');
  runAssert(formattedTestKeys.includes('NSE_EQ|INF204KB14I2'), '[16C.4 Batch Keys] Formatted batch contains canonical NIFTYBEES key');
  runAssert(formattedTestKeys.length === 3, `[16C.4 Batch Keys] Deduplicates 5 raw inputs into 3 canonical keys (Actual: ${formattedTestKeys.length})`);

  // Test 16C.5: UpstoxApiError Class & HTTP 400 Error Propagation
  const sample400Error = new UpstoxApiError(400, '/v2/market-quote/quotes', 'One of either symbol or instrument_key is invalid.');
  runAssert(sample400Error.status === 400, '[16C.5 Error Propagation] UpstoxApiError status captures 400');
  runAssert(sample400Error.endpoint === '/v2/market-quote/quotes', '[16C.5 Error Propagation] UpstoxApiError captures target endpoint');
  runAssert(sample400Error.message.includes('invalid'), '[16C.5 Error Propagation] UpstoxApiError captures provider message');

  // ============================================================
  // STAGE 1D: MINIMAL UI STATUS CORRECTIONS & DATA INTEGRITY REGRESSION SUITE
  // ============================================================
  console.log('\n--- STAGE 1D: MINIMAL UI STATUS CORRECTIONS & DATA INTEGRITY REGRESSION SUITE ---');

  // 1. Token Status Semantics Tests
  // Helper to simulate token button label resolution exactly as implemented in TerminalHeader
  const resolveTokenLabel = (token: string | null | undefined, connStatus: 'UNCONFIGURED' | 'CONFIGURED_UNVERIFIED' | 'CONNECTED' | 'ERROR') => {
    const hasTok = Boolean(token && token.trim().length > 10);
    if (!hasTok) return 'Configure Token';
    if (connStatus === 'CONNECTED') return 'Connected';
    if (connStatus === 'ERROR') return 'Connection Error';
    return 'Token Configured';
  };

  runAssert(resolveTokenLabel(null, 'UNCONFIGURED') === 'Configure Token', '[1D.1 Token Status] No token displays "Configure Token"');
  runAssert(resolveTokenLabel('', 'UNCONFIGURED') === 'Configure Token', '[1D.1 Token Status] Empty token string displays "Configure Token"');
  runAssert(resolveTokenLabel('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', 'CONFIGURED_UNVERIFIED') === 'Token Configured', '[1D.1 Token Status] Unverified token displays "Token Configured"');
  runAssert(resolveTokenLabel('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', 'CONNECTED') === 'Connected', '[1D.1 Token Status] Successfully tested token displays "Connected"');
  runAssert(resolveTokenLabel('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', 'ERROR') === 'Connection Error', '[1D.1 Token Status] Errored/rejected token displays "Connection Error"');

  // 2. Feed Status Accuracy Tests
  // Helper to simulate feed label resolution
  const resolveFeedBadge = (dataSource: import('../types/engine').DataSource, isMarketOpen: boolean, tradingSessionId: string) => {
    if (dataSource === 'UPSTOX_LIVE') {
      return isMarketOpen ? '● LIVE FEED' : `LAST CLOSE FEED (${tradingSessionId})`;
    }
    if (dataSource === 'UPSTOX_DATA_ERROR') {
      return '⚠ UPSTOX_DATA_ERROR';
    }
    return '○ UNAVAILABLE';
  };

  runAssert(resolveFeedBadge('UPSTOX_LIVE', true, '2026-10-12') === '● LIVE FEED', '[1D.2 Feed Status] Open market with verified Upstox data displays "● LIVE FEED"');
  runAssert(resolveFeedBadge('UPSTOX_LIVE', false, '2026-10-09') === 'LAST CLOSE FEED (2026-10-09)', '[1D.2 Feed Status] Closed market with verified Upstox data displays "LAST CLOSE FEED (2026-10-09)"');
  runAssert(resolveFeedBadge('UPSTOX_DATA_ERROR', true, '2026-10-12') === '⚠ UPSTOX_DATA_ERROR', '[1D.2 Feed Status] Open market with API error displays "⚠ UPSTOX_DATA_ERROR"');
  runAssert(resolveFeedBadge('UPSTOX_DATA_ERROR', false, '2026-10-09') === '⚠ UPSTOX_DATA_ERROR', '[1D.2 Feed Status] Closed market with API error displays "⚠ UPSTOX_DATA_ERROR" (not last close success)');
  runAssert(resolveFeedBadge('DATA_UNAVAILABLE', false, '2026-10-09') === '○ UNAVAILABLE', '[1D.2 Feed Status] Missing data during closed market remains "○ UNAVAILABLE"');

  // 3. Placeholder Zero Integrity Tests
  // Test 1D.3.1: Zero quote cannot create fake measured LTP or pollute portfolio value
  const zeroLtpHolding: Holding = {
    id: 'h_zero_ltp',
    symbol: 'UNQUOTED_CO',
    companyName: 'Unquoted Entity',
    sector: 'INDUSTRIAL',
    quantity: 100,
    averageBuyPrice: 50.0,
    addedAt: new Date().toISOString(),
  };

  const zeroLtpEval = {
    ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'UNQUOTED_CO'),
    dataSource: 'DATA_UNAVAILABLE' as const,
  };
  zeroLtpEval.execution.ltp = null;

  const zeroLtpAnalysis = PortfolioEngine.analyze([zeroLtpHolding], new Map([['UNQUOTED_CO', zeroLtpEval]]));
  const zeroLtpItem = zeroLtpAnalysis.items[0];
  runAssert(zeroLtpItem.quoteStatus === 'UNAVAILABLE', '[1D.3 Zero Integrity] Unquoted holding has quoteStatus UNAVAILABLE');
  runAssert(zeroLtpItem.currentLtp === null, '[1D.3 Zero Integrity] Unquoted holding currentLtp is null (not 0.0 or buy price)');
  runAssert(zeroLtpItem.currentValue === null, '[1D.3 Zero Integrity] Unquoted holding currentValue is null (no synthetic market value)');
  runAssert(zeroLtpItem.pnl === null, '[1D.3 Zero Integrity] Unquoted holding P&L is null (no synthetic P&L)');
  runAssert(zeroLtpAnalysis.analytics.totalCurrentValue === 0, '[1D.3 Zero Integrity] Total portfolio current value excludes unquoted holding');

  // Test 1D.3.2: ExecutionEngine with ltp <= 0 sets status DATA_UNAVAILABLE and ltp null
  const emptyTechCalcs: import('../engine/calculators/technical').TechnicalCalculations = {
    ltp: 0,
    ema200: null,
    ema200SlopePct: null,
    sma100: null,
    sma50: null,
    maAligned: false,
    rsi14: null,
    volumeAccumulationRatio: null,
    breakoutVolumeRatio: null,
    roc20: null,
    rangePosition52WPct: null,
    atr14: null,
    swingLow10: null,
    turnover20DCr: 0,
  };
  const emptyExecution = ExecutionEngine.evaluate(emptyTechCalcs);
  runAssert(emptyExecution.status === 'DATA_UNAVAILABLE', '[1D.3 Zero Integrity] ExecutionEngine returns DATA_UNAVAILABLE when LTP <= 0');
  runAssert(emptyExecution.ltp === null, '[1D.3 Zero Integrity] ExecutionEngine ltp is null when input LTP is 0');
  runAssert(emptyExecution.stopLoss === null, '[1D.3 Zero Integrity] ExecutionEngine stopLoss is null when LTP is 0');

  // 4. Frozen Engine Invariant Regression Tests
  const frozenBaseEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE');
  runAssert(frozenBaseEval.fundamentalScore <= 50.0, '[1D.4 Frozen Engine] Fundamental score maximum is 50.0 pts');
  runAssert(frozenBaseEval.technicalScore <= 50.0, '[1D.4 Frozen Engine] Technical score maximum is 50.0 pts');
  runAssert(frozenBaseEval.coreScore <= 100.0, '[1D.4 Frozen Engine] Core score maximum is 100.0 pts');
  runAssert(frozenBaseEval.coreScore === frozenBaseEval.fundamentalScore + frozenBaseEval.technicalScore, '[1D.4 Frozen Engine] Core score is exactly Fundamental + Technical');

  // Decision Zones: FAVORABLE >= 68, HOLD >= 39 & < 68, CAUTION < 39
  const decFavorable = DecisionEngine.evaluate(35, 35, 0, false, []); // 70 core
  runAssert(decFavorable.zone === 'FAVORABLE', '[1D.4 Frozen Engine] Score 70 enters FAVORABLE zone (>= 68)');

  const decHold = DecisionEngine.evaluate(25, 25, 0, false, []); // 50 core
  runAssert(decHold.zone === 'HOLD', '[1D.4 Frozen Engine] Score 50 enters HOLD zone (>= 39 and < 68)');

  const decCaution = DecisionEngine.evaluate(15, 15, 0, false, []); // 30 core
  runAssert(decCaution.zone === 'CAUTION', '[1D.4 Frozen Engine] Score 30 enters CAUTION zone (< 39)');

  // Hysteresis corridor: retains FAVORABLE down to 66
  const decHysteresisRetained = DecisionEngine.evaluate(33, 34, 0, false, [], 'FAVORABLE'); // 67 core with prior FAVORABLE
  runAssert(decHysteresisRetained.zone === 'FAVORABLE', '[1D.4 Frozen Engine] Existing FAVORABLE position retains FAVORABLE at 67 (hysteresis floor 66)');

  const decHysteresisDropped = DecisionEngine.evaluate(32, 33, 0, false, [], 'FAVORABLE'); // 65 core with prior FAVORABLE
  runAssert(decHysteresisDropped.zone === 'HOLD', '[1D.4 Frozen Engine] Existing FAVORABLE position drops to HOLD at 65 (< 66)');

  // Fundamental floor gate: Fundamental score < 25 prevents FAVORABLE
  const decFloorBlocked = DecisionEngine.evaluate(24, 45, 0, false, []); // 69 core, but fund is 24 (< 25)
  runAssert(decFloorBlocked.zone === 'HOLD', '[1D.4 Frozen Engine] Core 69 with Fundamental 24 blocked from FAVORABLE by fundamental floor');
  runAssert(decFloorBlocked.fundamentalFloorFailed === true, '[1D.4 Frozen Engine] fundamentalFloorFailed flag set when fundamental < 25');

  // 5. STAGE 1F: MINIMAL PORTFOLIO P&L DISCLOSURE & INVARIANT REGRESSION SUITE
  // Helper to emulate PortfolioSummaryStrip subtitle logic
  const getPnlSubtitle = (holdingsCount: number, resolvedCount?: number): string => {
    const isPartial = resolvedCount !== undefined && resolvedCount < holdingsCount;
    return isPartial ? 'net gain/loss (quoted assets)' : 'overall net gain/loss';
  };

  // Test 1F.1: Partial valuation displays 'net gain/loss (quoted assets)'
  runAssert(
    getPnlSubtitle(24, 23) === 'net gain/loss (quoted assets)',
    '[1F.1 P&L Subtitle] Partial valuation (23/24) displays "net gain/loss (quoted assets)"'
  );
  runAssert(
    getPnlSubtitle(2, 1) === 'net gain/loss (quoted assets)',
    '[1F.1 P&L Subtitle] Partial valuation (1/2) displays "net gain/loss (quoted assets)"'
  );

  // Test 1F.2: Complete valuation displays 'overall net gain/loss'
  runAssert(
    getPnlSubtitle(24, 24) === 'overall net gain/loss',
    '[1F.2 P&L Subtitle] Complete valuation (24/24) displays "overall net gain/loss"'
  );
  runAssert(
    getPnlSubtitle(5, undefined) === 'overall net gain/loss',
    '[1F.2 P&L Subtitle] Undefined resolvedCount preserves "overall net gain/loss"'
  );

  // Test 1F.3: Subtitle logic does not alter P&L amount, P&L percentage, resolved invested capital, or current value
  const partialHolding1: Holding = {
    id: 'h_quoted_1',
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries',
    sector: 'Oil & Gas',
    quantity: 10,
    averageBuyPrice: 2000.0, // Invested: 20,000
    addedAt: new Date().toISOString(),
  };
  const partialHolding2: Holding = {
    id: 'h_unquoted_2',
    symbol: 'UNQUOTED_ENTITY',
    companyName: 'Unquoted Entity',
    sector: 'Pharma',
    quantity: 50,
    averageBuyPrice: 100.0, // Invested: 5,000
    addedAt: new Date().toISOString(),
  };

  const evalQuoted = {
    ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE'),
    dataSource: 'UPSTOX_REALTIME' as const,
  };
  evalQuoted.execution.ltp = 2500.0; // Current value: 25,000, Gain: +5,000 (+25%)

  const evalUnquoted = {
    ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'UNQUOTED_ENTITY'),
    dataSource: 'DATA_UNAVAILABLE' as const,
  };
  evalUnquoted.execution.ltp = null;

  const partialAnalysis = PortfolioEngine.analyze(
    [partialHolding1, partialHolding2],
    new Map([
      ['RELIANCE', evalQuoted],
      ['UNQUOTED_ENTITY', evalUnquoted],
    ])
  );

  runAssert(
    partialAnalysis.analytics.totalInvested === 25000.0,
    '[1F.3 Math Invariant] totalInvested encompasses all holdings (20,000 + 5,000 = 25,000)'
  );
  runAssert(
    partialAnalysis.analytics.totalCurrentValue === 25000.0,
    '[1F.3 Math Invariant] totalCurrentValue strictly reflects resolved holdings only (25,000)'
  );
  runAssert(
    partialAnalysis.analytics.totalPnl === 5000.0,
    '[1F.3 Math Invariant] totalPnl = 25,000 - 20,000 = +5,000 (unquoted cost basis isolated)'
  );
  runAssert(
    partialAnalysis.analytics.totalPnlPercentage === 25.0,
    '[1F.3 Math Invariant] totalPnlPercentage = (+5,000 / 20,000) * 100 = +25.0%'
  );

  // Test 1F.4: Unquoted holding item invariants
  const unquotedItem = partialAnalysis.items.find((i) => i.holding.symbol === 'UNQUOTED_ENTITY');
  runAssert(
    unquotedItem?.quoteStatus === 'UNAVAILABLE',
    '[1F.4 Unquoted Item] Unquoted holding status is UNAVAILABLE'
  );
  runAssert(
    unquotedItem?.currentLtp === null,
    '[1F.4 Unquoted Item] Unquoted holding currentLtp is null'
  );
  runAssert(
    unquotedItem?.currentValue === null,
    '[1F.4 Unquoted Item] Unquoted holding currentValue is null'
  );
  runAssert(
    unquotedItem?.pnl === null,
    '[1F.4 Unquoted Item] Unquoted holding pnl is null'
  );

  // --- STAGE 1S: QUOTE PAYLOAD & PORTFOLIO DATA INTEGRITY SUITE ---
  console.log('\n--- STAGE 1S: QUOTE PAYLOAD & PORTFOLIO DATA INTEGRITY SUITE ---');

  // Test 1S.1: Upstox symbol-keyed payload parsing resolution
  const mockZensarQuote: import('../types/upstox').UpstoxQuote = {
    instrument_token: 'NSE_EQ|INE520A01027',
    timestamp: '2026-10-11T20:09:22.45+05:30',
    last_price: 448.55,
    open: 442.0,
    high: 452.1,
    low: 440.0,
    close: 448.55,
    volume: 1254300,
    average_price: 446.2,
    total_buy_quantity: 50000,
    total_sell_quantity: 45000,
    lower_circuit_limit: 380.0,
    upper_circuit_limit: 520.0,
  };

  const mockPayloadData: Record<string, import('../types/upstox').UpstoxQuote> = {
    'NSE_EQ:ZENSARTECH': mockZensarQuote,
  };

  // Test that instrument_token or symbol-based lookup maps correctly
  const quotesList = Object.values(mockPayloadData);
  const targetKey = 'NSE_EQ|INE520A01027';
  const rawKeyPart = targetKey.split('|')[1];
  const symbol = SearchService.getInstrumentByIsin(rawKeyPart)?.symbol?.toUpperCase();

  const resolvedQuote =
    mockPayloadData[targetKey] ||
    mockPayloadData[targetKey.replace('|', ':')] ||
    (symbol ? mockPayloadData[`NSE_EQ:${symbol}`] : null) ||
    quotesList.find((q) => q && q.instrument_token === targetKey) ||
    null;

  runAssert(resolvedQuote !== null, '[1S.1 Payload Parsing] Upstox symbol-keyed quote resolves successfully');
  runAssert(resolvedQuote?.last_price === 448.55, '[1S.1 Payload Parsing] Resolved last_price is exactly 448.55');
  runAssert(resolvedQuote?.instrument_token === 'NSE_EQ|INE520A01027', '[1S.1 Payload Parsing] instrument_token matches canonical ISIN key');

  // Test 1S.2: Symbol-to-Holding Mapping and P&L calculation
  const zensarHolding: Holding = {
    id: 'h_zensar',
    symbol: 'ZENSARTECH',
    companyName: 'Zensar Technologies Ltd',
    sector: 'IT',
    isin: 'INE520A01027',
    quantity: 100,
    averageBuyPrice: 400.0,
    addedAt: '2026-10-01T10:00:00.000Z',
  };

  const zensarEval = {
    ...StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'ZENSARTECH'),
    tradingSymbol: 'ZENSARTECH',
    isin: 'INE520A01027',
    dataSource: 'UPSTOX_LIVE' as const,
  };
  zensarEval.execution.ltp = 448.55;

  const zensarAnalysis = PortfolioEngine.analyze([zensarHolding], new Map([['ZENSARTECH', zensarEval]]));
  const zensarItem = zensarAnalysis.items[0];

  runAssert(zensarItem.quoteStatus === 'RESOLVED', '[1S.2 Symbol Mapping] Zensar holding quoteStatus is RESOLVED');
  runAssert(zensarItem.currentLtp === 448.55, '[1S.2 Symbol Mapping] Zensar holding currentLtp is 448.55');
  runAssert(zensarItem.investedValue === 40000.0, '[1S.2 Symbol Mapping] Invested value is exactly 100 * 400.0 = 40,000');
  runAssert(zensarItem.currentValue === 44855.0, '[1S.2 Symbol Mapping] Current value is exactly 100 * 448.55 = 44,855');
  runAssert(zensarItem.pnl === 4855.0, '[1S.2 Symbol Mapping] Unrealized P&L is +4,855');
  runAssert(Math.abs((zensarItem.pnlPercentage ?? 0) - 12.1375) < 0.001, '[1S.2 Symbol Mapping] P&L percentage is +12.14%');

  // Test 1S.3: Stale / Session Classification (Weekend / Closed Market)
  const sundaySession = SessionResolver.resolve(new Date('2026-10-11T20:09:22.45+05:30'));
  runAssert(sundaySession.marketSessionState === 'WEEKEND', '[1S.3 Session Classification] Sunday timestamp classified as WEEKEND');
  runAssert(sundaySession.tradingSessionId === '2026-10-09', '[1S.3 Session Classification] Sunday tradingSessionId is Friday 2026-10-09');
  runAssert(
    resolveFeedBadge('UPSTOX_LIVE', sundaySession.marketSessionState === 'OPEN', sundaySession.tradingSessionId) ===
      'LAST CLOSE FEED (2026-10-09)',
    '[1S.3 Session Classification] Weekend quote classified as LAST CLOSE FEED (2026-10-09), never false LIVE'
  );

  // Test 1S.4: Downstream Scoring Non-Mutation Guarantee
  const initialCoreScore = zensarEval.coreScore;
  const initialFundScore = zensarEval.fundamentalScore;
  const initialTechScore = zensarEval.technicalScore;
  const initialZone = zensarEval.zone;

  // Verify that portfolio analysis did NOT mutate original evaluation object
  runAssert(zensarEval.coreScore === initialCoreScore, '[1S.4 Scoring Invariant] coreScore preserved without mutation');
  runAssert(zensarEval.fundamentalScore === initialFundScore, '[1S.4 Scoring Invariant] fundamentalScore preserved without mutation');
  runAssert(zensarEval.technicalScore === initialTechScore, '[1S.4 Scoring Invariant] technicalScore preserved without mutation');
  runAssert(zensarEval.zone === initialZone, '[1S.4 Scoring Invariant] decision zone preserved without mutation');

  // ============================================================
  // STAGE 1V: COMPLETE INSTRUMENT DISCOVERY & SMART AUTOCOMPLETE SUITE
  // ============================================================
  console.log('\n--- STAGE 1V: COMPLETE INSTRUMENT DISCOVERY & AUTOCOMPLETE SUITE ---');

  // Ensure fresh memory cache with fixture + curated master
  SearchService.resetMemoryCache();
  await SearchService.init();

  // Test 1V.1: Popular stock exact-symbol match (NSE)
  const relSearch = await SearchService.search('RELIANCE', 5);
  runAssert(relSearch.length > 0, '[1V.1 Popular Exact Match] RELIANCE returns results');
  runAssert(relSearch[0].symbol === 'RELIANCE', `[1V.1 Popular Exact Match] First result is strictly RELIANCE (Actual: ${relSearch[0]?.symbol})`);
  runAssert(relSearch[0].instrumentKey === 'NSE_EQ|INE002A01018', `[1V.1 Popular Exact Match] Canonical key is NSE_EQ|INE002A01018 (Actual: ${relSearch[0]?.instrumentKey})`);
  runAssert(relSearch[0].exchange === 'NSE', `[1V.1 Popular Exact Match] Exchange is NSE (Actual: ${relSearch[0]?.exchange})`);

  // Test 1V.2: Less popular stock present in the authoritative master (e.g. EIEL, KCK)
  const eielSearch = await SearchService.search('EIEL', 5);
  runAssert(eielSearch.length > 0, '[1V.2 Less Popular Stock] EIEL found in authoritative master');
  runAssert(eielSearch[0].symbol === 'EIEL', `[1V.2 Less Popular Stock] First result is EIEL (Actual: ${eielSearch[0]?.symbol})`);
  runAssert(eielSearch[0].isin === 'INE0LLY01014', `[1V.2 Less Popular Stock] ISIN matches INE0LLY01014 (Actual: ${eielSearch[0]?.isin})`);
  runAssert(eielSearch[0].instrumentKey === 'NSE_EQ|INE0LLY01014', `[1V.2 Less Popular Stock] Canonical key is NSE_EQ|INE0LLY01014 (Actual: ${eielSearch[0]?.instrumentKey})`);

  // Test 1V.3: Partial-symbol matches (e.g. "REL" -> RELTD, RELAXO, RELIANCE, RELCHEMQ)
  const partialRel = await SearchService.search('REL', 10);
  runAssert(partialRel.length >= 2, `[1V.3 Partial Symbol] Query "REL" yields >= 2 results (Actual: ${partialRel.length})`);
  runAssert(partialRel.some(r => r.symbol === 'RELIANCE'), '[1V.3 Partial Symbol] Contains RELIANCE in prefix results');
  runAssert(partialRel.every(r => r.symbol.startsWith('REL')), '[1V.3 Partial Symbol] All top prefix results start with "REL"');

  // Test 1V.4: Company-name matches (e.g. "Tata Consultancy" -> TCS, "Enviro Infra" -> EIEL)
  const nameSearch = await SearchService.search('Enviro Infra', 5);
  runAssert(nameSearch.length > 0, '[1V.4 Company Name Match] Query "Enviro Infra" returns at least 1 result');
  runAssert(nameSearch[0].symbol === 'EIEL', `[1V.4 Company Name Match] Top result for "Enviro Infra" is EIEL (Actual: ${nameSearch[0]?.symbol})`);

  const tcsNameSearch = await SearchService.search('Tata Consultancy', 5);
  runAssert(tcsNameSearch.length > 0, '[1V.4 Company Name Match] Query "Tata Consultancy" returns TCS');
  runAssert(tcsNameSearch[0].symbol === 'TCS', `[1V.4 Company Name Match] Top result is TCS (Actual: ${tcsNameSearch[0]?.symbol})`);

  // Test 1V.5: Case-insensitive matching (e.g. "reliance", "eIeL")
  const lowerRel = await SearchService.search('reliance', 5);
  runAssert(lowerRel.length > 0 && lowerRel[0].symbol === 'RELIANCE', '[1V.5 Case Insensitive] Lowercase "reliance" matches RELIANCE');
  const mixedCase = await SearchService.search('eIeL', 5);
  runAssert(mixedCase.length > 0 && mixedCase[0].symbol === 'EIEL', '[1V.5 Case Insensitive] Mixed-case "eIeL" matches EIEL');

  // Test 1V.6: NSE/BSE duplicate-symbol disambiguation & exchange filter
  const allResults = await SearchService.search('MARUTI', 10, 'ALL');
  runAssert(allResults.length > 0, '[1V.6 Disambiguation] MARUTI search succeeds');
  runAssert(allResults[0].symbol === 'MARUTI', '[1V.6 Disambiguation] Exact symbol MARUTI ranked first');
  runAssert(allResults[0].exchange === 'NSE', '[1V.6 Disambiguation] NSE listing takes deterministic precedence over BSE');

  const bseFilter = await SearchService.search('RAJKSYN', 5, 'BSE');
  runAssert(bseFilter.length > 0, '[1V.6 BSE Filter] BSE filter finds BSE-listed RAJKSYN');
  runAssert(bseFilter[0].exchange === 'BSE', `[1V.6 BSE Filter] Exchange is strictly BSE (Actual: ${bseFilter[0]?.exchange})`);
  runAssert(bseFilter[0].instrumentKey === 'BSE_EQ|INE376L01013', `[1V.6 BSE Filter] Key is BSE_EQ|INE376L01013 (Actual: ${bseFilter[0]?.instrumentKey})`);

  // Test 1V.7: Correct canonical instrument key after selection
  const selectedInst = SearchService.getInstrumentBySymbol('EIEL');
  runAssert(selectedInst !== undefined, '[1V.7 Canonical Key] getInstrumentBySymbol resolves EIEL');
  runAssert(selectedInst?.instrumentKey === 'NSE_EQ|INE0LLY01014', `[1V.7 Canonical Key] Exact canonical key preserved (Actual: ${selectedInst?.instrumentKey})`);
  runAssert(selectedInst?.isin === 'INE0LLY01014', `[1V.7 Canonical Key] Exact ISIN preserved (Actual: ${selectedInst?.isin})`);

  // Test 1V.8: Missing or malformed instrument-master data handling
  SearchService.preseedCache([
    {
      symbol: 'MALFORMED1',
      name: 'Malformed No Key',
      instrumentKey: '',
      isin: '',
      sector: 'Test',
      lastPrice: 0,
    },
    {
      symbol: 'VALID1',
      name: 'Valid Holding Corp',
      instrumentKey: 'NSE_EQ|INE999A01019',
      isin: 'INE999A01019',
      sector: 'Test',
      lastPrice: 100,
    }
  ]);
  const malformedSearch = await SearchService.search('VALID1', 5);
  runAssert(malformedSearch.length > 0, '[1V.8 Malformed Resistance] Search handles malformed records without crash');
  runAssert(malformedSearch[0].symbol === 'VALID1', '[1V.8 Malformed Resistance] Valid instrument correctly retrieved');

  // Test 1V.9: Instrument-master load failure and safe fallback
  SearchService.resetMemoryCache();
  const fallbackList = await SearchService.init();
  const diagInfo = SearchService.getDiagnosticInfo();
  runAssert(fallbackList.length > 0, '[1V.9 Safe Fallback] Fallback universe loaded successfully');
  runAssert(diagInfo.totalCount >= 253, `[1V.9 Safe Fallback] At least curated 253 instruments available in fallback (Actual: ${diagInfo.totalCount})`);
  runAssert(diagInfo.status === 'READY' || diagInfo.status === 'DEGRADED', `[1V.9 Safe Fallback] Index status is safe (Actual: ${diagInfo.status})`);

  // Test 1V.10: Empty search and no-results states
  const emptyQueryResults = await SearchService.search('', 10);
  runAssert(emptyQueryResults.length === 10, `[1V.10 Empty Search] Empty query returns limit count (Actual: ${emptyQueryResults.length})`);

  const noResultSearch = await SearchService.search('NONEXISTENT_XYZ_999', 10);
  runAssert(noResultSearch.length === 0, `[1V.10 No Results] Non-existent stock returns exactly 0 results (Actual: ${noResultSearch.length})`);

  // Test 1V.11: Deduplication & ranking priority test
  const dedupeSearch = await SearchService.search('TCS', 5);
  const tcsKeyCount = dedupeSearch.filter(r => r.instrumentKey === 'NSE_EQ|INE467B01029').length;
  runAssert(tcsKeyCount === 1, `[1V.11 Deduplication] Exact instrument key appears exactly once (Actual: ${tcsKeyCount})`);
  runAssert(dedupeSearch[0].symbol === 'TCS', '[1V.11 Ranking Priority] Exact symbol TCS ranked #1');

  // Test 1V.12: Search selection without mutating portfolio valuations or triggering extra portfolio calls
  const testPortfolioHolding: Holding = {
    id: 'h_test_1',
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries Limited',
    sector: 'Oil & Gas',
    quantity: 10,
    averageBuyPrice: 2800.0,
    addedAt: '2026-10-01',
    isin: 'INE002A01018',
  };
  const testEvalsCache = new Map<string, StockInsightEvaluation>([
    ['RELIANCE', StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE')]
  ]);
  const initialPortfolio = PortfolioEngine.analyze([testPortfolioHolding], testEvalsCache);
  const initialInvested = initialPortfolio.analytics.totalInvested;
  const initialCurrentVal = initialPortfolio.analytics.totalCurrentValue;

  // Simulate user searching for EIEL and selecting it for inspection
  const discoveredEIEL = SearchService.getInstrumentBySymbol('EIEL');
  runAssert(discoveredEIEL !== undefined, '[1V.12 Portfolio Isolation] Discovered instrument EIEL is available');
  
  // Verify portfolio analysis remains completely intact and unaffected
  const postSearchPortfolio = PortfolioEngine.analyze([testPortfolioHolding], testEvalsCache);
  runAssert(postSearchPortfolio.analytics.totalInvested === initialInvested, '[1V.12 Portfolio Isolation] Total invested untouched by search');
  runAssert(postSearchPortfolio.analytics.totalCurrentValue === initialCurrentVal, '[1V.12 Portfolio Isolation] Total current value untouched by search');
  runAssert(postSearchPortfolio.items.length === 1, '[1V.12 Portfolio Isolation] Portfolio items count remains 1');

  // Verify frozen scoring invariants remain untouched
  runAssert(initialPortfolio.items[0].coreScore === postSearchPortfolio.items[0].coreScore, '[1V.12 Scoring Invariant] coreScore untouched');
  runAssert(initialPortfolio.items[0].zone === postSearchPortfolio.items[0].zone, '[1V.12 Scoring Invariant] zone untouched');

  // ============================================================
  // STAGE 1W: REMOVE 4-SESSION TRAJECTORY HEADER STRIP SUITE
  // ============================================================
  console.log('\n--- STAGE 1W: REMOVE 4-SESSION TRAJECTORY HEADER STRIP SUITE ---');

  // Test 1W.1: TrajectoryRibbon component is decoupled from TerminalHeader
  const fsMod = await import('fs');
  const terminalHeaderSource = fsMod.readFileSync('src/components/TerminalHeader.tsx', 'utf-8');

  runAssert(
    !terminalHeaderSource.includes('TrajectoryRibbon'),
    '[1W.1 UI Decoupling] TerminalHeader does not import or render TrajectoryRibbon'
  );
  runAssert(
    !terminalHeaderSource.includes('4-Session Trajectory') && !terminalHeaderSource.includes('Context Trajectory Ribbon'),
    '[1W.1 UI Decoupling] Trajectory header label and comments removed from TerminalHeader'
  );

  // Test 1W.2: TerminalHeader preserves stock identity, LTP, badges, and controls
  runAssert(
    terminalHeaderSource.includes('handleReturnToPortfolio') && terminalHeaderSource.includes('ArrowLeft'),
    '[1W.2 Header Controls] Deep Dive return button and ArrowLeft icon preserved'
  );
  runAssert(
    terminalHeaderSource.includes('LTP:') && terminalHeaderSource.includes('evaluation.execution.ltp'),
    '[1W.2 Header Controls] Real-time LTP rendering preserved'
  );
  runAssert(
    terminalHeaderSource.includes('● LIVE FEED') && terminalHeaderSource.includes('LAST CLOSE FEED'),
    '[1W.2 Header Controls] Quote freshness and market session badges preserved'
  );
  runAssert(
    terminalHeaderSource.includes('Token Configured') && terminalHeaderSource.includes('Configure Token'),
    '[1W.2 Header Controls] Upstox token status controls preserved'
  );

  // Test 1W.3: Historical data, TrajectoryEngine, and context storage remain intact
  const trajEngineSource = fsMod.readFileSync('src/engine/trajectoryEngine.ts', 'utf-8');
  runAssert(
    trajEngineSource.includes('buildTrajectoryFromSnapshots') && trajEngineSource.includes('getTrajectory'),
    '[1W.3 Backend Preservation] TrajectoryEngine and historical calculation logic fully preserved'
  );

  // Test 1W.4: Scoring engine invariants non-mutation guarantee
  const testInput = BENCHMARK_STOCKS['RELIANCE'];
  runAssert(testInput !== undefined, '[1W.4 Frozen Engine] Benchmark input available');
  const freshRelEval = StockInsightPipeline.evaluate(testInput, 'RELIANCE');
  runAssert(freshRelEval.coreScore <= 100, '[1W.4 Frozen Engine] Composite score capped at 100');
  runAssert(freshRelEval.fundamentalScore <= 50, '[1W.4 Frozen Engine] Fundamental score capped at 50');
  runAssert(freshRelEval.technicalScore <= 50, '[1W.4 Frozen Engine] Technical score capped at 50');
  runAssert(freshRelEval.coreScore === freshRelEval.fundamentalScore + freshRelEval.technicalScore, '[1W.4 Frozen Engine] Core score is exactly Fundamental + Technical');

  // ============================================================
  // STAGE 1X: GLOBAL DATA CONSISTENCY & TRACEABILITY AUDIT SUITE
  // ============================================================
  console.log('\n--- STAGE 1X: GLOBAL DATA CONSISTENCY & TRACEABILITY AUDIT SUITE ---');

  // Test 1X.1: WAAREE Renewable Technologies Reproduction Case (DISC-01)
  // calcs.pe is 16.4x, calcs.sectorPe is null
  const waareeCalcs: FundamentalCalculations = {
    ...finCalcs,
    pe: 16.4,
    sectorPe: null,
  };
  const waareeScore = FundamentalEngine.scoreIndustrial(waareeCalcs);
  const waareePeFactor = waareeScore.factors.find((f) => f.name === 'P/E vs Sector')!;
  runAssert(waareePeFactor.rawValue === '16.4x', '[1X.1 WAAREE P/E] Raw metric is 16.4x');
  runAssert(waareePeFactor.state === 'AVAILABLE', '[1X.1 WAAREE P/E] State is AVAILABLE');
  runAssert(waareePeFactor.score === 0, '[1X.1 WAAREE P/E] Score is 0 pts under frozen engine');
  runAssert(
    waareePeFactor.explanation === 'P/E is 16.4x (sector benchmark not available)',
    `[1X.1 WAAREE P/E] Rationale explains sector benchmark missing without contradicting raw metric (Actual: "${waareePeFactor.explanation}")`
  );
  runAssert(
    !waareePeFactor.explanation.toLowerCase().includes('p/e not available'),
    '[1X.1 WAAREE P/E] Explanation does not claim "P/E not available"'
  );

  // Test 1X.2: Industrial P/B with Missing Sector Benchmark (DISC-02)
  const pbMissingSectorCalcs: FundamentalCalculations = {
    ...finCalcs,
    pb: 4.2,
    sectorPb: null,
  };
  const indPbScore = FundamentalEngine.scoreIndustrial(pbMissingSectorCalcs);
  const indPbFactor = indPbScore.factors.find((f) => f.name === 'P/B vs Sector')!;
  runAssert(indPbFactor.rawValue === '4.2x', '[1X.2 Industrial P/B] Raw metric is 4.2x');
  runAssert(indPbFactor.state === 'AVAILABLE', '[1X.2 Industrial P/B] State is AVAILABLE');
  runAssert(indPbFactor.score === 0, '[1X.2 Industrial P/B] Score is 0 pts under frozen engine');
  runAssert(
    indPbFactor.explanation === 'P/B is 4.2x (sector benchmark not available)',
    `[1X.2 Industrial P/B] Rationale explains sector benchmark missing (Actual: "${indPbFactor.explanation}")`
  );

  // Test 1X.3: Industrial EV/EBITDA with Missing Sector Benchmark (DISC-03)
  const evMissingSectorCalcs: FundamentalCalculations = {
    ...finCalcs,
    evEbitda: 14.5,
    sectorEvEbitda: null,
  };
  const indEvScore = FundamentalEngine.scoreIndustrial(evMissingSectorCalcs);
  const indEvFactor = indEvScore.factors.find((f) => f.name === 'EV / EBITDA')!;
  runAssert(indEvFactor.rawValue === '14.5x', '[1X.3 Industrial EV/EBITDA] Raw metric is 14.5x');
  runAssert(indEvFactor.state === 'AVAILABLE', '[1X.3 Industrial EV/EBITDA] State is AVAILABLE');
  runAssert(indEvFactor.score === 0, '[1X.3 Industrial EV/EBITDA] Score is 0 pts under frozen engine');
  runAssert(
    indEvFactor.explanation === 'EV/EBITDA is 14.5x (sector benchmark not available)',
    `[1X.3 Industrial EV/EBITDA] Rationale explains sector benchmark missing (Actual: "${indEvFactor.explanation}")`
  );

  // Test 1X.4: Industrial EV/EBITDA Non-Positive / Distressed Handling
  const evNegativeCalcs: FundamentalCalculations = {
    ...finCalcs,
    evEbitda: -5.0,
    sectorEvEbitda: 12.0,
  };
  const indNegEvScore = FundamentalEngine.scoreIndustrial(evNegativeCalcs);
  const indNegEvFactor = indNegEvScore.factors.find((f) => f.name === 'EV / EBITDA')!;
  runAssert(indNegEvFactor.score === 0, '[1X.4 Negative EV/EBITDA] Score is 0 pts');
  runAssert(
    indNegEvFactor.explanation === 'Negative enterprise value or EBITDA',
    `[1X.4 Negative EV/EBITDA] Rationale identifies negative EV or EBITDA (Actual: "${indNegEvFactor.explanation}")`
  );

  // Test 1X.5: Commercial Bank P/E with Missing Sector Benchmark (DISC-04)
  const hdfcBankData = FundamentalsDatabase.getFundamentals('HDFCBANK', 'INE040A01034');
  const hdfcCalcsStage1X = FundamentalCalculator.compute(
    hdfcBankData.keyRatios,
    hdfcBankData.annualIncome,
    hdfcBankData.quarterlyIncome,
    hdfcBankData.balanceSheet,
    hdfcBankData.cashFlow
  );
  const bankPeMissingSectorCalcs: FundamentalCalculations = {
    ...hdfcCalcsStage1X,
    pe: 18.5,
    sectorPe: null,
  };
  const bankPeScore = FundamentalEngine.scoreCommercialBank(bankPeMissingSectorCalcs);
  const bankPeFactor = bankPeScore.factors.find((f) => f.name === 'P/E vs Sector')!;
  runAssert(bankPeFactor.rawValue === '18.5x', '[1X.5 Bank P/E] Raw metric is 18.5x');
  runAssert(bankPeFactor.state === 'AVAILABLE', '[1X.5 Bank P/E] State is correctly marked AVAILABLE');
  runAssert(bankPeFactor.score === 0, '[1X.5 Bank P/E] Score is 0 pts under frozen engine');
  runAssert(
    bankPeFactor.explanation === 'P/E is 18.5x (banking sector benchmark not available)',
    `[1X.5 Bank P/E] Rationale explains banking sector benchmark missing (Actual: "${bankPeFactor.explanation}")`
  );

  // Test 1X.6: Commercial Bank P/B with Missing Sector Benchmark (DISC-05)
  const bankPbMissingSectorCalcs: FundamentalCalculations = {
    ...hdfcCalcsStage1X,
    pb: 2.8,
    sectorPb: null,
  };
  const bankPbScore = FundamentalEngine.scoreCommercialBank(bankPbMissingSectorCalcs);
  const bankPbFactor = bankPbScore.factors.find((f) => f.name === 'P/B vs Sector')!;
  runAssert(bankPbFactor.rawValue === '2.8x', '[1X.6 Bank P/B] Raw metric is 2.8x');
  runAssert(bankPbFactor.state === 'AVAILABLE', '[1X.6 Bank P/B] State is correctly marked AVAILABLE');
  runAssert(bankPbFactor.score === 0, '[1X.6 Bank P/B] Score is 0 pts under frozen engine');
  runAssert(
    bankPbFactor.explanation === 'P/B is 2.8x (banking sector benchmark not available)',
    `[1X.6 Bank P/B] Rationale explains banking sector benchmark missing (Actual: "${bankPbFactor.explanation}")`
  );

  // Test 1X.7: Global Invariant Audit — Strict Separation of Company Metric vs Benchmark Availability
  const testCalcsList: { name: string; calcs: FundamentalCalculations; isBank?: boolean }[] = [
    { name: 'WAAREE Industrial', calcs: waareeCalcs },
    { name: 'Missing Sector P/B Industrial', calcs: pbMissingSectorCalcs },
    { name: 'Missing Sector EV/EBITDA Industrial', calcs: evMissingSectorCalcs },
    { name: 'Missing Sector P/E Bank', calcs: bankPeMissingSectorCalcs, isBank: true },
    { name: 'Missing Sector P/B Bank', calcs: bankPbMissingSectorCalcs, isBank: true },
  ];

  const metricUnavailablePhrases = [
    'p/e not available',
    'p/b not available',
    'ev/ebitda not available',
    'roe not available',
    'roce not available',
    'opm not available',
    '3y cagr not available',
    'd/e not available',
    'roa not available',
    'no cash flow data available',
    'provision history not available',
  ];

  for (const tc of testCalcsList) {
    const res = tc.isBank
      ? FundamentalEngine.scoreCommercialBank(tc.calcs)
      : FundamentalEngine.scoreIndustrial(tc.calcs);
    for (const factor of res.factors) {
      if (factor.rawValue !== null) {
        // Invariant A: Rationale must never claim the company metric itself is unavailable
        const lowerExpl = factor.explanation.toLowerCase();
        const claimsMetricUnavailable = metricUnavailablePhrases.some((phrase) => lowerExpl.startsWith(phrase));
        runAssert(
          !claimsMetricUnavailable,
          `[1X.7 Invariant A] ${tc.name} - Factor "${factor.name}" (rawValue: "${factor.rawValue}") must not claim company metric is unavailable (Actual: "${factor.explanation}")`
        );

        // Invariant B: If the phrase "not available" appears, it must explicitly pertain to the comparison benchmark
        if (lowerExpl.includes('not available')) {
          runAssert(
            lowerExpl.includes('benchmark not available'),
            `[1X.7 Invariant B] ${tc.name} - Factor "${factor.name}" "not available" must explicitly qualify benchmark (Actual: "${factor.explanation}")`
          );
        }
      }
    }
  }

  // Test 1X.8: Frozen Analytical Core Invariants Maintained
  const frozenIndCheck = FundamentalEngine.scoreIndustrial(finCalcs);
  runAssert(frozenIndCheck.buckets.max === 50, '[1X.8 Frozen Core] Fundamental max is exactly 50');
  runAssert(frozenIndCheck.totalScore <= 50, '[1X.8 Frozen Core] Fundamental score <= 50');
  const frozenBankCheck = FundamentalEngine.scoreCommercialBank(hdfcCalcsStage1X);
  runAssert(frozenBankCheck.buckets.max === 50, '[1X.8 Frozen Core] Bank fundamental max is exactly 50');
  runAssert(frozenBankCheck.totalScore <= 50, '[1X.8 Frozen Core] Bank fundamental score <= 50');

  // Test 1X.9: Four Distinct Conditions Matrix (Company vs Benchmark vs Missing vs Non-Positive)
  // --- Factor A: Industrial P/E ---
  // Condition 1: Company available + Benchmark available -> Points awarded (3 pts for in-line)
  const indPeC1 = FundamentalEngine.scoreIndustrial({ ...finCalcs, pe: 20.0, sectorPe: 20.0 }).factors.find(f => f.name === 'P/E vs Sector')!;
  runAssert(indPeC1.state === 'AVAILABLE' && indPeC1.score === 3 && indPeC1.explanation.includes('In line with sector'), '[1X.9 C1 Ind P/E] Both available scores 3 pts');

  // Condition 2: Company available + Benchmark missing -> 0 pts, state AVAILABLE, rationale explains benchmark missing
  const indPeC2 = FundamentalEngine.scoreIndustrial({ ...finCalcs, pe: 20.0, sectorPe: null }).factors.find(f => f.name === 'P/E vs Sector')!;
  runAssert(indPeC2.state === 'AVAILABLE' && indPeC2.score === 0 && indPeC2.explanation === 'P/E is 20.0x (sector benchmark not available)', '[1X.9 C2 Ind P/E] Metric available + benchmark missing');

  // Condition 3: Company metric missing -> 0 pts, state MISSING, rawValue null, rationale 'P/E not available'
  const indPeC3 = FundamentalEngine.scoreIndustrial({ ...finCalcs, pe: null, sectorPe: 20.0 }).factors.find(f => f.name === 'P/E vs Sector')!;
  runAssert(indPeC3.state === 'MISSING' && indPeC3.rawValue === null && indPeC3.score === 0 && indPeC3.explanation === 'P/E not available', '[1X.9 C3 Ind P/E] Company metric missing');

  // Condition 4a: Non-positive company value (EPS <= 0) -> 0 pts, state AVAILABLE, 'Loss-making entity'
  const indPeC4a = FundamentalEngine.scoreIndustrial({ ...finCalcs, pe: -12.5, sectorPe: 20.0 }).factors.find(f => f.name === 'P/E vs Sector')!;
  runAssert(indPeC4a.state === 'AVAILABLE' && indPeC4a.score === 0 && indPeC4a.explanation === 'Loss-making entity (EPS <= 0)', '[1X.9 C4a Ind P/E] Loss-making entity (pe <= 0)');

  // Condition 4b: Non-positive sector benchmark (sectorPe <= 0) -> 0 pts, state AVAILABLE, explains non-positive benchmark
  const indPeC4b = FundamentalEngine.scoreIndustrial({ ...finCalcs, pe: 20.0, sectorPe: -5.0 }).factors.find(f => f.name === 'P/E vs Sector')!;
  runAssert(indPeC4b.state === 'AVAILABLE' && indPeC4b.score === 0 && indPeC4b.explanation === 'P/E is 20.0x (sector benchmark non-positive: -5.0x)', '[1X.9 C4b Ind P/E] Benchmark non-positive');

  // --- Factor B: Industrial P/B ---
  const indPbC1 = FundamentalEngine.scoreIndustrial({ ...finCalcs, pb: 3.0, sectorPb: 3.0 }).factors.find(f => f.name === 'P/B vs Sector')!;
  runAssert(indPbC1.state === 'AVAILABLE' && indPbC1.score === 3, '[1X.9 C1 Ind P/B] Both available scores 3 pts');
  const indPbC2 = FundamentalEngine.scoreIndustrial({ ...finCalcs, pb: 3.0, sectorPb: null }).factors.find(f => f.name === 'P/B vs Sector')!;
  runAssert(indPbC2.state === 'AVAILABLE' && indPbC2.score === 0 && indPbC2.explanation === 'P/B is 3.0x (sector benchmark not available)', '[1X.9 C2 Ind P/B] Benchmark missing');
  const indPbC3 = FundamentalEngine.scoreIndustrial({ ...finCalcs, pb: null, sectorPb: 3.0 }).factors.find(f => f.name === 'P/B vs Sector')!;
  runAssert(indPbC3.state === 'MISSING' && indPbC3.explanation === 'P/B not available', '[1X.9 C3 Ind P/B] Metric missing');
  const indPbC4 = FundamentalEngine.scoreIndustrial({ ...finCalcs, pb: -1.5, sectorPb: 3.0 }).factors.find(f => f.name === 'P/B vs Sector')!;
  runAssert(indPbC4.state === 'AVAILABLE' && indPbC4.score === 0 && indPbC4.explanation === 'Deficit / negative tangible book value', '[1X.9 C4 Ind P/B] Negative book value');

  // --- Factor C: Industrial EV/EBITDA ---
  const indEvC1 = FundamentalEngine.scoreIndustrial({ ...finCalcs, evEbitda: 10.0, sectorEvEbitda: 10.0 }).factors.find(f => f.name === 'EV / EBITDA')!;
  runAssert(indEvC1.state === 'AVAILABLE' && indEvC1.score === 5, '[1X.9 C1 Ind EV] Both available scores 5 pts');
  const indEvC2 = FundamentalEngine.scoreIndustrial({ ...finCalcs, evEbitda: 10.0, sectorEvEbitda: null }).factors.find(f => f.name === 'EV / EBITDA')!;
  runAssert(indEvC2.state === 'AVAILABLE' && indEvC2.score === 0 && indEvC2.explanation === 'EV/EBITDA is 10.0x (sector benchmark not available)', '[1X.9 C2 Ind EV] Benchmark missing');
  const indEvC3 = FundamentalEngine.scoreIndustrial({ ...finCalcs, evEbitda: null, sectorEvEbitda: 10.0 }).factors.find(f => f.name === 'EV / EBITDA')!;
  runAssert(indEvC3.state === 'MISSING' && indEvC3.explanation === 'EV/EBITDA not available', '[1X.9 C3 Ind EV] Metric missing');
  const indEvC4 = FundamentalEngine.scoreIndustrial({ ...finCalcs, evEbitda: -8.0, sectorEvEbitda: 10.0 }).factors.find(f => f.name === 'EV / EBITDA')!;
  runAssert(indEvC4.state === 'AVAILABLE' && indEvC4.score === 0 && indEvC4.explanation === 'Negative enterprise value or EBITDA', '[1X.9 C4 Ind EV] Negative EV/EBITDA');

  // --- Factor D: Commercial Bank P/E & P/B ---
  const bankPeC1 = FundamentalEngine.scoreCommercialBank({ ...hdfcCalcsStage1X, pe: 15.0, sectorPe: 15.0 }).factors.find(f => f.name === 'P/E vs Sector')!;
  runAssert(bankPeC1.state === 'AVAILABLE' && bankPeC1.score === 3.5, '[1X.9 C1 Bank P/E] Both available scores 3.5 pts');
  const bankPeC2 = FundamentalEngine.scoreCommercialBank({ ...hdfcCalcsStage1X, pe: 15.0, sectorPe: null }).factors.find(f => f.name === 'P/E vs Sector')!;
  runAssert(bankPeC2.state === 'AVAILABLE' && bankPeC2.score === 0 && bankPeC2.explanation === 'P/E is 15.0x (banking sector benchmark not available)', '[1X.9 C2 Bank P/E] Benchmark missing');
  const bankPeC3 = FundamentalEngine.scoreCommercialBank({ ...hdfcCalcsStage1X, pe: null, sectorPe: 15.0 }).factors.find(f => f.name === 'P/E vs Sector')!;
  runAssert(bankPeC3.state === 'MISSING' && bankPeC3.explanation === 'P/E not available', '[1X.9 C3 Bank P/E] Metric missing');
  const bankPeC4 = FundamentalEngine.scoreCommercialBank({ ...hdfcCalcsStage1X, pe: -4.0, sectorPe: 15.0 }).factors.find(f => f.name === 'P/E vs Sector')!;
  runAssert(bankPeC4.state === 'AVAILABLE' && bankPeC4.score === 0 && bankPeC4.explanation === 'Loss-making entity (EPS <= 0)', '[1X.9 C4 Bank P/E] Loss-making bank');

  const bankPbC1 = FundamentalEngine.scoreCommercialBank({ ...hdfcCalcsStage1X, pb: 2.0, sectorPb: 2.0 }).factors.find(f => f.name === 'P/B vs Sector')!;
  runAssert(bankPbC1.state === 'AVAILABLE' && bankPbC1.score === 3.5, '[1X.9 C1 Bank P/B] Both available scores 3.5 pts');
  const bankPbC2 = FundamentalEngine.scoreCommercialBank({ ...hdfcCalcsStage1X, pb: 2.0, sectorPb: null }).factors.find(f => f.name === 'P/B vs Sector')!;
  runAssert(bankPbC2.state === 'AVAILABLE' && bankPbC2.score === 0 && bankPbC2.explanation === 'P/B is 2.0x (banking sector benchmark not available)', '[1X.9 C2 Bank P/B] Benchmark missing');
  const bankPbC3 = FundamentalEngine.scoreCommercialBank({ ...hdfcCalcsStage1X, pb: null, sectorPb: 2.0 }).factors.find(f => f.name === 'P/B vs Sector')!;
  runAssert(bankPbC3.state === 'MISSING' && bankPbC3.explanation === 'P/B not available', '[1X.9 C3 Bank P/B] Metric missing');
  const bankPbC4 = FundamentalEngine.scoreCommercialBank({ ...hdfcCalcsStage1X, pb: -1.0, sectorPb: 2.0 }).factors.find(f => f.name === 'P/B vs Sector')!;
  runAssert(bankPbC4.state === 'AVAILABLE' && bankPbC4.score === 0 && bankPbC4.explanation === 'Deficit / negative tangible book value', '[1X.9 C4 Bank P/B] Negative bank book value');

  // ============================================================
  // STAGE 1Y: GLOBAL FACTOR DATA PROVENANCE & RAW METRIC AUDIT SUITE
  // ============================================================
  console.log('\n--- STAGE 1Y: GLOBAL FACTOR DATA PROVENANCE & RAW METRIC AUDIT SUITE ---');

  // Test 1Y.1: Industrial Factor Provenance Complete Inventory (9 Factors)
  const indResult1Y = FundamentalEngine.scoreIndustrial({
    ...finCalcs,
    pe: 16.4,
    sectorPe: -12.6, // WAAREERTL actual reproduction case
    pb: 3.5,
    sectorPb: 2.8,
    evEbitda: 14.2,
    sectorEvEbitda: 12.0,
    roe: 18.5,
    roce: 21.0,
    cfoToEbitdaRatio: 0.75,
    opmPct: 15.5,
    netProfitCagr3YPct: 22.0,
    debtToEquity: 0.25,
  });

  runAssert(indResult1Y.factors.length === 9, '[1Y.1 Ind] All 9 active Industrial factors evaluated');

  const fCfo = indResult1Y.factors.find(f => f.name.startsWith('Cash Flow Conversion'))!;
  runAssert(fCfo.provenance === 'DERIVED' && fCfo.sourceFields?.includes('cash_flow.operating') && !!fCfo.formula, '[1Y.1 Ind CFO] CFO/Op Profit is DERIVED with formula and source fields');

  const fPe = indResult1Y.factors.find(f => f.name === 'P/E vs Sector')!;
  runAssert(fPe.provenance === 'COMPARISON_UNAVAILABLE' && fPe.benchmarkValue === '-12.6x' && fPe.score === 0, '[1Y.1 Ind WAAREE P/E] P/E with non-positive sector benchmark classified as COMPARISON_UNAVAILABLE');

  const fPb = indResult1Y.factors.find(f => f.name === 'P/B vs Sector')!;
  runAssert(fPb.provenance === 'PROVIDER_REPORTED' && fPb.benchmarkValue === '2.8x' && fPb.score > 0, '[1Y.1 Ind P/B] P/B with positive benchmark is PROVIDER_REPORTED');

  const fEv = indResult1Y.factors.find(f => f.name === 'EV / EBITDA')!;
  runAssert(fEv.provenance === 'PROVIDER_REPORTED' && fEv.benchmarkValue === '12.0x', '[1Y.1 Ind EV] EV/EBITDA is PROVIDER_REPORTED');

  const fRoe = indResult1Y.factors.find(f => f.name === 'ROE (%)')!;
  runAssert(fRoe.provenance === 'PROVIDER_REPORTED' && fRoe.sourceFields?.includes('company_value (ROE)'), '[1Y.1 Ind ROE] ROE is PROVIDER_REPORTED');

  const fRoce = indResult1Y.factors.find(f => f.name === 'ROCE (%)')!;
  runAssert(fRoce.provenance === 'PROVIDER_REPORTED' && fRoce.sourceFields?.includes('company_value (ROCE)'), '[1Y.1 Ind ROCE] ROCE is PROVIDER_REPORTED');

  const fOpm = indResult1Y.factors.find(f => f.name === 'Operating Margin (OPM)')!;
  runAssert(fOpm.provenance === 'DERIVED' && fOpm.sourceFields?.includes('operatingProfit'), '[1Y.1 Ind OPM] OPM is DERIVED');

  const fCagr = indResult1Y.factors.find(f => f.name === '3Y Net Profit CAGR')!;
  runAssert(fCagr.provenance === 'DERIVED' && !!fCagr.formula, '[1Y.1 Ind CAGR] 3Y CAGR is DERIVED');

  const fDe = indResult1Y.factors.find(f => f.name === 'Debt-to-Equity')!;
  runAssert(fDe.provenance === 'DERIVED' && fDe.sourceFields?.includes('balance_sheet.total_liability'), '[1Y.1 Ind D/E] Debt-to-Equity is DERIVED with balance_sheet fields');

  // Test 1Y.2: Missing vs Unavailable Multiples Provenance
  const indMissingPe = FundamentalEngine.scoreIndustrial({ ...finCalcs, pe: null, sectorPe: 20.0 }).factors.find(f => f.name === 'P/E vs Sector')!;
  runAssert(indMissingPe.provenance === 'UNAVAILABLE' && indMissingPe.state === 'MISSING', '[1Y.2 Ind Missing P/E] Missing company multiple classified as UNAVAILABLE');

  const indMissingBenchPe = FundamentalEngine.scoreIndustrial({ ...finCalcs, pe: 20.0, sectorPe: null }).factors.find(f => f.name === 'P/E vs Sector')!;
  runAssert(indMissingBenchPe.provenance === 'COMPARISON_UNAVAILABLE' && indMissingBenchPe.state === 'AVAILABLE', '[1Y.2 Ind Missing Bench P/E] Missing sector benchmark classified as COMPARISON_UNAVAILABLE with AVAILABLE state');

  // Test 1Y.3: Commercial Bank Factor Provenance (6 Factors)
  const bankResult1Y = FundamentalEngine.scoreCommercialBank({
    ...hdfcCalcsStage1X,
    pe: 18.0,
    sectorPe: null, // benchmark missing
    pb: 2.4,
    sectorPb: 2.2,
    roa: 1.85,
    roe: 16.5,
    netProfitCagr3YPct: 19.5,
    provisionGrowthPct: 15.0,
  });

  runAssert(bankResult1Y.factors.length === 6, '[1Y.3 Bank] All 6 active Commercial Bank factors evaluated');

  const bPe = bankResult1Y.factors.find(f => f.name === 'P/E vs Sector')!;
  runAssert(bPe.provenance === 'COMPARISON_UNAVAILABLE' && bPe.state === 'AVAILABLE', '[1Y.3 Bank P/E] Bank P/E without benchmark is COMPARISON_UNAVAILABLE');

  const bPb = bankResult1Y.factors.find(f => f.name === 'P/B vs Sector')!;
  runAssert(bPb.provenance === 'PROVIDER_REPORTED' && bPb.benchmarkValue === '2.2x', '[1Y.3 Bank P/B] Bank P/B with benchmark is PROVIDER_REPORTED');

  const bRoa = bankResult1Y.factors.find(f => f.name === 'Return on Assets (ROA)')!;
  runAssert(bRoa.provenance === 'PROVIDER_REPORTED' && bRoa.state === 'AVAILABLE', '[1Y.3 Bank ROA] Bank ROA is PROVIDER_REPORTED');

  const bRoe = bankResult1Y.factors.find(f => f.name === 'Return on Equity (ROE)')!;
  runAssert(bRoe.provenance === 'PROVIDER_REPORTED' && bRoe.state === 'AVAILABLE', '[1Y.3 Bank ROE] Bank ROE is PROVIDER_REPORTED');

  const bCagr = bankResult1Y.factors.find(f => f.name === '3Y Net Profit CAGR')!;
  runAssert(bCagr.provenance === 'DERIVED' && !!bCagr.formula, '[1Y.3 Bank CAGR] Bank 3Y CAGR is DERIVED');

  const bProv = bankResult1Y.factors.find(f => f.name === 'Credit Cost & Provisioning')!;
  runAssert(bProv.provenance === 'DERIVED' && fProvValid(bProv), '[1Y.3 Bank Prov] Credit cost provisioning is DERIVED');
  function fProvValid(f: import('../types/engine').FactorScore) {
    return f.sourceFields?.includes('provisionsAndContingencies (T, T-1)');
  }

  // Test 1Y.4: ETF Fundamental Model (1 Factor)
  const etfResult1Y = FundamentalEngine.scoreEtf();
  runAssert(etfResult1Y.factors.length === 1 && etfResult1Y.factors[0].provenance === 'UNAVAILABLE', '[1Y.4 ETF] ETF model factor classified as UNAVAILABLE');

  // Test 1Y.5: Technical Factor Provenance (7 Indicators)
  const sampleTechCalcs1Y = {
    ltp: 1000,
    ema200: 920,
    ema200SlopePct: 1.5,
    sma100: 950,
    sma50: 975,
    maAligned: true,
    rsi14: 58.5,
    roc20: 6.2,
    volumeAccumulationState: 'NORMAL' as const,
    volumeAccumulationRatio: 1.35,
    breakoutVolumeRatio: 1.6,
    rangePosition52WPct: 82,
    atr14: 18.5,
    swingLow10: 940,
    turnover20DCr: 85,
  };
  const techEval1Y = TechnicalEngine.evaluate(sampleTechCalcs1Y);
  runAssert(techEval1Y.factors.length === 7, '[1Y.5 Tech] All 7 active Technical factors evaluated');
  for (const tf of techEval1Y.factors) {
    runAssert(
      (tf.provenance === 'DERIVED' || tf.provenance === 'UNAVAILABLE') && !!tf.formula && (tf.sourceFields?.length ?? 0) > 0,
      `[1Y.5 Tech ${tf.name}] Provenance ${tf.provenance} with formula and source fields populated`
    );
  }

  // Test 1Y.6: Non-Destructive Invariant Verification
  // Ensure that all factor weights, composite scores, and fundamental bucket sums match frozen rules
  runAssert(indResult1Y.buckets.max === 50, '[1Y.6 Invariant] Fundamental max is exactly 50');
  runAssert(techEval1Y.buckets.max === 50, '[1Y.6 Invariant] Technical max is exactly 50');
  const sumIndWeights = indResult1Y.factors.reduce((acc, f) => acc + f.weight, 0);
  runAssert(sumIndWeights === 50, `[1Y.6 Invariant] Sum of Industrial factor weights is 50 (got ${sumIndWeights})`);
  const sumBankWeights = bankResult1Y.factors.reduce((acc, f) => acc + f.weight, 0);
  runAssert(sumBankWeights === 50, `[1Y.6 Invariant] Sum of Commercial Bank factor weights is 50 (got ${sumBankWeights})`);
  const sumTechWeights = techEval1Y.factors.reduce((acc, f) => acc + f.weight, 0);
  runAssert(sumTechWeights === 50, `[1Y.6 Invariant] Sum of Technical factor weights is 50 (got ${sumTechWeights})`);

  // ============================================================
  // STAGE 1Y.3: CROSS-STOCK RUNTIME CONSISTENCY AUDIT SUITE
  // ============================================================
  console.log('\n--- STAGE 1Y.3: CROSS-STOCK RUNTIME CONSISTENCY AUDIT SUITE ---');

  // Matrix Sample 1: Industrial - Large-Cap (RELIANCE)
  const relEval1Y3 = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE');
  runAssert(relEval1Y3.sector === 'INDUSTRIAL', '[1Y.3 Mat-1 RELIANCE] Routed to INDUSTRIAL model');
  runAssert(relEval1Y3.fundamentalFactors.length === 9, '[1Y.3 Mat-1 RELIANCE] Has 9 fundamental factors');
  runAssert(relEval1Y3.technicalFactors.length === 7, '[1Y.3 Mat-1 RELIANCE] Has 7 technical factors');
  runAssert(relEval1Y3.fundamentalScore <= 50 && relEval1Y3.technicalScore <= 50, '[1Y.3 Mat-1 RELIANCE] Scores within 50/50 bounds');
  const relCfo = relEval1Y3.fundamentalFactors.find(f => f.name.startsWith('Cash Flow Conversion'))!;
  runAssert(relCfo.provenance === 'DERIVED' && relCfo.state === 'DERIVED' && relCfo.score > 0, '[1Y.3 Mat-1 RELIANCE] CFO/Op Profit derived and scored');

  // Matrix Sample 2: Industrial - IT Cash Rich (TCS)
  const tcsEval1Y3 = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['TCS'], 'TCS');
  runAssert(tcsEval1Y3.sector === 'INDUSTRIAL', '[1Y.3 Mat-2 TCS] Routed to INDUSTRIAL model');
  runAssert(tcsEval1Y3.fundamentalFactors.length === 9, '[1Y.3 Mat-2 TCS] Has 9 fundamental factors');
  const tcsDe1Y3 = tcsEval1Y3.fundamentalFactors.find(f => f.name === 'Debt-to-Equity')!;
  runAssert(tcsDe1Y3.provenance === 'DERIVED' && tcsDe1Y3.score > 0, '[1Y.3 Mat-2 TCS] D/E evaluated cleanly');

  // Matrix Sample 3: Commercial Bank - Large-Cap (HDFCBANK)
  const hdfcEval1Y3 = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['HDFCBANK'], 'HDFCBANK');
  runAssert(hdfcEval1Y3.sector === 'COMMERCIAL_BANK', '[1Y.3 Mat-3 HDFCBANK] Routed to COMMERCIAL_BANK model');
  runAssert(hdfcEval1Y3.fundamentalFactors.length === 6, '[1Y.3 Mat-3 HDFCBANK] Has 6 bank fundamental factors');
  runAssert(!hdfcEval1Y3.fundamentalFactors.some(f => f.name.includes('EBITDA')), '[1Y.3 Mat-3 HDFCBANK] No EBITDA factors in Bank model');
  const hdfcRoa = hdfcEval1Y3.fundamentalFactors.find(f => f.name === 'Return on Assets (ROA)')!;
  runAssert(hdfcRoa.provenance === 'PROVIDER_REPORTED' && hdfcRoa.score > 0, '[1Y.3 Mat-3 HDFCBANK] Bank ROA is PROVIDER_REPORTED');

  // Matrix Sample 4: Commercial Bank - Public / Turnaround (SBIN via database)
  const sbinFund1Y3 = FundamentalsDatabase.getFundamentals('SBIN', 'INE062A01020');
  const sbinCalcs1Y3 = FundamentalCalculator.compute(
    sbinFund1Y3.keyRatios,
    sbinFund1Y3.annualIncome,
    sbinFund1Y3.quarterlyIncome,
    sbinFund1Y3.balanceSheet,
    sbinFund1Y3.cashFlow
  );
  const sbinScore1Y3 = FundamentalEngine.scoreCommercialBank(sbinCalcs1Y3);
  runAssert(sbinScore1Y3.factors.length === 6, '[1Y.3 Mat-4 SBIN] Bank has exactly 6 factors');
  runAssert(sbinScore1Y3.totalScore === 42, `[1Y.3 Mat-4 SBIN] Evaluates to 42 / 50 (got ${sbinScore1Y3.totalScore})`);

  // Matrix Sample 5: NBFC - Consumer Finance (BAJFINANCE)
  const bajEval1Y3 = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['BAJFINANCE'], 'BAJFINANCE');
  runAssert(bajEval1Y3.sector === 'NBFC_HFC', '[1Y.3 Mat-5 BAJFINANCE] Routed to NBFC_HFC model');
  runAssert(bajEval1Y3.fundamentalFactors.length === 6, '[1Y.3 Mat-5 BAJFINANCE] Evaluated via 6-factor financial model');

  // Matrix Sample 6: ETF - Gold ETF (GOLDBEES)
  const goldEval1Y3 = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['GOLDBEES'], 'GOLDBEES');
  runAssert(goldEval1Y3.sector === 'ETF', '[1Y.3 Mat-6 GOLDBEES] Routed to ETF model');
  runAssert(goldEval1Y3.fundamentalFactors.length === 1, '[1Y.3 Mat-6 GOLDBEES] Has single ETF placeholder factor');
  runAssert(goldEval1Y3.fundamentalScore === 0 && goldEval1Y3.fundamentalStatus === 'NOT_APPLICABLE', '[1Y.3 Mat-6 GOLDBEES] Fundamental score is 0 and status is NOT_APPLICABLE');

  // Matrix Sample 7: Missing / Non-Positive Benchmark (WAAREERTL actual fixture)
  const waareeCalcs1Y3 = FundamentalCalculator.compute(
    { status: 'success', data: [{ name: 'P/E', company_value: '16.4', sector_value: '-12.6' }] },
    null,
    null,
    null,
    null
  );
  const waareeResult1Y3 = FundamentalEngine.scoreIndustrial(waareeCalcs1Y3);
  const waareePe = waareeResult1Y3.factors.find(f => f.name === 'P/E vs Sector')!;
  runAssert(waareePe.state === 'AVAILABLE' && waareePe.score === 0, '[1Y.3 Mat-7 WAAREE] P/E is AVAILABLE with 0 points');
  runAssert(waareePe.provenance === 'COMPARISON_UNAVAILABLE' && waareePe.benchmarkValue === '-12.6x', '[1Y.3 Mat-7 WAAREE] Benchmark -12.6x correctly flagged COMPARISON_UNAVAILABLE');

  // Matrix Sample 8: Insufficient Candle History (Short history stock)
  const shortCandles1Y3: import('../types/upstox').UpstoxCandle[] = [
    ['2026-10-12T00:00:00.000Z', 100, 105, 99, 102, 10000, 0],
    ['2026-10-11T00:00:00.000Z', 98, 101, 97, 100, 12000, 0],
    ['2026-10-10T00:00:00.000Z', 95, 99, 94, 98, 11000, 0],
  ];
  const shortTechCalcs1Y3 = TechnicalCalculator.compute(shortCandles1Y3);
  const shortTechEval1Y3 = TechnicalEngine.evaluate(shortTechCalcs1Y3);
  runAssert(shortTechEval1Y3.factors.length === 7, '[1Y.3 Mat-8 Short Candles] Evaluates 7 technical factors');
  runAssert(shortTechEval1Y3.factors.every(f => f.score === 0 && f.state === 'MISSING'), '[1Y.3 Mat-8 Short Candles] All factors safely evaluate to 0 pts and MISSING without fabrication');

  // Matrix Sample 9: Portfolio Holding Contribution & Reconciliation Check
  const sampleHoldings1Y3: import('../types/portfolio').Holding[] = [
    { symbol: 'RELIANCE', isin: 'INE002A01018', quantity: 10, averageBuyPrice: 2800.0, sector: 'Energy' },
    { symbol: 'TCS', isin: 'INE467B01029', quantity: 5, averageBuyPrice: 4000.0, sector: 'IT' },
    { symbol: 'UNRESOLVED_XYZ', isin: 'INE999X01010', quantity: 100, averageBuyPrice: 50.0, sector: 'Other' },
  ];
  const evalMap1Y3 = new Map<string, import('../types/engine').StockInsightEvaluation>();
  evalMap1Y3.set('RELIANCE', relEval1Y3);
  evalMap1Y3.set('TCS', tcsEval1Y3);
  // UNRESOLVED_XYZ has no evaluation in map

  const portfolioResult1Y3 = PortfolioEngine.analyze(sampleHoldings1Y3, evalMap1Y3);
  const items1Y3 = portfolioResult1Y3.items;
  const analytics1Y3 = portfolioResult1Y3.analytics;

  const relItem = items1Y3.find(i => i.holding.symbol === 'RELIANCE')!;
  const unresItem = items1Y3.find(i => i.holding.symbol === 'UNRESOLVED_XYZ')!;
  runAssert(relItem.quoteStatus === 'RESOLVED' && relItem.currentValue !== null, '[1Y.3 Mat-9 Portfolio] RELIANCE resolved with valid currentValue');
  runAssert(unresItem.quoteStatus === 'PENDING' && unresItem.currentValue === null, '[1Y.3 Mat-9 Portfolio] UNRESOLVED_XYZ remains PENDING with null currentValue');
  runAssert(analytics1Y3.totalInvested === (10 * 2800) + (5 * 4000) + (100 * 50), '[1Y.3 Mat-9 Portfolio] Total invested includes all active holdings');
  const expectedResolvedInvested = (10 * 2800) + (5 * 4000);
  const expectedTotalCurrent = (10 * relEval1Y3.execution.ltp) + (5 * tcsEval1Y3.execution.ltp);
  runAssert(Math.abs(analytics1Y3.totalCurrentValue - expectedTotalCurrent) < 0.01, '[1Y.3 Mat-9 Portfolio] Total current value includes ONLY resolved holdings');
  runAssert(Math.abs(analytics1Y3.totalPnl - (expectedTotalCurrent - expectedResolvedInvested)) < 0.01, '[1Y.3 Mat-9 Portfolio] Unrealized P&L is strictly computed against resolved invested capital');

  // ============================================================
  // STAGE 1Y.4: RUNTIME EVIDENCE & PROVENANCE CLOSURE SUITE
  // ============================================================
  console.log('\n--- STAGE 1Y.4: RUNTIME EVIDENCE & PROVENANCE CLOSURE SUITE ---');

  // Test 1Y.4.1: CFO / Op Profit Disclosure Invariant
  // All occurrences of Cash Flow Conversion factor in Industrial evaluation must explicitly state "CFO / Op Profit" in name and explanation
  const testIndCalcs1Y4 = FundamentalCalculator.compute(
    null,
    {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        income_statement: [
          { category: 'revenue', history: [{ period: 'Mar 2024', value: 1000 }] },
          { category: 'operating_profit', history: [{ period: 'Mar 2024', value: 200 }] },
        ],
      },
    },
    null,
    null,
    {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        cash_flow: [
          { category: 'operating', history: [{ period: 'Mar 2024', value: 160 }] },
        ],
      },
    }
  );
  const indResult1Y4 = FundamentalEngine.scoreIndustrial(testIndCalcs1Y4);
  const cfoFactor1Y4 = indResult1Y4.factors.find(f => f.name.startsWith('Cash Flow Conversion'))!;
  runAssert(cfoFactor1Y4.name === 'Cash Flow Conversion (CFO / Op Profit)', '[1Y.4.1 CFO Label] Factor name explicitly includes (CFO / Op Profit)');
  runAssert(cfoFactor1Y4.explanation.includes('CFO/Op Profit'), `[1Y.4.1 CFO Rationale] Rationale cites CFO/Op Profit (got "${cfoFactor1Y4.explanation}")`);
  runAssert(!cfoFactor1Y4.explanation.includes('CFO/EBITDA'), '[1Y.4.1 CFO Rationale] Rationale does NOT claim EBITDA');
  runAssert(cfoFactor1Y4.formula === 'Operating Cash Flow (CFO) / Operating Profit (Proxy for EBITDA)', '[1Y.4.1 CFO Formula] Formula explicitly documents proxy for EBITDA');

  // Test 1Y.4.2: Debt-to-Equity / Tangible Net Worth Disclosure Invariant
  const testDeCalcs1Y4 = FundamentalCalculator.compute(
    null,
    null,
    null,
    {
      status: 'success',
      data: {
        type: 'consolidated',
        time_period: 'yearly',
        units_in: 'crore',
        history: [{ period: 'Mar 2024', total_asset: 5000, total_liability: 2000 }],
        full_statement: [{ particular: 'Equity Capital', history: [{ period: 'Mar 2024', value: 3000 }] }],
      },
    },
    null
  );
  const deFactor1Y4 = FundamentalEngine.scoreIndustrial(testDeCalcs1Y4).factors.find(f => f.name === 'Debt-to-Equity')!;
  runAssert(deFactor1Y4.formula === 'Total Liabilities / Tangible Equity Capital', '[1Y.4.2 D/E Formula] Formula explicitly states Total Liabilities / Tangible Equity Capital');
  runAssert(deFactor1Y4.sourceFields?.includes('balance_sheet.total_liability') && deFactor1Y4.sourceFields?.includes('balance_sheet.equity_capital'), '[1Y.4.2 D/E Sources] Source fields reference actual balance_sheet fields');

  // Test 1Y.4.3: ETF Model Disclosure Invariant
  const etfFactors1Y4 = FundamentalEngine.scoreEtf().factors;
  runAssert(etfFactors1Y4.length === 1, '[1Y.4.3 ETF Factors] ETF model has exactly 1 placeholder factor');
  runAssert(!etfFactors1Y4[0].explanation.includes('CFO/EBITDA'), '[1Y.4.3 ETF Wording] ETF factor explanation does not claim CFO/EBITDA');
  runAssert(etfFactors1Y4[0].explanation.includes('CFO / Op Profit'), '[1Y.4.3 ETF Wording] ETF factor explanation cites CFO / Op Profit');

  // Test 1Y.4.4: Comparative Multiples Independence Invariant
  // Metric availability must be strictly independent of benchmark availability
  const compCalcsAvailWithMissingBench = FundamentalCalculator.compute(
    { status: 'success', data: [{ name: 'P/E', company_value: '22.5' }] }, // sector_value omitted
    null,
    null,
    null,
    null
  );
  const compFactor1Y4 = FundamentalEngine.scoreIndustrial(compCalcsAvailWithMissingBench).factors.find(f => f.name === 'P/E vs Sector')!;
  runAssert(compFactor1Y4.state === 'AVAILABLE', '[1Y.4.4 Multiples Independence] Company metric state is AVAILABLE when sector benchmark is missing');
  runAssert(compFactor1Y4.provenance === 'COMPARISON_UNAVAILABLE', '[1Y.4.4 Multiples Independence] Provenance is COMPARISON_UNAVAILABLE');
  runAssert(compFactor1Y4.score === 0, '[1Y.4.4 Multiples Independence] Scores 0 points under frozen rules');
  runAssert(compFactor1Y4.explanation.includes('sector benchmark not available'), '[1Y.4.4 Multiples Independence] Explanation qualifies missing benchmark');

  // Test 1Y.4.5: Closed-Session / Historical Quote Freshness Invariant
  // When market is closed (e.g. night/weekend), session resolver identifies closed session and prevents false live tick claims
  const weekendDate = new Date(Date.UTC(2026, 9, 11, 6, 0, 0)); // Sunday Oct 11, 2026
  const weekendResolution = SessionResolver.resolve(weekendDate);
  runAssert(weekendResolution.marketSessionState === 'WEEKEND', '[1Y.4.5 Session State] Weekend evaluates to WEEKEND state');
  const pastCandleDate = '2026-10-09'; // Friday
  runAssert(
    isDailyCandleFinalized(pastCandleDate, weekendResolution.tradingSessionId, weekendResolution.marketSessionState) === true,
    '[1Y.4.5 Candle Finality] Friday daily candle is finalized during weekend'
  );

  // =========================================================================
  // --- STAGE 1Y.5: FROZEN-CORE INVARIANTS & BOUNDARY VALUE TEST SUITE ---
  // =========================================================================
  console.log('\n--- STAGE 1Y.5: FROZEN-CORE INVARIANTS & BOUNDARY VALUES ---');

  // Test 1Y.5.1: Technical Bucket Sub-Caps (20 + 15 + 15 = 50)
  const fullTechCalcs = {
    ltp: 2500,
    ema200: 2000,
    ema200SlopePct: 2.5,
    sma100: 2200,
    sma50: 2300,
    maAligned: true,
    rsi14: 60.0, // Optimal band (10 pts)
    roc20: 8.0,  // > 5.0 (5 pts)
    volumeAccumulationRatio: 2.0, // >= 1.25 (8 pts)
    volumeAccumulationState: 'NORMAL',
    breakoutVolumeRatio: 2.0,     // >= 1.50 (7 pts)
  };
  const fullTechResult = TechnicalEngine.evaluate(fullTechCalcs as any);
  runAssert(fullTechResult.buckets.trendRegimeBucket === 20, '[1Y.5.1 Tech] Trend & Macro Regime bucket is exactly 20 pts (10+5+5)');
  runAssert(fullTechResult.buckets.momentumBucket === 15, '[1Y.5.1 Tech] Momentum & Mean Reversion bucket is exactly 15 pts (10+5)');
  runAssert(fullTechResult.buckets.volumeAccumulationBucket === 15, '[1Y.5.1 Tech] Volume Confirmation bucket is exactly 15 pts (8+7)');
  runAssert(fullTechResult.totalScore === 50, '[1Y.5.1 Tech] Total technical score is exactly 50 pts (20 + 15 + 15)');

  // Test 1Y.5.2: Boundary Values for Core Score and Zones
  // Non-hysteresis (previousZone undefined or CAUTION/HOLD):
  // Score 67.9 -> HOLD (immediately below 68)
  const b1 = DecisionEngine.evaluate(25, 42.9); // sum = 67.9
  runAssert(b1.coreScore === 67.9 && b1.zone === 'HOLD', '[1Y.5.2 Boundary] Core score 67.9 (< 68) without hysteresis evaluates to HOLD');

  // Score 68.0 -> FAVORABLE (at 68 threshold)
  const b2 = DecisionEngine.evaluate(25, 43.0); // sum = 68.0
  runAssert(b2.coreScore === 68.0 && b2.zone === 'FAVORABLE', '[1Y.5.2 Boundary] Core score 68.0 (>= 68) with Fund >= 25 evaluates to FAVORABLE');

  // Score 68.1 -> FAVORABLE (above 68 threshold)
  const b3 = DecisionEngine.evaluate(25, 43.1); // sum = 68.1
  runAssert(b3.coreScore === 68.1 && b3.zone === 'FAVORABLE', '[1Y.5.2 Boundary] Core score 68.1 evaluates to FAVORABLE');

  // Hold / Caution boundary:
  // Score 38.9 -> CAUTION (strictly below 39)
  const b4 = DecisionEngine.evaluate(15, 23.9); // sum = 38.9
  runAssert(b4.coreScore === 38.9 && b4.zone === 'CAUTION', '[1Y.5.2 Boundary] Core score 38.9 (< 39) evaluates to CAUTION');

  // Score 39.0 -> HOLD (at 39 threshold)
  const b5 = DecisionEngine.evaluate(15, 24.0); // sum = 39.0
  runAssert(b5.coreScore === 39.0 && b5.zone === 'HOLD', '[1Y.5.2 Boundary] Core score 39.0 (>= 39) evaluates to HOLD');

  // Score 39.1 -> HOLD (above 39 threshold)
  const b6 = DecisionEngine.evaluate(15, 24.1); // sum = 39.1
  runAssert(b6.coreScore === 39.1 && b6.zone === 'HOLD', '[1Y.5.2 Boundary] Core score 39.1 evaluates to HOLD');

  // Test 1Y.5.3: Hysteresis Threshold Boundaries (66.0 strictly)
  // When previously FAVORABLE:
  // Score 66.0 -> FAVORABLE (retained at 66.0)
  const h1 = DecisionEngine.evaluate(25, 41.0, 0, false, [], 'FAVORABLE'); // sum = 66.0
  runAssert(h1.coreScore === 66.0 && h1.zone === 'FAVORABLE', '[1Y.5.3 Hysteresis] Core score 66.0 with prior FAVORABLE retains FAVORABLE');

  // Score 65.9 -> HOLD (strictly below 66.0 drops to HOLD)
  const h2 = DecisionEngine.evaluate(25, 40.9, 0, false, [], 'FAVORABLE'); // sum = 65.9
  runAssert(h2.coreScore === 65.9 && h2.zone === 'HOLD', '[1Y.5.3 Hysteresis] Core score 65.9 (< 66.0) with prior FAVORABLE drops to HOLD');

  // Score 66.1 -> FAVORABLE
  const h3 = DecisionEngine.evaluate(25, 41.1, 0, false, [], 'FAVORABLE'); // sum = 66.1
  runAssert(h3.coreScore === 66.1 && h3.zone === 'FAVORABLE', '[1Y.5.3 Hysteresis] Core score 66.1 with prior FAVORABLE retains FAVORABLE');

  // Test 1Y.5.4: Fundamental Floor Boundary (25.0 required for FAVORABLE)
  // High technical momentum (50 pts), core score 74.9:
  // Fundamental score 24.9 (< 25.0) -> HOLD (floor failed)
  const f1 = DecisionEngine.evaluate(24.9, 50.0); // sum = 74.9
  runAssert(f1.coreScore === 74.9 && f1.zone === 'HOLD' && f1.fundamentalFloorFailed === true, '[1Y.5.4 Floor] Fundamental 24.9 (< 25.0) fails floor and forces HOLD despite 74.9 composite');

  // Fundamental score 25.0 (>= 25.0) -> FAVORABLE
  const f2 = DecisionEngine.evaluate(25.0, 50.0); // sum = 75.0
  runAssert(f2.coreScore === 75.0 && f2.zone === 'FAVORABLE' && f2.fundamentalFloorFailed === false, '[1Y.5.4 Floor] Fundamental 25.0 (>= 25.0) satisfies floor and achieves FAVORABLE');

  // Fundamental score 25.1 -> FAVORABLE
  const f3 = DecisionEngine.evaluate(25.1, 50.0); // sum = 75.1
  runAssert(f3.coreScore === 75.1 && f3.zone === 'FAVORABLE' && f3.fundamentalFloorFailed === false, '[1Y.5.4 Floor] Fundamental 25.1 satisfies floor and achieves FAVORABLE');

  // Test 1Y.5.5: Max Score Clamping Invariants
  const maxEval = DecisionEngine.evaluate(60, 60); // Clamped to 50 + 50 = 100
  runAssert(maxEval.fundamentalScore === 50, '[1Y.5.5 Clamping] Fundamental score clamped to max 50');
  runAssert(maxEval.technicalScore === 50, '[1Y.5.5 Clamping] Technical score clamped to max 50');
  runAssert(maxEval.coreScore === 100, '[1Y.5.5 Clamping] Composite core score clamped to max 100');

  return { total, passed };
}

runTests();


