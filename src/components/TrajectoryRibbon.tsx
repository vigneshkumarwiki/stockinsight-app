import React, { useEffect, useState } from 'react';
import { TrajectoryEngine, TrajectoryResult, TrajectoryPoint } from '../engine/trajectoryEngine';
import { History, Calendar, AlertCircle } from 'lucide-react';

interface TrajectoryRibbonProps {
  isin: string;
  symbol: string;
  currentSessionId?: string;
}

export const TrajectoryRibbon: React.FC<TrajectoryRibbonProps> = ({
  isin,
  symbol,
  currentSessionId,
}) => {
  const [trajectory, setTrajectory] = useState<TrajectoryResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    TrajectoryEngine.getTrajectory(isin, currentSessionId)
      .then((res) => {
        if (isMounted) {
          setTrajectory(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load context trajectory:', err);
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isin, currentSessionId]);

  if (isLoading) {
    return null;
  }

  if (!trajectory || trajectory.points.length < 2 || trajectory.isDayZero) {
    return null;
  }

  // Display the latest 5 nodes
  const displayPoints = trajectory.points.slice(-5);

  const getPriorityStyle = (p: string) => {
    switch (p) {
      case 'P1':
      case 'P2':
        return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300';
      case 'P3':
        return 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300';
      case 'P4':
        return 'bg-amber-500/15 border-amber-500/40 text-amber-300';
      case 'P5':
      default:
        return 'bg-rose-500/15 border-rose-500/40 text-rose-300';
    }
  };

  const getAttentionDot = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-rose-500 animate-pulse';
      case 'HIGH_ATTENTION':
        return 'bg-amber-400';
      case 'WATCH':
        return 'bg-indigo-400';
      case 'NORMAL':
      default:
        return 'bg-emerald-400';
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#1e293b] bg-[#0b0f19]/80 p-2 font-mono text-xs shadow-inner">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 pr-2 border-r border-[#1e293b]">
        <History className="h-3.5 w-3.5 text-indigo-400" />
        <span className="hidden sm:inline">
          {displayPoints.length === 5 ? '5-Session Trajectory:' : `${displayPoints.length}-Session Trajectory (Accumulating):`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {displayPoints.map((pt: TrajectoryPoint, index: number) => {
          const priorityStyle = getPriorityStyle(pt.relationshipPriority);
          const attentionDot = getAttentionDot(pt.attentionLevel);
          const shortDate = pt.tradingSessionId.length > 5 ? pt.tradingSessionId.slice(5) : pt.tradingSessionId;

          return (
            <React.Fragment key={pt.tradingSessionId + index}>
              {index > 0 && <span className="text-slate-600 font-sans text-xs">→</span>}
              <div
                className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] transition-all ${
                  pt.isCurrentSession
                    ? 'border-indigo-500/60 bg-indigo-500/10 shadow-sm ring-1 ring-indigo-500/30 font-bold'
                    : 'border-[#1e293b] bg-[#111827] text-slate-300'
                }`}
                title={`Session: ${pt.tradingSessionId} | Archetype: ${pt.relationshipArchetype} (${pt.relationshipPriority}) | Attention: ${pt.attentionLevel} | Driver: ${pt.primaryAttentionDriver}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${attentionDot}`} />
                <span className="text-slate-400 text-[10px]">{shortDate}</span>
                <span className={`rounded px-1 py-0 text-[9px] font-bold border ${priorityStyle}`}>
                  {pt.relationshipPriority}
                </span>
                {pt.coreScore !== null && (
                  <span className="font-mono text-slate-200">{pt.coreScore.toFixed(0)}</span>
                )}
                {pt.isCurrentSession && (
                  <span className="text-[9px] font-extrabold text-indigo-400 uppercase tracking-tighter ml-0.5">
                    Live
                  </span>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
