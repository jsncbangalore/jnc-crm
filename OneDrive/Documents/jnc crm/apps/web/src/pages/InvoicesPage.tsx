import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, FileText, Printer, Mail, Ban, RefreshCw, ShieldCheck,
  Truck, FileSpreadsheet, Layers, Filter, CheckCircle2, DollarSign,
  Calendar, Eye, ArrowUpRight, Check, Download, Edit3, ChevronLeft,
  ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { invoicesApi } from '../services/api';
import { Invoice, DocumentType, SignatorySettings } from '../types';
import { format } from 'date-fns';
import InvoiceModal from '../components/invoices/InvoiceModal';
import CreateDocumentModal from '../components/invoices/CreateDocumentModal';
import InvoiceSettingsModal from '../components/invoices/InvoiceSettingsModal';
import { useAuth } from '../contexts/AuthContext';

export default function InvoicesPage() {
  const { user } = useAuth();
  const canAdmin = user?.role === 'tenant_admin' || user?.role === 'admin';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals & Edit State
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSignatorySettings, setShowSignatorySettings] = useState(false);

  // Density & Horizontal Table Navigation
  const [density, setDensity] = useState<'compact' | 'normal'>('compact');
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const scrollTable = (direction: 'start' | 'left' | 'right' | 'end') => {
    const el = tableContainerRef.current;
    if (!el) return;
    const scrollAmount = 350;
    if (direction === 'start') {
      el.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (direction === 'left') {
      el.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    } else if (direction === 'right') {
      el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    } else if (direction === 'end') {
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    }
  };

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const { data } = await invoicesApi.list({
        search: search.trim() || undefined,
        docType: docTypeFilter !== 'all' ? docTypeFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        limit: 100,
      });
      setInvoices(data.items || []);
    } catch (err) {
      console.error('Failed to load invoices', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchInvoices, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [search, docTypeFilter, statusFilter]);

  // Aggregate Metrics
  const totalDocs = invoices.length;
  const totalTaxable = invoices.reduce((acc, inv) => acc + (inv.subtotal || 0), 0);
  const totalGst = invoices.reduce(
    (acc, inv) =>
      acc +
      (inv.docType === 'delivery_challan' || inv.isSez
        ? 0
        : (inv.igstAmount || 0) + (inv.cgstAmount || 0) + (inv.sgstAmount || 0)),
    0
  );
  const totalAmount = invoices.reduce(
    (acc, inv) =>
      acc + (inv.docType === 'delivery_challan' || inv.isSez ? inv.subtotal || 0 : inv.totalAmount || 0),
    0
  );

  const getDocBadge = (type?: DocumentType, isSez?: boolean) => {
    if (type === 'delivery_challan') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-teal-50 text-teal-700 dark:bg-crm-teal/15 dark:text-crm-teal border border-teal-300 dark:border-crm-teal/30">
          <Truck size={11} /> Delivery Challan
        </span>
      );
    }
    if (type === 'proforma_invoice') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
          <FileSpreadsheet size={11} /> Proforma Invoice
        </span>
      );
    }
    if (type === 'credit_note') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400 border border-rose-300 dark:border-rose-500/30">
          <FileText size={11} /> Credit Note
        </span>
      );
    }
    if (type === 'purchase_order') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30">
          <FileText size={11} /> Purchase Order
        </span>
      );
    }
    if (type === 'sez_invoice' || isSez) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400 border border-purple-300 dark:border-purple-500/30">
          <Layers size={11} /> SEZ / LUT (0%)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-blue-50 text-blue-700 dark:bg-crm-blue/15 dark:text-crm-blue border border-blue-300 dark:border-crm-blue/30">
        <FileText size={11} /> Tax Invoice
      </span>
    );
  };

  const handleOpenDoc = async (inv: Invoice) => {
    try {
      const { data } = await invoicesApi.get(inv.id);
      setSelectedInvoice(data);
    } catch (e) {
      setSelectedInvoice(inv);
    }
  };

  const handleDirectDownloadPdf = async (inv: Invoice, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await invoicesApi.downloadPdf(inv.id, inv.docType);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanNum = inv.invoiceNumber.replace(/[\/\\]/g, '_');
      const docTitle =
        inv.docType === 'delivery_challan'
          ? 'Delivery_Challan'
          : inv.docType === 'proforma_invoice'
          ? 'Proforma_Invoice'
          : inv.docType === 'credit_note'
          ? 'Credit_Note'
          : inv.docType === 'purchase_order'
          ? 'Purchase_Order'
          : inv.docType === 'sez_invoice' || inv.isSez
          ? 'SEZ_Tax_Invoice'
          : 'Tax_Invoice';
      a.download = `${docTitle}_${cleanNum}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Failed to download PDF:', err);
      alert('Failed to generate PDF.');
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── HEADER & ACTIONS ────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-950 dark:text-white flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-crm-blue/20 text-crm-blue flex items-center justify-center border border-blue-200 dark:border-transparent">
              <FileText size={18} />
            </span>
            Invoices & Dispatch Document Center
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-medium">
            Generate, preview, print, and email 100% compliant Tax Invoices, SEZ (LUT) Copies, Proforma & Delivery Challans.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {canAdmin && (
            <button
              onClick={() => setShowSignatorySettings(true)}
              className="btn bg-white dark:bg-[#181B26] hover:bg-slate-100 dark:hover:bg-[#202534] border border-slate-300 dark:border-[#2A3042] text-slate-800 dark:text-slate-300 text-xs py-2 px-3 gap-1.5 shadow-sm"
            >
              <ShieldCheck size={14} className="text-emerald-600 dark:text-crm-teal" /> Signatory & Stamp
            </button>
          )}

          <button
            onClick={fetchInvoices}
            className="btn bg-white dark:bg-[#181B26] hover:bg-slate-100 dark:hover:bg-[#202534] border border-slate-300 dark:border-[#2A3042] text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white text-xs p-2.5 shadow-sm"
            title="Refresh documents"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary text-xs py-2 px-4 shadow-glow-blue flex items-center gap-1.5"
          >
            <Plus size={15} /> Create Document
          </button>
        </div>
      </div>

      {/* ─── OVERVIEW METRICS CARDS ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] space-y-1 shadow-sm">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider block">
            Total Documents
          </span>
          <div className="text-xl sm:text-2xl font-black text-slate-950 dark:text-white font-mono">
            {totalDocs}
          </div>
          <span className="text-[10.5px] text-slate-500 font-medium">Tax Invoices, SEZ & DCs</span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] space-y-1 shadow-sm">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider block">
            Taxable Subtotal
          </span>
          <div className="text-xl sm:text-2xl font-black text-blue-700 dark:text-crm-blue-light font-mono">
            ₹{totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <span className="text-[10.5px] text-slate-500 font-medium">Base goods & services</span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] space-y-1 shadow-sm">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider block">
            GST Managed
          </span>
          <div className="text-xl sm:text-2xl font-black text-amber-700 dark:text-crm-amber font-mono">
            ₹{totalGst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <span className="text-[10.5px] text-slate-500 font-medium">CGST + SGST & IGST</span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] space-y-1 shadow-sm">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider block">
            Grand Total Billed
          </span>
          <div className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-400 font-mono">
            ₹{totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <span className="text-[10.5px] text-slate-500 font-medium">Total invoice value</span>
        </div>
      </div>

      {/* ─── FILTERS & SEARCH BAR ────────────────────────────────────── */}
      <div className="p-3 sm:p-4 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm">
        {/* Document Type Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
          {[
            { id: 'all', label: 'All Documents' },
            { id: 'tax_invoice', label: 'Tax Invoices' },
            { id: 'sez_invoice', label: 'SEZ / LUT (0%)' },
            { id: 'proforma_invoice', label: 'Proforma' },
            { id: 'delivery_challan', label: 'Delivery Challans' },
            { id: 'credit_note', label: 'Credit Notes' },
            { id: 'purchase_order', label: 'Purchase Orders' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setDocTypeFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                docTypeFilter === tab.id
                  ? 'bg-crm-blue text-white shadow-glow-blue'
                  : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Status Filters */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search invoice, customer, GSTIN, PO..."
              className="input pl-8 py-1.5 text-xs w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="input py-1.5 text-xs w-28"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
          </select>
        </div>
      </div>

      {/* ─── TABLE NAVIGATOR (Scroll or Pan) ─────────────────────────────── */}
      <div className="flex items-center justify-between bg-white dark:bg-[#181B26] p-2 rounded-xl border border-slate-200 dark:border-[#2A3042] flex-wrap gap-2 text-xs shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-crm-blue animate-pulse" />
            Table Navigator (Scroll or Pan):
          </span>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141722] p-0.5 rounded-lg border border-slate-200 dark:border-[#2A3042]">
            <button
              type="button"
              onClick={() => setDensity('compact')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                density === 'compact' ? 'bg-crm-blue text-white shadow-sm' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              Compact
            </button>
            <button
              type="button"
              onClick={() => setDensity('normal')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                density === 'normal' ? 'bg-crm-blue text-white shadow-sm' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              Normal
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollTable('start')}
            className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-white/10 hover:border-crm-blue text-slate-800 dark:text-slate-300 flex items-center gap-1 font-bold shadow-sm"
            title="Scroll to Start"
          >
            <ChevronsLeft size={13} /> Start (Component & SKU)
          </button>
          <button
            type="button"
            onClick={() => scrollTable('left')}
            className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-[#2A3042] hover:border-crm-blue text-slate-800 dark:text-white flex items-center gap-1 font-bold shadow-sm"
            title="Pan Left"
          >
            <ChevronLeft size={13} /> Left
          </button>
          <button
            type="button"
            onClick={() => scrollTable('right')}
            className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-[#2A3042] hover:border-crm-blue text-slate-800 dark:text-white flex items-center gap-1 font-bold shadow-sm"
            title="Pan Right"
          >
            Right <ChevronRight size={13} />
          </button>
          <button
            type="button"
            onClick={() => scrollTable('end')}
            className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-white/10 hover:border-amber-500 text-amber-700 dark:text-crm-amber flex items-center gap-1 font-bold shadow-sm"
            title="Scroll to End"
          >
            End (Actions & Bill) <ChevronsRight size={13} />
          </button>
        </div>
      </div>

      {/* ─── DESKTOP TABLE VIEW (≥ 1024px) ───────────────────────────── */}
      <div className="hidden lg:block card border-slate-200 dark:border-[#2A3042] overflow-hidden p-0 shadow-sm bg-white dark:bg-[#141722]">
        <div
          ref={tableContainerRef}
          className="overflow-x-auto max-h-[720px] scrollbar-thin scrollbar-thumb-crm-blue/70 hover:scrollbar-thumb-crm-blue scrollbar-track-slate-100 dark:scrollbar-track-[#181B26] scroll-smooth"
        >
          <table className={`crm-table w-full ${density === 'compact' ? 'text-[11px]' : 'text-xs'}`}>
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#2A3042] bg-slate-100 dark:bg-[#141722] text-slate-800 dark:text-slate-400 font-bold uppercase tracking-wider sticky top-0 z-20">
                <th className={`text-left whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Document Type</th>
                <th className={`text-left whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Doc Number</th>
                <th className={`text-left whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Customer & State</th>
                <th className={`text-left whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Buyer Order / PO</th>
                <th className={`text-left whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Dated</th>
                <th className={`text-right whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Taxable (₹)</th>
                <th className={`text-right whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>GST / Tax</th>
                <th className={`text-right whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Total Amount</th>
                <th className={`text-center whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Status</th>
                <th className={`text-center whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]/50">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500 font-medium">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-crm-blue" />
                    Loading documents...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-600 dark:text-slate-400 space-y-2">
                    <FileText size={28} className="mx-auto text-slate-400 dark:text-slate-600 mb-1" />
                    <p className="font-bold text-sm text-slate-800 dark:text-slate-300">No documents found</p>
                    <p className="text-xs text-slate-500">
                      Create your first Tax Invoice, SEZ Invoice or Delivery Challan using the button above.
                    </p>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const isDC = inv.docType === 'delivery_challan';
                  const isSez = inv.docType === 'sez_invoice' || inv.isSez;
                  const effectiveTotal = isDC || isSez ? inv.subtotal : inv.totalAmount;
                  const gstVal = isDC || isSez ? 0 : (inv.igstAmount || 0) + (inv.cgstAmount || 0) + (inv.sgstAmount || 0);

                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group cursor-pointer"
                      onClick={() => handleOpenDoc(inv)}
                    >
                      <td className={`whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>
                        {getDocBadge(inv.docType, inv.isSez)}
                      </td>
                      <td className={`font-mono font-bold text-slate-950 dark:text-white whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>
                        {inv.invoiceNumber}
                        {inv.isVoided && (
                          <span className="ml-1.5 px-1.5 py-0.2 rounded text-[9.5px] bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-crm-coral font-bold uppercase">
                            VOID
                          </span>
                        )}
                      </td>
                      <td className={density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}>
                        <div className="font-bold text-slate-950 dark:text-white max-w-[180px] truncate">{inv.customerName}</div>
                        <div className="text-[10.5px] text-slate-600 dark:text-slate-400 font-medium">{inv.customerState || 'Karnataka'}</div>
                      </td>
                      <td className={`font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>
                        {inv.buyerOrderNo || inv.order?.orderNumber || '-'}
                      </td>
                      <td className={`text-slate-700 dark:text-slate-300 whitespace-nowrap font-medium ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>
                        {format(new Date(inv.invoiceDate), 'dd MMM yyyy')}
                      </td>
                      <td className={`text-right font-mono text-slate-800 dark:text-slate-300 font-medium ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>
                        ₹{inv.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                      </td>
                      <td className={`text-right font-mono ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>
                        {isDC ? (
                          <span className="text-slate-400">-</span>
                        ) : isSez ? (
                          <span className="text-purple-600 dark:text-purple-400 text-[10.5px] font-bold">LUT (0%)</span>
                        ) : (
                          <span className="text-amber-700 dark:text-crm-amber font-bold">₹{gstVal.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
                        )}
                      </td>
                      <td className={`text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 text-sm ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>
                        {isDC ? '-' : `₹${effectiveTotal.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`}
                      </td>
                      <td className={`text-center whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold uppercase whitespace-nowrap ${
                            inv.paymentStatus === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-green-500/15 dark:text-green-400 border border-emerald-300 dark:border-green-500/30'
                              : inv.paymentStatus === 'partial'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400 border border-slate-300 dark:border-slate-500/30'
                          }`}
                        >
                          {inv.paymentStatus}
                        </span>
                      </td>
                      <td className={`text-center ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Edit Document Button */}
                          {!inv.isVoided && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingInvoice(inv);
                                setShowCreateModal(true);
                              }}
                              className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 dark:hover:bg-amber-500/25 text-amber-800 dark:text-crm-amber border border-amber-300 dark:border-amber-500/30 font-bold"
                              title="Edit Document, Prices, Items & Customer Details"
                            >
                              <Edit3 size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDirectDownloadPdf(inv)}
                            className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-transparent"
                            title="Download Vector PDF"
                          >
                            <Download size={13} />
                          </button>
                          <button
                            onClick={() => handleOpenDoc(inv)}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-transparent"
                            title="View & Print Official Document"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            onClick={() => handleOpenDoc(inv)}
                            className="p-1.5 rounded-lg bg-blue-50 dark:bg-crm-blue/15 hover:bg-blue-100 dark:hover:bg-crm-blue/25 text-blue-700 dark:text-crm-blue border border-blue-200 dark:border-transparent"
                            title="Email to Customer"
                          >
                            <Mail size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── MOBILE CARDS VIEW (< 1024px) ────────────────────────────── */}
      <div className="lg:hidden space-y-3">
        {loading ? (
          <div className="card p-8 text-center text-slate-500 text-xs">
            <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-crm-blue" />
            Loading documents...
          </div>
        ) : invoices.length === 0 ? (
          <div className="card p-8 text-center text-slate-600 dark:text-slate-400 text-xs space-y-2">
            <FileText size={24} className="mx-auto text-slate-400 dark:text-slate-600" />
            <p className="font-bold text-sm text-slate-800 dark:text-slate-300">No documents found</p>
            <p className="text-slate-500">Tap "+ Create Document" to generate one.</p>
          </div>
        ) : (
          invoices.map((inv) => {
            const isDC = inv.docType === 'delivery_challan';
            const isSez = inv.docType === 'sez_invoice' || inv.isSez;
            const effectiveTotal = isDC || isSez ? inv.subtotal : inv.totalAmount;

            return (
              <div
                key={inv.id}
                onClick={() => handleOpenDoc(inv)}
                className={`card space-y-3 border-slate-200 dark:border-[#2A3042] active:scale-[0.99] transition-transform cursor-pointer ${
                  density === 'compact' ? 'p-3' : 'p-4'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  {getDocBadge(inv.docType, inv.isSez)}
                  <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 font-bold">
                    {format(new Date(inv.invoiceDate), 'dd-MM-yyyy')}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-950 dark:text-white font-mono">{inv.invoiceNumber}</h3>
                    <p className="text-xs text-slate-800 dark:text-slate-300 font-bold">{inv.customerName}</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">{inv.customerState || 'Karnataka'}</p>
                  </div>
                  {!isDC && (
                    <div className="text-right">
                      <span className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-400 block">
                        ₹{effectiveTotal.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">Incl. Taxes</span>
                    </div>
                  )}
                </div>

                {inv.buyerOrderNo && (
                  <div className="text-[11px] text-slate-700 dark:text-slate-400 bg-slate-100 dark:bg-[#141722] p-2 rounded border border-slate-200 dark:border-[#2A3042]">
                    Buyer PO: <strong className="text-slate-950 dark:text-white font-mono">{inv.buyerOrderNo}</strong>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-[#2A3042] text-xs flex-wrap gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      inv.paymentStatus === 'paid'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-green-500/15 dark:text-green-400'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400'
                    }`}
                  >
                    {inv.paymentStatus}
                  </span>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {/* Edit Mobile Button */}
                    {!inv.isVoided && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingInvoice(inv);
                          setShowCreateModal(true);
                        }}
                        className="btn bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-crm-amber border border-amber-300 dark:border-amber-500/30 text-xs py-1 px-2.5 font-bold flex items-center gap-1"
                        title="Edit Invoice"
                      >
                        <Edit3 size={12} /> Edit
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDirectDownloadPdf(inv, e)}
                      className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400"
                      title="Download PDF"
                    >
                      <Download size={13} />
                    </button>
                    <button
                      onClick={() => handleOpenDoc(inv)}
                      className="btn-primary text-xs py-1 px-3 shadow-glow-blue flex items-center gap-1"
                    >
                      <Eye size={12} /> View
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── DOCUMENT PREVIEW & EMAIL MODAL ──────────────────────────── */}
      {selectedInvoice && (
        <InvoiceModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onInvoiceUpdated={fetchInvoices}
          onEditInvoice={(inv) => {
            setSelectedInvoice(null);
            setEditingInvoice(inv);
            setShowCreateModal(true);
          }}
        />
      )}

      {/* ─── CREATE / EDIT DOCUMENT MODAL ────────────────────────────── */}
      <CreateDocumentModal
        isOpen={showCreateModal}
        editInvoice={editingInvoice}
        onClose={() => {
          setShowCreateModal(false);
          setEditingInvoice(null);
        }}
        onCreated={(newDoc) => {
          fetchInvoices();
          setSelectedInvoice(newDoc);
          setEditingInvoice(null);
        }}
      />

      {/* ─── SIGNATORY & STAMP SETTINGS MODAL ────────────────────────── */}
      <InvoiceSettingsModal
        isOpen={showSignatorySettings}
        onClose={() => setShowSignatorySettings(false)}
      />
    </div>
  );
}
