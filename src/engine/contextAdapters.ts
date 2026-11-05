/**
 * STOCKINSIGHT V2.0 Context Engine Pure Input Adapters
 * Specification Status: LOCKED FOR IMPLEMENTATION
 * Date: September 28, 2026
 * 
 * Strict Invariants:
 * 1. PURE MAPPING ONLY: Zero score recalculations or level mutations.
 * 2. NULL SAFETY: Missing analytical data remains null with state 'MISSING'.
 * 3. NO ZERO COERCION: null/undefined are NEVER coerced to 0 or 0.0.
 * 4. POSITION DECOUPLING: Position data is quarantined and never alters stock analysis.
 * 5. ETF SAFETY: ETFs are identified and fundamental status preserved as NOT_APPLICABLE.
 */

import { StockInsightEvaluation, FactorScore } from '../types/engine';
import { HoldingWithEvaluation } from '../types/portfolio';
import {
  ContextInput,
  PositionContextInput,
  ValuationEvidenceInput,
  MomentumEvidenceInput,
  TechnicalEvidenceInput,
  PriceStructureEvidenceInput,
  IntegrityEvidenceInput,
  SafetyEvidenceInput,
  ContextDataState,
} from '../types/context';

export class ContextInputAdapter {
  /**
   * Pure mapping from authoritative StockInsightEvaluation to ContextInput.
   * Preserves all scores, values, and states without recalculating them.
   */
  public static fromEvaluation(evaluation: StockInsightEvaluation): ContextInput {
    const isETF =
      evaluation.sector === 'ETF' ||
      evaluation.instrumentType === 'ETF' ||
      evaluation.fundamentalStatus === 'NOT_APPLICABLE';

    // 1. Valuation Evidence Extraction
    const valuation = this.extractValuationEvidence(evaluation, isETF);

    // 2. Momentum Evidence Extraction
    const momentum = this.extractMomentumEvidence(evaluation);

    // 3. Technical Evidence Extraction
    const technicals = this.extractTechnicalEvidence(evaluation);

    // 4. Price Structure Evidence Extraction
    const priceStructure = this.extractPriceStructureEvidence(evaluation);

    // 5. Integrity Evidence Extraction
    const integrity: IntegrityEvidenceInput = {
      status: evaluation.integrity?.status ?? 'HOLD_PENDING_AUDIT',
      isQuarantined: evaluation.integrity?.status === 'QUARANTINED',
      reasons: evaluation.integrity?.reasons ? [...evaluation.integrity.reasons] : [],
    };

    // 6. Safety Evidence Extraction
    const safety: SafetyEvidenceInput = {
      accrualTrapPenaltyActive:
        (evaluation.fundamentalBuckets?.accrualTrapPenalty ?? 0) > 0,
      fundamentalFloorFailed:
        evaluation.safety?.fundamentalFloorFailed ?? false,
      highSlippageRisk: evaluation.safety?.highSlippageRisk ?? false,
    };

    return {
      symbol: evaluation.tradingSymbol,
      isin: evaluation.isin,
      sector: evaluation.sector,
      sectorName: evaluation.sectorName,
      instrumentType: evaluation.instrumentType,
      isETF,
      dataSource: evaluation.dataSource,
      fundamentalStatus: evaluation.fundamentalStatus,

      fundamentalScore: evaluation.fundamentalScore ?? null,
      technicalScore: evaluation.technicalScore ?? null,
      coreScore: evaluation.coreScore ?? null,
      decisionZone: evaluation.zone ?? 'UNKNOWN',
      decisionZoneReason: evaluation.zoneReason,

      valuation,
      momentum,
      technicals,
      priceStructure,
      integrity,
      safety,

      evaluatedAt: evaluation.evaluatedAt,
    };
  }

  private static extractValuationEvidence(
    evaluation: StockInsightEvaluation,
    isETF: boolean
  ): ValuationEvidenceInput {
    if (isETF) {
      return {
        pe: null,
        pb: null,
        evEbitda: null,
        sectorPe: null,
        sectorPb: null,
        valuationBucketScore: null,
        state: 'NOT_APPLICABLE',
      };
    }

    const peFactor = this.findFactor(evaluation.fundamentalFactors, 'P/E');
    const pbFactor = this.findFactor(evaluation.fundamentalFactors, 'P/B');
    const evFactor = this.findFactor(evaluation.fundamentalFactors, 'EV/EBITDA');

    const pe = this.parseRawNumeric(peFactor?.rawValue);
    const pb = this.parseRawNumeric(pbFactor?.rawValue);
    const evEbitda = this.parseRawNumeric(evFactor?.rawValue);

    const bucketScore = evaluation.fundamentalBuckets?.valuationBucket ?? null;

    let state: ContextDataState = 'AVAILABLE';
    if (pe === null && pb === null && evEbitda === null) {
      state = 'MISSING';
    } else if (evaluation.dataSource === 'FALLBACK' || evaluation.dataSource === 'OFFLINE_MOCK') {
      state = 'DERIVED';
    }

    return {
      pe,
      pb,
      evEbitda,
      sectorPe: null, // Populated downstream if comparative sector data is passed
      sectorPb: null,
      valuationBucketScore: bucketScore,
      state,
    };
  }

  private static extractMomentumEvidence(
    evaluation: StockInsightEvaluation
  ): MomentumEvidenceInput {
    const rsiFactor = this.findFactor(evaluation.technicalFactors, 'RSI');
    const rocFactor = this.findFactor(evaluation.technicalFactors, 'ROC');

    const rsi14 = this.parseRawNumeric(rsiFactor?.rawValue);
    const roc20 = this.parseRawNumeric(rocFactor?.rawValue);

    let state: ContextDataState = 'AVAILABLE';
    if (rsi14 === null && roc20 === null) {
      state = 'MISSING';
    }

    return {
      rsi14,
      roc20,
      state,
    };
  }

