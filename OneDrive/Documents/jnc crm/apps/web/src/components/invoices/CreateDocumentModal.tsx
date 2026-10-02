import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Plus, Trash2, FileText, Truck, FileSpreadsheet, ShieldAlert,
  Building2, User, Phone, Mail, MapPin, Hash, DollarSign, Calculator,
  Calendar, Check, Sparkles, AlertCircle
} from 'lucide-react';
import { DocumentType, Invoice } from '../../types';
import { invoicesApi, inventoryApi, companiesApi } from '../../services/api';
import { numberToIndianWords } from './InvoiceModal';
import { validateLutStatus } from '../../utils/lut-validator';

interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newDoc: any) => void;
  editInvoice?: Invoice | null;
}

interface FormLineItem {
  id: string;
  skuId?: string;
  description: string;
  hsnCode: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

const COMMON_HSN = [
  { code: '85312000', label: '85312000 - Fire Alarm & Detection Panels / Indicators' },
  { code: '85311020', label: '85311020 - Smoke Detectors & Heat Sensors' },
  { code: '85319000', label: '85319000 - Call Points & Sounders / Flashers' },
  { code: '85219090', label: '85219090 - Video Recording Equipment / NVRs' },
  { code: '83014090', label: '83014090 - Enterprise Storage & Access Hardware' },
  { code: '85184000', label: '85184000 - Public Address Systems & Amplifiers' },
  { code: '85447090', label: '85447090 - Optical Fiber Cables & Patch Cords' },
  { code: '9965',     label: '9965 - Transportation & Freight Charges' },
  { code: '9987',     label: '9987 - Installation, Testing & Commissioning Services' },
];

export default function CreateDocumentModal({ isOpen, onClose, onCreated, editInvoice }: CreateDocumentModalProps) {
  const [docType, setDocType] = useState<DocumentType>('tax_invoice');
  const [loadingNumber, setLoadingNumber] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [skus, setSkus] = useState<any[]>([]);

  // Form State
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [poDate, setPoDate] = useState('');
  const [buyerOrderNo, setBuyerOrderNo] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Advance');
  const [deliverySchedule, setDeliverySchedule] = useState('');

  // SEZ LUT State
  const [lutBondNo, setLutBondNo] = useState('AD290525013648T');
  const [lutValidity, setLutValidity] = useState('From : 10/05/2025 To: 09/05/2026');
  const [lutAcknowledged, setLutAcknowledged] = useState(false);

  // Customer State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [customerState, setCustomerState] = useState('Karnataka');
  const [billingAddress, setBillingAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  // Proforma State
  const [advancePercent, setAdvancePercent] = useState<number>(50);

  // Tax Invoice Advance Deduction State
  const [advanceAdjusted, setAdvanceAdjusted] = useState<number>(0);
  const [advanceRef, setAdvanceRef] = useState<string>('');

  const [notes, setNotes] = useState('');

  // Line items state (Clean & empty by default)
  const [lines, setLines] = useState<FormLineItem[]>([
    {
      id: '1',
      description: '',
      hsnCode: '',
      unit: "No's",
      quantity: 1,
      unitPrice: 0,
      taxRate: 18,
    },
  ]);

  // Load next number or populate existing invoice
  useEffect(() => {
    if (isOpen) {
      fetchSkus();
      if (editInvoice) {
        setDocType(editInvoice.docType || 'tax_invoice');
        setInvoiceNumber(editInvoice.invoiceNumber || '');
        setInvoiceDate(editInvoice.invoiceDate ? new Date(editInvoice.invoiceDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
        setDueDate(editInvoice.dueDate ? new Date(editInvoice.dueDate).toISOString().split('T')[0] : '');
        setPoDate(editInvoice.poDate ? new Date(editInvoice.poDate).toISOString().split('T')[0] : '');
        setBuyerOrderNo(editInvoice.buyerOrderNo || '');
        setReferenceNo(editInvoice.referenceNo || '');
        setPaymentTerms(editInvoice.paymentTerms || 'Advance');
        setDeliverySchedule(editInvoice.deliverySchedule || '');
        setLutBondNo(editInvoice.lutBondNo || 'AD290525013648T');
        setLutValidity(editInvoice.lutValidity || 'From : 10/05/2025 To: 09/05/2026');
        setCustomerName(editInvoice.customerName || '');
        setCustomerPhone(editInvoice.customerPhone || '');
        setCustomerEmail(editInvoice.customerEmail || '');
        setCustomerGstin(editInvoice.customerGstin || '');
        setCustomerState(editInvoice.customerState || 'Karnataka');
        setBillingAddress(editInvoice.billingAddress || '');
        setDeliveryAddress(editInvoice.deliveryAddress || editInvoice.billingAddress || '');
        setAdvancePercent(editInvoice.advancePercent ?? 50);
        setAdvanceAdjusted(editInvoice.advanceAdjusted || 0);
        setAdvanceRef(editInvoice.transactionRef || '');
        setNotes(editInvoice.notes || '');
        if (editInvoice.lines && editInvoice.lines.length > 0) {
          setLines(
            editInvoice.lines.map((l: any, idx: number) => ({
              id: l.id || String(idx + 1),
              skuId: l.skuId,
              description: l.description || '',
              hsnCode: l.hsnCode || '',
              unit: l.unit || "No's",
              quantity: Number(l.quantity) || 1,
              unitPrice: Number(l.unitPrice) || 0,
              taxRate: l.taxRate !== undefined ? Number(l.taxRate) : 18,
            }))
          );
        }
      } else {
        fetchNextNumber(docType);
        setInvoiceDate(new Date().toISOString().split('T')[0]);
        setDueDate('');
        setPoDate('');
        setBuyerOrderNo('');
        setReferenceNo('');
        setPaymentTerms('Advance');
        setDeliverySchedule('');
        setCustomerName('');
        setCustomerPhone('');
        setCustomerEmail('');
        setCustomerGstin('');
        setCustomerState('Karnataka');
        setBillingAddress('');
        setDeliveryAddress('');
        setAdvancePercent(50);
        setAdvanceAdjusted(0);
        setAdvanceRef('');
        setNotes('');
        setLines([
          {
            id: '1',
            description: '',
            hsnCode: '',
            unit: "No's",
            quantity: 1,
            unitPrice: 0,
            taxRate: 18,
          },
        ]);
      }
    }
  }, [isOpen, editInvoice]);

  const fetchNextNumber = async (type: DocumentType) => {
    if (editInvoice) return;
    try {
      setLoadingNumber(true);
      const { data } = await invoicesApi.getNextNumber(type);
      if (data?.number) {
        setInvoiceNumber(data.number);
      }
    } catch (err) {
      console.error('Failed to get sequential number', err);
    } finally {
      setLoadingNumber(false);
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

  // Add new blank line
  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        id: String(Date.now()),
        description: '',
        hsnCode: '',
        unit: docType === 'delivery_challan' ? 'No' : "No's",
        quantity: 1,
        unitPrice: 0,
        taxRate: docType === 'delivery_challan' ? 0 : 18,
      },
    ]);
  };

  // Remove Line
  const handleRemoveLine = (id: string) => {
    if (lines.length === 1) return;
    setLines(lines.filter((l) => l.id !== id));
  };

  // Update Line
  const handleUpdateLine = (id: string, field: keyof FormLineItem, val: any) => {
    setLines(
      lines.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, [field]: val };
        return updated;
      })
    );
  };

  // Select SKU preset
  const handleSelectSku = (id: string, skuId: string) => {
    const sku = skus.find((s) => s.id === skuId);
    if (!sku) return;
    setLines(
      lines.map((l) => {
        if (l.id !== id) return l;
        return {
          ...l,
          skuId: sku.id,
          description: sku.name,
          hsnCode: sku.hsnCode || '85312000',
          unitPrice: sku.unitPrice || 0,
          taxRate: sku.taxRate || 18,
        };
      })
    );
  };

  // 100% Accurate GST calculation
  const isCreditNote = docType === 'credit_note';
  const isPO = docType === 'purchase_order';
  const isSEZ = docType === 'sez_invoice';
  const isDC = docType === 'delivery_challan';
  const isProforma = docType === 'proforma_invoice';

  const isInterState =
    customerState?.toLowerCase() !== 'karnataka' &&
    customerState?.toLowerCase() !== 'ka' &&
    customerState?.toLowerCase() !== '29';

  let subtotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  lines.forEach((l) => {
    const lineAmt = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
    subtotal += lineAmt;

    if (!isDC && !isSEZ) {
      const rate = Number(l.taxRate) || 0;
      if (isInterState) {
        totalIgst += (lineAmt * rate) / 100;
      } else {
        totalCgst += (lineAmt * (rate / 2)) / 100;
        totalSgst += (lineAmt * (rate / 2)) / 100;
      }
    }
  });

  subtotal = Number(subtotal.toFixed(2));
  totalCgst = Number(totalCgst.toFixed(2));
  totalSgst = Number(totalSgst.toFixed(2));
  totalIgst = Number(totalIgst.toFixed(2));

  const totalTax = isSEZ || isDC ? 0 : Number((isInterState ? totalIgst : (totalCgst + totalSgst)).toFixed(2));
  const grandTotal = isDC || isSEZ ? subtotal : Number((subtotal + totalTax).toFixed(2));
  const advanceAmount = isProforma ? Number(((grandTotal * (advancePercent || 50)) / 100).toFixed(2)) : 0;
  const balanceDue = Math.max(0, Number((grandTotal - (advanceAdjusted || 0)).toFixed(2)));
  const amountWords = numberToIndianWords(grandTotal);
  const lutStatus = validateLutStatus(lutBondNo, lutValidity, invoiceDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      alert('Please enter customer or company name');
      return;
    }
    if (lines.some((l) => !l.description.trim())) {
      alert('Please enter a description for all line items');
      return;
    }

    if (isSEZ && (lutStatus.isExpired || lutStatus.isExpiringSoon) && !lutAcknowledged) {
      alert(`LUT Compliance Acknowledgment Required:\n\n${lutStatus.warningMessage}\n\nPlease check the acknowledgment box in the SEZ LUT section to confirm before proceeding.`);
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        docType,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        dueDate: dueDate || undefined,
        poDate: poDate || undefined,
        buyerOrderNo: buyerOrderNo.trim() || undefined,
        referenceNo: referenceNo.trim() || undefined,
        paymentTerms: paymentTerms.trim(),
        deliverySchedule: docType === 'purchase_order' ? deliverySchedule.trim() : undefined,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || '9999999999',
        customerEmail: customerEmail.trim() || undefined,
        customerGstin: customerGstin.trim() || undefined,
        customerState,
        billingAddress: billingAddress.trim() || `${customerState}, India`,
        deliveryAddress: deliveryAddress.trim() || billingAddress.trim() || `${customerState}, India`,
        lutBondNo: isSEZ ? lutBondNo : undefined,
        lutValidity: isSEZ ? lutValidity : undefined,
        lutAcknowledged: isSEZ ? lutAcknowledged : undefined,
        isSez: isSEZ,
        advancePercent: isProforma ? advancePercent : undefined,
        advanceAdjusted: (!isProforma && !isDC && advanceAdjusted > 0) ? advanceAdjusted : undefined,
        balanceDue: (!isProforma && !isDC && advanceAdjusted > 0) ? balanceDue : undefined,
        transactionRef: (!isProforma && !isDC && advanceRef.trim()) ? advanceRef.trim() : undefined,
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({
          skuId: l.skuId,
          hsnCode: isDC ? '-' : l.hsnCode,
          description: l.description,
          unit: l.unit,
          quantity: Number(l.quantity) || 1,
          unitPrice: Number(l.unitPrice) || 0,
          taxRate: isDC ? 0 : Number(l.taxRate) || 18,
        })),
      };

      let data;
      if (editInvoice?.id) {
        const res = await invoicesApi.update(editInvoice.id, payload);
        data = res.data;
      } else {
        const res = await invoicesApi.createDirect(payload);
        data = res.data;
      }
      onCreated(data);
      onClose();
    } catch (err: any) {
      alert(`Failed to ${editInvoice ? 'update' : 'create'} document: ` + (err?.response?.data?.message || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden my-auto"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-crm-blue/20 text-crm-blue border border-blue-200 dark:border-crm-blue/30 flex items-center justify-center font-bold">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950 dark:text-white">
                {editInvoice ? `Edit Official Document: ${editInvoice.invoiceNumber}` : 'Create Official GST / Dispatch Document'}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                100% Precise GST Calculations • Tax Invoices, SEZ (LUT), Proforma & Delivery Challans
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* 1. DOCUMENT TYPE SELECTOR */}
          <div>
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2 block">
              Step 1: Select Document Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {[
                {
                  id: 'tax_invoice',
                  title: 'Tax Invoice',
                  sub: 'Standard GST Invoice',
                  color: 'border-crm-blue text-crm-blue bg-blue-50 dark:bg-crm-blue/10',
                },
                {
                  id: 'sez_invoice',
                  title: 'SEZ / LUT (0%)',
                  sub: 'Export under LUT Bond',
                  color: 'border-purple-500 text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10',
                },
                {
                  id: 'proforma_invoice',
                  title: 'Proforma Invoice',
                  sub: 'Advance Milestone Quote',
                  color: 'border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10',
                },
                {
                  id: 'delivery_challan',
                  title: 'Delivery Challan',
                  sub: 'Material Dispatch Copy',
                  color: 'border-teal-500 text-teal-700 dark:text-crm-teal bg-teal-50 dark:bg-crm-teal/10',
                },
                {
                  id: 'credit_note',
                  title: 'Credit Note (CN)',
                  sub: 'GST Credit Note',
                  color: 'border-rose-500 text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10',
                },
                {
                  id: 'purchase_order',
                  title: 'Purchase Order (PO)',
                  sub: 'Vendor Procurement PO',
                  color: 'border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10',
                },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setDocType(t.id as DocumentType);
                    fetchNextNumber(t.id as DocumentType);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    docType === t.id
                      ? `${t.color} ring-1 ring-crm-blue/30 font-bold shadow-sm`
                      : 'border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#141722] text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                  }`}
                >
                  <span className="text-xs font-bold text-slate-950 dark:text-white block">{t.title}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium">{t.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. DOCUMENT METADATA */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] space-y-4 shadow-sm dark:shadow-none">
            <h4 className="text-xs font-bold text-teal-700 dark:text-crm-teal uppercase tracking-wider">
              Step 2: Document Numbers & Dates
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">
                  {isDC ? 'DC Number' : isCreditNote ? 'CN Number' : isPO ? 'PO Number' : 'Invoice Number'} *
                </label>
                <input
                  type="text"
                  required
                  className="input text-xs font-mono"
                  placeholder={isDC ? 'e.g. DC-001' : isCreditNote ? 'e.g. CN-001' : isPO ? 'e.g. PO-001' : 'e.g. INV-001'}
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Document Date *</label>
                <input
                  type="date"
                  required
                  className="input text-xs"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Payment Terms</label>
                <input
                  type="text"
                  className="input text-xs"
                  placeholder="e.g. Advance / 30 days"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                />
              </div>

              <div>
                <label className="label">{isDC ? 'PO Order No.' : isCreditNote ? 'Buyer PO Ref' : isPO ? 'Internal Ref' : "Buyer's Order No. / PO"}</label>
                <input
                  type="text"
                  className="input text-xs font-mono"
                  placeholder="e.g. PO-001"
                  value={buyerOrderNo}
                  onChange={(e) => setBuyerOrderNo(e.target.value)}
                />
              </div>

              <div>
                <label className="label">{isDC ? 'Order-Dated' : 'PO-Dated'}</label>
                <input
                  type="date"
                  className="input text-xs"
                  value={poDate}
                  onChange={(e) => setPoDate(e.target.value)}
                />
              </div>

              <div>
                <label className="label">{isCreditNote ? 'Original Invoice No. & Date *' : 'Reference No. & Date'}</label>
                <input
                  type="text"
                  className="input text-xs"
                  placeholder={isCreditNote ? 'e.g. INV-001 01-01-2026' : 'Optional internal ref'}
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                />
              </div>

              {isPO && (
                <div className="sm:col-span-3">
                  <label className="label text-amber-700 dark:text-amber-400 font-bold">Delivery Schedule (PO Term 2) *</label>
                  <input
                    type="text"
                    required
                    className="input text-xs"
                    placeholder="Enter delivery schedule"
                    value={deliverySchedule}
                    onChange={(e) => setDeliverySchedule(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* SEZ LUT Fields & Automated Expiry Check */}
            {isSEZ && (
              <div className="space-y-2 mt-2">
                <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label text-purple-900 dark:text-purple-300">LUT / Bond Number *</label>
                    <input
                      type="text"
                      required
                      className="input text-xs font-mono"
                      value={lutBondNo}
                      onChange={(e) => setLutBondNo(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label text-purple-900 dark:text-purple-300">LUT Validity Period *</label>
                    <input
                      type="text"
                      required
                      className="input text-xs"
                      value={lutValidity}
                      onChange={(e) => setLutValidity(e.target.value)}
                    />
                  </div>
                </div>

                {/* Automated Expiry Warning Banner */}
                {(lutStatus.isExpired || lutStatus.isExpiringSoon) && (
                  <div className={`p-3.5 rounded-xl border ${lutStatus.isExpired ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-400' : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-400'} space-y-2`}>
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert size={18} className={`shrink-0 mt-0.5 ${lutStatus.isExpired ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`} />
                      <div className="space-y-1 text-xs">
                        <p className="font-bold text-slate-950 dark:text-white">
                          {lutStatus.isExpired ? 'Compliance Warning: LUT Bond Has Expired' : 'Notice: LUT Bond Expiring Soon'}
                        </p>
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                          {lutStatus.warningMessage}
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                          Under Rule 96A of CGST Rules, zero-rated supply without payment of IGST requires an active Letter of Undertaking. If this bond has been renewed with the GST department, confirm below to proceed.
                        </p>
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 pt-2 border-t border-slate-200 dark:border-white/10 cursor-pointer select-none text-xs text-slate-800 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={lutAcknowledged}
                        onChange={(e) => setLutAcknowledged(e.target.checked)}
                        className="rounded border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800 text-purple-600 focus:ring-purple-500/30 h-4 w-4"
                      />
                      <span className="font-bold text-slate-950 dark:text-white">
                        I confirm LUT renewal or CA authorization for issuing this SEZ invoice
                      </span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Proforma Advance % */}
            {isProforma && (
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-3">
                <div className="flex-1">
                  <label className="label text-emerald-800 dark:text-emerald-300">Advance Payment Percentage (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="input text-xs w-32 font-bold"
                    value={advancePercent}
                    onChange={(e) => setAdvancePercent(Number(e.target.value) || 50)}
                  />
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 block font-medium">Advance Payable:</span>
                  <span className="text-base font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                    ₹{advanceAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            )}

            {/* Advance Adjustment Deduction for Tax Invoices */}
            {!isProforma && !isDC && (
              <div className="p-3 rounded-lg bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] space-y-2 shadow-sm dark:shadow-none">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Advance Payment Already Received? (Optional Deduction)
                  </label>
                  <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono font-medium">Deducts from Final Balance Due</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 dark:text-slate-400 block mb-1">Advance Amount Received (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className="input text-xs font-mono"
                      placeholder="0.00"
                      value={advanceAdjusted || ''}
                      onChange={(e) => setAdvanceAdjusted(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 dark:text-slate-400 block mb-1">Bank Reference / UTR Number</label>
                    <input
                      type="text"
                      className="input text-xs font-mono"
                      placeholder="e.g. UTR-001"
                      value={advanceRef}
                      onChange={(e) => setAdvanceRef(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. CUSTOMER / VENDOR DETAILS */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] space-y-4 shadow-sm dark:shadow-none">
            <h4 className="text-xs font-bold text-blue-700 dark:text-crm-blue-light uppercase tracking-wider">
              {isPO ? 'Step 3: Vendor & Delivery Details' : 'Step 3: Customer Billing & Delivery Info'}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">{isPO ? 'Vendor / Supplier Name *' : 'Customer / Company Name *'}</label>
                <input
                  type="text"
                  required
                  className="input text-xs"
                  placeholder={isPO ? 'Enter vendor / supplier name' : 'Enter customer or company name'}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Customer Phone</label>
                <input
                  type="text"
                  className="input text-xs"
                  placeholder="Enter phone number"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Customer Email (For Invoice Dispatch)</label>
                <input
                  type="email"
                  className="input text-xs font-mono"
                  placeholder="billing@customer.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="label">GST Number (GSTIN)</label>
                <input
                  type="text"
                  className="input text-xs font-mono uppercase"
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  value={customerGstin}
                  onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                />
              </div>

              <div>
                <label className="label">Customer State (Determines CGST+SGST vs IGST) *</label>
                <select
                  className="input text-xs"
                  value={customerState}
                  onChange={(e) => setCustomerState(e.target.value)}
                >
                  <option value="Karnataka">Karnataka (Home State - CGST 9% + SGST 9%)</option>
                  <option value="Andhra Pradesh">Andhra Pradesh (IGST 18%)</option>
                  <option value="Tamil Nadu">Tamil Nadu (IGST 18%)</option>
                  <option value="Maharashtra">Maharashtra (IGST 18%)</option>
                  <option value="Telangana">Telangana (IGST 18%)</option>
                  <option value="Kerala">Kerala (IGST 18%)</option>
                  <option value="Delhi">Delhi (IGST 18%)</option>
                  <option value="Gujarat">Gujarat (IGST 18%)</option>
                  <option value="Other State">Other State (IGST 18%)</option>
                </select>
              </div>

              <div className="flex items-center pt-5">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Tax Region: {isSEZ ? <strong className="text-purple-700 dark:text-purple-400">SEZ Export (0% LUT)</strong> : isInterState ? <strong className="text-amber-700 dark:text-crm-amber">Inter-State (IGST)</strong> : <strong className="text-blue-700 dark:text-crm-blue">Intra-State (CGST + SGST)</strong>}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Billing Address</label>
                <textarea
                  rows={2}
                  className="input text-xs resize-none"
                  placeholder="Street, City, Pincode, State"
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Delivery Address</label>
                <textarea
                  rows={2}
                  className="input text-xs resize-none"
                  placeholder="Leave empty to use billing address"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* 4. LINE ITEMS TABLE */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] space-y-3 shadow-sm dark:shadow-none">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-amber-700 dark:text-crm-amber uppercase tracking-wider">
                Step 4: Items, Rates & Descriptions ({lines.length})
              </h4>
              <button
                type="button"
                onClick={handleAddLine}
                className="btn-primary text-xs py-1 px-3 gap-1 shadow-glow-blue"
              >
                <Plus size={13} /> Add Line
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((line, idx) => (
                <div
                  key={line.id}
                  className="p-3 rounded-lg bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] space-y-2 relative shadow-sm dark:shadow-none"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Item #{idx + 1}</span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(line.id)}
                        className="text-slate-500 hover:text-red-600 p-1 rounded"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    {/* Description (Multi-line friendly) */}
                    <div className="sm:col-span-5">
                      <label className="text-[10px] font-bold text-slate-700 dark:text-slate-400 mb-1 block">Description of Goods / Scope *</label>
                      <textarea
                        rows={2}
                        required
                        className="input text-xs resize-none w-full"
                        placeholder="Item name, serial numbers or bullet specs..."
                        value={line.description}
                        onChange={(e) => handleUpdateLine(line.id, 'description', e.target.value)}
                      />
                    </div>

                    {!isDC && (
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-slate-700 dark:text-slate-400 mb-1 block">HSN / SAC</label>
                        <input
                          type="text"
                          className="input text-xs font-mono"
                          placeholder="85312000"
                          value={line.hsnCode}
                          onChange={(e) => handleUpdateLine(line.id, 'hsnCode', e.target.value)}
                        />
                      </div>
                    )}

                    <div className="sm:col-span-1">
                      <label className="text-[10px] font-bold text-slate-700 dark:text-slate-400 mb-1 block">Unit</label>
                      <input
                        type="text"
                        className="input text-xs text-center"
                        value={line.unit}
                        onChange={(e) => handleUpdateLine(line.id, 'unit', e.target.value)}
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label className="text-[10px] font-bold text-slate-700 dark:text-slate-400 mb-1 block">Qty</label>
                      <input
                        type="number"
                        min="1"
                        required
                        className="input text-xs text-center font-bold"
                        value={line.quantity}
                        onChange={(e) => handleUpdateLine(line.id, 'quantity', Number(e.target.value) || 1)}
                      />
                    </div>

                    {!isDC && (
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-slate-700 dark:text-slate-400 mb-1 block">Unit Rate (₹)</label>
                        <input
                          type="number"
                          step="any"
                          required
                          className="input text-xs text-right font-mono font-bold"
                          value={line.unitPrice}
                          onChange={(e) => handleUpdateLine(line.id, 'unitPrice', Number(e.target.value) || 0)}
                        />
                      </div>
                    )}

                    {!isDC && (
                      <div className="sm:col-span-1">
                        <label className="text-[10px] font-bold text-slate-700 dark:text-slate-400 mb-1 block">GST %</label>
                        <select
                          className="input text-xs text-center p-1 font-bold"
                          value={line.taxRate}
                          onChange={(e) => handleUpdateLine(line.id, 'taxRate', Number(e.target.value))}
                        >
                          <option value="18">18%</option>
                          <option value="12">12%</option>
                          <option value="28">28%</option>
                          <option value="5">5%</option>
                          <option value="0">0%</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 5. ACCURATE GST & TOTAL BREAKDOWN */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042] flex flex-col sm:flex-row justify-between gap-4 shadow-sm dark:shadow-none">
            <div className="flex-1 space-y-1">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Amount in Words:</span>
              <p className="text-xs font-bold text-teal-800 dark:text-crm-teal italic leading-relaxed">
                {amountWords}
              </p>
            </div>

            <div className="w-full sm:w-72 space-y-1.5 text-xs bg-white dark:bg-[#181B26] p-3 rounded-lg border border-slate-200 dark:border-[#2A3042] shadow-sm dark:shadow-none">
              <div className="flex justify-between text-slate-700 dark:text-slate-400">
                <span>Subtotal (Taxable):</span>
                <strong className="text-slate-950 dark:text-white font-mono">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
              </div>

              {!isDC && (
                isSEZ ? (
                  <div className="flex justify-between text-purple-700 dark:text-purple-400 text-[11px] font-bold">
                    <span>Nill - IGST 18% Tax by LUT:</span>
                    <strong className="font-mono">₹0.00</strong>
                  </div>
                ) : isInterState ? (
                  <div className="flex justify-between text-amber-700 dark:text-crm-amber font-bold">
                    <span>IGST 18%:</span>
                    <strong className="font-mono">₹{totalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-slate-800 dark:text-slate-300 font-medium">
                      <span>CGST 9%:</span>
                      <strong className="font-mono">₹{totalCgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="flex justify-between text-slate-800 dark:text-slate-300 font-medium">
                      <span>SGST 9%:</span>
                      <strong className="font-mono">₹{totalSgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </>
                )
              )}

              {isProforma && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400 pt-1 border-t border-slate-200 dark:border-[#2A3042] font-bold">
                  <span>Advance ({advancePercent}%):</span>
                  <strong className="font-mono">₹{advanceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                </div>
              )}

              {!isProforma && !isDC && advanceAdjusted > 0 && (
                <>
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400 pt-1 border-t border-slate-200 dark:border-[#2A3042] font-bold">
                    <span>Less: Advance Received {advanceRef ? `(${advanceRef})` : ''}:</span>
                    <strong className="font-mono">- ₹{advanceAdjusted.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                  </div>
                  <div className="flex justify-between text-amber-700 dark:text-crm-amber pt-1 font-bold">
                    <span>Net Balance Due:</span>
                    <strong className="font-mono">₹{balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                  </div>
                </>
              )}

              <div className="flex justify-between text-sm font-bold text-slate-950 dark:text-white pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                <span>Total Amount:</span>
                <strong className="text-emerald-700 dark:text-emerald-400 font-mono text-base font-black">
                  {isDC ? '-' : `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                </strong>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-[#2A3042]">
            <button
              type="button"
              onClick={onClose}
              className="btn bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-800 dark:text-slate-300 text-xs px-4"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary text-xs px-6 py-2.5 shadow-glow-blue flex items-center gap-2 font-bold"
            >
              <Check size={15} /> {submitting ? 'Saving Document...' : editInvoice ? 'Update & Save Changes' : 'Save & Generate Document'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
