import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  ShoppingCart, 
  Receipt, 
  CreditCard, 
  BookOpen, 
  ExternalLink, 
  AlertCircle,
  ArrowRight,
  Clock,
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';
import { paymentsApi } from '../../services/api';
import { useAllowedPages } from '../../hooks/useAllowedPages';

interface RelatedDocumentsPanelProps {
  type: 'lead' | 'quotation' | 'order' | 'invoice';
  id: string;
  className?: string;
}

export default function RelatedDocumentsPanel({ type, id, className = '' }: RelatedDocumentsPanelProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { hasPage } = useAllowedPages();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    if (!id) return;
    
    setLoading(true);
    setError(null);
    paymentsApi.getRelated(type, id)
      .then((res) => {
        if (mounted) {
          setData(res.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error('Failed to load related documents:', err);
          setError('Failed to load related chain');
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [type, id]);

  if (loading) {
    return (
      <div className={`p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse ${className}`}>
        <div className="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
        <div className="flex gap-2 flex-wrap">
          <div className="h-8 w-28 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          <div className="h-8 w-28 bg-slate-200 dark:bg-slate-700 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amt || 0);
  };

  const hasQuotes = Boolean(data.quotation && hasPage('quotations'));
  const hasOrder = Boolean(data.order && hasPage('orders'));
  const hasInvoices = Boolean(data.invoices && data.invoices.length > 0 && hasPage('invoices'));
  const hasPayments = Boolean(data.payments && data.payments.length > 0);
  const hasLedger = Boolean(data.ledgerEntries && data.ledgerEntries.length > 0 && hasPage('ledger'));

  const anyRelated = hasQuotes || hasOrder || hasInvoices || hasPayments || hasLedger;

  if (!anyRelated) {
    return null;
  }

  return (
    <div className={`p-4 bg-slate-50/80 dark:bg-slate-900/60 rounded-xl border border-slate-200/80 dark:border-slate-800 backdrop-blur-sm ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
          Related Document Chain
        </h4>
        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
          Unified Flow
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Quotation */}
        {hasQuotes && data.quotation && (
          <div
            onClick={() => hasPage('quotations') && navigate('/quotations')}
            className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              type === 'quotation'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 font-semibold'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-amber-400 cursor-pointer shadow-sm'
            }`}
            title="Quotation"
          >
            <FileText className="w-3.5 h-3.5 text-amber-500" />
            <span>{data.quotation.quotationNumber}</span>
            <span className="text-slate-400">({formatCurrency(data.quotation.totalAmount)})</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 uppercase">
              {data.quotation.status}
            </span>
          </div>
        )}

        {/* Order */}
        {hasOrder && data.order && (
          <>
            {hasQuotes && <ArrowRight className="w-3.5 h-3.5 text-slate-400" />}
            <div
              onClick={() => hasPage('orders') && navigate('/orders')}
              className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                type === 'order'
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-400 cursor-pointer shadow-sm'
              }`}
              title="Sales Order"
            >
              <ShoppingCart className="w-3.5 h-3.5 text-blue-500" />
              <span>{data.order.orderNumber}</span>
              <span className="text-slate-400">({formatCurrency(data.order.totalAmount)})</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 uppercase">
                {data.order.status}
              </span>
            </div>
          </>
        )}

        {/* Invoices */}
        {hasInvoices && data.invoices.map((inv: any) => (
          <React.Fragment key={inv.id}>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            <div
              onClick={() => hasPage('invoices') && navigate('/invoices')}
              className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                type === 'invoice' && inv.id === id
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-emerald-400 cursor-pointer shadow-sm'
              }`}
              title={`${inv.docType}: ${inv.invoiceNumber}`}
            >
              <Receipt className="w-3.5 h-3.5 text-emerald-500" />
              <span>{inv.invoiceNumber}</span>
              <span className="text-slate-400">({formatCurrency(inv.totalAmount)})</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-semibold ${
                inv.paymentStatus === 'paid' 
                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                  : inv.paymentStatus === 'partial'
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                  : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
              }`}>
                {inv.paymentStatus || 'unpaid'}
              </span>
            </div>
          </React.Fragment>
        ))}

        {/* Payments / Receipts */}
        {hasPayments && data.payments.map((pmt: any) => (
          <React.Fragment key={pmt.id}>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-800/50 bg-purple-50/60 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 text-xs font-medium shadow-sm"
              title={`Payment: ${pmt.receiptNumber}`}
            >
              <CreditCard className="w-3.5 h-3.5 text-purple-500" />
              <span>{pmt.receiptNumber}</span>
              <span className="font-semibold text-purple-900 dark:text-purple-200">
                +{formatCurrency(pmt.amount)}
              </span>
              {pmt.isAdvance && (
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100">
                  ADVANCE
                </span>
              )}
            </div>
          </React.Fragment>
        ))}

        {/* Ledger */}
        {hasLedger && (
          <div
            onClick={() => hasPage('ledger') && navigate('/ledger')}
            className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
            title="View in Ledger"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
            <span>Ledger ({data.ledgerEntries.length} entries)</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </div>
        )}
      </div>
    </div>
  );
}
