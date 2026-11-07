import React, { useRef } from 'react';
import { format } from 'date-fns';
import { Phone, Mail, Building2, MapPin, Eye, Edit3 } from 'lucide-react';
import { Lead } from '../../types';
import { formatIndianCurrency } from './CompactLeadCard';

export interface ClientDirectoryViewProps {
  leads: Lead[];
  onOpenDrawer: (lead: Lead) => void;
  density: 'compact' | 'comfortable';
}

export const ClientDirectoryView: React.FC<ClientDirectoryViewProps> = ({
  leads,
  onOpenDrawer,
  density,
}) => {
  const tableContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#141722] overflow-hidden">
      <div
        ref={tableContainerRef}
        className="flex-1 min-h-0 overflow-y-auto"
      >
        <table className={`w-full text-left border-collapse ${density === 'compact' ? 'text-[11px]' : 'text-xs'}`}>
          <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-[#181B26] border-b border-slate-200 dark:border-[#2A3042] text-slate-800 dark:text-slate-300 shadow-xs">
            <tr>
              <th className="px-3 py-2 font-bold whitespace-nowrap">Lead #</th>
              <th className="px-3 py-2 font-bold whitespace-nowrap">Date</th>
              <th className="px-3 py-2 font-bold min-w-[160px]">Client / Company</th>
              <th className="px-3 py-2 font-bold min-w-[140px]">Contact</th>
              <th className="px-3 py-2 font-bold whitespace-nowrap">Location</th>
              <th className="px-3 py-2 font-bold whitespace-nowrap">Source</th>
              <th className="px-3 py-2 font-bold min-w-[160px]">Product / Requirement</th>
              <th className="px-3 py-2 font-bold text-right whitespace-nowrap">Est. Value</th>
              <th className="px-3 py-2 font-bold text-center whitespace-nowrap">Stage</th>
              <th className="px-3 py-2 font-bold text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]/40">
            {leads.map((l) => (
              <tr
                key={l.id}
                onClick={() => onOpenDrawer(l)}
                className="hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors"
              >
                <td className="px-3 py-1.5 font-mono font-bold text-purple-700 dark:text-purple-300 whitespace-nowrap">
                  {l.leadNumber}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-slate-500 font-mono text-[10px]">
                  {l.createdAt ? format(new Date(l.createdAt), 'dd MMM yyyy') : '-'}
                </td>
                <td className="px-3 py-1.5">
                  <div className="font-bold text-slate-900 dark:text-white truncate max-w-[160px]">
                    {l.customerName}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate max-w-[160px]">
                    {l.company?.name || l.companyName || 'Individual'}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300 font-mono text-[10px]">
                  {l.customerPhone || 'No phone'}
                </td>
                <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">
                  {l.city || '-'}
                </td>
                <td className="px-3 py-1.5 uppercase text-[10px] font-medium text-slate-500 whitespace-nowrap">
                  {l.source?.replace(/_/g, ' ')}
                </td>
                <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300 truncate max-w-[160px]">
                  {l.productName || l.productCategory || '-'}
                </td>
                <td className="px-3 py-1.5 text-right font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                  {formatIndianCurrency(l.estimatedValue) || '₹0'}
                </td>
                <td className="px-3 py-1.5 text-center whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold capitalize bg-slate-100 dark:bg-[#1E2230] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {l.status}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDrawer(l);
                    }}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-crm-blue"
                    title="View details"
                  >
                    <Eye size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
