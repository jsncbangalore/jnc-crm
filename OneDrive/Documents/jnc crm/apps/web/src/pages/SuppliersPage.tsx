import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Phone, Mail, X, Edit3, Trash2, Building2, Clock, MapPin, FileText, CheckCircle2, Receipt, ChevronDown, ChevronUp, ExternalLink, ShoppingCart, Package } from 'lucide-react';
import { suppliersApi, inventoryApi } from '../services/api';
import { Supplier } from '../types';
import { useAuth } from '../contexts/AuthContext';
import SupplierPurchaseModal from '../components/inventory/SupplierPurchaseModal';

export default function SuppliersPage() {
  const { user } = useAuth();
  const canDelete = user?.role === 'tenant_admin' || user?.role === 'admin';
  const canManage = user?.role === 'tenant_admin' || user?.role === 'admin' || user?.role === 'sub_admin';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Purchase modal state
  const [purchaseSupplier, setPurchaseSupplier] = useState<any | null>(null);

  // Expanded purchase history per supplier
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [purchaseHistory, setPurchaseHistory] = useState<Record<string, any[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<string | null>(null);

  // Add Supplier Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    gstin: '',
    city: '',
    address: '',
    leadTimeDays: 7,
    notes: '',
  });

  // Edit Supplier Modal state
  const [editingSupplier, setEditingSupplier] = useState<any | null>(null);

  // Delete Supplier Modal state
  const [supplierToDelete, setSupplierToDelete] = useState<{ id: string; name: string } | null>(null);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const { data } = await suppliersApi.list({ search });
      setSuppliers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(fetchSuppliers, search ? 400 : 0);
    return () => clearTimeout(t);
  }, [search]);

  const toggleHistory = async (supplierId: string) => {
    if (expandedHistory === supplierId) {
      setExpandedHistory(null);
      return;
    }
    setExpandedHistory(supplierId);
    if (!purchaseHistory[supplierId]) {
      setLoadingHistory(supplierId);
      try {
        const { data } = await inventoryApi.getSupplierPurchases(supplierId);
        setPurchaseHistory(prev => ({ ...prev, [supplierId]: Array.isArray(data) ? data : [] }));
      } catch { } finally {
        setLoadingHistory(null);
      }
    }
  };

  // Create Supplier submit
  const handleCreateSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await suppliersApi.create(newSupplier);
      setShowAddModal(false);
      setNewSupplier({
        name: '',
        contactPerson: '',
        phone: '',
        email: '',
        gstin: '',
        city: '',
        address: '',
        leadTimeDays: 7,
        notes: '',
      });
      await fetchSuppliers();
    } catch (err: any) {
      alert('Failed to add supplier: ' + (err?.response?.data?.message || err.message));
    }
  };

  // Edit Supplier submit
  const handleUpdateSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier) return;
    try {
      await suppliersApi.update(editingSupplier.id, editingSupplier);
      setEditingSupplier(null);
      await fetchSuppliers();
    } catch (err: any) {
      alert('Failed to update supplier: ' + (err?.response?.data?.message || err.message));
    }
  };

  // Confirm Delete Supplier
  const handleConfirmDelete = async () => {
    if (!supplierToDelete) return;
    setDeletingId(supplierToDelete.id);
    try {
      await suppliersApi.delete(supplierToDelete.id);
      setSupplierToDelete(null);
      await fetchSuppliers();
    } catch (err: any) {
      alert('Failed to delete supplier: ' + (err?.response?.data?.message || err.message));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-950 dark:text-white">Supplier Companies</h1>
          <p className="text-slate-700 dark:text-slate-400 font-medium text-sm mt-0.5">
            {suppliers.filter((s) => s.isActive).length} Active component vendors & distributors
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="btn bg-crm-violet hover:bg-crm-violet-hover text-white shadow-glow-violet text-xs gap-1.5 font-bold"
          >
            <Plus size={15} /> Add Supplier
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          className="input pl-9 text-xs"
          placeholder="Search supplier name, contact, city, GSTIN..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Supplier Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {suppliers.map((sup, i) => (
          <motion.div
            key={sup.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="card hover:border-crm-violet/40 transition-all flex flex-col justify-between shadow-sm"
          >
            <div>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-crm-violet/15 border border-crm-violet/30 flex items-center justify-center shrink-0">
                  <span className="text-crm-violet font-black text-base">
                    {sup.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`badge font-bold ${
                      sup.isActive
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-green-500/15 dark:text-green-400 border border-emerald-300 dark:border-green-500/30'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-500 border border-slate-300 dark:border-slate-500/30'
                    }`}
                  >
                    {sup.isActive ? 'Active' : 'Inactive'}
                  </span>

                  {canManage && (
                    <button
                      onClick={() =>
                        setEditingSupplier({
                          id: sup.id,
                          name: sup.name,
                          contactPerson: sup.contactPerson || '',
                          phone: sup.phone || '',
                          email: sup.email || '',
                          gstin: sup.gstin || '',
                          city: sup.city || '',
                          address: sup.address || '',
                          leadTimeDays: sup.leadTimeDays || 7,
                          notes: sup.notes || '',
                          isActive: sup.isActive,
                        })
                      }
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 hover:text-crm-blue transition-colors"
                      title="Edit Supplier"
                    >
                      <Edit3 size={13} />
                    </button>
                  )}

                  {canDelete && (
                    <button
                      onClick={() => setSupplierToDelete({ id: sup.id, name: sup.name })}
                      disabled={deletingId === sup.id}
                      className="p-1 rounded hover:bg-red-500/20 text-slate-600 dark:text-slate-400 hover:text-crm-coral transition-colors"
                      title="Delete Supplier"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              <h3 className="font-bold text-slate-950 dark:text-white text-base">{sup.name}</h3>
              {sup.contactPerson && (
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium mt-0.5">Contact: {sup.contactPerson}</p>
              )}
              {sup.city && (
                <p className="text-xs text-slate-700 dark:text-slate-400 font-medium mt-1 flex items-center gap-1">
                  <MapPin size={12} className="text-slate-500" /> {sup.city}
                </p>
              )}
              {sup.gstin && (
                <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400 font-semibold mt-1">GSTIN: {sup.gstin}</p>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-[#2A3042] space-y-2">
              <div className="flex items-center gap-4 flex-wrap">
                {sup.phone && (
                  <a
                    href={`tel:${sup.phone}`}
                    className="flex items-center gap-1 text-xs text-teal-700 dark:text-crm-teal font-bold hover:underline"
                  >
                    <Phone size={12} /> {sup.phone}
                  </a>
                )}
                {sup.email && (
                  <a
                    href={`mailto:${sup.email}`}
                    className="flex items-center gap-1 text-xs text-blue-700 dark:text-crm-blue font-bold hover:underline truncate max-w-[200px]"
                  >
                    <Mail size={12} /> {sup.email}
                  </a>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-400 font-medium pt-1">
                <span className="flex items-center gap-1">
                  <Clock size={12} className="text-slate-500" /> Lead time:{' '}
                  <strong className="text-slate-950 dark:text-slate-300 font-bold">{sup.leadTimeDays || 7} days</strong>
                </span>
                <span className="text-[11px] text-slate-700 dark:text-slate-400 font-bold">
                  {(sup as any)._count?.preferredSkus || 0} supplied SKUs
                </span>
              </div>

              {/* Record Purchase + History buttons */}
              {canManage && (
                <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                  <button
                    onClick={() => setPurchaseSupplier(sup)}
                    className="flex-1 btn bg-emerald-50 dark:bg-emerald-600/15 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 text-xs py-1.5 gap-1.5 font-bold shadow-sm"
                  >
                    <ShoppingCart size={13} /> Record Purchase
                  </button>
                  <button
                    onClick={() => toggleHistory(sup.id)}
                    className={`btn text-[11px] gap-1 border border-white/10 hover:bg-white/5 ${expandedHistory === sup.id ? 'text-crm-blue bg-crm-blue/10' : 'text-slate-400'}`}
                  >
                    <Receipt size={12} />
                    {expandedHistory === sup.id ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  </button>
                </div>
              )}

              {/* Purchase History Accordion */}
              {expandedHistory === sup.id && (
                <div className="mt-2 space-y-1.5 border-t border-slate-200 dark:border-[#2A3042] pt-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Purchase History</p>
                  {loadingHistory === sup.id && (
                    <p className="text-[10px] text-slate-400 animate-pulse">Loading...</p>
                  )}
                  {!loadingHistory && (purchaseHistory[sup.id] || []).length === 0 && (
                    <p className="text-[10px] text-slate-500">No purchases recorded yet</p>
                  )}
                  {(purchaseHistory[sup.id] || []).map((mov: any, idx: number) => (
                    <div key={mov.id} className="flex items-start gap-2 bg-white/3 rounded-lg px-2 py-1.5">
                      <Package size={10} className="text-slate-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-mono text-crm-blue truncate">{mov.sku?.skuCode}</p>
                        <p className="text-[9.5px] text-slate-400 truncate">{mov.sku?.name} · Qty: {mov.quantity}</p>
                        <p className="text-[9px] text-slate-500">{new Date(mov.createdAt).toLocaleDateString('en-IN')}</p>
                      </div>
                      {mov.documentUrl && (
                        <a
                          href={`/api/v1${mov.documentUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-crm-blue hover:text-crm-blue-light flex-shrink-0"
                          title="View GST Invoice"
                        >
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {!loading && suppliers.length === 0 && (
          <div className="col-span-3 text-center text-slate-500 py-16 card">
            <div className="flex flex-col items-center gap-2">
              <Building2 size={32} className="text-slate-600" />
              <p className="font-semibold text-slate-400">No supplier companies found</p>
              <p className="text-xs text-slate-500">
                Click <strong>"Add Supplier"</strong> to register your first component vendor.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ─── MODAL: Add New Supplier ────────────────────────────────────── */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                <h2 className="text-base font-bold text-slate-950 dark:text-white flex items-center gap-2">
                  <Building2 size={16} className="text-crm-violet" /> Add New Supplier Company
                </h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="w-7 h-7 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateSupplierSubmit} className="p-6 space-y-4">
                <div>
                  <label className="label">Company / Supplier Name *</label>
                  <input
                    className="input text-xs"
                    placeholder="Enter supplier or vendor name"
                    value={newSupplier.name}
                    onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Contact Person</label>
                    <input
                      className="input text-xs"
                      placeholder="Enter contact person"
                      value={newSupplier.contactPerson}
                      onChange={(e) =>
                        setNewSupplier({ ...newSupplier, contactPerson: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Phone Number</label>
                    <input
                      className="input text-xs"
                      placeholder="Enter phone number"
                      value={newSupplier.phone}
                      onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Email Address</label>
                    <input
                      type="email"
                      className="input text-xs"
                      placeholder="sales@vendor.com"
                      value={newSupplier.email}
                      onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">GSTIN / Tax ID</label>
                    <input
                      className="input text-xs font-mono"
                      placeholder="e.g. 29ABCDE1234F1Z5"
                      value={newSupplier.gstin}
                      onChange={(e) => setNewSupplier({ ...newSupplier, gstin: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">City / Location</label>
                    <input
                      className="input text-xs"
                      placeholder="Enter city or location"
                      value={newSupplier.city}
                      onChange={(e) => setNewSupplier({ ...newSupplier, city: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Lead Time (Days)</label>
                    <input
                      type="number"
                      className="input text-xs"
                      placeholder="7"
                      value={newSupplier.leadTimeDays}
                      onChange={(e) =>
                        setNewSupplier({
                          ...newSupplier,
                          leadTimeDays: parseInt(e.target.value, 10) || 7,
                        })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Full Address / Warehouse Location</label>
                  <input
                    className="input text-xs"
                    placeholder="Enter street address"
                    value={newSupplier.address}
                    onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn bg-crm-violet hover:bg-crm-violet-hover text-white text-xs px-5 shadow-glow-violet"
                  >
                    Save Supplier
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL: Edit Supplier ──────────────────────────────────────── */}
      <AnimatePresence>
        {editingSupplier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
                <h2 className="text-base font-bold text-slate-950 dark:text-white flex items-center gap-2">
                  <Edit3 size={16} className="text-crm-blue" /> Edit Supplier: {editingSupplier.name}
                </h2>
                <button
                  onClick={() => setEditingSupplier(null)}
                  className="w-7 h-7 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleUpdateSupplierSubmit} className="p-6 space-y-4">
                <div>
                  <label className="label">Company Name *</label>
                  <input
                    className="input text-xs"
                    value={editingSupplier.name}
                    onChange={(e) =>
                      setEditingSupplier({ ...editingSupplier, name: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Contact Person</label>
                    <input
                      className="input text-xs"
                      value={editingSupplier.contactPerson || ''}
                      onChange={(e) =>
                        setEditingSupplier({ ...editingSupplier, contactPerson: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Phone Number</label>
                    <input
                      className="input text-xs"
                      value={editingSupplier.phone || ''}
                      onChange={(e) =>
                        setEditingSupplier({ ...editingSupplier, phone: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Email Address</label>
                    <input
                      type="email"
                      className="input text-xs"
                      value={editingSupplier.email || ''}
                      onChange={(e) =>
                        setEditingSupplier({ ...editingSupplier, email: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">City / Location</label>
                    <input
                      className="input text-xs"
                      value={editingSupplier.city || ''}
                      onChange={(e) =>
                        setEditingSupplier({ ...editingSupplier, city: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Lead Time (Days)</label>
                    <input
                      type="number"
                      className="input text-xs"
                      value={editingSupplier.leadTimeDays || 7}
                      onChange={(e) =>
                        setEditingSupplier({
                          ...editingSupplier,
                          leadTimeDays: parseInt(e.target.value, 10) || 7,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Status</label>
                    <select
                      className="input text-xs"
                      value={editingSupplier.isActive ? 'true' : 'false'}
                      onChange={(e) =>
                        setEditingSupplier({
                          ...editingSupplier,
                          isActive: e.target.value === 'true',
                        })
                      }
                    >
                      <option value="true">Active Vendor</option>
                      <option value="false">Inactive Vendor</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label">Address</label>
                  <input
                    className="input text-xs"
                    value={editingSupplier.address || ''}
                    onChange={(e) =>
                      setEditingSupplier({ ...editingSupplier, address: e.target.value })
                    }
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                  <button
                    type="button"
                    onClick={() => setEditingSupplier(null)}
                    className="btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary text-xs px-5 shadow-glow-blue">
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── IN-APP DELETE SUPPLIER CONFIRMATION MODAL ────────────────── */}
      <AnimatePresence>
        {supplierToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-950 dark:text-white">Delete Supplier?</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Are you sure you want to delete supplier <strong className="text-white font-bold">"{supplierToDelete.name}"</strong>?
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={deletingId !== null}
                  onClick={() => setSupplierToDelete(null)}
                  className="btn-ghost text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingId !== null}
                  onClick={handleConfirmDelete}
                  className="btn bg-red-600 hover:bg-red-500 text-white text-xs px-5 shadow-glow-coral flex items-center gap-1.5"
                >
                  <Trash2 size={13} />
                  {deletingId ? 'Deleting...' : 'Yes, Delete Supplier'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── SUPPLIER PURCHASE MODAL ─────────────────────────────────────── */}
      <AnimatePresence>
        {purchaseSupplier && (
          <SupplierPurchaseModal
            supplier={purchaseSupplier}
            onClose={() => setPurchaseSupplier(null)}
            onSuccess={() => {
              // Invalidate cached history for this supplier so it reloads
              setPurchaseHistory(prev => {
                const next = { ...prev };
                delete next[purchaseSupplier.id];
                return next;
              });
              fetchSuppliers();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
