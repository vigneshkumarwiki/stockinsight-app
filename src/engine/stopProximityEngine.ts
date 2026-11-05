/**
 * STOCKINSIGHT V2.2 Position Stop Proximity & Capital-at-Risk Engine (F-03)
 * 
 * Strict Invariants:
 * 1. Pure deterministic Model D structural stop (S1) geometric calculations.
 * 2. Exact Mathematical Formulas:
 *    - StopDistancePct = ((LTP - S1) / LTP) * 100
 *    - StopDistanceATR = (LTP - S1) / ATR14
 * 3. Proximity State Precedence:
 *    - BREACHED:    LTP <= S1 (boundary: LTP === S1 -> BREACHED)
 *    - BUFFER_ZONE: LTP > S1 && LTP <= S1 + (0.50 * ATR14) (boundary: LTP === S1 + 0.50 * ATR14 -> BUFFER_ZONE)
 *    - STOP_INTACT: LTP > S1 + (0.50 * ATR14)
 * 4. Held Position Invariant: Only positions with quantity > 0 and resolved quote contribute to Capital in Buffer Zone.
 * 5. Terminology Invariant: "Capital in Buffer Zone" (NEVER "predicted loss" or "expected loss").
 * 6. Zero null-to-zero coercions; missing values strictly evaluate to null.
 */

import { HoldingWithEvaluation } from '../types/portfolio';
import { StockInsightEvaluation } from '../types/engine';

export type StopProximityState = 'BREACHED' | 'BUFFER_ZONE' | 'STOP_INTACT';

export interface PositionStopProximity {
  isHeld: boolean;
  ltp: number | null;
  s1: number | null;
  atr14: number | null;
  stopDistancePct: number | null;
  stopDistanceATR: number | null;
  proximityState: StopProximityState | null;
}

export interface PortfolioBufferResult {
  resolvedCapital: number;
  bufferHoldingsCount: number;
  capitalInBufferZone: number;
  capitalInBufferZonePct: number;
  breachedHoldingsCount: number;
  bufferSymbols: string[];
}

export class StopProximityEngine {
  /**
   * Evaluates exact stop proximity metrics for a single stock / holding.
   */
  public static evaluatePosition(params: {
    ltp: number | null | undefined;
    s1: number | null | undefined;
    atr14: number | null | undefined;
    isHeld?: boolean;
    quantity?: number | null | undefined;
  }): PositionStopProximity {
    const { ltp, s1, atr14, isHeld = true, quantity } = params;

    const actualIsHeld = quantity !== undefined && quantity !== null ? quantity > 0 : isHeld;

    if (
      ltp === null ||
      ltp === undefined ||
      ltp <= 0 ||
      s1 === null ||
      s1 === undefined ||
      s1 <= 0 ||
      atr14 === null ||
      atr14 === undefined ||
      atr14 <= 0
    ) {
      return {
        isHeld: actualIsHeld,
        ltp: ltp ?? null,
        s1: s1 ?? null,
        atr14: atr14 ?? null,
        stopDistancePct: null,
        stopDistanceATR: null,
        proximityState: null,
      };
    }

    // Stop distance formulas
    const stopDistancePct = ((ltp - s1) / ltp) * 100;
    const stopDistanceATR = (ltp - s1) / atr14;

    // Precedence Evaluation
    let proximityState: StopProximityState = 'STOP_INTACT';
    if (ltp <= s1) {
      proximityState = 'BREACHED';
    } else if (ltp <= s1 + 0.50 * atr14) {
      proximityState = 'BUFFER_ZONE';
    } else {
      proximityState = 'STOP_INTACT';
    }

    return {
      isHeld: actualIsHeld,
      ltp,
      s1,
      atr14,
      stopDistancePct: Number(stopDistancePct.toFixed(2)),
      stopDistanceATR: Number(stopDistanceATR.toFixed(2)),
      proximityState,
    };
  }

  /**
   * Helper extracting S1 and ATR14 from a StockInsightEvaluation.
   */
  public static extractStopParameters(
    evaluation: StockInsightEvaluation | null | undefined,
    currentLtp?: number | null
  ): { s1: number | null; atr14: number | null; ltp: number | null } {
    if (!evaluation) {
      return { s1: null, atr14: null, ltp: currentLtp ?? null };
    }

    const ltp = currentLtp ?? evaluation.execution?.ltp ?? null;
    const s1 =
      evaluation.priceStructure?.stops?.s1?.price ??
      evaluation.priceStructure?.stopLoss?.price ??
      evaluation.execution?.stopLoss ??
      null;

    const atr14 =
      evaluation.priceStructure?.metadata?.atr14 ??
      null;

    return { s1, atr14, ltp };
  }

  /**
   * Aggregates portfolio-level Capital in Buffer Zone across holdings.
   */
  public static evaluatePortfolioBuffer(items: HoldingWithEvaluation[]): PortfolioBufferResult {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return {
        resolvedCapital: 0,
        bufferHoldingsCount: 0,
        capitalInBufferZone: 0,
        capitalInBufferZonePct: 0,
        breachedHoldingsCount: 0,
        bufferSymbols: [],
      };
    }

    let resolvedCapital = 0;
    let bufferHoldingsCount = 0;
    let capitalInBufferZone = 0;
    let breachedHoldingsCount = 0;
    const bufferSymbols: string[] = [];

    items.forEach((item) => {
      const holding = item.holding;
      const quantity = holding.quantity;
      const isResolved =
        item.quoteStatus === 'RESOLVED' &&
        item.currentLtp !== null &&
        item.currentLtp !== undefined &&
        item.currentLtp > 0;

      if (!isResolved || quantity <= 0) {
        return;
      }

      const currentVal = quantity * item.currentLtp!;
      resolvedCapital += currentVal;

      const { s1, atr14, ltp } = this.extractStopParameters(item.evaluation, item.currentLtp);
      const prox = this.evaluatePosition({
        ltp,
        s1,
        atr14,
        quantity,
      });

      if (prox.proximityState === 'BREACHED') {
        breachedHoldingsCount += 1;
      } else if (prox.proximityState === 'BUFFER_ZONE') {
        bufferHoldingsCount += 1;
        capitalInBufferZone += currentVal;
        bufferSymbols.push(holding.symbol.toUpperCase());
      }
    });

    const capitalInBufferZonePct =
      resolvedCapital > 0
        ? Number(((capitalInBufferZone / resolvedCapital) * 100).toFixed(1))
        : 0;

    return {
      resolvedCapital,
      bufferHoldingsCount,
      capitalInBufferZone,
      capitalInBufferZonePct,
      breachedHoldingsCount,
      bufferSymbols: bufferSymbols.sort(),
    };
  }
}
