/**
 * STOCKINSIGHT V2.0 Context Engine Canonical Types & Contracts
 * Specification Status: LOCKED FOR IMPLEMENTATION
 * Date: September 28, 2026
 * 
 * Strict Invariants:
 * 1. Missing != 0
 * 2. Missing != NOT_APPLICABLE
 * 3. Missing != UNAVAILABLE
 * 4. Zero null-to-zero conversions
 * 5. Position metrics have ZERO feedback into core analytical scores
 */

import {
  DataState,
  DecisionZone,
  DataSource,
  FundamentalDataStatus,
  SectorClassification,
  InstrumentType,
} from './engine';

// ============================================================
// 1. CANONICAL CONTEXT DIMENSIONS (7 CLOSED ENUM SETS)
// ============================================================

export type FundamentalCondition =
  | 'STRONG'
  | 'HEALTHY'
  | 'MIXED'
  | 'WEAK'
  | 'INCOMPLETE';

export type TechnicalCondition =
  | 'STRONG'
  | 'POSITIVE'
  | 'STABLE'
  | 'WEAKENING'
  | 'WEAK'
  | 'INCOMPLETE';

export type ValuationCondition =
  | 'REASONABLE'
  | 'ELEVATED'
  | 'UNAVAILABLE';

export type MomentumCondition =
  | 'IMPROVING'
  | 'HEALTHY'
  | 'COOLING'
  | 'WEAK';

export type PriceLocation =
  | 'SUPPORT'
  | 'MID_RANGE'
  | 'RESISTANCE'
  | 'EXTENDED';

export type PositionContext =
  | 'STRONGLY_APPRECIATED'
  | 'PROFITABLE'
  | 'NEAR_BREAKEVEN'
  | 'LOSS'
  | 'SIGNIFICANT_LOSS';

export type AttentionLevel =
  | 'NORMAL'
  | 'WATCH'
  | 'HIGH_ATTENTION'
  | 'CRITICAL';

// ============================================================
// 2. CONTEXT DATA STATE
// ============================================================

export type ContextDataState =
  | 'AVAILABLE'
  | 'DERIVED'
  | 'MISSING'
  | 'NOT_APPLICABLE'
  | 'UNAVAILABLE'
  | 'MATHEMATICAL_FALLBACK'
  | 'STALE_SNAPSHOT'
  | 'UNKNOWN';

// ============================================================
// 3. DOWNSTREAM CONTEXT INPUT CONTRACTS
// ============================================================

export interface ValuationEvidenceInput {
  pe: number | null;
  pb: number | null;
  evEbitda: number | null;
  sectorPe: number | null;
  sectorPb: number | null;
  valuationBucketScore: number | null;
  state: ContextDataState;
}

export interface MomentumEvidenceInput {
  rsi14: number | null;
  roc20: number | null;
  state: ContextDataState;
}

export interface TechnicalEvidenceInput {
  ema200: number | null;
  sma100: number | null;
  sma50: number | null;
  maStackAligned: boolean | null;
  volumeAccumulationScore: number | null;
  breakoutVolumeScore: number | null;
  volumeVetoApplied: boolean;
  state: ContextDataState;
}

export interface PriceStructureEvidenceInput {
  ltp: number | null;
  e1: number | null;
  e2: number | null;
  e3: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  t1: number | null;
  t2: number | null;
  t3: number | null;
  atr14: number | null;
  maxEntry: number | null;
  state: ContextDataState;
}

export interface IntegrityEvidenceInput {
  status: 'PASSED' | 'QUARANTINED' | 'STALE_FILING' | 'HOLD_PENDING_AUDIT' | 'FRESHNESS_UNVERIFIABLE';
  isQuarantined: boolean;
  reasons: string[];
}

export interface SafetyEvidenceInput {
  accrualTrapPenaltyActive: boolean;
  fundamentalFloorFailed: boolean;
  highSlippageRisk: boolean;
}

export interface ContextInput {
  symbol: string;
  isin: string;
  sector: SectorClassification;
  sectorName: string;
  instrumentType?: InstrumentType;
  isETF: boolean;
  dataSource: DataSource;
  fundamentalStatus?: FundamentalDataStatus;
  
  // Upstream authoritative scores (preserved without recalculation)
  fundamentalScore: number | null;
  technicalScore: number | null;
  coreScore: number | null;
  decisionZone: DecisionZone | 'UNKNOWN';
  decisionZoneReason?: string;

  // Sub-evidence bundles
  valuation: ValuationEvidenceInput;
  momentum: MomentumEvidenceInput;
  technicals: TechnicalEvidenceInput;
  priceStructure: PriceStructureEvidenceInput;
  integrity: IntegrityEvidenceInput;
  safety: SafetyEvidenceInput;

  evaluatedAt: string;
}

// ============================================================
// 4. POSITION CONTEXT INPUT CONTRACT (QUARANTINED FROM CORE SCORES)
// ============================================================

export interface PositionContextInput {
  is_held: boolean;
  symbol: string;
  quantity: number | null;
  averageBuyPrice: number | null;
  currentLtp: number | null;
  investedValue: number | null;
  currentValue: number | null;
  pnl: number | null;
  pnlPct: number | null;
  stopLoss: number | null;
  stopBreached: boolean;
  accrualTrapGain: boolean;
}

// ============================================================
// 5. COMPOSITE CONTEXT EVALUATION OUTPUT CONTRACT
// ============================================================

export interface PositionHoldingState {
  is_held: boolean;
  context: PositionContext | null; // null when is_held is false
  pnlPct: number | null;
  averageBuyPrice: number | null;
}

