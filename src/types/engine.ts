/**
 * STOCKINSIGHT Institutional Engine Types & Data Contracts
 * Enhanced with 5 Production Integrity Layers
 */

export type DataState = 'AVAILABLE' | 'DERIVED' | 'MISSING' | 'NOT_APPLICABLE' | 'QUARANTINED';

export type ProfitGrowthState =
  | 'PROFIT_COMPOUNDING'
  | 'TURNAROUND_FROM_LOSS'
  | 'TURNAROUND_FROM_ZERO'
  | 'RECOVERY_TO_BREAKEVEN'
  | 'LOSS_REDUCTION'
  | 'LOSS_EXPANSION'
  | 'PERSISTENT_LOSS'
  | 'PROFIT_COLLAPSE'
  | 'ZERO_TO_LOSS'
  | 'FLAT_ZERO'
  | 'INSUFFICIENT_HISTORY'
  | 'MISSING';

export type VolumeAccumulationState =
  | 'NORMAL'
  | 'MAX_ACCUMULATION'
  | 'ZERO_VOLUME'
  | 'INSUFFICIENT_HISTORY'
  | 'MISSING';

export interface VolumeAccumulationResult {
  accumulationRatio: number | null;
  accumulationState: VolumeAccumulationState;
  breakoutVolumeRatio: number | null;
  displayValue: string | null;
}

export interface ProfitGrowthResult {
  state: ProfitGrowthState;
  cagr3YPct: number | null;
  patT: number | null;
  patTminus3: number | null;
  intermediateLoss: boolean;
  historyValues: number[];
  displayValue: string | null;
  explanation: string;
}

export interface MetricValue<T> {
  value: T | null;
  state: DataState;
  sourceEndpoint: string;
  notes?: string;
}

export type SectorClassification =
  | 'INDUSTRIAL'
  | 'COMMERCIAL_BANK'
  | 'NBFC_HFC'
  | 'ETF'
  | 'OTHER';

export type InstrumentType = 'EQUITY' | 'ETF' | 'BANK' | 'NBFC' | 'OTHER';

export type ValueProvenance =
  | 'PROVIDER_REPORTED'
  | 'DERIVED'
  | 'UNAVAILABLE'
  | 'COMPARISON_UNAVAILABLE';

export interface FactorScore {
  name: string;
  category: 'FUNDAMENTAL' | 'TECHNICAL';
  bucket?: string;
  weight: number;
  score: number; // 0 <= score <= weight
  rawValue: string | number | null;
  state: DataState;
  explanation: string;
  provenance?: ValueProvenance;
  sourceFields?: string[];
  formula?: string;
  reportingPeriod?: string;
  benchmarkValue?: string | number | null;
}

export interface DataIntegrityAudit {
  status: 'PASSED' | 'QUARANTINED' | 'STALE_FILING' | 'HOLD_PENDING_AUDIT' | 'FRESHNESS_UNVERIFIABLE';
  bsBalanced: boolean;
  bsDiscrepancyPct: number;
  cashFlowReconciled: boolean;
  freshnessDays: number;
  staleFiling: boolean;
  capitalAnomaly: boolean;
  reasons: string[];
}

export interface FundamentalBuckets {
  total: number;
  max: 50;
  valuationBucket: number;       // Capped at 12
  equityMultiples: number;        // Capped at 7 (P/E + P/B)
  enterpriseMultiples: number;    // Capped at 5 (EV/EBITDA)
  capitalEfficiencyBucket: number;// Capped at 12 (Industrial) / 18 (Bank)
  cashQualityBucket: number;      // 6 pts
  growthAndSolvencyBucket: number;// 20 pts
  accrualTrapPenalty: number;     // 5 pts deduction if high P/E/growth but 0 cash flow
}

export interface TechnicalBuckets {
  total: number;
  max: 50;
  trendRegimeBucket: number;      // Max 20 pts (200-EMA 10, 100-DMA 5, MA Stack 5)
  momentumBucket: number;         // Max 15 pts (RSI 10, 20D ROC 5)
  volumeAccumulationBucket: number;// Max 15 pts (Accumulation 8, Breakout 7)
  volumeVetoApplied: boolean;     // True if volume bucket < 5 capped tech score at 35
}

export interface SafetyFlags {
  cashDivergenceRedFlag: boolean;
  cyclicalPeakRisk: boolean;
  promoterPledgeRedFlag: boolean;
  promoterPledgePct: number;
  earningsShockRedFlag: boolean;
  latestQuarterlyNetProfitYoY: number | null;
  fundamentalFloorFailed: boolean;
  highSlippageRisk: boolean;
  bidAskSpreadPct: number;
  staleFilingRedFlag?: boolean;
  filingFreshnessDays?: number;
}

export type DecisionZone = 'FAVORABLE' | 'HOLD' | 'CAUTION';

export type ExecutionStatus =
  | 'READY_TO_BUY'
  | 'EXTENDED_WAIT_FOR_PULLBACK'
  | 'REJECT_LOW_LIQUIDITY'
  | 'REJECT_CIRCUIT_LOCKED'
  | 'REJECT_SAFETY_GATE'
  | 'REJECT_DATA_QUARANTINED'
  | 'DATA_UNAVAILABLE';

