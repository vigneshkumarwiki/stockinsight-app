import React, { useState } from 'react';
import { FactorScore, FundamentalBuckets, TechnicalBuckets, SectorClassification } from '../types/engine';
import { Landmark, TrendingUp, AlertTriangle, ShieldAlert } from 'lucide-react';

interface FactorTableProps {
  fundamentalFactors: FactorScore[];
  technicalFactors: FactorScore[];
  fundamentalScore: number;
  technicalScore: number;
  fundamentalBuckets?: FundamentalBuckets;
  technicalBuckets?: TechnicalBuckets;
  sector?: SectorClassification;
  fundamentalStatus?: import('../types/engine').FundamentalDataStatus;
  technicalStatus?: 'LIVE' | 'UNAVAILABLE';
}

export const FactorTable: React.FC<FactorTableProps> = ({
  fundamentalFactors,
  technicalFactors,
  fundamentalScore,
  technicalScore,
  fundamentalBuckets,
  technicalBuckets,
  sector = 'INDUSTRIAL',
  fundamentalStatus,
  technicalStatus,
}) => {
  const [activeTab, setActiveTab] = useState<'FUNDAMENTAL' | 'TECHNICAL'>('FUNDAMENTAL');

  const isFundUnavailable = fundamentalStatus === 'UNAVAILABLE';
  const isTechUnavailable = technicalStatus === 'UNAVAILABLE';
  const currentFactors = activeTab === 'FUNDAMENTAL' ? fundamentalFactors : technicalFactors;
  const currentTotal = activeTab === 'FUNDAMENTAL' ? fundamentalScore : technicalScore;
  const isBankModel = sector === 'COMMERCIAL_BANK' || sector === 'NBFC_HFC';

  const getBucketPillStyle = (score: number, max: number) => {
    if (max <= 0) return 'bg-slate-800 text-slate-300 border-slate-700';
    const ratio = score / max;
    if (ratio < 0.35) {
      return 'bg-rose-500/10 border-rose-500/30 text-rose-300';
    }
    if (ratio < 0.60) {
      return 'bg-amber-500/10 border-amber-500/30 text-amber-300';
    }
    return 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300';
  };

  return (
    <div className="rounded-xl border border-[#1e293b] bg-[#111827] shadow-sm overflow-hidden">
      {/* Header Tabs & Subtotal */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e293b] bg-[#0b0f19] px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setActiveTab('FUNDAMENTAL')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'FUNDAMENTAL'
                ? 'bg-cyan-500/10 border border-cyan-500/40 text-cyan-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#151d2f]'
            }`}
          >
            <Landmark className="h-4 w-4 text-cyan-400" />
            <span>Fundamental Breakdown {isFundUnavailable ? '(UNAVAILABLE)' : `(${fundamentalScore.toFixed(1)} / 50)`}</span>
          </button>

          <button
            onClick={() => setActiveTab('TECHNICAL')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'TECHNICAL'
                ? 'bg-indigo-500/10 border border-indigo-500/40 text-indigo-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#151d2f]'
            }`}
          >
            <TrendingUp className="h-4 w-4 text-indigo-400" />
            <span>Technical Breakdown {isTechUnavailable ? '(UNAVAILABLE)' : `(${technicalScore.toFixed(1)} / 50)`}</span>
          </button>
        </div>

        <div className="text-xs font-mono font-semibold text-slate-400 flex items-baseline gap-1.5">
          <span>Subtotal:</span>
          <span className="text-white text-sm font-bold">
            {(activeTab === 'FUNDAMENTAL' && isFundUnavailable) || (activeTab === 'TECHNICAL' && isTechUnavailable)
              ? 'N/A'
              : currentTotal.toFixed(1)}
          </span>
          <span className="text-slate-500 text-[11px]">/ 50.0 pts</span>
        </div>
      </div>

      {/* Category Breakdown Bar */}
      {activeTab === 'FUNDAMENTAL' && isFundUnavailable && (
        <div className="border-b border-[#1e293b]/70 bg-amber-500/10 px-6 py-2.5 text-xs flex items-center gap-2 font-mono text-amber-300">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <span>Upstox fundamental data is unavailable for this security. Corporate financial ratios cannot be evaluated.</span>
        </div>
      )}

      {activeTab === 'TECHNICAL' && isTechUnavailable && (
        <div className="border-b border-[#1e293b]/70 bg-amber-500/10 px-6 py-2.5 text-xs flex items-center gap-2 font-mono text-amber-300">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <span>Upstox historical candle series is unavailable for this security. Technical indicators cannot be computed.</span>
        </div>
      )}

      {activeTab === 'FUNDAMENTAL' && sector === 'ETF' && (
        <div className="border-b border-[#1e293b]/70 bg-[#0f172a] px-6 py-2.5 text-xs flex flex-wrap items-center gap-2.5 font-mono">
          <span className="text-slate-400 font-sans font-semibold text-[11px] uppercase tracking-wider">
            Category Breakdown:
          </span>
          <span
            className="rounded bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-amber-300 font-bold cursor-help"
            title="Fundamental analysis is not applicable to index/commodity ETFs. This score uses technical analysis only."
          >
            ETF MODEL: NOT APPLICABLE
          </span>
        </div>
      )}

      {activeTab === 'FUNDAMENTAL' && fundamentalBuckets && sector !== 'ETF' && (
        <div className="border-b border-[#1e293b]/70 bg-[#0f172a] px-6 py-2.5 text-xs flex flex-wrap items-center gap-2.5 font-mono">
          <span className="text-slate-400 font-sans font-semibold text-[11px] uppercase tracking-wider">
            Category Breakdown:
          </span>
          {isBankModel ? (
            <>
              <span className={`rounded border px-2.5 py-0.5 ${getBucketPillStyle(fundamentalBuckets.valuationBucket, 12)}`}>
                Valuation: {fundamentalBuckets.valuationBucket.toFixed(1)}/12
              </span>
              <span className={`rounded border px-2.5 py-0.5 ${getBucketPillStyle(fundamentalBuckets.capitalEfficiencyBucket, 18)}`}>
                Capital Efficiency: {fundamentalBuckets.capitalEfficiencyBucket.toFixed(1)}/18
              </span>
              <span className={`rounded border px-2.5 py-0.5 ${getBucketPillStyle(fundamentalBuckets.growthAndSolvencyBucket, 20)}`}>
                Growth & Solvency: {fundamentalBuckets.growthAndSolvencyBucket.toFixed(1)}/20
              </span>
            </>
          ) : (
            <>
              <span className={`rounded border px-2.5 py-0.5 ${getBucketPillStyle(fundamentalBuckets.valuationBucket, 12)}`}>
                Valuation: {fundamentalBuckets.valuationBucket.toFixed(1)}/12 (Eq: {fundamentalBuckets.equityMultiples}/7, EV: {fundamentalBuckets.enterpriseMultiples}/5)
              </span>
              <span className={`rounded border px-2.5 py-0.5 ${getBucketPillStyle(fundamentalBuckets.capitalEfficiencyBucket, 12)}`}>
                Efficiency: {fundamentalBuckets.capitalEfficiencyBucket.toFixed(1)}/12
              </span>
              <span className={`rounded border px-2.5 py-0.5 ${getBucketPillStyle(fundamentalBuckets.cashQualityBucket, 6)}`}>
                Cash Quality: {fundamentalBuckets.cashQualityBucket.toFixed(1)}/6
              </span>
              <span className={`rounded border px-2.5 py-0.5 ${getBucketPillStyle(fundamentalBuckets.growthAndSolvencyBucket, 17)}`}>
                Growth & Solvency: {fundamentalBuckets.growthAndSolvencyBucket.toFixed(1)}/17
              </span>
              {fundamentalBuckets.accrualTrapPenalty > 0 && (
                <span className="rounded bg-rose-500/10 border border-rose-500/30 px-2.5 py-0.5 text-rose-300 flex items-center gap-1 font-bold">
                  <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
                  -5 pts Accrual Trap Dominance Penalty
                </span>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'TECHNICAL' && technicalBuckets && (
        <div className="border-b border-[#1e293b]/70 bg-[#0f172a] px-6 py-2.5 text-xs flex flex-wrap items-center gap-2.5 font-mono">
          <span className="text-slate-400 font-sans font-semibold text-[11px] uppercase tracking-wider">
            Technical Categories:
          </span>
          <span className="rounded bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 text-indigo-300">
            Trend & Macro: {technicalBuckets.trendRegimeBucket.toFixed(1)}/20
          </span>
          <span className="rounded bg-violet-500/10 border border-violet-500/20 px-2.5 py-0.5 text-violet-300">
            Momentum: {technicalBuckets.momentumBucket.toFixed(1)}/15
          </span>
          <span className="rounded bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-amber-300">
            Volume Confirmation: {technicalBuckets.volumeAccumulationBucket.toFixed(1)}/15
          </span>
          {technicalBuckets.volumeVetoApplied && (
            <span className="rounded bg-rose-500/10 border border-rose-500/30 px-2.5 py-0.5 text-rose-300 flex items-center gap-1 font-bold">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
              VOLUME VETO ACTIVE (Score Capped at 35)
            </span>
          )}
        </div>
      )}

      {/* Structured Proportional Factor Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-[#182234] text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-[#1e293b]">
            <tr>
              <th className="py-3 px-5 w-[24%] min-w-[180px]">Factor / Metric</th>
              <th className="py-3 px-3 w-[10%] min-w-[85px]">State</th>
              <th className="py-3 px-4 w-[16%] min-w-[120px]">Raw Metric</th>
              <th className="py-3 px-4 w-[10%] min-w-[75px] text-center">Weight</th>
              <th className="py-3 px-4 w-[12%] min-w-[95px] text-center">Score</th>
              <th className="py-3 px-5 w-[28%] min-w-[220px]">Quantitative Rationale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e293b]/60">
            {currentFactors.map((factor, idx) => {
              const isZeroDrag = activeTab === 'FUNDAMENTAL' && factor.score === 0 && factor.state !== 'NOT_APPLICABLE' && factor.state !== 'MISSING';
              return (
              <tr
                key={idx}
                className={`hover:bg-[#162032] transition-colors ${
                  isZeroDrag ? 'border-l-2 border-rose-500/80 bg-rose-500/[0.04]' : ''
                }`}
              >
                {/* 1. Factor Identity (High Priority) */}
                <td className="py-3.5 px-5 font-semibold text-slate-100">
                  <div className="text-xs leading-snug">{factor.name}</div>
                  {factor.bucket && (
                    <div className="text-[10px] text-slate-400 font-mono font-normal mt-0.5">
                      {factor.bucket}
                    </div>
                  )}
                </td>

                {/* 2. State Badge (Low Priority with User-Facing Tooltips) */}
                <td className="py-3.5 px-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-medium cursor-help ${
                      factor.state === 'AVAILABLE'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : factor.state === 'DERIVED'
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                    title={
                      factor.state === 'AVAILABLE'
                        ? 'Supplied directly from financial filings and registry data'
                        : factor.state === 'DERIVED'
                        ? 'Calculated locally from historical OHLCV price and volume bars'
                        : 'Data stream unavailable or neutral'
                    }
                  >
                    {factor.state}
                  </span>
                </td>

                {/* 3. Raw Metric (Prominent Evidence with Provenance Tooltip) */}
                <td className="py-3.5 px-4 font-mono font-bold text-white text-xs tabular-nums">
                  <div
                    className="inline-flex items-center gap-1.5 cursor-help"
                    title={
                      factor.provenance === 'COMPARISON_UNAVAILABLE'
                        ? `Reported value: ${factor.rawValue} | Sector comparison unavailable or non-positive (${factor.benchmarkValue ?? 'n/a'})`
                        : factor.provenance === 'PROVIDER_REPORTED'
                        ? `Reported directly from provider filings (${factor.sourceFields?.join(', ') || 'registry'})`
                        : factor.provenance === 'DERIVED'
                        ? `Derived metric: ${factor.formula || 'Calculated locally'}`
                        : 'Metric unavailable'
                    }
                  >
                    <span>{factor.rawValue ?? '—'}</span>
                    {factor.benchmarkValue && (
                      <span className="text-[10px] text-slate-400 font-normal">
                        ({factor.benchmarkValue} sector)
                      </span>
                    )}
                    {factor.provenance === 'COMPARISON_UNAVAILABLE' && (
                      <span
                        className="text-amber-400 font-bold text-[11px]"
                        aria-label="Sector benchmark unavailable or non-positive"
                      >
                        *
                      </span>
                    )}
                  </div>
                </td>

                {/* 4. Weight (Compact) */}
                <td className="py-3.5 px-4 text-center font-mono text-slate-400 tabular-nums text-xs">
                  {factor.weight} pts
                </td>

                {/* 5. Score (Medium / Clear Result) */}
                <td className="py-3.5 px-4 text-center font-mono font-bold tabular-nums">
                  {factor.state === 'MISSING' || factor.state === 'NOT_APPLICABLE' ? (
                    <span
                      className="text-sm text-slate-400 font-normal"
                      aria-label={`${factor.name} not available`}
                      title="Metric unavailable or not applicable; zero points assigned"
                    >
                      —
                    </span>
                  ) : (
                    <span
                      className={`text-sm ${
                        factor.score === factor.weight
                          ? 'text-emerald-400'
                          : factor.score > 0
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {factor.score.toFixed(1)}
                    </span>
                  )}
                  <span className="text-slate-500 text-[10px] ml-1 font-normal">
                    / {factor.weight}
                  </span>
                </td>

                {/* 6. Quantitative Rationale (Constrained Supporting Text) */}
                <td className="py-3.5 px-5 text-slate-400 text-xs leading-relaxed">
                  <p className="max-w-prose">{factor.explanation}</p>
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>

      {/* What This Means (Fundamental / Technical) */}
      <div className="border-t border-[#1e293b] bg-[#0b0f19] px-6 py-3 text-xs text-slate-300">
        <span className="font-semibold text-indigo-300 font-mono text-[11px] uppercase tracking-wide">
          What This Means:{' '}
        </span>
        <span className="text-slate-300 leading-relaxed">
          {activeTab === 'FUNDAMENTAL'
            ? sector === 'ETF'
              ? 'Fundamental scoring is not applicable to index/commodity ETFs. Quantitative evaluation is derived entirely from technical price action and order book liquidity.'
              : fundamentalScore >= 38
              ? 'Fundamental quality is strong across balance sheet equality, cash flow conversion, and valuation multiples.'
              : fundamentalScore >= 28
              ? 'Fundamental health is sound with stable financial metrics, consistent cash generation, and solvent capital structure.'
              : fundamentalScore >= 18
              ? 'Fundamental condition is mixed. Selected sub-factor strengths are balanced by constraints in profitability, growth, or valuation multiples.'
              : 'Fundamental score is in the weak regime. Financial statements indicate constrained margins, lower cash conversion, or elevated multiples.'
            : technicalScore >= 38
            ? 'Technical regime exhibits strong institutional momentum, robust moving average trend structure, and supportive volume accumulation.'
            : technicalScore >= 28
            ? 'Technical structure is positive with price sustaining above key intermediate moving averages.'
            : technicalScore >= 18
            ? 'Technical condition is in a neutral consolidation state with balanced momentum and mixed moving average alignment.'
            : 'Technical score is in the weak regime with price trading below major moving average levels and subdued accumulation.'}
        </span>
      </div>
    </div>
  );
};
