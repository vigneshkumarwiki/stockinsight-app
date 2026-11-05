import { UpstoxClient } from '../src/api/upstoxClient';
import { StockInsightPipeline } from '../src/engine';
import { TechnicalCalculator } from '../src/engine/calculators/technical';
import { SearchService } from '../src/api/searchService';
import * as fs from 'fs';

interface Candidate {
  type: string;
  price: number;
  zoneMin: number;
  zoneMax: number;
  touchCount: number;
  ageDays: number;
  volumeRatio: number;
  isOverhead: boolean;
}

interface PriceStructureOutput {
  symbol: string;
  companyName: string;
  sector: string;
  instrumentType: string;
  dataSource: string;
  ltp: number;
  atr14: number;
  // Discovered Candidates
  supportPool: Candidate[];
  resistancePool: Candidate[];
  // Selected Levels
  e1: { price: number; zone: [number, number]; type: string; classification: string } | null;
  e2: { price: number; zone: [number, number]; type: string; classification: string } | null;
  e3: { price: number; zone: [number, number]; type: string; classification: string } | null;
  sl: { price: number; type: string; buffer: number; distancePct: number; classification: string };
  t1: { price: number; zone?: [number, number]; type: string; classification: string };
  t2: { price: number; zone?: [number, number]; type: string; classification: string };
  t3: { price: number; zone?: [number, number]; type: string; classification: string };
  // Ordering Check
  orderingValid: boolean;
  orderingLog: string[];
  // Production Comparison
  prodStop: number;
  prodTarget: number;
  prodMaxEntry: number;
}

