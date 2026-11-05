import React from 'react';
import { DataIntegrityAudit, DataSource } from '../types/engine';
import { ShieldCheck, ShieldAlert, AlertTriangle, FileSpreadsheet, Calendar, Scale, Radio } from 'lucide-react';
import { SessionResolver } from '../engine/sessionResolver';

interface DataIntegrityBannerProps {
  integrity: DataIntegrityAudit;
  dataSource?: DataSource;
  dataSourceError?: string;
  isEtf?: boolean;
}

export const DataIntegrityBanner: React.FC<DataIntegrityBannerProps> = ({
  integrity,
  dataSource = 'UPSTOX_LIVE',
  dataSourceError,
  isEtf = false,
}) => {
  const getStatusConfig = () => {
    if (isEtf) {
      return {
        bg: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
        badgeBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
        icon: ShieldCheck,
        label: 'DATA INTEGRITY: NOT APPLICABLE (ETF ASSET CLASS)',
        desc: 'Exchange Traded Funds track underlying indices/commodities; corporate financial statements (Balance Sheet, Cash Flow, ROE/ROCE) are not applicable.',
      };
    }
    switch (integrity.status) {
      case 'PASSED':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
          badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          icon: ShieldCheck,
          label: 'DATA INTEGRITY: VERIFIED',
          desc: 'Balance sheet equality balanced (≤0.1% tolerance), P&L reconciled with cash flow, and filing freshness validated.',
        };
      case 'QUARANTINED':
        return {
          bg: 'bg-rose-500/10 border-rose-500/40 text-rose-400',
          badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
          icon: ShieldAlert,
          label: 'DATA INTEGRITY: QUARANTINED',
          desc: 'Accounting disparity detected. Balance sheet fails fundamental equality equation. Model execution locked.',
        };
      case 'FRESHNESS_UNVERIFIABLE':
      case 'STALE_FILING':
        return {
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          icon: AlertTriangle,
          label: 'DATA INTEGRITY: FRESHNESS UNVERIFIABLE',
          desc: `Financial statement period coverage is ${integrity.freshnessDays} days old. Actual SEBI publication date is unverified from Upstox (Informational State).`,
        };
      case 'HOLD_PENDING_AUDIT':
        return {
          bg: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
          badgeBg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
          icon: AlertTriangle,
          label: 'DATA INTEGRITY: PENDING REVIEW',
          desc: 'Unexplained share capital shift (>50%) without recorded corporate action.',
        };
    }
  };

  const config = getStatusConfig();
  const StatusIcon = config.icon;

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${config.bg}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StatusIcon className="h-5 w-5 shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs font-mono tracking-wide">
                {config.label}
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${config.badgeBg}`}>
                Data Integrity
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">{config.desc}</p>
          </div>
        </div>

        {/* Data Integrity Metric Chips */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          {isEtf ? (
            <>
              <div
                className="flex items-center gap-1 rounded bg-[#0b0f19] border border-[#1e293b] px-2.5 py-1 text-slate-300"
                title="Asset Class Structure"
              >
                <Scale className="h-3 w-3 text-cyan-400" />
                <span>Structure:</span>
                <span className="text-cyan-400 font-bold">ETF Tracker</span>
              </div>
              <div
                className="flex items-center gap-1 rounded bg-[#0b0f19] border border-[#1e293b] px-2.5 py-1 text-slate-300"
                title="Corporate Ratios Applicability"
              >
                <FileSpreadsheet className="h-3 w-3 text-indigo-400" />
                <span>Corp Ratios:</span>
                <span className="text-indigo-300 font-bold">NOT APPLICABLE</span>
              </div>
            </>
          ) : (
            <>
              <div
                className="flex items-center gap-1 rounded bg-[#0b0f19] border border-[#1e293b] px-2.5 py-1 text-slate-300"
                title="Balance Sheet Equality Equation (Assets = Liabilities + Equity)"
              >
                <Scale className="h-3 w-3 text-cyan-400" />
                <span>Balance Sheet:</span>
                <span className={integrity.bsBalanced ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {integrity.bsDiscrepancyPct.toFixed(2)}%
                </span>
              </div>

              <div
                className="flex items-center gap-1 rounded bg-[#0b0f19] border border-[#1e293b] px-2.5 py-1 text-slate-300"
                title="Operating Cash Flow reconciliation against Net Profit"
              >
                <FileSpreadsheet className="h-3 w-3 text-indigo-400" />
                <span>Cash Flow:</span>
                <span className={integrity.cashFlowReconciled ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {integrity.cashFlowReconciled ? 'Reconciled' : 'Discrepant'}
                </span>
              </div>

              <div
                className="flex items-center gap-1 rounded bg-[#0b0f19] border border-[#1e293b] px-2.5 py-1 text-slate-300 cursor-help"
                title="Days elapsed since the company's last audited financial filing. Filings >180 days old trigger a freshness review."
              >
                <Calendar className="h-3 w-3 text-amber-400" />
                <span>Filing Age:</span>
                <span className={integrity.freshnessDays <= 180 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {integrity.freshnessDays}d
                </span>
              </div>
            </>
          )}

          <div
            className="flex items-center gap-1 rounded bg-[#0b0f19] border border-[#1e293b] px-2.5 py-1 text-slate-300"
            title="Market telemetry data provider"
          >
            {(() => {
              const session = SessionResolver.resolve();
              const isMarketOpen = session.marketSessionState === 'OPEN';
              const isLive = dataSource === 'UPSTOX_LIVE';
              const feedLabel = isLive
                ? isMarketOpen
                  ? 'LIVE FEED'
                  : `LAST CLOSE FEED (${session.tradingSessionId})`
                : dataSource === 'DEMO'
                ? 'DEMO'
                : dataSource === 'FALLBACK'
                ? 'FALLBACK'
                : dataSource;

              return (
                <>
                  <Radio
                    className={`h-3 w-3 ${
                      isLive
                        ? isMarketOpen
                          ? 'text-emerald-400 animate-pulse'
                          : 'text-indigo-400'
                        : dataSource === 'DEMO'
                        ? 'text-blue-400'
                        : 'text-amber-400'
                    }`}
                  />
                  <span>Feed:</span>
                  <span
                    className={
                      isLive
                        ? isMarketOpen
                          ? 'text-emerald-400 font-bold'
                          : 'text-indigo-300 font-bold'
                        : dataSource === 'DEMO'
                        ? 'text-blue-400 font-bold'
                        : 'text-amber-400 font-bold'
                    }
                  >
                    {feedLabel}
                  </span>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* API Notice / Error */}
      {dataSourceError && (
        <div className="mt-3 border-t border-amber-500/30 pt-2.5 text-[11px] font-mono text-amber-300 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
          <span>
            <strong>Data Source Notice:</strong> {dataSourceError}
          </span>
        </div>
      )}

      {/* Discrepancy Reasons */}
      {!isEtf && integrity.reasons.length > 0 && (
        <div className="mt-3 border-t border-current/20 pt-2.5 space-y-1">
          {integrity.reasons.map((r, i) => (
            <div key={i} className="text-[11px] font-mono opacity-90 flex items-start gap-1.5">
              <span>•</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
