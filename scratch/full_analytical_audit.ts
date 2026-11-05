import { UpstoxClient } from '../src/api/upstoxClient';
import { StockInsightPipeline } from '../src/engine';
import { FundamentalCalculator } from '../src/engine/calculators/fundamental';
import { TechnicalCalculator } from '../src/engine/calculators/technical';
import { FundamentalEngine } from '../src/engine/fundamentalEngine';
import { TechnicalEngine } from '../src/engine/technicalEngine';
import { SearchService } from '../src/api/searchService';
import { Normalizer } from '../src/engine/normalizer';
import { BENCHMARK_STOCKS } from '../src/api/benchmarkData';
import { FUNDAMENTALS_MASTER } from '../src/data/fundamentalsDatabase';

async function performFullAnalyticalAudit() {
  console.log('========================================================================');
  console.log('STOCKINSIGHT V2.2 — COMPLETE FUNDAMENTAL + TECHNICAL DATA INTEGRITY AUDIT');
  console.log('========================================================================\n');

  const client = new UpstoxClient();
  const hasToken = client.hasToken();
  console.log('PART C — LIVE DATA SOURCE STATUS:');
  console.log('  upstoxClient.hasToken():', hasToken);
  console.log('  Live Token Configured:', hasToken ? 'YES' : 'NO');
  if (!hasToken) {
    console.log('  Status: LIVE UPSTOX PROVENANCE NOT TESTABLE. (No live OAuth token present)\n');
  }

  const testAssets = [
    { symbol: 'RELIANCE', isin: 'INE002A01018' },
    { symbol: 'TCS', isin: 'INE467B01029' },
    { symbol: 'HDFCBANK', isin: 'INE040A01034' },
    { symbol: 'BAJFINANCE', isin: 'INE296A01024' },
    { symbol: 'PETRONET', isin: 'INE347G01014' },
    { symbol: 'ARE&M', isin: 'INE885A01032' },
    { symbol: 'GOLDBEES', isin: 'INF204KB17I5' },
    { symbol: 'ITBEES', isin: 'INF204KB15V2' },
  ];

  console.log('========================================================================');
  console.log('PART A & B — PORTFOLIO INVENTORY & INSTRUMENT IDENTITY');
  console.log('========================================================================');

  const evaluations: Record<string, any> = {};
  const rawInputs: Record<string, any> = {};

  for (const asset of testAssets) {
    const data = await client.getEvaluationData(asset.symbol, asset.isin);
    const evaluation = StockInsightPipeline.evaluate(data, asset.symbol);
    evaluations[asset.symbol] = evaluation;
    rawInputs[asset.symbol] = data;

    const inst = SearchService.getInstrumentBySymbol(asset.symbol) || SearchService.getInstrumentByIsin(asset.isin);
    const instType = evaluation.instrumentType;
    const sector = evaluation.sector;

    console.log(`\nASSET: ${asset.symbol}`);
    console.log(`  Name: ${evaluation.companyName}`);
    console.log(`  ISIN: ${evaluation.isin}`);
    console.log(`  Instrument Key: ${evaluation.instrumentKey}`);
    console.log(`  Exchange: NSE | Segment: EQ`);
    console.log(`  Classification: ${sector} | Instrument Type: ${instType}`);
    console.log(`  Data Source: ${evaluation.dataSource} | Quote Status: ${evaluation.execution.ltp ? 'RESOLVED' : 'UNAVAILABLE'}`);
    console.log(`  Fundamental Status: ${evaluation.fundamentalStatus}`);
  }

  console.log('\n========================================================================');
  console.log('PART D, E, F — FUNDAMENTAL METRICS, PROVENANCE & INDEPENDENT RECONCILIATION');
  console.log('========================================================================');

  for (const asset of testAssets) {
    const sym = asset.symbol;
    const evalData = evaluations[sym];
    const raw = rawInputs[sym];

    console.log(`\n------------------------------------------------------------`);
    console.log(`STOCK: ${sym} (${evalData.instrumentType}) | Sector: ${evalData.sectorName}`);
    console.log(`------------------------------------------------------------`);

    if (evalData.instrumentType === 'ETF') {
      console.log('  Fundamental Status: NOT_APPLICABLE (ETF asset - Fundamental factors evaluate to 0/50)');
      console.log('  Fundamental Score:', evalData.fundamentalScore);
      continue;
    }

    const kr = raw.keyRatios;
    const ai = raw.annualIncome;
    const qi = raw.quarterlyIncome;
    const bs = raw.balanceSheet;
    const cf = raw.cashFlow;

    // 1. P/E
    const peExtract = FundamentalCalculator.extractRatio(kr, 'P/E');
    console.log(`  P/E: Company = ${peExtract.companyValue}x | Sector = ${peExtract.sectorValue}x`);

    // 2. P/B
    const pbExtract = FundamentalCalculator.extractRatio(kr, 'P/B');
    console.log(`  P/B: Company = ${pbExtract.companyValue}x | Sector = ${pbExtract.sectorValue}x`);

    // 3. EV/EBITDA
    const evExtract = FundamentalCalculator.extractRatio(kr, 'EV/EBITDA');
    console.log(`  EV/EBITDA: Company = ${evExtract.companyValue}x | Sector = ${evExtract.sectorValue}x`);

    // 4. ROE
    const roeExtract = FundamentalCalculator.extractRatio(kr, 'ROE');
    console.log(`  ROE: Company = ${roeExtract.companyValue}%`);

    // 5. ROCE
    const roceExtract = FundamentalCalculator.extractRatio(kr, 'ROCE');
    console.log(`  ROCE: Company = ${roceExtract.companyValue}%`);

    // 6. ROA
    const roaExtract = FundamentalCalculator.extractRatio(kr, 'ROA');
    console.log(`  ROA: Company = ${roaExtract.companyValue}%`);

    // 7. OPM %
    const opm = FundamentalCalculator.calculateOPM(ai);
    console.log(`  Operating Margin (OPM): ${opm?.toFixed(2)}%`);

    // 8. 3Y Net Profit CAGR %
    const cagr = FundamentalCalculator.calculateNetProfitCAGR3Y(ai);
    console.log(`  3Y Net Profit CAGR: ${cagr?.toFixed(2)}%`);

    // 9. Debt to Equity
    const de = FundamentalCalculator.calculateDebtToEquity(bs);
    console.log(`  Debt to Equity (D/E): ${de?.toFixed(2)}x`);

    // 10. Cash Flow Conversion
    const cfMetrics = FundamentalCalculator.calculateCashFlowMetrics(cf, ai);
    console.log(`  CFO to EBITDA: ${cfMetrics.cfoToEbitdaRatio ? (cfMetrics.cfoToEbitdaRatio * 100).toFixed(1) + '%' : 'null'}`);
    console.log(`  Cumulative 3Y CFO: ₹${cfMetrics.cumulativeCfo3Y} Cr | Cumulative 3Y PAT: ₹${cfMetrics.cumulativePat3Y} Cr`);

    // Fundamental Score
    console.log(`  Total Fundamental Score: ${evalData.fundamentalScore} / 50`);
    console.log(`  Fundamental Factor Breakdown:`, evalData.fundamentalFactors.map((f: any) => `${f.name}: ${f.score}/${f.maxScore} (${f.status})`));
  }

  console.log('\n========================================================================');
  console.log('PART H, I, J, K — TECHNICAL INDICATORS, CANDLES & SCORE RECONCILIATION');
  console.log('========================================================================');

  for (const asset of testAssets) {
    const sym = asset.symbol;
    const evalData = evaluations[sym];
    const raw = rawInputs[sym];
    const candles = raw.candles;

    console.log(`\n------------------------------------------------------------`);
    console.log(`STOCK: ${sym} (${evalData.instrumentType}) | Candles: ${candles?.length || 0}`);
    console.log(`------------------------------------------------------------`);

    const techCalcs = TechnicalCalculator.compute(candles, raw.corporateActions, evalData.execution.ltp);

    console.log(`  LTP: ₹${techCalcs.ltp}`);
    console.log(`  50 DMA: ₹${techCalcs.sma50?.toFixed(2)}`);
    console.log(`  100 DMA: ₹${techCalcs.sma100?.toFixed(2)}`);
    console.log(`  200 EMA: ₹${techCalcs.ema200?.toFixed(2)} (Slope: ${techCalcs.ema200SlopePct?.toFixed(2)}%)`);
    console.log(`  MA Aligned (50 > 100 > 200): ${techCalcs.maAligned}`);
    console.log(`  RSI-14: ${techCalcs.rsi14?.toFixed(2)}`);
    console.log(`  20D ROC: ${techCalcs.roc20?.toFixed(2)}%`);
    console.log(`  Volume Accumulation: ${techCalcs.volumeAccumulationRatio?.toFixed(2)}x`);
    console.log(`  Breakout Volume Ratio: ${techCalcs.breakoutVolumeRatio?.toFixed(2)}x`);
    console.log(`  ATR-14: ₹${techCalcs.atr14?.toFixed(2)}`);
    console.log(`  Technical Score: ${evalData.technicalScore} / 50`);
    console.log(`  Technical Factor Breakdown:`, evalData.technicalFactors.map((f: any) => `${f.name}: ${f.score}/${f.maxScore} (${f.status})`));
  }

  console.log('\n========================================================================');
  console.log('PART O — STOCK SWITCHING AUDIT');
  console.log('========================================================================');
  const seq = ['RELIANCE', 'TCS', 'HDFCBANK', 'BAJFINANCE', 'PETRONET', 'ARE&M', 'GOLDBEES', 'ITBEES'];
  for (const s of seq) {
    const ev = evaluations[s];
    console.log(`  Select ${s.padEnd(10)} -> ISIN: ${ev.isin.padEnd(14)} | LTP: ₹${ev.execution.ltp.toString().padEnd(8)} | F-Score: ${ev.fundamentalScore}/50 | T-Score: ${ev.technicalScore}/50 | Core: ${ev.coreScore}/100`);
  }
}

performFullAnalyticalAudit();
