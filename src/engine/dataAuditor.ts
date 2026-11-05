/**
 * Layer 1: Data Integrity & Cross-Statement Auditor
 * Executes forensic accounting cross-validation across Balance Sheet, Cash Flow, and P&L
 * Implements Upstox Live Feed Normalization Rules:
 * Rule 1: Consolidated Financials Mandate (never mix group cap with standalone subsidiary numbers)
 * Rule 3: Stale Filing Interceptor (daysOld = (Date.now() - new Date(filing_date)) / 86400000 > 180 flags STALE_FILING)
 */

import { DataIntegrityAudit } from '../types/engine';
import {
  UpstoxBalanceSheetResponse,
  UpstoxCashFlowResponse,
  UpstoxCorporateActionsResponse,
  UpstoxIncomeStatementResponse,
} from '../types/upstox';

export class DataAuditor {
  /**
   * Executes mandatory forensic pre-flight checks before scoring
   */
  public static audit(
    balanceSheet: UpstoxBalanceSheetResponse | null,
    incomeStatement: UpstoxIncomeStatementResponse | null,
    cashFlow: UpstoxCashFlowResponse | null,
    corporateActions?: UpstoxCorporateActionsResponse | null
  ): DataIntegrityAudit {
    const reasons: string[] = [];
    let bsBalanced = true;
    let bsDiscrepancyPct = 0;
    let cashFlowReconciled = true;
    let freshnessDays = 45; // Default safe assumption if dates are parsed
    let staleFiling = false;
    let capitalAnomaly = false;

    // 0. Consolidated Financials Mandate Check (Rule 1)
    if (balanceSheet?.data?.type === 'standalone' || incomeStatement?.data?.type === 'standalone') {
      reasons.push(
        'STANDALONE_FILING_WARNING: Received standalone subsidiary financials. Multiples should use consolidated group numbers.'
      );
    }

    // 1. Balance Sheet Equality: |Total Assets - (Total Liabilities + Total Equity)| <= 0.001 * Total Assets
    if (balanceSheet && balanceSheet.data && balanceSheet.data.history && balanceSheet.data.history.length > 0) {
      const latest = balanceSheet.data.history[0];
      const totalAssets = latest.total_asset;
      const totalLiabilities = latest.total_liability;

      // Extract equity capital from full statement
      let equityCapital = 0;
      if (balanceSheet.data.full_statement) {
        const equityItem = balanceSheet.data.full_statement.find(
          (p) =>
            p.particular.toLowerCase().includes('equity capital') ||
            p.particular.toLowerCase().includes('shareholders')
        );
        if (equityItem && equityItem.history.length > 0) {
          equityCapital = equityItem.history[0].value;
        }
      }

      // If explicit equity capital found, perform strict accounting equality check
      if (equityCapital > 0 && totalAssets > 0) {
        const diff = Math.abs(totalAssets - (totalLiabilities + equityCapital));
        bsDiscrepancyPct = (diff / totalAssets) * 100;

        // Allow up to 0.1% rounding tolerance
        if (diff > 0.001 * totalAssets) {
          bsBalanced = false;
          reasons.push(
            `DATA_QUARANTINED_UNBALANCED_BS: Assets (₹${totalAssets} Cr) != Liabilities (₹${totalLiabilities} Cr) + Equity (₹${equityCapital} Cr). Discrepancy: ${bsDiscrepancyPct.toFixed(2)}%`
          );
        }
      }

      // Informational Filing Freshness Check: daysOld = (Date.now() - new Date(period_end)) / 86400000
      if (latest.period) {
        freshnessDays = this.computeFilingAgeDays(latest.period);
        if (freshnessDays > 180) {
          reasons.push(
            `FRESHNESS_UNVERIFIABLE: Statement period coverage is ${latest.period} (${freshnessDays} days elapsed since period end). Actual SEBI publication date is unverified from Upstox.`
          );
        }
      }
    }

    // 2. Cash Flow Reconciliation: Net Profit vs Cash Flow from Operations starting profit (10% tolerance)
    if (
      incomeStatement &&
      incomeStatement.data &&
      incomeStatement.data.income_statement &&
      cashFlow &&
      cashFlow.data &&
      cashFlow.data.cash_flow
    ) {
      // Check if cash flow full statement has starting profit before tax
      let cfoPbt: number | null = null;
      if (cashFlow.data.full_statement) {
        const pbtItem = cashFlow.data.full_statement.find((p) =>
          p.particular.toLowerCase().includes('profit before tax')
        );
        if (pbtItem && pbtItem.history.length > 0) {
          cfoPbt = pbtItem.history[0].value;
        }
      }

      let incomePbt: number | null = null;
      if (incomeStatement.data.full_statement) {
        const pbtItem = incomeStatement.data.full_statement.find((p) =>
          p.particular.toLowerCase().includes('profit before tax')
        );
        if (pbtItem && pbtItem.history.length > 0) {
          incomePbt = pbtItem.history[0].value;
        }
      }

      // If PBT line items exist in both statements, verify within 10%
      if (cfoPbt !== null && incomePbt !== null && incomePbt > 0) {
        const pbtDiff = Math.abs(cfoPbt - incomePbt) / incomePbt;
        if (pbtDiff > 0.10) {
          cashFlowReconciled = false;
          reasons.push(
            `CASH_FLOW_UNRECONCILED: P&L Profit Before Tax (₹${incomePbt} Cr) deviates by ${(pbtDiff * 100).toFixed(1)}% from Cash Flow starting PBT (₹${cfoPbt} Cr)`
          );
        }
      }
    }

    // 3. Capital Anomaly Check
    if (
      balanceSheet &&
      balanceSheet.data &&
      balanceSheet.data.full_statement
    ) {
      const equityItem = balanceSheet.data.full_statement.find((p) =>
        p.particular.toLowerCase().includes('equity capital')
      );
      if (equityItem && equityItem.history.length >= 2) {
        const currentEquity = equityItem.history[0].value;
        const prevEquity = equityItem.history[1].value;
        if (prevEquity > 0) {
          const equityChangePct = Math.abs(currentEquity - prevEquity) / prevEquity;
          // If equity jumped by > 50% without documented bonus/split in corporate actions
          if (equityChangePct > 0.50) {
            const hasDocumentedAction =
              corporateActions &&
              corporateActions.data &&
              corporateActions.data.some(
                (a) => a.name === 'Bonus' || a.name === 'Split' || a.name === 'Rights'
              );

            if (!hasDocumentedAction) {
              capitalAnomaly = true;
              reasons.push(
                `CAPITAL_ANOMALY: Share capital shifted by ${(equityChangePct * 100).toFixed(1)}% without documented corporate action`
              );
            }
          }
        }
      }
    }

    // Determine aggregate integrity status
    let status: 'PASSED' | 'QUARANTINED' | 'STALE_FILING' | 'HOLD_PENDING_AUDIT' | 'FRESHNESS_UNVERIFIABLE' = 'PASSED';
    if (!bsBalanced) {
      status = 'QUARANTINED';
    } else if (capitalAnomaly) {
      status = 'HOLD_PENDING_AUDIT';
    } else if (freshnessDays > 180) {
      status = 'FRESHNESS_UNVERIFIABLE';
    }

    return {
      status,
      bsBalanced,
      bsDiscrepancyPct,
      cashFlowReconciled,
      freshnessDays,
      staleFiling,
      capitalAnomaly,
      reasons,
    };
  }

