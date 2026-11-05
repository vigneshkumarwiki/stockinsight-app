/**
 * STOCKINSIGHT Master Evaluation Pipeline
 * Coordinates data ingestion, forensic audit, dual-axis scoring, safety gates, and execution corridors
 * Enforces all 5 Production Integrity Layers
 */

import { StockInsightEvaluation, DataSource, FundamentalDataStatus } from '../types/engine';
import {
  UpstoxBalanceSheetResponse,
  UpstoxCandle,
  UpstoxCashFlowResponse,
  UpstoxCorporateActionsResponse,
  UpstoxIncomeStatementResponse,
  UpstoxKeyRatiosResponse,
  UpstoxProfileResponse,
  UpstoxQuote,
  UpstoxShareHoldingsResponse,
} from '../types/upstox';
import { FundamentalCalculator } from './calculators/fundamental';
import { TechnicalCalculator } from './calculators/technical';
import { DataAuditor } from './dataAuditor';
import { DecisionEngine } from './decisionEngine';
import { ExecutionEngine } from './executionEngine';
import { FundamentalEngine } from './fundamentalEngine';
import { Normalizer } from './normalizer';
import { SafetyGates } from './safetyGates';
import { TechnicalEngine } from './technicalEngine';
import { PriceStructureEngine } from './priceStructureEngine';
import { HorizonEngine } from './horizonEngine';
import { SearchService } from '../api/searchService';

export interface EvaluationInput {
  symbol?: string;
  dataSource?: DataSource;
  dataSourceError?: string;
  fundamentalStatus?: FundamentalDataStatus;
  quote: UpstoxQuote;
  candles: UpstoxCandle[];
  profile: UpstoxProfileResponse;
  keyRatios: UpstoxKeyRatiosResponse;
  annualIncome: UpstoxIncomeStatementResponse;
  quarterlyIncome: UpstoxIncomeStatementResponse;
  balanceSheet: UpstoxBalanceSheetResponse;
  cashFlow: UpstoxCashFlowResponse;
  shareHoldings: UpstoxShareHoldingsResponse;
  corporateActions?: UpstoxCorporateActionsResponse;
}

