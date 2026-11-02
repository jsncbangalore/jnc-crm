import React from 'react';

interface DevAccountsBoxProps {
  onSelect: (identifier: string, pass: string) => void;
}

export default function DevAccountsBox({ onSelect }: DevAccountsBoxProps) {
  return (
    <div data-testid="dev-credentials-box" className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/50 text-xs">
      <p className="font-bold text-blue-900 dark:text-blue-200 mb-1.5 flex items-center justify-between">
        <span>Dev Test Accounts (Development Only):</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onSelect('admin@seed.dev', 'DevPassword@123')}
          className="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 hover:bg-blue-50 text-[11px] font-mono text-blue-700 dark:text-blue-300 cursor-pointer"
        >
          admin@seed.dev
        </button>
        <button
          type="button"
          onClick={() => onSelect('tenant-admin@seed.dev', 'DevPassword@123')}
          className="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 hover:bg-blue-50 text-[11px] font-mono text-blue-700 dark:text-blue-300 cursor-pointer"
        >
          tenant-admin@seed.dev
        </button>
        <button
          type="button"
          onClick={() => onSelect('beta-admin@seed.dev', 'DevPassword@123')}
          className="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 hover:bg-blue-50 text-[11px] font-mono text-blue-700 dark:text-blue-300 cursor-pointer"
        >
          beta-admin@seed.dev
        </button>
        <button
          type="button"
          onClick={() => onSelect('sales-agent@seed.dev', 'DevPassword@123')}
          className="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 hover:bg-blue-50 text-[11px] font-mono text-blue-700 dark:text-blue-300 cursor-pointer"
        >
          sales-agent@seed.dev
        </button>
      </div>
    </div>
  );
}
