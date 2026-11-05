import { UpstoxClient } from '../src/api/upstoxClient';
import { StockInsightPipeline } from '../src/engine';
import { PortfolioEngine } from '../src/engine/portfolioEngine';
import { SearchService } from '../src/api/searchService';
import { Normalizer } from '../src/engine/normalizer';
import { BENCHMARK_STOCKS } from '../src/api/benchmarkData';
import { Holding } from '../src/types/portfolio';

async function runAudit() {
  console.log('============================================================');
  console.log('STOCKINSIGHT V2.2 — MARKET PRICE & ETF UPSTOX PROVENANCE AUDIT');
  console.log('============================================================\n');

  const client = new UpstoxClient();
  const hasToken = client.hasToken();

  console.log('--- 3. LIVE TOKEN STATUS ---');
  console.log('hasToken():', hasToken);
  console.log('Token status:', hasToken ? 'ACTIVE' : 'NO TOKEN CONFIGURED');
  if (!hasToken) {
    console.log('Declaration: LIVE UPSTOX PROVENANCE NOT TESTABLE (No live token provided).\n');
  }

  // 1. Asset Inventory
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
    },
    {
      id: 'custom_itbees_7',
      symbol: 'ITBEES',
      companyName: 'Nippon India ETF Nifty IT',
      sector: 'ETF',
      isin: 'INF204KB15V2',
      quantity: 100,
      averageBuyPrice: 42.50,
      addedAt: new Date().toISOString(),
    }
  ];

  const allHoldings = [...defaultHoldings, ...additionalHoldings];

  console.log('--- 1. COMPLETE PORTFOLIO ASSET INVENTORY ---');
  for (const h of allHoldings) {
    const inst = SearchService.getInstrumentBySymbol(h.symbol) || (h.isin ? SearchService.getInstrumentByIsin(h.isin) : undefined);
    const sectorNorm = Normalizer.routeSector(h.sector || '', undefined, h.symbol);
    const instType = Normalizer.getInstrumentType(h.sector || '', undefined, h.symbol);
    const isin = h.isin || inst?.isin || 'UNKNOWN';
    const instrumentKey = `NSE_EQ|${isin}`;

    console.log({
      symbol: h.symbol,
      companyName: h.companyName,
      isin,
      classification: sectorNorm,
      instrumentType: instType,
      segment: 'EQ',
      exchange: 'NSE',
      instrumentKey,
      securityType: instType === 'ETF' ? 'ETF_UNIT' : 'EQUITY_SHARE',
    });
  }

  // 2. Instrument Identity & Resolution
  console.log('\n--- 2. INSTRUMENT IDENTITY & RESOLUTION ---');
  for (const h of allHoldings) {
    const data = await client.getEvaluationData(h.symbol, h.isin);
    const evalResult = StockInsightPipeline.evaluate(data, h.symbol);

    console.log({
      portfolioSymbol: h.symbol,
      resolvedTradingSymbol: evalResult.tradingSymbol,
      isin: evalResult.isin,
      instrumentKey: evalResult.instrumentKey,
      quoteToken: data.quote.instrument_token,
      dataSource: evalResult.dataSource,
      fundamentalStatus: evalResult.fundamentalStatus,
      rawLtp: data.quote.last_price,
      resolvedLtp: evalResult.execution.ltp,
      identityMatch:
        evalResult.tradingSymbol.toUpperCase() === h.symbol.toUpperCase() &&
        (h.isin ? evalResult.isin.toUpperCase() === h.isin.toUpperCase() : true),
    });
  }

  // 4. ETF-Specific Audit
  console.log('\n--- 4. ETF-SPECIFIC AUDIT ---');
  const etfSymbols = ['GOLDBEES', 'ITBEES'];
  for (const sym of etfSymbols) {
    const h = allHoldings.find(x => x.symbol === sym);
    const data = await client.getEvaluationData(sym, h?.isin);
    const evalResult = StockInsightPipeline.evaluate(data, sym);

    console.log({
      etfSymbol: sym,
      isin: evalResult.isin,
      instrumentKey: evalResult.instrumentKey,
      sector: evalResult.sector,
      instrumentType: evalResult.instrumentType,
      fundamentalStatus: evalResult.fundamentalStatus,
      fundamentalScore: evalResult.fundamentalScore,
      technicalScore: evalResult.technicalScore,
      coreScore: evalResult.coreScore,
      zone: evalResult.zone,
      ltp: evalResult.execution.ltp,
      e1: evalResult.priceStructure?.entries.e1,
      s1: evalResult.priceStructure?.stops?.s1,
      t1: evalResult.priceStructure?.targets.t1,
      dataSource: evalResult.dataSource,
    });
  }

  // 7. Price -> P&L Reconciliation
  console.log('\n--- 7. PRICE -> P&L RECONCILIATION ---');
  const evalsMap = new Map<string, any>();
  for (const h of allHoldings) {
    const data = await client.getEvaluationData(h.symbol, h.isin);
    const res = StockInsightPipeline.evaluate(data, h.symbol);
    evalsMap.set(h.symbol.toUpperCase(), res);
    if (res.isin) evalsMap.set(res.isin.toUpperCase(), res);
  }

  const { items } = PortfolioEngine.analyze(allHoldings, evalsMap);
  for (const item of items) {
    console.log({
      symbol: item.holding.symbol,
      assetType: item.evaluation?.instrumentType || 'EQUITY',
      qty: item.holding.quantity,
      avgBuy: item.holding.averageBuyPrice,
      ltp: item.currentLtp,
      invested: item.investedValue,
      currentValue: item.currentValue,
      pnl: item.pnl,
      pnlPct: item.pnlPercentage !== null ? item.pnlPercentage.toFixed(2) + '%' : null,
      quoteStatus: item.quoteStatus,
    });
  }

  // 10. Cache / Identity Isolation
  console.log('\n--- 10. CACHE & IDENTITY ISOLATION SWITCHING ---');
  const switchSequence = ['GOLDBEES', 'RELIANCE', 'TCS', 'GOLDBEES'];
  for (const s of switchSequence) {
    const e = evalsMap.get(s);
    console.log(`Switched to ${s.padEnd(10)} -> Resolved ISIN: ${e?.isin} | LTP: ₹${e?.execution?.ltp} | Type: ${e?.instrumentType}`);
  }
}

runAudit();
