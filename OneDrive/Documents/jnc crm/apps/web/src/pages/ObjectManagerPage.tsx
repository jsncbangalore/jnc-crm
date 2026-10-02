import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Boxes, Plus, Search, RefreshCw, Layers, Database,
  ArrowLeft, Edit3, Trash2, RotateCcw, Check, X, ShieldAlert,
  Hash, Type, Calendar, CheckSquare, DollarSign, ListFilter,
  Link2, Mail, Phone, Globe, FileText, ChevronRight, Eye,
  Sparkles, ExternalLink
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { customObjectsApi } from '../services/api';
import { CustomObject, CustomField, CustomFieldType } from '../types';

const FIELD_TYPES: { value: CustomFieldType; label: string; icon: any; desc: string }[] = [
  { value: 'text', label: 'Text (Single Line)', icon: Type, desc: 'Short string up to 255 characters (e.g. Serial Number)' },
  { value: 'textarea', label: 'Text Area (Multi-Line)', icon: FileText, desc: 'Long formatted notes, scopes of work, or descriptions' },
  { value: 'number', label: 'Number', icon: Hash, desc: 'Integer or decimal values (e.g. Unit count, capacity)' },
  { value: 'currency', label: 'Currency (₹ INR)', icon: DollarSign, desc: 'Monetary amounts with currency formatting' },
  { value: 'date', label: 'Date', icon: Calendar, desc: 'Calendar date picker (e.g. AMC Renewal Date, Inspection Date)' },
  { value: 'checkbox', label: 'Checkbox (Boolean)', icon: CheckSquare, desc: 'True/False flag (e.g. Is Under Warranty, Site Ready)' },
  { value: 'picklist', label: 'Picklist (Dropdown)', icon: ListFilter, desc: 'Single select from defined predefined list of options' },
  { value: 'lookup', label: 'Lookup Relationship', icon: Link2, desc: 'Relational link to another Standard or Custom Object' },
  { value: 'email', label: 'Email', icon: Mail, desc: 'Validated email address format' },
  { value: 'phone', label: 'Phone', icon: Phone, desc: 'Contact phone number' },
  { value: 'url', label: 'URL / Website', icon: Globe, desc: 'Web link to external datasheet, portal, or file' },
];

