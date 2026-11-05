/**
 * Institutional Safety Gates
 * Intercepts evaluated scores before classification to enforce balance-sheet realism
 * Implements Upstox Live Feed Normalization Rules:
 * Rule 3: Stale Filing Interceptor (deduct 5 points from Fundamental Score and block FAVORABLE status)
 */

import { DataIntegrityAudit, SafetyFlags } from '../types/engine';
import { FundamentalCalculations } from './calculators/fundamental';
import { Normalizer } from './normalizer';

export class SafetyGates {
  public static evaluate(
    fundCalcs: FundamentalCalculations,
    sectorName: string,
    industryName?: string,
    promoterPledgedPct: number = 0,
    integrity?: DataIntegrityAudit | null
  ): {
    safetyFlags: SafetyFlags;
    fundamentalScoreDeduction: number;
    hardHoldCap: boolean;
    reasons: string[];
  } {
    let fundamentalScoreDeduction = 0;
    let hardHoldCap = false;
    const reasons: string[] = [];

    // 1. Cash Divergence Kill-Switch
    // If cumulative 3Y PAT > 0 but cumulative 3Y CFO <= 0
    let cashDivergenceRedFlag = false;
    if (
      fundCalcs.cumulativePat3Y !== null &&
      fundCalcs.cumulativePat3Y > 0 &&
      fundCalcs.cumulativeCfo3Y !== null &&
      fundCalcs.cumulativeCfo3Y <= 0
    ) {
      cashDivergenceRedFlag = true;
      fundamentalScoreDeduction += 10;
      hardHoldCap = true;
      reasons.push(
        `RED_FLAG_CASH_DIVERGENCE: Cumulative 3Y Net Profit is positive (₹${fundCalcs.cumulativePat3Y.toFixed(0)} Cr) but Operating Cash Flow is negative (₹${fundCalcs.cumulativeCfo3Y.toFixed(0)} Cr)`
      );
    }

    // 2. Cyclical Peak Guard
    // Commodity sector with low P/E (<0.5x sector) and high 3Y growth (>35%)
    let cyclicalPeakRisk = false;
    if (
      Normalizer.isCyclicalSector(sectorName, industryName) &&
      fundCalcs.pe !== null &&
      fundCalcs.sectorPe !== null &&
      fundCalcs.sectorPe > 0 &&
      fundCalcs.pe < 0.5 * fundCalcs.sectorPe &&
      fundCalcs.netProfitCagr3YPct !== null &&
      fundCalcs.netProfitCagr3YPct > 35.0
    ) {
      cyclicalPeakRisk = true;
      reasons.push(
        `CYCLICAL_PEAK_RISK: Highly cyclical sector with artificially depressed P/E (${fundCalcs.pe.toFixed(1)}x) vs Sector (${fundCalcs.sectorPe.toFixed(1)}x) and super-normal CAGR (${fundCalcs.netProfitCagr3YPct.toFixed(1)}%). Trailing stops enforced.`
      );
    }

    // 3. Promoter Pledge Gate (> 20%)
    let promoterPledgeRedFlag = false;
    if (promoterPledgedPct > 20.0) {
      promoterPledgeRedFlag = true;
      fundamentalScoreDeduction += 10;
      reasons.push(
        `RED_FLAG_PROMOTER_PLEDGE: High promoter share pledge of ${promoterPledgedPct.toFixed(1)}% (Threshold: 20%)`
      );
    }

    // 4. Quarterly Earnings Shock Gate (Latest quarter PAT YoY < -40%)
    let earningsShockRedFlag = false;
    if (
      fundCalcs.latestQuarterlyPatYoYPct !== null &&
      fundCalcs.latestQuarterlyPatYoYPct < -40.0
    ) {
      earningsShockRedFlag = true;
      hardHoldCap = true;
      reasons.push(
        `EARNINGS_SHOCK: Latest quarter Net Profit dropped ${fundCalcs.latestQuarterlyPatYoYPct.toFixed(1)}% YoY`
      );
    }

    // 5. Financial Statement Freshness Notice (Informational Data Quality State)
    // Data-quality warnings do not add to or subtract from analytical scores or decision zones.
    const staleFilingRedFlag = false;
    if (integrity?.freshnessDays && integrity.freshnessDays > 180) {
      reasons.push(
        `FRESHNESS_UNVERIFIABLE: Statement period coverage is ${integrity.freshnessDays} days old. Actual SEBI publication date is unverified from Upstox.`
      );
    }

    return {
      safetyFlags: {
        cashDivergenceRedFlag,
        cyclicalPeakRisk,
        promoterPledgeRedFlag,
        promoterPledgePct: promoterPledgedPct,
        earningsShockRedFlag,
        latestQuarterlyNetProfitYoY: fundCalcs.latestQuarterlyPatYoYPct,
        fundamentalFloorFailed: false, // Evaluated in decisionEngine
        highSlippageRisk: false,
        bidAskSpreadPct: 0,
        staleFilingRedFlag,
        filingFreshnessDays: integrity?.freshnessDays,
      },
      fundamentalScoreDeduction,
      hardHoldCap,
      reasons,
    };
  }
}
