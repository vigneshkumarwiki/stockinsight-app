/**
 * Fundamental Metric Calculators
 * Derives compounding growth, cash conversion, and balance sheet solvency from Upstox statements
 */

import {
  UpstoxBalanceSheetResponse,
  UpstoxCashFlowResponse,
  UpstoxIncomeStatementResponse,
  UpstoxKeyRatiosResponse,
} from '../../types/upstox';
import { ProfitGrowthResult } from '../../types/engine';
import { SafeParser } from '../safeParser';

export interface FundamentalCalculations {
  pe: number | null;
  sectorPe: number | null;
  pb: number | null;
  sectorPb: number | null;
  evEbitda: number | null;
  sectorEvEbitda: number | null;
  roe: number | null;
  roce: number | null;
  roa: number | null;
  opmPct: number | null;
  netProfitCagr3YPct: number | null;
  profitGrowthResult?: ProfitGrowthResult;
  debtToEquity: number | null;
  cfoToEbitdaRatio: number | null;
  cumulativeCfo3Y: number | null;
  cumulativePat3Y: number | null;
  latestQuarterlyPatYoYPct: number | null;
  provisionGrowthPct: number | null;
}

export class FundamentalCalculator {
  /**
   * Extracts a ratio from Upstox key-ratios response
   */
  public static extractRatio(
    keyRatios: UpstoxKeyRatiosResponse | null,
    ratioName: string
  ): { companyValue: number | null; sectorValue: number | null } {
    if (!keyRatios || !keyRatios.data) {
      return { companyValue: null, sectorValue: null };
    }

    const item = keyRatios.data.find(
      (r) => r.name.toLowerCase() === ratioName.toLowerCase()
    );

    if (!item) {
      return { companyValue: null, sectorValue: null };
    }

    return {
      companyValue: SafeParser.parseNumeric(item.company_value),
      sectorValue: SafeParser.parseNumeric(item.sector_value),
    };
  }

  /**
   * Calculates 3-Year Compound Annual Growth Rate (CAGR) for Net Profit
   * Formula: (PAT_T / PAT_T-3)^(1/3) - 1 (Geometric CAGR calculated ONLY when both endpoints > 0)
   */
  public static calculateNetProfitCAGR3Y(
    incomeStatement: UpstoxIncomeStatementResponse | null
  ): number | null {
    const result = this.evaluateProfitGrowth(incomeStatement);
    return result.cagr3YPct;
  }