async function runDesignSimulation() {
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
  const outputs: PriceStructureOutput[] = [];

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

    // 52W High & Low
    const lookback52W = Math.min(candles.length, 250);
    let high52W = -Infinity;
    let low52W = Infinity;
    for (let i = 0; i < lookback52W; i++) {
      if (candles[i][2] > high52W) high52W = candles[i][2];
      if (candles[i][3] < low52W) low52W = candles[i][3];
    }

    const avgVol = candles.length > 0 ? candles.reduce((s, c) => s + c[5], 0) / candles.length : 1;

    // STEP 1: Detect 5-Bar Fractal Pivots
    const rawLowPivots: { index: number; price: number; volRatio: number }[] = [];
    const rawHighPivots: { index: number; price: number; volRatio: number }[] = [];

    for (let i = 2; i < candles.length - 2; i++) {
      const l = candles[i][3];
      const h = candles[i][2];
      const vRatio = avgVol > 0 ? candles[i][5] / avgVol : 1;

      if (l <= candles[i - 1][3] && l <= candles[i - 2][3] && l <= candles[i + 1][3] && l <= candles[i + 2][3]) {
        rawLowPivots.push({ index: i, price: l, volRatio: vRatio });
      }
      if (h >= candles[i - 1][2] && h >= candles[i - 2][2] && h >= candles[i + 1][2] && h >= candles[i + 2][2]) {
        rawHighPivots.push({ index: i, price: h, volRatio: vRatio });
      }
    }

    // STEP 2: Density Cluster Pivots within 0.75 * ATR14 Window
    const supportPool: Candidate[] = [];
    const resistancePool: Candidate[] = [];

    // Cluster low pivots
    const usedL = new Set<number>();
    for (let i = 0; i < rawLowPivots.length; i++) {
      if (usedL.has(rawLowPivots[i].index)) continue;
      const cluster = [rawLowPivots[i]];
      usedL.add(rawLowPivots[i].index);

      for (let j = i + 1; j < rawLowPivots.length; j++) {
        if (usedL.has(rawLowPivots[j].index)) continue;
        if (Math.abs(rawLowPivots[j].price - rawLowPivots[i].price) <= 0.75 * atr14) {
          cluster.push(rawLowPivots[j]);
          usedL.add(rawLowPivots[j].index);
        }
      }

      const prices = cluster.map((c) => c.price);
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);
      const avgP = prices.reduce((s, p) => s + p, 0) / prices.length;
      const minAge = Math.min(...cluster.map((c) => c.index));
      const maxVolRatio = Math.max(...cluster.map((c) => c.volRatio));

      const cand: Candidate = {
        type: cluster.length >= 2 ? `Reaction Cluster (${cluster.length} touches)` : 'Swing Low Pivot',
        price: Number(avgP.toFixed(2)),
        zoneMin: Number(minP.toFixed(2)),
        zoneMax: Number(maxP.toFixed(2)),
        touchCount: cluster.length,
        ageDays: minAge,
        volumeRatio: Number(maxVolRatio.toFixed(2)),
        isOverhead: avgP >= ltp,
      };

      if (avgP < ltp) {
        supportPool.push(cand);
      } else {
        resistancePool.push(cand);
      }
    }

    // Include 50 DMA if available
    if (sma50 !== null) {
      const cand: Candidate = {
        type: '50-DMA',
        price: Number(sma50.toFixed(2)),
        zoneMin: Number((sma50 - 0.2 * atr14).toFixed(2)),
        zoneMax: Number((sma50 + 0.2 * atr14).toFixed(2)),
        touchCount: 1,
        ageDays: 0,
        volumeRatio: 1.0,
        isOverhead: sma50 >= ltp,
      };
      if (sma50 < ltp) supportPool.push(cand);
      else resistancePool.push(cand);
    }

    // Include 100 DMA
    if (sma100 !== null) {
      const cand: Candidate = {
        type: '100-DMA',
        price: Number(sma100.toFixed(2)),
        zoneMin: Number((sma100 - 0.2 * atr14).toFixed(2)),
        zoneMax: Number((sma100 + 0.2 * atr14).toFixed(2)),
        touchCount: 1,
        ageDays: 0,
        volumeRatio: 1.0,
        isOverhead: sma100 >= ltp,
      };
      if (sma100 < ltp) supportPool.push(cand);
      else resistancePool.push(cand);
    }

    // Include 200 EMA
    if (ema200 !== null) {
      const cand: Candidate = {
        type: '200-EMA',
        price: Number(ema200.toFixed(2)),
        zoneMin: Number((ema200 - 0.25 * atr14).toFixed(2)),
        zoneMax: Number((ema200 + 0.25 * atr14).toFixed(2)),
        touchCount: 1,
        ageDays: 0,
        volumeRatio: 1.0,
        isOverhead: ema200 >= ltp,
      };
      if (ema200 < ltp) supportPool.push(cand);
      else resistancePool.push(cand);
    }

    // Include 52W Low Floor if < LTP
    if (low52W < ltp) {
      const cand: Candidate = {
        type: '52-Week Low Floor',
        price: Number(low52W.toFixed(2)),
        zoneMin: Number(low52W.toFixed(2)),
        zoneMax: Number((low52W + 0.3 * atr14).toFixed(2)),
        touchCount: 1,
        ageDays: 0,
        volumeRatio: 1.0,
        isOverhead: false,
      };
      supportPool.push(cand);
    }

    // Include 52W High if > LTP
    if (high52W > ltp) {
      const cand: Candidate = {
        type: '52-Week High Ceiling',
        price: Number(high52W.toFixed(2)),
        zoneMin: Number((high52W - 0.3 * atr14).toFixed(2)),
        zoneMax: Number(high52W.toFixed(2)),
        touchCount: 1,
        ageDays: 0,
        volumeRatio: 1.0,
        isOverhead: true,
      };
      resistancePool.push(cand);
    }

    // Sort Support Pool Descending by price (< LTP)
    supportPool.sort((a, b) => b.price - a.price);
    // Sort Resistance Pool Ascending by price (> LTP)
    resistancePool.sort((a, b) => a.price - b.price);

    // Remove near-identical duplicates in support pool (within 0.3 * ATR)
    const uniqueSupports: Candidate[] = [];
    for (const s of supportPool) {
      if (!uniqueSupports.some((u) => Math.abs(u.price - s.price) < 0.35 * atr14)) {
        uniqueSupports.push(s);
      }
    }

    // Remove near-identical duplicates in resistance pool
    const uniqueResistances: Candidate[] = [];
    for (const r of resistancePool) {
      if (!uniqueResistances.some((u) => Math.abs(u.price - r.price) < 0.35 * atr14)) {
        uniqueResistances.push(r);
      }
    }

    // STEP 3: Deterministic Entry Selection Hierarchy
    // Minimum distance from LTP: E1 <= LTP - 0.25 * ATR14 (prevents E1 == LTP)
    const minE1Ceiling = ltp - 0.25 * atr14;
    const e1Candidates = uniqueSupports.filter((s) => s.price <= minE1Ceiling);

    let selectedE1: PriceStructureOutput['e1'] = null;
    let selectedE2: PriceStructureOutput['e2'] = null;
    let selectedE3: PriceStructureOutput['e3'] = null;

    if (e1Candidates.length > 0) {
      const e1Cand = e1Candidates[0];
      selectedE1 = {
        price: e1Cand.price,
        zone: [e1Cand.zoneMin, e1Cand.zoneMax],
        type: e1Cand.type,
        classification: 'STRUCTURALLY SUPPORTED',
      };

      // E2 must be strictly separated from E1 by at least 0.5 * ATR14
      const e2Candidates = uniqueSupports.filter((s) => s.price <= selectedE1!.price - 0.5 * atr14);
      if (e2Candidates.length > 0) {
        const e2Cand = e2Candidates[0];
        selectedE2 = {
          price: e2Cand.price,
          zone: [e2Cand.zoneMin, e2Cand.zoneMax],
          type: e2Cand.type,
          classification: 'STRUCTURALLY SUPPORTED',
        };

        // E3 must be strictly separated from E2 by at least 0.5 * ATR14
        const e3Candidates = uniqueSupports.filter((s) => s.price <= selectedE2!.price - 0.5 * atr14);
        if (e3Candidates.length > 0) {
          const e3Cand = e3Candidates[0];
          selectedE3 = {
            price: e3Cand.price,
            zone: [e3Cand.zoneMin, e3Cand.zoneMax],
            type: e3Cand.type,
            classification: 'STRUCTURALLY SUPPORTED',
          };
        }
      }
    }

    // Fallback for E1 if no natural structural support exists within 52W range
    if (!selectedE1) {
      const fallbackPrice = Number((ltp - 0.75 * atr14).toFixed(2));
      selectedE1 = {
        price: fallbackPrice,
        zone: [Number((fallbackPrice - 0.25 * atr14).toFixed(2)), fallbackPrice],
        type: 'Volatility Fallback (0.75 ATR)',
        classification: 'MATHEMATICAL / VOLATILITY FALLBACK',
      };
    }

    // STEP 4: One Protective Stop Loss
    // Anchor below the deepest active structural support level with 0.5 * ATR buffer
    const deepestActiveSupport = selectedE3?.price || selectedE2?.price || selectedE1?.price || (ltp - atr14);
    let stopAnchor = deepestActiveSupport - 0.5 * atr14;
    let slType = `Below ${selectedE3 ? 'E3' : selectedE2 ? 'E2' : 'E1'} Structure - 0.5 ATR`;

    // Anti-stop compression floor: Stop distance must be >= 1.5 * ATR14
    let antiCompressionApplied = false;
    if (ltp - stopAnchor < 1.5 * atr14) {
      stopAnchor = ltp - 1.5 * atr14;
      antiCompressionApplied = true;
      slType += ' (Anti-Compression Floor Enforced)';
    }

    const slPrice = Number(stopAnchor.toFixed(2));
    const slDistPct = Number((((slPrice - ltp) / ltp) * 100).toFixed(2));

    // STEP 5: Target Structure (T1 / T2 / T3)
    // T1: Nearest valid resistance >= LTP + 1.0 ATR; Fallback LTP + max(1.5 ATR, 5%)
    const minT1Floor = ltp + 1.0 * atr14;
    const t1Candidates = uniqueResistances.filter((r) => r.price >= minT1Floor);

    let selectedT1: PriceStructureOutput['t1'];
    if (t1Candidates.length > 0) {
      const t1Cand = t1Candidates[0];
      selectedT1 = {
        price: t1Cand.price,
        zone: [t1Cand.zoneMin, t1Cand.zoneMax],
        type: t1Cand.type,
        classification: 'STRUCTURALLY SUPPORTED',
      };
    } else {
      const t1Math = Number((ltp + Math.max(1.5 * atr14, 0.05 * ltp)).toFixed(2));
      selectedT1 = {
        price: t1Math,
        type: 'Tactical Volatility Expansion (1.5 ATR / +5%)',
        classification: 'MATHEMATICAL / VOLATILITY FALLBACK',
      };
    }

    // T2: Next structural resistance >= T1 + 1.0 ATR; Fallback LTP + max(3.0 ATR, 8%)
    const minT2Floor = selectedT1.price + 1.0 * atr14;
    const t2Candidates = uniqueResistances.filter((r) => r.price >= minT2Floor);

    let selectedT2: PriceStructureOutput['t2'];
    if (t2Candidates.length > 0) {
      const t2Cand = t2Candidates[0];
      selectedT2 = {
        price: t2Cand.price,
        zone: [t2Cand.zoneMin, t2Cand.zoneMax],
        type: t2Cand.type,
        classification: 'STRUCTURALLY SUPPORTED',
      };
    } else {
      const t2Math = Number((ltp + Math.max(3.0 * atr14, 0.08 * ltp)).toFixed(2));
      selectedT2 = {
        price: t2Math,
        type: 'Canonical 3R Volatility Expansion (3.0 ATR / +8%)',
        classification: 'MATHEMATICAL / VOLATILITY FALLBACK',
      };
    }

    // T3: 52W High or Extended Projection >= T2 + 1.5 ATR; Fallback LTP + max(5.0 ATR, 15%)
    const minT3Floor = selectedT2.price + 1.5 * atr14;
    const t3Candidates = uniqueResistances.filter((r) => r.price >= minT3Floor);

    let selectedT3: PriceStructureOutput['t3'];
    if (t3Candidates.length > 0) {
      const t3Cand = t3Candidates[0];
      selectedT3 = {
        price: t3Cand.price,
        zone: [t3Cand.zoneMin, t3Cand.zoneMax],
        type: t3Cand.type,
        classification: 'STRUCTURALLY SUPPORTED',
      };
    } else {
      const t3Math = Number((ltp + Math.max(5.0 * atr14, 0.15 * ltp)).toFixed(2));
      selectedT3 = {
        price: t3Math,
        type: 'Extended Compounding Expansion (5.0 ATR / +15%)',
        classification: 'MATHEMATICAL / VOLATILITY FALLBACK',
      };
    }

    // STEP 6: Ordering Verification
    const orderingLog: string[] = [];
    if (selectedE1 && !(ltp > selectedE1.price)) orderingLog.push(`LTP (${ltp}) <= E1 (${selectedE1.price})`);
    if (selectedE1 && selectedE2 && !(selectedE1.price > selectedE2.price)) orderingLog.push(`E1 (${selectedE1.price}) <= E2 (${selectedE2.price})`);
    if (selectedE2 && selectedE3 && !(selectedE2.price > selectedE3.price)) orderingLog.push(`E2 (${selectedE2.price}) <= E3 (${selectedE3.price})`);
    
    const lowestEntryPrice = selectedE3?.price || selectedE2?.price || selectedE1?.price || ltp;
    if (!(lowestEntryPrice > slPrice)) orderingLog.push(`Lowest Entry (${lowestEntryPrice}) <= Stop (${slPrice})`);
    if (!(slPrice < ltp)) orderingLog.push(`Stop (${slPrice}) >= LTP (${ltp})`);
    if (!(ltp < selectedT1.price)) orderingLog.push(`LTP (${ltp}) >= T1 (${selectedT1.price})`);
    if (!(selectedT1.price < selectedT2.price)) orderingLog.push(`T1 (${selectedT1.price}) >= T2 (${selectedT2.price})`);
    if (!(selectedT2.price < selectedT3.price)) orderingLog.push(`T2 (${selectedT2.price}) >= T3 (${selectedT3.price})`);

    const orderingValid = orderingLog.length === 0;

    outputs.push({
      symbol: sym,
      companyName: evalRes.companyName,
      sector: evalRes.sector,
      instrumentType: evalRes.instrumentType || 'EQUITY',
      dataSource: evalRes.dataSource,
      ltp,
      atr14: Number(atr14.toFixed(2)),
      supportPool: uniqueSupports,
      resistancePool: uniqueResistances,
      e1: selectedE1,
      e2: selectedE2,
      e3: selectedE3,
      sl: {
        price: slPrice,
        type: slType,
        buffer: Number((0.5 * atr14).toFixed(2)),
        distancePct: slDistPct,
        classification: antiCompressionApplied ? 'ANTI-COMPRESSION FLOOR' : 'STRUCTURAL INVALIDATION',
      },
      t1: selectedT1,
      t2: selectedT2,
      t3: selectedT3,
      orderingValid,
      orderingLog,
      prodStop: Number(evalRes.execution.stopLoss.toFixed(2)),
      prodTarget: Number(evalRes.execution.target.toFixed(2)),
      prodMaxEntry: Number(evalRes.execution.maxEntry.toFixed(2)),
    });
  }

  fs.writeFileSync('scratch/sim_phase53_results.json', JSON.stringify(outputs, null, 2));
  console.log('PHASE 5.3 SIMULATION COMPLETED');
}

runDesignSimulation();
