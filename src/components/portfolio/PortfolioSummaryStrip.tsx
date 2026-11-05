import React, { useMemo, useState } from 'react';
import { PortfolioRiskAnalytics, HoldingWithEvaluation } from '../../types/portfolio';
import { TrendingUp, TrendingDown, ShieldAlert, Award, PieChart, AlertTriangle, ShieldCheck, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { PortfolioQualityTilt } from './PortfolioQualityTilt';
import { PortfolioConcentration } from './PortfolioConcentration';
import { StopProximityEngine } from '../../engine/stopProximityEngine';
import { QualityTiltGroupKey } from '../../engine/qualityTiltEngine';

interface PortfolioSummaryStripProps {
  analytics: PortfolioRiskAnalytics;
  holdingsCount: number;
  resolvedCount?: number;
  items?: HoldingWithEvaluation[];
  activeTiltFilter?: QualityTiltGroupKey | null;
  onSelectTiltFilter?: (key: QualityTiltGroupKey | null) => void;
  activeClusterFilter?: string | null;
  onSelectClusterFilter?: (clusterKey: string | null) => void;
}

export const PortfolioSummaryStrip: React.FC<PortfolioSummaryStripProps> = ({
  analytics,
  holdingsCount,
  resolvedCount,
  items,
  activeTiltFilter,
  onSelectTiltFilter,
  activeClusterFilter,
  onSelectClusterFilter,
}) => {
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const isPnlPositive = analytics.totalPnl >= 0;
  const isPartial = resolvedCount !== undefined && resolvedCount < holdingsCount;

  // Buffer zone evaluation
  const bufferMetrics = useMemo(() => {
    if (!items || items.length === 0) return null;
    return StopProximityEngine.evaluatePortfolioBuffer(items);
  }, [items]);

  // Format INR currency
  const formatINR = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(val);
  };

  const hasNoHoldings = holdingsCount === 0;
  const hasNoResolvedData = holdingsCount > 0 && resolvedCount === 0;

  // Determine weighted score zone badge
  const getScoreZone = (score: number) => {
    if (hasNoHoldings) {
      return { label: 'NO ASSETS', color: 'text-slate-400 border-slate-700/50 bg-slate-800/40' };
    }
    if (hasNoResolvedData) {
      return { label: 'NO DATA', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
    }
    if (score >= 60) return { label: 'FAVORABLE ZONE', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };
    if (score >= 40) return { label: 'HOLD / NEUTRAL', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
    return { label: 'CAUTION ZONE', color: 'text-rose-400 border-rose-500/30 bg-rose-500/10' };
  };

  const zoneInfo = getScoreZone(analytics.capitalWeightedScore);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Portfolio Capital */}
        <div className="rounded-xl border border-[#1e293b] bg-[#111827]/80 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Portfolio Value</span>
            <PieChart className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-white">
            {hasNoHoldings ? '₹0.00' : hasNoResolvedData ? '—' : formatINR(analytics.totalCurrentValue)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="text-slate-400">
              {isPartial ? `Invested (${resolvedCount}/${holdingsCount}):` : 'Invested:'}
            </span>
            <span className="text-slate-300 font-semibold">
              {hasNoHoldings
                ? '₹0.00'
                : formatINR(isPartial ? (analytics.resolvedInvested ?? analytics.totalInvested) : analytics.totalInvested)}
            </span>
            {isPartial ? (
              <span
                className="rounded bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-amber-300 border border-amber-500/40 cursor-help"
                title={`${holdingsCount - (resolvedCount ?? 0)} asset(s) are currently unquoted/unavailable and excluded from total valuation.`}
              >
                {holdingsCount - (resolvedCount ?? 0)} unquoted holdings ({formatINR(analytics.unquotedInvested ?? 0)} cost) pending live quote
              </span>
            ) : (
              <span className="text-[10px] text-slate-500">({holdingsCount} assets)</span>
            )}
          </div>
        </div>

        {/* 2. Overall Unrealized P&L */}
        <div className="rounded-xl border border-[#1e293b] bg-[#111827]/80 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Unrealized P&L</span>
            {hasNoHoldings || hasNoResolvedData ? (
              <TrendingUp className="h-4 w-4 text-slate-500" />
            ) : isPnlPositive ? (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-rose-400" />
            )}
          </div>
          <div
            className={`mt-2 text-2xl font-bold font-mono tracking-tight ${
              hasNoHoldings || hasNoResolvedData
                ? 'text-slate-400'
                : isPnlPositive
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}
          >
            {hasNoHoldings || hasNoResolvedData ? '—' : `${isPnlPositive ? '+' : ''}${formatINR(analytics.totalPnl)}`}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-mono">
            {hasNoHoldings || hasNoResolvedData ? (
              <span className="text-slate-500 text-[10px]">No live valuation available</span>
            ) : (
              <>
                <span
                  className={`font-semibold ${
                    isPnlPositive ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isPnlPositive ? '+' : ''}
                  {analytics.totalPnlPercentage.toFixed(2)}%
                </span>
                <span className="text-[10px] text-slate-500">
                  {isPartial ? 'net gain/loss (quoted)' : 'overall net gain/loss'}
                </span>
                {analytics.totalDayPnl !== undefined && analytics.totalDayPnl !== 0 && (
                  <span
                    className={`font-mono text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                      analytics.totalDayPnl >= 0
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}
                  >
                    Today: {analytics.totalDayPnl >= 0 ? '+' : ''}{formatINR(analytics.totalDayPnl)}
                    {analytics.totalDayPnlPct !== undefined &&
                      ` (${analytics.totalDayPnl >= 0 ? '+' : ''}${analytics.totalDayPnlPct.toFixed(2)}%)`}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* 3. Capital-Weighted Quality Score */}
        <div className="rounded-xl border border-[#1e293b] bg-[#111827]/80 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Capital-Weighted Score</span>
            <Award className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-white">
              {hasNoHoldings || hasNoResolvedData ? '—' : analytics.capitalWeightedScore.toFixed(1)}
            </span>
            <span className="text-xs text-slate-500 font-mono">/ 100</span>
            <span className={`ml-auto text-[10px] px-2 py-0.5 rounded border font-semibold tracking-wider uppercase ${zoneInfo.color}`}>
              {zoneInfo.label}
            </span>
          </div>
          {/* Progress track */}
          <div className="mt-3 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                hasNoHoldings || hasNoResolvedData
                  ? 'bg-slate-700'
                  : analytics.capitalWeightedScore >= 60
                  ? 'bg-emerald-500'
                  : analytics.capitalWeightedScore >= 40
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
              style={{
                width: hasNoHoldings || hasNoResolvedData ? '0%' : `${Math.min(100, Math.max(0, analytics.capitalWeightedScore))}%`,
              }}
            />
          </div>
        </div>

        {/* 4. Execution Risk Flags Radar */}
        <div className="rounded-xl border border-[#1e293b] bg-[#111827]/80 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Execution Guards</span>
            <ShieldAlert className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {analytics.stopBreachCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 text-[11px] font-semibold text-rose-300 font-mono">
                <AlertTriangle className="h-3 w-3 text-rose-400" />
                {analytics.stopBreachCount} Stop Breached
              </span>
            ) : bufferMetrics && bufferMetrics.bufferHoldingsCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-300 font-mono" title={`Capital in Buffer Zone: ${formatINR(bufferMetrics.capitalInBufferZone)} (${bufferMetrics.capitalInBufferZonePct}%)`}>
                <AlertTriangle className="h-3 w-3 text-amber-400" />
                {bufferMetrics.bufferHoldingsCount} In Buffer Zone
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 font-mono">
                <ShieldCheck className="h-3 w-3 text-emerald-400" />
                Stops Intact
              </span>
            )}

            {bufferMetrics && bufferMetrics.bufferHoldingsCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-300 font-mono" title="Total Capital in Buffer Zone">
                Buffer Cap: {bufferMetrics.capitalInBufferZonePct}%
              </span>
            )}

            {analytics.accrualTrapCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-300 font-mono">
                {analytics.accrualTrapCount} Accrual Trap
              </span>
            )}

            {analytics.hasHighSectorConcentration && (
              <span className="inline-flex items-center gap-1 rounded bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 text-[11px] font-semibold text-indigo-300 font-mono">
                Sector &gt; 25%
              </span>
            )}
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Distribution: <span className="text-emerald-400 font-mono">{analytics.favorableCount} Fav</span> &bull;{' '}
            <span className="text-amber-400 font-mono">{analytics.holdCount} Hold</span> &bull;{' '}
            <span className="text-rose-400 font-mono">{analytics.cautionCount} Caut</span>
          </div>
        </div>
      </div>

      {/* F-02 Portfolio Diagnostics: Collapsible Quality Tilt & Sector Concentration Matrix */}
      {items && items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setIsDiagnosticsOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-lg border border-[#1e293b] bg-[#111827]/90 hover:bg-[#182234] hover:border-indigo-500/50 px-3 py-1.5 text-xs font-mono text-slate-300 transition-all shadow-sm group"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
              <span className="font-semibold">
                {isDiagnosticsOpen ? 'Hide' : 'Show'} Portfolio Diagnostics
              </span>
              <span className="text-[10px] text-slate-500 font-sans hidden sm:inline">
                (Quality Tilt &amp; Sector Concentration)
              </span>
              {isDiagnosticsOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              )}
            </button>

            {!isDiagnosticsOpen && analytics.hasHighSectorConcentration && (
              <span className="text-[10px] font-mono font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                ⚠️ Sector Exposure &gt; 25% Active
              </span>
            )}
          </div>

          {isDiagnosticsOpen && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 animate-in fade-in duration-200">
              {/* Quality Tilt & Exposure Bar */}
              <PortfolioQualityTilt
                items={items}
                activeTiltFilter={activeTiltFilter}
                onSelectTiltFilter={onSelectTiltFilter}
                activeClusterFilter={activeClusterFilter}
                onSelectClusterFilter={onSelectClusterFilter}
              />

              {/* Capital Concentration & Sector Exposure Matrix */}
              <PortfolioConcentration items={items} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
