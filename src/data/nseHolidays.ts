/**
 * STOCKINSIGHT V2.0 Authoritative NSE Trading Holidays & Special Sessions
 * Covers calendar years 2025 and 2026 according to official NSE holiday circulars.
 * 
 * Strict Invariants:
 * 1. Static, version-controlled repository data (zero external scrapers or dynamic fetchers).
 * 2. Precedence hierarchy: SPECIAL_SESSION -> HOLIDAY -> WEEKEND -> Normal Intraday Schedule.
 * 3. Non-authoritative defensive fallback for dates outside 2025-2026 with logged boundary warning.
 */

export interface NseSpecialSession {
  date: string; // 'YYYY-MM-DD'
  name: string;
  preOpenStart: string; // 'HH:mm'
  marketOpen: string;   // 'HH:mm'
  marketClose: string;  // 'HH:mm'
}

export interface NseHolidayInfo {
  date: string; // 'YYYY-MM-DD'
  name: string;
  isTradingHoliday: boolean;
  specialSession?: NseSpecialSession;
}

/**
 * Official NSE Trading Holidays for Calendar Year 2025
 */
export const NSE_HOLIDAYS_2025: Record<string, string> = {
  '2025-02-26': 'Mahashivratri',
  '2025-03-14': 'Holi',
  '2025-03-31': 'Id-Ul-Fitr',
  '2025-04-10': 'Mahavir Jayanti',
  '2025-04-14': 'Dr. Baba Saheb Ambedkar Jayanti',
  '2025-04-18': 'Good Friday',
  '2025-05-01': 'Maharashtra Day',
  '2025-08-15': 'Independence Day',
  '2025-08-27': 'Ganesh Chaturthi',
  '2025-10-02': 'Mahatma Gandhi Jayanti / Dussehra',
  '2025-10-21': 'Diwali Laxmi Pujan (Regular Trading Closed)',
  '2025-10-22': 'Diwali Balipratipada',
  '2025-11-05': 'Prakash Gurpurb Sri Guru Nanak Dev',
  '2025-12-25': 'Christmas',
};

/**
 * Official NSE Trading Holidays for Calendar Year 2026
 */
export const NSE_HOLIDAYS_2026: Record<string, string> = {
  '2026-01-26': 'Republic Day',
  '2026-02-17': 'Mahashivratri',
  '2026-03-03': 'Holi',
  '2026-03-20': 'Id-Ul-Fitr',
  '2026-03-30': 'Ram Navami',
  '2026-04-03': 'Good Friday',
  '2026-04-14': 'Dr. Baba Saheb Ambedkar Jayanti',
  '2026-05-01': 'Maharashtra Day',
  '2026-05-27': 'Bakri Id',
  '2026-08-15': 'Independence Day',
  '2026-08-26': 'Milad-un-Nabi',
  '2026-10-02': 'Mahatma Gandhi Jayanti',
  '2026-10-20': 'Dussehra',
  '2026-11-08': 'Diwali Laxmi Pujan (Regular Trading Closed)',
  '2026-11-10': 'Diwali Balipratipada',
  '2026-11-24': 'Guru Nanak Jayanti',
  '2026-12-25': 'Christmas',
};

/**
 * Pre-announced NSE Special Trading Sessions (e.g., Diwali Muhurat Trading)
 */
export const NSE_SPECIAL_SESSIONS: Record<string, NseSpecialSession> = {
  '2025-10-21': {
    date: '2025-10-21',
    name: 'Diwali Muhurat Trading 2025',
    preOpenStart: '18:00',
    marketOpen: '18:15',
    marketClose: '19:15',
  },
  '2026-11-08': {
    date: '2026-11-08',
    name: 'Diwali Muhurat Trading 2026',
    preOpenStart: '18:00',
    marketOpen: '18:15',
    marketClose: '19:15',
  },
};

/**
 * Calendar coverage boundary dates
 */
export const AUTHORITATIVE_CALENDAR_START = '2025-01-01';
export const AUTHORITATIVE_CALENDAR_END = '2026-12-31';

let boundaryWarningLogged = false;

/**
 * Returns holiday information for a given IST date ('YYYY-MM-DD').
 */
export function getNseHolidayInfo(dateStr: string): NseHolidayInfo | null {
  const is2025 = dateStr.startsWith('2025');
  const is2026 = dateStr.startsWith('2026');

  if (!is2025 && !is2026) {
    if (!boundaryWarningLogged && (dateStr < AUTHORITATIVE_CALENDAR_START || dateStr > AUTHORITATIVE_CALENDAR_END)) {
      console.warn(
        `[NseCalendar] Date ${dateStr} is outside authoritative calendar (${AUTHORITATIVE_CALENDAR_START} to ${AUTHORITATIVE_CALENDAR_END}). Applying defensive weekday fallback.`
      );
      boundaryWarningLogged = true;
    }
    return null;
  }

  const holidayName = is2025 ? NSE_HOLIDAYS_2025[dateStr] : NSE_HOLIDAYS_2026[dateStr];
  const specialSession = NSE_SPECIAL_SESSIONS[dateStr];

  if (!holidayName && !specialSession) {
    return null;
  }

  return {
    date: dateStr,
    name: holidayName || specialSession?.name || 'NSE Holiday',
    isTradingHoliday: Boolean(holidayName),
    specialSession,
  };
}

/**
 * Determines if a given date string ('YYYY-MM-DD') is an official NSE trading holiday.
 */
export function isNseTradingHoliday(dateStr: string): boolean {
  const info = getNseHolidayInfo(dateStr);
  return Boolean(info?.isTradingHoliday);
}

/**
 * Returns special session details if a special session is scheduled for the date.
 */
export function getNseSpecialSession(dateStr: string): NseSpecialSession | null {
  return NSE_SPECIAL_SESSIONS[dateStr] || null;
}
