import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { UpstoxClient, UpstoxApiError } from './api/upstoxClient';
import { SearchService } from './api/searchService';
import { StockInsightPipeline } from './engine';
import { PortfolioEngine } from './engine/portfolioEngine';
import { StockInsightEvaluation } from './types/engine';
import { Holding, HoldingWithEvaluation, StockSearchResult } from './types/portfolio';
import { TerminalHeader, AppViewMode } from './components/TerminalHeader';
import { DeepDiveHeader } from './components/DeepDiveHeader';
import { TrajectoryRibbon } from './components/TrajectoryRibbon';
import { ScoreGauge } from './components/ScoreGauge';
import { ExecutionCard } from './components/ExecutionCard';
import { PositionCard } from './components/PositionCard';
import { PriceStructureCard } from './components/PriceStructureCard';
import { SafetyAlerts } from './components/SafetyAlerts';
import { FactorTable } from './components/FactorTable';
import { AttributionInspector } from './components/AttributionInspector';
import { DataIntegrityBanner } from './components/DataIntegrityBanner';
import { PortfolioSummaryStrip } from './components/portfolio/PortfolioSummaryStrip';
import { RiskRadarBanner } from './components/portfolio/RiskRadarBanner';
import { PortfolioFilterBar, PortfolioFilterType, PortfolioSortType } from './components/portfolio/PortfolioFilterBar';
import { HoldingsTable } from './components/portfolio/HoldingsTable';
import { AddHoldingModal } from './components/portfolio/AddHoldingModal';
import { ImportHoldingsModal } from './components/portfolio/ImportHoldingsModal';
import { StockSearchModal } from './components/search/StockSearchModal';
import { AlertCircle, AlertTriangle, AlertOctagon, Activity, ArrowLeft, Upload } from 'lucide-react';
import { SnapshotStore } from './services/snapshotStore';
import { SnapshotSerializer } from './engine/snapshotSerializer';
import { SessionResolver } from './engine/sessionResolver';
import { QualityTiltEngine, QualityTiltGroupKey } from './engine/qualityTiltEngine';
import { normalizeSectorName } from './engine/portfolioEngine';
import { ContextInputAdapter, PositionContextAdapter } from './engine/contextAdapters';
import { evaluateRelationship } from './engine/contextRelationships';
import {
  classifyFundamentalCondition,
  classifyTechnicalCondition,
  classifyValuationCondition,
  classifyMomentumCondition,
  classifyPriceLocation,
} from './engine/contextClassifiers';
import { evaluateAttention } from './engine/contextAttention';
import { evaluateHeadline } from './engine/contextHeadline';
import { evaluateWhatChanged } from './engine/contextWhatChanged';
import { SAMPLE_BENCHMARK_PORTFOLIO } from './data/samplePortfolio';

const upstoxClient = new UpstoxClient();
const HOLDINGS_STORAGE_KEY = 'stockinsight_holdings_v2';

