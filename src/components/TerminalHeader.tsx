import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Key, RefreshCw, PlusCircle, Upload, CheckCircle2, AlertTriangle, ArrowLeft, X } from 'lucide-react';
import { StockInsightEvaluation } from '../types/engine';
import { UpstoxClient } from '../api/upstoxClient';
import { SearchService } from '../api/searchService';
import { SessionResolver } from '../engine/sessionResolver';

export type AppViewMode = 'PORTFOLIO_HUB' | 'DEEP_DIVE';

export type UpstoxConnectionStatus = 'UNCONFIGURED' | 'CONFIGURED_UNVERIFIED' | 'CONNECTED' | 'ERROR';

interface TerminalHeaderProps {
  currentSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  evaluation: StockInsightEvaluation | null;
  hasToken: boolean;
  connectionStatus?: UpstoxConnectionStatus;
  onSaveToken: (token: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  activeView: AppViewMode;
  onChangeView: (view: AppViewMode) => void;
  holdingsCount: number;
  onOpenSearch: () => void;
  onOpenAddHolding: () => void;
  onOpenImport: () => void;
  onClearToken?: () => void;
  client?: UpstoxClient;
  onBackToPortfolio?: () => void;
}

export const TerminalHeader: React.FC<TerminalHeaderProps> = ({
  currentSymbol,
  onSelectSymbol: _onSelectSymbol,
  evaluation,
  hasToken,
  connectionStatus = 'UNCONFIGURED',
  onSaveToken,
  onRefresh,
  isLoading,
  activeView,
  onChangeView,
  holdingsCount: _holdingsCount,
  onOpenSearch,
  onOpenAddHolding,
  onOpenImport,
  onClearToken: _onClearToken,
  client,
  onBackToPortfolio,
  }) => {
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [inputToken, setInputToken] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    user?: string;
    quoteOk?: boolean;
    error?: string;
  } | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Focus management, focus trap, and background scroll locking
  useEffect(() => {
    if (!showTokenModal) return;

    previousActiveElement.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus textarea on modal open
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowTokenModal(false);
        setTestResult(null);
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [showTokenModal]);

  const handleTestConnection = async () => {
    const clean = inputToken.trim();
    if (!clean) {
      setTestResult({ success: false, error: 'Please enter a token to test.' });
      return;
    }

    if (!clean.includes('.') || clean.length < 30) {
      setTestResult({
        success: false,
        error:
          'Invalid Token Format: You appear to have pasted an API Key or Secret instead of an OAuth JWT Access Token (JWT tokens start with "eyJ..." and contain dots). Please generate a daily access token via OAuth.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const testClient = client || new UpstoxClient(clean);
    const result = await testClient.testConnection(clean);
    setIsTesting(false);
    setTestResult(result);
  };

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputToken.trim();
    if (!clean) return;

    onSaveToken(clean);
    setShowTokenModal(false);
    setTestResult(null);
  };

  const handleReturnToPortfolio = () => {
    if (onBackToPortfolio) {
      onBackToPortfolio();
    } else {
      onChangeView('PORTFOLIO_HUB');
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0b0f19]/95 backdrop-blur-md border-b border-[#1e293b] px-4 sm:px-6 py-3.5 shadow-md transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Mode */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-bold text-xl shadow-inner">
            SI
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white font-mono">
                STOCKINSIGHT
              </h1>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider font-mono">
                Upstox Native
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Autonomous Quantitative Stock Evaluation &amp; Portfolio Risk Hub
            </p>
          </div>
        </div>

        {/* Center: Expanded Global Search Bar */}
        <div className="flex-1 max-w-2xl mx-2 lg:mx-6 min-w-[240px]">
          <button
            onClick={onOpenSearch}
            className="w-full flex items-center justify-between rounded-xl border border-[#1e293b] bg-[#111827] px-4 py-2 text-xs text-slate-300 hover:border-indigo-500/60 hover:bg-[#151d2f] transition-all shadow-inner group"
            title="Press Ctrl+K or Cmd+K to search all equities"
          >
            <div className="flex items-center gap-2.5 text-slate-400 group-hover:text-slate-200 truncate">
              <Search className="h-4 w-4 text-slate-400 group-hover:text-indigo-400 shrink-0 transition-colors" />
              <span className="font-sans text-xs truncate">Search NSE equities by Symbol, Company Name, or Sector...</span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <kbd className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 font-mono font-semibold">
                ⌘K
              </kbd>
            </div>
          </button>
        </div>

        {/* Right: Actions, Import, Token */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {activeView === 'PORTFOLIO_HUB' ? (
            <>
              <button
                onClick={onOpenImport}
                className="flex items-center gap-1.5 rounded-lg border border-[#1e293b] bg-[#111827] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-indigo-500 hover:text-white transition-all shadow-sm"
                title="Import holdings from Zerodha, Groww, Upstox, Excel or CSV"
              >
                <Upload className="h-3.5 w-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Import</span>
              </button>

              <button
                onClick={onOpenAddHolding}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition-all"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Add Holding</span>
              </button>
            </>
          ) : null}

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-[#1e293b] bg-[#111827] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-[#182234] transition-all disabled:opacity-50"
            title="Refresh current data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={() => setShowTokenModal(true)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              connectionStatus === 'CONNECTED'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                : connectionStatus === 'ERROR'
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                : hasToken || connectionStatus === 'CONFIGURED_UNVERIFIED'
                ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20'
                : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700/80'
            }`}
          >
            <Key className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {!hasToken
                ? 'Configure Token'
                : connectionStatus === 'CONNECTED'
                ? 'Connected'
                : connectionStatus === 'ERROR'
                ? 'Connection Error'
                : 'Token Configured'}
            </span>
          </button>
        </div>
      </div>

      {/* Unified Deep Dive Sticky Stock Context Bar */}
      {activeView === 'DEEP_DIVE' && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#1e293b]/60 pt-2.5 text-xs font-mono">
          {/* Stock Identification & Return Trigger */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleReturnToPortfolio}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 text-xs font-semibold text-indigo-300 hover:text-white transition-all shadow-sm font-sans"
              title="Return to Portfolio Hub (Keyboard: Esc)"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-indigo-400" />
              <span>Portfolio</span>
            </button>

            <span className="font-bold text-white text-sm bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
              {evaluation?.tradingSymbol || currentSymbol}
            </span>
            <span className="font-sans font-medium text-slate-300 text-xs hidden sm:inline max-w-[200px] md:max-w-[320px] truncate">
              {evaluation?.companyName || SearchService.getInstrumentBySymbol(currentSymbol)?.name || currentSymbol}
            </span>
            {evaluation?.sector === 'ETF' && (
              <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 text-[9px] font-bold">
                ETF
              </span>
            )}
          </div>

          {/* Real-time Pricing, Day Change, Data Source, Compact Active Horizon */}
          {evaluation && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 tabular-nums">
              {/* Live LTP & Net Change */}
              <div className="flex items-baseline gap-2">
                <span className="text-slate-500 text-[11px] font-sans">LTP:</span>
                {evaluation.execution.ltp !== null && evaluation.execution.ltp > 0 ? (
                <span className="text-sm font-bold text-white">
                  ₹{evaluation.execution.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-400 font-mono uppercase">
                  UNAVAILABLE
                </span>
              )}
              {evaluation.execution.ltp !== null && evaluation.execution.ltp > 0 && evaluation.netChange !== undefined && (
                <span
                  className={`text-[11px] font-semibold ${
                    evaluation.netChange > 0
                      ? 'text-emerald-400'
                      : evaluation.netChange < 0
                      ? 'text-rose-400'
                      : 'text-slate-400'
                  }`}
                >
                  ({evaluation.netChange >= 0 ? '+' : ''}₹{evaluation.netChange.toFixed(2)}{evaluation.netChangePct !== undefined ? ` / ${evaluation.netChangePct >= 0 ? '+' : ''}${evaluation.netChangePct.toFixed(2)}%` : ''})
                </span>
              )}
            </div>

            {/* Data Source & Market Session Badge */}
            <div className="flex items-center gap-1.5">
              {(() => {
                const session = SessionResolver.resolve();
                const isMarketOpen = session.marketSessionState === 'OPEN';
                if (evaluation.dataSource === 'UPSTOX_LIVE') {
                  return (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold border ${
                        isMarketOpen
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                      }`}
                      title={`Market State: ${session.marketSessionState} (Session: ${session.tradingSessionId})`}
                    >
                      {isMarketOpen ? '● LIVE FEED' : `LAST CLOSE FEED (${session.tradingSessionId})`}
                    </span>
                  );
                }
                if (evaluation.dataSource === 'UPSTOX_DATA_ERROR') {
                  return (
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-bold border bg-rose-500/20 text-rose-300 border-rose-500/40"
                      title="Data Error: Upstox API returned an error"
                    >
                      ⚠ UPSTOX_DATA_ERROR
                    </span>
                  );
                }
                return (
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-bold border bg-amber-500/20 text-amber-300 border-amber-500/40"
                    title={`Data Source: ${evaluation.dataSource}`}
                  >
                    ○ UNAVAILABLE
                  </span>
                );
              })()}
            </div>
          </div>
          )}
        </div>
      )}

      {/* Token Modal (Rendered in Portal to guarantee viewport-relative centering and prevent containing block trapping) */}
      {showTokenModal && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowTokenModal(false);
                setTestResult(null);
              }
            }}
          >
            <div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="upstox-token-modal-title"
              aria-describedby="upstox-token-modal-desc"
              className="relative w-full max-w-lg rounded-xl border border-[#1e293b] bg-[#111827] p-6 shadow-2xl font-sans max-h-[calc(100vh-2rem)] flex flex-col my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-2 shrink-0">
                <h3 id="upstox-token-modal-title" className="text-base font-bold text-white flex items-center gap-2 font-mono">
                  <Key className="h-5 w-5 text-indigo-400" />
                  Upstox API Access Token
                </h3>
                <div className="flex items-center gap-2">
                  {hasToken && (
                    <span
                      className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold font-mono ${
                        connectionStatus === 'CONNECTED'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : connectionStatus === 'ERROR'
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {connectionStatus === 'CONNECTED'
                        ? 'Connected'
                        : connectionStatus === 'ERROR'
                        ? 'Connection Error'
                        : 'Token Configured'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowTokenModal(false);
                      setTestResult(null);
                    }}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                    aria-label="Close dialog"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <p id="upstox-token-modal-desc" className="text-xs text-slate-400 mb-4 shrink-0">
                Enter your daily OAuth 2.0 Access Token generated from the Upstox Developer Portal.
              </p>

              {/* Form & Scrollable Body */}
              <form onSubmit={handleTokenSubmit} className="space-y-4 flex flex-col flex-1 min-h-0 overflow-y-auto pr-1">
                <div className="shrink-0">
                  <label htmlFor="upstox-jwt-input" className="block text-xs font-semibold text-slate-300 mb-1 font-mono">
                    Access Token (JWT)
                  </label>
                  <textarea
                    id="upstox-jwt-input"
                    ref={textareaRef}
                    value={inputToken}
                    onChange={(e) => setInputToken(e.target.value)}
                    placeholder="Paste token starting with eyJ..."
                    className="w-full h-24 rounded-lg border border-[#1e293b] bg-[#0b0f19] p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {testResult && (
                  <div
                    className={`p-3 rounded-lg border text-xs font-mono flex items-start gap-2 shrink-0 ${
                      testResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-bold">
                        {testResult.success ? 'Token Validated Successfully!' : 'Token Test Failed'}
                      </div>
                      {testResult.user && (
                        <div className="text-[11px] text-slate-400 mt-0.5">User: {testResult.user}</div>
                      )}
                      {testResult.error && (
                        <div className="text-[11px] text-rose-300/90 mt-0.5">{testResult.error}</div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-2 shrink-0 mt-auto">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting || !inputToken.trim()}
                    className="rounded-lg border border-[#1e293b] bg-[#151d2f] px-4 py-2 text-xs font-mono font-semibold text-slate-300 hover:bg-[#1e293b] hover:text-white transition-all disabled:opacity-50"
                  >
                    {isTesting ? 'Testing Connection...' : 'Test Connection'}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowTokenModal(false);
                        setTestResult(null);
                      }}
                      className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!inputToken.trim()}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      Save &amp; Connect
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
};
