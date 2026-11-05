/**
 * Layer 2: Deterministic Price Structure Engine
 * Discovers historical support/resistance shelves from Upstox 250 daily candle series
 * Produces multi-tier Entry Zones (E1, E2, E3), One Protective Stop Loss, and Targets (T1, T2, T3)
 * 
 * Enforces:
 * 1. Strict Polarity: Support < LTP, Resistance > LTP (Overhead MAs strictly quarantined from entry)
 * 2. Zero Fabrication: E2/E3 return UNAVAILABLE if natural market structure does not support deeper tiers
 * 3. User Position Independence: Operates exclusively on market data with zero user portfolio contamination
 */

import {
  LevelClassification,
  PriceStructure,
  PriceStructureLevel,
  PriceStructureStopLoss,
  StructuralCandidateMetadata,
} from '../types/engine';
import { UpstoxCandle } from '../types/upstox';
import { TechnicalCalculations } from './calculators/technical';

interface RawPivot {
  index: number;
  price: number;
  volRatio: number;
}

export class PriceStructureEngine {
  /**
   * Evaluates historical price action to generate deterministic Price Structure
   */
  public static evaluate(
    candles: UpstoxCandle[],
    techCalcs: TechnicalCalculations
  ): PriceStructure {
    const ltp = techCalcs.ltp;
    const atr14 = techCalcs.atr14 || ltp * 0.02;
    const sma50 = techCalcs.sma50;
    const sma100 = techCalcs.sma100;
    const ema200 = techCalcs.ema200;

    // Safety: If candles empty or invalid, return safe bounded fallback
    if (!candles || candles.length === 0 || ltp <= 0) {
      return this.generateSafeFallbackStructure(ltp, atr14);
    }

    // 1. Calculate 52-Week Boundaries over available history (up to 250 bars)
    const lookback52W = Math.min(candles.length, 250);
    let high52W = -Infinity;
    let low52W = Infinity;
    for (let i = 0; i < lookback52W; i++) {
      if (candles[i][2] > high52W) high52W = candles[i][2];
      if (candles[i][3] < low52W) low52W = candles[i][3];
    }
    const is52WValid = isFinite(high52W) && isFinite(low52W) && high52W > low52W;

    const avgVol = candles.reduce((s, c) => s + c[5], 0) / candles.length || 1;

    // 2. Extract 5-Bar Fractal Pivots safely
    const rawLowPivots: RawPivot[] = [];
    const rawHighPivots: RawPivot[] = [];

    for (let i = 2; i < candles.length - 2; i++) {
      const l = candles[i][3];
      const h = candles[i][2];
      const vRatio = avgVol > 0 ? candles[i][5] / avgVol : 1;

      if (
        l <= candles[i - 1][3] &&
        l <= candles[i - 2][3] &&
        l <= candles[i + 1][3] &&
        l <= candles[i + 2][3]
      ) {
        rawLowPivots.push({ index: i, price: l, volRatio: vRatio });
      }

      if (
        h >= candles[i - 1][2] &&
        h >= candles[i - 2][2] &&
        h >= candles[i + 1][2] &&
        h >= candles[i + 2][2]
      ) {
        rawHighPivots.push({ index: i, price: h, volRatio: vRatio });
      }
    }

    // 3. Density Cluster Pivots within 0.75 * ATR14 Window
    const supportPool: StructuralCandidateMetadata[] = [];
    const resistancePool: StructuralCandidateMetadata[] = [];

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

      const cand: StructuralCandidateMetadata = {
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

    // Cluster high pivots for overhead resistance
    const usedH = new Set<number>();
    for (let i = 0; i < rawHighPivots.length; i++) {
      if (usedH.has(rawHighPivots[i].index)) continue;
      const cluster = [rawHighPivots[i]];
      usedH.add(rawHighPivots[i].index);

      for (let j = i + 1; j < rawHighPivots.length; j++) {
        if (usedH.has(rawHighPivots[j].index)) continue;
        if (Math.abs(rawHighPivots[j].price - rawHighPivots[i].price) <= 0.75 * atr14) {
          cluster.push(rawHighPivots[j]);
          usedH.add(rawHighPivots[j].index);
        }
      }

      const prices = cluster.map((c) => c.price);
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);
      const avgP = prices.reduce((s, p) => s + p, 0) / prices.length;
      const minAge = Math.min(...cluster.map((c) => c.index));
      const maxVolRatio = Math.max(...cluster.map((c) => c.volRatio));

      const cand: StructuralCandidateMetadata = {
        type: cluster.length >= 2 ? `Resistance Cluster (${cluster.length} touches)` : 'Swing High Pivot',
        price: Number(avgP.toFixed(2)),
        zoneMin: Number(minP.toFixed(2)),
        zoneMax: Number(maxP.toFixed(2)),
        touchCount: cluster.length,
        ageDays: minAge,
        volumeRatio: Number(maxVolRatio.toFixed(2)),
        isOverhead: avgP >= ltp,
      };

      if (avgP > ltp) {
        resistancePool.push(cand);
      }
    }

    // 4. Polarity Partitioning for Moving Averages
    if (sma50 !== null && sma50 > 0) {
      const isOverhead = sma50 >= ltp;
      const cand: StructuralCandidateMetadata = {
        type: '50-DMA',
        price: Number(sma50.toFixed(2)),
        zoneMin: Number((sma50 - 0.2 * atr14).toFixed(2)),
        zoneMax: Number((sma50 + 0.2 * atr14).toFixed(2)),
        touchCount: 1,
        ageDays: 0,
        volumeRatio: 1.0,
        isOverhead,
      };
      if (isOverhead) resistancePool.push(cand);
      else supportPool.push(cand);
    }

    if (sma100 !== null && sma100 > 0) {
      const isOverhead = sma100 >= ltp;
      const cand: StructuralCandidateMetadata = {
        type: '100-DMA',
        price: Number(sma100.toFixed(2)),
        zoneMin: Number((sma100 - 0.2 * atr14).toFixed(2)),
        zoneMax: Number((sma100 + 0.2 * atr14).toFixed(2)),
        touchCount: 1,
        ageDays: 0,
        volumeRatio: 1.0,
        isOverhead,
      };
      if (isOverhead) resistancePool.push(cand);
      else supportPool.push(cand);
    }

    if (ema200 !== null && ema200 > 0) {
      const isOverhead = ema200 >= ltp;
      const cand: StructuralCandidateMetadata = {
        type: '200-EMA',
        price: Number(ema200.toFixed(2)),
        zoneMin: Number((ema200 - 0.25 * atr14).toFixed(2)),
        zoneMax: Number((ema200 + 0.25 * atr14).toFixed(2)),
        touchCount: 1,
        ageDays: 0,
        volumeRatio: 1.0,
        isOverhead,
      };
      if (isOverhead) resistancePool.push(cand);
      else supportPool.push(cand);
    }

    // 5. 52-Week Boundaries
    if (is52WValid) {
      if (low52W < ltp) {
        supportPool.push({
          type: '52-Week Low Floor',
          price: Number(low52W.toFixed(2)),
          zoneMin: Number(low52W.toFixed(2)),
          zoneMax: Number((low52W + 0.3 * atr14).toFixed(2)),
          touchCount: 1,
          ageDays: 0,
          volumeRatio: 1.0,
          isOverhead: false,
        });
      }
      if (high52W > ltp) {
        resistancePool.push({
          type: '52-Week High Ceiling',
          price: Number(high52W.toFixed(2)),
          zoneMin: Number((high52W - 0.3 * atr14).toFixed(2)),
          zoneMax: Number(high52W.toFixed(2)),
          touchCount: 1,
          ageDays: 0,
          volumeRatio: 1.0,
          isOverhead: true,
        });
      }
    }

    // 6. Sort and Deduplicate Candidate Pools
    supportPool.sort((a, b) => b.price - a.price);
    resistancePool.sort((a, b) => a.price - b.price);

    const uniqueSupports: StructuralCandidateMetadata[] = [];
    for (const s of supportPool) {
      if (!uniqueSupports.some((u) => Math.abs(u.price - s.price) < 0.35 * atr14)) {
        uniqueSupports.push(s);
      }
    }

    const uniqueResistances: StructuralCandidateMetadata[] = [];
    for (const r of resistancePool) {
      if (!uniqueResistances.some((u) => Math.abs(u.price - r.price) < 0.35 * atr14)) {
        uniqueResistances.push(r);
      }
    }

    // ==========================================
    // STEP 7: DETERMINISTIC ENTRY SELECTION
    // ==========================================

    // E1 Selection: CandidateFloor = LTP - 0.25 * ATR14
    const minE1Ceiling = ltp - 0.25 * atr14;
    const e1Candidates = uniqueSupports.filter((s) => s.price <= minE1Ceiling);

    let e1: PriceStructureLevel;
    let selectedE1Price = 0;

    if (e1Candidates.length > 0) {
      const cand = e1Candidates[0];
      selectedE1Price = cand.price;
      e1 = {
        price: cand.price,
        zoneMin: cand.zoneMin,
        zoneMax: cand.zoneMax,
        type: cand.type,
        source: 'UPSTOX_CANDLES',
        classification: 'STRUCTURAL',
        distancePct: Number((((cand.price - ltp) / ltp) * 100).toFixed(2)),
      };
    } else {
      const fallbackP = Number((ltp - 0.75 * atr14).toFixed(2));
      selectedE1Price = fallbackP;
      e1 = {
        price: fallbackP,
        zoneMin: Number((fallbackP - 0.25 * atr14).toFixed(2)),
        zoneMax: fallbackP,
        type: 'Tactical Volatility Pullback (0.75 ATR)',
        source: 'VOLATILITY_EXPANSION',
        classification: 'MATHEMATICAL_FALLBACK',
        distancePct: Number((((fallbackP - ltp) / ltp) * 100).toFixed(2)),
      };
    }

    // E2 Selection: RequiredCeiling = E1.Price - 0.50 * ATR14
    const e2Ceiling = selectedE1Price - 0.50 * atr14;
    const e2Candidates = uniqueSupports.filter((s) => s.price <= e2Ceiling);

    let e2: PriceStructureLevel;
    let selectedE2Price: number | null = null;

    if (e2Candidates.length > 0) {
      const cand = e2Candidates[0];
      selectedE2Price = cand.price;
      e2 = {
        price: cand.price,
        zoneMin: cand.zoneMin,
        zoneMax: cand.zoneMax,
        type: cand.type,
        source: 'UPSTOX_CANDLES',
        classification: 'STRUCTURAL',
        distancePct: Number((((cand.price - ltp) / ltp) * 100).toFixed(2)),
      };
    } else {
      e2 = {
        price: null,
        zoneMin: null,
        zoneMax: null,
        type: 'UNAVAILABLE',
        source: 'NONE',
        classification: 'UNAVAILABLE',
        distancePct: null,
      };
    }

    // E3 Selection: Strictly dependent on E2 availability (E1 -> E2 -> E3 sequence)
    // If E2 is unavailable (selectedE2Price === null), E3 MUST be UNAVAILABLE.
    let e3: PriceStructureLevel;

    if (selectedE2Price !== null) {
      const e3Ceiling = selectedE2Price - 0.50 * atr14;
      const e3Candidates = uniqueSupports.filter((s) => s.price <= e3Ceiling);

      if (e3Candidates.length > 0) {
        const cand = e3Candidates[0];
        e3 = {
          price: cand.price,
          zoneMin: cand.zoneMin,
          zoneMax: cand.zoneMax,
          type: cand.type,
          source: 'UPSTOX_CANDLES',
          classification: 'STRUCTURAL',
          distancePct: Number((((cand.price - ltp) / ltp) * 100).toFixed(2)),
        };
      } else {
        e3 = {
          price: null,
          zoneMin: null,
          zoneMax: null,
          type: 'UNAVAILABLE',
          source: 'NONE',
          classification: 'UNAVAILABLE',
          distancePct: null,
        };
      }
    } else {
      e3 = {
        price: null,
        zoneMin: null,
        zoneMax: null,
        type: 'UNAVAILABLE',
        source: 'NONE',
        classification: 'UNAVAILABLE',
        distancePct: null,
      };
    }

    // ==========================================
    // STEP 8: ONE PROTECTIVE STOP LOSS
    // ==========================================
    const deepestActiveSupport = e3.price !== null ? e3.price : e2.price !== null ? e2.price : selectedE1Price;
    const rawStop = deepestActiveSupport - 0.50 * atr14;
    let slClassification: PriceStructureStopLoss['classification'] = 'STRUCTURAL_INVALIDATION';
    let finalStop = rawStop;

    // Anti-stop compression: stop distance must be >= 1.5 * ATR14
    if (ltp - finalStop < 1.50 * atr14) {
      finalStop = ltp - 1.50 * atr14;
      slClassification = 'ANTI_COMPRESSION_FLOOR';
    }

    // Hard safety floor
    if (finalStop <= 0 || finalStop >= ltp) {
      finalStop = ltp * 0.95;
      slClassification = 'SAFE_DEFAULT_FLOOR';
    }

    const stopLoss: PriceStructureStopLoss = {
      price: Number(finalStop.toFixed(2)),
      type: e3.price !== null ? 'Below E3 Structure' : e2.price !== null ? 'Below E2 Structure' : 'Below E1 Structure',
      source: 'VOLATILITY_BUFFERED_ANCHOR',
      classification: slClassification,
      buffer: Number((0.50 * atr14).toFixed(2)),
      distancePct: Number((((finalStop - ltp) / ltp) * 100).toFixed(2)),
    };

    // ==========================================
    // STEP 9: TARGETS (T1 / T2 / T3)
    // ==========================================

    // T1 Selection: FloorT1 = LTP + 1.0 * ATR14
    const t1Floor = ltp + 1.0 * atr14;
    const t1Candidates = uniqueResistances.filter((r) => r.price >= t1Floor);

    let t1: PriceStructureLevel;
    let selectedT1Price = 0;

    if (t1Candidates.length > 0) {
      const cand = t1Candidates[0];
      selectedT1Price = cand.price;
      t1 = {
        price: cand.price,
        zoneMin: cand.zoneMin,
        zoneMax: cand.zoneMax,
        type: cand.type,
        source: 'UPSTOX_CANDLES',
        classification: 'STRUCTURAL',
        distancePct: Number((((cand.price - ltp) / ltp) * 100).toFixed(2)),
      };
    } else {
      const t1Math = Number((ltp + Math.max(1.50 * atr14, 0.05 * ltp)).toFixed(2));
      selectedT1Price = t1Math;
      t1 = {
        price: t1Math,
        type: 'Tactical Volatility Expansion (1.5 ATR / +5%)',
        source: 'VOLATILITY_EXPANSION',
        classification: 'MATHEMATICAL_FALLBACK',
        distancePct: Number((((t1Math - ltp) / ltp) * 100).toFixed(2)),
      };
    }

    // T2 Selection: FloorT2 = T1.Price + 1.0 * ATR14
    const t2Floor = selectedT1Price + 1.0 * atr14;
    const t2Candidates = uniqueResistances.filter((r) => r.price >= t2Floor);

    let t2: PriceStructureLevel;
    let selectedT2Price = 0;

    if (t2Candidates.length > 0) {
      const cand = t2Candidates[0];
      selectedT2Price = cand.price;
      t2 = {
        price: cand.price,
        zoneMin: cand.zoneMin,
        zoneMax: cand.zoneMax,
        type: cand.type,
        source: 'UPSTOX_CANDLES',
        classification: 'STRUCTURAL',
        distancePct: Number((((cand.price - ltp) / ltp) * 100).toFixed(2)),
      };
    } else {
      const t2Math = Number((ltp + Math.max(3.0 * atr14, 0.08 * ltp)).toFixed(2));
      selectedT2Price = t2Math;
      t2 = {
        price: t2Math,
        type: 'Canonical 3R Expansion Target (3.0 ATR / +8%)',
        source: 'VOLATILITY_EXPANSION',
        classification: 'MATHEMATICAL_FALLBACK',
        distancePct: Number((((t2Math - ltp) / ltp) * 100).toFixed(2)),
      };
    }

    // T3 Selection: FloorT3 = T2.Price + 1.5 * ATR14
    const t3Floor = selectedT2Price + 1.5 * atr14;
    const t3Candidates = uniqueResistances.filter((r) => r.price >= t3Floor);

    let t3: PriceStructureLevel;

    if (t3Candidates.length > 0) {
      const cand = t3Candidates[0];
      t3 = {
        price: cand.price,
        zoneMin: cand.zoneMin,
        zoneMax: cand.zoneMax,
        type: cand.type,
        source: 'UPSTOX_CANDLES',
        classification: 'STRUCTURAL',
        distancePct: Number((((cand.price - ltp) / ltp) * 100).toFixed(2)),
      };
    } else {
      const isBlueSky = is52WValid && ltp >= high52W * 0.98;
      const t3Math = Number((ltp + Math.max(5.0 * atr14, 0.15 * ltp)).toFixed(2));
      t3 = {
        price: t3Math,
        type: isBlueSky ? 'Blue-Sky Extension Projection' : 'Extended Compounding Target (5.0 ATR / +15%)',
        source: 'VOLATILITY_EXPANSION',
        classification: isBlueSky ? 'VOLATILITY_ONLY' : 'MATHEMATICAL_FALLBACK',
        distancePct: Number((((t3Math - ltp) / ltp) * 100).toFixed(2)),
      };
    }

    const s1 = PriceStructureEngine.calculateHorizonStop(e1, ltp, atr14, 'S1', uniqueSupports);
    const s2 = PriceStructureEngine.calculateHorizonStop(e2, ltp, atr14, 'S2', uniqueSupports);
    const s3 = PriceStructureEngine.calculateHorizonStop(e3, ltp, atr14, 'S3', uniqueSupports);

    return {
      entries: { e1, e2, e3 },
      stopLoss,
      stops: { s1, s2, s3 },
      targets: { t1, t2, t3 },
      metadata: {
        atr14: Number(atr14.toFixed(2)),
        supportCandidates: uniqueSupports,
        resistanceCandidates: uniqueResistances,
      },
    };
  }

