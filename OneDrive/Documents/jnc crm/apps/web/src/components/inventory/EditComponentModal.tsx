import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Edit3,
  Boxes,
  X,
  Layers,
  Building2,
  Percent,
  Check,
  Zap,
} from 'lucide-react';
import { inventoryApi } from '../../services/api';
import { ValidationErrorPanel } from '../common/ValidationErrorPanel';
import {
  parseValidationErrors,
  ParsedValidationError,
  jumpToErrorField,
} from '../../utils/validationErrorHandler';

interface EditComponentModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any | null;
  existingProjects: string[];
  onSuccess: () => void;
  onOpenRestock?: (item: any) => void;
}

export const EditComponentModal: React.FC<EditComponentModalProps> = ({
  isOpen,
  onClose,
  item,
  existingProjects,
  onSuccess,
  onOpenRestock,
}) => {
  const [componentName, setComponentName] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [project, setProject] = useState('');
  const [customProject, setCustomProject] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [unit, setUnit] = useState('Nos');
  const [openingStock, setOpeningStock] = useState<number | string>(0);
  const [unitPrice, setUnitPrice] = useState<number | string>(0);
  const [taxRate, setTaxRate] = useState<number>(18);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ParsedValidationError[]>([]);

  useEffect(() => {
    if (item) {
      setComponentName(item.name || item.partValue || '');
      setSkuCode(item.skuCode || item.itemCode || '');
      setProject(item.project || existingProjects[0] || 'PA System Integration');
      setSupplierName(item.supplier || '');
      setUnit(item.unit || 'Nos');
      setOpeningStock(Number(item.quantityOnHand ?? item.presentStock ?? 0));
      setUnitPrice(Number(item.unitPrice || 0));
      setTaxRate(Number(item.taxRate ?? 18));
      setValidationErrors([]);
    }
  }, [item, existingProjects]);

  if (!isOpen || !item) return null;

  const effectiveProject = project === '__custom__' ? customProject.trim() : project;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!componentName.trim()) {
      setValidationErrors([
        {
          id: 'err-comp-name',
          fieldKey: 'componentName',
          fieldLabel: 'Component Name',
          domId: 'edit-comp-name',
          humanMsg: 'Please enter a Component Name. This field cannot be left blank.',
          rawMessage: 'Component Name is required',
        },
      ]);
      jumpToErrorField('edit-comp-name');
      return;
    }

    setSaving(true);
    setValidationErrors([]);

    try {
      // 1. Update SKU if exists
      if (item.skuId) {
        await inventoryApi.updateSku(item.skuId, {
          name: componentName.trim(),
          unitPrice: Number(unitPrice) || 0,
          costPrice: Number(unitPrice) || 0,
          taxRate: Number(taxRate) || 18,
          packageType: unit,
          supplierName: supplierName.trim() || undefined,
        });
      }

      // 2. Update Project Stock Position if exists
      if (item.positionId) {
        await inventoryApi.updateProjectStockPosition(item.positionId, {
          project: effectiveProject || item.project,
          partValue: componentName.trim(),
          unit: unit,
          openingStock: Number(openingStock) || 0,
          presentStock: Number(openingStock) || 0,
          notes: supplierName.trim() ? `Supplier: ${supplierName.trim()}` : item.notes,
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      const parsed = parseValidationErrors(err, {
        componentName: { label: 'Component Name', id: 'edit-comp-name' },
        name: { label: 'Component Name', id: 'edit-comp-name' },
        partValue: { label: 'Component Name', id: 'edit-comp-name' },
        project: { label: 'Project Name', id: 'edit-comp-project' },
        supplierName: { label: 'Supplier Name', id: 'edit-comp-supplier' },
        supplier: { label: 'Supplier Name', id: 'edit-comp-supplier' },
        unit: { label: 'Unit', id: 'edit-comp-unit' },
        openingStock: { label: 'On-Hand Stock', id: 'edit-comp-stock' },
        quantityOnHand: { label: 'On-Hand Stock', id: 'edit-comp-stock' },
        presentStock: { label: 'On-Hand Stock', id: 'edit-comp-stock' },
        unitPrice: { label: 'Base Rate (₹)', id: 'edit-comp-price' },
        price: { label: 'Base Rate (₹)', id: 'edit-comp-price' },
        costPrice: { label: 'Cost Price (₹)', id: 'edit-comp-price' },
        taxRate: { label: 'GST Rate', id: 'edit-comp-tax' },
      });
      setValidationErrors(parsed);
      if (parsed.length > 0 && parsed[0].domId) {
        setTimeout(() => jumpToErrorField(parsed[0].domId), 100);
      }
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
          className="bg-white dark:bg-[#181B26] border border-slate-300 dark:border-[#2A3042] rounded-2xl w-full max-w-xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-600/10 dark:bg-crm-blue/20 text-blue-600 dark:text-crm-blue flex items-center justify-center border border-blue-500/20 shadow-sm">
                <Edit3 size={18} />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-slate-950 dark:text-white">
                  Edit Component
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Update SKU code, project attribution, stock, and pricing
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

          {/* Form */}
          <form id="edit-component-form" onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1">
            {validationErrors.length > 0 && (
              <ValidationErrorPanel
                errors={validationErrors}
                onClear={() => setValidationErrors([])}
              />
            )}

            {/* Component Name & SKU */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1" htmlFor="edit-comp-name">
                  COMPONENT NAME <span className="text-red-500">*</span>
                </label>
                <input
                  id="edit-comp-name"
                  type="text"
                  required
                  value={componentName}
                  onChange={(e) => setComponentName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1" htmlFor="edit-comp-skucode">
                  SKU / ITEM CODE
                </label>
                <input
                  id="edit-comp-skucode"
                  type="text"
                  disabled
                  value={skuCode}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-[#2A3042] bg-slate-100 dark:bg-black/40 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Project & Supplier */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1" htmlFor="edit-comp-project">
                  <span className="inline-flex items-center gap-1 text-blue-600 dark:text-crm-blue">
                    <Layers size={13} />
                    LOADED FOR / PROJECT NAME
                  </span>
                </label>
                <select
                  id="edit-comp-project"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {existingProjects.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value="__custom__">+ Add Custom Project...</option>
                </select>
                {project === '__custom__' && (
                  <input
                    id="edit-comp-custom-project"
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
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1" htmlFor="edit-comp-supplier">
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Building2 size={13} />
                    SUPPLIER / BOUGHT FROM
                  </span>
                </label>
                <input
                  id="edit-comp-supplier"
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Stock, Unit, Price, GST % */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 dark:bg-[#141722] p-3 rounded-xl border border-slate-300 dark:border-[#2A3042]">
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase" htmlFor="edit-comp-stock">
                  On-Hand Stock
                </label>
                <input
                  id="edit-comp-stock"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={openingStock === 0 || openingStock === '0' ? '' : openingStock}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setOpeningStock('');
                    } else {
                      setOpeningStock(raw.replace(/^0+([1-9])/, '$1'));
                    }
                  }}
                  onBlur={() => {
                    if (openingStock === '') setOpeningStock(0);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase" htmlFor="edit-comp-unit">
                  Unit
                </label>
                <select
                  id="edit-comp-unit"
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
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase" htmlFor="edit-comp-price">
                  Base Rate (₹)
                </label>
                <input
                  id="edit-comp-price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={unitPrice === 0 || unitPrice === '0' ? '' : unitPrice}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setUnitPrice('');
                    } else {
                      setUnitPrice(raw.replace(/^0+([1-9])/, '$1'));
                    }
                  }}
                  onBlur={() => {
                    if (unitPrice === '') setUnitPrice(0);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase" htmlFor="edit-comp-tax">
                  <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                    <Percent size={10} /> GST Rate
                  </span>
                </label>
                <select
                  id="edit-comp-tax"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-amber-700 dark:text-amber-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="0">0% GST</option>
                  <option value="5">5% GST</option>
                  <option value="12">12% GST</option>
                  <option value="18">18% GST (Standard)</option>
                  <option value="28">28% GST</option>
                </select>
              </div>
            </div>
          </form>

          {/* Fixed Footer Buttons */}
          <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
            <div>
              {onOpenRestock && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenRestock(item);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-600/20 hover:bg-emerald-100 dark:hover:bg-emerald-600/30 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                  title="Open dedicated batch replenishment modal"
                >
                  <Zap size={13} className="fill-emerald-600 dark:fill-emerald-400" />
                  <span>+ Restock Batch</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
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
                form="edit-component-form"
                disabled={saving}
                className="px-5 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {saving ? (
                  <span>Updating Component...</span>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
