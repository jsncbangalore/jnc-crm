import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Plus, FileText, Receipt, CheckCircle, RefreshCw, Edit3, CreditCard, MoreVertical } from 'lucide-react';
import { ordersApi, invoicesApi } from '../services/api';
import { Order, Invoice } from '../types';
import { OrderStatusBadge } from '../components/ui/Badge';
import { format } from 'date-fns';
import InvoiceModal from '../components/invoices/InvoiceModal';
import CreateOrderModal from '../components/orders/CreateOrderModal';
import EditOrderModal from '../components/orders/EditOrderModal';
import UnifiedRecordPaymentModal from '../components/common/UnifiedRecordPaymentModal';
import CustomerAccountModal from '../components/common/CustomerAccountModal';
import RelatedDocumentsPanel from '../components/common/RelatedDocumentsPanel';
import DropdownPortal from '../components/common/DropdownPortal';
import { useAllowedPages } from '../hooks/useAllowedPages';
import { useAuth } from '../contexts/AuthContext';
import { ErrorStateCard, parseApiError } from '../components/common/ErrorStateCard';

interface OrderRowActionsProps {
  order: Order;
  onPay: (order: Order) => void;
  onEdit: (order: Order) => void;
  onViewInvoice?: (id: string, inv: any) => void;
  onGenerateInvoice?: (orderId: string) => void;
  isGeneratingInvoice?: boolean;
  activeInv?: any;
  hasInvoicesPage: boolean;
}

function OrderRowActions({
  order,
  onPay,
  onEdit,
  onViewInvoice,
  onGenerateInvoice,
  isGeneratingInvoice,
  activeInv,
  hasInvoicesPage,
}: OrderRowActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isEligibleForInvoice = order.status !== 'cancelled';

  return (
    <div className="relative inline-flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
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
        title="Order Actions"
        aria-label={`Actions for order ${order.orderNumber}`}
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
        className="w-48 py-1.5 bg-white dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] rounded-xl shadow-xl text-xs z-50 text-left"
      >
        <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-[#2A3042] flex items-center justify-between">
          <span className="font-mono text-slate-700 dark:text-slate-300 font-bold truncate max-w-[110px]">{order.orderNumber}</span>
          <span className="text-slate-400">Actions</span>
        </div>

        {/* Record Payment */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
            onPay(order);
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors font-medium cursor-pointer"
        >
          <CreditCard size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Pay</span>
        </button>

        {/* Edit Order */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
            onEdit(order);
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors font-medium cursor-pointer"
        >
          <Edit3 size={14} className="text-crm-blue shrink-0" />
          <span>Edit</span>
        </button>

        {/* View / Generate Invoice */}
        {activeInv && hasInvoicesPage ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
              onViewInvoice?.(activeInv.id, activeInv);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-crm-blue-light hover:bg-crm-blue/10 transition-colors font-medium cursor-pointer"
          >
            <FileText size={14} className="text-crm-blue-light shrink-0" />
            <span>View Invoice</span>
          </button>
        ) : isEligibleForInvoice && hasInvoicesPage ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
              onGenerateInvoice?.(order.id);
            }}
            disabled={isGeneratingInvoice}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-crm-amber hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors font-medium cursor-pointer disabled:opacity-50"
          >
            <Receipt size={14} className="text-crm-amber shrink-0" />
            <span>{isGeneratingInvoice ? 'Generating...' : 'Generate Invoice'}</span>
          </button>
        ) : null}
      </DropdownPortal>
    </div>
  );
}

