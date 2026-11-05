/**
 * STOCKINSIGHT V2.0 Context Engine Pure Classifiers
 * Specification Status: LOCKED FOR IMPLEMENTATION (Phase 1B)
 * Date: September 28, 2026
 * 
 * Strict Invariants:
 * 1. PURE FUNCTIONS: Deterministic, side-effect free, downstream only.
 * 2. ZERO SCORE MUTATION: Never alters Fundamental, Technical, or Core scores.
 * 3. NO ZERO COERCION: Missing data is strictly preserved as INCOMPLETE/UNAVAILABLE.
 * 4. POSITION DECOUPLING: Position data affects only PositionContext.
 * 5. ALL PROPOSED THRESHOLDS EXPLICITLY TAGGED.
 */

import {
  ContextInput,
  PositionContextInput,
  FundamentalCondition,
  TechnicalCondition,
  ValuationCondition,
  MomentumCondition,
  PriceLocation,
  PositionContext,
} from '../types/context';

// ============================================================
// PROPOSED THRESHOLDS REGISTER (SUBJECT TO EMPIRICAL VALIDATION)
// ============================================================

export const PROPOSED_CONTEXT_THRESHOLDS = {
  // Fundamental Score Boundaries (0-50 Scale)
  FUNDAMENTAL_STRONG: 38.0,
  FUNDAMENTAL_HEALTHY: 28.0,
  FUNDAMENTAL_MIXED: 18.0,

  // Technical Score Boundaries (0-50 Scale)
  TECHNICAL_STRONG: 38.0,
  TECHNICAL_POSITIVE: 28.0,
  TECHNICAL_STABLE: 18.0,

  // Valuation Comparison Boundaries
  VALUATION_SECTOR_PE_MULTIPLE: 1.15,
  VALUATION_SECTOR_PB_MULTIPLE: 1.15,
  VALUATION_BUCKET_SCORE_REASONABLE: 6.0, // out of 12 pts

  // Momentum 2D Boundaries
  MOMENTUM_RSI_UPPER: 68.0,
  MOMENTUM_RSI_LOWER: 50.0,
  MOMENTUM_ROC_ZERO: 0.0,

  // Price Location Proximity Envelopes
  PRICE_LOCATION_ATR_PROXIMITY_MULTIPLIER: 0.50,

  // Position P&L Percentage Boundaries
  POSITION_PNL_STRONGLY_APPRECIATED: 20.0,
  POSITION_PNL_PROFITABLE_MIN: 3.0,
  POSITION_PNL_BREAKEVEN_MIN: -3.0,
  POSITION_PNL_LOSS_MIN: -10.0,
} as const;

// ============================================================
// 1. FUNDAMENTAL CONDITION CLASSIFIER
// ============================================================

/**
 * Classifies the FundamentalCondition based on authoritative FundamentalScore.
 * Handles Industrial, Bank, NBFC/HFC models, and ETF non-reporting exceptions.
 */
export function classifyFundamentalCondition(input: ContextInput): FundamentalCondition {
  // 1. ETF / Non-Reporting Asset Handling
  if (input.isETF || input.fundamentalStatus === 'NOT_APPLICABLE') {
    return 'INCOMPLETE';
  }

  // 2. Missing Fundamental Score or Quarantined Data
  if (input.fundamentalScore === null || input.fundamentalStatus === 'UNAVAILABLE') {
    return 'INCOMPLETE';
  }

  const score = input.fundamentalScore;

  // 3. Proposed Score Partitions
  if (score >= PROPOSED_CONTEXT_THRESHOLDS.FUNDAMENTAL_STRONG) {
    return 'STRONG';
  }
  if (score >= PROPOSED_CONTEXT_THRESHOLDS.FUNDAMENTAL_HEALTHY) {
    return 'HEALTHY';
  }
  if (score >= PROPOSED_CONTEXT_THRESHOLDS.FUNDAMENTAL_MIXED) {
    return 'MIXED';
  }
  return 'WEAK';
}

// ============================================================
// 2. TECHNICAL CONDITION CLASSIFIER
// ============================================================

/**
 * Classifies the TechnicalCondition.
 * Evaluates static Day-0 cold-start rules or temporal transition-dependent WEAKENING.
 */
