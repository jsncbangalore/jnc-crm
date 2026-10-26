/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  BookOpen,
  LifeBuoy,
  FileQuestion,
  ShieldCheck,
  Mail,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  HelpCircle,
  FileText,
  Boxes,
  Users,
} from 'lucide-react';
import PublicLayout from '../components/layout/PublicLayout';
import { PRODUCT_NAME } from '../config/brand';

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const helpTopics = [
    {
      icon: BookOpen,
      title: 'Getting Started Guide',
      desc: 'Learn the fundamentals of configuring your company profile, importing contacts, and onboarding your sales team.',
      articlesCount: 8,
    },
    {
      icon: Users,
      title: 'Leads & Deal Pipelines',
      desc: 'Master visual Kanban deal boards, lead scoring rules, automated customer follow-ups, and conversion tracking.',
      articlesCount: 12,
    },
    {
      icon: FileText,
      title: 'Invoicing & Quotations',
      desc: 'Everything about GST calculation, issuing quotations, converting to tax invoices, and downloading PDF documents.',
      articlesCount: 15,
    },
    {
      icon: Boxes,
      title: 'Inventory & Warehousing',
      desc: 'Managing SKU catalogs, stock allocations across multiple warehouses, supplier orders, and delivery challans.',
      articlesCount: 9,
    },
    {
      icon: ShieldCheck,
      title: 'Security & 2-Factor Auth',
      desc: 'Setting up authenticator apps, device session management, permission templates, and password recovery.',
      articlesCount: 6,
    },
    {
      icon: LifeBuoy,
      title: 'Integrations & Web Inquiry',
      desc: 'Connecting transactional email SMTP accounts, embedding public quote forms, and configuring notifications.',
      articlesCount: 7,
    },
  ];

  const faqs = [
    {
      q: 'How do I invite additional staff members to my workspace?',
      a: 'Navigate to Admin Settings > Users & Teams. Click "Invite User", enter their work email address, and select a predefined Role Access Template (e.g. Sales Representative, Warehouse Manager, or Billing Specialist). They will receive an email invitation to create their password.',
    },
    {
      q: 'How does GST calculation work on quotations and invoices?',
      a: 'The system automatically compares the customer shipping/billing state with your registered company state. If they match, CGST + SGST are applied equally; if different, IGST is applied. Tax rates can be customized per line item or inherited from the SKU catalog.',
    },
    {
      q: 'Can I upload a custom logo for invoices vs the portal header?',
      a: 'Yes. In Branding Settings, you can configure a "Document Logo" (used exclusively for formal PDF invoices, quotations, and delivery challans) and an optional "Portal Logo" (displayed in the top navigation bar after signing in).',
    },
    {
      q: 'What should I do if I forget my password or get locked out?',
      a: 'Click "Forgot Password" on the sign-in screen. Enter your registered email address to receive a secure one-time verification challenge. If two-factor authentication is enabled, you can also use your authenticator app or emergency backup codes.',
    },
    {
      q: 'Is there a limit on how many SKUs or products we can store?',
      a: 'There is no artificial limit on the number of products, categories, or inventory records you can manage across your warehouses.',
    },
    {
      q: 'How can I reach direct technical support?',
      a: 'Our support team is available via email at support@example.com, or you can submit an inquiry through our Contact page. Typical response time is under four business hours.',
    },
  ];

  const filteredTopics = helpTopics.filter(
    (t) =>
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <PublicLayout>
      {/* ── Hero Search Section ──────────────────────────────────────── */}
      <section className="relative px-4 pt-16 pb-16 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-50/50 via-white to-white dark:from-blue-950/20 dark:via-[#0B0D13] dark:to-[#0B0D13]">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-800/60 bg-blue-50/80 dark:bg-blue-950/50 px-3.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 backdrop-blur-xs">
            <LifeBuoy size={14} />
            <span>Help Center & Knowledge Base</span>
          </div>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
            How can we assist you today?
          </h1>
          <p className="mt-4 text-base text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
            Search our comprehensive guides, tutorials, and FAQs to get the most out of {PRODUCT_NAME}.
          </p>

          {/* Search Bar */}
          <div className="mt-8 max-w-xl mx-auto relative">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search articles, guides, GST billing, 2FA setup..."
                className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131620] pl-11 pr-4 py-3.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Topic Cards Grid ────────────────────────────────────────── */}
      <section className="px-4 py-12 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Browse by Topic</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTopics.map((topic, idx) => {
            const Icon = topic.icon;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] p-6 shadow-xs hover:border-blue-500/40 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
                  <Icon size={20} />
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">{topic.title}</h3>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed min-h-[48px]">
                  {topic.desc}
                </p>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">{topic.articlesCount} guides</span>
                  <span className="text-blue-600 dark:text-blue-400 font-semibold inline-flex items-center gap-1 hover:underline cursor-pointer">
                    View guides <ArrowRight size={13} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Top FAQs Section ────────────────────────────────────────── */}
      <section className="px-4 py-12 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-slate-200 dark:border-[#2A3042]">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Frequently Asked Questions</h2>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Quick solutions to the most common setup and operational questions.
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
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between p-4 text-left font-medium text-slate-900 dark:text-white text-sm"
                >
                  <span>{faq.q}</span>
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-white/5 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Support Help Box ────────────────────────────────────────── */}
      <section className="px-4 py-12 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <div className="rounded-3xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] p-8 sm:p-10 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-4">
            <Mail size={22} />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">Still have questions?</h3>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Our engineering and customer support specialists are ready to help you resolve any issues or answer architecture questions.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition"
            >
              <span>Submit a Support Ticket</span>
              <ArrowRight size={14} />
            </Link>
            <a
              href="mailto:support@example.com"
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#181B26] px-5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              support@example.com
            </a>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