  /**
   * Evaluates 3-Year Profit Growth using the Option B exhaustive financial state partition.
   * Geometric CAGR is calculated ONLY when both endpoint PAT values (T and T-3) are strictly positive.
   * Distinguishes sustained compounding, turnaround, loss reduction, and other non-positive regimes.
   */
  public static evaluateProfitGrowth(
    incomeStatement: UpstoxIncomeStatementResponse | null
  ): ProfitGrowthResult {
    const fallbackMissing: ProfitGrowthResult = {
      state: 'MISSING',
      cagr3YPct: null,
      patT: null,
      patTminus3: null,
      intermediateLoss: false,
      historyValues: [],
      displayValue: null,
      explanation: '3Y CAGR not available (insufficient financial history)',
    };

    if (!incomeStatement || !incomeStatement.data || !incomeStatement.data.income_statement) {
      return fallbackMissing;
    }

    const netProfitCategory = incomeStatement.data.income_statement.find(
      (c) => c.category.toLowerCase() === 'net_profit'
    );

    if (!netProfitCategory || !netProfitCategory.history || netProfitCategory.history.length < 4) {
      return fallbackMissing;
    }

    // Require all 4 annual observations [T, T-1, T-2, T-3] to have valid finite numeric values
    const historySlice = netProfitCategory.history.slice(0, 4);
    const historyValues: number[] = [];
    for (const h of historySlice) {
      if (typeof h.value !== 'number' || !Number.isFinite(h.value)) {
        return fallbackMissing;
      }
      historyValues.push(h.value);
    }

    // index 0 is most recent year (T), index 3 is 3 years prior (T-3)
    const patT = historyValues[0];
    const patTminus1 = historyValues[1];
    const patTminus2 = historyValues[2];
    const patTminus3 = historyValues[3];

    const intermediateLoss = patTminus1 < 0 || patTminus2 < 0;
    const lossSuffix = intermediateLoss ? ' (with intermediate-year loss)' : '';

    // 1. Positive to Positive: Geometric CAGR
    if (patTminus3 > 0 && patT > 0) {
      const cagr = (Math.pow(patT / patTminus3, 1 / 3) - 1) * 100;
      return {
        state: 'PROFIT_COMPOUNDING',
        cagr3YPct: cagr,
        patT,
        patTminus3,
        intermediateLoss,
        historyValues,
        displayValue: `${cagr >= 0 ? '+' : ''}${cagr.toFixed(1)}%`,
        explanation: `${cagr.toFixed(1)}% CAGR (₹${patTminus3.toFixed(0)} Cr -> ₹${patT.toFixed(0)} Cr)${lossSuffix}`,
      };
    }

    // 2. Negative to Positive: Turnaround from Loss
    if (patTminus3 < 0 && patT > 0) {
      return {
        state: 'TURNAROUND_FROM_LOSS',
        cagr3YPct: null,
        patT,
        patTminus3,
        intermediateLoss,
        historyValues,
        displayValue: 'Turnaround',
        explanation: `Turnaround: Company recovered from loss (₹${patTminus3.toFixed(0)} Cr) in base year to profit (₹${patT.toFixed(0)} Cr)${lossSuffix}`,
      };
    }

    // 3. Zero to Positive: Turnaround from Zero
    if (patTminus3 === 0 && patT > 0) {
      return {
        state: 'TURNAROUND_FROM_ZERO',
        cagr3YPct: null,
        patT,
        patTminus3,
        intermediateLoss,
        historyValues,
        displayValue: 'Turnaround',
        explanation: `Turnaround: Company generated positive profit (₹${patT.toFixed(0)} Cr) from zero base in base year${lossSuffix}`,
      };
    }

    // 4. Negative to Zero: Recovery to Breakeven
    if (patTminus3 < 0 && patT === 0) {
      return {
        state: 'RECOVERY_TO_BREAKEVEN',
        cagr3YPct: null,
        patT,
        patTminus3,
        intermediateLoss,
        historyValues,
        displayValue: 'Breakeven',
        explanation: `Recovery to breakeven: Net loss (₹${patTminus3.toFixed(0)} Cr) reduced to ₹0 Cr, but zero current profitability${lossSuffix}`,
      };
    }

    // 5-7. Negative to Negative
    if (patTminus3 < 0 && patT < 0) {
      if (patT > patTminus3) {
        // Loss contracted (e.g. -300 to -50)
        return {
          state: 'LOSS_REDUCTION',
          cagr3YPct: null,
          patT,
          patTminus3,
          intermediateLoss,
          historyValues,
          displayValue: 'Loss Reduction',
          explanation: `Loss reduction: Net loss reduced from ₹${patTminus3.toFixed(0)} Cr to ₹${patT.toFixed(0)} Cr, but company remains loss-making`,
        };
      } else if (patT < patTminus3) {
        // Loss widened (e.g. -50 to -300)
        return {
          state: 'LOSS_EXPANSION',
          cagr3YPct: null,
          patT,
          patTminus3,
          intermediateLoss,
          historyValues,
          displayValue: 'Loss Expansion',
          explanation: `Loss expansion: Net loss widened from ₹${patTminus3.toFixed(0)} Cr to ₹${patT.toFixed(0)} Cr`,
        };
      } else {
        // Persistent equal loss
        return {
          state: 'PERSISTENT_LOSS',
          cagr3YPct: null,
          patT,
          patTminus3,
          intermediateLoss,
          historyValues,
          displayValue: 'Persistent Loss',
          explanation: `Persistent net loss: Unchanged net loss of ₹${patT.toFixed(0)} Cr`,
        };
      }
    }

    // 8. Positive to Non-Positive: Profit Collapse
    if (patTminus3 > 0 && patT <= 0) {
      return {
        state: 'PROFIT_COLLAPSE',
        cagr3YPct: null,
        patT,
        patTminus3,
        intermediateLoss,
        historyValues,
        displayValue: 'Profit Collapse',
        explanation: `Profit collapse: Profit fell from ₹${patTminus3.toFixed(0)} Cr in base year to ${patT < 0 ? `net loss (₹${patT.toFixed(0)} Cr)` : '₹0 Cr'}`,
      };
    }

    // 9. Zero to Negative: Deterioration into Loss
    if (patTminus3 === 0 && patT < 0) {
      return {
        state: 'ZERO_TO_LOSS',
        cagr3YPct: null,
        patT,
        patTminus3,
        intermediateLoss,
        historyValues,
        displayValue: 'Deterioration to Loss',
        explanation: `Deterioration: Slid from zero profit in base year to net loss (₹${patT.toFixed(0)} Cr)`,
      };
    }

    // 10. Flat Zero (0 -> 0)
    return {
      state: 'FLAT_ZERO',
      cagr3YPct: null,
      patT,
      patTminus3,
      intermediateLoss,
      historyValues,
      displayValue: 'Flat Zero',
      explanation: 'Flat zero earnings over 3-year period',
    };
  }

