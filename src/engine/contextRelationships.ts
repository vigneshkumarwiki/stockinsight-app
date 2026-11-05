/**
 * STOCKINSIGHT V2.0 Relationship Engine (Phase 1C)
 * Specification Status: LOCKED FOR IMPLEMENTATION
 * Date: September 28, 2026
 * 
 * Strict Invariants:
 * 1. Pure deterministic downstream interpretation layer.
 * 2. Maps FundamentalCondition (5) x TechnicalCondition (6) to 30 canonical cells.
 * 3. Exact 30-cell Priority Register:
 *    - P1 (Extreme Divergence / High Risk): [05, 19, 22, 23]
 *    - P2 (Aligned Leadership / High Quality): [01, 02, 07, 08]
 *    - P3 (Consolidation & Transition): [03, 04, 09, 10, 11, 13, 14, 15, 16, 17, 20, 21]
 *    - P4 (Non-Reporting / ETF Assets): [25, 26, 27, 28, 29]
 *    - P5 (Data Incomplete / Suppressed): [06, 12, 18, 24, 30]
 * 4. Strictly factual, evidence-safe descriptions (zero causal, predictive, or BUY/SELL claims).
 * 5. Complete position decoupling (unheld vs held has zero mathematical effect on relationship).
 * 6. Non-reporting / ETF assets preserved without fundamental penalization.
 */

import {
  FundamentalCondition,
  TechnicalCondition,
  RelationshipArchetype,
  RelationshipPriority,
  RelationshipResult,
} from '../types/context';

interface MatrixCellDefinition {
  cellId: number;
  fundamentalCondition: FundamentalCondition;
  technicalCondition: TechnicalCondition;
  archetype: RelationshipArchetype;
  priority: RelationshipPriority;
  description: string;
  isDivergent: boolean;
  isIncomplete: boolean;
}

