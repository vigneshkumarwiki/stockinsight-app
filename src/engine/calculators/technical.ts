/**
 * Technical Indicator & Volume Engine Calculators
 * Native algorithms operating directly on Upstox daily candle series
 * Implements Upstox Live Feed Normalization Rules:
 * Rule 2: Corporate Action Split/Bonus Candle Adjustment (back-adjusts pre-split OHLC values before computing indicators)
 * Rule 4: Off-Market Quote Fallback
 */

import { UpstoxCandle, UpstoxCorporateActionsResponse } from '../../types/upstox';
import { SessionResolver } from '../sessionResolver';
import { isDailyCandleFinalized } from '../../api/upstoxClient';
import type { VolumeAccumulationState, VolumeAccumulationResult } from '../../types/engine';

export type { VolumeAccumulationState, VolumeAccumulationResult };

export interface TechnicalCalculations {
  ltp: number;
  ema200: number | null;
  ema200SlopePct: number | null; // 20-day % change of 200 EMA
  sma100: number | null;
  sma50: number | null;
  maAligned: boolean;
  rsi14: number | null;
  volumeAccumulationRatio: number | null; // Up-day volume / Down-day volume over 20 bars (null when state is MAX_ACCUMULATION, ZERO_VOLUME, or MISSING)
  volumeAccumulationState?: VolumeAccumulationState;
  breakoutVolumeRatio: number | null;     // Latest bar volume / 20-day SMA volume
  roc20: number | null;                   // 20-day Rate of Change %
  rangePosition52WPct: number | null;     // 52-Week Range Position %
  atr14: number | null;
  swingLow10: number | null;
  turnover20DCr: number;
}

export class TechnicalCalculator {
  /**
   * Adjusts historical candles backwards for unadjusted stock splits and bonus issues
   * as per Upstox Live Feed Normalization Rule 2.
   *
   * Normalizes incoming candles:
   * 1. Validates finite, positive prices, valid volumes, and sane OHLC relationships (high >= low).
   * 2. Sorts candles strictly in descending chronological order (candles[0] is latest).
   * 3. Deduplicates candles by calendar date (keeps first/latest for each date).
   * 4. Applies explicit Split / Reverse-Split / Bonus backward adjustments.
   * 5. Falls back to automated step-discontinuity detection when corporate action metadata is absent.
   */
  public static adjustCandlesForCorporateActions(
    rawCandles: UpstoxCandle[],
    corporateActions?: UpstoxCorporateActionsResponse | null
  ): UpstoxCandle[] {
    if (!rawCandles || rawCandles.length === 0) return [];

    // 1. Filter, sanitize, and validate raw candle structures
    const validCandles: UpstoxCandle[] = [];
    for (const raw of rawCandles) {
      if (!Array.isArray(raw) || raw.length < 6) continue;

      const [ts, open, high, low, close, volume] = raw;
      if (typeof ts !== 'string' || !ts.trim()) continue;

      const dateMs = new Date(ts).getTime();
      if (isNaN(dateMs)) continue;

      // Validate finite positive prices and non-negative volume
      if (
        typeof open !== 'number' || !isFinite(open) || open <= 0 ||
        typeof high !== 'number' || !isFinite(high) || high <= 0 ||
        typeof low !== 'number' || !isFinite(low) || low <= 0 ||
        typeof close !== 'number' || !isFinite(close) || close <= 0 ||
        typeof volume !== 'number' || !isFinite(volume) || volume < 0
      ) {
        continue;
      }

      // Validate OHLC sanity (high must be >= low)
      if (high < low) {
        continue;
      }

      // Ensure open and close are bounded by high and low
      const saneHigh = Math.max(high, open, close);
      const saneLow = Math.min(low, open, close);

      const oi = typeof raw[6] === 'number' && isFinite(raw[6]) ? raw[6] : 0;
      validCandles.push([ts, open, saneHigh, saneLow, close, volume, oi]);
    }

    if (validCandles.length === 0) return [];

    // 2. Sort strictly in descending chronological order (latest date first: index 0 is most recent)
    validCandles.sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());

