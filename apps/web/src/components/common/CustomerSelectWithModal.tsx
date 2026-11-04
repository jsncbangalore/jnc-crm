import React, { useState, useEffect, useMemo } from 'react';
import { Building2, Search, Plus, X, AlertTriangle, CheckCircle2, User, Phone, Mail, MapPin } from 'lucide-react';
import { companiesApi } from '../../services/api';
import {
  validatePersonOrCompanyName,
  validatePhone,
  validateEmail,
  validateGstin,
  validateAddress,
  toPlainText,
} from '@crm/shared-validation';
import { NameField, PhoneField, StateCityField } from './forms';

export interface CustomerData {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
  state?: string;
}

interface CustomerSelectProps {
  selectedCustomerId?: string | null;
  onSelectCustomer: (customer: CustomerData) => void;
  required?: boolean;
  label?: string;
  error?: string | null;
}

const INDIAN_STATES = [
  'Karnataka',
  'Maharashtra',
  'Tamil Nadu',
  'Telangana',
  'Andhra Pradesh',
  'Kerala',
  'Gujarat',
  'Delhi',
  'Haryana',
  'Uttar Pradesh',
  'West Bengal',
  'Rajasthan',
  'Madhya Pradesh',
  'Punjab',
  'Bihar',
  'Goa',
];

