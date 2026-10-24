/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  RotateCcw,
  Sliders,
  CheckCircle2,
  Lock,
  Sparkles,
  Info,
  Shield,
  Layers,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';
import { useBranding } from '../contexts/BrandingContext';
import {
  getConsent,
  setConsent,
  resetConsent,
  CookieConsentRecord,
  COOKIE_CONSENT_EVENT,
} from '../utils/cookieConsent';
import {
  STORAGE_INVENTORY,
  POLICY_UPDATED_AT,
  POLICY_VERSION,
  StorageItemCategory,
} from '../config/storage-inventory';

// Plain-English grouped overview so any user understands what we store and why
interface SimplifiedStorageGroup {
  title: string;
  category: 'necessary' | 'preferences';
  badge: string;
  icon: 'lock' | 'sparkles' | 'layers';
  whatItDoes: string;
  duration: string;
  canTurnOff: boolean;
  examples: string[];
}

const SIMPLIFIED_GROUPS: SimplifiedStorageGroup[] = [
  {
    title: 'Account Sign-In & Security',
    category: 'necessary',
    badge: 'Strictly Necessary',
    icon: 'lock',
    whatItDoes: 'Keeps you securely logged in while you work, protects against unauthorized access, and remembers your trusted 2-step verification device.',
    duration: 'Session / up to 7 to 30 days',
    canTurnOff: false,
    examples: ['Encrypted login tokens', 'Session active flag', 'Trusted device recognition'],
  },
  {
    title: 'Your Visual & Layout Preferences',
    category: 'preferences',
    badge: 'Optional Preferences',
    icon: 'sparkles',
    whatItDoes: 'Remembers your preferred Light or Dark appearance mode, collapsed sidebar state, and customized dashboard KPI cards so you do not have to set them each time.',
    duration: 'Saved on your device until you reset',
    canTurnOff: true,
    examples: ['Light / Dark theme', 'Dashboard card visibility', 'Draft buylist items'],
  },
  {
    title: 'Multi-Tab Protection & System Safety',
    category: 'necessary',
    badge: 'Strictly Necessary',
    icon: 'layers',
    whatItDoes: 'Keeps your work safe when you open multiple browser tabs, synchronizes logouts across tabs, and temporarily stores administrator configuration keys.',
    duration: 'Cleared when you close your browser tab',
    canTurnOff: false,
    examples: ['Tab workspace safety ID', 'Cross-tab logout synchronization', 'Branding display cache'],
  },
];

