/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  Zap,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import PublicLayout from '../components/layout/PublicLayout';
import { PRODUCT_NAME } from '../config/brand';

export default function PricingPage() {
  const [annualBilling, setAnnualBilling] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const plans = [
    {
      name: 'Starter',
      description: 'Ideal for small operations and founding sales teams establishing their process.',
      monthlyPrice: 1499,
      annualPrice: 1199,
      popular: false,
      ctaText: 'Start 14-Day Free Trial',
      features: [
        'Up to 3 team user accounts',
        'Single visual sales pipeline',
        'Lead & company contact database',
        'Proforma quotations & basic tax invoices',
        'Standard email support',
        'Single warehouse stock management',
      ],
    },
    {
      name: 'Professional',
      description: 'Designed for scaling operations needing automation, multiple pipelines, and inventory sync.',
      monthlyPrice: 3799,
      annualPrice: 3039,
      popular: true,
      ctaText: 'Start 14-Day Free Trial',
      features: [
        'Up to 25 team user accounts',
        'Unlimited sales pipelines',
        'Event-driven workflow automation',
        'Multi-warehouse inventory & SKU catalog',
        'Delivery challan generation & payment receipts',
        'Email outbox tracking with custom SMTP',
        'Priority technical support (< 4 hour SLA)',
      ],
    },
    {
      name: 'Enterprise',
      description: 'For growing businesses with high security, compliance, and dedicated customization needs.',
      monthlyPrice: 8599,
      annualPrice: 6879,
      popular: false,
      ctaText: 'Contact Enterprise Sales',
      features: [
        'Unlimited team user accounts',
        'Custom role-based access control (RBAC)',
        'Mandatory two-factor authentication (2FA)',
        'Comprehensive audit log trails',
        'Custom web inquiry forms & webhook integrations',
        'Dedicated account success manager',
        '99.9% guaranteed uptime service SLA',
      ],
    },
  ];

  const comparisonRows = [
    { feature: 'User Accounts', starter: '3 Users', pro: '25 Users', enterprise: 'Unlimited' },
    { feature: 'Sales Pipelines', starter: '1 Pipeline', pro: 'Unlimited', enterprise: 'Unlimited' },
    { feature: 'GST Invoicing & Quotes', starter: 'Standard', pro: 'Automated', enterprise: 'Custom Templates' },
    { feature: 'Inventory Warehouses', starter: '1 Warehouse', pro: 'Multi-Warehouse', enterprise: 'Multi-Warehouse' },
    { feature: 'Workflow Automation', starter: '—', pro: 'Included', enterprise: 'Advanced Rules' },
    { feature: 'Two-Factor Authentication', starter: 'Optional', pro: 'Enforced Option', enterprise: 'Enforced Option' },
    { feature: 'Audit Trail Logs', starter: '—', pro: '30-Day History', enterprise: 'Full History' },
    { feature: 'Support Level', starter: 'Email Support', pro: 'Priority Email', enterprise: 'Dedicated Manager' },
  ];

  const faqs = [
    {
      question: 'Is there a free trial available?',
      answer:
        'Yes. Every plan includes a 14-day free trial with full feature access. No payment details or credit card is required to sign up and get started.',
    },
    {
      question: 'Can we upgrade, downgrade, or cancel our plan anytime?',
      answer:
        'Absolutely. You can modify your subscription tier or cancel at any time directly from the Account Settings panel. Changes take effect on the following billing cycle.',
    },
    {
      question: 'How does multi-tenant data privacy work?',
      answer:
        'Every organization is provisioned with a mathematically isolated tenant domain in the database. Your leads, quotations, inventory, and customer contacts can never be accessed by other tenants.',
    },
    {
      question: 'What payment methods do you support for subscriptions?',
      answer:
        'We support all major business debit and credit cards, UPI, net banking, and direct corporate bank wire transfers for annual contracts.',
    },
    {
      question: 'Do you offer custom onboarding and data migration?',
      answer:
        'Yes. Our customer engineering team provides automated CSV import templates and assisted data onboarding for Enterprise tier subscribers.',
    },
  ];

  return (
    <PublicLayout>
      {/* ── Hero Section ────────────────────────────────────────────── */}
      <section className="relative px-4 pt-16 pb-16 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-50/50 via-white to-white dark:from-blue-950/20 dark:via-[#0B0D13] dark:to-[#0B0D13]">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-800/60 bg-blue-50/80 dark:bg-blue-950/50 px-3.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 backdrop-blur-xs">
            <Sparkles size={14} />
            <span>Transparent Subscription Pricing</span>
          </div>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-6xl">
            Predictable pricing that scales with your growth
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Choose the plan that fits your current operational needs. Upgrade anytime as your team and pipeline expand.
          </p>

          {/* Billing Toggle */}
          <div className="mt-8 flex items-center justify-center gap-3">
            <span className={`text-sm font-medium ${!annualBilling ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>
              Monthly billing
            </span>
            <button
              type="button"
              onClick={() => setAnnualBilling(!annualBilling)}
              className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-slate-300 dark:bg-slate-700 transition-colors focus:outline-none"
              role="switch"
              aria-checked={annualBilling}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition ${
                  annualBilling ? 'translate-x-5 bg-blue-600' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${annualBilling ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>
              Annual billing
            </span>
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
              Save 20%
            </span>
          </div>
        </div>
      </section>

      {/* ── Pricing Cards ───────────────────────────────────────────── */}
      <section className="px-4 py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {plans.map((p, idx) => {
            const price = annualBilling ? p.annualPrice : p.monthlyPrice;
            return (
              <div
                key={idx}
                className={`flex flex-col justify-between rounded-3xl p-8 transition-all ${
                  p.popular
                    ? 'border-2 border-blue-600 dark:border-blue-500 bg-white dark:bg-[#131620] shadow-xl relative'
                    : 'border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] shadow-xs'
                }`}
              >
                {p.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-white shadow-xs">
                    Most Popular
                  </div>
                )}

                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{p.name}</h3>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 min-h-[36px]">{p.description}</p>

                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-slate-900 dark:text-white">
                      ₹{price.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">/ month</span>
                  </div>
                  {annualBilling && (
                    <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      Billed annually (₹{(price * 12).toLocaleString()}/yr)
                    </p>
                  )}

                  <div className="mt-6 border-t border-slate-100 dark:border-white/5 pt-6 space-y-3">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                      Included in {p.name}:
                    </p>
                    {p.features.map((f, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <Check size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-xs text-slate-700 dark:text-slate-300">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 pt-4">
                  <Link
                    to={p.ctaText.includes('Sales') ? '/contact' : '/login'}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
                      p.popular
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                        : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#181B26] text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{p.ctaText}</span>
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Feature Comparison Matrix ───────────────────────────────── */}
      <section className="px-4 py-16 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-8">
          Detailed Feature Comparison
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-[#2A3042] bg-slate-50/60 dark:bg-[#181B26]/60">
              <tr>
                <th className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">Feature</th>
                <th className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">Starter</th>
                <th className="py-3.5 px-4 font-semibold text-blue-600 dark:text-blue-400">Professional</th>
                <th className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">Enterprise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {comparisonRows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                  <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{row.feature}</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{row.starter}</td>
                  <td className="py-3 px-4 text-blue-700 dark:text-blue-300 font-medium">{row.pro}</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{row.enterprise}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── FAQ Section ─────────────────────────────────────────────── */}
      <section className="px-4 py-16 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-slate-200 dark:border-[#2A3042]">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Frequently Asked Questions</h2>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Have questions about billing or subscriptions? Here are quick answers.
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  className="w-full flex items-center justify-between p-4 text-left font-medium text-slate-900 dark:text-white text-sm"
                >
                  <span>{faq.question}</span>
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-white/5 leading-relaxed">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Call To Action ──────────────────────────────────────────── */}
      <section className="px-4 py-16 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center">
        <div className="rounded-3xl bg-blue-600 dark:bg-blue-700 px-6 py-12 sm:px-12 text-white shadow-xl">
          <h2 className="text-2xl sm:text-3xl font-bold">Start your 14-day free trial now</h2>
          <p className="mt-3 text-sm text-blue-100 max-w-xl mx-auto">
            Test full functionality with sample workflows. No credit card required.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/login"
              className="rounded-xl bg-white text-blue-700 px-6 py-3 text-sm font-semibold hover:bg-blue-50 transition shadow-sm"
            >
              Get Started Free
            </Link>
            <Link
              to="/contact"
              className="rounded-xl border border-blue-400 text-white px-6 py-3 text-sm font-semibold hover:bg-blue-600/50 transition"
            >
              Talk to Our Team
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
