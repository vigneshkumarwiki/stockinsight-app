/**
 * STOCKINSIGHT Instant Search Service
 * Provides client-side zero-lag search across the complete supported NSE and BSE equity universe
 * with IndexedDB caching, authoritative fallback, multi-attribute indexing, and deterministic ranking.
 */

import { NSE_INSTRUMENTS_MASTER } from '../data/nseInstruments';
import { AUTHORITATIVE_INSTRUMENTS_FIXTURE } from '../data/authoritativeInstrumentsFixture';
import { StockSearchResult } from '../types/portfolio';

const DB_NAME = 'StockInsightDB_v5';
const DB_VERSION = 5;
const STORE_NAME = 'instruments';
const TTL_KEY = 'stockinsight_instruments_v5_ttl';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const KNOWN_SYMBOL_ALIASES: Record<string, string> = {
  'AMARAJABAT': 'ARE&M',
  'AREM': 'ARE&M',
  'MOTHERSUMI': 'MOTHERSON',
  'LTI': 'LTIM',
  'MINDTREE': 'LTIM',
  'CADILAHC': 'ZYDUSLIFE',
};

// Explicit primary mapping overrides for known demergers / multi-record ISINs
const AUTHORITATIVE_ISIN_PRIMARY: Record<string, string> = {
  'INE1TAE01010': 'TMCV',
  'INE155A01022': 'TMPV',
  'INE048G01026': 'NAVINFLUOR',
  'INE048T01014': 'KPITTECH',
  'INE235A01022': 'FINCABLES',
  'INF204KB17I5': 'GOLDBEES',
  'INF204KC1402': 'SILVERBEES',
  'INF204KB18I3': 'SILVERBEES',
  'INE379A01028': 'ITCHOTELS',
  'INF204KB15V2': 'ITBEES',
  'INE002R01017': 'ITCHOTELS', // Legacy placeholder redirect
  'INF204KB1888': 'ITBEES',    // Legacy placeholder redirect
};

export class SearchService {
  private static memoryCache: StockSearchResult[] | null = null;
  private static dynamicDiscoveredMap: Map<string, StockSearchResult> = new Map();
  private static initPromise: Promise<StockSearchResult[]> | null = null;
  private static masterSourceLoaded: string = 'INITIALIZING';
  private static masterRecordCount: number = 0;
  private static indexStatus: 'READY' | 'DEGRADED' | 'ERROR' = 'READY';

