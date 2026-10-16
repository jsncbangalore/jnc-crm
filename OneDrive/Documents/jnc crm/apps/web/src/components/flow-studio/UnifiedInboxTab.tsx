import React, { useState } from 'react';
import {
  MessageSquare, Mail, Phone, Send, Search, Filter, Clock,
  CheckCheck, User, Building2, Tag, ShieldCheck, Sparkles, Plus,
  FileText, ArrowRight, CheckCircle2, ChevronRight
} from 'lucide-react';

interface InboxMessage {
  id: string;
  sender: 'lead' | 'agent' | 'system';
  channel: 'WHATSAPP' | 'EMAIL' | 'SMS' | 'NOTE';
  content: string;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read';
}

interface InboxLead {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  source: 'indiamart' | 'whatsapp' | 'web' | 'meta';
  stage: string;
  externalId?: string;
  product?: string;
  activeSequence?: {
    title: string;
    currentNode: string;
    nextAction: string;
  };
  messages: InboxMessage[];
}

const INITIAL_LEADS: InboxLead[] = [
  {
    id: 'lead-001',
    name: 'Rajesh Sharma',
    company: 'Sharma Tooling & Engineering',
    phone: '+91 98765 43210',
    email: 'rajesh.sharma@sharmatools.in',
    source: 'indiamart',
    stage: 'QUALIFIED',
    externalId: 'IM-MV7UTGHG',
    product: '12-Zone Commercial PA System',
    activeSequence: {
      title: 'Automated Lead Nurturing & Sequence',
      currentNode: 'Wait 24 Hours',
      nextAction: 'Tomorrow at 10:30 AM (WhatsApp follow-up)',
    },
    messages: [
      {
        id: 'm1',
        sender: 'lead',
        channel: 'WHATSAPP',
        content: 'Hi, we saw your PA System catalog on IndiaMART. Looking for a 12-zone amplifier setup for our manufacturing unit.',
        timestamp: '10:14 AM',
        status: 'read',
      },
      {
        id: 'm2',
        sender: 'system',
        channel: 'EMAIL',
        content: 'Official Proposal: JS Network Communication Commercial PA System specifications & estimate sent to rajesh.sharma@sharmatools.in',
        timestamp: '10:15 AM',
        status: 'delivered',
      },
      {
        id: 'm3',
        sender: 'agent',
        channel: 'WHATSAPP',
        content: 'Hi Rajesh! Thank you for inquiring. We have sent the technical datasheet and quotation to your email. Do you need a site visit?',
        timestamp: '10:20 AM',
        status: 'read',
      },
    ],
  },
  {
    id: 'lead-002',
    name: 'Priya Patel',
    company: 'Nexus Tech Solutions',
    phone: '+91 98200 11223',
    email: 'priya.patel@nexustech.example',
    source: 'meta',
    stage: 'PROPOSAL',
    externalId: 'FB-MV7V77XH',
    product: 'Two-Way Intercom & IP Talkback',
    activeSequence: {
      title: 'Meta Inbound Quick Conversion',
      currentNode: 'Send WhatsApp Follow-up',
      nextAction: 'Active now',
    },
    messages: [
      {
        id: 'm201',
        sender: 'lead',
        channel: 'WHATSAPP',
        content: 'Submitted Facebook Lead Form: Interested in two-way emergency communication system for a commercial hospital project.',
        timestamp: 'Yesterday',
        status: 'read',
      },
      {
        id: 'm202',
        sender: 'system',
        channel: 'EMAIL',
        content: 'Thank you for your interest! Commercial quotation for Hospital Intercom attached.',
        timestamp: 'Yesterday',
        status: 'read',
      },
    ],
  },
  {
    id: 'lead-003',
    name: 'Vikram Sundaram',
    company: 'Apex Metro Infrastructure',
    phone: '+91 94440 98765',
    email: 'vikram@apexinfra.org',
    source: 'web',
    stage: 'NEGOTIATION',
    externalId: 'WEB-9842',
    product: 'Addressable Fire Alarm & Talkback',
    activeSequence: {
      title: 'High-Value Project Pipeline',
      currentNode: 'Negotiation Handover',
      nextAction: 'Field Engineer Site Inspection scheduled',
    },
    messages: [
      {
        id: 'm301',
        sender: 'lead',
        channel: 'EMAIL',
        content: 'We need technical compliance certificates and BOQ pricing for 45 units.',
        timestamp: 'Oct 14',
        status: 'read',
      },
      {
        id: 'm302',
        sender: 'agent',
        channel: 'NOTE',
        content: 'Client requested 5% bulk discount on cable drums. Approved by Santhosh Kumar.',
        timestamp: 'Oct 14',
      },
    ],
  },
];

