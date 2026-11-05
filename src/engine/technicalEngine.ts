/**
 * Technical Scoring Engine (50 Points Total)
 * Enforces Layer 3: Orthogonal Technical Buckets & Volume Veto
 * 
 * Buckets:
 * 1. Trend & Macro Regime: Max 20 pts (200-EMA 10 pts, 100-DMA 5 pts, MA Stack 5 pts)
 * 2. Momentum & Mean Reversion: Max 15 pts (RSI-14 10 pts, 20D ROC 5 pts)
 * 3. Volume Confirmation: Max 15 pts (Volume Accumulation 8 pts, Breakout Volume 7 pts)
 * 
 * Volume Veto Rule: If Volume Confirmation Bucket < 5 / 15 pts, total technical score is capped at 35 / 50.
 */

import { FactorScore, TechnicalBuckets } from '../types/engine';
import { TechnicalCalculations } from './calculators/technical';

export class TechnicalEngine {
  public static evaluate(calcs: TechnicalCalculations): {
    totalScore: number;
    factors: FactorScore[];
    buckets: TechnicalBuckets;
  } {
    const factors: FactorScore[] = [];

    // ==========================================
    // BUCKET 1: TREND & MACRO REGIME (MAX 20 PTS)
    // ==========================================

    // 1. 200-EMA Macro Regime (10 pts)
    let emaScore = 0;
    let emaExpl = calcs.ema200 !== null ? 'Below 200-EMA (Macro Bearish Regime)' : '200-EMA unavailable (Insufficient candle history)';
    if (calcs.ema200 !== null && calcs.ltp >= calcs.ema200) {
      if (calcs.ema200SlopePct !== null && calcs.ema200SlopePct > 0) {
        emaScore = 10;
        emaExpl = `Macro Bullish: Price above rising 200-EMA (+${calcs.ema200SlopePct.toFixed(2)}% slope)`;
      } else {
        emaScore = 6;
        emaExpl = 'Moderate Bullish: Price above flat/declining 200-EMA';
      }
    }
    factors.push({
      name: '200-EMA Macro Regime',
      category: 'TECHNICAL',
      bucket: 'Trend & Macro',
      weight: 10,
      score: emaScore,
      rawValue: calcs.ema200 !== null ? `EMA: ${calcs.ema200.toFixed(1)}` : null,
      state: calcs.ema200 !== null ? 'DERIVED' : 'MISSING',
      explanation: emaExpl,
      provenance: calcs.ema200 !== null ? 'DERIVED' : 'UNAVAILABLE',
      sourceFields: ['candles (close)', 'ltp'],
      formula: 'Exponential Moving Average of 200 daily closes (alpha = 2/201)',
    });

    // 2. 100-DMA Intermediate Trend (5 pts)
    let sma100Score = 0;
    let sma100Expl = calcs.sma100 !== null ? 'Below 100-DMA (Intermediate weakness)' : '100-DMA unavailable (Insufficient candle history)';
    if (calcs.sma100 !== null && calcs.ltp >= calcs.sma100) {
      sma100Score = 5;
      sma100Expl = `Intermediate Uptrend: Price above 100-DMA (${calcs.sma100.toFixed(1)})`;
    }
    factors.push({
      name: '100-DMA Intermediate Trend',
      category: 'TECHNICAL',
      bucket: 'Trend & Macro',
      weight: 5,
      score: sma100Score,
      rawValue: calcs.sma100 !== null ? `SMA: ${calcs.sma100.toFixed(1)}` : null,
      state: calcs.sma100 !== null ? 'DERIVED' : 'MISSING',
      explanation: sma100Expl,
      provenance: calcs.sma100 !== null ? 'DERIVED' : 'UNAVAILABLE',
      sourceFields: ['candles (close)', 'ltp'],
      formula: 'Simple Moving Average of 100 daily closes',
    });

    // 3. Moving Average Alignment Stack (5 pts)
    let alignScore = 0;
    const hasMaStackData = calcs.sma50 !== null && calcs.sma100 !== null && calcs.ema200 !== null;
    let alignExpl = hasMaStackData ? 'Moving averages not in full bullish stack' : 'MA alignment stack unavailable (Insufficient candle history)';
    if (calcs.maAligned) {
      alignScore = 5;
      alignExpl = 'Perfect Bull Stack: 50-DMA > 100-DMA > 200-EMA';
    }
    factors.push({
      name: 'MA Alignment Stack',
      category: 'TECHNICAL',
      bucket: 'Trend & Macro',
      weight: 5,
      score: alignScore,
      rawValue: hasMaStackData ? (calcs.maAligned ? '50 > 100 > 200' : 'Unaligned') : null,
      state: hasMaStackData ? 'DERIVED' : 'MISSING',
      explanation: alignExpl,
      provenance: hasMaStackData ? 'DERIVED' : 'UNAVAILABLE',
      sourceFields: ['candles (close)'],
      formula: 'Sequential Ordering: 50-DMA > 100-DMA > 200-EMA',
    });

    const trendRegimeBucket = Math.min(20, emaScore + sma100Score + alignScore);

    // ==========================================
    // BUCKET 2: MOMENTUM & MEAN REVERSION (MAX 15 PTS)
    // ==========================================

    // 4. RSI (14) Momentum Band (10 pts)
    let rsiScore = 0;
    let rsiExpl = calcs.rsi14 !== null ? 'RSI out of optimal momentum band' : 'RSI(14) unavailable (Insufficient candle history)';
    if (calcs.rsi14 !== null) {
      if (calcs.rsi14 >= 50.0 && calcs.rsi14 <= 68.0) {
        rsiScore = 10;
        rsiExpl = `Optimal Momentum Sweet Spot: RSI ${calcs.rsi14.toFixed(1)} (50-68)`;
      } else if (calcs.rsi14 > 68.0 && calcs.rsi14 <= 75.0) {
        rsiScore = 6;
        rsiExpl = `Strong Acceleration: RSI ${calcs.rsi14.toFixed(1)} (68-75)`;
      } else if (calcs.rsi14 >= 40.0 && calcs.rsi14 < 50.0) {
        rsiScore = 3;
        rsiExpl = `Neutral Pullback Zone: RSI ${calcs.rsi14.toFixed(1)} (40-50)`;
      } else {
        rsiScore = 0;
        rsiExpl = calcs.rsi14 > 75.0
          ? `Overbought Exhaustion: RSI ${calcs.rsi14.toFixed(1)} (>75)`
          : `Bearish Breakdown: RSI ${calcs.rsi14.toFixed(1)} (<40)`;
      }
    }
    factors.push({
      name: 'RSI (14) Momentum Band',
      category: 'TECHNICAL',
      bucket: 'Momentum',
      weight: 10,
      score: rsiScore,
      rawValue: calcs.rsi14 !== null ? calcs.rsi14.toFixed(1) : null,
      state: calcs.rsi14 !== null ? 'DERIVED' : 'MISSING',
      explanation: rsiExpl,
      provenance: calcs.rsi14 !== null ? 'DERIVED' : 'UNAVAILABLE',
      sourceFields: ['candles (close)'],
      formula: '100 - (100 / (1 + RS)) over 14-period Wilder smoothing',
    });

    // 5. 20-Day Rate of Change - ROC (5 pts)
    let rocScore = 0;
    let rocExpl = calcs.roc20 !== null ? '20-day momentum velocity is flat or negative' : '20-Day ROC unavailable (Insufficient candle history)';
    if (calcs.roc20 !== null) {
      if (calcs.roc20 > 5.0) {
        rocScore = 5;
        rocExpl = `Strong Momentum Velocity: +${calcs.roc20.toFixed(1)}% over 20 sessions`;
      } else if (calcs.roc20 > 0) {
        rocScore = 3;
        rocExpl = `Positive Momentum Velocity: +${calcs.roc20.toFixed(1)}% over 20 sessions`;
      } else {
        rocExpl = `Negative Momentum Velocity: ${calcs.roc20.toFixed(1)}%`;
      }
    }
    factors.push({
      name: '20-Day Rate of Change',
      category: 'TECHNICAL',
      bucket: 'Momentum',
      weight: 5,
      score: rocScore,
      rawValue: calcs.roc20 !== null ? `${calcs.roc20.toFixed(1)}%` : null,
      state: calcs.roc20 !== null ? 'DERIVED' : 'MISSING',
      explanation: rocExpl,
      provenance: calcs.roc20 !== null ? 'DERIVED' : 'UNAVAILABLE',
      sourceFields: ['candles (close)'],
      formula: '((Close_T - Close_T-20) / Close_T-20) * 100',
    });

    const momentumBucket = Math.min(15, rsiScore + rocScore);

    // ==========================================
    // BUCKET 3: VOLUME CONFIRMATION (MAX 15 PTS)
    // ==========================================

    // 6. Up/Down Volume Accumulation (8 pts)
    let volAccScore = 0;
    let volAccExpl = 'Volume Accumulation unavailable (Insufficient candle history)';
    let volAccRawValue: string | null = null;
    let volAccState: 'DERIVED' | 'MISSING' = 'MISSING';

    if (calcs.volumeAccumulationState === 'MAX_ACCUMULATION') {
      volAccScore = 8;
      volAccState = 'DERIVED';
      volAccRawValue = '100% Up-Day Volume';
      volAccExpl = 'Institutional Accumulation: 100% Up-Day Volume (Zero down-days in 20 sessions)';
    } else if (calcs.volumeAccumulationState === 'ZERO_VOLUME') {
      volAccScore = 0;
      volAccState = 'DERIVED';
      volAccRawValue = 'No volume recorded';
      volAccExpl = 'Zero Volume: No trading volume recorded across 20 sessions';
    } else if (calcs.volumeAccumulationRatio !== null) {
      volAccState = 'DERIVED';
      volAccRawValue = `${calcs.volumeAccumulationRatio.toFixed(2)}x`;
      if (calcs.volumeAccumulationRatio >= 1.25) {
        volAccScore = 8;
        volAccExpl = `Institutional Accumulation: Up/Down Vol ${calcs.volumeAccumulationRatio.toFixed(2)}x (>= 1.25x)`;
      } else if (calcs.volumeAccumulationRatio >= 1.0) {
        volAccScore = 5;
        volAccExpl = `Balanced Accumulation: Up/Down Vol ${calcs.volumeAccumulationRatio.toFixed(2)}x (>= 1.0x)`;
      } else {
        volAccScore = 2;
        volAccExpl = `Distribution Divergence: More volume on down days (${calcs.volumeAccumulationRatio.toFixed(2)}x < 1.0x)`;
      }
    }

    factors.push({
      name: 'Volume Accumulation Ratio',
      category: 'TECHNICAL',
      bucket: 'Volume Confirmation',
      weight: 8,
      score: volAccScore,
      rawValue: volAccRawValue,
      state: volAccState,
      explanation: volAccExpl,
      provenance: volAccState === 'DERIVED' ? 'DERIVED' : 'UNAVAILABLE',
      sourceFields: ['candles (volume, close)'],
      formula: 'Sum(Up-Day Volume) / Sum(Down-Day Volume) over 20 sessions',
    });

    // 7. Breakout Volume vs 20-Day SMA (7 pts)
    let bktVolScore = 0;
    let bktVolExpl = 'Breakout volume surge unavailable (Insufficient candle history)';
    let bktRawValue: string | null = null;
    let bktState: 'DERIVED' | 'MISSING' = 'MISSING';
    if (calcs.breakoutVolumeRatio !== null) {
      const bktRatio = calcs.breakoutVolumeRatio;
      bktState = 'DERIVED';
      bktRawValue = `${bktRatio.toFixed(2)}x SMA`;
      bktVolExpl = `Sub-par Volume: Latest volume is ${(bktRatio * 100).toFixed(0)}% of 20-day SMA`;
      if (bktRatio >= 1.50) {
        bktVolScore = 7;
        bktVolExpl = `Institutional Surge: Breakout volume is ${((bktRatio - 1) * 100).toFixed(0)}% above 20-day SMA (>=1.50x)`;
      } else if (bktRatio >= 1.20) {
        bktVolScore = 4;
        bktVolExpl = `Above Average Volume: Breakout volume is ${((bktRatio - 1) * 100).toFixed(0)}% above 20-day SMA`;
      } else if (bktRatio >= 1.00) {
        bktVolScore = 2;
        bktVolExpl = `Average Volume: Consistent with 20-day baseline`;
      }
    }
    factors.push({
      name: 'Breakout Volume Surge',
      category: 'TECHNICAL',
      bucket: 'Volume Confirmation',
      weight: 7,
      score: bktVolScore,
      rawValue: bktRawValue,
      state: bktState,
      explanation: bktVolExpl,
      provenance: bktState === 'DERIVED' ? 'DERIVED' : 'UNAVAILABLE',
      sourceFields: ['candles (volume)'],
      formula: 'Current Session Volume / 20-Day Volume SMA',
    });

    const volumeAccumulationBucket = Math.min(15, volAccScore + bktVolScore);

    // ==========================================
    // LAYER 3: VOLUME VETO ENFORCEMENT
    // ==========================================
    const rawTechnicalScore = trendRegimeBucket + momentumBucket + volumeAccumulationBucket;
    const volumeVetoApplied = volumeAccumulationBucket < 5;
    const totalScore = volumeVetoApplied
      ? Math.min(rawTechnicalScore, 35)
      : Math.min(50, rawTechnicalScore);

    const buckets: TechnicalBuckets = {
      total: totalScore,
      max: 50,
      trendRegimeBucket,
      momentumBucket,
      volumeAccumulationBucket,
      volumeVetoApplied,
    };

    return { totalScore, factors, buckets };
  }
}
