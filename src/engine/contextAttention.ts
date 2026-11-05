/**
 * STOCKINSIGHT V2.0 Attention Engine (Phase 1D)
 * Specification Status: LOCKED FOR IMPLEMENTATION
 * Date: September 28, 2026
 * 
 * Strict Invariants:
 * 1. Pure deterministic downstream evidence-compression layer.
 * 2. Closed 4-level attention hierarchy: NORMAL | WATCH | HIGH_ATTENTION | CRITICAL.
 * 3. Canonical 8 active drivers + NONE (TARGET_PROXIMITY strictly excluded).
 * 4. Locked descending precedence hierarchy for multi-driver resolution.
 * 5. Watchlist invariant: Unheld assets (is_held === false) never trigger position stop alerts.
 * 6. Zero recommendation, prediction, or BUY/SELL language.
 * 7. Static current snapshot evaluation only (zero historical diffing).
 */

import {
  AttentionLevel,
  AttentionDriverType,
  AttentionDriver,
  AttentionResult,
  ContextInput,
  PositionContextInput,
  RelationshipResult,
  PriceLocation,
  ContextDataState,
} from '../types/context';

interface DriverSpec {
  type: AttentionDriverType;
  severity: AttentionLevel;
  precedence: number;
  description: string;
}

const DRIVER_SPECS: Record<AttentionDriverType, DriverSpec> = {
  CRITICAL_STOP_BREACH: {
    type: 'CRITICAL_STOP_BREACH',
    severity: 'CRITICAL',
    precedence: 1,
    description: 'Held position price has breached structural stop-loss level S1.',
  },
  DATA_QUARANTINE: {
    type: 'DATA_QUARANTINE',
    severity: 'CRITICAL',
    precedence: 2,
    description: 'Financial filings or data integrity failed forensic validation and are quarantined.',
  },
  STOP_APPROACHING: {
    type: 'STOP_APPROACHING',
    severity: 'HIGH_ATTENTION',
    precedence: 3,
    description: 'Held position price is approaching structural stop-loss buffer.',
  },
  DATA_INSUFFICIENT: {
    type: 'DATA_INSUFFICIENT',
    severity: 'HIGH_ATTENTION',
    precedence: 4,
    description: 'Data is incomplete across fundamental and technical dimensions.',
  },
  ACCRUAL_TRAP: {
    type: 'ACCRUAL_TRAP',
    severity: 'WATCH',
    precedence: 5,
    description: 'Accrual earnings quality disconnect detected with analytical penalty active.',
  },
  PRICE_EXTENDED: {
    type: 'PRICE_EXTENDED',
    severity: 'WATCH',
    precedence: 6,
    description: 'Current market price is extended beyond standard entry and target envelopes.',
  },
  ANALYTICAL_DIVERGENCE: {
    type: 'ANALYTICAL_DIVERGENCE',
    severity: 'WATCH',
    precedence: 7,
    description: 'Material divergence or risk observed between fundamental and technical profiles.',
  },
  NONE: {
    type: 'NONE',
    severity: 'NORMAL',
    precedence: 8,
    description: 'Balanced conditions within structural envelopes without elevated risk flags.',
  },
};

/**
 * Evaluates the deterministic Attention state from Context and Position evidence.
 * 
 * @param input Authoritative ContextInput evidence bundle
 * @param position Quarantined PositionContextInput holding data
 * @param relationship Phase 1C RelationshipResult
 * @param priceLocation Phase 1B PriceLocation
 * @returns Canonical AttentionResult matching locked Phase 1D specification
 */
