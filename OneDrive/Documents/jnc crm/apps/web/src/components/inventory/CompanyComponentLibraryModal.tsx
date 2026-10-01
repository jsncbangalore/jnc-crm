import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Boxes,
  Search,
  Check,
  X,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Sparkles,
  ArrowRight,
  Filter,
  Package,
} from 'lucide-react';
import { Sku } from '../../types';
import { inventoryApi } from '../../services/api';

interface CompanyComponentLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  skus: Sku[];
  projectsList: string[];
  defaultProject?: string;
  onAddedSuccess: () => void;
}

export const CompanyComponentLibraryModal: React.FC<CompanyComponentLibraryModalProps> = ({
  isOpen,
  onClose,
  skus,
  projectsList,
  defaultProject,
  onAddedSuccess,
}) => {
  const [targetProject, setTargetProject] = useState<string>(
    defaultProject && defaultProject !== 'all' ? defaultProject : (projectsList[0] || '2 CTBS- 20 Zone -Controller')
  );
  const [customProject, setCustomProject] = useState<string>('');
  const [isNewProject, setIsNewProject] = useState<boolean>(false);
  const [batchQty, setBatchQty] = useState<number>(1);
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Selected SKU IDs and their individual BOM configurations
  const [selectedSkuIds, setSelectedSkuIds] = useState<Record<string, boolean>>({});
  const [skuConfigs, setSkuConfigs] = useState<Record<string, { bomQty: number; tag: string }>>({});

  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    skus.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set);
  }, [skus]);

  // Filtered SKUs
  const filteredSkus = useMemo(() => {
    return skus.filter((sku) => {
      const matchesSearch =
        !search ||
        sku.skuCode.toLowerCase().includes(search.toLowerCase()) ||
        sku.name.toLowerCase().includes(search.toLowerCase()) ||
        (sku.packageType && sku.packageType.toLowerCase().includes(search.toLowerCase()));

      const matchesCat = selectedCategory === 'all' || sku.category === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [skus, search, selectedCategory]);

  const selectedCount = Object.values(selectedSkuIds).filter(Boolean).length;

  const toggleSelectAll = () => {
    if (selectedCount === filteredSkus.length && filteredSkus.length > 0) {
      // Deselect all filtered
      const next = { ...selectedSkuIds };
      filteredSkus.forEach((s) => delete next[s.id]);
      setSelectedSkuIds(next);
    } else {
      // Select all filtered
      const next = { ...selectedSkuIds };
      const nextConfigs = { ...skuConfigs };
      filteredSkus.forEach((s, idx) => {
        next[s.id] = true;
        if (!nextConfigs[s.id]) {
          nextConfigs[s.id] = { bomQty: 1, tag: String(idx + 1) };
        }
      });
      setSelectedSkuIds(next);
      setSkuConfigs(nextConfigs);
    }
  };

  const toggleSkuSelection = (sku: Sku) => {
    const isSelected = !!selectedSkuIds[sku.id];
    const next = { ...selectedSkuIds, [sku.id]: !isSelected };
    setSelectedSkuIds(next);

    if (!isSelected && !skuConfigs[sku.id]) {
      setSkuConfigs((prev) => ({
        ...prev,
        [sku.id]: { bomQty: 1, tag: '-' },
      }));
    }
  };

  const updateSkuConfig = (skuId: string, field: 'bomQty' | 'tag', value: any) => {
    setSkuConfigs((prev) => ({
      ...prev,
      [skuId]: {
        bomQty: field === 'bomQty' ? Number(value) || 1 : (prev[skuId]?.bomQty || 1),
        tag: field === 'tag' ? String(value) : (prev[skuId]?.tag || '-'),
      },
    }));
  };

  const handleAddSelectedToProject = async () => {
    const finalProjectName = isNewProject ? customProject.trim() : targetProject.trim();
    if (!finalProjectName) {
      setError('Please select or specify a project name');
      return;
    }

    const selectedList = skus.filter((s) => selectedSkuIds[s.id]);
    if (selectedList.length === 0) {
      setError('Please select at least 1 component to add to the project');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const rows = selectedList.map((sku) => {
        const cfg = skuConfigs[sku.id] || { bomQty: 1, tag: '-' };
        const bomQtyPerUnit = cfg.bomQty || 1;
        const currentBatch = Number(batchQty) || 1;
        const plannedReq = bomQtyPerUnit * currentBatch;
        const presentStock = Number(sku.totalOnHand) || 0;
        const shortage = Math.max(0, plannedReq - presentStock);

        let status = 'Sufficient';
        if (shortage > 0 && presentStock === 0) {
          status = 'Critical Shortage';
        } else if (shortage > 0) {
          status = 'Shortage';
        } else if (presentStock >= plannedReq * 1.5) {
          status = 'Surplus';
        }

        return {
          project: finalProjectName,
          reference: cfg.tag || '-',
          quantity: currentBatch,
          itemCode: sku.skuCode,
          partValue: sku.name,
          package: sku.packageType || 'TH',
          unit: 'Nos',
          bomQtyPerUnit,
          batchQty: currentBatch,
          plannedRequirement: plannedReq,
          openingStock: presentStock,
          inflow: 0,
          outflow: 0,
          presentStock,
          shortage,
          status,
          notes: `Imported from Company Component Catalog (${sku.category || 'General'})`,
        };
      });

      await inventoryApi.bulkImportProjectStock(rows);
      onAddedSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to add components to project stock');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-crm-blue/20 text-crm-blue-light flex items-center justify-center border border-crm-blue/30 shadow-glow-blue">
                <Boxes size={22} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
                  <span>Company Component Library & Fast BOM Builder</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {skus.length} Company Parts Ready
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Select components from your company inventory to instantly build and calculate the Project BOM & shortages
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Project & Batch Setup Bar */}
          <div className="p-4 bg-slate-100 dark:bg-[#141722] border-b border-slate-200 dark:border-[#2A3042] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="text-slate-300 font-bold block mb-1 flex items-center justify-between">
                <span>Target Project *</span>
                <button
                  type="button"
                  onClick={() => setIsNewProject(!isNewProject)}
                  className="text-crm-blue-light hover:underline text-[11px] font-normal"
                >
                  {isNewProject ? '← Choose Existing Project' : '+ Type New Project Name'}
                </button>
              </label>
              {isNewProject ? (
                <input
                  type="text"
                  placeholder="e.g. 2 CTBS- 20 Zone -Controller"
                  value={customProject}
                  onChange={(e) => setCustomProject(e.target.value)}
                  className="input text-xs w-full font-bold text-slate-950 dark:text-white border-crm-blue"
                />
              ) : (
                <select
                  value={targetProject}
                  onChange={(e) => setTargetProject(e.target.value)}
                  className="input text-xs w-full font-bold text-slate-950 dark:text-white"
                >
                  {projectsList.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                  {projectsList.length === 0 && (
                    <option value="2 CTBS- 20 Zone -Controller">2 CTBS- 20 Zone -Controller</option>
                  )}
                </select>
              )}
            </div>

            <div>
              <label className="text-slate-300 font-bold block mb-1">
                Batch Production Quantity
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  value={batchQty}
                  onChange={(e) => setBatchQty(Number(e.target.value) || 1)}
                  className="input text-xs w-full font-bold text-amber-300 pl-3 pr-12"
                />
                <span className="absolute right-3 top-2 text-slate-500 font-bold text-xs">Units</span>
              </div>
            </div>
          </div>

          {/* Filters Strip */}
          <div className="p-3 bg-white dark:bg-[#181B26] border-b border-slate-200 dark:border-[#2A3042] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search code, specs (e.g. 10K, SIP, 5PIN, Relay, IC)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-8.5 text-xs py-1.5 w-full"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${selectedCategory === 'all' ? 'bg-crm-blue text-white shadow-sm' : 'bg-[#222738] text-slate-300 hover:bg-[#2D3349]'}`}
              >
                All ({skus.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${selectedCategory === cat ? 'bg-crm-blue text-white shadow-sm' : 'bg-[#222738] text-slate-300 hover:bg-[#2D3349]'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="m-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-crm-coral text-xs flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Component Selection Table */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[50vh]">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1 pb-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-crm-blue-light hover:underline font-bold"
                >
                  {selectedCount === filteredSkus.length && filteredSkus.length > 0 ? 'Deselect All' : 'Select All in View'}
                </button>
                <span>• Showing {filteredSkus.length} components</span>
              </div>
              <span className="font-bold text-emerald-400">
                {selectedCount} Selected for Project BOM
              </span>
            </div>

            <div className="border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-hidden bg-slate-100 dark:bg-[#141722]">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-[#1E2230] text-slate-300 border-b border-slate-200 dark:border-[#2A3042]">
                  <tr>
                    <th className="p-2.5 text-center w-10">Select</th>
                    <th className="p-2.5 text-left">Item Code / SKU</th>
                    <th className="p-2.5 text-left">Component Specs / Name</th>
                    <th className="p-2.5 text-left">Package</th>
                    <th className="p-2.5 text-right">Store Stock</th>
                    <th className="p-2.5 text-center w-28">BOM Qty/Unit</th>
                    <th className="p-2.5 text-center w-24">Circuit Tag</th>
                    <th className="p-2.5 text-right">Planned Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A3042]/60">
                  {filteredSkus.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500">
                        No company components found matching '{search}'.
                      </td>
                    </tr>
                  ) : (
                    filteredSkus.map((sku) => {
                      const isSelected = !!selectedSkuIds[sku.id];
                      const cfg = skuConfigs[sku.id] || { bomQty: 1, tag: '-' };
                      const bomQty = cfg.bomQty || 1;
                      const plannedTotal = bomQty * (Number(batchQty) || 1);
                      const currentStock = Number(sku.totalOnHand) || 0;
                      const isShortage = currentStock < plannedTotal;

                      return (
                        <tr
                          key={sku.id}
                          onClick={() => toggleSkuSelection(sku)}
                          className={`hover:bg-white/[0.04] cursor-pointer transition-colors ${isSelected ? 'bg-crm-blue/10' : ''}`}
                        >
                          <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSkuSelection(sku)}
                              className="rounded border-slate-200 dark:border-[#2A3042] text-crm-blue focus:ring-crm-blue"
                            />
                          </td>
                          <td className="p-2.5 font-mono font-bold text-crm-blue-light">
                            {sku.skuCode}
                          </td>
                          <td className="p-2.5 font-bold text-slate-950 dark:text-white max-w-xs truncate" title={sku.name}>
                            {sku.name}
                          </td>
                          <td className="p-2.5 text-slate-400">
                            {sku.packageType || 'TH'}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold">
                            <span className={currentStock > 0 ? 'text-emerald-400' : 'text-crm-coral'}>
                              {currentStock} Nos
                            </span>
                          </td>
                          <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              min="0.1"
                              step="any"
                              disabled={!isSelected}
                              value={cfg.bomQty}
                              onChange={(e) => updateSkuConfig(sku.id, 'bomQty', e.target.value)}
                              className="input text-xs w-20 text-center py-1 font-bold disabled:opacity-40"
                              placeholder="1"
                            />
                          </td>
                          <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              disabled={!isSelected}
                              value={cfg.tag}
                              onChange={(e) => updateSkuConfig(sku.id, 'tag', e.target.value)}
                              className="input text-xs w-20 text-center py-1 font-mono disabled:opacity-40"
                              placeholder="R1 / 8"
                            />
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold">
                            <span className={isShortage && isSelected ? 'text-amber-300' : 'text-slate-300'}>
                              {isSelected ? `${plannedTotal} Nos` : '-'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Action Bar */}
          <div className="p-4 border-t border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="text-slate-400">
              <span className="font-bold text-slate-950 dark:text-white">
                Adding to Project: <strong className="text-crm-blue-light">{isNewProject ? customProject : targetProject}</strong>
              </span>
              <span className="block text-[11px] text-slate-500">
                Batch: {batchQty} Units • Each component will auto-calculate planned demand & shortages
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="btn-ghost text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || selectedCount === 0}
                onClick={handleAddSelectedToProject}
                className="btn bg-crm-blue hover:bg-crm-blue-hover text-white text-xs px-5 py-2.5 shadow-glow-blue flex items-center gap-2 font-bold disabled:opacity-50"
              >
                {saving ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Add {selectedCount} Selected Components to Project BOM</span>
                    <ArrowRight size={14} />
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
