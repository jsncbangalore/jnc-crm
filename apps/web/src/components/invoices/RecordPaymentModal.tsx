import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  X,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { invoicesApi, ordersApi } from '../../services/api';
import FullCalendarPicker from '../common/FullCalendarPicker';
import { parseApiError, ParsedApiError } from '../../utils/errorHelper';
import FormErrorBanner from '../common/FormErrorBanner';
import { validatePaymentReference, getPaymentReferenceHint } from '@crm/shared-validation';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice?: any;
  order?: any;
  onSuccess: (updatedRecord: any) => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  invoice,
  order,
  onSuccess,
}) => {
  const doc = invoice || order;
  const isInvoice = !!invoice;
  const totalAmount = doc?.totalAmount || 0;
  
  // Calculate existing paid and remaining balance
  const existingPaid = isInvoice
    ? (doc?.advanceAdjusted || 0)
    : (doc?.paidAmount || 0);

  const currentBalance = isInvoice
    ? (doc?.balanceDue !== undefined && doc?.balanceDue !== null ? doc.balanceDue : Math.max(0, totalAmount - existingPaid))
    : (doc?.balanceAmount !== undefined && doc?.balanceAmount !== null ? doc.balanceAmount : Math.max(0, totalAmount - existingPaid));

  const recommendedAdvance = doc?.advanceAmount || Math.round(totalAmount * 0.5);

  const [amount, setAmount] = useState<number | string>(
    currentBalance > 0 ? (doc?.docType === 'proforma_invoice' ? recommendedAdvance : currentBalance) : totalAmount
  );
  const [paymentType, setPaymentType] = useState<string>(
    doc?.docType === 'proforma_invoice' ? 'advance' : currentBalance <= (Number(amount) || 0) ? 'final_settlement' : 'milestone'
  );
  const [paymentMethod, setPaymentMethod] = useState<string>('NEFT');
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<ParsedApiError | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState<boolean>(false);

  if (!isOpen || !doc) return null;

  const numAmount = Number(amount) || 0;
  const remainingAfterPayment = Math.max(0, currentBalance - numAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) {
      setError('Please enter a valid payment amount greater than ₹0.');
      return;
    }

    const refCheck = validatePaymentReference(paymentMethod, transactionRef);
    if (!refCheck.valid) {
      setError(refCheck.error || `Invalid reference for ${paymentMethod} payments.`);
      return;
    }

    setLoading(true);
    setError(null);
    setApiError(null);

    try {
      const payload = {
        amount: numAmount,
        paymentType,
        paymentMethod,
        transactionRef: transactionRef.trim() || undefined,
        paymentDate,
        notes: notes.trim() || undefined,
        confirmDuplicate,
      };

      let res;
      if (isInvoice) {
        res = await invoicesApi.recordPayment(doc.id, payload);
      } else {
        res = await ordersApi.recordPayment(doc.id, payload);
      }

      onSuccess(res.data);
      onClose();
    } catch (err: any) {
      const parsed = parseApiError(err);
      setApiError(parsed);
      const status = parsed.statusCode;
      const code = parsed.code;
      const msg = parsed.message;
      if (
        status === 409 ||
        code === 'DUPLICATE_PAYMENT_REFERENCE' ||
        msg.toLowerCase().includes('duplicate') ||
        msg.toLowerCase().includes('already exists')
      ) {
        setDuplicateWarning(msg);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-lg max-h-[min(680px,92vh)] flex flex-col shadow-2xl overflow-hidden my-auto"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <CreditCard size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-950 dark:text-white flex items-center gap-2">
                  <span>Record Payment Receipt</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                  {isInvoice ? 'Invoice' : 'Order'} #{doc.invoiceNumber || doc.orderNumber} • Total: ₹{totalAmount.toLocaleString('en-IN')}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
            <FormErrorBanner
              error={apiError || error}
              onDismiss={() => {
                setApiError(null);
                setError(null);
              }}
            />

            {duplicateWarning && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-crm-amber text-xs space-y-2">
                <div className="flex items-start gap-2 font-medium">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{duplicateWarning}</span>
                </div>
                <label className="flex items-center gap-2 font-bold cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={confirmDuplicate}
                    onChange={(e) => setConfirmDuplicate(e.target.checked)}
                    className="rounded border-amber-400 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Confirm: Proceed with intentional duplicate payment reference (UTR)</span>
                </label>
              </div>
            )}

            {/* Overview Card */}
            <div className="grid grid-cols-3 gap-2 p-3 bg-slate-100 dark:bg-[#12151E] rounded-xl border border-slate-200 dark:border-[#2A3042] text-center">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">Total</span>
                <p className="text-xs font-mono font-bold text-slate-900 dark:text-white mt-0.5">₹{totalAmount.toLocaleString('en-IN')}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">Already Paid</span>
                <p className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">₹{existingPaid.toLocaleString('en-IN')}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">Balance Due</span>
                <p className="text-xs font-mono font-bold text-amber-600 dark:text-crm-amber mt-0.5">₹{currentBalance.toLocaleString('en-IN')}</p>
              </div>
            </div>

            {/* Quick Amount Selector Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Quick Presets</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAmount(recommendedAdvance);
                    setPaymentType('advance');
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-[#222738] hover:bg-slate-200 dark:hover:bg-[#2D3349] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-[#343B52] transition-colors"
                >
                  50% Advance (₹{recommendedAdvance.toLocaleString('en-IN')})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAmount(currentBalance);
                    setPaymentType('final_settlement');
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-[#222738] hover:bg-slate-200 dark:hover:bg-[#2D3349] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-[#343B52] transition-colors"
                >
                  Full Balance (₹{currentBalance.toLocaleString('en-IN')})
                </button>
              </div>
            </div>

            {/* Amount & Payment Type Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Amount Received (₹) <span className="text-crm-coral">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-500 dark:text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className="w-full pl-7 pr-3 py-2 bg-white dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] rounded-xl text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Payment Stage / Type
                </label>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="advance">Advance Payment</option>
                  <option value="milestone">Milestone Installment</option>
                  <option value="final_settlement">Final Balance Settlement</option>
                  <option value="full_payment">100% Full Payment</option>
                </select>
              </div>
            </div>

            {/* Payment Method & Transaction Reference Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Payment Mode
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => {
                    setPaymentMethod(e.target.value);
                    if (e.target.value === 'Cash') setTransactionRef('');
                  }}
                  className="w-full px-3 py-2 bg-white dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="NEFT">Bank NEFT</option>
                  <option value="RTGS">Bank RTGS</option>
                  <option value="IMPS">Bank IMPS</option>
                  <option value="UPI">UPI / QR Transfer</option>
                  <option value="Cheque">Bank Cheque</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  UTR / Transaction / Cheque No.{' '}
                  {['NEFT', 'RTGS', 'UPI', 'Cheque'].includes(paymentMethod) && (
                    <span className="text-rose-500">*</span>
                  )}
                </label>
                <input
                  type="text"
                  disabled={paymentMethod === 'Cash'}
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  className={`w-full px-3 py-2 bg-white dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] rounded-xl text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 ${
                    paymentMethod === 'Cash' ? 'opacity-60 cursor-not-allowed bg-slate-100 dark:bg-[#1f2333]' : ''
                  }`}
                  placeholder={
                    paymentMethod === 'Cash'
                      ? 'Not applicable for Cash payments'
                      : paymentMethod === 'UPI'
                      ? '12-digit UTR'
                      : paymentMethod === 'Cheque'
                      ? '6-digit Cheque No'
                      : '8 to 22 letters and digits'
                  }
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  {getPaymentReferenceHint(paymentMethod)}
                </p>
              </div>
            </div>

            {/* Payment Date & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FullCalendarPicker
                label="Payment Date"
                value={paymentDate}
                onChange={(val) => setPaymentDate(val)}
                minYear={1990}
                maxYear={3000}
              />

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Remarks / Narration
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                  placeholder="e.g. Advance credited to Karnataka Bank"
                />
              </div>
            </div>

            {/* Realtime Remaining Calculation */}
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl flex justify-between items-center text-xs">
              <span className="text-slate-800 dark:text-slate-200 font-semibold flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
                Remaining Balance after this payment:
              </span>
              <span className={`font-mono font-bold text-sm ${remainingAfterPayment === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-crm-amber'}`}>
                ₹{remainingAfterPayment.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Modal Footer Actions */}
            <div className="sticky bottom-0 bg-white dark:bg-[#181B26] p-4 -mx-5 -mb-5 border-t border-slate-200 dark:border-[#2A3042] flex justify-end gap-3 shrink-0 z-10 shadow-xs">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white rounded-xl hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || numAmount <= 0}
                className="px-5 py-2 text-xs font-bold text-black bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <>
                    <span>Confirm & Record Receipt</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
