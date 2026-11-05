import { SearchService } from '../src/api/searchService';
import { UpstoxClient } from '../src/api/upstoxClient';
import { StockInsightPipeline } from '../src/engine';
import { PortfolioEngine } from '../src/engine/portfolioEngine';
import { FundamentalsDatabase } from '../src/data/fundamentalsDatabase';
import { NSE_INSTRUMENTS_MASTER } from '../src/data/nseInstruments';

async function forensicAudit() {
  console.log('=== PHASE 11A.1 FORENSIC SCRIPT ===\n');

  // 1. Master definition lookup
  const tmcvMaster = NSE_INSTRUMENTS_MASTER.find(i => i.symbol === 'TMCV');
  const tmpvMaster = NSE_INSTRUMENTS_MASTER.find(i => i.symbol === 'TMPV');
  const tataMaster = NSE_INSTRUMENTS_MASTER.find(i => i.symbol === 'TATAMOTORS');

  console.log('1. MASTER REGISTRY DATA:');
  console.log('TMCV:', JSON.stringify(tmcvMaster, null, 2));
  console.log('TMPV:', JSON.stringify(tmpvMaster, null, 2));
  console.log('TATAMOTORS:', JSON.stringify(tataMaster, null, 2));
  console.log('ISIN Match (TMCV === TMPV):', tmcvMaster?.isin === tmpvMaster?.isin);
  console.log('InstrumentKey Match (TMCV === TMPV):', tmcvMaster?.instrumentKey === tmpvMaster?.instrumentKey);

  // 2. Search service trace
  console.log('\n2. SEARCH SERVICE TRACE:');
  const searchTMCV = await SearchService.search('TMCV');
  const searchTMPV = await SearchService.search('TMPV');
  const searchTMCVName = await SearchService.search('Tata Motors Commercial Vehicles');
  const searchTMPVName = await SearchService.search('Tata Motors Passenger Vehicles');

  console.log('search("TMCV") [0]:', searchTMCV[0]?.symbol, '| ISIN:', searchTMCV[0]?.isin, '| Key:', searchTMCV[0]?.instrumentKey);
  console.log('search("TMPV") [0]:', searchTMPV[0]?.symbol, '| ISIN:', searchTMPV[0]?.isin, '| Key:', searchTMPV[0]?.instrumentKey);
  console.log('search("Tata Motors Commercial Vehicles") [0]:', searchTMCVName[0]?.symbol);
  console.log('search("Tata Motors Passenger Vehicles") [0]:', searchTMPVName[0]?.symbol);

  // 3. ISIN Reverse lookup
  console.log('\n3. ISIN REVERSE LOOKUP:');
  const isinLookup = SearchService.getInstrumentByIsin('INE155A01022');
  console.log('getInstrumentByIsin("INE155A01022"):', isinLookup?.symbol, isinLookup?.name);

  // 4. Fundamentals Database lookup
  console.log('\n4. FUNDAMENTALS DATABASE:');
  const tmcvFunds = FundamentalsDatabase.getFundamentals('TMCV', tmcvMaster?.isin, tmcvMaster?.name, tmcvMaster?.sector);
  const tmpvFunds = FundamentalsDatabase.getFundamentals('TMPV', tmpvMaster?.isin, tmpvMaster?.name, tmpvMaster?.sector);
  console.log('TMCV Company Name:', tmcvFunds.profile.data.company_name, '| PE:', tmcvFunds.keyRatios.data.find(r => r.name === 'P/E')?.company_value);
  console.log('TMPV Company Name:', tmpvFunds.profile.data.company_name, '| PE:', tmpvFunds.keyRatios.data.find(r => r.name === 'P/E')?.company_value);

  // 5. Upstox Client Evaluation Data (Fallback mode)
  console.log('\n5. EVALUATION DATA PIPELINE (FALLBACK MODE):');
  const client = new UpstoxClient();
  const tmcvEvalInput = await client.getEvaluationData('TMCV');
  const tmpvEvalInput = await client.getEvaluationData('TMPV');

  console.log('TMCV Fallback Quote Token:', tmcvEvalInput.quote.instrument_token, 'LTP:', tmcvEvalInput.quote.last_price);
  console.log('TMPV Fallback Quote Token:', tmpvEvalInput.quote.instrument_token, 'LTP:', tmpvEvalInput.quote.last_price);

  const tmcvEval = StockInsightPipeline.evaluate(tmcvEvalInput, 'TMCV');
  const tmpvEval = StockInsightPipeline.evaluate(tmpvEvalInput, 'TMPV');

  console.log('\nTMCV Evaluation:', {
    tradingSymbol: tmcvEval.tradingSymbol,
    companyName: tmcvEval.companyName,
    isin: tmcvEval.isin,
    coreScore: tmcvEval.coreScore,
    fundamentalScore: tmcvEval.fundamentalScore,
    technicalScore: tmcvEval.technicalScore,
    ltp: tmcvEval.execution.ltp,
    stopLoss: tmcvEval.execution.stopLoss,
    e1: tmcvEval.priceStructure.e1,
    e2: tmcvEval.priceStructure.e2,
    e3: tmcvEval.priceStructure.e3,
    t1: tmcvEval.priceStructure.t1,
    t2: tmcvEval.priceStructure.t2,
    t3: tmcvEval.priceStructure.t3,
  });

  console.log('\nTMPV Evaluation:', {
    tradingSymbol: tmpvEval.tradingSymbol,
    companyName: tmpvEval.companyName,
    isin: tmpvEval.isin,
    coreScore: tmpvEval.coreScore,
    fundamentalScore: tmpvEval.fundamentalScore,
    technicalScore: tmpvEval.technicalScore,
    ltp: tmpvEval.execution.ltp,
    stopLoss: tmpvEval.execution.stopLoss,
    e1: tmpvEval.priceStructure.e1,
    e2: tmpvEval.priceStructure.e2,
    e3: tmpvEval.priceStructure.e3,
    t1: tmpvEval.priceStructure.t1,
    t2: tmpvEval.priceStructure.t2,
    t3: tmpvEval.priceStructure.t3,
  });

  // 6. Evaluations Cache Collision Simulation
  console.log('\n6. CACHE COLLISION TEST:');
  const cache = new Map<string, any>();
  // Populate TMCV first
  cache.set('TMCV', tmcvEval);
  if (tmcvEval.tradingSymbol) cache.set(tmcvEval.tradingSymbol.toUpperCase(), tmcvEval);
  if (tmcvEval.isin) cache.set(tmcvEval.isin.toUpperCase(), tmcvEval);

  console.log('Cache after TMCV addition:');
  console.log('cache.get("TMCV") tradingSymbol:', cache.get('TMCV')?.tradingSymbol);
  console.log('cache.get("INE155A01022") tradingSymbol:', cache.get('INE155A01022')?.tradingSymbol);

  // Populate TMPV next
  cache.set('TMPV', tmpvEval);
  if (tmpvEval.tradingSymbol) cache.set(tmpvEval.tradingSymbol.toUpperCase(), tmpvEval);
  if (tmpvEval.isin) cache.set(tmpvEval.isin.toUpperCase(), tmpvEval);

  console.log('\nCache after TMPV addition (OVERWRITE CHECK):');
  console.log('cache.get("TMCV") tradingSymbol:', cache.get('TMCV')?.tradingSymbol);
  console.log('cache.get("TMPV") tradingSymbol:', cache.get('TMPV')?.tradingSymbol);
  console.log('cache.get("INE155A01022") tradingSymbol:', cache.get('INE155A01022')?.tradingSymbol);

  // 7. Portfolio Engine Analysis
  console.log('\n7. PORTFOLIO ENGINE ANALYSIS:');
  const holdings = [
    {
      id: 'h_tmcv',
      symbol: 'TMCV',
      companyName: 'Tata Motors Commercial Vehicles Limited',
      sector: 'Automobiles - Commercial Vehicles & Trucks',
      isin: 'INE155A01022',
      quantity: 50,
      averageBuyPrice: 750,
      addedAt: new Date().toISOString(),
    },
    {
      id: 'h_tmpv',
      symbol: 'TMPV',
      companyName: 'Tata Motors Passenger Vehicles Limited',
      sector: 'Automobiles - Passenger Cars & EVs',
      isin: 'INE155A01022',
      quantity: 50,
      averageBuyPrice: 900,
      addedAt: new Date().toISOString(),
    }
  ];

  const analysis = PortfolioEngine.analyze(holdings, cache);
  console.log('Holding 1 (TMCV):', {
    symbol: analysis.items[0].holding.symbol,
    evalTradingSymbol: analysis.items[0].evaluation?.tradingSymbol,
    currentLtp: analysis.items[0].currentLtp,
    coreScore: analysis.items[0].coreScore,
    stopLoss: analysis.items[0].stopLoss,
  });
  console.log('Holding 2 (TMPV):', {
    symbol: analysis.items[1].holding.symbol,
    evalTradingSymbol: analysis.items[1].evaluation?.tradingSymbol,
    currentLtp: analysis.items[1].currentLtp,
    coreScore: analysis.items[1].coreScore,
    stopLoss: analysis.items[1].stopLoss,
  });

  // What happens if cache only had ISIN lookup or symbol mismatch?
  const isinOnlyCache = new Map<string, any>();
  isinOnlyCache.set('INE155A01022', tmpvEval); // Only ISIN stored
  const analysisIsinOnly = PortfolioEngine.analyze(holdings, isinOnlyCache);
  console.log('\nHoldings analyzed against ISIN-only cache (simulating missing symbol key):');
  console.log('Holding 1 (TMCV) got eval:', analysisIsinOnly.items[0].evaluation?.tradingSymbol, 'LTP:', analysisIsinOnly.items[0].currentLtp);
  console.log('Holding 2 (TMPV) got eval:', analysisIsinOnly.items[1].evaluation?.tradingSymbol, 'LTP:', analysisIsinOnly.items[1].currentLtp);
}

forensicAudit().catch(console.error);
