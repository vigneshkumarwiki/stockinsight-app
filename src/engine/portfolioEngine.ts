/**
 * STOCKINSIGHT Institutional Portfolio Engine
 * Computes Capital-Weighted Quality Scores, Sector Concentration Guards,
 * Dynamic Stop-Loss Breaches, and Accrual Trap Flags.
 */

import { StockInsightEvaluation } from '../types/engine';
import {
  Holding,
  HoldingActionBadge,
  HoldingWithEvaluation,
  PortfolioRiskAnalytics,
  SectorConcentration,
} from '../types/portfolio';

/**
 * Normalizes sector strings to canonical names across case, spacing, and punctuation variations.
 */
export function normalizeSectorName(rawSector?: string): string {
  if (!rawSector) return 'Other';
  const clean = rawSector.trim().replace(/\s+/g, ' ');
  const upper = clean.toUpperCase();

  // Canonicalize Banking - Private variations
  if (
    upper === 'BANKING - PRIVATE' ||
    upper === 'PRIVATE BANK' ||
    upper === 'PRIVATE BANKING' ||
    upper.startsWith('BANKING - PRIVATE') ||
    upper === 'BANKING-PRIVATE'
  ) {
    return 'Banking - Private';
  }
  // Canonicalize Banking - Public variations
  if (
    upper === 'BANKING - PUBLIC' ||
    upper === 'PUBLIC BANK' ||
    upper === 'PUBLIC BANKING' ||
    upper.startsWith('BANKING - PUBLIC') ||
    upper === 'BANKING - PSU' ||
    upper === 'BANKING-PUBLIC'
  ) {
    return 'Banking - Public';
  }
  if (upper === 'BANKING - SMALL FINANCE BANK' || upper === 'SMALL FINANCE BANK') {
    return 'Banking - Small Finance Bank';
  }

  return clean;
}

