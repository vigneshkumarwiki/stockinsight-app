import React, { useState } from 'react';
import { HoldingWithEvaluation } from '../../types/portfolio';
import {
  ExternalLink,
  Trash2,
  Edit2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  LayoutDashboard,
  Upload,
  Sparkles,
} from 'lucide-react';
import { HoldingCard } from './HoldingCard';

interface HoldingsTableProps {
  items: HoldingWithEvaluation[];
  onSelectStock: (symbol: string) => void;
  onEditHolding: (item: HoldingWithEvaluation) => void;
  onDeleteHolding: (id: string) => void;
  onRefreshHolding?: (symbol: string, isin?: string) => void;
  refreshingSymbols?: Set<string>;
  onClearAll?: () => void;
  onOpenAddModal: () => void;
  onOpenImport: () => void;
  totalPortfolioValue?: number;
  onLoadDemo?: () => void;
}

export const HoldingsTable: React.FC<HoldingsTableProps> = ({
  items,
  onSelectStock,
  onEditHolding,
  onDeleteHolding,
  onRefreshHolding,
  refreshingSymbols,
  onClearAll,
  onOpenAddModal,
  onOpenImport,
  totalPortfolioValue,
  onLoadDemo,
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const formatINR = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(val);
  };

  /**
   * Streamlined primary status badge with clear visual hierarchy
   */
  const renderZoneBadge = (item: HoldingWithEvaluation) => {
    if (item.actionBadge === 'QUARANTINED') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-300 font-mono tracking-wide">
          <ShieldAlert className="h-3 w-3 text-rose-400" />
          QUARANTINED
        </span>
      );
    }
    const isEtf = item.evaluation?.sector === 'ETF' || item.holding.sector === 'ETF';
    if (isEtf) {
      return (
        <span
          title="ETF Core holding evaluated via technical trend and orderbook liquidity"
          className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-300 font-mono tracking-wide shadow-sm"
        >
          ETF CORE
        </span>
      );
    }
    switch (item.zone) {
      case 'FAVORABLE':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 font-mono tracking-wide">
            <CheckCircle2 className="h-3 w-3" />
            FAVORABLE
          </span>
        );
      case 'HOLD':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400 font-mono tracking-wide">
            HOLD
          </span>
        );
      case 'CAUTION':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-400 font-mono tracking-wide">
            CAUTION
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-800/60 border border-slate-700/60 px-2 py-0.5 text-[10px] font-mono text-slate-400">
            EVALUATING...
          </span>
        );
    }
  };

  /**
   * Action guard status indicator with actionable hover tooltip
   */
  const renderActionBadge = (item: HoldingWithEvaluation) => {
    const isEtf = item.evaluation?.sector === 'ETF' || item.holding.sector === 'ETF';
    const stopBufferPct =
      item.currentLtp && item.stopLoss
        ? ((item.currentLtp - item.stopLoss) / item.currentLtp) * 100
        : null;
    const isExtended =
      item.evaluation?.execution.status === 'EXTENDED_WAIT_FOR_PULLBACK' ||
      Boolean(item.evaluation?.execution?.maxEntry && item.currentLtp && item.currentLtp > item.evaluation.execution.maxEntry);

    // 1. Critical Stop Loss Breach
    if (item.stopBreached) {
      return (
        <span
          title={`STOP BREACHED: LTP (₹${item.currentLtp?.toFixed(2) ?? '--'}) breached dynamic stop (₹${item.stopLoss?.toFixed(2) ?? '--'}).\nACTION: Exit / cut position immediately to protect capital.`}
          className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/60 bg-rose-950/50 px-2 py-0.5 text-[10px] font-bold text-rose-200 font-mono animate-pulse shadow-sm cursor-help"
        >
          <AlertTriangle className="h-3 w-3 text-rose-400" />
          STOP BREACHED
        </span>
      );
    }

    // 2. Near Stop Loss Buffer (<= 3.0%)
    if (stopBufferPct !== null && stopBufferPct <= 3.0 && stopBufferPct >= 0) {
      return (
        <span
          title={`NEAR STOP: LTP is within ${stopBufferPct.toFixed(1)}% of structural stop (₹${item.stopLoss?.toFixed(2) ?? '--'}).\nTighten position risk.`}
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-950/40 px-2 py-0.5 text-[10px] font-bold text-amber-300 font-mono cursor-help"
        >
          NEAR STOP (+{stopBufferPct.toFixed(1)}%)
        </span>
      );
    }

    // 3. Price Extended
    if (isExtended) {
      const extPct =
        item.evaluation?.execution?.maxEntry && item.currentLtp
          ? (((item.currentLtp - item.evaluation.execution.maxEntry) / item.evaluation.execution.maxEntry) * 100).toFixed(1)
          : null;
      return (
        <span
          title="Price extended above optimal entry corridor. Hold existing position; avoid aggressive fresh additions."
          className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-950/30 px-2 py-0.5 text-[10px] font-semibold text-sky-300 font-mono cursor-help"
        >
          EXTENDED {extPct ? `(+${extPct}%)` : ''}
        </span>
      );
    }

    // 4. Optical Gainer / Accrual Trap
    if (item.accrualTrapGain) {
      return (
        <span
          title={`ACCRUAL RISK: Paper gain (+${item.pnlPercentage?.toFixed(1) ?? '0.0'}%) with weak fundamentals (${item.fundamentalScore ?? '--'}/50).\nRECOMMENDED ACTION: Harvest / book profits.`}
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-950/20 px-2 py-0.5 text-[10px] font-medium text-amber-300 font-mono cursor-help"
        >
          ACCRUAL RISK
        </span>
      );
    }

    // 5. In Optimal Corridor
    if (item.actionBadge === 'READY_TO_BUY') {
      return (
        <span
          title="Optimal accumulation corridor: Favorable score with room to accumulate."
          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-950/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300 font-mono cursor-help"
        >
          IN CORRIDOR
        </span>
      );
    }

    // 6. Forensic Quarantine
    if (item.actionBadge === 'QUARANTINED') {
      return (
        <span
          title="QUARANTINED: Accounting statements failed forensic integrity audit."
          className="inline-flex items-center gap-1 rounded-md border border-rose-500/60 bg-rose-950/40 px-2 py-0.5 text-[10px] font-bold text-rose-300 font-mono cursor-help"
        >
          QUARANTINED
        </span>
      );
    }

    // 7. ETF Passive Core
    if (isEtf) {
      return (
        <span
          title="ETF Index / Commodity holding tracking underlying benchmark."
          className="inline-flex items-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-950/20 px-2 py-0.5 text-[10px] font-medium text-indigo-300 font-mono cursor-help"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
          PASSIVE CORE
        </span>
      );
    }

    // 8. Caution zone
    if (item.actionBadge === 'CAUTION') {
      return (
        <span
          title="DEFENSIVE: Macro bearish technical trend or distressed fundamentals."
          className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-950/20 px-2 py-0.5 text-[10px] font-medium text-rose-300/80 font-mono cursor-help"
        >
          DEFENSIVE
        </span>
      );
    }

    // 9. Standard healthy within corridor
    return (
      <span
        title="Position intact within risk corridor."
        className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-300 font-mono"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Within Corridor
      </span>
    );
  };

  return (
    <div className="rounded-xl border border-[#1e293b] bg-[#111827] shadow-sm overflow-hidden">
      {/* Portfolio Hub Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e293b] p-4 bg-[#0d1321]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide uppercase font-mono">
                Portfolio Hub &amp; Holdings Radar
              </h2>
              <span className="rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[11px] font-mono font-semibold text-slate-300">
                {items.length} {items.length === 1 ? 'Asset' : 'Assets'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live quantitative risk monitoring &amp; capital tracking. Click any row for single-stock Deep Dive.
            </p>
          </div>
        </div>

        {/* Global Action CTAs */}
        <div className="flex flex-wrap items-center gap-2 font-mono">
          <button
            type="button"
            onClick={onOpenImport}
            className="flex items-center gap-1.5 rounded-lg border border-[#1e293b] bg-[#111827] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-indigo-500 hover:text-white transition-all shadow-sm"
            title="Import from Zerodha, Groww, Upstox, Excel or CSV"
          >
            <Upload className="h-3.5 w-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Import</span>
          </button>
          <button
            type="button"
            onClick={onOpenAddModal}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition-all shadow-sm"
          >
            <span>+ Add Position</span>
          </button>
          {items.length > 0 && onClearAll && (
            <div className="relative">
              {showClearConfirm ? (
                <div className="flex items-center gap-1 bg-[#1e293b] p-1 rounded-lg border border-rose-500/40">
                  <span className="text-[10px] text-rose-300 px-1 font-sans">Clear all?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearAll();
                      setShowClearConfirm(false);
                    }}
                    className="px-2 py-0.5 text-[10px] bg-rose-600 hover:bg-rose-500 text-white rounded font-bold"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(false)}
                    className="px-2 py-0.5 text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                  title="Clear all portfolio holdings"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area: Table / Empty State */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/80 text-slate-400 mb-3 border border-slate-700">
            <LayoutDashboard className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-mono">
            No Holdings Recorded
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1 mb-5">
            Import your broker portfolio or manually add positions to activate the automated Risk Radar.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenImport}
              className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 transition-all font-mono"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Import Portfolio</span>
            </button>
            <button
              type="button"
              onClick={onOpenAddModal}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-semibold text-white transition-all font-mono"
            >
              <span>+ Add First Position</span>
            </button>
            {onLoadDemo && (
              <button
                type="button"
                onClick={onLoadDemo}
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition-all font-mono"
                title="Load 4-stock institutional benchmark portfolio (Reliance, TCS, HDFC Bank, Bajaj Finance)"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>Load Demo Benchmark</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Mobile View: High-Density Card Grid (< 768px) */}
          <div className="block md:hidden p-3 space-y-3">
            {items.map((item) => (
              <HoldingCard
                key={item.holding.id}
                item={item}
                onSelectStock={onSelectStock}
                onEditHolding={onEditHolding}
                onDeleteHolding={onDeleteHolding}
                onRefreshHolding={onRefreshHolding}
                isRefreshing={refreshingSymbols?.has(item.holding.symbol.toUpperCase())}
                totalPortfolioValue={totalPortfolioValue}
              />
            ))}
          </div>

          {/* Desktop / Tablet View: 7-Column Structured Grid (>= 768px) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0f172a] text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono border-b border-[#1e293b]">
                <tr>
                  {/* 1. ASSET */}
                  <th className="px-4 py-3">Asset / Sector</th>

                  {/* 2. MARKET DATA */}
                  <th className="px-4 py-3">Market Price &amp; Stop</th>

                  {/* 3. YOUR POSITION */}
                  <th className="px-4 py-3">Position &amp; Value</th>

                  {/* 4. PERFORMANCE */}
                  <th className="px-4 py-3">Unrealized P&amp;L</th>

                  {/* 5. QUANT RATING */}
                  <th className="px-4 py-3">Quant Rating</th>

                  {/* 6. ACTION GUARD */}
                  <th className="px-4 py-3">Action Guard</th>

                  {/* 7. ACTIONS */}
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#1e293b] font-mono">
                {items.map((item) => {
                  const isPnlPos = item.pnl !== null && item.pnl >= 0;
                  
                  // Compute dynamic stop buffer proximity percentage
                  let stopBufferPct: number | null = null;
                  if (item.currentLtp !== null && item.stopLoss !== null && item.currentLtp > 0) {
                    stopBufferPct = ((item.currentLtp - item.stopLoss) / item.currentLtp) * 100;
                  }

                  // Compute allocation percentage of total portfolio
                  const allocationPct =
                    totalPortfolioValue && totalPortfolioValue > 0 && item.currentValue !== null
                      ? (item.currentValue / totalPortfolioValue) * 100
                      : null;

                  return (
                    <tr
                      key={item.holding.id}
                      onClick={() => onSelectStock(item.holding.symbol)}
                      className="hover:bg-[#182234]/70 cursor-pointer transition-colors group"
                    >
                      {/* 1. ASSET (Symbol, Name, Sector) */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 font-bold text-white text-sm">
                            <span>{item.holding.symbol}</span>
                            <ExternalLink className="h-3 w-3 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                          </div>
                          <span className="text-[11px] text-slate-400 font-sans truncate max-w-[170px]">
                            {item.holding.companyName}
                          </span>
                          <span className="text-[10px] text-slate-500 font-sans">
                            {item.holding.sector}
                          </span>
                        </div>
                      </td>

                      {/* 2. MARKET DATA (LTP & Dynamic Stop with Proximity Tag) */}
                      <td className="px-4 py-3.5">
                        {item.currentLtp !== null && item.quoteStatus === 'RESOLVED' ? (
                          <>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-white text-sm">
                                ₹{item.currentLtp.toFixed(2)}
                              </span>
                              {item.dayChangePercentage !== null && (
                                <span
                                  className={`rounded px-1.5 py-0.2 text-[10px] font-mono font-semibold ${
                                    item.dayChangePercentage >= 0
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                  }`}
                                >
                                  {item.dayChangePercentage >= 0 ? '+' : ''}
                                  {item.dayChangePercentage.toFixed(2)}%
                                </span>
                              )}
                            </div>
                            {item.stopLoss && (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span
                                  className={`text-[10px] ${
                                    item.stopBreached ? 'text-rose-400 font-bold' : 'text-slate-500'
                                  }`}
                                >
                                  Stop: ₹{item.stopLoss.toFixed(2)}
                                </span>
                                {stopBufferPct !== null && (
                                  <span
                                    className={`text-[9px] font-semibold px-1 rounded ${
                                      item.stopBreached
                                        ? 'bg-rose-500/20 text-rose-300 font-bold'
                                        : stopBufferPct < 3.0
                                        ? 'bg-amber-500/20 text-amber-300'
                                        : 'text-slate-500'
                                    }`}
                                  >
                                    {item.stopBreached ? 'BREACHED' : `(${stopBufferPct.toFixed(1)}% buf)`}
                                  </span>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5">
                              {item.quoteStatus === 'PENDING' ? 'EVALUATING...' : 'UNQUOTED / COST BASIS'}
                            </span>
                            <div className="text-[10px] text-slate-500 font-mono">
                              Cost: ₹{item.holding.averageBuyPrice.toFixed(2)}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 3. YOUR POSITION (Quantity, Avg Buy, Current Value, Invested) */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-100 text-sm">
                          {item.currentValue !== null ? formatINR(item.currentValue) : formatINR(item.investedValue)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {item.holding.quantity} shares &bull; Inv: {formatINR(item.investedValue)}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="text-slate-500">Avg: ₹{item.holding.averageBuyPrice.toFixed(2)}</span>
                          {allocationPct !== null ? (
                            <span className="text-indigo-400 font-semibold bg-indigo-500/10 px-1 rounded border border-indigo-500/20 text-[9px]">
                              {allocationPct.toFixed(1)}% wt
                            </span>
                          ) : (
                            <span className="text-amber-400/90 font-mono text-[9px] bg-amber-500/10 px-1 rounded border border-amber-500/20">
                              Cost Basis
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. PERFORMANCE (Unrealized P&L Amount & %) */}
                      <td className="px-4 py-3.5">
                        {item.pnl !== null && item.pnlPercentage !== null ? (
                          <>
                            <div className={`font-bold ${isPnlPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isPnlPos ? '+' : ''}
                              {formatINR(item.pnl)}
                            </div>
                            <div
                              className={`text-[11px] font-semibold ${
                                isPnlPos ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isPnlPos ? '+' : ''}
                              {item.pnlPercentage.toFixed(2)}%
                            </div>
                            {item.dayChange !== null && item.dayChangePercentage !== null && (
                              <div
                                className={`text-[10px] mt-0.5 flex items-center gap-1 font-mono ${
                                  item.dayChange >= 0 ? 'text-emerald-400/90' : 'text-rose-400/90'
                                }`}
                                title="Today's price movement & P&L"
                              >
                                <span>Day:</span>
                                <span>
                                  {item.dayChange >= 0 ? '+' : ''}
                                  {formatINR(item.dayChange)} ({item.dayChange >= 0 ? '+' : ''}
                                  {item.dayChangePercentage.toFixed(1)}%)
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="inline-block text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60">
                              Pending Quote
                            </span>
                            <div className="text-[10px] text-slate-500 font-mono">
                              Cost: {formatINR(item.investedValue)}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 5. QUANT RATING (Core Score, F/T split, Decision Zone) */}
                      <td className="px-4 py-3.5">
                        {item.coreScore !== null ? (
                          <div className="flex flex-col space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">
                                {item.evaluation?.sector === 'ETF' || item.holding.sector === 'ETF'
                                  ? item.technicalScore !== null
                                    ? (item.technicalScore * 2).toFixed(0)
                                    : item.coreScore.toFixed(0)
                                  : item.coreScore.toFixed(0)}{' '}
                                <span className="text-[10px] text-slate-500">/ 100</span>
                              </span>
                              {renderZoneBadge(item)}
                            </div>
                            <div
                              className="flex items-center gap-1.5 text-[10px] font-mono tracking-tight"
                              title={
                                item.evaluation?.sector === 'ETF' || item.holding.sector === 'ETF'
                                  ? `ETF Technical Score: ${item.technicalScore?.toFixed(0) ?? '--'}/50 (Normalized: ${item.technicalScore ? (item.technicalScore * 2).toFixed(0) : '--'}/100)`
                                  : item.evaluation?.fundamentalStatus === 'UNAVAILABLE'
                                  ? `Fundamental: Unavailable / N/A | Technical: ${item.technicalScore?.toFixed(0) ?? '--'}/50`
                                  : `Fundamental: ${item.fundamentalScore?.toFixed(0) ?? '--'}/50 | Technical: ${item.technicalScore?.toFixed(0) ?? '--'}/50`
                              }
                            >
                              {item.evaluation?.sector === 'ETF' || item.holding.sector === 'ETF' ? (
                                <span className="text-amber-400 font-bold">
                                  Tech Trend: {item.technicalScore?.toFixed(0) ?? '--'}/50
                                </span>
                              ) : (
                                <>
                                  <span className="text-cyan-400 font-bold">
                                    F:{' '}
                                    {item.evaluation?.fundamentalStatus === 'UNAVAILABLE'
                                      ? 'N/A'
                                      : item.fundamentalScore?.toFixed(0) ?? '--'}
                                  </span>
                                  <span className="text-slate-600">&bull;</span>
                                  <span className="text-indigo-400 font-bold">
                                    T: {item.technicalScore?.toFixed(0) ?? '--'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px]">--</span>
                        )}
                      </td>

                      {/* 6. ACTION GUARD */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {renderActionBadge(item)}
                      </td>

                      {/* 7. ACTIONS (Event Propagation Isolated) */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {onRefreshHolding && (
                            <button
                              type="button"
                              onClick={() => onRefreshHolding(item.holding.symbol, item.holding.isin)}
                              disabled={refreshingSymbols?.has(item.holding.symbol.toUpperCase())}
                              className={`rounded p-1.5 transition-colors ${
                                refreshingSymbols?.has(item.holding.symbol.toUpperCase())
                                  ? 'text-indigo-400 cursor-wait bg-indigo-500/10'
                                  : item.quoteStatus !== 'RESOLVED'
                                  ? 'text-amber-400 hover:bg-amber-500/20 hover:text-amber-300'
                                  : 'text-slate-400 hover:bg-slate-800 hover:text-indigo-400'
                              }`}
                              title={
                                item.quoteStatus !== 'RESOLVED'
                                  ? `Retry quote for ${item.holding.symbol}`
                                  : `Refresh live quote for ${item.holding.symbol}`
                              }
                            >
                              <RefreshCw
                                className={`h-3.5 w-3.5 ${
                                  refreshingSymbols?.has(item.holding.symbol.toUpperCase()) ? 'animate-spin' : ''
                                }`}
                              />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onEditHolding(item)}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                            title="Edit Position"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteHolding(item.holding.id)}
                            className="rounded p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
                            title="Remove Holding"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
