/**
 * Decoupled Execution Layer
 * Computes Dynamic Structural Stops, Minimum R:R Corridors, Anti-Stop Compression, and Pullback Limits
 * Enforces Layer 4: Anti-Gaming Execution Guards (Floor >= 1.5 * ATR_14, Bid-Ask Spread Filter > 0.40%)
 */

import { ExecutionCorridor, ExecutionStatus } from '../types/engine';
import { TechnicalCalculations } from './calculators/technical';

export class ExecutionEngine {
  /**
   * Computes the trade corridor and execution actionability
   */
  public static evaluate(
    techCalcs: TechnicalCalculations,
    upperCircuitLimit?: number,
    lowerCircuitLimit?: number,
    isStrategyBalanced: boolean = true,
    bestBid?: number | null,
    bestAsk?: number | null,
    isQuarantined: boolean = false
  ): ExecutionCorridor {
    const ltp = techCalcs.ltp;
    if (ltp <= 0) {
      return {
        status: 'DATA_UNAVAILABLE',
        ltp: null,
        stopLoss: null,
        target: null,
        maxEntry: null,
        minimumRR: isStrategyBalanced ? 2.0 : 1.5,
        twentyDayTurnoverCr: 0,
        circuitLower: 0,
        circuitUpper: 0,
        distanceToMaxEntryPct: 0,
        bidAskSpreadPct: 0,
        highSlippageRisk: false,
        antiStopCompressionApplied: false,
        minAllowedStopDistance: 0,
      };
    }
    const circuitUpper = upperCircuitLimit || ltp * 1.20;
    const circuitLower = lowerCircuitLimit || ltp * 0.80;
    const turnover20DCr = techCalcs.turnover20DCr;

    // Minimum R:R requirements
    const minimumRR = isStrategyBalanced ? 2.0 : 1.5;

    // 1. Dynamic Stop Loss with Anti-Stop Compression Floor
    const atr14 = techCalcs.atr14 || ltp * 0.02;
    const minAllowedStopDistance = 1.5 * atr14;
    const atrStop = ltp - 2 * atr14;

    // Anchor primarily to 10-bar Swing Low; fallback to 2 * ATR
    let stopLoss = techCalcs.swingLow10 !== null ? techCalcs.swingLow10 : atrStop;
    let antiStopCompressionApplied = false;

    // Anti-Stop Compression Guard: Stop distance must NEVER be less than 1.5 * ATR_14
    if (ltp - stopLoss < minAllowedStopDistance) {
      stopLoss = ltp - minAllowedStopDistance;
      antiStopCompressionApplied = true;
    }

    if (stopLoss >= ltp || stopLoss <= 0) {
      stopLoss = ltp * 0.95; // Safe default floor
    }

    // 2. Structural Target
    const target = ltp + Math.max(3 * atr14, ltp * 0.08);

    // 3. Pullback Max Entry Corridor Equation
    // Max Entry = (Target + R_min * Stop) / (1 + R_min)
    const maxEntry = (target + minimumRR * stopLoss) / (1 + minimumRR);
    const distanceToMaxEntryPct = ((ltp - maxEntry) / maxEntry) * 100;

    // 4. Bid-Ask Spread & Slippage Filter
    let bidAskSpreadPct = 0;
    let highSlippageRisk = false;
    if (
      bestBid !== null &&
      bestBid !== undefined &&
      bestBid > 0 &&
      bestAsk !== null &&
      bestAsk !== undefined &&
      bestAsk > 0 &&
      bestAsk >= bestBid &&
      ltp > 0
    ) {
      const spread = bestAsk - bestBid;
      bidAskSpreadPct = (spread / ltp) * 100;
      if (spread / ltp > 0.0040) { // Spread > 0.40%
        highSlippageRisk = true;
      }
    }

    // 5. Execution Guardrail State Machine
    let status: ExecutionStatus = 'READY_TO_BUY';

    if (isQuarantined) {
      status = 'REJECT_DATA_QUARANTINED';
    } else if (turnover20DCr < 5.0) {
      status = 'REJECT_LOW_LIQUIDITY';
    } else if (ltp >= circuitUpper * 0.995 || ltp <= circuitLower * 1.005) {
      status = 'REJECT_CIRCUIT_LOCKED';
    } else if (ltp > maxEntry) {
      status = 'EXTENDED_WAIT_FOR_PULLBACK';
    } else {
      status = 'READY_TO_BUY';
    }

    return {
      status,
      ltp,
      stopLoss,
      target,
      maxEntry,
      minimumRR,
      twentyDayTurnoverCr: turnover20DCr,
      circuitLower,
      circuitUpper,
      distanceToMaxEntryPct,
      bidAskSpreadPct,
      highSlippageRisk,
      antiStopCompressionApplied,
      minAllowedStopDistance,
    };
  }
}
