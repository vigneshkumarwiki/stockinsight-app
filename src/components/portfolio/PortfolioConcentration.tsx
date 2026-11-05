import React, { useMemo } from 'react';
import { HoldingWithEvaluation } from '../../types/portfolio';
import { ConcentrationEngine, SectorExposure, StockConcentration } from '../../engine/concentrationEngine';
import { PieChart, AlertTriangle, CheckCircle2, Building, Landmark } from 'lucide-react';

interface PortfolioConcentrationProps {
  items: HoldingWithEvaluation[];
}

export const PortfolioConcentration: React.FC<PortfolioConcentrationProps> = ({ items }) => {
  const result = useMemo(() => ConcentrationEngine.evaluate(items), [items]);

  const formatINR = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const { resolvedCapital, sectors, topStockConcentrations, hasSectorConcentration, hasStockConcentration, unresolvedCount } = result;

  if (!items || items.length === 0 || resolvedCapital === 0) {
    return null;
  }

  // Display top 4 sectors and top 4 stocks
  const displaySectors = sectors.slice(0, 4);
  const displayStocks = topStockConcentrations.slice(0, 4);

  return (
    <div className="rounded-xl border border-[#1e293b] bg-[#111827]/90 p-4 shadow-sm space-y-3 font-sans">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e293b]/70 pb-2">
        <div className="flex items-center gap-2">
          <PieChart className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
            Capital Concentration &amp; Sector Exposure Matrix
          </span>
          {hasSectorConcentration || hasStockConcentration ? (
            <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-300 font-mono">
              <AlertTriangle className="h-3 w-3 text-amber-400" />
              Concentration Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300 font-mono">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              Balanced (No Sector &gt; 25% or Stock &gt; 15%)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
          <span>Resolved: <strong className="text-white">{formatINR(resolvedCapital)}</strong></span>
          {unresolvedCount > 0 && (
            <span className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
              {unresolvedCount} unquoted excluded
            </span>
          )}
        </div>
      </div>

      {/* 2-Column Split: Left = Sectors, Right = Single Stocks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 font-mono text-xs">
        {/* Left: Top Sector Allocations */}
        <div className="rounded-lg border border-[#1e293b] bg-[#0b0f19]/70 p-3 space-y-2.5">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold border-b border-slate-800 pb-1">
            <span className="flex items-center gap-1 text-slate-300">
              <Building className="h-3.5 w-3.5 text-indigo-400" />
              Sector Allocations (Limit: 25%)
            </span>
            <span>Weight / INR</span>
          </div>

          <div className="space-y-2">
            {displaySectors.map((s: SectorExposure) => (
              <div key={s.sector} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                    {s.sector}
                    {s.isConcentrated && (
                      <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 py-0 text-[9px] font-bold">
                        &gt; 25% CONCENTRATED
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2 text-slate-200">
                    <span className="text-slate-400 text-[10px]">({formatINR(s.currentValue)})</span>
                    <span className={`font-bold ${s.isConcentrated ? 'text-amber-400' : 'text-white'}`}>
                      {s.capitalWeightPct.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      s.isConcentrated ? 'bg-amber-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${Math.min(100, s.capitalWeightPct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Top Single-Stock Positions */}
        <div className="rounded-lg border border-[#1e293b] bg-[#0b0f19]/70 p-3 space-y-2.5">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold border-b border-slate-800 pb-1">
            <span className="flex items-center gap-1 text-slate-300">
              <Landmark className="h-3.5 w-3.5 text-indigo-400" />
              Top Stock Positions (Limit: 15%)
            </span>
            <span>Weight / INR</span>
          </div>

          <div className="space-y-2">
            {displayStocks.map((stock: StockConcentration) => (
              <div key={stock.isin} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                    {stock.symbol}
                    {stock.isConcentrated && (
                      <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 py-0 text-[9px] font-bold">
                        &gt; 15% CONCENTRATED
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2 text-slate-200">
                    <span className="text-slate-400 text-[10px]">({formatINR(stock.currentValue)})</span>
                    <span className={`font-bold ${stock.isConcentrated ? 'text-amber-400' : 'text-white'}`}>
                      {stock.capitalWeightPct.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      stock.isConcentrated ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, stock.capitalWeightPct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
