/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Factory,
  Briefcase,
  Store,
  Check,
  ArrowRight,
  TrendingUp,
  Shield,
  Layers,
  Sparkles,
} from 'lucide-react';
import PublicLayout from '../components/layout/PublicLayout';
import { PRODUCT_NAME } from '../config/brand';

export default function SolutionsPage() {
  const solutions = [
    {
      icon: Building2,
      badge: 'Wholesale & Distribution',
      title: 'High-Volume Order Processing & Warehouse Logistics',
      description:
        'Coordinate multiple stock locations, customer-specific price tiers, batch order fulfillment, and automated delivery challans without lag.',
      benefits: [
        'Real-time inventory levels preventing overselling on backorders',
        'Bulk quotations with volume tiered pricing and margin visibility',
        'Consolidated purchase order bills and vendor payment schedules',
        'Instant delivery challans generated alongside GST tax invoices',
      ],
    },
    {
      icon: Factory,
      badge: 'Manufacturing & Engineering',
      title: 'Component Procurement, Stock Control & Assembly Lines',
      description:
        'Bridge sales inquiry estimates with component stock availability, supplier lead times, and dispatch tracking in a unified system.',
      benefits: [
        'Detailed SKU catalog with HSN codes and supplier part numbers',
        'Supplier performance tracking and purchase order receipt records',
        'Automated low-stock threshold notifications for critical components',
        'Accurate costing and advance payment milestone tracking',
      ],
    },
    {
      icon: Briefcase,
      badge: 'B2B Professional Services',
      title: 'Client Proposals, Milestone Billing & Contract Oversight',
      description:
        'From discovery call to signed contract and installment billing, manage high-value customer engagements with transparent audit history.',
      benefits: [
        'Custom proforma invoices and proposal quotations with custom terms',
        'Full customer conversation history: emails, calls, and internal notes',
        'Milestone-based progress billing with payment receipt generation',
        'Role-scoped user access preventing unauthorized margin disclosure',
      ],
    },
    {
      icon: Store,
      badge: 'Multi-Location Operations',
      title: 'Centralized Governance with Isolated Branch Workspaces',
      description:
        'Operate branch offices or independent sales teams under one central management plane with granular access templates and roll-up reporting.',
      benefits: [
        'Multi-tenant workspace isolation ensuring complete data confidentiality',
        'Dedicated document branding per entity or central enterprise logo',
        'Consolidated management reporting across regional teams',
        'Single sign-on and mandatory two-factor security enforcement',
      ],
    },
  ];

  return (
    <PublicLayout>
      {/* ── Hero Section ────────────────────────────────────────────── */}
      <section className="relative px-4 pt-16 pb-20 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-50/50 via-white to-white dark:from-blue-950/20 dark:via-[#0B0D13] dark:to-[#0B0D13]">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-800/60 bg-blue-50/80 dark:bg-blue-950/50 px-3.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 backdrop-blur-xs">
            <Sparkles size={14} />
            <span>Tailored Industry Solutions</span>
          </div>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-6xl">
            Engineered for the demands of your specific business model
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
            Whether managing complex distribution warehouses or fast-moving client accounts, {PRODUCT_NAME} adapts to your exact operational workflows.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition"
            >
              <span>Explore Platform Free</span>
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/contact"
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#181B26] px-6 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              Speak with a Solution Specialist
            </Link>
          </div>
        </div>
      </section>

      {/* ── Solutions Cards ─────────────────────────────────────────── */}
      <section className="px-4 py-16 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {solutions.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="flex flex-col justify-between rounded-3xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] p-8 shadow-xs hover:border-blue-500/40 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <Icon size={24} />
                    </div>
                    <span className="rounded-full bg-slate-100 dark:bg-white/10 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {item.badge}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
                    {item.description}
                  </p>

                  <div className="border-t border-slate-100 dark:border-white/5 pt-5 space-y-3">
                    {item.benefits.map((b, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <Check size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">{b}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 pt-4">
                  <Link
                    to="/inquiry"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <span>Request solution walkthrough</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Key Advantages Section ──────────────────────────────────── */}
      <section className="px-4 py-16 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-200 dark:border-[#2A3042]">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Why teams choose our integrated architecture
          </h2>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            One platform that unifies operations, eliminates error-prone sync tools, and delivers guaranteed data security.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
              <TrendingUp size={22} />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Immediate Time-to-Value</h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Import existing contacts and product SKUs in seconds using standardized clean templates with zero complex setup.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-4">
              <Shield size={22} />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Enterprise Privacy by Design</h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Strict multi-tenant cryptographic safeguards ensure your leads, quotes, and customer accounts remain strictly private.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4">
              <Layers size={22} />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Modular Scalability</h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Start with basic lead tracking and scale into multi-location inventory, warehouse receipts, and team automation as you grow.
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ──────────────────────────────────────────────── */}
      <section className="px-4 py-16 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center">
        <div className="rounded-3xl bg-blue-600 dark:bg-blue-700 px-6 py-12 sm:px-12 text-white shadow-xl">
          <h2 className="text-2xl sm:text-3xl font-bold">Discover how {PRODUCT_NAME} can transform your operation</h2>
          <p className="mt-3 text-sm text-blue-100 max-w-xl mx-auto">
            Our deployment specialists can walk you through an interactive demonstration customized to your team size.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/contact"
              className="rounded-xl bg-white text-blue-700 px-6 py-3 text-sm font-semibold hover:bg-blue-50 transition shadow-sm"
            >
              Get in Touch
            </Link>
            <Link
              to="/pricing"
              className="rounded-xl border border-blue-400 text-white px-6 py-3 text-sm font-semibold hover:bg-blue-600/50 transition"
            >
              Compare Plans
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