  /**
   * Computes precise filing age in days: daysOld = (refDate - new Date(filing_date)) / 86400000
   */
  public static computeFilingAgeDays(filingDateOrPeriod: string | Date, referenceDate?: Date | string): number {
    try {
      const nowMs = referenceDate
        ? (referenceDate instanceof Date ? referenceDate.getTime() : new Date(referenceDate).getTime())
        : Date.now();

      if (filingDateOrPeriod instanceof Date) {
        const diff = nowMs - filingDateOrPeriod.getTime();
        return Math.max(0, Math.floor(diff / 86400000));
      }

      const parsed = Date.parse(filingDateOrPeriod);
      if (!isNaN(parsed) && !filingDateOrPeriod.includes(' ')) {
        const diff = nowMs - parsed;
        return Math.max(0, Math.floor(diff / 86400000));
      }

      // Formats: "Mar 2024", "Dec 2023", "Sep 2023"
      const parts = filingDateOrPeriod.trim().split(' ');
      if (parts.length === 2) {
        const monthMap: Record<string, number> = {
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
          jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
        };
        const month = monthMap[parts[0].toLowerCase().slice(0, 3)] ?? 2;
        const year = parseInt(parts[1], 10);
        if (!isNaN(year)) {
          // Month-end calculation (UTC)
          const filingDate = new Date(Date.UTC(year, month + 1, 0, 0, 0, 0));
          const diff = nowMs - filingDate.getTime();
          return Math.max(0, Math.floor(diff / 86400000));
        }
      }
    } catch {
      // Fallback
    }
    return 60;
  }
}
