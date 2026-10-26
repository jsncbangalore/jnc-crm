/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Kanban,
  Zap,
  Contact,
  LineChart,
  FileText,
  Boxes,
  ShieldCheck,
  Users,
  CheckCircle2,
  ArrowRight,
  Layers,
  Sparkles,
} from 'lucide-react';
import PublicLayout from '../components/layout/PublicLayout';
import { PRODUCT_NAME } from '../config/brand';

export default function FeaturesPage() {
  const [activeTab, setActiveTab] = useState<'sales' | 'inventory' | 'billing' | 'security'>('sales');

  const categories = [
    {
      id: 'sales' as const,
      label: 'Sales & Pipelines',
      icon: Kanban,
      headline: 'Accelerate lead qualification and deal closure',
      description: 'Centralize inbound leads, assign team members, and track deal stages on visual drag-and-drop Kanban boards.',
      features: [
        'Visual drag-and-drop pipeline stages with customizable deal status gates',
        'Automated lead routing and SLA tracking for rapid first-touch follow-ups',
        'Customer interaction timeline with logged calls, notes, and email history',
        'Inbound website inquiry sync with embeddable quote forms',
      ],
    },
    {
      id: 'inventory' as const,
      label: 'Inventory & Stock',
      icon: Boxes,
      headline: 'End-to-end warehouse tracking and replenishment',
      description: 'Track stock across multiple warehouses, manage SKU variants, automate reorders, and monitor inventory movements.',
      features: [
        'Multi-warehouse stock allocation with real-time on-hand and reserved balance',
        'SKU management with HSN codes, custom categories, unit prices, and cost tracking',
        'Automated reorder point threshold alerts to prevent stockouts',
        'Seamless link between inventory records and quotation line items',
      ],
    },
    {
      id: 'billing' as const,
      label: 'Invoicing & Challans',
      icon: FileText,
      headline: 'Compliant tax invoicing and delivery documentation',
      description: 'Generate GST-compliant tax invoices, proforma quotations, delivery challans, and track payment receipts.',
      features: [
        'One-click conversion of accepted quotations into binding tax invoices',
        'Integrated GST calculation (CGST, SGST, IGST) with customizable tax rates',
        'PDF document generation with company seal, signature, and banking details',
        'Delivery challan creation and tracking for dispatched shipments',
      ],
    },
    {
      id: 'security' as const,
      label: 'Access & Security',
      icon: ShieldCheck,
      headline: 'Enterprise-grade tenant isolation and audit governance',
      description: 'Protect sensitive customer data with role-based permissions, two-factor authentication, and encrypted credentials.',
      features: [
        'Strict tenant-level database row isolation across all API endpoints',
        'Two-factor authentication (TOTP authenticator app and email verification)',
        'Comprehensive audit log recording logins, data exports, and record edits',
        'Device session management with one-click remote session revocation',
      ],
    },
  ];

  const currentCategory = categories.find((c) => c.id === activeTab) || categories[0];

  return (
    <PublicLayout>
      {/* ── Hero Section ────────────────────────────────────────────── */}
      <section className="relative px-4 pt-16 pb-20 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-50/50 via-white to-white dark:from-blue-950/20 dark:via-[#0B0D13] dark:to-[#0B0D13]">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-800/60 bg-blue-50/80 dark:bg-blue-950/50 px-3.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 backdrop-blur-xs">
            <Sparkles size={14} />
            <span>Platform Capabilities</span>
          </div>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-6xl">
            Everything your team needs to sell, fulfill, and bill
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
            {PRODUCT_NAME} replaces disconnected spreadsheets and point solutions with an integrated operations hub designed for growing businesses.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition"
            >
              <span>Start Free Trial</span>
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/contact"
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#181B26] px-6 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              Schedule a Demo
            </Link>
          </div>
        </div>
      </section>

      {/* ── Interactive Category Explorer ────────────────────────────── */}
      <section className="px-4 py-16 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2 border-b border-slate-200 dark:border-[#2A3042] pb-4">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const active = activeTab === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveTab(cat.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-[#181B26] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#2A3042] hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                <Icon size={16} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Category Content */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-6 space-y-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              {currentCategory.headline}
            </h2>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {currentCategory.description}
            </p>
            <ul className="space-y-3.5">
              {currentCategory.features.map((feat, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700 dark:text-slate-200">{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-2xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-400"></span>
                  <span className="w-3 h-3 rounded-full bg-amber-400"></span>
                  <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
                </div>
                <span className="text-xs font-mono text-slate-400">system/module/{currentCategory.id}</span>
              </div>
              <div className="space-y-3">
                <div className="h-6 w-3/4 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse"></div>
                <div className="h-20 rounded-xl bg-slate-50 dark:bg-white/5 p-4 border border-dashed border-slate-200 dark:border-white/10 flex items-center justify-center text-xs text-slate-500">
                  Interactive preview and live workflow simulator active
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="h-12 rounded-lg bg-blue-50/60 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 p-2 text-[11px] text-blue-700 dark:text-blue-300 font-medium">
                    Verified Sync: Operational
                  </div>
                  <div className="h-12 rounded-lg bg-emerald-50/60 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40 p-2 text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                    Latency: &lt; 25ms
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Grid of 6 Core Modules ──────────────────────────────────── */}
      <section className="px-4 py-16 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-200 dark:border-[#2A3042]">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Built for seamless cross-functional execution
          </h2>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Every module in {PRODUCT_NAME} shares data in real-time, removing manual re-entry and discrepancies.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: Kanban,
              title: 'Deal Pipeline Tracking',
              desc: 'Customizable stages, probability estimates, expected close dates, and visual bottleneck detection.',
            },
            {
              icon: FileText,
              title: 'GST Quotations & Invoices',
              desc: 'Auto-calculate interstate IGST vs local CGST/SGST with multi-currency and payment milestone terms.',
            },
            {
              icon: Boxes,
              title: 'Inventory & Warehousing',
              desc: 'Track bin locations, reserved stock for accepted quotations, and vendor purchase order receipts.',
            },
            {
              icon: Zap,
              title: 'Event-Driven Automation',
              desc: 'Configure rules that trigger notifications, assign leads, or notify team channels when events occur.',
            },
            {
              icon: Users,
              title: 'Role-Based Permissions',
              desc: 'Granular user access templates giving sales, warehouse, and finance personnel appropriate visibility.',
            },
            {
              icon: LineChart,
              title: 'Executive Dashboards',
              desc: 'Real-time sales velocity, revenue pipeline projections, and team activity tracking without spreadsheets.',
            },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={i}
                className="rounded-2xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] p-6 shadow-xs hover:border-blue-500/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
                  <Icon size={20} />
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">{item.title}</h3>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Call To Action ──────────────────────────────────────────── */}
      <section className="px-4 py-16 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center">
        <div className="rounded-3xl bg-blue-600 dark:bg-blue-700 px-6 py-12 sm:px-12 text-white shadow-xl">
          <h2 className="text-2xl sm:text-3xl font-bold">Ready to modernize your business operations?</h2>
          <p className="mt-3 text-sm text-blue-100 max-w-xl mx-auto">
            Get started in under five minutes. No credit card required to begin your 14-day full feature trial.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/login"
              className="rounded-xl bg-white text-blue-700 px-6 py-3 text-sm font-semibold hover:bg-blue-50 transition shadow-sm"
            >
              Start Free Trial
            </Link>
            <Link
              to="/contact"
              className="rounded-xl border border-blue-400 text-white px-6 py-3 text-sm font-semibold hover:bg-blue-600/50 transition"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