export default function CookieConsentPage() {
  const navigate = useNavigate();
  const { branding } = useBranding();

  const [consent, setConsentState] = useState<CookieConsentRecord | null>(() => getConsent());
  const [filterCategory, setFilterCategory] = useState<'all' | StorageItemCategory>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalNecessary, setModalNecessary] = useState(true);
  const [modalPref, setModalPref] = useState(false);
  const [choicePreset, setChoicePreset] = useState<'necessary_only' | 'all' | 'custom'>('custom');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showTechnicalInventory, setShowTechnicalInventory] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      const current = getConsent();
      setConsentState(current);
      if (current) {
        setModalPref(current.preferences);
      }
    };

    window.addEventListener(COOKIE_CONSENT_EVENT, handleUpdate);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, handleUpdate);
  }, []);

  const showFeedbackMessage = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleOpenChangeChoice = () => {
    const isPref = Boolean(consent?.preferences);
    setModalNecessary(true);
    setModalPref(isPref);
    setChoicePreset(consent?.choice || (isPref ? 'all' : 'necessary_only'));
    setIsModalOpen(true);
  };

  const handleSaveModal = (choice?: 'necessary_only' | 'all' | 'custom') => {
    if (!modalNecessary) {
      resetConsent();
      setConsentState(null);
      setIsModalOpen(false);
      showFeedbackMessage('All cookie storage disabled. You have been signed out.');
      return;
    }

    const effectiveChoice = choice || (choicePreset === 'custom' ? 'custom' : modalPref ? 'all' : 'necessary_only');
    const updated = setConsent(effectiveChoice, modalPref);
    setConsentState(updated);
    setIsModalOpen(false);
    showFeedbackMessage('Cookie preferences updated successfully.');
  };

  const handleResetChoice = () => {
    resetConsent();
    setConsentState(null);
    setModalPref(false);
    showFeedbackMessage('Cookie preferences have been reset.');
  };

  const filteredItems = STORAGE_INVENTORY.filter((item) => {
    if (filterCategory === 'all') return true;
    return item.category === filterCategory;
  });

  const getStatusLabel = () => {
    if (!consent) return 'Choice Not Yet Registered';
    if (consent.choice === 'all') return 'All Cookies & Preferences Accepted';
    if (consent.choice === 'necessary_only') return 'Necessary Cookies Only (Preferences Disabled)';
    return consent.preferences
      ? 'Custom Choice: Preferences Enabled'
      : 'Custom Choice: Preferences Disabled';
  };

  // Privacy contact dynamically read from settings / branding config (no hardcoded address)
  const privacyContact =
    branding.privacyEmail ||
    branding.supportEmail ||
    (branding.companyDisplayName ? `${branding.companyDisplayName} Administrator` : 'Workspace Administrator');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1220] text-slate-800 dark:text-slate-100 transition-colors">
      {/* ── Top Header Bar ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#111A2E]/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#18233C] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all flex items-center gap-1.5 text-xs font-semibold"
            aria-label="Go back"
          >
            <ArrowLeft size={15} />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {branding.companyDisplayName || 'Workspace'}
            </span>
          </div>
        </div>

        <Link
          to="/"
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Return to Portal
        </Link>
      </header>

      {/* ── Main Content Container ───────────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-7">
        {/* Feedback Alert */}
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2 shadow-xs"
          >
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{feedback}</span>
          </motion.div>
        )}

        {/* Page Title & Simple Overview */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold">
            <Shield size={13} />
            <span>Privacy & Storage Transparency</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Cookies & Browser Storage
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
            We believe in complete transparency. We only use browser storage to keep your account safe
            and remember your visual preferences. We do not use third-party tracking, advertising,
            or marketing cookies.
          </p>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            Policy updated: {POLICY_UPDATED_AT} (Version {POLICY_VERSION})
          </div>
        </div>

        {/* Current Choice Card */}
        <section className="bg-white dark:bg-[#121A2B] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Your Current Choice
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full ${
                    consent ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {getStatusLabel()}
                </span>
              </div>
              {consent?.savedAt && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Registered: {new Date(consent.savedAt).toLocaleDateString()}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleOpenChangeChoice}
                className="py-2 px-4 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-xs flex items-center gap-1.5"
              >
                <Sliders size={14} />
                <span>Change choice</span>
              </button>
              <button
                type="button"
                onClick={handleResetChoice}
                className="py-2 px-3 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all flex items-center gap-1.5"
              >
                <RotateCcw size={13} />
                <span>Reset</span>
              </button>
            </div>
          </div>
        </section>

        {/* What We Store: 3 Simple Categories */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              What We Store & Why
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Plain-English explanation of the three types of data stored in your browser.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Necessary */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#121A2B] border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                    <Lock size={16} />
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    Always On
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1.5">
                  1. Secure Sign-In
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Keeps your account authenticated, verifies two-factor security, and prevents session hijacking.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
                Duration: Session / up to 7–30 days
              </div>
            </div>

            {/* Card 2: Preferences */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#121A2B] border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                    <Sparkles size={16} />
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    consent?.preferences
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {consent?.preferences ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1.5">
                  2. Visual Preferences
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Saves your chosen Dark or Light theme mode and dashboard summary card layouts so your workspace looks the way you like it.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
                Duration: Until you reset your choice
              </div>
            </div>

            {/* Card 3: No Tracking */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#121A2B] border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    <Shield size={16} />
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    Never Used
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1.5">
                  3. Zero Advertising
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  We do not use advertising cookies, marketing beacons, or cross-site tracking scripts. Your work data is never sold or shared.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
                0 third-party trackers
              </div>
            </div>
          </div>
        </section>

        {/* Simplified Breakdown List */}
        <section className="bg-white dark:bg-[#121A2B] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Summary of What Is Stored
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                A simple breakdown of the items stored on your device.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {SIMPLIFIED_GROUPS.map((group) => (
              <div key={group.title} className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {group.title}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        group.category === 'necessary'
                          ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900'
                          : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
                      }`}
                    >
                      {group.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {group.whatItDoes}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Examples:</span>
                    {group.examples.map((ex, i) => (
                      <span key={ex} className="inline-flex items-center">
                        <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px]">
                          {ex}
                        </span>
                        {i < group.examples.length - 1 && <span className="mx-1 text-slate-300 dark:text-slate-700">•</span>}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="shrink-0 text-left sm:text-right text-[11px] text-slate-500 dark:text-slate-400">
                  <div className="font-medium text-slate-700 dark:text-slate-300">{group.duration}</div>
                  <div>{group.canTurnOff ? 'Optional (your choice)' : 'Essential for operation'}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Technical Key Inventory (Collapsible for auditors / technical staff) */}
        <section className="bg-white dark:bg-[#121A2B] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setShowTechnicalInventory(!showTechnicalInventory)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Layers size={16} className="text-slate-500 dark:text-slate-400" />
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  Technical Storage Keys ({STORAGE_INVENTORY.length} Items)
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  For privacy auditors and developers: click to inspect exact browser keys and technical names.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
              <span>{showTechnicalInventory ? 'Hide technical list' : 'View full key list'}</span>
              {showTechnicalInventory ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </div>
          </button>

          {showTechnicalInventory && (
            <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/40 dark:bg-slate-900/30">
              {/* Category filter tabs */}
              <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 w-fit text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setFilterCategory('all')}
                  className={`py-1 px-3 rounded-lg transition-all ${
                    filterCategory === 'all'
                      ? 'bg-white dark:bg-slate-700 font-bold text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  All ({STORAGE_INVENTORY.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory('necessary')}
                  className={`py-1 px-3 rounded-lg transition-all ${
                    filterCategory === 'necessary'
                      ? 'bg-white dark:bg-slate-700 font-bold text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Necessary ({STORAGE_INVENTORY.filter((i) => i.category === 'necessary').length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory('preferences')}
                  className={`py-1 px-3 rounded-lg transition-all ${
                    filterCategory === 'preferences'
                      ? 'bg-white dark:bg-slate-700 font-bold text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Preferences ({STORAGE_INVENTORY.filter((i) => i.category === 'preferences').length})
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121A2B]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 font-semibold">
                      <th className="py-2.5 px-3">Key Name</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Duration</th>
                      <th className="py-2.5 px-3 min-w-[200px]">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredItems.map((item) => (
                      <tr
                        key={item.name}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-2 px-3 font-mono text-[11px] font-semibold text-slate-900 dark:text-slate-200">
                          {item.name}
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                          {item.type}
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-300 text-[11px]">
                          {item.duration}
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                          {item.purpose}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Privacy Contact Card (Read dynamically from configuration) */}
        <section className="bg-white dark:bg-[#121A2B] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0">
              <Info size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                Privacy Questions & Contact
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                If you have questions regarding our cookie management or privacy safeguards, please reach
                out to your designated privacy contact: <span className="font-semibold text-slate-800 dark:text-slate-200">{privacyContact}</span>.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ── Granular Preference Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg p-5 text-slate-800 dark:text-slate-100"
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Adjust Cookie Preferences
                </h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {/* Preset Choice Buttons */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setChoicePreset('necessary_only');
                    setModalNecessary(true);
                    setModalPref(false);
                  }}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    choicePreset === 'necessary_only'
                      ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 ring-2 ring-blue-600/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="text-xs font-bold">Necessary Only</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Basic Security</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoicePreset('all');
                    setModalNecessary(true);
                    setModalPref(true);
                  }}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    choicePreset === 'all'
                      ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 ring-2 ring-blue-600/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="text-xs font-bold">Accept All</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Full Features</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoicePreset('custom');
                  }}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    choicePreset === 'custom'
                      ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 ring-2 ring-blue-600/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="text-xs font-bold">Custom</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Toggle Each</div>
                </button>
              </div>

              <div className="space-y-3 mb-5">
                {/* Strictly Necessary with interactive toggle switch */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Strictly Necessary (Sign-In & Security)
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                          {modalNecessary ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Required for secure login, multi-tab protection, and session integrity.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={modalNecessary}
                        onChange={(e) => {
                          setModalNecessary(e.target.checked);
                          setChoicePreset('custom');
                        }}
                        className="sr-only peer"
                        aria-label="Toggle strictly necessary storage"
                      />
                      <div className="w-10 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  {!modalNecessary && (
                    <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
                      ⚠️ Turning off necessary storage will sign you out and prevent login until re-enabled.
                    </div>
                  )}
                </div>

                {/* Preferences with interactive toggle switch */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Preferences (Appearance & Layout)
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                        {modalPref ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Stores your light/dark theme and personalized dashboard layouts.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={modalPref}
                      onChange={(e) => {
                        setModalPref(e.target.checked);
                        setChoicePreset('custom');
                      }}
                      className="sr-only peer"
                      aria-label="Toggle preferences storage"
                    />
                    <div className="w-10 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-full sm:w-auto py-2 px-3 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-center"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setModalNecessary(true);
                      setModalPref(true);
                      handleSaveModal('all');
                    }}
                    className="w-full sm:w-auto py-2 px-3 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-center"
                  >
                    Accept all
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveModal()}
                    className="w-full sm:w-auto py-2 px-4 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-xs text-center"
                  >
                    Save choice
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