export class StockInsightPipeline {
  public static evaluate(input: EvaluationInput, symbolOverride?: string): StockInsightEvaluation {
    const {
      quote,
      candles,
      profile,
      keyRatios,
      annualIncome,
      quarterlyIncome,
      balanceSheet,
      cashFlow,
      shareHoldings,
      corporateActions,
    } = input;

    // ==========================================
    // LAYER 1: DATA INTEGRITY FORENSIC AUDIT
    // ==========================================
    const integrity = DataAuditor.audit(
      balanceSheet,
      annualIncome,
      cashFlow,
      corporateActions
    );
    const isQuarantined = integrity.status === 'QUARANTINED';

    // 1. Sector Classification & Instrument Type
    const activeSymbol = symbolOverride || input.symbol || '';
    const sector = Normalizer.routeSector(
      profile?.data?.sector_name,
      profile?.data?.industry_name,
      activeSymbol
    );
    const instrumentType = Normalizer.getInstrumentType(
      profile?.data?.sector_name,
      profile?.data?.industry_name,
      activeSymbol
    );

    let fundamentalStatus: FundamentalDataStatus = input.fundamentalStatus || 'UNAVAILABLE';
    if (sector === 'ETF') {
      fundamentalStatus = 'NOT_APPLICABLE';
    } else if (input.dataSource !== 'UPSTOX_LIVE' && (!input.fundamentalStatus || input.fundamentalStatus === 'FALLBACK')) {
      fundamentalStatus = 'UNAVAILABLE';
    }

    // 2. Fundamental & Technical Calculators
    const fundCalcs = FundamentalCalculator.compute(
      keyRatios,
      annualIncome,
      quarterlyIncome,
      balanceSheet,
      cashFlow
    );

    // Off-Market Quote Fallback: If volume === 0 or last_price <= 0, fallback to close price (Rule 4)
    let effectiveLtp =
      typeof quote.last_price === 'number' && Number.isFinite(quote.last_price)
        ? quote.last_price
        : 0;
    if (quote.volume === 0 || effectiveLtp <= 0) {
      if (typeof quote.close === 'number' && Number.isFinite(quote.close) && quote.close > 0) {
        effectiveLtp = quote.close;
      } else if (typeof quote.average_price === 'number' && Number.isFinite(quote.average_price) && quote.average_price > 0) {
        effectiveLtp = quote.average_price;
      }
    }

    const techCalcs = TechnicalCalculator.compute(candles, corporateActions, effectiveLtp);

    // ==========================================
    // LAYER 2 & 3: DUAL-AXIS BUCKETED SCORING
    // ==========================================
    const fundResult = FundamentalEngine.evaluate(sector, fundCalcs);
    const techResult = TechnicalEngine.evaluate(techCalcs);

    // 3. Extract Order Book Liquidity & Spread (Bid / Ask)
    const rawBid = quote.depth?.buy?.[0]?.price ?? null;
    const rawAsk = quote.depth?.sell?.[0]?.price ?? null;
    const bestBid = rawBid !== null && rawBid > 0 ? rawBid : null;
    const bestAsk = rawAsk !== null && rawAsk > 0 ? rawAsk : null;
    let bidAskSpreadPct = 0;
    let highSlippageRisk = false;
    if (bestBid !== null && bestAsk !== null && bestAsk >= bestBid && effectiveLtp > 0) {
      const spread = bestAsk - bestBid;
      bidAskSpreadPct = (spread / effectiveLtp) * 100;
      if (spread / effectiveLtp > 0.0040) { // Spread > 0.40%
        highSlippageRisk = true;
      }
    }

    // 4. Institutional Safety Gates (with Rule 3 Stale Filing Interceptor)
    const promoterPledge =
      shareHoldings?.data?.history && shareHoldings.data.history.length > 0
        ? shareHoldings.data.history[0].promoter_pledged || 0
        : 0;

    const safetyResult = SafetyGates.evaluate(
      fundCalcs,
      profile?.data?.sector_name,
      profile?.data?.industry_name,
      promoterPledge,
      integrity
    );

    safetyResult.safetyFlags.bidAskSpreadPct = bidAskSpreadPct;
    safetyResult.safetyFlags.highSlippageRisk = highSlippageRisk;

    // 5. Authoritative Decision Engine
    const safetyReasons = [...safetyResult.reasons];
    if (isQuarantined) {
      safetyReasons.unshift(...integrity.reasons);
    }

    const isFundamentalUnavailable = fundamentalStatus === 'UNAVAILABLE' || fundamentalStatus === 'NOT_APPLICABLE';
    const technicalStatus: 'LIVE' | 'UNAVAILABLE' =
      !candles || candles.length === 0 || input.dataSource === 'DATA_UNAVAILABLE' || input.dataSource === 'UPSTOX_DATA_ERROR'
        ? 'UNAVAILABLE'
        : 'LIVE';

    const decision = DecisionEngine.evaluate(
      fundResult.totalScore,
      techResult.totalScore,
      safetyResult.fundamentalScoreDeduction,
      safetyResult.hardHoldCap || isQuarantined,
      safetyReasons,
      undefined,
      isFundamentalUnavailable
    );

    // Attach fundamental floor flag
    safetyResult.safetyFlags.fundamentalFloorFailed = decision.fundamentalFloorFailed;

    // ==========================================
    // LAYER 4: DECOUPLED EXECUTION CORRIDORS
    // ==========================================
    const execution = ExecutionEngine.evaluate(
      techCalcs,
      quote.upper_circuit_limit,
      quote.lower_circuit_limit,
      true,
      bestBid,
      bestAsk,
      isQuarantined
    );

    const rawIsin = profile?.data?.isin || (quote.instrument_token && quote.instrument_token.includes('|') ? quote.instrument_token.split('|')[1] : undefined);
    
    // Resolve clean trading symbol (e.g. 'TCS', 'DRREDDY', 'RELIANCE')
    let tradingSymbol = symbolOverride || input.symbol;
    if (!tradingSymbol && rawIsin) {
      const matched = SearchService.getInstrumentByIsin(rawIsin);
      if (matched) {
        tradingSymbol = matched.symbol;
      }
    }
    if (!tradingSymbol && quote.instrument_token && quote.instrument_token.includes('|')) {
      const part = quote.instrument_token.split('|')[1];
      if (part && !part.startsWith('INE')) {
        tradingSymbol = part;
      }
    }
    const finalIsin = profile?.data?.isin || rawIsin || 'UNKNOWN';
    // Guideline: All equity instrument keys must follow broker format NSE_EQ|{ISIN}
    const instrumentKey =
      finalIsin && (finalIsin.startsWith('INE') || finalIsin.startsWith('INF'))
        ? `NSE_EQ|${finalIsin}`
        : quote.instrument_token && quote.instrument_token.startsWith('NSE_EQ|')
        ? quote.instrument_token
        : `NSE_EQ|${quote.instrument_token}`;

    // ==========================================
    // LAYER 2.5: DETERMINISTIC PRICE STRUCTURE
    // ==========================================
    const priceStructure = PriceStructureEngine.evaluate(candles, techCalcs);

    // ==========================================
    // LAYER 3.5: V1.1 THREE-CHAIN HORIZON ENGINE
    // ==========================================
    const isETF = sector === 'ETF' || instrumentType === 'ETF';
    const horizonScores = HorizonEngine.evaluate({
      fundamentalScore: decision.fundamentalScore,
      technicalScore: decision.technicalScore,
      assetType: sector,
      isETF,
    });

    const horizons = {
      SHORT: {
        horizon: 'SHORT' as const,
        score: horizonScores.SHORT.score,
        zone: horizonScores.SHORT.zone,
        zoneReason: horizonScores.SHORT.zoneReason,
        geometry: {
          entry: priceStructure.entries.e1,
          stop: priceStructure.stops?.s1 ?? priceStructure.stopLoss,
          target: priceStructure.targets.t1,
        },
      },
      MEDIUM: {
        horizon: 'MEDIUM' as const,
        score: horizonScores.MEDIUM.score,
        zone: horizonScores.MEDIUM.zone,
        zoneReason: horizonScores.MEDIUM.zoneReason,
        geometry: {
          entry: priceStructure.entries.e2,
          stop: priceStructure.stops?.s2 ?? priceStructure.stopLoss,
          target: priceStructure.targets.t2,
        },
      },
      LONG: {
        horizon: 'LONG' as const,
        score: horizonScores.LONG.score,
        zone: horizonScores.LONG.zone,
        zoneReason: horizonScores.LONG.zoneReason,
        geometry: {
          entry: priceStructure.entries.e3,
          stop: priceStructure.stops?.s3 ?? priceStructure.stopLoss,
          target: priceStructure.targets.t3,
        },
      },
    };

    // Genuine provider-backed net change validation (rejects NaN, Infinity, -Infinity, missing/undefined/null)
    const hasFiniteNetChange =
      typeof quote.net_change === 'number' && Number.isFinite(quote.net_change);
    const netChange = hasFiniteNetChange ? quote.net_change : undefined;

    // Previous close resolution (must be finite and > 0)
    let prevClose: number | undefined = undefined;
    if (typeof quote.close === 'number' && Number.isFinite(quote.close) && quote.close > 0) {
      prevClose = quote.close;
    } else if (effectiveLtp > 0 && Number.isFinite(effectiveLtp) && netChange !== undefined) {
      const derivedPrevClose = effectiveLtp - netChange;
      if (derivedPrevClose > 0 && Number.isFinite(derivedPrevClose)) {
        prevClose = derivedPrevClose;
      }
    }

    // Day change percentage (only derived when both netChange and prevClose are valid, finite, and prevClose > 0)
    const netChangePct =
      netChange !== undefined && prevClose !== undefined && prevClose > 0
        ? (netChange / prevClose) * 100
        : undefined;

    // Intraday High/Low/VWAP from quote payload
    const dayHigh = typeof quote.high === 'number' && Number.isFinite(quote.high) && quote.high > 0 ? quote.high : undefined;
    const dayLow = typeof quote.low === 'number' && Number.isFinite(quote.low) && quote.low > 0 ? quote.low : undefined;
    const intradayVwap = typeof quote.average_price === 'number' && Number.isFinite(quote.average_price) && quote.average_price > 0 ? quote.average_price : undefined;

    const matched = tradingSymbol
      ? SearchService.getInstrumentBySymbol(tradingSymbol)
      : (finalIsin && finalIsin !== 'UNKNOWN' ? SearchService.getInstrumentByIsin(finalIsin) : undefined);

    const resolvedCompanyName =
      (profile?.data?.company_name && profile.data.company_name.trim() !== '' && profile.data.company_name !== 'UNKNOWN' && profile.data.company_name !== tradingSymbol)
        ? profile.data.company_name
        : matched?.name || profile?.data?.company_name || tradingSymbol || 'UNKNOWN';

    const resolvedSectorName =
      (profile?.data?.sector_name && profile.data.sector_name.trim() !== '' && profile.data.sector_name !== 'Equities')
        ? profile.data.sector_name
        : matched?.sector || profile?.data?.sector_name || 'Equities';

    return {
      tradingSymbol: tradingSymbol || 'UNKNOWN',
      companyName: resolvedCompanyName,
      isin: finalIsin,
      instrumentKey,
      sector,
      sectorName: resolvedSectorName,
      instrumentType,
      dataSource: input.dataSource || 'UPSTOX_LIVE',
      dataSourceError: input.dataSourceError,
      fundamentalStatus,
      technicalStatus,
      integrity,
      fundamentalBuckets: fundResult.buckets,
      technicalBuckets: techResult.buckets,
      fundamentalScore: decision.fundamentalScore,
      technicalScore: decision.technicalScore,
      coreScore: decision.coreScore,
      zone: decision.zone,
      zoneReason: decision.zoneReason,
      fundamentalFactors: fundResult.factors,
      technicalFactors: techResult.factors,
      safety: safetyResult.safetyFlags,
      execution,
      priceStructure,
      horizons,
      netChange,
      netChangePct,
      dayHigh,
      dayLow,
      intradayVwap,
      evaluatedAt: new Date().toISOString(),
    };
  }
}

export { PriceStructureEngine };
