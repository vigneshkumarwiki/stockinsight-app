/**
 * Fundamental Scoring Engine (50 Points Total)
 * Enforces Layer 2: Double-Counting & Collinearity Controls
 */

import { FactorScore, FundamentalBuckets, SectorClassification } from '../types/engine';
import { FundamentalCalculations } from './calculators/fundamental';

export class FundamentalEngine {
  /**
   * Scores an Industrial / Non-Financial Company (50 Points)
   */
  public static scoreIndustrial(calcs: FundamentalCalculations): {
    totalScore: number;
    factors: FactorScore[];
    buckets: FundamentalBuckets;
  } {
    const factors: FactorScore[] = [];

    // 1. Cash Flow Conversion (6 pts)
    let cfoScore = 0;
    let cfoExpl = 'No cash flow data available';
    if (calcs.cfoToEbitdaRatio !== null) {
      if (calcs.cfoToEbitdaRatio >= 0.70) {
        cfoScore = 6;
        cfoExpl = `High cash conversion: CFO/Op Profit is ${(calcs.cfoToEbitdaRatio * 100).toFixed(1)}% (>=70%)`;
      } else if (calcs.cfoToEbitdaRatio >= 0.50) {
        cfoScore = 3;
        cfoExpl = `Moderate cash conversion: CFO/Op Profit is ${(calcs.cfoToEbitdaRatio * 100).toFixed(1)}%`;
      } else {
        cfoScore = 0;
        cfoExpl = `Weak cash conversion: CFO/Op Profit is ${(calcs.cfoToEbitdaRatio * 100).toFixed(1)}% (<50%)`;
      }
    }
    factors.push({
      name: 'Cash Flow Conversion (CFO / Op Profit)',
      category: 'FUNDAMENTAL',
      bucket: 'Cash Quality',
      weight: 6,
      score: cfoScore,
      rawValue: calcs.cfoToEbitdaRatio !== null ? `${(calcs.cfoToEbitdaRatio * 100).toFixed(1)}%` : null,
      state: calcs.cfoToEbitdaRatio !== null ? 'DERIVED' : 'MISSING',
      explanation: cfoExpl,
      provenance: calcs.cfoToEbitdaRatio !== null ? 'DERIVED' : 'UNAVAILABLE',
      sourceFields: ['cash_flow.operating', 'income_statement.operating_profit'],
      formula: 'Operating Cash Flow (CFO) / Operating Profit (Proxy for EBITDA)',
    });

    // 2. P/E vs Sector (5 pts raw, part of Equity Multiples capped at 7)
    let peScore = 0;
    let peExpl = 'P/E not available';
    if (calcs.pe !== null && calcs.pe <= 0) {
      peScore = 0;
      peExpl = 'Loss-making entity (EPS <= 0)';
    } else if (calcs.pe !== null && calcs.sectorPe !== null && calcs.sectorPe > 0) {
      const peRatio = calcs.pe / calcs.sectorPe;
      if (peRatio <= 0.80) {
        peScore = 5;
        peExpl = `Attractively valued: P/E (${calcs.pe.toFixed(1)}) is at ${((1 - peRatio) * 100).toFixed(1)}% discount to sector`;
      } else if (peRatio <= 1.10) {
        peScore = 3;
        peExpl = `In line with sector: P/E (${calcs.pe.toFixed(1)}) vs Sector (${calcs.sectorPe.toFixed(1)})`;
      } else {
        peScore = 1;
        peExpl = `Trading at a premium: P/E (${calcs.pe.toFixed(1)}) vs Sector (${calcs.sectorPe.toFixed(1)})`;
      }
    } else if (calcs.pe !== null) {
      peScore = 0;
      peExpl = calcs.sectorPe === null
        ? `P/E is ${calcs.pe.toFixed(1)}x (sector benchmark not available)`
        : `P/E is ${calcs.pe.toFixed(1)}x (sector benchmark non-positive: ${calcs.sectorPe.toFixed(1)}x)`;
    }
    const peProvenance = calcs.pe === null
      ? 'UNAVAILABLE'
      : (calcs.sectorPe === null || calcs.sectorPe <= 0)
      ? 'COMPARISON_UNAVAILABLE'
      : 'PROVIDER_REPORTED';
    factors.push({
      name: 'P/E vs Sector',
      category: 'FUNDAMENTAL',
      bucket: 'Valuation Multiples',
      weight: 5,
      score: peScore,
      rawValue: calcs.pe !== null ? `${calcs.pe.toFixed(1)}x` : null,
      state: calcs.pe !== null ? 'AVAILABLE' : 'MISSING',
      explanation: peExpl,
      provenance: peProvenance,
      sourceFields: ['company_value (P/E)', 'sector_value (Sector P/E)'],
      formula: 'Price-to-Earnings vs Sector Median P/E',
      benchmarkValue: calcs.sectorPe !== null ? `${calcs.sectorPe.toFixed(1)}x` : null,
    });

    // 3. P/B vs Sector (5 pts raw, part of Equity Multiples capped at 7)
    let pbScore = 0;
    let pbExpl = 'P/B not available';
    if (calcs.pb !== null && calcs.pb <= 0) {
      pbScore = 0;
      pbExpl = 'Deficit / negative tangible book value';
    } else if (calcs.pb !== null && calcs.sectorPb !== null && calcs.sectorPb > 0) {
      const pbRatio = calcs.pb / calcs.sectorPb;
      if (pbRatio <= 0.80) {
        pbScore = 5;
        pbExpl = `Deep book value discount: P/B ${calcs.pb.toFixed(1)}x vs Sector ${calcs.sectorPb.toFixed(1)}x`;
      } else if (pbRatio <= 1.20) {
        pbScore = 3;
        pbExpl = `Fair book value: P/B ${calcs.pb.toFixed(1)}x vs Sector ${calcs.sectorPb.toFixed(1)}x`;
      } else {
        pbScore = 1;
        pbExpl = `Extended book value: P/B ${calcs.pb.toFixed(1)}x`;
      }
    } else if (calcs.pb !== null) {
      pbScore = 0;
      pbExpl = calcs.sectorPb === null
        ? `P/B is ${calcs.pb.toFixed(1)}x (sector benchmark not available)`
        : `P/B is ${calcs.pb.toFixed(1)}x (sector benchmark non-positive: ${calcs.sectorPb.toFixed(1)}x)`;
    }
    const pbProvenance = calcs.pb === null
      ? 'UNAVAILABLE'
      : (calcs.sectorPb === null || calcs.sectorPb <= 0)
      ? 'COMPARISON_UNAVAILABLE'
      : 'PROVIDER_REPORTED';
    factors.push({
      name: 'P/B vs Sector',
      category: 'FUNDAMENTAL',
      bucket: 'Valuation Multiples',
      weight: 5,
      score: pbScore,
      rawValue: calcs.pb !== null ? `${calcs.pb.toFixed(1)}x` : null,
      state: calcs.pb !== null ? 'AVAILABLE' : 'MISSING',
      explanation: pbExpl,
      provenance: pbProvenance,
      sourceFields: ['company_value (P/B)', 'sector_value (Sector P/B)'],
      formula: 'Price-to-Book vs Sector Median P/B',
      benchmarkValue: calcs.sectorPb !== null ? `${calcs.sectorPb.toFixed(1)}x` : null,
    });

    // 4. EV / EBITDA (5 pts raw, Enterprise Multiples capped at 5)
    let evScore = 0;
    let evExpl = 'EV/EBITDA not available';
    if (calcs.evEbitda !== null && calcs.evEbitda <= 0) {
      evScore = 0;
      evExpl = 'Negative enterprise value or EBITDA';
    } else if (calcs.evEbitda !== null && calcs.sectorEvEbitda !== null && calcs.sectorEvEbitda > 0) {
      const evRatio = calcs.evEbitda / calcs.sectorEvEbitda;
      if (evRatio <= 1.0) {
        evScore = 5;
        evExpl = `Favorable enterprise valuation: ${calcs.evEbitda.toFixed(1)}x vs Sector ${calcs.sectorEvEbitda.toFixed(1)}x`;
      } else if (evRatio <= 1.30) {
        evScore = 3;
        evExpl = `Moderate enterprise multiple: ${calcs.evEbitda.toFixed(1)}x`;
      } else {
        evScore = 1;
        evExpl = `High enterprise multiple: ${calcs.evEbitda.toFixed(1)}x`;
      }
    } else if (calcs.evEbitda !== null) {
      evScore = 0;
      evExpl = calcs.sectorEvEbitda === null
        ? `EV/EBITDA is ${calcs.evEbitda.toFixed(1)}x (sector benchmark not available)`
        : `EV/EBITDA is ${calcs.evEbitda.toFixed(1)}x (sector benchmark non-positive: ${calcs.sectorEvEbitda.toFixed(1)}x)`;
    }
    const evProvenance = calcs.evEbitda === null
      ? 'UNAVAILABLE'
      : (calcs.sectorEvEbitda === null || calcs.sectorEvEbitda <= 0)
      ? 'COMPARISON_UNAVAILABLE'
      : 'PROVIDER_REPORTED';
    factors.push({
      name: 'EV / EBITDA',
      category: 'FUNDAMENTAL',
      bucket: 'Valuation Multiples',
      weight: 5,
      score: evScore,
      rawValue: calcs.evEbitda !== null ? `${calcs.evEbitda.toFixed(1)}x` : null,
      state: calcs.evEbitda !== null ? 'AVAILABLE' : 'MISSING',
      explanation: evExpl,
      provenance: evProvenance,
      sourceFields: ['company_value (EV/EBITDA)', 'sector_value (Sector EV/EBITDA)'],
      formula: 'Enterprise Value / EBITDA vs Sector Benchmark',
      benchmarkValue: calcs.sectorEvEbitda !== null ? `${calcs.sectorEvEbitda.toFixed(1)}x` : null,
    });

    // --- ENFORCE LAYER 2: Valuation Multiple Sub-Caps ---
    // Equity Multiples (P/E + P/B) capped at 7 pts
    const rawEquityMultiples = peScore + pbScore;
    const cappedEquityMultiples = Math.min(7, rawEquityMultiples);

    // Enterprise Multiples capped at 5 pts
    const cappedEnterpriseMultiples = Math.min(5, evScore);

    // Total Valuation Bucket capped at 12 pts
    const valuationBucket = Math.min(12, cappedEquityMultiples + cappedEnterpriseMultiples);

    // 5. ROE % (6 pts raw)
    let roeScore = 0;
    let roeExpl = 'ROE not available';
    if (calcs.roe !== null) {
      if (calcs.roe >= 20.0) {
        roeScore = 6;
        roeExpl = `Superior shareholder returns: ${calcs.roe.toFixed(1)}% (>=20%)`;
      } else if (calcs.roe >= 15.0) {
        roeScore = 4;
        roeExpl = `Strong shareholder returns: ${calcs.roe.toFixed(1)}% (15-20%)`;
      } else if (calcs.roe >= 10.0) {
        roeScore = 2;
        roeExpl = `Moderate returns: ${calcs.roe.toFixed(1)}% (10-15%)`;
      } else {
        roeScore = 0;
        roeExpl = `Sub-par return on equity: ${calcs.roe.toFixed(1)}% (<10%)`;
      }
    }
    factors.push({
      name: 'ROE (%)',
      category: 'FUNDAMENTAL',
      bucket: 'Capital Efficiency',
      weight: 6,
      score: roeScore,
      rawValue: calcs.roe !== null ? `${calcs.roe.toFixed(1)}%` : null,
      state: calcs.roe !== null ? 'AVAILABLE' : 'MISSING',
      explanation: roeExpl,
      provenance: calcs.roe !== null ? 'PROVIDER_REPORTED' : 'UNAVAILABLE',
      sourceFields: ['company_value (ROE)'],
      formula: 'Net Income / Average Shareholder Equity',
    });

    // 6. ROCE % (6 pts raw)
    let roceScore = 0;
    let roceExpl = 'ROCE not available';
    if (calcs.roce !== null) {
      if (calcs.roce >= 22.0) {
        roceScore = 6;
        roceExpl = `Exceptional capital productivity: ${calcs.roce.toFixed(1)}% (>=22%)`;
      } else if (calcs.roce >= 16.0) {
        roceScore = 4;
        roceExpl = `Solid capital productivity: ${calcs.roce.toFixed(1)}% (16-22%)`;
      } else if (calcs.roce >= 10.0) {
        roceScore = 2;
        roceExpl = `Acceptable capital productivity: ${calcs.roce.toFixed(1)}% (10-16%)`;
      } else {
        roceScore = 0;
        roceExpl = `Low capital productivity: ${calcs.roce.toFixed(1)}% (<10%)`;
      }
    }
    factors.push({
      name: 'ROCE (%)',
      category: 'FUNDAMENTAL',
      bucket: 'Capital Efficiency',
      weight: 6,
      score: roceScore,
      rawValue: calcs.roce !== null ? `${calcs.roce.toFixed(1)}%` : null,
      state: calcs.roce !== null ? 'AVAILABLE' : 'MISSING',
      explanation: roceExpl,
      provenance: calcs.roce !== null ? 'PROVIDER_REPORTED' : 'UNAVAILABLE',
      sourceFields: ['company_value (ROCE)'],
      formula: 'EBIT / Capital Employed (Total Assets - Current Liabilities)',
    });

    // --- ENFORCE LAYER 2: Capital Efficiency Sub-Cap (Max 12 pts) ---
    const capitalEfficiencyBucket = Math.min(12, roeScore + roceScore);

    // 7. Operating Margin - OPM (5 pts)
    let opmScore = 0;
    let opmExpl = 'OPM not available';
    if (calcs.opmPct !== null) {
      if (calcs.opmPct >= 20.0) {
        opmScore = 5;
        opmExpl = `High pricing power: OPM ${calcs.opmPct.toFixed(1)}% (>=20%)`;
      } else if (calcs.opmPct >= 12.0) {
        opmScore = 3;
        opmExpl = `Healthy margin: OPM ${calcs.opmPct.toFixed(1)}% (12-20%)`;
      } else if (calcs.opmPct >= 5.0) {
        opmScore = 1;
        opmExpl = `Moderate margin: OPM ${calcs.opmPct.toFixed(1)}% (5-12%)`;
      } else {
        opmScore = 0;
        opmExpl = `Thin operating margin: OPM ${calcs.opmPct.toFixed(1)}% (<5%)`;
      }
    }
    factors.push({
      name: 'Operating Margin (OPM)',
      category: 'FUNDAMENTAL',
      bucket: 'Growth & Solvency',
      weight: 5,
      score: opmScore,
      rawValue: calcs.opmPct !== null ? `${calcs.opmPct.toFixed(1)}%` : null,
      state: calcs.opmPct !== null ? 'DERIVED' : 'MISSING',
      explanation: opmExpl,
      provenance: calcs.opmPct !== null ? 'DERIVED' : 'UNAVAILABLE',
      sourceFields: ['operatingProfit', 'revenue'],
      formula: '(Operating Profit / Net Revenue) * 100',
    });

    // 8. 3Y Net Profit CAGR / Profit Growth (6 pts)
    let cagrScore = 0;
    let cagrExpl = '3Y CAGR not available';
    let cagrRawValue: string | null = null;
    let cagrState: import('../types/engine').DataState = 'MISSING';

    if (calcs.profitGrowthResult) {
      const pgr = calcs.profitGrowthResult;
      cagrRawValue = pgr.displayValue;
      if (pgr.state === 'PROFIT_COMPOUNDING' && pgr.cagr3YPct !== null) {
        cagrState = 'DERIVED';
        const lossSuffix = pgr.intermediateLoss ? ' (with intermediate-year loss)' : '';
        if (pgr.cagr3YPct >= 20.0) {
          cagrScore = 6;
          cagrExpl = `High compounding growth: ${pgr.cagr3YPct.toFixed(1)}% CAGR (>=20%)${lossSuffix}`;
        } else if (pgr.cagr3YPct >= 12.0) {
          cagrScore = 4;
          cagrExpl = `Steady compounding growth: ${pgr.cagr3YPct.toFixed(1)}% CAGR (12-20%)${lossSuffix}`;
        } else if (pgr.cagr3YPct >= 6.0) {
          cagrScore = 2;
          cagrExpl = `Moderate earnings growth: ${pgr.cagr3YPct.toFixed(1)}% CAGR (6-12%)${lossSuffix}`;
        } else {
          cagrScore = 0;
          cagrExpl = `Stagnant or declining net profit: ${pgr.cagr3YPct.toFixed(1)}% CAGR (<6%)${lossSuffix}`;
        }
      } else if (pgr.state === 'TURNAROUND_FROM_LOSS' || pgr.state === 'TURNAROUND_FROM_ZERO') {
        cagrScore = 4;
        cagrState = 'DERIVED';
        cagrExpl = pgr.explanation;
      } else if (pgr.state === 'LOSS_REDUCTION') {
        cagrScore = 2;
        cagrState = 'DERIVED';
        cagrExpl = pgr.explanation;
      } else if (
        pgr.state === 'RECOVERY_TO_BREAKEVEN' ||
        pgr.state === 'LOSS_EXPANSION' ||
        pgr.state === 'PERSISTENT_LOSS' ||
        pgr.state === 'PROFIT_COLLAPSE' ||
        pgr.state === 'ZERO_TO_LOSS' ||
        pgr.state === 'FLAT_ZERO'
      ) {
        cagrScore = 0;
        cagrState = 'DERIVED';
        cagrExpl = pgr.explanation;
      } else {
        cagrScore = 0;
        cagrState = 'MISSING';
        cagrExpl = '3Y CAGR not available';
      }
    } else if (calcs.netProfitCagr3YPct !== null) {
      cagrState = 'DERIVED';
      cagrRawValue = `${calcs.netProfitCagr3YPct.toFixed(1)}%`;
      if (calcs.netProfitCagr3YPct >= 20.0) {
        cagrScore = 6;
        cagrExpl = `High compounding growth: ${calcs.netProfitCagr3YPct.toFixed(1)}% CAGR (>=20%)`;
      } else if (calcs.netProfitCagr3YPct >= 12.0) {
        cagrScore = 4;
        cagrExpl = `Steady compounding growth: ${calcs.netProfitCagr3YPct.toFixed(1)}% CAGR (12-20%)`;
      } else if (calcs.netProfitCagr3YPct >= 6.0) {
        cagrScore = 2;
        cagrExpl = `Moderate earnings growth: ${calcs.netProfitCagr3YPct.toFixed(1)}% CAGR (6-12%)`;
      } else {
        cagrScore = 0;
        cagrExpl = `Stagnant or declining net profit: ${calcs.netProfitCagr3YPct.toFixed(1)}% CAGR (<6%)`;
      }
    }

    factors.push({
      name: '3Y Net Profit CAGR',
      category: 'FUNDAMENTAL',
      bucket: 'Growth & Solvency',
      weight: 6,
      score: cagrScore,
      rawValue: cagrRawValue,
      state: cagrState,
      explanation: cagrExpl,
      provenance: cagrState === 'DERIVED' ? 'DERIVED' : 'UNAVAILABLE',
      sourceFields: ['annualNetProfit (T, T-1, T-2, T-3)'],
      formula: '((PAT_T / PAT_T-3)^(1/3) - 1) * 100 or Multi-Year Net Profit Transition Rule',
    });

    // 9. Debt-to-Equity (6 pts)
    let deScore = 0;
    let deExpl = 'D/E not available';
    if (calcs.debtToEquity !== null) {
      if (calcs.debtToEquity <= 0.30) {
        deScore = 6;
        deExpl = `Virtually debt-free / pristine balance sheet: D/E ${calcs.debtToEquity.toFixed(2)}x (<=0.3x)`;
      } else if (calcs.debtToEquity <= 0.70) {
        deScore = 4;
        deExpl = `Conservative debt: D/E ${calcs.debtToEquity.toFixed(2)}x (0.3-0.7x)`;
      } else if (calcs.debtToEquity <= 1.20) {
        deScore = 2;
        deExpl = `Moderate leverage: D/E ${calcs.debtToEquity.toFixed(2)}x (0.7-1.2x)`;
      } else {
        deScore = 0;
        deExpl = `High leverage risk: D/E ${calcs.debtToEquity.toFixed(2)}x (>1.2x)`;
      }
    }
    factors.push({
      name: 'Debt-to-Equity',
      category: 'FUNDAMENTAL',
      bucket: 'Growth & Solvency',
      weight: 6,
      score: deScore,
      rawValue: calcs.debtToEquity !== null ? `${calcs.debtToEquity.toFixed(2)}x` : null,
      state: calcs.debtToEquity !== null ? 'DERIVED' : 'MISSING',
      explanation: deExpl,
      provenance: calcs.debtToEquity !== null ? 'DERIVED' : 'UNAVAILABLE',
      sourceFields: ['balance_sheet.total_liability', 'balance_sheet.equity_capital'],
      formula: 'Total Liabilities / Tangible Equity Capital',
    });

    const growthAndSolvencyBucket = opmScore + cagrScore + deScore;
    const cashQualityBucket = cfoScore;

    // --- ENFORCE LAYER 2: Accrual Trap Dominance Rule ---
    // If company scores full points in P/E (5) and Net Profit CAGR (6), but 0 in Cash Conversion (CFO/EBITDA < 0.50)
    let accrualTrapPenalty = 0;
    if (peScore === 5 && cagrScore === 6 && cfoScore === 0) {
      accrualTrapPenalty = 5;
    }

    // Aggregate sub-capped fundamental total
    const totalScore = Math.max(
      0,
      valuationBucket + capitalEfficiencyBucket + cashQualityBucket + growthAndSolvencyBucket - accrualTrapPenalty
    );

    const buckets: FundamentalBuckets = {
      total: totalScore,
      max: 50,
      valuationBucket,
      equityMultiples: cappedEquityMultiples,
      enterpriseMultiples: cappedEnterpriseMultiples,
      capitalEfficiencyBucket,
      cashQualityBucket,
      growthAndSolvencyBucket,
      accrualTrapPenalty,
    };

    return { totalScore, factors, buckets };
  }

