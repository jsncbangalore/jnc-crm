import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, Mail, Phone, MapPin, Globe, Check, AlertCircle } from 'lucide-react';
import { companiesApi } from '../../services/api';
import { Company } from '../../types';

interface CompanyModalProps {
  isOpen: boolean;
  companyId?: string | null;
  initialData?: Partial<Company>;
  onClose: () => void;
  onSaved?: (company: Company) => void;
}

export default function CompanyModal({
  isOpen,
  companyId,
  initialData,
  onClose,
  onSaved,
}: CompanyModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    gstin: '',
    industry: '',
    address: '',
    city: '',
    state: 'Karnataka',
    website: '',
    billingEmail: '',
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (companyId) {
        fetchCompany(companyId);
      } else if (initialData) {
        setFormData({
          name: initialData.name || '',
          gstin: initialData.gstin || '',
          industry: initialData.industry || '',
          address: initialData.address || '',
          city: initialData.city || '',
          state: initialData.state || 'Karnataka',
          website: initialData.website || '',
          billingEmail: initialData.billingEmail || '',
        });
      } else {
        setFormData({
          name: '',
          gstin: '',
          industry: '',
          address: '',
          city: '',
          state: 'Karnataka',
          website: '',
          billingEmail: '',
        });
      }
    }
  }, [isOpen, companyId, initialData]);

  const fetchCompany = async (id: string) => {
    try {
      setLoading(true);
      const { data } = await companiesApi.get(id);
      if (data) {
        setFormData({
          name: data.name || '',
          gstin: data.gstin || '',
          industry: data.industry || '',
          address: data.address || '',
          city: data.city || '',
          state: data.state || 'Karnataka',
          website: data.website || '',
          billingEmail: data.billingEmail || '',
        });
      }
    } catch (err) {
      console.error('Failed to load company details', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Company Name is required');
      return;
    }

    try {
      setSaving(true);
      let resultCompany: Company;
      if (companyId) {
        const { data } = await companiesApi.update(companyId, formData);
        resultCompany = data;
      } else {
        const { data } = await companiesApi.create(formData);
        resultCompany = data;
      }

      if (onSaved) onSaved(resultCompany);
      onClose();
    } catch (err: any) {
      alert('Failed to save company: ' + (err?.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="card w-full max-w-xl border-slate-200 dark:border-[#2A3042] shadow-2xl p-6 bg-white dark:bg-[#181B26] overflow-y-auto max-h-[90vh]"
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#2A3042] mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-crm-blue/20 text-crm-blue flex items-center justify-center">
                <Building2 size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-950 dark:text-white">
                  {companyId ? 'Edit Company / Account' : 'New Company / Account'}
                </h2>
                <p className="text-xs text-slate-400">
                  Manage client corporate details, GSTIN, and default billing email
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Company Name & GSTIN */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Company Name *</label>
                <input
                  required
                  className="input text-xs"
                  placeholder="e.g. Apex Robotics Pvt Ltd"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="label">GSTIN Number</label>
                <input
                  className="input text-xs font-mono uppercase"
                  placeholder="e.g. 29AAAAA0000A1Z5"
                  maxLength={15}
                  value={formData.gstin}
                  onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                />
              </div>
            </div>

            {/* Billing / Invoice Email - FEATURE HIGHLIGHT */}
            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-[#141722] border border-crm-blue/30 space-y-1.5">
              <label className="label flex items-center gap-1.5 text-crm-blue-light">
                <Mail size={13} /> Billing / Invoice Email (Accounts Payable)
              </label>
              <input
                type="email"
                className="input text-xs"
                placeholder="e.g. accounts.payable@apexrobotics.in / billing@client.com"
                value={formData.billingEmail}
                onChange={(e) => setFormData({ ...formData, billingEmail: e.target.value })}
              />
              <p className="text-[10.5px] text-slate-400">
                Note: When generating invoices, the recipient email will automatically default to this address.
              </p>
            </div>

            {/* Address & City */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Registered Address</label>
                <input
                  className="input text-xs"
                  placeholder="e.g. Plot 42, Electronic City Phase 1"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div>
                <label className="label">City</label>
                <input
                  className="input text-xs"
                  placeholder="e.g. Bengaluru"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
            </div>

            {/* State & Industry & Website */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">State</label>
                <input
                  className="input text-xs"
                  placeholder="e.g. Karnataka"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Industry</label>
                <input
                  className="input text-xs"
                  placeholder="e.g. Manufacturing / IT"
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Website</label>
                <input
                  className="input text-xs"
                  placeholder="e.g. https://apexrobotics.in"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end items-center gap-2 pt-4 border-t border-slate-200 dark:border-[#2A3042]">
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary text-xs px-5 shadow-glow-blue"
              >
                {saving ? 'Saving...' : companyId ? 'Update Company' : 'Create Company'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
