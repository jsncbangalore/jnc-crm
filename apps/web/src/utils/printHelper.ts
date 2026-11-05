/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { invoicesApi, ledgerApi } from '../services/api';

export const POPUP_BLOCKED_MESSAGE = 'Allow pop-ups for this site, or use Download PDF';

export interface OpenPrintTabOptions {
  copyLabel?: string;
  paperSize?: 'A4' | 'A5';
  fy?: string;
  activeTemplate?: string;
}

/**
 * Opens the dedicated print page (/print/:docType/:id) synchronously inside a user gesture
 * to prevent browser popup blockers from suppressing the tab.
 *
 * @returns true if tab was created successfully, false if suppressed by a popup blocker.
 */
export function openDedicatedPrintTab(
  docType: string,
  id: string,
  options: OpenPrintTabOptions = {}
): boolean {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams();
  if (options.copyLabel) params.set('copyLabel', options.copyLabel);
  if (options.paperSize) params.set('paperSize', options.paperSize);
  if (options.fy) params.set('fy', options.fy);
  if (options.activeTemplate) params.set('template', options.activeTemplate);

  const qs = params.toString();
  const url = `/print/${encodeURIComponent(docType)}/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;

  try {
    // Synchronous window.open MUST be executed directly in event loop of user gesture
    const printTab = window.open('', '_blank');
    if (!printTab || printTab.closed || typeof printTab.closed === 'undefined') {
      console.warn('Dedicated print tab was blocked by browser popup blocker.');
      return false;
    }

    printTab.location.href = url;
    return true;
  } catch (err) {
    console.error('Failed to open print tab:', err);
    return false;
  }
}

/**
 * Shared PDF generation/download utility that works uniformly across desktops,
 * tablets, and mobile devices without requiring iframe embedding.
 */
export async function downloadDocumentPdf(
  docType: string,
  id: string,
  filename?: string,
  options: { template?: string; fy?: string } = {}
): Promise<boolean> {
  try {
    let blob: Blob | null = null;
    let targetName = filename;

    if (
      docType === 'invoice' ||
      docType === 'tax_invoice' ||
      docType === 'delivery_challan' ||
      docType === 'proforma_invoice' ||
      docType === 'credit_note' ||
      docType === 'sez_invoice'
    ) {
      const template = options.template || docType;
      const res = await invoicesApi.downloadPdf(id, template);
      blob = new Blob([res.data], { type: 'application/pdf' });
      if (!targetName) {
        targetName = `${docType.toUpperCase()}_${id}.pdf`;
      }
    } else if (docType === 'statement' || docType === 'ledger') {
      const res = await ledgerApi.downloadPdf({
        partyType: (options as any)?.partyType || 'customer',
        partyId: id,
        financialYear: options.fy || '2026-27',
      });
      blob = new Blob([res.data], { type: 'application/pdf' });
      if (!targetName) {
        targetName = `Statement_${id}_${options.fy || '2026-27'}.pdf`;
      }
    } else {
      // For templates rendered client-side (e.g. quotation, purchase bill),
      // we open the dedicated print page where user can choose Save as PDF or Print
      const opened = openDedicatedPrintTab(docType, id, {
        activeTemplate: options.template,
        fy: options.fy,
      });
      return opened;
    }

    if (!blob) return false;

    const blobUrl = window.URL.createObjectURL(blob);

    // Universal anchor download (avoids window.open after await which gets blocked by popup blockers)
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = targetName || 'document.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
    return true;
  } catch (err) {
    console.error('Download document PDF failed:', err);
    return false;
  }
}
