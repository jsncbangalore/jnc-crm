import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Mail, RefreshCw, Search, CheckCircle2, AlertTriangle, ArrowDownLeft,
  ArrowUpRight, Clock, User, Phone, ExternalLink, Filter, Send, MessageSquare,
  ShieldCheck, Inbox, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { notificationsApi, leadsApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import DOMPurify from 'dompurify';

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Manual Log Inbound Reply Modal
  const [showLogReplyModal, setShowLogReplyModal] = useState(false);
  const [replyFrom, setReplyFrom] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  // Selected Notification for view modal
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  // Density & Horizontal Table Navigation
  const [density, setDensity] = useState<'compact' | 'normal'>('compact');
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const scrollTable = (direction: 'start' | 'left' | 'right' | 'end') => {
    const el = tableContainerRef.current;
    if (!el) return;
    const scrollAmount = 350;
    if (direction === 'start') {
      el.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (direction === 'left') {
      el.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    } else if (direction === 'right') {
      el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    } else if (direction === 'end') {
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    }
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const params: Record<string, any> = {};
      if (channelFilter !== 'all') params.channel = channelFilter;
      if (search) params.search = search;
      const { data } = await notificationsApi.list(params);
      setNotifications(data.items || []);
    } catch (err) {
      console.error('Failed to load notifications', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      fetchNotifications();
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, channelFilter]);

  const handleLogIncomingReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyFrom || !replyText) {
      alert('Please provide sender email and reply message content.');
      return;
    }

    setSubmittingReply(true);
    try {
      await notificationsApi.postInboundReply({
        from: replyFrom,
        subject: replySubject || 'Customer Inquiry Response',
        text: replyText,
      });
      setShowLogReplyModal(false);
      setReplyFrom('');
      setReplySubject('');
      setReplyText('');
      await fetchNotifications();
      alert('Inbound email reply recorded & linked to customer timeline!');
    } catch (err: any) {
      alert('Failed to record reply: ' + (err?.response?.data?.message || err.message));
    } finally {
      setSubmittingReply(false);
    }
  };

  const [syncingGoDaddy, setSyncingGoDaddy] = useState(false);

  const handleSyncGoDaddy = async () => {
    setSyncingGoDaddy(true);
    try {
      const { data } = await notificationsApi.syncGoDaddy();
      await fetchNotifications();
      alert(`GoDaddy Sync Complete! Checked inbox: ${data.fetched || 0} messages evaluated, ${data.newReplies || 0} new customer replies synced.`);
    } catch (err: any) {
      alert('Failed to sync GoDaddy inbox: ' + (err?.response?.data?.message || err.message));
    } finally {
      setSyncingGoDaddy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ─── HEADER ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-950 dark:text-white flex items-center gap-2">
            <Bell className="text-crm-blue" size={22} />
            <span>Notifications & Inbox</span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-0.5 hidden sm:block">
            Track sent messages, customer email replies, and system alerts
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSyncGoDaddy}
            disabled={syncingGoDaddy}
            className="btn bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5"
          >
            <RefreshCw size={13} className={syncingGoDaddy ? 'animate-spin' : ''} />
            {syncingGoDaddy ? 'Syncing...' : 'Sync Mail'}
          </button>
          <button
            onClick={() => setShowLogReplyModal(true)}
            className="btn bg-crm-blue hover:bg-crm-blue-hover text-white font-bold text-xs gap-1.5"
          >
            <Inbox size={13} /> Log Reply
          </button>
          <button onClick={fetchNotifications} className="btn-ghost text-xs gap-1 px-2.5" title="Refresh">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ─── CONTROLS & FILTERS ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-9 text-xs w-full"
            placeholder="Search sender, subject, message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filter chips — scroll horizontally on very small screens */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141722] p-1 rounded-xl border border-slate-200 dark:border-[#2A3042] overflow-x-auto scrollbar-none shrink-0">
          {[
            { id: 'all', label: 'All' },
            { id: 'email_inbound', label: 'Replies' },
            { id: 'email', label: 'Outbound' },
            { id: 'in_app', label: 'Tasks' },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setChannelFilter(c.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                channelFilter === c.id
                  ? 'bg-crm-blue text-white shadow-glow-blue'
                  : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 font-bold'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>



      {/* ─── LOADING ─────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="flex gap-1.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 bg-crm-blue rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* ─── EMPTY STATE ─────────────────────────────────────────────────────── */}
      {!loading && notifications.length === 0 && (
        <div className="text-center py-16 text-slate-500 text-sm">
          <Bell size={36} className="mx-auto mb-3 opacity-30" />
          No notifications found matching current filter.
        </div>
      )}

      {/* ─── MOBILE CARD LIST (< lg) ─────────────────────────────────────────── */}
      {!loading && notifications.length > 0 && (
        <div className="lg:hidden space-y-2">
          {notifications.map((item) => {
            const isInbound = item.channel === 'email_inbound';
            const isOutbound = item.channel === 'email';
            return (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className={`bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-xl flex items-start gap-3 cursor-pointer hover:border-crm-blue/40 active:bg-white/5 transition-all ${
                  density === 'compact' ? 'p-2.5' : 'p-3.5'
                }`}
              >
                {/* Icon */}
                <div className={`shrink-0 rounded-xl flex items-center justify-center ${
                  density === 'compact' ? 'w-7 h-7' : 'w-9 h-9'
                } ${
                  isInbound
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : isOutbound
                    ? 'bg-crm-blue/15 text-crm-blue border border-crm-blue/30'
                    : 'bg-crm-amber/15 text-crm-amber border border-crm-amber/30'
                }`}>
                  {isInbound ? <ArrowDownLeft size={density === 'compact' ? 14 : 16} /> : isOutbound ? <ArrowUpRight size={density === 'compact' ? 14 : 16} /> : <Bell size={density === 'compact' ? 14 : 16} />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-bold text-slate-950 dark:text-white">
                      {isInbound ? 'Client Reply' : isOutbound ? 'Sent Email' : 'System Alert'}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                        item.status === 'sent' || item.status === 'received'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-red-500/15 text-crm-coral'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 font-semibold truncate">
                    {item.subject || '—'}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate mt-0.5">
                    {(item.body || '').replace(/<[^>]+>/g, '').substring(0, 80)}
                  </p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-crm-teal font-mono truncate max-w-[55%]">{item.recipient}</span>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">
                      {format(new Date(item.sentAt), 'dd MMM, HH:mm')}
                    </span>
                  </div>
                </div>

                {/* Chevron hint */}
                <div className="text-slate-600 self-center shrink-0 mt-1">
                  <ArrowUpRight size={13} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── DESKTOP TABLE (lg+) ─────────────────────────────────────────────── */}
      {!loading && notifications.length > 0 && (
        <div
          ref={tableContainerRef}
          className="hidden lg:block border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-x-auto shadow-2xl bg-white dark:bg-[#141722] scrollbar-thin scrollbar-thumb-crm-blue/70 hover:scrollbar-thumb-crm-blue scrollbar-track-slate-100 dark:scrollbar-track-[#181B26] scroll-smooth"
        >
          <table className={`w-full ${density === 'compact' ? 'text-[11px]' : 'text-xs'}`}>
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#2A3042] bg-slate-100 dark:bg-[#1E2230] text-slate-800 dark:text-slate-400 font-bold uppercase tracking-wider">
                <th className={`text-left whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Type / Channel</th>
                <th className={`text-left whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Date & Time</th>
                <th className={`text-left whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Recipient / Sender</th>
                <th className={`text-left whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Subject / Title</th>
                <th className={`text-left whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Message Preview</th>
                <th className={`text-center whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Status</th>
                <th className={`text-right whitespace-nowrap w-24 ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]/50">
              {notifications.map((item) => {
                const isInbound = item.channel === 'email_inbound';
                const isOutboundEmail = item.channel === 'email';

                return (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className={`whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>
                      <div className="flex items-center gap-2">
                        <div
                          className={`rounded-lg flex items-center justify-center shrink-0 ${
                            density === 'compact' ? 'w-6 h-6' : 'w-7 h-7'
                          } ${
                            isInbound
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                              : isOutboundEmail
                              ? 'bg-crm-blue/15 text-crm-blue border border-crm-blue/30'
                              : 'bg-amber-500/15 text-amber-600 dark:text-crm-amber border border-amber-500/30'
                          }`}
                        >
                          {isInbound ? <ArrowDownLeft size={13} /> : isOutboundEmail ? <ArrowUpRight size={13} /> : <Bell size={13} />}
                        </div>
                        <span className={`font-bold capitalize text-slate-950 dark:text-white ${density === 'compact' ? 'text-[11px]' : 'text-xs'}`}>
                          {isInbound ? 'Client Reply' : isOutboundEmail ? 'Sent Email' : 'System Alert'}
                        </span>
                      </div>
                    </td>
                    <td className={`text-slate-700 dark:text-slate-400 font-mono font-bold whitespace-nowrap ${density === 'compact' ? 'py-2 px-3 text-[11px]' : 'py-3 px-4 text-xs'}`}>
                      {format(new Date(item.sentAt), 'dd MMM yyyy, HH:mm')}
                    </td>
                    <td className={`font-mono text-teal-700 dark:text-crm-teal font-bold whitespace-nowrap ${density === 'compact' ? 'py-2 px-3 text-[11px]' : 'py-3 px-4 text-xs'}`}>{item.recipient}</td>
                    <td className={`font-bold text-slate-950 dark:text-white max-w-[180px] xl:max-w-[240px] truncate ${density === 'compact' ? 'py-2 px-3 text-[11px]' : 'py-3 px-4 text-xs'}`}>{item.subject || '—'}</td>
                    <td className={`text-slate-700 dark:text-slate-400 max-w-[200px] xl:max-w-[320px] font-medium ${density === 'compact' ? 'py-2 px-3 text-[11px]' : 'py-3 px-4 text-xs'}`}>
                      <p className="truncate italic">{(item.body || '').replace(/<[^>]+>/g, '')}</p>
                    </td>
                    <td className={`text-center whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>
                      <span
                        className={`capitalize px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.status === 'sent' || item.status === 'received'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30'
                            : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-crm-coral border border-red-300 dark:border-red-500/30'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className={`text-right whitespace-nowrap ${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}`}>
                      <button
                        onClick={() => setSelectedItem(item)}
                        className="btn-ghost text-xs px-2.5 py-1 border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white font-bold inline-flex items-center gap-1"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── MODAL: Log Inbound Customer Reply ──────────────────────────────── */}
      <AnimatePresence>
        {showLogReplyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Inbox size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-950 dark:text-white">Record Customer Email Reply</h2>
                    <p className="text-xs text-slate-400">Append client response to Lead Timeline</p>
                  </div>
                </div>
                <button onClick={() => setShowLogReplyModal(false)} className="w-8 h-8 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white flex items-center justify-center">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleLogIncomingReply} className="p-5 space-y-4">
                <div>
                  <label className="label">Customer / Sender Email *</label>
                  <input
                    type="email"
                    className="input text-xs"
                    placeholder="e.g. client@company.com"
                    value={replyFrom}
                    onChange={(e) => setReplyFrom(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="label">Email Subject</label>
                  <input
                    className="input text-xs"
                    placeholder="e.g. Re: Quotation Approval"
                    value={replySubject}
                    onChange={(e) => setReplySubject(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">Customer Reply Message *</label>
                  <textarea
                    className="input text-xs w-full min-h-[90px] resize-none"
                    placeholder="Paste or type customer's email response here..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    required
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                  <button type="button" onClick={() => setShowLogReplyModal(false)} className="btn-ghost text-xs">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReply}
                    className="btn bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5"
                  >
                    {submittingReply ? 'Recording...' : 'Record Reply'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL: View Notification / Message Content ──────────────────────── */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#2A3042] flex items-center justify-between shrink-0">
                <div className="min-w-0 flex-1 pr-3">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {selectedItem.channel}
                  </span>
                  <h3 className="text-sm sm:text-base font-bold text-slate-950 dark:text-white mt-0.5 truncate">
                    {selectedItem.subject || 'Message Detail'}
                  </h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono text-slate-400 hidden sm:block">
                    {format(new Date(selectedItem.sentAt), 'dd MMM yyyy, HH:mm')}
                  </span>
                  <button
                    onClick={() => setSelectedItem(null)}
                    className="w-8 h-8 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white flex items-center justify-center transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Recipient + Timestamp Row */}
              <div className="px-4 sm:px-5 py-3 flex items-center justify-between bg-slate-100 dark:bg-[#141722] border-b border-slate-200 dark:border-[#2A3042] shrink-0">
                <span className="text-[11px] font-mono text-crm-teal truncate max-w-[65%]">{selectedItem.recipient}</span>
                <span className="text-[10px] font-mono text-slate-500 shrink-0">
                  {format(new Date(selectedItem.sentAt), 'dd MMM yyyy, HH:mm')}
                </span>
              </div>

              {/* Message Body */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="rounded-none overflow-hidden">
                  {selectedItem.body.includes('<div') || selectedItem.body.includes('<p') || selectedItem.body.includes('<table') ? (
                    <div
                      className="p-4 bg-white text-slate-900 leading-relaxed overflow-x-auto"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedItem.body) }}
                    />
                  ) : (
                    <div className="p-4 bg-slate-100 dark:bg-[#141722] text-slate-200 whitespace-pre-wrap leading-relaxed text-xs sm:text-sm">
                      {selectedItem.body}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end p-4 border-t border-slate-200 dark:border-[#2A3042] shrink-0">
                <button
                  onClick={() => setSelectedItem(null)}
                  className="btn bg-crm-blue hover:bg-crm-blue-hover text-white text-xs font-bold px-6 shadow-glow-blue w-full sm:w-auto"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
