import { UpstoxClient } from '../src/api/upstoxClient';
import { StockInsightPipeline } from '../src/engine';
import { PortfolioEngine } from '../src/engine/portfolioEngine';
import { SearchService } from '../src/api/searchService';
import { Holding } from '../src/types/portfolio';

async function audit() {
  const client = new UpstoxClient();
  const testSymbols = ['ZYDUSLIFE', 'HDFCBANK', 'TCS', 'GOLDBEES', 'TMCV', 'TMPV'];

  console.log('=== 1. INSTRUMENT LOOKUPS ===');
  for (const sym of testSymbols) {
    const inst = SearchService.getInstrumentBySymbol(sym);
    console.log(sym, '=>', inst ? { symbol: inst.symbol, name: inst.name, isin: inst.isin, key: inst.instrumentKey, lastPrice: inst.lastPrice } : 'NOT FOUND');
  }

  console.log('\n=== 2. STOCK DETAIL EVALUATION ===');
  const evalsMap = new Map<string, any>();
  for (const sym of testSymbols) {
    const data = await client.getEvaluationData(sym);
    const result = StockInsightPipeline.evaluate(data, sym);
    evalsMap.set(sym, result);
    if (result.tradingSymbol) evalsMap.set(result.tradingSymbol.toUpperCase(), result);
    if (result.isin) evalsMap.set(result.isin.toUpperCase(), result);
    console.log(sym, '=> Stock Detail LTP:', result.execution.ltp, '| Quote LTP:', data.quote.last_price, '| Data Source:', result.dataSource, '| Status:', result.fundamentalStatus);
  }

  console.log('\n=== 3. PORTFOLIO HOLDINGS & ROW CALCULATIONS ===');
  const holdings: Holding[] = [
    { id: 'h1', symbol: 'ZYDUSLIFE', companyName: 'Zydus Lifesciences Limited', sector: 'Pharmaceuticals', isin: 'INE010B01027', quantity: 25, averageBuyPrice: 950.0, addedAt: new Date().toISOString() },
    { id: 'h2', symbol: 'HDFCBANK', companyName: 'HDFC Bank Limited', sector: 'Banking - Private', isin: 'INE040A01034', quantity: 100, averageBuyPrice: 1650.0, addedAt: new Date().toISOString() },
    { id: 'h3', symbol: 'TCS', companyName: 'Tata Consultancy Services', sector: 'Information Technology', isin: 'INE467B01029', quantity: 30, averageBuyPrice: 3800.0, addedAt: new Date().toISOString() },
    { id: 'h4', symbol: 'GOLDBEES', companyName: 'Nippon India ETF Gold BeES', sector: 'ETF', isin: 'INF204KB17I5', quantity: 200, averageBuyPrice: 120.0, addedAt: new Date().toISOString() },
    { id: 'h5', symbol: 'TMCV', companyName: 'Tata Motors Commercial Vehicles Limited', sector: 'Automobiles', isin: 'INE1TAE01010', quantity: 50, averageBuyPrice: 750.0, addedAt: new Date().toISOString() },
    { id: 'h6', symbol: 'TMPV', companyName: 'Tata Motors Passenger Vehicles Limited', sector: 'Automobiles', isin: 'INE155A01022', quantity: 50, averageBuyPrice: 900.0, addedAt: new Date().toISOString() },
  ];

  const analysis = PortfolioEngine.analyze(holdings, evalsMap);

  for (const item of analysis.items) {
    const detailEval = evalsMap.get(item.holding.symbol);
    const detailLtp = detailEval?.execution.ltp;
    console.log({
      symbol: item.holding.symbol,
      detailLtp,
      portfolioLtp: item.currentLtp,
      ltpMatch: detailLtp === item.currentLtp,
      quantity: item.holding.quantity,
      avgBuy: item.holding.averageBuyPrice,
      calcCurrentVal: item.holding.quantity * item.currentLtp,
      portfolioCurrentVal: item.currentValue,
      calcPnl: item.currentValue - item.investedValue,
      portfolioPnl: item.pnl,
    });
  }

  console.log('\n=== 4. PORTFOLIO AGGREGATION RECONCILIATION ===');
  const sumCurrentVal = analysis.items.reduce((s, i) => s + i.currentValue, 0);
  const sumInvestedVal = analysis.items.reduce((s, i) => s + i.investedValue, 0);
  const sumPnl = analysis.items.reduce((s, i) => s + i.pnl, 0);

  console.log('Sum of row Current Value:', sumCurrentVal, '| Header Total Value:', analysis.analytics.totalCurrentValue, '| Match:', sumCurrentVal === analysis.analytics.totalCurrentValue);
  console.log('Sum of row Invested Value:', sumInvestedVal, '| Header Total Invested:', analysis.analytics.totalInvested, '| Match:', sumInvestedVal === analysis.analytics.totalInvested);
  console.log('Sum of row Unrealized P&L:', sumPnl, '| Header Total Unrealized P&L:', analysis.analytics.totalPnl, '| Match:', sumPnl === analysis.analytics.totalPnl);

  console.log('\n=== 5. SIMULATION: UNEVALUATED / MISSING EVALUATION IN CACHE ===');
  const emptyCache = new Map<string, any>();
  const unEvalAnalysis = PortfolioEngine.analyze(holdings, emptyCache);
  for (const item of unEvalAnalysis.items) {
    console.log(item.holding.symbol, '=> fallback currentLtp:', item.currentLtp, '(matches averageBuyPrice:', item.currentLtp === item.holding.averageBuyPrice, ')');
  }

  console.log('\n=== 6. SIMULATION: ISIN VS SYMBOL KEY MISMATCH ===');
  // What if cache has key under ISIN only?
  const isinOnlyCache = new Map<string, any>();
  for (const [k, v] of evalsMap.entries()) {
    if (k.startsWith('INE') || k.startsWith('INF')) {
      isinOnlyCache.set(k, v);
    }
  }
  const isinAnalysis = PortfolioEngine.analyze(holdings, isinOnlyCache);
  for (const item of isinAnalysis.items) {
    console.log(item.holding.symbol, 'with ISIN-only cache => found eval:', Boolean(item.evaluation), 'currentLtp:', item.currentLtp);
  }

  // What if holding symbol is "ZYDUS" while evaluation is "ZYDUSLIFE"?
  const mismatchedHolding: Holding[] = [
    { id: 'hm1', symbol: 'CADILAHC', companyName: 'Cadila / Zydus', sector: 'Pharmaceuticals', isin: 'INE010B01027', quantity: 25, averageBuyPrice: 950.0, addedAt: new Date().toISOString() },
    { id: 'hm2', symbol: 'ZYDUS', companyName: 'Zydus Lifesciences', sector: 'Pharmaceuticals', quantity: 25, averageBuyPrice: 950.0, addedAt: new Date().toISOString() }, // No ISIN
  ];
  const mismatchAnalysis = PortfolioEngine.analyze(mismatchedHolding, evalsMap);
  console.log('\nCADILAHC (with ISIN INE010B01027) => found eval:', Boolean(mismatchAnalysis.items[0].evaluation), 'currentLtp:', mismatchAnalysis.items[0].currentLtp);
  console.log('ZYDUS (without ISIN) => found eval:', Boolean(mismatchAnalysis.items[1].evaluation), 'currentLtp:', mismatchAnalysis.items[1].currentLtp, '(fell back to averageBuyPrice!)');
}

audit().catch(console.error);
