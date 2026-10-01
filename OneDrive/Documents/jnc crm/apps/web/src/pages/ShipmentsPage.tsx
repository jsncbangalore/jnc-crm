import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Truck, Search, Plus, RefreshCw, X, CheckCircle2, Clock, ExternalLink,
  Package, MapPin, Phone, User, Calendar, ShieldCheck, ChevronRight
} from 'lucide-react';
import { ordersApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

export default function ShipmentsPage() {
  const { user } = useAuth();
  const [shipments, setShipments] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Create Shipment Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [courierName, setCourierName] = useState('DTDC Express');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [notes, setNotes] = useState('');

  const fetchShipments = async () => {
    try {
      setLoading(true);
      const params: Record<string, any> = { limit: 100 };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await ordersApi.listShipments(params);
      setShipments(data.items || []);
    } catch (err) {
      console.error('Failed to load shipments', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchConfirmedOrders = async () => {
    try {
      const { data } = await ordersApi.list({ limit: 100 });
      setOrders(data.items || []);
    } catch (err) {
      console.error('Failed to load orders', err);
    }
  };

  useEffect(() => {
    fetchConfirmedOrders();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      fetchShipments();
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, statusFilter]);

  // In-App Popup Feedback State (Replaces native browser alert & confirm)
  const [inAppPopup, setInAppPopup] = useState<{
    show: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
  }>({
    show: false,
    type: 'success',
    title: '',
    message: '',
  });

  const handleCreateShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderId || !courierName || !trackingNumber) {
      setInAppPopup({
        show: true,
        type: 'error',
        title: 'Missing Dispatch Details',
        message: 'Please select a confirmed order and enter courier name + tracking number.',
      });
      return;
    }

    setSubmitting(true);
    try {
      await ordersApi.createShipment({
        orderId: selectedOrderId,
        courierName,
        trackingNumber,
        trackingUrl: trackingUrl || undefined,
        notes: notes || undefined,
      });

      setShowCreateModal(false);
      setSelectedOrderId('');
      setTrackingNumber('');
      setTrackingUrl('');
      setNotes('');
      await fetchShipments();

      setInAppPopup({
        show: true,
        type: 'success',
        title: 'Shipment Dispatched Successfully',
        message: `Order dispatch registered under tracking AWB: ${trackingNumber}. Delivery tracking is now active.`,
      });
    } catch (err: any) {
      setInAppPopup({
        show: true,
        type: 'error',
        title: 'Failed to Dispatch',
        message: err?.response?.data?.message || err.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (shipmentId: string, newStatus: string) => {
    try {
      await ordersApi.updateShipmentStatus(shipmentId, newStatus);
      await fetchShipments();
      setInAppPopup({
        show: true,
        type: 'success',
        title: 'Delivery Status Updated',
        message: `Shipment status updated to: ${newStatus.toUpperCase()}`,
      });
    } catch (err: any) {
      setInAppPopup({
        show: true,
        type: 'error',
        title: 'Update Failed',
        message: err?.response?.data?.message || err.message,
      });
    }
  };

  return (
    <div className="space-y-5">
      {/* ─── HEADER ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-950 dark:text-white">Logistics & Shipments</h1>
          <p className="text-slate-700 dark:text-slate-400 font-medium text-sm mt-0.5">
            Real-time courier dispatch tracking, delivery updates & milestone notifications
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn bg-crm-teal hover:bg-crm-teal-hover text-black font-bold text-xs gap-1.5 shadow-glow-teal"
          >
            <Truck size={15} /> Create Shipment / Dispatch
          </button>

          <button onClick={fetchShipments} className="btn-ghost text-xs gap-1" title="Refresh">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ─── CONTROLS ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9 text-xs"
              placeholder="Search shipment number, tracking AWB, courier, client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141722] p-1 rounded-xl border border-slate-200 dark:border-[#2A3042]">
            {['all', 'dispatched', 'in_transit', 'delivered'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                  statusFilter === st
                    ? 'bg-crm-teal text-black font-bold shadow-glow-teal'
                    : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 font-bold'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── SHIPMENTS TABLE ───────────────────────────────────────────────── */}
      <div className="table-wrapper">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Shipment #</th>
              <th>Dispatch Date</th>
              <th>Order #</th>
              <th>Client & Destination</th>
              <th>Courier & Tracking</th>
              <th>Delivery Status</th>
              <th>Delivered On</th>
              <th className="text-right">Update Status</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                <td className="font-mono text-xs font-bold text-teal-700 dark:text-crm-teal">
                  {s.shipmentNumber}
                </td>
                <td className="text-slate-700 dark:text-slate-400 text-xs font-mono font-bold whitespace-nowrap">
                  {format(new Date(s.dispatchedAt), 'dd MMM yyyy')}
                </td>
                <td className="font-mono text-xs text-blue-700 dark:text-crm-blue-light font-bold">
                  {s.order?.orderNumber}
                </td>
                <td>
                  <div>
                    <p className="font-bold text-slate-950 dark:text-white text-xs">{s.order?.customerName}</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1 font-medium">
                      <MapPin size={10} className="text-slate-500" /> {s.order?.shippingAddress || 'India'}
                    </p>
                  </div>
                </td>
                <td>
                  <div>
                    <p className="text-xs font-bold text-slate-950 dark:text-slate-200">{s.courierName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-[11px] text-teal-700 dark:text-crm-teal font-bold">{s.trackingNumber}</span>
                      {s.trackingUrl && (
                        <a
                          href={s.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                          title="Open Tracking Link"
                        >
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`capitalize px-2 py-0.5 rounded text-[10px] font-bold ${
                    s.status === 'delivered'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30'
                      : s.status === 'in_transit'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30'
                      : 'bg-blue-100 text-blue-800 dark:bg-crm-blue/15 dark:text-crm-blue-light border border-blue-300 dark:border-crm-blue/30'
                  }`}>
                    {s.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="text-slate-700 dark:text-slate-400 text-xs font-mono font-bold">
                  {s.deliveredAt ? format(new Date(s.deliveredAt), 'dd MMM yyyy') : '—'}
                </td>
                <td className="text-right">
                  <select
                    className="input text-[11px] py-1 px-2 w-32 font-bold"
                    value={s.status}
                    onChange={(e) => handleUpdateStatus(s.id, e.target.value)}
                  >
                    <option value="dispatched">Dispatched</option>
                    <option value="in_transit">In Transit</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── MODAL: Create Shipment ────────────────────────────────────────── */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-crm-teal/20 text-crm-teal flex items-center justify-center">
                    <Truck size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-950 dark:text-white">Create Order Dispatch</h2>
                    <p className="text-xs text-slate-400">Attach courier & tracking information to an order</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="w-7 h-7 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateShipment} className="p-6 space-y-4">
                <div>
                  <label className="label">Select Confirmed Order *</label>
                  <select
                    className="input text-xs font-medium"
                    value={selectedOrderId}
                    onChange={(e) => setSelectedOrderId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Order to Dispatch --</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.orderNumber} - {o.customerName} (₹{o.totalAmount.toLocaleString('en-IN')})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Courier Partner *</label>
                    <input
                      className="input text-xs"
                      placeholder="e.g. DTDC Express, Blue Dart, VRL"
                      value={courierName}
                      onChange={(e) => setCourierName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">AWB / Tracking Number *</label>
                    <input
                      className="input text-xs font-mono"
                      placeholder="e.g. D12345678"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Live Tracking URL (Optional)</label>
                  <input
                    type="url"
                    className="input text-xs font-mono"
                    placeholder="https://track.dtdc.com/..."
                    value={trackingUrl}
                    onChange={(e) => setTrackingUrl(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">Dispatch Notes</label>
                  <textarea
                    className="input text-xs w-full min-h-[60px] resize-none"
                    placeholder="Box count, vehicle number, driver contact..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn bg-crm-teal hover:bg-crm-teal-hover text-black font-bold text-xs px-5 shadow-glow-teal"
                  >
                    {submitting ? 'Dispatching...' : 'Dispatch Shipment'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── IN-APP FEEDBACK POPUP MODAL ────────────────────────────────────── */}
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
                      : 'bg-red-500/15 text-crm-coral border border-red-500/30'
                  }`}
                >
                  {inAppPopup.type === 'success' ? <CheckCircle2 size={32} /> : <X size={32} />}
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-950 dark:text-white">{inAppPopup.title}</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{inAppPopup.message}</p>
              </div>

              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => setInAppPopup({ ...inAppPopup, show: false })}
                  className={`btn text-xs font-bold px-6 ${
                    inAppPopup.type === 'success'
                      ? 'bg-crm-teal hover:bg-crm-teal-hover text-black shadow-glow-teal'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  Got It
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
