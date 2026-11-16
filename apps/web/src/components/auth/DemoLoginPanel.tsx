import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, UserCheck, RefreshCw, AlertCircle } from 'lucide-react';

interface DemoRoleOption {
  id: string;
  roleKey: string;
  label: string;
  badge: string;
  landingPage: string;
  description: string;
}

const DEMO_ROLES: DemoRoleOption[] = [
  {
    id: 'platform_owner',
    roleKey: 'platform_owner',
    label: 'Platform Super Admin',
    badge: 'Super Admin',
    landingPage: '/platform/companies',
    description: 'System owner, company provisioning & platform management',
  },
  {
    id: 'admin',
    roleKey: 'admin',
    label: 'Company Administrator',
    badge: 'Tenant Admin',
    landingPage: '/dashboard',
    description: 'Full workspace administration, users, branding & settings',
  },
  {
    id: 'sales',
    roleKey: 'sales',
    label: 'Sales Representative',
    badge: 'Sales',
    landingPage: '/leads',
    description: 'Leads, pipeline Kanban, quotations & sales orders',
  },
  {
    id: 'accountant',
    roleKey: 'accountant',
    label: 'Accountant',
    badge: 'Accounts',
    landingPage: '/invoices',
    description: 'Invoicing, purchase bills, general ledger & receipts',
  },
  {
    id: 'store',
    roleKey: 'store',
    label: 'Store & Inventory Manager',
    badge: 'Store',
    landingPage: '/inventory',
    description: 'Stock management, SKUs, suppliers & shipments',
  },
  {
    id: 'viewer',
    roleKey: 'viewer',
    label: 'Read-Only Viewer',
    badge: 'Auditor',
    landingPage: '/leads',
    description: 'Read-only pipeline: leads, quotes, invoices & alerts',
  },
];

export default function DemoLoginPanel() {
  const navigate = useNavigate();
  const { applyLoginSession } = useAuth();
  const [loadingRole, setLoadingRole] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDemoLogin = async (roleKey: string) => {
    setLoadingRole(roleKey);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/v1/auth/dev-demo-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({ role: roleKey }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Demo endpoint returned 404. Ensure DEV_DEMO_LOGIN=true and npm run dev:demo-seed has been executed.');
        }
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || `Demo login failed with HTTP ${response.status}`);
      }

      const data = await response.json();
      if (applyLoginSession) {
        applyLoginSession(data);
      }

      const dest = data.redirectPath || (roleKey === 'platform_owner' ? '/platform/companies' : '/');
      navigate(dest);
    } catch (err: any) {
      console.error('[DemoLogin] Failed:', err);
      setErrorMessage(err.message || 'Demo login failed. Make sure local database is seeded.');
    } finally {
      setLoadingRole(null);
    }
  };

  return (
    <div
      data-testid="demo-login-panel"
      className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-50/80 via-blue-50/60 to-slate-50/80 dark:from-indigo-950/30 dark:via-blue-950/20 dark:to-slate-900/40 border border-indigo-200/80 dark:border-indigo-800/50 shadow-sm text-xs"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={16} className="text-indigo-600 dark:text-indigo-400" />
          <span className="font-bold text-slate-900 dark:text-white text-[13px]">Demo login (local only)</span>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
          Dev Sandbox
        </span>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2.5">
        Instant one-click access bypassing 2-step verification, SMS, and email OTPs.
      </p>

      {errorMessage && (
        <div className="mb-2.5 p-2 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-[11px] flex items-start gap-1.5">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {DEMO_ROLES.map((r) => {
          const isLoading = loadingRole === r.roleKey;
          return (
            <button
              key={r.id}
              type="button"
              data-testid={`demo-btn-${r.roleKey}`}
              disabled={loadingRole !== null}
              onClick={() => handleDemoLogin(r.roleKey)}
              className="group relative flex flex-col p-2 text-left rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="font-bold text-[11px] text-slate-900 dark:text-white truncate">
                  {r.badge}
                </span>
                {isLoading ? (
                  <RefreshCw size={11} className="animate-spin text-indigo-600 dark:text-indigo-400" />
                ) : (
                  <UserCheck size={11} className="text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                )}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {r.landingPage}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