export default function ObjectManagerPage() {
  const { objectId } = useParams<{ objectId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'tenant_admin' || user?.role === 'admin';

  // Object list state
  const [standardObjects, setStandardObjects] = useState<any[]>([]);
  const [customObjects, setCustomObjects] = useState<CustomObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'custom' | 'standard'>('all');

  // New / Edit Object Modal
  const [showObjectModal, setShowObjectModal] = useState(false);
  const [editingObject, setEditingObject] = useState<CustomObject | null>(null);
  const [objectForm, setObjectForm] = useState({
    label: '',
    pluralLabel: '',
    apiName: '',
    description: '',
  });

  // Selected Object Detail & Fields State (When inside /setup/objects/:id)
  const [selectedObject, setSelectedObject] = useState<CustomObject | null>(null);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [showArchivedFields, setShowArchivedFields] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);

  // New / Edit Field Modal
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [fieldForm, setFieldForm] = useState<{
    label: string;
    apiName: string;
    fieldType: CustomFieldType;
    isRequired: boolean;
    isUnique: boolean;
    picklistValuesList: string[];
    newPicklistInput: string;
    lookupTargetObject: string;
  }>({
    label: '',
    apiName: '',
    fieldType: 'text',
    isRequired: false,
    isUnique: false,
    picklistValuesList: ['Option 1', 'Option 2'],
    newPicklistInput: '',
    lookupTargetObject: 'lead',
  });

  const fetchAllObjects = async () => {
    setLoading(true);
    try {
      const res = await customObjectsApi.getAll();
      setStandardObjects(res.data.standardObjects || []);
      setCustomObjects(res.data.customObjects || []);
    } catch (err) {
      console.error('Failed to load objects:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchObjectDetail = async (id: string) => {
    setLoadingFields(true);
    try {
      const res = await customObjectsApi.get(id);
      setSelectedObject(res.data);
      if (res.data.id && !res.data.isStandard) {
        const fieldsRes = await customObjectsApi.getFields(res.data.id, true);
        setFields(fieldsRes.data);
      } else {
        setFields([]);
      }
    } catch (err) {
      console.error('Failed to load object details:', err);
    } finally {
      setLoadingFields(false);
    }
  };

  useEffect(() => {
    fetchAllObjects();
  }, []);

  useEffect(() => {
    if (objectId) {
      fetchObjectDetail(objectId);
    } else {
      setSelectedObject(null);
    }
  }, [objectId]);

  // Object Modal Handlers
  const handleOpenNewObjectModal = () => {
    setObjectForm({
      label: '',
      pluralLabel: '',
      apiName: '',
      description: '',
    });
    setEditingObject(null);
    setShowObjectModal(true);
  };

  const handleObjectLabelChange = (val: string) => {
    const autoApiName = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const autoPlural = val.trim() ? `${val.trim()}s` : '';

    setObjectForm((prev) => ({
      ...prev,
      label: val,
      apiName: prev.apiName === '' || prev.apiName.startsWith(autoApiName.slice(0, 3)) ? autoApiName : prev.apiName,
      pluralLabel: prev.pluralLabel === '' || prev.pluralLabel === autoPlural.slice(0, -1) ? autoPlural : prev.pluralLabel,
    }));
  };

  const handleSaveObject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingObject) {
        await customObjectsApi.update(editingObject.id, {
          label: objectForm.label,
          pluralLabel: objectForm.pluralLabel,
          description: objectForm.description,
        });
        fetchAllObjects();
        if (selectedObject?.id === editingObject.id) {
          fetchObjectDetail(editingObject.id);
        }
      } else {
        const res = await customObjectsApi.create({
          label: objectForm.label,
          pluralLabel: objectForm.pluralLabel,
          apiName: objectForm.apiName,
          description: objectForm.description,
        });
        fetchAllObjects();
        navigate(`/setup/objects/${res.data.id}`);
      }
      setShowObjectModal(false);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to save object');
    }
  };

  const handleDeleteObject = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete custom object "${name}" and all its metadata?`)) return;
    try {
      await customObjectsApi.delete(id);
      fetchAllObjects();
      if (objectId === id) {
        navigate('/setup/objects');
      }
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete object');
    }
  };

  // Field Modal Handlers
  const handleOpenNewFieldModal = () => {
    setFieldForm({
      label: '',
      apiName: '',
      fieldType: 'text',
      isRequired: false,
      isUnique: false,
      picklistValuesList: ['Active', 'Pending', 'Closed'],
      newPicklistInput: '',
      lookupTargetObject: 'lead',
    });
    setEditingField(null);
    setShowFieldModal(true);
  };

  const handleOpenEditFieldModal = (field: CustomField) => {
    let picklistList: string[] = [];
    if (field.picklistValues) {
      try {
        const arr = JSON.parse(field.picklistValues);
        if (Array.isArray(arr)) picklistList = arr;
      } catch {}
    }

    setFieldForm({
      label: field.label,
      apiName: field.apiName,
      fieldType: field.fieldType,
      isRequired: field.isRequired,
      isUnique: field.isUnique,
      picklistValuesList: picklistList.length > 0 ? picklistList : ['Option 1', 'Option 2'],
      newPicklistInput: '',
      lookupTargetObject: field.lookupTargetObject || 'lead',
    });
    setEditingField(field);
    setShowFieldModal(true);
  };

  const handleFieldLabelChange = (val: string) => {
    const autoApiName = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    setFieldForm((prev) => ({
      ...prev,
      label: val,
      apiName: prev.apiName === '' || prev.apiName.startsWith(autoApiName.slice(0, 3)) ? autoApiName : prev.apiName,
    }));
  };

  const handleAddPicklistValue = () => {
    if (!fieldForm.newPicklistInput.trim()) return;
    setFieldForm((prev) => ({
      ...prev,
      picklistValuesList: [...prev.picklistValuesList, prev.newPicklistInput.trim()],
      newPicklistInput: '',
    }));
  };

  const handleRemovePicklistValue = (index: number) => {
    setFieldForm((prev) => ({
      ...prev,
      picklistValuesList: prev.picklistValuesList.filter((_, i) => i !== index),
    }));
  };

  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedObject) return;

    try {
      const payload: any = {
        label: fieldForm.label,
        fieldType: fieldForm.fieldType,
        isRequired: fieldForm.isRequired,
        isUnique: fieldForm.isUnique,
      };

      if (fieldForm.fieldType === 'picklist') {
        payload.picklistValues = fieldForm.picklistValuesList;
      }

      if (fieldForm.fieldType === 'lookup') {
        payload.lookupTargetObject = fieldForm.lookupTargetObject;
      }

      if (editingField) {
        await customObjectsApi.updateField(selectedObject.id, editingField.id, payload);
      } else {
        payload.apiName = fieldForm.apiName;
        await customObjectsApi.createField(selectedObject.id, payload);
      }

      setShowFieldModal(false);
      fetchObjectDetail(selectedObject.id);
      fetchAllObjects();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to save field');
    }
  };

  const handleSoftDeleteField = async (fieldId: string) => {
    if (!selectedObject) return;
    if (!confirm('Are you sure you want to archive (soft-delete) this custom field?')) return;
    try {
      await customObjectsApi.softDeleteField(selectedObject.id, fieldId);
      fetchObjectDetail(selectedObject.id);
      fetchAllObjects();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to archive field');
    }
  };

  const handleRestoreField = async (fieldId: string) => {
    if (!selectedObject) return;
    try {
      await customObjectsApi.restoreField(selectedObject.id, fieldId);
      fetchObjectDetail(selectedObject.id);
      fetchAllObjects();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to restore field');
    }
  };

  // Combine standard and custom objects for list view
  const allObjects = [
    ...customObjects.map((c) => ({ ...c, isStandard: false })),
    ...standardObjects.map((s) => ({ ...s, isStandard: true })),
  ];

  const filteredObjects = allObjects.filter((obj) => {
    if (activeTab === 'custom' && obj.isStandard) return false;
    if (activeTab === 'standard' && !obj.isStandard) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        obj.label.toLowerCase().includes(q) ||
        obj.apiName.toLowerCase().includes(q) ||
        (obj.description && obj.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const visibleFields = fields.filter((f) => showArchivedFields || !f.deletedAt);

  if (!isAdmin) {
    return (
      <div className="card p-12 text-center max-w-xl mx-auto my-12 border-crm-coral/30">
        <ShieldAlert size={48} className="text-crm-coral mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-950 dark:text-white">Restricted Setup Area</h2>
        <p className="text-sm text-slate-400 mt-2">
          Only System Administrators and Super Admins have permission to access the Object Manager and define custom data schemas.
        </p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW 2: OBJECT DETAIL / FIELDS DESIGNER VIEW
  // ─────────────────────────────────────────────────────────────────────────────
  if (selectedObject) {
    return (
      <div className="space-y-6">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs">
            <Link
              to="/setup/objects"
              className="text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors flex items-center gap-1 font-semibold"
            >
              <Boxes size={14} className="text-crm-blue" /> Object Manager
            </Link>
            <ChevronRight size={14} className="text-slate-600" />
            <span className="text-white font-bold">{selectedObject.label}</span>
            <span className="font-mono text-crm-teal bg-crm-teal/10 px-2 py-0.5 rounded border border-crm-teal/20 text-[11px]">
              {selectedObject.apiName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/setup/objects" className="btn-ghost text-xs gap-1.5">
              <ArrowLeft size={14} /> Back to Object List
            </Link>

            {!selectedObject.isStandard && (
              <button
                onClick={handleOpenNewFieldModal}
                className="btn-primary text-xs gap-1.5 shadow-glow-blue"
              >
                <Plus size={15} /> New Custom Field
              </button>
            )}
          </div>
        </div>

        {/* Object Summary Card */}
        <div className="card p-5 border-l-4 border-l-crm-blue flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-crm-blue/20 text-crm-blue border border-crm-blue/30 flex items-center justify-center font-black">
                <Database size={20} />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-950 dark:text-white">{selectedObject.label}</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Plural: <strong className="text-slate-200">{selectedObject.pluralLabel}</strong> • API Name:{' '}
                  <code className="font-mono text-crm-teal">{selectedObject.apiName}</code> • Type:{' '}
                  <span
                    className={`font-semibold ${
                      selectedObject.isStandard ? 'text-crm-blue' : 'text-emerald-400'
                    }`}
                  >
                    {selectedObject.isStandard ? 'Standard Object (Read-Only)' : 'Custom Object'}
                  </span>
                </p>
              </div>
            </div>
            {selectedObject.description && (
              <p className="text-xs text-slate-400 mt-3 bg-white/[0.02] p-2.5 rounded-lg border border-white/5">
                {selectedObject.description}
              </p>
            )}
          </div>

          {!selectedObject.isStandard && (
            <div className="flex items-center gap-2">
              <Link
                to={`/objects/${selectedObject.apiName}`}
                className="btn-primary text-xs gap-1.5 shadow-glow-blue"
              >
                <Database size={13} /> View & Manage Records
              </Link>
              <button
                onClick={() => {
                  setEditingObject(selectedObject);
                  setObjectForm({
                    label: selectedObject.label,
                    pluralLabel: selectedObject.pluralLabel,
                    apiName: selectedObject.apiName,
                    description: selectedObject.description || '',
                  });
                  setShowObjectModal(true);
                }}
                className="btn-ghost text-xs gap-1 border border-slate-200 dark:border-[#2A3042]"
              >
                <Edit3 size={13} /> Edit Object Details
              </button>
            </div>
          )}
        </div>

        {/* Fields Table Header & Toggle */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-slate-950 dark:text-white flex items-center gap-2">
              <Layers size={16} className="text-crm-blue" />
              Custom Fields & Relationships ({visibleFields.length})
            </h2>
            <p className="text-xs text-slate-400">
              Define data attributes, relational lookups, currency formats, and picklist choices
            </p>
          </div>

          <div className="flex items-center gap-3">
            {!selectedObject.isStandard && (
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] text-crm-blue focus:ring-crm-blue cursor-pointer"
                  checked={showArchivedFields}
                  onChange={(e) => setShowArchivedFields(e.target.checked)}
                />
                Show Archived Fields
              </label>
            )}

            <button
              onClick={() => fetchObjectDetail(selectedObject.id)}
              className="btn-ghost text-xs gap-1.5"
            >
              <RefreshCw size={13} className={loadingFields ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Fields Table */}
        <div className="table-wrapper">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Field Label</th>
                <th>API Name</th>
                <th>Data Type</th>
                <th>Required</th>
                <th>Unique</th>
                <th>Field Details / Lookup Target</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingFields ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    <RefreshCw size={20} className="animate-spin text-crm-blue inline mr-2" />
                    Loading object fields schema...
                  </td>
                </tr>
              ) : selectedObject.isStandard ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-400">
                    <Database size={32} className="mx-auto mb-2 text-crm-blue opacity-50" />
                    <p className="font-bold text-slate-950 dark:text-white">Standard System Object</p>
                    <p className="text-xs text-slate-500 mt-1">
                      This is a built-in core CRM entity. Standard fields are maintained by the core engine.
                    </p>
                  </td>
                </tr>
              ) : visibleFields.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500">
                    <Layers size={32} className="mx-auto mb-2 opacity-40 text-crm-blue" />
                    <p className="font-semibold text-slate-300">No custom fields defined yet</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Click "New Custom Field" above to add attributes to this object.
                    </p>
                  </td>
                </tr>
              ) : (
                visibleFields.map((field) => {
                  const typeDef = FIELD_TYPES.find((t) => t.value === field.fieldType) || {
                    label: field.fieldType,
                    icon: Type,
                  };
                  const TypeIcon = typeDef.icon;
                  const isArchived = !!field.deletedAt;

                  let picklistCount = 0;
                  if (field.picklistValues) {
                    try {
                      picklistCount = JSON.parse(field.picklistValues).length;
                    } catch {}
                  }

                  return (
                    <tr
                      key={field.id}
                      className={`hover:bg-white/[0.02] ${isArchived ? 'opacity-50 bg-red-500/[0.02]' : ''}`}
                    >
                      <td className="font-bold text-slate-950 dark:text-white text-xs">{field.label}</td>
                      <td className="font-mono text-xs text-crm-teal">{field.apiName}</td>
                      <td>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-white/5 text-slate-200 border border-white/10">
                          <TypeIcon size={12} className="text-crm-blue" />
                          {typeDef.label}
                        </span>
                      </td>
                      <td>
                        {field.isRequired ? (
                          <span className="text-xs font-bold text-crm-coral flex items-center gap-1">
                            <Check size={12} /> Yes
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td>
                        {field.isUnique ? (
                          <span className="text-xs font-bold text-crm-teal flex items-center gap-1">
                            <Check size={12} /> Yes
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="text-xs text-slate-300">
                        {field.fieldType === 'picklist' && (
                          <span className="text-crm-amber font-medium">
                            {picklistCount} options configured
                          </span>
                        )}
                        {field.fieldType === 'lookup' && (
                          <span className="font-mono text-crm-violet-light flex items-center gap-1">
                            <Link2 size={12} /> Lookup → {field.lookupTargetObject}
                          </span>
                        )}
                        {field.fieldType !== 'picklist' && field.fieldType !== 'lookup' && (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td>
                        {isArchived ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-crm-coral border border-red-500/30">
                            Archived
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1">
                          {!isArchived ? (
                            <>
                              <button
                                onClick={() => handleOpenEditFieldModal(field)}
                                className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-crm-blue transition-colors"
                                title="Edit Field"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                onClick={() => handleSoftDeleteField(field.id)}
                                className="p-1.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-crm-coral transition-colors"
                                title="Archive Field (Soft Delete)"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleRestoreField(field.id)}
                              className="btn bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 text-xs px-2 py-1 gap-1"
                              title="Restore Archived Field"
                            >
                              <RotateCcw size={12} /> Restore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─── MODAL: CREATE / EDIT CUSTOM FIELD ──────────────────────────── */}
        <AnimatePresence>
          {showFieldModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 16 }}
                className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto"
              >
                <div className="p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-crm-blue/20 text-crm-blue border border-crm-blue/30 flex items-center justify-center font-bold">
                      <Layers size={20} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-950 dark:text-white">
                        {editingField ? 'Edit Field' : 'New Custom Field'}
                      </h2>
                      <p className="text-xs text-slate-400">
                        Object: {selectedObject.label} ({selectedObject.apiName})
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowFieldModal(false)}
                    className="p-2 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveField} className="p-6 space-y-4">
                  {/* Field Type (Disabled when editing existing field) */}
                  {/* Field Data Type */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-300">
                        Data Type *
                      </label>
                      {editingField && (
                        <span className="text-[10px] text-crm-blue font-medium bg-crm-blue/10 px-2 py-0.5 rounded border border-crm-blue/20">
                          Editable
                        </span>
                      )}
                    </div>
                    <select
                      className="input w-full text-xs cursor-pointer focus:ring-2 focus:ring-crm-blue"
                      value={fieldForm.fieldType}
                      onChange={(e) =>
                        setFieldForm({ ...fieldForm, fieldType: e.target.value as CustomFieldType })
                      }
                      required
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label} — {t.desc}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Field Label */}
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">
                        Field Label *
                      </label>
                      <input
                        type="text"
                        className="input w-full text-xs"
                        placeholder="e.g. Annual Service Fee"
                        value={fieldForm.label}
                        onChange={(e) => handleFieldLabelChange(e.target.value)}
                        required
                      />
                    </div>

                    {/* Field API Name */}
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">
                        Field API Name *
                      </label>
                      <input
                        type="text"
                        className="input w-full text-xs font-mono"
                        placeholder="e.g. annual_service_fee"
                        value={fieldForm.apiName}
                        disabled={!!editingField}
                        onChange={(e) =>
                          setFieldForm({
                            ...fieldForm,
                            apiName: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                          })
                        }
                        required
                      />
                    </div>
                  </div>

                  {/* Dynamic Section: Picklist Values */}
                  {fieldForm.fieldType === 'picklist' && (
                    <div className="p-4 rounded-xl bg-[#141620] border border-slate-200 dark:border-[#2A3042] space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-crm-amber flex items-center gap-1.5">
                          <ListFilter size={13} /> Picklist Values List *
                        </label>
                        <span className="text-[11px] text-slate-500">
                          {fieldForm.picklistValuesList.length} options
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="input flex-1 text-xs"
                          placeholder="Type option and click Add..."
                          value={fieldForm.newPicklistInput}
                          onChange={(e) =>
                            setFieldForm({ ...fieldForm, newPicklistInput: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddPicklistValue();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAddPicklistValue}
                          className="btn bg-crm-amber/20 text-crm-amber hover:bg-crm-amber/30 text-xs px-3"
                        >
                          Add
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
                        {fieldForm.picklistValuesList.map((val, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-white/5 text-slate-200 border border-white/10"
                          >
                            {val}
                            <button
                              type="button"
                              onClick={() => handleRemovePicklistValue(idx)}
                              className="text-slate-500 hover:text-crm-coral"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dynamic Section: Lookup Target Object */}
                  {fieldForm.fieldType === 'lookup' && (
                    <div className="p-4 rounded-xl bg-[#141620] border border-slate-200 dark:border-[#2A3042] space-y-2">
                      <label className="text-xs font-bold text-crm-violet-light flex items-center gap-1.5">
                        <Link2 size={13} /> Target Object Relationship *
                      </label>
                      <select
                        className="input w-full text-xs"
                        value={fieldForm.lookupTargetObject}
                        onChange={(e) =>
                          setFieldForm({ ...fieldForm, lookupTargetObject: e.target.value })
                        }
                        required
                      >
                        <optgroup label="Standard System Objects">
                          {standardObjects.map((s) => (
                            <option key={s.apiName} value={s.apiName}>
                              {s.label} ({s.apiName})
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Custom Objects">
                          {customObjects.map((c) => (
                            <option key={c.apiName} value={c.apiName}>
                              {c.label} ({c.apiName})
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      <p className="text-[11px] text-slate-400">
                        Links records of this object to parent records in the chosen target object.
                      </p>
                    </div>
                  )}

                  {/* Flags: Required & Unique */}
                  <div className="flex items-center gap-6 pt-2">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="rounded border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] text-crm-blue focus:ring-crm-blue cursor-pointer"
                        checked={fieldForm.isRequired}
                        onChange={(e) =>
                          setFieldForm({ ...fieldForm, isRequired: e.target.checked })
                        }
                      />
                      Required (Must have a value)
                    </label>

                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="rounded border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] text-crm-blue focus:ring-crm-blue cursor-pointer"
                        checked={fieldForm.isUnique}
                        onChange={(e) =>
                          setFieldForm({ ...fieldForm, isUnique: e.target.checked })
                        }
                      />
                      Unique (No duplicate values)
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-[#2A3042]">
                    <button
                      type="button"
                      onClick={() => setShowFieldModal(false)}
                      className="btn-ghost text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary text-xs gap-1.5 shadow-glow-blue"
                    >
                      <Check size={14} /> {editingField ? 'Save Changes' : 'Create Custom Field'}
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

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW 1: MAIN OBJECT MANAGER TABLE VIEW
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-crm-blue/20 text-crm-blue border border-crm-blue/30 flex items-center justify-center font-black">
              <Boxes size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-950 dark:text-white">Object Manager</h1>
              <p className="text-slate-400 text-xs mt-0.5">
                Custom Object Schema Builder • Define Custom Objects, Field Types & Relational Lookups
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenNewObjectModal}
            className="btn-primary text-xs gap-1.5 shadow-glow-blue"
          >
            <Plus size={15} /> New Custom Object
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-crm-blue">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Entities</span>
            <Boxes size={16} className="text-crm-blue" />
          </div>
          <p className="text-2xl font-black text-slate-950 dark:text-white mt-2 tabular-nums">{allObjects.length}</p>
          <span className="text-[11px] text-slate-500 mt-1">Available in Schema</span>
        </div>

        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Custom Objects</span>
            <Database size={16} className="text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400 mt-2 tabular-nums">{customObjects.length}</p>
          <span className="text-[11px] text-emerald-400/80 mt-1 font-medium">User-Defined Schemas</span>
        </div>

        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-crm-violet">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Standard Objects</span>
            <Layers size={16} className="text-crm-violet" />
          </div>
          <p className="text-2xl font-black text-slate-950 dark:text-white mt-2 tabular-nums">{standardObjects.length}</p>
          <span className="text-[11px] text-slate-500 mt-1">Core Built-In Models</span>
        </div>

        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-crm-teal">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Phase 1 Scope</span>
            <Sparkles size={16} className="text-crm-teal" />
          </div>
          <p className="text-xs font-bold text-slate-950 dark:text-white mt-2 leading-tight">Metadata & Field Designer</p>
          <span className="text-[11px] text-slate-500 mt-1">Phase 2: Generic CRUD Storage</span>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9 text-xs"
              placeholder="Quick find object label or API name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-[#1E2230] p-1 rounded-lg border border-slate-200 dark:border-[#2A3042]">
            {(['all', 'custom', 'standard'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-all ${
                  activeTab === tab
                    ? 'bg-crm-blue text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                {tab === 'all' ? 'All Objects' : tab === 'custom' ? 'Custom Objects' : 'Standard Objects'}
              </button>
            ))}
          </div>

          <button onClick={fetchAllObjects} className="btn-ghost text-xs gap-1.5" title="Refresh">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Object Manager Table */}
      <div className="table-wrapper">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>API Name</th>
              <th>Type</th>
              <th>Description</th>
              <th>Fields Count</th>
              <th>Last Modified</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-400">
                  <RefreshCw size={20} className="animate-spin text-crm-blue inline mr-2" />
                  Loading Object Manager schema...
                </td>
              </tr>
            ) : filteredObjects.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-500">
                  <Boxes size={32} className="mx-auto mb-2 opacity-40 text-crm-blue" />
                  <p className="font-semibold text-slate-300">No objects found matching your search</p>
                </td>
              </tr>
            ) : (
              filteredObjects.map((obj) => (
                <tr
                  key={obj.id}
                  onClick={() => navigate(`/setup/objects/${obj.id}`)}
                  className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                >
                  <td>
                    <div className="font-bold text-slate-950 dark:text-white text-xs hover:text-crm-blue transition-colors flex items-center gap-1.5">
                      {obj.label}
                    </div>
                  </td>
                  <td>
                    <code className="font-mono text-xs text-crm-teal bg-crm-teal/10 px-2 py-0.5 rounded border border-crm-teal/20">
                      {obj.apiName}
                    </code>
                  </td>
                  <td>
                    {obj.isStandard ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-crm-blue/15 text-crm-blue border border-crm-blue/30">
                        <Layers size={11} /> Standard Object
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <Database size={11} /> Custom Object
                      </span>
                    )}
                  </td>
                  <td className="text-xs text-slate-300 max-w-sm truncate">
                    {obj.description || '—'}
                  </td>
                  <td>
                    <span className="font-mono text-xs font-bold text-slate-950 dark:text-slate-800 dark:text-slate-200 font-bold bg-slate-100 dark:bg-[#1E2230] px-2.5 py-0.5 rounded border border-slate-300 dark:border-[#2A3042]">
                      {obj.fieldsCount || 0} fields
                    </span>
                  </td>
                  <td className="text-xs text-slate-400">{obj.lastModified || '—'}</td>
                  <td className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      <Link
                        to={`/setup/objects/${obj.id}`}
                        className="p-1.5 rounded hover:bg-crm-blue/20 text-slate-400 hover:text-crm-blue transition-colors"
                        title="Manage Object Fields"
                      >
                        <Layers size={14} />
                      </Link>

                      {!obj.isStandard && (
                        <>
                          <button
                            onClick={() => {
                              setEditingObject(obj);
                              setObjectForm({
                                label: obj.label,
                                pluralLabel: obj.pluralLabel,
                                apiName: obj.apiName,
                                description: obj.description || '',
                              });
                              setShowObjectModal(true);
                            }}
                            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-crm-blue transition-colors"
                            title="Edit Object Metadata"
                          >
                            <Edit3 size={14} />
                          </button>

                          <button
                            onClick={() => handleDeleteObject(obj.id, obj.label)}
                            className="p-1.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-crm-coral transition-colors"
                            title="Delete Custom Object"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── MODAL: NEW / EDIT CUSTOM OBJECT ──────────────────────────────── */}
      <AnimatePresence>
        {showObjectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto"
            >
              <div className="p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
                    <Database size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-950 dark:text-white">
                      {editingObject ? 'Edit Custom Object' : 'New Custom Object'}
                    </h2>
                    <p className="text-xs text-slate-400">
                      Define entity schema for contracts, warranty claims, or site visits
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowObjectModal(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveObject} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Label */}
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Singular Label *
                    </label>
                    <input
                      type="text"
                      className="input w-full text-xs"
                      placeholder="e.g. AMC Contract"
                      value={objectForm.label}
                      onChange={(e) => handleObjectLabelChange(e.target.value)}
                      required
                    />
                  </div>

                  {/* Plural Label */}
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Plural Label *
                    </label>
                    <input
                      type="text"
                      className="input w-full text-xs"
                      placeholder="e.g. AMC Contracts"
                      value={objectForm.pluralLabel}
                      onChange={(e) =>
                        setObjectForm({ ...objectForm, pluralLabel: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>

                {/* API Name */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Object API Name (Unique Identifier) *
                  </label>
                  <input
                    type="text"
                    className="input w-full text-xs font-mono"
                    placeholder="e.g. amc_contract"
                    value={objectForm.apiName}
                    disabled={!!editingObject}
                    onChange={(e) =>
                      setObjectForm({
                        ...objectForm,
                        apiName: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                      })
                    }
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Lowercase alphanumeric characters and underscores only. Cannot collide with standard objects.
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Description
                  </label>
                  <textarea
                    className="input w-full text-xs h-20 resize-none"
                    placeholder="e.g. Annual maintenance contracts, SLA tiers, and scheduled service frequencies..."
                    value={objectForm.description}
                    onChange={(e) =>
                      setObjectForm({ ...objectForm, description: e.target.value })
                    }
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-[#2A3042]">
                  <button
                    type="button"
                    onClick={() => setShowObjectModal(false)}
                    className="btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary text-xs gap-1.5 shadow-glow-blue"
                  >
                    <Check size={14} /> {editingObject ? 'Save Changes' : 'Create & Design Fields'}
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
