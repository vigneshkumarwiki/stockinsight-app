import { UpstoxClient } from '../src/api/upstoxClient';
import { StockInsightPipeline } from '../src/engine';
import { PortfolioEngine } from '../src/engine/portfolioEngine';
import { BENCHMARK_STOCKS } from '../src/api/benchmarkData';
import { Holding, HoldingWithEvaluation } from '../src/types/portfolio';
import { SessionResolver } from '../src/engine/sessionResolver';
import { SearchService } from '../src/api/searchService';
import { StopProximityEngine } from '../src/engine/stopProximityEngine';

async function performAudit() {
  console.log('============================================================');
  console.log('STOCKINSIGHT V2.2 — LTP & P&L CALCULATION INTEGRITY AUDIT');
  console.log('============================================================\n');

  const client = new UpstoxClient();
  const hasToken = client.hasToken();
  console.log('11. LIVE UPSTOX STATUS:');
  console.log('  hasToken():', hasToken);
  console.log('  Token configured:', hasToken ? 'YES' : 'NO (Token is empty or not configured in environment/storage)');
  if (!hasToken) {
    console.log('  Status: LIVE LTP PROVENANCE NOT TESTABLE. (No live OAuth token present)\n');
  }

  // 1. Benchmark Holdings
  const defaultHoldings: Holding[] = client.getDefaultHoldings();
  const additionalHoldings: Holding[] = [
    {
      id: 'custom_are_5',
      symbol: 'ARE&M',
      companyName: 'Amara Raja Energy & Mobility Ltd',
      sector: 'Automobile & Ancillaries',
      isin: 'INE885A01032',
      quantity: 50,
      averageBuyPrice: 1100.0,
      addedAt: new Date().toISOString(),
    },
    {
      id: 'custom_gold_6',
      symbol: 'GOLDBEES',
      companyName: 'Nippon India ETF Gold BeES',
      sector: 'ETF',
      isin: 'INF204KB17I5',
      quantity: 200,
      averageBuyPrice: 115.0,
      addedAt: new Date().toISOString(),
    }
  ];

  const allHoldings = [...defaultHoldings, ...additionalHoldings];
  const evaluationsCache = new Map<string, any>();

  for (const h of allHoldings) {
    const data = await client.getEvaluationData(h.symbol, h.isin);
    const evalResult = StockInsightPipeline.evaluate(data, h.symbol);
    evaluationsCache.set(h.symbol.toUpperCase(), evalResult);
    if (evalResult.isin) {
      evaluationsCache.set(evalResult.isin.toUpperCase(), evalResult);
    }
  }

  const { items, analytics } = PortfolioEngine.analyze(allHoldings, evaluationsCache);

  console.log('============================================================');
  console.log('4. BENCHMARK & ADDITIONAL HOLDINGS RECONCILIATION TABLE:');
  console.log('============================================================');
  console.log('| Symbol | Qty | Avg Buy | LTP | Invested | Current Value | P&L | P&L % | Reconciled? |');
  console.log('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

  for (const item of items) {
    const sym = item.holding.symbol;
    const qty = item.holding.quantity;
    const avg = item.holding.averageBuyPrice;
    const ltp = item.currentLtp;
    const inv = item.investedValue;
    const cur = item.currentValue;
    const pnl = item.pnl;
    const pnlPct = item.pnlPercentage;

    const indepInv = qty * avg;
    const indepCur = ltp !== null ? qty * ltp : null;
    const indepPnl1 = indepCur !== null ? indepCur - indepInv : null;
    const indepPnl2 = ltp !== null ? (ltp - avg) * qty : null;
    const indepPnlPct = indepPnl1 !== null && indepInv > 0 ? (indepPnl1 / indepInv) * 100 : null;

    const isMatch =
      inv === indepInv &&
      cur === indepCur &&
      (pnl === null ? indepPnl1 === null : Math.abs(pnl - indepPnl1!) < 1e-6) &&
      (pnl === null ? indepPnl2 === null : Math.abs(pnl - indepPnl2!) < 1e-6) &&
      (pnlPct === null ? indepPnlPct === null : Math.abs(pnlPct - indepPnlPct!) < 1e-6);

    console.log(
      `| ${sym.padEnd(10)} | ${qty.toString().padStart(4)} | ₹${avg.toFixed(2).padStart(8)} | ₹${(ltp?.toFixed(2) ?? 'null').padStart(8)} | ₹${inv.toFixed(2).padStart(11)} | ₹${(cur?.toFixed(2) ?? 'null').padStart(11)} | ${(pnl !== null ? (pnl >= 0 ? '+' : '') + '₹' + pnl.toFixed(2) : 'null').padStart(12)} | ${(pnlPct !== null ? (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%' : 'null').padStart(9)} | ${isMatch ? 'PASS' : 'FAIL'} |`
    );
  }

  console.log('\n============================================================');
  console.log('8. PORTFOLIO TOTAL RECONCILIATION:');
  console.log('============================================================');
  console.log('Total Invested (all holdings):', analytics.totalInvested);
  console.log('Total Current Value (resolved):', analytics.totalCurrentValue);
  console.log('Total Unrealized P&L:', analytics.totalPnl);
  console.log('Total Unrealized P&L %:', analytics.totalPnlPercentage.toFixed(2) + '%');
  console.log('Capital Weighted Score:', analytics.capitalWeightedScore);

  // Independent summation
  const resolvedItems = items.filter(i => i.quoteStatus === 'RESOLVED' && i.currentLtp !== null);
  const sumResolvedInvested = resolvedItems.reduce((acc, i) => acc + i.investedValue, 0);
  const sumResolvedCurrent = resolvedItems.reduce((acc, i) => acc + (i.currentValue ?? 0), 0);
  const sumResolvedPnl = resolvedItems.reduce((acc, i) => acc + (i.pnl ?? 0), 0);
  const indepTotalPnlPct = sumResolvedInvested > 0 ? (sumResolvedPnl / sumResolvedInvested) * 100 : 0;

  console.log('\nIndependent Sum of Resolved Holdings:');
  console.log('  Resolved Invested Sum: ₹' + sumResolvedInvested.toFixed(2));
  console.log('  Resolved Current Sum: ₹' + sumResolvedCurrent.toFixed(2));
  console.log('  Resolved P&L Sum: ₹' + sumResolvedPnl.toFixed(2));
  console.log('  Resolved P&L %: ' + indepTotalPnlPct.toFixed(2) + '%');
  console.log('  Invested Sum matches:', analytics.totalInvested === allHoldings.reduce((a, b) => a + b.quantity * b.averageBuyPrice, 0));
  console.log('  Current Sum matches:', Math.abs(analytics.totalCurrentValue - sumResolvedCurrent) < 1e-6);
  console.log('  Total P&L matches:', Math.abs(analytics.totalPnl - sumResolvedPnl) < 1e-6);
  console.log('  Total P&L % matches:', Math.abs(analytics.totalPnlPercentage - indepTotalPnlPct) < 1e-6);

  console.log('\n============================================================');
  console.log('5. EDGE CASES AUDIT:');
  console.log('============================================================');

  const edgeTestCases: {
    name: string;
    holding: Holding;
    eval: any;
    expectedCur: number | null;
    expectedPnl: number | null;
    expectedPnlPct: number | null;
  }[] = [
    {
      name: 'A. Profitable position (LTP > Avg)',
      holding: { id: 'e_a', symbol: 'TEST_A', companyName: 'A', sector: 'Eq', quantity: 10, averageBuyPrice: 100 },
      eval: { execution: { ltp: 120 }, dataSource: 'DEMO', coreScore: 50, integrity: { status: 'CLEAN' } },
      expectedCur: 1200,
      expectedPnl: 200,
      expectedPnlPct: 20,
    },
    {
      name: 'B. Losing position (LTP < Avg)',
      holding: { id: 'e_b', symbol: 'TEST_B', companyName: 'B', sector: 'Eq', quantity: 10, averageBuyPrice: 100 },
      eval: { execution: { ltp: 80 }, dataSource: 'DEMO', coreScore: 50, integrity: { status: 'CLEAN' } },
      expectedCur: 800,
      expectedPnl: -200,
      expectedPnlPct: -20,
    },
    {
      name: 'C. Breakeven (LTP == Avg)',
      holding: { id: 'e_c', symbol: 'TEST_C', companyName: 'C', sector: 'Eq', quantity: 10, averageBuyPrice: 100 },
      eval: { execution: { ltp: 100 }, dataSource: 'DEMO', coreScore: 50, integrity: { status: 'CLEAN' } },
      expectedCur: 1000,
      expectedPnl: 0,
      expectedPnlPct: 0,
    },
    {
      name: 'D. Quantity = 1',
      holding: { id: 'e_d', symbol: 'TEST_D', companyName: 'D', sector: 'Eq', quantity: 1, averageBuyPrice: 250 },
      eval: { execution: { ltp: 300 }, dataSource: 'DEMO', coreScore: 50, integrity: { status: 'CLEAN' } },
      expectedCur: 300,
      expectedPnl: 50,
      expectedPnlPct: 20,
    },
    {
      name: 'E. Quantity > 1',
      holding: { id: 'e_e', symbol: 'TEST_E', companyName: 'E', sector: 'Eq', quantity: 500, averageBuyPrice: 250 },
      eval: { execution: { ltp: 300 }, dataSource: 'DEMO', coreScore: 50, integrity: { status: 'CLEAN' } },
      expectedCur: 150000,
      expectedPnl: 25000,
      expectedPnlPct: 20,
    },
    {
      name: 'F. Avg Buy = 0.01',
      holding: { id: 'e_f', symbol: 'TEST_F', companyName: 'F', sector: 'Eq', quantity: 100, averageBuyPrice: 0.01 },
      eval: { execution: { ltp: 1.00 }, dataSource: 'DEMO', coreScore: 50, integrity: { status: 'CLEAN' } },
      expectedCur: 100,
      expectedPnl: 99,
      expectedPnlPct: 9900,
    },
    {
      name: 'G. Avg Buy = 212.31',
      holding: { id: 'e_g', symbol: 'TEST_G', companyName: 'G', sector: 'Eq', quantity: 100, averageBuyPrice: 212.31 },
      eval: { execution: { ltp: 250.00 }, dataSource: 'DEMO', coreScore: 50, integrity: { status: 'CLEAN' } },
      expectedCur: 25000,
      expectedPnl: 3769,
      expectedPnlPct: ((25000 - 21231) / 21231) * 100,
    },
    {
      name: 'H. Fractional/decimal inputs (e.g. ₹150,000.55)',
      holding: { id: 'e_h', symbol: 'TEST_H', companyName: 'H', sector: 'Eq', quantity: 5, averageBuyPrice: 150000.55 },
      eval: { execution: { ltp: 160000.55 }, dataSource: 'DEMO', coreScore: 50, integrity: { status: 'CLEAN' } },
      expectedCur: 800002.75,
      expectedPnl: 50000.00,
      expectedPnlPct: (50000.00 / (5 * 150000.55)) * 100,
    },
    {
      name: 'I. Missing LTP (quoteStatus UNAVAILABLE)',
      holding: { id: 'e_i', symbol: 'TEST_I', companyName: 'I', sector: 'Eq', quantity: 10, averageBuyPrice: 100 },
      eval: { execution: { ltp: null }, dataSource: 'DATA_UNAVAILABLE', coreScore: null, integrity: { status: 'CLEAN' } },
      expectedCur: null,
      expectedPnl: null,
      expectedPnlPct: null,
    },
    {
      name: 'J. Unquoted holding (No evaluation in cache)',
      holding: { id: 'e_j', symbol: 'TEST_J', companyName: 'J', sector: 'Eq', quantity: 10, averageBuyPrice: 100 },
      eval: null,
      expectedCur: null,
      expectedPnl: null,
      expectedPnlPct: null,
    },
    {
      name: 'K. Zero quantity (Edge case)',
      holding: { id: 'e_k', symbol: 'TEST_K', companyName: 'K', sector: 'Eq', quantity: 0, averageBuyPrice: 100 },
      eval: { execution: { ltp: 150 }, dataSource: 'DEMO', coreScore: 50, integrity: { status: 'CLEAN' } },
      expectedCur: 0,
      expectedPnl: 0,
      expectedPnlPct: null, // 0 / 0 is handled gracefully
    },
  ];

  for (const tc of edgeTestCases) {
    const testMap = new Map();
    if (tc.eval) {
      testMap.set(tc.holding.symbol, tc.eval);
    }
    const res = PortfolioEngine.analyze([tc.holding], testMap);
    const item = res.items[0];

    const curMatch = item.currentValue === tc.expectedCur || (tc.expectedCur !== null && Math.abs((item.currentValue ?? 0) - tc.expectedCur) < 1e-4);
    const pnlMatch = item.pnl === tc.expectedPnl || (tc.expectedPnl !== null && Math.abs((item.pnl ?? 0) - tc.expectedPnl) < 1e-4);
    const pctMatch = item.pnlPercentage === tc.expectedPnlPct || (tc.expectedPnlPct !== null && item.pnlPercentage !== null && Math.abs(item.pnlPercentage - tc.expectedPnlPct) < 1e-4);

    const pass = curMatch && pnlMatch && pctMatch;
    console.log(`  ${tc.name}: ${pass ? 'PASS' : 'FAIL'} (Cur: ${item.currentValue}, PnL: ${item.pnl}, PnL%: ${item.pnlPercentage})`);
  }

  console.log('\n============================================================');
  console.log('10. STOCK IDENTITY AUDIT:');
  console.log('============================================================');
  const symbolsToSwitch = ['RELIANCE', 'TCS', 'HDFCBANK', 'BAJFINANCE', 'ARE&M'];
  for (const sym of symbolsToSwitch) {
    const evalData = evaluationsCache.get(sym);
    console.log(`  Stock: ${sym.padEnd(10)} | ISIN: ${evalData?.isin?.padEnd(14)} | LTP: ₹${evalData?.execution?.ltp} | Core: ${evalData?.coreScore}`);
  }

  console.log('\n============================================================');
  console.log('12. MARKET SESSION AUDIT:');
  console.log('============================================================');
  const session = SessionResolver.resolve();
  console.log('  Trading Session ID:', session.tradingSessionId);
  console.log('  Market Session State:', session.marketSessionState);
  console.log('  Session Reason:', session.reason);

  console.log('\n============================================================');
  console.log('14. NO-DATA VIOLATION AUDIT:');
  console.log('============================================================');
  console.log('  Checking if unquoted stock falls back to averageBuyPrice:');
  const unquotedTest = PortfolioEngine.analyze(
    [{ id: 'u1', symbol: 'UNQUOTED', companyName: 'U', sector: 'Eq', quantity: 10, averageBuyPrice: 500 }],
    new Map()
  );
  const uItem = unquotedTest.items[0];
  console.log('  quoteStatus:', uItem.quoteStatus);
  console.log('  currentLtp:', uItem.currentLtp);
  console.log('  currentValue:', uItem.currentValue);
  console.log('  pnl:', uItem.pnl);
  console.log('  pnlPercentage:', uItem.pnlPercentage);
  console.log('  No fallback to averageBuyPrice:', uItem.currentLtp === null && uItem.currentValue === null && uItem.pnl === null ? 'PASS' : 'FAIL');
}

performAudit();
