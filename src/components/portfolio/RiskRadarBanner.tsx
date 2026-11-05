import React from 'react';
import { PortfolioRiskAnalytics, HoldingWithEvaluation } from '../../types/portfolio';
import { PortfolioFilterType } from './PortfolioFilterBar';
import { AlertOctagon, TrendingDown, Layers, ShieldAlert, ArrowRight, AlertTriangle } from 'lucide-react';

interface RiskRadarBannerProps {
  analytics: PortfolioRiskAnalytics;
  items: HoldingWithEvaluation[];
  onSelectStock: (symbol: string) => void;
  onFilterChange?: (filter: PortfolioFilterType) => void;
}

export const RiskRadarBanner: React.FC<RiskRadarBannerProps> = ({
  analytics,
  items,
  onSelectStock,
  onFilterChange,
}) => {
  const breachedHoldings = items.filter((i) => i.stopBreached);
  const bufferHoldings = items.filter((i) => {
    if (i.stopBreached || i.currentLtp === null || i.stopLoss === null || i.currentLtp <= 0) return false;
    const bufPct = ((i.currentLtp - i.stopLoss) / i.currentLtp) * 100;
    return bufPct < 3.0 && bufPct >= 0;
  });
  const accrualTrapHoldings = items.filter((i) => i.accrualTrapGain);
  const concentratedSectors = analytics.sectorConcentrations.filter((s) => s.isConcentrated);

  const hasAnyAlert =
    breachedHoldings.length > 0 || bufferHoldings.length > 0 || accrualTrapHoldings.length > 0 || concentratedSectors.length > 0;

  // When 0 active alerts, return null and collapse completely to preserve vertical space
  if (!hasAnyAlert) return null;

  const totalAlertsCount =
    breachedHoldings.length + bufferHoldings.length + accrualTrapHoldings.length + (concentratedSectors.length > 0 ? 1 : 0);

  return (
    <div className="rounded-xl border border-[#1e293b] bg-[#0d1321] p-3.5 shadow-sm space-y-3">
      {/* Triage Header & Quick Jump Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#1e293b]/60 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-400">
            <ShieldAlert className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-white font-mono">
            Portfolio Risk Radar
          </span>
          <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 font-mono border border-rose-500/40">
            {totalAlertsCount} Active {totalAlertsCount === 1 ? 'Alert' : 'Alerts'}
          </span>
        </div>

        {onFilterChange && (
          <button
            type="button"
            onClick={() => onFilterChange('ATTENTION')}
            className="flex items-center gap-1 text-[11px] font-mono text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
          >
            <span>Filter table to flagged assets</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Horizontal Triage Pill Strip */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 1. Stop-Loss Breached Positions */}
        {breachedHoldings.map((h) => (
          <button
            key={h.holding.id}
            type="button"
            onClick={() => onSelectStock(h.holding.symbol)}
            className="group flex items-center gap-2 rounded-lg border border-rose-500/50 bg-rose-950/40 px-2.5 py-1.5 text-xs font-mono font-semibold text-rose-200 hover:bg-rose-900/60 hover:border-rose-400 transition-all shadow-sm"
            title={`LTP: ₹${h.currentLtp?.toFixed(2) ?? '--'} is below Stop: ₹${h.stopLoss?.toFixed(2) ?? '--'}`}
          >
            <div className="flex items-center gap-1.5">
              <AlertOctagon className="h-3.5 w-3.5 text-rose-400 shrink-0 group-hover:scale-110 transition-transform" />
              <span className="font-bold text-white group-hover:text-rose-100">{h.holding.symbol}</span>
            </div>
            <span className="rounded bg-rose-500/20 px-1 py-0.2 text-[9px] font-bold text-rose-300 border border-rose-500/30">
              STOP BREACHED
            </span>
            <span className="text-[10px] text-rose-300/80">
              ₹{h.currentLtp?.toFixed(1) ?? '--'} &lt; ₹{h.stopLoss?.toFixed(1) ?? '--'}
            </span>
          </button>
        ))}

        {/* 2. Near Stop Loss Buffer (< 3%) */}
        {bufferHoldings.map((h) => {
          const bufPct = h.currentLtp && h.stopLoss ? ((h.currentLtp - h.stopLoss) / h.currentLtp) * 100 : null;
          return (
            <button
              key={`buf_${h.holding.id}`}
              type="button"
              onClick={() => onSelectStock(h.holding.symbol)}
              className="group flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-950/40 px-2.5 py-1.5 text-xs font-mono font-semibold text-amber-200 hover:bg-amber-900/60 hover:border-amber-400 transition-all shadow-sm"
              title={`LTP: ₹${h.currentLtp?.toFixed(2) ?? '--'} is within ${bufPct?.toFixed(1) ?? '--'}% of Stop Loss: ₹${h.stopLoss?.toFixed(2) ?? '--'}`}
            >
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="font-bold text-white group-hover:text-amber-100">{h.holding.symbol}</span>
              </div>
              <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[9px] font-bold text-amber-300 border border-amber-500/30">
                NEAR STOP
              </span>
              <span className="text-[10px] text-amber-300/90 font-mono">
                {bufPct?.toFixed(1)}% buf
              </span>
            </button>
          );
        })}

        {/* 3. Accrual Trap / Optical Gainers */}
        {accrualTrapHoldings.map((h) => (
          <button
            key={h.holding.id}
            type="button"
            onClick={() => onSelectStock(h.holding.symbol)}
            className="group flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-950/40 px-2.5 py-1.5 text-xs font-mono font-semibold text-amber-200 hover:bg-amber-900/60 hover:border-amber-400 transition-all shadow-sm"
            title={`Gain: +${h.pnlPercentage?.toFixed(1)}% supported by weak fundamental score (${h.fundamentalScore}/50)`}
          >
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
              <span className="font-bold text-white group-hover:text-amber-100">{h.holding.symbol}</span>
            </div>
            <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[9px] font-bold text-amber-300 border border-amber-500/30">
              ACCRUAL RISK
            </span>
            <span className="text-[10px] text-emerald-400">
              +{h.pnlPercentage !== null ? h.pnlPercentage.toFixed(1) : '0.0'}%
            </span>
            <span className="text-[10px] text-amber-400 font-normal">
              F: {h.fundamentalScore}/50
            </span>
          </button>
        ))}

        {/* 4. Concentrated Sectors */}
        {concentratedSectors.map((s) => (
          <div
            key={s.sectorName}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-950/40 px-2.5 py-1.5 text-xs font-mono text-indigo-200 shadow-sm"
            title={`${s.sectorName} represents ${s.percentageOfPortfolio}% of your total portfolio (threshold: 25%)`}
          >
            <Layers className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-300">
              Sector: <strong className="text-indigo-200">{s.sectorName}</strong> ({s.percentageOfPortfolio}%)
            </span>
            <span className="rounded bg-indigo-500/20 px-1 py-0.2 text-[9px] font-bold text-indigo-300 border border-indigo-500/30">
              &gt;25% CEILING
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
