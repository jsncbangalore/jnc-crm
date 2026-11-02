import React, { useState, useEffect } from 'react';
import { 
  X, 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  ShoppingCart, 
  Receipt, 
  CreditCard, 
  BookOpen, 
  ArrowUpRight,
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { paymentsApi } from '../../services/api';
import { useAllowedPages } from '../../hooks/useAllowedPages';
import { useNavigate } from 'react-router-dom';
import { safeVoucherType } from '../../utils/safeFormat';

interface CustomerAccountModalProps {
  customerId: string;
  customerName?: string;
  onClose: () => void;
}

export default function CustomerAccountModal({
  customerId,
  customerName,
  onClose,
}: CustomerAccountModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'quotes' | 'orders' | 'invoices' | 'payments' | 'ledger'>('invoices');
  const { hasPage } = useAllowedPages();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    paymentsApi.getCustomerAccountSummary(customerId)
      .then((res) => {
        if (mounted) {
          setData(res.data);
          setLoading(false);
          // Set initial active tab based on what's available and permitted
          if (hasPage('invoices')) setActiveTab('invoices');
          else if (hasPage('orders')) setActiveTab('orders');
          else if (hasPage('quotations')) setActiveTab('quotes');
          else if (hasPage('ledger')) setActiveTab('ledger');
          else setActiveTab('payments');
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.response?.data?.message || 'Failed to load customer account');
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [customerId]);

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amt || 0);
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return d;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between bg-slate-50 dark:bg-slate-900/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Building2 className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {data?.customer?.name || customerName || 'Customer Account'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Unified Customer Financial & Document History
                </p>
              </div>
            </div>

            {data?.customer && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300 mt-3 font-medium">
                {data.customer.gstin && (
                  <span className="font-mono bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded">
                    GSTIN: {data.customer.gstin}
                  </span>
                )}
                {data.customer.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {data.customer.phone}
                  </span>
                )}
                {data.customer.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    {data.customer.email}
                  </span>
                )}
                {data.customer.state && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {data.customer.state}
                  </span>
                )}
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading customer account details...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          ) : (
            <>
              {/* Numbers That Agree: 4 Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Quoted Value</span>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-1">
                    {formatCurrency(data?.summary?.quotedValue || 0)}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Ordered Value</span>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-1">
                    {formatCurrency(data?.summary?.orderedValue || 0)}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Invoiced Total</span>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {formatCurrency(data?.summary?.invoicedTotal || 0)}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Outstanding Receivable</span>
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1">
                    {formatCurrency(data?.summary?.outstandingReceivable || 0)}
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-slate-200 dark:border-slate-800 flex gap-2">
                {hasPage('quotations') && (
                  <button
                    onClick={() => setActiveTab('quotes')}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 transition-all ${
                      activeTab === 'quotes'
                        ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    Quotes ({data?.quotations?.length || 0})
                  </button>
                )}
                {hasPage('orders') && (
                  <button
                    onClick={() => setActiveTab('orders')}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 transition-all ${
                      activeTab === 'orders'
                        ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                    }`}
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Orders ({data?.orders?.length || 0})
                  </button>
                )}
                {hasPage('invoices') && (
                  <button
                    onClick={() => setActiveTab('invoices')}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 transition-all ${
                      activeTab === 'invoices'
                        ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                    }`}
                  >
                    <Receipt className="w-4 h-4" />
                    Invoices ({data?.invoices?.length || 0})
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('payments')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 transition-all ${
                    activeTab === 'payments'
                      ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  Payments ({data?.payments?.length || 0})
                </button>
                {hasPage('ledger') && (
                  <button
                    onClick={() => setActiveTab('ledger')}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 transition-all ${
                      activeTab === 'ledger'
                        ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                    }`}
                  >
                    <BookOpen className="w-4 h-4" />
                    Ledger Statement
                  </button>
                )}
              </div>

              {/* Tab Panels */}
              <div className="min-h-[220px]">
                {/* Quotations Tab */}
                {activeTab === 'quotes' && (
                  <div className="space-y-2">
                    {(!data?.quotations || data.quotations.length === 0) ? (
                      <p className="text-sm text-slate-400 py-8 text-center">No quotations found for this customer.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                        {data.quotations.map((q: any) => (
                          <div key={q.id} className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <div>
                              <span className="font-semibold text-sm text-slate-900 dark:text-white font-mono">
                                {q.quotationNumber}
                              </span>
                              <span className="text-xs text-slate-400 ml-2">{formatDate(q.createdAt)}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                                {formatCurrency(q.totalAmount)}
                              </span>
                              <span className="px-2 py-0.5 rounded text-xs uppercase bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                                {q.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Orders Tab */}
                {activeTab === 'orders' && (
                  <div className="space-y-2">
                    {(!data?.orders || data.orders.length === 0) ? (
                      <p className="text-sm text-slate-400 py-8 text-center">No orders found for this customer.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                        {data.orders.map((o: any) => (
                          <div key={o.id} className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <div>
                              <span className="font-semibold text-sm text-slate-900 dark:text-white font-mono">
                                {o.orderNumber}
                              </span>
                              <span className="text-xs text-slate-400 ml-2">{formatDate(o.orderDate || o.createdAt)}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right text-xs">
                                <span className="font-bold text-sm text-slate-800 dark:text-slate-200 block">
                                  {formatCurrency(o.totalAmount)}
                                </span>
                                <span className="text-slate-400">
                                  Paid: {formatCurrency(o.paidAmount || 0)}
                                </span>
                              </div>
                              <span className="px-2 py-0.5 rounded text-xs uppercase bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
                                {o.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Invoices Tab */}
                {activeTab === 'invoices' && (
                  <div className="space-y-2">
                    {(!data?.invoices || data.invoices.length === 0) ? (
                      <p className="text-sm text-slate-400 py-8 text-center">No invoices found for this customer.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                        {data.invoices.map((inv: any) => (
                          <div key={inv.id} className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-slate-900 dark:text-white font-mono">
                                  {inv.invoiceNumber}
                                </span>
                                <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                  {inv.docType}
                                </span>
                              </div>
                              <span className="text-xs text-slate-400">{formatDate(inv.issueDate)}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right text-xs">
                                <span className="font-bold text-sm text-slate-800 dark:text-slate-200 block">
                                  {formatCurrency(inv.totalAmount)}
                                </span>
                                <span className="text-amber-600 dark:text-amber-400">
                                  Due: {formatCurrency(inv.balanceDue ?? inv.totalAmount)}
                                </span>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-xs uppercase font-semibold ${
                                inv.paymentStatus === 'paid'
                                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                                  : inv.paymentStatus === 'partial'
                                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                                  : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
                              }`}>
                                {inv.paymentStatus || 'unpaid'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Payments Tab */}
                {activeTab === 'payments' && (
                  <div className="space-y-2">
                    {(!data?.payments || data.payments.length === 0) ? (
                      <p className="text-sm text-slate-400 py-8 text-center">No payments recorded for this customer.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                        {data.payments.map((p: any) => (
                          <div key={p.id} className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-slate-900 dark:text-white font-mono">
                                  {p.receiptNumber}
                                </span>
                                {p.isAdvance && (
                                  <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-semibold">
                                    ADVANCE
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-slate-400">
                                {formatDate(p.paymentDate)} • {p.paymentMethod || 'Bank Transfer'}
                              </span>
                            </div>
                            <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                              +{formatCurrency(p.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Ledger Tab */}
                {activeTab === 'ledger' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500">Official statement from party ledger</p>
                      <button
                        onClick={() => {
                          onClose();
                          navigate('/ledger?tab=customers');
                        }}
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        Open Full Statement
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="p-2.5">Date</th>
                            <th className="p-2.5">Voucher</th>
                            <th className="p-2.5">Particulars</th>
                            <th className="p-2.5 text-right">Debit</th>
                            <th className="p-2.5 text-right">Credit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {data?.ledgerEntries?.length > 0 ? (
                            data.ledgerEntries.slice(0, 10).map((l: any) => (
                              <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <td className="p-2.5 text-slate-600 dark:text-slate-400">{formatDate(l.entryDate)}</td>
                                <td className="p-2.5 font-mono text-slate-700 dark:text-slate-300">
                                  {safeVoucherType(l.voucherType)} #{l.voucherNo}
                                </td>
                                <td className="p-2.5 text-slate-700 dark:text-slate-300 max-w-xs truncate">{l.particulars}</td>
                                <td className="p-2.5 text-right font-medium text-slate-900 dark:text-white">
                                  {l.debit > 0 ? formatCurrency(l.debit) : '—'}
                                </td>
                                <td className="p-2.5 text-right font-medium text-emerald-600 dark:text-emerald-400">
                                  {l.credit > 0 ? formatCurrency(l.credit) : '—'}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="p-4 text-center text-slate-400">No ledger entries found.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
