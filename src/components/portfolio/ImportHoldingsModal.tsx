import React, { useState, useRef } from 'react';
import { Holding } from '../../types/portfolio';
import { BrokerImportParser, ImportPreviewResult } from '../../utils/brokerImport';
import { Upload, X, CheckCircle2, AlertCircle, Download, FileSpreadsheet } from 'lucide-react';

interface ImportHoldingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (holdings: Holding[], mode: 'append' | 'replace') => void;
}

export const ImportHoldingsModal: React.FC<ImportHoldingsModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [previewResult, setPreviewResult] = useState<ImportPreviewResult | null>(null);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setIsProcessing(true);
    try {
      const result = await BrokerImportParser.parseFile(file);
      setPreviewResult(result);
    } catch {
      setPreviewResult({
        brokerDetected: 'Error',
        totalRowsFound: 0,
        validHoldings: [],
        invalidRowsCount: 0,
        errors: ['Failed to process file format.'],
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleDownloadSample = () => {
    const csvContent = BrokerImportParser.generateSampleCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'StockInsight_Holdings_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmImport = () => {
    if (previewResult && previewResult.validHoldings.length > 0) {
      onImport(previewResult.validHoldings, importMode);
      onClose();
      // Reset
      setPreviewResult(null);
    }
  };

  const formatINR = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-2xl rounded-2xl border border-[#1e293b] bg-[#0f172a] shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1e293b] px-6 py-4 bg-[#0b0f19]">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/30 p-2 text-indigo-400">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Import Holdings from Stock Broker
              </h3>
              <p className="text-[11px] text-slate-400">
                Supports CSV, Excel (.xlsx, .xls), JSON from Zerodha, Groww, Upstox, Angel One &amp; more.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Drag & Drop Area */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-[#1e293b] bg-[#0b0f19]/70 hover:border-indigo-500/50 hover:bg-[#111827]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json,.tsv"
              onChange={handleChange}
              className="hidden"
            />
            <Upload className="h-9 w-9 text-indigo-400 mb-2" />
            <p className="text-xs font-semibold text-slate-200">
              Drag and drop your broker holdings file here, or{' '}
              <span className="text-indigo-400 underline">browse files</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1 font-mono">
              Accepted: .CSV, .XLSX, .XLS, .JSON &bull; Auto-detects Zerodha, Groww, Upstox, Angel One formats
            </p>
          </div>

          {/* Sample template download button */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>Don&apos;t have a file? Download our sample CSV template:</span>
            <button
              onClick={handleDownloadSample}
              className="flex items-center gap-1.5 font-semibold text-indigo-400 hover:text-indigo-300 font-mono"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Sample Template.csv</span>
            </button>
          </div>

          {/* Processing spinner */}
          {isProcessing && (
            <div className="py-6 text-center text-xs text-indigo-400 font-mono animate-pulse">
              Inspecting file headers and mapping broker fields...
            </div>
          )}

          {/* Preview Results */}
          {previewResult && !isProcessing && (
            <div className="space-y-4 pt-2">
              {/* Status Banner */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#1e293b] bg-[#111827] p-3 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="font-semibold text-slate-200">
                    Detected Format:{' '}
                    <span className="text-indigo-400 font-mono">{previewResult.brokerDetected}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span className="text-emerald-400">
                    {previewResult.validHoldings.length} valid holdings
                  </span>
                  {previewResult.invalidRowsCount > 0 && (
                    <span className="text-amber-400">
                      {previewResult.invalidRowsCount} skipped rows
                    </span>
                  )}
                </div>
              </div>

              {/* Errors if any */}
              {previewResult.errors.length > 0 && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    {previewResult.errors.map((err, i) => (
                      <p key={i}>{err}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview Table */}
              {previewResult.validHoldings.length > 0 && (
                <div className="rounded-xl border border-[#1e293b] bg-[#0b0f19] overflow-hidden">
                  <div className="px-4 py-2 border-b border-[#1e293b] bg-[#111827] text-xs font-mono text-slate-400 font-semibold uppercase">
                    Extracted Holdings Preview ({previewResult.validHoldings.length})
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-[#1e293b]/50 text-xs font-mono">
                    {previewResult.validHoldings.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between px-4 py-2 hover:bg-[#111827]"
                      >
                        <div>
                          <span className="font-bold text-white">{h.symbol}</span>
                          <span className="text-[11px] text-slate-400 font-sans ml-2 truncate">
                            {h.companyName}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-300">{h.quantity} shares @ </span>
                          <span className="text-white font-semibold">
                            ₹{h.averageBuyPrice.toFixed(2)}
                          </span>
                          <span className="text-slate-500 ml-2">
                            ({formatINR(h.quantity * h.averageBuyPrice)})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Import Mode Radio Options */}
              {previewResult.validHoldings.length > 0 && (
                <div className="rounded-xl border border-[#1e293b] bg-[#111827] p-3 text-xs space-y-2">
                  <div className="font-semibold text-slate-300 font-mono">Import Destination:</div>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="radio"
                        name="importMode"
                        value="append"
                        checked={importMode === 'append'}
                        onChange={() => setImportMode('append')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Append to current holdings</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="radio"
                        name="importMode"
                        value="replace"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Replace current portfolio completely</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[#1e293b] bg-[#0b0f19] px-6 py-3.5">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#1e293b] px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmImport}
            disabled={!previewResult || previewResult.validHoldings.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>
              Import {previewResult ? previewResult.validHoldings.length : 0} Holdings
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