  /**
   * Normalizes period identifiers for safe matching across statements.
   * Handles variations like "Mar 2024", "MAR 2024", "2024-03-31", "FY24", etc.
   */
  public static normalizePeriod(p?: string | null): string {
    if (!p) return '';
    return p.trim().toUpperCase().replace(/[\s\-_/]+/g, ' ');
  }

  /**
   * Calculates Operating Margin (OPM %) = (Operating Profit / Revenue) * 100
   */
  public static calculateOPM(
    incomeStatement: UpstoxIncomeStatementResponse | null
  ): number | null {
    if (!incomeStatement || !incomeStatement.data || !incomeStatement.data.income_statement) {
      return null;
    }

    const revCategory = incomeStatement.data.income_statement.find(
      (c) => c.category.toLowerCase() === 'revenue'
    );
    const opCategory = incomeStatement.data.income_statement.find(
      (c) => c.category.toLowerCase() === 'operating_profit'
    );

    if (!revCategory || !opCategory || !revCategory.history.length || !opCategory.history.length) {
      return null;
    }

    const latestRevenue = revCategory.history[0].value;
    const latestOperatingProfit = opCategory.history[0].value;

    if (latestRevenue <= 0) return null;

    return (latestOperatingProfit / latestRevenue) * 100;
  }

  /**
   * Calculates Debt-to-Equity (D/E) = Total Liabilities / Equity Capital
   * Guarantees equity and liabilities are matched to the exact same reporting period.
   */
  public static calculateDebtToEquity(
    balanceSheet: UpstoxBalanceSheetResponse | null
  ): number | null {
    if (!balanceSheet || !balanceSheet.data) return null;

    // Check history first
    if (balanceSheet.data.history && balanceSheet.data.history.length > 0) {
      const latest = balanceSheet.data.history[0];
      const totalLiabilities = latest.total_liability;
      const targetPeriod = this.normalizePeriod(latest.period);
      
      // Look for Equity Capital in full_statement if available, matched to targetPeriod
      let equity: number | null = null;
      if (balanceSheet.data.full_statement) {
        const equityItem = balanceSheet.data.full_statement.find(
          (p) => p.particular.toLowerCase().includes('equity capital') || p.particular.toLowerCase().includes('shareholders')
        );
        if (equityItem && equityItem.history && equityItem.history.length > 0) {
          const matchedEquity = targetPeriod
            ? equityItem.history.find((h) => this.normalizePeriod(h.period) === targetPeriod)
            : equityItem.history[0];
          if (matchedEquity && typeof matchedEquity.value === 'number') {
            equity = matchedEquity.value;
          }
        }
      }

      // Fallback: Total Assets - Total Liabilities for the same period record
      if (equity === null || equity <= 0) {
        if (typeof latest.total_asset === 'number' && typeof latest.total_liability === 'number') {
          equity = latest.total_asset - latest.total_liability;
        }
      }

      if (equity === null) return null;
      if (equity <= 0) return 999; // Negative net worth = extreme leverage
      if (typeof totalLiabilities !== 'number' || totalLiabilities < 0) return null;

      return totalLiabilities / equity;
    }

    return null;
  }

