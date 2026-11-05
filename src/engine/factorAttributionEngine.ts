/**
 * STOCKINSIGHT V2.1 Deterministic Sub-Factor Score Attribution Engine (F-03)
 * 
 * Strict Invariants:
 * 1. Pure deterministic mathematical diffing between current and previous evaluations.
 * 2. Stable factor matching strictly via factor.name (never array position).
 * 3. Triggers when Math.abs(ΔCore) >= 3 OR a canonical context condition transitions.
 * 4. Factors with scoreDelta === 0 are excluded from activeFactorDeltas.
 * 5. If previous or current factor is missing, delta evaluates to null (NEVER coerced to 0).
 * 6. Strictly evidence-based explanation (zero causal AI narratives, zero macro speculation).
 * 7. ZERO mutation of analytical scores, thresholds, or persistent snapshots.
 */

import { FactorScore, StockInsightEvaluation } from '../types/engine';
import { StockContextEvaluation } from '../types/context';

export interface SubFactorDelta {
  name: string;
  category: 'FUNDAMENTAL' | 'TECHNICAL';
  previousScore: number | null;
  currentScore: number | null;
  scoreDelta: number | null;
  previousRawValue?: string | number | null;
  currentRawValue?: string | number | null;
  explanation: string;
}

export interface FactorAttributionResult {
  isin: string;
  tradingSessionId: string;
  scoreDelta: number | null;
  fundamentalScoreDelta: number | null;
  technicalScoreDelta: number | null;
  activeFactorDeltas: SubFactorDelta[];
  isTriggered: boolean;
  triggerReason: string | null;
}

export interface FactorAttributionParams {
  currentEvaluation: StockInsightEvaluation;
  previousEvaluation?: StockInsightEvaluation | null;
  currentContext?: StockContextEvaluation | null;
  previousContext?: StockContextEvaluation | null;
  tradingSessionId?: string;
}

