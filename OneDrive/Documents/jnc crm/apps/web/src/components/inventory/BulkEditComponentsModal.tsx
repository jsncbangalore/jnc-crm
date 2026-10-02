import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Edit3,
  X,
  Layers,
  Building2,
  Percent,
  Check,
  Zap,
  Table,
  Search,
  ArrowDown,
  RefreshCw,
  Package,
  Boxes,
  IndianRupee,
} from 'lucide-react';
import { inventoryApi } from '../../services/api';

interface BulkEditComponentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: any[];
  existingProjects: string[];
  onSuccess: () => void;
}

export const BulkEditComponentsModal: React.FC<BulkEditComponentsModalProps> = ({
  isOpen,
  onClose,
  selectedItems,
  existingProjects,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'batch' | 'grid'>('batch');

  // Batch Form State
  const [updateProject, setUpdateProject] = useState(false);
  const [project, setProject] = useState(existingProjects[0] || 'PA System Integration');
  const [customProject, setCustomProject] = useState('');

  const [updateSupplier, setUpdateSupplier] = useState(false);
  const [supplierName, setSupplierName] = useState('');

  const [updateUnit, setUpdateUnit] = useState(false);
  const [unit, setUnit] = useState('Nos');

  const [updatePrice, setUpdatePrice] = useState(false);
  const [unitPrice, setUnitPrice] = useState<string>('100');

  const [updateTaxRate, setUpdateTaxRate] = useState(false);
  const [taxRate, setTaxRate] = useState<number>(18);

  // Spreadsheet Grid State
  const [searchQuery, setSearchQuery] = useState('');
  const [gridData, setGridData] = useState<any[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset grid data when selectedItems changes or modal opens
  React.useEffect(() => {
    if (isOpen && selectedItems) {
      setGridData(
        selectedItems.map((item) => ({
          id: item.positionId || item.id,
          skuId: item.skuId,
          skuCode: item.skuCode || item.sku?.code || '—',
          name: item.name || item.sku?.name || '—',
          project: item.project || '',
          supplierName: item.supplierName || item.sku?.supplierName || '',
          unit: item.unit || item.packageType || item.sku?.packageType || 'Nos',
          unitPrice: item.unitPrice ?? item.sku?.unitPrice ?? 0,
          taxRate: item.taxRate ?? item.sku?.taxRate ?? 18,
          presentStock: item.presentStock ?? item.stock ?? 0,
          plannedRequirement: item.plannedRequirement ?? 0,
          _modified: false,
        }))
      );
    }
  }, [isOpen, selectedItems]);

  const effectiveProject = project === '__custom__' ? customProject.trim() : project;

  // Filtered rows for spreadsheet view
  const filteredGridData = useMemo(() => {
    if (!searchQuery.trim()) return gridData;
    const q = searchQuery.toLowerCase();
    return gridData.filter(
      (row) =>
        row.skuCode.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.project.toLowerCase().includes(q) ||
        row.supplierName.toLowerCase().includes(q)
    );
  }, [gridData, searchQuery]);

  // Handle single cell modification in grid
  const handleGridCellChange = (id: string, field: string, value: any) => {
    setGridData((prev) =>
      prev.map((row) => {
        if (row.id === id) {
          return { ...row, [field]: value, _modified: true };
        }
        return row;
      })
    );
  };

  // Fill down column helper
  const handleFillDown = (field: string) => {
    if (gridData.length === 0) return;
    const sourceValue = gridData[0][field];
    setGridData((prev) =>
      prev.map((row) => ({
        ...row,
        [field]: sourceValue,
        _modified: true,
      }))
    );
  };

  // Fast Batch Update Submit
  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateProject && !updateSupplier && !updateUnit && !updatePrice && !updateTaxRate) {
      setError('Please select at least one field checkbox to apply bulk updates.');
      return;
    }

    setSaving(true);
    setError(null);

    const posIds = selectedItems.map((i) => i.positionId || i.id).filter(Boolean);
    const skuIds = selectedItems.map((i) => i.skuId).filter(Boolean);

    const updates: Record<string, any> = {};
    if (updateProject && effectiveProject) updates.project = effectiveProject;
    if (updateSupplier && supplierName.trim()) updates.supplierName = supplierName.trim();
    if (updateUnit && unit) updates.unit = unit;
    if (updatePrice && unitPrice !== '') updates.unitPrice = Number(unitPrice);
    if (updateTaxRate) updates.taxRate = Number(taxRate);

    try {
      await inventoryApi.bulkEditComponents({
        ids: posIds,
        skuIds: skuIds,
        updates,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Bulk edit failed');
    } finally {
      setSaving(false);
    }
  };

  // Spreadsheet Grid Save Submit
  const handleGridSubmit = async () => {
    const modifiedRows = gridData.filter((r) => r._modified);
    if (modifiedRows.length === 0) {
      setError('No changes detected in the spreadsheet grid.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const itemsPayload = modifiedRows.map((r) => ({
        id: r.id,
        skuId: r.skuId,
        updates: {
          project: r.project,
          supplierName: r.supplierName,
          unit: r.unit,
          unitPrice: Number(r.unitPrice),
          taxRate: Number(r.taxRate),
          presentStock: Number(r.presentStock),
          plannedRequirement: Number(r.plannedRequirement),
        },
      }));

      await inventoryApi.bulkEditComponents({
        items: itemsPayload,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed saving spreadsheet edits');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || selectedItems.length === 0) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          className={`bg-white dark:bg-[#181B26] border border-slate-300 dark:border-[#2A3042] rounded-2xl w-full flex flex-col shadow-2xl overflow-hidden my-auto ${
            activeTab === 'grid' ? 'max-w-6xl h-[90vh]' : 'max-w-2xl max-h-[92vh]'
          }`}
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-600/10 dark:bg-crm-violet/20 text-violet-600 dark:text-crm-violet-light flex items-center justify-center border border-violet-500/20 shadow-sm">
                <Edit3 size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-950 dark:text-white">
                    Bulk Edit Components
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border border-violet-200 dark:border-violet-700/50">
                    {selectedItems.length} Selected
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Update project allocations, rates, suppliers, or edit in spreadsheet mode
                </p>
              </div>
            </div>

            {/* Mode Tabs */}
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-200/80 dark:bg-[#12151E] p-1 rounded-xl border border-slate-300/80 dark:border-[#2A3042]">
                <button
                  type="button"
                  onClick={() => setActiveTab('batch')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'batch'
                      ? 'bg-white dark:bg-[#1E2230] text-violet-700 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  <Zap size={14} className={activeTab === 'batch' ? 'text-amber-500' : ''} />
                  Fast Batch Apply
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('grid')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'grid'
                      ? 'bg-white dark:bg-[#1E2230] text-violet-700 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  <Table size={14} className={activeTab === 'grid' ? 'text-crm-blue' : ''} />
                  Spreadsheet Grid
                </button>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-50 dark:bg-red-500/10 border border-rose-200 dark:border-red-500/30 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <span className="font-bold">Error:</span> {error}
            </div>
          )}

          {/* Tab 1: Fast Batch Apply */}
          {activeTab === 'batch' && (
            <form onSubmit={handleBatchSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Check each field you wish to overwrite across all{' '}
                <strong className="text-slate-900 dark:text-slate-200">{selectedItems.length}</strong> selected component records:
              </p>

              {/* Field 1: Change Project */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] space-y-2.5 transition-colors hover:border-slate-400 dark:hover:border-[#384158]">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-950 dark:text-white select-none">
                  <input
                    type="checkbox"
                    checked={updateProject}
                    onChange={(e) => setUpdateProject(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="flex items-center gap-1.5">
                    <Layers size={14} className="text-crm-blue" />
                    Reassign to Project / Controller
                  </span>
                </label>
                {updateProject && (
                  <div className="pl-6 pt-1 space-y-2">
                    <select
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                        type="text"
                        required
                        placeholder="Type custom project name..."
                        value={customProject}
                        onChange={(e) => setCustomProject(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Field 2: Change Supplier */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] space-y-2.5 transition-colors hover:border-slate-400 dark:hover:border-[#384158]">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-950 dark:text-white select-none">
                  <input
                    type="checkbox"
                    checked={updateSupplier}
                    onChange={(e) => setUpdateSupplier(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="flex items-center gap-1.5">
                    <Building2 size={14} className="text-emerald-500" />
                    Set Preferred Supplier / Vendor
                  </span>
                </label>
                {updateSupplier && (
                  <div className="pl-6 pt-1">
                    <input
                      type="text"
                      placeholder="Enter preferred supplier / brand name"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                )}
              </div>

              {/* Field 3: Unit */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] space-y-2.5 transition-colors hover:border-slate-400 dark:hover:border-[#384158]">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-950 dark:text-white select-none">
                  <input
                    type="checkbox"
                    checked={updateUnit}
                    onChange={(e) => setUpdateUnit(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="flex items-center gap-1.5">
                    <Package size={14} className="text-blue-500" />
                    Set Package Unit
                  </span>
                </label>
                {updateUnit && (
                  <div className="pl-6 pt-1">
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="Nos">Nos</option>
                      <option value="Pcs">Pcs</option>
                      <option value="Mtrs">Mtrs</option>
                      <option value="Sets">Sets</option>
                      <option value="Drums">Drums</option>
                      <option value="Boxes">Boxes</option>
                      <option value="Pairs">Pairs</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Field 4 & 5: Base Rate & GST % */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] space-y-2.5 transition-colors hover:border-slate-400 dark:hover:border-[#384158]">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-950 dark:text-white select-none">
                    <input
                      type="checkbox"
                      checked={updatePrice}
                      onChange={(e) => setUpdatePrice(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="flex items-center gap-1.5">
                      <IndianRupee size={13} className="text-emerald-500" />
                      Set Base Unit Rate (₹)
                    </span>
                  </label>
                  {updatePrice && (
                    <div className="pl-6 pt-1">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#141722] border border-slate-300 dark:border-[#2A3042] space-y-2.5 transition-colors hover:border-slate-400 dark:hover:border-[#384158]">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-950 dark:text-white select-none">
                    <input
                      type="checkbox"
                      checked={updateTaxRate}
                      onChange={(e) => setUpdateTaxRate(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="flex items-center gap-1.5">
                      <Percent size={13} className="text-amber-500" />
                      Set GST Slab
                    </span>
                  </label>
                  {updateTaxRate && (
                    <div className="pl-6 pt-1">
                      <select
                        value={taxRate}
                        onChange={(e) => setTaxRate(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-amber-700 dark:text-amber-300 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      >
                        <option value="0">0% GST</option>
                        <option value="5">5% GST</option>
                        <option value="12">12% GST</option>
                        <option value="18">18% GST (Standard)</option>
                        <option value="28">28% GST</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-[#2A3042]">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-[#2A3042] hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Applying to {selectedItems.length} items...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Apply Bulk Updates ({selectedItems.length})</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Tab 2: Fast Spreadsheet Grid */}
          {activeTab === 'grid' && (
            <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-5 gap-3">
              {/* Grid Top Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-[#141722] p-3 rounded-xl border border-slate-300 dark:border-[#2A3042]">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by SKU, item name, project, supplier..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Quick Fill Down:</span>
                  <button
                    type="button"
                    onClick={() => handleFillDown('project')}
                    className="px-2 py-1 rounded bg-white dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:text-violet-600 font-bold flex items-center gap-1 shadow-sm"
                    title="Fill Row 1's project value to all rows"
                  >
                    <ArrowDown size={11} /> Project
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFillDown('unitPrice')}
                    className="px-2 py-1 rounded bg-white dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:text-violet-600 font-bold flex items-center gap-1 shadow-sm"
                    title="Fill Row 1's unit rate to all rows"
                  >
                    <ArrowDown size={11} /> Rate (₹)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFillDown('taxRate')}
                    className="px-2 py-1 rounded bg-white dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:text-violet-600 font-bold flex items-center gap-1 shadow-sm"
                    title="Fill Row 1's GST % to all rows"
                  >
                    <ArrowDown size={11} /> GST %
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFillDown('supplierName')}
                    className="px-2 py-1 rounded bg-white dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:text-violet-600 font-bold flex items-center gap-1 shadow-sm"
                    title="Fill Row 1's supplier to all rows"
                  >
                    <ArrowDown size={11} /> Supplier
                  </button>
                </div>
              </div>

              {/* Interactive Table Grid */}
              <div className="flex-1 overflow-auto border border-slate-300 dark:border-[#2A3042] rounded-xl bg-white dark:bg-[#12151E]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 dark:bg-[#1E2230] text-slate-800 dark:text-slate-200 sticky top-0 z-10 font-bold border-b border-slate-300 dark:border-[#2A3042]">
                    <tr>
                      <th className="p-2.5 w-10 text-center text-slate-400">#</th>
                      <th className="p-2.5 min-w-[130px]">SKU Code</th>
                      <th className="p-2.5 min-w-[200px]">Component Name</th>
                      <th className="p-2.5 min-w-[170px]">Project / System</th>
                      <th className="p-2.5 min-w-[160px]">Preferred Supplier</th>
                      <th className="p-2.5 min-w-[90px]">Unit</th>
                      <th className="p-2.5 min-w-[110px]">Unit Rate (₹)</th>
                      <th className="p-2.5 min-w-[90px]">GST %</th>
                      <th className="p-2.5 min-w-[100px]">Stock Qty</th>
                      <th className="p-2.5 min-w-[100px]">Req Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-[#2A3042]/50">
                    {filteredGridData.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={`hover:bg-slate-50 dark:hover:bg-white/[0.02] ${
                          row._modified ? 'bg-amber-500/5 dark:bg-amber-500/10' : ''
                        }`}
                      >
                        <td className="p-2 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="p-2 font-mono font-bold text-violet-700 dark:text-violet-300">
                          {row.skuCode}
                        </td>
                        <td className="p-2 text-slate-900 dark:text-slate-200 truncate max-w-[220px]" title={row.name}>
                          {row.name}
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={row.project}
                            onChange={(e) => handleGridCellChange(row.id, 'project', e.target.value)}
                            className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:ring-1 focus:ring-violet-500"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={row.supplierName}
                            placeholder="Supplier name"
                            onChange={(e) => handleGridCellChange(row.id, 'supplierName', e.target.value)}
                            className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:ring-1 focus:ring-violet-500"
                          />
                        </td>
                        <td className="p-1.5">
                          <select
                            value={row.unit}
                            onChange={(e) => handleGridCellChange(row.id, 'unit', e.target.value)}
                            className="w-full px-1.5 py-1 text-xs rounded border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:ring-1 focus:ring-violet-500"
                          >
                            <option value="Nos">Nos</option>
                            <option value="Pcs">Pcs</option>
                            <option value="Mtrs">Mtrs</option>
                            <option value="Sets">Sets</option>
                            <option value="Drums">Drums</option>
                            <option value="Boxes">Boxes</option>
                          </select>
                        </td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.unitPrice}
                            onChange={(e) => handleGridCellChange(row.id, 'unitPrice', e.target.value)}
                            className="w-full px-2 py-1 text-xs font-mono font-bold rounded border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-emerald-700 dark:text-emerald-400 focus:ring-1 focus:ring-violet-500"
                          />
                        </td>
                        <td className="p-1.5">
                          <select
                            value={row.taxRate}
                            onChange={(e) => handleGridCellChange(row.id, 'taxRate', Number(e.target.value))}
                            className="w-full px-1.5 py-1 text-xs font-bold rounded border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-amber-700 dark:text-amber-400 focus:ring-1 focus:ring-violet-500"
                          >
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="18">18%</option>
                            <option value="28">28%</option>
                          </select>
                        </td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            min="0"
                            value={row.presentStock}
                            onChange={(e) => handleGridCellChange(row.id, 'presentStock', e.target.value)}
                            className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:ring-1 focus:ring-violet-500"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            min="0"
                            value={row.plannedRequirement}
                            onChange={(e) => handleGridCellChange(row.id, 'plannedRequirement', e.target.value)}
                            className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:ring-1 focus:ring-violet-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Grid Footer Controls */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-[#2A3042]">
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Showing {filteredGridData.length} of {gridData.length} items &bull;{' '}
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {gridData.filter((r) => r._modified).length} modified
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={saving}
                    className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-[#2A3042] hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleGridSubmit}
                    disabled={saving || gridData.filter((r) => r._modified).length === 0}
                    className="px-6 py-2 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Saving Edits...</span>
                      </>
                    ) : (
                      <>
                        <Check size={14} />
                        <span>
                          Save {gridData.filter((r) => r._modified).length} Changes
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
