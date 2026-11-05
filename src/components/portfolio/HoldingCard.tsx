import React from 'react';
import { HoldingWithEvaluation } from '../../types/portfolio';
import { ExternalLink, Edit2, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';

interface HoldingCardProps {
  item: HoldingWithEvaluation;
  onSelectStock: (symbol: string) => void;
  onEditHolding: (item: HoldingWithEvaluation) => void;
  onDeleteHolding: (id: string) => void;
  onRefreshHolding?: (symbol: string, isin?: string) => void;
  isRefreshing?: boolean;
  totalPortfolioValue?: number;
}

export const HoldingCard: React.FC<HoldingCardProps> = ({
  item,
  onSelectStock,
  onEditHolding,
  onDeleteHolding,
  onRefreshHolding,
  isRefreshing,
  totalPortfolioValue,
}) => {
  const formatINR = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(val);
  };

  const isPnlPos = item.pnl !== null && item.pnl >= 0;

  // Dynamic Stop Buffer Proximity %
  let stopBufferPct: number | null = null;
  if (item.currentLtp !== null && item.stopLoss !== null && item.currentLtp > 0) {
    stopBufferPct = ((item.currentLtp - item.stopLoss) / item.currentLtp) * 100;
  }

  // Portfolio Weight %
  const allocationPct =
    totalPortfolioValue && totalPortfolioValue > 0 && item.currentValue !== null
      ? (item.currentValue / totalPortfolioValue) * 100
      : null;

  const renderZoneBadge = () => {
    switch (item.zone) {
      case 'FAVORABLE':
        return (
          <span className="rounded-md border border-emerald-500/30 bg-emerald-950/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 font-mono">
            FAVORABLE
          </span>
        );
      case 'CAUTION':
        return (
          <span className="rounded-md border border-rose-500/30 bg-rose-950/30 px-2 py-0.5 text-[10px] font-bold text-rose-400 font-mono">
            CAUTION
          </span>
        );
      case 'HOLD':
        return (
          <span className="rounded-md border border-amber-500/30 bg-amber-950/30 px-2 py-0.5 text-[10px] font-bold text-amber-400 font-mono">
            HOLD
          </span>
        );
      default:
        return (
          <span className="rounded-md border border-slate-700 bg-slate-800/50 px-2 py-0.5 text-[10px] text-slate-400 font-mono">
            EVALUATING
          </span>
        );
    }
  };

  const getActionTooltip = (): string => {
    switch (item.actionBadge) {
      case 'EXIT_BREACHED':
        return `⚠️ STOP BREACHED: LTP (₹${item.currentLtp?.toFixed(2) ?? '--'}) breached dynamic stop-loss (₹${item.stopLoss?.toFixed(2) ?? '--'}).\nREQUIRED ACTION: Exit / cut position immediately to protect capital.`;
      case 'HARVEST_PROFIT_ACCRUAL_TRAP':
        return `💰 ACCRUAL RISK: Paper gain (+${item.pnlPercentage?.toFixed(1) ?? '0.0'}%) with weak fundamentals (${item.fundamentalScore ?? '--'}/50).\nRECOMMENDED ACTION: Harvest / book profits now before earnings crash.`;
      case 'READY_TO_BUY':
        return `🚀 IN CORRIDOR: Favorable score inside optimal accumulation corridor.\nOPPORTUNITY: Favorable risk/reward. Safe to accumulate or add capital.`;
      case 'CAUTION':
        return `🛡️ DEFENSIVE: Macro bearish technical trend or distressed fundamentals.\nDEFENSIVE ACTION: Do NOT average down. Tighten stops and protect cash.`;
      case 'QUARANTINED':
        return `🚫 QUARANTINED: Accounting statements failed forensic integrity audit.\nPOLICY: Execution locked. Do not allocate capital.`;
      default:
        return `✅ MAINTAIN: Price is fluctuating inside normal volatility boundaries.\nACTION: Maintain position. No action needed.`;
    }
  };

  const renderActionBadge = () => {
    const tooltip = getActionTooltip();
    switch (item.actionBadge) {
      case 'EXIT_BREACHED':
        return (
          <span
            title={tooltip}
            className="inline-flex items-center gap-1 rounded-md border border-rose-500/50 bg-rose-950/50 px-2 py-0.5 text-[10px] font-semibold text-rose-300 font-mono animate-pulse cursor-help"
          >
            <AlertTriangle className="h-3 w-3 text-rose-400" />
            STOP BREACHED
          </span>
        );
      case 'HARVEST_PROFIT_ACCRUAL_TRAP':
        return (
          <span
            title={tooltip}
            className="rounded-md border border-amber-500/30 bg-amber-950/20 px-2 py-0.5 text-[10px] font-medium text-amber-300 font-mono cursor-help"
          >
            ACCRUAL RISK
          </span>
        );
      case 'READY_TO_BUY':
        return (
          <span
            title={tooltip}
            className="rounded-md border border-emerald-500/30 bg-emerald-950/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300 font-mono cursor-help"
          >
            IN CORRIDOR
          </span>
        );
      case 'CAUTION':
        return (
          <span
            title={tooltip}
            className="rounded-md border border-rose-500/30 bg-rose-950/20 px-2 py-0.5 text-[10px] font-medium text-rose-300 font-mono cursor-help"
          >
            DEFENSIVE
          </span>
        );
      default:
        return (
          <span
            title={tooltip}
            className="rounded-md border border-slate-700/50 bg-slate-900/30 px-2 py-0.5 text-[10px] font-normal text-slate-400 font-mono cursor-help"
          >
            MAINTAIN
          </span>
        );
    }
  };

  return (
    <div
      onClick={() => onSelectStock(item.holding.symbol)}
      className="rounded-xl border border-[#1e293b] bg-[#111827] p-4 shadow-sm hover:border-indigo-500/40 transition-all cursor-pointer space-y-3 font-mono"
    >
      {/* 1. Header: Asset & Actions */}
      <div className="flex items-start justify-between gap-2 border-b border-[#1e293b]/60 pb-2.5">
        <div>
          <div className="flex items-center gap-1.5 font-bold text-white text-base">
            <span>{item.holding.symbol}</span>
            <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
          </div>
          <p className="text-xs text-slate-400 font-sans truncate max-w-[200px]">
            {item.holding.companyName}
          </p>
          <span className="text-[10px] text-slate-500 font-sans">{item.holding.sector}</span>
        </div>

        {/* Action Buttons (Event Isolated) */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {onRefreshHolding && (
            <button
              type="button"
              onClick={() => onRefreshHolding(item.holding.symbol, item.holding.isin)}
              disabled={isRefreshing}
              className={`rounded p-1.5 transition-colors ${
                isRefreshing
                  ? 'text-indigo-400 cursor-wait bg-indigo-500/10'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-indigo-400'
              }`}
              title={`Refresh live quote for ${item.holding.symbol}`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
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
      </div>

      {/* 2. Market vs Position 2-Column Grid */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {/* Left: Market Data */}
        <div className="rounded-lg bg-[#0b0f19] p-2.5 border border-[#1e293b]/60 space-y-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
            Market LTP
          </span>
          {item.quoteStatus === 'PENDING' ? (
            <span className="text-xs font-semibold text-amber-400 animate-pulse">Evaluating...</span>
          ) : item.quoteStatus === 'UNAVAILABLE' || item.currentLtp === null ? (
            <span className="text-xs font-semibold text-slate-500">Unavailable</span>
          ) : (
            <>
              <div className="text-sm font-bold text-white">₹{item.currentLtp.toFixed(2)}</div>
              {item.stopLoss && (
                <div className="flex items-center gap-1">
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
                      {item.stopBreached ? 'BREACHED' : `(${stopBufferPct.toFixed(1)}%)`}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Position & P&L */}
        <div className="rounded-lg bg-[#0b0f19] p-2.5 border border-[#1e293b]/60 space-y-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
            Unrealized P&amp;L
          </span>
          {item.pnl !== null && item.pnlPercentage !== null ? (
            <>
              <div className={`text-sm font-bold ${isPnlPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPnlPos ? '+' : ''}
                {formatINR(item.pnl)}
              </div>
              <div className={`text-[10px] font-semibold ${isPnlPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPnlPos ? '+' : ''}
                {item.pnlPercentage.toFixed(2)}%
              </div>
              {item.dayChange !== null && item.dayChangePercentage !== null && (
                <div
                  className={`text-[9px] pt-0.5 flex items-center gap-1 font-mono ${
                    item.dayChange >= 0 ? 'text-emerald-400/90' : 'text-rose-400/90'
                  }`}
                  title="Today's Change"
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
            <div className="text-xs text-slate-500 font-medium">--</div>
          )}
        </div>
      </div>

      {/* 3. Position Accounting Row */}
      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-400 bg-[#0b0f19]/60 px-3 py-1.5 rounded-lg border border-[#1e293b]/40">
        <div>
          <span>Shares: </span>
          <span className="text-slate-200 font-semibold">{item.holding.quantity}</span>
        </div>
        <div>
          <span>Avg Buy: </span>
          <span className="text-slate-200 font-semibold">₹{item.holding.averageBuyPrice.toFixed(2)}</span>
        </div>
        <div>
          <span>Inv: </span>
          <span className="text-slate-200 font-semibold">{formatINR(item.investedValue)}</span>
        </div>
        {allocationPct !== null && (
          <div>
            <span className="text-indigo-400 font-semibold bg-indigo-500/10 px-1 rounded border border-indigo-500/20 text-[10px]">
              {allocationPct.toFixed(1)}% wt
            </span>
          </div>
        )}
      </div>

      {/* 4. Quant Rating & Action Guard Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-[#1e293b]/40 text-xs">
        <div className="flex items-center gap-1.5">
          {item.coreScore !== null ? (
            <>
              <span className="font-bold text-white text-sm">{item.coreScore.toFixed(0)}</span>
              <span className="text-[10px] text-slate-500">/100</span>
              {renderZoneBadge()}
            </>
          ) : (
            <span className="text-slate-500 text-xs">--</span>
          )}
        </div>

        <div>{renderActionBadge()}</div>
      </div>
    </div>
  );
};