export class FactorAttributionEngine {
  /**
   * Evaluates deterministic factor-level score deltas between current and previous evaluations.
   */
  public static evaluate(params: FactorAttributionParams): FactorAttributionResult {
    const {
      currentEvaluation,
      previousEvaluation = null,
      currentContext = null,
      previousContext = null,
      tradingSessionId = currentEvaluation.evaluatedAt?.split('T')[0] || '',
    } = params;

    const isin = currentEvaluation.isin;
    const currentCore = currentEvaluation.coreScore ?? null;
    const prevCore = previousEvaluation?.coreScore ?? null;

    const scoreDelta =
      currentCore !== null && prevCore !== null ? currentCore - prevCore : null;

    // Check Trigger Conditions:
    // 1. |ΔCore| >= 3
    const isMaterialScoreDelta = scoreDelta !== null && Math.abs(scoreDelta) >= 3;

    // 2. Categorical Dimension Transition
    let hasConditionTransition = false;
    let transitionReason: string | null = null;

    if (currentContext && previousContext) {
      if (currentContext.fundamental_condition !== previousContext.fundamental_condition) {
        hasConditionTransition = true;
        transitionReason = `Fundamental: ${previousContext.fundamental_condition} -> ${currentContext.fundamental_condition}`;
      } else if (currentContext.technical_condition !== previousContext.technical_condition) {
        hasConditionTransition = true;
        transitionReason = `Technical: ${previousContext.technical_condition} -> ${currentContext.technical_condition}`;
      } else if (currentContext.valuation_condition !== previousContext.valuation_condition) {
        hasConditionTransition = true;
        transitionReason = `Valuation: ${previousContext.valuation_condition} -> ${currentContext.valuation_condition}`;
      } else if (currentContext.momentum_condition !== previousContext.momentum_condition) {
        hasConditionTransition = true;
        transitionReason = `Momentum: ${previousContext.momentum_condition} -> ${currentContext.momentum_condition}`;
      } else if (currentContext.price_location !== previousContext.price_location) {
        hasConditionTransition = true;
        transitionReason = `Price Location: ${previousContext.price_location} -> ${currentContext.price_location}`;
      } else if (currentContext.attention_level !== previousContext.attention_level) {
        hasConditionTransition = true;
        transitionReason = `Attention Level: ${previousContext.attention_level} -> ${currentContext.attention_level}`;
      }
    }

    const isTriggered = isMaterialScoreDelta || hasConditionTransition;
    const triggerReason = isMaterialScoreDelta
      ? `Core Score Delta: ${scoreDelta! >= 0 ? '+' : ''}${scoreDelta} pts`
      : transitionReason;

    const activeFactorDeltas: SubFactorDelta[] = [];

    // Calculate sub-axis score deltas
    const currFund = currentEvaluation.fundamentalScore ?? null;
    const prevFund = previousEvaluation?.fundamentalScore ?? null;
    const fundamentalScoreDelta =
      currFund !== null && prevFund !== null ? currFund - prevFund : null;

    const currTech = currentEvaluation.technicalScore ?? null;
    const prevTech = previousEvaluation?.technicalScore ?? null;
    const technicalScoreDelta =
      currTech !== null && prevTech !== null ? currTech - prevTech : null;

    // Collect all factors from current and previous
    const currFactors = [
      ...(currentEvaluation.fundamentalFactors || []),
      ...(currentEvaluation.technicalFactors || []),
    ];

    const prevFactorsMap = new Map<string, FactorScore>();
    if (previousEvaluation) {
      const prevFactors = [
        ...(previousEvaluation.fundamentalFactors || []),
        ...(previousEvaluation.technicalFactors || []),
      ];
      prevFactors.forEach((f) => {
        if (f && f.name) {
          prevFactorsMap.set(f.name.trim().toLowerCase(), f);
        }
      });
    }

    // Match each current factor against previous by stable name
    currFactors.forEach((currF) => {
      if (!currF || !currF.name) return;
      const key = currF.name.trim().toLowerCase();
      const prevF = prevFactorsMap.get(key);

      const prevScore = prevF?.score !== undefined ? prevF.score : null;
      const currScore = currF.score !== undefined ? currF.score : null;

      let fDelta: number | null = null;
      if (prevScore !== null && currScore !== null) {
        fDelta = currScore - prevScore;
      }

      // Include only factors where score delta is non-zero
      if (fDelta !== null && fDelta !== 0) {
        const deltaFormatted = `${fDelta > 0 ? '+' : ''}${fDelta}`;
        const rawPrevStr = prevF?.rawValue !== undefined && prevF?.rawValue !== null ? ` (${prevF.rawValue})` : '';
        const rawCurrStr = currF.rawValue !== undefined && currF.rawValue !== null ? ` (${currF.rawValue})` : '';

        const explanation = `${currF.name} score shifted from ${prevScore}${rawPrevStr} to ${currScore}${rawCurrStr} (${deltaFormatted} pts).`;

        activeFactorDeltas.push({
          name: currF.name,
          category: currF.category,
          previousScore: prevScore,
          currentScore: currScore,
          scoreDelta: fDelta,
          previousRawValue: prevF?.rawValue ?? null,
          currentRawValue: currF.rawValue ?? null,
          explanation,
        });
      }
    });

    // Sort factor deltas by absolute magnitude descending
    activeFactorDeltas.sort((a, b) => {
      const magA = Math.abs(a.scoreDelta || 0);
      const magB = Math.abs(b.scoreDelta || 0);
      return magB - magA;
    });

    return {
      isin,
      tradingSessionId,
      scoreDelta,
      fundamentalScoreDelta,
      technicalScoreDelta,
      activeFactorDeltas,
      isTriggered,
      triggerReason,
    };
  }

  /**
   * Pure helper to compare two raw FactorScore arrays directly.
   */
  public static compareFactorArrays(
    currentFactors: FactorScore[],
    previousFactors: FactorScore[]
  ): SubFactorDelta[] {
    if (!currentFactors || !previousFactors) return [];

    const prevMap = new Map<string, FactorScore>();
    previousFactors.forEach((f) => {
      if (f && f.name) prevMap.set(f.name.trim().toLowerCase(), f);
    });

    const result: SubFactorDelta[] = [];
    currentFactors.forEach((currF) => {
      if (!currF || !currF.name) return;
      const prevF = prevMap.get(currF.name.trim().toLowerCase());

      const prevScore = prevF?.score !== undefined ? prevF.score : null;
      const currScore = currF.score !== undefined ? currF.score : null;

      if (prevScore !== null && currScore !== null && prevScore !== currScore) {
        const delta = currScore - prevScore;
        result.push({
          name: currF.name,
          category: currF.category,
          previousScore: prevScore,
          currentScore: currScore,
          scoreDelta: delta,
          previousRawValue: prevF?.rawValue ?? null,
          currentRawValue: currF.rawValue ?? null,
          explanation: `${currF.name} score shifted from ${prevScore} to ${currScore} (${delta > 0 ? '+' : ''}${delta} pts).`,
        });
      }
    });

    return result;
  }
}