  /**
   * Calculates Cash Flow Conversion & 3-Year Cumulative CFO vs PAT
   * Enforces statement-base compatibility and explicit fiscal period alignment.
   */
  public static calculateCashFlowMetrics(
    cashFlow: UpstoxCashFlowResponse | null,
    incomeStatement: UpstoxIncomeStatementResponse | null
  ): {
    cfoToEbitdaRatio: number | null;
    cumulativeCfo3Y: number | null;
    cumulativePat3Y: number | null;
  } {
    if (!cashFlow || !cashFlow.data || !cashFlow.data.cash_flow) {
      return { cfoToEbitdaRatio: null, cumulativeCfo3Y: null, cumulativePat3Y: null };
    }

    const opCashFlow = cashFlow.data.cash_flow.find(
      (c) => c.category.toLowerCase() === 'operating'
    );

    if (!opCashFlow || !opCashFlow.history || opCashFlow.history.length === 0) {
      return { cfoToEbitdaRatio: null, cumulativeCfo3Y: null, cumulativePat3Y: null };
    }

    // Latest Operating Cash Flow record
    const latestCfoRecord = opCashFlow.history[0];
    const latestCfoPeriod = this.normalizePeriod(latestCfoRecord.period);
    const latestCFO = latestCfoRecord.value;

    // Cumulative 3Y CFO
    const cfoHistorySlice = opCashFlow.history.slice(0, Math.min(3, opCashFlow.history.length));
    const cumulativeCfo3Y = cfoHistorySlice.reduce((sum, h) => sum + h.value, 0);

    // Verify statement base compatibility (consolidated vs standalone)
    const basesCompatible = !incomeStatement?.data?.type || !cashFlow.data.type ||
      incomeStatement.data.type === cashFlow.data.type;

    let cumulativePat3Y: number | null = null;
    let latestEBITDA: number | null = null;
    let matchedEbitdaFound = false;

    if (basesCompatible && incomeStatement && incomeStatement.data && incomeStatement.data.income_statement) {
      const netProfitCat = incomeStatement.data.income_statement.find(
        (c) => c.category.toLowerCase() === 'net_profit'
      );
      const opProfitCat = incomeStatement.data.income_statement.find(
        (c) => c.category.toLowerCase() === 'operating_profit'
      );

      // Symmetrical 3Y Cumulative PAT matching
      if (netProfitCat && netProfitCat.history && netProfitCat.history.length > 0) {
        const matchedPatValues: number[] = [];
        for (const cfoItem of cfoHistorySlice) {
          const cfoP = this.normalizePeriod(cfoItem.period);
          const matchedPat = cfoP
            ? netProfitCat.history.find((p) => this.normalizePeriod(p.period) === cfoP)
            : undefined;
          if (matchedPat && typeof matchedPat.value === 'number') {
            matchedPatValues.push(matchedPat.value);
          }
        }

        // If all 3Y periods matched symmetrically
        if (matchedPatValues.length === cfoHistorySlice.length && matchedPatValues.length > 0) {
          cumulativePat3Y = matchedPatValues.reduce((sum, v) => sum + v, 0);
        } else {
          // If periods were unlabelled or mismatched between mock/legacy datasets, fall back to positional slice
          const patSlice = netProfitCat.history.slice(0, Math.min(3, netProfitCat.history.length));
          cumulativePat3Y = patSlice.reduce((sum, h) => sum + h.value, 0);
        }
      }

      // Match EBITDA by explicit normalized period
      if (opProfitCat && opProfitCat.history && opProfitCat.history.length > 0) {
        if (latestCfoPeriod) {
          const matchedOpProfit = opProfitCat.history.find(
            (h) => this.normalizePeriod(h.period) === latestCfoPeriod
          );
          if (matchedOpProfit && typeof matchedOpProfit.value === 'number') {
            latestEBITDA = matchedOpProfit.value;
            matchedEbitdaFound = true;
          }
        } else {
          // Unlabeled period fallback
          latestEBITDA = opProfitCat.history[0].value;
          matchedEbitdaFound = true;
        }
      }
    }

    let cfoToEbitdaRatio: number | null = null;
    if (matchedEbitdaFound && latestEBITDA !== null && latestEBITDA > 0) {
      cfoToEbitdaRatio = latestCFO / latestEBITDA;
    } else if (!latestEBITDA && !matchedEbitdaFound && (!incomeStatement?.data?.income_statement?.find((c) => c.category.toLowerCase() === 'operating_profit')) && cumulativePat3Y !== null && cumulativePat3Y > 0) {
      cfoToEbitdaRatio = cumulativeCfo3Y / cumulativePat3Y;
    }

    return { cfoToEbitdaRatio, cumulativeCfo3Y, cumulativePat3Y };
  }

