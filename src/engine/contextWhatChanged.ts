/**
 * STOCKINSIGHT V2.0 What Changed Engine (Phase 1E)
 * Specification Status: LOCKED FOR IMPLEMENTATION
 * Date: September 28, 2026
 * 
 * Strict Invariants:
 * 1. Pure deterministic state comparison layer between current and previous snapshots.
 * 2. Tracks exactly 8 categorical dimensions + CoreScore delta (|ΔCoreScore| >= 3 pts).
 * 3. Day-0 Cold Start invariant: previous === null yields isColdStart = true, hasChanged = false.
 * 4. Invalid/corrupted previous snapshots fall back safely to cold-start mode without exceptions.
 * 5. Noise filter: Sub-threshold price movements without categorical change yield hasChanged = false.
 * 6. ETF fundamental condition transitions are ignored (never treated as deterioration).
 * 7. Strictly factual transition descriptions with zero causal or predictive language.
 */

import {
  StockContextEvaluation,
  StateTransition,
  WhatChangedResult,
} from '../types/context';
import { evaluateRelationship } from './contextRelationships';

// Canonical dimension display names
const DIMENSION_NAMES = {
  FUNDAMENTAL: 'Fundamental Condition',
  TECHNICAL: 'Technical Condition',
  VALUATION: 'Valuation Condition',
  MOMENTUM: 'Momentum Condition',
  PRICE_LOCATION: 'Price Location',
  POSITION_CONTEXT: 'Position Context',
  ATTENTION_LEVEL: 'Attention Level',
  RELATIONSHIP: 'Relationship Archetype',
  CORE_SCORE: 'Core Score',
} as const;

/**
 * Validates whether a previous evaluation object is structurally valid for comparison.
 */
function isValidContextEvaluation(evalObj: any): evalObj is StockContextEvaluation {
  if (!evalObj || typeof evalObj !== 'object') return false;
  return (
    typeof evalObj.fundamental_condition === 'string' &&
    typeof evalObj.technical_condition === 'string' &&
    typeof evalObj.valuation_condition === 'string' &&
    typeof evalObj.price_location === 'string' &&
    typeof evalObj.attention_level === 'string'
  );
}

/**
 * Pure deterministic evaluator that compares current Context evaluation with previous snapshot.
 * 
 * @param current Current session StockContextEvaluation
 * @param previous Previous session StockContextEvaluation (or null for Day-0 cold start)
 * @param currentCoreScore Current numeric Core Score (0-50 or null)
 * @param previousCoreScore Previous numeric Core Score (0-50 or null)
 * @param evaluatedAt Current ISO timestamp / date string
 * @param isETF Optional flag indicating whether the instrument is an ETF
 * @returns Canonical WhatChangedResult
 */
