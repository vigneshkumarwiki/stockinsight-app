import { UpstoxClient } from '../src/api/upstoxClient';
import { StockInsightPipeline } from '../src/engine';
import { TechnicalCalculator } from '../src/engine/calculators/technical';
import { SearchService } from '../src/api/searchService';
import * as fs from 'fs';

interface SimResult {
  symbol: string;
  companyName: string;
  sector: string;
  instrumentType: string;
  dataSource: string;
  ltp: number;
  atr14: number;
  sma50: number | null;
  sma100: number | null;
  ema200: number | null;
  swingLow10: number | null;
  swingHigh10: number | null;
  swingLow20: number | null;
  swingHigh20: number | null;
  low52W: number | null;
  high52W: number | null;
  // Proposed Levels
  e1: number;
  e2: number;
  e3: number;
  sl: number;
  t1: number;
  t2: number;
  t3: number;
  // Distances (%)
  distE1Pct: number;
  distE2Pct: number;
  distE3Pct: number;
  distSlPct: number;
  distT1Pct: number;
  distT2Pct: number;
  distT3Pct: number;
  // Ordering checks
  orderingOk: boolean;
  orderingIssues: string[];
  // Production Comparison
  prodStop: number;
  prodTarget: number;
  prodMaxEntry: number;
  prodStatus: string;
  // Layer 1 Condition
  coreScore: number;
  zone: string;
}

