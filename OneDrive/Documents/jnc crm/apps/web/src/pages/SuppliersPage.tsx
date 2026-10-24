import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Phone, Mail, X, Edit3, Trash2, Building2, Clock, MapPin, FileText, CheckCircle2, Receipt, ChevronDown, ChevronUp, ExternalLink, ShoppingCart, Package } from 'lucide-react';
import { suppliersApi, inventoryApi } from '../services/api';
import { Supplier } from '../types';
import { useAuth } from '../contexts/AuthContext';
import SupplierPurchaseModal from '../components/inventory/SupplierPurchaseModal';
import FormField, { filterPhoneInput, filterGstinInput, filterIntegerInput, filterTextOnlyInput } from '../components/common/FormField';
import {
  validatePersonOrCompanyName,
  validatePhone,
  validateEmail,
  validateGstin,
  validateAddress,
} from '@crm/shared-validation';

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

  const [editingSupplier, setEditingSupplier] = useState<any | null>(null);

  // Validation States
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [addTouched, setAddTouched] = useState<Record<string, boolean>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editTouched, setEditTouched] = useState<Record<string, boolean>>({});

  const validateSupplierFields = (vals: {
    name: string;
    phone?: string;
    email?: string;
    gstin?: string;
    address?: string;
  }) => {
    const errs: Record<string, string> = {};
    const nameRes = validatePersonOrCompanyName(vals.name);
    if (!nameRes.valid) errs.name = nameRes.error!;

    if (vals.phone && vals.phone.trim()) {
      const phoneRes = validatePhone(vals.phone);
      if (!phoneRes.valid) errs.phone = phoneRes.error!;
    }
    if (vals.email && vals.email.trim()) {
      const emailRes = validateEmail(vals.email);
      if (!emailRes.valid) errs.email = emailRes.error!;
    }
    if (vals.gstin && vals.gstin.trim()) {
      const gstinRes = validateGstin(vals.gstin);
      if (!gstinRes.valid) errs.gstin = gstinRes.error!;
    }
    if (vals.address && vals.address.trim()) {
      const addrRes = validateAddress(vals.address);
      if (!addrRes.valid) errs.address = addrRes.error!;
    }
    return errs;
  };

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
    const errs = validateSupplierFields(newSupplier);
    if (Object.keys(errs).length > 0) {
      setAddErrors(errs);
      setAddTouched({
        name: true,
        phone: true,
        email: true,
        gstin: true,
        address: true,
      });
      const firstKey = Object.keys(errs)[0];
      const el = document.getElementById(`new-supplier-${firstKey}`);
      el?.focus();
      return;
    }

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
      setAddErrors({});
      setAddTouched({});
      await fetchSuppliers();
    } catch (err: any) {
      const serverMsg = err?.response?.data?.message;
      if (Array.isArray(serverMsg)) {
        alert('Validation error: ' + serverMsg.join(', '));
      } else {
        alert('Failed to add supplier: ' + (serverMsg || err.message));
      }
    }
  };

  // Edit Supplier submit
  const handleUpdateSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier) return;
    const errs = validateSupplierFields(editingSupplier);
    if (Object.keys(errs).length > 0) {
      setEditErrors(errs);
      setEditTouched({
        name: true,
        phone: true,
        email: true,
        gstin: true,
        address: true,
      });
      const firstKey = Object.keys(errs)[0];
      const el = document.getElementById(`edit-supplier-${firstKey}`);
      el?.focus();
      return;
    }

    try {
      await suppliersApi.update(editingSupplier.id, editingSupplier);
      setEditingSupplier(null);
      setEditErrors({});
      setEditTouched({});
      await fetchSuppliers();
    } catch (err: any) {
      const serverMsg = err?.response?.data?.message;
      if (Array.isArray(serverMsg)) {
        alert('Validation error: ' + serverMsg.join(', '));
      } else {
        alert('Failed to update supplier: ' + (serverMsg || err.message));
      }
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
                <FormField
                  id="new-supplier-name"
                  label="Company / Supplier Name"
                  required
                  placeholder="Enter supplier or vendor name"
                  value={newSupplier.name}
                  onChange={(e) => {
                    setNewSupplier({ ...newSupplier, name: e.target.value });
                    if (addTouched.name) {
                      const res = validatePersonOrCompanyName(e.target.value);
                      setAddErrors((prev) => ({ ...prev, name: res.valid ? '' : res.error! }));
                    }
                  }}
                  onBlur={() => {
                    setAddTouched((prev) => ({ ...prev, name: true }));
                    const res = validatePersonOrCompanyName(newSupplier.name);
                    setAddErrors((prev) => ({ ...prev, name: res.valid ? '' : res.error! }));
                  }}
                  error={addTouched.name ? addErrors.name : null}
                  maxLength={100}
                  showCount
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    id="new-supplier-contactPerson"
                    label="Contact Person"
                    placeholder="Enter contact person"
                    value={newSupplier.contactPerson}
                    onChange={(e) => setNewSupplier({ ...newSupplier, contactPerson: filterTextOnlyInput(e.target.value) })}
                    maxLength={100}
                  />
                  <FormField
                    id="new-supplier-phone"
                    label="Phone Number"
                    type="tel"
                    inputMode="tel"
                    placeholder="+91 98765 43210"
                    value={newSupplier.phone}
                    onChange={(e) => {
                      const filtered = filterPhoneInput(e.target.value);
                      setNewSupplier({ ...newSupplier, phone: filtered });
                      if (addTouched.phone && filtered) {
                        const res = validatePhone(filtered);
                        setAddErrors((prev) => ({ ...prev, phone: res.valid ? '' : res.error! }));
                      }
                    }}
                    onBlur={() => {
                      setAddTouched((prev) => ({ ...prev, phone: true }));
                      if (newSupplier.phone) {
                        const res = validatePhone(newSupplier.phone);
                        setAddErrors((prev) => ({ ...prev, phone: res.valid ? '' : res.error! }));
                      }
                    }}
                    error={addTouched.phone ? addErrors.phone : null}
                    maxLength={20}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    id="new-supplier-email"
                    label="Email Address"
                    type="email"
                    inputMode="email"
                    placeholder="sales@example.com"
                    value={newSupplier.email}
                    onChange={(e) => {
                      setNewSupplier({ ...newSupplier, email: e.target.value });
                      if (addTouched.email && e.target.value) {
                        const res = validateEmail(e.target.value);
                        setAddErrors((prev) => ({ ...prev, email: res.valid ? '' : res.error! }));
                      }
                    }}
                    onBlur={() => {
                      setAddTouched((prev) => ({ ...prev, email: true }));
                      if (newSupplier.email) {
                        const res = validateEmail(newSupplier.email);
                        setAddErrors((prev) => ({ ...prev, email: res.valid ? '' : res.error! }));
                      }
                    }}
                    error={addTouched.email ? addErrors.email : null}
                    maxLength={254}
                  />
                  <FormField
                    id="new-supplier-gstin"
                    label="GSTIN / Tax ID"
                    placeholder="e.g. 29ABCDE1234F1Z5"
                    value={newSupplier.gstin}
                    onChange={(e) => {
                      const filtered = filterGstinInput(e.target.value);
                      setNewSupplier({ ...newSupplier, gstin: filtered });
                      if (addTouched.gstin && filtered) {
                        const res = validateGstin(filtered);
                        setAddErrors((prev) => ({ ...prev, gstin: res.valid ? '' : res.error! }));
                      }
                    }}
                    onBlur={() => {
                      setAddTouched((prev) => ({ ...prev, gstin: true }));
                      if (newSupplier.gstin) {
                        const res = validateGstin(newSupplier.gstin);
                        setAddErrors((prev) => ({ ...prev, gstin: res.valid ? '' : res.error! }));
                      }
                    }}
                    error={addTouched.gstin ? addErrors.gstin : null}
                    maxLength={15}
                    showCount
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    id="new-supplier-city"
                    label="City / Location"
                    placeholder="Enter city or location"
                    value={newSupplier.city}
                    onChange={(e) => setNewSupplier({ ...newSupplier, city: e.target.value })}
                    maxLength={100}
                  />
                  <FormField
                    id="new-supplier-leadTimeDays"
                    label="Lead Time (Days)"
                    type="number"
                    inputMode="numeric"
                    placeholder="7"
                    value={newSupplier.leadTimeDays}
                    onChange={(e) => {
                      const clean = filterIntegerInput(e.target.value);
                      setNewSupplier({
                        ...newSupplier,
                        leadTimeDays: parseInt(clean, 10) || 0,
                      });
                    }}
                    min={0}
                    max={365}
                  />
                </div>

                <FormField
                  id="new-supplier-address"
                  label="Full Address / Warehouse Location"
                  placeholder="Enter street address"
                  value={newSupplier.address}
                  onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                  maxLength={300}
                  showCount
                />

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
                <FormField
                  id="edit-supplier-name"
                  label="Company Name"
                  required
                  value={editingSupplier.name}
                  onChange={(e) => {
                    setEditingSupplier({ ...editingSupplier, name: e.target.value });
                    if (editTouched.name) {
                      const res = validatePersonOrCompanyName(e.target.value);
                      setEditErrors((prev) => ({ ...prev, name: res.valid ? '' : res.error! }));
                    }
                  }}
                  onBlur={() => {
                    setEditTouched((prev) => ({ ...prev, name: true }));
                    const res = validatePersonOrCompanyName(editingSupplier.name);
                    setEditErrors((prev) => ({ ...prev, name: res.valid ? '' : res.error! }));
                  }}
                  error={editTouched.name ? editErrors.name : null}
                  maxLength={100}
                  showCount
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    id="edit-supplier-contactPerson"
                    label="Contact Person"
                    value={editingSupplier.contactPerson || ''}
                    onChange={(e) =>
                      setEditingSupplier({ ...editingSupplier, contactPerson: e.target.value })
                    }
                    maxLength={100}
                  />
                  <FormField
                    id="edit-supplier-phone"
                    label="Phone Number"
                    type="tel"
                    inputMode="tel"
                    value={editingSupplier.phone || ''}
                    onChange={(e) => {
                      const filtered = filterPhoneInput(e.target.value);
                      setEditingSupplier({ ...editingSupplier, phone: filtered });
                      if (editTouched.phone && filtered) {
                        const res = validatePhone(filtered);
                        setEditErrors((prev) => ({ ...prev, phone: res.valid ? '' : res.error! }));
                      }
                    }}
                    onBlur={() => {
                      setEditTouched((prev) => ({ ...prev, phone: true }));
                      if (editingSupplier.phone) {
                        const res = validatePhone(editingSupplier.phone);
                        setEditErrors((prev) => ({ ...prev, phone: res.valid ? '' : res.error! }));
                      }
                    }}
                    error={editTouched.phone ? editErrors.phone : null}
                    maxLength={20}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    id="edit-supplier-email"
                    label="Email Address"
                    type="email"
                    inputMode="email"
                    value={editingSupplier.email || ''}
                    onChange={(e) => {
                      setEditingSupplier({ ...editingSupplier, email: e.target.value });
                      if (editTouched.email && e.target.value) {
                        const res = validateEmail(e.target.value);
                        setEditErrors((prev) => ({ ...prev, email: res.valid ? '' : res.error! }));
                      }
                    }}
                    onBlur={() => {
                      setEditTouched((prev) => ({ ...prev, email: true }));
                      if (editingSupplier.email) {
                        const res = validateEmail(editingSupplier.email);
                        setEditErrors((prev) => ({ ...prev, email: res.valid ? '' : res.error! }));
                      }
                    }}
                    error={editTouched.email ? editErrors.email : null}
                    maxLength={254}
                  />
                  <FormField
                    id="edit-supplier-city"
                    label="City / Location"
                    value={editingSupplier.city || ''}
                    onChange={(e) =>
                      setEditingSupplier({ ...editingSupplier, city: e.target.value })
                    }
                    maxLength={100}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    id="edit-supplier-leadTimeDays"
                    label="Lead Time (Days)"
                    type="number"
                    inputMode="numeric"
                    value={editingSupplier.leadTimeDays || 7}
                    onChange={(e) => {
                      const clean = filterIntegerInput(e.target.value);
                      setEditingSupplier({
                        ...editingSupplier,
                        leadTimeDays: parseInt(clean, 10) || 0,
                      });
                    }}
                    min={0}
                    max={365}
                  />
                  <FormField
                    id="edit-supplier-status"
                    label="Vendor Status"
                    as="select"
                    value={editingSupplier.isActive ? 'true' : 'false'}
                    onChange={(e) =>
                      setEditingSupplier({
                        ...editingSupplier,
                        isActive: e.target.value === 'true',
                      })
                    }
                    options={[
                      { label: 'Active Vendor', value: 'true' },
                      { label: 'Inactive Vendor', value: 'false' },
                    ]}
                  />
                </div>

                <FormField
                  id="edit-supplier-address"
                  label="Address"
                  value={editingSupplier.address || ''}
                  onChange={(e) =>
                    setEditingSupplier({ ...editingSupplier, address: e.target.value })
                  }
                  maxLength={300}
                  showCount
                />

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