export interface UpstoxLiveFeedWarning {
  status?: number;
  message: string;
  endpoint?: string;
  symbol?: string;
  dataSource?: 'UPSTOX_LIVE' | 'OFFLINE_MOCK';
}

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppViewMode>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view');
      if (viewParam === 'deep-dive' || viewParam === 'DEEP_DIVE') {
        return 'DEEP_DIVE';
      }
    }
    return 'PORTFOLIO_HUB';
  });

  const [selectedSymbol, setSelectedSymbol] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const symParam = params.get('symbol') || params.get('stock');
      if (symParam && symParam.trim().length > 0) {
        return symParam.trim().toUpperCase();
      }
    }
    return 'RELIANCE';
  });

  const selectedSymbolRef = useRef(selectedSymbol);
  const activeSelectionIdRef = useRef<number>(0);
  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
  }, [selectedSymbol]);

  // URL search parameter synchronization
  useEffect(() => {
    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      const url = new URL(window.location.href);
      if (activeView === 'DEEP_DIVE') {
        url.searchParams.set('view', 'deep-dive');
        url.searchParams.set('symbol', selectedSymbol);
      } else {
        url.searchParams.delete('view');
        url.searchParams.delete('symbol');
        url.searchParams.delete('stock');
      }
      window.history.replaceState(null, '', url.toString());
    }
  }, [selectedSymbol, activeView]);

  // Reset window scroll to the top whenever navigating into Deep Dive or switching stocks
  useEffect(() => {
    if (activeView === 'DEEP_DIVE') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [activeView, selectedSymbol]);

  // Browser back/forward popstate handling
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const viewParam = params.get('view');
        const symParam = params.get('symbol') || params.get('stock');
        if (viewParam === 'deep-dive' && symParam) {
          handleSelectStock(symParam.trim().toUpperCase());
        } else {
          setActiveView('PORTFOLIO_HUB');
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  const [evaluation, setEvaluation] = useState<StockInsightEvaluation | null>(null);
  const [evaluationsCache, setEvaluationsCache] = useState<Map<string, StockInsightEvaluation>>(new Map());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiWarning, setApiWarning] = useState<UpstoxLiveFeedWarning | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(() => upstoxClient.hasToken());
  const [connectionStatus, setConnectionStatus] = useState<import('./components/TerminalHeader').UpstoxConnectionStatus>(() => {
    return upstoxClient.hasToken() ? 'CONFIGURED_UNVERIFIED' : 'UNCONFIGURED';
  });
  const [refreshingSymbols, setRefreshingSymbols] = useState<Set<string>>(new Set());

  // Modals state
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);

  // Portfolio filter & sort state (persisted across HOME <-> DEEP_DIVE navigation)
  const [portfolioFilter, setPortfolioFilter] = useState<PortfolioFilterType>('ALL');
  const [portfolioSector, setPortfolioSector] = useState<string>('ALL');
  const [portfolioSort, setPortfolioSort] = useState<PortfolioSortType>('VALUE_DESC');
  const [activeTiltFilter, setActiveTiltFilter] = useState<QualityTiltGroupKey | null>(null);
  const [activeClusterFilter, setActiveClusterFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Holdings state with localStorage persistence and automatic data integrity healing
  const [holdings, setHoldings] = useState<Holding[]>(() => {
    try {
      const saved = localStorage.getItem(HOLDINGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((h: Holding) => {
            if (h.symbol.toUpperCase() === 'GOLDBEES') {
              return {
                ...h,
                isin: 'INF204KB17I5',
                averageBuyPrice: h.averageBuyPrice === 1000 ? 125.0 : h.averageBuyPrice,
              };
            }
            if (h.symbol.toUpperCase() === 'DRREDDY') {
              return {
                ...h,
                isin: 'INE089A01031',
              };
            }
            if (h.symbol.toUpperCase() === 'FINCABLES') {
              return {
                ...h,
                isin: 'INE235A01022',
              };
            }
            if (h.symbol.toUpperCase() === 'ITCHOTELS') {
              return {
                ...h,
                isin: 'INE379A01028',
              };
            }
            if (h.symbol.toUpperCase() === 'ITBEES') {
              return {
                ...h,
                isin: 'INF204KB15V2',
              };
            }
            return h;
          });
        }
      }
    } catch {
      // Fallback
    }
    return [];
  });

  const holdingsRef = useRef(holdings);
  useEffect(() => {
    holdingsRef.current = holdings;
  }, [holdings]);

  // Save holdings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(HOLDINGS_STORAGE_KEY, JSON.stringify(holdings));
    } catch {
      // Handle storage quota issues gracefully
    }
  }, [holdings]);

  // Global shortcuts: CMD+K / Ctrl+K for search, Escape to return to Portfolio Hub
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        // If search or modals are open, let them handle escape first
        if (isSearchOpen || isAddModalOpen || isImportModalOpen) {
          return;
        }
        // If in DEEP_DIVE, return to PORTFOLIO_HUB
        setActiveView((current) => (current === 'DEEP_DIVE' ? 'PORTFOLIO_HUB' : current));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, isAddModalOpen, isImportModalOpen]);

  // Run evaluation for a symbol
  const runEvaluation = useCallback(
    async (symbol: string, isin?: string): Promise<StockInsightEvaluation | null> => {
      const upper = symbol.toUpperCase().trim();
      try {
        const data = await upstoxClient.getEvaluationData(upper, isin);
        const result = StockInsightPipeline.evaluate(data, upper);

        // Guideline: Never silently catch API failures (401/403/500) to return static mock fixtures
        // without explicitly setting a dataSource: 'OFFLINE_MOCK' flag and displaying a warning UI banner.
        if (result.dataSource === 'OFFLINE_MOCK' && result.dataSourceError) {
          const is401 = result.dataSourceError.includes('401');
          const is403 = result.dataSourceError.includes('403');
          const is500 = result.dataSourceError.includes('500');
          setApiWarning({
            status: is401 ? 401 : is403 ? 403 : is500 ? 500 : undefined,
            endpoint: '/v2/market-quote/quotes',
            message: result.dataSourceError,
            symbol: upper,
            dataSource: 'OFFLINE_MOCK',
          });
        }

        // Persist Snapshot & Bridge What Changed
        try {
          const contextInput = ContextInputAdapter.fromEvaluation(result);
          const currentHoldings = holdingsRef.current;
          const matchedHolding = currentHoldings.find(
            (h) =>
              h.symbol.toUpperCase() === upper ||
              (h.isin && result.isin && h.isin.toUpperCase() === result.isin.toUpperCase())
          );
          const positionInput = PositionContextAdapter.fromHoldingWithEvaluation(
            matchedHolding
              ? ({
                  ...matchedHolding,
                  currentLtp: result.execution.ltp ?? null,
                  quoteStatus: result.execution.ltp !== null && result.execution.ltp !== undefined ? 'RESOLVED' : 'UNAVAILABLE',
                } as any)
              : null
          );
          const fundCondition = classifyFundamentalCondition(contextInput);
          const techCondition = classifyTechnicalCondition(contextInput);
          const valCondition = classifyValuationCondition(contextInput);
          const momCondition = classifyMomentumCondition(contextInput);
          const relationship = evaluateRelationship(fundCondition, techCondition);
          const priceLoc = classifyPriceLocation(contextInput);
          const attention = evaluateAttention(contextInput, positionInput, relationship, priceLoc);
          const isETF = contextInput.isETF;
          const headline = evaluateHeadline(relationship, attention, isETF);
          const sessionRes = SessionResolver.resolve();

          // Query previous session snapshot
          const prevSnapshot = await SnapshotStore.getPreviousSnapshot(
            contextInput.isin,
            sessionRes.tradingSessionId
          );
          if (prevSnapshot) {
            const prevContextEval = SnapshotSerializer.toContextEvaluation(prevSnapshot);
            const currentContextEval = {
              fundamental_condition: fundCondition,
              technical_condition: techCondition,
              valuation_condition: valCondition,
              momentum_condition: momCondition,
              momentum_state: contextInput.momentum.state,
              price_location: priceLoc,
              position: {
                is_held: positionInput.is_held,
                context: positionInput.is_held
                  ? positionInput.pnlPct !== null && positionInput.pnlPct >= 10
                    ? 'STRONGLY_APPRECIATED'
                    : positionInput.pnlPct !== null && positionInput.pnlPct > 1.5
                    ? 'PROFITABLE'
                    : positionInput.pnlPct !== null && positionInput.pnlPct >= -1.5
                    ? 'NEAR_BREAKEVEN'
                    : positionInput.pnlPct !== null && positionInput.pnlPct >= -8
                    ? 'LOSS'
                    : 'SIGNIFICANT_LOSS'
                  : null,
                pnlPct: positionInput.pnlPct,
                averageBuyPrice: positionInput.averageBuyPrice,
              },
              attention_level: attention.level,
              modifiers: headline.overrideBadge ? [headline.overrideBadge] : [],
            };

            evaluateWhatChanged(
              currentContextEval as any,
              prevContextEval,
              result.coreScore,
              prevSnapshot.coreScore
            );
          }

          // Save active evaluation snapshot to IndexedDB
          const snapshot = SnapshotSerializer.serialize({
            evaluation: result,
            contextInput,
            attentionResult: attention,
            headlineResult: headline,
            holding: matchedHolding || null,
            tradingSessionId: sessionRes.tradingSessionId,
            sessionState: sessionRes.marketSessionState,
          });
          await SnapshotStore.saveSnapshot(snapshot);
        } catch (snapErr) {
          console.warn(`[Snapshot Persistence Note] Failed to persist snapshot for ${upper}:`, snapErr);
        }

        setEvaluationsCache((prev) => {
          const next = new Map(prev);
          next.set(upper, result);
          if (result.tradingSymbol) {
            next.set(result.tradingSymbol.toUpperCase(), result);
          }
          if (result.isin) {
            next.set(result.isin.toUpperCase(), result);
          }
          return next;
        });
        return result;
      } catch (err: unknown) {
        const errObj = err as any;
        console.error(`[Upstox Live Pipeline Error] Failed to evaluate ${upper}:`, errObj);

        const status =
          errObj instanceof UpstoxApiError
            ? errObj.status
            : errObj?.status ||
              (errObj?.message?.includes('401')
                ? 401
                : errObj?.message?.includes('403')
                ? 403
                : errObj?.message?.includes('Network')
                ? 0
                : undefined);

        const endpoint =
          errObj instanceof UpstoxApiError
            ? errObj.endpoint
            : errObj?.endpoint || '/v2/market-quote/quotes';

        const message = errObj?.message || `Failed to fetch live Upstox data for ${upper}`;

        // Surface explicit warning toast/banner on token expiry (401), unauthorized (403), or network issues (0)
        if (status === 401 || status === 403 || status === 0) {
          setConnectionStatus('ERROR');
          setApiWarning({
            status,
            endpoint,
            message,
            symbol: upper,
          });
        } else {
          setErrorMessage(message);
        }
        return null;
      }
    },
    []
  );

  // Pre-evaluate all holdings on startup or token update
  const evaluateAllHoldings = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const isinMap = new Map<string, string>();
    holdings.forEach((h) => {
      if (h.isin) isinMap.set(h.symbol.toUpperCase(), h.isin);
    });

    const symbolsToEvaluate = Array.from(
      new Set([...holdings.map((h) => h.symbol.toUpperCase()), selectedSymbolRef.current.toUpperCase()])
    );

    try {
      const results = await Promise.allSettled(
        symbolsToEvaluate.map((s) => runEvaluation(s, isinMap.get(s)))
      );
      const successfulEvals = results
        .filter(
          (r): r is PromiseFulfilledResult<StockInsightEvaluation | null> =>
            r.status === 'fulfilled' && r.value !== null
        )
        .map((r) => r.value as StockInsightEvaluation);

      const targetUpper = selectedSymbolRef.current.toUpperCase();
      const matchingEval = successfulEvals.find(
        (r) =>
          r.tradingSymbol.toUpperCase() === targetUpper ||
          (r.isin && r.isin.toUpperCase() === isinMap.get(targetUpper))
      );

      // Safe evaluation establishment:
      // STRICT RULE: Only set evaluation if it matches selectedSymbolRef.current! Never fallback to successfulEvals[0] of a different symbol!
      setEvaluation((prev) => {
        if (matchingEval) {
          return matchingEval;
        }
        if (prev && (prev.tradingSymbol.toUpperCase() === targetUpper || (prev.isin && isinMap.get(targetUpper) && prev.isin.toUpperCase() === isinMap.get(targetUpper)))) {
          return prev;
        }
        return null;
      });
    } catch (err: unknown) {
      const errObj = err as Error;
      setErrorMessage(errObj.message || 'Failed to evaluate portfolio assets');
    } finally {
      setIsLoading(false);
    }
  }, [holdings, runEvaluation]);

  useEffect(() => {
    evaluateAllHoldings();
  }, [evaluateAllHoldings]);

  // Refresh quote for an individual holding
  const handleRefreshSingleHolding = useCallback(
    async (symbol: string, isin?: string) => {
      const upper = symbol.toUpperCase().trim();
      setRefreshingSymbols((prev) => new Set(prev).add(upper));
      try {
        await runEvaluation(upper, isin);
      } finally {
        setRefreshingSymbols((prev) => {
          const next = new Set(prev);
          next.delete(upper);
          return next;
        });
      }
    },
    [runEvaluation]
  );

  const handleSaveToken = async (token: string) => {
    upstoxClient.setToken(token);
    setHasToken(true);
    setConnectionStatus('CONFIGURED_UNVERIFIED');
    setErrorMessage(null);
    setApiWarning(null);
    try {
      const connTest = await upstoxClient.testConnection(token);
      if (connTest.success) {
        setConnectionStatus('CONNECTED');
      } else {
        setConnectionStatus('ERROR');
      }
    } catch {
      setConnectionStatus('ERROR');
    }
    try {
      const liveHoldings = await upstoxClient.getHoldings();
      if (liveHoldings && liveHoldings.length > 0) {
        setHoldings(liveHoldings);
      }
    } catch (holdingsErr: unknown) {
      console.warn('[Upstox Live Holdings Note]', (holdingsErr as Error).message);
    }
    evaluateAllHoldings();
  };

  const handleClearToken = () => {
    upstoxClient.clearToken();
    setHasToken(false);
    setConnectionStatus('UNCONFIGURED');
    setErrorMessage(null);
    setApiWarning(null);
    evaluateAllHoldings();
  };

  // Add or update holding
  const handleSaveHolding = (data: Omit<Holding, 'id' | 'addedAt'>, id?: string) => {
    if (id) {
      setHoldings((prev) =>
        prev.map((h) => (h.id === id ? { ...h, ...data } : h))
      );
    } else {
      const newHolding: Holding = {
        ...data,
        id: `h_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        addedAt: new Date().toISOString(),
      };
      setHoldings((prev) => [...prev, newHolding]);
    }
    setEditingHolding(null);
  };

  // Delete holding
  const handleDeleteHolding = (id: string) => {
    setHoldings((prev) => prev.filter((h) => h.id !== id));
  };

  // Clear all holdings from portfolio
  const handleClearAllHoldings = () => {
    setHoldings([]);
    try {
      localStorage.removeItem(HOLDINGS_STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  // Open Edit Modal
  const handleEditHolding = (item: HoldingWithEvaluation) => {
    setEditingHolding(item.holding);
    setIsAddModalOpen(true);
  };

  // Add from search modal
  const handleAddToPortfolioFromSearch = (inst: StockSearchResult) => {
    setEditingHolding({
      id: '',
      symbol: inst.symbol,
      companyName: inst.name,
      sector: inst.sector,
      isin: inst.isin,
      quantity: 10,
      averageBuyPrice: inst.lastPrice,
      addedAt: new Date().toISOString(),
    });
    setIsAddModalOpen(true);
  };

  // Import holdings from broker file
  const handleImportHoldings = (imported: Holding[], mode: 'append' | 'replace') => {
    if (mode === 'replace') {
      setHoldings(imported);
    } else {
      setHoldings((prev) => {
        const existingSymbols = new Set(prev.map((h) => h.symbol.toUpperCase()));
        const newUnique = imported.filter((h) => !existingSymbols.has(h.symbol.toUpperCase()));
        return [...prev, ...newUnique];
      });
    }
  };

  // One-click demo benchmark portfolio loader
  const handleLoadDemoPortfolio = () => {
    setHoldings(SAMPLE_BENCHMARK_PORTFOLIO);
  };

  // Compute portfolio analysis using PortfolioEngine
  const { items: portfolioItems, analytics } = useMemo(() => {
    return PortfolioEngine.analyze(holdings, evaluationsCache);
  }, [holdings, evaluationsCache]);

  // Handle stock selection and view switch to Deep Dive
  const handleSelectStock = async (symbol: string, knownIsin?: string, canonicalKey?: string) => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    const requestId = ++activeSelectionIdRef.current;
    const upper = symbol.toUpperCase().trim();
    const isIsin = (s?: string) => Boolean(s && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s));

    // Resolve target symbol and target ISIN
    const instrument =
      (isIsin(upper) ? SearchService.getInstrumentByIsin(upper) : undefined) ||
      SearchService.getInstrumentBySymbol(upper) ||
      (knownIsin ? SearchService.getInstrumentByIsin(knownIsin) : undefined);

    const targetSymbol = instrument?.symbol ? instrument.symbol.toUpperCase() : upper;
    const targetIsin = (
      knownIsin && isIsin(knownIsin)
        ? knownIsin
        : instrument?.isin && isIsin(instrument.isin)
        ? instrument.isin
        : isIsin(upper)
        ? upper
        : undefined
    )?.toUpperCase();

    setSelectedSymbol(targetSymbol);
    selectedSymbolRef.current = targetSymbol;

    // 1. Primary path: Look inside existing analyzed portfolioItems
    const existingHolding = portfolioItems.find((item) => {
      const itemSym = item.holding.symbol.toUpperCase();
      const itemEvalSym = item.evaluation?.tradingSymbol.toUpperCase();
      const itemIsin = item.holding.isin?.toUpperCase();
      const itemEvalIsin = item.evaluation?.isin?.toUpperCase();

      const symbolMatch =
        itemSym === targetSymbol ||
        itemSym === upper ||
        itemEvalSym === targetSymbol ||
        itemEvalSym === upper;
      const isinMatch = Boolean(
        targetIsin && (itemIsin === targetIsin || itemEvalIsin === targetIsin)
      );

      return (symbolMatch || isinMatch) && item.evaluation && item.evaluation.tradingSymbol.toUpperCase() === targetSymbol;
    });

    if (existingHolding?.evaluation) {
      setEvaluation(existingHolding.evaluation);
      setActiveView('DEEP_DIVE');
      return;
    }

    // 2. Secondary path: Check evaluationsCache
    const cached =
      evaluationsCache.get(targetSymbol) ||
      evaluationsCache.get(upper) ||
      (targetIsin ? evaluationsCache.get(targetIsin) : undefined) ||
      Array.from(evaluationsCache.values()).find((e) => {
        const evalSym = e.tradingSymbol.toUpperCase();
        const evalIsin = e.isin?.toUpperCase();
        return (
          evalSym === targetSymbol ||
          (Boolean(targetIsin) && evalIsin === targetIsin)
        );
      });

    if (cached && cached.tradingSymbol.toUpperCase() === targetSymbol) {
      setEvaluation(cached);
      setActiveView('DEEP_DIVE');
      return;
    }

    // 3. Fallback path: Trigger live evaluation
    setEvaluation(null);
    setIsLoading(true);
    setActiveView('DEEP_DIVE');
    const holding = holdings.find((h) => {
      const hSym = h.symbol.toUpperCase();
      const hIsin = h.isin?.toUpperCase();
      return (
        hSym === targetSymbol ||
        hSym === upper ||
        (Boolean(targetIsin) && hIsin === targetIsin)
      );
    });
    const res = await runEvaluation(targetSymbol, targetIsin || holding?.isin);
    // RACE CONDITION GUARD: Only apply if this request is still the active selected stock!
    if (requestId === activeSelectionIdRef.current && selectedSymbolRef.current.toUpperCase() === targetSymbol) {
      if (res && res.tradingSymbol.toUpperCase() === targetSymbol) {
        setEvaluation(res);
      }
      setIsLoading(false);
    }
  };

  // Derived portfolio metrics & filters
  const resolvedCount = useMemo(() => {
    return portfolioItems.filter((i) => i.quoteStatus === 'RESOLVED').length;
  }, [portfolioItems]);

  // Normalized sector resolution helper
  const getNormalizedSector = (item: HoldingWithEvaluation): string => {
    return normalizeSectorName(item.holding.sector || item.evaluation?.sectorName || item.evaluation?.sector || 'Other');
  };

  const uniqueSectors = useMemo(() => {
    const sectors = new Set<string>();
    for (const item of portfolioItems) {
      sectors.add(getNormalizedSector(item));
    }
    return Array.from(sectors).sort();
  }, [portfolioItems]);

  const filterCounts = useMemo(() => {
    return {
      total: portfolioItems.length,
      attention: portfolioItems.filter(
        (i) => i.stopBreached || i.accrualTrapGain || i.actionBadge === 'QUARANTINED' || i.quoteStatus === 'UNAVAILABLE'
      ).length,
      favorable: portfolioItems.filter((i) => i.zone === 'FAVORABLE').length,
      hold: portfolioItems.filter((i) => i.zone === 'HOLD').length,
      caution: portfolioItems.filter((i) => i.zone === 'CAUTION').length,
      unavailable: portfolioItems.filter((i) => i.quoteStatus === 'UNAVAILABLE' || i.quoteStatus === 'PENDING').length,
    };
  }, [portfolioItems]);

  const tiltResult = useMemo(() => QualityTiltEngine.evaluate(portfolioItems), [portfolioItems]);

  const filteredAndSortedItems = useMemo(() => {
    let result = [...portfolioItems];

    // 1. Primary Filter
    if (portfolioFilter === 'ATTENTION') {
      result = result.filter(
        (i) => i.stopBreached || i.accrualTrapGain || i.actionBadge === 'QUARANTINED' || i.quoteStatus === 'UNAVAILABLE'
      );
    } else if (portfolioFilter === 'FAVORABLE') {
      result = result.filter((i) => i.zone === 'FAVORABLE');
    } else if (portfolioFilter === 'HOLD') {
      result = result.filter((i) => i.zone === 'HOLD');
    } else if (portfolioFilter === 'CAUTION') {
      result = result.filter((i) => i.zone === 'CAUTION');
    } else if (portfolioFilter === 'UNAVAILABLE') {
      result = result.filter((i) => i.quoteStatus === 'UNAVAILABLE' || i.quoteStatus === 'PENDING');
    }

    // 1b. Quality Tilt Bucket Filter
    if (activeTiltFilter) {
      result = result.filter((i) => {
        const priorityInfo = QualityTiltEngine.getHoldingPriority(i);
        return priorityInfo.bucketKey === activeTiltFilter;
      });
    }

    // 1c. Attention Cluster Filter
    if (activeClusterFilter) {
      result = result.filter((i) => {
        if (activeClusterFilter === 'PRICE_EXTENDED' || activeClusterFilter === 'EXTENDED' || activeClusterFilter === 'PRICE_LOCATION_EXTENDED') {
          return (
            i.evaluation?.execution.status === 'EXTENDED_WAIT_FOR_PULLBACK' ||
            Boolean(i.evaluation?.execution?.maxEntry && i.currentLtp && i.currentLtp > i.evaluation.execution.maxEntry)
          );
        }
        if (activeClusterFilter === 'NEAR_STOP') {
          if (i.stopBreached || i.currentLtp === null || i.stopLoss === null || i.currentLtp <= 0) return false;
          const buf = ((i.currentLtp - i.stopLoss) / i.currentLtp) * 100;
          return buf <= 3.0 && buf >= 0;
        }
        if (activeClusterFilter === 'STOP_BREACHED') {
          return i.stopBreached;
        }
        if (activeClusterFilter === 'ACCRUAL_TRAP') {
          return i.accrualTrapGain;
        }
        const cluster = tiltResult.driverExposures.find((d) => d.driver === activeClusterFilter);
        if (cluster) {
          return cluster.symbols.includes(i.holding.symbol.toUpperCase());
        }
        return true;
      });
    }

    // 2. Sector Filter
    if (portfolioSector !== 'ALL') {
      const targetSector = portfolioSector.trim().toUpperCase();
      result = result.filter(
        (i) => getNormalizedSector(i).toUpperCase() === targetSector
      );
    }

    // 3. Search Query Filter (Symbol or Company Name)
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (i) =>
          i.holding.symbol.toLowerCase().includes(q) ||
          i.holding.companyName.toLowerCase().includes(q)
      );
    }

    // 4. Sorting (Default: VALUE_DESC)
    result.sort((a, b) => {
      switch (portfolioSort) {
        case 'VALUE_DESC':
          return (b.currentValue ?? -Infinity) - (a.currentValue ?? -Infinity);
        case 'VALUE_ASC':
          return (a.currentValue ?? Infinity) - (b.currentValue ?? Infinity);
        case 'DAY_CHANGE_DESC':
          return (b.dayChangePercentage ?? -Infinity) - (a.dayChangePercentage ?? -Infinity);
        case 'STOP_PROXIMITY_ASC': {
          const getBuf = (item: HoldingWithEvaluation) => {
            if (item.stopBreached) return -1;
            if (item.currentLtp === null || item.stopLoss === null || item.currentLtp <= 0) return Infinity;
            return ((item.currentLtp - item.stopLoss) / item.currentLtp) * 100;
          };
          return getBuf(a) - getBuf(b);
        }
        case 'PNL_DESC':
          return (b.pnl ?? -Infinity) - (a.pnl ?? -Infinity);
        case 'PNL_ASC':
          return (a.pnl ?? Infinity) - (b.pnl ?? Infinity);
        case 'SCORE_DESC':
          return (b.coreScore ?? -Infinity) - (a.coreScore ?? -Infinity);
        case 'SCORE_ASC':
          return (a.coreScore ?? Infinity) - (b.coreScore ?? Infinity);
        case 'SYMBOL_ASC':
          return a.holding.symbol.localeCompare(b.holding.symbol);
        default:
          return 0;
      }
    });

    return result;
  }, [portfolioItems, portfolioFilter, activeTiltFilter, activeClusterFilter, portfolioSector, portfolioSort, searchQuery, tiltResult]);

  const currentHoldingItem = useMemo(() => {
    if (!evaluation) return null;
    const targetUpper = selectedSymbol.toUpperCase().trim();
    const targetIsin = evaluation.isin?.toUpperCase();
    return (
      portfolioItems.find((item) => {
        const itemSym = item.holding.symbol.toUpperCase();
        const itemEvalSym = item.evaluation?.tradingSymbol.toUpperCase();
        const itemIsin = item.holding.isin?.toUpperCase();
        const itemEvalIsin = item.evaluation?.isin?.toUpperCase();

        const symbolMatch =
          itemSym === targetUpper || itemEvalSym === targetUpper;
        const isinMatch = Boolean(
          targetIsin && (itemIsin === targetIsin || itemEvalIsin === targetIsin)
        );

        return symbolMatch || isinMatch;
      }) || null
    );
  }, [portfolioItems, selectedSymbol, evaluation]);

  // Derive relationship archetype and priority for the evaluated stock
  const activeRelationship = useMemo(() => {
    if (!evaluation) return null;
    try {
      const ci = ContextInputAdapter.fromEvaluation(evaluation);
      const fc = classifyFundamentalCondition(ci);
      const tc = classifyTechnicalCondition(ci);
      return evaluateRelationship(fc, tc);
    } catch {
      return null;
    }
  }, [evaluation]);

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      {/* Top Terminal Navigation & Controls */}
      <TerminalHeader
        currentSymbol={selectedSymbol}
        onSelectSymbol={handleSelectStock}
        evaluation={evaluation}
        hasToken={hasToken}
        connectionStatus={connectionStatus}
        onSaveToken={handleSaveToken}
        onRefresh={evaluateAllHoldings}
        isLoading={isLoading}
        activeView={activeView}
        onChangeView={setActiveView}
        holdingsCount={holdings.length}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenAddHolding={() => {
          setEditingHolding(null);
          setIsAddModalOpen(true);
        }}
        onOpenImport={() => setIsImportModalOpen(true)}
        onClearToken={handleClearToken}
        client={upstoxClient}
        onBackToPortfolio={() => setActiveView('PORTFOLIO_HUB')}
      />

      {/* Main Terminal Dashboard Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Upstox Live Feed Warning Banner for 401/403/Network issues */}
        {apiWarning && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start justify-between gap-3 shadow-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm text-amber-300 flex items-center gap-2">
                  <span>Live Upstox Feed Interrupted</span>
                  {apiWarning.status ? (
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] text-amber-300 border border-amber-500/30">
                      HTTP {apiWarning.status}
                    </span>
                  ) : null}
                  {apiWarning.symbol && (
                    <span className="font-mono text-[11px] text-amber-200/80">
                      [{apiWarning.symbol}]
                    </span>
                  )}
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 font-mono text-[10px] text-rose-300 border border-rose-500/30">
                    dataSource: {apiWarning.dataSource || 'UPSTOX_DATA_ERROR'}
                  </span>
                </div>
                <p className="text-slate-200 text-xs leading-relaxed">
                  {apiWarning.message}
                </p>
                {apiWarning.endpoint && (
                  <p className="font-mono text-[11px] text-amber-400/80">
                    Endpoint: {apiWarning.endpoint}
                  </p>
                )}
                <div className="pt-1 flex flex-wrap items-center gap-3">
                  <span className="text-[11px] text-amber-300/90 font-medium">
                    ⚠️ Token expired or unauthorized. Upstox tokens expire daily at 3:30 AM IST. Please refresh your token from developer.upstox.com.
                  </span>
                  <button
                    onClick={() => {
                      upstoxClient.clearToken();
                      setHasToken(false);
                      setApiWarning(null);
                      evaluateAllHoldings();
                    }}
                    className="rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-2.5 py-1 text-[11px] font-mono border border-amber-500/40 transition-colors"
                  >
                    Clear Token &amp; Re-evaluate
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setApiWarning(null)}
              className="text-amber-400 hover:text-white px-2.5 py-1 text-xs rounded border border-amber-500/30 hover:bg-amber-500/20 font-mono transition-colors shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
            <div>
              <span className="font-bold">Error: </span>
              {errorMessage}
            </div>
          </div>
        )}

        {/* View 1: Portfolio & Holdings Hub */}
        {activeView === 'PORTFOLIO_HUB' && (
          <div className="space-y-6">
            {/* Section 1: Portfolio Valuation Title */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e293b]/60 pb-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold font-mono tracking-tight text-white flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 animate-pulse" />
                  Portfolio Valuation
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Aggregate capital valuation, real-time unrealized P&amp;L, and capital-weighted quantitative quality.
                </p>
              </div>
            </div>

            {/* Top KPI Strip with Quality Tilt Bar */}
            <PortfolioSummaryStrip
              analytics={analytics}
              holdingsCount={holdings.length}
              resolvedCount={resolvedCount}
              items={portfolioItems}
              activeTiltFilter={activeTiltFilter}
              onSelectTiltFilter={setActiveTiltFilter}
              activeClusterFilter={activeClusterFilter}
              onSelectClusterFilter={setActiveClusterFilter}
            />

            {/* Risk Radar Alerts */}
            <RiskRadarBanner
              analytics={analytics}
              items={portfolioItems}
              onSelectStock={handleSelectStock}
              onFilterChange={setPortfolioFilter}
            />

            {/* Filter & Sort Controls */}
            <PortfolioFilterBar
              activeFilter={portfolioFilter}
              onSelectFilter={setPortfolioFilter}
              activeSector={portfolioSector}
              onSelectSector={setPortfolioSector}
              sectors={uniqueSectors}
              activeSort={portfolioSort}
              onSelectSort={setPortfolioSort}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              counts={filterCounts}
            />

            {/* Active Macro Tilt Filter Banner */}
            {activeTiltFilter && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Filtering:</span>
                  <span className="font-semibold text-indigo-300">
                    {activeTiltFilter === 'P1_P2' && 'Favorable Zone'}
                    {activeTiltFilter === 'P3' && 'Hold / Consolidating'}
                    {activeTiltFilter === 'P4' && 'ETFs & Index'}
                    {activeTiltFilter === 'P5' && 'Caution / At Risk'}
                  </span>
                  <span className="text-slate-500">
                    ({filteredAndSortedItems.length} {filteredAndSortedItems.length === 1 ? 'asset' : 'assets'})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTiltFilter(null)}
                  className="px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 text-[11px] transition-colors"
                >
                  Clear Filter ✕
                </button>
              </div>
            )}

            {/* Active Cluster / Attention Filter Banner */}
            {activeClusterFilter && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Filtered by:</span>
                  <span className="font-semibold text-amber-300">
                    {activeClusterFilter === 'PRICE_EXTENDED' || activeClusterFilter === 'EXTENDED'
                      ? 'Price Extended'
                      : activeClusterFilter === 'NEAR_STOP'
                      ? 'Near Stop Loss (<= 3%)'
                      : activeClusterFilter === 'STOP_BREACHED'
                      ? 'Stop Breached'
                      : activeClusterFilter === 'ACCRUAL_TRAP'
                      ? 'Accrual Trap'
                      : activeClusterFilter.replace(/_/g, ' ')}
                  </span>
                  <span className="text-slate-500">
                    ({filteredAndSortedItems.length} {filteredAndSortedItems.length === 1 ? 'asset' : 'assets'})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveClusterFilter(null)}
                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] transition-colors"
                >
                  Clear Filter ✕
                </button>
              </div>
            )}

            {/* High-Density Holdings Table */}
            <HoldingsTable
              items={filteredAndSortedItems}
              onSelectStock={handleSelectStock}
              onEditHolding={handleEditHolding}
              onDeleteHolding={handleDeleteHolding}
              onRefreshHolding={handleRefreshSingleHolding}
              refreshingSymbols={refreshingSymbols}
              onClearAll={handleClearAllHoldings}
              onOpenAddModal={() => {
                setEditingHolding(null);
                setIsAddModalOpen(true);
              }}
              onOpenImport={() => setIsImportModalOpen(true)}
              totalPortfolioValue={analytics.totalCurrentValue}
              onLoadDemo={handleLoadDemoPortfolio}
            />
          </div>
        )}

        {/* View 2: Deep Dive Single-Stock Quantitative Terminal */}
        {activeView === 'DEEP_DIVE' && (
          <div className="space-y-6">
            {/* 1. Dedicated Deep Dive Header Bar & Live Ticker */}
            <DeepDiveHeader
              symbol={selectedSymbol}
              evaluation={evaluation}
              currentHolding={currentHoldingItem}
              portfolioHoldings={holdings}
              onBackToPortfolio={() => setActiveView('PORTFOLIO_HUB')}
              onSelectStock={handleSelectStock}
              onRefreshStock={(sym, isin) => handleRefreshSingleHolding(sym, isin)}
              isRefreshing={refreshingSymbols.has(selectedSymbol.toUpperCase().trim())}
              totalPortfolioValue={analytics.totalCurrentValue}
            />

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400 space-y-3">
                <Activity className="h-8 w-8 text-indigo-400 animate-spin" />
                <p className="text-xs font-mono">Ingesting Upstox Data &amp; Running Quantitative Pipeline...</p>
              </div>
            ) : evaluation ? (
              <>
                {/* Critical Quarantine Alert Escalation */}
                {evaluation.integrity.status === 'QUARANTINED' && (
                  <div className="rounded-xl border border-rose-500/50 bg-rose-500/15 p-4 text-xs text-rose-300 flex items-start gap-3 shadow-md">
                    <AlertOctagon className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-rose-200 text-sm">
                        CRITICAL DATA INTEGRITY LOCK: MODEL QUARANTINED
                      </div>
                      <p className="mt-1 text-slate-300">
                        Accounting or balance sheet discrepancy detected in upstream filings. Model execution is strictly locked to prevent unbacked capital allocation.
                      </p>
                      {evaluation.integrity.reasons && evaluation.integrity.reasons.length > 0 && (
                        <ul className="mt-1.5 list-disc list-inside text-rose-300/90 font-mono text-[11px] space-y-0.5">
                          {evaluation.integrity.reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. Stock Hero & Quantitative Score (ScoreGauge) */}
                <ScoreGauge
                  coreScore={evaluation.coreScore}
                  fundamentalScore={evaluation.fundamentalScore}
                  technicalScore={evaluation.technicalScore}
                  zone={evaluation.zone}
                  zoneReason={evaluation.zoneReason}
                  floorFailed={evaluation.safety.fundamentalFloorFailed}
                  isEtf={evaluation.sector === 'ETF'}
                  fundamentalStatus={evaluation.fundamentalStatus}
                  technicalStatus={evaluation.technicalStatus}
                  priority={activeRelationship?.priority}
                  archetype={activeRelationship?.archetype}
                  archetypeDescription={activeRelationship?.description}
                  fundamentalFactors={evaluation.fundamentalFactors}
                />

                {/* 3. 5-Session Historical Context Trajectory Ribbon */}
                {evaluation.isin && (
                  <TrajectoryRibbon
                    isin={evaluation.isin}
                    symbol={evaluation.tradingSymbol}
                  />
                )}

                {/* 4. Standalone Position Card (Rendered ONLY when shares owned: quantity > 0) */}
                {currentHoldingItem && currentHoldingItem.holding && currentHoldingItem.holding.quantity > 0 && (
                  <PositionCard
                    holdingItem={currentHoldingItem}
                    totalPortfolioValue={analytics.totalCurrentValue}
                  />
                )}

                {/* 4. Execution Corridor & Risk Guardrails */}
                <ExecutionCard
                  corridor={evaluation.execution}
                  avgBuyPrice={currentHoldingItem?.holding?.quantity ? currentHoldingItem.holding.averageBuyPrice : null}
                  isOwned={Boolean(currentHoldingItem?.holding && currentHoldingItem.holding.quantity > 0)}
                />

                {/* 5. Deterministic Price Structure (Model D: Complete 9-Level Matrix: E1-E3, S1-S3, T1-T3) */}
                {evaluation.priceStructure && (
                  <PriceStructureCard
                    priceStructure={evaluation.priceStructure}
                    ltp={evaluation.execution.ltp ?? 0}
                  />
                )}

                {/* 5. F-01 Visual Sub-Factor Attribution Inspector (Active on Material Score/Condition Shifts) */}
                <AttributionInspector
                  currentEvaluation={evaluation}
                />

                {/* 6. Factor Attribution Table with Layer 2 Sub-caps & Layer 3 Orthogonal Buckets */}
                <FactorTable
                  fundamentalFactors={evaluation.fundamentalFactors}
                  technicalFactors={evaluation.technicalFactors}
                  fundamentalScore={evaluation.fundamentalScore}
                  technicalScore={evaluation.technicalScore}
                  fundamentalBuckets={evaluation.fundamentalBuckets}
                  technicalBuckets={evaluation.technicalBuckets}
                  sector={evaluation.sector}
                  fundamentalStatus={evaluation.fundamentalStatus}
                  technicalStatus={evaluation.technicalStatus}
                />

                {/* 6. Supporting Integrity & Safety Foundation (Compact below execution & factors) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start pt-2 border-t border-[#1e293b]/60">
                  <DataIntegrityBanner
                    integrity={evaluation.integrity}
                    dataSource={evaluation.dataSource}
                    dataSourceError={evaluation.dataSourceError}
                    isEtf={evaluation.sector === 'ETF' || evaluation.instrumentType === 'ETF' || (typeof evaluation.sector === 'string' && evaluation.sector.includes('Exchange Traded Fund'))}
                  />
                  <SafetyAlerts safety={evaluation.safety} />
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-slate-500 text-xs">
                No evaluation data available for {selectedSymbol}.
              </div>
            )}
          </div>
        )}
      </main>

      {/* Global Instant Search Modal (CMD+K) */}
      <StockSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectStock={handleSelectStock}
        onAddToPortfolio={handleAddToPortfolioFromSearch}
      />

      {/* Add / Edit Holding Modal */}
      <AddHoldingModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingHolding(null);
        }}
        onSave={handleSaveHolding}
        initialHolding={editingHolding}
      />

      {/* Import Holdings from Broker Modal */}
      <ImportHoldingsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportHoldings}
      />

      {/* Terminal Footer */}
      <footer className="border-t border-[#1e293b] bg-[#0b0f19] px-6 py-3 text-center text-[11px] text-slate-500 font-mono">
        STOCKINSIGHT Terminal v2.2 &bull; 100% Upstox API Native &bull; Mathematical Traceability &amp; Execution-Guard System
      </footer>
    </div>
  );
};

export default App;