export default function OrdersPage() {
  const { user } = useAuth();
  const { hasPage } = useAllowedPages();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status?: number; message: string; isNetworkError: boolean } | null>(null);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(() => {
    const f = searchParams.get('filter');
    if (f === 'pending') return 'processing';
    if (f === 'ready') return 'dispatched';
    return '';
  });

  useEffect(() => {
    const f = searchParams.get('filter');
    if (f === 'pending') setStatusFilter('processing');
    if (f === 'ready') setStatusFilter('dispatched');
    if (searchParams.get('action') === 'create') {
      setShowCreateModal(true);
    }
    const q = searchParams.get('search');
    if (q != null) setSearch(q);
  }, [searchParams]);

  // Customer Account Modal State & Expanded Chain
  const [accountCustomerId, setAccountCustomerId] = useState<string | null>(null);
  const [accountCustomerName, setAccountCustomerName] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Create & Edit Order Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<Order | null>(null);

  // Invoice Modal state
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [generatingOrderId, setGeneratingOrderId] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const { data } = await ordersApi.list({ search, status: statusFilter, limit: 100 });
      setOrders(data.items || []);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(parseApiError(err));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(fetchOrders, search ? 400 : 0);
    return () => clearTimeout(t);
  }, [search, statusFilter]);

  const handleGenerateInvoice = async (orderId: string) => {
    setGeneratingOrderId(orderId);
    try {
      const { data } = await invoicesApi.generateFromOrder(orderId, {
        paymentTerms: 'Due on Receipt (Net 30 Days)',
      });
      setActiveInvoice(data);
      await fetchOrders();
    } catch (err: any) {
      alert('Failed to generate invoice: ' + (err?.response?.data?.message || err.message));
    } finally {
      setGeneratingOrderId(null);
    }
  };

  const handleViewInvoice = async (invoiceId: string, fallbackInv?: Invoice) => {
    try {
      const { data } = await invoicesApi.get(invoiceId);
      setActiveInvoice(data);
    } catch (err: any) {
      if (fallbackInv) {
        setActiveInvoice(fallbackInv);
      } else {
        alert('Failed to open invoice: ' + (err?.response?.data?.message || err.message));
      }
    }
  };

  if (error && orders.length === 0) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 select-none">
        <ErrorStateCard
          message={error.message}
          status={error.status}
          isNetworkError={error.isNetworkError}
          onRetry={fetchOrders}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-950 dark:text-white">Orders & Tax Invoicing</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {orders.length} Confirmed orders with automated stock reservation & {user?.tenant?.state ? `${user.tenant.state} ` : ''}GST invoices
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary text-xs gap-1.5 shadow-glow-blue"
        >
          <Plus size={15} /> New Order
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-9 text-xs"
            placeholder="Search order #, customer, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-44 text-xs"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="processing">Processing</option>
          <option value="dispatched">Dispatched</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="crm-table text-xs w-full">
          <thead>
            <tr>
              <th className="px-2.5 sm:px-3 py-2.5 whitespace-nowrap">Order #</th>
              <th className="px-2.5 sm:px-3 py-2.5 max-w-[160px]">Customer</th>
              <th className="px-2.5 sm:px-3 py-2.5 max-w-[160px]">Equipment Items</th>
              <th className="px-2.5 sm:px-3 py-2.5 whitespace-nowrap">Taxable & Total</th>
              <th className="px-2.5 sm:px-3 py-2.5 whitespace-nowrap">Tax Invoice</th>
              <th className="px-2.5 sm:px-3 py-2.5 whitespace-nowrap">Payment</th>
              <th className="px-2.5 sm:px-3 py-2.5 whitespace-nowrap">Status</th>
              <th className="px-2.5 sm:px-3 py-2.5 whitespace-nowrap">Shipment</th>
              <th className="px-2.5 sm:px-3 py-2.5 whitespace-nowrap">Date</th>
              <th className="px-2.5 sm:px-3 py-2.5 text-right whitespace-nowrap w-12">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, i) => {
              const activeInv = order.invoices && order.invoices.length > 0 ? order.invoices[0] : null;
              const isEligibleForInvoice = order.status !== 'cancelled';

              return (
                <React.Fragment key={order.id}>
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    <td className="px-2.5 sm:px-3 py-2.5 font-mono text-xs text-crm-amber font-bold whitespace-nowrap">
                      <button
                        onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                        className="hover:underline text-left inline-flex items-center gap-1"
                        title="Click to view related document chain"
                      >
                        {order.orderNumber}
                      </button>
                    </td>
                    <td className="px-2.5 sm:px-3 py-2.5 max-w-[160px]">
                      <div className="truncate">
                        <button
                          onClick={() => {
                            const cid = (order as any).customerId || (order as any).lead?.companyId;
                            if (cid) {
                              setAccountCustomerId(cid);
                              setAccountCustomerName(order.customerName);
                            }
                          }}
                          className={`text-left font-bold text-xs truncate max-w-full block ${
                            (order as any).customerId || (order as any).lead?.companyId
                              ? 'text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer'
                              : 'text-slate-950 dark:text-white'
                          }`}
                          title={order.customerName}
                        >
                          {order.customerName}
                        </button>
                        <div className="text-[11px] text-slate-500 font-mono truncate">{order.customerPhone}</div>
                      </div>
                    </td>
                  <td className="px-2.5 sm:px-3 py-2.5 max-w-[160px] text-slate-300">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{order.lines?.length ?? 0} {order.lines?.length === 1 ? 'System' : 'Systems'}</div>
                    {order.lines?.[0]?.sku?.name && (
                      <span className="block text-[10px] text-slate-500 truncate max-w-[150px]" title={order.lines[0].sku.name}>
                        {order.lines[0].sku.name}
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 sm:px-3 py-2.5 whitespace-nowrap">
                    <div className="font-bold text-crm-amber tabular-nums">
                      ₹{order.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-[10px] text-slate-500">Incl. 18% GST</div>
                  </td>
                  <td className="px-2.5 sm:px-3 py-2.5 whitespace-nowrap">
                    {activeInv ? (
                      <button
                        onClick={() => handleViewInvoice(activeInv.id, activeInv)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-crm-teal/15 text-crm-teal hover:bg-crm-teal/25 border border-crm-teal/30 font-mono text-[10.5px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                        title="Click to view Tax Invoice"
                      >
                        <Receipt size={11} /> {activeInv.invoiceNumber}
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-500 italic whitespace-nowrap">Not generated</span>
                    )}
                  </td>
                  <td className="px-2.5 sm:px-3 py-2.5 whitespace-nowrap">
                    {order.paymentStatus === 'paid' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                        Paid Full
                      </span>
                    ) : (order.paidAmount && order.paidAmount > 0) ? (
                      <div className="flex flex-col items-start gap-1 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-500/15 text-crm-amber border border-amber-500/30 whitespace-nowrap">
                          Adv: ₹{order.paidAmount.toLocaleString('en-IN')}
                        </span>
                        <div className="text-[9.5px] text-slate-400 font-mono whitespace-nowrap">
                          Bal: ₹{(order.balanceAmount !== undefined && order.balanceAmount !== null ? order.balanceAmount : order.totalAmount - order.paidAmount).toLocaleString('en-IN')}
                        </div>
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-slate-500/15 text-slate-400 border border-slate-500/30 whitespace-nowrap">
                        Pending Adv
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 sm:px-3 py-2.5 whitespace-nowrap">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-2.5 sm:px-3 py-2.5 text-slate-400 text-xs whitespace-nowrap">
                    {order.shipments && order.shipments.length > 0 ? (
                      <span className="text-crm-teal font-mono text-[10px]">
                        {order.shipments[0].trackingNumber}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-2.5 sm:px-3 py-2.5 text-slate-500 text-[11px] whitespace-nowrap">
                    {format(new Date(order.confirmedAt), 'dd MMM yyyy')}
                  </td>
                  <td className="px-2.5 sm:px-3 py-2.5 text-right whitespace-nowrap w-12">
                    <OrderRowActions
                      order={order}
                      onPay={(o) => setSelectedOrderForPayment(o)}
                      onEdit={(o) => setEditingOrder(o)}
                      onViewInvoice={handleViewInvoice}
                      onGenerateInvoice={handleGenerateInvoice}
                      isGeneratingInvoice={generatingOrderId === order.id}
                      activeInv={activeInv}
                      hasInvoicesPage={hasPage('invoices')}
                    />
                  </td>
                </motion.tr>

                {/* Related Documents Row */}
                {expandedOrderId === order.id && (
                  <tr className="bg-slate-50/50 dark:bg-slate-900/40">
                    <td colSpan={10} className="p-4">
                      <RelatedDocumentsPanel type="order" id={order.id} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
            {loading && !error && (
              <tr>
                <td colSpan={10} className="text-center py-12 text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw size={14} className="animate-spin text-crm-blue" />
                    <span>Loading orders...</span>
                  </div>
                </td>
              </tr>
            )}
            {error && orders.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6">
                  <ErrorStateCard
                    message={error.message}
                    status={error.status}
                    isNetworkError={error.isNetworkError}
                    onRetry={fetchOrders}
                  />
                </td>
              </tr>
            )}
            {!loading && !error && orders.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-slate-500 py-12">
                  No orders found. Confirm an order to generate GST invoices.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invoice Viewer / Print / Email Modal */}
      {activeInvoice && (
        <InvoiceModal
          key={activeInvoice.id}
          invoice={activeInvoice}
          onClose={() => setActiveInvoice(null)}
          onInvoiceUpdated={fetchOrders}
        />
      )}

      {/* Unified Record Payment Modal for Order */}
      {selectedOrderForPayment && (
        <UnifiedRecordPaymentModal
          isOpen={!!selectedOrderForPayment}
          defaultOrderId={selectedOrderForPayment.id}
          defaultCustomerId={(selectedOrderForPayment as any).customerId}
          defaultCustomerName={selectedOrderForPayment.customerName}
          defaultAmount={selectedOrderForPayment.balanceAmount ?? (selectedOrderForPayment.totalAmount - (selectedOrderForPayment.paidAmount || 0))}
          onClose={() => setSelectedOrderForPayment(null)}
          onSuccess={() => {
            fetchOrders();
          }}
        />
      )}

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

      {/* Create Order Modal */}
      <CreateOrderModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onOrderCreated={() => {
          fetchOrders();
        }}
      />

      {/* Edit Order Modal */}
      <EditOrderModal
        isOpen={!!editingOrder}
        order={editingOrder}
        onClose={() => setEditingOrder(null)}
        onOrderUpdated={() => {
          fetchOrders();
        }}
      />
    </div>
  );
}
