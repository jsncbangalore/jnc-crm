import React from 'react';
import { LeadSource, LeadStatus, OrderStatus } from '../../types';

export function SourceBadge({ source }: { source: LeadSource }) {
  const map: Record<LeadSource, { label: string; className: string }> = {
    indiamart: { label: 'IndiaMART', className: 'badge-indiamart' },
    web:       { label: 'Website',   className: 'badge-web' },
    whatsapp:  { label: 'WhatsApp',  className: 'badge-whatsapp' },
    manual:    { label: 'Manual',    className: 'badge-manual' },
  };
  const { label, className } = map[source] || { label: source, className: 'badge-manual' };
  return <span className={`${className} whitespace-nowrap`}>{label}</span>;
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const map: Record<LeadStatus, string> = {
    new:       'badge-new',
    contacted: 'badge-contacted',
    qualified: 'badge-qualified',
    quoted:    'badge-quoted',
    won:       'badge-won',
    lost:      'badge-lost',
  };
  return <span className={`${map[status] || 'badge'} whitespace-nowrap`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, string> = {
    confirmed:  'badge-confirmed',
    processing: 'badge-processing',
    dispatched: 'badge-dispatched',
    delivered:  'badge-delivered',
    cancelled:  'badge-cancelled',
  };
  return <span className={`${map[status] || 'badge'} whitespace-nowrap`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}