export function evaluateWhatChanged(
  current: StockContextEvaluation,
  previous: StockContextEvaluation | null,
  currentCoreScore: number | null = null,
  previousCoreScore: number | null = null,
  evaluatedAt: string = new Date().toISOString().split('T')[0],
  isETF: boolean = false
): WhatChangedResult {
  // ============================================================
  // 1. DAY-0 / COLD START & INVALID SNAPSHOT FALLBACK
  // ============================================================
  if (!previous || !isValidContextEvaluation(previous)) {
    return {
      hasChanged: false,
      isColdStart: true,
      summary: `Baseline established on ${evaluatedAt}. Delta tracking active for subsequent sessions.`,
      transitions: [],
      scoreDelta: null,
      evaluatedAt,
    };
  }

  const transitions: StateTransition[] = [];

  // ============================================================
  // 2. TRACK 8 CATEGORICAL DIMENSIONS
  // ============================================================

  // Dimension 1: FundamentalCondition (Ignored for ETFs)
  if (!isETF && current.fundamental_condition !== previous.fundamental_condition) {
    transitions.push({
      dimension: DIMENSION_NAMES.FUNDAMENTAL,
      from: previous.fundamental_condition,
      to: current.fundamental_condition,
      description: `Fundamental Condition shifted from ${previous.fundamental_condition} to ${current.fundamental_condition}.`,
    });
  }

  // Dimension 2: TechnicalCondition
  if (current.technical_condition !== previous.technical_condition) {
    transitions.push({
      dimension: DIMENSION_NAMES.TECHNICAL,
      from: previous.technical_condition,
      to: current.technical_condition,
      description: `Technical Condition shifted from ${previous.technical_condition} to ${current.technical_condition}.`,
    });
  }

  // Dimension 3: ValuationCondition
  if (current.valuation_condition !== previous.valuation_condition) {
    transitions.push({
      dimension: DIMENSION_NAMES.VALUATION,
      from: previous.valuation_condition,
      to: current.valuation_condition,
      description: `Valuation Condition shifted from ${previous.valuation_condition} to ${current.valuation_condition}.`,
    });
  }

  // Dimension 4: MomentumCondition (Nullable)
  if (current.momentum_condition !== previous.momentum_condition) {
    const fromStr = previous.momentum_condition ?? 'UNAVAILABLE';
    const toStr = current.momentum_condition ?? 'UNAVAILABLE';
    transitions.push({
      dimension: DIMENSION_NAMES.MOMENTUM,
      from: fromStr,
      to: toStr,
      description: `Momentum Condition shifted from ${fromStr} to ${toStr}.`,
    });
  }

  // Dimension 5: PriceLocation
  if (current.price_location !== previous.price_location) {
    transitions.push({
      dimension: DIMENSION_NAMES.PRICE_LOCATION,
      from: previous.price_location,
      to: current.price_location,
      description: `Price Location shifted from ${previous.price_location} to ${current.price_location}.`,
    });
  }

  // Dimension 6: PositionContext (Nullable when unheld)
  const currentPosContext = current.position?.context ?? null;
  const prevPosContext = previous.position?.context ?? null;
  if (currentPosContext !== prevPosContext) {
    const fromStr = prevPosContext ?? 'UNHELD';
    const toStr = currentPosContext ?? 'UNHELD';
    transitions.push({
      dimension: DIMENSION_NAMES.POSITION_CONTEXT,
      from: fromStr,
      to: toStr,
      description: `Position Context shifted from ${fromStr} to ${toStr}.`,
    });
  }

  // Dimension 7: AttentionLevel
  if (current.attention_level !== previous.attention_level) {
    transitions.push({
      dimension: DIMENSION_NAMES.ATTENTION_LEVEL,
      from: previous.attention_level,
      to: current.attention_level,
      description: `Attention Level shifted from ${previous.attention_level} to ${current.attention_level}.`,
    });
  }

  // Dimension 8: RelationshipArchetype
  const currentArchetype = evaluateRelationship(current.fundamental_condition, current.technical_condition).archetype;
  const prevArchetype = evaluateRelationship(previous.fundamental_condition, previous.technical_condition).archetype;
  if (currentArchetype !== prevArchetype) {
    transitions.push({
      dimension: DIMENSION_NAMES.RELATIONSHIP,
      from: prevArchetype,
      to: currentArchetype,
      description: `Relationship Archetype shifted from ${prevArchetype} to ${currentArchetype}.`,
    });
  }

  // ============================================================
  // 3. CALCULATE CORESCORE DELTA (|ΔCoreScore| >= 3)
  // ============================================================
  let scoreDelta: number | null = null;
  if (
    currentCoreScore !== null &&
    previousCoreScore !== null &&
    typeof currentCoreScore === 'number' &&
    typeof previousCoreScore === 'number' &&
    !isNaN(currentCoreScore) &&
    !isNaN(previousCoreScore)
  ) {
    scoreDelta = currentCoreScore - previousCoreScore;

    // Emit score transition if material score shift occurred and no categorical transitions were detected
    if (Math.abs(scoreDelta) >= 3 && transitions.length === 0) {
      const sign = scoreDelta > 0 ? '+' : '';
      transitions.push({
        dimension: DIMENSION_NAMES.CORE_SCORE,
        from: String(previousCoreScore),
        to: String(currentCoreScore),
        description: `Core Score shifted by ${sign}${scoreDelta} points (from ${previousCoreScore} to ${currentCoreScore}).`,
      });
    }
  }

  // ============================================================
  // 4. NOISE FILTERING & SUMMARY GENERATION
  // ============================================================
  const isMaterialScoreShift = scoreDelta !== null && Math.abs(scoreDelta) >= 3;
  const hasChanged = transitions.length > 0 || isMaterialScoreShift;

  let summary = 'No material analytical state change observed.';
  if (hasChanged && transitions.length > 0) {
    summary = transitions.map(t => t.description).join(' ');
  }

  return {
    hasChanged,
    isColdStart: false,
    summary,
    transitions,
    scoreDelta,
    evaluatedAt,
  };
}
