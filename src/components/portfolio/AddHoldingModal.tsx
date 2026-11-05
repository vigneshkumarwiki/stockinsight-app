import React, { useState, useEffect } from 'react';
import { Holding, StockSearchResult } from '../../types/portfolio';
import { SearchService } from '../../api/searchService';
import { X, Search, PlusCircle, Check } from 'lucide-react';

interface AddHoldingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (holding: Omit<Holding, 'id' | 'addedAt'>, id?: string) => void;
  initialHolding?: Holding | null;
}

export const AddHoldingModal: React.FC<AddHoldingModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialHolding,
}) => {
  const [symbol, setSymbol] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [sector, setSector] = useState('');
  const [isin, setIsin] = useState('');
  const [quantity, setQuantity] = useState<string>('10');
  const [avgPrice, setAvgPrice] = useState<string>('');
  const [buyDate, setBuyDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Autocomplete state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (initialHolding) {
      setSymbol(initialHolding.symbol);
      setCompanyName(initialHolding.companyName);
      setSector(initialHolding.sector);
      setIsin(initialHolding.isin || '');
      setQuantity(initialHolding.quantity.toString());
      setAvgPrice(initialHolding.averageBuyPrice.toString());
      setBuyDate(initialHolding.buyDate || new Date().toISOString().split('T')[0]);
      setSearchQuery(initialHolding.symbol);
    } else {
      setSymbol('');
      setCompanyName('');
      setSector('');
      setIsin('');
      setQuantity('10');
      setAvgPrice('');
      setBuyDate(new Date().toISOString().split('T')[0]);
      setSearchQuery('');
    }
  }, [initialHolding, isOpen]);

  useEffect(() => {
    if (!initialHolding && searchQuery.trim().length > 0) {
      const handler = setTimeout(() => {
        SearchService.search(searchQuery, 6).then((res) => {
          setSearchResults(res);
          setShowDropdown(true);
        });
      }, 150);
      return () => clearTimeout(handler);
    } else {
      setSearchResults([]);
      setShowDropdown(false);
    }
  }, [searchQuery, initialHolding]);

  if (!isOpen) return null;

  const handleSelectInstrument = (inst: StockSearchResult) => {
    setSymbol(inst.symbol);
    setCompanyName(inst.name);
    setSector(inst.sector);
    setIsin(inst.isin);
    setSearchQuery(inst.symbol);
    if (!avgPrice) {
      setAvgPrice(inst.lastPrice.toString());
    }
    setShowDropdown(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(quantity, 10);
    const price = parseFloat(avgPrice);

    if (!symbol.trim() || isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
      return;
    }

    onSave(
      {
        symbol: symbol.toUpperCase().trim(),
        companyName: companyName.trim() || symbol.toUpperCase().trim(),
        sector: sector.trim() || 'Equities',
        isin: isin.trim() || undefined,
        quantity: qty,
        averageBuyPrice: price,
        buyDate,
      },
      initialHolding?.id
    );

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-[#1e293b] bg-[#111827] shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1e293b] px-6 py-4 bg-[#0d1321]">
          <div className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-indigo-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              {initialHolding ? 'Edit Position' : 'Add Stock Holding'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Symbol Lookup */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-300 font-mono mb-1.5">
              Stock Symbol / Ticker *
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSymbol(e.target.value);
                }}
                placeholder="e.g. RELIANCE, TCS, INFY"
                disabled={Boolean(initialHolding)}
                required
                className="w-full rounded-lg border border-[#1e293b] bg-[#0b0f19] px-3.5 py-2.5 text-xs text-white uppercase font-mono tracking-wider focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
              />
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-500" />
            </div>

            {/* Dropdown Suggestions */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-[#1e293b] bg-[#0f172a] shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                {searchResults.map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => handleSelectInstrument(item)}
                    className="w-full text-left px-3.5 py-2 hover:bg-indigo-600/20 flex items-center justify-between border-b border-[#1e293b]/50 last:border-b-0 transition-colors"
                  >
                    <div>
                      <div className="text-xs font-bold text-white font-mono">{item.symbol}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[240px]">{item.name}</div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-xs text-slate-200">₹{item.lastPrice.toFixed(1)}</div>
                      <div className="text-[10px] text-slate-500">{item.sector}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Company Name & Sector Preview */}
          {companyName && (
            <div className="rounded-lg bg-[#0b0f19] border border-[#1e293b] p-3 text-xs">
              <div className="text-slate-300 font-semibold">{companyName}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{sector}</div>
            </div>
          )}

          {/* Grid: Quantity & Average Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 font-mono mb-1.5">
                Quantity *
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                className="w-full rounded-lg border border-[#1e293b] bg-[#0b0f19] px-3.5 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 font-mono mb-1.5">
                Avg Buy Price (₹) *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value)}
                placeholder="0.00"
                required
                className="w-full rounded-lg border border-[#1e293b] bg-[#0b0f19] px-3.5 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Buy Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 font-mono mb-1.5">
              Purchase Date
            </label>
            <input
              type="date"
              value={buyDate}
              onChange={(e) => setBuyDate(e.target.value)}
              className="w-full rounded-lg border border-[#1e293b] bg-[#0b0f19] px-3.5 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1e293b]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#1e293b] px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
            >
              <Check className="h-4 w-4" />
              {initialHolding ? 'Update Position' : 'Add to Portfolio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
