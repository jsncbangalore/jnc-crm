import React, { useState, useMemo } from 'react';
import {
  Download,
  Sliders,
  ChevronUp,
  ChevronDown,
  Phone,
  Mail,
  AlertTriangle,
  Calendar,
  MoreVertical,
  Check,
} from 'lucide-react';
import { Lead, LeadStatus } from '../../types';
import { formatDistanceToNow, format, isPast, isToday } from 'date-fns';
import { formatIndianCurrency } from './CompactLeadCard';

export interface LeadsTableViewProps {
  leads: Lead[];
  onOpenDrawer: (lead: Lead) => void;
  onMoveToStage: (lead: Lead, targetStatus: LeadStatus) => void;
  density: 'compact' | 'comfortable';
}

type SortField = 'leadNumber' | 'customerName' | 'company' | 'estimatedValue' | 'status' | 'lastActivityAt' | 'nextFollowUpAt';

export const LeadsTableView: React.FC<LeadsTableViewProps> = ({
  leads,
  onOpenDrawer,
  onMoveToStage,
  density,
}) => {
  const [sortField, setSortField] = useState<SortField>('lastActivityAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    leadNumber: true,
    contact: true,
    company: true,
    phone: true,
    source: true,
    urgency: true,
    product: true,
    value: true,
    stage: true,
    owner: true,
    lastActivity: true,
    nextFollowUp: true,
  });
  const [showColumnChooser, setShowColumnChooser] = useState(false);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => {
      let valA: any = a[sortField as keyof Lead];
      let valB: any = b[sortField as keyof Lead];

      if (sortField === 'company') {
        valA = a.company?.name || a.companyName || '';
        valB = b.company?.name || b.companyName || '';
      } else if (sortField === 'estimatedValue') {
        valA = Number(a.estimatedValue || 0);
        valB = Number(b.estimatedValue || 0);
      } else if (sortField === 'lastActivityAt' || sortField === 'nextFollowUpAt') {
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [leads, sortField, sortDirection]);

  const handleExportCsv = () => {
    const headers = [
      'Lead Number',
      'Contact Name',
      'Company',
      'Phone',
      'Email',
      'City',
      'State',
      'Source',
      'Urgency',
      'Product',
      'Quantity',
      'Unit',
      'Estimated Value',
      'Stage',
      'Owner',
      'Next Follow-up',
      'Last Activity',
    ];

    const rows = sortedLeads.map((l) => [
      `"${l.leadNumber || ''}"`,
      `"${(l.customerName || '').replace(/"/g, '""')}"`,
      `"${(l.company?.name || l.companyName || '').replace(/"/g, '""')}"`,
      `"${l.customerPhone || ''}"`,
      `"${l.customerEmail || ''}"`,
      `"${l.city || ''}"`,
      `"${l.state || ''}"`,
      `"${l.source || ''}"`,
      `"${l.urgency || ''}"`,
      `"${(l.productName || '').replace(/"/g, '""')}"`,
      l.quantity || 1,
      `"${l.unit || 'NOS'}"`,
      l.estimatedValue || 0,
      `"${l.status || ''}"`,
      `"${l.ownerDisplayName || l.assignedTo?.name || ''}"`,
      `"${l.nextFollowUpAt ? format(new Date(l.nextFollowUpAt), 'yyyy-MM-dd') : ''}"`,
      `"${l.lastActivityAt ? format(new Date(l.lastActivityAt), 'yyyy-MM-dd') : ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#141722] overflow-hidden">
      {/* Table Toolbar: Column Chooser & CSV Export */}
      <div className="h-8 px-3 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#181B26] flex items-center justify-between text-xs shrink-0">
        <span className="text-slate-500 font-medium">
          Showing {sortedLeads.length} leads
        </span>

        <div className="flex items-center gap-2">
          {/* Column chooser */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColumnChooser(!showColumnChooser)}
              className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300"
            >
              <Sliders size={11} />
              <span>Columns</span>
            </button>

            {showColumnChooser && (
              <div className="absolute right-0 top-7 z-30 w-44 p-2 bg-white dark:bg-[#1E2230] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl space-y-1 text-xs">
                {Object.keys(visibleColumns).map((col) => (
                  <label
                    key={col}
                    className="flex items-center gap-2 px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-white/5 rounded cursor-pointer capitalize text-[11px]"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[col]}
                      onChange={(e) =>
                        setVisibleColumns({ ...visibleColumns, [col]: e.target.checked })
                      }
                      className="rounded text-crm-blue"
                    />
                    <span>{col.replace(/([A-Z])/g, ' $1')}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* CSV Export */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300"
          >
            <Download size={11} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Table Body with Sticky Header & Independent Body Scroll */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-[#1E2230] border-b border-slate-200 dark:border-[#2A3042] text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider select-none shadow-xs">
            <tr>
              {visibleColumns.leadNumber && (
                <th
                  onClick={() => toggleSort('leadNumber')}
                  className="py-2 px-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  <div className="flex items-center gap-1">
                    <span>Lead #</span>
                    {sortField === 'leadNumber' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </div>
                </th>
              )}

              {visibleColumns.contact && (
                <th
                  onClick={() => toggleSort('customerName')}
                  className="py-2 px-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  <div className="flex items-center gap-1">
                    <span>Contact & Company</span>
                    {sortField === 'customerName' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </div>
                </th>
              )}

              {visibleColumns.phone && <th className="py-2 px-3">Phone</th>}
              {visibleColumns.source && <th className="py-2 px-3">Source</th>}
              {visibleColumns.urgency && <th className="py-2 px-3">Urgency</th>}

              {visibleColumns.value && (
                <th
                  onClick={() => toggleSort('estimatedValue')}
                  className="py-2 px-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  <div className="flex items-center gap-1">
                    <span>Value</span>
                    {sortField === 'estimatedValue' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </div>
                </th>
              )}

              {visibleColumns.stage && (
                <th
                  onClick={() => toggleSort('status')}
                  className="py-2 px-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  <div className="flex items-center gap-1">
                    <span>Stage</span>
                    {sortField === 'status' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </div>
                </th>
              )}

              {visibleColumns.owner && <th className="py-2 px-3">Owner</th>}

              {visibleColumns.nextFollowUp && (
                <th
                  onClick={() => toggleSort('nextFollowUpAt')}
                  className="py-2 px-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  <div className="flex items-center gap-1">
                    <span>Follow-up</span>
                    {sortField === 'nextFollowUpAt' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </div>
                </th>
              )}

              {visibleColumns.lastActivity && (
                <th
                  onClick={() => toggleSort('lastActivityAt')}
                  className="py-2 px-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  <div className="flex items-center gap-1">
                    <span>Last Activity</span>
                    {sortField === 'lastActivityAt' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </div>
                </th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-[#222738]">
            {sortedLeads.map((lead) => {
              const cleanPhone = lead.customerPhone ? lead.customerPhone.replace(/\D/g, '') : '';
              const hasPhone = Boolean(cleanPhone && cleanPhone.length >= 7);
              const followUpDate = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt) : null;
              const isOverdue = followUpDate ? isPast(followUpDate) && !isToday(followUpDate) : false;
              const isDueToday = followUpDate ? isToday(followUpDate) : false;

              return (
                <tr
                  key={lead.id}
                  onClick={() => onOpenDrawer(lead)}
                  className={`hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors ${
                    density === 'comfortable' ? 'h-12' : 'h-9'
                  }`}
                >
                  {visibleColumns.leadNumber && (
                    <td className="py-1.5 px-3 font-mono text-[11px] font-semibold text-purple-700 dark:text-purple-300">
                      {lead.leadNumber}
                    </td>
                  )}

                  {visibleColumns.contact && (
                    <td className="py-1.5 px-3">
                      <div className="font-bold text-slate-900 dark:text-white truncate max-w-[160px]">
                        {lead.customerName}
                      </div>
                      {(lead.company?.name || lead.companyName) && (
                        <div className="text-[10px] text-slate-400 truncate max-w-[160px]">
                          {lead.company?.name || lead.companyName}
                        </div>
                      )}
                    </td>
                  )}

                  {visibleColumns.phone && (
                    <td className="py-1.5 px-3 font-mono text-[11px]">
                      {hasPhone ? (
                        <span className="text-slate-600 dark:text-slate-300">{lead.customerPhone}</span>
                      ) : (
                        <span className="text-amber-600 flex items-center gap-1 text-[10px]">
                          <AlertTriangle size={11} /> No phone
                        </span>
                      )}
                    </td>
                  )}

                  {visibleColumns.source && (
                    <td className="py-1.5 px-3 uppercase text-[10px] font-medium text-slate-500">
                      {lead.source?.replace(/_/g, ' ')}
                    </td>
                  )}

                  {visibleColumns.urgency && (
                    <td className="py-1.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold capitalize ${
                          lead.urgency === 'urgent'
                            ? 'bg-rose-500/15 text-rose-600 border border-rose-500/30'
                            : lead.urgency === 'high'
                            ? 'bg-amber-500/15 text-amber-600 border border-amber-500/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        {lead.urgency || 'standard'}
                      </span>
                    </td>
                  )}

                  {visibleColumns.value && (
                    <td className="py-1.5 px-3 font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatIndianCurrency(lead.estimatedValue) || '₹0'}
                    </td>
                  )}

                  {visibleColumns.stage && (
                    <td className="py-1.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold capitalize bg-slate-100 dark:bg-[#1E2230] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                        {lead.status}
                      </span>
                    </td>
                  )}

                  {visibleColumns.owner && (
                    <td className="py-1.5 px-3 text-slate-600 dark:text-slate-400 truncate max-w-[100px]">
                      {lead.ownerDisplayName || lead.assignedTo?.name || 'Unassigned'}
                    </td>
                  )}

                  {visibleColumns.nextFollowUp && (
                    <td className="py-1.5 px-3">
                      {followUpDate ? (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            isOverdue
                              ? 'bg-rose-500/15 text-rose-600'
                              : isDueToday
                              ? 'bg-amber-500/15 text-amber-600'
                              : 'text-slate-500'
                          }`}
                        >
                          {format(followUpDate, 'dd MMM')}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">-</span>
                      )}
                    </td>
                  )}

                  {visibleColumns.lastActivity && (
                    <td className="py-1.5 px-3 text-slate-400 text-[10px]">
                      {lead.lastActivityAt
                        ? formatDistanceToNow(new Date(lead.lastActivityAt), { addSuffix: true }).replace('about ', '')
                        : '-'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
