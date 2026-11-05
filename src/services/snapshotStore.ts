/**
 * STOCKINSIGHT V2.0 Session Snapshot Persistence Store (Phase 2A)
 * 
 * Strict Invariants:
 * 1. Target Database: StockInsightDB_v4
 * 2. Canonical Object Store: analytical_snapshots
 * 3. Primary Key: snapshotId (${isin}_${tradingSessionId})
 * 4. Indexes:
 *    - by_isin: isin
 *    - by_session: tradingSessionId
 *    - by_isin_session: [isin, tradingSessionId]
 * 5. Deterministic Previous Snapshot Selection:
 *    - isin === requested ISIN
 *    - tradingSessionId < currentTradingSessionId
 *    - schemaVersion === 1
 *    - modelVersion === "2.0.0"
 *    - isQuarantined === false
 *    - sorted DESC by tradingSessionId -> records[0] or null
 * 6. Resilient Fallback: In Node.js / SSR / Private browsing without IndexedDB,
 *    gracefully operates with an in-memory ledger with zero crashes.
 */

import { AnalyticalSnapshot } from '../types/context';
import {
  CURRENT_MODEL_VERSION,
  CURRENT_SCHEMA_VERSION,
  SnapshotSerializer,
} from '../engine/snapshotSerializer';

const DB_NAME = 'StockInsightDB_v4';
const DB_VERSION = 5;
const STORE_NAME = 'analytical_snapshots';
const INSTRUMENTS_STORE_NAME = 'instruments';

export class SnapshotStore {
  // In-memory fallback map for Node.js test environment or IndexedDB failures
  private static memoryStore: Map<string, AnalyticalSnapshot> = new Map();

  /**
   * Opens the IndexedDB database, creating required object stores and indexes on upgrade.
   */
  private static async openDB(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return null;
    }

    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;

          // 1. Maintain existing instruments store
          if (!db.objectStoreNames.contains(INSTRUMENTS_STORE_NAME)) {
            db.createObjectStore(INSTRUMENTS_STORE_NAME, { keyPath: 'symbol' });
          }

          // 2. Create canonical analytical_snapshots store
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'snapshotId' });
            store.createIndex('by_isin', 'isin', { unique: false });
            store.createIndex('by_session', 'tradingSessionId', { unique: false });
            store.createIndex('by_isin_session', ['isin', 'tradingSessionId'], { unique: true });
          }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Persists a canonical AnalyticalSnapshot with deterministic upsert behavior.
   * 
   * @param snapshot Authoritative AnalyticalSnapshot instance
   * @returns boolean indicating success
   */
  public static async saveSnapshot(snapshot: AnalyticalSnapshot): Promise<boolean> {
    if (!SnapshotSerializer.validate(snapshot)) {
      console.error('[SnapshotStore] Invalid snapshot payload rejected:', snapshot);
      return false;
    }

    // Always keep in-memory store synchronized
    this.memoryStore.set(snapshot.snapshotId, { ...snapshot });

    const db = await this.openDB();
    if (!db) {
      return true; // Succeeded in in-memory fallback
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(snapshot);

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Retrieves a snapshot by its primary key (${isin}_${tradingSessionId}).
   */
  public static async getSnapshot(snapshotId: string): Promise<AnalyticalSnapshot | null> {
    const db = await this.openDB();
    if (!db) {
      return this.memoryStore.get(snapshotId) || null;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(snapshotId);

        req.onsuccess = () => {
          const res = req.result;
          resolve(res || this.memoryStore.get(snapshotId) || null);
        };
        req.onerror = () => resolve(this.memoryStore.get(snapshotId) || null);
      } catch {
        resolve(this.memoryStore.get(snapshotId) || null);
      }
    });
  }

  /**
   * Retrieves all snapshots stored for a given ISIN.
   */
  public static async getAllSnapshotsForIsin(isin: string): Promise<AnalyticalSnapshot[]> {
    const db = await this.openDB();
    if (!db) {
      return Array.from(this.memoryStore.values()).filter((s) => s.isin === isin);
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('by_isin');
        const req = index.getAll(isin);

        req.onsuccess = () => {
          const results = req.result || [];
          // Merge with memory store in case of hybrid fallback
          const memoryItems = Array.from(this.memoryStore.values()).filter((s) => s.isin === isin);
          const map = new Map<string, AnalyticalSnapshot>();
          results.forEach((s: AnalyticalSnapshot) => map.set(s.snapshotId, s));
          memoryItems.forEach((s: AnalyticalSnapshot) => map.set(s.snapshotId, s));
          resolve(Array.from(map.values()));
        };
        req.onerror = () => {
          resolve(Array.from(this.memoryStore.values()).filter((s) => s.isin === isin));
        };
      } catch {
        resolve(Array.from(this.memoryStore.values()).filter((s) => s.isin === isin));
      }
    });
  }

  /**
   * Deterministic Previous Snapshot Selection Algorithm (Phase 1G / Phase 2A):
   * 1. Query analytical_snapshots for current ISIN.
   * 2. Filter: tradingSessionId < currentTradingSessionId.
   * 3. Filter: schemaVersion === CURRENT_SCHEMA_VERSION (1).
   * 4. Filter: modelVersion === CURRENT_MODEL_VERSION ("2.0.0").
   * 5. Filter: isQuarantined === false.
   * 6. Sort descending by tradingSessionId.
   * 7. Return records[0] (latest valid completed session) or null (Day-0).
   * 
   * @param isin Authoritative instrument identifier
   * @param currentTradingSessionId Active trading session ID (YYYY-MM-DD)
   * @returns Previous valid AnalyticalSnapshot or null for Day-0 Cold Start
   */
  public static async getPreviousSnapshot(
    isin: string,
    currentTradingSessionId: string
  ): Promise<AnalyticalSnapshot | null> {
    const allRecords = await this.getAllSnapshotsForIsin(isin);

    const validPriorSessions = allRecords
      .filter((s) => s.isin === isin)
      .filter((s) => s.tradingSessionId < currentTradingSessionId)
      .filter((s) => s.schemaVersion === CURRENT_SCHEMA_VERSION)
      .filter((s) => s.modelVersion === CURRENT_MODEL_VERSION)
      .filter((s) => s.isQuarantined === false)
      .sort((a, b) => b.tradingSessionId.localeCompare(a.tradingSessionId));

    if (validPriorSessions.length > 0) {
      return validPriorSessions[0];
    }

    return null;
  }

  /**
   * Resets persistent and in-memory stores (used primarily in test suites).
   */
  public static async clearAll(): Promise<void> {
    this.memoryStore.clear();

    const db = await this.openDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
