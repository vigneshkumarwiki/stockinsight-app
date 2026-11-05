/**
 * STOCKINSIGHT V2.1 Portfolio Quality Tilt & Capital Exposure Engine (F-02)
 * 
 * Strict Invariants:
 * 1. Pure deterministic portfolio-level aggregation over HoldingWithEvaluation[].
 * 2. CurrentValue = quantity * live LTP ONLY when quoteStatus === 'RESOLVED'.
 * 3. Unresolved quotes evaluate to null currentValue and do NOT contribute to percentage denominators.
 * 4. Zero null-to-zero coercions; missing capital is never coerced to 0 or averageBuyPrice.
 * 5. Locked Relationship Priority Mapping:
 *    - P1 + P2: Leadership (P1/P2)
 *    - P3: Consolidation (P3)
 *    - P4: ETF (P4)
 *    - P5: Divergence/Risk (P5)
 * 6. Attention Driver clustering for primaryAttentionDriver !== 'NONE'.
 * 7. ZERO feedback into stock-level fundamental, technical, or core scores.
 */

import { HoldingWithEvaluation } from '../types/portfolio';
import {
  RelationshipPriority,
  AttentionDriverType,
  AttentionLevel,
} from '../types/context';
import { ContextInputAdapter, PositionContextAdapter } from './contextAdapters';
import {
  classifyFundamentalCondition,
  classifyTechnicalCondition,
  classifyPriceLocation,
} from './contextClassifiers';
import { evaluateRelationship } from './contextRelationships';
import { evaluateAttention } from './contextAttention';

export type QualityTiltGroupKey = 'P1_P2' | 'P3' | 'P4' | 'P5';

export interface QualityTiltBucket {
  key: QualityTiltGroupKey;
  label: string;
  holdingCount: number;
  investedValue: number;
  currentValue: number;
  capitalWeightPct: number; // 0.0 to 100.0%
  symbols: string[];
}

export interface AttentionDriverExposure {
  driver: AttentionDriverType;
  label: string;
  severity: AttentionLevel;
  holdingCount: number;
  capitalAmount: number;
  capitalWeightPct: number;
  symbols: string[];
}

export interface PortfolioQualityTiltResult {
  resolvedCapital: number;
  totalInvested: number;
  unresolvedCapitalCount: number;
  tiltBuckets: Record<QualityTiltGroupKey, QualityTiltBucket>;
  driverExposures: AttentionDriverExposure[];
}

const DRIVER_LABELS: Record<AttentionDriverType, { label: string; severity: AttentionLevel }> = {
  CRITICAL_STOP_BREACH: { label: 'Critical Stop Breach', severity: 'CRITICAL' },
  DATA_QUARANTINE: { label: 'Data Quarantine', severity: 'CRITICAL' },
  STOP_APPROACHING: { label: 'Stop Approaching Buffer', severity: 'HIGH_ATTENTION' },
  DATA_INSUFFICIENT: { label: 'Data Insufficient', severity: 'HIGH_ATTENTION' },
  ACCRUAL_TRAP: { label: 'Accrual Disconnect Warning', severity: 'WATCH' },
  PRICE_EXTENDED: { label: 'Price Extended', severity: 'WATCH' },
  ANALYTICAL_DIVERGENCE: { label: 'Analytical Divergence', severity: 'WATCH' },
  NONE: { label: 'Balanced / Normal', severity: 'NORMAL' },
};