    // 3. Deduplicate by date (keep first entry encountered for each YYYY-MM-DD)
    const seenDates = new Set<string>();
    const candles: UpstoxCandle[] = [];
    for (const c of validCandles) {
      const dateKey = c[0].split('T')[0];
      if (!seenDates.has(dateKey)) {
        seenDates.add(dateKey);
        candles.push([...c] as UpstoxCandle);
      }
    }

    // 4. Process explicit Upstox Corporate Actions API response
    if (corporateActions && corporateActions.data && Array.isArray(corporateActions.data)) {
      for (const action of corporateActions.data) {
        const actionType = action.name?.toLowerCase();
        if (actionType === 'split' || actionType === 'bonus') {
          const effectiveDateStr = action.expiry_date;
          if (!effectiveDateStr) continue;

          let factor = 1.0;
          const ratioStr = action.ratio || ''; // e.g. "1:5", "5:1", "1:1", "2:1"
          const parts = ratioStr.split(':').map((p) => parseFloat(p.trim()));

          if (
            parts.length === 2 &&
            !isNaN(parts[0]) &&
            !isNaN(parts[1]) &&
            parts[0] > 0 &&
            parts[1] > 0 &&
            isFinite(parts[0]) &&
            isFinite(parts[1])
          ) {
            if (actionType === 'split') {
              // Upstox ratio convention: parts[0] old shares : parts[1] new shares
              // Forward split (e.g. 1:5 -> 1 old share splits into 5 new shares) => factor = 1/5 = 0.20
              // Reverse split (e.g. 5:1 -> 5 old shares consolidate into 1 new share) => factor = 5/1 = 5.00
              factor = parts[0] / parts[1];
            } else if (actionType === 'bonus') {
              // Bonus convention: parts[0] bonus shares for parts[1] existing shares
              // e.g. 1:1 -> 1 bonus for 1 existing => 2 total shares => factor = 1/(1+1) = 0.50
              // e.g. 2:1 -> 2 bonus for 1 existing => 3 total shares => factor = 1/(1+2) = 0.3333...
              const bonusShares = parts[0];
              const existingShares = parts[1];
              factor = existingShares / (existingShares + bonusShares);
            }
          }

          if (isFinite(factor) && factor > 0 && factor !== 1.0) {
            const effTime = new Date(effectiveDateStr).getTime();
            if (!isNaN(effTime)) {
              // Apply backward adjustment factor to all candles prior to effective date
              for (let i = 0; i < candles.length; i++) {
                const candleTime = new Date(candles[i][0]).getTime();
                if (candleTime < effTime) {
                  candles[i][1] = Number((candles[i][1] * factor).toFixed(2)); // open
                  candles[i][2] = Number((candles[i][2] * factor).toFixed(2)); // high
                  candles[i][3] = Number((candles[i][3] * factor).toFixed(2)); // low
                  candles[i][4] = Number((candles[i][4] * factor).toFixed(2)); // close
                  candles[i][5] = Math.max(0, Math.round(candles[i][5] / factor)); // volume
                }
              }
            }
          }
        }
      }
    }

    // 5. Automated Step-Discontinuity Detection (guards against unadjusted feed drops when metadata is missing)
    // If adjacent sessions show overnight ratio drop > 1.8x or surge > 1.8x
    for (let i = 0; i < candles.length - 1; i++) {
      const currentOpen = candles[i][1];
      const prevClose = candles[i + 1][4];
      if (currentOpen > 0 && prevClose > 0) {
        const dropRatio = prevClose / currentOpen;
        const surgeRatio = currentOpen / prevClose;

        // Forward split drops: ~2:1, ~5:1, ~10:1
        if (dropRatio >= 1.85 && dropRatio <= 2.15) {
          this.applyFactorBackwards(candles, i + 1, 0.5);
        } else if (dropRatio >= 4.7 && dropRatio <= 5.3) {
          this.applyFactorBackwards(candles, i + 1, 0.2);
        } else if (dropRatio >= 9.5 && dropRatio <= 10.5) {
          this.applyFactorBackwards(candles, i + 1, 0.1);
        }
        // Reverse split surges: ~1:2, ~1:5, ~1:10
        else if (surgeRatio >= 1.85 && surgeRatio <= 2.15) {
          this.applyFactorBackwards(candles, i + 1, 2.0);
        } else if (surgeRatio >= 4.7 && surgeRatio <= 5.3) {
          this.applyFactorBackwards(candles, i + 1, 5.0);
        } else if (surgeRatio >= 9.5 && surgeRatio <= 10.5) {
          this.applyFactorBackwards(candles, i + 1, 10.0);
        }
      }
    }

