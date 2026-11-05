/**
 * STOCKINSIGHT V2.0 Headline Engine Phase 1E Verification Suite
 * Tests canonical headline composition, override precedence, Cell 30 suppression,
 * Technical Incomplete handling, ETF non-reporting syntax, secondary modifier ceiling (max 2),
 * and evidence-safe wording.
 */

import { evaluateRelationship } from '../engine/contextRelationships.ts';
import { evaluateAttention } from '../engine/contextAttention.ts';
import { evaluateHeadline, HEADLINE_BADGES } from '../engine/contextHeadline.ts';
import {
  ContextInput,
  PositionContextInput,
  RelationshipResult,
  AttentionResult,
  HeadlineResult,
} from '../types/context.ts';

async function runHeadlineTests() {
  console.log('===========================================================');
  console.log('       STOCKINSIGHT V2.0 HEADLINE ENGINE (PHASE 1E)        ');
  console.log('===========================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      if (detail) console.error(`   ${detail}`);
    }
  }

  // Helper baseline mock results
  const baseAttention: AttentionResult = {
    level: 'NORMAL',
    primaryDriver: 'NONE',
    drivers: [{ type: 'NONE', severity: 'NORMAL', description: 'Balanced conditions.' }],
    evidence: ['Balanced conditions.'],
    isHeldAlert: false,
    dataState: 'AVAILABLE',
  };

  const normalRel: RelationshipResult = evaluateRelationship('STRONG', 'STRONG'); // Cell 01 (P2)
  const cell05Rel: RelationshipResult = evaluateRelationship('STRONG', 'WEAK'); // Cell 05 (P1)
  const cell06Rel: RelationshipResult = evaluateRelationship('STRONG', 'INCOMPLETE'); // Cell 06 (P5)
  const cell12Rel: RelationshipResult = evaluateRelationship('HEALTHY', 'INCOMPLETE'); // Cell 12 (P5)
  const cell18Rel: RelationshipResult = evaluateRelationship('MIXED', 'INCOMPLETE'); // Cell 18 (P5)
  const cell24Rel: RelationshipResult = evaluateRelationship('WEAK', 'INCOMPLETE'); // Cell 24 (P5)
  const cell25Rel: RelationshipResult = evaluateRelationship('INCOMPLETE', 'STRONG'); // Cell 25 (P4, ETF)
  const cell26Rel: RelationshipResult = evaluateRelationship('INCOMPLETE', 'POSITIVE'); // Cell 26 (P4, ETF)
  const cell27Rel: RelationshipResult = evaluateRelationship('INCOMPLETE', 'STABLE'); // Cell 27 (P4, ETF)
  const cell28Rel: RelationshipResult = evaluateRelationship('INCOMPLETE', 'WEAKENING'); // Cell 28 (P4, ETF)
  const cell29Rel: RelationshipResult = evaluateRelationship('INCOMPLETE', 'WEAK'); // Cell 29 (P4, ETF)
  const cell30Rel: RelationshipResult = evaluateRelationship('INCOMPLETE', 'INCOMPLETE'); // Cell 30 (P5)

  // ============================================================
  // TEST GROUP 1: NORMAL CANONICAL HEADLINE
  // ============================================================
  console.log('--- TEST GROUP 1: NORMAL CANONICAL HEADLINE ---');

  const normalHeadline = evaluateHeadline(normalRel, baseAttention, false);
  assert(
    normalHeadline.headline === 'High fundamental quality aligned with strong price trend.',
    'Normal headline renders exact canonical relationship description'
  );
  assert(normalHeadline.overrideBadge === null, 'Normal headline has overrideBadge === null');
  assert(normalHeadline.modifierBadges.length === 0, 'Normal headline has 0 modifiers');
  assert(normalHeadline.isSuppressed === false, 'Normal headline isSuppressed === false');

  // ============================================================
  // TEST GROUP 2: PRIMARY OVERRIDE BADGES
  // ============================================================
  console.log('\n--- TEST GROUP 2: PRIMARY OVERRIDE BADGES ---');

  // 1. CRITICAL_STOP_BREACH
  const stopBreachAttention: AttentionResult = {
    ...baseAttention,
    level: 'CRITICAL',
    primaryDriver: 'CRITICAL_STOP_BREACH',
    drivers: [{ type: 'CRITICAL_STOP_BREACH', severity: 'CRITICAL', description: 'Stop breached.' }],
    isHeldAlert: true,
  };
  const breachHeadline = evaluateHeadline(normalRel, stopBreachAttention, false);
  assert(
    breachHeadline.headline === '[CRITICAL STOP BREACH] High fundamental quality aligned with strong price trend.',
    'CRITICAL_STOP_BREACH prepends "[CRITICAL STOP BREACH]"'
  );
  assert(breachHeadline.overrideBadge === '[CRITICAL STOP BREACH]', 'overrideBadge is "[CRITICAL STOP BREACH]"');
  assert(breachHeadline.isHeldAlert === true, 'isHeldAlert is preserved');

  // 2. DATA_QUARANTINE
  const quarantineAttention: AttentionResult = {
    ...baseAttention,
    level: 'CRITICAL',
    primaryDriver: 'DATA_QUARANTINE',
    drivers: [{ type: 'DATA_QUARANTINE', severity: 'CRITICAL', description: 'Quarantined.' }],
  };
  const quarantineHeadline = evaluateHeadline(normalRel, quarantineAttention, false);
  assert(
    quarantineHeadline.headline === '[DATA QUARANTINE] High fundamental quality aligned with strong price trend.',
    'DATA_QUARANTINE prepends "[DATA QUARANTINE]"'
  );
  assert(quarantineHeadline.overrideBadge === '[DATA QUARANTINE]', 'overrideBadge is "[DATA QUARANTINE]"');

  // 3. STOP_APPROACHING
  const approachingAttention: AttentionResult = {
    ...baseAttention,
    level: 'HIGH_ATTENTION',
    primaryDriver: 'STOP_APPROACHING',
    drivers: [{ type: 'STOP_APPROACHING', severity: 'HIGH_ATTENTION', description: 'Stop approaching.' }],
    isHeldAlert: true,
  };
  const approachingHeadline = evaluateHeadline(normalRel, approachingAttention, false);
  assert(
    approachingHeadline.headline === '[STOP APPROACHING] High fundamental quality aligned with strong price trend.',
    'STOP_APPROACHING prepends "[STOP APPROACHING]"'
  );
  assert(approachingHeadline.overrideBadge === '[STOP APPROACHING]', 'overrideBadge is "[STOP APPROACHING]"');

  // ============================================================
  // TEST GROUP 3: OVERRIDE PRECEDENCE RESOLUTION
  // ============================================================
  console.log('\n--- TEST GROUP 3: OVERRIDE PRECEDENCE RESOLUTION ---');

  // Multiple active overrides: Stop Breach (1) + Data Quarantine (2) + Stop Approaching (3)
  const multiOverrideAttention: AttentionResult = {
    ...baseAttention,
    level: 'CRITICAL',
    primaryDriver: 'CRITICAL_STOP_BREACH',
    drivers: [
      { type: 'CRITICAL_STOP_BREACH', severity: 'CRITICAL', description: 'Stop breached.' },
      { type: 'DATA_QUARANTINE', severity: 'CRITICAL', description: 'Quarantined.' },
      { type: 'STOP_APPROACHING', severity: 'HIGH_ATTENTION', description: 'Approaching.' },
    ],
    isHeldAlert: true,
  };
  const multiOverrideHeadline = evaluateHeadline(normalRel, multiOverrideAttention, false);
  assert(
    multiOverrideHeadline.overrideBadge === '[CRITICAL STOP BREACH]',
    'Override precedence selects highest priority [CRITICAL STOP BREACH] over [DATA QUARANTINE]'
  );
  assert(
    !multiOverrideHeadline.headline.includes('[DATA QUARANTINE]'),
    'Multiple override badges are strictly suppressed (only one override displayed)'
  );

  // Precedence: Data Quarantine (2) > Stop Approaching (3)
  const quarantineAndApproachingAttention: AttentionResult = {
    ...baseAttention,
    level: 'CRITICAL',
    primaryDriver: 'DATA_QUARANTINE',
    drivers: [
      { type: 'DATA_QUARANTINE', severity: 'CRITICAL', description: 'Quarantined.' },
      { type: 'STOP_APPROACHING', severity: 'HIGH_ATTENTION', description: 'Approaching.' },
    ],
  };
  const qAndAHeadline = evaluateHeadline(normalRel, quarantineAndApproachingAttention, false);
  assert(
    qAndAHeadline.overrideBadge === '[DATA QUARANTINE]',
    'DATA_QUARANTINE takes precedence over STOP_APPROACHING'
  );

  // ============================================================
  // TEST GROUP 4: CELL 30 (INCOMPLETE x INCOMPLETE) HARD SUPPRESSION
  // ============================================================
  console.log('\n--- TEST GROUP 4: CELL 30 HARD SUPPRESSION ---');

  const cell30Headline = evaluateHeadline(cell30Rel, baseAttention, false);
  assert(
    cell30Headline.headline === '[INSUFFICIENT DATA] Evaluation incomplete across fundamental and technical dimensions.',
    'Cell 30 produces exact canonical suppression headline'
  );
  assert(cell30Headline.overrideBadge === '[INSUFFICIENT DATA]', 'Cell 30 overrideBadge is "[INSUFFICIENT DATA]"');
  assert(cell30Headline.isSuppressed === true, 'Cell 30 isSuppressed is true');
  assert(cell30Headline.modifierBadges.length === 0, 'Cell 30 has 0 modifiers appended');

  // ============================================================
  // TEST GROUP 5: CELLS 06, 12, 18, 24 (TECHNICAL INCOMPLETE)
  // ============================================================
  console.log('\n--- TEST GROUP 5: CELLS 06, 12, 18, 24 (TECHNICAL INCOMPLETE) ---');

  const h06 = evaluateHeadline(cell06Rel, baseAttention, false);
  assert(
    h06.headline === '[TECHNICAL INCOMPLETE] High fundamental quality; technical trend data incomplete.',
    'Cell 06 produces exact canonical technical incomplete headline'
  );
  assert(h06.isSuppressed === true, 'Cell 06 isSuppressed is true');

  const h12 = evaluateHeadline(cell12Rel, baseAttention, false);
  assert(
    h12.headline === '[TECHNICAL INCOMPLETE] Healthy fundamental profile; technical trend data incomplete.',
    'Cell 12 produces exact canonical technical incomplete headline'
  );

  const h18 = evaluateHeadline(cell18Rel, baseAttention, false);
  assert(
    h18.headline === '[TECHNICAL INCOMPLETE] Mixed fundamental profile; technical trend data incomplete.',
    'Cell 18 produces exact canonical technical incomplete headline'
  );

  const h24 = evaluateHeadline(cell24Rel, baseAttention, false);
  assert(
    h24.headline === '[TECHNICAL INCOMPLETE] Weak fundamental profile; technical trend data incomplete.',
    'Cell 24 produces exact canonical technical incomplete headline'
  );

  // ============================================================
  // TEST GROUP 6: ETF / NON-REPORTING ASSETS (CELLS 25-29)
  // ============================================================
  console.log('\n--- TEST GROUP 6: ETF / NON-REPORTING ASSETS (CELLS 25-29) ---');

  const h25 = evaluateHeadline(cell25Rel, baseAttention, true);
  assert(
    h25.headline === '[NON-REPORTING ASSET / ETF] Technical trend is strong; fundamental reporting not applicable.',
    'Cell 25 produces exact ETF headline'
  );
  assert(h25.isSuppressed === false, 'ETF headline isSuppressed is false (Headline eligible)');

  const h26 = evaluateHeadline(cell26Rel, baseAttention, true);
  assert(
    h26.headline === '[NON-REPORTING ASSET / ETF] Technical structure is positive; fundamental reporting not applicable.',
    'Cell 26 produces exact ETF headline'
  );

  const h27 = evaluateHeadline(cell27Rel, baseAttention, true);
  assert(
    h27.headline === '[NON-REPORTING ASSET / ETF] Technical structure is stable; fundamental reporting not applicable.',
    'Cell 27 produces exact ETF headline'
  );

  const h28 = evaluateHeadline(cell28Rel, baseAttention, true);
  assert(
    h28.headline === '[NON-REPORTING ASSET / ETF] Technical trend is weakening; fundamental reporting not applicable.',
    'Cell 28 produces exact ETF headline'
  );

  const h29 = evaluateHeadline(cell29Rel, baseAttention, true);
  assert(
    h29.headline === '[NON-REPORTING ASSET / ETF] Technical trend is weak; fundamental reporting not applicable.',
    'Cell 29 produces exact ETF headline'
  );

  // ============================================================
  // TEST GROUP 7: SECONDARY MODIFIERS (MAX 2 CEILING)
  // ============================================================
  console.log('\n--- TEST GROUP 7: SECONDARY MODIFIERS ---');

  // Single modifier: ACCRUAL_TRAP
  const accrualAttention: AttentionResult = {
    ...baseAttention,
    level: 'WATCH',
    primaryDriver: 'ACCRUAL_TRAP',
    drivers: [{ type: 'ACCRUAL_TRAP', severity: 'WATCH', description: 'Accrual penalty.' }],
  };
  const accrualHeadline = evaluateHeadline(normalRel, accrualAttention, false);
  assert(
    accrualHeadline.headline === 'High fundamental quality aligned with strong price trend. [Accrual Disconnect Warning]',
    'Accrual modifier is correctly appended'
  );
  assert(
    accrualHeadline.modifierBadges.includes('[Accrual Disconnect Warning]'),
    'modifierBadges includes [Accrual Disconnect Warning]'
  );

  // Two modifiers: ACCRUAL_TRAP + PRICE_EXTENDED
  const twoModAttention: AttentionResult = {
    ...baseAttention,
    level: 'WATCH',
    primaryDriver: 'ACCRUAL_TRAP',
    drivers: [
      { type: 'ACCRUAL_TRAP', severity: 'WATCH', description: 'Accrual penalty.' },
      { type: 'PRICE_EXTENDED', severity: 'WATCH', description: 'Price extended.' },
    ],
  };
  const twoModHeadline = evaluateHeadline(normalRel, twoModAttention, false);
  assert(
    twoModHeadline.headline === 'High fundamental quality aligned with strong price trend. [Accrual Disconnect Warning] [Price Extended]',
    'Two modifiers are correctly appended in precedence order'
  );
  assert(twoModHeadline.modifierBadges.length === 2, 'modifierBadges contains exactly 2 modifiers');

  // Three modifiers active: ACCRUAL_TRAP + PRICE_EXTENDED + ANALYTICAL_DIVERGENCE -> Max 2 displayed!
  const threeModAttention: AttentionResult = {
    ...baseAttention,
    level: 'WATCH',
    primaryDriver: 'ACCRUAL_TRAP',
    drivers: [
      { type: 'ACCRUAL_TRAP', severity: 'WATCH', description: 'Accrual penalty.' },
      { type: 'PRICE_EXTENDED', severity: 'WATCH', description: 'Price extended.' },
      { type: 'ANALYTICAL_DIVERGENCE', severity: 'WATCH', description: 'Divergence.' },
    ],
  };
  const threeModHeadline = evaluateHeadline(cell05Rel, threeModAttention, false);
  assert(
    threeModHeadline.modifierBadges.length === 2,
    'Strict display ceiling: exactly 2 modifiers displayed when 3 are active'
  );
  assert(
    threeModHeadline.modifierBadges[0] === '[Accrual Disconnect Warning]' &&
    threeModHeadline.modifierBadges[1] === '[Price Extended]',
    'Modifiers are ordered strictly: Accrual Disconnect Warning > Price Extended'
  );
  assert(
    !threeModHeadline.headline.includes('[Analytical Divergence]'),
    'Third modifier [Analytical Divergence] is truncated from headline string'
  );

  // ============================================================
  // TEST GROUP 8: EXACT BADGE STRINGS & LANGUAGE SAFETY AUDIT
  // ============================================================
  console.log('\n--- TEST GROUP 8: EXACT BADGES & LANGUAGE SAFETY ---');

  const allBadges = Object.values(HEADLINE_BADGES);
  assert(allBadges.length === 9, 'Exactly 9 canonical headline badge constants defined');

  const forbiddenTerms = [
    'buy', 'sell', 'accumulate', 'exit', 're-enter', 'wait for',
    'will recover', 'will fall', 'reversal expected', 'temporary correction',
    'smart money', 'institutional', 'caused by', 'driven by'
  ];

  let violations = 0;
  const sampleHeadlines = [
    normalHeadline, breachHeadline, quarantineHeadline, approachingHeadline,
    cell30Headline, h06, h12, h18, h24, h25, h26, h27, h28, h29,
    accrualHeadline, twoModHeadline, threeModHeadline
  ];

  for (const h of sampleHeadlines) {
    const textLower = h.headline.toLowerCase();
    for (const term of forbiddenTerms) {
      if (textLower.includes(term)) {
        violations++;
        console.error(`Violation in headline "${h.headline}": contains forbidden term "${term}"`);
      }
    }
  }
  assert(violations === 0, 'Zero forbidden/recommendation/predictive/causal terms across all headlines');

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n===========================================================');
  console.log(`TOTAL HEADLINE TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('===========================================================');

  if (passed === total) {
    console.log('🌟 ALL PHASE 1E HEADLINE ENGINE TESTS VERIFIED & PASSED!\n');
  } else {
    console.error('💥 SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runHeadlineTests().catch(err => {
  console.error('Fatal error in Headline tests:', err);
  process.exit(1);
});
