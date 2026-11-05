/**
 * STOCKINSIGHT V2.0 Market Session & IST Resolver (Phase 2B)
 * 
 * Strict Invariants:
 * 1. Timezone Authority: Strictly Indian Standard Time (IST / Asia/Kolkata, UTC+05:30).
 * 2. Trading Session ID: Canonical YYYY-MM-DD representation in IST.
 * 3. Schedule Precedence Hierarchy:
 *    1. Active SPECIAL_SESSION (e.g., Diwali Muhurat Trading)
 *    2. HOLIDAY (Authoritative NSE Holiday Calendar)
 *    3. WEEKEND (Saturday & Sunday)
 *    4. Normal Intraday Schedule (NSE Normal Trading Day):
 *       - 09:00:00 to 09:14:59 IST: PRE_OPEN
 *       - 09:15:00 to 15:30:00 IST: OPEN
 *       - 15:30:01 to 16:00:00 IST: POST_CLOSE
 *       - 16:00:01 to 23:59:59 IST: CLOSED_OVERNIGHT (anchored to today's completed session)
 *       - 00:00:00 to 08:59:59 IST: CLOSED_OVERNIGHT (anchored to previous completed trading session)
 * 4. Deterministic and pure: Accepts explicit Date parameter for 100% testability.
 */

import { MarketSessionState } from '../types/context';
import { getNseHolidayInfo, getNseSpecialSession } from '../data/nseHolidays';

export interface SessionResolution {
  tradingSessionId: string;
  marketSessionState: MarketSessionState;
  evaluatedAtIST: string;
  specialSessionName?: string;
  holidayName?: string;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30 in milliseconds

/**
 * Returns UTC components shifted by +5:30 to extract exact IST calendar values.
 */
function getISTComponents(date: Date) {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: istDate.getUTCFullYear(),
    month: istDate.getUTCMonth() + 1, // 1-12
    day: istDate.getUTCDate(),        // 1-31
    dayOfWeek: istDate.getUTCDay(),   // 0 = Sun, 6 = Sat
    hours: istDate.getUTCHours(),     // 0-23
    minutes: istDate.getUTCMinutes(), // 0-59
    seconds: istDate.getUTCSeconds(), // 0-59
  };
}

/**
 * Formats year, month, day into canonical YYYY-MM-DD string.
 */
function formatSessionId(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Converts HH:mm time string into seconds from midnight.
 */
function timeStringToSeconds(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60;
}

/**
 * Computes the IST date string of the prior completed trading day.
 * Iterates backwards, skipping weekends and NSE trading holidays.
 */
function getPreviousTradingDaySessionId(date: Date): string {
  const istTime = date.getTime() + IST_OFFSET_MS;
  let cursor = new Date(istTime - 24 * 60 * 60 * 1000);

  // Iterate backwards up to 14 days to find the last valid trading day
  for (let i = 0; i < 14; i++) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const day = cursor.getUTCDate();
    const dayOfWeek = cursor.getUTCDay();
    const dateStr = formatSessionId(year, month, day);

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const holidayInfo = getNseHolidayInfo(dateStr);
    const isHoliday = Boolean(holidayInfo?.isTradingHoliday && !holidayInfo.specialSession);

    if (!isWeekend && !isHoliday) {
      return dateStr;
    }

    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }

  // Fallback if loop finishes (e.g. out-of-range historical date)
  const comp = getISTComponents(date);
  return formatSessionId(comp.year, comp.month, comp.day);
}

