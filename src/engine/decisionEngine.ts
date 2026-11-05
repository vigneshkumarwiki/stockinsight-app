/**
 * Decision Engine
 * Computes Core Score (0-100), applies Fundamental Floor, Anti-Flicker Hysteresis, and Zones
 */

import { DecisionZone } from '../types/engine';

export interface DecisionResult {
  coreScore: number;
  fundamentalScore: number;
  technicalScore: number;
  zone: DecisionZone;
  zoneReason?: string;
  fundamentalFloorFailed: boolean;
}

export class DecisionEngine {
  /**
   * Computes authoritative decision zone
   * @param rawFundScore Raw fundamental score (0 - 50)
   * @param rawTechScore Raw technical score (0 - 50)
   * @param fundDeduction Deductions from safety gates (e.g. pledge or cash divergence)
   * @param hardHoldCap If safety gate prohibits FAVORABLE status
   * @param previousZone Optional previous zone for anti-flicker hysteresis
   */
  public static evaluate(
    rawFundScore: number,
    rawTechScore: number,
    fundDeduction: number = 0,
    hardHoldCap: boolean = false,
    safetyReasons: string[] = [],
    previousZone?: DecisionZone,
    isFundamentalUnavailable: boolean = false
  ): DecisionResult {
    // Apply deductions with floor of 0
    const fundamentalScore = Math.max(0, Math.min(50, rawFundScore - fundDeduction));
    const technicalScore = Math.max(0, Math.min(50, rawTechScore));

    // Core score is exact sum (0 - 100)
    const coreScore = fundamentalScore + technicalScore;

    let zone: DecisionZone = 'CAUTION';
    let zoneReason: string | undefined = undefined;
    let fundamentalFloorFailed = false;

    // 1. Check Hard Hold Cap from Institutional Safety Gates
    if (hardHoldCap) {
      zone = 'HOLD';
      zoneReason = safetyReasons.length > 0 ? safetyReasons.join('; ') : 'INSTITUTIONAL_SAFETY_GATE_TRIGGERED';
      return {
        coreScore,
        fundamentalScore,
        technicalScore,
        zone,
        zoneReason,
        fundamentalFloorFailed: false,
      };
    }

    // 2. Zone Evaluation with Hysteresis
    // If previously FAVORABLE, maintain unless drops strictly below 66
    const favorableThreshold = previousZone === 'FAVORABLE' ? 66 : 68;

    if (coreScore >= favorableThreshold) {
      // 3. Fundamental Floor Rule: Fundamental score must be >= 25 (applicable only when fundamentals are available)
      if (fundamentalScore < 25 && !isFundamentalUnavailable) {
        zone = 'HOLD';
        zoneReason = 'FUNDAMENTAL_FLOOR_FAILED: Strong momentum but weak fundamental support (< 25 pts)';
        fundamentalFloorFailed = true;
      } else {
        zone = 'FAVORABLE';
        zoneReason = 'Confluent fundamental quality and institutional momentum';
      }
    } else if (coreScore >= 39) {
      zone = 'HOLD';
      zoneReason = 'Neutral consolidation or incomplete structural alignment';
    } else {
      zone = 'CAUTION';
      zoneReason = isFundamentalUnavailable
        ? 'Fundamental data unavailable; caution advised due to missing financial statements'
        : 'Underperforming fundamentals or macro bearish technical regime';
    }

    return {
      coreScore,
      fundamentalScore,
      technicalScore,
      zone,
      zoneReason,
      fundamentalFloorFailed,
    };
  }
}