  /**
   * Tracks quarterly earnings shock (Latest quarterly PAT YoY % change)
   */
  public static calculateQuarterlyYoY(
    quarterlyIncomeStatement: UpstoxIncomeStatementResponse | null
  ): number | null {
    if (!quarterlyIncomeStatement || !quarterlyIncomeStatement.data || !quarterlyIncomeStatement.data.income_statement) {
      return null;
    }

    const netProfitCat = quarterlyIncomeStatement.data.income_statement.find(
      (c) => c.category.toLowerCase() === 'net_profit'
    );

    if (!netProfitCat || !netProfitCat.history || netProfitCat.history.length === 0) {
      return null;
    }

    // Check if Upstox provides direct `change` string like "+18.35%" or "-42.10%"
    const latest = netProfitCat.history[0];
    if (latest.change) {
      return SafeParser.parseNumeric(latest.change);
    }

    // If change string missing, compare with 4 quarters ago (index 4)
    if (netProfitCat.history.length >= 5) {
      const current = latest.value;
      const yearAgo = netProfitCat.history[4].value;
      if (yearAgo !== 0) {
        return ((current - yearAgo) / Math.abs(yearAgo)) * 100;
      }
    }

    return null;
  }

  /**
   * Tracks bank implicit provision growth (Operating Profit - PBT)
   */
  public static calculateProvisionGrowth(
    incomeStatement: UpstoxIncomeStatementResponse | null
  ): number | null {
    if (!incomeStatement || !incomeStatement.data || !incomeStatement.data.full_statement) {
      return null;
    }

    const full = incomeStatement.data.full_statement;
    const opProfitItem = full.find((p) => p.particular.toLowerCase().includes('operating profit'));
    const pbtItem = full.find((p) => p.particular.toLowerCase().includes('profit before tax'));

    if (opProfitItem && pbtItem && opProfitItem.history.length >= 2 && pbtItem.history.length >= 2) {
      const provCurrent = opProfitItem.history[0].value - pbtItem.history[0].value;
      const provPrev = opProfitItem.history[1].value - pbtItem.history[1].value;

      if (provPrev > 0) {
        return ((provCurrent - provPrev) / provPrev) * 100;
      }
    }

    return null;
  }

  /**
   * Executes full suite of fundamental calculations
   */
  public static compute(
    keyRatios: UpstoxKeyRatiosResponse | null,
    annualIncome: UpstoxIncomeStatementResponse | null,
    quarterlyIncome: UpstoxIncomeStatementResponse | null,
    balanceSheet: UpstoxBalanceSheetResponse | null,
    cashFlow: UpstoxCashFlowResponse | null
  ): FundamentalCalculations {
    const pe = this.extractRatio(keyRatios, 'P/E');
    const pb = this.extractRatio(keyRatios, 'P/B');
    const evEbitda = this.extractRatio(keyRatios, 'EV/EBITDA');
    const roe = this.extractRatio(keyRatios, 'ROE');
    const roce = this.extractRatio(keyRatios, 'ROCE');
    const roa = this.extractRatio(keyRatios, 'ROA');

    const opmPct = this.calculateOPM(annualIncome);
    const profitGrowthResult = this.evaluateProfitGrowth(annualIncome);
    const netProfitCagr3YPct = profitGrowthResult.cagr3YPct;
    const debtToEquity = this.calculateDebtToEquity(balanceSheet);

    const { cfoToEbitdaRatio, cumulativeCfo3Y, cumulativePat3Y } = this.calculateCashFlowMetrics(
      cashFlow,
      annualIncome
    );

    const latestQuarterlyPatYoYPct = this.calculateQuarterlyYoY(quarterlyIncome);
    const provisionGrowthPct = this.calculateProvisionGrowth(annualIncome);

    return {
      pe: pe.companyValue,
      sectorPe: pe.sectorValue,
      pb: pb.companyValue,
      sectorPb: pb.sectorValue,
      evEbitda: evEbitda.companyValue,
      sectorEvEbitda: evEbitda.sectorValue,
      roe: roe.companyValue,
      roce: roce.companyValue,
      roa: roa.companyValue,
      opmPct,
      netProfitCagr3YPct,
      profitGrowthResult,
      debtToEquity,
      cfoToEbitdaRatio,
      cumulativeCfo3Y,
      cumulativePat3Y,
      latestQuarterlyPatYoYPct,
      provisionGrowthPct,
    };
  }
}
