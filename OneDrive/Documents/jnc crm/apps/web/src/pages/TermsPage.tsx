/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, Shield, ArrowLeft, Mail, CheckCircle2 } from 'lucide-react';
import PublicLayout from '../components/layout/PublicLayout';
import { PRODUCT_NAME, COMPANY_NAME } from '../config/brand';

export default function TermsPage() {
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
            <FileText size={12} />
            <span>Customer Agreement</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Terms of Service
          </h1>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Last Updated: {lastUpdated} | Version 2.4
          </p>
        </div>

        {/* Content Body */}
        <div className="space-y-8 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing, browsing, registering for, or using the {PRODUCT_NAME} software-as-a-service application provided by {COMPANY_NAME} (&ldquo;Company&rdquo;), you (&ldquo;Customer&rdquo; or &ldquo;User&rdquo;) agree to be legally bound by these Terms of Service. If you are entering into this agreement on behalf of a corporation or entity, you represent that you possess lawful authorization to bind said entity.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              2. Description of Service
            </h2>
            <p>
              {PRODUCT_NAME} provides cloud-hosted operational software designed for lead pipeline tracking, quotations, GST-compliant tax invoicing, delivery challan processing, multi-warehouse inventory management, and automated sales communication workflows.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              3. Account Registration and Security Obligations
            </h2>
            <p>
              Users must provide accurate, current, and complete organizational information during onboarding. Workspace administrators are responsible for managing user access permissions, provisioning credentials, enforcing two-factor authentication where necessary, and promptly revoking credentials of separated personnel.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              4. Subscription, Billing & Renewals
            </h2>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600 dark:text-slate-300">
              <li>
                <strong>Subscription Fees:</strong> Fees are charged on a recurring monthly or annual basis depending on your selected tier (Starter, Professional, or Enterprise).
              </li>
              <li>
                <strong>Taxes:</strong> All quoted prices are exclusive of statutory taxes (such as GST), which will be itemized on monthly invoices in accordance with applicable tax codes.
              </li>
              <li>
                <strong>Cancellation:</strong> You may cancel or downgrade your subscription at any time through the administration console. Subscriptions remain operational through the end of the paid billing interval.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              5. Customer Data Ownership
            </h2>
            <p>
              You retain all right, title, and interest in and to all customer records, lead data, quotation figures, invoices, and uploaded branding assets (&ldquo;Customer Data&rdquo;). We do not sell, rent, or commercialize your customer data. You grant {COMPANY_NAME} only the limited license necessary to host, process, and transmit data solely for delivering platform functionality.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              6. Acceptable Use and Platform Safeguards
            </h2>
            <p>You agree not to use the platform to:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600 dark:text-slate-300">
              <li>Transmit unsolicited commercial bulk communications (&ldquo;spam&rdquo;) in violation of applicable laws.</li>
              <li>Reverse engineer, decompile, or attempt to derive source code from compiled platform artifacts.</li>
              <li>Attempt to circumvent tenant row isolation boundaries or security authentication rate-limiters.</li>
              <li>Upload malicious code, exploits, or materials that violate third-party intellectual property.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              7. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted under applicable law, neither party shall be liable for indirect, incidental, punitive, or consequential damages resulting from platform downtime, loss of business revenue, or data interruption. The aggregate liability of {COMPANY_NAME} under this agreement shall be limited to the total fees paid by Customer during the twelve (12) months preceding the incident.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              8. Contact Legal & Compliance
            </h2>
            <p>
              For legal notices, contract inquiries, or master service agreement requests, please contact:
            </p>
            <div className="rounded-2xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#131620] p-4 text-xs space-y-1">
              <p className="font-semibold text-slate-900 dark:text-white">{COMPANY_NAME} Legal Operations</p>
              <p className="text-slate-600 dark:text-slate-400">
                Email:{' '}
                <a href="mailto:legal@example.com" className="text-blue-600 dark:text-blue-400 hover:underline">
                  legal@example.com
                </a>
              </p>
            </div>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
