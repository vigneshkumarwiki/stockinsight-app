/**
 * STOCKINSIGHT V1.1 Three-Chain Horizon Engine
 * Calculates horizon-specific condition scores (SHORT, MEDIUM, LONG) and decision zones.
 * Pure, deterministic, side-effect free, position-independent.
 */

import {
  DecisionZone,
  Horizon,
  HorizonConditionScore,
  HorizonThresholds,
  InstrumentType,
  SectorClassification,
} from '../types/engine';

export interface HorizonEngineInput {
  fundamentalScore: number; // 0 - 50
  technicalScore: number;   // 0 - 50
  assetType?: InstrumentType | SectorClassification | string;
  isETF?: boolean;
  thresholds?: HorizonThresholds;
}

export class HorizonEngine {
  // Calibrated V1.2 Short Default Thresholds
  public static readonly DEFAULT_SHORT_CAUTION_THRESHOLD = 37;
  public static readonly DEFAULT_SHORT_FAVORABLE_THRESHOLD = 65;

  // Locked V1 Medium Default Thresholds (Frozen Baseline Anchor)
  public static readonly DEFAULT_MEDIUM_CAUTION_THRESHOLD = 39;
  public static readonly DEFAULT_MEDIUM_FAVORABLE_THRESHOLD = 68;

  // Calibrated V1.2 Long Default Thresholds
  public static readonly DEFAULT_LONG_CAUTION_THRESHOLD = 40;
  public static readonly DEFAULT_LONG_FAVORABLE_THRESHOLD = 68;

  /**
   * Evaluates all three horizon condition scores (SHORT, MEDIUM, LONG)
   */
  public static evaluate(input: HorizonEngineInput): {
    SHORT: HorizonConditionScore;
    MEDIUM: HorizonConditionScore;
    LONG: HorizonConditionScore;
  } {
    const isETF =
      input.isETF === true ||
      input.assetType === 'ETF' ||
      input.assetType === 'ETF';

    const thresholds: HorizonThresholds = {
      shortCautionThreshold:
        input.thresholds?.shortCautionThreshold ?? HorizonEngine.DEFAULT_SHORT_CAUTION_THRESHOLD,
      shortFavorableThreshold:
        input.thresholds?.shortFavorableThreshold ?? HorizonEngine.DEFAULT_SHORT_FAVORABLE_THRESHOLD,
      mediumCautionThreshold:
        input.thresholds?.mediumCautionThreshold ?? HorizonEngine.DEFAULT_MEDIUM_CAUTION_THRESHOLD,
      mediumFavorableThreshold:
        input.thresholds?.mediumFavorableThreshold ?? HorizonEngine.DEFAULT_MEDIUM_FAVORABLE_THRESHOLD,
      longCautionThreshold:
        input.thresholds?.longCautionThreshold ?? HorizonEngine.DEFAULT_LONG_CAUTION_THRESHOLD,
      longFavorableThreshold:
        input.thresholds?.longFavorableThreshold ?? HorizonEngine.DEFAULT_LONG_FAVORABLE_THRESHOLD,
    };

    const shortScore = HorizonEngine.calculateScore('SHORT', input.fundamentalScore, input.technicalScore, isETF);
    const mediumScore = HorizonEngine.calculateScore('MEDIUM', input.fundamentalScore, input.technicalScore, isETF);
    const longScore = HorizonEngine.calculateScore('LONG', input.fundamentalScore, input.technicalScore, isETF);

    return {
      SHORT: HorizonEngine.resolveHorizonResult('SHORT', shortScore, isETF, thresholds.shortCautionThreshold, thresholds.shortFavorableThreshold),
      MEDIUM: HorizonEngine.resolveHorizonResult('MEDIUM', mediumScore, isETF, thresholds.mediumCautionThreshold, thresholds.mediumFavorableThreshold),
      LONG: HorizonEngine.resolveHorizonResult('LONG', longScore, isETF, thresholds.longCautionThreshold, thresholds.longFavorableThreshold),
    };
  }

  /**
   * Computes raw horizon score (0 - 100)
   */
  public static calculateScore(
    horizon: Horizon,
    fundamentalScore: number,
    technicalScore: number,
    isETF: boolean
  ): number {
    const f = Math.max(0, Math.min(50, fundamentalScore));
    const t = Math.max(0, Math.min(50, technicalScore));

    if (isETF) {
      // ETF Horizon Score = TechnicalScore * 2
      const rawEtfScore = t * 2;
      return Math.round(rawEtfScore * 10000) / 10000;
    }

    let rawScore = 0;
    switch (horizon) {
      case 'SHORT':
        // Short: 2 * (0.30 * F + 0.70 * T)
        rawScore = 2 * (0.30 * f + 0.70 * t);
        break;
      case 'MEDIUM':
        // Medium: 2 * (0.50 * F + 0.50 * T) = F + T
        rawScore = f + t;
        break;
      case 'LONG':
        // Long: 2 * (0.70 * F + 0.30 * T)
        rawScore = 2 * (0.70 * f + 0.30 * t);
        break;
    }

    const clamped = Math.max(0, Math.min(100, rawScore));
    return Math.round(clamped * 10000) / 10000;
  }

  /**
   * Resolves decision zone and zoneReason for a horizon score
   */
  private static resolveHorizonResult(
    horizon: Horizon,
    score: number,
    isETF: boolean,
    cautionThreshold?: number,
    favorableThreshold?: number
  ): HorizonConditionScore {
    const etfNote = isETF ? 'ETF — Technical-only score; Fundamental not applicable.' : undefined;

    // Check if thresholds are provided/calibrated for this horizon
    if (cautionThreshold === undefined || favorableThreshold === undefined) {
      // Uncalibrated state for SHORT or LONG when thresholds are omitted
      const reason = etfNote
        ? `${etfNote} Uncalibrated threshold — ${horizon.toLowerCase()} horizon threshold calibration pending.`
        : `Uncalibrated threshold — ${horizon.toLowerCase()} horizon threshold calibration pending.`;

      return {
        horizon,
        score,
        zone: 'HOLD',
        zoneReason: reason,
      };
    }

    let zone: DecisionZone = 'CAUTION';
    let baseReason = '';

    if (score >= favorableThreshold) {
      zone = 'FAVORABLE';
      baseReason = `Favorable ${horizon.toLowerCase()} horizon condition score (>= ${favorableThreshold})`;
    } else if (score >= cautionThreshold) {
      zone = 'HOLD';
      baseReason = `Hold ${horizon.toLowerCase()} horizon condition score (${cautionThreshold} - ${favorableThreshold})`;
    } else {
      zone = 'CAUTION';
      baseReason = `Caution ${horizon.toLowerCase()} horizon condition score (< ${cautionThreshold})`;
    }

    const zoneReason = etfNote ? `${etfNote} ${baseReason}` : baseReason;

    return {
      horizon,
      score,
      zone,
      zoneReason,
    };
  }
}
