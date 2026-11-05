import React from 'react';
import { SafetyFlags } from '../types/engine';
import { AlertOctagon, AlertTriangle, ShieldAlert, ArrowLeftRight } from 'lucide-react';

interface SafetyAlertsProps {
  safety: SafetyFlags;
}

export const SafetyAlerts: React.FC<SafetyAlertsProps> = ({ safety }) => {
  const hasAnyAlert =
    safety.cashDivergenceRedFlag ||
    safety.cyclicalPeakRisk ||
    safety.promoterPledgeRedFlag ||
    safety.earningsShockRedFlag ||
    safety.fundamentalFloorFailed ||
    safety.highSlippageRisk;

  if (!hasAnyAlert) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-400 flex items-center gap-2 font-medium">
        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        All Institutional Safety Gates Passed (Zero Red Flags Detected)
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* 1. Cash Divergence Kill-Switch */}
      {safety.cashDivergenceRedFlag && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300 flex items-start gap-3">
          <AlertOctagon className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-rose-200">
              KILL-SWITCH TRIGGERED: RED_FLAG_CASH_DIVERGENCE
            </div>
            <p className="mt-1 text-slate-300">
              Company reported positive cumulative 3-Year Net Profit, but 3-Year Operating Cash Flow (CFO) is negative. High accrual/accounting risk. -10 points deducted and stock is capped out of FAVORABLE status.
            </p>
          </div>
        </div>
      )}

      {/* 2. Cyclical Peak Risk */}
      {safety.cyclicalPeakRisk && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-amber-200">
              CYCLICAL_PEAK_RISK: Low P/E Inversion Detected
            </div>
            <p className="mt-1 text-slate-300">
              Cyclical commodity sector trading at an abnormally low P/E alongside super-normal 3Y CAGR (&gt;35%). Trailing stops locked strictly to 10-bar swing low.
            </p>
          </div>
        </div>
      )}

      {/* 3. Promoter Pledge */}
      {safety.promoterPledgeRedFlag && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-rose-200">
              RED_FLAG_PROMOTER_PLEDGE: High Share Encumbrance
            </div>
            <p className="mt-1 text-slate-300">
              Promoter pledged shares stand at {safety.promoterPledgePct.toFixed(1)}% (Threshold: 20%). Risk of forced margin liquidations in down-moves. -10 points deducted.
            </p>
          </div>
        </div>
      )}

      {/* 4. Earnings Shock */}
      {safety.earningsShockRedFlag && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300 flex items-start gap-3">
          <AlertOctagon className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-rose-200">
              EARNINGS_SHOCK: Severe Quarterly Profit Collapse
            </div>
            <p className="mt-1 text-slate-300">
              Latest quarterly net profit crashed by {safety.latestQuarterlyNetProfitYoY?.toFixed(1)}% YoY. FAVORABLE classification is blocked until earnings recover.
            </p>
          </div>
        </div>
      )}

      {/* 5. Fundamental Floor */}
      {safety.fundamentalFloorFailed && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-amber-200">
              FUNDAMENTAL_FLOOR_FAILED: Speculative Momentum
            </div>
            <p className="mt-1 text-slate-300">
              Core Score is high due to technical momentum, but Fundamental Score is below the 25.0 threshold. Downgraded to HOLD to prevent buying junk momentum.
            </p>
          </div>
        </div>
      )}

      {/* 6. High Slippage Risk (Layer 4) */}
      {safety.highSlippageRisk && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300 flex items-start gap-3">
          <ArrowLeftRight className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-rose-200">
              HIGH_SLIPPAGE_RISK: Bid-Ask Spread Exceeds Guardrail
            </div>
            <p className="mt-1 text-slate-300">
              Bid-Ask spread is {safety.bidAskSpreadPct.toFixed(2)}% (Threshold: 0.40%). Market orders prohibited. Enforce passive limit orders only.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
