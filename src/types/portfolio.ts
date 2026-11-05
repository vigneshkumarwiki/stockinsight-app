import { StockInsightEvaluation, DecisionZone } from './engine';

export interface Holding {
  id: string;
  symbol: string;
  companyName: string;
  sector: string;
  isin?: string;
  quantity: number;
  averageBuyPrice: number;
  buyDate?: string;
  addedAt: string;
}

export type HoldingActionBadge =
  | 'EXIT_BREACHED'
  | 'HARVEST_PROFIT_ACCRUAL_TRAP'
  | 'READY_TO_BUY'
  | 'HOLD'
  | 'CAUTION'
  | 'QUARANTINED';

export type QuoteStatus = 'RESOLVED' | 'PENDING' | 'UNAVAILABLE';

export interface HoldingWithEvaluation {
  holding: Holding;
  quoteStatus: QuoteStatus;
  currentLtp: number | null;
  investedValue: number;
  currentValue: number | null;
  pnl: number | null;
  pnlPercentage: number | null;
  dayChange: number | null;
  dayChangePercentage: number | null;
  coreScore: number | null;
  fundamentalScore: number | null;
  technicalScore: number | null;
  zone: DecisionZone | 'UNKNOWN';
  stopLoss: number | null;
  stopBreached: boolean;
  accrualTrapGain: boolean;
  actionBadge: HoldingActionBadge;
  actionExplanation: string;
  evaluation?: StockInsightEvaluation;
}

export interface SectorConcentration {
  sectorName: string;
  investedValue: number;
  currentValue: number;
  investedPercentage: number; // 0 - 100 based on totalInvested
  currentPercentage: number;  // 0 - 100 based on totalCurrentValue
  percentageOfPortfolio: number; // 0 - 100 alias to currentPercentage for backwards compatibility
  isConcentrated: boolean; // true if currentPercentage > 25% (or investedPercentage > 25% when unquoted)
}

export interface PortfolioRiskAnalytics {
  activeHoldingsCount: number;
  totalInvested: number;
  resolvedInvested: number;
  unquotedInvested: number;
  totalCurrentValue: number;
  totalPnl: number;
  totalPnlPercentage: number;
  totalDayPnl: number;
  totalDayPnlPct?: number;
  capitalWeightedScore: number; // 0 - 100
  sectorConcentrations: SectorConcentration[];
  hasHighSectorConcentration: boolean;
  stopBreachCount: number;
  accrualTrapCount: number;
  quarantinedCount: number;
  cautionCount: number;
  favorableCount: number;
  holdCount: number;
}

export interface StockSearchResult {
  symbol: string;
  name: string;
  instrumentKey: string;
  isin: string;
  sector: string;
  lastPrice: number;
  exchange?: 'NSE' | 'BSE' | string;
  segment?: string;
  instrumentType?: string;
}
