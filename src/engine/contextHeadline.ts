/**
 * STOCKINSIGHT V2.0 Headline Engine (Phase 1E)
 * Specification Status: LOCKED FOR IMPLEMENTATION
 * Date: September 28, 2026
 * 
 * Strict Invariants:
 * 1. Pure deterministic downstream interpretation/composition layer.
 * 2. Exact canonical badge strings.
 * 3. Exact headline override precedence.
 * 4. Special suppression semantics for Cell 30 and Cells 06/12/18/24.
 * 5. Canonical ETF handling for Cells 25-29.
 * 6. Maximum 2 displayed secondary modifiers in modifierBadges.
 * 7. Zero causal, predictive, or recommendation language.
 */

import {
  RelationshipResult,
  AttentionResult,
  HeadlineResult,
  RelationshipArchetype,
  ContextDataState,
} from '../types/context';

// Exact canonical badge strings (Locked)
export const HEADLINE_BADGES = {
  CRITICAL_STOP_BREACH: '[CRITICAL STOP BREACH]',
  DATA_QUARANTINE: '[DATA QUARANTINE]',
  STOP_APPROACHING: '[STOP APPROACHING]',
  DATA_INSUFFICIENT: '[INSUFFICIENT DATA]',
  NON_REPORTING_ETF: '[NON-REPORTING ASSET / ETF]',
  TECHNICAL_INCOMPLETE: '[TECHNICAL INCOMPLETE]',
  ACCRUAL_DISCONNECT: '[Accrual Disconnect Warning]',
  PRICE_EXTENDED: '[Price Extended]',
  ANALYTICAL_DIVERGENCE: '[Analytical Divergence]',
} as const;

// Exact technical incomplete base descriptions
const TECH_INCOMPLETE_DESCRIPTIONS: Record<number, string> = {
  6: 'High fundamental quality; technical trend data incomplete.',
  12: 'Healthy fundamental profile; technical trend data incomplete.',
  18: 'Mixed fundamental profile; technical trend data incomplete.',
  24: 'Weak fundamental profile; technical trend data incomplete.',
};

/**
 * Pure deterministic evaluator that composes the canonical headline from
 * Phase 1C RelationshipResult and Phase 1D AttentionResult evidence.
 */
export function evaluateHeadline(
  relationship: RelationshipResult,
  attention: AttentionResult,
  isETF: boolean = false
): HeadlineResult {
  const activeDriverTypes = new Set(attention.drivers.map(d => d.type));

  // ============================================================
  // 1. DETERMINE PRIMARY OVERRIDE BADGE (BY LOCKED PRECEDENCE)
  // ============================================================
  let overrideBadge: string | null = null;

  if (activeDriverTypes.has('CRITICAL_STOP_BREACH')) {
    overrideBadge = HEADLINE_BADGES.CRITICAL_STOP_BREACH;
  } else if (activeDriverTypes.has('DATA_QUARANTINE')) {
    overrideBadge = HEADLINE_BADGES.DATA_QUARANTINE;
  } else if (activeDriverTypes.has('STOP_APPROACHING')) {
    overrideBadge = HEADLINE_BADGES.STOP_APPROACHING;
  } else if (activeDriverTypes.has('DATA_INSUFFICIENT') || relationship.cellId === 30) {
    overrideBadge = HEADLINE_BADGES.DATA_INSUFFICIENT;
  }

  // ============================================================
  // 2. DETERMINE SECONDARY MODIFIERS (MAXIMUM 2 DISPLAYED)
  // ============================================================
  const candidateModifiers: string[] = [];

  if (activeDriverTypes.has('ACCRUAL_TRAP')) {
    candidateModifiers.push(HEADLINE_BADGES.ACCRUAL_DISCONNECT);
  }
  if (activeDriverTypes.has('PRICE_EXTENDED')) {
    candidateModifiers.push(HEADLINE_BADGES.PRICE_EXTENDED);
  }
  if (activeDriverTypes.has('ANALYTICAL_DIVERGENCE')) {
    candidateModifiers.push(HEADLINE_BADGES.ANALYTICAL_DIVERGENCE);
  }

  // Strictly enforce display ceiling: max 2 modifiers
  const modifierBadges = candidateModifiers.slice(0, 2);

  // ============================================================
  // 3. SPECIAL HARD SUPPRESSION CASE: CELL 30 (INCOMPLETE x INCOMPLETE)
  // ============================================================
  if (relationship.cellId === 30 || (relationship.fundamentalCondition === 'INCOMPLETE' && relationship.technicalCondition === 'INCOMPLETE')) {
    return {
      headline: `${HEADLINE_BADGES.DATA_INSUFFICIENT} Evaluation incomplete across fundamental and technical dimensions.`,
      primaryArchetype: 'DATA_INCOMPLETE',
      overrideBadge: HEADLINE_BADGES.DATA_INSUFFICIENT,
      modifierBadges: [],
      isSuppressed: true,
      isHeldAlert: attention.isHeldAlert,
      dataState: attention.dataState === 'AVAILABLE' ? 'MISSING' : attention.dataState,
    };
  }

  // ============================================================
  // 4. SPECIAL CASE: CELLS 06, 12, 18, 24 (TECHNICAL INCOMPLETE)
  // ============================================================
  if ([6, 12, 18, 24].includes(relationship.cellId) || relationship.technicalCondition === 'INCOMPLETE') {
    const baseDesc = TECH_INCOMPLETE_DESCRIPTIONS[relationship.cellId] || `${relationship.fundamentalCondition} fundamental profile; technical trend data incomplete.`;
    const badge = overrideBadge ?? HEADLINE_BADGES.TECHNICAL_INCOMPLETE;
    return {
      headline: `${badge} ${baseDesc}`,
      primaryArchetype: relationship.archetype,
      overrideBadge: badge,
      modifierBadges: [],
      isSuppressed: true,
      isHeldAlert: attention.isHeldAlert,
      dataState: attention.dataState,
    };
  }

  // ============================================================
  // 5. SPECIAL CASE: CELLS 25–29 (ETF / NON-REPORTING ASSETS)
  // ============================================================
  if (isETF || (relationship.fundamentalCondition === 'INCOMPLETE' && [25, 26, 27, 28, 29].includes(relationship.cellId))) {
    const activeBadge = overrideBadge ?? HEADLINE_BADGES.NON_REPORTING_ETF;
    const modifierText = modifierBadges.length > 0 ? ` ${modifierBadges.join(' ')}` : '';
    return {
      headline: `${activeBadge} ${relationship.description}${modifierText}`,
      primaryArchetype: relationship.archetype,
      overrideBadge: activeBadge,
      modifierBadges,
      isSuppressed: false,
      isHeldAlert: attention.isHeldAlert,
      dataState: attention.dataState === 'AVAILABLE' ? 'NOT_APPLICABLE' : attention.dataState,
    };
  }

  // ============================================================
  // 6. STANDARD DUAL-AXIS RELATIONSHIP HEADLINE
  // ============================================================
  const prefix = overrideBadge ? `${overrideBadge} ` : '';
  const suffix = modifierBadges.length > 0 ? ` ${modifierBadges.join(' ')}` : '';
  const headline = `${prefix}${relationship.description}${suffix}`;

  return {
    headline,
    primaryArchetype: relationship.archetype,
    overrideBadge,
    modifierBadges,
    isSuppressed: false,
    isHeldAlert: attention.isHeldAlert,
    dataState: attention.dataState,
  };
}
