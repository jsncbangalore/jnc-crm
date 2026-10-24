import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Plus, Search, RefreshCw, X, Check, Printer, ShoppingCart,
  DollarSign, Building2, Phone, Mail, MapPin, Calendar, Clock, Download,
  ArrowRight, CheckCircle2, ChevronRight, ChevronDown, Tag
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { quotationsApi, inventoryApi } from '../services/api';
import { Sku } from '../types';

export const QUOTATION_STATUSES = [
  { value: 'draft', label: 'Draft', color: 'bg-slate-100 text-slate-800 dark:bg-slate-700/40 dark:text-slate-300 border-slate-300 dark:border-slate-600/40' },
  { value: 'sent', label: 'Sent', color: 'bg-blue-100 text-blue-800 dark:bg-crm-blue/20 dark:text-crm-blue-light border-blue-300 dark:border-crm-blue/30' },
  { value: 'approved', label: 'Approved', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30' },
  { value: 'rejected', label: 'Rejected', color: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-400 border-rose-300 dark:border-rose-500/30' },
  { value: 'expired', label: 'Expired', color: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400 border-amber-300 dark:border-amber-500/30' },
];
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';
import { BRAND_CONFIG } from '../config/brand';
import { format } from 'date-fns';
import { executeDirectPrint } from '../utils/directPrint';
import { ErrorStateCard, parseApiError } from '../components/common/ErrorStateCard';
import CreateQuotationModal from '../components/quotations/CreateQuotationModal';

interface QuotationLineItem {
  skuId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  notes?: string;
}

export default function QuotationsPage() {
  const { user } = useAuth();
  const { branding } = useBranding();
  const [searchParams] = useSearchParams();

  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status?: number; message: string; isNetworkError: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Skus for catalog autocomplete
  const [skus, setSkus] = useState<Sku[]>([]);

  // Create Quotation Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [leadId, setLeadId] = useState<string | undefined>(undefined);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(
    '1. 100% advance or approved credit terms.\n2. Delivery within 7–10 days of confirmation.\n3. GST 18% extra as applicable.'
  );
  const [taxRate, setTaxRate] = useState(18.0);
  const [lines, setLines] = useState<QuotationLineItem[]>([
    { skuId: '', name: '', quantity: 1, unitPrice: 0, discount: 0 },
  ]);

  // View / Print Modal
  const [selectedQuote, setSelectedQuote] = useState<any | null>(null);

  // In-App Popup Feedback State (Replaces native browser alert & confirm)
  const [inAppPopup, setInAppPopup] = useState<{
    show: boolean;
    type: 'success' | 'error' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({
    show: false,
    type: 'success',
    title: '',
    message: '',
  });

  const fetchQuotations = async () => {
    try {
      setLoading(true);
      const params: Record<string, any> = { limit: 100 };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await quotationsApi.list(params);
      setQuotations(data.items || []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load quotations', err);
      setError(parseApiError(err));
      setQuotations([]);
    } finally {
      setLoading(false);
    }
  };

  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const handleStatusChange = async (quoteId: string, newStatus: string) => {
    const prevQuote = quotations.find((q) => q.id === quoteId);
    if (!prevQuote || prevQuote.status === newStatus) return;

    // Optimistic UI update
    setQuotations((prev) =>
      prev.map((q) => (q.id === quoteId ? { ...q, status: newStatus } : q))
    );
    setUpdatingStatusId(quoteId);

    try {
      await quotationsApi.updateStatus(quoteId, newStatus);
      setInAppPopup({
        show: true,
        type: 'success',
        title: 'Status Updated',
        message: `Quotation ${prevQuote.quoteNumber} status has been updated to ${newStatus.toUpperCase()}.`,
      });
    } catch (err: any) {
      // Revert on error
      setQuotations((prev) =>
        prev.map((q) => (q.id === quoteId ? { ...q, status: prevQuote.status } : q))
      );
      setInAppPopup({
        show: true,
        type: 'error',
        title: 'Failed to Update Status',
        message: err?.response?.data?.message || err.message || 'Status could not be updated.',
      });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const fetchSkus = async () => {
    try {
      const { data } = await inventoryApi.getSkus();
      setSkus(data.items || data || []);
    } catch (err) {
      console.error('Failed to load SKUs', err);
    }
  };

  useEffect(() => {
    fetchSkus();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      fetchQuotations();
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, statusFilter]);

  // Check URL params from Lead "Quote" button
  useEffect(() => {
    const urlLeadId = searchParams.get('leadId');
    const urlName = searchParams.get('name');
    const urlPhone = searchParams.get('phone');
    const urlEmail = searchParams.get('email');
    const urlCompany = searchParams.get('company');

    if (urlLeadId || urlName) {
      setLeadId(urlLeadId || undefined);
      setCustomerName(urlName || '');
      setCustomerPhone(urlPhone || '');
      setCustomerEmail(urlEmail || '');
      setCompanyName(urlCompany || '');
      setShowCreateModal(true);
    } else if (searchParams.get('action') === 'create') {
      setShowCreateModal(true);
    }
  }, [searchParams]);

  // Line item helpers
  const handleAddLine = () => {
    setLines([...lines, { skuId: '', name: '', quantity: 1, unitPrice: 0, discount: 0 }]);
  };

  const handleRemoveLine = (idx: number) => {
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx: number, field: keyof QuotationLineItem, value: any) => {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], [field]: value };
    setLines(updated);
  };

  const handleSelectSku = (idx: number, sku: Sku) => {
    const updated = [...lines];
    updated[idx] = {
      ...updated[idx],
      skuId: sku.id,
      name: `${sku.skuCode} - ${sku.name}`,
      unitPrice: sku.unitPrice || 0,
    };
    setLines(updated);
  };

  const calcSubtotal = () => {
    return lines.reduce((acc, l) => acc + Math.max(0, (l.quantity || 1) * (l.unitPrice || 0) - (l.discount || 0)), 0);
  };

  const calcTax = () => (calcSubtotal() * taxRate) / 100;
  const calcTotal = () => calcSubtotal() + calcTax();

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0 || !lines[0].name.trim()) {
      setInAppPopup({
        show: true,
        type: 'error',
        title: 'Missing Line Items',
        message: 'Please add at least 1 equipment or product item with description/price.',
      });
      return;
    }

    setSubmitting(true);
    try {
      await quotationsApi.create({
        leadId,
        customerName,
        customerPhone,
        customerEmail: customerEmail || undefined,
        companyName: companyName || undefined,
        shippingAddress: shippingAddress || undefined,
        notes: notes || undefined,
        terms: terms || undefined,
        taxRate,
        lines: lines.map((l) => ({
          skuId: l.skuId || undefined,
          name: l.name,
          quantity: l.quantity || 1,
          unitPrice: l.unitPrice || 0,
          discount: l.discount || 0,
          notes: l.notes,
        })),
      });

      setShowCreateModal(false);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setCompanyName('');
      setShippingAddress('');
      setNotes('');
      setLines([{ skuId: '', name: '', quantity: 1, unitPrice: 0, discount: 0 }]);
      await fetchQuotations();

      // Sleek In-App Success Popup
      setInAppPopup({
        show: true,
        type: 'success',
        title: 'Quotation Created Successfully',
        message: `Quotation has been generated with GST breakdown. You can now print the PDF or convert it to an active order.`,
      });
    } catch (err: any) {
      setInAppPopup({
        show: true,
        type: 'error',
        title: 'Failed to Create Quotation',
        message: err?.response?.data?.message || err.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConvertToOrder = async (quoteId: string) => {
    setInAppPopup({
      show: true,
      type: 'confirm',
      title: 'Convert Quotation to Order?',
      message: 'This will convert this quotation into a live confirmed Order, allocate stock, and allow generating a Tax Invoice.',
      onConfirm: async () => {
        try {
          await quotationsApi.convertToOrder(quoteId);
          await fetchQuotations();
          setInAppPopup({
            show: true,
            type: 'success',
            title: 'Order Confirmed!',
            message: 'Quotation has been successfully converted into an active Order.',
          });
        } catch (err: any) {
          setInAppPopup({
            show: true,
            type: 'error',
            title: 'Failed to Convert',
            message: err?.response?.data?.message || err.message,
          });
        }
      },
    });
  };

  const handlePrintQuote = (q: any) => {
    const sub = q.subtotal || 0;
    const tax = q.taxAmount || 0;
    const tot = q.totalAmount || 0;

    const contentHtml = `
      <div class="print-sheet" style="padding: 16px; border: 1.5px solid #2E5EFF;">
        <div class="header" style="display: flex; justify-content: space-between; border-bottom: 2px solid #2E5EFF; padding-bottom: 12px; margin-bottom: 16px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              ${(q.tenant?.logoUrl || branding?.companyLogoUrl || BRAND_CONFIG.logoUrl) ? `
                <img src="${q.tenant?.logoUrl || branding?.companyLogoUrl || BRAND_CONFIG.logoUrl}" alt="Logo" style="max-height: 32px !important; max-width: 140px !important; width: auto !important; height: auto !important; object-fit: contain !important;" />
              ` : ''}
              <h1 style="font-size: 18px; font-weight: 900; color: #2E5EFF; margin: 0;">${(q.tenant?.name || branding?.companyDisplayName || BRAND_CONFIG.displayName).toUpperCase()}</h1>
            </div>
            ${(q.tenant?.email || q.tenant?.website) ? `
              <div style="font-size: 11px; color: #555;">${q.tenant?.email ? `Email: ${q.tenant.email}` : ''}${q.tenant?.email && q.tenant?.website ? ' | ' : ''}${q.tenant?.website ? `Web: ${q.tenant.website}` : ''}</div>
            ` : ''}
          </div>
          <div style="text-align: right;">
            <h2 style="margin: 0; font-size: 16px; color: #333;">PRICE QUOTATION</h2>
            <div style="font-weight: bold; color: #2E5EFF; margin-top: 4px;">${q.quoteNumber}</div>
            <div style="font-size: 11px; color: #666;">Date: ${format(new Date(q.createdAt), 'dd/MM/yyyy')}</div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 16px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <div>
            <strong>Quotation For:</strong>
            <div style="font-size: 13px; font-weight: bold; margin-top: 2px;">${q.lead?.customerName || q.contact?.name || 'Valued Client'}</div>
            <div>${q.lead?.company?.name || q.lead?.companyName || ''}</div>
            <div>Phone: ${q.lead?.customerPhone || q.contact?.phone || '—'}</div>
            <div>Email: ${q.lead?.customerEmail || q.contact?.email || '—'}</div>
          </div>
          <div style="text-align: right;">
            <div><strong>Status:</strong> ${q.status.toUpperCase()}</div>
            <div><strong>Valid Until:</strong> ${format(new Date(q.validUntil), 'dd/MM/yyyy')}</div>
            <div><strong>Prepared By:</strong> ${q.createdBy?.name || 'Sales Team'}</div>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="width: 30px; border: 1px solid #cbd5e1; padding: 7px 9px;">#</th>
              <th style="border: 1px solid #cbd5e1; padding: 7px 9px; text-align: left;">Item Description / Equipment Specification</th>
              <th style="width: 50px; border: 1px solid #cbd5e1; padding: 7px 9px; text-align: right;">Qty</th>
              <th style="width: 90px; border: 1px solid #cbd5e1; padding: 7px 9px; text-align: right;">Unit Price (₹)</th>
              <th style="width: 70px; border: 1px solid #cbd5e1; padding: 7px 9px; text-align: right;">Discount</th>
              <th style="width: 100px; border: 1px solid #cbd5e1; padding: 7px 9px; text-align: right;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${(q.lines || []).map((l: any, i: number) => `
              <tr>
                <td style="border: 1px solid #cbd5e1; padding: 7px 9px; text-align: center;">${i + 1}</td>
                <td style="border: 1px solid #cbd5e1; padding: 7px 9px;"><strong>${l.sku?.skuCode || ''}</strong> - ${l.sku?.name || 'Item'}</td>
                <td style="border: 1px solid #cbd5e1; padding: 7px 9px; text-align: right;">${l.quantity}</td>
                <td style="border: 1px solid #cbd5e1; padding: 7px 9px; text-align: right;">${Number(l.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style="border: 1px solid #cbd5e1; padding: 7px 9px; text-align: right;">${Number(l.discount || 0).toLocaleString('en-IN')}</td>
                <td style="border: 1px solid #cbd5e1; padding: 7px 9px; text-align: right; font-weight: bold;">${Number(l.totalPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="width: 280px; margin-left: auto; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>Subtotal:</span><span>₹${sub.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>GST (${q.taxRate}%):</span><span>₹${tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-weight: 900; font-size: 14px; color: #2E5EFF; border-top: 2px solid #2E5EFF; padding-top: 4px;">
            <span>Total Quotation:</span><span>₹${tot.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        ${q.terms ? `
          <div style="background: #fafafa; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; font-size: 11px; color: #444; margin-bottom: 20px;">
            <strong>Terms & Conditions:</strong>
            <div style="white-space: pre-line; margin-top: 4px;">${q.terms}</div>
          </div>
        ` : ''}

        <div style="margin-top: 40px; text-align: right;">
          <div style="font-size: 11px; color: #555;">For ${BRAND_CONFIG.displayName}</div>
          <div style="margin-top: 40px; font-weight: bold; border-top: 1px solid #cbd5e1; display: inline-block; padding-top: 4px;">
            Authorized Signatory
          </div>
        </div>
      </div>
    `;

    executeDirectPrint(contentHtml, {
      title: `Quotation_${q.quoteNumber}`,
      paperSize: 'A4',
    });
  };

  return (
    <div className="space-y-5">
      {/* ─── HEADER ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-950 dark:text-white">Quotations & Estimates</h1>
          <p className="text-slate-700 dark:text-slate-400 font-medium text-sm mt-0.5">
            Create professional GST price estimates, print PDFs, and convert to active orders in 1-click
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setLeadId(undefined);
              setShowCreateModal(true);
            }}
            className="btn bg-crm-amber hover:bg-crm-amber-hover text-black font-bold text-xs gap-1.5 shadow-glow-amber"
          >
            <Plus size={15} /> Create Quotation
          </button>

          <button onClick={fetchQuotations} className="btn-ghost text-xs gap-1" title="Refresh">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ─── CONTROLS & FILTER ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9 text-xs"
              placeholder="Search quote number, client name, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-950 dark:hover:text-white"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141722] p-1 rounded-xl border border-slate-200 dark:border-[#2A3042]">
            {['all', 'draft', 'sent', 'approved', 'rejected'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                  statusFilter === st
                    ? 'bg-crm-amber text-black font-bold shadow-glow-amber'
                    : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 font-bold'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {(search || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
              }}
              className="btn-ghost text-xs text-crm-coral hover:bg-crm-coral/10 border border-crm-coral/30 px-2.5 py-1.5 flex items-center gap-1 font-semibold"
              title="Reset all filters"
            >
              <X size={13} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ─── QUOTATIONS TABLE ──────────────────────────────────────────────── */}
      <div className="table-wrapper">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Quote #</th>
              <th>Date</th>
              <th>Client / Company</th>
              <th>Contact Details</th>
              <th>Items & Specs</th>
              <th>Subtotal</th>
              <th>Total (Inc. GST)</th>
              <th>Status</th>
              <th>Created By</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && !error && (
              <tr>
                <td colSpan={10} className="text-center py-12 text-slate-700 dark:text-slate-400 text-xs font-medium">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw size={14} className="animate-spin text-crm-amber" />
                    <span>Loading quotations...</span>
                  </div>
                </td>
              </tr>
            )}
            {error && quotations.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6">
                  <ErrorStateCard
                    message={error.message}
                    status={error.status}
                    isNetworkError={error.isNetworkError}
                    onRetry={fetchQuotations}
                  />
                </td>
              </tr>
            )}
            {!loading && !error && quotations.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-12 text-slate-700 dark:text-slate-400 text-xs">
                  <p className="font-bold text-slate-950 dark:text-slate-300">No quotations found matching your current filter.</p>
                  <p className="text-[11px] text-slate-500 mt-1">Click "+ New Quotation" or generate one directly from any Lead in the Leads page.</p>
                </td>
              </tr>
            )}
            {quotations.map((q) => (
              <tr key={q.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                <td className="font-mono text-xs font-bold text-amber-600 dark:text-crm-amber">
                  {q.quoteNumber}
                </td>
                <td className="text-slate-700 dark:text-slate-400 text-xs font-mono font-bold whitespace-nowrap">
                  {format(new Date(q.createdAt), 'dd MMM yyyy')}
                </td>
                <td>
                  <div>
                    <p className="font-bold text-slate-950 dark:text-white text-xs">{q.lead?.customerName || q.contact?.name || 'Valued Client'}</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">{q.lead?.company?.name || q.lead?.companyName || '—'}</p>
                  </div>
                </td>
                <td>
                  <div className="space-y-0.5 text-xs">
                    <p className="text-teal-700 dark:text-crm-teal font-mono font-bold">{q.lead?.customerPhone || q.contact?.phone || '—'}</p>
                    {(q.lead?.customerEmail || q.contact?.email) && (
                      <p className="text-slate-600 dark:text-slate-400 text-[11px] font-medium truncate max-w-[140px]">{q.lead?.customerEmail || q.contact?.email}</p>
                    )}
                  </div>
                </td>
                <td>
                  <span className="text-xs text-slate-800 dark:text-slate-300 font-bold">
                    {q.lines?.length || 0} {q.lines?.length === 1 ? 'Item' : 'Items'}
                  </span>
                </td>
                <td className="text-slate-950 dark:text-slate-300 font-mono font-bold text-xs">
                  ₹{(q.subtotal || 0).toLocaleString('en-IN')}
                </td>
                <td className="text-amber-700 dark:text-crm-amber font-mono font-black text-xs whitespace-nowrap">
                  ₹{(q.totalAmount || 0).toLocaleString('en-IN')}
                </td>
                <td className="whitespace-nowrap">
                  {(() => {
                    const currentStatus = (q.status || 'draft').toLowerCase();
                    const statusObj = QUOTATION_STATUSES.find((s) => s.value === currentStatus) || QUOTATION_STATUSES[0];
                    const isUpdating = updatingStatusId === q.id;

                    return (
                      <div className="relative inline-flex items-center">
                        <select
                          value={currentStatus}
                          disabled={isUpdating}
                          onChange={(e) => handleStatusChange(q.id, e.target.value)}
                          className={`appearance-none cursor-pointer pl-2.5 pr-6 py-1 rounded-full text-[11px] font-bold border transition-all outline-none focus:ring-2 focus:ring-crm-blue/30 disabled:opacity-60 shadow-sm ${statusObj.color}`}
                          title="Click to edit and choose quotation status"
                        >
                          {QUOTATION_STATUSES.map((st) => (
                            <option
                              key={st.value}
                              value={st.value}
                              className="bg-white dark:bg-[#181B26] text-slate-900 dark:text-white font-semibold py-1"
                            >
                              {st.label}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-2 pointer-events-none flex items-center">
                          {isUpdating ? (
                            <RefreshCw size={10} className="animate-spin text-current opacity-80" />
                          ) : (
                            <ChevronDown size={11} className="opacity-70" />
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </td>
                <td className="text-xs text-slate-800 dark:text-slate-400 font-bold">
                  {q.createdBy?.name || '—'}
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => handlePrintQuote(q)}
                      className="btn-ghost text-xs px-2.5 py-1 border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white font-bold"
                      title="Print Quotation PDF"
                    >
                      <Printer size={13} /> Print
                    </button>

                    {!q.order && (
                      <button
                        onClick={() => handleConvertToOrder(q.id)}
                        className="btn bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-2.5 py-1 gap-1"
                        title="Convert to Confirmed Order"
                      >
                        <ShoppingCart size={13} /> Order
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── MODAL: Create Quotation (Shared component) ───────────────────── */}
      <CreateQuotationModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          fetchQuotations();
        }}
      />


      {/* ─── IN-APP NOTIFICATION & CONFIRMATION MODAL ───────────────────────── */}
      <AnimatePresence>
        {inAppPopup.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 text-center space-y-4"
            >
              <div className="flex justify-center">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    inAppPopup.type === 'success'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : inAppPopup.type === 'confirm'
                      ? 'bg-crm-amber/15 text-crm-amber border border-crm-amber/30'
                      : 'bg-red-500/15 text-crm-coral border border-red-500/30'
                  }`}
                >
                  {inAppPopup.type === 'success' ? (
                    <CheckCircle2 size={32} />
                  ) : inAppPopup.type === 'confirm' ? (
                    <ShoppingCart size={28} />
                  ) : (
                    <X size={32} />
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-950 dark:text-white">{inAppPopup.title}</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{inAppPopup.message}</p>
              </div>

              <div className="flex items-center justify-center gap-2 pt-2">
                {inAppPopup.type === 'confirm' ? (
                  <>
                    <button
                      onClick={() => setInAppPopup({ ...inAppPopup, show: false })}
                      className="btn-ghost text-xs px-4"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const cb = inAppPopup.onConfirm;
                        setInAppPopup({ ...inAppPopup, show: false });
                        if (cb) cb();
                      }}
                      className="btn bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 shadow-glow-emerald"
                    >
                      Yes, Convert to Order
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setInAppPopup({ ...inAppPopup, show: false })}
                    className={`btn text-xs font-bold px-7 py-2.5 rounded-xl shadow-md transition-all ${
                      inAppPopup.type === 'success'
                        ? 'bg-crm-amber hover:bg-crm-amber-hover text-black shadow-glow-amber'
                        : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20'
                    }`}
                  >
                    Got It
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