export interface ExecutionCorridor {
  status: ExecutionStatus;
  ltp: number | null;
  stopLoss: number | null;
  target: number | null;
  maxEntry: number | null;
  minimumRR: number;
  twentyDayTurnoverCr: number;
  circuitLower: number;
  circuitUpper: number;
  distanceToMaxEntryPct: number;
  bidAskSpreadPct: number;
  highSlippageRisk: boolean;
  antiStopCompressionApplied: boolean;
  minAllowedStopDistance: number;
}

export type DataSource =
  | 'UPSTOX_LIVE'
  | 'FALLBACK'
  | 'DEMO'
  | 'DATA_UNAVAILABLE'
  | 'UPSTOX_DATA_ERROR'
  | 'OFFLINE_MOCK';

export type FundamentalDataStatus = 'LIVE' | 'FALLBACK' | 'PARTIAL' | 'UNAVAILABLE' | 'NOT_APPLICABLE';

export type LevelClassification =
  | 'STRUCTURAL'
  | 'MATHEMATICAL_FALLBACK'
  | 'VOLATILITY_ONLY'
  | 'UNAVAILABLE';

export interface PriceStructureLevel {
  price: number | null;
  zoneMin?: number | null;
  zoneMax?: number | null;
  type: string;
  source: string;
  classification: LevelClassification;
  distancePct?: number | null;
}

export interface PriceStructureStopLoss {
  price: number | null;
  type: string;
  source: string;
  classification: 'STRUCTURAL_INVALIDATION' | 'ANTI_COMPRESSION_FLOOR' | 'SAFE_DEFAULT_FLOOR';
  buffer: number;
  distancePct: number;
}

export interface StructuralCandidateMetadata {
  type: string;
  price: number;
  zoneMin: number;
  zoneMax: number;
  touchCount: number;
  ageDays: number;
  volumeRatio: number;
  isOverhead: boolean;
}

export interface PriceStructure {
  entries: {
    e1: PriceStructureLevel;
    e2: PriceStructureLevel;
    e3: PriceStructureLevel;
  };
  stopLoss: PriceStructureStopLoss;
  stops?: {
    s1: PriceStructureLevel;
    s2: PriceStructureLevel;
    s3: PriceStructureLevel;
  };
  targets: {
    t1: PriceStructureLevel;
    t2: PriceStructureLevel;
    t3: PriceStructureLevel;
  };
  metadata: {
    atr14: number;
    supportCandidates: StructuralCandidateMetadata[];
    resistanceCandidates: StructuralCandidateMetadata[];
  };
}

// ==========================================
// V1.1 THREE-CHAIN HORIZON CONTRACTS
// ==========================================

export type Horizon = 'SHORT' | 'MEDIUM' | 'LONG';

export interface HorizonConditionScore {
  horizon: Horizon;
  score: number; // Normalized 0 - 100
  zone: DecisionZone;
  zoneReason?: string;
}

export interface HorizonGeometryPairing {
  entry: PriceStructureLevel;
  stop: PriceStructureLevel | PriceStructureStopLoss;
  target: PriceStructureLevel;
}

export interface HorizonEvaluation {
  horizon: Horizon;
  score: number;
  zone: DecisionZone;
  zoneReason?: string;
  geometry: HorizonGeometryPairing;
}

export interface HorizonThresholds {
  shortCautionThreshold?: number; // Calibrated V1.2 Default: 37
  shortFavorableThreshold?: number; // Calibrated V1.2 Default: 65
  mediumCautionThreshold: number; // Locked V1 Default: 39
  mediumFavorableThreshold: number; // Locked V1 Default: 68
  longCautionThreshold?: number; // Calibrated V1.2 Default: 40
  longFavorableThreshold?: number; // Calibrated V1.2 Default: 68
}

export interface StockInsightEvaluation {
  tradingSymbol: string;
  companyName: string;
  isin: string;
  instrumentKey: string;
  sector: SectorClassification;
  sectorName: string;
  instrumentType?: InstrumentType;
  dataSource: DataSource;
  dataSourceError?: string;
  fundamentalStatus?: FundamentalDataStatus;
  technicalStatus?: 'LIVE' | 'UNAVAILABLE';

  // Layer 1: Data Integrity Audit
  integrity: DataIntegrityAudit;

  // Layer 2 & 3: Bucketed Scores
  fundamentalBuckets: FundamentalBuckets;
  technicalBuckets: TechnicalBuckets;

  // Dual-Axis Core Scores
  fundamentalScore: number;
  technicalScore: number;
  coreScore: number; // Exact sum: 0 - 100

  // Decision & Floor
  zone: DecisionZone;
  zoneReason?: string;

  // Detailed Factor Breakdown
  fundamentalFactors: FactorScore[];
  technicalFactors: FactorScore[];

  // Institutional Gates
  safety: SafetyFlags;

  // Layer 4: Execution Corridor
  execution: ExecutionCorridor;

  // Layer 2: Price Structure
  priceStructure?: PriceStructure;

  // V1.1 Three-Chain Horizon Evaluation
  horizons?: {
    SHORT: HorizonEvaluation;
    MEDIUM: HorizonEvaluation;
    LONG: HorizonEvaluation;
  };

  netChange?: number;
  netChangePct?: number;
  dayHigh?: number;
  dayLow?: number;
  intradayVwap?: number;
  evaluatedAt: string;
}
