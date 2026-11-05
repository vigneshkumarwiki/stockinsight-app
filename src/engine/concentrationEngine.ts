/**
 * STOCKINSIGHT V2.2 Portfolio Capital Concentration & Sector Exposure Engine (F-02)
 * 
 * Strict Invariants:
 * 1. Pure deterministic downstream aggregation over HoldingWithEvaluation[].
 * 2. ResolvedCapital = SUM(quantity * currentLtp) ONLY when quoteStatus === 'RESOLVED' and currentLtp > 0.
 * 3. Unresolved holdings evaluate to currentValue = null, excluded from denominator, and tracked in unresolvedCount.
 * 4. Fixed Concentration Thresholds:
 *    - Sector Concentration: CONCENTRATED when SectorCapitalWeightPct > 25.0%, else NORMAL.
 *    - Single-Stock Concentration: CONCENTRATED when HoldingCapitalWeightPct > 15.0%, else NORMAL.
 *    - Exact boundary: 25.0% is NORMAL; 15.0% is NORMAL.
 * 5. Zero null-to-zero coercions; averageBuyPrice is NEVER substituted for market LTP.
 * 6. Zero scoring mutations or feedback loops into stock-level analytical scoring.
 */

import { HoldingWithEvaluation } from '../types/portfolio';

export interface SectorExposure {
  sector: string;
  holdingCount: number;
  currentValue: number;
  investedValue: number;
  capitalWeightPct: number; // 0.0 to 100.0%
  isConcentrated: boolean;  // weight > 25.0%
}

export interface StockConcentration {
  isin: string;
  symbol: string;
  sector: string;
  quantity: number;
  currentLtp: number;
  currentValue: number;
  investedValue: number;
  capitalWeightPct: number; // 0.0 to 100.0%
  isConcentrated: boolean;  // weight > 15.0%
}

export interface PortfolioConcentrationResult {
  resolvedCapital: number;
  totalInvested: number;
  unresolvedCount: number;
  sectors: SectorExposure[];
  topStockConcentrations: StockConcentration[];
  hasSectorConcentration: boolean;
  hasStockConcentration: boolean;
}

export const SECTOR_CONCENTRATION_THRESHOLD_PCT = 25.0;
export const STOCK_CONCENTRATION_THRESHOLD_PCT = 15.0;

export class ConcentrationEngine {
  /**
   * Evaluates portfolio capital concentration and sector exposures across holdings.
   * 
   * @param items Array of analyzed HoldingWithEvaluation items
   */
  public static evaluate(items: HoldingWithEvaluation[]): PortfolioConcentrationResult {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return {
        resolvedCapital: 0,
        totalInvested: 0,
        unresolvedCount: 0,
        sectors: [],
        topStockConcentrations: [],
        hasSectorConcentration: false,
        hasStockConcentration: false,
      };
    }

    let resolvedCapital = 0;
    let totalInvested = 0;
    let unresolvedCount = 0;

    const sectorMap = new Map<
      string,
      { currentValue: number; investedValue: number; count: number }
    >();

    const resolvedStockList: StockConcentration[] = [];

    // 1. First Pass: Compute totals and aggregate by sector and stock
    items.forEach((item) => {
      const holding = item.holding;
      const quantity = holding.quantity;
      const avgPrice = holding.averageBuyPrice;
      const invested = quantity * avgPrice;
      totalInvested += invested;

      const isResolved =
        item.quoteStatus === 'RESOLVED' &&
        item.currentLtp !== null &&
        item.currentLtp !== undefined &&
        item.currentLtp > 0;

      const currentVal = isResolved ? quantity * item.currentLtp! : null;
      const rawSector = (holding.sector || item.evaluation?.sector || 'OTHER').trim().toUpperCase();

      if (isResolved && currentVal !== null) {
        resolvedCapital += currentVal;

        // Sector accumulation
        if (!sectorMap.has(rawSector)) {
          sectorMap.set(rawSector, { currentValue: 0, investedValue: 0, count: 0 });
        }
        const sData = sectorMap.get(rawSector)!;
        sData.currentValue += currentVal;
        sData.investedValue += invested;
        sData.count += 1;

        // Stock accumulation
        resolvedStockList.push({
          isin: holding.isin || item.evaluation?.isin || holding.symbol,
          symbol: holding.symbol.toUpperCase(),
          sector: rawSector,
          quantity,
          currentLtp: item.currentLtp!,
          currentValue: currentVal,
          investedValue: invested,
          capitalWeightPct: 0, // calculated in second pass
          isConcentrated: false,
        });
      } else {
        unresolvedCount += 1;
      }
    });

    // 2. Second Pass: Calculate exact percentages and concentration flags
    let hasSectorConcentration = false;
    const sectors: SectorExposure[] = [];

    sectorMap.forEach((data, sector) => {
      const weightPct =
        resolvedCapital > 0
          ? Number(((data.currentValue / resolvedCapital) * 100).toFixed(1))
          : 0;

      const isConcentrated = weightPct > SECTOR_CONCENTRATION_THRESHOLD_PCT;
      if (isConcentrated) {
        hasSectorConcentration = true;
      }

      sectors.push({
        sector,
        holdingCount: data.count,
        currentValue: data.currentValue,
        investedValue: data.investedValue,
        capitalWeightPct: weightPct,
        isConcentrated,
      });
    });

    // Sort sectors descending by capital weight
    sectors.sort((a, b) => b.currentValue - a.currentValue);

    let hasStockConcentration = false;
    resolvedStockList.forEach((stock) => {
      const weightPct =
        resolvedCapital > 0
          ? Number(((stock.currentValue / resolvedCapital) * 100).toFixed(1))
          : 0;

      const isConcentrated = weightPct > STOCK_CONCENTRATION_THRESHOLD_PCT;
      if (isConcentrated) {
        hasStockConcentration = true;
      }

      stock.capitalWeightPct = weightPct;
      stock.isConcentrated = isConcentrated;
    });

    // Sort stocks descending by capital weight
    resolvedStockList.sort((a, b) => b.currentValue - a.currentValue);

    return {
      resolvedCapital,
      totalInvested,
      unresolvedCount,
      sectors,
      topStockConcentrations: resolvedStockList,
      hasSectorConcentration,
      hasStockConcentration,
    };
  }
}
