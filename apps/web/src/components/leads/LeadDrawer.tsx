import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  Building,
  MapPin,
  Calendar,
  Clock,
  FileText,
  ShoppingBag,
  MessageCircle,
  Plus,
  Share2,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { Lead, LeadStatus, User as UserType } from '../../types';
import { leadsApi } from '../../services/api';
import { formatDistanceToNow, format } from 'date-fns';
import { formatIndianCurrency } from './CompactLeadCard';

export interface LeadDrawerProps {
  lead: Lead | null;
  onClose: () => void;
  onUpdateLead: (updated: Lead) => void;
  salesReps: UserType[];
  hasQuotationAccess?: boolean;
  hasOrderAccess?: boolean;
  onCreateQuote?: (lead: Lead) => void;
  onConvertToOrder?: (lead: Lead) => void;
  onShareLead?: (lead: Lead) => void;
}

export const LeadDrawer: React.FC<LeadDrawerProps> = ({
  lead,
  onClose,
  onUpdateLead,
  salesReps,
  hasQuotationAccess = true,
  hasOrderAccess = true,
  onCreateQuote,
  onConvertToOrder,
  onShareLead,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'timeline' | 'quotes_orders' | 'notes'>('details');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for details tab
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    companyName: '',
    city: '',
    state: '',
    productName: '',
    productCategory: '',
    quantity: 1,
    unit: 'NOS',
    estimatedValue: 0,
    urgency: 'standard',
    assignedToId: '',
    nextFollowUpAt: '',
  });

  // New note state
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Sync form when lead changes
  useEffect(() => {
    if (lead) {
      setFormData({
        customerName: lead.customerName || '',
        customerPhone: lead.customerPhone || '',
        customerEmail: lead.customerEmail || '',
        companyName: lead.company?.name || lead.companyName || '',
        city: lead.city || '',
        state: lead.state || '',
        productName: lead.productName || '',
        productCategory: lead.productCategory || '',
        quantity: lead.quantity || 1,
        unit: lead.unit || 'NOS',
        estimatedValue: lead.estimatedValue || 0,
        urgency: lead.urgency || 'standard',
        assignedToId: lead.assignedToId || '',
        nextFollowUpAt: lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toISOString().split('T')[0] : '',
      });
      setIsEditing(false);
      setError(null);
    }
  }, [lead]);

  // Esc key listener (Requirement 6)
  useEffect(() => {
    if (!lead) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [lead, onClose]);

  if (!lead) return null;

  const cleanPhone = lead.customerPhone ? lead.customerPhone.replace(/\D/g, '') : '';
  const hasPhone = Boolean(cleanPhone && cleanPhone.length >= 7);

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await leadsApi.update(lead.id, {
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        customerEmail: formData.customerEmail || null,
        companyName: formData.companyName || null,
        city: formData.city || null,
        state: formData.state || null,
        productName: formData.productName || null,
        productCategory: formData.productCategory || null,
        quantity: Number(formData.quantity) || 1,
        unit: formData.unit,
        estimatedValue: Number(formData.estimatedValue) || 0,
        urgency: formData.urgency,
        assignedToId: formData.assignedToId || null,
        nextFollowUpAt: formData.nextFollowUpAt ? new Date(formData.nextFollowUpAt).toISOString() : null,
      });
      onUpdateLead(res.data);
      setIsEditing(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to update lead');
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      await leadsApi.addActivity(lead.id, {
        type: 'note',
        title: 'Note Added',
        description: newNote.trim(),
        isCompleted: true,
      });
      setNewNote('');
      // Refresh lead details
      const refreshed = await leadsApi.get(lead.id);
      onUpdateLead(refreshed.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-label={`Lead details for ${lead.customerName}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl h-full bg-white dark:bg-[#181B26] border-l border-slate-200 dark:border-[#2A3042] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── DRAWER HEADER ──────────────────────────────────────────────── */}
        <div className="p-4 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-9 h-9 rounded-lg bg-crm-blue/15 text-crm-blue border border-crm-blue/30 flex items-center justify-center font-bold text-sm shrink-0">
              <User size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {lead.customerName}
                </h2>
                <span className="font-mono text-[11px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800/40 shrink-0">
                  {lead.leadNumber}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {lead.company?.name || lead.companyName || 'Individual Contact'} • {lead.city || 'India'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onShareLead && (
              <button
                type="button"
                onClick={() => onShareLead(lead)}
                className="px-2 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center gap-1 border border-blue-500/20"
                title="Share lead"
              >
                <Share2 size={13} />
                <span className="hidden sm:inline">Share</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Close drawer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ─── QUICK ACTIONS BAR ──────────────────────────────────────────── */}
        <div className="px-4 py-2 border-b border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#141722] flex items-center justify-between gap-2 overflow-x-auto shrink-0 text-xs">
          <div className="flex items-center gap-1.5">
            {hasPhone && (
              <a
                href={`tel:${cleanPhone}`}
                className="px-2.5 py-1 rounded bg-slate-100 dark:bg-[#1E2230] hover:bg-emerald-500/10 hover:text-emerald-600 border border-slate-200 dark:border-slate-700 flex items-center gap-1 font-medium"
              >
                <Phone size={12} className="text-emerald-500" />
                <span>Call</span>
              </a>
            )}
            {hasPhone && (
              <a
                href={`https://wa.me/${cleanPhone}`}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded bg-slate-100 dark:bg-[#1E2230] hover:bg-teal-500/10 hover:text-teal-600 border border-slate-200 dark:border-slate-700 flex items-center gap-1 font-medium"
              >
                <MessageCircle size={12} className="text-teal-500" />
                <span>WhatsApp</span>
              </a>
            )}
            {lead.customerEmail && (
              <a
                href={`mailto:${lead.customerEmail}`}
                className="px-2.5 py-1 rounded bg-slate-100 dark:bg-[#1E2230] hover:bg-blue-500/10 hover:text-blue-600 border border-slate-200 dark:border-slate-700 flex items-center gap-1 font-medium"
              >
                <Mail size={12} className="text-blue-500" />
                <span>Email</span>
              </a>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {hasQuotationAccess && onCreateQuote && (
              <button
                type="button"
                onClick={() => onCreateQuote(lead)}
                className="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1 font-bold text-xs"
              >
                <FileText size={12} />
                <span>Create Quote</span>
              </button>
            )}
            {hasOrderAccess && onConvertToOrder && (
              <button
                type="button"
                onClick={() => onConvertToOrder(lead)}
                className="px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-bold text-xs"
              >
                <ShoppingBag size={12} />
                <span>Convert to Order</span>
              </button>
            )}
          </div>
        </div>

        {/* ─── DRAWER TABS ────────────────────────────────────────────────── */}
        <div className="flex items-center border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] px-4 gap-4 text-xs font-bold shrink-0">
          {[
            { id: 'details', label: 'Details' },
            { id: 'timeline', label: 'Timeline' },
            { id: 'quotes_orders', label: 'Quotes & Orders' },
            { id: 'notes', label: 'Notes' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2.5 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-crm-blue text-crm-blue'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── DRAWER BODY ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)}>
                <X size={14} />
              </button>
            </div>
          )}

          {/* TAB 1: DETAILS */}
          {activeTab === 'details' && (
            <form onSubmit={handleSaveDetails} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Lead Information
                </span>
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="text-xs text-crm-blue font-bold hover:underline"
                  >
                    Edit Fields
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-3 py-1 bg-crm-blue text-white rounded text-xs font-bold flex items-center gap-1"
                    >
                      <Save size={12} />
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Customer Name</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:bg-slate-50 dark:disabled:bg-slate-900/50"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Phone</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.customerPhone}
                    onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:bg-slate-50 dark:disabled:bg-slate-900/50"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Email</label>
                  <input
                    type="email"
                    disabled={!isEditing}
                    value={formData.customerEmail}
                    onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:bg-slate-50 dark:disabled:bg-slate-900/50"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Company</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:bg-slate-50 dark:disabled:bg-slate-900/50"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">City</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:bg-slate-50 dark:disabled:bg-slate-900/50"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">State</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:bg-slate-50 dark:disabled:bg-slate-900/50"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Product / Service</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.productName}
                    onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:bg-slate-50 dark:disabled:bg-slate-900/50"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Est. Value (₹)</label>
                  <input
                    type="number"
                    disabled={!isEditing}
                    value={formData.estimatedValue}
                    onChange={(e) => setFormData({ ...formData, estimatedValue: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:bg-slate-50 dark:disabled:bg-slate-900/50"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Urgency</label>
                  <select
                    disabled={!isEditing}
                    value={formData.urgency}
                    onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:bg-slate-50 dark:disabled:bg-slate-900/50"
                  >
                    <option value="standard">Standard</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Sales Owner</label>
                  <select
                    disabled={!isEditing}
                    value={formData.assignedToId}
                    onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:bg-slate-50 dark:disabled:bg-slate-900/50"
                  >
                    <option value="">Unassigned</option>
                    {salesReps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name || r.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Next Follow-up Date</label>
                  <input
                    type="date"
                    disabled={!isEditing}
                    value={formData.nextFollowUpAt}
                    onChange={(e) => setFormData({ ...formData, nextFollowUpAt: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:bg-slate-50 dark:disabled:bg-slate-900/50"
                  />
                </div>
              </div>
            </form>
          )}

          {/* TAB 2: TIMELINE */}
          {activeTab === 'timeline' && (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Activity & History
              </span>

              {lead.activities && lead.activities.length > 0 ? (
                <div className="space-y-2 border-l-2 border-slate-200 dark:border-slate-800 ml-2 pl-3">
                  {lead.activities.map((act) => (
                    <div key={act.id} className="relative text-xs">
                      <div className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full bg-crm-blue" />
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{act.title}</span>
                        <span className="text-[10px] text-slate-400">
                          {act.createdAt ? format(new Date(act.createdAt), 'dd MMM yyyy, hh:mm a') : ''}
                        </span>
                      </div>
                      {act.description && (
                        <p className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5">
                          {act.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-6">No activity records yet.</p>
              )}
            </div>
          )}

          {/* TAB 3: QUOTES & ORDERS */}
          {activeTab === 'quotes_orders' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Quotations
                  </span>
                  {hasQuotationAccess && onCreateQuote && (
                    <button
                      type="button"
                      onClick={() => onCreateQuote(lead)}
                      className="text-xs text-crm-blue font-bold flex items-center gap-1 hover:underline"
                    >
                      <Plus size={12} /> New Quote
                    </button>
                  )}
                </div>

                {lead.quotations && lead.quotations.length > 0 ? (
                  <div className="space-y-2">
                    {lead.quotations.map((q) => (
                      <div
                        key={q.id}
                        className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-mono font-bold text-purple-600 dark:text-purple-400">
                            {q.quoteNumber}
                          </div>
                          <div className="text-[11px] text-slate-400 capitalize">Status: {q.status}</div>
                        </div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          ₹{Number(q.totalAmount || 0).toLocaleString('en-IN')}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-3 text-center">No quotations generated yet.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: NOTES */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <form onSubmit={handleAddNote} className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Add Follow-up Note
                </label>
                <textarea
                  rows={3}
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Record call summary, client expectations, special requests..."
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-crm-blue"
                />
                <button
                  type="submit"
                  disabled={addingNote || !newNote.trim()}
                  className="px-3 py-1.5 bg-crm-blue hover:bg-crm-blue/90 text-white rounded text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send size={12} />
                  {addingNote ? 'Saving...' : 'Add Note'}
                </button>
              </form>

              {lead.queryMessage && (
                <div className="p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Initial Customer Query
                  </span>
                  <p className="text-slate-600 dark:text-slate-400 italic">{lead.queryMessage}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
