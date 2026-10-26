/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState } from 'react';
import {
  Mail,
  Building,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import PublicLayout from '../components/layout/PublicLayout';
import { PRODUCT_NAME, COMPANY_NAME } from '../config/brand';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    topic: 'sales',
    message: '',
  });

  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      return;
    }

    setIsSubmitting(true);
    // Simulate API request turnaround
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
    }, 600);
  };

  return (
    <PublicLayout>
      {/* ── Hero Section ────────────────────────────────────────────── */}
      <section className="relative px-4 pt-16 pb-16 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-50/50 via-white to-white dark:from-blue-950/20 dark:via-[#0B0D13] dark:to-[#0B0D13]">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-800/60 bg-blue-50/80 dark:bg-blue-950/50 px-3.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 backdrop-blur-xs">
            <Sparkles size={14} />
            <span>Get in Touch</span>
          </div>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
            We are here to help your business scale
          </h1>
          <p className="mt-4 text-base text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
            Have questions about {PRODUCT_NAME}, enterprise volume pricing, or need technical assistance? Send us a message and our team will get back to you promptly.
          </p>
        </div>
      </section>

      {/* ── Main Content Grid ────────────────────────────────────────── */}
      <section className="px-4 py-8 pb-20 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left Column: Direct Contact Info & Channels */}
          <div className="lg:col-span-5 space-y-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Direct Channels</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Connect directly with the appropriate team for faster resolution of inquiries, technical requests, or partnership discussions.
            </p>

            <div className="space-y-4 pt-2">
              <div className="rounded-2xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] p-5 shadow-xs">
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Mail size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Sales & Demonstrations</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      New subscriptions, volume discounts & platform walkthroughs
                    </p>
                    <a
                      href="mailto:sales@example.com"
                      className="inline-block mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      sales@example.com
                    </a>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] p-5 shadow-xs">
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <HelpCircle size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Customer Support</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Technical questions, account settings & feature guidance
                    </p>
                    <a
                      href="mailto:support@example.com"
                      className="inline-block mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      support@example.com
                    </a>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] p-5 shadow-xs">
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                    <Clock size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Operating Hours</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Monday through Friday, 9:00 AM – 6:00 PM IST
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Standard ticket response turnaround: &lt; 4 business hours
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Contact Inquiry Form */}
          <div className="lg:col-span-7">
            <div className="rounded-3xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#131620] p-8 shadow-sm">
              {submitted ? (
                <div className="py-12 text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Thank You for Reaching Out!</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                    Your inquiry has been received. Our team will review your message and contact you at{' '}
                    <span className="font-semibold text-slate-900 dark:text-white">{formData.email}</span> shortly.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitted(false);
                      setFormData({ name: '', email: '', company: '', topic: 'sales', message: '' });
                    }}
                    className="mt-4 rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Send Us a Message</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Fill out the form below and we will route your inquiry to the right specialist.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Your Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="First and last name"
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#181B26] px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Work Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="name@example.com"
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#181B26] px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Company / Organization
                      </label>
                      <input
                        type="text"
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        placeholder="Company name"
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#181B26] px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Inquiry Topic
                      </label>
                      <select
                        value={formData.topic}
                        onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#181B26] px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="sales">Sales & Product Pricing</option>
                        <option value="demo">Request Custom Platform Demo</option>
                        <option value="support">Technical Support & Guidance</option>
                        <option value="billing">Invoicing & Billing Assistance</option>
                        <option value="partnership">Enterprise Partnerships</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Message <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Please describe how we can assist you..."
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#181B26] px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-vertical"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 py-3 text-xs font-semibold text-white shadow-xs transition disabled:opacity-50"
                    >
                      <Send size={14} />
                      <span>{isSubmitting ? 'Sending Message...' : 'Submit Inquiry'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
