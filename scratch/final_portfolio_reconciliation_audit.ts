import { UpstoxClient } from '../src/api/upstoxClient';
import { StockInsightPipeline } from '../src/engine';
import { PortfolioEngine } from '../src/engine/portfolioEngine';
import { Holding } from '../src/types/portfolio';
import { BENCHMARK_STOCKS } from '../src/api/benchmarkData';

async function audit() {
  console.log('====================================================');
  console.log('STOCKINSIGHT V1.2.1 PORTFOLIO RECONCILIATION AUDIT');
  console.log('====================================================\n');

  const client = new UpstoxClient();

  // Benchmark evaluations
  const relEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['RELIANCE'], 'RELIANCE');
  const tcsEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['TCS'], 'TCS');
  const hdfcEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['HDFCBANK'], 'HDFCBANK');
  const bajEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['BAJFINANCE'], 'BAJFINANCE');
  const goldEval = StockInsightPipeline.evaluate(BENCHMARK_STOCKS['GOLDBEES'], 'GOLDBEES');

  const tmcvInput = await client.getEvaluationData('TMCV');
  const tmpvInput = await client.getEvaluationData('TMPV');
  const tmcvEval = StockInsightPipeline.evaluate(tmcvInput, 'TMCV');
  const tmpvEval = StockInsightPipeline.evaluate(tmpvInput, 'TMPV');

  // ==========================================
  // SECTION 1: FULLY RESOLVED PORTFOLIO
  // ==========================================
  console.log('--- 1. FULLY RESOLVED PORTFOLIO AUDIT ---');
  const resolvedHoldings: Holding[] = [
    { id: 'h1', symbol: 'RELIANCE', companyName: 'Reliance Industries', sector: 'Energy', isin: 'INE002A01018', quantity: 50, averageBuyPrice: 2800.0, addedAt: new Date().toISOString() },
    { id: 'h2', symbol: 'TCS', companyName: 'Tata Consultancy Services', sector: 'IT', isin: 'INE467B01029', quantity: 20, averageBuyPrice: 3900.0, addedAt: new Date().toISOString() },
    { id: 'h3', symbol: 'HDFCBANK', companyName: 'HDFC Bank', sector: 'Banking', isin: 'INE040A01034', quantity: 60, averageBuyPrice: 1600.0, addedAt: new Date().toISOString() },
    { id: 'h4', symbol: 'BAJFINANCE', companyName: 'Bajaj Finance', sector: 'NBFC', isin: 'INE296A01024', quantity: 15, averageBuyPrice: 7000.0, addedAt: new Date().toISOString() },
    { id: 'h5', symbol: 'GOLDBEES', companyName: 'Gold BeES ETF', sector: 'ETF', isin: 'INF204KB17I5', quantity: 100, averageBuyPrice: 120.0, addedAt: new Date().toISOString() },
    { id: 'h6', symbol: 'TMCV', companyName: 'Tata Motors CV', sector: 'Automobiles', isin: 'INE1TAE01010', quantity: 40, averageBuyPrice: 750.0, addedAt: new Date().toISOString() },
    { id: 'h7', symbol: 'TMPV', companyName: 'Tata Motors PV', sector: 'Automobiles', isin: 'INE155A01022', quantity: 30, averageBuyPrice: 900.0, addedAt: new Date().toISOString() },
  ];

  const resolvedCache = new Map<string, any>([
    ['RELIANCE', relEval],
    ['TCS', tcsEval],
    ['HDFCBANK', hdfcEval],
    ['BAJFINANCE', bajEval],
    ['GOLDBEES', goldEval],
    ['TMCV', tmcvEval],
    ['TMPV', tmpvEval],
  ]);

  const fullAnalysis = PortfolioEngine.analyze(resolvedHoldings, resolvedCache);

  let sumRowCurrentVal = 0;
  let sumRowInvestedVal = 0;
  let sumRowPnl = 0;

  fullAnalysis.items.forEach((item) => {
    sumRowCurrentVal += item.currentValue!;
    sumRowInvestedVal += item.investedValue;
    sumRowPnl += item.pnl!;
    console.log(`  ${item.holding.symbol.padEnd(10)} | Status: ${item.quoteStatus.padEnd(8)} | LTP: ₹${item.currentLtp?.toFixed(2).padStart(8)} | CurVal: ₹${item.currentValue?.toFixed(2).padStart(10)} | PnL: ₹${item.pnl?.toFixed(2).padStart(9)} (${item.pnlPercentage?.toFixed(2)}%)`);
  });

  console.log('\nFully Resolved Reconciliation:');
  console.log('  Sum of Row Current Values:', sumRowCurrentVal.toFixed(2));
  console.log('  Header Total Value:       ', fullAnalysis.analytics.totalCurrentValue.toFixed(2));
  console.log('  Current Value Variance:   ', (sumRowCurrentVal - fullAnalysis.analytics.totalCurrentValue).toFixed(4));
  console.log('  Sum of Row Unrealized PnL:', sumRowPnl.toFixed(2));
  console.log('  Header Total PnL:         ', fullAnalysis.analytics.totalPnl.toFixed(2));
  console.log('  PnL Variance:             ', (sumRowPnl - fullAnalysis.analytics.totalPnl).toFixed(4));

  // ==========================================
  // SECTION 2: MIXED PORTFOLIO (10 HOLDINGS)
  // ==========================================
  console.log('\n--- 2. MIXED PORTFOLIO AUDIT (7 RESOLVED, 2 PENDING, 1 UNAVAILABLE) ---');

  const failedQuoteEval = JSON.parse(JSON.stringify(relEval));
  failedQuoteEval.dataSource = 'UPSTOX_DATA_ERROR';
  failedQuoteEval.execution.ltp = 0;

  const mixedHoldings: Holding[] = [
    // 7 Resolved
    resolvedHoldings[0],
    resolvedHoldings[1],
    resolvedHoldings[2],
    resolvedHoldings[3],
    resolvedHoldings[4],
    resolvedHoldings[5],
    resolvedHoldings[6],
    // 2 Pending (not in cache)
    { id: 'm8', symbol: 'PENDING_1', companyName: 'Pending Health Ltd', sector: 'Pharma', isin: 'INE111A01011', quantity: 25, averageBuyPrice: 500.0, addedAt: new Date().toISOString() },
    { id: 'm9', symbol: 'PENDING_2', companyName: 'Pending Chemical Ltd', sector: 'Chemicals', isin: 'INE222A01022', quantity: 10, averageBuyPrice: 1500.0, addedAt: new Date().toISOString() },
    // 1 Unavailable (failed API quote)
    { id: 'm10', symbol: 'UNAVAIL_1', companyName: 'Failed Metals Ltd', sector: 'Metals', isin: 'INE333A01033', quantity: 100, averageBuyPrice: 200.0, addedAt: new Date().toISOString() },
  ];

  const mixedCache = new Map<string, any>([
    ['RELIANCE', relEval],
    ['TCS', tcsEval],
    ['HDFCBANK', hdfcEval],
    ['BAJFINANCE', bajEval],
    ['GOLDBEES', goldEval],
    ['TMCV', tmcvEval],
    ['TMPV', tmpvEval],
    ['UNAVAIL_1', failedQuoteEval],
  ]);

  const mixedAnalysis = PortfolioEngine.analyze(mixedHoldings, mixedCache);

  let resolvedSumCurVal = 0;
  let resolvedSumInvested = 0;
  let resolvedSumPnl = 0;

  console.log('\nMixed Portfolio Items:');
  mixedAnalysis.items.forEach((item) => {
    const isResolved = item.quoteStatus === 'RESOLVED';
    if (isResolved) {
      resolvedSumCurVal += item.currentValue!;
      resolvedSumInvested += item.investedValue;
      resolvedSumPnl += item.pnl!;
    }
    const ltpStr = item.currentLtp !== null ? `₹${item.currentLtp.toFixed(2)}` : 'NULL';
    const valStr = item.currentValue !== null ? `₹${item.currentValue.toFixed(2)}` : 'NULL';
    const pnlStr = item.pnl !== null ? `₹${item.pnl.toFixed(2)}` : 'NULL';
    console.log(`  ${item.holding.symbol.padEnd(12)} | Status: ${item.quoteStatus.padEnd(11)} | LTP: ${ltpStr.padEnd(10)} | CurVal: ${valStr.padEnd(12)} | PnL: ${pnlStr.padEnd(12)} | BuyAvg: ₹${item.holding.averageBuyPrice}`);
  });

  console.log('\nMixed Aggregates vs Sum of Resolved Rows:');
  console.log('  Resolved Rows Sum Current Value:', resolvedSumCurVal.toFixed(2));
  console.log('  Header totalCurrentValue:       ', mixedAnalysis.analytics.totalCurrentValue.toFixed(2));
  console.log('  Variance:                       ', (resolvedSumCurVal - mixedAnalysis.analytics.totalCurrentValue).toFixed(4));
  console.log('  Resolved Rows Sum PnL:          ', resolvedSumPnl.toFixed(2));
  console.log('  Header totalPnl:                ', mixedAnalysis.analytics.totalPnl.toFixed(2));
  console.log('  Variance:                       ', (resolvedSumPnl - mixedAnalysis.analytics.totalPnl).toFixed(4));
  console.log('  Total Invested (all 10 assets): ', mixedAnalysis.analytics.totalInvested.toFixed(2));
  console.log('  Resolved Invested (7 assets):   ', resolvedSumInvested.toFixed(2));
  console.log('  Header totalPnlPercentage:      ', mixedAnalysis.analytics.totalPnlPercentage.toFixed(2) + '%');
  console.log('  Calculated (PnL / ResolvedInv): ', ((resolvedSumPnl / resolvedSumInvested) * 100).toFixed(2) + '%');

  // Failure Mode Checks
  console.log('\n--- 3. UNKNOWN MUST NOT BECOME ZERO / FAKE PRICE CHECKS ---');
  mixedAnalysis.items.forEach((item) => {
    if (item.quoteStatus === 'PENDING' || item.quoteStatus === 'UNAVAILABLE') {
      const usesBuyPriceAsLtp = item.currentLtp === item.holding.averageBuyPrice;
      const curValIsZero = item.currentValue === 0;
      const pnlIsZero = item.pnl === 0;
      const ltpIsNull = item.currentLtp === null;
      const curValIsNull = item.currentValue === null;
      const pnlIsNull = item.pnl === null;

      console.log(`  Asset: ${item.holding.symbol} (${item.quoteStatus})`);
      console.log(`    - Uses Average Buy Price as LTP: ${usesBuyPriceAsLtp} (EXPECT FALSE: ${!usesBuyPriceAsLtp})`);
      console.log(`    - Current Value is 0:            ${curValIsZero} (EXPECT FALSE: ${!curValIsZero})`);
      console.log(`    - PnL is 0:                      ${pnlIsZero} (EXPECT FALSE: ${!pnlIsZero})`);
      console.log(`    - Current LTP is null:           ${ltpIsNull} (EXPECT TRUE: ${ltpIsNull})`);
      console.log(`    - Current Value is null:         ${curValIsNull} (EXPECT TRUE: ${curValIsNull})`);
      console.log(`    - PnL is null:                   ${pnlIsNull} (EXPECT TRUE: ${pnlIsNull})`);
    }
  });
}

audit().catch(console.error);