export class SessionResolver {
  /**
   * Resolves the canonical trading session identity and market state for a given timestamp.
   * 
   * @param date Date instance to evaluate (defaults to current time)
   * @returns SessionResolution containing tradingSessionId, marketSessionState, evaluatedAtIST
   */
  public static resolve(date: Date = new Date()): SessionResolution {
    const comp = getISTComponents(date);
    const todaySessionId = formatSessionId(comp.year, comp.month, comp.day);
    const evaluatedAtIST = `${todaySessionId}T${String(comp.hours).padStart(2, '0')}:${String(comp.minutes).padStart(2, '0')}:${String(comp.seconds).padStart(2, '0')}+05:30`;
    const timeInSeconds = comp.hours * 3600 + comp.minutes * 60 + comp.seconds;

    // 1. Check for Active Special Session (e.g., Diwali Muhurat Trading)
    const specialSession = getNseSpecialSession(todaySessionId);
    if (specialSession) {
      const specPreOpen = timeStringToSeconds(specialSession.preOpenStart);
      const specOpen = timeStringToSeconds(specialSession.marketOpen);
      const specClose = timeStringToSeconds(specialSession.marketClose);

      if (timeInSeconds >= specOpen && timeInSeconds <= specClose) {
        return {
          tradingSessionId: todaySessionId,
          marketSessionState: 'SPECIAL_SESSION',
          evaluatedAtIST,
          specialSessionName: specialSession.name,
        };
      }
      if (timeInSeconds >= specPreOpen && timeInSeconds < specOpen) {
        return {
          tradingSessionId: todaySessionId,
          marketSessionState: 'PRE_OPEN',
          evaluatedAtIST,
          specialSessionName: specialSession.name,
        };
      }
    }

    // 2. Check for Official NSE Holiday
    const holidayInfo = getNseHolidayInfo(todaySessionId);
    if (holidayInfo?.isTradingHoliday) {
      return {
        tradingSessionId: getPreviousTradingDaySessionId(date),
        marketSessionState: 'HOLIDAY',
        evaluatedAtIST,
        holidayName: holidayInfo.name,
      };
    }

    // 3. Weekend Check (Saturday / Sunday)
    if (comp.dayOfWeek === 0 || comp.dayOfWeek === 6) {
      return {
        tradingSessionId: getPreviousTradingDaySessionId(date),
        marketSessionState: 'WEEKEND',
        evaluatedAtIST,
      };
    }

    // 4. Normal Intraday Schedule (NSE Normal Trading Day)
    const preOpenStart = 9 * 3600;              // 09:00:00
    const marketOpen = 9 * 3600 + 15 * 60;      // 09:15:00
    const marketClose = 15 * 3600 + 30 * 60;    // 15:30:00
    const postCloseEnd = 16 * 3600;             // 16:00:00

    if (timeInSeconds < preOpenStart) {
      // Early morning before 09:00 IST -> belongs to previous completed session
      return {
        tradingSessionId: getPreviousTradingDaySessionId(date),
        marketSessionState: 'CLOSED_OVERNIGHT',
        evaluatedAtIST,
      };
    } else if (timeInSeconds < marketOpen) {
      // 09:00:00 - 09:14:59 IST
      return {
        tradingSessionId: todaySessionId,
        marketSessionState: 'PRE_OPEN',
        evaluatedAtIST,
      };
    } else if (timeInSeconds <= marketClose) {
      // 09:15:00 - 15:30:00 IST
      return {
        tradingSessionId: todaySessionId,
        marketSessionState: 'OPEN',
        evaluatedAtIST,
      };
    } else if (timeInSeconds <= postCloseEnd) {
      // 15:30:01 - 16:00:00 IST
      return {
        tradingSessionId: todaySessionId,
        marketSessionState: 'POST_CLOSE',
        evaluatedAtIST,
      };
    } else {
      // 16:00:01 - 23:59:59 IST (Today's session completed)
      return {
        tradingSessionId: todaySessionId,
        marketSessionState: 'CLOSED_OVERNIGHT',
        evaluatedAtIST,
      };
    }
  }

  /**
   * Helper to format a canonical session ID YYYY-MM-DD from an IST Date.
   */
  public static getTradingSessionId(date: Date = new Date()): string {
    return this.resolve(date).tradingSessionId;
  }
}
