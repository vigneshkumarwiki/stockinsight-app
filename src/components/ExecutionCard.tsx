import React from 'react';
import { ExecutionCorridor, ExecutionStatus } from '../types/engine';
import {
  CheckCircle,
  Clock,
  AlertOctagon,
  ArrowDownRight,
  Target,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

interface ExecutionCardProps {
  corridor: ExecutionCorridor;
  avgBuyPrice?: number | null;
  isOwned?: boolean;
}

export const ExecutionCard: React.FC<ExecutionCardProps> = ({ corridor, avgBuyPrice, isOwned = false }) => {
  const getStatusBadge = (status: ExecutionStatus) => {
    switch (status) {
      case 'READY_TO_BUY':
        return {
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/40',
          text: 'text-emerald-400',
          icon: CheckCircle,
          label: 'WITHIN RISK CORRIDOR',
          desc: 'Price is currently within the defined mathematical risk/reward corridor.',
        };
      case 'EXTENDED_WAIT_FOR_PULLBACK':
        return {
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/40',
          text: 'text-amber-400',
          icon: Clock,
          label: 'EXTENDED ABOVE ENTRY CORRIDOR',
          desc: `Price extended by ${corridor.distanceToMaxEntryPct.toFixed(1)}% above Max Entry limit`,
        };
      case 'REJECT_LOW_LIQUIDITY':
        return {
          bg: 'bg-rose-500/10',
          border: 'border-rose-500/40',
          text: 'text-rose-400',
          icon: AlertOctagon,
          label: 'LOW LIQUIDITY',
          desc: `20D Turnover (₹${corridor.twentyDayTurnoverCr.toFixed(2)} Cr) is below ₹5 Cr threshold`,
        };
      case 'REJECT_CIRCUIT_LOCKED':
        return {
          bg: 'bg-rose-500/10',
          border: 'border-rose-500/40',
          text: 'text-rose-400',
          icon: AlertOctagon,
          label: 'CIRCUIT LOCKED',
          desc: 'Stock trading within 0.5% of daily price circuit limit',
        };
      case 'REJECT_DATA_QUARANTINED':
        return {
          bg: 'bg-rose-500/10',
          border: 'border-rose-500/40',
          text: 'text-rose-400',
          icon: AlertOctagon,
          label: 'DATA QUARANTINED',
          desc: 'Accounting discrepancy detected. Model execution locked.',
        };
      case 'REJECT_SAFETY_GATE':
        return {
          bg: 'bg-rose-500/10',
          border: 'border-rose-500/40',
          text: 'text-rose-400',
          icon: AlertOctagon,
          label: 'SAFETY GATE BLOCKED',
          desc: 'Triggered safety gate or high promoter pledge encumbrance',
        };
      case 'DATA_UNAVAILABLE':
        return {
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/40',
          text: 'text-amber-400',
          icon: AlertOctagon,
          label: 'DATA UNAVAILABLE',
          desc: 'Market quote data is unavailable from Upstox. Execution corridor cannot be evaluated.',
        };
      default:
        return {
          bg: 'bg-slate-800',
          border: 'border-slate-700',
          text: 'text-slate-400',
          icon: AlertOctagon,
          label: status,
          desc: 'Execution blocked by risk rules',
        };
    }
  };

  const statusInfo = getStatusBadge(corridor.status);
  const StatusIcon = statusInfo.icon;

  const hasCorridorData =
    corridor.ltp !== null &&
    corridor.ltp > 0 &&
    corridor.stopLoss !== null &&
    corridor.stopLoss > 0 &&
    corridor.target !== null &&
    corridor.target > corridor.stopLoss;

  const totalRange = hasCorridorData ? corridor.target! - corridor.stopLoss! : 1;
  const ltpPosPct = hasCorridorData ? Math.min(100, Math.max(0, ((corridor.ltp! - corridor.stopLoss!) / totalRange) * 100)) : 50;
  const maxEntryPosPct =
    hasCorridorData && corridor.maxEntry && corridor.maxEntry > corridor.stopLoss! && corridor.maxEntry < corridor.target!
      ? ((corridor.maxEntry - corridor.stopLoss!) / totalRange) * 100
      : null;
  const stopBufferPct = hasCorridorData ? ((corridor.ltp! - corridor.stopLoss!) / corridor.ltp!) * 100 : 0;
  const targetUpsidePct = hasCorridorData ? ((corridor.target! - corridor.ltp!) / corridor.ltp!) * 100 : 0;
  const avgBuyPosPct =
    hasCorridorData && avgBuyPrice && avgBuyPrice > 0
      ? Math.min(100, Math.max(0, ((avgBuyPrice - corridor.stopLoss!) / totalRange) * 100))
      : null;

  return (
    <div className="rounded-xl border border-[#1e293b] bg-[#111827] p-6 shadow-sm space-y-5">
      {/* Top Header */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e293b]/70 pb-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
              {isOwned ? 'Add-On Trade Plan' : 'Action Plan'}
            </span>
            <h3 className="text-base font-bold text-white mt-0.5">
              {isOwned ? 'Add-On Execution Corridor' : 'Execution Corridor & Guardrails'}
            </h3>
          </div>

          {/* Action Status Badge */}
          <div className={`flex items-center gap-2 rounded-lg border px-3.5 py-1.5 ${statusInfo.bg} ${statusInfo.border}`}>
            <StatusIcon className={`h-4 w-4 ${statusInfo.text}`} />
            <span className={`text-xs font-bold tracking-wide ${statusInfo.text}`}>
              {statusInfo.label}
            </span>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-400">{statusInfo.desc}</p>

        {/* Primary Action Metric Grid */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
          {/* Execution Risk Boundary Stop Loss */}
          <div
            className="rounded-lg border border-[#1e293b] bg-[#0b0f19] p-3.5 cursor-help"
            title="Capital preservation exit level. If price closes below this, the structural hypothesis is invalidated."
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-400 mb-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              Execution Stop
            </div>
            <div className="text-base sm:text-lg font-bold text-white">
              {corridor.stopLoss !== null && corridor.stopLoss > 0 ? `₹${corridor.stopLoss.toFixed(1)}` : 'UNAVAILABLE'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {hasCorridorData ? `Buffer: ${stopBufferPct.toFixed(1)}% to stop` : 'Execution risk boundary'}
            </div>
          </div>

          {/* Max Entry Limit */}
          <div
            className="rounded-lg border border-[#1e293b] bg-[#0b0f19] p-3.5 cursor-help"
            title="The maximum price you can pay while maintaining the minimum 2.0:1 Reward-to-Risk ratio to target."
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 mb-1">
              <ArrowDownRight className="h-3.5 w-3.5" />
              Max Entry Limit
            </div>
            <div className="text-base sm:text-lg font-bold text-white">
              {corridor.maxEntry !== null && corridor.maxEntry > 0 ? `₹${corridor.maxEntry.toFixed(1)}` : 'UNAVAILABLE'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Pullback ceiling
            </div>
          </div>

          {/* Structural Target */}
          <div
            className="rounded-lg border border-[#1e293b] bg-[#0b0f19] p-3.5 cursor-help"
            title="Primary structural profit-taking objective based on overhead fractal pivots and volatility expansion."
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 mb-1">
              <Target className="h-3.5 w-3.5" />
              Target (3R)
            </div>
            <div className="text-base sm:text-lg font-bold text-white">
              {corridor.target !== null && corridor.target > 0 ? `₹${corridor.target.toFixed(1)}` : 'UNAVAILABLE'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {hasCorridorData ? `+${targetUpsidePct.toFixed(1)}% upside` : 'Profit target'}
            </div>
          </div>

          {/* Risk / Reward */}
          <div
            className="rounded-lg border border-[#1e293b] bg-[#0b0f19] p-3.5 cursor-help"
            title="Reward-to-Risk ratio: Potential gain to Target versus risk to Execution Stop."
          >
            <div className="text-[11px] font-semibold text-cyan-400 mb-1">
              Minimum R:R
            </div>
            <div className="text-base sm:text-lg font-bold text-white">
              {corridor.minimumRR.toFixed(1)} : 1
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {corridor.minimumRR >= 2 ? 'Favorable asymmetry' : 'Sub-optimal asymmetry'}
            </div>
          </div>
        </div>

        {/* Visual Price Corridor Ladder */}
        {hasCorridorData && (
          <div className="mt-4 rounded-lg border border-[#1e293b] bg-[#0b0f19] p-3.5 space-y-2 font-mono text-xs shadow-inner">
            <div className="flex flex-wrap items-center justify-between text-[11px] gap-2">
              <span className="text-slate-300 font-sans font-semibold">
                Corridor Price Track
              </span>
              <span className="text-slate-400">
                Stop Buffer: <strong className={stopBufferPct >= 3 ? 'text-emerald-400' : 'text-amber-400'}>+{stopBufferPct.toFixed(1)}%</strong>
                <span className="text-slate-600 mx-1.5">&bull;</span>
                Target Upside: <strong className="text-cyan-400">+{targetUpsidePct.toFixed(1)}%</strong>
              </span>
            </div>

            {/* Continuous Visual Track */}
            <div className="relative h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
              {/* Risk segment (stopLoss to LTP) */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-rose-500 to-amber-500"
                style={{ width: `${ltpPosPct}%` }}
              />
              {/* Reward segment (LTP to Target) */}
              <div
                className="absolute top-0 bottom-0 bg-gradient-to-r from-amber-500 to-emerald-500"
                style={{ left: `${ltpPosPct}%`, width: `${100 - ltpPosPct}%` }}
              />
              {/* Max Entry threshold marker */}
              {maxEntryPosPct !== null && (
                <div
                  className="absolute top-0 bottom-0 w-1 bg-amber-300 shadow-sm z-10"
                  style={{ left: `${maxEntryPosPct}%` }}
                  title={`Max Entry Limit: ₹${corridor.maxEntry!.toFixed(1)}`}
                />
              )}
              {/* Avg Buy Price threshold marker */}
              {avgBuyPosPct !== null && (
                <div
                  className="absolute top-0 bottom-0 w-1.5 border-l-2 border-r-2 border-cyan-400 bg-cyan-300 shadow-md z-20"
                  style={{ left: `${avgBuyPosPct}%` }}
                  title={`Your Average Buy Price: ₹${avgBuyPrice!.toFixed(1)}`}
                />
              )}
            </div>

            {/* Level Labels along the Track */}
            <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-400 pt-0.5 font-bold gap-1">
              <span className="text-rose-400">
                Stop: ₹{corridor.stopLoss!.toFixed(1)}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-white bg-[#1e293b] px-2 py-0.5 rounded shadow-sm border border-slate-700">
                  LTP: ₹{corridor.ltp!.toFixed(1)}
                </span>
                {avgBuyPrice && avgBuyPrice > 0 && (
                  <span className="text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.5 rounded shadow-sm" title="Your Average Cost Basis">
                    Avg: ₹{avgBuyPrice.toFixed(1)}
                  </span>
                )}
              </div>
              <span className="text-emerald-400">
                Target: ₹{corridor.target!.toFixed(1)}
              </span>
            </div>
          </div>
        )}

        {/* Guardrail Flags */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-mono">
          {corridor.antiStopCompressionApplied && (
            <span
              className="inline-flex items-center gap-1 rounded bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 text-indigo-300 cursor-help"
              title="Stop-loss placed at least 1.5× ATR below price to avoid premature shakeout during normal volatility."
            >
              <ShieldCheck className="h-3 w-3 text-indigo-400" />
              Volatility Buffer Enforced (≥ 1.5× ATR)
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 border ${
              corridor.highSlippageRisk
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            {corridor.highSlippageRisk && <AlertTriangle className="h-3 w-3 text-rose-400" />}
            Spread: {corridor.bidAskSpreadPct > 0 ? `${corridor.bidAskSpreadPct.toFixed(2)}% ${corridor.highSlippageRisk ? '(High Slippage)' : '(Tight)'}` : 'N/A'}
          </span>
          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 border bg-slate-800 border-slate-700 text-slate-400">
            20D Turnover: ₹{corridor.twentyDayTurnoverCr.toFixed(1)} Cr
          </span>
        </div>

        {/* What This Means (Execution & Risk) */}
        <div className="mt-4 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3.5 py-2.5 text-xs text-slate-300">
          <span className="font-semibold text-indigo-300 font-mono text-[11px] uppercase tracking-wide">
            Execution Guidance:{' '}
          </span>
          <span className="text-slate-300 leading-relaxed">
            {corridor.status === 'READY_TO_BUY'
              ? 'Price is within the optimal accumulation corridor. Asymmetry is favorable relative to the trailing stop.'
              : corridor.status === 'EXTENDED_WAIT_FOR_PULLBACK'
              ? `Current price is extended by ${corridor.distanceToMaxEntryPct.toFixed(1)}% above the safe entry ceiling. Wait for a pullback toward the entry corridor before adding.`
              : corridor.status === 'REJECT_CIRCUIT_LOCKED'
              ? 'Stock is trading near its daily circuit limit. Immediate market order execution is restricted.'
              : corridor.status === 'REJECT_LOW_LIQUIDITY'
              ? 'Average daily turnover is below the ₹5 Cr institutional liquidity guardrail.'
              : corridor.status === 'REJECT_DATA_QUARANTINED'
              ? 'Accounting discrepancies detected in underlying filings. Model execution is locked.'
              : 'Risk parameters indicate capital preservation mode.'}
          </span>
        </div>
      </div>
    </div>
  );
};