const RELATIONSHIP_MATRIX: readonly MatrixCellDefinition[] = [
  // Tier 1 / Row 1: Fundamental STRONG (Cells 01 - 06)
  {
    cellId: 1,
    fundamentalCondition: 'STRONG',
    technicalCondition: 'STRONG',
    archetype: 'ALIGNED_HIGH_QUALITY',
    priority: 'P2',
    description: 'High fundamental quality aligned with strong price trend.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 2,
    fundamentalCondition: 'STRONG',
    technicalCondition: 'POSITIVE',
    archetype: 'CONSTRUCTIVE_QUALITY',
    priority: 'P2',
    description: 'High fundamental quality with positive price structure.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 3,
    fundamentalCondition: 'STRONG',
    technicalCondition: 'STABLE',
    archetype: 'CONSOLIDATING_QUALITY',
    priority: 'P3',
    description: 'High fundamental quality with stable consolidation.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 4,
    fundamentalCondition: 'STRONG',
    technicalCondition: 'WEAKENING',
    archetype: 'QUALITY_IN_PULLBACK',
    priority: 'P3',
    description: 'High fundamental quality with weakening price trend.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 5,
    fundamentalCondition: 'STRONG',
    technicalCondition: 'WEAK',
    archetype: 'QUALITY_DIVERGENCE_WEAK',
    priority: 'P1',
    description: 'High fundamental quality divergent from weak price trend.',
    isDivergent: true,
    isIncomplete: false,
  },
  {
    cellId: 6,
    fundamentalCondition: 'STRONG',
    technicalCondition: 'INCOMPLETE',
    archetype: 'FUNDAMENTAL_LEAD_ONLY',
    priority: 'P5',
    description: 'High fundamental quality; technical trend data incomplete.',
    isDivergent: false,
    isIncomplete: true,
  },

  // Tier 2 / Row 2: Fundamental HEALTHY (Cells 07 - 12)
  {
    cellId: 7,
    fundamentalCondition: 'HEALTHY',
    technicalCondition: 'STRONG',
    archetype: 'CONSTRUCTIVE_EXPANSION',
    priority: 'P2',
    description: 'Healthy fundamental profile with strong price trend.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 8,
    fundamentalCondition: 'HEALTHY',
    technicalCondition: 'POSITIVE',
    archetype: 'CONSTRUCTIVE_ALIGNED',
    priority: 'P2',
    description: 'Healthy fundamental profile aligned with positive price structure.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 9,
    fundamentalCondition: 'HEALTHY',
    technicalCondition: 'STABLE',
    archetype: 'STABLE_CONSOLIDATION',
    priority: 'P3',
    description: 'Healthy fundamental profile with stable consolidation.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 10,
    fundamentalCondition: 'HEALTHY',
    technicalCondition: 'WEAKENING',
    archetype: 'HEALTHY_IN_PULLBACK',
    priority: 'P3',
    description: 'Healthy fundamental profile with weakening price trend.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 11,
    fundamentalCondition: 'HEALTHY',
    technicalCondition: 'WEAK',
    archetype: 'HEALTHY_DIVERGENT_WEAK',
    priority: 'P3',
    description: 'Healthy fundamental profile divergent from weak price trend.',
    isDivergent: true,
    isIncomplete: false,
  },
  {
    cellId: 12,
    fundamentalCondition: 'HEALTHY',
    technicalCondition: 'INCOMPLETE',
    archetype: 'HEALTHY_LEAD_ONLY',
    priority: 'P5',
    description: 'Healthy fundamental profile; technical trend data incomplete.',
    isDivergent: false,
    isIncomplete: true,
  },

  // Tier 3 / Row 3: Fundamental MIXED (Cells 13 - 18)
  {
    cellId: 13,
    fundamentalCondition: 'MIXED',
    technicalCondition: 'STRONG',
    archetype: 'SPECULATIVE_MOMENTUM',
    priority: 'P3',
    description: 'Mixed fundamental profile with strong price trend.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 14,
    fundamentalCondition: 'MIXED',
    technicalCondition: 'POSITIVE',
    archetype: 'MODERATE_EXPANSION',
    priority: 'P3',
    description: 'Mixed fundamental profile with positive price structure.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 15,
    fundamentalCondition: 'MIXED',
    technicalCondition: 'STABLE',
    archetype: 'NEUTRAL_PROFILE',
    priority: 'P3',
    description: 'Mixed fundamental profile with stable consolidation.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 16,
    fundamentalCondition: 'MIXED',
    technicalCondition: 'WEAKENING',
    archetype: 'UNCONFIRMED_STRUCTURE',
    priority: 'P3',
    description: 'Mixed fundamental profile with weakening price trend.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 17,
    fundamentalCondition: 'MIXED',
    technicalCondition: 'WEAK',
    archetype: 'VULNERABLE_STRUCTURE',
    priority: 'P3',
    description: 'Mixed fundamental profile aligned with weak price trend.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 18,
    fundamentalCondition: 'MIXED',
    technicalCondition: 'INCOMPLETE',
    archetype: 'MIXED_LEAD_ONLY',
    priority: 'P5',
    description: 'Mixed fundamental profile; technical trend data incomplete.',
    isDivergent: false,
    isIncomplete: true,
  },

  // Tier 4 / Row 4: Fundamental WEAK (Cells 19 - 24)
  {
    cellId: 19,
    fundamentalCondition: 'WEAK',
    technicalCondition: 'STRONG',
    archetype: 'LOW_QUALITY_MOMENTUM',
    priority: 'P1',
    description: 'Weak fundamental profile divergent from strong price trend.',
    isDivergent: true,
    isIncomplete: false,
  },
  {
    cellId: 20,
    fundamentalCondition: 'WEAK',
    technicalCondition: 'POSITIVE',
    archetype: 'UNBACKED_STRENGTH',
    priority: 'P3',
    description: 'Weak fundamental profile with positive price structure.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 21,
    fundamentalCondition: 'WEAK',
    technicalCondition: 'STABLE',
    archetype: 'STAGNANT_PROFILE',
    priority: 'P3',
    description: 'Weak fundamental profile with stable consolidation.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 22,
    fundamentalCondition: 'WEAK',
    technicalCondition: 'WEAKENING',
    archetype: 'DETERIORATING_STRUCTURE',
    priority: 'P1',
    description: 'Weak fundamental profile with weakening price trend.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 23,
    fundamentalCondition: 'WEAK',
    technicalCondition: 'WEAK',
    archetype: 'ALIGNED_WEAKNESS',
    priority: 'P1',
    description: 'Weak fundamental profile aligned with weak price trend.',
    isDivergent: false,
    isIncomplete: false,
  },
  {
    cellId: 24,
    fundamentalCondition: 'WEAK',
    technicalCondition: 'INCOMPLETE',
    archetype: 'WEAK_LEAD_ONLY',
    priority: 'P5',
    description: 'Weak fundamental profile; technical trend data incomplete.',
    isDivergent: false,
    isIncomplete: true,
  },

  // Tier 5 / Row 5: Fundamental INCOMPLETE (Cells 25 - 30)
  {
    cellId: 25,
    fundamentalCondition: 'INCOMPLETE',
    technicalCondition: 'STRONG',
    archetype: 'TECHNICAL_LEAD_STRONG',
    priority: 'P4',
    description: 'Technical trend is strong; fundamental reporting not applicable.',
    isDivergent: false,
    isIncomplete: true,
  },
  {
    cellId: 26,
    fundamentalCondition: 'INCOMPLETE',
    technicalCondition: 'POSITIVE',
    archetype: 'TECHNICAL_LEAD_POSITIVE',
    priority: 'P4',
    description: 'Technical structure is positive; fundamental reporting not applicable.',
    isDivergent: false,
    isIncomplete: true,
  },
  {
    cellId: 27,
    fundamentalCondition: 'INCOMPLETE',
    technicalCondition: 'STABLE',
    archetype: 'TECHNICAL_LEAD_STABLE',
    priority: 'P4',
    description: 'Technical structure is stable; fundamental reporting not applicable.',
    isDivergent: false,
    isIncomplete: true,
  },
  {
    cellId: 28,
    fundamentalCondition: 'INCOMPLETE',
    technicalCondition: 'WEAKENING',
    archetype: 'TECHNICAL_LEAD_WEAKENING',
    priority: 'P4',
    description: 'Technical trend is weakening; fundamental reporting not applicable.',
    isDivergent: false,
    isIncomplete: true,
  },
  {
    cellId: 29,
    fundamentalCondition: 'INCOMPLETE',
    technicalCondition: 'WEAK',
    archetype: 'TECHNICAL_LEAD_WEAK',
    priority: 'P4',
    description: 'Technical trend is weak; fundamental reporting not applicable.',
    isDivergent: false,
    isIncomplete: true,
  },
  {
    cellId: 30,
    fundamentalCondition: 'INCOMPLETE',
    technicalCondition: 'INCOMPLETE',
    archetype: 'DATA_INCOMPLETE',
    priority: 'P5',
    description: 'Evaluation incomplete across fundamental and technical dimensions.',
    isDivergent: false,
    isIncomplete: true,
  },
];