async function runSimulation() {
  const symbols = [
    'RELIANCE',
    'TCS',
    'HDFCBANK',
    'BAJFINANCE',
    'FINCABLES',
    'KPITTECH',
    'NAVINFLUOR',
    'TATAMOTORS',
    'INFY',
    'GOLDBEES',
    'ITCHOTELS',
    'ITBEES'
  ];

  const client = new UpstoxClient();
  const results: SimResult[] = [];

  for (const sym of symbols) {
    const inst = SearchService.getInstrumentBySymbol(sym);
    const isin = inst?.isin;
    const evalData = await client.getEvaluationData(sym, isin);
    const evalRes = StockInsightPipeline.evaluate(evalData, sym);

    const candles = evalData.candles;
    const ltp = evalRes.execution.ltp;
    const atr14 = TechnicalCalculator.calculateATR(candles, 14) || ltp * 0.02;
    const sma50 = TechnicalCalculator.calculateSMA(candles, 50);
    const sma100 = TechnicalCalculator.calculateSMA(candles, 100);
    const ema200 = TechnicalCalculator.calculateEMA(candles, 200);
    const swingLow10 = TechnicalCalculator.calculateSwingLow(candles, 10);
    
    // Calculate Swing High 10
    let swingHigh10: number | null = null;
    if (candles.length >= 10) {
      let maxH = -Infinity;
      for (let i = 0; i < 10; i++) {
        if (candles[i][2] > maxH) maxH = candles[i][2];
      }
      swingHigh10 = maxH;
    }

    // Calculate Swing Low 20 & Swing High 20
    let swingLow20: number | null = null;
    let swingHigh20: number | null = null;
    if (candles.length >= 20) {
      let minL = Infinity;
      let maxH = -Infinity;
      for (let i = 0; i < 20; i++) {
        if (candles[i][3] < minL) minL = candles[i][3];
        if (candles[i][2] > maxH) maxH = candles[i][2];
      }
      swingLow20 = minL;
      swingHigh20 = maxH;
    }

    // 52W High & Low
    const lookback52W = Math.min(candles.length, 250);
    let high52W = -Infinity;
    let low52W = Infinity;
    for (let i = 0; i < lookback52W; i++) {
      if (candles[i][2] > high52W) high52W = candles[i][2];
      if (candles[i][3] < low52W) low52W = candles[i][3];
    }

    // PROPOSED FORMULAS:
    // E1 = max(SwingLow10, LTP - 0.75 * ATR14); fallback LTP * 0.985
    let e1 = swingLow10 !== null
      ? Math.max(swingLow10, ltp - 0.75 * atr14)
      : ltp * 0.985;

    // E2 = max(SMA50, SwingLow20, LTP - 1.5 * ATR14); fallback LTP * 0.95
    const e2Candidates: number[] = [ltp - 1.5 * atr14];
    if (sma50 !== null) e2Candidates.push(sma50);
    if (swingLow20 !== null) e2Candidates.push(swingLow20);
    let e2 = Math.max(...e2Candidates);

    // E3 = max(SMA100, EMA200, LTP - 3 * ATR14); fallback LTP * 0.90
    const e3Candidates: number[] = [ltp - 3.0 * atr14];
    if (sma100 !== null) e3Candidates.push(sma100);
    if (ema200 !== null) e3Candidates.push(ema200);
    let e3 = Math.max(...e3Candidates);

    // STOP LOSS:
    // Hierarchy:
    // 1. Relevant swing low below E3
    // 2. 200-EMA if within ~8% of LTP
    // 3. LTP - 2 * ATR14
    // Min distance >= 1.5 * ATR14
    let rawSl = ltp - 2.0 * atr14;
    if (ema200 !== null && ema200 < ltp && ((ltp - ema200) / ltp) <= 0.08) {
      rawSl = Math.min(rawSl, ema200 - 0.5 * atr14);
    }
    if (swingLow20 !== null && swingLow20 < e3) {
      rawSl = Math.min(rawSl, swingLow20 - 0.5 * atr14);
    }
    // Anti-stop compression: distance >= 1.5 * ATR14
    let sl = rawSl;
    if (ltp - sl < 1.5 * atr14) {
      sl = ltp - 1.5 * atr14;
    }
    if (sl >= ltp || sl <= 0) {
      sl = ltp * 0.95;
    }

    // TARGETS:
    // T1 = LTP + max(1.5 * ATR14, 5% * LTP)
    const t1 = ltp + Math.max(1.5 * atr14, 0.05 * ltp);
    // T2 = LTP + max(3 * ATR14, 8% * LTP)
    const t2 = ltp + Math.max(3.0 * atr14, 0.08 * ltp);
    // T3 = LTP + max(5 * ATR14, 15% * LTP)
    const t3 = ltp + Math.max(5.0 * atr14, 0.15 * ltp);

    // Ordering checks:
    const orderingIssues: string[] = [];
    if (!(ltp > e1)) orderingIssues.push(`LTP (${ltp}) <= E1 (${e1})`);
    if (!(e1 > e2)) orderingIssues.push(`E1 (${e1}) <= E2 (${e2})`);
    if (!(e2 > e3)) orderingIssues.push(`E2 (${e2}) <= E3 (${e3})`);
    if (!(e3 > sl)) orderingIssues.push(`E3 (${e3}) <= SL (${sl})`);
    if (!(sl < t1)) orderingIssues.push(`SL (${sl}) >= T1 (${t1})`);
    if (!(t1 < t2)) orderingIssues.push(`T1 (${t1}) >= T2 (${t2})`);
    if (!(t2 < t3)) orderingIssues.push(`T2 (${t2}) >= T3 (${t3})`);

    const orderingOk = orderingIssues.length === 0;

    results.push({
      symbol: sym,
      companyName: evalRes.companyName,
      sector: evalRes.sector,
      instrumentType: evalRes.instrumentType || 'EQUITY',
      dataSource: evalRes.dataSource,
      ltp,
      atr14,
      sma50,
      sma100,
      ema200,
      swingLow10,
      swingHigh10,
      swingLow20,
      swingHigh20,
      low52W,
      high52W,
      e1: Number(e1.toFixed(2)),
      e2: Number(e2.toFixed(2)),
      e3: Number(e3.toFixed(2)),
      sl: Number(sl.toFixed(2)),
      t1: Number(t1.toFixed(2)),
      t2: Number(t2.toFixed(2)),
      t3: Number(t3.toFixed(2)),
      distE1Pct: Number((((e1 - ltp) / ltp) * 100).toFixed(2)),
      distE2Pct: Number((((e2 - ltp) / ltp) * 100).toFixed(2)),
      distE3Pct: Number((((e3 - ltp) / ltp) * 100).toFixed(2)),
      distSlPct: Number((((sl - ltp) / ltp) * 100).toFixed(2)),
      distT1Pct: Number((((t1 - ltp) / ltp) * 100).toFixed(2)),
      distT2Pct: Number((((t2 - ltp) / ltp) * 100).toFixed(2)),
      distT3Pct: Number((((t3 - ltp) / ltp) * 100).toFixed(2)),
      orderingOk,
      orderingIssues,
      prodStop: Number(evalRes.execution.stopLoss.toFixed(2)),
      prodTarget: Number(evalRes.execution.target.toFixed(2)),
      prodMaxEntry: Number(evalRes.execution.maxEntry.toFixed(2)),
      prodStatus: evalRes.execution.status,
      coreScore: evalRes.coreScore,
      zone: evalRes.zone
    });
  }

  fs.writeFileSync('scratch/sim_results.json', JSON.stringify(results, null, 2));
  console.log('SIMULATION FINISHED');
}

runSimulation();
