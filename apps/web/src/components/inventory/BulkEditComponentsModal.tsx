import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Check,
  Table,
  Search,
  ArrowDown,
  RefreshCw,
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
  onSuccess,
}) => {
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
  const handleGridCellChange = (id: string, field: string, rawValue: any) => {
    let value = rawValue;
    if (field === 'unitPrice' || field === 'presentStock' || field === 'plannedRequirement') {
      if (typeof value === 'string') {
        if (value === '') {
          value = '';
        } else {
          value = value.replace(/^0+([1-9])/, '$1');
        }
      }
    }
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
      const rowUpdates = modifiedRows.map((r) => ({
        id: r.id,
        positionId: r.id,
        skuId: r.skuId,
        project: r.project,
        supplier: r.supplierName,
        supplierName: r.supplierName,
        unit: r.unit,
        packageType: r.unit,
        unitPrice: Number(r.unitPrice) || 0,
        taxRate: Number(r.taxRate) || 0,
        presentStock: Number(r.presentStock) || 0,
        plannedRequirement: Number(r.plannedRequirement) || 0,
        updates: {
          project: r.project,
          supplierName: r.supplierName,
          unit: r.unit,
          packageType: r.unit,
          unitPrice: Number(r.unitPrice) || 0,
          taxRate: Number(r.taxRate) || 0,
          presentStock: Number(r.presentStock) || 0,
          plannedRequirement: Number(r.plannedRequirement) || 0,
        },
      }));

      await inventoryApi.bulkEditComponents({
        rowUpdates,
        items: rowUpdates,
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
          className="bg-white dark:bg-[#181B26] border border-slate-300 dark:border-[#2A3042] rounded-2xl w-full flex flex-col shadow-2xl overflow-hidden my-auto max-w-6xl h-[90vh]"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-600/10 dark:bg-crm-violet/20 text-violet-600 dark:text-crm-violet-light flex items-center justify-center border border-violet-500/20 shadow-sm">
                <Table size={20} />
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
                  Direct cell editing in spreadsheet grid mode with live Quick Fill Down
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors cursor-pointer"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-50 dark:bg-red-500/10 border border-rose-200 dark:border-red-500/30 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <span className="font-bold">Error:</span> {error}
            </div>
          )}

          {/* Spreadsheet Grid Body */}
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
                  className="px-2 py-1 rounded bg-white dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:text-violet-600 font-bold flex items-center gap-1 shadow-sm cursor-pointer"
                  title="Fill Row 1's project value to all rows"
                >
                  <ArrowDown size={11} /> Project
                </button>
                <button
                  type="button"
                  onClick={() => handleFillDown('unitPrice')}
                  className="px-2 py-1 rounded bg-white dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:text-violet-600 font-bold flex items-center gap-1 shadow-sm cursor-pointer"
                  title="Fill Row 1's unit rate to all rows"
                >
                  <ArrowDown size={11} /> Rate (₹)
                </button>
                <button
                  type="button"
                  onClick={() => handleFillDown('taxRate')}
                  className="px-2 py-1 rounded bg-white dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:text-violet-600 font-bold flex items-center gap-1 shadow-sm cursor-pointer"
                  title="Fill Row 1's GST % to all rows"
                >
                  <ArrowDown size={11} /> GST %
                </button>
                <button
                  type="button"
                  onClick={() => handleFillDown('supplierName')}
                  className="px-2 py-1 rounded bg-white dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] text-slate-700 dark:text-slate-300 hover:text-violet-600 font-bold flex items-center gap-1 shadow-sm cursor-pointer"
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
                          placeholder="0.00"
                          value={row.unitPrice === 0 || row.unitPrice === '0' ? '' : row.unitPrice}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleGridCellChange(row.id, 'unitPrice', e.target.value)}
                          onBlur={() => {
                            if (row.unitPrice === '') handleGridCellChange(row.id, 'unitPrice', 0);
                          }}
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
                          placeholder="0"
                          value={row.presentStock === 0 || row.presentStock === '0' ? '' : row.presentStock}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleGridCellChange(row.id, 'presentStock', e.target.value)}
                          onBlur={() => {
                            if (row.presentStock === '') handleGridCellChange(row.id, 'presentStock', 0);
                          }}
                          className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white focus:ring-1 focus:ring-violet-500"
                        />
                      </td>
                      <td className="p-1.5">
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={row.plannedRequirement === 0 || row.plannedRequirement === '0' ? '' : row.plannedRequirement}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleGridCellChange(row.id, 'plannedRequirement', e.target.value)}
                          onBlur={() => {
                            if (row.plannedRequirement === '') handleGridCellChange(row.id, 'plannedRequirement', 0);
                          }}
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
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-[#2A3042] hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGridSubmit}
                  disabled={saving || gridData.filter((r) => r._modified).length === 0}
                  className="px-6 py-2 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-md flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
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
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
