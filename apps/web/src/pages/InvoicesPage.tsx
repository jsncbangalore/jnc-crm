import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, FileText, Printer, Mail, Ban, RefreshCw, ShieldCheck,
  Truck, FileSpreadsheet, Layers, Filter, CheckCircle2,
  Calendar, Eye, ArrowUpRight, Check, Download, Edit3, ChevronLeft,
  ChevronRight, ChevronsLeft, ChevronsRight, X, Link as LinkIcon,
  MoreVertical, Info
} from 'lucide-react';
import { invoicesApi, ledgerApi, companiesApi, api } from '../services/api';
import { Invoice, DocumentType, SignatorySettings } from '../types';
import { format } from 'date-fns';
import InvoiceModal from '../components/invoices/InvoiceModal';
import CreateDocumentModal from '../components/invoices/CreateDocumentModal';
import InvoiceSettingsModal from '../components/invoices/InvoiceSettingsModal';
import CustomerAccountModal from '../components/common/CustomerAccountModal';
import UnifiedRecordPaymentModal from '../components/common/UnifiedRecordPaymentModal';
import UnlinkedInvoicesModal from '../components/invoices/UnlinkedInvoicesModal';
import DropdownPortal from '../components/common/DropdownPortal';
import { useAuth } from '../contexts/AuthContext';
import { ErrorStateCard, parseApiError } from '../components/common/ErrorStateCard';
import { canStore } from '../utils/cookieConsent';
import { openDedicatedPrintTab } from '../utils/printHelper';
import DataTable, { ColumnDef } from '../components/common/DataTable';

interface InvoiceRowActionsProps {
  inv: Invoice;
  density: 'compact' | 'normal';
  onOpenDoc: (inv: Invoice) => void;
  onEditDoc: (inv: Invoice) => void;
  onDownloadPdf: (inv: Invoice, e?: React.MouseEvent) => void;
  onPrintDoc: (docType: string, id: string) => void;
  onLinkInvoice: (inv: Invoice) => void;
  onMarkAsPaid?: (inv: Invoice) => void;
  isUnlinked: boolean;
}