export function classifyTechnicalCondition(
  input: ContextInput,
  priorState?: TechnicalCondition
): TechnicalCondition {
  const { technicals, priceStructure } = input;

  // 1. Insufficient Candle History or Missing Data
  if (technicals.state === 'MISSING' || technicals.ema200 === null || technicals.sma100 === null) {
    return 'INCOMPLETE';
  }

  const ltp = priceStructure.ltp;
  const ema200 = technicals.ema200;
  const sma100 = technicals.sma100;
  const maStackAligned = technicals.maStackAligned ?? false;

  if (ltp === null || ltp <= 0) {
    return 'INCOMPLETE';
  }

  // 2. Temporal Transition Check (Day N >= 1)
  // WEAKENING requires prior evidence of STRONG or POSITIVE state
  if (priorState === 'STRONG' || priorState === 'POSITIVE') {
    const brokenSma100 = ltp < sma100;
    const brokenEma200 = ltp < ema200;
    if (brokenSma100 || brokenEma200) {
      return 'WEAKENING';
    }
  }

  // 3. Static Cold-Start Rule (Locked Architecture)
  if (ltp >= ema200) {
    if (maStackAligned && (input.technicalScore ?? 0) >= PROPOSED_CONTEXT_THRESHOLDS.TECHNICAL_STRONG) {
      return 'STRONG';
    }
    if (ltp >= sma100) {
      return 'POSITIVE';
    }
    return 'STABLE';
  } else {
    // LTP < EMA200
    if (ltp >= sma100) {
      // LOCKED COLD-START RULE: LTP < EMA200 AND LTP >= SMA100 on Day 0 -> STABLE
      return 'STABLE';
    }
    return 'WEAK';
  }
}

// ============================================================
// 3. VALUATION CONDITION CLASSIFIER
// ============================================================

/**
 * Classifies ValuationCondition for Industrials and Financials.
 * Returns REASONABLE, ELEVATED, or UNAVAILABLE (ETFs/Missing).
 */
export function classifyValuationCondition(input: ContextInput): ValuationCondition {
  // 1. ETF or Missing Valuation Data
  if (input.isETF || input.valuation.state === 'NOT_APPLICABLE' || input.valuation.state === 'MISSING') {
    return 'UNAVAILABLE';
  }

  const { pe, pb, sectorPe, sectorPb, valuationBucketScore } = input.valuation;
  const bucketScore = valuationBucketScore ?? 0;
  const isFinancial = input.sector === 'COMMERCIAL_BANK' || input.sector === 'NBFC_HFC';

  // 2. Financial Sector Evaluation (P/B based)
  if (isFinancial) {
    if (pb === null && valuationBucketScore === null) {
      return 'UNAVAILABLE';
    }
    if (sectorPb !== null && pb !== null && pb <= sectorPb * PROPOSED_CONTEXT_THRESHOLDS.VALUATION_SECTOR_PB_MULTIPLE) {
      return 'REASONABLE';
    }
    if (bucketScore >= PROPOSED_CONTEXT_THRESHOLDS.VALUATION_BUCKET_SCORE_REASONABLE) {
      return 'REASONABLE';
    }
    return 'ELEVATED';
  }

  // 3. Industrial / Conglomerate Evaluation (P/E and Bucket based)
  if (pe === null && valuationBucketScore === null) {
    return 'UNAVAILABLE';
  }

  // Condition 1: P/E comparison against sector multiple
  const isPeReasonable = sectorPe !== null && pe !== null && pe <= sectorPe * PROPOSED_CONTEXT_THRESHOLDS.VALUATION_SECTOR_PE_MULTIPLE;

  // Condition 2: Absolute Valuation Bucket Score (>= 6 out of 12)
  const isBucketReasonable = bucketScore >= PROPOSED_CONTEXT_THRESHOLDS.VALUATION_BUCKET_SCORE_REASONABLE;

  if (isPeReasonable || isBucketReasonable) {
    return 'REASONABLE';
  }

  return 'ELEVATED';
}

// ============================================================
// 4. MOMENTUM CONDITION CLASSIFIER
// ============================================================

