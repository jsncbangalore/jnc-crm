import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Plus, Search, RefreshCw, Layers, Settings,
  Edit3, Trash2, Check, X, ShieldAlert, ArrowUpDown,
  Calendar, CheckSquare, DollarSign, ListFilter, Link2,
  Mail, Phone, Globe, FileText, ChevronRight, ExternalLink,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { customObjectsApi } from '../services/api';
import { CustomObject, CustomField, CustomFieldType } from '../types';

export default function CustomObjectRecordsPage() {
  const { objectApiName } = useParams<{ objectApiName: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'tenant_admin' || user?.role === 'admin';

  const [objectMeta, setObjectMeta] = useState<CustomObject | null>(null);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Dynamic Lookup options cache: { [targetObject]: [{ id, label, subLabel }] }
  const [lookupOptions, setLookupOptions] = useState<Record<string, any[]>>({});

  const fetchRecordsAndSchema = async () => {
    if (!objectApiName) return;
    setLoading(true);
    try {
      const res = await customObjectsApi.getRecords(objectApiName, {
        search,
        sortBy,
        sortOrder,
      });
      setObjectMeta(res.data.object);
      setFields(res.data.object.fields || []);
      setRecords(res.data.records || []);

      // Pre-load lookup options for any lookup fields
      const lookupFields = (res.data.object.fields || []).filter((f: CustomField) => f.fieldType === 'lookup');
      for (const lf of lookupFields) {
        if (lf.lookupTargetObject) {
          loadLookupTargetOptions(lf.lookupTargetObject);
        }
      }
    } catch (err) {
      console.error('Failed to load custom object records:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadLookupTargetOptions = async (targetObject: string) => {
    try {
      const res = await customObjectsApi.getLookupOptions(targetObject);
      setLookupOptions((prev) => ({
        ...prev,
        [targetObject.toLowerCase()]: res.data,
      }));
    } catch (err) {
      console.error(`Failed to load lookup options for ${targetObject}:`, err);
    }
  };

  useEffect(() => {
    fetchRecordsAndSchema();
  }, [objectApiName, sortBy, sortOrder]);

  const handleOpenNewModal = () => {
    const initial: Record<string, any> = {};
    for (const f of fields) {
      if (f.fieldType === 'checkbox') initial[f.apiName] = false;
      else if (f.fieldType === 'picklist') {
        try {
          const arr = JSON.parse(f.picklistValues || '[]');
          initial[f.apiName] = arr[0] || '';
        } catch {
          initial[f.apiName] = '';
        }
      } else {
        initial[f.apiName] = '';
      }
    }
    setFormData(initial);
    setFieldErrors({});
    setEditingRecord(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (record: any) => {
    const initial: Record<string, any> = { ...record.data };
    for (const f of fields) {
      if (initial[f.apiName] === undefined) {
        initial[f.apiName] = f.fieldType === 'checkbox' ? false : '';
      }
    }
    setFormData(initial);
    setFieldErrors({});
    setEditingRecord(record);
    setShowModal(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!objectApiName) return;

    setSaving(true);
    setFieldErrors({});

    try {
      if (editingRecord) {
        await customObjectsApi.updateRecord(objectApiName, editingRecord.id, formData);
      } else {
        await customObjectsApi.createRecord(objectApiName, formData);
      }
      setShowModal(false);
      fetchRecordsAndSchema();
    } catch (err: any) {
      const errorData = err?.response?.data;
      if (errorData?.errors && Array.isArray(errorData.errors)) {
        const errorMap: Record<string, string> = {};
        errorData.errors.forEach((e: any) => {
          errorMap[e.field] = e.error;
        });
        setFieldErrors(errorMap);
      } else {
        alert(errorData?.message || 'Failed to save record');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!objectApiName) return;
    if (!confirm('Are you sure you want to archive (soft-delete) this record?')) return;
    try {
      await customObjectsApi.deleteRecord(objectApiName, recordId);
      fetchRecordsAndSchema();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete record');
    }
  };

  const handleFieldChange = (apiName: string, val: any) => {
    setFormData((prev) => ({ ...prev, [apiName]: val }));
    if (fieldErrors[apiName]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[apiName];
        return next;
      });
    }
  };

  // Cell Value Formatter
  const renderCellValue = (record: any, field: CustomField) => {
    const val = record.data?.[field.apiName];
    if (val === undefined || val === null || val === '') {
      return <span className="text-slate-600">—</span>;
    }

    switch (field.fieldType) {
      case 'currency':
        return (
          <span className="font-bold text-slate-950 dark:text-white font-mono">
            ₹{Number(val).toLocaleString('en-IN')}
          </span>
        );
      case 'checkbox':
        return val ? (
          <span className="text-emerald-400 font-bold flex items-center gap-1 text-xs">
            <Check size={13} /> Yes
          </span>
        ) : (
          <span className="text-slate-500 flex items-center gap-1 text-xs">
            <X size={13} /> No
          </span>
        );
      case 'date':
        return <span className="font-mono text-slate-300 text-xs">{String(val)}</span>;
      case 'picklist':
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-crm-amber/15 text-crm-amber border border-crm-amber/30">
            {String(val)}
          </span>
        );
      case 'lookup': {
        const lookupInfo = record._lookups?.[field.apiName];
        if (lookupInfo) {
          return (
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium ${
                lookupInfo.isArchived ? 'text-crm-coral italic' : 'text-crm-violet-light'
              }`}
            >
              <Link2 size={12} /> {lookupInfo.label}
            </span>
          );
        }
        return <span className="font-mono text-xs text-slate-400">{String(val).slice(0, 8)}</span>;
      }
      case 'email':
        return <a href={`mailto:${val}`} className="text-crm-teal hover:underline">{val}</a>;
      case 'phone':
        return <a href={`tel:${val}`} className="text-slate-300 hover:text-white font-mono">{val}</a>;
      case 'url':
        return (
          <a
            href={String(val).startsWith('http') ? val : `https://${val}`}
            target="_blank"
            rel="noreferrer"
            className="text-crm-blue hover:underline flex items-center gap-1 text-xs"
          >
            Visit Link <ExternalLink size={11} />
          </a>
        );
      default:
        return <span className="text-white text-xs font-medium">{String(val)}</span>;
    }
  };

  if (!isAdmin) {
    return (
      <div className="card p-12 text-center max-w-xl mx-auto my-12 border-crm-coral/30">
        <ShieldAlert size={48} className="text-crm-coral mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-950 dark:text-white">Restricted Access</h2>
        <p className="text-sm text-slate-400 mt-2">
          Only System Administrators and Super Admins have permission to manage custom object records.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── BREADCRUMB & HEADER ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link to="/setup/objects" className="hover:text-white transition-colors font-semibold">
              Object Manager
            </Link>
            <ChevronRight size={13} className="text-slate-600" />
            <span className="text-white font-bold">{objectMeta?.label || objectApiName}</span>
            <code className="font-mono text-crm-teal bg-crm-teal/10 px-2 py-0.5 rounded border border-crm-teal/20 text-[11px]">
              {objectApiName}
            </code>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-black">
              <Database size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-950 dark:text-white">{objectMeta?.pluralLabel || objectMeta?.label || 'Custom Records'}</h1>
              <p className="text-slate-400 text-xs">
                Auto-Generated Generic Record Storage • {fields.length} Active Schema Attributes
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {objectMeta && (
            <Link
              to={`/setup/objects/${objectMeta.id}`}
              className="btn bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs gap-1.5"
              title="Configure Object Schema & Custom Fields"
            >
              <Settings size={13} className="text-crm-blue" /> Schema & Fields Setup
            </Link>
          )}

          <button
            onClick={handleOpenNewModal}
            className="btn-primary text-xs gap-1.5 shadow-glow-blue"
          >
            <Plus size={15} /> New {objectMeta?.label || 'Record'}
          </button>
        </div>
      </div>

      {/* ─── SEARCH & FILTER CONTROLS ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9 text-xs"
              placeholder={`Search ${objectMeta?.pluralLabel || 'records'}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fetchRecordsAndSchema();
              }}
            />
          </div>
          <button onClick={fetchRecordsAndSchema} className="btn-ghost text-xs">
            Search
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={fetchRecordsAndSchema} className="btn-ghost text-xs gap-1.5" title="Refresh">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* ─── AUTO-GENERATED RECORDS TABLE ─────────────────────────────────── */}
      <div className="table-wrapper">
        <table className="crm-table">
          <thead>
            <tr>
              {fields.map((field) => (
                <th key={field.id} className="whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span>{field.label}</span>
                    {field.isRequired && <span className="text-crm-coral font-bold text-xs">*</span>}
                  </div>
                </th>
              ))}
              <th className="whitespace-nowrap">Created At</th>
              <th className="text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={fields.length + 2} className="text-center py-12 text-slate-400">
                  <RefreshCw size={20} className="animate-spin text-crm-blue inline mr-2" />
                  Loading {objectMeta?.pluralLabel || 'records'}...
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={fields.length + 2} className="text-center py-12 text-slate-500">
                  <Database size={32} className="mx-auto mb-2 opacity-40 text-emerald-400" />
                  <p className="font-semibold text-slate-300">No records found for {objectMeta?.label || 'this object'}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Click "New {objectMeta?.label || 'Record'}" above to create your first entry.
                  </p>
                </td>
              </tr>
            ) : (
              records.map((record) => (
                <tr key={record.id} className="hover:bg-white/[0.03] transition-colors">
                  {fields.map((field) => (
                    <td key={field.id} className="max-w-xs truncate">
                      {renderCellValue(record, field)}
                    </td>
                  ))}
                  <td className="text-xs text-slate-400 whitespace-nowrap font-mono">
                    {new Date(record.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditModal(record)}
                        className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-crm-blue transition-colors"
                        title="Edit Record"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteRecord(record.id)}
                        className="p-1.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-crm-coral transition-colors"
                        title="Archive Record"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── DYNAMIC MODAL: AUTO-GENERATED FORM ───────────────────────────── */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-auto"
            >
              <div className="p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
                    <Database size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-950 dark:text-white">
                      {editingRecord ? `Edit ${objectMeta?.label}` : `New ${objectMeta?.label}`}
                    </h2>
                    <p className="text-xs text-slate-400">
                      Entity: <strong className="text-slate-200">{objectMeta?.label}</strong> ({objectMeta?.apiName})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleFormSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {fields.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No custom fields defined on this object yet.</p>
                ) : (
                  fields.map((field) => {
                    const hasError = !!fieldErrors[field.apiName];
                    const val = formData[field.apiName] ?? '';

                    return (
                      <div key={field.id} className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            {field.label}
                            {field.isRequired && <span className="text-crm-coral font-bold">*</span>}
                            <span className="text-[10px] text-slate-500 font-mono">({field.apiName})</span>
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono capitalize">{field.fieldType}</span>
                        </label>

                        {/* Text / Email / Phone / URL Input */}
                        {(field.fieldType === 'text' ||
                          field.fieldType === 'email' ||
                          field.fieldType === 'phone' ||
                          field.fieldType === 'url') && (
                          <input
                            type={field.fieldType === 'email' ? 'email' : 'text'}
                            className={`input w-full text-xs ${hasError ? 'border-red-500 focus:ring-red-500' : ''}`}
                            placeholder={`Enter ${field.label.toLowerCase()}...`}
                            value={val}
                            onChange={(e) => handleFieldChange(field.apiName, e.target.value)}
                            required={field.isRequired}
                          />
                        )}

                        {/* Text Area */}
                        {field.fieldType === 'textarea' && (
                          <textarea
                            className={`input w-full text-xs h-20 resize-none ${hasError ? 'border-red-500 focus:ring-red-500' : ''}`}
                            placeholder={`Enter ${field.label.toLowerCase()}...`}
                            value={val}
                            onChange={(e) => handleFieldChange(field.apiName, e.target.value)}
                            required={field.isRequired}
                          />
                        )}

                        {/* Number Input */}
                        {field.fieldType === 'number' && (
                          <input
                            type="number"
                            step="any"
                            className={`input w-full text-xs font-mono ${hasError ? 'border-red-500 focus:ring-red-500' : ''}`}
                            placeholder="0"
                            value={val}
                            onChange={(e) => handleFieldChange(field.apiName, e.target.value)}
                            required={field.isRequired}
                          />
                        )}

                        {/* Currency Input (₹ INR) */}
                        {field.fieldType === 'currency' && (
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-crm-teal font-bold text-xs">
                              ₹
                            </span>
                            <input
                              type="number"
                              step="any"
                              className={`input w-full pl-7 text-xs font-mono ${hasError ? 'border-red-500 focus:ring-red-500' : ''}`}
                              placeholder="0.00"
                              value={val}
                              onChange={(e) => handleFieldChange(field.apiName, e.target.value)}
                              required={field.isRequired}
                            />
                          </div>
                        )}

                        {/* Date Picker */}
                        {field.fieldType === 'date' && (
                          <input
                            type="date"
                            className={`input w-full text-xs font-mono ${hasError ? 'border-red-500 focus:ring-red-500' : ''}`}
                            value={val}
                            onChange={(e) => handleFieldChange(field.apiName, e.target.value)}
                            required={field.isRequired}
                          />
                        )}

                        {/* Checkbox Switch */}
                        {field.fieldType === 'checkbox' && (
                          <div className="flex items-center gap-3 pt-1">
                            <input
                              type="checkbox"
                              id={`cb-${field.apiName}`}
                              className="rounded border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] text-crm-blue focus:ring-crm-blue cursor-pointer"
                              checked={!!val}
                              onChange={(e) => handleFieldChange(field.apiName, e.target.checked)}
                            />
                            <label htmlFor={`cb-${field.apiName}`} className="text-xs text-white cursor-pointer select-none">
                              {val ? 'Enabled (True)' : 'Disabled (False)'}
                            </label>
                          </div>
                        )}

                        {/* Picklist Dropdown */}
                        {field.fieldType === 'picklist' && (
                          <select
                            className={`input w-full text-xs ${hasError ? 'border-red-500 focus:ring-red-500' : ''}`}
                            value={val}
                            onChange={(e) => handleFieldChange(field.apiName, e.target.value)}
                            required={field.isRequired}
                          >
                            <option value="">Select option...</option>
                            {(() => {
                              try {
                                const options: string[] = JSON.parse(field.picklistValues || '[]');
                                return options.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ));
                              } catch {
                                return null;
                              }
                            })()}
                          </select>
                        )}

                        {/* Lookup Dropdown */}
                        {field.fieldType === 'lookup' && (
                          <select
                            className={`input w-full text-xs ${hasError ? 'border-red-500 focus:ring-red-500' : ''}`}
                            value={val}
                            onChange={(e) => handleFieldChange(field.apiName, e.target.value)}
                            required={field.isRequired}
                          >
                            <option value="">
                              Select {field.lookupTargetObject ? `${field.lookupTargetObject}` : 'record'}...
                            </option>
                            {(lookupOptions[(field.lookupTargetObject || '').toLowerCase()] || []).map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label} {opt.subLabel ? `(${opt.subLabel})` : ''}
                              </option>
                            ))}
                          </select>
                        )}

                        {/* Field Error Message */}
                        {hasError && (
                          <p className="text-[11px] text-crm-coral flex items-center gap-1 mt-0.5">
                            <AlertCircle size={12} /> {fieldErrors[field.apiName]}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-[#2A3042]">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn-ghost text-xs"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary text-xs gap-1.5 shadow-glow-blue"
                    disabled={saving}
                  >
                    <Check size={14} /> {saving ? 'Saving...' : editingRecord ? 'Update Record' : 'Save Record'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