  /**
   * Initializes or fetches cached instruments from IndexedDB / memory / authoritative master
   */
  public static async init(): Promise<StockSearchResult[]> {
    if (this.memoryCache && this.memoryCache.length > 0) {
      return this.memoryCache;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        const cached = await this.getFromIndexedDB();
        const lastCachedTime = typeof localStorage !== 'undefined' ? localStorage.getItem(TTL_KEY) : null;
        const isFresh = lastCachedTime && Date.now() - parseInt(lastCachedTime, 10) < TWENTY_FOUR_HOURS_MS;

        if (cached && Array.isArray(cached) && cached.length > 500 && isFresh) {
          this.memoryCache = cached;
          this.masterSourceLoaded = 'INDEXED_DB_CACHE';
          this.masterRecordCount = cached.length;
          this.indexStatus = 'READY';
          return cached;
        }

        // Try downloading authoritative complete universe from /instruments.json
        const downloaded = await this.fetchCompleteUniverse();
        if (downloaded && downloaded.length > 0) {
          const merged = this.mergeWithCuratedAndDiscovered(downloaded);
          this.memoryCache = merged;
          this.masterSourceLoaded = 'UPSTOX_OFFICIAL_BOD_MASTER';
          this.masterRecordCount = merged.length;
          this.indexStatus = 'READY';
          await this.saveToIndexedDB(merged);
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(TTL_KEY, Date.now().toString());
          }
          return merged;
        }

        // If download not available (e.g. offline/testing), fall back to fixtures + curated master
        const fallbackList = this.buildFallbackUniverse();
        const merged = this.mergeWithCuratedAndDiscovered(fallbackList);
        this.memoryCache = merged;
        this.masterSourceLoaded = 'CURATED_MASTER_AND_FIXTURES';
        this.masterRecordCount = merged.length;
        this.indexStatus = 'DEGRADED';
        await this.saveToIndexedDB(merged);
        return merged;
      } catch (err) {
        console.warn('[SearchService] Failed to load complete index, falling back to curated master:', err);
        const fallbackList = this.buildFallbackUniverse();
        const merged = this.mergeWithCuratedAndDiscovered(fallbackList);
        this.memoryCache = merged;
        this.masterSourceLoaded = 'FALLBACK_CURATED_MASTER';
        this.masterRecordCount = merged.length;
        this.indexStatus = 'DEGRADED';
        return merged;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Internal loader for /instruments.json (supports both browser fetch and Node.js test environment)
   */
  private static async fetchCompleteUniverse(): Promise<StockSearchResult[] | null> {
    try {
      let json: any = null;
      if (typeof window === 'undefined') {
        // Node.js test environment: read from ./public/instruments.json
        try {
          const g = globalThis as any;
          const proc = g.process;
          if (proc && typeof proc.cwd === 'function') {
            const fsMod = 'fs';
            const pathMod = 'path';
            const nodeFs: any = await import(/* @vite-ignore */ fsMod);
            const nodePath: any = await import(/* @vite-ignore */ pathMod);
            if (nodeFs?.existsSync && nodePath?.resolve) {
              const filePath = nodePath.resolve(proc.cwd(), 'public', 'instruments.json');
              if (nodeFs.existsSync(filePath)) {
                const raw = nodeFs.readFileSync(filePath, 'utf-8');
                json = JSON.parse(raw);
              }
            }
          }
        } catch {
          // Fall back to fetch or null
        }
      }

      if (!json && typeof fetch !== 'undefined') {
        const res = await fetch('/instruments.json');
        if (res.ok) {
          json = await res.json();
        }
      }

      if (!json || !Array.isArray(json.instruments)) return null;

      const results: StockSearchResult[] = [];
      for (const row of json.instruments) {
        // [symbol, name, instrumentKey, isin, exchange, instrumentType]
        if (!Array.isArray(row) || row.length < 5) continue;
        const [symbol, name, instrumentKey, isin, exchange, instrumentType] = row;
        results.push({
          symbol: String(symbol || '').trim(),
          name: String(name || symbol || '').trim(),
          instrumentKey: String(instrumentKey || '').trim(),
          isin: String(isin || '').trim(),
          sector: exchange === 'BSE' ? 'BSE Listed Equity' : 'NSE Listed Equity',
          lastPrice: 0,
          exchange: (exchange || 'NSE') as 'NSE' | 'BSE',
          segment: exchange === 'BSE' ? 'BSE_EQ' : 'NSE_EQ',
          instrumentType: String(instrumentType || 'EQ').trim(),
        });
      }
      return results;
    } catch {
      return null;
    }
  }

  /**
   * Builds offline universe from curated master + authoritative fixture
   */
  private static buildFallbackUniverse(): StockSearchResult[] {
    const list: StockSearchResult[] = [];
    const seen = new Set<string>();

    // 1. Authoritative Fixture (NSE & BSE records)
    for (const row of AUTHORITATIVE_INSTRUMENTS_FIXTURE) {
      if (!Array.isArray(row) || row.length < 5) continue;
      const [symbol, name, instrumentKey, isin, exchange, instrumentType] = row;
      const key = String(instrumentKey || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push({
        symbol: String(symbol || '').trim(),
        name: String(name || symbol || '').trim(),
        instrumentKey: key,
        isin: String(isin || '').trim(),
        sector: exchange === 'BSE' ? 'BSE Listed Equity' : 'NSE Listed Equity',
        lastPrice: 0,
        exchange: (exchange || 'NSE') as 'NSE' | 'BSE',
        segment: exchange === 'BSE' ? 'BSE_EQ' : 'NSE_EQ',
        instrumentType: String(instrumentType || 'EQ').trim(),
      });
    }

    return list;
  }

  /**
   * Merges authoritative universe with curated NSE_INSTRUMENTS_MASTER and dynamic map.
   * Curated records take precedence for live baseline prices and curated sectors.
   */
  private static mergeWithCuratedAndDiscovered(base: StockSearchResult[]): StockSearchResult[] {
    const map = new Map<string, StockSearchResult>();

    // Add base records keyed by canonical instrumentKey
    for (const item of base) {
      if (item.instrumentKey) {
        map.set(item.instrumentKey.toUpperCase(), item);
      }
    }

    // Curated items overwrite/enrich corresponding instruments with verified prices & sectors
    for (const curated of NSE_INSTRUMENTS_MASTER) {
      const key = (curated.instrumentKey || `NSE_EQ|${curated.isin}`).toUpperCase();
      const existing = map.get(key);
      map.set(key, {
        ...existing,
        ...curated,
        exchange: 'NSE',
        segment: 'NSE_EQ',
        instrumentType: curated.instrumentType || (existing ? existing.instrumentType : 'EQ'),
      });
    }

    // Dynamically registered instruments
    for (const [_, dyn] of this.dynamicDiscoveredMap.entries()) {
      const key = (dyn.instrumentKey || `NSE_EQ|${dyn.isin}`).toUpperCase();
      map.set(key, dyn);
    }

    return Array.from(map.values());
  }

  /**
   * Searches stocks by symbol, company name, ISIN, or sector with intelligent autocomplete ranking:
   * 0. Authoritative symbol alias matches (e.g. AMARAJABAT -> ARE&M)
   * 1. Exact symbol matches (prioritizing NSE when both exist)
   * 2. Symbol prefix matches
   * 3. Exact ISIN matches
   * 4. Company name word/prefix matches
   * 5. Symbol partial/substring matches
   * 6. Company name substring matches
   * 7. Sector matches
   */
  public static async search(
    query: string,
    limit: number = 15,
    exchangeFilter?: 'ALL' | 'NSE' | 'BSE'
  ): Promise<StockSearchResult[]> {
    const list = await this.init();
    const cleanRaw = query.trim();
    const cleanQuery = cleanRaw.toUpperCase();

    if (!cleanQuery) {
      const filtered = exchangeFilter && exchangeFilter !== 'ALL'
        ? list.filter((i) => i.exchange === exchangeFilter)
        : list;
      return filtered.slice(0, limit);
    }

    // Normalized alphanumeric query for resilient punctuation/spacing matching
    const normQuery = cleanQuery.replace(/[^A-Z0-9]/g, '');

    const aliasMatches: StockSearchResult[] = [];
    const exactSymbolNSE: StockSearchResult[] = [];
    const exactSymbolBSE: StockSearchResult[] = [];
    const symbolPrefixMatches: StockSearchResult[] = [];
    const isinMatches: StockSearchResult[] = [];
    const namePrefixMatches: StockSearchResult[] = [];
    const symbolSubstringMatches: StockSearchResult[] = [];
    const nameSubstringMatches: StockSearchResult[] = [];
    const sectorMatches: StockSearchResult[] = [];

    const seenKeys = new Set<string>();

    // 0. Alias check (e.g. AMARAJABAT -> ARE&M)
    if (KNOWN_SYMBOL_ALIASES[cleanQuery]) {
      const targetSym = KNOWN_SYMBOL_ALIASES[cleanQuery].toUpperCase();
      const aliasTarget = list.find((i) => i.symbol.toUpperCase() === targetSym);
      if (aliasTarget) {
        aliasMatches.push(aliasTarget);
        seenKeys.add(aliasTarget.instrumentKey.toUpperCase());
      }
    }

    for (const item of list) {
      if (exchangeFilter && exchangeFilter !== 'ALL' && item.exchange !== exchangeFilter) {
        continue;
      }

      const itemKey = item.instrumentKey.toUpperCase();
      if (seenKeys.has(itemKey)) continue;

      const sym = item.symbol.toUpperCase();
      const normSym = sym.replace(/[^A-Z0-9]/g, '');
      const name = item.name.toUpperCase();
      const normName = name.replace(/[^A-Z0-9]/g, '');
      const isin = (item.isin || '').toUpperCase();
      const sector = (item.sector || '').toUpperCase();

      // 1. Exact Symbol
      if (sym === cleanQuery || (normQuery && normSym === normQuery)) {
        if (item.exchange === 'NSE') {
          exactSymbolNSE.push(item);
        } else {
          exactSymbolBSE.push(item);
        }
        seenKeys.add(itemKey);
        continue;
      }

      // 2. Symbol Prefix
      if (sym.startsWith(cleanQuery) || (normQuery && normSym.startsWith(normQuery))) {
        symbolPrefixMatches.push(item);
        seenKeys.add(itemKey);
        continue;
      }

      // 3. Exact ISIN
      if (cleanQuery.length >= 8 && isin.startsWith(cleanQuery)) {
        isinMatches.push(item);
        seenKeys.add(itemKey);
        continue;
      }

      // 4. Company Name Word or Prefix
      if (
        name.startsWith(cleanQuery) ||
        name.includes(` ${cleanQuery}`) ||
        (normQuery.length >= 3 && normName.startsWith(normQuery))
      ) {
        namePrefixMatches.push(item);
        seenKeys.add(itemKey);
        continue;
      }

      // 5. Symbol Substring
      if (sym.includes(cleanQuery) || (normQuery && normSym.includes(normQuery))) {
        symbolSubstringMatches.push(item);
        seenKeys.add(itemKey);
        continue;
      }

      // 6. Company Name Substring
      if (name.includes(cleanQuery) || (normQuery.length >= 3 && normName.includes(normQuery))) {
        nameSubstringMatches.push(item);
        seenKeys.add(itemKey);
        continue;
      }

      // 7. Sector Substring
      if (cleanQuery.length >= 3 && sector.includes(cleanQuery)) {
        sectorMatches.push(item);
        seenKeys.add(itemKey);
        continue;
      }
    }

    // Sort matches: NSE takes precedence over BSE, then by string length
    const rankSorter = (a: StockSearchResult, b: StockSearchResult) => {
      const aEx = a.exchange === 'NSE' ? 0 : 1;
      const bEx = b.exchange === 'NSE' ? 0 : 1;
      if (aEx !== bEx) return aEx - bEx;
      return a.symbol.length - b.symbol.length;
    };

    const nameSorter = (a: StockSearchResult, b: StockSearchResult) => {
      const aEx = a.exchange === 'NSE' ? 0 : 1;
      const bEx = b.exchange === 'NSE' ? 0 : 1;
      if (aEx !== bEx) return aEx - bEx;
      return a.name.length - b.name.length;
    };

    symbolPrefixMatches.sort(rankSorter);
    namePrefixMatches.sort(nameSorter);

    const combined = [
      ...aliasMatches,
      ...exactSymbolNSE,
      ...exactSymbolBSE,
      ...symbolPrefixMatches,
      ...isinMatches,
      ...namePrefixMatches,
      ...symbolSubstringMatches,
      ...nameSubstringMatches,
      ...sectorMatches,
    ];

    // Deduplicate in ranking order
    const resultList: StockSearchResult[] = [];
    const addedKeys = new Set<string>();
    for (const item of combined) {
      const key = item.instrumentKey.toUpperCase();
      if (!addedKeys.has(key)) {
        addedKeys.add(key);
        resultList.push(item);
      }
    }

    return resultList.slice(0, limit);
  }

  /**
   * Registers or updates an instrument dynamically into memory and IndexedDB
   */
  public static async registerInstrument(inst: StockSearchResult): Promise<void> {
    const upper = inst.symbol.toUpperCase().trim();
    const item: StockSearchResult = {
      ...inst,
      symbol: upper,
      instrumentKey: inst.instrumentKey || `NSE_EQ|${inst.isin || upper}`,
      exchange: inst.exchange || 'NSE',
    };
    this.dynamicDiscoveredMap.set(upper, item);

    if (this.memoryCache) {
      const idx = this.memoryCache.findIndex(
        (i) => i.instrumentKey.toUpperCase() === item.instrumentKey.toUpperCase()
      );
      if (idx >= 0) {
        this.memoryCache[idx] = item;
      } else {
        this.memoryCache.push(item);
      }
    }

    await this.saveToIndexedDB([item]);
  }

  /**
   * Looks up a single instrument by its exact symbol with authoritative master-first resolution.
   * If both NSE and BSE exist, prefers NSE unless exchange is explicitly requested.
   */
  public static getInstrumentBySymbol(
    symbol: string,
    exchange?: 'NSE' | 'BSE'
  ): StockSearchResult | undefined {
    const upper = symbol.toUpperCase().trim();
    if (!upper) return undefined;

    // 0. Check known symbol alias mapping (e.g. AMARAJABAT -> ARE&M)
    if (KNOWN_SYMBOL_ALIASES[upper]) {
      const targetSym = KNOWN_SYMBOL_ALIASES[upper].toUpperCase();
      const aliasFound = this.getInstrumentBySymbol(targetSym, exchange);
      if (aliasFound) return aliasFound;
    }

    // 1. Authoritative curated catalog check (guarantees latest curated price & ISIN)
    const curatedMatches = NSE_INSTRUMENTS_MASTER.filter((item) => item.symbol.toUpperCase() === upper);
    if (curatedMatches.length > 0) {
      const nseMatch = curatedMatches.find((m) => !exchange || exchange === 'NSE');
      if (nseMatch) return nseMatch;
    }

    // 2. Discovered or dynamic map
    if (this.dynamicDiscoveredMap.has(upper)) {
      const dyn = this.dynamicDiscoveredMap.get(upper)!;
      if (!exchange || dyn.exchange === exchange) return dyn;
    }

    // 3. Memory cache check
    if (this.memoryCache) {
      const cacheMatches = this.memoryCache.filter((item) => item.symbol.toUpperCase() === upper);
      if (cacheMatches.length > 0) {
        if (exchange) {
          const exMatch = cacheMatches.find((m) => m.exchange === exchange);
          if (exMatch) return exMatch;
        }
        // Deterministic default: Prefer NSE if available
        const nseMatch = cacheMatches.find((m) => m.exchange === 'NSE');
        return nseMatch || cacheMatches[0];
      }
    }

    // 4. Fixture fallback
    for (const row of AUTHORITATIVE_INSTRUMENTS_FIXTURE) {
      if (Array.isArray(row) && row[0]?.toUpperCase() === upper) {
        if (!exchange || row[4] === exchange) {
          return {
            symbol: row[0],
            name: row[1],
            instrumentKey: row[2],
            isin: row[3],
            sector: row[4] === 'BSE' ? 'BSE Listed Equity' : 'NSE Listed Equity',
            lastPrice: 0,
            exchange: row[4] as 'NSE' | 'BSE',
            segment: row[4] === 'BSE' ? 'BSE_EQ' : 'NSE_EQ',
            instrumentType: row[5] || 'EQ',
          };
        }
      }
    }

    return undefined;
  }

  /**
   * Looks up a single instrument by its ISIN with deterministic collision resolution
   */
  public static getInstrumentByIsin(
    isin: string,
    exchange?: 'NSE' | 'BSE'
  ): StockSearchResult | undefined {
    const upper = isin.toUpperCase().trim();
    if (!upper) return undefined;

    // Explicit primary mapping overrides for known demergers / multi-record ISINs
    if (AUTHORITATIVE_ISIN_PRIMARY[upper]) {
      const targetSymbol = AUTHORITATIVE_ISIN_PRIMARY[upper];
      const masterFound = this.getInstrumentBySymbol(targetSymbol, exchange);
      if (masterFound) return masterFound;
    }

    // 1. Curated master check
    const masterMatches = NSE_INSTRUMENTS_MASTER.filter((item) => item.isin?.toUpperCase() === upper);
    if (masterMatches.length === 1) {
      return masterMatches[0];
    } else if (masterMatches.length > 1) {
      return masterMatches[0];
    }

    // 2. Memory cache check
    const list = this.memoryCache || [];
    const cacheMatches = list.filter((item) => item.isin?.toUpperCase() === upper);
    if (cacheMatches.length > 0) {
      if (exchange) {
        const exMatch = cacheMatches.find((m) => m.exchange === exchange);
        if (exMatch) return exMatch;
      }
      const nseMatch = cacheMatches.find((m) => m.exchange === 'NSE');
      return nseMatch || cacheMatches[0];
    }

    // 3. Fixture check
    for (const row of AUTHORITATIVE_INSTRUMENTS_FIXTURE) {
      if (Array.isArray(row) && row[3]?.toUpperCase() === upper) {
        if (!exchange || row[4] === exchange) {
          return {
            symbol: row[0],
            name: row[1],
            instrumentKey: row[2],
            isin: row[3],
            sector: row[4] === 'BSE' ? 'BSE Listed Equity' : 'NSE Listed Equity',
            lastPrice: 0,
            exchange: row[4] as 'NSE' | 'BSE',
            segment: row[4] === 'BSE' ? 'BSE_EQ' : 'NSE_EQ',
            instrumentType: row[5] || 'EQ',
          };
        }
      }
    }

    return undefined;
  }

  /**
   * Diagnostic inspection helpers
   */
  public static getDiagnosticInfo(): {
    source: string;
    totalCount: number;
    status: 'READY' | 'DEGRADED' | 'ERROR';
  } {
    return {
      source: this.masterSourceLoaded,
      totalCount: this.memoryCache?.length || this.masterRecordCount,
      status: this.indexStatus,
    };
  }

  /**
   * Resets in-memory cache for deterministic test runs
   */
  public static resetMemoryCache(): void {
    this.memoryCache = null;
    this.initPromise = null;
    this.dynamicDiscoveredMap.clear();
    this.masterSourceLoaded = 'INITIALIZING';
    this.masterRecordCount = 0;
    this.indexStatus = 'READY';
  }

  /**
   * Pre-seeds memory cache directly (used by unit tests & offline environments)
   */
  public static preseedCache(items: StockSearchResult[]): void {
    const merged = this.mergeWithCuratedAndDiscovered(items);
    this.memoryCache = merged;
    this.masterSourceLoaded = 'PRESEEDED_TEST_CACHE';
    this.masterRecordCount = merged.length;
    this.indexStatus = 'READY';
  }

  /**
   * IndexedDB retrieval helper
   */
  private static async getFromIndexedDB(): Promise<StockSearchResult[] | null> {
    if (typeof window === 'undefined' || !window.indexedDB) return null;

    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'instrumentKey' });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const allReq = store.getAll();
          allReq.onsuccess = () => resolve(allReq.result || null);
          allReq.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * IndexedDB store helper
   */
  private static async saveToIndexedDB(items: StockSearchResult[]): Promise<void> {
    if (typeof window === 'undefined' || !window.indexedDB) return;

    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'instrumentKey' });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          // Batch put items
          items.forEach((item) => {
            if (item.instrumentKey) store.put(item);
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