// Pre-indexed lookup map for O(1) pure deterministic lookup
const MATRIX_LOOKUP: ReadonlyMap<string, MatrixCellDefinition> = new Map(
  RELATIONSHIP_MATRIX.map(cell => [
    `${cell.fundamentalCondition}_${cell.technicalCondition}`,
    cell,
  ])
);

/**
 * Evaluates the deterministic relationship archetype between FundamentalCondition and TechnicalCondition.
 * 
 * Invariants:
 * - Pure function: Zero side effects, zero Date.now(), zero mutations.
 * - Decoupled: Portfolio holding status has zero impact on output.
 * - Missing data safety: Missing/incomplete conditions are never converted to WEAK.
 * - Language safety: Zero causal, predictive, or trading advice statements.
 * 
 * @param fundamentalCondition Canonical FundamentalCondition (STRONG | HEALTHY | MIXED | WEAK | INCOMPLETE)
 * @param technicalCondition Canonical TechnicalCondition (STRONG | POSITIVE | STABLE | WEAKENING | WEAK | INCOMPLETE)
 * @returns Canonical RelationshipResult matching the locked 30-cell specification
 */
export function evaluateRelationship(
  fundamentalCondition: FundamentalCondition,
  technicalCondition: TechnicalCondition
): RelationshipResult {
  const key = `${fundamentalCondition}_${technicalCondition}`;
  const cell = MATRIX_LOOKUP.get(key);

  if (!cell) {
    // Structural fallback for unknown combinations (should never occur with valid types)
    return {
      cellId: 30,
      fundamentalCondition,
      technicalCondition,
      priority: 'P5',
      archetype: 'DATA_INCOMPLETE',
      description: 'Evaluation incomplete across fundamental and technical dimensions.',
      isDivergent: false,
      isIncomplete: true,
    };
  }

  // Return a fresh copy to guarantee caller immutability
  return {
    cellId: cell.cellId,
    fundamentalCondition: cell.fundamentalCondition,
    technicalCondition: cell.technicalCondition,
    priority: cell.priority,
    archetype: cell.archetype,
    description: cell.description,
    isDivergent: cell.isDivergent,
    isIncomplete: cell.isIncomplete,
  };
}

/**
 * Returns all 30 canonical relationship matrix definitions in order (Cells 01 - 30).
 */
export function getAllRelationshipMatrixEntries(): readonly RelationshipResult[] {
  return RELATIONSHIP_MATRIX.map(cell => ({ ...cell }));
}

/**
 * Returns the relationship matrix definition by its exact 1-indexed Cell ID (1 - 30).
 */
export function getRelationshipByCellId(cellId: number): RelationshipResult | null {
  const cell = RELATIONSHIP_MATRIX.find(c => c.cellId === cellId);
  return cell ? { ...cell } : null;
}