    return candles;
  }

  private static applyFactorBackwards(candles: UpstoxCandle[], startIndex: number, factor: number) {
    if (!isFinite(factor) || factor <= 0 || factor === 1.0) return;
    for (let j = startIndex; j < candles.length; j++) {
      candles[j][1] = Number((candles[j][1] * factor).toFixed(2));
      candles[j][2] = Number((candles[j][2] * factor).toFixed(2));
      candles[j][3] = Number((candles[j][3] * factor).toFixed(2));
      candles[j][4] = Number((candles[j][4] * factor).toFixed(2));
      candles[j][5] = Math.max(0, Math.round(candles[j][5] / factor));
    }
  }

  /**
   * Calculates Simple Moving Average (SMA)
   * Note: Upstox candles are sorted latest first: index 0 is today, index 1 is yesterday, etc.
   */
  public static calculateSMA(candles: UpstoxCandle[], period: number, offset: number = 0): number | null {
    if (candles.length < period + offset) return null;

    let sum = 0;
    for (let i = offset; i < period + offset; i++) {
      sum += candles[i][4]; // Close price
    }
    return sum / period;
  }

  /**
   * Calculates Exponential Moving Average (EMA)
   */
  public static calculateEMA(candles: UpstoxCandle[], period: number, offset: number = 0): number | null {
    if (candles.length < period + offset) return null;

    // Upstox candles: index 0 is most recent. We need chronological order (oldest to newest)
    const chronClose: number[] = [];
    for (let i = candles.length - 1; i >= offset; i--) {
      chronClose.push(candles[i][4]);
    }

    if (chronClose.length < period) return null;

    // Initial SMA for first `period` bars
    let ema = 0;
    for (let i = 0; i < period; i++) {
      ema += chronClose[i];
    }
    ema = ema / period;

    const multiplier = 2 / (period + 1);

    for (let i = period; i < chronClose.length; i++) {
      ema = (chronClose[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Calculates standard 14-period RSI (Wilder's Smoothing)
   */
  public static calculateRSI(candles: UpstoxCandle[], period: number = 14): number | null {
    if (candles.length < period + 1) return null;

    // Convert to chronological array of closes
    const closes: number[] = [];
    for (let i = candles.length - 1; i >= 0; i--) {
      closes.push(candles[i][4]);
    }

    let gains = 0;
    let losses = 0;

    // First `period` changes
    for (let i = 1; i <= period; i++) {
      const change = closes[i] - closes[i - 1];
      if (change >= 0) gains += change;
      else losses += Math.abs(change);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Subsequent smoothed values
    for (let i = period + 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      const gain = change >= 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Calculates Up-Day vs Down-Day Volume Accumulation Ratio over 20 sessions
   * and Breakout Volume Ratio (numerator volume / preceding 20 completed sessions average).
   *
   * Handles candle finalization semantics:
   * - When the current daily candle is not finalized, uses candles[1] (most recent completed daily candle)
   *   as the numerator and compares against preceding 20 completed daily candles (candles[2..21]).
   * - When the current daily candle is finalized, uses candles[0] as numerator and compares against
   *   preceding 20 completed daily candles (candles[1..20]).
   *
   * @param candles Daily candles sorted latest-first (candles[0] is latest)
   * @param isCurrentCandleFinalized Optional explicit boolean, Date instance, or ISO date string
   */
  public static calculateVolumeAccumulation(
    candles: UpstoxCandle[],
    isCurrentCandleFinalized?: boolean | Date | string
  ): VolumeAccumulationResult {
    if (!candles || candles.length === 0) {
      return {
        accumulationRatio: null,
        accumulationState: 'MISSING',
        breakoutVolumeRatio: null,
        displayValue: null,
      };
    }

    let isFinalized = true;

    if (typeof isCurrentCandleFinalized === 'boolean') {
      isFinalized = isCurrentCandleFinalized;
    } else if (candles.length > 0 && candles[0] && candles[0][0]) {
      const evalDate =
        isCurrentCandleFinalized instanceof Date
          ? isCurrentCandleFinalized
          : typeof isCurrentCandleFinalized === 'string'
          ? new Date(isCurrentCandleFinalized)
          : new Date();

      const session = SessionResolver.resolve(evalDate);
      const candleDate = String(candles[0][0]).split('T')[0];
      isFinalized = isDailyCandleFinalized(candleDate, session.tradingSessionId, session.marketSessionState);
    }

    const startIndex = isFinalized ? 0 : 1;
    const minRequired = startIndex + 21; // startIndex + 1 numerator + 20 preceding completed candles

    if (candles.length < minRequired) {
      return {
        accumulationRatio: null,
        accumulationState: 'INSUFFICIENT_HISTORY',
        breakoutVolumeRatio: null,
        displayValue: null,
      };
    }

    const numeratorVolume = candles[startIndex][5];
    if (typeof numeratorVolume !== 'number' || isNaN(numeratorVolume) || numeratorVolume < 0) {
      return {
        accumulationRatio: null,
        accumulationState: 'MISSING',
        breakoutVolumeRatio: null,
        displayValue: null,
      };
    }

    let total20Volume = 0;
    for (let i = startIndex + 1; i <= startIndex + 20; i++) {
      const vol = candles[i][5];
      if (typeof vol !== 'number' || isNaN(vol) || vol < 0) {
        return {
          accumulationRatio: null,
          accumulationState: 'MISSING',
          breakoutVolumeRatio: null,
          displayValue: null,
        };
      }
      total20Volume += vol;
    }

    const avg20Volume = total20Volume / 20;
    const breakoutVolumeRatio = avg20Volume > 0 ? numeratorVolume / avg20Volume : 1.0;

    let upVolume = 0;
    let downVolume = 0;

    for (let i = startIndex; i < startIndex + 20; i++) {
      const closeToday = candles[i][4];
      const closePrev = candles[i + 1][4];
      const volume = candles[i][5];

      if (closeToday >= closePrev) {
        upVolume += volume;
      } else {
        downVolume += volume;
      }
    }

    let accumulationRatio: number | null = null;
    let accumulationState: VolumeAccumulationState = 'NORMAL';
    let displayValue: string | null = null;

    if (downVolume === 0) {
      if (upVolume > 0) {
        accumulationRatio = null;
        accumulationState = 'MAX_ACCUMULATION';
        displayValue = '100% Up-Day Volume';
      } else {
        accumulationRatio = null;
        accumulationState = 'ZERO_VOLUME';
        displayValue = 'No volume recorded';
      }
    } else {
      accumulationRatio = upVolume / downVolume;
      accumulationState = 'NORMAL';
      displayValue = `${accumulationRatio.toFixed(2)}x`;
    }

    return {
      accumulationRatio,
      accumulationState,
      breakoutVolumeRatio,
      displayValue,
    };
  }

  /**
   * Calculates Average True Range (ATR-14)
   */
  public static calculateATR(candles: UpstoxCandle[], period: number = 14): number | null {
    if (candles.length < period + 1) return null;

    // True ranges chronological (oldest to newest)
    const trs: number[] = [];
    for (let i = candles.length - 2; i >= 0; i--) {
      const high = candles[i][2];
      const low = candles[i][3];
      const prevClose = candles[i + 1][4];

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trs.push(tr);
    }

    if (trs.length < period) return null;

    // Initial ATR
    let atr = 0;
    for (let i = 0; i < period; i++) {
      atr += trs[i];
    }
    atr = atr / period;

    // Wilder's smoothing
    for (let i = period; i < trs.length; i++) {
      atr = (atr * (period - 1) + trs[i]) / period;
    }

    return atr;
  }

  /**
   * Calculates Lowest Low of the last N sessions (Swing Low Floor)
   */
  public static calculateSwingLow(candles: UpstoxCandle[], period: number = 10): number | null {
    if (candles.length < period) return null;

    let lowest = Infinity;
    for (let i = 0; i < period; i++) {
      if (candles[i][3] < lowest) {
        lowest = candles[i][3]; // Low price
      }
    }
    return isFinite(lowest) ? lowest : null;
  }

  /**
   * Executes full suite of technical calculations
   * Accepts corporate actions to perform backward adjustments (Rule 2)
   * and quoteLtp for off-market fallback (Rule 4).
   */
  public static compute(
    rawCandles: UpstoxCandle[],
    corporateActions?: UpstoxCorporateActionsResponse | null,
    quoteLtp?: number,
    evaluatedAt?: Date | string | boolean
  ): TechnicalCalculations {
    // 1. Apply Corporate Action Adjustment (Rule 2)
    const candles = this.adjustCandlesForCorporateActions(rawCandles, corporateActions);

    if (!candles || candles.length === 0) {
      const fallbackLtp = quoteLtp && quoteLtp > 0 ? quoteLtp : 0;
      return {
        ltp: fallbackLtp,
        ema200: null,
        ema200SlopePct: null,
        sma100: null,
        sma50: null,
        maAligned: false,
        rsi14: null,
        volumeAccumulationRatio: null,
        volumeAccumulationState: 'MISSING',
        breakoutVolumeRatio: null,
        roc20: null,
        rangePosition52WPct: null,
        atr14: null,
        swingLow10: null,
        turnover20DCr: 0,
      };
    }

    // 2. Off-Market Quote Fallback (Rule 4)
    const ltp = quoteLtp && quoteLtp > 0 ? quoteLtp : candles[0][4]; // Latest close
    const sma50 = this.calculateSMA(candles, 50);
    const sma100 = this.calculateSMA(candles, 100);
    const ema200 = this.calculateEMA(candles, 200);

    // 200 EMA slope: compare current 200 EMA with 200 EMA 20 bars ago
    const ema200Past = this.calculateEMA(candles, 200, 20);
    let ema200SlopePct: number | null = null;
    if (ema200 !== null && ema200Past !== null && ema200Past > 0) {
      ema200SlopePct = ((ema200 - ema200Past) / ema200Past) * 100;
    }

    const maAligned = Boolean(
      sma50 && sma100 && ema200 && sma50 > sma100 && sma100 > ema200
    );

    const rsi14 = this.calculateRSI(candles, 14);

    // 20-Day ROC
    let roc20: number | null = null;
    if (candles.length > 20) {
      const close20Ago = candles[20][4];
      if (close20Ago > 0) {
        roc20 = ((ltp - close20Ago) / close20Ago) * 100;
      }
    }

    // 52-Week High and Low (approx 250 trading bars)
    const lookback52W = Math.min(candles.length, 250);
    let high52W = -Infinity;
    let low52W = Infinity;
    for (let i = 0; i < lookback52W; i++) {
      if (candles[i][2] > high52W) high52W = candles[i][2];
      if (candles[i][3] < low52W) low52W = candles[i][3];
    }

    let rangePosition52WPct: number | null = null;
    if (isFinite(high52W) && isFinite(low52W) && high52W > low52W) {
      rangePosition52WPct = ((ltp - low52W) / (high52W - low52W)) * 100;
    }

    const { accumulationRatio, accumulationState, breakoutVolumeRatio } = this.calculateVolumeAccumulation(candles, evaluatedAt);
    const atr14 = this.calculateATR(candles, 14);
    const swingLow10 = this.calculateSwingLow(candles, 10);

    // 20-Day Average Turnover in ₹ Cr
    const turnover20DCr = candles.length >= 20
      ? (candles.slice(0, 20).reduce((sum, c) => sum + c[4] * c[5], 0) / 20) / 10_000_000
      : 0;

    return {
      ltp,
      ema200,
      ema200SlopePct,
      sma100,
      sma50,
      maAligned,
      rsi14,
      volumeAccumulationRatio: accumulationRatio,
      volumeAccumulationState: accumulationState,
      breakoutVolumeRatio,
      roc20,
      rangePosition52WPct,
      atr14,
      swingLow10,
      turnover20DCr,
    };
  }
}