export default function CustomerSelectWithModal({
  selectedCustomerId,
  onSelectCustomer,
  required = true,
  label = 'Customer Account',
  error,
}: CustomerSelectProps) {
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await companiesApi.list();
      const list = (res.data?.items || res.data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        phone: c.phone || (c.contacts && c.contacts[0]?.phone) || '',
        email: c.billingEmail || c.email || (c.contacts && c.contacts[0]?.email) || '',
        gstin: c.gstin || '',
        address: c.address || '',
        state: c.state || 'Karnataka',
      }));
      setCustomers(list);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.gstin && c.gstin.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q))
    );
  }, [customers, search]);

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          <Plus className="w-3 h-3" />
          <span>New Customer</span>
        </button>
      </div>

      {/* Selected Customer Card or Search Box */}
      {selectedCustomer ? (
        <div className="p-2.5 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {selectedCustomer.name}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {selectedCustomer.gstin && <span>GSTIN: <strong className="font-mono text-slate-700 dark:text-slate-300">{selectedCustomer.gstin}</strong></span>}
              {selectedCustomer.phone && <span>Ph: {selectedCustomer.phone}</span>}
              <span>State: {selectedCustomer.state}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
              setSearch('');
            }}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <div
            onClick={() => setIsOpen(true)}
            className={`w-full p-2 text-xs rounded-lg border cursor-pointer bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-between ${
              error ? 'border-rose-400 dark:border-rose-700' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <span>Search or select a customer...</span>
            <Search className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-rose-500 mt-1">{error}</p>}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-40 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-400 ml-1" />
            <input
              type="text"
              autoFocus
              placeholder="Search by name, GSTIN, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs bg-transparent border-none focus:outline-none text-slate-900 dark:text-white"
            />
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <div className="p-4 text-center text-xs text-slate-400">Loading customers...</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center space-y-2">
                <p className="text-xs text-slate-400">No matching customer found.</p>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setShowModal(true);
                  }}
                  className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded text-xs font-semibold"
                >
                  Create "{search}" as New Customer
                </button>
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelectCustomer(c);
                    setIsOpen(false);
                  }}
                  className="w-full text-left p-2.5 hover:bg-indigo-50/50 dark:hover:bg-slate-800/60 transition flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {c.name}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      {c.gstin && <span className="font-mono">{c.gstin}</span>}
                      {c.phone && <span>Ph: {c.phone}</span>}
                      <span>{c.state}</span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* New Customer Modal */}
      {showModal && (
        <CreateCustomerModal
          initialName={search}
          existingCustomers={customers}
          onClose={() => setShowModal(false)}
          onCreated={(newCust) => {
            setCustomers((prev) => [newCust, ...prev]);
            onSelectCustomer(newCust);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}

function CreateCustomerModal({
  initialName,
  existingCustomers,
  onClose,
  onCreated,
}: {
  initialName: string;
  existingCustomers: CustomerData[];
  onClose: () => void;
  onCreated: (customer: CustomerData) => void;
}) {
  const [name, setName] = useState(initialName || '');
  const [contactPerson, setContactPerson] = useState('');
  const [gstin, setGstin] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [state, setState] = useState('Karnataka');
  const [city, setCity] = useState('Bengaluru');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Live duplicate warning check
  const duplicateWarning = useMemo(() => {
    const normName = name.trim().toLowerCase();
    const normGstin = gstin.trim().toUpperCase();
    const cleanPhone = phone.replace(/\D/g, '');

    if (normGstin && normGstin.length === 15) {
      const match = existingCustomers.find((c) => c.gstin && c.gstin.toUpperCase() === normGstin);
      if (match) return `A customer with GSTIN ${normGstin} already exists (${match.name}).`;
    }
    if (cleanPhone && cleanPhone.length >= 10) {
      const match = existingCustomers.find((c) => c.phone && c.phone.replace(/\D/g, '').slice(-10) === cleanPhone.slice(-10));
      if (match) return `A customer with phone number ${phone} already exists (${match.name}).`;
    }
    if (normName && normName.length >= 3) {
      const match = existingCustomers.find((c) => c.name.trim().toLowerCase() === normName);
      if (match) return `A customer with exact name "${name}" already exists.`;
    }
    return null;
  }, [name, gstin, phone, existingCustomers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    const nameRes = validatePersonOrCompanyName(name);
    if (!nameRes.valid) newErrors.name = nameRes.error!;

    if (phone.trim()) {
      const cleanDigits = phone.replace(/\D/g, '');
      if (cleanDigits.length < 10) {
        newErrors.phone = 'Enter a 10-digit mobile number.';
      }
    }

    if (email.trim()) {
      const emailRes = validateEmail(email);
      if (!emailRes.valid) newErrors.email = emailRes.error!;
    }

    if (gstin.trim()) {
      const gstinRes = validateGstin(gstin);
      if (!gstinRes.valid) newErrors.gstin = gstinRes.error!;
    }

    if (address.trim()) {
      const addrRes = validateAddress(address);
      if (!addrRes.valid) newErrors.address = addrRes.error!;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      const res = await companiesApi.create({
        name: name.trim(),
        gstin: gstin.trim().toUpperCase() || undefined,
        billingEmail: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        state: state.trim() || undefined,
        city: city.trim() || undefined,
        contactPerson: contactPerson.trim() || undefined,
      });

      const created = res.data;
      onCreated({
        id: created.id,
        name: created.name,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        gstin: gstin.trim().toUpperCase() || undefined,
        address: address.trim() || undefined,
        state,
      });
    } catch (err: any) {
      console.error('Customer creation error:', err);
      const data = err?.response?.data;
      const inlineErrors: Record<string, string> = {};

      if (Array.isArray(data?.fieldErrors)) {
        for (const item of data.fieldErrors) {
          if (item && item.field) {
            inlineErrors[String(item.field)] = toPlainText(item.message || item);
          }
        }
      } else if (data?.fieldErrors && typeof data.fieldErrors === 'object') {
        for (const [key, val] of Object.entries(data.fieldErrors)) {
          inlineErrors[key] = toPlainText(val);
        }
      }

      if (Array.isArray(data?.message)) {
        for (const msg of data.message) {
          const text = toPlainText(msg);
          if (/phone/i.test(text) && !inlineErrors.phone) inlineErrors.phone = text;
          else if (/gstin/i.test(text) && !inlineErrors.gstin) inlineErrors.gstin = text;
          else if (/name/i.test(text) && !inlineErrors.name) inlineErrors.name = text;
          else if (/email/i.test(text) && !inlineErrors.email) inlineErrors.email = text;
        }
      }

      const formMsg =
        toPlainText(data?.message || err?.message || 'Failed to create customer record.');

      setErrors({
        ...(formMsg && Object.keys(inlineErrors).length === 0 ? { form: formMsg } : {}),
        ...inlineErrors,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Create New Customer</h3>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 text-xs overflow-y-auto">
          {errors.form && (
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 rounded-lg">
              {toPlainText(errors.form)}
            </div>
          )}

          {duplicateWarning && (
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600" />
              <span>{duplicateWarning}</span>
            </div>
          )}

          {/* Company Name */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Customer / Company Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={100}
              placeholder="e.g. Acme Tech Solutions"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 font-medium"
            />
            {errors.name && <p className="text-rose-500 text-[10px] mt-0.5">{toPlainText(errors.name)}</p>}
          </div>

          {/* Contact Person (Shared NameField) & Mobile (Shared PhoneField) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NameField
              id="cust-contact-person"
              label="Contact Person"
              value={contactPerson}
              onChange={(val) => setContactPerson(val)}
              placeholder="e.g. Rahul Sharma"
              maxLength={60}
            />

            <PhoneField
              id="cust-phone-field"
              label="Phone Number"
              value={phone}
              onChange={(e164) => setPhone(e164)}
              error={errors.phone}
              placeholder="10-digit mobile number"
            />
          </div>

          {/* GSTIN & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                GSTIN (Optional)
              </label>
              <input
                type="text"
                placeholder="15-character GSTIN"
                maxLength={15}
                value={gstin}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  setGstin(val);
                  if (val.trim()) {
                    const res = validateGstin(val);
                    if (!res.valid) {
                      setErrors((prev) => ({ ...prev, gstin: res.error || 'Invalid GSTIN' }));
                    } else {
                      setErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.gstin;
                        return copy;
                      });
                    }
                  } else {
                    setErrors((prev) => {
                      const copy = { ...prev };
                      delete copy.gstin;
                      return copy;
                    });
                  }
                }}
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono uppercase outline-none focus:border-indigo-500"
              />
              {errors.gstin && <p className="text-rose-500 text-[10px] mt-0.5">{toPlainText(errors.gstin)}</p>}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email Address
              </label>
              <input
                type="email"
                placeholder="accounts@example.com"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500"
              />
              {errors.email && <p className="text-rose-500 text-[10px] mt-0.5">{toPlainText(errors.email)}</p>}
            </div>
          </div>

          {/* State & City via Shared StateCityField */}
          <StateCityField
            stateValue={state}
            cityValue={city}
            onStateChange={(st) => setState(st)}
            onCityChange={(ct) => setCity(ct)}
            stateLabel="State"
            cityLabel="City / Location"
          />

          {/* Billing Address */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Billing Address
            </label>
            <input
              type="text"
              placeholder="Building, Street, Area"
              maxLength={300}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500"
            />
            {errors.address && <p className="text-rose-500 text-[10px] mt-0.5">{toPlainText(errors.address)}</p>}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {submitting ? 'Creating...' : 'Create & Select'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
