import { UpstoxClient } from '../src/api/upstoxClient.ts';
import { StockInsightPipeline } from '../src/engine/index.ts';
import { TechnicalCalculator } from '../src/engine/calculators/technical.ts';
import { FundamentalCalculator } from '../src/engine/calculators/fundamental.ts';
import { SearchService } from '../src/api/searchService.ts';

async function runAudit() {
  const client = new UpstoxClient();
  const testSymbols = ['RELIANCE', 'TCS', 'HDFCBANK', 'BAJFINANCE', 'ARE&M', 'GOLDBEES'];

  console.log('========================================================================');
  console.log('STOCKINSIGHT V2.2 — READ-ONLY UPSTOX DATA PROVENANCE & CALCULATION AUDIT');
  console.log('========================================================================\n');

  for (const sym of testSymbols) {
    const inst = SearchService.getInstrumentBySymbol(sym);
    const data = await client.getEvaluationData(sym, inst?.isin);
    const evalResult = StockInsightPipeline.evaluate(data, sym);

    console.log(`\n========================================================================`);
    console.log(`ASSET AUDIT: [${sym}]`);
    console.log(`ISIN: ${evalResult.isin} | Instrument Key: ${evalResult.instrumentKey}`);
    console.log(`Company: ${evalResult.companyName} | Sector: ${evalResult.sector} | DataSource: ${evalResult.dataSource}`);
    console.log(`========================================================================`);

    // 1. Raw Market Quote
    console.log(`\n[1. RAW MARKET QUOTE PROVENANCE]`);
    console.log(`   LTP (last_price): ₹${data.quote.last_price}`);
    console.log(`   OHLC: Open ₹${data.quote.open} | High ₹${data.quote.high} | Low ₹${data.quote.low} | Close ₹${data.quote.close}`);
    console.log(`   Volume: ${data.quote.volume} | Net Change: ₹${data.quote.net_change} (${evalResult.netChangePct.toFixed(2)}%)`);
    console.log(`   Avg Price: ₹${data.quote.average_price} | Yearly High: ₹${data.quote.yearly_high ?? 'N/A'} | Yearly Low: ₹${data.quote.yearly_low ?? 'N/A'}`);

    // 2. Technical Derivations
    const techCalcs = TechnicalCalculator.compute(data.candles, data.corporateActions, data.quote.last_price);
    console.log(`\n[2. TECHNICAL DERIVATIONS (Independent vs Pipeline)]`);
    console.log(`   Candles Count: ${data.candles.length} bars`);
    console.log(`   50-SMA:  ₹${techCalcs.sma50?.toFixed(2) ?? 'N/A'} | 100-SMA: ₹${techCalcs.sma100?.toFixed(2) ?? 'N/A'} | 200-EMA: ₹${techCalcs.ema200?.toFixed(2) ?? 'N/A'}`);
    console.log(`   MA Aligned: ${techCalcs.maAligned} | 200-EMA 20D Slope: ${techCalcs.ema200SlopePct?.toFixed(2) ?? 'N/A'}%`);
    console.log(`   RSI(14): ${techCalcs.rsi14?.toFixed(2) ?? 'N/A'} | 20D ROC: ${techCalcs.roc20?.toFixed(2) ?? 'N/A'}%`);
    console.log(`   ATR(14): ₹${techCalcs.atr14?.toFixed(2) ?? 'N/A'} | 10D Swing Low: ₹${techCalcs.swingLow10?.toFixed(2) ?? 'N/A'}`);
    console.log(`   52W Range Position: ${techCalcs.rangePosition52WPct?.toFixed(2) ?? 'N/A'}%`);
    console.log(`   Volume Accumulation Ratio: ${techCalcs.volumeAccumulationRatio?.toFixed(2) ?? 'N/A'} | Breakout Vol Ratio: ${techCalcs.breakoutVolumeRatio?.toFixed(2) ?? 'N/A'}`);
    console.log(`   20D Turnover: ₹${techCalcs.turnover20DCr.toFixed(2)} Cr`);
    console.log(`   -> Pipeline Technical Score: ${evalResult.technicalScore.toFixed(1)} / 50`);

    // 3. Fundamental Derivations
    console.log(`\n[3. FUNDAMENTAL DERIVATIONS]`);
    console.log(`   Fundamental Status: ${evalResult.fundamentalStatus}`);
    if (evalResult.sector !== 'ETF') {
      const fundCalcs = FundamentalCalculator.compute(data.keyRatios, data.annualIncome, data.quarterlyIncome, data.balanceSheet, data.cashFlow);
      console.log(`   P/E: ${fundCalcs.pe?.toFixed(2) ?? 'N/A'} | P/B: ${fundCalcs.pb?.toFixed(2) ?? 'N/A'} | EV/EBITDA: ${fundCalcs.evEbitda?.toFixed(2) ?? 'N/A'}`);
      console.log(`   ROE: ${fundCalcs.roe?.toFixed(2) ?? 'N/A'}% | ROCE: ${fundCalcs.roce?.toFixed(2) ?? 'N/A'}% | ROA: ${fundCalcs.roa?.toFixed(2) ?? 'N/A'}%`);
      console.log(`   Operating Margin: ${fundCalcs.operatingMarginPct?.toFixed(2) ?? 'N/A'}% | 3Y PAT CAGR: ${fundCalcs.patCagr3YPct?.toFixed(2) ?? 'N/A'}%`);
      console.log(`   Debt/Equity: ${fundCalcs.debtToEquity?.toFixed(2) ?? 'N/A'} | CFO/EBITDA: ${fundCalcs.cfoToEbitda?.toFixed(2) ?? 'N/A'}`);
      console.log(`   Accrual Trap Detected: ${fundCalcs.accrualTrapDetected}`);
      console.log(`   -> Pipeline Fundamental Score: ${evalResult.fundamentalScore.toFixed(1)} / 50`);
    } else {
      console.log(`   ETF Asset: Fundamental Score is NOT_APPLICABLE. (Scaled Technical: ${evalResult.technicalScore.toFixed(1)} * 2 = Core Score: ${evalResult.coreScore.toFixed(1)})`);
    }

    // 4. Score Aggregation & Decision Zone
    console.log(`\n[4. CORE SCORE & DECISION ZONE]`);
    console.log(`   Fundamental Score: ${evalResult.fundamentalScore.toFixed(1)}`);
    console.log(`   Technical Score:   ${evalResult.technicalScore.toFixed(1)}`);
    console.log(`   Core Score:        ${evalResult.coreScore.toFixed(1)} / 100`);
    console.log(`   Decision Zone:     ${evalResult.zone} (${evalResult.zoneReason})`);
    console.log(`   Fundamental Floor: ${evalResult.safety.fundamentalFloorFailed ? 'FAILED' : 'PASSED'}`);

    // 5. Model D 9-Level Price Structure
    console.log(`\n[5. MODEL D 9-LEVEL GEOMETRY]`);
    console.log(`   SUPPORT:`);
    console.log(`     E1 (Near):         ₹${evalResult.priceStructure.entries.e1?.price?.toFixed(1) ?? 'UNAVAILABLE'} [${evalResult.priceStructure.entries.e1?.classification}]`);
    console.log(`     E2 (Intermediate): ₹${evalResult.priceStructure.entries.e2?.price?.toFixed(1) ?? 'UNAVAILABLE'} [${evalResult.priceStructure.entries.e2?.classification}]`);
    console.log(`     E3 (Deep):         ₹${evalResult.priceStructure.entries.e3?.price?.toFixed(1) ?? 'UNAVAILABLE'} [${evalResult.priceStructure.entries.e3?.classification}]`);
    console.log(`   PROTECTIVE STOPS:`);
    console.log(`     S1 (Near Stop):    ₹${evalResult.priceStructure.stops?.s1?.price?.toFixed(1) ?? 'UNAVAILABLE'} [${evalResult.priceStructure.stops?.s1?.classification}]`);
    console.log(`     S2 (Inter Stop):   ₹${evalResult.priceStructure.stops?.s2?.price?.toFixed(1) ?? 'UNAVAILABLE'} [${evalResult.priceStructure.stops?.s2?.classification}]`);
    console.log(`     S3 (Deep Stop):    ₹${evalResult.priceStructure.stops?.s3?.price?.toFixed(1) ?? 'UNAVAILABLE'} [${evalResult.priceStructure.stops?.s3?.classification}]`);
    console.log(`   UPSIDE TARGETS:`);
    console.log(`     T1 (Near):         ₹${evalResult.priceStructure.targets.t1?.price?.toFixed(1) ?? 'UNAVAILABLE'} [${evalResult.priceStructure.targets.t1?.classification}]`);
    console.log(`     T2 (Intermediate): ₹${evalResult.priceStructure.targets.t2?.price?.toFixed(1) ?? 'UNAVAILABLE'} [${evalResult.priceStructure.targets.t2?.classification}]`);
    console.log(`     T3 (Extended):     ₹${evalResult.priceStructure.targets.t3?.price?.toFixed(1) ?? 'UNAVAILABLE'} [${evalResult.priceStructure.targets.t3?.classification}]`);

    // Invariant checks:
    const e1 = evalResult.priceStructure.entries.e1?.price;
    const s1 = evalResult.priceStructure.stops?.s1?.price;
    const t1 = evalResult.priceStructure.targets.t1?.price;
    const ltp = evalResult.execution.ltp;
    console.log(`   Model D Geometry Invariants:`);
    console.log(`     S1 < E1: ${s1 && e1 ? s1 < e1 : 'N/A'} (S1=₹${s1?.toFixed(1)}, E1=₹${e1?.toFixed(1)})`);
    console.log(`     E1 <= LTP: ${e1 ? e1 <= ltp : 'N/A'} (E1=₹${e1?.toFixed(1)}, LTP=₹${ltp?.toFixed(1)})`);
    console.log(`     T1 > LTP: ${t1 ? t1 > ltp : 'N/A'} (T1=₹${t1?.toFixed(1)}, LTP=₹${ltp?.toFixed(1)})`);

    // 6. Execution & Risk Corridor
    console.log(`\n[6. EXECUTION & RISK SETUP]`);
    console.log(`   Status:         ${evalResult.execution.status}`);
    console.log(`   Execution Stop: ₹${evalResult.execution.stopLoss.toFixed(1)}`);
    console.log(`   Max Entry:      ₹${evalResult.execution.maxEntry.toFixed(1)}`);
    console.log(`   Target:         ₹${evalResult.execution.target.toFixed(1)}`);
    console.log(`   Minimum R:R:    ${evalResult.execution.minimumRR.toFixed(1)}:1`);
    console.log(`   Spread:         ${evalResult.execution.bidAskSpreadPct.toFixed(2)}% (High Slippage: ${evalResult.execution.highSlippageRisk})`);
    console.log(`   Anti-Compression Applied: ${evalResult.execution.antiStopCompressionApplied}`);
  }
}

runAudit().catch(console.error);
