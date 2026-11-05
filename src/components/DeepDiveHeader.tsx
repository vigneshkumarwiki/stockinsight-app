import React, { useState, useEffect } from 'react';
import { StockInsightEvaluation } from '../types/engine';
import { Holding, HoldingWithEvaluation } from '../types/portfolio';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Copy,
  Check,
  Briefcase,
  TrendingUp,
  TrendingDown,
  Layers,
  ArrowLeft,
} from 'lucide-react';

interface DeepDiveHeaderProps {
  symbol: string;
  evaluation: StockInsightEvaluation | null;
  currentHolding: HoldingWithEvaluation | null;
  portfolioHoldings: Holding[];
  onBackToPortfolio: () => void;
  onSelectStock: (symbol: string, isin?: string) => void;
  onRefreshStock: (symbol: string, isin?: string) => void;
  isRefreshing: boolean;
  totalPortfolioValue?: number;
}

export const DeepDiveHeader: React.FC<DeepDiveHeaderProps> = ({
  symbol,
  evaluation,
  currentHolding,
  portfolioHoldings,
  onBackToPortfolio,
  onSelectStock,
  onRefreshStock,
  isRefreshing,
  totalPortfolioValue = 0,
}) => {
  const [copiedIsin, setCopiedIsin] = useState<boolean>(false);

  const upperSymbol = symbol.toUpperCase().trim();
  const isin = evaluation?.isin || currentHolding?.holding?.isin || '';
  const companyName = evaluation?.companyName || currentHolding?.holding?.companyName || upperSymbol;
  const sectorName = evaluation?.sectorName || currentHolding?.holding?.sector || 'Equities';
  const isEtf = evaluation?.sector === 'ETF' || currentHolding?.holding?.sector === 'ETF';

  // Live price metrics
  const ltp = evaluation?.execution?.ltp ?? currentHolding?.currentLtp ?? null;
  const netChange = evaluation?.netChange ?? currentHolding?.dayChange ?? null;
  const netChangePct = evaluation?.netChangePct ?? currentHolding?.dayChangePercentage ?? null;
  const isDayPositive = netChange !== null && netChange >= 0;

  // Portfolio navigation index
  const currentIndex = portfolioHoldings.findIndex(
    (h) => h.symbol.toUpperCase() === upperSymbol || (Boolean(isin) && h.isin?.toUpperCase() === isin.toUpperCase())
  );
  const isHolding = currentIndex !== -1 && Boolean(currentHolding?.holding && currentHolding.holding.quantity > 0);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex !== -1 && currentIndex < portfolioHoldings.length - 1;

  // Portfolio weight
  const holdingVal = currentHolding?.currentValue ?? (currentHolding?.holding && ltp ? currentHolding.holding.quantity * ltp : null);
  const weightPct = holdingVal !== null && totalPortfolioValue > 0 ? (holdingVal / totalPortfolioValue) * 100 : null;

  // Day range & VWAP metrics
  const dayLow = evaluation?.dayLow;
  const dayHigh = evaluation?.dayHigh;
  const intradayVwap = evaluation?.intradayVwap;
  const hasValidDayRange = dayLow !== undefined && dayHigh !== undefined && dayHigh > dayLow && ltp !== null && ltp > 0;
  const rangeSpread = hasValidDayRange ? (dayHigh - dayLow) : 1;
  const ltpPosPct = hasValidDayRange ? Math.max(0, Math.min(100, ((ltp - dayLow) / rangeSpread) * 100)) : 50;
  const vwapPosPct = hasValidDayRange && intradayVwap !== undefined && intradayVwap >= dayLow && intradayVwap <= dayHigh
    ? Math.max(0, Math.min(100, ((intradayVwap - dayLow) / rangeSpread) * 100))
    : null;

  const handleCopyIsin = () => {
    if (!isin) return;
    navigator.clipboard.writeText(isin);
    setCopiedIsin(true);
    setTimeout(() => setCopiedIsin(false), 2000);
  };

  const handlePrevStock = () => {
    if (hasPrev) {
      const prev = portfolioHoldings[currentIndex - 1];
      onSelectStock(prev.symbol, prev.isin);
    }
  };

  const handleNextStock = () => {
    if (hasNext) {
      const next = portfolioHoldings[currentIndex + 1];
      onSelectStock(next.symbol, next.isin);
    }
  };

  // Keyboard navigation: ArrowLeft/J (prev), ArrowRight/K (next), Escape (Portfolio Hub)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        if (hasPrev) {
          e.preventDefault();
          handlePrevStock();
        }
      } else if (e.key === 'ArrowRight' || e.key === 'k' || e.key === 'K') {
        if (hasNext) {
          e.preventDefault();
          handleNextStock();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onBackToPortfolio();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasPrev, hasNext, currentIndex, portfolioHoldings, onSelectStock, onBackToPortfolio]);

  return (
    <div className="rounded-xl border border-[#1e293b] bg-[#111827] p-4 sm:p-5 shadow-sm space-y-4">
      {/* Top Nav Row: Stock switcher and quick actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e293b]/70 pb-3">
        {/* Left: Portfolio Stock Navigator */}
        <div className="flex items-center gap-3">
          {portfolioHoldings.length > 0 ? (
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <span className="text-slate-400 font-sans text-xs font-semibold mr-1 hidden sm:inline">Portfolio Stock:</span>
              <button
                onClick={handlePrevStock}
                disabled={!hasPrev}
                className="rounded-lg border border-[#1e293b] bg-[#0b0f19] p-1.5 text-slate-400 hover:text-white hover:border-indigo-500 disabled:opacity-30 disabled:hover:border-[#1e293b] transition-all"
                title={hasPrev ? `Previous: ${portfolioHoldings[currentIndex - 1].symbol} (Key: J or ←)` : 'No previous holding'}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <select
                value={upperSymbol}
                onChange={(e) => {
                  const targetSym = e.target.value;
                  const matched = portfolioHoldings.find((h) => h.symbol.toUpperCase() === targetSym);
                  onSelectStock(targetSym, matched?.isin);
                }}
                className="rounded-lg border border-[#1e293b] bg-[#0b0f19] px-2.5 py-1 text-xs font-mono text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer max-w-[160px] sm:max-w-[200px] truncate"
                title="Switch between your portfolio holdings (Keys: J / K)"
              >
                {currentIndex === -1 && (
                  <option value={upperSymbol}>{upperSymbol} (Active Stock)</option>
                )}
                {portfolioHoldings.map((h, i) => (
                  <option key={h.id || h.symbol} value={h.symbol.toUpperCase()}>
                    {i + 1}. {h.symbol} ({h.quantity} sh)
                  </option>
                ))}
              </select>

              <button
                onClick={handleNextStock}
                disabled={!hasNext}
                className="rounded-lg border border-[#1e293b] bg-[#0b0f19] p-1.5 text-slate-400 hover:text-white hover:border-indigo-500 disabled:opacity-30 disabled:hover:border-[#1e293b] transition-all"
                title={hasNext ? `Next: ${portfolioHoldings[currentIndex + 1].symbol} (Key: K or →)` : 'No next holding'}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>

              {currentIndex !== -1 && (
                <span className="text-[10px] text-slate-500 hidden md:inline ml-1">
                  ({currentIndex + 1} of {portfolioHoldings.length})
                </span>
              )}

              <span className="text-[10px] text-slate-500 hidden lg:inline ml-2 border-l border-[#1e293b] pl-2 font-sans">
                Keys: <kbd className="font-mono bg-slate-800 text-slate-300 px-1 py-0.2 rounded text-[9px]">J</kbd> / <kbd className="font-mono bg-slate-800 text-slate-300 px-1 py-0.2 rounded text-[9px]">K</kbd> to cycle &bull; <kbd className="font-mono bg-slate-800 text-slate-300 px-1 py-0.2 rounded text-[9px]">Esc</kbd> Hub
              </span>
            </div>
          ) : (
            <div className="text-xs font-mono text-slate-400 font-semibold">
              Deep Dive Analysis
            </div>
          )}
        </div>

        {/* Right Actions: Compact Single Refresh & Back Pill */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onRefreshStock(upperSymbol, isin)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-lg border border-[#1e293b] bg-[#0b0f19] px-3 py-1.5 text-xs font-mono font-semibold text-slate-300 hover:border-cyan-500 hover:text-white transition-all shadow-sm disabled:opacity-50"
            title="Refresh quote and technical candles from Upstox"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Quote'}</span>
          </button>
        </div>
      </div>

      {/* Main Stock Banner: Symbol, Name, Sector, ISIN, Center Range Bar & Price Ticker */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Stock Identity */}
        <div className="space-y-1 min-w-[220px]">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white">
              {upperSymbol}
            </h2>

            <span className="rounded bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-400">
              NSE_EQ
            </span>

            {isEtf ? (
              <span className="rounded bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 font-mono text-[11px] font-bold text-purple-300">
                ETF Core
              </span>
            ) : (
              <span className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                {sectorName}
              </span>
            )}

            {isHolding && (
              <span className="flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-400">
                <Briefcase className="h-3 w-3" />
                In Portfolio
                {weightPct !== null && (
                  <span className="text-emerald-300/80 font-normal">({weightPct.toFixed(1)}% wt)</span>
                )}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-sans">
            <span className="font-medium text-slate-200">{companyName}</span>
            {isin && (
              <>
                <span className="text-slate-600">&bull;</span>
                <span className="font-mono text-[11px] text-slate-400 flex items-center gap-1">
                  ISIN: {isin}
                  <button
                    onClick={handleCopyIsin}
                    className="text-slate-500 hover:text-slate-200 transition-colors ml-0.5"
                    title="Copy ISIN code"
                  >
                    {copiedIsin ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Center: Intraday Mini-Range Bar (Utilizing Hero Identity Dead Space) */}
        {hasValidDayRange && (
          <div className="flex flex-col justify-center px-4 py-2 bg-[#0b0f19] border border-[#1e293b] rounded-xl font-mono text-[11px] min-w-[240px] max-w-[340px] flex-1 shadow-inner">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-sans mb-1">
              <span className="font-semibold text-slate-300">Intraday Range</span>
              {intradayVwap !== undefined && intradayVwap > 0 && (
                <span className="text-slate-400 font-mono text-[9px] bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700/60" title="Volume-Weighted Average Price">
                  VWAP: ₹{intradayVwap.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
            <div className="relative h-2 w-full rounded-full bg-slate-800 overflow-visible my-1.5">
              {/* Progress bar up to current LTP */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-cyan-500/80 to-indigo-500 rounded-full"
                style={{ width: `${ltpPosPct}%` }}
              />
              {/* Intraday VWAP tick if present */}
              {vwapPosPct !== null && intradayVwap && intradayVwap >= dayLow && intradayVwap <= dayHigh && (
                <div
                  className="absolute -top-1 w-0.5 bg-amber-400 z-10 rounded"
                  style={{ left: `${vwapPosPct}%`, height: '16px' }}
                  title={`Intraday VWAP: ₹${intradayVwap.toFixed(2)}`}
                />
              )}
              {/* LTP marker */}
              <div
                className="absolute -top-1 -ml-1 h-4 w-2 rounded-sm bg-white shadow-md border border-slate-900 z-20"
                style={{ left: `${ltpPosPct}%` }}
                title={`Live LTP: ₹${ltp.toFixed(2)}`}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold tabular-nums">
              <span>L: ₹{dayLow.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-slate-200 font-extrabold">₹{ltp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span>H: ₹{dayHigh.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}

        {/* Right: Real-time Price Ticker */}
        <div className="flex items-center gap-4 bg-[#0b0f19] border border-[#1e293b] rounded-xl px-4 py-2.5 font-mono shadow-inner">
          <div>
            <div className="text-[10px] uppercase font-sans font-semibold text-slate-400">
              Live LTP
            </div>
            <div className="text-xl sm:text-2xl font-black text-white tabular-nums tracking-tight">
              {ltp !== null && ltp > 0
                ? `₹${ltp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '—'}
            </div>
          </div>

          {(netChange !== null || netChangePct !== null) && (
            <div className="border-l border-[#1e293b] pl-3.5">
              <div className="text-[10px] uppercase font-sans font-semibold text-slate-400">
                Today's Change
              </div>
              <div
                className={`flex items-center gap-1 text-sm font-bold tabular-nums ${
                  isDayPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isDayPositive ? (
                  <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>
                  {netChange !== null
                    ? `${isDayPositive ? '+' : ''}₹${netChange.toFixed(2)}`
                    : ''}
                </span>
                {netChangePct !== null && (
                  <span className="text-xs font-semibold">
                    ({isDayPositive ? '+' : ''}{netChangePct.toFixed(2)}%)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
