/**
 * STOCKINSIGHT V2.1 Multi-Session Context Trajectory Engine (F-01)
 * 
 * Strict Invariants:
 * 1. Read-Only against historical IndexedDB analytical snapshots.
 * 2. Never recalculates historical scores, relationships, or attention states.
 * 3. Never interpolates missing sessions.
 * 4. Filters out incompatible model versions (!== "2.0.0"), schema versions (!== 1), and quarantined records.
 * 5. Strictly chronological (Oldest -> Newest, Left -> Right).
 * 6. Maximum history retrieval = 20 sessions; default visible UI slice = latest 5 sessions.
 * 7. Day-0 state: isDayZero = true when fewer than 2 valid historical sessions exist.
 */

import {
  AnalyticalSnapshot,
  RelationshipArchetype,
  RelationshipPriority,
  AttentionLevel,
  AttentionDriverType,
} from '../types/context';
import { SnapshotStore } from '../services/snapshotStore';
import { SnapshotSerializer, CURRENT_MODEL_VERSION, CURRENT_SCHEMA_VERSION } from './snapshotSerializer';
import { getAllRelationshipMatrixEntries } from './contextRelationships';

export interface TrajectoryPoint {
  tradingSessionId: string; // 'YYYY-MM-DD'
  evaluatedAt: string;      // ISO-8601 string
  coreScore: number | null;
  relationshipArchetype: RelationshipArchetype;
  relationshipPriority: RelationshipPriority;
  attentionLevel: AttentionLevel;
  primaryAttentionDriver: AttentionDriverType;
  isCurrentSession: boolean;
}

export interface TrajectoryResult {
  isin: string;
  symbol: string;
  points: TrajectoryPoint[];
  totalSessionsAvailable: number;
  isDayZero: boolean;
}

// Pre-indexed archetype-to-priority lookup for O(1) pure resolution
const ARCHETYPE_TO_PRIORITY: Record<RelationshipArchetype, RelationshipPriority> = (() => {
  const map: Partial<Record<RelationshipArchetype, RelationshipPriority>> = {};
  const entries = getAllRelationshipMatrixEntries();
  for (const entry of entries) {
    map[entry.archetype] = entry.priority;
  }
  return map as Record<RelationshipArchetype, RelationshipPriority>;
})();

export class TrajectoryEngine {
  /**
   * Pure deterministic transformer converting raw AnalyticalSnapshots into a canonical TrajectoryResult.
   * 
   * @param rawSnapshots Array of persisted AnalyticalSnapshot records
   * @param targetIsin Target ISIN to isolate
   * @param currentTradingSessionId Current active trading session date (YYYY-MM-DD)
   * @param maxSessions Maximum chronological sessions to retain (default 20)
   */
  public static buildTrajectoryFromSnapshots(
    rawSnapshots: AnalyticalSnapshot[],
    targetIsin: string,
    currentTradingSessionId?: string,
    maxSessions: number = 20
  ): TrajectoryResult {
    if (!rawSnapshots || !Array.isArray(rawSnapshots) || rawSnapshots.length === 0) {
      return {
        isin: targetIsin,
        symbol: '',
        points: [],
        totalSessionsAvailable: 0,
        isDayZero: true,
      };
    }

    // 1. Filter strictly for target ISIN, compatible versions, and non-quarantined validity
    const validSnapshots = rawSnapshots.filter((s) => {
      if (!s || typeof s !== 'object') return false;
      if (s.isin !== targetIsin) return false;
      if (s.modelVersion !== CURRENT_MODEL_VERSION) return false;
      if (s.schemaVersion !== CURRENT_SCHEMA_VERSION) return false;
      if (s.isQuarantined) return false;
      return SnapshotSerializer.validate(s);
    });

    if (validSnapshots.length === 0) {
      return {
        isin: targetIsin,
        symbol: '',
        points: [],
        totalSessionsAvailable: 0,
        isDayZero: true,
      };
    }

    // 2. Sort chronologically by tradingSessionId ascending (Oldest -> Newest)
    const sorted = [...validSnapshots].sort((a, b) =>
      a.tradingSessionId.localeCompare(b.tradingSessionId)
    );

    // 3. Slice up to maxSessions (latest 20)
    const sliced = sorted.slice(-maxSessions);
    const symbol = sliced[sliced.length - 1]?.symbol || '';

    // 4. Map to immutable TrajectoryPoint contract
    const points: TrajectoryPoint[] = sliced.map((s, idx) => {
      const isLastIndex = idx === sliced.length - 1;
      const isCurrent = currentTradingSessionId
        ? s.tradingSessionId === currentTradingSessionId
        : isLastIndex;

      const priority =
        ARCHETYPE_TO_PRIORITY[s.relationshipArchetype] ||
        (s.relationshipArchetype === 'DATA_INCOMPLETE' ? 'P5' : 'P3');

      return {
        tradingSessionId: s.tradingSessionId,
        evaluatedAt: s.evaluatedAt,
        coreScore: s.coreScore !== undefined ? s.coreScore : null,
        relationshipArchetype: s.relationshipArchetype,
        relationshipPriority: priority,
        attentionLevel: s.attentionLevel,
        primaryAttentionDriver: s.primaryAttentionDriver || 'NONE',
        isCurrentSession: isCurrent,
      };
    });

    const isDayZero = points.length < 2;

    return {
      isin: targetIsin,
      symbol,
      points,
      totalSessionsAvailable: points.length,
      isDayZero,
    };
  }

  /**
   * Retrieves all historical snapshots from IndexedDB and constructs the canonical TrajectoryResult.
   * 
   * @param isin Target ISIN string
   * @param currentTradingSessionId Optional current session ID to mark active node
   * @param maxSessions Maximum query window (default 20)
   */
  public static async getTrajectory(
    isin: string,
    currentTradingSessionId?: string,
    maxSessions: number = 20
  ): Promise<TrajectoryResult> {
    const rawSnapshots = await SnapshotStore.getAllSnapshotsForIsin(isin);
    return this.buildTrajectoryFromSnapshots(
      rawSnapshots,
      isin,
      currentTradingSessionId,
      maxSessions
    );
  }
}
