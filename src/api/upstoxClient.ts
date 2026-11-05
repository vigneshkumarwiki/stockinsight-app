import { EvaluationInput } from '../engine';
import {
  UpstoxBalanceSheetResponse,
  UpstoxCandle,
  UpstoxCashFlowResponse,
  UpstoxHistoricalCandleResponse,
  UpstoxIncomeStatementResponse,
  UpstoxKeyRatiosResponse,
  UpstoxProfileResponse,
  UpstoxQuote,
  UpstoxShareHoldingsResponse,
  UpstoxHoldingsResponse,
  UpstoxCorporateActionsResponse,
} from '../types/upstox';
import { Holding } from '../types/portfolio';
import { SearchService } from './searchService';
import { SessionResolver } from '../engine/sessionResolver';
import { MarketSessionState } from '../types/context';
import { FundamentalsDatabase } from '../data/fundamentalsDatabase';

const TOKEN_STORAGE_KEY = 'stockinsight_upstox_token_v1';

export class UpstoxApiError extends Error {
  public status: number;
  public endpoint: string;

  constructor(status: number, endpoint: string, message: string) {
    super(message);
    this.name = 'UpstoxApiError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

export interface QueueTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export class RequestQueue {
  private static activeCount = 0;
  private static maxConcurrent = 2;
  private static minIntervalMs = 200;
  private static lastRequestTime = 0;
  private static queue: QueueTask<any>[] = [];

  public static getMaxConcurrent(): number {
    return this.maxConcurrent;
  }

  public static getMinIntervalMs(): number {
    return this.minIntervalMs;
  }

  public static getActiveCount(): number {
    return this.activeCount;
  }

  public static getQueueLength(): number {
    return this.queue.length;
  }

  public static async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  private static processQueue() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    const waitTime = Math.max(0, this.minIntervalMs - timeSinceLast);

    if (waitTime > 0) {
      setTimeout(() => this.processQueue(), waitTime);
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;
    this.lastRequestTime = Date.now();

    task
      .fn()
      .then((res) => {
        task.resolve(res);
      })
      .catch((err) => {
        task.reject(err);
      })
      .finally(() => {
        this.activeCount--;
        this.processQueue();
      });
  }
}

export class UpstoxClient {
  private token: string | null = null;
  // Route all browser requests through /upstox-api to utilize the reverse proxy and eliminate browser CORS blocking
  private baseUrl: string =
    typeof window !== 'undefined'
      ? '/upstox-api'
      : 'https://api.upstox.com';

  constructor(token?: string) {
    if (token) {
      this.setToken(token);
    } else if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (saved && saved.trim().length > 10) {
          this.token = saved.trim();
        }
      } catch {
        // Ignore storage errors
      }
    }
  }