export default function UnifiedInboxTab() {
  const [leads, setLeads] = useState<InboxLead[]>(INITIAL_LEADS);
  const [selectedLeadId, setSelectedLeadId] = useState<string>(INITIAL_LEADS[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'indiamart' | 'whatsapp' | 'web' | 'meta'>('all');

  const [activeReplyChannel, setActiveReplyChannel] = useState<'WHATSAPP' | 'EMAIL' | 'SMS' | 'NOTE'>('WHATSAPP');
  const [replyText, setReplyText] = useState('');

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || leads[0];

  const filteredLeads = leads.filter((l) => {
    const matchesSearch =
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.phone.includes(searchQuery);
    const matchesChannel = channelFilter === 'all' || l.source === channelFilter;
    return matchesSearch && matchesChannel;
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    const newMessage: InboxMessage = {
      id: `msg_${Date.now()}`,
      sender: activeReplyChannel === 'NOTE' ? 'agent' : 'agent',
      channel: activeReplyChannel,
      content: replyText.trim(),
      timestamp: 'Just now',
      status: 'sent',
    };

    setLeads((prev) =>
      prev.map((lead) => {
        if (lead.id === selectedLead.id) {
          return {
            ...lead,
            messages: [...lead.messages, newMessage],
          };
        }
        return lead;
      })
    );

    setReplyText('');
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'indiamart':
        return { label: 'IndiaMART', color: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30' };
      case 'whatsapp':
        return { label: 'WhatsApp', color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' };
      case 'meta':
        return { label: 'Meta Ads', color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30' };
      default:
        return { label: 'Website Form', color: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30' };
    }
  };

  return (
    <div className="h-[calc(100vh-140px)] min-h-[600px] flex bg-white dark:bg-[#151824] border border-slate-200 dark:border-[#2A3042] rounded-2xl overflow-hidden shadow-sm">
      {/* ─── LEFT: INBOUND LEADS LIST PANE ─── */}
      <div className="w-80 sm:w-96 border-r border-slate-200 dark:border-[#2A3042] flex flex-col bg-slate-50/50 dark:bg-[#11141E] shrink-0">
        {/* Header & Search */}
        <div className="p-3.5 border-b border-slate-200 dark:border-[#2A3042] space-y-2.5 bg-white dark:bg-[#151824]">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
              <MessageSquare size={14} className="text-crm-blue" />
              <span>Inbound Prospects ({filteredLeads.length})</span>
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Stream
            </span>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by prospect name, company, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#11141E] pl-8 pr-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:border-crm-blue"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[11px] font-bold">
            {(['all', 'indiamart', 'meta', 'web', 'whatsapp'] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                className={`px-2.5 py-1 rounded-lg capitalize whitespace-nowrap transition-colors ${
                  channelFilter === ch
                    ? 'bg-crm-blue text-white shadow-xs'
                    : 'text-slate-500 hover:bg-slate-200/60 dark:hover:bg-white/5'
                }`}
              >
                {ch === 'all' ? 'All Channels' : ch}
              </button>
            ))}
          </div>
        </div>

        {/* Leads Scroll List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2A3042]/50">
          {filteredLeads.map((lead) => {
            const isSelected = lead.id === selectedLead.id;
            const badge = getSourceBadge(lead.source);
            const lastMsg = lead.messages[lead.messages.length - 1];

            return (
              <div
                key={lead.id}
                onClick={() => setSelectedLeadId(lead.id)}
                className={`p-3.5 cursor-pointer transition-colors text-left space-y-1.5 ${
                  isSelected
                    ? 'bg-crm-blue/10 dark:bg-crm-blue/15 border-l-4 border-l-crm-blue'
                    : 'hover:bg-slate-100/70 dark:hover:bg-white/5 border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                    {lead.name}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0">{lastMsg?.timestamp || 'Today'}</span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  <Building2 size={11} className="shrink-0" />
                  <span className="truncate">{lead.company}</span>
                </div>

                <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate font-medium">
                  {lastMsg?.content || 'No messages yet'}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${badge.color}`}>
                    {badge.label}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">{lead.stage}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── RIGHT: CONVERSATION TIMELINE & MULTI-CHANNEL COMPOSER ─── */}
      <div className="flex-1 flex flex-col bg-white dark:bg-[#151824] overflow-hidden">
        {/* Contact Info Header */}
        <div className="p-4 border-b border-slate-200 dark:border-[#2A3042] flex items-center justify-between flex-wrap gap-3 bg-slate-50/70 dark:bg-[#181B26]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-crm-blue/15 border border-crm-blue/30 flex items-center justify-center text-crm-blue font-bold text-sm">
              {selectedLead.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-slate-900 dark:text-white">{selectedLead.name}</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-crm-blue/15 text-crm-blue">
                  {selectedLead.stage}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {selectedLead.company} &bull; <span className="font-mono">{selectedLead.phone}</span> &bull;{' '}
                <span className="font-mono">{selectedLead.email}</span>
              </p>
            </div>
          </div>

          {selectedLead.externalId && (
            <span className="text-[10px] font-mono px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500">
              ID: {selectedLead.externalId}
            </span>
          )}
        </div>

        {/* ACTIVE AUTOMATION ENROLLMENT BANNER */}
        {selectedLead.activeSequence && (
          <div className="px-4 py-2.5 bg-emerald-50/80 dark:bg-emerald-950/20 border-b border-emerald-200/50 dark:border-emerald-900/30 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <Clock size={13} />
              </span>
              <span className="text-emerald-800 dark:text-emerald-300 font-bold">
                Active Automation: {selectedLead.activeSequence.title}
              </span>
              <span className="text-slate-400">&bull;</span>
              <span className="text-slate-600 dark:text-slate-300">
                Current step: <strong>{selectedLead.activeSequence.currentNode}</strong>
              </span>
            </div>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono">
              Next action: {selectedLead.activeSequence.nextAction}
            </span>
          </div>
        )}

        {/* CONVERSATION MESSAGE FEED */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/30 dark:bg-[#11141E]/40">
          {selectedLead.messages.map((msg) => {
            const isLead = msg.sender === 'lead';
            const isSystem = msg.sender === 'system';
            const isNote = msg.channel === 'NOTE';

            if (isSystem) {
              return (
                <div key={msg.id} className="max-w-lg mx-auto p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/30 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5 shadow-xs">
                  <Mail size={15} className="text-blue-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">{msg.content}</p>
                    <span className="text-[10px] text-blue-500/80 mt-1 block">{msg.timestamp} &bull; Automated Sequence</span>
                  </div>
                </div>
              );
            }

            if (isNote) {
              return (
                <div key={msg.id} className="max-w-lg mx-auto p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5 shadow-xs">
                  <FileText size={15} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block mb-0.5">Internal Team Note</span>
                    <p className="font-medium">{msg.content}</p>
                    <span className="text-[10px] text-amber-500/80 mt-1 block">{msg.timestamp}</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className={`flex ${isLead ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-md p-3.5 rounded-2xl text-xs space-y-1 shadow-xs ${
                    isLead
                      ? 'bg-white dark:bg-[#1E2230] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#2A3042] rounded-tl-xs'
                      : msg.channel === 'WHATSAPP'
                      ? 'bg-emerald-600 text-white rounded-tr-xs'
                      : 'bg-crm-blue text-white rounded-tr-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-[10px] opacity-80 pb-0.5">
                    <span className="font-bold flex items-center gap-1">
                      {msg.channel === 'WHATSAPP' && <MessageSquare size={10} />}
                      {msg.channel === 'EMAIL' && <Mail size={10} />}
                      {msg.channel === 'SMS' && <Phone size={10} />}
                      <span>{msg.channel}</span>
                    </span>
                    <span>{msg.timestamp}</span>
                  </div>
                  <p className="leading-relaxed font-normal">{msg.content}</p>
                  {!isLead && (
                    <div className="flex justify-end pt-0.5">
                      <CheckCheck size={12} className="opacity-75" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* MULTI-CHANNEL REPLY COMPOSER */}
        <form onSubmit={handleSendMessage} className="p-3.5 border-t border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] space-y-2.5">
          {/* Channel Selector */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#11141E] p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveReplyChannel('WHATSAPP')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                  activeReplyChannel === 'WHATSAPP'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <MessageSquare size={12} />
                <span>WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveReplyChannel('EMAIL')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                  activeReplyChannel === 'EMAIL'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Mail size={12} />
                <span>Email</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveReplyChannel('SMS')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                  activeReplyChannel === 'SMS'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Phone size={12} />
                <span>SMS</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveReplyChannel('NOTE')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                  activeReplyChannel === 'NOTE'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <FileText size={12} />
                <span>Internal Note</span>
              </button>
            </div>

            {/* Quick Templates */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
              <span className="text-slate-400">Quick insert:</span>
              <button
                type="button"
                onClick={() => setReplyText('Quotation sent to your email. Please verify payment terms.')}
                className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300"
              >
                Quote Sent
              </button>
              <button
                type="button"
                onClick={() => setReplyText('Can we arrange a 15-minute phone consultation today?')}
                className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300"
              >
                Request Call
              </button>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              placeholder={`Send message to ${selectedLead.name} via ${activeReplyChannel}...`}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="flex-1 text-xs rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#11141E] p-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-crm-blue resize-none"
            />
            <button
              type="submit"
              disabled={!replyText.trim()}
              className="btn bg-crm-blue hover:bg-crm-blue-hover text-white text-xs gap-1.5 px-4 py-2.5 rounded-xl font-bold shadow-sm shrink-0 disabled:opacity-50"
            >
              <Send size={14} />
              <span>Send</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
