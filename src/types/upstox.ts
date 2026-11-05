/**
 * Upstox Native REST API Types
 * Modeled strictly against Upstox Developer v2 endpoints
 */

export interface UpstoxQuote {
  instrument_token: string;
  timestamp: string;
  last_price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  average_price: number;
  oi?: number;
  net_change?: number;
  total_buy_quantity: number;
  total_sell_quantity: number;
  lower_circuit_limit: number;
  upper_circuit_limit: number;
  yearly_high?: number;
  yearly_low?: number;
  depth?: {
    buy: Array<{ price: number; quantity: number; orders?: number }>;
    sell: Array<{ price: number; quantity: number; orders?: number }>;
  };
}

export type UpstoxCandle = [
  string, // timestamp (ISO 8601)
  number, // open
  number, // high
  number, // low
  number, // close
  number, // volume
  number  // open interest
];

export interface UpstoxHistoricalCandleResponse {
  status: 'success' | 'error';
  data: {
    candles: UpstoxCandle[];
  };
}

export interface UpstoxKeyRatioItem {
  name: 'P/E' | 'P/B' | 'ROA' | 'ROE' | 'ROCE' | 'EV/EBITDA' | string;
  company_value: string; // e.g. "20.15" or "8.94%"
  sector_value?: string;  // e.g. "12.46" or "16.46%"
}

export interface UpstoxKeyRatiosResponse {
  status: 'success' | 'error';
  data: UpstoxKeyRatioItem[];
}

export interface UpstoxStatementPeriodValue {
  period: string; // e.g. "Mar 2025"
  value: number;  // in Crores
  change?: string; // e.g. "+10.53%"
}

export interface UpstoxIncomeStatementCategory {
  category: 'revenue' | 'operating_profit' | 'net_profit' | string;
  history: UpstoxStatementPeriodValue[];
}

export interface UpstoxFullStatementItem {
  particular: string; // e.g. "Revenue", "Profit Before Tax", "Tax", "Profit After Tax"
  history: {
    period: string;
    value: number;
  }[];
}

export interface UpstoxIncomeStatementResponse {
  status: 'success' | 'error';
  data: {
    type: 'consolidated' | 'standalone';
    time_period: 'yearly' | 'quarterly';
    units_in: 'crore' | string;
    income_statement: UpstoxIncomeStatementCategory[];
    full_statement?: UpstoxFullStatementItem[];
  };
}

export interface UpstoxBalanceSheetHistoryItem {
  period: string;
  total_asset: number;
  total_liability: number;
}

export interface UpstoxBalanceSheetResponse {
  status: 'success' | 'error';
  data: {
    type: 'consolidated' | 'standalone';
    time_period: 'yearly' | string;
    units_in: 'crore' | string;
    history: UpstoxBalanceSheetHistoryItem[];
    full_statement?: UpstoxFullStatementItem[];
  };
}

export interface UpstoxCashFlowCategory {
  category: 'operating' | 'investing' | 'financing' | string;
  history: UpstoxStatementPeriodValue[];
}

export interface UpstoxCashFlowResponse {
  status: 'success' | 'error';
  data: {
    type: 'consolidated' | 'standalone';
    time_period: 'yearly' | string;
    units_in: 'crore' | string;
    cash_flow: UpstoxCashFlowCategory[];
    full_statement?: UpstoxFullStatementItem[];
  };
}

export interface UpstoxShareHoldingHistory {
  period: string; // e.g. "Dec 2024"
  promoter: number;
  promoter_pledged?: number; // % of promoter holding pledged
  fii: number;
  dii: number;
  public: number;
  others?: number;
}

export interface UpstoxShareHoldingsResponse {
  status: 'success' | 'error';
  data: {
    history: UpstoxShareHoldingHistory[];
  };
}

export interface UpstoxProfileResponse {
  status: 'success' | 'error';
  data: {
    company_name: string;
    isin: string;
    sector_name: string;
    industry_name?: string;
    description?: string;
    sector_market_cap_inr?: number;
  };
}

export interface UpstoxCorporateAction {
  name: 'Dividend' | 'Bonus' | 'Split' | 'Rights' | string;
  expiry_date?: string;
  amount?: number;
  ratio?: string; // e.g. "1:1" or "1:5"
  event_details?: {
    name: string;
    value: string;
  }[];
}

export interface UpstoxCorporateActionsResponse {
  status: 'success' | 'error';
  data: UpstoxCorporateAction[];
}

export interface UpstoxHoldingItem {
  isin: string;
  cnc_used_quantity?: number;
  collateral_type?: string;
  company_name: string;
  haircut?: number;
  product?: string;
  quantity: number;
  tradingsymbol: string;
  last_price: number;
  close_price?: number;
  pnl?: number;
  day_change?: number;
  day_change_percentage?: number;
  average_price: number;
  instrument_token?: string;
}

export interface UpstoxHoldingsResponse {
  status: 'success' | 'error';
  data: UpstoxHoldingItem[];
}