/**
 * Classifies MomentumCondition across the 2D (RSI14, ROC20) plane.
 * Returns IMPROVING, HEALTHY, COOLING, or WEAK when evidence is available.
 * Returns null when required momentum evidence is missing (MISSING != WEAK).
 */
export function classifyMomentumCondition(input: ContextInput): MomentumCondition | null {
  const { rsi14, roc20, state } = input.momentum;

  // 1. Missing Momentum Indicators (Strict Non-Coercion: MISSING != WEAK)
  if (state === 'MISSING' || rsi14 === null || roc20 === null) {
    return null;
  }

  const rsi = rsi14;
  const roc = roc20;
  const rsiHigh = PROPOSED_CONTEXT_THRESHOLDS.MOMENTUM_RSI_UPPER;
  const rsiLow = PROPOSED_CONTEXT_THRESHOLDS.MOMENTUM_RSI_LOWER;
  const rocZero = PROPOSED_CONTEXT_THRESHOLDS.MOMENTUM_ROC_ZERO;

  // 2. 2D Continuous Plane Partition
  if (rsi > rsiHigh) {
    return 'COOLING';
  }

  if (rsi >= rsiLow && rsi <= rsiHigh) {
    if (roc > rocZero) {
      return 'HEALTHY';
    }
    return 'COOLING';
  }

  // RSI < 50
  if (roc > rocZero) {
    return 'IMPROVING';
  }

  return 'WEAK';
}

// ============================================================
// 5. PRICE LOCATION CLASSIFIER
// ============================================================

/**
 * Classifies PriceLocation using the locked 4-step precedence cascade.
 * Precedence: EXTENDED > SUPPORT > RESISTANCE > MID_RANGE.
 */
export function classifyPriceLocation(input: ContextInput): PriceLocation {
  const { ltp, e1, t1, t3, atr14, maxEntry } = input.priceStructure;

  // 1. Insufficient Price Data
  if (ltp === null || ltp <= 0 || atr14 === null || atr14 <= 0) {
    return 'MID_RANGE';
  }

  const proximityWindow = atr14 * PROPOSED_CONTEXT_THRESHOLDS.PRICE_LOCATION_ATR_PROXIMITY_MULTIPLIER;

  // STEP 1: EXTENDED (Priority 1)
  const isExtendedAboveMaxEntry = maxEntry !== null && ltp > maxEntry;
  const isExtendedAboveT3 = t3 !== null && ltp > t3;
  if (isExtendedAboveMaxEntry || isExtendedAboveT3) {
    return 'EXTENDED';
  }

  // STEP 2: SUPPORT (Priority 2)
  if (e1 !== null && Math.abs(ltp - e1) <= proximityWindow) {
    return 'SUPPORT';
  }

  // STEP 3: RESISTANCE (Priority 3)
  if (t1 !== null && Math.abs(ltp - t1) <= proximityWindow) {
    return 'RESISTANCE';
  }

  // STEP 4: MID_RANGE (Default Fallback)
  return 'MID_RANGE';
}

// ============================================================
// 6. POSITION CONTEXT CLASSIFIER
// ============================================================

/**
 * Classifies PositionContext for held positions.
 * Returns null (NOT_APPLICABLE) when is_held is false.
 */
export function classifyPositionContext(input: PositionContextInput): PositionContext | null {
  // 1. Unheld Invariant
  if (!input.is_held || input.pnlPct === null) {
    return null;
  }

  const pnl = input.pnlPct;

  // 2. Proposed P&L Partitions
  if (pnl >= PROPOSED_CONTEXT_THRESHOLDS.POSITION_PNL_STRONGLY_APPRECIATED) {
    return 'STRONGLY_APPRECIATED';
  }
  if (pnl >= PROPOSED_CONTEXT_THRESHOLDS.POSITION_PNL_PROFITABLE_MIN) {
    return 'PROFITABLE';
  }
  if (pnl >= PROPOSED_CONTEXT_THRESHOLDS.POSITION_PNL_BREAKEVEN_MIN) {
    return 'NEAR_BREAKEVEN';
  }
  if (pnl >= PROPOSED_CONTEXT_THRESHOLDS.POSITION_PNL_LOSS_MIN) {
    return 'LOSS';
  }
  return 'SIGNIFICANT_LOSS';
}
