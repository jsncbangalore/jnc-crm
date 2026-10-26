/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Lock, FileText, ArrowLeft, Mail } from 'lucide-react';
import PublicLayout from '../components/layout/PublicLayout';
import { PRODUCT_NAME, COMPANY_NAME } from '../config/brand';

export default function PrivacyPage() {
  const lastUpdated = 'October 24, 2026';

  return (
    <PublicLayout>
      <div className="px-4 py-16 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        {/* Header Breadcrumb */}
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 transition"
          >
            <ArrowLeft size={14} />
            <span>Back to Home</span>
          </Link>
        </div>

        {/* Page Title & Meta */}
        <div className="border-b border-slate-200 dark:border-[#2A3042] pb-6 mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-800/60 bg-blue-50/80 dark:bg-blue-950/50 px-3 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 mb-3">
            <Lock size={12} />
            <span>Trust & Data Protection</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Privacy Policy
          </h1>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Last Updated: {lastUpdated} | Effective Date: {lastUpdated}
          </p>
        </div>

        {/* Content Body */}
        <div className="space-y-8 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              1. Overview and Commitment to Privacy
            </h2>
            <p>
              This Privacy Policy explains how {COMPANY_NAME} (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) collects, processes, and protects information when you use the {PRODUCT_NAME} platform, associated APIs, and related web services. We are dedicated to maintaining strict security safeguards and ensuring transparent control over your business data.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              2. Information We Collect
            </h2>
            <p>We collect and process the following categories of data solely to provide and secure platform features:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600 dark:text-slate-300">
              <li>
                <strong>Account & Profile Information:</strong> Full name, verified work email address, company organization name, telephone contact, and role assignments.
              </li>
              <li>
                <strong>Tenant Business Records:</strong> Leads, opportunity pipelines, customer contact books, SKU catalogs, proforma quotations, tax invoices, and warehouse stock records entered by your authorized users.
              </li>
              <li>
                <strong>Authentication & Security Telemetry:</strong> Password hashes (using modern salted bcrypt), one-time verification tokens, multi-factor authentication secrets, IP addresses, browser user agent strings, and device session timestamps.
              </li>
              <li>
                <strong>System Audit Records:</strong> Access timestamps, sensitive record exports, and data modification events recorded in security audit logs.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              3. Multi-Tenant Cryptographic and Logical Isolation
            </h2>
            <p>
              {PRODUCT_NAME} is architected with strict multi-tenancy controls. Every data query executed across our services enforces tenant scoping boundaries. Tenant data belonging to your organization is logically and cryptographically partitioned such that no other customer or unauthorized tenant can view, access, or query your records.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              4. Cookies and Local Storage Policy
            </h2>
            <p>
              We use strictly necessary session cookies and browser storage (such as localStorage for visual theme preferences and encrypted session tokens) to maintain authenticated access, prevent cross-site request forgery, and enforce active session timeouts. We do not use third-party behavioral advertising trackers.
            </p>
            <p>
              You can review or adjust your cookie preferences at any time by visiting our{' '}
              <Link to="/cookies" className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
                Cookie Settings
              </Link>{' '}
              page.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              5. How We Protect Your Data
            </h2>
            <p>We deploy robust organizational and technological safeguards, including:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600 dark:text-slate-300">
              <li>Transport Layer Security (TLS 1.3) encryption for all in-transit communications.</li>
              <li>Encrypted storage of sensitive third-party mail integration credentials.</li>
              <li>Mandatory 15-minute inactivity auto-logout safeguards for sensitive sessions.</li>
              <li>Automatic rate-limiting and brute-force mitigation on authentication endpoints.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              6. Data Retention and Account Deletion
            </h2>
            <p>
              We retain business records for as long as your workspace subscription remains active. Workspace administrators can request an export of all organizational records or initiate a permanent purge of tenant data upon contract termination by contacting our support team.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              7. Contact Our Data Protection Team
            </h2>
            <p>
              If you have inquiries regarding this policy, data processing terms, or your statutory privacy rights, please contact our Data Protection Officer:
            </p>
            <div className="rounded-2xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#131620] p-4 text-xs space-y-1">
              <p className="font-semibold text-slate-900 dark:text-white">{COMPANY_NAME} Data Privacy Office</p>
              <p className="text-slate-600 dark:text-slate-400">
                Email:{' '}
                <a href="mailto:privacy@example.com" className="text-blue-600 dark:text-blue-400 hover:underline">
                  privacy@example.com
                </a>
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                Inquiries regarding GDPR, data isolation architecture, or security compliance.
              </p>
            </div>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
