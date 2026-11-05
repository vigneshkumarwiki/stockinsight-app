import React from 'react';
import { Filter, ArrowUpDown, Search, X } from 'lucide-react';

export type PortfolioFilterType = 'ALL' | 'ATTENTION' | 'FAVORABLE' | 'HOLD' | 'CAUTION' | 'UNAVAILABLE';
export type PortfolioSortType =
  | 'VALUE_DESC'
  | 'VALUE_ASC'
  | 'PNL_DESC'
  | 'PNL_ASC'
  | 'SCORE_DESC'
  | 'SCORE_ASC'
  | 'SYMBOL_ASC'
  | 'DAY_CHANGE_DESC'
  | 'STOP_PROXIMITY_ASC';

interface PortfolioFilterBarProps {
  activeFilter: PortfolioFilterType;
  onSelectFilter: (filter: PortfolioFilterType) => void;
  activeSector: string;
  onSelectSector: (sector: string) => void;
  sectors: string[];
  activeSort: PortfolioSortType;
  onSelectSort: (sort: PortfolioSortType) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  counts: {
    total: number;
    attention: number;
    favorable: number;
    hold: number;
    caution: number;
    unavailable: number;
  };
}

export const PortfolioFilterBar: React.FC<PortfolioFilterBarProps> = ({
  activeFilter,
  onSelectFilter,
  activeSector,
  onSelectSector,
  sectors,
  activeSort,
  onSelectSort,
  searchQuery,
  onSearchChange,
  counts,
}) => {
  const filterChips: Array<{ id: PortfolioFilterType; label: string; count: number; colorClass: string }> = [
    { id: 'ALL', label: 'All Holdings', count: counts.total, colorClass: 'text-slate-300' },
    {
      id: 'ATTENTION',
      label: 'Requires Attention',
      count: counts.attention,
      colorClass: counts.attention > 0 ? 'text-rose-400' : 'text-slate-400',
    },
    { id: 'FAVORABLE', label: 'Favorable', count: counts.favorable, colorClass: 'text-emerald-400' },
    { id: 'HOLD', label: 'Hold / Neutral', count: counts.hold, colorClass: 'text-amber-400' },
    { id: 'CAUTION', label: 'Caution', count: counts.caution, colorClass: 'text-rose-400' },
  ];

  if (counts.unavailable > 0) {
    filterChips.push({
      id: 'UNAVAILABLE',
      label: 'Unquoted',
      count: counts.unavailable,
      colorClass: 'text-slate-400',
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1e293b] bg-[#111827]/90 p-3 text-xs shadow-sm">
      {/* 1. Filter Chips */}
      <div className="flex flex-wrap items-center gap-1.5 font-mono">
        <div className="flex items-center gap-1.5 text-slate-500 mr-1 text-[11px] font-semibold uppercase tracking-wider">
          <Filter className="h-3 w-3" />
          <span className="hidden sm:inline">Filter:</span>
        </div>
        {filterChips.map((chip) => {
          const isActive = activeFilter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => onSelectFilter(chip.id)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400/50'
                  : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-[#1e293b]'
              }`}
            >
              <span>{chip.label}</span>
              <span
                className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                  isActive
                    ? 'bg-indigo-950/80 text-white'
                    : 'bg-slate-800 text-slate-400 border border-slate-700/60'
                }`}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 2. Dropdown Controls & Inline Search: Search, Sector & Sort */}
      <div className="flex flex-wrap items-center gap-2 font-mono ml-auto">
        {/* Inline Search Input */}
        {onSearchChange && (
          <div className="relative flex items-center min-w-[140px] max-w-[200px]">
            <Search className="absolute left-2.5 h-3 w-3 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter symbol/name..."
              className="w-full rounded-lg border border-[#1e293b] bg-slate-900 pl-7 pr-6 py-1 text-xs text-slate-200 placeholder-slate-500 hover:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors font-sans"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 text-slate-500 hover:text-slate-300"
                title="Clear filter"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Sector Filter */}
        {sectors.length > 1 && (
          <div className="flex items-center gap-1.5">
            <select
              value={activeSector}
              onChange={(e) => onSelectSector(e.target.value)}
              className="rounded-lg border border-[#1e293b] bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            >
              <option value="ALL">All Sectors ({sectors.length})</option>
              {sectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sort Dropdown */}
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3 w-3 text-slate-500" />
          <select
            value={activeSort}
            onChange={(e) => onSelectSort(e.target.value as PortfolioSortType)}
            className="rounded-lg border border-[#1e293b] bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
          >
            <option value="VALUE_DESC">Current Value ↓ (High-Low)</option>
            <option value="VALUE_ASC">Current Value ↑ (Low-High)</option>
            <option value="DAY_CHANGE_DESC">Today's Change % ↓ (High-Low)</option>
            <option value="STOP_PROXIMITY_ASC">Stop Proximity ↑ (Closest First)</option>
            <option value="PNL_DESC">Unrealized P&amp;L ↓ (Highest Gain)</option>
            <option value="PNL_ASC">Unrealized P&amp;L ↑ (Lowest / Loss)</option>
            <option value="SCORE_DESC">Core Score ↓ (Best Quality)</option>
            <option value="SCORE_ASC">Core Score ↑ (Lowest Quality)</option>
            <option value="SYMBOL_ASC">Symbol (A &rarr; Z)</option>
          </select>
        </div>
      </div>
    </div>
  );
};
