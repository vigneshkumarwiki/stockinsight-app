import { UpstoxClient } from '../src/api/upstoxClient';
import { StockInsightPipeline } from '../src/engine';
import { TechnicalCalculator } from '../src/engine/calculators/technical';
import { SearchService } from '../src/api/searchService';
import * as fs from 'fs';

interface Pivot {
  index: number;
  date: string;
  price: number;
  type: 'LOW' | 'HIGH';
  volume: number;
  volVsAvg: number;
  ageDays: number;
}

interface SupportCandidate {
  type: string;
  price: number;
  zoneLow?: number;
  zoneHigh?: number;
  distancePct: number;
  evidence: 'STRONG EVIDENCE' | 'MODERATE EVIDENCE' | 'WEAK EVIDENCE' | 'NO CLEAR EVIDENCE';
  notes: string;
  isOverhead: boolean;
}

interface AssetAnalysis {
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
  high52W: number | null;
  low52W: number | null;
  swingLow10: number | null;
  swingHigh10: number | null;
  swingLow20: number | null;
  swingHigh20: number | null;
  supportCandidates: SupportCandidate[];
  resistanceCandidates: SupportCandidate[];
  pivots: Pivot[];
}

async function discoverSupport() {
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
  const analyses: AssetAnalysis[] = [];

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

    // 10D / 20D swing highs/lows
    let swingHigh10: number | null = null;
    let swingLow20: number | null = null;
    let swingHigh20: number | null = null;

    if (candles.length >= 10) {
      let maxH = -Infinity;
      for (let i = 0; i < 10; i++) {
        if (candles[i][2] > maxH) maxH = candles[i][2];
      }
      swingHigh10 = maxH;
    }

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

    // Average volume over 250 bars
    const avgVolume = candles.length > 0 ? candles.reduce((s, c) => s + c[5], 0) / candles.length : 1;

    // Detect structural 5-bar Fractal Pivots
    // Local Low at i if candles[i][3] < candles[i-1][3], candles[i-2][3], candles[i+1][3], candles[i+2][3]
    const pivots: Pivot[] = [];
    for (let i = 2; i < candles.length - 2; i++) {
      const low = candles[i][3];
      const high = candles[i][2];
      const vol = candles[i][5];
      const volVsAvg = avgVolume > 0 ? vol / avgVolume : 1;

      // Check Pivot Low
      if (
        low <= candles[i - 1][3] &&
        low <= candles[i - 2][3] &&
        low <= candles[i + 1][3] &&
        low <= candles[i + 2][3]
      ) {
        pivots.push({
          index: i,
          date: candles[i][0],
          price: low,
          type: 'LOW',
          volume: vol,
          volVsAvg: Number(volVsAvg.toFixed(2)),
          ageDays: i,
        });
      }

      // Check Pivot High
      if (
        high >= candles[i - 1][2] &&
        high >= candles[i - 2][2] &&
        high >= candles[i + 1][2] &&
        high >= candles[i + 2][2]
      ) {
        pivots.push({
          index: i,
          date: candles[i][0],
          price: high,
          type: 'HIGH',
          volume: vol,
          volVsAvg: Number(volVsAvg.toFixed(2)),
          ageDays: i,
        });
      }
    }

    // Cluster low pivots within 1.0 * ATR tolerance to find repeated reaction zones
    const lowPivots = pivots.filter((p) => p.type === 'LOW');
    const reactionClusters: { avgPrice: number; minPrice: number; maxPrice: number; count: number; pivots: Pivot[] }[] = [];
    
    const usedIndices = new Set<number>();
    for (let i = 0; i < lowPivots.length; i++) {
      if (usedIndices.has(lowPivots[i].index)) continue;
      const cluster = [lowPivots[i]];
      usedIndices.add(lowPivots[i].index);

      for (let j = i + 1; j < lowPivots.length; j++) {
        if (usedIndices.has(lowPivots[j].index)) continue;
        if (Math.abs(lowPivots[j].price - lowPivots[i].price) <= 1.0 * atr14) {
          cluster.push(lowPivots[j]);
          usedIndices.add(lowPivots[j].index);
        }
      }

      if (cluster.length >= 2) {
        const prices = cluster.map((c) => c.price);
        const avgP = prices.reduce((s, p) => s + p, 0) / prices.length;
        reactionClusters.push({
          avgPrice: Number(avgP.toFixed(2)),
          minPrice: Number(Math.min(...prices).toFixed(2)),
          maxPrice: Number(Math.max(...prices).toFixed(2)),
          count: cluster.length,
          pivots: cluster,
        });
      }
    }

    // Categorize Support Candidates (Strictly < LTP)
    const supportCandidates: SupportCandidate[] = [];
    const resistanceCandidates: SupportCandidate[] = [];

    // 1. Swing Low 10
    if (swingLow10 !== null) {
      if (swingLow10 < ltp) {
        const dist = ((swingLow10 - ltp) / ltp) * 100;
        supportCandidates.push({
          type: '10-Day Swing Low',
          price: Number(swingLow10.toFixed(2)),
          distancePct: Number(dist.toFixed(2)),
          evidence: Math.abs(dist) < 3.0 ? 'STRONG EVIDENCE' : 'MODERATE EVIDENCE',
          notes: 'Most recent short-term price floor',
          isOverhead: false,
        });
      } else {
        resistanceCandidates.push({
          type: '10-Day Swing Low (At/Above LTP)',
          price: Number(swingLow10.toFixed(2)),
          distancePct: Number((((swingLow10 - ltp) / ltp) * 100).toFixed(2)),
          evidence: 'NO CLEAR EVIDENCE',
          notes: 'LTP closed at or below 10D low',
          isOverhead: true,
        });
      }
    }

    // 2. 20-Day Swing Low
    if (swingLow20 !== null && swingLow20 !== swingLow10 && swingLow20 < ltp) {
      const dist = ((swingLow20 - ltp) / ltp) * 100;
      supportCandidates.push({
        type: '20-Day Swing Low',
        price: Number(swingLow20.toFixed(2)),
        distancePct: Number(dist.toFixed(2)),
        evidence: 'MODERATE EVIDENCE',
        notes: 'Intermediate tactical swing low',
        isOverhead: false,
      });
    }

    // 3. Repeated Reaction Clusters (< LTP)
    for (const cl of reactionClusters) {
      if (cl.avgPrice < ltp) {
        const dist = ((cl.avgPrice - ltp) / ltp) * 100;
        supportCandidates.push({
          type: 'Repeated Reaction Zone',
          price: cl.avgPrice,
          zoneLow: cl.minPrice,
          zoneHigh: cl.maxPrice,
          distancePct: Number(dist.toFixed(2)),
          evidence: cl.count >= 3 ? 'STRONG EVIDENCE' : 'MODERATE EVIDENCE',
          notes: `${cl.count} historical pivot bounces in zone ₹${cl.minPrice} - ₹${cl.maxPrice}`,
          isOverhead: false,
        });
      } else {
        const dist = ((cl.avgPrice - ltp) / ltp) * 100;
        resistanceCandidates.push({
          type: 'Overhead Reaction Cluster',
          price: cl.avgPrice,
          zoneLow: cl.minPrice,
          zoneHigh: cl.maxPrice,
          distancePct: Number(dist.toFixed(2)),
          evidence: 'STRONG EVIDENCE',
          notes: `${cl.count} historical pivot rejections in zone ₹${cl.minPrice} - ₹${cl.maxPrice}`,
          isOverhead: true,
        });
      }
    }

    // 4. Moving Averages Classification (Support vs Resistance)
    // 50 DMA
    if (sma50 !== null) {
      const dist = ((sma50 - ltp) / ltp) * 100;
      if (sma50 < ltp) {
        supportCandidates.push({
          type: '50-DMA (Dynamic Support)',
          price: Number(sma50.toFixed(2)),
          distancePct: Number(dist.toFixed(2)),
          evidence: 'STRONG EVIDENCE',
          notes: 'Price above 50-DMA; serves as dynamic pullback support',
          isOverhead: false,
        });
      } else {
        resistanceCandidates.push({
          type: '50-DMA (Overhead Resistance)',
          price: Number(sma50.toFixed(2)),
          distancePct: Number(dist.toFixed(2)),
          evidence: 'STRONG EVIDENCE',
          notes: 'Price below 50-DMA; serves as overhead intermediate resistance',
          isOverhead: true,
        });
      }
    }

    // 100 DMA
    if (sma100 !== null) {
      const dist = ((sma100 - ltp) / ltp) * 100;
      if (sma100 < ltp) {
        supportCandidates.push({
          type: '100-DMA (Macro Support)',
          price: Number(sma100.toFixed(2)),
          distancePct: Number(dist.toFixed(2)),
          evidence: 'MODERATE EVIDENCE',
          notes: 'Price above 100-DMA; serves as intermediate/macro support',
          isOverhead: false,
        });
      } else {
        resistanceCandidates.push({
          type: '100-DMA (Overhead Resistance)',
          price: Number(sma100.toFixed(2)),
          distancePct: Number(dist.toFixed(2)),
          evidence: 'STRONG EVIDENCE',
          notes: 'Price below 100-DMA; serves as intermediate overhead resistance',
          isOverhead: true,
        });
      }
    }

    // 200 EMA
    if (ema200 !== null) {
      const dist = ((ema200 - ltp) / ltp) * 100;
      if (ema200 < ltp) {
        supportCandidates.push({
          type: '200-EMA (Macro Regime Floor)',
          price: Number(ema200.toFixed(2)),
          distancePct: Number(dist.toFixed(2)),
          evidence: 'STRONG EVIDENCE',
          notes: 'Price above rising 200-EMA; baseline institutional support',
          isOverhead: false,
        });
      } else {
        resistanceCandidates.push({
          type: '200-EMA (Major Overhead Ceiling)',
          price: Number(ema200.toFixed(2)),
          distancePct: Number(dist.toFixed(2)),
          evidence: 'STRONG EVIDENCE',
          notes: 'Price below 200-EMA; major macro trendline ceiling',
          isOverhead: true,
        });
      }
    }

    // 5. 52-Week Low
    if (low52W !== null && low52W < ltp) {
      const dist = ((low52W - ltp) / ltp) * 100;
      supportCandidates.push({
        type: '52-Week Low Floor',
        price: Number(low52W.toFixed(2)),
        distancePct: Number(dist.toFixed(2)),
        evidence: Math.abs(dist) < 10.0 ? 'STRONG EVIDENCE' : 'MODERATE EVIDENCE',
        notes: 'Absolute multi-month cyclical floor over 250 bars',
        isOverhead: false,
      });
    }

    // 6. 52-Week High (Overhead Resistance)
    if (high52W !== null && high52W > ltp) {
      const dist = ((high52W - ltp) / ltp) * 100;
      resistanceCandidates.push({
        type: '52-Week High (Major Overhead Ceiling)',
        price: Number(high52W.toFixed(2)),
        distancePct: Number(dist.toFixed(2)),
        evidence: 'STRONG EVIDENCE',
        notes: '52-Week High overhead supply barrier',
        isOverhead: true,
      });
    }

    // Sort support candidates by proximity to LTP (descending price: nearest first)
    supportCandidates.sort((a, b) => b.price - a.price);
    // Sort resistance candidates by proximity to LTP (ascending price: nearest first)
    resistanceCandidates.sort((a, b) => a.price - b.price);

    analyses.push({
      symbol: sym,
      companyName: evalRes.companyName,
      sector: evalRes.sector,
      instrumentType: evalRes.instrumentType || 'EQUITY',
      dataSource: evalRes.dataSource,
      ltp,
      atr14: Number(atr14.toFixed(2)),
      sma50: sma50 !== null ? Number(sma50.toFixed(2)) : null,
      sma100: sma100 !== null ? Number(sma100.toFixed(2)) : null,
      ema200: ema200 !== null ? Number(ema200.toFixed(2)) : null,
      high52W: high52W !== null ? Number(high52W.toFixed(2)) : null,
      low52W: low52W !== null ? Number(low52W.toFixed(2)) : null,
      swingLow10: swingLow10 !== null ? Number(swingLow10.toFixed(2)) : null,
      swingHigh10: swingHigh10 !== null ? Number(swingHigh10.toFixed(2)) : null,
      swingLow20: swingLow20 !== null ? Number(swingLow20.toFixed(2)) : null,
      swingHigh20: swingHigh20 !== null ? Number(swingHigh20.toFixed(2)) : null,
      supportCandidates,
      resistanceCandidates,
      pivots,
    });
  }

  fs.writeFileSync('scratch/support_discovery_results.json', JSON.stringify(analyses, null, 2));
  console.log('SUPPORT DISCOVERY ANALYSIS COMPLETE');
}

discoverSupport();
