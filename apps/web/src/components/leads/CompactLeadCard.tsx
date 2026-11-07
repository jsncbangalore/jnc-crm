import React, { useState, useRef, useEffect } from 'react';
import {
  Phone,
  Mail,
  MessageCircle,
  FileText,
  Calendar,
  AlertTriangle,
  Clock,
  MoreVertical,
  ArrowRight,
  Globe,
  Share2,
  DollarSign,
  User,
  Building,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Lead, LeadStatus } from '../../types';
import { formatDistanceToNow, isPast, isToday } from 'date-fns';

export interface CompactLeadCardProps {
  lead: Lead;
  density: 'compact' | 'comfortable';
  onOpenDrawer: (lead: Lead) => void;
  onMoveToStage: (lead: Lead, targetStatus: LeadStatus) => void;
  onScheduleFollowUp?: (lead: Lead, date: string) => void;
  onCreateQuote?: (lead: Lead) => void;
  hasQuotationAccess?: boolean;
}

const STAGES: { id: LeadStatus; label: string }[] = [
  { id: 'new', label: 'New Inquiries' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'quoted', label: 'Quoted' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
];

export function formatIndianCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val) || val === 0) return '';
  return '₹' + Number(val).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export const CompactLeadCard: React.FC<CompactLeadCardProps> = ({
  lead,
  density,
  onOpenDrawer,
  onMoveToStage,
  onScheduleFollowUp,
  onCreateQuote,
  hasQuotationAccess = true,
}) => {
  const [showHoverPopover, setShowHoverPopover] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showScheduleInput, setShowScheduleInput] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const cleanPhone = lead.customerPhone ? lead.customerPhone.replace(/\D/g, '') : '';
  const hasPhone = Boolean(cleanPhone && cleanPhone.length >= 7);

  // Next follow up status
  const followUpDate = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt) : null;
  const isFollowUpOverdue = followUpDate ? isPast(followUpDate) && !isToday(followUpDate) : false;
  const isFollowUpToday = followUpDate ? isToday(followUpDate) : false;

  // Last activity formatted
  const lastActivityText = lead.lastActivityAt
    ? formatDistanceToNow(new Date(lead.lastActivityAt), { addSuffix: true }).replace('about ', '')
    : lead.updatedAt
    ? formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true }).replace('about ', '')
    : 'Recently';

  // Urgency styling
  const urgencyColor =
    lead.urgency === 'urgent'
      ? 'bg-rose-500 ring-rose-400'
      : lead.urgency === 'high'
      ? 'bg-amber-500 ring-amber-400'
      : 'bg-slate-400 dark:bg-slate-500 ring-slate-300';

  // Source chip styling
  const sourceLabel = (lead.source || 'manual').replace(/_/g, ' ');
  const sourceColor =
    lead.source === 'indiamart'
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
      : lead.source === 'whatsapp'
      ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20'
      : lead.source?.includes('facebook') || lead.source?.includes('instagram')
      ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
      : lead.source === 'web'
      ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
      : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';

  // Value formatting
  const formattedValue = formatIndianCurrency(lead.estimatedValue);

  // Hover timer (400ms delay requirement)
  const handleMouseEnter = () => {
    hoverTimerRef.current = setTimeout(() => {
      setShowHoverPopover(true);
    }, 400);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    setShowHoverPopover(false);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', lead.id);
    e.dataTransfer.effectAllowed = 'move';
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setShowHoverPopover(false);
  };

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={handleDragStart}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      onClick={() => onOpenDrawer(lead)}
      tabIndex={0}
      role="button"
      aria-label={`Lead ${lead.leadNumber} - ${lead.customerName}`}
      className={`group relative w-full bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] hover:border-crm-blue dark:hover:border-crm-blue/70 rounded-lg p-2.5 shadow-sm hover:shadow-md transition-all cursor-pointer select-none text-left focus:outline-none focus:ring-2 focus:ring-crm-blue/40 ${
        density === 'comfortable' ? 'min-h-[114px]' : 'min-h-[92px]'
      }`}
    >
      {/* ─── LINE 1: Lead # (mono), Source Chip, Urgency Dot ──────────────── */}
      <div className="flex items-center justify-between gap-1.5 mb-1">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className="font-mono text-[10px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800/40 truncate">
            {lead.leadNumber || 'LD-PENDING'}
          </span>
          <span
            className={`text-[9px] font-medium px-1.5 py-0.5 rounded border uppercase tracking-wider truncate ${sourceColor}`}
          >
            {sourceLabel}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Lost reason badge if present */}
          {lead.status === 'lost' && lead.lostReason && (
            <span
              className="text-[9px] px-1 py-0.2 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded truncate max-w-[80px]"
              title={`Lost reason: ${lead.lostReason}`}
            >
              {lead.lostReason}
            </span>
          )}

          {/* Urgency dot with tooltip */}
          <span
            title={`Urgency: ${lead.urgency || 'standard'}`}
            className={`w-2 h-2 rounded-full ring-2 ${urgencyColor}`}
          />

          {/* Move to menu button (accessible alternative to drag & drop) */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowMoveMenu(!showMoveMenu)}
              aria-label="Move lead stage"
              className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            >
              <MoreVertical size={13} />
            </button>

            {showMoveMenu && (
              <div
                className="absolute right-0 top-5 z-40 w-40 bg-white dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] rounded-md shadow-lg py-1 text-xs"
                role="menu"
              >
                <div className="px-2 py-1 font-semibold text-[10px] text-slate-400 uppercase tracking-wider">
                  Move to...
                </div>
                {STAGES.filter((s) => s.id !== lead.status).map((st) => (
                  <button
                    key={st.id}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setShowMoveMenu(false);
                      onMoveToStage(lead, st.id);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between text-slate-700 dark:text-slate-200"
                  >
                    <span>{st.label}</span>
                    <ArrowRight size={11} className="text-slate-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── LINE 2: Contact Name (bold) & Company ────────────────────────── */}
      <div className="mb-1 leading-tight">
        <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
          {lead.customerName || 'Unnamed Contact'}
        </h4>
        {(lead.company?.name || lead.companyName) && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {lead.company?.name || lead.companyName}
          </p>
        )}
      </div>

      {/* ─── LINE 3: Product, Quantity, Value (hide if empty) ─────────────── */}
      {(lead.productName || lead.productCategory || formattedValue) && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 mb-1 leading-tight">
          {(lead.productName || lead.productCategory) && (
            <span className="truncate max-w-[130px] font-medium" title={lead.productName || lead.productCategory}>
              {lead.productName || lead.productCategory}
            </span>
          )}
          {lead.quantity && lead.quantity > 0 && (
            <span className="text-slate-400 dark:text-slate-500 shrink-0">
              ({lead.quantity} {lead.unit || 'units'})
            </span>
          )}
          {formattedValue && (
            <span className="ml-auto font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
              {formattedValue}
            </span>
          )}
        </div>
      )}

      {/* Comfortable density extras: queryMessage notes preview */}
      {density === 'comfortable' && lead.queryMessage && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 italic mb-1">
          "{lead.queryMessage}"
        </p>
      )}

      {/* ─── LINE 4: Phone / Warning, Last Activity, Next Follow-up, Owner ─── */}
      <div className="flex items-center justify-between gap-1 text-[10px] pt-1 border-t border-slate-100 dark:border-[#222738] mt-1">
        {/* Phone / Missing phone warning */}
        <div className="flex items-center gap-1 min-w-0">
          {hasPhone ? (
            <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 truncate font-mono text-[10px]">
              <Phone size={10} className="shrink-0 text-slate-400" />
              <span className="truncate">{lead.customerPhone}</span>
            </span>
          ) : (
            <span
              className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium"
              title="Missing contact phone number"
            >
              <AlertTriangle size={11} className="shrink-0 text-amber-500" />
              <span>No phone</span>
            </span>
          )}
        </div>

        {/* Right side items: Next follow-up chip, Last activity, Owner avatar */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Next follow-up chip */}
          {followUpDate && (
            <span
              title={`Next follow-up: ${followUpDate.toLocaleDateString()}`}
              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold flex items-center gap-0.5 ${
                isFollowUpOverdue
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                  : isFollowUpToday
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Calendar size={9} />
              {isFollowUpOverdue ? 'Overdue' : isFollowUpToday ? 'Today' : followUpDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          )}

          {/* Last activity */}
          <span
            className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:inline truncate max-w-[65px]"
            title={`Last activity: ${lastActivityText}`}
          >
            {lastActivityText}
          </span>

          {/* Owner avatar */}
          <div
            className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center text-[9px] font-bold uppercase shrink-0"
            title={`Owner: ${lead.ownerDisplayName || lead.assignedTo?.name || 'Unassigned'}`}
          >
            {(lead.ownerDisplayName || lead.assignedTo?.name || 'U').charAt(0)}
          </div>
        </div>
      </div>

      {/* ─── QUICK ACTIONS HOVER BAR ─────────────────────────────────────── */}
      <div
        className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1 bg-white/95 dark:bg-[#1E2230]/95 backdrop-blur-sm border border-slate-200 dark:border-[#2A3042] rounded-md px-1 py-0.5 shadow-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Call button */}
        {hasPhone && (
          <a
            href={`tel:${cleanPhone}`}
            aria-label="Call lead"
            title="Call"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-600"
          >
            <Phone size={12} />
          </a>
        )}

        {/* WhatsApp button */}
        {hasPhone && (
          <a
            href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(
              `Hello ${lead.customerName}, following up regarding your inquiry on ${lead.productName || 'our products'}.`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp lead"
            title="WhatsApp"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-teal-600"
          >
            <MessageCircle size={12} />
          </a>
        )}

        {/* Email button */}
        {lead.customerEmail && (
          <a
            href={`mailto:${lead.customerEmail}?subject=${encodeURIComponent(
              `Inquiry Follow-up [${lead.leadNumber}]`
            )}`}
            aria-label="Email lead"
            title="Email"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600"
          >
            <Mail size={12} />
          </a>
        )}

        {/* Create Quotation (respects page access) */}
        {hasQuotationAccess && onCreateQuote && (
          <button
            type="button"
            onClick={() => onCreateQuote(lead)}
            aria-label="Create quotation"
            title="Create Quotation"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-amber-600"
          >
            <FileText size={12} />
          </button>
        )}

        {/* Schedule follow-up button */}
        {onScheduleFollowUp && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowScheduleInput(!showScheduleInput)}
              aria-label="Schedule follow-up"
              title="Schedule Follow-up"
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-purple-600"
            >
              <Calendar size={12} />
            </button>

            {showScheduleInput && (
              <div className="absolute right-0 top-6 z-50 p-2 bg-white dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] rounded-md shadow-xl flex items-center gap-1 text-xs">
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="px-1.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (scheduleDate) {
                      onScheduleFollowUp(lead, scheduleDate);
                      setShowScheduleInput(false);
                    }
                  }}
                  className="px-2 py-1 bg-crm-blue text-white rounded text-[11px] font-bold"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── 400ms HOVER POPOVER (Requirement 6) ─────────────────────────── */}
      {showHoverPopover && !showMoveMenu && !showScheduleInput && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-72 p-3 bg-slate-950 text-white rounded-lg shadow-2xl text-xs space-y-1.5 pointer-events-none animate-in fade-in zoom-in-95 duration-150"
          role="tooltip"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-1">
            <span className="font-mono text-purple-300 font-bold">{lead.leadNumber}</span>
            <span className="capitalize text-slate-400">{lead.status}</span>
          </div>
          <div>
            <span className="font-bold text-white">{lead.customerName}</span>
            {(lead.company?.name || lead.companyName) && (
              <p className="text-slate-400 text-[11px]">{lead.company?.name || lead.companyName}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-300 pt-0.5">
            <div>Phone: {lead.customerPhone || 'N/A'}</div>
            <div>City: {lead.city || 'N/A'}</div>
            <div>Value: {formattedValue || '₹0'}</div>
            <div>Urgency: {lead.urgency || 'standard'}</div>
          </div>
          {lead.productName && (
            <div className="text-[11px] text-slate-300">
              Product: <span className="text-white">{lead.productName}</span>
            </div>
          )}
          {lead.lostReason && (
            <div className="text-[11px] text-rose-400">
              Lost Reason: {lead.lostReason}
            </div>
          )}
          <div className="text-[10px] text-slate-400 border-t border-slate-800 pt-1 flex justify-between">
            <span>Owner: {lead.ownerDisplayName || 'Unassigned'}</span>
            <span>Click to open full drawer</span>
          </div>
        </div>
      )}
    </div>
  );
};
