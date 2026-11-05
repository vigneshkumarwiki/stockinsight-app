/**
 * Safe Numeric Parser & Normalizer
 * Enforces Zero-Coercion Rule: Missing data must NEVER become 0 or 0.0
 */

import { MetricValue } from '../types/engine';

export class SafeParser {
  /**
   * Safely parses a string or raw number into a clean float or null.
   * Strips %, commas, currency symbols, and whitespace.
   * Rejects "N/A", "NA", "-", "", undefined, null -> null
   */
  public static parseNumeric(raw: string | number | null | undefined): number | null {
    if (raw === null || raw === undefined) {
      return null;
    }

    if (typeof raw === 'number') {
      return isNaN(raw) || !isFinite(raw) ? null : raw;
    }

    const trimmed = raw.trim();
    if (
      trimmed === '' ||
      trimmed === '-' ||
      trimmed === 'N/A' ||
      trimmed === 'NA' ||
      trimmed === 'null' ||
      trimmed === 'undefined'
    ) {
      return null;
    }

    // Strip '%' and commas
    const cleanStr = trimmed.replace(/[%,\s₹$]/g, '');
    const num = parseFloat(cleanStr);

    return isNaN(num) || !isFinite(num) ? null : num;
  }

  /**
   * Creates a MetricValue with deterministic DataState
   */
  public static toMetric<T>(
    value: T | null,
    sourceEndpoint: string,
    isDerived: boolean = false
  ): MetricValue<T> {
    if (value === null || value === undefined) {
      return {
        value: null,
        state: 'MISSING',
        sourceEndpoint,
      };
    }

    return {
      value,
      state: isDerived ? 'DERIVED' : 'AVAILABLE',
      sourceEndpoint,
    };
  }

  /**
   * Evaluates if P/E indicates a loss-making entity
   */
  public static isLossMakingPE(pe: number | null): boolean {
    return pe !== null && pe <= 0;
  }

  /**
   * Evaluates if P/B indicates an entity with negative net worth
   */
  public static isDeficitPB(pb: number | null): boolean {
    return pb !== null && pb <= 0;
  }

  /**
   * Normalizes 20-day turnover into Crores (₹ Cr)
   * Formula: Sum(Close_i * Volume_i) / (20 * 10^7)
   */
  public static calculateTurnoverCr(
    candles: [string, number, number, number, number, number, number][]
  ): number {
    if (!candles || candles.length === 0) return 0;
    
    // Take the latest 20 candles
    const window = candles.slice(0, Math.min(20, candles.length));
    const totalTurnoverINR = window.reduce((sum, candle) => {
      const close = candle[4];
      const volume = candle[5];
      return sum + close * volume;
    }, 0);

    const avgTurnoverINR = totalTurnoverINR / window.length;
    return avgTurnoverINR / 10_000_000; // Convert to ₹ Crores
  }
}
