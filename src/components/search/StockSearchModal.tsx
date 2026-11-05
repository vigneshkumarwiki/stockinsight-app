import React, { useState, useEffect, useRef, useTransition } from 'react';
import { StockSearchResult } from '../../types/portfolio';
import { SearchService } from '../../api/searchService';
import { Search, X, ArrowRight, PlusCircle, Command, AlertCircle, RefreshCw } from 'lucide-react';

interface StockSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStock: (symbol: string, isin?: string, instrumentKey?: string) => void;
  onAddToPortfolio: (inst: StockSearchResult) => void;
}

export const StockSearchModal: React.FC<StockSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectStock,
  onAddToPortfolio,
}) => {
  const [query, setQuery] = useState('');
  const [exchangeFilter, setExchangeFilter] = useState<'ALL' | 'NSE' | 'BSE'>('ALL');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [indexDiag, setIndexDiag] = useState<{ source: string; totalCount: number; status: string }>({
    source: '',
    totalCount: 0,
    status: 'READY',
  });
  const [isPending, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRequestIdRef = useRef<number>(0);

  // Initialize and load diagnostic info when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setIsLoading(true);
      const reqId = ++latestRequestIdRef.current;

      SearchService.init()
        .then(() => SearchService.search('', 15, exchangeFilter))
        .then((res) => {
          if (reqId === latestRequestIdRef.current) {
            setResults(res);
            setIsLoading(false);
            setIndexDiag(SearchService.getDiagnosticInfo());
          }
        })
        .catch(() => {
          if (reqId === latestRequestIdRef.current) {
            setResults([]);
            setIsLoading(false);
            setIndexDiag(SearchService.getDiagnosticInfo());
          }
        });

      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced asynchronous search with exchange filtering and duplicate prevention
  useEffect(() => {
    if (!isOpen) return;

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const currentReqId = ++latestRequestIdRef.current;
    setIsLoading(true);

    searchDebounceRef.current = setTimeout(() => {
      SearchService.search(query, 20, exchangeFilter)
        .then((res) => {
          if (currentReqId === latestRequestIdRef.current) {
            startTransition(() => {
              setResults(res);
              setSelectedIndex(0);
              setIsLoading(false);
              setIndexDiag(SearchService.getDiagnosticInfo());
            });
          }
        })
        .catch(() => {
          if (currentReqId === latestRequestIdRef.current) {
            startTransition(() => {
              setResults([]);
              setSelectedIndex(0);
              setIsLoading(false);
              setIndexDiag(SearchService.getDiagnosticInfo());
            });
          }
        });
    }, 150);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [query, exchangeFilter, isOpen]);

  // Scroll active item into view
  useEffect(() => {
    if (listContainerRef.current) {
      const activeEl = listContainerRef.current.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Keyboard navigation (Arrow keys, Enter, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          results.length > 0 ? (prev - 1 + results.length) % results.length : 0
        );
      } else if (e.key === 'Enter') {
        if (results.length > 0 && results[selectedIndex]) {
          e.preventDefault();
          const target = results[selectedIndex];
          onSelectStock(target.symbol, target.isin, target.instrumentKey);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose, onSelectStock]);

  if (!isOpen) return null;

  // Helper to highlight matching text
  const highlightMatch = (text: string, queryStr: string) => {
    if (!queryStr.trim()) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${queryStr.replace(/[^a-zA-Z0-9]/g, '\\$&')})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === queryStr.toLowerCase() ? (
            <mark key={i} className="bg-indigo-500/30 text-indigo-300 font-bold rounded-xs px-0.5">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 p-4 pt-16 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-[#1e293b] bg-[#0f172a] shadow-2xl overflow-hidden font-sans flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Stock search and instrument discovery"
      >
        {/* Search Input Bar */}
        <div className="flex items-center border-b border-[#1e293b] px-4 py-3 bg-[#0b0f19]">
          <Search className="h-5 w-5 text-indigo-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all NSE & BSE equities by Symbol, Company Name, or ISIN..."
            aria-label="Search instruments"
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none font-mono"
          />
          {isLoading && (
            <RefreshCw className="h-4 w-4 text-indigo-400 animate-spin mr-2 shrink-0" />
          )}
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="rounded p-1 text-slate-400 hover:text-white mr-1"
              aria-label="Clear search query"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1 rounded border border-[#1e293b] bg-[#1e293b]/50 px-1.5 py-0.5 text-[10px] text-slate-400 font-mono">
              <Command className="h-3 w-3" />
              <span>ESC</span>
            </div>
          )}
        </div>

        {/* Filter bar: Exchange tabs & Index health */}
        <div className="flex items-center justify-between border-b border-[#1e293b] bg-[#0d1424] px-4 py-2 text-xs">
          <div className="flex items-center gap-1 font-mono text-[11px]">
            <span className="text-slate-500 mr-1">Exchange:</span>
            {(['ALL', 'NSE', 'BSE'] as const).map((ex) => (
              <button
                key={ex}
                onClick={() => setExchangeFilter(ex)}
                className={`rounded px-2 py-0.5 font-bold transition-colors ${
                  exchangeFilter === ex
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:bg-[#1e293b] hover:text-slate-200'
                }`}
              >
                {ex}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400">
            {indexDiag.status === 'DEGRADED' ? (
              <span className="flex items-center gap-1 text-amber-400" title="Authoritative curated fallback active">
                <AlertCircle className="h-3 w-3" />
                <span>Curated Master ({indexDiag.totalCount.toLocaleString()})</span>
              </span>
            ) : (
              <span className="text-emerald-400">
                Universe: {indexDiag.totalCount.toLocaleString()} Instruments
              </span>
            )}
          </div>
        </div>

        {/* Results List */}
        <div ref={listContainerRef} className="flex-1 overflow-y-auto divide-y divide-[#1e293b]/40 p-2">
          {results.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs font-mono">
              {query ? (
                <div>
                  <div className="text-slate-300 font-bold mb-1">No matching instruments found</div>
                  <div>No stocks match &quot;{query}&quot; on {exchangeFilter === 'ALL' ? 'NSE/BSE' : exchangeFilter}.</div>
                  <div className="text-[10px] text-slate-500 mt-2">
                    Tip: Try searching by trading symbol, company name, or 12-digit ISIN.
                  </div>
                </div>
              ) : (
                'Type a symbol or company name to search the universe.'
              )}
            </div>
          ) : (
            results.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const isBSE = item.exchange === 'BSE';

              return (
                <div
                  key={item.instrumentKey || `${item.exchange}_${item.symbol}_${idx}`}
                  data-index={idx}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between rounded-xl px-4 py-2.5 cursor-pointer transition-colors ${
                    isSelected ? 'bg-indigo-600/20 border border-indigo-500/40' : 'hover:bg-[#182234]'
                  }`}
                >
                  {/* Symbol & Company */}
                  <div
                    className="flex-1 min-w-0 pr-4"
                    onClick={() => {
                      onSelectStock(item.symbol, item.isin, item.instrumentKey);
                      onClose();
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-mono text-sm tracking-wide">
                        {highlightMatch(item.symbol, query)}
                      </span>

                      {/* Exchange Badge */}
                      <span
                        className={`rounded px-1.5 py-0.2 text-[9px] font-bold font-mono uppercase tracking-wider ${
                          isBSE
                            ? 'bg-amber-950/60 border border-amber-700/60 text-amber-300'
                            : 'bg-blue-950/60 border border-blue-700/60 text-blue-300'
                        }`}
                      >
                        {item.exchange || 'NSE'}
                      </span>

                      {/* Series/Type Badge */}
                      {item.instrumentType && item.instrumentType !== 'EQ' && (
                        <span className="rounded bg-slate-800 border border-slate-700 px-1 py-0.2 text-[9px] text-slate-400 font-mono">
                          {item.instrumentType}
                        </span>
                      )}

                      {/* Sector */}
                      {item.sector && (
                        <span className="hidden sm:inline rounded bg-slate-800/60 border border-slate-700/60 px-1.5 py-0.2 text-[9px] text-slate-400 font-sans truncate max-w-[150px]">
                          {item.sector}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 truncate mt-0.5">
                      {highlightMatch(item.name, query)}
                    </div>
                  </div>

                  {/* Price & Action Buttons */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right font-mono">
                      {item.lastPrice > 0 ? (
                        <div className="text-xs font-bold text-white">₹{item.lastPrice.toFixed(2)}</div>
                      ) : (
                        <div className="text-xs text-slate-500 font-mono">Market LTP</div>
                      )}
                      <div className="text-[9px] text-slate-500" title={item.instrumentKey}>
                        {item.isin || item.instrumentKey}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        onAddToPortfolio(item);
                        onClose();
                      }}
                      className="flex items-center gap-1 rounded-lg border border-[#1e293b] bg-[#111827] px-2.5 py-1.5 text-xs text-slate-300 hover:border-indigo-500 hover:text-white transition-colors"
                      title="Add directly to your portfolio"
                      aria-label={`Add ${item.symbol} to portfolio`}
                    >
                      <PlusCircle className="h-3.5 w-3.5 text-indigo-400" />
                      <span className="hidden sm:inline">Add</span>
                    </button>

                    <button
                      onClick={() => {
                        onSelectStock(item.symbol, item.isin, item.instrumentKey);
                        onClose();
                      }}
                      className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
                      title="Inspect detailed quantitative deep dive"
                      aria-label={`Inspect ${item.symbol} deep dive`}
                    >
                      <span>Deep Dive</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info strip */}
        <div className="flex items-center justify-between border-t border-[#1e293b] bg-[#0b0f19] px-4 py-2.5 text-[11px] text-slate-500 font-mono">
          <div className="flex items-center gap-3">
            <span>&uarr;&darr; to navigate</span>
            <span>&crarr; to inspect</span>
            <span>ESC to close</span>
          </div>
          <div className="flex items-center gap-2">
            <span>IndexedDB + Upstox Master</span>
          </div>
        </div>
      </div>
    </div>
  );
};