export class PortfolioEngine {
  /**
   * Analyzes an array of portfolio holdings against their quantitative evaluations.
   */
  public static analyze(
    holdings: Holding[],
    evaluations: Map<string, StockInsightEvaluation>
  ): { items: HoldingWithEvaluation[]; analytics: PortfolioRiskAnalytics } {
    let totalInvested = 0;
    let resolvedInvested = 0;
    let totalCurrentValue = 0;
    let totalDayPnl = 0;
    let resolvedCount = 0;

    const sectorValueMap = new Map<string, { invested: number; current: number }>();

    // 1. Process each holding
    const items: HoldingWithEvaluation[] = holdings.map((holding) => {
      const symUpper = holding.symbol.toUpperCase();
      const isinUpper = holding.isin ? holding.isin.toUpperCase() : '';
      const evaluation =
        evaluations.get(symUpper) ||
        (isinUpper ? evaluations.get(isinUpper) : undefined) ||
        Array.from(evaluations.values()).find(
          (e) =>
            e.tradingSymbol.toUpperCase() === symUpper ||
            (isinUpper && e.isin?.toUpperCase() === isinUpper)
        );

      let quoteStatus: import('../types/portfolio').QuoteStatus = 'PENDING';
      let currentLtp: number | null = null;

      if (evaluation) {
        if (
          evaluation.execution.ltp &&
          evaluation.execution.ltp > 0 &&
          Number.isFinite(evaluation.execution.ltp) &&
          evaluation.dataSource !== 'DATA_UNAVAILABLE' &&
          evaluation.dataSource !== 'UPSTOX_DATA_ERROR'
        ) {
          quoteStatus = 'RESOLVED';
          currentLtp = evaluation.execution.ltp;
        } else {
          quoteStatus = 'UNAVAILABLE';
          currentLtp = null;
        }
      } else {
        quoteStatus = 'PENDING';
        currentLtp = null;
      }

      const investedValue = holding.quantity * holding.averageBuyPrice;
      const currentValue = currentLtp !== null ? holding.quantity * currentLtp : null;
      const pnl = currentValue !== null ? currentValue - investedValue : null;
      const pnlPercentage =
        pnl !== null && investedValue > 0 ? (pnl / investedValue) * 100 : null;

      // Net change for today from provider-backed evaluation
      const hasValidNetChange =
        quoteStatus === 'RESOLVED' &&
        evaluation !== undefined &&
        evaluation !== null &&
        typeof evaluation.netChange === 'number' &&
        Number.isFinite(evaluation.netChange);

      const netChange = hasValidNetChange ? evaluation.netChange! : null;
      const dayChange =
        netChange !== null && Number.isFinite(holding.quantity)
          ? netChange * holding.quantity
          : null;
      const dayChangePercentage =
        quoteStatus === 'RESOLVED' &&
        evaluation !== undefined &&
        evaluation !== null &&
        typeof evaluation.netChangePct === 'number' &&
        Number.isFinite(evaluation.netChangePct)
          ? evaluation.netChangePct
          : null;

      totalInvested += investedValue;
      if (currentValue !== null && currentLtp !== null) {
        totalCurrentValue += currentValue;
        resolvedInvested += investedValue;
        if (dayChange !== null && Number.isFinite(dayChange)) {
          totalDayPnl += dayChange;
        }
        resolvedCount++;
      }

      // Sector aggregation
      const sector = normalizeSectorName(holding.sector || evaluation?.sectorName || 'Other');
      const existing = sectorValueMap.get(sector) || { invested: 0, current: 0 };
      sectorValueMap.set(sector, {
        invested: existing.invested + investedValue,
        current: existing.current + (currentValue ?? 0),
      });

      const coreScore = evaluation?.coreScore ?? null;
      const fundamentalScore = evaluation?.fundamentalScore ?? null;
      const technicalScore = evaluation?.technicalScore ?? null;
      const zone = evaluation?.zone ?? 'UNKNOWN';

      // Layer 4 Stop Loss
      const stopLoss = evaluation?.execution.stopLoss ?? null;
      const stopBreached = currentLtp !== null && stopLoss !== null ? currentLtp < stopLoss : false;

      // Optical Gainer / Accrual Trap Flag:
      // If P&L > +15% but Fundamental Score < 25
      const accrualTrapGain =
        pnlPercentage !== null && pnlPercentage > 15.0 && fundamentalScore !== null && fundamentalScore < 25.0;

      // Action Badge Resolution
      let actionBadge: HoldingActionBadge = 'HOLD';
      let actionExplanation = 'Hold position within risk corridor.';

      if (quoteStatus === 'PENDING') {
        actionBadge = 'HOLD';
        actionExplanation = 'Evaluating market data...';
      } else if (quoteStatus === 'UNAVAILABLE') {
        actionBadge = 'CAUTION';
        actionExplanation = 'Market quote unavailable for position.';
      } else if (evaluation?.integrity.status === 'QUARANTINED') {
        actionBadge = 'QUARANTINED';
        actionExplanation = 'Forensic integrity failure: Data quarantined.';
      } else if (stopBreached) {
        actionBadge = 'EXIT_BREACHED';
        actionExplanation = `LTP (₹${currentLtp?.toFixed(2)}) breached dynamic stop (₹${stopLoss?.toFixed(2)}).`;
      } else if (accrualTrapGain) {
        actionBadge = 'HARVEST_PROFIT_ACCRUAL_TRAP';
        actionExplanation = `Optical gain (+${pnlPercentage?.toFixed(1)}%) supported by low fundamental score (${fundamentalScore}/50). Harvest profit.`;
      } else if (evaluation?.execution.status === 'READY_TO_BUY' && zone === 'FAVORABLE') {
        actionBadge = 'READY_TO_BUY';
        actionExplanation = 'Favorable score within execution corridor. Room to accumulate.';
      } else if (zone === 'CAUTION') {
        actionBadge = 'CAUTION';
        actionExplanation = 'Caution zone: Underperforming technicals or elevated fundamental risks.';
      }

      return {
        holding,
        quoteStatus,
        currentLtp,
        investedValue,
        currentValue,
        pnl,
        pnlPercentage,
        dayChange,
        dayChangePercentage,
        coreScore,
        fundamentalScore,
        technicalScore,
        zone,
        stopLoss,
        stopBreached,
        accrualTrapGain,
        actionBadge,
        actionExplanation,
        evaluation,
      };
    });

    // 2. Active Holdings & Capital-Weighted Quality Score
    // Active holdings have quantity > 0
    const activeItems = items.filter((item) => Number.isFinite(item.holding.quantity) && item.holding.quantity > 0);
    const activeHoldingsCount = activeItems.length;

    // Portfolio Score = SUM(CoreScore_i * (CurrentValue_i / TotalPortfolioValue))
    let capitalWeightedScore = 0;
    if (totalCurrentValue > 0) {
      let evaluatedCurrentValue = 0;
      let weightedSum = 0;

      activeItems.forEach((item) => {
        if (item.coreScore !== null && item.currentValue !== null && item.currentValue > 0) {
          const isEtf = item.evaluation?.sector === 'ETF' || item.holding.sector === 'ETF';
          // For ETFs, normalize technical score (0-50) to 0-100 so absence of corporate fundamentals does not penalize score
          const effectiveScore = isEtf && item.technicalScore !== null
            ? Math.min(100, item.technicalScore * 2)
            : item.coreScore;
          weightedSum += effectiveScore * item.currentValue;
          evaluatedCurrentValue += item.currentValue;
        }
      });

      capitalWeightedScore =
        evaluatedCurrentValue > 0 ? Number((weightedSum / evaluatedCurrentValue).toFixed(1)) : 0;
    }

    // 3. Sector Concentration Analysis (> 25% flags HIGH_SECTOR_CONCENTRATION)
    // Dual Metrics: investedPercentage (cost-basis) and currentPercentage (market-value)
    const sectorConcentrations: SectorConcentration[] = [];
    let hasHighSectorConcentration = false;

    sectorValueMap.forEach((val, sectorName) => {
      const investedPercentage =
        totalInvested > 0 ? Number(((val.invested / totalInvested) * 100).toFixed(1)) : 0;
      const currentPercentage =
        totalCurrentValue > 0 ? Number(((val.current / totalCurrentValue) * 100).toFixed(1)) : 0;
      
      // percentageOfPortfolio reflects market exposure (or invested percentage if totalCurrentValue is 0)
      const percentageOfPortfolio = totalCurrentValue > 0 ? currentPercentage : investedPercentage;
      
      // Concentrated if either market value concentration > 25% or invested capital concentration > 25%
      const isConcentrated = currentPercentage > 25.0 || (totalCurrentValue === 0 && investedPercentage > 25.0);

      if (isConcentrated) {
        hasHighSectorConcentration = true;
      }

      sectorConcentrations.push({
        sectorName,
        investedValue: val.invested,
        currentValue: val.current,
        investedPercentage,
        currentPercentage,
        percentageOfPortfolio,
        isConcentrated,
      });
    });

    // Sort sector concentrations descending by market percentage (fallback to invested percentage)
    sectorConcentrations.sort((a, b) => b.percentageOfPortfolio - a.percentageOfPortfolio);

    // 4. Counts (Strictly across active positions for risk triggers and alerts)
    const stopBreachCount = activeItems.filter((i) => i.stopBreached).length;
    const accrualTrapCount = activeItems.filter((i) => i.accrualTrapGain).length;
    const quarantinedCount = activeItems.filter((i) => i.actionBadge === 'QUARANTINED').length;
    const cautionCount = activeItems.filter((i) => i.zone === 'CAUTION').length;
    const favorableCount = activeItems.filter((i) => i.zone === 'FAVORABLE').length;
    const holdCount = activeItems.filter((i) => i.zone === 'HOLD').length;

    const totalPnl = resolvedCount > 0 ? totalCurrentValue - resolvedInvested : 0;
    const totalPnlPercentage = resolvedInvested > 0 ? (totalPnl / resolvedInvested) * 100 : 0;
    const unquotedInvested = Math.max(0, totalInvested - resolvedInvested);
    const prevPortfolioValue = totalCurrentValue - totalDayPnl;
    const totalDayPnlPct = prevPortfolioValue > 0 ? (totalDayPnl / prevPortfolioValue) * 100 : 0;

    const analytics: PortfolioRiskAnalytics = {
      activeHoldingsCount,
      totalInvested,
      resolvedInvested,
      unquotedInvested,
      totalCurrentValue,
      totalPnl,
      totalPnlPercentage,
      totalDayPnl,
      totalDayPnlPct,
      capitalWeightedScore,
      sectorConcentrations,
      hasHighSectorConcentration,
      stopBreachCount,
      accrualTrapCount,
      quarantinedCount,
      cautionCount,
      favorableCount,
      holdCount,
    };

    return { items, analytics };
  }
}
