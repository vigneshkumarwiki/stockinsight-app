import React, { useMemo } from 'react';
import { DecisionZone, FactorScore } from '../types/engine';
import { CheckCircle2, AlertTriangle, AlertOctagon, TrendingUp, Landmark } from 'lucide-react';

interface ScoreGaugeProps {
  coreScore: number;
  fundamentalScore: number;
  technicalScore: number;
  zone: DecisionZone;
  zoneReason?: string;
  floorFailed: boolean;
  isEtf?: boolean;
  fundamentalStatus?: import('../types/engine').FundamentalDataStatus;
  technicalStatus?: 'LIVE' | 'UNAVAILABLE';
  priority?: string;
  archetype?: string;
  archetypeDescription?: string;
  fundamentalFactors?: FactorScore[];
}

const formatArchetype = (arch: string): string => {
  const map: Record<string, string> = {
    ALIGNED_HIGH_QUALITY: 'Market Leader',
    CONSTRUCTIVE_QUALITY: 'Constructive Growth',
    CONSTRUCTIVE_EXPANSION: 'Constructive Growth',
    CONSOLIDATING_QUALITY: 'Consolidating Base',
    STABLE_CONSOLIDATION: 'Consolidating Base',
    QUALITY_IN_PULLBACK: 'Pullback in Uptrend',
    DETERIORATING_STRUCTURE: 'Deteriorating Structure',
    ALIGNED_WEAKNESS: 'Deteriorating Structure',
    LOW_QUALITY_MOMENTUM: 'Speculative Momentum',
    TECHNICAL_LEAD_STRONG: 'Technical Leader',
    ETF_CORE: 'ETF Asset',
  };
  return map[arch] || arch.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({
  coreScore,
  fundamentalScore,
  technicalScore,
  zone,
  zoneReason,
  floorFailed,
  isEtf = false,
  fundamentalStatus,
  technicalStatus,
  priority,
  archetype,
  archetypeDescription,
  fundamentalFactors,
}) => {
  const isFundUnavailable = fundamentalStatus === 'UNAVAILABLE';
  const isTechUnavailable = technicalStatus === 'UNAVAILABLE';
  const isScoreUnavailable = isTechUnavailable || (!isEtf && isFundUnavailable);
  const displayScore = coreScore;
  const displayZone = zone;
  const displayReason = zoneReason;

  const zeroDragFactors = useMemo(() => {
    if (!floorFailed && fundamentalScore >= 25) return [];
    return (fundamentalFactors || [])
      .filter((f) => f.score === 0 && f.state !== 'NOT_APPLICABLE')
      .slice(0, 2)
      .map((f) => {
        const cleanName = f.name.replace(/\(.*?\)/g, '').trim();
        return `${cleanName} (0/${f.weight})`;
      });
  }, [floorFailed, fundamentalScore, fundamentalFactors]);

  const getZoneStyle = (z: DecisionZone) => {
    switch (z) {
      case 'FAVORABLE':
        return {
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          text: 'text-emerald-400',
          badgeBg: 'bg-emerald-500',
          icon: CheckCircle2,
          label: 'FAVORABLE',
        };
      case 'HOLD':
        return {
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          text: 'text-amber-400',
          badgeBg: 'bg-amber-500',
          icon: AlertTriangle,
          label: 'HOLD',
        };
      case 'CAUTION':
      default:
        return {
          bg: 'bg-rose-500/10',
          border: 'border-rose-500/30',
          text: 'text-rose-400',
          badgeBg: 'bg-rose-500',
          icon: AlertOctagon,
          label: 'CAUTION',
        };
    }
  };

  // Dynamic Comprehensive Explanation
  const getEvaluationContextMessage = () => {
    if (isScoreUnavailable) {
      return 'Quantitative score is unavailable due to missing or unverified upstream market/fundamental statements.';
    }

    const fundFormatted = isEtf
      ? 'Fundamental N/A (ETF)'
      : isFundUnavailable
      ? 'Fundamental Unavailable'
      : `${fundamentalScore.toFixed(1)}/50 Fundamental`;

    const techFormatted = isTechUnavailable
      ? 'Technical Unavailable'
      : `${technicalScore.toFixed(1)}/50 Technical`;

    // 1. Safety Gate / Quarantine Triggered
    if (zoneReason?.includes('INSTITUTIONAL_SAFETY_GATE') || zoneReason?.includes('QUARANTINED') || zoneReason?.includes('PROMOTER_PLEDGE')) {
      return `Score: ${displayScore.toFixed(1)}/100 (${fundFormatted} + ${techFormatted}). Final status is capped at HOLD due to active institutional safety gate: ${zoneReason}.`;
    }

    // 2. Fundamental Floor Failed (Score >= 68 or high technical momentum but Fundamental < 25)
    if (floorFailed || (displayScore >= 68 && fundamentalScore < 25 && !isEtf && !isFundUnavailable)) {
      return `Score: ${displayScore.toFixed(1)}/100 (${fundFormatted} + ${techFormatted}). Technical strength is high (${technicalScore.toFixed(1)}/50), but Fundamental Score is ${fundamentalScore.toFixed(1)}/50, below the required 25/50 floor. Final status: HOLD.`;
    }

    // 3. FAVORABLE Zone (Score >= 68 and Fund >= 25)
    if (displayZone === 'FAVORABLE') {
      return `Score: ${displayScore.toFixed(1)}/100 (${fundFormatted} + ${techFormatted}). Confluent fundamental quality (≥25/50) and institutional momentum qualify for FAVORABLE status.`;
    }

    // 4. HOLD Zone (39 <= CoreScore < 68)
    if (displayZone === 'HOLD') {
      if (technicalScore >= 34 && fundamentalScore < 25 && !isEtf && !isFundUnavailable) {
        return `Score: ${displayScore.toFixed(1)}/100 (${fundFormatted} + ${techFormatted}). Technical strength is high (${technicalScore.toFixed(1)}/50), but Fundamental Score is ${fundamentalScore.toFixed(1)}/50, below the required 25/50 floor. Score remains in the 39–67 corridor. Final status: HOLD.`;
      }
      return `Score: ${displayScore.toFixed(1)}/100 (${fundFormatted} + ${techFormatted}). Score is within the 39–67 neutral consolidation zone. Final status: HOLD.`;
    }

    // 5. CAUTION Zone (< 39)
    return `Score: ${displayScore.toFixed(1)}/100 (${fundFormatted} + ${techFormatted}). Score is below the 39.0 threshold in the caution zone. Final status: CAUTION.`;
  };

  const zoneStyle = getZoneStyle(displayZone);
  const ZoneIcon = zoneStyle.icon;
  const evaluationMessage = getEvaluationContextMessage();

  return (
    <div className="rounded-xl border border-[#1e293b] bg-[#111827] p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1e293b]/70 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
              Quantitative Score
            </span>
          </div>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-4xl font-extrabold font-mono text-white tabular-nums tracking-tight">
              {isScoreUnavailable ? '—' : displayScore.toFixed(1)}
            </span>
            <span className="text-sm font-semibold text-slate-500">/ 100</span>
          </div>
        </div>

        {/* Zone Badge */}
        <div className="flex flex-wrap items-center gap-3">
          {isScoreUnavailable ? (
            <div className="flex items-center gap-2 rounded-lg border px-4 py-2 bg-slate-800/40 border-slate-700/50">
              <AlertOctagon className="h-5 w-5 text-slate-400" />
              <div>
                <div className="text-sm font-extrabold tracking-wide text-slate-300">
                  DATA UNAVAILABLE
                </div>
                <div className="text-[11px] text-slate-400">
                  Required market or fundamental inputs unavailable
                </div>
              </div>
            </div>
          ) : (
            <div className={`flex items-center gap-2 rounded-lg border px-4 py-2 ${zoneStyle.bg} ${zoneStyle.border}`}>
              <ZoneIcon className={`h-5 w-5 ${zoneStyle.text}`} />
              <div>
                <div className={`text-sm font-extrabold tracking-wide ${zoneStyle.text}`}>
                  {zoneStyle.label}
                </div>
                <div className="text-[11px] text-slate-400">
                  {displayZone === 'FAVORABLE'
                    ? 'Strong Quality & Momentum'
                    : displayZone === 'HOLD'
                    ? 'Neutral / Wait for Setup'
                    : 'High Risk / Capital Preservation'}
                </div>
              </div>
            </div>
          )}

          {archetype && (
            <div
              className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2"
              title={archetypeDescription || `Profile: ${formatArchetype(archetype)}`}
            >
              <div>
                <span className="text-xs font-bold tracking-tight text-indigo-200">
                  {formatArchetype(archetype)}
                </span>
                <div className="text-[11px] text-slate-400 font-sans whitespace-normal">
                  {archetypeDescription || 'Macro Relationship Profile'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dual Axis Progress Split */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Fundamental Axis (0-50) */}
        <div className="rounded-lg border border-[#1e293b] bg-[#0b0f19] p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="flex items-center gap-1.5 font-semibold text-slate-300">
              <Landmark className="h-4 w-4 text-cyan-400" />
              Fundamental Score
            </span>
            <span className="font-mono font-bold text-cyan-400 tabular-nums">
              {isEtf ? (
                <span
                  className="text-amber-400 text-xs font-semibold cursor-help"
                  title="Fundamental analysis is not applicable to index/commodity ETFs. This score uses technical analysis only."
                >
                  NOT APPLICABLE
                </span>
              ) : isFundUnavailable ? (
                <span className="text-amber-400 text-xs font-semibold uppercase">
                  UNAVAILABLE
                </span>
              ) : (
                <>
                  {fundamentalScore.toFixed(1)} <span className="text-slate-500 text-[11px]">/ 50</span>
                </>
              )}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full transition-all duration-500 ${isEtf || isFundUnavailable ? 'bg-amber-500/40' : 'bg-cyan-500'}`}
              style={{ width: isEtf ? '100%' : isFundUnavailable ? '0%' : `${Math.min(100, (fundamentalScore / 50) * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between items-center text-[11px] text-slate-500 font-mono">
            <span>{isEtf ? 'Asset Type: ETF' : isFundUnavailable ? 'Status: UNAVAILABLE' : 'Minimum Floor: 25.0'}</span>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <span className={isEtf ? 'text-amber-400 font-semibold cursor-help' : isFundUnavailable ? 'text-amber-400 font-semibold' : fundamentalScore >= 25 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'} title={isEtf ? 'Fundamental analysis is not applicable to index/commodity ETFs. This score uses technical analysis only.' : undefined}>
                {isEtf ? 'ETF — Technical-only score; Fundamental not applicable' : isFundUnavailable ? 'Fundamentals Unavailable' : fundamentalScore >= 25 ? 'Floor Passed' : 'Floor Breached'}
              </span>
              {!isEtf && !isFundUnavailable && fundamentalScore < 25 && zeroDragFactors.length > 0 && (
                <span className="rounded bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.2 text-[10px] font-mono text-rose-300 font-normal">
                  Top Drag: {zeroDragFactors.join(', ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Technical Axis (0-50) */}
        <div className="rounded-lg border border-[#1e293b] bg-[#0b0f19] p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="flex items-center gap-1.5 font-semibold text-slate-300">
              <TrendingUp className="h-4 w-4 text-indigo-400" />
              Technical Score
            </span>
            <span className="font-mono font-bold text-indigo-400 tabular-nums">
              {isTechUnavailable ? (
                <span className="text-amber-400 text-xs font-semibold uppercase">
                  UNAVAILABLE
                </span>
              ) : (
                <>
                  {technicalScore.toFixed(1)} <span className="text-slate-500 text-[11px]">/ 50</span>
                </>
              )}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full transition-all duration-500 ${isTechUnavailable ? 'bg-amber-500/40' : 'bg-indigo-500'}`}
              style={{ width: isTechUnavailable ? '0%' : `${Math.min(100, (technicalScore / 50) * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-500 font-mono">
            <span>Strong Momentum Threshold: 34.0</span>
            <span className={technicalScore >= 34 ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
              {technicalScore >= 34 ? 'Strong Momentum' : 'Sub-Threshold'}
            </span>
          </div>
        </div>
      </div>

      {/* Institutional Assessment Synthesis */}
      <div className={`mt-4 rounded-lg border px-4 py-3 text-xs ${isScoreUnavailable ? 'border-slate-700/40 bg-slate-800/20' : 'border-indigo-500/20 bg-indigo-500/5'}`}>
        <div className="flex items-center gap-2 mb-1">
          <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
          <span className="font-semibold text-indigo-300 font-mono text-[11px] uppercase tracking-wide">
            Model Assessment
          </span>
        </div>
        <p className="text-slate-300 leading-relaxed font-sans text-xs">
          {evaluationMessage}
        </p>
      </div>
    </div>
  );
};
