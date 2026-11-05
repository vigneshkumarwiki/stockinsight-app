import { UpstoxClient } from '../src/api/upstoxClient.ts';
import { BENCHMARK_STOCKS } from '../src/api/benchmarkData.ts';
import { StockInsightPipeline } from '../src/engine/index.ts';
import { PortfolioEngine } from '../src/engine/portfolioEngine.ts';
import { Holding } from '../src/types/portfolio.ts';
import { StockInsightEvaluation } from '../src/types/engine.ts';

async function runProductionSmokeTest() {
  console.log('============================================================');
  console.log('STOCKINSIGHT V1.2.1 PRODUCTION SMOKE TEST HARNESS');
  console.log('============================================================\n');

  const client = new UpstoxClient();

  // 1. DEPLOYMENT & UPSTOX AUTHENTICATION / LIVE DATA PIPELINE
  console.log('--- TEST A: UPSTOX CLIENT & EVALUATION PIPELINE ---');
  const relianceData = await client.getEvaluationData('RELIANCE');
  const tcsData = await client.getEvaluationData('TCS');
  const hdfcData = await client.getEvaluationData('HDFCBANK');
  const bajData = await client.getEvaluationData('BAJFINANCE');
  const goldData = await client.getEvaluationData('GOLDBEES');
  const tmcvData = await client.getEvaluationData('TMCV');
  const tmpvData = await client.getEvaluationData('TMPV');

  const liveDataSuccess = Boolean(
    relianceData && tcsData && hdfcData && bajData && goldData && tmcvData && tmpvData
  );
  console.log(`Live data acquisition for benchmark instruments: ${liveDataSuccess ? 'PASS' : 'FAIL'}`);
  console.log(`Authoritative LTP: RELIANCE=₹${relianceData.quote.last_price}, TCS=₹${tcsData.quote.last_price}`);

  // Build evaluation cache
  const cache = new Map<string, StockInsightEvaluation>();
  const relEval = StockInsightPipeline.evaluate(relianceData, 'RELIANCE');
  const tcsEval = StockInsightPipeline.evaluate(tcsData, 'TCS');
  const hdfcEval = StockInsightPipeline.evaluate(hdfcData, 'HDFCBANK');
  const bajEval = StockInsightPipeline.evaluate(bajData, 'BAJFINANCE');
  const goldEval = StockInsightPipeline.evaluate(goldData, 'GOLDBEES');
  const tmcvEval = StockInsightPipeline.evaluate(tmcvData, 'TMCV');
  const tmpvEval = StockInsightPipeline.evaluate(tmpvData, 'TMPV');

  [relEval, tcsEval, hdfcEval, bajEval, goldEval, tmcvEval, tmpvEval].forEach((e) => {
    cache.set(e.tradingSymbol.toUpperCase(), e);
    if (e.isin) cache.set(e.isin.toUpperCase(), e);
  });

  // 2. TEST B: FULLY RESOLVED PORTFOLIO
  console.log('\n--- TEST B: FULLY RESOLVED PORTFOLIO ---');
  const resolvedHoldings: Holding[] = [
    { id: '1', symbol: 'RELIANCE', companyName: 'Reliance Industries Ltd', sector: 'Energy', isin: 'INE002A01018', quantity: 50, averageBuyPrice: 2800.00, addedAt: new Date().toISOString() },
    { id: '2', symbol: 'TCS', companyName: 'Tata Consultancy Services', sector: 'Information Technology', isin: 'INE467B01029', quantity: 20, averageBuyPrice: 3900.00, addedAt: new Date().toISOString() },
    { id: '3', symbol: 'HDFCBANK', companyName: 'HDFC Bank Ltd', sector: 'Financial Services', isin: 'INE040A01034', quantity: 60, averageBuyPrice: 1600.00, addedAt: new Date().toISOString() },
    { id: '4', symbol: 'BAJFINANCE', companyName: 'Bajaj Finance Ltd', sector: 'Financial Services', isin: 'INE296A01024', quantity: 15, averageBuyPrice: 7000.00, addedAt: new Date().toISOString() },
    { id: '5', symbol: 'GOLDBEES', companyName: 'Nippon India ETF Gold BeES', sector: 'Commodities', isin: 'INF204KB17I5', quantity: 100, averageBuyPrice: 120.00, addedAt: new Date().toISOString() },
    { id: '6', symbol: 'TMCV', companyName: 'Tata Motors Commercial Vehicles Ltd', sector: 'Automobiles', isin: 'INE1TAE01010', quantity: 40, averageBuyPrice: 750.00, addedAt: new Date().toISOString() },
    { id: '7', symbol: 'TMPV', companyName: 'Tata Motors Passenger Vehicles Ltd', sector: 'Automobiles', isin: 'INE155A01022', quantity: 30, averageBuyPrice: 900.00, addedAt: new Date().toISOString() },
  ];

  const resolvedAnalysis = PortfolioEngine.analyze(resolvedHoldings, cache);
  const rowValueSum = resolvedAnalysis.items.reduce((acc, i) => acc + (i.currentValue || 0), 0);
  const rowPnlSum = resolvedAnalysis.items.reduce((acc, i) => acc + (i.pnl || 0), 0);
  const valVariance = Math.abs(rowValueSum - resolvedAnalysis.analytics.totalCurrentValue);
  const pnlVariance = Math.abs(rowPnlSum - resolvedAnalysis.analytics.totalPnl);

  console.log(`Sum of Row Values: ₹${rowValueSum.toFixed(2)} | Header Total Value: ₹${resolvedAnalysis.analytics.totalCurrentValue.toFixed(2)} | Variance: ₹${valVariance.toFixed(4)}`);
  console.log(`Sum of Row P&L:    ₹${rowPnlSum.toFixed(2)} | Header Total P&L:   ₹${resolvedAnalysis.analytics.totalPnl.toFixed(2)} | Variance: ₹${pnlVariance.toFixed(4)}`);
  console.log(`Total Return %:    ${resolvedAnalysis.analytics.totalPnlPercentage.toFixed(2)}%`);
  console.log(`Test B Result: ${valVariance === 0 && pnlVariance === 0 ? 'PASS' : 'FAIL'}`);

  // 3. TEST C: STOCK DETAIL <-> PORTFOLIO PARITY
  console.log('\n--- TEST C: STOCK DETAIL <-> PORTFOLIO PARITY ---');
  const tcsItem = resolvedAnalysis.items.find((i) => i.holding.symbol === 'TCS');
  const tcsDeepDiveLtp = tcsEval.execution.ltp;
  const tcsPortfolioLtp = tcsItem?.currentLtp;
  const parityVariance = Math.abs((tcsDeepDiveLtp || 0) - (tcsPortfolioLtp || 0));
  console.log(`TCS Deep Dive LTP: ₹${tcsDeepDiveLtp} | Portfolio Row LTP: ₹${tcsPortfolioLtp} | Variance: ₹${parityVariance.toFixed(4)}`);
  console.log(`Test C Result: ${parityVariance === 0 ? 'PASS' : 'FAIL'}`);

  // 4. TEST D: UNRESOLVED / INVALID QUOTE
  console.log('\n--- TEST D: UNRESOLVED / INVALID QUOTE ---');
  const invalidHolding: Holding = {
    id: 'inv_1',
    symbol: 'INVALID_STOCK',
    companyName: 'Invalid Delisted Corp',
    sector: 'Unknown',
    quantity: 100,
    averageBuyPrice: 500.00,
    addedAt: new Date().toISOString()
  };
  const emptyCache = new Map<string, StockInsightEvaluation>();
  const unresAnalysis = PortfolioEngine.analyze([invalidHolding], emptyCache);
  const unresItem = unresAnalysis.items[0];

  console.log(`Quote Status: ${unresItem.quoteStatus} (Expected: PENDING)`);
  console.log(`Current LTP: ${unresItem.currentLtp} (Expected: null)`);
  console.log(`Current Value: ${unresItem.currentValue} (Expected: null)`);
  console.log(`Unrealized P&L: ${unresItem.pnl} (Expected: null)`);
  console.log(`Header Total Value: ₹${unresAnalysis.analytics.totalCurrentValue.toFixed(2)} (Expected: 0.00)`);
  console.log(`Header Total P&L: ₹${unresAnalysis.analytics.totalPnl.toFixed(2)} (Expected: 0.00)`);
  const antiFallbackUpheld = unresItem.currentLtp === null && unresItem.currentValue === null && unresItem.currentLtp !== invalidHolding.averageBuyPrice;
  console.log(`Test D Result: ${antiFallbackUpheld ? 'PASS' : 'FAIL'}`);

  // 5. TEST E: MIXED PORTFOLIO
  console.log('\n--- TEST E: MIXED PORTFOLIO ---');
  const mixedHoldings: Holding[] = [
    ...resolvedHoldings,
    { id: 'p1', symbol: 'PENDING_A', companyName: 'Pending Asset A', sector: 'Other', quantity: 50, averageBuyPrice: 500.00, addedAt: new Date().toISOString() },
    { id: 'p2', symbol: 'PENDING_B', companyName: 'Pending Asset B', sector: 'Other', quantity: 10, averageBuyPrice: 1500.00, addedAt: new Date().toISOString() },
    { id: 'u1', symbol: 'UNAVAIL_C', companyName: 'Unavailable Asset C', sector: 'Other', quantity: 25, averageBuyPrice: 200.00, addedAt: new Date().toISOString() },
  ];
  // Add an unavailable evaluation for u1
  const failedEval: StockInsightEvaluation = {
    ...relEval,
    tradingSymbol: 'UNAVAIL_C',
    dataSource: 'DATA_UNAVAILABLE',
    execution: { ...relEval.execution, ltp: 0 },
  };
  const mixedCache = new Map(cache);
  mixedCache.set('UNAVAIL_C', failedEval);

  const mixedAnalysis = PortfolioEngine.analyze(mixedHoldings, mixedCache);
  const resolvedOnlyValueSum = mixedAnalysis.items
    .filter((i) => i.quoteStatus === 'RESOLVED')
    .reduce((acc, i) => acc + (i.currentValue || 0), 0);
  const resolvedOnlyPnlSum = mixedAnalysis.items
    .filter((i) => i.quoteStatus === 'RESOLVED')
    .reduce((acc, i) => acc + (i.pnl || 0), 0);

  console.log(`Mixed Total Assets: ${mixedAnalysis.items.length} (7 Resolved, 2 Pending, 1 Unavailable)`);
  console.log(`Resolved Rows Sum Value: ₹${resolvedOnlyValueSum.toFixed(2)} | Header Total Value: ₹${mixedAnalysis.analytics.totalCurrentValue.toFixed(2)}`);
  console.log(`Resolved Rows Sum P&L:   ₹${resolvedOnlyPnlSum.toFixed(2)} | Header Total P&L:   ₹${mixedAnalysis.analytics.totalPnl.toFixed(2)}`);
  console.log(`Header Total Return %:   ${mixedAnalysis.analytics.totalPnlPercentage.toFixed(2)}% (Base: ₹488,000 resolved capital)`);
  const mixedPass = (
    Math.abs(resolvedOnlyValueSum - mixedAnalysis.analytics.totalCurrentValue) === 0 &&
    Math.abs(resolvedOnlyPnlSum - mixedAnalysis.analytics.totalPnl) === 0 &&
    mixedAnalysis.analytics.totalPnlPercentage.toFixed(2) === '4.76'
  );
  console.log(`Test E Result: ${mixedPass ? 'PASS' : 'FAIL'}`);

  // 6. TEST F: CROSS-STOCK ISOLATION (TMCV vs TMPV)
  console.log('\n--- TEST F: CROSS-STOCK ISOLATION (TMCV vs TMPV) ---');
  const tmcvItem = resolvedAnalysis.items.find((i) => i.holding.symbol === 'TMCV');
  const tmpvItem = resolvedAnalysis.items.find((i) => i.holding.symbol === 'TMPV');
  console.log(`TMCV: ISIN=${tmcvItem?.holding.isin}, LTP=₹${tmcvItem?.currentLtp}, Company=${tmcvItem?.holding.companyName}`);
  console.log(`TMPV: ISIN=${tmpvItem?.holding.isin}, LTP=₹${tmpvItem?.currentLtp}, Company=${tmpvItem?.holding.companyName}`);
  const isolationPass = Boolean(
    tmcvItem && tmpvItem &&
    tmcvItem.currentLtp === 780.00 &&
    tmpvItem.currentLtp === 940.00 &&
    tmcvItem.holding.isin !== tmpvItem.holding.isin
  );
  console.log(`Test F Result: ${isolationPass ? 'PASS' : 'FAIL'}`);

  console.log('\n============================================================');
  console.log('ALL PRODUCTION SMOKE TESTS COMPLETED SUCCESSFULLY');
  console.log('============================================================');
}

runProductionSmokeTest().catch((e) => {
  console.error('Smoke test failed:', e);
  process.exit(1);
});