  /**
   * Scores a Commercial Bank (50 Points)
   */
  public static scoreCommercialBank(calcs: FundamentalCalculations): {
    totalScore: number;
    factors: FactorScore[];
    buckets: FundamentalBuckets;
  } {
    const factors: FactorScore[] = [];

    // 1. P/E vs Sector (6 pts max, Valuation Bucket)
    let peScore = 0;
    let peExpl = 'P/E not available';
    let peState: import('../types/engine').DataState = 'MISSING';
    if (calcs.pe !== null && calcs.pe <= 0) {
      peScore = 0;
      peExpl = 'Loss-making entity (EPS <= 0)';
      peState = 'AVAILABLE';
    } else if (calcs.pe !== null && calcs.sectorPe !== null && calcs.sectorPe > 0 && calcs.pe > 0) {
      const ratio = calcs.pe / calcs.sectorPe;
      if (ratio <= 0.85) {
        peScore = 6;
        peExpl = `Attractive bank valuation: P/E (${calcs.pe.toFixed(1)}x) trades at a discount to banking sector (${calcs.sectorPe.toFixed(1)}x)`;
      } else if (ratio <= 1.15) {
        peScore = 3.5;
        peExpl = `Fair bank valuation: P/E (${calcs.pe.toFixed(1)}x) in line with banking sector (${calcs.sectorPe.toFixed(1)}x)`;
      } else {
        peScore = 1;
        peExpl = `Premium bank valuation: P/E (${calcs.pe.toFixed(1)}x) above banking sector (${calcs.sectorPe.toFixed(1)}x)`;
      }
      peState = 'AVAILABLE';
    } else if (calcs.pe !== null) {
      peScore = 0;
      peState = 'AVAILABLE';
      peExpl = calcs.sectorPe === null
        ? `P/E is ${calcs.pe.toFixed(1)}x (banking sector benchmark not available)`
        : `P/E is ${calcs.pe.toFixed(1)}x (banking sector benchmark non-positive: ${calcs.sectorPe.toFixed(1)}x)`;
    }
    const bankPeProvenance = calcs.pe === null
      ? 'UNAVAILABLE'
      : (calcs.sectorPe === null || calcs.sectorPe <= 0)
      ? 'COMPARISON_UNAVAILABLE'
      : 'PROVIDER_REPORTED';
    factors.push({
      name: 'P/E vs Sector',
      category: 'FUNDAMENTAL',
      bucket: 'Valuation Multiples',
      weight: 6,
      score: peScore,
      rawValue: calcs.pe !== null ? `${calcs.pe.toFixed(1)}x` : null,
      state: peState,
      explanation: peExpl,
      provenance: bankPeProvenance,
      sourceFields: ['company_value (P/E)', 'sector_value (Sector P/E)'],
      formula: 'Price-to-Earnings vs Banking Sector Median P/E',
      benchmarkValue: calcs.sectorPe !== null ? `${calcs.sectorPe.toFixed(1)}x` : null,
    });

    // 2. P/B vs Sector (6 pts max, Valuation Bucket)
    let pbScore = 0;
    let pbExpl = 'P/B not available';
    let pbState: import('../types/engine').DataState = 'MISSING';
    if (calcs.pb !== null && calcs.pb <= 0) {
      pbScore = 0;
      pbExpl = 'Deficit / negative tangible book value';
      pbState = 'AVAILABLE';
    } else if (calcs.pb !== null && calcs.sectorPb !== null && calcs.sectorPb > 0 && calcs.pb > 0) {
      const ratio = calcs.pb / calcs.sectorPb;
      if (ratio <= 0.85) {
        pbScore = 6;
        pbExpl = `Deep book value discount: P/B ${calcs.pb.toFixed(1)}x vs Sector ${calcs.sectorPb.toFixed(1)}x`;
      } else if (ratio <= 1.15) {
        pbScore = 3.5;
        pbExpl = `Fair book value multiple: P/B ${calcs.pb.toFixed(1)}x vs Sector ${calcs.sectorPb.toFixed(1)}x`;
      } else {
        pbScore = 1;
        pbExpl = `Premium book value multiple: P/B ${calcs.pb.toFixed(1)}x vs Sector ${calcs.sectorPb.toFixed(1)}x`;
      }
      pbState = 'AVAILABLE';
    } else if (calcs.pb !== null) {
      pbScore = 0;
      pbState = 'AVAILABLE';
      pbExpl = calcs.sectorPb === null
        ? `P/B is ${calcs.pb.toFixed(1)}x (banking sector benchmark not available)`
        : `P/B is ${calcs.pb.toFixed(1)}x (banking sector benchmark non-positive: ${calcs.sectorPb.toFixed(1)}x)`;
    }
    const bankPbProvenance = calcs.pb === null
      ? 'UNAVAILABLE'
      : (calcs.sectorPb === null || calcs.sectorPb <= 0)
      ? 'COMPARISON_UNAVAILABLE'
      : 'PROVIDER_REPORTED';
    factors.push({
      name: 'P/B vs Sector',
      category: 'FUNDAMENTAL',
      bucket: 'Valuation Multiples',
      weight: 6,
      score: pbScore,
      rawValue: calcs.pb !== null ? `${calcs.pb.toFixed(1)}x` : null,
      state: pbState,
      explanation: pbExpl,
      provenance: bankPbProvenance,
      sourceFields: ['company_value (P/B)', 'sector_value (Sector P/B)'],
      formula: 'Price-to-Book vs Banking Sector Median P/B',
      benchmarkValue: calcs.sectorPb !== null ? `${calcs.sectorPb.toFixed(1)}x` : null,
    });

    // Valuation Bucket capped at 12 pts (P/E + P/B)
    const valuationBucket = Math.min(12, peScore + pbScore);

    // 3. Return on Assets - ROA (9 pts max, Capital Efficiency Bucket)
    let roaScore = 0;
    let roaExpl = 'ROA not available';
    let roaState: import('../types/engine').DataState = 'MISSING';
    if (calcs.roa !== null) {
      roaState = 'AVAILABLE';
      if (calcs.roa >= 1.40) {
        roaScore = 9;
        roaExpl = `Superior asset profitability: ROA ${calcs.roa.toFixed(2)}% (>=1.40%)`;
      } else if (calcs.roa >= 1.00) {
        roaScore = 5.5;
        roaExpl = `Moderate asset profitability: ROA ${calcs.roa.toFixed(2)}% (1.00-1.40%)`;
      } else {
        roaScore = 2;
        roaExpl = `Sub-par asset profitability: ROA ${calcs.roa.toFixed(2)}% (<1.00%)`;
      }
    }
    factors.push({
      name: 'Return on Assets (ROA)',
      category: 'FUNDAMENTAL',
      bucket: 'Capital Efficiency',
      weight: 9,
      score: roaScore,
      rawValue: calcs.roa !== null ? `${calcs.roa.toFixed(2)}%` : null,
      state: roaState,
      explanation: roaExpl,
      provenance: calcs.roa !== null ? 'PROVIDER_REPORTED' : 'UNAVAILABLE',
      sourceFields: ['company_value (ROA)'],
      formula: 'Net Income / Average Total Assets',
    });

    // 4. Return on Equity - ROE (9 pts max, Capital Efficiency Bucket)
    let roeScore = 0;
    let roeExpl = 'ROE not available';
    let roeState: import('../types/engine').DataState = 'MISSING';
    if (calcs.roe !== null) {
      roeState = 'AVAILABLE';
      if (calcs.roe >= 15.0) {
        roeScore = 9;
        roeExpl = `Strong net worth compounding: ROE ${calcs.roe.toFixed(1)}% (>=15.0%)`;
      } else if (calcs.roe >= 12.0) {
        roeScore = 5.5;
        roeExpl = `Moderate net worth compounding: ROE ${calcs.roe.toFixed(1)}% (12.0-15.0%)`;
      } else {
        roeScore = 2;
        roeExpl = `Low net worth compounding: ROE ${calcs.roe.toFixed(1)}% (<12.0%)`;
      }
    }
    factors.push({
      name: 'Return on Equity (ROE)',
      category: 'FUNDAMENTAL',
      bucket: 'Capital Efficiency',
      weight: 9,
      score: roeScore,
      rawValue: calcs.roe !== null ? `${calcs.roe.toFixed(1)}%` : null,
      state: roeState,
      explanation: roeExpl,
      provenance: calcs.roe !== null ? 'PROVIDER_REPORTED' : 'UNAVAILABLE',
      sourceFields: ['company_value (ROE)'],
      formula: 'Net Income / Average Shareholder Equity',
    });

    // Capital Efficiency Bucket capped at 18 pts (ROA + ROE)
    const capitalEfficiencyBucket = Math.min(18, roaScore + roeScore);

    // 5. 3Y Net Profit CAGR / Profit Growth (10 pts max, Growth & Solvency Bucket)
    let cagrScore = 0;
    let cagrExpl = '3Y CAGR not available';
    let cagrRawValue: string | null = null;
    let cagrState: import('../types/engine').DataState = 'MISSING';

    if (calcs.profitGrowthResult) {
      const pgr = calcs.profitGrowthResult;
      cagrRawValue = pgr.displayValue;
      if (pgr.state === 'PROFIT_COMPOUNDING' && pgr.cagr3YPct !== null) {
        cagrState = 'DERIVED';
        const lossSuffix = pgr.intermediateLoss ? ' (with intermediate-year loss)' : '';
        if (pgr.cagr3YPct >= 18.0) {
          cagrScore = 10;
          cagrExpl = `High multi-year profit compounding: ${pgr.cagr3YPct.toFixed(1)}% CAGR (>=18.0%)${lossSuffix}`;
        } else if (pgr.cagr3YPct >= 10.0) {
          cagrScore = 6;
          cagrExpl = `Moderate profit compounding: ${pgr.cagr3YPct.toFixed(1)}% CAGR (10.0-18.0%)${lossSuffix}`;
        } else {
          cagrScore = 0;
          cagrExpl = `Low/stagnant bank profit growth: ${pgr.cagr3YPct.toFixed(1)}% CAGR (<10.0%)${lossSuffix}`;
        }
      } else if (pgr.state === 'TURNAROUND_FROM_LOSS' || pgr.state === 'TURNAROUND_FROM_ZERO') {
        cagrScore = 6;
        cagrState = 'DERIVED';
        cagrExpl = pgr.explanation;
      } else if (pgr.state === 'LOSS_REDUCTION') {
        cagrScore = 3;
        cagrState = 'DERIVED';
        cagrExpl = pgr.explanation;
      } else if (
        pgr.state === 'RECOVERY_TO_BREAKEVEN' ||
        pgr.state === 'LOSS_EXPANSION' ||
        pgr.state === 'PERSISTENT_LOSS' ||
        pgr.state === 'PROFIT_COLLAPSE' ||
        pgr.state === 'ZERO_TO_LOSS' ||
        pgr.state === 'FLAT_ZERO'
      ) {
        cagrScore = 0;
        cagrState = 'DERIVED';
        cagrExpl = pgr.explanation;
      } else {
        cagrScore = 0;
        cagrState = 'MISSING';
        cagrExpl = '3Y CAGR not available';
      }
    } else if (calcs.netProfitCagr3YPct !== null) {
      cagrState = 'DERIVED';
      cagrRawValue = `${calcs.netProfitCagr3YPct.toFixed(1)}%`;
      if (calcs.netProfitCagr3YPct >= 18.0) {
        cagrScore = 10;
        cagrExpl = `High multi-year profit compounding: ${calcs.netProfitCagr3YPct.toFixed(1)}% CAGR (>=18.0%)`;
      } else if (calcs.netProfitCagr3YPct >= 10.0) {
        cagrScore = 6;
        cagrExpl = `Moderate profit compounding: ${calcs.netProfitCagr3YPct.toFixed(1)}% CAGR (10.0-18.0%)`;
      } else {
        cagrScore = 0;
        cagrExpl = `Low/stagnant bank profit growth: ${calcs.netProfitCagr3YPct.toFixed(1)}% CAGR (<10.0%)`;
      }
    }

    factors.push({
      name: '3Y Net Profit CAGR',
      category: 'FUNDAMENTAL',
      bucket: 'Growth & Solvency',
      weight: 10,
      score: cagrScore,
      rawValue: cagrRawValue,
      state: cagrState,
      explanation: cagrExpl,
      provenance: cagrState === 'DERIVED' ? 'DERIVED' : 'UNAVAILABLE',
      sourceFields: ['annualNetProfit (T, T-1, T-2, T-3)'],
      formula: '((PAT_T / PAT_T-3)^(1/3) - 1) * 100 or Multi-Year Net Profit Transition Rule',
    });

    // 6. Credit Cost & Provisioning Discipline (10 pts max, Growth & Solvency Bucket)
    let provScore = 0;
    let provExpl = 'Provision history not available';
    let provState: import('../types/engine').DataState = 'MISSING';
    if (calcs.provisionGrowthPct !== null) {
      provState = 'DERIVED';
      if (calcs.provisionGrowthPct <= 40.0) {
        provScore = 10;
        provExpl = `Controlled credit costs: Provision growth is ${calcs.provisionGrowthPct.toFixed(1)}% YoY (<=40%)`;
      } else {
        provScore = 0;
        provExpl = `Elevated credit risk: Provision growth surged by ${calcs.provisionGrowthPct.toFixed(1)}% YoY (>40%)`;
      }
    }
    factors.push({
      name: 'Credit Cost & Provisioning',
      category: 'FUNDAMENTAL',
      bucket: 'Growth & Solvency',
      weight: 10,
      score: provScore,
      rawValue: calcs.provisionGrowthPct !== null ? `${calcs.provisionGrowthPct.toFixed(1)}%` : null,
      state: provState,
      explanation: provExpl,
      provenance: provState === 'DERIVED' ? 'DERIVED' : 'UNAVAILABLE',
      sourceFields: ['provisionsAndContingencies (T, T-1)'],
      formula: '((Provisions_T - Provisions_T-1) / |Provisions_T-1|) * 100',
    });

    // Growth & Solvency Bucket capped at 20 pts (CAGR + Provisioning)
    const growthAndSolvencyBucket = Math.min(20, cagrScore + provScore);
    const totalScore = Math.round(
      Math.min(50, valuationBucket + capitalEfficiencyBucket + growthAndSolvencyBucket)
    );

    const buckets: FundamentalBuckets = {
      total: totalScore,
      max: 50,
      valuationBucket,
      equityMultiples: Math.min(12, peScore + pbScore),
      enterpriseMultiples: 0,
      capitalEfficiencyBucket,
      cashQualityBucket: 0,
      growthAndSolvencyBucket,
      accrualTrapPenalty: 0,
    };

    return { totalScore, factors, buckets };
  }

