import { UpstoxClient } from '../src/api/upstoxClient.ts';
import { StockInsightPipeline } from '../src/engine/index.ts';
import { PortfolioEngine } from '../src/engine/portfolioEngine.ts';
import { SearchService } from '../src/api/searchService.ts';
import { Holding } from '../src/types/portfolio.ts';
import { StockInsightEvaluation } from '../src/types/engine.ts';

async function testStockSelectionFlow() {
  const upstoxClient = new UpstoxClient();
  const holdings: Holding[] = upstoxClient.getDefaultHoldings();
  const evaluationsCache = new Map<string, StockInsightEvaluation>();

  // 1. Initial evaluateAllHoldings
  const isinMap = new Map<string, string>();
  holdings.forEach((h) => {
    if (h.isin) isinMap.set(h.symbol.toUpperCase(), h.isin);
  });

  const symbolsToEvaluate = holdings.map((h) => h.symbol.toUpperCase());
  for (const s of symbolsToEvaluate) {
    const data = await upstoxClient.getEvaluationData(s, isinMap.get(s));
    const res = StockInsightPipeline.evaluate(data, s);
    evaluationsCache.set(s, res);
    if (res.tradingSymbol) evaluationsCache.set(res.tradingSymbol.toUpperCase(), res);
    if (res.isin) evaluationsCache.set(res.isin.toUpperCase(), res);
  }

  // 2. PortfolioEngine analyze
  const { items: portfolioItems } = PortfolioEngine.analyze(holdings, evaluationsCache);

  console.log('Portfolio Items in cache:', portfolioItems.map(i => ({ symbol: i.holding.symbol, evalSymbol: i.evaluation?.tradingSymbol, isin: i.holding.isin })));

  // 3. Test handleSelectStock for each stock
  const testSymbols = ['RELIANCE', 'TCS', 'HDFCBANK', 'BAJFINANCE', 'ARE&M', 'GOLDBEES'];

  for (const testSym of testSymbols) {
    const upper = testSym.toUpperCase().trim();
    const isIsin = (s?: string) => Boolean(s && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s));
    
    const instrument = (isIsin(upper) ? SearchService.getInstrumentByIsin(upper) : undefined) ||
      SearchService.getInstrumentBySymbol(upper);

    const targetSymbol = instrument?.symbol ? instrument.symbol.toUpperCase() : upper;
    const targetIsin = (instrument?.isin && isIsin(instrument.isin) ? instrument.isin : isIsin(upper) ? upper : undefined)?.toUpperCase();

    let selectedEvaluation: StockInsightEvaluation | null = null;

    // Path 1: Look inside portfolioItems
    const existingHolding = portfolioItems.find((item) => {
      const itemSym = item.holding.symbol.toUpperCase();
      const itemEvalSym = item.evaluation?.tradingSymbol.toUpperCase();
      const itemIsin = item.holding.isin?.toUpperCase();
      const itemEvalIsin = item.evaluation?.isin?.toUpperCase();

      const symbolMatch = itemSym === targetSymbol || itemSym === upper || itemEvalSym === targetSymbol || itemEvalSym === upper;
      const isinMatch = Boolean(targetIsin && (itemIsin === targetIsin || itemEvalIsin === targetIsin));

      return symbolMatch || isinMatch;
    });

    if (existingHolding?.evaluation) {
      selectedEvaluation = existingHolding.evaluation;
      console.log(`[Path 1] Select '${testSym}' -> Found in portfolioItems: tradingSymbol='${selectedEvaluation.tradingSymbol}', companyName='${selectedEvaluation.companyName}'`);
    } else {
      // Path 2: Look in evaluationsCache
      const cached =
        evaluationsCache.get(targetSymbol) ||
        evaluationsCache.get(upper) ||
        (targetIsin ? evaluationsCache.get(targetIsin) : undefined) ||
        Array.from(evaluationsCache.values()).find((e) => {
          const evalSym = e.tradingSymbol.toUpperCase();
          const evalIsin = e.isin?.toUpperCase();
          return evalSym === targetSymbol || evalSym === upper || (Boolean(targetIsin) && evalIsin === targetIsin);
        });

      if (cached) {
        selectedEvaluation = cached;
        console.log(`[Path 2] Select '${testSym}' -> Found in cache: tradingSymbol='${selectedEvaluation.tradingSymbol}', companyName='${selectedEvaluation.companyName}'`);
      } else {
        // Path 3: Fallback live eval
        const data = await upstoxClient.getEvaluationData(targetSymbol, targetIsin);
        selectedEvaluation = StockInsightPipeline.evaluate(data, targetSymbol);
        console.log(`[Path 3] Select '${testSym}' -> Evaluated live: tradingSymbol='${selectedEvaluation.tradingSymbol}', companyName='${selectedEvaluation.companyName}'`);
      }
    }

    if (selectedEvaluation.tradingSymbol.toUpperCase() !== targetSymbol && !targetSymbol.includes(selectedEvaluation.tradingSymbol.toUpperCase()) && !selectedEvaluation.tradingSymbol.toUpperCase().includes(targetSymbol)) {
      console.error(`❌ MISMATCH! Selected ${testSym} but got ${selectedEvaluation.tradingSymbol}`);
    } else {
      console.log(`✅ MATCH! Selected ${testSym} -> Evaluated ${selectedEvaluation.tradingSymbol} (${selectedEvaluation.companyName}) | Score: ${selectedEvaluation.coreScore.toFixed(1)} | LTP: ₹${selectedEvaluation.execution.ltp}\n`);
    }
  }
}

testStockSelectionFlow().catch(console.error);