export interface StockContextEvaluation {
  fundamental_condition: FundamentalCondition;
  technical_condition: TechnicalCondition;
  valuation_condition: ValuationCondition;
  momentum_condition: MomentumCondition | null; // null when momentum evidence is missing
  momentum_state: ContextDataState;
  price_location: PriceLocation;
  position: PositionHoldingState;
  attention_level: AttentionLevel;
  modifiers: string[];
}

// ============================================================
// 6. RELATIONSHIP ENGINE CONTRACTS (PHASE 1C)
// ============================================================

export type RelationshipPriority = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export type RelationshipArchetype =
  | 'ALIGNED_HIGH_QUALITY'
  | 'CONSTRUCTIVE_QUALITY'
  | 'CONSOLIDATING_QUALITY'
  | 'QUALITY_IN_PULLBACK'
  | 'QUALITY_DIVERGENCE_WEAK'
  | 'FUNDAMENTAL_LEAD_ONLY'
  | 'CONSTRUCTIVE_EXPANSION'
  | 'CONSTRUCTIVE_ALIGNED'
  | 'STABLE_CONSOLIDATION'
  | 'HEALTHY_IN_PULLBACK'
  | 'HEALTHY_DIVERGENT_WEAK'
  | 'HEALTHY_LEAD_ONLY'
  | 'SPECULATIVE_MOMENTUM'
  | 'MODERATE_EXPANSION'
  | 'NEUTRAL_PROFILE'
  | 'UNCONFIRMED_STRUCTURE'
  | 'VULNERABLE_STRUCTURE'
  | 'MIXED_LEAD_ONLY'
  | 'LOW_QUALITY_MOMENTUM'
  | 'UNBACKED_STRENGTH'
  | 'STAGNANT_PROFILE'
  | 'DETERIORATING_STRUCTURE'
  | 'ALIGNED_WEAKNESS'
  | 'WEAK_LEAD_ONLY'
  | 'TECHNICAL_LEAD_STRONG'
  | 'TECHNICAL_LEAD_POSITIVE'
  | 'TECHNICAL_LEAD_STABLE'
  | 'TECHNICAL_LEAD_WEAKENING'
  | 'TECHNICAL_LEAD_WEAK'
  | 'DATA_INCOMPLETE';

export interface RelationshipResult {
  cellId: number;
  fundamentalCondition: FundamentalCondition;
  technicalCondition: TechnicalCondition;
  priority: RelationshipPriority;
  archetype: RelationshipArchetype;
  description: string;
  isDivergent: boolean;
  isIncomplete: boolean;
}

// ============================================================
// 7. ATTENTION ENGINE CONTRACTS (PHASE 1D)
// ============================================================

export type AttentionDriverType =
  | 'CRITICAL_STOP_BREACH'
  | 'DATA_QUARANTINE'
  | 'STOP_APPROACHING'
  | 'DATA_INSUFFICIENT'
  | 'ACCRUAL_TRAP'
  | 'PRICE_EXTENDED'
  | 'ANALYTICAL_DIVERGENCE'
  | 'NONE';

export interface AttentionDriver {
  type: AttentionDriverType;
  severity: AttentionLevel;
  description: string;
}

export interface AttentionResult {
  level: AttentionLevel;
  primaryDriver: AttentionDriverType;
  drivers: AttentionDriver[];
  evidence: string[];
  isHeldAlert: boolean;
  dataState: ContextDataState;
}

// ============================================================
// 8. HEADLINE ENGINE & WHAT CHANGED CONTRACTS (PHASE 1E)
// ============================================================

export interface HeadlineResult {
  headline: string;
  primaryArchetype: RelationshipArchetype;
  overrideBadge: string | null;
  modifierBadges: string[];
  isSuppressed: boolean;
  isHeldAlert: boolean;
  dataState: ContextDataState;
}

export interface StateTransition {
  dimension: string;
  from: string | null;
  to: string;
  description: string;
}

export interface WhatChangedResult {
  hasChanged: boolean;
  isColdStart: boolean;
  summary: string;
  transitions: StateTransition[];
  scoreDelta: number | null;
  evaluatedAt: string;
}

// ============================================================
// 9. SESSION SNAPSHOT & PERSISTENCE CONTRACTS (PHASE 1G / PHASE 2A)
// ============================================================

export type MarketSessionState =
  | 'PRE_OPEN'
  | 'OPEN'
  | 'POST_CLOSE'
  | 'CLOSED_OVERNIGHT'
  | 'WEEKEND'
  | 'HOLIDAY'
  | 'SPECIAL_SESSION'
  | 'UNKNOWN';

export interface AnalyticalSnapshot {
  snapshotId: string; // ${isin}_${tradingSessionId}
  isin: string;
  symbol: string;
  tradingSessionId: string; // YYYY-MM-DD (IST)
  marketSessionState: MarketSessionState;
  evaluatedAt: string; // ISO 8601 string
  modelVersion: string; // "2.0.0"
  schemaVersion: number; // 1

  // Core Scores & Decision Zone
  fundamentalScore: number | null;
  technicalScore: number | null;
  coreScore: number | null;
  decisionZone: DecisionZone | null;

  // 8 Categorical Dimensions for What Changed
  fundamentalCondition: FundamentalCondition;
  technicalCondition: TechnicalCondition;
  valuationCondition: ValuationCondition;
  momentumCondition: MomentumCondition | null;
  priceLocation: PriceLocation;
  positionContext: PositionHoldingState;
  attentionLevel: AttentionLevel;
  relationshipArchetype: RelationshipArchetype;

  // Evidence & Auditing Metadata
  primaryAttentionDriver: AttentionDriverType;
  primaryHeadlineBadge: string | null;
  isQuarantined: boolean;
  isETF: boolean;
}