  private static extractTechnicalEvidence(
    evaluation: StockInsightEvaluation
  ): TechnicalEvidenceInput {
    const ema200Factor = this.findFactor(evaluation.technicalFactors, '200-EMA') || this.findFactor(evaluation.technicalFactors, '200');
    const sma100Factor = this.findFactor(evaluation.technicalFactors, '100-DMA') || this.findFactor(evaluation.technicalFactors, '100');
    const stackFactor = this.findFactor(evaluation.technicalFactors, 'Alignment Stack') || this.findFactor(evaluation.technicalFactors, 'Stack');
    const volAccFactor = this.findFactor(evaluation.technicalFactors, 'Volume Accumulation');
    const breakoutFactor = this.findFactor(evaluation.technicalFactors, 'Breakout Volume');

    const ema200 = this.parseRawNumeric(ema200Factor?.rawValue);
    const sma100 = this.parseRawNumeric(sma100Factor?.rawValue);

    const maStackAligned = stackFactor ? (stackFactor.score > 0) : null;
    const volumeAccumulationScore = volAccFactor?.score ?? null;
    const breakoutVolumeScore = breakoutFactor?.score ?? null;
    const volumeVetoApplied = evaluation.technicalBuckets?.volumeVetoApplied ?? false;

    let state: ContextDataState = 'AVAILABLE';
    if (ema200 === null && sma100 === null) {
      state = 'MISSING';
    }

    return {
      ema200,
      sma100,
      sma50: null, // intermediate reference within Stack
      maStackAligned,
      volumeAccumulationScore,
      breakoutVolumeScore,
      volumeVetoApplied,
      state,
    };
  }

  private static extractPriceStructureEvidence(
    evaluation: StockInsightEvaluation
  ): PriceStructureEvidenceInput {
    const ps = evaluation.priceStructure;
    const ltp = evaluation.execution?.ltp ?? null;
    const maxEntry = evaluation.execution?.maxEntry ?? null;

    if (!ps) {
      return {
        ltp,
        e1: null,
        e2: null,
        e3: null,
        s1: evaluation.execution?.stopLoss ?? null,
        s2: null,
        s3: null,
        t1: evaluation.execution?.target ?? null,
        t2: null,
        t3: null,
        atr14: null,
        maxEntry,
        state: 'UNAVAILABLE',
      };
    }

    return {
      ltp,
      e1: ps.entries?.e1?.price ?? null,
      e2: ps.entries?.e2?.price ?? null,
      e3: ps.entries?.e3?.price ?? null,
      s1: ps.stops?.s1?.price ?? ps.stopLoss?.price ?? evaluation.execution?.stopLoss ?? null,
      s2: ps.stops?.s2?.price ?? null,
      s3: ps.stops?.s3?.price ?? null,
      t1: ps.targets?.t1?.price ?? null,
      t2: ps.targets?.t2?.price ?? null,
      t3: ps.targets?.t3?.price ?? null,
      atr14: ps.metadata?.atr14 ?? null,
      maxEntry,
      state: 'AVAILABLE',
    };
  }

  private static findFactor(factors: FactorScore[] | undefined, keyword: string): FactorScore | undefined {
    if (!factors || !Array.isArray(factors)) return undefined;
    const kw = keyword.toLowerCase();
    return factors.find((f) => f.name.toLowerCase().includes(kw));
  }

  private static parseRawNumeric(val: string | number | null | undefined): number | null {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') {
      return isNaN(val) ? null : val;
    }
    if (typeof val === 'string') {
      let str = val.trim();
      if (str === '' || str === 'N/A' || str === '-' || str === 'null' || str === 'undefined') {
        return null;
      }
      // If there's a label prefix with colon (e.g. "EMA: 3498.5" or "200-EMA: 3498.5"), take part after colon
      if (str.includes(':')) {
        str = str.split(':').pop()!.trim();
      }
      // Strip currency, commas, percent, trailing 'x' (multiples), etc.
      const cleaned = str.replace(/[₹,%xX\s]/g, '').trim();
      if (cleaned === '') return null;
      const num = Number(cleaned);
      if (!isNaN(num)) return num;
      // Fallback regex match for any standalone numeric sequence
      const match = cleaned.match(/-?\d+(?:\.\d+)?/);
      if (!match) return null;
      const parsed = Number(match[0]);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }
}

export class PositionContextAdapter {
  /**
   * Pure mapping from HoldingWithEvaluation or standalone holding state to PositionContextInput.
   * Enforces strict isolation of portfolio metrics from core analytical indicators.
   */
  public static fromHoldingWithEvaluation(item: HoldingWithEvaluation | null | undefined): PositionContextInput {
    if (!item || !item.holding || item.holding.quantity <= 0) {
      return {
        is_held: false,
        symbol: item?.holding?.symbol ?? '',
        quantity: null,
        averageBuyPrice: null,
        currentLtp: item?.currentLtp ?? null,
        investedValue: null,
        currentValue: null,
        pnl: null,
        pnlPct: null,
        stopLoss: null,
        stopBreached: false,
        accrualTrapGain: false,
      };
    }

    return {
      is_held: true,
      symbol: item.holding.symbol,
      quantity: item.holding.quantity,
      averageBuyPrice: item.holding.averageBuyPrice,
      currentLtp: item.currentLtp,
      investedValue: item.investedValue,
      currentValue: item.currentValue,
      pnl: item.pnl,
      pnlPct: item.pnlPercentage,
      stopLoss: item.stopLoss,
      stopBreached: item.stopBreached ?? false,
      accrualTrapGain: item.accrualTrapGain ?? false,
    };
  }
}
