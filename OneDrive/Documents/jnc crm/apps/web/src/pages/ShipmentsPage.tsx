/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Truck, Search, Plus, RefreshCw, X, CheckCircle2, Clock, ExternalLink,
  Package, MapPin, Phone, User, Calendar, ShieldCheck, ChevronRight,
  Copy, Check, Eye, Edit3, Link2, Globe
} from 'lucide-react';
import { ordersApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ErrorStateCard, parseApiError } from '../components/common/ErrorStateCard';

export default function ShipmentsPage() {
  const { user } = useAuth();
  const [shipments, setShipments] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status?: number; message: string; isNetworkError: boolean } | null>(null);
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
  const [copiedAwb, setCopiedAwb] = useState<string | null>(null);

  // Viewing Shipment in Live Tracking Viewer Modal
  const [viewingShipment, setViewingShipment] = useState<any | null>(null);
  const [isSyncingTracking, setIsSyncingTracking] = useState(false);

  // Edit / Add Tracking Link Modal
  const [editingShipment, setEditingShipment] = useState<any | null>(null);
  const [editCourierName, setEditCourierName] = useState('');
  const [editTrackingNumber, setEditTrackingNumber] = useState('');
  const [editTrackingUrl, setEditTrackingUrl] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

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

  const handleCopyAwb = (awb: string) => {
    navigator.clipboard.writeText(awb);
    setCopiedAwb(awb);
    setTimeout(() => setCopiedAwb(null), 2000);
  };

  const generateAwbNumber = () => {
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000);
    return `AWB${randomDigits}`;
  };

  const handleOpenCreateModal = () => {
    if (!trackingNumber) {
      setTrackingNumber(generateAwbNumber());
    }
    setShowCreateModal(true);
  };

  const handleOpenEditModal = (s: any) => {
    setEditingShipment(s);
    setEditCourierName(s.courierName || 'DTDC Express');
    setEditTrackingNumber(s.trackingNumber || '');
    setEditTrackingUrl(s.trackingUrl || '');
  };

  const fetchShipments = async () => {
    try {
      setLoading(true);
      const params: Record<string, any> = { limit: 100 };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await ordersApi.listShipments(params);
      setShipments(data.items || []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load shipments', err);
      setError(parseApiError(err));
      setShipments([]);
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

  const handleSaveTrackingLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShipment) return;
    try {
      setSavingEdit(true);
      await ordersApi.updateShipment(editingShipment.id, {
        courierName: editCourierName,
        trackingNumber: editTrackingNumber,
        trackingUrl: editTrackingUrl || undefined,
      });

      // Background sync to read live status from link immediately
      if (editTrackingUrl) {
        try {
          await ordersApi.syncShipmentTracking(editingShipment.id);
        } catch {
          // ignore background sync errors
        }
      }

      await fetchShipments();
      setEditingShipment(null);
      setInAppPopup({
        show: true,
        type: 'success',
        title: 'Tracking Details Updated',
        message: 'Courier tracking link saved and live status checked.',
      });
    } catch (err: any) {
      setInAppPopup({
        show: true,
        type: 'error',
        title: 'Failed to Save Tracking',
        message: err?.response?.data?.message || err.message,
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSyncTracking = async (shipmentId: string) => {
    try {
      setIsSyncingTracking(true);
      const { data } = await ordersApi.syncShipmentTracking(shipmentId);
      await fetchShipments();
      if (viewingShipment && viewingShipment.id === shipmentId) {
        setViewingShipment(data);
      }
      setInAppPopup({
        show: true,
        type: 'success',
        title: 'Live Tracking Synchronized',
        message: `Status read from courier: ${(data.status || 'in_transit').replace('_', ' ').toUpperCase()}`,
      });
    } catch (err: any) {
      setInAppPopup({
        show: true,
        type: 'error',
        title: 'Sync Failed',
        message: err?.response?.data?.message || 'Could not fetch live status from courier link.',
      });
    } finally {
      setIsSyncingTracking(false);
    }
  };

  const handleUpdateStatus = async (shipmentId: string, newStatus: string) => {
    const previous = shipments.find((s) => s.id === shipmentId);
    const previousStatus = previous?.status;

    // 1. Optimistic UI update (updates immediately in table)
    setShipments((prev) =>
      prev.map((s) =>
        s.id === shipmentId
          ? {
              ...s,
              status: newStatus,
              deliveredAt: newStatus === 'delivered' ? new Date().toISOString() : null,
            }
          : s
      )
    );

    if (viewingShipment && viewingShipment.id === shipmentId) {
      setViewingShipment((prev: any) => ({
        ...prev,
        status: newStatus,
        deliveredAt: newStatus === 'delivered' ? new Date().toISOString() : null,
      }));
    }

    try {
      await ordersApi.updateShipmentStatus(shipmentId, newStatus);
      fetchShipments();
      setInAppPopup({
        show: true,
        type: 'success',
        title: 'Delivery Status Updated',
        message: `Shipment status set to: ${newStatus.replace('_', ' ').toUpperCase()}`,
      });
    } catch (err: any) {
      // Revert optimistic update on failure
      if (previousStatus) {
        setShipments((prev) =>
          prev.map((s) => (s.id === shipmentId ? { ...s, status: previousStatus } : s))
        );
      }
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
            onClick={handleOpenCreateModal}
            className="btn bg-crm-teal hover:bg-crm-teal-hover text-black font-bold text-xs gap-1.5 shadow-glow-teal"
          >
            <Truck size={15} /> Create Shipment / Dispatch
          </button>
        </div>
      </div>

      {/* ─── CONTROLS: SEARCH & STATUS FILTER ──────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            className="input pl-9 text-xs"
            placeholder="Search by AWB, shipment #, order #, courier or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/10">
          {[
            { id: 'all', label: 'All Dispatches' },
            { id: 'dispatched', label: 'Dispatched' },
            { id: 'in_transit', label: 'In Transit' },
            { id: 'delivered', label: 'Delivered' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                statusFilter === tab.id
                  ? 'bg-crm-teal text-black shadow-sm'
                  : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
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
                      <MapPin size={10} className="text-slate-500 shrink-0" />
                      <span className="truncate max-w-[180px]">{s.order?.shippingAddress || 'India'}</span>
                    </p>
                  </div>
                </td>
                <td>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-slate-950 dark:text-slate-200">{s.courierName}</p>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(s)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 transition cursor-pointer"
                        title="Edit courier name or tracking link"
                      >
                        <Edit3 size={11} />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="font-mono text-[11px] text-teal-700 dark:text-crm-teal font-bold">{s.trackingNumber}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyAwb(s.trackingNumber)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 transition cursor-pointer"
                        title="Copy AWB number"
                      >
                        {copiedAwb === s.trackingNumber ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                      </button>
                    </div>
                    {s.trackingUrl ? (
                      <div className="flex items-center gap-2 mt-1.5">
                        <button
                          type="button"
                          onClick={() => setViewingShipment(s)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-50 dark:bg-crm-teal/15 text-teal-800 dark:text-crm-teal border border-teal-300 dark:border-crm-teal/30 text-[10.5px] font-bold hover:bg-teal-100 dark:hover:bg-crm-teal/25 transition shadow-sm cursor-pointer"
                          title="View and read live courier tracking inside CRM"
                        >
                          <Eye size={11} /> View & Read
                        </button>
                        <a
                          href={s.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10.5px] font-bold text-slate-500 hover:text-teal-600 dark:hover:text-crm-teal transition"
                          title="Open live tracking website in new tab"
                        >
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(s)}
                        className="inline-flex items-center gap-1 text-[10.5px] font-bold text-teal-600 dark:text-crm-teal hover:underline mt-1 cursor-pointer"
                      >
                        <Link2 size={10} /> + Add Tracking Link
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  <span className={`capitalize px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1.5 ${
                    s.status === 'delivered'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30'
                      : s.status === 'in_transit'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30'
                      : 'bg-blue-100 text-blue-800 dark:bg-crm-blue/15 dark:text-crm-blue-light border border-blue-300 dark:border-crm-blue/30'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      s.status === 'delivered' ? 'bg-emerald-500' : s.status === 'in_transit' ? 'bg-amber-500 animate-pulse' : 'bg-blue-500'
                    }`}></span>
                    {s.status ? s.status.replace(/_/g, ' ') : 'dispatched'}
                  </span>
                </td>
                <td className="text-slate-700 dark:text-slate-400 text-xs font-mono font-bold">
                  {s.deliveredAt ? format(new Date(s.deliveredAt), 'dd MMM yyyy') : '—'}
                </td>
                <td className="text-right">
                  <select
                    className="input text-[11px] py-1 px-2 w-32 font-bold cursor-pointer bg-white dark:bg-[#1E2230]"
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
        {loading && !error && (
          <div className="py-12 px-4 text-center">
            <RefreshCw size={24} className="animate-spin text-crm-blue mx-auto mb-2" />
            <p className="text-xs text-slate-500">Loading shipments...</p>
          </div>
        )}
        {error && shipments.length === 0 && (
          <div className="p-6">
            <ErrorStateCard
              message={error.message}
              status={error.status}
              isNetworkError={error.isNetworkError}
              onRetry={fetchShipments}
            />
          </div>
        )}
        {!loading && !error && shipments.length === 0 && (
          <div className="py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-3">
              <Truck size={24} />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">No shipments dispatched yet</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Click &quot;Create Shipment / Dispatch&quot; to log your first courier dispatch.
            </p>
          </div>
        )}
      </div>

      {/* ─── MODAL: Live Courier Tracking Viewer ───────────────────────── */}
      <AnimatePresence>
        {viewingShipment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="bg-white dark:bg-[#151824] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-crm-teal/20 text-crm-teal flex items-center justify-center">
                    <Truck size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-950 dark:text-white">
                        {viewingShipment.courierName} Tracking
                      </h2>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-teal-50 dark:bg-crm-teal/15 text-teal-800 dark:text-crm-teal font-bold border border-teal-200 dark:border-crm-teal/30">
                        {viewingShipment.trackingNumber}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Order #{viewingShipment.order?.orderNumber} • {viewingShipment.order?.customerName}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {viewingShipment.trackingUrl && (
                    <a
                      href={viewingShipment.trackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn bg-white dark:bg-white/10 hover:bg-slate-100 text-slate-700 dark:text-white border border-slate-300 dark:border-white/10 text-xs py-1.5 px-3 font-bold gap-1.5 shadow-sm"
                    >
                      <span>Open in Official Portal</span>
                      <ExternalLink size={12} />
                    </a>
                  )}
                  <button
                    onClick={() => setViewingShipment(null)}
                    className="w-8 h-8 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Status & Control Banner */}
              <div className="p-4 border-b border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131622] flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Current Status:</span>
                  <span className={`capitalize px-3 py-1 rounded-lg text-xs font-black inline-flex items-center gap-1.5 shadow-sm ${
                    viewingShipment.status === 'delivered'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/40'
                      : viewingShipment.status === 'in_transit'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-300 dark:border-amber-500/40'
                      : 'bg-blue-100 text-blue-800 dark:bg-crm-blue/20 dark:text-crm-blue-light border border-blue-300 dark:border-crm-blue/40'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      viewingShipment.status === 'delivered' ? 'bg-emerald-500' : viewingShipment.status === 'in_transit' ? 'bg-amber-500 animate-pulse' : 'bg-blue-500'
                    }`}></span>
                    {viewingShipment.status ? viewingShipment.status.replace(/_/g, ' ') : 'dispatched'}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Read / Sync from courier link */}
                  <button
                    onClick={() => handleSyncTracking(viewingShipment.id)}
                    disabled={isSyncingTracking}
                    className="btn bg-blue-50 hover:bg-blue-100 dark:bg-crm-blue/20 dark:hover:bg-crm-blue/30 text-blue-800 dark:text-crm-blue-light border border-blue-300 dark:border-crm-blue/40 text-xs py-1.5 px-3 font-bold gap-1.5 shadow-sm disabled:opacity-50"
                    title="Automatically read live status from courier link"
                  >
                    <RefreshCw size={12} className={isSyncingTracking ? 'animate-spin' : ''} />
                    <span>{isSyncingTracking ? 'Reading Link...' : 'Read Status from Link'}</span>
                  </button>

                  {/* Quick Status Buttons */}
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#1E2230] p-1 rounded-xl border border-slate-200 dark:border-[#2A3042]">
                    <button
                      onClick={() => handleUpdateStatus(viewingShipment.id, 'dispatched')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        viewingShipment.status === 'dispatched'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Dispatched
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(viewingShipment.id, 'in_transit')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        viewingShipment.status === 'in_transit'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      In Transit
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(viewingShipment.id, 'delivered')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        viewingShipment.status === 'delivered'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Delivered
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Tracking Link Bar */}
              <div className="p-3 bg-slate-50 dark:bg-[#10131C] border-b border-slate-200 dark:border-[#2A3042] flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                  <Globe size={14} className="text-teal-500 shrink-0" />
                  <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">Tracking Link:</span>
                  {viewingShipment.trackingUrl ? (
                    <span className="font-mono text-teal-700 dark:text-crm-teal truncate">
                      {viewingShipment.trackingUrl}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">No direct tracking URL saved yet</span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {viewingShipment.trackingUrl && (
                    <button
                      onClick={() => handleCopyAwb(viewingShipment.trackingUrl)}
                      className="btn-ghost text-xs py-1 px-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white gap-1 font-bold"
                      title="Copy link"
                    >
                      <Copy size={11} /> Copy
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const cur = viewingShipment;
                      setViewingShipment(null);
                      handleOpenEditModal(cur);
                    }}
                    className="btn-ghost text-xs py-1 px-2 text-teal-600 dark:text-crm-teal hover:underline gap-1 font-bold"
                  >
                    <Edit3 size={11} /> {viewingShipment.trackingUrl ? 'Edit Link' : 'Add Link'}
                  </button>
                </div>
              </div>

              {/* Embedded Frame or Live View */}
              <div className="flex-1 bg-slate-900/90 dark:bg-[#0A0C13] p-4 overflow-hidden flex flex-col min-h-[380px]">
                {viewingShipment.trackingUrl ? (
                  <div className="flex-1 rounded-xl overflow-hidden border border-slate-700 relative bg-white">
                    <iframe
                      src={viewingShipment.trackingUrl}
                      title="Live Courier Tracker"
                      className="w-full h-full border-0 min-h-[360px]"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3 text-slate-500">
                      <Globe size={24} />
                    </div>
                    <p className="text-sm font-bold text-white">No Tracking Link Configured</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      Click &quot;+ Add Tracking Link Now&quot; to paste the tracking link from {viewingShipment.courierName}.
                    </p>
                    <button
                      onClick={() => {
                        const cur = viewingShipment;
                        setViewingShipment(null);
                        handleOpenEditModal(cur);
                      }}
                      className="btn bg-crm-teal hover:bg-crm-teal-hover text-black font-bold text-xs mt-3 px-4 py-1.5"
                    >
                      + Add Tracking Link Now
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL: Edit / Add Tracking Link ───────────────────────────── */}
      <AnimatePresence>
        {editingShipment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-crm-teal/20 text-crm-teal flex items-center justify-center">
                    <Link2 size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-950 dark:text-white">
                      Edit Courier & Tracking Link
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Shipment #{editingShipment.shipmentNumber}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingShipment(null)}
                  className="w-7 h-7 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveTrackingLink} className="p-5 space-y-4">
                <div>
                  <label className="label">Courier Partner *</label>
                  <input
                    className="input text-xs"
                    value={editCourierName}
                    onChange={(e) => setEditCourierName(e.target.value)}
                    placeholder="e.g. DTDC Express, Blue Dart, Delhivery"
                    required
                  />
                </div>

                <div>
                  <label className="label">AWB / Tracking Number *</label>
                  <input
                    className="input text-xs font-mono"
                    value={editTrackingNumber}
                    onChange={(e) => setEditTrackingNumber(e.target.value)}
                    placeholder="AWB..."
                    required
                  />
                </div>

                <div>
                  <label className="label">Live Tracking Link (Another Company Tracking URL)</label>
                  <input
                    type="url"
                    className="input text-xs font-mono"
                    placeholder="https://track.courier.com/..."
                    value={editTrackingUrl}
                    onChange={(e) => setEditTrackingUrl(e.target.value)}
                  />
                  <p className="text-[10.5px] text-slate-500 mt-1">
                    Paste the courier tracking link. The CRM will read and show the live status both inside the viewer and out there in the table.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                  <button
                    type="button"
                    onClick={() => setEditingShipment(null)}
                    className="btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="btn bg-crm-teal hover:bg-crm-teal-hover text-black font-bold text-xs px-5 shadow-glow-teal"
                  >
                    {savingEdit ? 'Saving...' : 'Save Tracking Link'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                    onChange={(e) => {
                      setSelectedOrderId(e.target.value);
                      if (e.target.value && !trackingNumber) {
                        setTrackingNumber(generateAwbNumber());
                      }
                    }}
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
                      placeholder="Enter courier partner name"
                      value={courierName}
                      onChange={(e) => setCourierName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="label mb-0">AWB / Tracking Number *</label>
                      <button
                        type="button"
                        onClick={() => setTrackingNumber(generateAwbNumber())}
                        className="text-[11px] font-bold text-teal-600 dark:text-crm-teal hover:underline flex items-center gap-1 cursor-pointer"
                        title="Auto-generate tracking number"
                      >
                        <RefreshCw size={11} /> Auto Fill
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        className="input text-xs font-mono pr-16"
                        placeholder="e.g. AWB123456789"
                        value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setTrackingNumber(generateAwbNumber())}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-slate-300 rounded border border-slate-300 dark:border-white/10 transition"
                        title="Click to auto generate"
                      >
                        Auto
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="label">Live Tracking URL (Optional)</label>
                  <input
                    type="url"
                    className="input text-xs font-mono"
                    placeholder="https://track.courier.com/..."
                    value={trackingUrl}
                    onChange={(e) => setTrackingUrl(e.target.value)}
                  />
                  <p className="text-[10.5px] text-slate-500 mt-1">
                    Paste another company's tracking link to view and read live delivery updates inside the CRM.
                  </p>
                </div>

                <div>
                  <label className="label">Dispatch Notes</label>
                  <textarea
                    className="input text-xs w-full min-h-[60px] resize-none"
                    placeholder="Enter dispatch notes or delivery instructions..."
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
                      : 'bg-red-500/15 text-rose-600 dark:text-crm-coral border border-red-500/30'
                  }`}
                >
                  {inAppPopup.type === 'success' ? <CheckCircle2 size={32} /> : <X size={32} />}
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-950 dark:text-white">{inAppPopup.title}</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300 mt-1.5 leading-relaxed font-medium">{inAppPopup.message}</p>
              </div>

              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setInAppPopup({ ...inAppPopup, show: false })}
                  className={`btn text-xs font-bold px-7 py-2.5 rounded-xl shadow-md transition-all ${
                    inAppPopup.type === 'success'
                      ? 'bg-crm-teal hover:bg-crm-teal-hover text-black shadow-glow-teal'
                      : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20'
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
