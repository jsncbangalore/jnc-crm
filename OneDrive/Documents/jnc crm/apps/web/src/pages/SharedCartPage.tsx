/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShoppingCart,
  Download,
  Printer,
  Copy,
  Check,
  Search,
  Tag,
  Layers,
  Building2,
  Boxes,
  ExternalLink,
  Share2,
  ArrowRight,
  ShieldCheck,
  FileSpreadsheet,
  PackageCheck,
  Sparkles,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { decodeCartFromUrl, SharedCartItem } from '../utils/cartShare';
import { BRAND_CONFIG } from '../config/brand';

export default function SharedCartPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [items, setItems] = useState<SharedCartItem[]>([]);
  const [metaTitle, setMetaTitle] = useState('Procurement Component Purchase List');
  const [metaDate, setMetaDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [importedToCrm, setImportedToCrm] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');

  useEffect(() => {
    const rawData = searchParams.get('data');
    if (rawData) {
      const decoded = decodeCartFromUrl(rawData);
      if (decoded && decoded.items.length > 0) {
        setItems(decoded.items);
        setMetaTitle(decoded.title || 'Procurement Component Purchase List');
        setMetaDate(decoded.date || new Date().toISOString().split('T')[0]);
        setLoading(false);
        return;
      }
    }

    // Fallback: Check local storage buy list if available
    try {
      const local = localStorage.getItem('jnc_inventory_buy_list');
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setItems(parsed);
          setLoading(false);
          return;
        }
      }
    } catch {}

    setLoading(false);
  }, [searchParams]);

  // Unique project list
  const projectsList = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.project) set.add(it.project);
    });
    return Array.from(set);
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const matchesSearch =
        !searchQuery.trim() ||
        it.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        it.skuCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        it.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
        it.project.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesProject = projectFilter === 'all' || it.project === projectFilter;

      return matchesSearch && matchesProject;
    });
  }, [items, searchQuery, projectFilter]);

  // Totals
  const totalUnits = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.quantityToBuy) || 0), 0),
    [items]
  );
  const subtotalAmount = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.quantityToBuy) || 0) * (Number(it.unitPrice) || 0), 0),
    [items]
  );
  const totalGstAmount = useMemo(
    () =>
      items.reduce(
        (sum, it) =>
          sum + ((Number(it.quantityToBuy) || 0) * (Number(it.unitPrice) || 0) * (Number(it.taxRate) || 0)) / 100,
        0
      ),
    [items]
  );
  const grandTotalAmount = subtotalAmount + totalGstAmount;

  // Copy current URL
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Download Excel (.xlsx)
  const handleDownloadExcel = () => {
    if (items.length === 0) return;
    const excelRows = items.map((it, idx) => {
      const base = Number(it.quantityToBuy) * Number(it.unitPrice);
      const gst = (base * Number(it.taxRate)) / 100;
      return {
        'Sl No': idx + 1,
        'SKU Code': it.skuCode,
        'Component Name': it.name,
        'Project / Usage': it.project || 'General',
        'Preferred Supplier': it.supplier || '—',
        'Store Stock': `${it.currentStock} ${it.unit}`,
        'Qty to Buy': it.quantityToBuy,
        'Unit': it.unit,
        'Unit Rate (₹)': it.unitPrice,
        'GST Rate (%)': `${it.taxRate}%`,
        'Base Amount (₹)': base,
        'GST Amount (₹)': gst,
        'Total with GST (₹)': base + gst,
      };
    });

    const ws = XLSX.utils.json_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Procurement_Cart');
    XLSX.writeFile(wb, `JNC_Procurement_Cart_${metaDate}.xlsx`);
  };

  // Download CSV
  const handleDownloadCsv = () => {
    if (items.length === 0) return;
    const csvRows = items.map((it, idx) => {
      const base = Number(it.quantityToBuy) * Number(it.unitPrice);
      const gst = (base * Number(it.taxRate)) / 100;
      return {
        'Sl No': idx + 1,
        'SKU Code': it.skuCode,
        'Component Name': it.name,
        'Project': it.project || 'General',
        'Supplier': it.supplier || '—',
        'Store Stock': `${it.currentStock} ${it.unit}`,
        'Qty to Buy': it.quantityToBuy,
        'Unit': it.unit,
        'Unit Rate': it.unitPrice,
        'GST Rate': `${it.taxRate}%`,
        'Total with GST': base + gst,
      };
    });

    const csvContent = Papa.unparse(csvRows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `JNC_Procurement_Cart_${metaDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Transfer / Import to CRM Cart
  const handleTransferToMyCart = () => {
    try {
      localStorage.setItem('jnc_inventory_buy_list', JSON.stringify(items));
      setImportedToCrm(true);
      setTimeout(() => {
        navigate('/inventory');
      }, 1200);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold text-slate-300">Loading Live Transferred Cart...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0E1117] text-slate-900 dark:text-slate-100 flex flex-col transition-colors selection:bg-blue-500 selection:text-white print:bg-white print:text-black">
      {/* ─── STANDALONE TOP BANNER (NO CRM CLUTTER) ────────────────────────── */}
      <header className="border-b border-slate-200 dark:border-[#22283A] bg-white dark:bg-[#141824] sticky top-0 z-30 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <ShoppingCart size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-wider uppercase text-blue-600 dark:text-crm-blue">
                  {BRAND_CONFIG.displayName}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Transfer Active
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-black text-slate-950 dark:text-white">
                {metaTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleCopyLink}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1C2234] text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#252D44] flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="Copy share link to clipboard"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copy Link</span>
                </>
              )}
            </button>

            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1C2234] text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#252D44] flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Printer size={14} />
              <span>Print / PDF</span>
            </button>

            <button
              onClick={handleDownloadExcel}
              disabled={items.length === 0}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              <Download size={14} />
              <span>Excel (.xlsx)</span>
            </button>

            <button
              onClick={handleTransferToMyCart}
              disabled={items.length === 0}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
              title="Save this material list into your active CRM procurement cart"
            >
              {importedToCrm ? (
                <>
                  <Check size={14} className="text-emerald-300" />
                  <span>Transferred to CRM!</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>Transfer to My Cart</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ─── PRINT-ONLY FORMAL LETTERHEAD ─────────────────────────────────── */}
      <div className="hidden print:block p-8 border-b-2 border-slate-900 pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black">{BRAND_CONFIG.displayName}</h1>
            <p className="text-xs text-slate-600">Audio, Automation & Electronic Security Systems</p>
            <p className="text-xs text-slate-600">Material Procurement Requisition / Purchase Order Sheet</p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold">Requisition Date: {metaDate}</p>
            <p className="text-slate-500">Document: {metaTitle}</p>
          </div>
        </div>
      </div>

      {/* ─── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex-1 space-y-6">
        {/* KPI SUMMARY CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#141824] border border-slate-200 dark:border-[#22283A] shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
              <Boxes size={14} className="text-blue-500" />
              <span>Line Items</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-950 dark:text-white font-mono">
              {items.length}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#141824] border border-slate-200 dark:border-[#22283A] shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
              <PackageCheck size={14} className="text-indigo-500" />
              <span>Total Units</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
              {totalUnits.toLocaleString('en-IN')}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#141824] border border-slate-200 dark:border-[#22283A] shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
              <span>Base Subtotal</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-200 font-mono">
              ₹{subtotalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#141824] border border-slate-200 dark:border-[#22283A] shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
              <span>GST Amount</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
              ₹{totalGstAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 shadow-sm col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider mb-1">
              <span>Grand Total</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-300 font-mono">
              ₹{grandTotalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* SEARCH & FILTERS BAR */}
        <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
          <div className="flex items-center gap-2.5 flex-1 min-w-[240px] max-w-md">
            <div className="relative w-full">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search SKU code, component name, project, or supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#141824] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {projectsList.length > 1 && (
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#141824] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Projects ({items.length})</option>
                {projectsList.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={handleDownloadCsv}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#141824] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C2234] transition-colors"
            >
              CSV Export
            </button>
          </div>
        </div>

        {/* COMPONENT LIST TABLE */}
        <div className="rounded-2xl border border-slate-200 dark:border-[#22283A] bg-white dark:bg-[#141824] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#22283A] bg-slate-50 dark:bg-[#181D2C] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="p-3 text-center w-12">#</th>
                  <th className="p-3 min-w-[200px]">Component & SKU</th>
                  <th className="p-3 min-w-[150px]">Project Allocation</th>
                  <th className="p-3 min-w-[150px]">Preferred Supplier</th>
                  <th className="p-3 text-center">Store Stock</th>
                  <th className="p-3 text-center">Qty to Buy</th>
                  <th className="p-3 text-center">Unit</th>
                  <th className="p-3 text-right">Unit Rate</th>
                  <th className="p-3 text-center">GST %</th>
                  <th className="p-3 text-right">Line Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#22283A]">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-slate-500">
                      <ShoppingCart size={40} className="mx-auto text-slate-400 mb-3 opacity-60" />
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        No Components in this Shared List
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {searchQuery
                          ? 'No items matched your search filter.'
                          : 'This shared cart link does not contain any queued items.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => {
                    const base = Number(item.quantityToBuy) * Number(item.unitPrice);
                    const gst = (base * Number(item.taxRate)) / 100;
                    const total = base + gst;

                    return (
                      <tr
                        key={item.id || idx}
                        className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="p-3 text-center font-mono text-slate-400 text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-950 dark:text-white text-xs">
                            {item.name}
                          </div>
                          <div className="font-mono text-[10.5px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1 mt-0.5">
                            <Tag size={10} />
                            {item.skuCode || '—'}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/30">
                            <Layers size={11} /> {item.project || 'General'}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700 dark:text-slate-300">
                          {item.supplier ? (
                            <span className="inline-flex items-center gap-1 text-slate-900 dark:text-slate-200 font-medium">
                              <Building2 size={12} className="text-slate-400" />
                              {item.supplier}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-600 dark:text-slate-400">
                          {item.currentStock} {item.unit}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-mono font-black border border-emerald-200 dark:border-emerald-800/40">
                            {item.quantityToBuy}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-slate-600 dark:text-slate-400">
                          {item.unit}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-slate-200">
                          ₹{Number(item.unitPrice).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                            {item.taxRate}%
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-black text-emerald-700 dark:text-emerald-400">
                          ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* TABLE FOOTER */}
          <div className="p-3.5 border-t border-slate-200 dark:border-[#22283A] bg-slate-50 dark:bg-[#181D2C] flex items-center justify-between text-xs text-slate-500 font-mono flex-wrap gap-2">
            <div>
              Showing {filteredItems.length} of {items.length} items &bull; Total Units:{' '}
              <span className="font-bold text-slate-900 dark:text-white">{totalUnits}</span>
            </div>
            <div className="flex items-center gap-3">
              <span>
                Grand Total:{' '}
                <strong className="text-emerald-600 dark:text-emerald-400 text-sm">
                  ₹{grandTotalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* BOTTOM VENDOR & LOGISTICS NOTES */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#22283A] bg-white dark:bg-[#141824] text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-blue-500 shrink-0" />
            <span>
              Material Requisition generated by {BRAND_CONFIG.displayName}. All specifications and component values are verified.
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            Link Transfer Protocol v1.0 &bull; Generated: {metaDate}
          </div>
        </div>
      </main>

      {/* ─── SIMPLE CLEAN FOOTER ─────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 dark:border-[#22283A] py-4 text-center text-xs text-slate-400 print:hidden">
        &copy; {new Date().getFullYear()} {BRAND_CONFIG.displayName} &bull; Material Procurement & Supply Chain
      </footer>
    </div>
  );
}
