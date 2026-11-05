/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  X,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Layers,
  AlertTriangle,
  AlertOctagon,
} from 'lucide-react';
import {
  paymentsApi,
  invoicesApi,
  brandingApi,
  ledgerApi,
  bankAccountsApi,
  LedgerParty,
  LedgerOpenBill,
} from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import StyledSelect, { SelectOption } from './StyledSelect';
import FullCalendarPicker from './FullCalendarPicker';
import {
  validateMeaningfulNarration,
  validatePaymentReference,
  getPaymentReferenceHint,
  validateBankAccount,
  validateIfsc,
  validateUpiId,
  formatDisplayDate,
  formatFriendlyErrorMessage,
  toPlainText,
} from '@crm/shared-validation';

// Safe array extraction helper
export function ensureArray<T>(val: any): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (Array.isArray(val.data)) return val.data;
  if (Array.isArray(val.invoices)) return val.invoices;
  if (Array.isArray(val.bills)) return val.bills;
  if (Array.isArray(val.items)) return val.items;
  return [];
}

// Paise conversion helpers for exact integer arithmetic
export const toPaise = (num: number | string | undefined | null): number => {
  if (num === null || num === undefined) return 0;
  const n = typeof num === 'string' ? parseFloat(num.replace(/,/g, '')) : num;
  return isNaN(n) ? 0 : Math.round(n * 100);
};

export const fromPaise = (paise: number): number => paise / 100;

export function formatIndianCurrency(num: number | string): string {
  const n = typeof num === 'string' ? parseFloat(num.replace(/,/g, '')) : num;
  if (isNaN(n) || n === 0) return '0.00';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// Error normalisation helper for arrays, strings, and class-validator messages
export function normalizeError(error: any): string {
  if (!error) return 'An unexpected error occurred.';
  if (typeof error === 'string') {
    if (/Network Error|Failed to fetch|NetworkError/i.test(error)) {
      return 'Cannot reach the server. Your payment was not saved.';
    }
    return error;
  }
  const data = error.response?.data;
  if (data) {
    if (Array.isArray(data.message)) {
      return data.message.join('. ');
    }
    if (typeof data.message === 'string') {
      return data.message;
    }
    if (Array.isArray(data.errors)) {
      return data.errors.map((e: any) => e.message || String(e)).join('. ');
    }
    if (typeof data.error === 'string') {
      return data.error;
    }
  }
  if (typeof error.message === 'string') {
    if (/Network Error|Failed to fetch|NetworkError/i.test(error.message)) {
      return 'Cannot reach the server. Your payment was not saved.';
    }
    return error.message;
  }
  return 'Failed to record payment. Please check your inputs and try again.';
}

export interface UnifiedRecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg?: string) => void;
  partyType?: 'customer' | 'supplier';
  parties?: LedgerParty[];
  defaultPartyId?: string;
  defaultCustomerId?: string;
  defaultCustomerName?: string;
  defaultOrderId?: string;
  defaultInvoiceId?: string;
  defaultAmount?: number;
  openBills?: LedgerOpenBill[];
  lockedUntil?: string | null;
  selectedFY?: string;
  companyBankDetails?: string;
}

interface AllocationRow {
  documentId: string;
  documentNumber: string;
  docType?: string;
  date?: string;
  dueDate?: string;
  balanceDue: number;
  allocatedAmount: number;
  selected: boolean;
}

