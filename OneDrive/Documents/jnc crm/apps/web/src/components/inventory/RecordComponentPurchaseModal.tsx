import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  ShoppingCart,
  Upload,
  X,
  FileText,
  Image as ImageIcon,
  Building2,
  Calendar,
  DollarSign,
  Receipt,
  Layers,
  CheckCircle2,
  Percent,
  Trash2,
  Boxes,
  IndianRupee,
} from 'lucide-react';
import { inventoryApi } from '../../services/api';

interface RecordComponentPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingProjects: string[];
  onSuccess: () => void;
}

export const RecordComponentPurchaseModal: React.FC<RecordComponentPurchaseModalProps> = ({
  isOpen,
  onClose,
  existingProjects,
  onSuccess,
}) => {
  const [componentName, setComponentName] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [project, setProject] = useState(existingProjects[0] || 'General Inventory');
  const [customProject, setCustomProject] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState('Nos');
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(18);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');

  // GST Document / Invoice File Upload
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentDataUrl, setDocumentDataUrl] = useState<string>('');
  const [documentName, setDocumentName] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Realtime GST Calculations
  const effectiveProject = project === '__custom__' ? customProject.trim() : project;
  const qty = Number(quantity) || 0;
  const baseRate = Number(unitPrice) || 0;
  const baseAmount = Number((qty * baseRate).toFixed(2));
  const gstAmount = Number(((baseAmount * taxRate) / 100).toFixed(2));
  const grandTotal = Number((baseAmount + gstAmount).toFixed(2));

  // Handle File Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be under 10MB');
      return;
    }

    setDocumentFile(file);
    setDocumentName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      setDocumentDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveDocument = () => {
    setDocumentFile(null);
    setDocumentDataUrl('');
    setDocumentName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!componentName.trim()) {
      setError('Please enter a Component Name');
      return;
    }
    if (!effectiveProject) {
      setError('Please select or specify a Project');
      return;
    }
    if (qty <= 0) {
      setError('Please enter a quantity greater than 0');
      return;
    }

    setSaving(true);
    setError(null);

    const generatedSku =
      skuCode.trim() ||
      componentName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 16);

    try {
      // 1. Create or ensure SKU exists in Catalog
      try {
        await inventoryApi.createSku({
          skuCode: generatedSku,
          name: componentName.trim(),
          category: effectiveProject.split(' ')[0] || 'General',
          unitPrice: baseRate,
          costPrice: baseRate,
          taxRate: taxRate,
          packageType: unit,
          reorderPoint: Math.max(5, Math.floor(qty * 0.2)),
          reorderQty: qty,
        });
      } catch (skuErr) {
        // Ignore if SKU code already exists, we will update stock position
      }

      // 2. Create Project Stock Position
      const purchaseNote = `Purchased ${qty} ${unit} from ${
        supplierName.trim() || 'Supplier'
      } (GST: ${taxRate}%, Inv: ${invoiceNumber.trim() || 'N/A'}, Total: ₹${grandTotal.toLocaleString(
        'en-IN'
      )})`;

      await inventoryApi.createProjectStockPosition({
        project: effectiveProject,
        reference: `PUR-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
        quantity: qty,
        itemCode: generatedSku,
        partValue: componentName.trim(),
        package: unit,
        unit: unit,
        bomQtyPerUnit: 1,
        batchQty: qty,
        plannedRequirement: qty,
        openingStock: 0,
        inflow: qty,
        outflow: 0,
        notes: notes.trim() ? `${notes.trim()} | ${purchaseNote}` : purchaseNote,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save component and purchase');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          className="bg-white dark:bg-[#181B26] border border-slate-300 dark:border-[#2A3042] rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        >
          {/* Modal Header */}
          <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-600/10 dark:bg-crm-blue/20 text-blue-600 dark:text-crm-blue flex items-center justify-center border border-blue-500/20 shadow-sm">
                <Boxes size={18} />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-slate-950 dark:text-white">
                  Add Component & Record Purchase
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Track stock, assign to a project, and record purchase invoice with GST
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form Content */}
          <form id="record-purchase-form" onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-red-500/10 border border-rose-200 dark:border-red-500/30 text-xs text-rose-700 dark:text-rose-300 font-medium">
                {error}
              </div>
            )}

            {/* Row 1: Component Name & SKU */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                  COMPONENT / ITEM NAME <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter item or component name"
                  value={componentName}
                  onChange={(e) => {
                    setComponentName(e.target.value);
                    if (!skuCode) {
                      setSkuCode(
                        e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 16)
                      );
                    }
                  }}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                  SKU / ITEM CODE
                </label>
                <input
                  type="text"
                  placeholder="e.g. SKU-001"
                  value={skuCode}
                  onChange={(e) => setSkuCode(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Row 2: Loaded For / Project & Supplier */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                  <span className="inline-flex items-center gap-1 text-blue-600 dark:text-crm-blue">
                    <Layers size={13} />
                    LOADED FOR / PROJECT NAME <span className="text-red-500">*</span>
                  </span>
                </label>
                <select
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {existingProjects.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value="General Inventory">General Inventory</option>
                  <option value="Standard Production">Standard Production</option>
                  <option value="__custom__">+ Add New Custom Project...</option>
                </select>
                {project === '__custom__' && (
                  <input
                    type="text"
                    required
                    placeholder="Type project name..."
                    value={customProject}
                    onChange={(e) => setCustomProject(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white mt-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Building2 size={13} />
                    BOUGHT FROM / SUPPLIER
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="Enter supplier name"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Row 3: Quantity, Unit, Unit Price, GST % */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 dark:bg-[#141722] p-3 rounded-xl border border-slate-300 dark:border-[#2A3042]">
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase">
                  Unit
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Nos">Nos</option>
                  <option value="Pcs">Pcs</option>
                  <option value="Mtrs">Mtrs</option>
                  <option value="Sets">Sets</option>
                  <option value="Drums">Drums</option>
                </select>
              </div>

              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase">
                  Base Rate (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase">
                  <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                    <Percent size={10} /> GST Rate
                  </span>
                </label>
                <select
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-amber-700 dark:text-amber-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="0">0% (Exempt)</option>
                  <option value="5">5% GST</option>
                  <option value="12">12% GST</option>
                  <option value="18">18% GST (Standard)</option>
                  <option value="28">28% GST</option>
                </select>
              </div>
            </div>

            {/* Live Auto-Calculated GST Summary Box */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-300 dark:border-blue-500/30 grid grid-cols-3 gap-2 text-center">
              <div className="bg-white dark:bg-[#1E2230] p-2 rounded-lg border border-slate-200 dark:border-white/5 shadow-xs">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase tracking-wider">
                  Base Amount
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm">
                  ₹{baseAmount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="bg-amber-50 dark:bg-amber-500/10 p-2 rounded-lg border border-amber-200 dark:border-amber-500/30 shadow-xs">
                <span className="text-[10px] text-amber-700 dark:text-amber-400 block font-bold uppercase tracking-wider">
                  GST ({taxRate}%)
                </span>
                <span className="font-mono font-bold text-amber-700 dark:text-amber-300 text-sm">
                  + ₹{gstAmount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-500/10 p-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30 shadow-xs">
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block font-black uppercase tracking-wider">
                  Total with GST
                </span>
                <span className="font-mono font-black text-emerald-700 dark:text-emerald-300 text-sm">
                  ₹{grandTotal.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Row 4: Invoice No & GST Bill / Image Upload */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                  <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                    <Receipt size={13} />
                    SUPPLIER INVOICE / BILL NO
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-001"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                  <span className="inline-flex items-center gap-1 text-blue-600 dark:text-crm-blue">
                    <Upload size={13} />
                    ATTACH GST BILL / INVOICE IMAGE
                  </span>
                </label>
                {!documentDataUrl ? (
                  <label className="border border-dashed border-slate-300 dark:border-[#2A3042] hover:border-blue-500 rounded-lg p-2 flex items-center justify-center gap-2 cursor-pointer bg-white dark:bg-[#1E2230] hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                    <ImageIcon size={14} className="text-slate-400" />
                    <span>Upload JPG / PNG / PDF</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="flex items-center justify-between p-1.5 px-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="text-emerald-800 dark:text-emerald-300 font-medium truncate">
                        {documentName}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveDocument}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                      title="Remove file"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Row 5: Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                PROCUREMENT REMARKS / NOTES
              </label>
              <input
                type="text"
                placeholder="Enter remarks or notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </form>

          {/* Fixed Footer Buttons */}
          <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="record-purchase-form"
              disabled={saving}
              className="px-5 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {saving ? (
                <span>Saving Component & Purchase...</span>
              ) : (
                <>
                  <Plus size={14} />
                  <span>Save Component to Stock</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