  /**
   * Evaluates an Exchange Traded Fund (ETF)
   * Phase 1 Specification: Standard corporate financial ratios are NOT_APPLICABLE / DATA_UNAVAILABLE
   * until dedicated ETF model is explicitly activated.
   */
  public static scoreEtf(): {
    totalScore: number;
    factors: FactorScore[];
    buckets: FundamentalBuckets;
  } {
    const factors: FactorScore[] = [
      {
        name: 'ETF Fundamental Ratios',
        category: 'FUNDAMENTAL',
        bucket: 'ETF Model',
        weight: 50,
        score: 0,
        rawValue: 'NOT_APPLICABLE',
        state: 'NOT_APPLICABLE',
        explanation: 'Exchange Traded Fund: Operating company corporate ratios (CFO / Op Profit, OPM, Debt/Equity, P/E) are NOT_APPLICABLE / DATA_UNAVAILABLE.',
        provenance: 'UNAVAILABLE',
        sourceFields: [],
        formula: 'Not Applicable for ETFs in Phase 1',
      },
    ];

    const buckets: FundamentalBuckets = {
      total: 0,
      max: 50,
      valuationBucket: 0,
      equityMultiples: 0,
      enterpriseMultiples: 0,
      capitalEfficiencyBucket: 0,
      cashQualityBucket: 0,
      growthAndSolvencyBucket: 0,
      accrualTrapPenalty: 0,
    };

    return { totalScore: 0, factors, buckets };
  }

  /**
   * Evaluates by sector classification
   */
  public static evaluate(
    sector: SectorClassification,
    calcs: FundamentalCalculations
  ): { totalScore: number; factors: FactorScore[]; buckets: FundamentalBuckets } {
    if (sector === 'ETF') {
      return this.scoreEtf();
    }
    if (sector === 'COMMERCIAL_BANK' || sector === 'NBFC_HFC') {
      return this.scoreCommercialBank(calcs);
    }
    return this.scoreIndustrial(calcs);
  }
}
