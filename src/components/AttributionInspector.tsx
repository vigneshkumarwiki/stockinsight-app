import React, { useState, useMemo } from 'react';
import { FactorAttributionEngine, FactorAttributionResult, SubFactorDelta } from '../engine/factorAttributionEngine';
import { StockInsightEvaluation } from '../types/engine';
import { StockContextEvaluation } from '../types/context';
import { Activity, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';

interface AttributionInspectorProps {
  currentEvaluation: StockInsightEvaluation;
  previousEvaluation?: StockInsightEvaluation | null;
  currentContext?: StockContextEvaluation | null;
  previousContext?: StockContextEvaluation | null;
  attributionResult?: FactorAttributionResult | null;
}

export const AttributionInspector: React.FC<AttributionInspectorProps> = ({
  currentEvaluation,
  previousEvaluation = null,
  currentContext = null,
  previousContext = null,
  attributionResult = null,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Compute or reuse attribution result
  const attribution: FactorAttributionResult = useMemo(() => {
    if (attributionResult) return attributionResult;
    return FactorAttributionEngine.evaluate({
      currentEvaluation,
      previousEvaluation,
      currentContext,
      previousContext,
    });
  }, [attributionResult, currentEvaluation, previousEvaluation, currentContext, previousContext]);

  if (!attribution || !attribution.isTriggered || attribution.activeFactorDeltas.length === 0) {
    return null;
  }

  const { scoreDelta, fundamentalScoreDelta, technicalScoreDelta, activeFactorDeltas, triggerReason } = attribution;

  return (
    <div className="rounded-xl border border-indigo-500/40 bg-[#111827]/95 p-4 shadow-lg font-sans space-y-3">
      {/* Banner Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e293b] pb-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-white font-mono">
            Sub-Factor Attribution Inspector
          </span>
          {triggerReason && (
            <span className="rounded bg-indigo-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-300 border border-indigo-500/30">
              {triggerReason}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Summary Delta Badges */}
          <div className="flex items-center gap-1.5 font-mono text-xs">
            {scoreDelta !== null && (
              <span
                className={`rounded px-1.5 py-0.5 font-bold border ${
                  scoreDelta > 0
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                    : scoreDelta < 0
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                ΔCore: {scoreDelta >= 0 ? '+' : ''}{scoreDelta} pts
              </span>
            )}

            {fundamentalScoreDelta !== null && fundamentalScoreDelta !== 0 && (
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-semibold border ${
                  fundamentalScoreDelta > 0
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}
              >
                ΔFund: {fundamentalScoreDelta >= 0 ? '+' : ''}{fundamentalScoreDelta}
              </span>
            )}

            {technicalScoreDelta !== null && technicalScoreDelta !== 0 && (
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-semibold border ${
                  technicalScoreDelta > 0
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}
              >
                ΔTech: {technicalScoreDelta >= 0 ? '+' : ''}{technicalScoreDelta}
              </span>
            )}
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 rounded bg-[#1e293b] hover:bg-[#334155] px-2 py-1 text-xs font-mono text-slate-300 hover:text-white transition-colors"
            title="Toggle active factor breakdown"
          >
            <span>{activeFactorDeltas.length} Active Factor{activeFactorDeltas.length !== 1 ? 's' : ''}</span>
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Factor Rows */}
      {isExpanded && (
        <div className="space-y-2 pt-1 font-mono text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {activeFactorDeltas.map((delta: SubFactorDelta) => {
              const isPositive = (delta.scoreDelta ?? 0) > 0;
              return (
                <div
                  key={delta.name}
                  className="rounded-lg border border-[#1e293b] bg-[#0b0f19]/80 p-2.5 flex flex-col justify-between space-y-1.5 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-bold text-slate-200 truncate">{delta.name}</span>
                      <span
                        className={`rounded px-1 py-0 text-[9px] font-bold uppercase border ${
                          delta.category === 'FUNDAMENTAL'
                            ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                            : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                        }`}
                      >
                        {delta.category === 'FUNDAMENTAL' ? 'Fund' : 'Tech'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-slate-400 text-[11px]">
                        {delta.previousScore ?? '--'} → {delta.currentScore ?? '--'}
                      </span>
                      <span
                        className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-bold border ${
                          isPositive
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {delta.scoreDelta !== null ? `${delta.scoreDelta >= 0 ? '+' : ''}${delta.scoreDelta} pts` : '--'}
                      </span>
                    </div>
                  </div>

                  {/* Raw metrics transition where available */}
                  {(delta.previousRawValue !== null || delta.currentRawValue !== null) && (
                    <div className="text-[11px] text-slate-400 font-sans">
                      Raw Metric: <span className="font-mono text-slate-300">{delta.previousRawValue ?? 'N/A'}</span> →{' '}
                      <span className="font-mono text-white font-semibold">{delta.currentRawValue ?? 'N/A'}</span>
                    </div>
                  )}

                  <div className="text-[10px] text-slate-500 font-sans leading-tight">
                    {delta.explanation}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
