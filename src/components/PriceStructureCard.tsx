import React from 'react';
import { PriceStructure, PriceStructureLevel, PriceStructureStopLoss } from '../types/engine';
import { Layers } from 'lucide-react';

interface PriceStructureCardProps {
  priceStructure: PriceStructure;
  ltp: number;
}

export const PriceStructureCard: React.FC<PriceStructureCardProps> = ({
  priceStructure,
  ltp,
}) => {
  const getClassificationBadge = (classification: string) => {
    switch (classification) {
      case 'STRUCTURAL':
      case 'STRUCTURAL_FRACTAL':
        return { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', label: 'Fractal Pivot' };
      case 'STRUCTURAL_ZONE':
        return { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400', label: 'Cluster Zone' };
      case 'MOVING_AVERAGE':
        return { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400', label: 'Moving Avg' };
      case 'STRUCTURAL_INVALIDATION':
      case 'STRUCTURAL_FLOOR':
        return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', label: 'Structural Floor' };
      case 'ANTI_COMPRESSION_FLOOR':
        return { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', label: 'Anti-Compression' };
      case 'STRUCTURAL_RESISTANCE':
        return { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-400', label: 'Resistance Pivot' };
      case 'VOLATILITY_EXPANSION':
        return { bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-400', label: 'Volatility R' };
      case 'VOLATILITY_ONLY':
        return { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-400', label: 'Blue Sky' };
      case 'SAFE_DEFAULT_FLOOR':
        return { bg: 'bg-slate-700/50', border: 'border-slate-600', text: 'text-slate-300', label: 'Safe Default' };
      case 'UNAVAILABLE':
        return { bg: 'bg-slate-800/80', border: 'border-slate-700', text: 'text-slate-400', label: 'Unavailable' };
      case 'MATHEMATICAL_FALLBACK':
      default:
        return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', label: 'Volatility Fallback' };
    }
  };

  const getUnavailableReason = (tier: string) => {
    switch (tier) {
      case 'E2':
        return 'E2 structural retracement unavailable — no secondary consolidation shelf detected.';
      case 'E3':
        return 'E3 major structural support unavailable — price currently in unconfirmed price discovery.';
      case 'S3':
        return 'S3 unavailable — no valid E3 structural shelf found in historical price action.';
      case 'T3':
        return 'T3 capped at upper volatility boundary model.';
      default:
        return 'Structural level unavailable in price history.';
    }
  };

  const renderLevelRow = (
    tier: string,
    label: string,
    level: PriceStructureLevel | PriceStructureStopLoss | { price: number | null; classification: string; type?: string; distancePct?: number; zoneMin?: number; zoneMax?: number } | null | undefined,
    colorScheme: 'amber' | 'rose' | 'emerald',
    isPositiveDiff: boolean = false
  ) => {
    if (!level || level.price === null || level.classification === 'UNAVAILABLE') {
      return (
        <div className="py-2.5 px-3 rounded-lg border border-dashed border-[#1e293b] bg-[#0b0f19] text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-slate-500">{tier}</span>
              <span className="text-slate-400 text-xs font-sans">{label}</span>
            </div>
            <span className="font-mono text-slate-500 text-[11px] italic font-semibold">UNAVAILABLE</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono italic">
            {getUnavailableReason(tier)}
          </p>
        </div>
      );
    }

    const badge = getClassificationBadge(level.classification);
    const diffVal = ltp > 0 ? ((level.price - ltp) / ltp) * 100 : 0;
    const diffFormatted = `${diffVal > 0 ? '+' : ''}${diffVal.toFixed(1)}%`;

    const colorClasses = {
      amber: {
        text: 'text-amber-400',
        diff: 'text-slate-400',
      },
      rose: {
        text: 'text-rose-400',
        diff: 'text-rose-400',
      },
      emerald: {
        text: 'text-emerald-400',
        diff: 'text-emerald-400',
      },
    }[colorScheme];

    return (
      <div className="py-2.5 px-3 rounded-lg border border-[#1e293b]/70 bg-[#0b0f19] hover:border-[#1e293b] text-xs font-mono transition-colors space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-2">
            <span className={`font-bold ${colorClasses.text}`}>{tier}</span>
            <span className="text-slate-300 font-sans text-xs">{label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.bg} ${badge.border} ${badge.text}`}>
              {badge.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {'zoneMin' in level && 'zoneMax' in level && level.zoneMin != null && level.zoneMax != null ? (
              <span className="text-slate-500 text-[10px]">
                [{(level.zoneMin as number).toFixed(1)} - {(level.zoneMax as number).toFixed(1)}]
              </span>
            ) : null}
            <span className="text-white font-bold text-sm">₹{level.price.toFixed(1)}</span>
            <span className={`text-[11px] font-semibold ${isPositiveDiff ? 'text-emerald-400' : colorClasses.diff}`}>
              {diffFormatted}
            </span>
          </div>
        </div>
        {level.type && level.type !== 'UNAVAILABLE' && (
          <div className="text-[10px] text-slate-500 font-sans truncate">
            {level.type}
          </div>
        )}
      </div>
    );
  };

  const s1Level = priceStructure.stops?.s1 ?? priceStructure.stopLoss;
  const s2Level = priceStructure.stops?.s2 ?? priceStructure.stopLoss;
  const s3Level = priceStructure.stops?.s3 ?? null;

  return (
    <div className="rounded-xl border border-[#1e293b] bg-[#111827] p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e293b]/70 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white font-mono tracking-tight">
              PRICE STRUCTURE &amp; KEY LEVELS
            </h4>
            <p className="text-[11px] text-slate-400">
              Deterministic Model D structural geometry — Support shelves, protective invalidation boundaries, and upside targets.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="text-[11px] font-mono text-slate-400 bg-[#0b0f19] border border-[#1e293b] px-2.5 py-1 rounded-lg"
            title="14-period Average True Range (Daily volatility measure)"
          >
            ATR(14): <strong className="text-white font-bold">{priceStructure.metadata.atr14 > 0 ? `₹${priceStructure.metadata.atr14.toFixed(1)}` : 'UNAVAILABLE'}</strong>
          </span>
        </div>
      </div>

      {/* 9-Level Complete Price Structure Grid (Desktop: 3 Columns, Mobile: Stacked) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Column 1: SUPPORT (E1 - E3) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <span className="text-xs font-bold font-mono text-amber-400 uppercase tracking-wider">
              SUPPORT
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Entry Zones</span>
          </div>
          <div className="space-y-2.5">
            {renderLevelRow('E1', 'Near Support', priceStructure.entries.e1, 'amber')}
            {renderLevelRow('E2', 'Intermediate Support', priceStructure.entries.e2, 'amber')}
            {renderLevelRow('E3', 'Deep Support', priceStructure.entries.e3, 'amber')}
          </div>
        </div>

        {/* Column 2: PROTECTIVE STOPS (S1 - S3) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <span className="text-xs font-bold font-mono text-rose-400 uppercase tracking-wider">
              PROTECTIVE STOPS
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Model Structural Floors</span>
          </div>
          <div className="space-y-2.5">
            {renderLevelRow('S1', 'Structural Stop (S1)', s1Level, 'rose')}
            {renderLevelRow('S2', 'Intermediate Stop (S2)', s2Level, 'rose')}
            {renderLevelRow('S3', 'Deep Stop (S3)', s3Level, 'rose')}
          </div>
        </div>

        {/* Column 3: UPSIDE LEVELS (T1 - T3) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <span className="text-xs font-bold font-mono text-emerald-400 uppercase tracking-wider">
              UPSIDE LEVELS
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Expansion Targets</span>
          </div>
          <div className="space-y-2.5">
            {renderLevelRow('T1', 'Near Level', priceStructure.targets.t1, 'emerald', true)}
            {renderLevelRow('T2', 'Intermediate Level', priceStructure.targets.t2, 'emerald', true)}
            {renderLevelRow('T3', 'Extended Level', priceStructure.targets.t3, 'emerald', true)}
          </div>
        </div>
      </div>

      {/* What This Means (Price Structure) */}
      <div className="mt-4 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3.5 py-2.5 text-xs text-slate-300">
        <span className="font-semibold text-indigo-300 font-mono text-[11px] uppercase tracking-wide">
          What This Means:{' '}
        </span>
        <span className="text-slate-300 leading-relaxed">
          The price structure identifies progressively deeper support levels from E1 to E3, corresponding protective invalidation boundaries from S1 to S3, and upside volatility expansion objectives from T1 to T3 derived from historical price action and ATR.
        </span>
      </div>
    </div>
  );
};