export class QualityTiltEngine {
  /**
   * Evaluates portfolio-level capital allocation and attention driver exposures across holdings.
   * 
   * @param items Array of analyzed HoldingWithEvaluation items
   */
  public static evaluate(items: HoldingWithEvaluation[]): PortfolioQualityTiltResult {
    const defaultBuckets: Record<QualityTiltGroupKey, QualityTiltBucket> = {
      P1_P2: {
        key: 'P1_P2',
        label: 'Favorable Zone',
        holdingCount: 0,
        investedValue: 0,
        currentValue: 0,
        capitalWeightPct: 0,
        symbols: [],
      },
      P3: {
        key: 'P3',
        label: 'Hold / Consolidating',
        holdingCount: 0,
        investedValue: 0,
        currentValue: 0,
        capitalWeightPct: 0,
        symbols: [],
      },
      P4: {
        key: 'P4',
        label: 'ETFs & Index',
        holdingCount: 0,
        investedValue: 0,
        currentValue: 0,
        capitalWeightPct: 0,
        symbols: [],
      },
      P5: {
        key: 'P5',
        label: 'Caution / At Risk',
        holdingCount: 0,
        investedValue: 0,
        currentValue: 0,
        capitalWeightPct: 0,
        symbols: [],
      },
    };

    if (!items || items.length === 0) {
      return {
        resolvedCapital: 0,
        totalInvested: 0,
        unresolvedCapitalCount: 0,
        tiltBuckets: defaultBuckets,
        driverExposures: [],
      };
    }

    let resolvedCapital = 0;
    let totalInvested = 0;
    let unresolvedCapitalCount = 0;

    const driverMap = new Map<
      AttentionDriverType,
      { capitalAmount: number; count: number; symbols: Set<string> }
    >();

    // 1. Process each holding
    items.forEach((item) => {
      const holding = item.holding;
      const quantity = holding.quantity;
      const avgPrice = holding.averageBuyPrice;
      const invested = quantity * avgPrice;
      totalInvested += invested;

      const isResolved =
        item.quoteStatus === 'RESOLVED' &&
        item.currentLtp !== null &&
        item.currentLtp !== undefined &&
        item.currentLtp > 0;

      const currentVal = isResolved ? quantity * item.currentLtp! : null;

      if (isResolved && currentVal !== null) {
        resolvedCapital += currentVal;
      } else {
        unresolvedCapitalCount++;
      }

      // Resolve priority and bucket key deterministically
      const priorityInfo = QualityTiltEngine.getHoldingPriority(item);
      const bucket = defaultBuckets[priorityInfo.bucketKey];
      bucket.holdingCount++;
      bucket.investedValue += invested;
      bucket.symbols.push(holding.symbol.toUpperCase());
      if (currentVal !== null) {
        bucket.currentValue += currentVal;
      }

      // Attention Driver clustering
      if (item.evaluation) {
        const contextInput = ContextInputAdapter.fromEvaluation(item.evaluation);
        const positionInput = PositionContextAdapter.fromHoldingWithEvaluation(item);
        const fundCondition = classifyFundamentalCondition(contextInput);
        const techCondition = classifyTechnicalCondition(contextInput);
        const relationship = evaluateRelationship(fundCondition, techCondition);
        const priceLoc = classifyPriceLocation(contextInput);
        const attention = evaluateAttention(contextInput, positionInput, relationship, priceLoc);

        if (attention.primaryDriver && attention.primaryDriver !== 'NONE') {
          if (!driverMap.has(attention.primaryDriver)) {
            driverMap.set(attention.primaryDriver, { capitalAmount: 0, count: 0, symbols: new Set() });
          }
          const cluster = driverMap.get(attention.primaryDriver)!;
          cluster.count++;
          cluster.symbols.add(holding.symbol.toUpperCase());
          if (currentVal !== null) {
            cluster.capitalAmount += currentVal;
          }
        }
      }
    });

    // 2. Compute Capital Weight Percentages based strictly on resolved capital
    if (resolvedCapital > 0) {
      Object.values(defaultBuckets).forEach((b) => {
        b.capitalWeightPct = Number(((b.currentValue / resolvedCapital) * 100).toFixed(1));
      });
    }

    // 3. Format Attention Driver Exposures
    const driverExposures: AttentionDriverExposure[] = [];
    driverMap.forEach((data, driver) => {
      const info = DRIVER_LABELS[driver] || { label: driver, severity: 'WATCH' as AttentionLevel };
      const weightPct = resolvedCapital > 0 ? Number(((data.capitalAmount / resolvedCapital) * 100).toFixed(1)) : 0;
      driverExposures.push({
        driver,
        label: info.label,
        severity: info.severity,
        holdingCount: data.count,
        capitalAmount: data.capitalAmount,
        capitalWeightPct: weightPct,
        symbols: Array.from(data.symbols).sort(),
      });
    });

    // Sort driver exposures by severity/capital descending
    driverExposures.sort((a, b) => b.capitalAmount - a.capitalAmount);

    return {
      resolvedCapital,
      totalInvested,
      unresolvedCapitalCount,
      tiltBuckets: defaultBuckets,
      driverExposures,
    };
  }

  /**
   * Resolves the macro Quant Zone and QualityTiltGroupKey for a single holding.
   */
  public static getHoldingPriority(item: HoldingWithEvaluation): {
    priority: RelationshipPriority;
    bucketKey: QualityTiltGroupKey;
    label: string;
    archetype?: string;
  } {
    const isETF =
      item.holding.sector === 'ETF' ||
      item.evaluation?.sector === 'ETF' ||
      item.evaluation?.fundamentalStatus === 'NOT_APPLICABLE';

    if (isETF) {
      return {
        priority: 'P4',
        bucketKey: 'P4',
        label: 'ETFs & Index',
        archetype: 'ETF_CORE',
      };
    }

    let relPriority: RelationshipPriority = 'P3';
    let archetype: string | undefined = undefined;

    if (item.evaluation) {
      const contextInput = ContextInputAdapter.fromEvaluation(item.evaluation);
      const fundCondition = classifyFundamentalCondition(contextInput);
      const techCondition = classifyTechnicalCondition(contextInput);
      const relationship = evaluateRelationship(fundCondition, techCondition);
      relPriority = relationship.priority;
      archetype = relationship.archetype;
    }

    // 1. CAUTION Zone, Stop Breaches, or P1 (Extreme Risk / Breakdown / Deteriorating) -> Caution / At Risk
    if (
      item.zone === 'CAUTION' ||
      item.stopBreached ||
      item.actionBadge === 'QUARANTINED' ||
      relPriority === 'P1'
    ) {
      return {
        priority: 'P1',
        bucketKey: 'P5',
        label: 'Caution / At Risk',
        archetype: archetype || 'CAUTION_PROFILE',
      };
    }

    // 2. FAVORABLE Zone or P2 (Aligned Leadership) -> Favorable Zone
    if (item.zone === 'FAVORABLE' || relPriority === 'P2') {
      return {
        priority: 'P2',
        bucketKey: 'P1_P2',
        label: 'Favorable Zone',
        archetype: archetype || 'ALIGNED_HIGH_QUALITY',
      };
    }

    // 3. Normal / Base-building / Neutral -> Hold / Consolidating
    return {
      priority: 'P3',
      bucketKey: 'P3',
      label: 'Hold / Consolidating',
      archetype: archetype || 'STABLE_CONSOLIDATION',
    };
  }
}
