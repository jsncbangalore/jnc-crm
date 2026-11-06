/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  UserPlus,
  ExternalLink,
  ShieldAlert,
  Database,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export interface UnifiedErrorProps {
  error?: any;
  title?: string;
  message?: string;
  code?: string;
  field?: string;
  page?: string;
  recordType?: string;
  referenceId?: string;
  status?: number;
  onRetry?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  className?: string;
  compact?: boolean;
}

export function UnifiedErrorComponent({
  error,
  title,
  message: customMessage,
  code: propCode,
  field: propField,
  page,
  recordType,
  referenceId: propReferenceId,
  status: propStatus,
  onRetry,
  onAction,
  actionLabel,
  className = '',
  compact = false,
}: UnifiedErrorProps) {
  const { user } = useAuth();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Extract from error object if provided
  const errData = error?.response?.data || error?.data || {};
  const status = propStatus || error?.response?.status || errData?.statusCode || 500;
  const code = propCode || errData?.code || 'ERROR';
  const field = propField || errData?.field || (errData?.fieldErrors?.[0]?.field);
  const referenceId =
    propReferenceId ||
    errData?.requestId ||
    error?.requestId ||
    (error?.response?.headers ? error.response.headers['x-request-id'] : null) ||
    'N/A';

  const isAdmin =
    user?.role === 'admin' ||
    user?.role === 'tenant_admin' ||
    user?.role === 'platform_super_admin' ||
    user?.role === 'platform_admin' ||
    (user as any)?.isPlatformAdmin === true;

  // Derive plain-words message
  let displayMessage = customMessage || errData?.message || error?.message || 'An unexpected problem occurred.';

  if (code === 'SCHEMA_OUT_OF_DATE' || status === 503) {
    displayMessage = `The system needs an update. Nothing was lost. Ask your administrator (reference ${referenceId}).`;
  } else if (code === 'DUPLICATE') {
    displayMessage = field
      ? `A record with this ${field.toLowerCase()} already exists in the system.`
      : 'A record with these details already exists.';
  } else if (code === 'LINKED_RECORD_MISSING') {
    if (field === 'customerId' || field?.toLowerCase().includes('customer')) {
      displayMessage = 'This customer is not registered yet.';
    } else {
      displayMessage = `The required ${field ? field.toLowerCase() : 'record'} is missing or not registered yet.`;
    }
  } else if (code === 'NOT_FOUND') {
    displayMessage = `The requested ${recordType ? recordType.toLowerCase() : 'record'} could not be found.`;
  }

  // Derive where info
  const whereLocation = field || recordType || page || (typeof window !== 'undefined' ? window.location.pathname.replace(/^\//, '') : 'View');

  // Derive action button
  let effectiveActionLabel = actionLabel;
  let effectiveActionHandler = onAction;

  if (!effectiveActionHandler && onRetry) {
    effectiveActionLabel = effectiveActionLabel || 'Retry';
    effectiveActionHandler = onRetry;
  } else if (!effectiveActionLabel) {
    if (code === 'LINKED_RECORD_MISSING' && (field === 'customerId' || field?.toLowerCase().includes('customer'))) {
      effectiveActionLabel = 'Register Customer';
    } else if (onRetry) {
      effectiveActionLabel = 'Retry';
      effectiveActionHandler = onRetry;
    }
  }

  const handleCopyDetails = () => {
    const details = {
      code,
      module: page || 'CRM',
      referenceId,
      status,
      field,
      recordType,
      url: typeof window !== 'undefined' ? window.location.href : '',
      timestamp: new Date().toISOString(),
    };
    navigator.clipboard.writeText(JSON.stringify(details, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isSchemaUpdate = code === 'SCHEMA_OUT_OF_DATE' || status === 503;

  if (compact) {
    return (
      <div className={`p-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 text-left ${className}`}>
        <div className="flex items-start gap-3">
          <div className="p-1 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5">
            {isSchemaUpdate ? <Database size={16} /> : <AlertTriangle size={16} />}
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              {displayMessage}
            </p>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Where: <span className="font-semibold text-slate-700 dark:text-slate-300">{whereLocation}</span></span>
              <span>•</span>
              <span className="font-mono">Ref: {referenceId}</span>
            </div>
          </div>
          {effectiveActionHandler && (
            <button
              onClick={effectiveActionHandler}
              type="button"
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition shadow-2xs shrink-0"
            >
              {effectiveActionLabel}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-6 text-center max-w-lg mx-auto my-6 bg-white dark:bg-[#181B26] shadow-sm ${
      isSchemaUpdate
        ? 'border-amber-200 dark:border-amber-900/50'
        : 'border-slate-200 dark:border-slate-800'
    } ${className}`}>
      <div className="flex justify-center mb-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
          isSchemaUpdate
            ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
            : 'bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
        }`}>
          {isSchemaUpdate ? <Database size={24} /> : <AlertTriangle size={24} />}
        </div>
      </div>

      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
        {title || (isSchemaUpdate ? 'System Update Needed' : 'Action Could Not Complete')}
      </h3>

      <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
        {displayMessage}
      </p>

      {/* Where & Reference number */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 mb-5">
        <span>Location: <span className="font-semibold text-slate-700 dark:text-slate-300">{whereLocation}</span></span>
        <span>•</span>
        <span className="font-mono select-all">Ref: <span className="font-bold text-slate-700 dark:text-slate-200">{referenceId}</span></span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {effectiveActionHandler && (
          <button
            onClick={effectiveActionHandler}
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-crm-blue text-white text-xs font-bold hover:bg-crm-blue-dark transition-all shadow-xs cursor-pointer"
          >
            {effectiveActionLabel === 'Register Customer' ? (
              <UserPlus size={14} />
            ) : effectiveActionLabel === 'Retry' ? (
              <RefreshCw size={14} />
            ) : (
              <ExternalLink size={14} />
            )}
            {effectiveActionLabel}
          </button>
        )}
        {onRetry && effectiveActionLabel !== 'Retry' && (
          <button
            onClick={onRetry}
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 transition shadow-2xs"
          >
            <RefreshCw size={13} /> Retry
          </button>
        )}
      </div>

      {/* Admin Error Details Expander */}
      {isAdmin && (
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-left">
          <button
            onClick={() => setDetailsOpen((v) => !v)}
            className="inline-flex items-center justify-between w-full text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition"
          >
            <span className="flex items-center gap-1.5">
              <ShieldAlert size={12} className="text-amber-500" />
              Error details (Admin visible)
            </span>
            {detailsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {detailsOpen && (
            <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono space-y-1.5">
              <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                <span>Code: <span className="font-bold text-indigo-600 dark:text-indigo-400">{code}</span></span>
                <button
                  onClick={handleCopyDetails}
                  type="button"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition"
                >
                  {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                  {copied ? 'Copied' : 'Copy details'}
                </button>
              </div>
              <div className="text-slate-600 dark:text-slate-400">Module: {page || 'CRM Core'}</div>
              <div className="text-slate-600 dark:text-slate-400">Request ID: {referenceId}</div>
              {field && <div className="text-slate-600 dark:text-slate-400">Field: {field}</div>}
              {recordType && <div className="text-slate-600 dark:text-slate-400">Record: {recordType}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