  public setToken(token: string) {
    this.token = token.trim();
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(TOKEN_STORAGE_KEY, this.token);
      } catch {
        // Ignore
      }
    }
  }

  public clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  public hasToken(): boolean {
    return Boolean(this.token && this.token.length > 10);
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Generic authorized GET request to Upstox with queuing, pacing, and 429 exponential backoff
   */
  private async get<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    return RequestQueue.enqueue(async () => {
      return this.executeGet<T>(endpoint, params, 0);
    });
  }

  private async executeGet<T>(endpoint: string, params: Record<string, string>, retryCount: number): Promise<T> {
    if (!this.token) {
      throw new Error('Upstox Analytics Token is required for live data.');
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://api.upstox.com';
    const url = new URL(`${this.baseUrl}${endpoint}`, origin);
    Object.entries(params).forEach(([key, val]) => {
      if (!url.searchParams.has(key)) {
        url.searchParams.append(key, val);
      }
    });

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
      });
    } catch (networkErr: unknown) {
      const netMsg = (networkErr as Error).message || 'Failed to fetch (Network connection error)';
      console.error(`[Upstox API Network Error] Endpoint: ${endpoint} | Error: ${netMsg}`);
      throw new UpstoxApiError(
        0,
        endpoint,
        `Network connection failed while reaching Upstox endpoint ${endpoint}: ${netMsg}`
      );
    }

    // Handle 429 Rate Limit with bounded exponential backoff
    if (response.status === 429) {
      const MAX_RETRIES = 2;
      if (retryCount < MAX_RETRIES) {
        const backoffMs = 500 * Math.pow(2, retryCount) + Math.random() * 100;
        console.warn(`[Upstox Rate Limit 429] Endpoint: ${endpoint}. Retrying in ${Math.round(backoffMs)}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise((res) => setTimeout(res, backoffMs));
        return this.executeGet<T>(endpoint, params, retryCount + 1);
      }
      throw new UpstoxApiError(
        429,
        endpoint,
        `Upstox Rate Limit Exceeded (HTTP 429) on ${endpoint}. Rate limit persisted after ${MAX_RETRIES} retries.`
      );
    }

    if (!response.ok) {
      let errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.errors && Array.isArray(errorJson.errors) && errorJson.errors[0]?.message) {
          errorText = errorJson.errors[0].message;
        } else if (errorJson.message) {
          errorText = errorJson.message;
        }
      } catch {
        // Use raw text
      }

      console.error(`[Upstox API Error] Status: ${response.status} | Endpoint: ${endpoint} | Details: ${errorText}`);

      if (response.status === 401) {
        throw new UpstoxApiError(
          401,
          endpoint,
          `Upstox Token Expired or Unauthorized (HTTP 401) on ${endpoint}. Upstox access tokens expire daily at 3:30 AM IST. Please refresh your token at developer.upstox.com.`
        );
      }
      if (response.status === 403) {
        throw new UpstoxApiError(
          403,
          endpoint,
          `Upstox Access Forbidden / Unauthorized (HTTP 403) on ${endpoint}: ${errorText || 'Permission denied'}`
        );
      }
      throw new UpstoxApiError(
        response.status,
        endpoint,
        `Upstox API Error (HTTP ${response.status}) on ${endpoint}: ${errorText}`
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Fetches a single live quote from Upstox.
   * All equity instrument keys must follow the broker format NSE_EQ|{ISIN}.
   */
  public async fetchLiveQuote(instrumentKeyOrSymbolOrIsin: string): Promise<UpstoxQuote> {
    const raw = instrumentKeyOrSymbolOrIsin.trim();
    let isin = '';

    if (raw.startsWith('NSE_EQ|') || raw.startsWith('BSE_EQ|')) {
      const part = raw.split('|')[1];
      if (part.startsWith('INE') || part.startsWith('INF')) {
        isin = part;
      } else {
        const known = SearchService.getInstrumentBySymbol(part.toUpperCase());
        isin = known?.isin || part;
      }
    } else if (raw.startsWith('INE') || raw.startsWith('INF')) {
      isin = raw;
    } else {
      const upper = raw.toUpperCase();
      const known = SearchService.getInstrumentBySymbol(upper);
      isin = known?.isin || upper;
    }

    const instrumentKey = `NSE_EQ|${isin}`;

    const response = await this.get<{ status: string; data: Record<string, UpstoxQuote> }>(
      '/v2/market-quote/quotes',
      { instrument_key: instrumentKey }
    );

    if (response && response.data) {
      const quotesList = Object.values(response.data);
      const symbol = isin ? SearchService.getInstrumentByIsin(isin)?.symbol?.toUpperCase() : null;

      const quote =
        response.data[instrumentKey] ||
        response.data[instrumentKey.replace('|', ':')] ||
        (isin ? response.data[`NSE_EQ|${isin}`] || response.data[`NSE_EQ:${isin}`] : null) ||
        (symbol ? response.data[`NSE_EQ:${symbol}`] || response.data[`NSE_EQ|${symbol}`] : null) ||
        quotesList.find((q) => q && (q.instrument_token === instrumentKey || (isin && q.instrument_token === `NSE_EQ|${isin}`))) ||
        (quotesList.length === 1 && quotesList[0] ? quotesList[0] : null) ||
        null;

      if (quote) {
        // Rule 4: Off-Market Quote Fallback
        if (quote.volume === 0 || quote.last_price <= 0 || isNaN(quote.last_price)) {
          if (quote.close && quote.close > 0) {
            quote.last_price = quote.close;
          } else if (quote.average_price && quote.average_price > 0) {
            quote.last_price = quote.average_price;
          }
        }
        return quote;
      }
    }

    throw new UpstoxApiError(404, '/v2/market-quote/quotes', `No quote data returned for instrument ${instrumentKey}`);
  }

  /**
   * Fetches market quotes in a single batch request for up to 500 instrument keys.
   * Chunks requests if keys > 500.
   * Deduplicates keys and preserves stock isolation.
   * Does NOT fan out into individual requests upon batch failure.
   */
  public async fetchMarketQuotesBatch(
    instrumentKeys: string[]
  ): Promise<Record<string, UpstoxQuote | null>> {
    if (!instrumentKeys || instrumentKeys.length === 0) {
      return {};
    }

    // 1. Format and deduplicate instrument keys strictly as NSE_EQ|{ISIN}
    const formattedKeys = Array.from(
      new Set(
        instrumentKeys.map((k) => {
          const raw = k.trim();
          if (raw.startsWith('NSE_EQ|') || raw.startsWith('BSE_EQ|')) {
            return raw;
          }
          if (raw.startsWith('INE') || raw.startsWith('INF')) {
            return `NSE_EQ|${raw}`;
          }
          const upper = raw.toUpperCase();
          const known = SearchService.getInstrumentBySymbol(upper);
          const isin = known?.isin || upper;
          return `NSE_EQ|${isin}`;
        })
      )
    );

    const resultMap: Record<string, UpstoxQuote | null> = {};
    formattedKeys.forEach((key) => {
      resultMap[key] = null;
    });

    // 2. Chunk in batches of 500
    const CHUNK_SIZE = 500;
    const chunks: string[][] = [];
    for (let i = 0; i < formattedKeys.length; i += CHUNK_SIZE) {
      chunks.push(formattedKeys.slice(i, i + CHUNK_SIZE));
    }

    for (const chunk of chunks) {
      const keysParam = chunk.join(',');
      try {
        const response = await this.get<{ status: string; data: Record<string, UpstoxQuote> }>(
          '/v2/market-quote/quotes',
          { instrument_key: keysParam }
        );

        if (response && response.data) {
          const quotesList = Object.values(response.data);
          chunk.forEach((key) => {
            const rawKeyPart = key.includes('|') ? key.split('|')[1] : key;
            const symbol = SearchService.getInstrumentByIsin(rawKeyPart)?.symbol?.toUpperCase();

            const rawQuote =
              response.data[key] ||
              response.data[key.replace('|', ':')] ||
              response.data[key.replace('NSE_EQ|', 'NSE_EQ:')] ||
              (symbol ? response.data[`NSE_EQ:${symbol}`] || response.data[`NSE_EQ|${symbol}`] : null) ||
              quotesList.find((q) => q && (q.instrument_token === key || q.instrument_token === `NSE_EQ|${rawKeyPart}`)) ||
              null;

            if (rawQuote) {
              // Rule 4: Legitimate exchange closing price fallback (off-market)
              if (rawQuote.volume === 0 || rawQuote.last_price <= 0 || isNaN(rawQuote.last_price)) {
                if (rawQuote.close && rawQuote.close > 0) {
                  rawQuote.last_price = rawQuote.close;
                } else if (rawQuote.average_price && rawQuote.average_price > 0) {
                  rawQuote.last_price = rawQuote.average_price;
                }
              }
              rawQuote.instrument_token = key;
              resultMap[key] = rawQuote;
            }
          });
        }
      } catch (err: unknown) {
        console.error(`[Upstox Batch Quote Error] Batch request for ${chunk.length} instruments failed:`, err);
        // Strict invariant: Do NOT fan out into individual requests
        // Leave resultMap entries as null for this chunk
      }
    }

    return resultMap;
  }

  /**
   * Tests the token against Upstox profile and market quotes for live diagnostics
   */
  public async testConnection(customToken?: string): Promise<{
    success: boolean;
    user?: string;
    quoteOk?: boolean;
    error?: string;
  }> {
    const activeToken = customToken?.trim() || this.token;
    if (!activeToken || activeToken.length < 10) {
      return { success: false, error: 'Token is empty or invalid.' };
    }

    const prevToken = this.token;
    this.token = activeToken;

    try {
      // 1. Check Profile (optional for Market Data / Analytics tokens)
      let userName = 'Authorized Trader';
      try {
        const profileRes = await this.get<{ status: string; data?: { user_name?: string; email?: string } }>(
          '/v2/user/profile'
        );
        if (profileRes?.data?.user_name || profileRes?.data?.email) {
          userName = profileRes.data.user_name || profileRes.data.email || userName;
        }
      } catch (profErr: unknown) {
        const profMsg = (profErr as Error).message || '';
        if (profMsg.toLowerCase().includes('static ip') || profMsg.includes('401')) {
          userName = 'Analytics Token (Market Data Active)';
        }
        console.warn('Profile lookup note (Analytics / Market Data Mode):', profMsg);
      }

      // 2. Check Market Quote
      const quoteRes = await this.get<{ status: string; data: Record<string, UpstoxQuote> }>(
        '/v2/market-quote/quotes',
        { instrument_key: 'NSE_EQ|INE002A01018' }
      );

      const quoteOk = Boolean(quoteRes && quoteRes.status === 'success' && quoteRes.data);

      return {
        success: true,
        user: userName,
        quoteOk,
      };
    } catch (e: unknown) {
      const err = e as Error;
      return {
        success: false,
        error: err.message || 'Failed to connect to Upstox API',
      };
    } finally {
      this.token = prevToken;
    }
  }

  /**
   * Validates the active token against Upstox profile endpoint
   */
  public async validateToken(): Promise<{ success: boolean; user?: string; error?: string }> {
    return this.testConnection(this.token || undefined);
  }

  /**
   * Fetches full EvaluationInput for a given symbol or ISIN.
   * Merges live Upstox streaming market quotes with verified institutional fundamental filings.
   */
  public async getEvaluationData(symbolOrIsin: string, knownIsin?: string): Promise<EvaluationInput> {
    const upper = symbolOrIsin.toUpperCase().trim();

    // 1. Resolve ISIN and Instrument Key strictly formatted as NSE_EQ|{ISIN}
    const isIsin = (s?: string) => Boolean(s && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s));

    const known =
      (isIsin(upper) ? SearchService.getInstrumentByIsin(upper) : undefined) ||
      SearchService.getInstrumentBySymbol(upper) ||
      (knownIsin ? SearchService.getInstrumentByIsin(knownIsin) : undefined);

    let isin = '';
    if (isIsin(upper)) {
      isin = upper;
    } else if (knownIsin && isIsin(knownIsin)) {
      isin = knownIsin;
    } else if (known?.isin && isIsin(known.isin)) {
      isin = known.isin;
    } else {
      isin = `INE_${upper}`;
    }

    // Broker format: All equity instrument keys must follow NSE_EQ|{ISIN}
    const primaryKey = `NSE_EQ|${isin}`;

    // When no live token is configured, return explicit UNAVAILABLE state (Zero synthetic/demo data in production)
    if (!this.hasToken()) {
      return {
        symbol: upper,
        dataSource: 'DATA_UNAVAILABLE',
        dataSourceError: 'Upstox access token missing. Please configure token in Portfolio Hub.',
        fundamentalStatus: 'UNAVAILABLE',
        quote: {
          instrument_token: primaryKey,
          timestamp: new Date().toISOString(),
          last_price: 0,
          open: 0,
          high: 0,
          low: 0,
          close: 0,
          volume: 0,
          average_price: 0,
          net_change: 0,
          total_buy_quantity: 0,
          total_sell_quantity: 0,
          lower_circuit_limit: 0,
          upper_circuit_limit: 0,
        },
        candles: [],
        profile: createEmptyProfile(upper, isin, known?.name, known?.sector),
        keyRatios: createEmptyKeyRatios(),
        annualIncome: createEmptyIncomeStatement(),
        quarterlyIncome: createEmptyIncomeStatement(),
        balanceSheet: createEmptyBalanceSheet(),
        cashFlow: createEmptyCashFlow(),
        shareHoldings: createEmptyShareHoldings(),
      };
    }

    // Dynamic Upstox search if ISIN unknown
    if (!isin && this.hasToken()) {
      try {
        const searchRes = await this.get<{
          status: string;
          data?: Array<{ instrument_key?: string; isin?: string; tradingsymbol?: string }>;
        }>('/v2/instruments/search', { query: upper });
        if (searchRes?.data && Array.isArray(searchRes.data)) {
          const matched =
            searchRes.data.find((d) => d.tradingsymbol?.toUpperCase() === upper) ||
            searchRes.data[0];
          if (matched?.isin) {
            isin = matched.isin;
          } else if (matched?.instrument_key && matched.instrument_key.includes('|')) {
            isin = matched.instrument_key.split('|')[1];
          }
        }
      } catch {
        // Continue with symbol fallback
      }
    }

    // All equity instrument keys must follow broker format NSE_EQ|{ISIN}
    // Strict contract: Upstox rejects comma-separated symbol pseudo-keys (e.g. NSE_EQ|RELIANCE) with HTTP 400.
    // Always query canonical primaryKey (NSE_EQ|{isin}).
    const candidateKeys = primaryKey;

    const sessionResolution = SessionResolver.resolve();
    const toDate = sessionResolution.tradingSessionId;
    const [tYear, tMonth, tDay] = toDate.split('-').map(Number);
    const targetDateObj = new Date(Date.UTC(tYear, tMonth - 1, tDay));
    const fromDateObj = new Date(targetDateObj.getTime() - 400 * 24 * 60 * 60 * 1000);
    const fromDate = fromDateObj.toISOString().split('T')[0];

    // Parallel resilient fetch across official Upstox endpoints using Promise.allSettled
    const [
      quoteSettled,
      candleSettled,
      profileSettled,
      keyRatiosSettled,
      annualIncomeSettled,
      quarterlyIncomeSettled,
      balanceSheetSettled,
      cashFlowSettled,
      shareHoldingsSettled,
      corporateActionsSettled,
    ] = await Promise.allSettled([
      // 1. Live Market Quote
      this.get<{ status: string; data: Record<string, UpstoxQuote> }>(`/v2/market-quote/quotes`, {
        instrument_key: candidateKeys,
      }),
      // 2. Historical Candles
      this.get<UpstoxHistoricalCandleResponse>(
        `/v2/historical-candle/${encodeURIComponent(primaryKey)}/day/${toDate}/${fromDate}`
      ),
      // 3. Profile
      isin ? this.get<UpstoxProfileResponse>(`/v2/fundamentals/${isin}/profile`) : Promise.reject('No ISIN'),
      // 4. Key Ratios (Consolidated Financials Mandate - Rule 1: ?view_type=consolidated)
      isin
        ? this.get<UpstoxKeyRatiosResponse>(`/v2/fundamentals/${isin}/key-ratios`, {
            view_type: 'consolidated',
          })
        : Promise.reject('No ISIN'),
      // 5. Annual Income Statement (Consolidated Financials Mandate - Rule 1: ?view_type=consolidated)
      isin
        ? this.get<UpstoxIncomeStatementResponse>(`/v2/fundamentals/${isin}/income-statement`, {
            type: 'consolidated',
            view_type: 'consolidated',
            time_period: 'yearly',
            fs: 'true',
          })
        : Promise.reject('No ISIN'),
      // 6. Quarterly Income Statement (Consolidated Financials Mandate - Rule 1: ?view_type=consolidated)
      isin
        ? this.get<UpstoxIncomeStatementResponse>(`/v2/fundamentals/${isin}/income-statement`, {
            type: 'consolidated',
            view_type: 'consolidated',
            time_period: 'quarterly',
            fs: 'true',
          })
        : Promise.reject('No ISIN'),
      // 7. Balance Sheet (Consolidated Financials Mandate - Rule 1)
      isin
        ? this.get<UpstoxBalanceSheetResponse>(`/v2/fundamentals/${isin}/balance-sheet`, {
            type: 'consolidated',
            view_type: 'consolidated',
            fs: 'true',
          })
        : Promise.reject('No ISIN'),
      // 8. Cash Flow Statement (Consolidated Financials Mandate - Rule 1)
      isin
        ? this.get<UpstoxCashFlowResponse>(`/v2/fundamentals/${isin}/cash-flow`, {
            type: 'consolidated',
            view_type: 'consolidated',
            fs: 'true',
          })
        : Promise.reject('No ISIN'),
      // 9. Shareholding Pattern
      isin
        ? this.get<UpstoxShareHoldingsResponse>(`/v2/fundamentals/${isin}/share-holdings`)
        : Promise.reject('No ISIN'),
      // 10. Corporate Actions (Split / Bonus Interceptor - Rule 2)
      isin
        ? this.get<UpstoxCorporateActionsResponse>(`/v2/fundamentals/${isin}/corporate-actions`)
        : Promise.reject('No ISIN'),
    ]);

    // Eliminate Silent Mock Swallowing & Synthetic Data Fallback:
    // When Upstox rejects an instrument key or fails:
    // - Do NOT generate synthetic candles.
    // - Do NOT fake quotes.
    // - Return explicit error state: UPSTOX_DATA_ERROR or DATA_UNAVAILABLE.
    // - Report exact error returned by Upstox.

    let quoteError: string | null = null;
    let quoteIsApiError = false;
    let quote: UpstoxQuote | null = null;

    if (quoteSettled.status === 'fulfilled' && quoteSettled.value?.data) {
      const qData = quoteSettled.value.data;
      const quotesList = Object.values(qData);
      const symbolFromIsin = isin ? SearchService.getInstrumentByIsin(isin)?.symbol?.toUpperCase() : null;
      const targetSymbol = (known?.symbol || symbolFromIsin || upper).toUpperCase();

      quote =
        (isin ? qData[`NSE_EQ|${isin}`] : null) ||
        (isin ? qData[`NSE_EQ:${isin}`] : null) ||
        qData[`NSE_EQ|${targetSymbol}`] ||
        qData[`NSE_EQ:${targetSymbol}`] ||
        qData[`NSE_EQ|${upper}`] ||
        qData[`NSE_EQ:${upper}`] ||
        (known?.isin ? qData[`NSE_EQ|${known.isin.toUpperCase()}`] : null) ||
        qData[primaryKey] ||
        quotesList.find((q) => q && (q.instrument_token === primaryKey || (isin && q.instrument_token === `NSE_EQ|${isin}`))) ||
        (quotesList.length === 1 && quotesList[0] ? quotesList[0] : null) ||
        null;

      if (!quote || quote.last_price === undefined || isNaN(quote.last_price)) {
        quoteError = `Upstox returned empty quote for ${primaryKey}`;
      }
    } else if (quoteSettled.status === 'rejected') {
      const reason = quoteSettled.reason;
      quoteError = reason instanceof Error ? reason.message : String(reason);
      quoteIsApiError = true;
    } else {
      quoteError = `Upstox market quote data missing for ${primaryKey}`;
    }

    let candleError: string | null = null;
    let candleIsApiError = false;
    let candles: UpstoxCandle[] = [];

    if (
      candleSettled.status === 'fulfilled' &&
      candleSettled.value?.data?.candles &&
      Array.isArray(candleSettled.value.data.candles)
    ) {
      candles = candleSettled.value.data.candles;
      if (candles.length === 0) {
        candleError = `Upstox returned 0 candles for ${primaryKey}`;
      }
    } else if (candleSettled.status === 'rejected') {
      const reason = candleSettled.reason;
      candleError = reason instanceof Error ? reason.message : String(reason);
      candleIsApiError = true;
    } else {
      candleError = `Upstox candle data missing for ${primaryKey}`;
    }

    // Determine dataSource state strictly
    let dataSource: import('../types/engine').DataSource = 'UPSTOX_LIVE';
    let dataSourceError: string | undefined = undefined;

    if (quoteIsApiError || candleIsApiError) {
      dataSource = 'UPSTOX_DATA_ERROR';
      dataSourceError = quoteError || candleError || 'Upstox API request rejected';
    } else if (quoteError || candleError || !quote || candles.length === 0) {
      dataSource = 'DATA_UNAVAILABLE';
      dataSourceError = quoteError || candleError || 'Market quote or historical candles unavailable';
    }

    // When quote is unavailable or errored, do NOT fake quotes. Provide clean zero-quote structure
    if (!quote) {
      quote = {
        instrument_token: primaryKey,
        timestamp: new Date().toISOString(),
        last_price: 0,
        open: 0,
        high: 0,
        low: 0,
        close: 0,
        volume: 0,
        average_price: 0,
        net_change: 0,
        total_buy_quantity: 0,
        total_sell_quantity: 0,
        lower_circuit_limit: 0,
        upper_circuit_limit: 0,
      };
    } else {
      // Rule 4: Off-Market Quote Fallback
      // If volume === 0 or market closed (or erratic last_price <= 0), fallback to ohlc.close / close
      if (quote.volume === 0 || quote.last_price <= 0 || isNaN(quote.last_price)) {
        if (quote.close && quote.close > 0) {
          quote.last_price = quote.close;
        } else if (quote.average_price && quote.average_price > 0) {
          quote.last_price = quote.average_price;
        }
      }
      quote.instrument_token = primaryKey;
    }

    // Zero synthetic candles when Upstox fails or rejects
    // candles remains [] if candleSettled was rejected or returned 0 candles

    // Extract Profile
    const profileLive = profileSettled.status === 'fulfilled' && Boolean(profileSettled.value?.data?.company_name);
    let profile: UpstoxProfileResponse = profileLive
      ? profileSettled.value
      : createEmptyProfile(upper, isin, known?.name, known?.sector);

    // Extract Key Ratios
    const keyRatiosLive = keyRatiosSettled.status === 'fulfilled' && Boolean(keyRatiosSettled.value?.data?.length);
    let keyRatios: UpstoxKeyRatiosResponse = keyRatiosLive
      ? keyRatiosSettled.value
      : createEmptyKeyRatios();

    // Extract Annual Income Statement
    const annualIncomeLive =
      annualIncomeSettled.status === 'fulfilled' &&
      Boolean(annualIncomeSettled.value?.data?.income_statement?.length);
    let annualIncome: UpstoxIncomeStatementResponse = annualIncomeLive
      ? annualIncomeSettled.value
      : createEmptyIncomeStatement();

    // Extract Quarterly Income Statement
    const quarterlyIncomeLive =
      quarterlyIncomeSettled.status === 'fulfilled' &&
      Boolean(quarterlyIncomeSettled.value?.data?.income_statement?.length);
    let quarterlyIncome: UpstoxIncomeStatementResponse = quarterlyIncomeLive
      ? quarterlyIncomeSettled.value
      : createEmptyIncomeStatement();

    // Extract Balance Sheet
    const balanceSheetLive =
      balanceSheetSettled.status === 'fulfilled' &&
      Boolean(balanceSheetSettled.value?.data?.history?.length);
    let balanceSheet: UpstoxBalanceSheetResponse = balanceSheetLive
      ? balanceSheetSettled.value
      : createEmptyBalanceSheet();

    // Extract Cash Flow
    const cashFlowLive =
      cashFlowSettled.status === 'fulfilled' &&
      Boolean(cashFlowSettled.value?.data?.cash_flow?.length);
    let cashFlow: UpstoxCashFlowResponse = cashFlowLive
      ? cashFlowSettled.value
      : createEmptyCashFlow();

    // Extract Share Holdings
    const shareHoldingsLive =
      shareHoldingsSettled.status === 'fulfilled' &&
      Boolean(shareHoldingsSettled.value?.data?.history?.length);
    let shareHoldings: UpstoxShareHoldingsResponse = shareHoldingsLive
      ? shareHoldingsSettled.value
      : createEmptyShareHoldings();

    // Extract Corporate Actions (Rule 2)
    const corporateActions: UpstoxCorporateActionsResponse | undefined =
      corporateActionsSettled.status === 'fulfilled' &&
      corporateActionsSettled.value?.data &&
      corporateActionsSettled.value.data.length > 0
        ? corporateActionsSettled.value
        : undefined;

    // Calculate Fundamental Data Status: LIVE | PARTIAL | FALLBACK | UNAVAILABLE
    const liveStatementsCount = [
      profileLive,
      keyRatiosLive,
      annualIncomeLive,
      quarterlyIncomeLive,
      balanceSheetLive,
      cashFlowLive,
      shareHoldingsLive,
    ].filter(Boolean).length;

    let fundamentalStatus: import('../types/engine').FundamentalDataStatus = 'UNAVAILABLE';
    if (liveStatementsCount === 7) {
      fundamentalStatus = 'LIVE';
    } else {
      // Upstox Analytics Token has no access to /v2/fundamentals/* (returns 401 or 429)
      // Fallback to verified Institutional Fundamentals Database so Fundamental Score is calculated accurately
      const institutionalData = FundamentalsDatabase.getFundamentals(upper, isin, known?.name, known?.sector);
      if (!profileLive) profile = institutionalData.profile;
      if (!keyRatiosLive) keyRatios = institutionalData.keyRatios;
      if (!annualIncomeLive) annualIncome = institutionalData.annualIncome;
      if (!quarterlyIncomeLive) quarterlyIncome = institutionalData.quarterlyIncome;
      if (!balanceSheetLive) balanceSheet = institutionalData.balanceSheet;
      if (!cashFlowLive) cashFlow = institutionalData.cashFlow;
      if (!shareHoldingsLive) shareHoldings = institutionalData.shareHoldings;
      fundamentalStatus = liveStatementsCount > 0 ? 'PARTIAL' : 'FALLBACK';
    }

    return {
      symbol: upper,
      dataSource,
      dataSourceError,
      fundamentalStatus,
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
    };
  }

  /**
   * Fetches user holdings from Upstox API
   */
  public async getHoldings(): Promise<Holding[]> {
    if (!this.hasToken()) {
      throw new Error('Unauthenticated: Upstox access token required to fetch live holdings');
    }

    const response = await this.get<UpstoxHoldingsResponse>('/v2/portfolio/long-term-holdings');
    if (response && response.data && Array.isArray(response.data)) {
      if (response.data.length === 0) {
        return [];
      }
      return response.data.map((item, idx) => {
        const sym = item.tradingsymbol ? item.tradingsymbol.toUpperCase() : 'UNKNOWN';
        const known = SearchService.getInstrumentBySymbol(sym) || (item.isin ? SearchService.getInstrumentByIsin(item.isin) : undefined);
        return {
          id: `upstox_${sym}_${idx}`,
          symbol: known?.symbol || sym,
          companyName: item.company_name || known?.name || sym,
          sector: known?.sector || 'Equities',
          isin: item.isin || known?.isin,
          quantity: item.quantity,
          averageBuyPrice: item.average_price,
          addedAt: new Date().toISOString(),
        };
      });
    }
    throw new Error('Malformed or empty response received from Upstox holdings API');
  }
}

/**
 * Determines whether a daily candle is finalized or in-progress.
 * A daily candle is finalized if its date is strictly prior to the current trading session,
 * or if the current session has completed (POST_CLOSE / CLOSED_OVERNIGHT).
 */
export function isDailyCandleFinalized(
  candleDate: string,
  currentTradingSessionId: string,
  marketSessionState: MarketSessionState
): boolean {
  if (!candleDate || !currentTradingSessionId) return false;
  // If candle is from a strictly earlier date than current trading session -> Finalized
  if (candleDate < currentTradingSessionId) {
    return true;
  }
  // If candle date equals current trading session:
  // It is finalized ONLY if market has completed post-close, is closed overnight, or is weekend/holiday
  if (candleDate === currentTradingSessionId) {
    return (
      marketSessionState === 'POST_CLOSE' ||
      marketSessionState === 'CLOSED_OVERNIGHT' ||
      marketSessionState === 'WEEKEND' ||
      marketSessionState === 'HOLIDAY'
    );
  }
  return false;
}

export function createEmptyProfile(symbol: string, isin?: string, name?: string, sector?: string): UpstoxProfileResponse {
  return {
    status: 'success',
    data: {
      company_name: name || symbol,
      sector_name: sector || 'Other',
      industry_name: sector || 'Other',
      isin: isin || '',
    },
  };
}

export function createEmptyKeyRatios(): UpstoxKeyRatiosResponse {
  return { status: 'success', data: [] };
}

export function createEmptyIncomeStatement(): UpstoxIncomeStatementResponse {
  return {
    status: 'success',
    data: { type: 'consolidated', time_period: 'yearly', units_in: 'crore', income_statement: [] },
  };
}

export function createEmptyBalanceSheet(): UpstoxBalanceSheetResponse {
  return {
    status: 'success',
    data: { type: 'consolidated', time_period: 'yearly', units_in: 'crore', history: [], full_statement: [] },
  };
}

export function createEmptyCashFlow(): UpstoxCashFlowResponse {
  return {
    status: 'success',
    data: { type: 'consolidated', time_period: 'yearly', units_in: 'crore', cash_flow: [] },
  };
}

export function createEmptyShareHoldings(): UpstoxShareHoldingsResponse {
  return { status: 'success', data: { history: [] } };
}