export default function UnifiedRecordPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  partyType: initialPartyType = 'customer',
  parties: initialParties,
  defaultPartyId,
  defaultCustomerId,
  defaultCustomerName,
  defaultOrderId,
  defaultInvoiceId,
  defaultAmount,
  openBills: initialOpenBills,
  lockedUntil,
  selectedFY,
  companyBankDetails,
}: UnifiedRecordPaymentModalProps) {
  const effectiveDefaultPartyId = defaultPartyId || defaultCustomerId || '';

  // State
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>(initialPartyType);
  const [partiesList, setPartiesList] = useState<LedgerParty[]>(initialParties || []);
  const [loadingParties, setLoadingParties] = useState(false);
  const [selectedPartyId, setSelectedPartyId] = useState<string>(effectiveDefaultPartyId);

  const [amountInput, setAmountInput] = useState<string>(defaultAmount ? String(defaultAmount) : '');
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const { user } = useAuth();
  const canAddBankAccount = Boolean(
    user && ['platform_super_admin', 'tenant_admin', 'admin'].includes(user.role)
  );

  // Idempotency state: created ONCE per window open, reused across retries
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [networkErrorOccurred, setNetworkErrorOccurred] = useState<boolean>(false);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(false);

  // Add Bank Account In-Place Drawer / Modal state
  const [showAddBankModal, setShowAddBankModal] = useState<boolean>(false);
  const [permissionDeniedMsg, setPermissionDeniedMsg] = useState<string | null>(null);
  const [newBankForm, setNewBankForm] = useState({
    bankName: '',
    accountNumber: '',
    ifsc: '',
    branch: '',
    upiId: '',
    holderName: '',
  });
  const [newBankErrors, setNewBankErrors] = useState<Record<string, string>>({});
  const [savingNewBank, setSavingNewBank] = useState<boolean>(false);

  // Unlinked / Open Invoices Advance Confirmation prompt
  const [showAdvancePrompt, setShowAdvancePrompt] = useState<boolean>(false);
  const [promptOpenInvoicesAmount, setPromptOpenInvoicesAmount] = useState<number>(0);
  const [confirmAdvanceOverride, setConfirmAdvanceOverride] = useState<boolean>(false);

  const [paymentMethod, setPaymentMethod] = useState<string>('NEFT');
  const [reference, setReference] = useState<string>('');
  const [bankAccount, setBankAccount] = useState<string>(companyBankDetails || '');
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [bankAccountsList, setBankAccountsList] = useState<SelectOption[]>([]);
  const [narration, setNarration] = useState<string>('');
  const [allowAdvance, setAllowAdvance] = useState(false);

  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [showLargeAmountModal, setShowLargeAmountModal] = useState(false);
  const [showTypedConfirmModal, setShowTypedConfirmModal] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [confirmedLargeAmount, setConfirmedLargeAmount] = useState(false);

  const wasOpenRef = useRef(false);

  // Reset on open: when isOpen transitions to true, reset state cleanly and create fresh Idempotency-Key
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const newKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setIdempotencyKey(newKey);
      setNetworkErrorOccurred(false);
      setCheckingStatus(false);
      setShowAddBankModal(false);
      setPermissionDeniedMsg(null);
      setShowAdvancePrompt(false);
      setConfirmAdvanceOverride(false);

      setPartyType(initialPartyType);
      setSelectedPartyId(effectiveDefaultPartyId);
      setAmountInput(defaultAmount ? String(defaultAmount) : '');
      setIsAmountFocused(false);
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setPaymentMethod('NEFT');
      setReference('');
      setBankAccount(companyBankDetails || '');
      setBankAccountId('');
      setNarration('');
      setAllowAdvance(false);
      setAllocations([]);
      setErr(null);
      setDuplicateWarning(null);
      setConfirmDuplicate(false);
      setShowLargeAmountModal(false);
      setShowTypedConfirmModal(false);
      setTypedConfirmation('');
      setConfirmedLargeAmount(false);
      setSubmitting(false);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialPartyType, effectiveDefaultPartyId, defaultAmount, companyBankDetails]);

  // Load parties list without auto-selecting first party
  useEffect(() => {
    if (!isOpen) return;
    if (initialParties && initialParties.length > 0) {
      setPartiesList(initialParties);
      return;
    }
    setLoadingParties(true);
    ledgerApi.getParties(partyType)
      .then((res) => {
        const list: LedgerParty[] = ensureArray(res?.data);
        setPartiesList(list);
      })
      .catch((e) => console.error('Failed to load ledger parties:', e))
      .finally(() => setLoadingParties(false));
  }, [isOpen, partyType, initialParties]);

  // Load company bank details for electronic receipts
  const loadBankAccounts = useCallback(async () => {
    // 1. First attempt: Dedicated company bank accounts API
    try {
      const res = await bankAccountsApi.getAll();
      const list = ensureArray(res?.data);
      if (list.length > 0) {
        const options: SelectOption[] = list.map((acc: any) => ({
          value: acc.id,
          label: acc.displayLabel || `${acc.bankName} ••••${acc.accountNumberLast4}`,
          sublabel: `${acc.holderName || acc.label || 'Company Account'} • IFSC: ${acc.ifsc || '-'}${acc.isDefault ? ' (Default)' : ''}`,
        }));
        setBankAccountsList(options);
        if (!bankAccountId) {
          const def: any = list.find((a: any) => a.isDefault) || list[0];
          if (def) {
            setBankAccountId(def.id);
            setBankAccount(def.displayLabel || `${def.bankName} ••••${def.accountNumberLast4}`);
          }
        }
        return;
      }
    } catch {
      // bankAccountsApi failed or route not deployed yet, proceed to branding profile fallback
    }

    // 2. Second attempt: Company Branding & GST profile (/settings/company-profile)
    try {
      const profileRes = await brandingApi.getProfile();
      const prof: any = profileRes?.data;
      const bName = prof?.bankName || prof?.bankDetails?.bankName;
      const bAcc = prof?.bankAccountNumber || prof?.bankDetails?.accountNumber;
      const bIfsc = prof?.bankIfsc || prof?.bankDetails?.ifscCode;
      const holder = prof?.name || prof?.companyDisplayName || 'Company Account';
      if (bName) {
        const rawAcc = bAcc ? String(bAcc).replace(/\s+/g, '') : '';
        const masked = rawAcc.length > 4 ? `••••${rawAcc.slice(-4)}` : (rawAcc ? `••••${rawAcc}` : '');
        const label = `${bName}${masked ? ` ${masked}` : ''}`.trim();
        const options: SelectOption[] = [
          {
            value: label,
            label,
            sublabel: `${holder}${bIfsc ? ` • IFSC: ${bIfsc}` : ''}`.trim(),
          },
        ];
        setBankAccountsList(options);
        if (!bankAccount) setBankAccount(label);
        return;
      }
    } catch {
      // Proceed to invoicing profile fallback
    }

    // 3. Third attempt: Invoices company profile (/invoices/company-profile)
    try {
      const resProfile = await invoicesApi.getCompanyProfile();
      const prof: any = resProfile?.data;
      const bName = prof?.bankDetails?.bankName || prof?.bankName;
      const bAcc = prof?.bankDetails?.accountNumber || prof?.bankAccountNumber;
      const bIfsc = prof?.bankDetails?.ifscCode || prof?.bankIfsc;
      const holder = prof?.companyName || prof?.name || 'Company Account';
      if (bName) {
        const rawAcc = bAcc ? String(bAcc).replace(/\s+/g, '') : '';
        const masked = rawAcc.length > 4 ? `••••${rawAcc.slice(-4)}` : (rawAcc ? `••••${rawAcc}` : '');
        const label = `${bName}${masked ? ` ${masked}` : ''}`.trim();
        const options: SelectOption[] = [
          {
            value: label,
            label,
            sublabel: `${holder}${bIfsc ? ` • IFSC: ${bIfsc}` : ''}`.trim(),
          },
        ];
        setBankAccountsList(options);
        if (!bankAccount) setBankAccount(label);
      }
    } catch {
      // End of fallbacks
    }
  }, [bankAccount]);

  useEffect(() => {
    if (isOpen) {
      loadBankAccounts();
    }
  }, [isOpen, loadBankAccounts]);

  const selectedParty = useMemo(() => {
    return partiesList.find((p) => p.partyId === selectedPartyId) || null;
  }, [partiesList, selectedPartyId]);

  const partyBalance = selectedParty?.closingBalance || 0;
  const balanceSide = (selectedParty?.balanceSide || (partyType === 'customer' ? 'dr' : 'cr')).toLowerCase();
  const isAdvanceBalance = partyType === 'customer' ? balanceSide === 'cr' : balanceSide === 'dr';

  // Load open documents across all financial years and sort strictly by: date, dueDate, documentNumber
  useEffect(() => {
    if (!isOpen || !selectedPartyId) {
      setAllocations([]);
      return;
    }

    let mounted = true;
    setLoadingDocs(true);

    ledgerApi.getOpenDocuments(partyType, selectedPartyId)
      .then((res) => {
        if (!mounted) return;
        const openDocs: any[] = ensureArray(res.data);

        // Strict auto-allocation sorting: date, then dueDate, then documentNumber
        openDocs.sort((a, b) => {
          const dateA = a.date || '';
          const dateB = b.date || '';
          if (dateA !== dateB) return dateA.localeCompare(dateB);
          const dueA = a.dueDate || a.date || '';
          const dueB = b.dueDate || b.date || '';
          if (dueA !== dueB) return dueA.localeCompare(dueB);
          const numA = a.documentNumber || '';
          const numB = b.documentNumber || '';
          return numA.localeCompare(numB);
        });

        const initialAllocations: AllocationRow[] = openDocs.map((b) => {
          const isPreselected = defaultInvoiceId ? b.documentId === defaultInvoiceId : false;
          const duePaise = toPaise(b.balanceDue);
          const preselectedPaise = defaultAmount ? Math.min(toPaise(defaultAmount), duePaise) : duePaise;
          return {
            documentId: b.documentId,
            documentNumber: b.documentNumber,
            docType: b.documentType,
            date: b.date,
            dueDate: b.dueDate,
            balanceDue: Number(b.balanceDue || 0),
            allocatedAmount: isPreselected ? fromPaise(preselectedPaise) : 0,
            selected: isPreselected,
          };
        });

        setAllocations(initialAllocations);
      })
      .catch((e) => {
        if (mounted) console.error('Failed to load open ledger documents:', e);
      })
      .finally(() => {
        if (mounted) setLoadingDocs(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, selectedPartyId, partyType, defaultInvoiceId, defaultAmount]);

  // Keyboard accessibility: Escape to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    setDuplicateWarning(null);
    setConfirmDuplicate(false);
  }, [reference, paymentDate, selectedPartyId]);

  if (!isOpen) return null;

  // Exact paise arithmetic
  const numEnteredAmountPaise = toPaise(amountInput);
  const totalAllocatedPaise = allocations
    .filter((a) => a.selected)
    .reduce((sum, a) => sum + toPaise(a.allocatedAmount), 0);
  const totalAllocated = fromPaise(totalAllocatedPaise);
  const surplusPaise = Math.max(0, numEnteredAmountPaise - totalAllocatedPaise);
  const surplusAmount = fromPaise(surplusPaise);

  // Derived isAdvance: true when order advance without invoice, no invoices selected, or surplus with allowAdvance
  const isAdvance = Boolean(
    (defaultOrderId && !defaultInvoiceId) ||
    allocations.length === 0 ||
    totalAllocatedPaise === 0 ||
    (allowAdvance && surplusPaise > 0)
  );

  const handleToggleRow = (documentId: string) => {
    setAllocations((prev) => {
      const target = prev.find((r) => r.documentId === documentId);
      if (!target) return prev;
      const nextSelected = !target.selected;
      const updated = prev.map((r) => {
        if (r.documentId !== documentId) return r;
        return {
          ...r,
          selected: nextSelected,
          allocatedAmount: nextSelected ? r.balanceDue : 0,
        };
      });

      const newTotalPaise = updated.filter((r) => r.selected).reduce((s, r) => s + toPaise(r.allocatedAmount), 0);
      setAmountInput(newTotalPaise > 0 ? (newTotalPaise / 100).toFixed(2) : '');
      return updated;
    });
  };

  const handleAllocationAmountChange = (documentId: string, val: string) => {
    const enteredPaise = toPaise(val);
    setAllocations((prev) =>
      prev.map((r) => {
        if (r.documentId !== documentId) return r;
        const duePaise = toPaise(r.balanceDue);
        const boundedPaise = Math.min(Math.max(0, enteredPaise), duePaise);
        return {
          ...r,
          allocatedAmount: fromPaise(boundedPaise),
          selected: boundedPaise > 0,
        };
      })
    );
  };

  const handleAutoAllocateOldestFirst = () => {
    if (numEnteredAmountPaise <= 0) {
      setErr('Enter an amount first to auto-allocate.');
      return;
    }
    setErr(null);
    let remainingPaise = numEnteredAmountPaise;
    setAllocations((prev) =>
      prev.map((r) => {
        if (remainingPaise <= 0) return { ...r, allocatedAmount: 0, selected: false };
        const duePaise = toPaise(r.balanceDue);
        const allocPaise = Math.min(remainingPaise, duePaise);
        remainingPaise -= allocPaise;
        return {
          ...r,
          allocatedAmount: fromPaise(allocPaise),
          selected: allocPaise > 0,
        };
      })
    );
  };

  const partyOptions: SelectOption[] = partiesList.map((p) => {
    const gstinPart = p.partyGstin ? `GSTIN: ${p.partyGstin}` : 'Unregistered';
    const balPart = `Bal: ₹${formatIndianCurrency(p.closingBalance)} ${(p.balanceSide || '').toUpperCase()}`;
    return {
      value: p.partyId,
      label: p.partyName,
      sublabel: `${gstinPart} | ${balPart}`,
      badge: p.hasOverdue ? 'Overdue' : undefined,
    };
  });

  const methodOptions: SelectOption[] = [
    { value: 'NEFT', label: 'NEFT (National Electronic Fund Transfer)' },
    { value: 'RTGS', label: 'RTGS (Real Time Gross Settlement)' },
    { value: 'UPI', label: 'UPI / QR Payment' },
    { value: 'Cheque', label: 'Cheque / Demand Draft' },
    { value: 'Cash', label: 'Cash Payment' },
    { value: 'Credit Card', label: 'Credit Card' },
  ];

  const handleAddBankAccountClick = () => {
    setPermissionDeniedMsg(null);
    if (!canAddBankAccount) {
      setPermissionDeniedMsg('Ask an administrator to add a company bank account.');
      return;
    }
    setNewBankForm({
      bankName: '',
      accountNumber: '',
      ifsc: '',
      branch: '',
      upiId: '',
      holderName: '',
    });
    setNewBankErrors({});
    setShowAddBankModal(true);
  };

  const handleSaveNewBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};

    if (!newBankForm.bankName.trim()) {
      errs.bankName = 'Bank name is required.';
    }

    const accCheck = validateBankAccount(newBankForm.accountNumber, true);
    if (!accCheck.valid) {
      errs.accountNumber = accCheck.error || 'Invalid account number.';
    }

    const ifscCheck = validateIfsc(newBankForm.ifsc, true);
    if (!ifscCheck.valid) {
      errs.ifsc = ifscCheck.error || 'Invalid IFSC code.';
    }

    if (newBankForm.upiId.trim()) {
      const upiCheck = validateUpiId(newBankForm.upiId, false);
      if (!upiCheck.valid) {
        errs.upiId = upiCheck.error || 'Invalid UPI ID format.';
      }
    }

    if (Object.keys(errs).length > 0) {
      setNewBankErrors(errs);
      return;
    }

    setSavingNewBank(true);
    try {
      const res = await bankAccountsApi.create({
        bankName: newBankForm.bankName.trim(),
        accountNumber: newBankForm.accountNumber.trim(),
        ifsc: newBankForm.ifsc.trim().toUpperCase(),
        branch: newBankForm.branch.trim() || undefined,
        upiId: newBankForm.upiId.trim() || undefined,
        holderName: newBankForm.holderName.trim() || undefined,
        isDefault: bankAccountsList.length === 0,
      });

      const created = res.data;
      const createdLabel = created.displayLabel || `${created.bankName} ••••${created.accountNumberLast4}`;
      const newOption: SelectOption = {
        value: created.id,
        label: createdLabel,
        sublabel: `${created.label} • IFSC: ${created.ifsc || '-'}`,
      };

      setBankAccountsList((prev) => [newOption, ...prev]);
      setBankAccountId(created.id);
      setBankAccount(createdLabel);
      setShowAddBankModal(false);
    } catch (err: any) {
      setNewBankErrors({ form: err?.response?.data?.message || err?.message || 'Failed to save bank account.' });
    } finally {
      setSavingNewBank(false);
    }
  };

  const checkPaymentSavedStatus = async () => {
    if (!idempotencyKey) return;
    setCheckingStatus(true);
    try {
      const res = await paymentsApi.checkIdempotency(idempotencyKey);
      if (res?.data?.exists) {
        onSuccess('Payment confirmed and saved.');
        onClose();
      } else {
        setErr('Payment was not recorded on server. You may safely retry.');
        setNetworkErrorOccurred(false);
      }
    } catch {
      setErr('Cannot reach the server. Please check your network connection.');
    } finally {
      setCheckingStatus(false);
    }
  };

  const validateForm = (): boolean => {
    setErr(null);

    if (!selectedPartyId) {
      setErr(`Please select a ${partyType === 'customer' ? 'customer' : 'supplier'}.`);
      return false;
    }

    if (numEnteredAmountPaise <= 0) {
      setErr('Amount must be greater than zero.');
      return false;
    }

    const refCheck = validatePaymentReference(paymentMethod, reference);
    if (!refCheck.valid) {
      setErr(refCheck.error || `Invalid reference for ${paymentMethod} payments.`);
      return false;
    }

    // Total allocations must not exceed the amount received
    if (totalAllocatedPaise > numEnteredAmountPaise) {
      setErr(`Total allocated amount (₹${formatIndianCurrency(totalAllocated)}) must not exceed payment amount (₹${formatIndianCurrency(fromPaise(numEnteredAmountPaise))}).`);
      return false;
    }

    if (!allowAdvance && allocations.length > 0 && numEnteredAmountPaise > totalAllocatedPaise && totalAllocatedPaise > 0) {
      setErr(`Amount (₹${formatIndianCurrency(fromPaise(numEnteredAmountPaise))}) exceeds allocated total (₹${formatIndianCurrency(totalAllocated)}). Tick "Allow advance payment" to record surplus as an advance.`);
      return false;
    }

    if (lockedUntil && paymentDate <= lockedUntil) {
      setErr(`Books are locked until ${lockedUntil}. Choose a payment date after lock date.`);
      return false;
    }

    if (narration.trim()) {
      const narrationCheck = validateMeaningfulNarration(narration.trim(), 'Narration');
      if (!narrationCheck.valid) {
        setErr(narrationCheck.error || 'Please enter a meaningful narration (5+ characters, not random letters).');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e?: React.FormEvent, overrideAdvance = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (submitting) return; // Prevent double-submit
    if (!validateForm()) return;

    const enteredAmt = fromPaise(numEnteredAmountPaise);
    if (enteredAmt > 10000000 && typedConfirmation !== 'CONFIRM') {
      setShowTypedConfirmModal(true);
      return;
    }
    if (enteredAmt > 1000000 && !confirmedLargeAmount) {
      setShowLargeAmountModal(true);
      return;
    }

    const totalOpenDuePaise = allocations.reduce((sum, a) => sum + toPaise(a.balanceDue), 0);
    const activeAllocations = allocations
      .filter((a) => a.selected && toPaise(a.allocatedAmount) > 0)
      .map((a) => ({
        documentId: a.documentId,
        invoiceId: a.documentId,
        amount: a.allocatedAmount,
      }));

    // If posted entirely as advance while having open invoices, prompt user
    if (activeAllocations.length === 0 && totalOpenDuePaise > 0 && enteredAmt > 0 && !confirmAdvanceOverride && !overrideAdvance) {
      setPromptOpenInvoicesAmount(fromPaise(totalOpenDuePaise));
      setShowAdvancePrompt(true);
      return;
    }

    setSubmitting(true);
    setErr(null);

    try {
      const keyToUse = idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idem-${Date.now()}`);
      if (!idempotencyKey) setIdempotencyKey(keyToUse);

      const payload: any = {
        partyType,
        partyId: selectedPartyId,
        customerId: partyType === 'customer' ? selectedPartyId : undefined,
        supplierId: partyType === 'supplier' ? selectedPartyId : undefined,
        orderId: defaultOrderId || undefined,
        amount: enteredAmt,
        paymentDate,
        paymentMethod,
        reference: reference.trim() || undefined,
        bankAccountId: paymentMethod === 'Cash' ? undefined : (bankAccountId || undefined),
        notes: narration.trim() || undefined,
        isAdvance: isAdvance || overrideAdvance || confirmAdvanceOverride,
        allowAdvance: allowAdvance || overrideAdvance || confirmAdvanceOverride,
        confirmDuplicate,
        confirmedLargePayment: Boolean(confirmedLargeAmount || enteredAmt > 1000000),
        typedConfirmation: enteredAmt > 10000000 ? 'CONFIRM' : undefined,
        allocations: activeAllocations.length > 0 ? activeAllocations : undefined,
        idempotencyKey: keyToUse,
      };

      const res = await paymentsApi.record(payload, {
        headers: { 'idempotency-key': keyToUse }
      });

      if (res.data?.duplicateWarning && !confirmDuplicate) {
        setDuplicateWarning(res.data.message || 'A payment with this reference already exists for this party.');
        setConfirmDuplicate(true);
        setSubmitting(false);
        return;
      }

      onSuccess(res.data?.message || 'Payment recorded successfully.');
      onClose();
    } catch (apiErr: any) {
      const isNetwork =
        apiErr?.code === 'ECONNABORTED' ||
        apiErr?.code === 'ERR_NETWORK' ||
        !apiErr?.response ||
        /Network Error|Failed to fetch|NetworkError/i.test(apiErr?.message || '');

      if (isNetwork) {
        setNetworkErrorOccurred(true);
        setErr('Payment not confirmed. Check the statement before trying again.');
      } else {
        const errMsg = normalizeError(apiErr);
        if (apiErr?.response?.status === 409 || errMsg.toLowerCase().includes('duplicate')) {
          setDuplicateWarning(errMsg);
          setConfirmDuplicate(true);
        } else {
          setErr(errMsg);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs select-none"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-[#181B26] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#2A3042] flex flex-col overflow-hidden text-slate-900 dark:text-white">
        
        {/* Modal Header */}
        <div className="shrink-0 p-4 sm:p-5 border-b border-slate-200 dark:border-[#2A3042] flex items-center justify-between bg-slate-50/70 dark:bg-[#141722]">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              <CreditCard className="w-5 h-5" />
            </span>
            <div>
              <h3 id="payment-modal-title" className="text-base sm:text-lg font-bold">
                {partyType === 'customer' ? 'Record Receipt' : 'Record Payment'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Post transaction to party ledger and allocate open invoices
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden text-xs">
          
          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            
            {/* Error Message */}
            {err && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-xl text-red-600 dark:text-red-400 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{toPlainText(err)}</span>
                </div>
                {networkErrorOccurred && (
                  <button
                    type="button"
                    onClick={checkPaymentSavedStatus}
                    disabled={checkingStatus}
                    className="px-3 py-1 text-xs font-bold bg-white dark:bg-slate-800 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg shadow-sm hover:bg-red-50 whitespace-nowrap"
                  >
                    {checkingStatus ? 'Checking...' : 'Check if it was saved'}
                  </button>
                )}
              </div>
            )}

            {/* Duplicate Warning */}
            {duplicateWarning && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl text-amber-700 dark:text-amber-400 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{duplicateWarning} Click confirm below to proceed anyway.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmDuplicate(true)}
                  className="px-2.5 py-1 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
                >
                  Allow
                </button>
              </div>
            )}

            {/* 1. AMOUNT FIELD (FIRST & ALWAYS VISIBLE) */}
            <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/80 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                    {partyType === 'customer' ? 'Amount Received (₹) *' : 'Amount Paid (₹) *'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      data-testid="unified-payment-amount-input" autoFocus placeholder="0.00"
                      value={
                        isAmountFocused
                           ? amountInput
                          : (amountInput ? formatIndianCurrency(amountInput) : '')
                      }
                      onFocus={() => setIsAmountFocused(true)}
                      onBlur={() => setIsAmountFocused(false)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/,/g, '');
                        if (/^\d*\.?\d*$/.test(raw)) setAmountInput(raw);
                      }}
                      className="w-full px-3 py-2 pl-7 font-black text-base bg-white dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                    <span className="absolute left-2.5 top-2.5 text-xs text-slate-400 font-bold">₹</span>
                  </div>
                </div>

                <div>
                  <FullCalendarPicker
                    label="Payment Date"
                    required
                    name="paymentDate"
                    value={paymentDate}
                    onChange={(val) => setPaymentDate(val)}
                    minYear={1990}
                    maxYear={3000}
                  />
                </div>
              </div>

              {/* ONE SUMMARY LINE: "Receiving Rs. X: applied to 2 invoices, Rs. 0 advance" */}
              {numEnteredAmountPaise > 0 && (
                <div className="p-2.5 rounded-lg bg-white dark:bg-[#141722] border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-900 dark:text-indigo-300 flex items-center justify-between">
                  <span>
                    {partyType === 'customer' ? 'Receiving' : 'Paying'} ₹{formatIndianCurrency(fromPaise(numEnteredAmountPaise))}: applied to {allocations.filter((a) => a.selected && toPaise(a.allocatedAmount) > 0).length} {partyType === 'customer' ? (allocations.filter((a) => a.selected && toPaise(a.allocatedAmount) > 0).length === 1 ? 'invoice' : 'invoices') : (allocations.filter((a) => a.selected && toPaise(a.allocatedAmount) > 0).length === 1 ? 'bill' : 'bills')}, ₹{formatIndianCurrency(surplusAmount)} advance
                  </span>
                </div>
              )}
            </div>

            {/* 2. Party Selector */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {partyType === 'customer' ? 'Select Customer *' : 'Select Supplier *'}
              </label>
              <StyledSelect
                value={selectedPartyId}
                onChange={(val) => {
                  setSelectedPartyId(val);
                  setAllocations([]);
                }}
                options={partyOptions}
                placeholder={partyType === 'customer' ? 'Search customer by name or GSTIN...' : 'Search supplier...'}
                searchable
                menuZIndex={150}
              />
            </div>

            {/* Party Balance Snapshot */}
            {selectedParty && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#131620] border border-slate-200 dark:border-[#2A3042] flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">Party Balance</span>
                  <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {isAdvanceBalance && allocations.length === 0 ? (
                      <span className="text-purple-600 dark:text-purple-400">
                        Advance Received: ₹{formatIndianCurrency(partyBalance)}
                      </span>
                    ) : (
                      <span>
                        Outstanding Balance: ₹{formatIndianCurrency(partyBalance)}{' '}
                        <span className="text-[11px] text-slate-400 uppercase">({balanceSide})</span>
                      </span>
                    )}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 font-mono">
                  {allocations.length} Open Invoices
                </span>
              </div>
            )}

            {/* 3. Method and Reference */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Payment Mode *
                </label>
                <StyledSelect
                  value={paymentMethod}
                  onChange={(val) => {
                    setPaymentMethod(val);
                    if (val === 'Cash') setReference('');
                  }}
                  options={methodOptions}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Reference / UTR / Cheque No.{' '}
                  {['NEFT', 'RTGS', 'UPI', 'Cheque'].includes(paymentMethod) && (
                    <span className="text-rose-500">*</span>
                  )}
                </label>
                <input
                  type="text"
                  name="crmPaymentTransactionReference"
                  id="crm-payment-transaction-reference"
                  autoComplete="one-time-code"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  disabled={paymentMethod === 'Cash'}
                  placeholder={
                    paymentMethod === 'Cash'
                      ? 'Not applicable for Cash payments'
                      : paymentMethod === 'UPI'
                      ? '12-digit UTR'
                      : paymentMethod === 'Cheque'
                      ? '6-digit Cheque No'
                      : '8 to 22 letters and digits'
                  }
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className={`w-full px-3 py-2 text-xs bg-white dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono ${
                    paymentMethod === 'Cash' ? 'opacity-60 cursor-not-allowed bg-slate-100 dark:bg-[#1f2333]' : ''
                  }`}
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  {getPaymentReferenceHint(paymentMethod)}
                </p>
              </div>
            </div>

            {/* 4. Company Bank Account (or in-place add) */}
            {paymentMethod !== 'Cash' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-bold text-slate-700 dark:text-slate-300">
                    Company Bank Account
                  </label>
                  <button
                    type="button"
                    onClick={handleAddBankAccountClick}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1"
                  >
                    + Add a bank account
                  </button>
                </div>
                {permissionDeniedMsg && (
                  <div className="mb-2 p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded-lg text-xs">
                    {permissionDeniedMsg}
                  </div>
                )}
                {bankAccountsList.length > 0 ? (
                  <StyledSelect
                    value={bankAccountId}
                    onChange={(val) => {
                      setBankAccountId(val);
                      const opt = bankAccountsList.find((b) => b.value === val);
                      if (opt) setBankAccount(opt.label);
                    }}
                    options={bankAccountsList}
                    placeholder="Select bank account..."
                  />
                ) : (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
                    <span>No company bank account configured.</span>
                    <button
                      type="button"
                      onClick={handleAddBankAccountClick}
                      className="font-bold underline text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
                    >
                      + Add a bank account now &rarr;
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 5. Open Invoices Allocation Section */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#2A3042]">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
                    Open Documents ({allocations.length})
                  </h4>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                    Click a row to toggle allocation. Sorted by date, due date, and document number.
                  </p>
                </div>
                {allocations.length > 0 && numEnteredAmountPaise > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoAllocateOldestFirst}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Auto-Allocate Oldest First
                  </button>
                )}
              </div>

              {loadingDocs ? (
                <div className="py-4 text-center text-xs text-slate-400">Loading open documents...</div>
              ) : allocations.length === 0 ? (
                <div className="p-3 bg-slate-50 dark:bg-[#131620] rounded-xl text-xs text-slate-500 text-center border border-slate-200 dark:border-[#2A3042]">
                  No unpaid documents found for this party. Total will be posted as an advance credit.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-[#2A3042]/50 max-h-56 overflow-y-auto">
                  {allocations.map((row) => (
                    <div
                      key={row.documentId}
                      onClick={() => handleToggleRow(row.documentId)}
                      className={`p-2.5 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors ${
                        row.selected
                          ? 'bg-indigo-50/60 dark:bg-indigo-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={() => {}}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer pointer-events-none"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold font-mono">{row.documentNumber}</span>
                            {row.docType === 'credit_note' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                Credit Note
                              </span>
                            )}
                          </div>
                          <div className="text-slate-400 text-[10.5px]">
                            Due: <span className="font-bold text-amber-600 dark:text-amber-400">₹{formatIndianCurrency(row.balanceDue)}</span>
                            {row.date && <span className="ml-2">Date: {formatDisplayDate(row.date)}</span>}
                            {row.dueDate && <span className="ml-2">Due: {formatDisplayDate(row.dueDate)}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] text-slate-400">Allocated:</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={row.balanceDue}
                          value={row.allocatedAmount || ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleAllocationAmountChange(row.documentId, e.target.value)}
                          placeholder="0.00"
                          className="w-24 px-2 py-1 text-right font-bold text-xs bg-white dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] rounded-lg font-mono"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Allocation Summary Bar */}
              {allocations.length > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 dark:bg-[#131620] border border-slate-200 dark:border-[#2A3042] text-xs font-semibold">
                  <span className="text-slate-500 dark:text-slate-400">Total Allocated:</span>
                  <div className="space-x-3">
                    <span className="font-bold font-mono">₹{formatIndianCurrency(totalAllocated)}</span>
                    {surplusPaise > 0 && (
                      <span className="text-purple-600 dark:text-purple-400 font-medium">
                        (Surplus Advance: ₹{formatIndianCurrency(surplusAmount)})
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 6. Allow Advance Payment Checkbox - ONLY when amount exceeds total open bills */}
            {fromPaise(numEnteredAmountPaise) > allocations.reduce((s, a) => s + (a.balanceDue || 0), 0) && (
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowAdvance}
                    onChange={(e) => setAllowAdvance(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-[11.5px] text-slate-700 dark:text-slate-300 font-medium">
                    Allow advance payment (Permits amount higher than currently open invoices)
                  </span>
                </label>
              </div>
            )}

            {/* 7. Internal Notes */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  Internal Notes / Narration
                </label>
                <span className="text-[10.5px] text-slate-400 dark:text-slate-500 font-medium">Optional</span>
              </div>
              <textarea
                rows={2}
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder="e.g. Received via NEFT on 28 Oct 2026"
                className="w-full px-3 py-2 text-xs bg-white dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] rounded-xl focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                Optional. Leave blank, or enter at least 5 meaningful characters if adding notes.
              </p>
            </div>

          </div>

          {/* Sticky Footer Actions */}
          <div className="shrink-0 sticky bottom-0 bg-white dark:bg-[#181B26] p-4 sm:p-5 border-t border-slate-200 dark:border-[#2A3042] flex items-center justify-end gap-3 z-10 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              id="payment-submit-btn"
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>Posting...</>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  {confirmDuplicate ? 'Confirm Duplicate & Post' : 'Confirm & Post Payment'}
                </>
              )}
            </button>
          </div>

        </form>

        {/* Modal: Confirmation for payment > ₹10,00,000 */}
        {showLargeAmountModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">Confirm Large Payment</h4>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                You are recording a high-value payment of <strong>₹{formatIndianCurrency(fromPaise(numEnteredAmountPaise))}</strong> (exceeds ₹10,00,000). Are you sure you want to proceed?
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLargeAmountModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmedLargeAmount(true);
                    setShowLargeAmountModal(false);
                    setTimeout(() => {
                      const btn = document.getElementById('payment-submit-btn');
                      btn?.click();
                    }, 50);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                >
                  Yes, Proceed
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Typed confirmation for payment > ₹1,00,00,000 */}
        {showTypedConfirmModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400">
                  <AlertOctagon className="w-5 h-5" />
                </span>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">High-Value Confirmation Required</h4>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                This transaction of <strong>₹{formatIndianCurrency(fromPaise(numEnteredAmountPaise))}</strong> exceeds ₹1,00,00,000 (1 Crore). To prevent accidental entries, please type <strong>CONFIRM</strong> below:
              </p>
              <input
                type="text"
                placeholder="Type CONFIRM"
                value={typedConfirmation}
                onChange={(e) => setTypedConfirmation(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl uppercase tracking-wider"
              />
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowTypedConfirmModal(false);
                    setTypedConfirmation('');
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={typedConfirmation !== 'CONFIRM'}
                  onClick={() => {
                    setShowTypedConfirmModal(false);
                    setTimeout(() => {
                      const btn = document.getElementById('payment-submit-btn');
                      btn?.click();
                    }, 50);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Confirm & Proceed
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Advance Confirmation when Open Invoices Exist */}
        {showAdvancePrompt && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">Open Invoices Exist</h4>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                This party owes <strong>₹{formatIndianCurrency(promptOpenInvoicesAmount)}</strong>. Apply to invoices instead?
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancePrompt(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmAdvanceOverride(true);
                    setShowAdvancePrompt(false);
                    handleSubmit(undefined, true);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:text-white"
                >
                  Post as Advance
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdvancePrompt(false);
                    handleAutoAllocateOldestFirst();
                  }}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                >
                  Apply to Invoices
                </button>
              </div>
            </div>
          </div>
        )}

        {/* In-Place Drawer / Modal: Add Bank Account */}
        {showAddBankModal && (
          <div className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  Add Company Bank Account
                </h4>
                <button
                  type="button"
                  onClick={() => setShowAddBankModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {newBankErrors.form && (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 rounded-lg text-xs">
                  {newBankErrors.form}
                </div>
              )}

              <form onSubmit={handleSaveNewBankAccount} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Bank Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HDFC Bank"
                    value={newBankForm.bankName}
                    onChange={(e) => setNewBankForm({ ...newBankForm, bankName: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                  {newBankErrors.bankName && <p className="text-rose-500 text-[10px] mt-0.5">{newBankErrors.bankName}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Account Number *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="9-18 digits"
                      value={newBankForm.accountNumber}
                      onChange={(e) => setNewBankForm({ ...newBankForm, accountNumber: e.target.value })}
                      className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                    {newBankErrors.accountNumber && <p className="text-rose-500 text-[10px] mt-0.5">{newBankErrors.accountNumber}</p>}
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      IFSC Code *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="11 characters (e.g. HDFC0001234)"
                      value={newBankForm.ifsc}
                      onChange={(e) => setNewBankForm({ ...newBankForm, ifsc: e.target.value.toUpperCase() })}
                      className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono uppercase"
                    />
                    {newBankErrors.ifsc && <p className="text-rose-500 text-[10px] mt-0.5">{newBankErrors.ifsc}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Branch Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Koramangala"
                      value={newBankForm.branch}
                      onChange={(e) => setNewBankForm({ ...newBankForm, branch: e.target.value })}
                      className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      UPI ID (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. company@okhdfcbank"
                      value={newBankForm.upiId}
                      onChange={(e) => setNewBankForm({ ...newBankForm, upiId: e.target.value })}
                      className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                    {newBankErrors.upiId && <p className="text-rose-500 text-[10px] mt-0.5">{newBankErrors.upiId}</p>}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Account Holder Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Enterprises Pvt Ltd"
                    value={newBankForm.holderName}
                    onChange={(e) => setNewBankForm({ ...newBankForm, holderName: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddBankModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingNewBank}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50"
                  >
                    {savingNewBank ? 'Saving...' : 'Save & Select Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