  /**
   * Calculates a V1.2 Model D Horizon Geometry Stop (S1, S2, or S3) from its corresponding Entry (E1, E2, or E3)
   * Enforces:
   * 1. Zero Fabrication: If Ex is UNAVAILABLE (price === null), Sx is UNAVAILABLE (price === null)
   * 2. Structural Stop Lookup: Search supportPool for highest candidate <= Ex.price - 0.25 * ATR14
   * 3. S3 Special Rule: Exclude 50-DMA candidates from S3 lookup
   * 4. S1 Special Rule: Exclude 52-Week Low Floor candidates from S1 lookup unless LTP <= Low52W + 2.0 * ATR14
   * 5. Buffer: If candidate found, Sx = candidate.price - 0.50 * ATR14
   * 6. Fallback: If no candidate found, Sx = Ex.price - 1.50 * ATR14
   * 7. Hard Safety Check: If Sx <= 0 or Sx >= Ex.price => Sx = LTP * 0.95
   */
  public static calculateHorizonStop(
    entry: PriceStructureLevel,
    ltp: number,
    atr14: number,
    horizonName: 'S1' | 'S2' | 'S3',
    supportPool: StructuralCandidateMetadata[] = []
  ): PriceStructureLevel {
    if (!entry || entry.price === null || entry.classification === 'UNAVAILABLE') {
      return {
        price: null,
        type: 'UNAVAILABLE',
        source: 'NONE',
        classification: 'UNAVAILABLE',
        distancePct: null,
      };
    }

    const ePrice = entry.price;
    const searchCeiling = ePrice - 0.25 * atr14;

    const validCandidates = supportPool.filter((cand) => {
      if (cand.price > searchCeiling) return false;

      // Special Rule for S3: Exclude 50-DMA
      if (horizonName === 'S3' && cand.type === '50-DMA') {
        return false;
      }

      // Special Rule for S1: Exclude 52-Week Low Floor unless LTP <= Low52W + 2.0 * ATR14
      if (horizonName === 'S1' && cand.type === '52-Week Low Floor') {
        const isNear52WLow = ltp <= cand.price + 2.0 * atr14;
        if (!isNear52WLow) return false;
      }

      return true;
    });

    let rawStop: number;
    let classification: LevelClassification;
    let typeName: string;
    let source: PriceStructureLevel['source'];

    if (validCandidates.length > 0) {
      // supportPool is sorted descending by price (highest candidate below ceiling first)
      const structCand = validCandidates[0];
      rawStop = structCand.price - 0.50 * atr14;
      classification = 'STRUCTURAL';
      typeName = `Structural Stop (${structCand.type})`;
      source = 'UPSTOX_CANDLES';
    } else {
      // Model D Mathematical Fallback: Ex - 1.50 * ATR14
      rawStop = ePrice - 1.50 * atr14;
      classification = 'MATHEMATICAL_FALLBACK';
      typeName = `Horizon Stop ${horizonName}`;
      source = 'STRUCTURAL_BUFFERED_STOP';
    }

    // Hard Safety Check: S <= 0 or S >= Ex
    if (rawStop <= 0 || rawStop >= ePrice) {
      rawStop = ltp * 0.95;
      classification = 'MATHEMATICAL_FALLBACK';
      typeName = `Safe Default Floor (${horizonName})`;
      source = 'VOLATILITY_EXPANSION';
    }

    const finalStop = Number(rawStop.toFixed(2));
    const distancePct = Number((((finalStop - ltp) / ltp) * 100).toFixed(2));

    return {
      price: finalStop,
      type: typeName,
      source,
      classification,
      distancePct,
    };
  }