function InvoiceRowActions({
  inv,
  density,
  onOpenDoc,
  onEditDoc,
  onDownloadPdf,
  onPrintDoc,
  onLinkInvoice,
  onMarkAsPaid,
  isUnlinked,
}: InvoiceRowActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative inline-flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={`w-7 h-7 rounded-lg inline-flex items-center justify-center transition-colors cursor-pointer ${
          isOpen
            ? 'bg-crm-blue text-white shadow-xs'
            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/80 dark:hover:bg-white/10'
        }`}
        title="Document Actions"
        aria-label={`Actions for invoice ${inv.invoiceNumber}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreVertical size={16} />
      </button>

      <DropdownPortal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        triggerRef={triggerRef}
        preferredPlacement="bottom-end"
        className="w-52 py-1.5 bg-white dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] rounded-xl shadow-xl text-xs z-50 text-left"
      >
        <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-[#2A3042] flex items-center justify-between">
          <span className="font-mono text-slate-700 dark:text-slate-300 font-bold truncate max-w-[120px]">{inv.invoiceNumber}</span>
          <span className="text-slate-400">Actions</span>
        </div>

        {/* View Document */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
            onOpenDoc(inv);
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors font-medium cursor-pointer"
        >
          <Eye size={14} className="text-slate-500 dark:text-slate-400 shrink-0" />
          <span>View Document</span>
        </button>

        {/* Mark as fully paid shortcut */}
        {!inv.isVoided && inv.paymentStatus !== 'paid' && ((inv.balanceDue ?? inv.totalAmount) > 0.01) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
              onMarkAsPaid?.(inv);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors font-bold cursor-pointer"
          >
            <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Mark as fully paid</span>
          </button>
        )}

        {/* Edit Document */}
        {!inv.isVoided && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
              onEditDoc(inv);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors font-medium cursor-pointer"
          >
            <Edit3 size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Edit Document</span>
          </button>
        )}

        {/* Download Vector PDF */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
            onDownloadPdf(inv, e);
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors font-medium cursor-pointer"
        >
          <Download size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Download PDF</span>
        </button>

        {/* Direct Print Document */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
            onPrintDoc(inv.docType || 'tax_invoice', inv.id);
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors font-medium cursor-pointer"
        >
          <Printer size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span>Print Document</span>
        </button>

        {/* Email to Customer */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
            onOpenDoc(inv);
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-blue-700 dark:text-crm-blue hover:bg-blue-50 dark:hover:bg-crm-blue/10 transition-colors font-medium cursor-pointer"
        >
          <Mail size={14} className="text-blue-600 dark:text-crm-blue shrink-0" />
          <span>Email to Customer</span>
        </button>

        {/* One-click Link to Customer action */}
        {isUnlinked && (
          <>
            <div className="my-1 border-t border-slate-100 dark:border-[#2A3042]" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                onLinkInvoice(inv);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors font-bold cursor-pointer"
            >
              <LinkIcon size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Link to Customer</span>
            </button>
          </>
        )}
      </DropdownPortal>
    </div>
  );
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const canAdmin =
    user?.role === 'administrator' ||
    user?.role === 'tenant_admin' ||
    user?.role === 'admin' ||
    user?.role === 'platform_super_admin' ||
    user?.role === 'platform_admin';
  const [searchParams, setSearchParams] = useSearchParams();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status?: number; message: string; isNetworkError: boolean; referenceId?: string; code?: string; supportCode?: string } | null>(null);
  const [search, setSearch] = useState(() => searchParams.get('search') || searchParams.get('invoiceNumber') || '');
  const [docTypeFilter, setDocTypeFilter] = useState<string>(() => {
    if (searchParams.get('filter') === 'lut') return 'sez_invoice';
    return 'all';
  });
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (searchParams.get('filter') === 'unpaid') return 'unpaid';
    return 'all';
  });
  const hasAutoOpenedRef = useRef(false);

  useEffect(() => {
    const q = searchParams.get('search') || searchParams.get('invoiceNumber');
    if (q != null) setSearch(q);
    const filter = searchParams.get('filter');
    const action = searchParams.get('action');
    if (filter === 'unpaid') {
      setStatusFilter('unpaid');
    } else if (filter === 'lut') {
      setDocTypeFilter('sez_invoice');
    } else if (!filter && !action && !q && !searchParams.get('invoiceId')) {
      setStatusFilter('all');
      setDocTypeFilter('all');
    }
    if (action === 'create') {
      setShowCreateModal(true);
    }
    if (action || searchParams.has('_t')) {
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      next.delete('_t');
      setSearchParams(next, { replace: true });
    }

    // Direct invoice opening from ledger or URL link
    const invoiceId = searchParams.get('invoiceId');
    if (invoiceId) {
      invoicesApi.get(invoiceId).then((res) => {
        if (res?.data) {
          setSelectedInvoice(res.data);
        }
      }).catch(() => {});
    } else if (searchParams.get('open') === '1' && q) {
      invoicesApi.list({ search: q.trim(), limit: 5 }).then((res) => {
        const items = res?.data?.items || [];
        const match = items.find((i: any) =>
          (i.invoiceNumber || '').toLowerCase().includes(q.toLowerCase().trim())
        ) || items[0];
        if (match) {
          invoicesApi.get(match.id).then((full) => {
            setSelectedInvoice(full.data || match);
          }).catch(() => setSelectedInvoice(match));
        }
      }).catch(() => {});
    }
  }, [searchParams]);

  // Customer Account Modal State
  const [accountCustomerId, setAccountCustomerId] = useState<string | null>(null);
  const [accountCustomerName, setAccountCustomerName] = useState<string | null>(null);

  // Modals & Edit State
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSignatorySettings, setShowSignatorySettings] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Unlinked Invoices Modal State
  const [showUnlinkedModal, setShowUnlinkedModal] = useState(false);
  const [unlinkedInvoicesList, setUnlinkedInvoicesList] = useState<any[]>([]);
  const [loadingUnlinked, setLoadingUnlinked] = useState(false);
  const [registeredCustomers, setRegisteredCustomers] = useState<any[]>([]);

  const loadUnlinkedInvoices = async () => {
    setLoadingUnlinked(true);
    try {
      const [unlinkedRes, compsRes] = await Promise.all([
        ledgerApi.getUnlinkedInvoices(),
        companiesApi.list({ limit: 1000 }),
      ]);
      setUnlinkedInvoicesList(unlinkedRes.data || []);
      const comps = compsRes.data?.data || compsRes.data || [];
      setRegisteredCustomers(
        comps.map((c: any) => ({
          id: c.id,
          name: c.name,
          gstin: c.gstin || undefined,
          phone: c.phone || undefined,
          email: c.billingEmail || c.email || undefined,
        }))
      );
    } catch (err) {
      console.error('Failed to load unlinked invoices', err);
    } finally {
      setLoadingUnlinked(false);
    }
  };

  useEffect(() => {
    loadUnlinkedInvoices();
  }, []);

  const [paymentModalState, setPaymentModalState] = useState<{
    isOpen: boolean;
    customerId?: string;
    customerName?: string;
    invoiceId?: string;
    amount?: number;
  }>({ isOpen: false });

  const handleMarkAsPaid = (inv: Invoice) => {
    const balance = inv.balanceDue != null ? Number(inv.balanceDue) : Number(inv.totalAmount || 0);
    setPaymentModalState({
      isOpen: true,
      customerId: (inv as any).customerId || (inv as any).companyId,
      customerName: inv.customerName,
      invoiceId: inv.id,
      amount: balance,
    });
  };

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
      const items = data.items || [];
      setInvoices(items);
      setError(null);

      // Auto-open requested invoice if open=1 or invoiceId matches
      if (!hasAutoOpenedRef.current && items.length > 0) {
        const shouldOpen = searchParams.get('open') === '1' || Boolean(searchParams.get('invoiceId'));
        if (shouldOpen) {
          hasAutoOpenedRef.current = true;
          const targetId = searchParams.get('invoiceId');
          const targetSearch = (searchParams.get('search') || searchParams.get('invoiceNumber') || '').toLowerCase().trim();
          const match = targetId
            ? items.find((i: any) => i.id === targetId)
            : targetSearch
            ? items.find((i: any) => (i.invoiceNumber || '').toLowerCase().includes(targetSearch)) || items[0]
            : items[0];
          if (match) {
            handleOpenDoc(match);
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to load invoices', err);
      setError(parseApiError(err));
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchInvoices, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [search, docTypeFilter, statusFilter]);

  const handleLinkInvoice = async (_inv: Invoice) => {
    await loadUnlinkedInvoices();
    setShowUnlinkedModal(true);
  };

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

  if (error && invoices.length === 0) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 select-none">
        <ErrorStateCard
          message={error.message}
          status={error.status}
          isNetworkError={error.isNetworkError}
          referenceId={error.referenceId}
          supportCode={error.supportCode}
          onRetry={fetchInvoices}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full min-w-0 overflow-x-hidden">
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
            Create compliant Tax Invoices, SEZ copies, and Delivery Challans.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {canAdmin && (
            <button type="button"
              onClick={() => setShowSignatorySettings(true)}
              className="btn bg-white dark:bg-[#181B26] hover:bg-slate-100 dark:hover:bg-[#202534] border border-slate-300 dark:border-[#2A3042] text-slate-800 dark:text-slate-300 text-xs py-2 px-3 gap-1.5 shadow-sm"
            >
              <ShieldCheck size={14} className="text-emerald-600 dark:text-crm-teal" /> Signatory & Stamp
            </button>
          )}

          <button type="button"
            onClick={fetchInvoices}
            className="btn bg-white dark:bg-[#181B26] hover:bg-slate-100 dark:hover:bg-[#202534] border border-slate-300 dark:border-[#2A3042] text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white text-xs p-2.5 shadow-sm"
            title="Refresh documents"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          {unlinkedInvoicesList.length > 0 && (
            <button type="button"
              onClick={() => {
                loadUnlinkedInvoices();
                setShowUnlinkedModal(true);
              }}
              className="btn bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-300 text-xs py-2 px-3 flex items-center gap-1.5"
              title="Reconcile unlinked invoices"
            >
              <Info size={14} />
              <span>Unlinked</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                {unlinkedInvoicesList.length}
              </span>
            </button>
          )}

          <button type="button"
            onClick={() => setShowCreateModal(true)}
            className="btn-primary text-xs py-2 px-4 shadow-glow-blue flex items-center gap-1.5"
          >
            <Plus size={15} /> Create Document
          </button>
        </div>
      </div>

      {/* ─── FILTERS & SEARCH BAR ────────────────────────────────────── */}
      <div className="p-3 sm:p-4 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-sm max-w-full min-w-0">
        {/* Document Type Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full max-w-full min-w-0 pb-1 md:pb-0 scrollbar-none">
          {[
            { id: 'all', label: 'All Documents' },
            { id: 'tax_invoice', label: 'Tax Invoices' },
            { id: 'sez_invoice', label: 'SEZ / LUT (0%)' },
            { id: 'proforma_invoice', label: 'Proforma' },
            { id: 'delivery_challan', label: 'Delivery Challans' },
            { id: 'credit_note', label: 'Credit Notes' },
            { id: 'purchase_order', label: 'Purchase Orders' },
          ].map((tab) => (
            <button type="button"
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



      {/* ─── SHARED DATATABLE ──────────────────────────────────────────────── */}
      {(() => {
        const invoiceColumns: ColumnDef<Invoice>[] = [
          {
            id: 'docNumber',
            header: 'Doc # & Type',
            width: '18%',
            minWidth: '150px',
            priority: 'p1',
            disableHiding: true,
            isSticky: 'left',
            sortable: true,
            sortAccessor: (inv) => inv.invoiceNumber,
            cell: (inv) => (
              <div className="flex flex-col gap-1 items-start">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-xs text-slate-900 dark:text-white whitespace-nowrap">
                    {inv.invoiceNumber}
                  </span>
                  {inv.isVoided && (
                    <span className="px-1.5 py-0.2 rounded text-[9.5px] bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-crm-coral font-bold uppercase">
                      VOID
                    </span>
                  )}
                </div>
                <div>{getDocBadge(inv.docType, inv.isSez)}</div>
              </div>
            ),
          },
          {
            id: 'customer',
            header: 'Customer',
            width: '26%',
            minWidth: '180px',
            priority: 'p1',
            sortable: true,
            sortAccessor: (inv) => inv.customerName || '',
            cell: (inv) => {
              const cid = (inv as any).customerId || inv.companyId;
              const isUnlinked = !cid;

              return (
                <div className="flex flex-col min-w-0">
                  <button type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (cid) {
                        setAccountCustomerId(cid);
                        setAccountCustomerName(inv.customerName);
                      }
                    }}
                    className={`font-bold text-xs text-left truncate block max-w-full ${
                      cid
                        ? 'text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer'
                        : 'text-slate-900 dark:text-white'
                    }`}
                    title={inv.customerName}
                  >
                    {inv.customerName}
                  </button>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">
                    <span className="truncate">{inv.customerState || 'Karnataka'}</span>
                    <span>•</span>
                    <span className="font-mono truncate" title={inv.buyerOrderNo ? `PO: ${inv.buyerOrderNo}` : undefined}>
                      PO: {inv.buyerOrderNo || '—'}
                    </span>
                    {isUnlinked && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30 uppercase shrink-0">
                        Unlinked
                      </span>
                    )}
                  </div>
                </div>
              );
            },
          },
          {
            id: 'dated',
            header: 'Dated',
            width: '12%',
            minWidth: '100px',
            priority: 'p1',
            sortable: true,
            sortAccessor: (inv) => new Date(inv.invoiceDate).getTime(),
            cell: (inv) => (
              <span className="font-mono text-xs text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                {format(new Date(inv.invoiceDate), 'dd MMM yyyy')}
              </span>
            ),
          },
          {
            id: 'total',
            header: 'Total',
            width: '18%',
            minWidth: '140px',
            priority: 'p1',
            align: 'right',
            isMoney: true,
            sortable: true,
            sortAccessor: (inv) => Number(inv.totalAmount || 0),
            cell: (inv) => {
              const isDC = inv.docType === 'delivery_challan';
              const isSez = inv.docType === 'sez_invoice' || inv.isSez;
              const effectiveTotal = isDC ? inv.subtotal : inv.totalAmount;
              const storedGst = (inv.igstAmount || 0) + (inv.cgstAmount || 0) + (inv.sgstAmount || 0);
              const gstVal = isDC ? 0 : (isSez ? (inv.igstAmount || 0) : (storedGst > 0 ? storedGst : Math.max(0, (inv.totalAmount || 0) - (inv.subtotal || 0))));

              return (
                <div className="flex flex-col items-end">
                  <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                    {isDC ? '-' : `₹${Number(effectiveTotal || 0).toLocaleString('en-IN')}`}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    Taxable: ₹{Number(inv.subtotal || 0).toLocaleString('en-IN')} | GST: {isDC ? '—' : `₹${Number(gstVal || 0).toLocaleString('en-IN')}`}
                  </span>
                </div>
              );
            },
          },
          {
            id: 'status',
            header: 'Status',
            width: '12%',
            minWidth: '100px',
            priority: 'p1',
            cell: (inv) => {
              if (inv.isVoided) {
                return (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase whitespace-nowrap bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-crm-coral border border-red-300 dark:border-red-500/30">
                    Void
                  </span>
                );
              }
              if (inv.paymentStatus === 'paid') {
                return (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase whitespace-nowrap bg-emerald-50 text-emerald-700 dark:bg-green-500/15 dark:text-green-400 border border-emerald-300 dark:border-green-500/30">
                    Paid
                  </span>
                );
              }
              if (inv.paymentStatus === 'partial' || (inv as any).paymentStatus === 'partially_paid') {
                return (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase whitespace-nowrap bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30"
                    title={`Balance Due: ₹${Number(inv.balanceDue ?? 0).toLocaleString('en-IN')}`}
                  >
                    Partly paid <span className="font-mono text-[9.5px] lowercase">(₹{Number(inv.balanceDue ?? 0).toLocaleString('en-IN')})</span>
                  </span>
                );
              }
              return (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase whitespace-nowrap bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400 border border-slate-300 dark:border-slate-500/30">
                  Unpaid
                </span>
              );
            },
          },
          // Optional Chooser Column: Buyer Order / PO
          {
            id: 'buyerOrder',
            header: 'Buyer Order / PO',
            width: '12%',
            minWidth: '100px',
            priority: 'p2',
            defaultVisible: false,
            cell: (inv) => (
              <span className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate">
                {inv.buyerOrderNo || inv.order?.orderNumber || '—'}
              </span>
            ),
          },
          // Optional Chooser Column: Taxable Amount
          {
            id: 'taxable',
            header: 'Taxable (₹)',
            width: '12%',
            minWidth: '100px',
            priority: 'p2',
            defaultVisible: false,
            align: 'right',
            isMoney: true,
            sortable: true,
            sortAccessor: (inv) => Number(inv.subtotal || 0),
            cell: (inv) => (
              <span className="font-mono text-xs text-slate-800 dark:text-slate-300 whitespace-nowrap">
                ₹{Number(inv.subtotal || 0).toLocaleString('en-IN')}
              </span>
            ),
          },
          // Optional Chooser Column: GST Amount
          {
            id: 'gst',
            header: 'GST (₹)',
            width: '12%',
            minWidth: '100px',
            priority: 'p2',
            defaultVisible: false,
            align: 'right',
            isMoney: true,
            cell: (inv) => {
              const isDC = inv.docType === 'delivery_challan';
              const isSez = inv.docType === 'sez_invoice' || inv.isSez;
              const storedGst = (inv.igstAmount || 0) + (inv.cgstAmount || 0) + (inv.sgstAmount || 0);
              const gstVal = isDC ? 0 : (isSez ? (inv.igstAmount || 0) : (storedGst > 0 ? storedGst : Math.max(0, (inv.totalAmount || 0) - (inv.subtotal || 0))));

              if (isDC) return <span className="text-slate-400">—</span>;
              if (isSez && gstVal === 0) return <span className="text-purple-600 dark:text-purple-400 text-[10.5px] font-bold">LUT (0%)</span>;
              return (
                <span className="font-mono text-xs text-amber-700 dark:text-crm-amber whitespace-nowrap">
                  ₹{Number(gstVal || 0).toLocaleString('en-IN')}
                </span>
              );
            },
          },
          // Optional Chooser Column: Created By
          {
            id: 'createdBy',
            header: 'Created by',
            width: '12%',
            minWidth: '110px',
            priority: 'p3',
            defaultVisible: false,
            cell: (inv) => (
              <span className="text-xs text-slate-700 dark:text-slate-300 truncate" title={inv.createdBy?.name || 'System'}>
                {inv.createdBy?.name || 'System'}
              </span>
            ),
          },
          {
            id: 'actions',
            header: 'Actions',
            width: '10%',
            minWidth: '105px',
            priority: 'p1',
            align: 'right',
            disableHiding: true,
            isSticky: 'right',
            cell: (inv) => {
              const isUnlinked = !(inv as any).customerId && !inv.companyId;

              return (
                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => openDedicatedPrintTab(inv.docType || 'tax_invoice', inv.id)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title="Print Document"
                  >
                    <Printer size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenDoc(inv)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title="View Document"
                  >
                    <Eye size={13} />
                  </button>
                  <InvoiceRowActions
                    inv={inv}
                    density={density}
                    onOpenDoc={handleOpenDoc}
                    onEditDoc={(invoice) => {
                      setEditingInvoice(invoice);
                      setShowCreateModal(true);
                    }}
                    onDownloadPdf={handleDirectDownloadPdf}
                    onPrintDoc={openDedicatedPrintTab}
                    onLinkInvoice={handleLinkInvoice}
                    onMarkAsPaid={handleMarkAsPaid}
                    isUnlinked={isUnlinked}
                  />
                </div>
              );
            },
          },
        ];

        const renderInvoiceCard = (inv: Invoice) => {
          const isDC = inv.docType === 'delivery_challan';
          const isSez = inv.docType === 'sez_invoice' || inv.isSez;
          const effectiveTotal = isDC || isSez ? inv.subtotal : inv.totalAmount;

          return (
            <div
              onClick={() => handleOpenDoc(inv)}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B26] p-4 shadow-sm space-y-3 cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                {getDocBadge(inv.docType, inv.isSez)}
                <span className="text-[11px] font-mono text-slate-500 font-bold">
                  {format(new Date(inv.invoiceDate), 'dd MMM yyyy')}
                </span>
              </div>

              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono">{inv.invoiceNumber}</h3>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const cid = (inv as any).customerId || inv.companyId;
                      if (cid) {
                        setAccountCustomerId(cid);
                        setAccountCustomerName(inv.customerName);
                      }
                    }}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline text-left block"
                    title={inv.customerName}
                  >
                    {inv.customerName}
                  </button>
                  <p className="text-[11px] text-slate-500">{inv.customerState || 'Karnataka'}</p>
                </div>
                {!isDC && (
                  <div className="text-right">
                    <span className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-400 block">
                      ₹{Number(effectiveTotal || 0).toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">Incl. Taxes</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                {inv.isVoided ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-crm-coral">
                    Void
                  </span>
                ) : inv.paymentStatus === 'paid' ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 dark:bg-green-500/15 dark:text-green-400">
                    Paid
                  </span>
                ) : (inv.paymentStatus === 'partial' || (inv as any).paymentStatus === 'partially_paid') ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                    Partly paid <span className="font-mono text-[9px] lowercase">(₹{Number(inv.balanceDue ?? 0).toLocaleString('en-IN')})</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400">
                    Unpaid
                  </span>
                )}

                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button type="button"
                    onClick={() => openDedicatedPrintTab(inv.docType || 'tax_invoice', inv.id)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    title="Print"
                  >
                    <Printer size={13} />
                  </button>
                  <button type="button"
                    onClick={() => handleOpenDoc(inv)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    title="View"
                  >
                    <Eye size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        };

        return (
          <DataTable
            pageKey="invoices"
            data={invoices}
            columns={invoiceColumns}
            loading={loading}
            error={error}
            onRetry={fetchInvoices}
            userId={user?.id}
            emptyTitle="No documents found"
            emptySubtitle="No invoices match your current search or status filter."
            onRowClick={handleOpenDoc}
            cardRenderer={renderInvoiceCard}
          />
        );
      })()}

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
          setSuccessToast(`Document #${newDoc.invoiceNumber} generated & saved successfully!`);
          setTimeout(() => setSuccessToast(null), 5000);
        }}
      />

      {/* ─── IN-APP SUCCESS NOTIFICATION BANNER ─────────────────────── */}
      <AnimatePresence>
        {successToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-20 right-6 z-[9999] px-4 py-3 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-2xl flex items-center gap-2.5 border border-emerald-400"
          >
            <CheckCircle2 size={16} />
            <span>{successToast}</span>
            <button type="button"
              onClick={() => setSuccessToast(null)}
              className="p-1 hover:bg-emerald-700/60 rounded text-emerald-100 hover:text-white"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── SIGNATORY & STAMP SETTINGS MODAL ────────────────────────── */}
      <InvoiceSettingsModal
        isOpen={showSignatorySettings}
        onClose={() => setShowSignatorySettings(false)}
      />

      {/* Customer Account View Modal */}
      {accountCustomerId && (
        <CustomerAccountModal
          customerId={accountCustomerId}
          customerName={accountCustomerName || undefined}
          onClose={() => {
            setAccountCustomerId(null);
            setAccountCustomerName(null);
          }}
        />
      )}

      {/* Unified Record Payment Modal for Full Payment Shortcut */}
      {paymentModalState.isOpen && (
        <UnifiedRecordPaymentModal
          isOpen={paymentModalState.isOpen}
          onClose={() => setPaymentModalState({ isOpen: false })}
          defaultInvoiceId={paymentModalState.invoiceId}
          defaultCustomerId={paymentModalState.customerId}
          defaultCustomerName={paymentModalState.customerName}
          defaultAmount={paymentModalState.amount}
          onSuccess={(msg) => {
            fetchInvoices();
            setSuccessToast(msg || 'Payment recorded. Invoice balance is now ₹0.00.');
          }}
        />
      )}
      {/* Unlinked Invoices Reconciliation Modal */}
      {showUnlinkedModal && (
        <UnlinkedInvoicesModal
          isOpen={showUnlinkedModal}
          onClose={() => setShowUnlinkedModal(false)}
          unlinkedInvoices={unlinkedInvoicesList}
          loading={loadingUnlinked}
          registeredCustomers={registeredCustomers}
          onRefresh={async () => {
            await loadUnlinkedInvoices();
            await fetchInvoices();
          }}
          onSuccess={(msg) => {
            setSuccessToast(msg);
          }}
        />
      )}
    </div>
  );
}
