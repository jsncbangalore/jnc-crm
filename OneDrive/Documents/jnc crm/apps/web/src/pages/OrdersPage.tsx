import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus, FileText, Receipt, CheckCircle, RefreshCw, Edit3, CreditCard } from 'lucide-react';
import { ordersApi, invoicesApi } from '../services/api';
import { Order, Invoice } from '../types';
import { OrderStatusBadge } from '../components/ui/Badge';
import { format } from 'date-fns';
import InvoiceModal from '../components/invoices/InvoiceModal';
import CreateOrderModal from '../components/orders/CreateOrderModal';
import EditOrderModal from '../components/orders/EditOrderModal';
import { RecordPaymentModal } from '../components/invoices/RecordPaymentModal';
import { ErrorStateCard, parseApiError } from '../components/common/ErrorStateCard';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status?: number; message: string; isNetworkError: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-950 dark:text-white">Orders & Tax Invoicing</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {orders.length} Confirmed orders with automated stock reservation & Karnataka GST invoices
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
        <table className="crm-table text-xs">
          <thead>
            <tr>
              <th className="whitespace-nowrap">Order #</th>
              <th>Customer</th>
              <th>Equipment Items</th>
              <th className="whitespace-nowrap">Taxable & Total</th>
              <th className="whitespace-nowrap">Tax Invoice</th>
              <th className="whitespace-nowrap">Payment</th>
              <th className="whitespace-nowrap">Status</th>
              <th className="whitespace-nowrap">Shipment</th>
              <th className="whitespace-nowrap">Date</th>
              <th className="text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, i) => {
              const activeInv = order.invoices && order.invoices.length > 0 ? order.invoices[0] : null;
              const isEligibleForInvoice = order.status !== 'cancelled';

              return (
                <motion.tr
                  key={order.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                >
                  <td className="font-mono text-xs text-crm-amber font-bold whitespace-nowrap">{order.orderNumber}</td>
                  <td>
                    <div className="font-bold text-slate-950 dark:text-white">{order.customerName}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{order.customerPhone}</div>
                  </td>
                  <td className="text-slate-300">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{order.lines?.length ?? 0} {order.lines?.length === 1 ? 'System' : 'Systems'}</div>
                    {order.lines?.[0]?.sku?.name && (
                      <span className="block text-[10px] text-slate-500 truncate max-w-[140px]" title={order.lines[0].sku.name}>
                        {order.lines[0].sku.name}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="font-bold text-crm-amber tabular-nums">
                      ₹{order.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-[10px] text-slate-500">Incl. 18% GST</div>
                  </td>
                  <td className="whitespace-nowrap">
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
                  <td className="whitespace-nowrap">
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
                  <td className="whitespace-nowrap">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="text-slate-400 text-xs whitespace-nowrap">
                    {order.shipments && order.shipments.length > 0 ? (
                      <span className="text-crm-teal font-mono text-[10px]">
                        {order.shipments[0].trackingNumber}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="text-slate-500 text-[11px] whitespace-nowrap">
                    {format(new Date(order.confirmedAt), 'dd MMM yyyy')}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      {/* Record Payment Button */}
                      <button
                        onClick={() => setSelectedOrderForPayment(order)}
                        className="btn-ghost text-[11px] py-1 px-2 text-emerald-400 hover:text-white border border-emerald-500/30 hover:bg-emerald-500/15 gap-1 whitespace-nowrap"
                        title="Record Advance Receipt or Final Balance Settlement"
                      >
                        <CreditCard size={12} /> Pay
                      </button>

                      {/* Edit Order Button */}
                      <button
                        onClick={() => setEditingOrder(order)}
                        className="btn-ghost text-[11px] py-1 px-2 text-slate-300 hover:text-white border border-slate-200 dark:border-[#2A3042] gap-1 whitespace-nowrap"
                        title="Edit Order Details & Items"
                      >
                        <Edit3 size={12} className="text-crm-blue" /> Edit
                      </button>

                      {activeInv ? (
                        <button
                          onClick={() => handleViewInvoice(activeInv.id, activeInv)}
                          className="btn-ghost text-[11px] py-1 px-2 text-crm-blue-light hover:text-white border border-slate-200 dark:border-[#2A3042] whitespace-nowrap"
                        >
                          <FileText size={12} /> View Invoice
                        </button>
                      ) : isEligibleForInvoice ? (
                        <button
                          onClick={() => handleGenerateInvoice(order.id)}
                          disabled={generatingOrderId === order.id}
                          className="btn bg-crm-amber/20 hover:bg-crm-amber/30 text-crm-amber border border-crm-amber/30 text-[11px] py-1 px-2.5 gap-1 shadow-glow-amber disabled:opacity-50 whitespace-nowrap"
                        >
                          <Receipt size={12} />
                          {generatingOrderId === order.id ? 'Generating...' : 'Generate Invoice'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </motion.tr>
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

      {/* Record Payment Modal for Order */}
      {selectedOrderForPayment && (
        <RecordPaymentModal
          isOpen={!!selectedOrderForPayment}
          order={selectedOrderForPayment}
          onClose={() => setSelectedOrderForPayment(null)}
          onSuccess={() => {
            fetchOrders();
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