export function evaluateAttention(
  input: ContextInput,
  position: PositionContextInput,
  relationship: RelationshipResult,
  priceLocation: PriceLocation
): AttentionResult {
  const activeDrivers: AttentionDriver[] = [];
  const isHeld = position.is_held === true;
  const ltp = input.priceStructure.ltp;
  const s1 = input.priceStructure.s1;
  const atr14 = input.priceStructure.atr14;

  // 1. CRITICAL_STOP_BREACH (Precedence 1 - Position Dependent)
  if (isHeld && ltp !== null && s1 !== null && ltp < s1) {
    activeDrivers.push({
      type: 'CRITICAL_STOP_BREACH',
      severity: 'CRITICAL',
      description: DRIVER_SPECS.CRITICAL_STOP_BREACH.description,
    });
  }

  // 2. DATA_QUARANTINE (Precedence 2 - Position Independent)
  if (input.integrity.status === 'QUARANTINED' || input.integrity.isQuarantined === true) {
    activeDrivers.push({
      type: 'DATA_QUARANTINE',
      severity: 'CRITICAL',
      description: DRIVER_SPECS.DATA_QUARANTINE.description,
    });
  }

  // 3. STOP_APPROACHING (Precedence 3 - Position Dependent)
  // Trigger condition: is_held === true AND LTP >= S1 AND LTP <= S1 + (0.50 * ATR14)
  if (isHeld && ltp !== null && s1 !== null && atr14 !== null && ltp >= s1 && ltp <= s1 + 0.50 * atr14) {
    activeDrivers.push({
      type: 'STOP_APPROACHING',
      severity: 'HIGH_ATTENTION',
      description: DRIVER_SPECS.STOP_APPROACHING.description,
    });
  }

  // 4. DATA_INSUFFICIENT (Precedence 4 - Position Independent)
  // Trigger condition: Dual-axis Incomplete (Cell 30)
  if (
    relationship.cellId === 30 ||
    (relationship.fundamentalCondition === 'INCOMPLETE' && relationship.technicalCondition === 'INCOMPLETE')
  ) {
    activeDrivers.push({
      type: 'DATA_INSUFFICIENT',
      severity: 'HIGH_ATTENTION',
      description: DRIVER_SPECS.DATA_INSUFFICIENT.description,
    });
  }

  // 5. ACCRUAL_TRAP (Precedence 5 - Position Independent)
  if (input.safety.accrualTrapPenaltyActive === true) {
    activeDrivers.push({
      type: 'ACCRUAL_TRAP',
      severity: 'WATCH',
      description: DRIVER_SPECS.ACCRUAL_TRAP.description,
    });
  }

  // 6. PRICE_EXTENDED (Precedence 6 - Position Independent)
  if (
    priceLocation === 'EXTENDED' ||
    (ltp !== null &&
      ((input.priceStructure.maxEntry !== null && ltp > input.priceStructure.maxEntry) ||
        (input.priceStructure.t3 !== null && ltp > input.priceStructure.t3)))
  ) {
    activeDrivers.push({
      type: 'PRICE_EXTENDED',
      severity: 'WATCH',
      description: DRIVER_SPECS.PRICE_EXTENDED.description,
    });
  }

  // 7. ANALYTICAL_DIVERGENCE (Precedence 7 - Position Independent)
  // Trigger condition: Relationship Priority P1 (Cells 05, 19, 22, 23)
  if (relationship.priority === 'P1' || [5, 19, 22, 23].includes(relationship.cellId)) {
    activeDrivers.push({
      type: 'ANALYTICAL_DIVERGENCE',
      severity: 'WATCH',
      description: DRIVER_SPECS.ANALYTICAL_DIVERGENCE.description,
    });
  }

  // 8. NONE / BASELINE (When no active drivers exist)
  if (activeDrivers.length === 0) {
    activeDrivers.push({
      type: 'NONE',
      severity: 'NORMAL',
      description: DRIVER_SPECS.NONE.description,
    });
  }

  // Sort active drivers strictly by locked precedence
  activeDrivers.sort((a, b) => DRIVER_SPECS[a.type].precedence - DRIVER_SPECS[b.type].precedence);

  // Primary driver is the first in precedence order
  const primaryDriver = activeDrivers[0].type;

  // Determine overall severity Level from maximum severity across active drivers
  let level: AttentionLevel = 'NORMAL';
  if (activeDrivers.some(d => d.severity === 'CRITICAL')) {
    level = 'CRITICAL';
  } else if (activeDrivers.some(d => d.severity === 'HIGH_ATTENTION')) {
    level = 'HIGH_ATTENTION';
  } else if (activeDrivers.some(d => d.severity === 'WATCH')) {
    level = 'WATCH';
  } else {
    level = 'NORMAL';
  }

  // Check if any position-dependent alert is active
  const isHeldAlert = activeDrivers.some(
    d => d.type === 'CRITICAL_STOP_BREACH' || d.type === 'STOP_APPROACHING'
  );

  // Extract descriptive evidence strings
  const evidence = activeDrivers.map(d => d.description);

  // Derive dataState cleanly
  let dataState: ContextDataState = 'AVAILABLE';
  if (input.integrity.status === 'QUARANTINED') {
    dataState = 'UNAVAILABLE';
  } else if (relationship.cellId === 30) {
    dataState = 'MISSING';
  } else if (input.isETF) {
    dataState = 'NOT_APPLICABLE';
  } else {
    dataState = input.technicals.state || 'AVAILABLE';
  }

  return {
    level,
    primaryDriver,
    drivers: activeDrivers,
    evidence,
    isHeldAlert,
    dataState,
  };
}
