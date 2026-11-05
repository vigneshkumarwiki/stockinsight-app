import React, { useMemo } from 'react';
import { HoldingWithEvaluation } from '../../types/portfolio';
import { QualityTiltEngine, QualityTiltGroupKey } from '../../engine/qualityTiltEngine';
import { ShieldAlert, TrendingUp, Layers, Compass, AlertTriangle } from 'lucide-react';

interface PortfolioQualityTiltProps {
  items: HoldingWithEvaluation[];
  activeTiltFilter?: QualityTiltGroupKey | null;
  onSelectTiltFilter?: (key: QualityTiltGroupKey | null) => void;
  activeClusterFilter?: string | null;
  onSelectClusterFilter?: (clusterKey: string | null) => void;
}

export const PortfolioQualityTilt: React.FC<PortfolioQualityTiltProps> = ({
  items,
  activeTiltFilter = null,
  onSelectTiltFilter,
  activeClusterFilter = null,
  onSelectClusterFilter,
}) => {
  const tiltResult = useMemo(() => QualityTiltEngine.evaluate(items), [items]);

  const formatINR = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const { resolvedCapital, tiltBuckets, driverExposures, unresolvedCapitalCount } = tiltResult;

  if (!items || items.length === 0 || resolvedCapital === 0) {
    return null;
  }

  const p1P2 = tiltBuckets.P1_P2;
  const p3 = tiltBuckets.P3;
  const p4 = tiltBuckets.P4;
  const p5 = tiltBuckets.P5;

  const handleCardClick = (key: QualityTiltGroupKey) => {
    if (!onSelectTiltFilter) return;
    if (activeTiltFilter === key) {
      onSelectTiltFilter(null);
    } else {
      onSelectTiltFilter(key);
    }
  };

  return (
    <div className="rounded-xl border border-[#1e293b] bg-[#111827]/90 p-4 shadow-sm space-y-3 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e293b]/70 pb-2">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
            Portfolio Quality Tilt &amp; Capital Exposure
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
          <span>Resolved Capital: <strong className="text-white">{formatINR(resolvedCapital)}</strong></span>
          {unresolvedCapitalCount > 0 && (
            <span className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
              {unresolvedCapitalCount} unquoted excluded
            </span>
          )}
        </div>
      </div>

      {/* Multi-segment allocation progress bar */}
      <div className="h-2.5 w-full rounded-full bg-slate-800/80 flex overflow-hidden border border-slate-700/50">
        {p1P2.capitalWeightPct > 0 && (
          <div
            className="bg-emerald-500 hover:bg-emerald-400 transition-all duration-300"
            style={{ width: `${p1P2.capitalWeightPct}%` }}
            title={`Favorable Zone: ${p1P2.capitalWeightPct}% (${formatINR(p1P2.currentValue)})`}
          />
        )}
        {p3.capitalWeightPct > 0 && (
          <div
            className="bg-indigo-500 hover:bg-indigo-400 transition-all duration-300"
            style={{ width: `${p3.capitalWeightPct}%` }}
            title={`Hold / Consolidating: ${p3.capitalWeightPct}% (${formatINR(p3.currentValue)})`}
          />
        )}
        {p4.capitalWeightPct > 0 && (
          <div
            className="bg-amber-500 hover:bg-amber-400 transition-all duration-300"
            style={{ width: `${p4.capitalWeightPct}%` }}
            title={`ETFs & Index: ${p4.capitalWeightPct}% (${formatINR(p4.currentValue)})`}
          />
        )}
        {p5.capitalWeightPct > 0 && (
          <div
            className="bg-rose-500 hover:bg-rose-400 transition-all duration-300"
            style={{ width: `${p5.capitalWeightPct}%` }}
            title={`Caution / At Risk: ${p5.capitalWeightPct}% (${formatINR(p5.currentValue)})`}
          />
        )}
      </div>

      {/* Tilt Breakdown Legend Cards (Click-to-Filter) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs">
        {/* Favorable Zone */}
        <div
          onClick={() => handleCardClick('P1_P2')}
          className={`rounded-lg border p-2.5 transition-all select-none cursor-pointer ${
            activeTiltFilter === 'P1_P2'
              ? 'border-emerald-400 bg-emerald-500/20 ring-2 ring-emerald-500/50 shadow-md scale-[1.02]'
              : 'border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/50 hover:bg-emerald-500/10'
          }`}
          title={`Favorable Zone — ${p1P2.holdingCount} holdings\nSymbols: ${p1P2.symbols.length > 0 ? p1P2.symbols.join(', ') : 'None'}\nClick to ${activeTiltFilter === 'P1_P2' ? 'clear filter' : 'filter holdings table'}`}
        >
          <div className="flex items-center justify-between text-emerald-400 text-[11px] font-semibold">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Favorable Zone
            </span>
            <span>{p1P2.capitalWeightPct.toFixed(1)}%</span>
          </div>
          <div className="mt-1 text-sm font-bold text-white">
            {formatINR(p1P2.currentValue)}
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
            <span>{p1P2.holdingCount} holding{p1P2.holdingCount !== 1 ? 's' : ''}</span>
            {activeTiltFilter === 'P1_P2' ? (
              <span className="text-emerald-300 font-bold bg-emerald-500/30 px-1 py-0.2 rounded text-[9px]">Active ✕</span>
            ) : (
              <span className="text-slate-500 text-[9px] hover:text-slate-300">Filter</span>
            )}
          </div>
        </div>

        {/* Hold / Consolidating */}
        <div
          onClick={() => handleCardClick('P3')}
          className={`rounded-lg border p-2.5 transition-all select-none cursor-pointer ${
            activeTiltFilter === 'P3'
              ? 'border-indigo-400 bg-indigo-500/20 ring-2 ring-indigo-500/50 shadow-md scale-[1.02]'
              : 'border-indigo-500/20 bg-indigo-500/5 hover:border-indigo-500/50 hover:bg-indigo-500/10'
          }`}
          title={`Hold / Consolidating — ${p3.holdingCount} holdings\nSymbols: ${p3.symbols.length > 0 ? p3.symbols.join(', ') : 'None'}\nClick to ${activeTiltFilter === 'P3' ? 'clear filter' : 'filter holdings table'}`}
        >
          <div className="flex items-center justify-between text-indigo-400 text-[11px] font-semibold">
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              Hold / Neutral
            </span>
            <span>{p3.capitalWeightPct.toFixed(1)}%</span>
          </div>
          <div className="mt-1 text-sm font-bold text-white">
            {formatINR(p3.currentValue)}
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
            <span>{p3.holdingCount} holding{p3.holdingCount !== 1 ? 's' : ''}</span>
            {activeTiltFilter === 'P3' ? (
              <span className="text-indigo-300 font-bold bg-indigo-500/30 px-1 py-0.2 rounded text-[9px]">Active ✕</span>
            ) : (
              <span className="text-slate-500 text-[9px] hover:text-slate-300">Filter</span>
            )}
          </div>
        </div>

        {/* ETFs & Index */}
        <div
          onClick={() => handleCardClick('P4')}
          className={`rounded-lg border p-2.5 transition-all select-none cursor-pointer ${
            activeTiltFilter === 'P4'
              ? 'border-amber-400 bg-amber-500/20 ring-2 ring-amber-500/50 shadow-md scale-[1.02]'
              : 'border-amber-500/20 bg-amber-500/5 hover:border-amber-500/50 hover:bg-amber-500/10'
          }`}
          title={`ETFs & Index — ${p4.holdingCount} holdings\nSymbols: ${p4.symbols.length > 0 ? p4.symbols.join(', ') : 'None'}\nClick to ${activeTiltFilter === 'P4' ? 'clear filter' : 'filter holdings table'}`}
        >
          <div className="flex items-center justify-between text-amber-400 text-[11px] font-semibold">
            <span className="flex items-center gap-1">
              <Compass className="h-3 w-3" />
              ETFs &amp; Index
            </span>
            <span>{p4.capitalWeightPct.toFixed(1)}%</span>
          </div>
          <div className="mt-1 text-sm font-bold text-white">
            {formatINR(p4.currentValue)}
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
            <span>{p4.holdingCount} holding{p4.holdingCount !== 1 ? 's' : ''}</span>
            {activeTiltFilter === 'P4' ? (
              <span className="text-amber-300 font-bold bg-amber-500/30 px-1 py-0.2 rounded text-[9px]">Active ✕</span>
            ) : (
              <span className="text-slate-500 text-[9px] hover:text-slate-300">Filter</span>
            )}
          </div>
        </div>

        {/* Caution / At Risk */}
        <div
          onClick={() => handleCardClick('P5')}
          className={`rounded-lg border p-2.5 transition-all select-none cursor-pointer ${
            activeTiltFilter === 'P5'
              ? 'border-rose-400 bg-rose-500/20 ring-2 ring-rose-500/50 shadow-md scale-[1.02]'
              : 'border-rose-500/20 bg-rose-500/5 hover:border-rose-500/50 hover:bg-rose-500/10'
          }`}
          title={`Caution / At Risk — ${p5.holdingCount} holdings\nSymbols: ${p5.symbols.length > 0 ? p5.symbols.join(', ') : 'None'}\nClick to ${activeTiltFilter === 'P5' ? 'clear filter' : 'filter holdings table'}`}
        >
          <div className="flex items-center justify-between text-rose-400 text-[11px] font-semibold">
            <span className="flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" />
              Caution / At Risk
            </span>
            <span>{p5.capitalWeightPct.toFixed(1)}%</span>
          </div>
          <div className="mt-1 text-sm font-bold text-white">
            {formatINR(p5.currentValue)}
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
            <span>{p5.holdingCount} holding{p5.holdingCount !== 1 ? 's' : ''}</span>
            {activeTiltFilter === 'P5' ? (
              <span className="text-rose-300 font-bold bg-rose-500/30 px-1 py-0.2 rounded text-[9px]">Active ✕</span>
            ) : (
              <span className="text-slate-500 text-[9px] hover:text-slate-300">Filter</span>
            )}
          </div>
        </div>
      </div>

      {/* Clustered Attention Drivers */}
      {driverExposures && driverExposures.length > 0 && (
        <div className="pt-2 border-t border-[#1e293b]/60 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400 font-mono flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            Attention Clusters:
          </span>
          {driverExposures.map((exp) => {
            const isClusterActive = activeClusterFilter === exp.driver;
            return (
              <button
                key={exp.driver}
                type="button"
                onClick={() => onSelectClusterFilter?.(isClusterActive ? null : exp.driver)}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold border transition-all cursor-pointer ${
                  isClusterActive
                    ? 'ring-2 ring-white/60 bg-white/20 text-white shadow-sm'
                    : exp.severity === 'CRITICAL'
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25'
                    : exp.severity === 'HIGH_ATTENTION'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                    : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/25'
                }`}
                title={`Symbols: ${exp.symbols.join(', ')}\nClick to ${isClusterActive ? 'clear filter' : 'filter holdings table'}`}
              >
                <span>{exp.label}</span>
                <span className="opacity-75">({exp.holdingCount} &bull; {formatINR(exp.capitalAmount)})</span>
                {isClusterActive && <span className="ml-0.5 text-[9px] bg-white/30 rounded px-1">✕</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
