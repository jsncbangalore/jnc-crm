import React, { useState } from 'react';
import { AlertCircle, X, Check } from 'lucide-react';
import { Lead } from '../../types';

export interface LeadLostReasonModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onSubmit: (leadId: string, reason: string, note?: string) => Promise<void>;
}

export const LOST_REASON_OPTIONS = [
  'Price too high',
  'Competitor chosen',
  'Requirement cancelled',
  'Unresponsive / No answer',
  'Features / Specifications missing',
  'Timeline mismatch',
  'Budget exhausted',
  'Other',
];

export const LeadLostReasonModal: React.FC<LeadLostReasonModalProps> = ({
  isOpen,
  lead,
  onClose,
  onSubmit,
}) => {
  const [selectedReason, setSelectedReason] = useState<string>(LOST_REASON_OPTIONS[0]);
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !lead) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReason) {
      setError('Please select a reason for marking this lead as Lost.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(lead.id, selectedReason, note.trim() || undefined);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to update lead status');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-md bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        role="dialog"
        aria-labelledby="lost-reason-title"
        aria-modal="true"
      >
        <div className="p-4 border-b border-slate-200 dark:border-[#2A3042] flex items-center justify-between bg-slate-50 dark:bg-[#1E2230]">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20">
              <AlertCircle size={18} />
            </span>
            <div>
              <h3 id="lost-reason-title" className="text-sm font-bold text-slate-900 dark:text-white">
                Mark Lead as Lost
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lead.customerName} ({lead.leadNumber})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Reason for Loss <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-crm-blue"
              required
            >
              {LOST_REASON_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Additional Notes (Optional)
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Client opted for alternative supplier offering 60-day credit terms..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-crm-blue"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-[#2A3042]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow flex items-center gap-1.5"
            >
              {submitting ? 'Updating...' : 'Confirm Lost Stage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
