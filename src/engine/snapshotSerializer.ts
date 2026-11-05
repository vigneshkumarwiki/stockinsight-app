/**
 * STOCKINSIGHT V2.0 Snapshot Serializer (Phase 2A)
 * 
 * Strict Invariants:
 * 1. Pure deterministic serialization between active evaluations and persistent snapshot records.
 * 2. Primary Key format: `${isin}_${tradingSessionId}`.
 * 3. Model Version: "2.0.0" | Schema Version: 1.
 * 4. Zero fabricated/mock data; null values remain strictly null.
 * 5. Complete isolation: stock and position dimensions serialized without cross-talk.
 * 6. Pure adapter converting AnalyticalSnapshot to StockContextEvaluation for Phase 1E What Changed.
 */

import {
  AnalyticalSnapshot,
  ContextInput,
  AttentionResult,
  HeadlineResult,
  StockContextEvaluation,
  FundamentalCondition,
  TechnicalCondition,
  ValuationCondition,
  MomentumCondition,
  PriceLocation,
  PositionHoldingState,
  AttentionLevel,
  RelationshipArchetype,
  AttentionDriverType,
  MarketSessionState,
} from '../types/context';
import { StockInsightEvaluation, DecisionZone } from '../types/engine';
import { classifyFundamentalCondition, classifyTechnicalCondition, classifyValuationCondition, classifyMomentumCondition, classifyPriceLocation } from './contextClassifiers';
import { evaluateRelationship } from './contextRelationships';
import { PositionContextAdapter } from './contextAdapters';
import { SessionResolver } from './sessionResolver';

export const CURRENT_MODEL_VERSION = '2.0.0';
export const CURRENT_SCHEMA_VERSION = 1;

export interface SnapshotCreationParams {
  evaluation: StockInsightEvaluation;
  contextInput: ContextInput;
  attentionResult: AttentionResult;
  headlineResult: HeadlineResult;
  holding?: any | null;
  sessionState?: MarketSessionState;
  tradingSessionId?: string;
  evaluatedAt?: Date | string;
}

export class SnapshotSerializer {
  /**
   * Serializes live analytical evaluation components into a canonical AnalyticalSnapshot.
   */
  public static serialize(params: SnapshotCreationParams): AnalyticalSnapshot {
    const {
      evaluation,
      contextInput,
      attentionResult,
      headlineResult,
      holding = null,
      sessionState,
      tradingSessionId,
      evaluatedAt,
    } = params;

    const evalDate = evaluatedAt instanceof Date ? evaluatedAt : evaluatedAt ? new Date(evaluatedAt) : new Date();
    const resolvedSession = SessionResolver.resolve(evalDate);

    const activeSessionId = tradingSessionId || resolvedSession.tradingSessionId;
    const activeSessionState = sessionState || resolvedSession.marketSessionState;
    const isin = contextInput.isin || evaluation.isin;
    const symbol = contextInput.symbol || evaluation.tradingSymbol;
    const snapshotId = `${isin}_${activeSessionId}`;

    // Categorical Classifications
    const fundamentalCondition = classifyFundamentalCondition(contextInput);
    const technicalCondition = classifyTechnicalCondition(contextInput);
    const valuationCondition = classifyValuationCondition(contextInput);
    const momentumCondition = classifyMomentumCondition(contextInput);
    const priceLocation = classifyPriceLocation(contextInput);

    // Position Holding Context
    const positionInput = PositionContextAdapter.fromHoldingWithEvaluation(holding);
    const posCtx = positionInput.is_held
      ? positionInput.pnlPct !== null && positionInput.pnlPct >= 10
        ? 'STRONGLY_APPRECIATED'
        : positionInput.pnlPct !== null && positionInput.pnlPct > 1.5
        ? 'PROFITABLE'
        : positionInput.pnlPct !== null && positionInput.pnlPct >= -1.5
        ? 'NEAR_BREAKEVEN'
        : positionInput.pnlPct !== null && positionInput.pnlPct >= -8
        ? 'LOSS'
        : 'SIGNIFICANT_LOSS'
      : null;

    const positionContext: PositionHoldingState = {
      is_held: positionInput.is_held,
      context: posCtx,
      pnlPct: positionInput.pnlPct,
      averageBuyPrice: positionInput.averageBuyPrice,
    };

    // Relationship Archetype
    const relationship = evaluateRelationship(fundamentalCondition, technicalCondition);

    return {
      snapshotId,
      isin,
      symbol,
      tradingSessionId: activeSessionId,
      marketSessionState: activeSessionState,
      evaluatedAt: evalDate.toISOString(),
      modelVersion: CURRENT_MODEL_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,

      fundamentalScore: evaluation.fundamentalScore ?? null,
      technicalScore: evaluation.technicalScore ?? null,
      coreScore: evaluation.coreScore ?? null,
      decisionZone: (evaluation.zone as DecisionZone) ?? null,

      fundamentalCondition,
      technicalCondition,
      valuationCondition,
      momentumCondition,
      priceLocation,
      positionContext,
      attentionLevel: attentionResult.level,
      relationshipArchetype: relationship.archetype,

      primaryAttentionDriver: attentionResult.primaryDriver,
      primaryHeadlineBadge: headlineResult.overrideBadge,
      isQuarantined: contextInput.integrity.isQuarantined || evaluation.integrity?.status === 'QUARANTINED',
      isETF: contextInput.isETF,
    };
  }

  /**
   * Converts a persistent AnalyticalSnapshot into the StockContextEvaluation format
   * required by the Phase 1E What Changed Engine.
   */
  public static toContextEvaluation(snapshot: AnalyticalSnapshot): StockContextEvaluation {
    return {
      fundamental_condition: snapshot.fundamentalCondition,
      technical_condition: snapshot.technicalCondition,
      valuation_condition: snapshot.valuationCondition,
      momentum_condition: snapshot.momentumCondition,
      momentum_state: snapshot.momentumCondition !== null ? 'AVAILABLE' : 'MISSING',
      price_location: snapshot.priceLocation,
      position: snapshot.positionContext,
      attention_level: snapshot.attentionLevel,
      modifiers: snapshot.primaryHeadlineBadge ? [snapshot.primaryHeadlineBadge] : [],
    };
  }

  /**
   * Validates whether an object is a structurally valid AnalyticalSnapshot.
   */
  public static validate(snapshot: any): snapshot is AnalyticalSnapshot {
    if (!snapshot || typeof snapshot !== 'object') return false;
    return (
      typeof snapshot.snapshotId === 'string' &&
      typeof snapshot.isin === 'string' &&
      typeof snapshot.symbol === 'string' &&
      typeof snapshot.tradingSessionId === 'string' &&
      typeof snapshot.marketSessionState === 'string' &&
      typeof snapshot.evaluatedAt === 'string' &&
      typeof snapshot.modelVersion === 'string' &&
      typeof snapshot.schemaVersion === 'number' &&
      typeof snapshot.fundamentalCondition === 'string' &&
      typeof snapshot.technicalCondition === 'string' &&
      typeof snapshot.valuationCondition === 'string' &&
      typeof snapshot.priceLocation === 'string' &&
      typeof snapshot.positionContext === 'object' &&
      snapshot.positionContext !== null &&
      typeof snapshot.attentionLevel === 'string' &&
      typeof snapshot.relationshipArchetype === 'string' &&
      typeof snapshot.isQuarantined === 'boolean' &&
      typeof snapshot.isETF === 'boolean'
    );
  }
}
