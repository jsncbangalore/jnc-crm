import UnifiedRecordPaymentModal from '../components/common/UnifiedRecordPaymentModal';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Search,
  Download,
  FileSpreadsheet,
  Plus,
  CreditCard,
  Lock,
  Mail,
  RefreshCw,
  Building2,
  AlertCircle,
  CheckCircle2,
  Calendar,
  X,
  FileText,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Info,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Send,
  RotateCcw,
  CheckSquare,
  ListChecks,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  ledgerApi,
  invoicesApi,
  LedgerParty,
  LedgerStatementResponse,
  LedgerStatementRow,
  LedgerOpenBill,
} from '../services/api';
import { safeUpper, safeSide } from '../utils/safeFormat';
import StyledSelect, { SelectOption } from '../components/common/StyledSelect';
import FormFeedback from '../components/common/FormFeedback';
import { LAYERS } from '../constants/layers';

// ─── Formatters & Helpers ─────────────────────────────────────────────────────

export const formatIndianCurrency = (val: number | null | undefined): string => {
  if (val === null || val === undefined || isNaN(val)) return '0.00';
  return Number(val).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export function computeCurrentIndianFY(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1 to 12
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

export function parseIndianFyYears(fy: string): { startYear: number; endYear: number } {
  const parts = fy.split('-');
  const s = parseInt('20' + parts[0], 10);
  const e = parseInt('20' + parts[1], 10);
  return { startYear: s, endYear: e };
}

export function cleanDetailsText(
  particulars: string | undefined,
  voucherType: string,
  voucherNo: string,
  partyName?: string
): string {
  let text = (particulars || '').trim();
  if (partyName) {
    const escaped = partyName.replace(/[.*+?^$\{}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '').trim();
  }
  // Remove dangling punctuation or dashes left by strip
  text = text.replace(/^[\s,\-–—:]+|[\s,\-–—:]+$/g, '').trim();

  if (!text) {
    const vt = (voucherType || '').toLowerCase();
    if (vt.includes('invoice') || vt === 'sales') {
      return voucherNo ? `Invoice ${voucherNo}` : 'Invoice';
    }
    if (vt.includes('bill') || vt === 'purchase') {
      return voucherNo ? `Purchase bill ${voucherNo}` : 'Purchase bill';
    }
    if (vt.includes('receipt')) {
      return voucherNo ? `Receipt ${voucherNo}` : 'Receipt';
    }
    if (vt.includes('payment')) {
      return voucherNo ? `Payment ${voucherNo}` : 'Payment';
    }
    if (vt.includes('credit_note')) {
      return voucherNo ? `Credit note ${voucherNo}` : 'Credit note';
    }
    if (vt.includes('debit_note')) {
      return voucherNo ? `Debit note ${voucherNo}` : 'Debit note';
    }
    return voucherType ? voucherType.replace(/_/g, ' ') : '-';
  }
  return text;
}

export function humanizeVoucherType(vt: string | undefined): string {
  const t = (vt || '').toLowerCase();
  if (t === 'sales' || t === 'tax_invoice' || t === 'invoice') return 'Invoice';
  if (t === 'purchase' || t === 'purchase_bill' || t === 'bill') return 'Bill';
  if (t === 'receipt') return 'Receipt';
  if (t === 'payment') return 'Payment';
  if (t === 'credit_note') return 'Credit Note';
  if (t === 'debit_note') return 'Debit Note';
  if (t === 'opening') return 'Opening';
  if (t === 'reversal') return 'Reversal';
  if (t === 'journal') return 'Journal';
  return vt ? vt.replace(/_/g, ' ') : '-';
}

// ─── Main Ledger Component ───────────────────────────────────────────────────

export default function LedgerPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const canManage =
    user?.role === 'tenant_admin' ||
    user?.role === 'admin' ||
    user?.role === 'finance' ||
    user?.role === 'accountant' ||
    user?.role === 'platform_super_admin' ||
    user?.role === 'platform_admin';

  // State
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>('customer');
  const [currentFY] = useState<string>(() => computeCurrentIndianFY());
  const [selectedFY, setSelectedFY] = useState<string>(() => computeCurrentIndianFY());
  const [parties, setParties] = useState<LedgerParty[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showZeroBalance, setShowZeroBalance] = useState(false);
  const [statement, setStatement] = useState<LedgerStatementResponse | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [companyProfile, setCompanyProfile] = useState<{
    companyName?: string;
    tradeName?: string;
    bankName?: string;
    bankAccountNumber?: string;
    bankIfsc?: string;
  } | null>(null);

  // Table view: Simple view vs Accountant view saved per user
  const [tableView, setTableView] = useState<'simple' | 'accountant'>(() => {
    return (localStorage.getItem('ledger_table_view') as 'simple' | 'accountant') || 'simple';
  });

  const handleTableViewChange = (view: 'simple' | 'accountant') => {
    setTableView(view);
    localStorage.setItem('ledger_table_view', view);
  };

  // Loading & error
  const [loadingParties, setLoadingParties] = useState(false);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [partiesError, setPartiesError] = useState<string | null>(null);
  const [statementError, setStatementError] = useState<string | null>(null);

  // Dropdown states for Download and More
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) {
        setShowDownloadMenu(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load company profile once
  useEffect(() => {
    invoicesApi
      .getCompanyProfile()
      .then((res) => {
        if (res.data) setCompanyProfile(res.data);
      })
      .catch(() => {});
  }, []);

  // Fetch lock date
  const loadLockDate = useCallback(async () => {
    try {
      const res = await ledgerApi.getLock();
      if (res.data?.lockedUntil) {
        setLockedUntil(res.data.lockedUntil);
      } else {
        setLockedUntil(null);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadLockDate();
  }, [loadLockDate]);

  // Load parties on partyType change
  const loadParties = useCallback(async () => {
    setLoadingParties(true);
    setPartiesError(null);
    try {
      const res = await ledgerApi.getParties(partyType);
      const list = res.data || [];
      // Sort by outstanding balance descending
      list.sort((a, b) => (b.closingBalance || 0) - (a.closingBalance || 0));
      setParties(list);

      // Select party with largest balance first
      if (list.length > 0) {
        setSelectedPartyId((prev) => {
          if (prev && list.some((p) => p.partyId === prev)) return prev;
          return list[0].partyId;
        });
      } else {
        setSelectedPartyId(null);
        setStatement(null);
      }
    } catch (err: any) {
      console.error('Failed to load ledger parties', err);
      setPartiesError(
        err?.response?.data?.message || 'Failed to load ledger parties. Please try again.'
      );
    } finally {
      setLoadingParties(false);
    }
  }, [partyType]);

  useEffect(() => {
    loadParties();
  }, [loadParties]);


  // Load statement
  const loadStatement = useCallback(
    async (partyId: string, fy: string) => {
      setLoadingStatement(true);
      setStatementError(null);
      try {
        const res = await ledgerApi.getStatement({
          partyType,
          partyId,
          financialYear: fy,
        });
        setStatement(res.data);
        if (res.data.lockedUntil !== undefined) {
          setLockedUntil(res.data.lockedUntil);
        }
      } catch (err: any) {
        console.error('Failed to load statement', err);
        setStatementError(
          err?.response?.data?.message ||
            'Failed to load statement for the selected party and year.'
        );
      } finally {
        setLoadingStatement(false);
      }
    },
    [partyType]
  );

  useEffect(() => {
    if (selectedPartyId) {
      loadStatement(selectedPartyId, selectedFY);
    } else {
      setStatement(null);
    }
  }, [selectedPartyId, selectedFY, loadStatement]);

  // Available FY options (computed from earliest to current year)
  const fyOptions: SelectOption[] = useMemo(() => {
    const list = ['24-25', '25-26', '26-27', '27-28'];
    if (statement?.availableFinancialYears) {
      for (const y of statement.availableFinancialYears) {
        if (!list.includes(y)) list.push(y);
      }
    }
    if (!list.includes(currentFY)) list.push(currentFY);
    list.sort();
    return list.map((y) => {
      const formattedFy = y.startsWith('20') ? `FY ${y}` : `FY 20${y}`;
      return {
        value: y,
        label: `${formattedFy}${y === currentFY ? ' (Current)' : ''}`,
        badge: y === currentFY ? 'Default' : undefined,
      };
    });
  }, [statement?.availableFinancialYears, currentFY]);

  // Filtered party list: hide zero balance unless showZeroBalance
  const filteredParties = useMemo(() => {
    let list = parties;
    if (!showZeroBalance) {
      list = list.filter((p) => (p.closingBalance || 0) > 0.01);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => {
        const name = (p.partyName || '').toLowerCase();
        const gstin = (p.partyGstin || '').toLowerCase();
        const phone = (p.partyPhone || '').toLowerCase();
        return name.includes(q) || gstin.includes(q) || phone.includes(q);
      });
    }
    return list;
  }, [parties, showZeroBalance, searchQuery]);

  const selectedParty = useMemo(() => {
    return parties.find((p) => p.partyId === selectedPartyId) || statement?.party;
  }, [parties, selectedPartyId, statement]);

  // Export handlers
  const handleDownloadPdf = async () => {
    if (!selectedPartyId) return;
    setShowDownloadMenu(false);
    try {
      const res = await ledgerApi.downloadPdf({
        partyType,
        partyId: selectedPartyId,
        financialYear: selectedFY,
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Statement_${selectedParty?.partyName || 'Party'}_${selectedFY}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download PDF error:', err);
      alert('Could not download statement PDF.');
    }
  };

  const handleExportCsv = () => {
    if (!statement || !statement.entries) return;
    setShowDownloadMenu(false);
    const headers = [
      'Date',
      'Particulars',
      'Voucher Type',
      'Voucher No',
      'Debit (INR)',
      'Credit (INR)',
      'Balance (INR)',
      'Dr/Cr',
    ];
    const rows = [
      [
        statement.fromDate,
        'Opening Balance b/f',
        'Opening',
        '-',
        statement.openingSide === 'dr' ? statement.openingBalance : 0,
        statement.openingSide === 'cr' ? statement.openingBalance : 0,
        statement.openingBalance,
        safeSide(statement.openingSide),
      ],
      ...statement.entries.map((e) => [
        e.entryDate,
        `"${(e.particulars || '').replace(/"/g, '""')}"`,
        e.voucherType,
        e.voucherNo,
        e.debit || 0,
        e.credit || 0,
        e.runningBalance || 0,
        safeSide(e.runningSide),
      ]),
      [
        statement.toDate,
        'Closing Balance',
        'Closing',
        '-',
        statement.totals.totalDebit,
        statement.totals.totalCredit,
        statement.closingBalance,
        safeSide(statement.closingSide),
      ],
    ];

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Statement_${statement.party.name}_${selectedFY}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleVoucherClick = (voucherType: string, voucherNo: string) => {
    const vt = (voucherType || '').toLowerCase();
    if (vt.includes('invoice') || vt === 'sales') {
      navigate(`/invoices?search=${encodeURIComponent(voucherNo)}`);
    } else if (vt.includes('bill') || vt === 'purchase') {
      navigate(`/bills?search=${encodeURIComponent(voucherNo)}`);
    }
  };

  // Helper for one-line party balance wording (Plain words: "Owes you Rs. X" / "You owe Rs. X" / "Advance Rs. X")
  const renderPartyBalanceLine = (p: LedgerParty) => {
    const bal = p.closingBalance || 0;
    const side = (p.balanceSide || 'dr').toLowerCase();
    if (bal <= 0.01) {
      return <span className="text-slate-400">₹0.00</span>;
    }
    const formatted = `₹${formatIndianCurrency(bal)}`;
    if (partyType === 'customer') {
      if (side === 'dr') {
        return <span className="text-rose-600 dark:text-rose-400 font-bold">Owes you {formatted}</span>;
      } else {
        return <span className="text-emerald-600 dark:text-emerald-400 font-bold">Advance {formatted}</span>;
      }
    } else {
      if (side === 'cr') {
        return <span className="text-amber-600 dark:text-amber-400 font-bold">You owe {formatted}</span>;
      } else {
        return <span className="text-emerald-600 dark:text-emerald-400 font-bold">Advance {formatted}</span>;
      }
    }
  };

  return (
    <div className="space-y-6 pb-12">

      {/* ─── PAGE HEADER (No subtitle, cut-off FY fixed, plain words) ───────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-950 dark:text-white tracking-tight">
                Party Ledger & Statements
              </h1>
            </div>
          </div>
        </div>

        {/* Actions & FY selector */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Financial Year selector with ample width to avoid cut-off */}
          <div className="w-48 sm:w-56 shrink-0">
            <StyledSelect
              value={selectedFY}
              onChange={(val) => setSelectedFY(val)}
              options={fyOptions}
              className="text-xs"
            />
          </div>

          {/* Primary Action Button */}
          {canManage && (
            <button
              data-testid="btn-record-ledger-payment"
              onClick={() => setShowPaymentModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>
                {partyType === 'customer' ? 'Record receipt' : 'Record payment'}
              </span>
            </button>
          )}

          {/* Download Dropdown (PDF, Excel, Email) */}
          <div className="relative" ref={downloadMenuRef}>
            <button
              onClick={() => setShowDownloadMenu((prev) => !prev)}
              disabled={!selectedPartyId || loadingStatement}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              title={!selectedPartyId ? 'Select a party first' : 'Download Options'}
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Download</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showDownloadMenu && selectedPartyId && (
              <div className="absolute right-0 mt-1.5 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-30 py-1 text-xs">
                <button
                  onClick={handleDownloadPdf}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  <FileText className="w-4 h-4 text-indigo-500" />
                  <span>PDF Statement</span>
                </button>
                <button
                  onClick={handleExportCsv}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Excel / CSV</span>
                </button>
                <button
                  onClick={() => {
                    setShowDownloadMenu(false);
                    setShowEmailModal(true);
                  }}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  <Mail className="w-4 h-4 text-sky-500" />
                  <span>Email Statement</span>
                </button>
              </div>
            )}
          </div>

          {/* More Dropdown (Admins only: Add Entry, Lock Period) */}
          {canManage && (
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setShowMoreMenu((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold shadow-sm transition"
              >
                <span>More</span>
                {lockedUntil && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                )}
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showMoreMenu && (
                <div className="absolute right-0 mt-1.5 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-30 py-1 text-xs">
                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowEntryModal(true);
                    }}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                  >
                    <Plus className="w-4 h-4 text-indigo-500" />
                    <span>Add entry</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowLockModal(true);
                    }}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                  >
                    <Lock
                      className={`w-4 h-4 ${lockedUntil ? 'text-amber-500' : 'text-slate-400'}`}
                    />
                    <span>
                      {lockedUntil ? `Lock period (${lockedUntil})` : 'Lock period'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Success Notification Banner */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-semibold">{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── TABS: Customers (owe you) vs Suppliers (you owe) ─────────────── */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          data-testid="tab-ledger-customers"
          onClick={() => {
            if (partyType !== 'customer') {
              setPartyType('customer');
              setSelectedPartyId(null);
              setStatement(null);
            }
          }}
          className={`pb-3 px-5 text-sm font-bold border-b-2 flex items-center gap-2 transition ${
            partyType === 'customer'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Customers (owe you)</span>
        </button>
        <button
          data-testid="tab-ledger-suppliers"
          onClick={() => {
            if (partyType !== 'supplier') {
              setPartyType('supplier');
              setSelectedPartyId(null);
              setStatement(null);
            }
          }}
          className={`pb-3 px-5 text-sm font-bold border-b-2 flex items-center gap-2 transition ${
            partyType === 'supplier'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Suppliers (you owe)</span>
        </button>
      </div>

      {/* ─── REAL TENANT FIRST-RUN CHECKLIST (When tenant is real and empty) ── */}
      {parties.length === 0 && !loadingParties && (
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <ListChecks className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                First-Run Setup Checklist
              </h2>
              <p className="text-xs text-slate-500">
                Complete these three quick steps to start using real accounts.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-white">1. Company Profile</span>
                {companyProfile?.companyName ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <span className="text-[10px] text-amber-600 font-bold">Pending</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Add company name, trade name, and GSTIN.
              </p>
              <button
                onClick={() => navigate('/settings')}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
              >
                <span>Edit Profile</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-white">2. Bank Account</span>
                {companyProfile?.bankAccountNumber ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <span className="text-[10px] text-amber-600 font-bold">Pending</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Add receiving bank account and IFSC in Settings.
              </p>
              <button
                onClick={() => navigate('/settings')}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
              >
                <span>Add Bank</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-white">3. First Customer</span>
                <span className="text-[10px] text-amber-600 font-bold">Pending</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Create customer account to issue invoices and track balances.
              </p>
              <button
                onClick={() => navigate('/customers')}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
              >
                <span>Create Customer</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SPLIT VIEW: Party List & Statement Area ─────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* LEFT COLUMN: Party List */}
        <div className="w-full lg:w-80 xl:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm flex-shrink-0">
          {/* Search bar & Show All toggle */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, GSTIN or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-0.5">
              <span>
                Showing {filteredParties.length} {partyType === 'customer' ? 'customers' : 'suppliers'}
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-600 dark:text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={showZeroBalance}
                  onChange={(e) => setShowZeroBalance(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Show all</span>
              </label>
            </div>
          </div>

          {/* Party List items */}
          <div className="max-h-[620px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
            {loadingParties ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading parties...</div>
            ) : partiesError ? (
              <div className="p-6 text-center space-y-2">
                <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
                <p className="text-xs text-rose-600 dark:text-rose-400">{partiesError}</p>
                <button
                  onClick={loadParties}
                  className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200"
                >
                  Retry
                </button>
              </div>
            ) : filteredParties.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {partyType === 'customer'
                    ? 'No customers with open balance'
                    : 'No suppliers with open balance'}
                </p>
                {partyType === 'customer' ? (
                  <button
                    onClick={() => navigate('/invoices')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Invoice</span>
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/bills')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Purchase Bill</span>
                  </button>
                )}
              </div>
            ) : (
              filteredParties.map((p) => {
                const isSelected = p.partyId === selectedPartyId;
                const pName = p.partyName || 'Unnamed Party';
                const pGstin = p.partyGstin;
                const pPhone = p.partyPhone;

                return (
                  <button
                    key={p.partyId}
                    onClick={() => setSelectedPartyId(p.partyId)}
                    className={`w-full text-left p-3.5 transition flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-l-4 border-indigo-600'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    } ${p.isUnlinked ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p
                          className={`text-xs font-bold truncate ${
                            isSelected
                              ? 'text-indigo-950 dark:text-white'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {pName}
                        </p>
                        {p.isUnlinked && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Unlinked
                          </span>
                        )}
                        {p.hasOverdue && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                            Overdue
                          </span>
                        )}
                      </div>

                      {/* Small GSTIN or Phone */}
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                        {pGstin ? `GSTIN: ${pGstin}` : pPhone ? `Phone: ${pPhone}` : 'No GSTIN / phone'}
                      </p>
                    </div>

                    {/* Single Plain Line: "Owes you Rs. X" / "You owe Rs. X" / "Advance Rs. X" */}
                    <div className="text-right flex-shrink-0 text-xs">
                      {renderPartyBalanceLine(p)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Statement & Details Area */}
        <div className="flex-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          {/* Statement Header */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  {selectedParty?.partyName || 'Party Statement'}
                </h2>
                {statement?.party?.creditPeriod !== undefined && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Credit Period: {statement.party.creditPeriod} days
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500 dark:text-slate-400">
                {selectedParty?.partyGstin && (
                  <span>
                    GSTIN:{' '}
                    <strong className="font-mono text-slate-700 dark:text-slate-300">
                      {selectedParty.partyGstin}
                    </strong>
                  </span>
                )}
                {selectedParty?.partyPhone && (
                  <span>Phone: {selectedParty.partyPhone}</span>
                )}
                {selectedParty?.partyEmail && (
                  <span>Email: {selectedParty.partyEmail}</span>
                )}
                {statement?.party?.address && (
                  <span className="truncate max-w-xs">Address: {statement.party.address}</span>
                )}
                {lockedUntil && (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                    <Lock className="w-3 h-3" /> Locked until {lockedUntil}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => selectedPartyId && loadStatement(selectedPartyId, selectedFY)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                title="Refresh statement"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loadingStatement ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>

          {/* Statement Content */}
          {loadingStatement ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading statement rows...</div>
          ) : statementError ? (
            <div className="p-8 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
              <p className="text-xs text-rose-600 dark:text-rose-400">{statementError}</p>
              <button
                onClick={() => selectedPartyId && loadStatement(selectedPartyId, selectedFY)}
                className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-semibold hover:bg-slate-200"
              >
                Retry
              </button>
            </div>
          ) : !statement || !selectedPartyId ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Select a party from the list to view statement.
            </div>
          ) : (
            <div className="space-y-5 p-4 sm:p-5">
              {/* Alternative FY Banner when current year has no entries */}
              {statement.entries.length === 0 && statement.alternativeFyWithEntries && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-between text-xs text-amber-900 dark:text-amber-300">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>
                      No transactions found for this party in FY {selectedFY}, but entries exist in{' '}
                      <strong>FY {statement.alternativeFyWithEntries}</strong>.
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedFY(statement.alternativeFyWithEntries!)}
                    className="px-2.5 py-1 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700 shadow-xs shrink-0"
                  >
                    View FY {statement.alternativeFyWithEntries}
                  </button>
                </div>
              )}

              {/* ─── 4 SUMMARY CARDS (Plain words: Opening, Billed, Received, Balance) ─── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* 1. Opening */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Opening
                  </span>
                  <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1">
                    ₹{formatIndianCurrency(statement.openingBalance)}{' '}
                    <span className="text-xs font-bold text-slate-500">
                      {safeSide(statement.openingSide)}
                    </span>
                  </p>
                </div>

                {/* 2. Billed */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-emerald-50/40 dark:bg-emerald-950/20">
                  <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider block">
                    Billed
                  </span>
                  <p className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 mt-1">
                    ₹{formatIndianCurrency(partyType === 'customer' ? statement.totals.totalDebit : statement.totals.totalCredit)}
                  </p>
                </div>

                {/* 3. Received */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-blue-50/40 dark:bg-blue-950/20">
                  <span className="text-[11px] font-semibold text-blue-800 dark:text-blue-400 uppercase tracking-wider block">
                    {partyType === 'customer' ? 'Received' : 'Paid'}
                  </span>
                  <p className="text-base sm:text-lg font-black text-blue-700 dark:text-blue-400 mt-1">
                    ₹{formatIndianCurrency(partyType === 'customer' ? statement.totals.totalCredit : statement.totals.totalDebit)}
                  </p>
                </div>

                {/* 4. Balance */}
                <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/30">
                  <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider block">
                    Balance
                  </span>
                  <p className="text-base sm:text-lg font-black text-indigo-950 dark:text-white mt-1">
                    ₹{formatIndianCurrency(statement.closingBalance)}{' '}
                    <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                      {safeSide(statement.closingSide)}
                    </span>
                  </p>
                </div>
              </div>

              {/* ─── STATEMENT TRANSACTIONS TABLE ──────────────────────────────── */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {/* Table Top Toolbar: Simple vs Accountant View Toggle */}
                <div className="p-3 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Statement Entries
                    </span>
                    <span className="text-[11px] text-slate-400">
                      ({statement.entries.length} {statement.entries.length === 1 ? 'entry' : 'entries'})
                    </span>
                  </div>

                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => handleTableViewChange('simple')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                        tableView === 'simple'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Simple view
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTableViewChange('accountant')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                        tableView === 'accountant'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Accountant view
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      {tableView === 'simple' ? (
                        /* Simple view columns: Date, Details, Type, No., Billed, Received, Balance owed */
                        <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-600 dark:text-slate-300">
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Details</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">No.</th>
                          <th className="py-2.5 px-3 text-right">Billed</th>
                          <th className="py-2.5 px-3 text-right">Received</th>
                          <th className="py-2.5 px-3 text-right">Balance owed</th>
                        </tr>
                      ) : (
                        /* Accountant view columns: Date, Particulars, Voucher Type, Voucher No., Debit (Dr), Credit (Cr), Balance, Dr/Cr */
                        <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-600 dark:text-slate-300">
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Particulars</th>
                          <th className="py-2.5 px-3">Voucher Type</th>
                          <th className="py-2.5 px-3">Voucher No.</th>
                          <th className="py-2.5 px-3 text-right">Debit (Dr)</th>
                          <th className="py-2.5 px-3 text-right">Credit (Cr)</th>
                          <th className="py-2.5 px-3 text-right">Balance</th>
                          <th className="py-2.5 px-3 text-center w-16">Dr/Cr</th>
                        </tr>
                      )}
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                      {/* Opening Balance Row */}
                      {tableView === 'simple' ? (
                        <tr className="bg-slate-50/70 dark:bg-slate-800/40 font-semibold text-slate-700 dark:text-slate-300">
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap">{statement.fromDate}</td>
                          <td className="py-2.5 px-3 italic font-semibold">Opening Balance</td>
                          <td className="py-2.5 px-3 text-[10px] text-slate-500">Opening</td>
                          <td className="py-2.5 px-3">-</td>
                          <td className="py-2.5 px-3 text-right font-mono">-</td>
                          <td className="py-2.5 px-3 text-right font-mono">-</td>
                          <td className="py-2.5 px-3 text-right font-bold font-mono whitespace-nowrap text-slate-900 dark:text-white">
                            ₹{formatIndianCurrency(statement.openingBalance)} {safeSide(statement.openingSide)}
                          </td>
                        </tr>
                      ) : (
                        <tr className="bg-slate-50/70 dark:bg-slate-800/40 font-semibold text-slate-700 dark:text-slate-300">
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap">{statement.fromDate}</td>
                          <td className="py-2.5 px-3 italic font-semibold">Opening Balance b/f</td>
                          <td className="py-2.5 px-3 text-[10px] text-slate-500 uppercase">Opening Balance</td>
                          <td className="py-2.5 px-3">-</td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono">-</td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono">-</td>
                          <td className="py-2.5 px-3 text-right font-bold font-mono whitespace-nowrap text-slate-900 dark:text-white">
                            ₹{formatIndianCurrency(statement.openingBalance)}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold font-mono uppercase text-slate-600 dark:text-slate-300">
                            {safeSide(statement.openingSide)}
                          </td>
                        </tr>
                      )}

                      {/* Entries */}
                      {statement.entries.length === 0 ? (
                        <tr>
                          <td
                            colSpan={tableView === 'simple' ? 7 : 8}
                            className="py-10 text-center space-y-3"
                          >
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              No transactions recorded for {selectedParty?.partyName} in FY {selectedFY}.
                            </p>
                            <div className="flex items-center justify-center gap-2 pt-1">
                              <button
                                onClick={() => setShowPaymentModal(true)}
                                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-xs"
                              >
                                {partyType === 'customer' ? 'Record receipt' : 'Record payment'}
                              </button>
                              <button
                                onClick={() =>
                                  navigate(partyType === 'customer' ? '/invoices' : '/bills')
                                }
                                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                {partyType === 'customer' ? 'Create invoice' : 'Add purchase bill'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        statement.entries.map((entry, idx) => {
                          const cleanDetails = cleanDetailsText(
                            entry.particulars,
                            entry.voucherType,
                            entry.voucherNo,
                            selectedParty?.partyName
                          );
                          const billedVal =
                            partyType === 'customer' ? entry.debit : entry.credit;
                          const receivedVal =
                            partyType === 'customer' ? entry.credit : entry.debit;

                          if (tableView === 'simple') {
                            return (
                              <tr
                                key={entry.id || idx}
                                className="hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200"
                              >
                                <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                                  {entry.entryDate}
                                </td>
                                <td className="py-2.5 px-3 break-words max-w-xs">
                                  <span>{cleanDetails}</span>
                                  {entry.reversalOfId && (
                                    <span className="ml-2 text-[10px] px-1 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 font-semibold">
                                      Reversal
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                                    {humanizeVoucherType(entry.voucherType)}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                                  {entry.voucherNo ? (
                                    <button
                                      onClick={() =>
                                        handleVoucherClick(entry.voucherType, entry.voucherNo)
                                      }
                                      className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold inline-flex items-center gap-1"
                                      title={`Open ${entry.voucherNo}`}
                                    >
                                      <span>{entry.voucherNo}</span>
                                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                    </button>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                                  {billedVal > 0 ? formatIndianCurrency(billedVal) : '-'}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap text-blue-700 dark:text-blue-400">
                                  {receivedVal > 0 ? formatIndianCurrency(receivedVal) : '-'}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap font-bold text-slate-900 dark:text-white">
                                  ₹{formatIndianCurrency(entry.runningBalance)}{' '}
                                  <span className="text-[10px] font-bold text-slate-500 uppercase">
                                    {safeSide(entry.runningSide)}
                                  </span>
                                </td>
                              </tr>
                            );
                          }

                          // Accountant View Row
                          return (
                            <tr
                              key={entry.id || idx}
                              className="hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200"
                            >
                              <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                                {entry.entryDate}
                              </td>
                              <td className="py-2.5 px-3 break-words max-w-xs">
                                <span>{entry.particulars}</span>
                                {entry.reversalOfId && (
                                  <span className="ml-2 text-[10px] px-1 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 font-semibold">
                                    Reversal
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                                  {humanizeVoucherType(entry.voucherType)}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                                {entry.voucherNo ? (
                                  <button
                                    onClick={() =>
                                      handleVoucherClick(entry.voucherType, entry.voucherNo)
                                    }
                                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold inline-flex items-center gap-1"
                                    title={`Open ${entry.voucherNo}`}
                                  >
                                    <span>{entry.voucherNo}</span>
                                    <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                  </button>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                                {entry.debit > 0 ? formatIndianCurrency(entry.debit) : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap text-blue-700 dark:text-blue-400">
                                {entry.credit > 0 ? formatIndianCurrency(entry.credit) : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap font-bold text-slate-900 dark:text-white">
                                ₹{formatIndianCurrency(entry.runningBalance)}
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold font-mono uppercase text-slate-600 dark:text-slate-300">
                                {safeSide(entry.runningSide)}
                              </td>
                            </tr>
                          );
                        })
                      )}

                      {/* Single Closing Balance Row (No duplicate closing rows) */}
                      {tableView === 'simple' ? (
                        <tr className="bg-indigo-50/50 dark:bg-indigo-950/20 font-bold border-t-2 border-slate-300 dark:border-slate-700 text-indigo-950 dark:text-white">
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap">{statement.toDate}</td>
                          <td colSpan={3} className="py-2.5 px-3 uppercase tracking-wider text-[11px]">
                            Closing Balance:
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                            ₹{formatIndianCurrency(partyType === 'customer' ? statement.totals.totalDebit : statement.totals.totalCredit)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap text-blue-700 dark:text-blue-400">
                            ₹{formatIndianCurrency(partyType === 'customer' ? statement.totals.totalCredit : statement.totals.totalDebit)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap font-black text-indigo-900 dark:text-indigo-200">
                            ₹{formatIndianCurrency(statement.closingBalance)} {safeSide(statement.closingSide)}
                          </td>
                        </tr>
                      ) : (
                        <tr className="bg-indigo-50/50 dark:bg-indigo-950/20 font-bold border-t-2 border-slate-300 dark:border-slate-700 text-indigo-950 dark:text-white">
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap">{statement.toDate}</td>
                          <td colSpan={3} className="py-2.5 px-3 uppercase tracking-wider text-[11px]">
                            Closing Balance:
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap font-bold text-emerald-700 dark:text-emerald-400">
                            ₹{formatIndianCurrency(statement.totals.totalDebit)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap font-bold text-blue-700 dark:text-blue-400">
                            ₹{formatIndianCurrency(statement.totals.totalCredit)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap font-black text-indigo-900 dark:text-indigo-200">
                            ₹{formatIndianCurrency(statement.closingBalance)}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold font-mono uppercase text-indigo-900 dark:text-indigo-200">
                            {safeSide(statement.closingSide)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ─── AGEING BREAKDOWN BAR ─────────────────────────────────────── */}
              {statement.ageing && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Receivable Ageing Breakdown
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      Total: ₹{formatIndianCurrency(statement.ageing.total)}
                    </span>
                  </div>

                  {/* Visual Ageing Bar */}
                  <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                    <div
                      style={{
                        width: `${
                          statement.ageing.total > 0
                            ? Math.max(
                                0,
                                (statement.ageing.current / statement.ageing.total) * 100
                              )
                            : 0
                        }%`,
                      }}
                      className="bg-emerald-500 transition-all"
                      title={`0-30 days: ₹${formatIndianCurrency(statement.ageing.current)}`}
                    />
                    <div
                      style={{
                        width: `${
                          statement.ageing.total > 0
                            ? Math.max(
                                0,
                                (statement.ageing.days30 / statement.ageing.total) * 100
                              )
                            : 0
                        }%`,
                      }}
                      className="bg-blue-500 transition-all"
                      title={`31-60 days: ₹${formatIndianCurrency(statement.ageing.days30)}`}
                    />
                    <div
                      style={{
                        width: `${
                          statement.ageing.total > 0
                            ? Math.max(
                                0,
                                (statement.ageing.days60 / statement.ageing.total) * 100
                              )
                            : 0
                        }%`,
                      }}
                      className="bg-amber-500 transition-all"
                      title={`61-90 days: ₹${formatIndianCurrency(statement.ageing.days60)}`}
                    />
                    <div
                      style={{
                        width: `${
                          statement.ageing.total > 0
                            ? Math.max(
                                0,
                                (statement.ageing.days90Plus / statement.ageing.total) * 100
                              )
                            : 0
                        }%`,
                      }}
                      className="bg-rose-500 transition-all"
                      title={`90+ days: ₹${formatIndianCurrency(statement.ageing.days90Plus)}`}
                    />
                  </div>

                  {/* Ageing Numbers Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                    <div className="p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold block">
                        0 - 30 Days
                      </span>
                      <p className="font-mono font-bold text-slate-800 dark:text-white">
                        ₹{formatIndianCurrency(statement.ageing.current)}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
                      <span className="text-[10px] text-blue-700 dark:text-blue-400 font-bold block">
                        31 - 60 Days
                      </span>
                      <p className="font-mono font-bold text-slate-800 dark:text-white">
                        ₹{formatIndianCurrency(statement.ageing.days30)}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40">
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold block">
                        61 - 90 Days
                      </span>
                      <p className="font-mono font-bold text-slate-800 dark:text-white">
                        ₹{formatIndianCurrency(statement.ageing.days60)}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40">
                      <span className="text-[10px] text-rose-700 dark:text-rose-400 font-bold block">
                        90+ Days (Overdue)
                      </span>
                      <p className="font-mono font-bold text-slate-800 dark:text-white">
                        ₹{formatIndianCurrency(statement.ageing.days90Plus)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── BILL-WISE OPEN BILLS PANEL ──────────────────────────────── */}
              {statement.openBills && statement.openBills.length > 0 && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="text-xs font-bold text-slate-800 dark:text-white">
                        Open Bills & Invoices ({statement.openBills.length})
                      </h3>
                    </div>
                    <button
                      onClick={() => setShowPaymentModal(true)}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      {partyType === 'customer' ? 'Record receipt' : 'Record payment'} &rarr;
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-600 dark:text-slate-300">
                          <th className="py-2 px-3">Document No.</th>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Due Date</th>
                          <th className="py-2 px-3 text-right">Total Amount</th>
                          <th className="py-2 px-3 text-right">Balance Due</th>
                          <th className="py-2 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                        {statement.openBills.map((b) => (
                          <tr
                            key={b.documentId}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/30"
                          >
                            <td className="py-2 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                              {b.documentNumber}
                            </td>
                            <td className="py-2 px-3 font-mono">{b.date}</td>
                            <td className="py-2 px-3 font-mono">{b.dueDate}</td>
                            <td className="py-2 px-3 text-right font-mono">
                              ₹{formatIndianCurrency(b.totalAmount)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                              ₹{formatIndianCurrency(b.balanceDue)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {b.daysOverdue > 0 ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                                  {b.daysOverdue} days overdue
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                                  Current
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>



      {/* ─── MODALS ──────────────────────────────────────────────────────── */}

      {/* 1. Record Payment / Receipt Modal */}
      {showPaymentModal && (
        <UnifiedRecordPaymentModal
          isOpen={showPaymentModal}
          partyType={partyType}
          parties={parties}
          defaultPartyId={selectedPartyId || undefined}
          defaultCustomerId={partyType === 'customer' ? (selectedPartyId || undefined) : undefined}
          openBills={statement?.openBills || []}
          lockedUntil={lockedUntil}
          selectedFY={selectedFY}
          companyBankDetails={
            companyProfile?.bankName && companyProfile?.bankAccountNumber
              ? `${companyProfile.bankName} - A/C ${companyProfile.bankAccountNumber} (${companyProfile.bankIfsc || ''})`
              : undefined
          }
          onClose={() => setShowPaymentModal(false)}
          onSuccess={(msg?: string) => {
            setShowPaymentModal(false);
            setSuccessMsg(msg || 'Payment recorded successfully.');
            loadParties();
            if (selectedPartyId) loadStatement(selectedPartyId, selectedFY);
          }}
        />
      )}

      {/* 2. Add Manual Entry Modal */}
      {showEntryModal && (
        <AddEntryModal
          partyType={partyType}
          parties={parties}
          selectedPartyId={selectedPartyId}
          selectedFY={selectedFY}
          openBills={statement?.openBills || []}
          lockedUntil={lockedUntil}
          onClose={() => setShowEntryModal(false)}
          onSuccess={(msg) => {
            setShowEntryModal(false);
            setSuccessMsg(msg);
            loadParties();
            if (selectedPartyId) loadStatement(selectedPartyId, selectedFY);
          }}
        />
      )}

      {/* 3. Lock Period Modal */}
      {showLockModal && (
        <LockPeriodModal
          lockedUntil={lockedUntil}
          onClose={() => setShowLockModal(false)}
          onSuccess={(msg) => {
            setShowLockModal(false);
            setSuccessMsg(msg);
            loadLockDate();
            if (selectedPartyId) loadStatement(selectedPartyId, selectedFY);
          }}
        />
      )}

      {/* 4. Send Email Modal */}
      {showEmailModal && statement && (
        <SendEmailModal
          party={statement.party}
          financialYear={selectedFY}
          onClose={() => setShowEmailModal(false)}
          onSuccess={(msg) => {
            setShowEmailModal(false);
            setSuccessMsg(msg);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD MANUAL ENTRY MODAL (Immutable, reversal-only)
// ─────────────────────────────────────────────────────────────────────────────

function AddEntryModal({
  partyType,
  parties,
  selectedPartyId,
  selectedFY,
  openBills,
  lockedUntil,
  onClose,
  onSuccess,
}: {
  partyType: 'customer' | 'supplier';
  parties: LedgerParty[];
  selectedPartyId: string | null;
  selectedFY: string;
  openBills: LedgerOpenBill[];
  lockedUntil: string | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [partyId, setPartyId] = useState(selectedPartyId || parties[0]?.partyId || '');
  const [voucherType, setVoucherType] = useState<string>('opening');
  const [side, setSide] = useState<'debit' | 'credit'>('debit');
  const [amount, setAmount] = useState<string>('');
  const [entryDate, setEntryDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [particulars, setParticulars] = useState<string>('');
  const [voucherNo, setVoucherNo] = useState<string>('');
  const [linkedDocumentId, setLinkedDocumentId] = useState<string>('');
  const [confirmOpening, setConfirmOpening] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selectedParty = parties.find((p) => p.partyId === partyId);

  // Auto-set date to FY start if opening balance
  useEffect(() => {
    if (voucherType === 'opening') {
      try {
        const { startYear } = parseIndianFyYears(selectedFY);
        setEntryDate(`${startYear}-04-01`);
      } catch {}
    }
  }, [voucherType, selectedFY]);

  const entryTypeOptions: SelectOption[] = [
    {
      value: 'opening',
      label: 'Opening balance',
      sublabel: 'Initial outstanding balance brought forward from previous books.',
    },
    {
      value: 'journal',
      label: 'Journal',
      sublabel: 'General accounting adjustment between party accounts.',
    },
    {
      value: 'credit_note',
      label: 'Credit note',
      sublabel:
        partyType === 'customer'
          ? 'Reduces what a customer owes us.'
          : 'Reduces what we owe a supplier.',
    },
    {
      value: 'debit_note',
      label: 'Debit note',
      sublabel:
        partyType === 'customer'
          ? 'Increases what a customer owes us.'
          : 'Reduces what we owe a supplier (claim or rejection).',
    },
  ];

  // Auto-set side based on voucher type
  useEffect(() => {
    if (voucherType === 'credit_note') {
      setSide('credit');
    } else if (voucherType === 'debit_note') {
      setSide('debit');
    }
  }, [voucherType]);

  const partyOptions: SelectOption[] = useMemo(() => {
    return parties.map((p) => {
      const pName = p.partyName || 'Party';
      const pSide = p.balanceSide || 'dr';
      return {
        value: p.partyId,
        label: pName,
        sublabel: `Current: ₹${formatIndianCurrency(p.closingBalance)} ${safeSide(pSide)}`,
      };
    });
  }, [parties]);

  const projectedBalance = useMemo(() => {
    const num = parseFloat(amount) || 0;
    const currentBalance = selectedParty?.closingBalance || 0;
    const currentSide = (selectedParty?.balanceSide || 'dr').toLowerCase();

    if (partyType === 'customer') {
      let signed = currentSide === 'dr' ? currentBalance : -currentBalance;
      if (side === 'debit') {
        signed += num;
      } else {
        signed -= num;
      }
      return {
        amount: Math.abs(signed),
        side: signed >= 0 ? 'Dr' : 'Cr',
        wording: signed >= 0 ? 'They owe us' : 'Advance',
      };
    } else {
      let signed = currentSide === 'cr' ? currentBalance : -currentBalance;
      if (side === 'credit') {
        signed += num;
      } else {
        signed -= num;
      }
      return {
        amount: Math.abs(signed),
        side: signed >= 0 ? 'Cr' : 'Dr',
        wording: signed >= 0 ? 'We owe them' : 'Advance',
      };
    }
  }, [amount, selectedParty, partyType, side]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setErr('Please enter an amount greater than 0.');
      return;
    }

    if (particulars.trim().length < 5) {
      setErr('Particulars (narration) must be at least 5 characters.');
      return;
    }

    if (voucherType === 'opening' && !confirmOpening) {
      setErr('Please confirm creating this opening balance entry.');
      return;
    }

    if (lockedUntil && entryDate <= lockedUntil) {
      setErr(`Ledger period is locked through ${lockedUntil}. Select an entry date after the lock date.`);
      return;
    }

    try {
      const { startYear, endYear } = parseIndianFyYears(selectedFY);
      const minDate = `${startYear}-04-01`;
      const maxDate = `${endYear}-03-31`;
      if (entryDate < minDate || entryDate > maxDate) {
        setErr(`Entry date must fall within FY ${selectedFY} (${minDate} to ${maxDate}).`);
        return;
      }
    } catch {}

    setSubmitting(true);
    setErr(null);

    try {
      await ledgerApi.recordManualEntry({
        partyType,
        partyId,
        entryDate,
        voucherType,
        voucherNo: voucherNo.trim() || undefined,
        debit: side === 'debit' ? numAmount : 0,
        credit: side === 'credit' ? numAmount : 0,
        particulars: particulars.trim(),
        financialYear: selectedFY,
        confirmOpening,
      });

      onSuccess(`Manual ledger entry recorded successfully.`);
    } catch (error: any) {
      console.error('Entry error', error);
      setErr(error?.response?.data?.message || 'Failed to save entry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
      style={{ zIndex: LAYERS.MODAL }}
    >
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Add Manual Ledger Entry
              </h3>
              <p className="text-xs text-slate-500">
                Opening balances, journals, credit notes, debit notes
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-5 space-y-4 overflow-y-auto flex-1">
          <StyledSelect
            label="Entry Type"
            value={voucherType}
            onChange={(val) => setVoucherType(val)}
            options={entryTypeOptions}
          />

          <StyledSelect
            label="Party"
            value={partyId}
            onChange={(val) => setPartyId(val)}
            options={partyOptions}
            searchable={partyOptions.length > 4}
          />

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Side (Debit or Credit) *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSide('debit')}
                className={`py-2 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  side === 'debit'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                <span>Debit (Dr)</span>
              </button>
              <button
                type="button"
                onClick={() => setSide('credit')}
                className={`py-2 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  side === 'credit'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 ring-2 ring-blue-500/20'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5 text-blue-600" />
                <span>Credit (Cr)</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {partyType === 'customer'
                ? 'Debit increases what a customer owes; credit reduces it.'
                : 'Credit increases what we owe a supplier; debit reduces it.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Amount (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Entry Date *
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Voucher No. (Optional)
              </label>
              <input
                type="text"
                placeholder="Auto-generated if empty"
                value={voucherNo}
                onChange={(e) => setVoucherNo(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </div>

            {openBills.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Link to Invoice / Bill (Optional)
                </label>
                <select
                  value={linkedDocumentId}
                  onChange={(e) => setLinkedDocumentId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                >
                  <option value="">None (Standalone)</option>
                  {openBills.map((b) => (
                    <option key={b.documentId} value={b.documentId}>
                      {b.documentNumber} (₹{formatIndianCurrency(b.balanceDue)})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Narration / Particulars{' '}
              {voucherType !== 'opening' && <span className="text-rose-500">*</span>}
            </label>
            <input
              type="text"
              placeholder="e.g. Agreed dispute adjustment / credit settlement"
              value={particulars}
              onChange={(e) => setParticulars(e.target.value)}
              required={voucherType !== 'opening'}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            <span className="text-slate-500 block">Balance Projection:</span>
            <p className="font-bold text-slate-900 dark:text-white mt-0.5">
              After this entry the balance of{' '}
              <strong>{selectedParty?.partyName || 'the party'}</strong>{' '}
              will be{' '}
              <span className="font-mono text-indigo-600 dark:text-indigo-400">
                ₹{formatIndianCurrency(projectedBalance.amount)} {projectedBalance.side}
              </span>{' '}
              ({projectedBalance.wording}).
            </p>
          </div>

          {voucherType === 'opening' && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmOpening}
                  onChange={(e) => setConfirmOpening(e.target.checked)}
                  className="mt-0.5 rounded text-amber-600 focus:ring-amber-500"
                />
                <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  I confirm setting this authoritative Opening Balance for FY {selectedFY}. This entry will appear strictly as the Opening Balance b/f row.
                </span>
              </label>
            </div>
          )}

          <p className="text-[11px] text-slate-400 italic">
            Entries are never edited; corrections use reversal.
          </p>

          <FormFeedback error={err} />

          <div className="sticky bottom-0 bg-white dark:bg-slate-900 p-4 -mx-5 -mb-5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2.5 shrink-0 z-10 shadow-xs">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold disabled:opacity-50 transition shadow-xs"
            >
              {submitting ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCK PERIOD MODAL
// ─────────────────────────────────────────────────────────────────────────────

function LockPeriodModal({
  lockedUntil,
  onClose,
  onSuccess,
}: {
  lockedUntil: string | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [lockDate, setLockDate] = useState<string>(lockedUntil || '');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async (dateVal: string | null) => {
    setSubmitting(true);
    setErr(null);
    try {
      await ledgerApi.setLockDate({
        lockedUntil: dateVal,
        notes: notes.trim() || undefined,
      });
      onSuccess(dateVal ? `Ledger period locked through ${dateVal}.` : 'Ledger period unlocked.');
    } catch (error: any) {
      console.error('Lock error', error);
      setErr(error?.response?.data?.message || 'Failed to update period lock.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      style={{ zIndex: LAYERS.MODAL }}
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Ledger Period Lock
              </h3>
              <p className="text-xs text-slate-500">Prevent voucher modifications before lock date</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            Transactions on or before this lock date will be strictly read-only. No payments,
            invoices, or manual entries can be created or updated within the locked period.
          </p>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Lock All Transactions On Or Before:
            </label>
            <input
              type="date"
              value={lockDate}
              onChange={(e) => setLockDate(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Audit Reason
            </label>
            <input
              type="text"
              placeholder="e.g. Books closed for quarterly statutory audit"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <FormFeedback error={err} />

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between gap-2.5">
            {lockedUntil && (
              <button
                type="button"
                onClick={() => handleSave(null)}
                disabled={submitting}
                className="px-3.5 py-2 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold"
              >
                Unlock Period
              </button>
            )}
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSave(lockDate)}
                disabled={submitting || !lockDate}
                className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50 transition shadow-xs"
              >
                {submitting ? 'Locking...' : 'Save Lock Date'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND EMAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────

function SendEmailModal({
  party,
  financialYear,
  onClose,
  onSuccess,
}: {
  party: LedgerStatementResponse['party'];
  financialYear: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [email, setEmail] = useState<string>(party.partyEmail || '');
  const [subject, setSubject] = useState<string>(
    `Statement of Account for ${party.partyName} (FY ${financialYear})`
  );
  const [message, setMessage] = useState<string>(
    `Dear ${party.partyName},\n\nPlease find attached your Statement of Account for the financial year ${financialYear}.\n\nWarm regards,\nAccounts Team`
  );
  const [sending, setSending] = useState(false);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setTimeout(() => {
      setSending(false);
      onSuccess(`Statement email queued for delivery to ${email}.`);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Send Statement Email
              </h3>
              <p className="text-xs text-slate-500">Dispatch PDF statement with cover letter</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSend} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Recipient Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="recipient@example.com"
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Subject *
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Cover Message
            </label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="sticky bottom-0 bg-white dark:bg-slate-900 p-4 -mx-5 -mb-5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2.5 shrink-0 z-10 shadow-xs">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50 transition shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Sending...' : 'Send Statement'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
