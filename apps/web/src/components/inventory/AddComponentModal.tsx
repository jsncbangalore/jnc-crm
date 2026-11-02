import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Boxes,
  X,
  Layers,
  Building2,
  Tag,
  Percent,
} from 'lucide-react';
import { inventoryApi } from '../../services/api';

interface AddComponentModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingProjects: string[];
  onSuccess: () => void;
}

export const AddComponentModal: React.FC<AddComponentModalProps> = ({
  isOpen,
  onClose,
  existingProjects,
  onSuccess,
}) => {
  const [componentName, setComponentName] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [project, setProject] = useState(existingProjects[0] || '');
  const [customProject, setCustomProject] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [unit, setUnit] = useState('Nos');
  const [openingStock, setOpeningStock] = useState<number>(0);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(18);
  const [reorderPoint, setReorderPoint] = useState<number>(0);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const effectiveProject = project === '__custom__' ? customProject.trim() : project;

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

    setSaving(true);
    setError(null);

    const generatedSku =
      skuCode.trim() ||
      componentName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 16);

    try {
      // 1. Create SKU in Catalog
      try {
        await inventoryApi.createSku({
          skuCode: generatedSku,
          name: componentName.trim(),
          category: effectiveProject.split(' ')[0] || 'PA System',
          unitPrice: Number(unitPrice) || 0,
          costPrice: Number(unitPrice) || 0,
          taxRate: Number(taxRate) || 18,
          packageType: unit,
          reorderPoint: Number(reorderPoint) || 5,
          reorderQty: Math.max(10, Number(reorderPoint) * 2),
        });
      } catch (skuErr) {
        // Ignore if already exists
      }

      // 2. Create Project Stock Position
      await inventoryApi.createProjectStockPosition({
        project: effectiveProject,
        reference: `COMP-${Date.now().toString().slice(-4)}`,
        quantity: 1,
        itemCode: generatedSku,
        partValue: componentName.trim(),
        package: unit,
        unit: unit,
        bomQtyPerUnit: 1,
        batchQty: 1,
        plannedRequirement: Math.max(1, Number(reorderPoint)),
        openingStock: Number(openingStock) || 0,
        inflow: 0,
        outflow: 0,
        notes: supplierName.trim() ? `Preferred Supplier: ${supplierName.trim()}` : '',
      });

      // Reset form
      setComponentName('');
      setSkuCode('');
      setOpeningStock(0);
      setSupplierName('');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to add component');
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
                <Boxes size={18} />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-slate-950 dark:text-white">
                  Add Single Component
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Register a new component and assign it to a project
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
          <form id="add-component-form" onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-red-500/10 border border-rose-200 dark:border-red-500/30 text-xs text-rose-700 dark:text-rose-300 font-medium">
                {error}
              </div>
            )}

            {/* Component Name & SKU */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                  COMPONENT NAME <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter component name"
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
                  placeholder="Enter SKU / Item Code"
                  value={skuCode}
                  onChange={(e) => setSkuCode(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Project & Supplier */}
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
                  <option value="__custom__">+ Add New Custom Project...</option>
                </select>
                {project === '__custom__' && (
                  <input
                    type="text"
                    required
                    placeholder="Enter project name..."
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
                    PREFERRED SUPPLIER / BRAND
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="Enter supplier / brand"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Opening Stock, Unit, Price, GST % */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 dark:bg-[#141722] p-3 rounded-xl border border-slate-300 dark:border-[#2A3042]">
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase">
                  Initial Stock
                </label>
                <input
                  type="number"
                  min="0"
                  value={openingStock}
                  onChange={(e) => setOpeningStock(Number(e.target.value))}
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
                  <option value="0">0% GST</option>
                  <option value="5">5% GST</option>
                  <option value="12">12% GST</option>
                  <option value="18">18% GST (Standard)</option>
                  <option value="28">28% GST</option>
                </select>
              </div>
            </div>

            {/* Reorder Point */}
            <div>
              <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                REORDER / MINIMUM ALERT POINT
              </label>
              <input
                type="number"
                min="1"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              form="add-component-form"
              disabled={saving}
              className="px-5 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {saving ? (
                <span>Saving Component...</span>
              ) : (
                <>
                  <Plus size={14} />
                  <span>Add to Inventory</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
