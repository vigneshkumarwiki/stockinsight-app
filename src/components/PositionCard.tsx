import React, { useMemo, useState } from 'react';
import { HoldingWithEvaluation } from '../types/portfolio';
import { Briefcase, TrendingUp, TrendingDown, ShieldCheck, Tag, AlertTriangle, ShieldAlert, Copy, Check } from 'lucide-react';
import { StopProximityEngine } from '../engine/stopProximityEngine';

interface PositionCardProps {
  holdingItem: HoldingWithEvaluation;
  totalPortfolioValue?: number;
}

export const PositionCard: React.FC<PositionCardProps> = ({ holdingItem, totalPortfolioValue = 0 }) => {
  const [copiedGtt, setCopiedGtt] = useState<boolean>(false);
  const { holding, currentValue, pnl, pnlPercentage, actionBadge, actionExplanation, evaluation, currentLtp } = holdingItem;

  // Day P&L calculations
  const netChange = evaluation?.netChange ?? holdingItem.dayChange ?? null;
  const netChangePct = evaluation?.netChangePct ?? holdingItem.dayChangePercentage ?? null;
  const dayPnl = netChange !== null && holding?.quantity ? netChange * holding.quantity : null;
  const isDayProfit = dayPnl !== null && dayPnl >= 0;

  // Portfolio weight
  const weightPct = currentValue !== null && totalPortfolioValue > 0 ? (currentValue / totalPortfolioValue) * 100 : null;

  // Action badge hover guidance
  const getActionBadgeTooltip = (badge: string): string => {
    switch (badge) {
      case 'EXIT_BREACHED':
        return 'CRITICAL EXIT: Market price has breached the Model D structural stop (S1). Prioritize risk preservation.';
      case 'ACCRUAL RISK':
        return 'ACCOUNTING WARNING: High discrepancy between reported net profits and operating cash flows. Cap allocation.';
      case 'IN CORRIDOR':
        return 'OPTIMAL SETUP: Favorable quantitative score and price is within defined risk/reward corridor to target.';
      case 'DEFENSIVE':
        return 'CAPITAL PRESERVATION: Sub-optimal quantitative score or caution zone. Avoid aggressive additions.';
      case 'MAINTAIN':
        return 'BALANCED HOLD: Position is stable within consolidation corridor. Maintain position while monitoring stops.';
      case 'QUARANTINED':
        return 'DATA LOCK: Severe accounting/forensic discrepancy detected. Model execution locked.';
      default:
        return 'Automated portfolio risk guardrail status based on quantitative quality, momentum, and stop buffers.';
    }
  };

  // F-03 Stop Proximity Calculation (must be called unconditionally before early returns)
  const stopProximity = useMemo(() => {
    if (!holding || holding.quantity <= 0) return null;
    const { s1, atr14, ltp } = StopProximityEngine.extractStopParameters(evaluation, currentLtp);
    return StopProximityEngine.evaluatePosition({
      ltp,
      s1,
      atr14,
      quantity: holding.quantity,
    });
  }, [evaluation, currentLtp, holding]);

  if (!holding || holding.quantity <= 0) {
    return null;
  }

  const isProfit = pnl !== null && pnl >= 0;
  const investedAmount = holding.quantity * holding.averageBuyPrice;

  // Real-Money Risk to Stop Calculations
  const effectiveLtp = currentLtp || evaluation?.execution?.ltp || (currentValue ? currentValue / holding.quantity : 0);
  const s1Price = stopProximity?.s1 ?? evaluation?.execution?.stopLoss ?? null;
  const isStopAboveCost = s1Price !== null && s1Price >= holding.averageBuyPrice;
  const rupeeRiskToStop = s1Price !== null && effectiveLtp > 0 ? holding.quantity * (effectiveLtp - s1Price) : null;
  const profitAtStop = isStopAboveCost && s1Price !== null ? holding.quantity * (s1Price - holding.averageBuyPrice) : null;
  const capitalAtRiskPct = currentValue && currentValue > 0 && rupeeRiskToStop !== null ? (rupeeRiskToStop / currentValue) * 100 : null;

  const handleCopyGtt = () => {
    if (!s1Price) return;
    const triggerPrice = s1Price.toFixed(2);
    const limitPrice = (s1Price * 0.995).toFixed(2);
    const text = `GTT Trigger: ₹${triggerPrice} | Limit: ₹${limitPrice} (${holding.symbol})`;
    navigator.clipboard.writeText(text);
    setCopiedGtt(true);
    setTimeout(() => setCopiedGtt(false), 2000);
  };

  const getProximityBadge = () => {
    if (!stopProximity || stopProximity.proximityState === null) return null;

    switch (stopProximity.proximityState) {
      case 'BREACHED':
        return {
          label: 'STOP BREACHED',
          style: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          icon: ShieldAlert,
        };
      case 'BUFFER_ZONE':
        return {
          label: 'BUFFER ZONE (< 0.5 ATR)',
          style: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          icon: AlertTriangle,
        };
      case 'STOP_INTACT':
      default:
        return {
          label: 'STOP INTACT',
          style: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          icon: ShieldCheck,
        };
    }
  };

  const proxBadge = getProximityBadge();
  const ProxIcon = proxBadge ? proxBadge.icon : ShieldCheck;

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-[#111827] p-5 shadow-sm space-y-4">
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e293b]/70 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Briefcase className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-mono tracking-tight">YOUR POSITION</h3>
              <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold font-mono text-indigo-300 border border-indigo-500/30">
                PORTFOLIO ASSET
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Personal portfolio exposure and cost-basis performance (Isolated from analytical scoring).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {proxBadge && (
            <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 font-mono text-xs font-bold ${proxBadge.style}`}>
              <ProxIcon className="h-3.5 w-3.5" />
              <span>{proxBadge.label}</span>
            </div>
          )}

          {actionBadge && (
            <div
              className="flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 font-mono text-xs font-bold text-indigo-300 cursor-help"
              title={getActionBadgeTooltip(actionBadge)}
            >
              <Tag className="h-3.5 w-3.5 text-indigo-400" />
              <span>{actionBadge}</span>
            </div>
          )}
        </div>
      </div>

      {/* Metric 4-Column Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums text-xs">
        {/* Quantity */}
        <div className="rounded-lg border border-[#1e293b] bg-[#0b0f19] p-3.5">
          <span className="text-slate-400 text-[10px] uppercase font-sans font-semibold block mb-0.5">
            Holdings / Quantity
          </span>
          <div className="text-lg font-bold text-white">
            {holding.quantity.toLocaleString('en-IN')}
            <span className="text-xs text-slate-500 font-normal ml-1">shares</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Invested: ₹{investedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        {/* Avg Buy Price (Cost Basis) */}
        <div className="rounded-lg border border-[#1e293b] bg-[#0b0f19] p-3.5">
          <span className="text-slate-400 text-[10px] uppercase font-sans font-semibold block mb-0.5">
            Avg Buy (Cost Basis)
          </span>
          <div className="text-lg font-bold text-white">
            ₹{holding.averageBuyPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Book cost per unit
          </div>
        </div>

        {/* Current Market Value + Portfolio Weight Badge */}
        <div className="rounded-lg border border-[#1e293b] bg-[#0b0f19] p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-[10px] uppercase font-sans font-semibold block mb-0.5">
              Current Value
            </span>
            {weightPct !== null && (
              <span className="rounded bg-indigo-500/15 border border-indigo-500/30 px-1.5 py-0.2 text-[9px] font-mono font-bold text-indigo-300">
                {weightPct.toFixed(1)}% of Portfolio
              </span>
            )}
          </div>
          <div className="text-lg font-bold text-slate-100">
            {currentValue !== null
              ? `₹${currentValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '--'}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            At real-time market LTP
          </div>
        </div>

        {/* Unrealized P&L + Today's Rupee P&L */}
        <div className={`rounded-lg border p-3.5 ${
          isProfit ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-[10px] uppercase font-sans font-semibold block mb-0.5">
              Unrealized P&amp;L
            </span>
            {isProfit ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
            )}
          </div>
          <div className={`text-lg font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
            {pnl !== null
              ? `${isProfit ? '+' : ''}₹${pnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '--'}
          </div>
          <div className={`text-[11px] font-semibold mt-0.5 ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
            {pnlPercentage !== null
              ? `${pnlPercentage >= 0 ? '+' : ''}${pnlPercentage.toFixed(2)}% return`
              : '--'}
          </div>
          {dayPnl !== null && (
            <div
              className={`text-[10px] font-mono mt-1 pt-1 border-t border-[#1e293b]/70 flex items-center justify-between ${
                isDayProfit ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              <span>Today:</span>
              <span className="font-bold">
                {isDayProfit ? '+' : ''}₹{dayPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {netChangePct !== null ? ` (${isDayProfit ? '+' : ''}${netChangePct.toFixed(2)}%)` : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Stop Proximity & Position Guardrail Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {s1Price !== null && (
          <div className="rounded-lg border border-slate-800 bg-[#0b0f19] px-3.5 py-2.5 text-xs text-slate-300 flex items-center justify-between font-mono">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase text-slate-500 font-sans font-semibold block">
                  Model D Structural Stop (S1)
                </span>
                <button
                  onClick={handleCopyGtt}
                  className="rounded p-0.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Copy GTT Trigger & Limit to clipboard"
                >
                  {copiedGtt ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-white text-sm">
                  ₹{s1Price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                {copiedGtt && <span className="text-[10px] text-emerald-400 font-sans">GTT Copied!</span>}
              </div>
              {/* Capital at Risk / Locked-in Profit Real-Money Metric */}
              <div className="text-[10px] mt-0.5 font-sans">
                {isStopAboveCost && profitAtStop !== null ? (
                  <span className="text-emerald-400 font-semibold">
                    Locked-in Profit: +₹{profitAtStop.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                ) : rupeeRiskToStop !== null ? (
                  <span className="text-rose-400 font-semibold">
                    Capital at Risk: ₹{rupeeRiskToStop.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    {capitalAtRiskPct !== null ? ` (${capitalAtRiskPct.toFixed(1)}% of position)` : ''}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase text-slate-500 font-sans font-semibold block">
                Distance to S1 Stop
              </span>
              <span className={`font-bold ${
                stopProximity?.proximityState === 'BREACHED'
                  ? 'text-rose-400'
                  : stopProximity?.proximityState === 'BUFFER_ZONE'
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}>
                {stopProximity?.stopDistancePct !== null && stopProximity?.stopDistancePct !== undefined ? `${stopProximity.stopDistancePct >= 0 ? '+' : ''}${stopProximity.stopDistancePct.toFixed(2)}%` : '--'}
                {stopProximity?.stopDistanceATR !== null && stopProximity?.stopDistanceATR !== undefined ? ` / ${stopProximity.stopDistanceATR >= 0 ? '+' : ''}${stopProximity.stopDistanceATR.toFixed(2)} ATR` : ''}
              </span>
            </div>
          </div>
        )}

        {actionExplanation && (
          <div className="rounded-lg border border-slate-800 bg-[#0f172a] px-3.5 py-2.5 text-xs text-slate-300 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-200">Position Guardrail: </span>
              <span className="text-slate-300/90 font-mono text-[11px]">{actionExplanation}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