  private static generateSafeFallbackStructure(ltp: number, atr14: number): PriceStructure {
    if (ltp <= 0) {
      const unavailableLevel: PriceStructureLevel = {
        price: null,
        type: 'UNAVAILABLE',
        source: 'NONE',
        classification: 'UNAVAILABLE',
        distancePct: null,
      };
      const unavailableStop: PriceStructureStopLoss = {
        price: null,
        type: 'UNAVAILABLE',
        source: 'NONE',
        classification: 'SAFE_DEFAULT_FLOOR',
        buffer: 0,
        distancePct: 0,
      };
      return {
        entries: { e1: unavailableLevel, e2: unavailableLevel, e3: unavailableLevel },
        stopLoss: unavailableStop,
        stops: { s1: unavailableLevel, s2: unavailableLevel, s3: unavailableLevel },
        targets: { t1: unavailableLevel, t2: unavailableLevel, t3: unavailableLevel },
        metadata: { atr14: 0, supportCandidates: [], resistanceCandidates: [] },
      };
    }

    const e1Price = Number((ltp * 0.985).toFixed(2));
    const slPrice = Number((ltp * 0.95).toFixed(2));
    const t1Price = Number((ltp * 1.05).toFixed(2));
    const t2Price = Number((ltp * 1.08).toFixed(2));
    const t3Price = Number((ltp * 1.15).toFixed(2));

    const e1Level: PriceStructureLevel = {
      price: e1Price,
      type: 'Fallback Entry',
      source: 'SAFE_DEFAULT',
      classification: 'MATHEMATICAL_FALLBACK',
      distancePct: -1.5,
    };
    const e2Level: PriceStructureLevel = {
      price: null,
      type: 'UNAVAILABLE',
      source: 'NONE',
      classification: 'UNAVAILABLE',
      distancePct: null,
    };
    const e3Level: PriceStructureLevel = {
      price: null,
      type: 'UNAVAILABLE',
      source: 'NONE',
      classification: 'UNAVAILABLE',
      distancePct: null,
    };

    const s1 = PriceStructureEngine.calculateHorizonStop(e1Level, ltp, atr14, 'S1');
    const s2 = PriceStructureEngine.calculateHorizonStop(e2Level, ltp, atr14, 'S2');
    const s3 = PriceStructureEngine.calculateHorizonStop(e3Level, ltp, atr14, 'S3');

    return {
      entries: {
        e1: e1Level,
        e2: e2Level,
        e3: e3Level,
      },
      stopLoss: {
        price: slPrice,
        type: 'Safe Default Stop',
        source: 'SAFE_DEFAULT_FLOOR',
        classification: 'SAFE_DEFAULT_FLOOR',
        buffer: Number((0.5 * atr14).toFixed(2)),
        distancePct: -5.0,
      },
      stops: { s1, s2, s3 },
      targets: {
        t1: {
          price: t1Price,
          type: 'Tactical +5% Target',
          source: 'SAFE_DEFAULT',
          classification: 'MATHEMATICAL_FALLBACK',
          distancePct: 5.0,
        },
        t2: {
          price: t2Price,
          type: 'Canonical +8% Target',
          source: 'SAFE_DEFAULT',
          classification: 'MATHEMATICAL_FALLBACK',
          distancePct: 8.0,
        },
        t3: {
          price: t3Price,
          type: 'Extended +15% Target',
          source: 'SAFE_DEFAULT',
          classification: 'MATHEMATICAL_FALLBACK',
          distancePct: 15.0,
        },
      },
      metadata: {
        atr14: Number(atr14.toFixed(2)),
        supportCandidates: [],
        resistanceCandidates: [],
      },
    };
  }
}
