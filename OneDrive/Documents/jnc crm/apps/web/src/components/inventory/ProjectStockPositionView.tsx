import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Download, Upload, AlertTriangle,
  Edit3, Trash2, RefreshCw, Layers, FileSpreadsheet, X,
  AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Minimize2, Maximize2, FileText, Boxes, Sparkles, Info, CheckCircle2,
  ShoppingCart, CheckSquare, PackageCheck, Printer, ArrowRight,
  Cpu, Wrench, ShieldAlert
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { inventoryApi } from '../../services/api';
import { ProjectStockPosition, Sku } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import Papa from 'papaparse';
import { CompanyComponentLibraryModal } from './CompanyComponentLibraryModal';

export default function ProjectStockPositionView() {
  const { user } = useAuth();
  const canManage = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'sub_admin';
  const canDelete = user?.role === 'super_admin' || user?.role === 'admin';

  const [positions, setPositions] = useState<ProjectStockPosition[]>([]);
  const [projectsList, setProjectsList] = useState<string[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [showComponentLibrary, setShowComponentLibrary] = useState<boolean>(false);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Active View Tab: 'what_to_buy' | 'what_to_collect' | 'full_bom'
  const [activeTab, setActiveTab] = useState<'what_to_buy' | 'what_to_collect' | 'full_bom'>('what_to_buy');

  // Filters
  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [shortageOnly, setShortageOnly] = useState(false);

  // Table Density & Scroll Ref
  const [density, setDensity] = useState<'compact' | 'normal'>('compact');
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Add / Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectStockPosition | null>(null);
  const [formData, setFormData] = useState({
    project: '',
    reference: '',
    quantity: 1,
    itemCode: '',
    partValue: '',
    package: '',
    unit: 'Nos',
    bomQtyPerUnit: 1,
    batchQty: 1,
    plannedRequirement: 1,
    openingStock: 0,
    inflow: 0,
    outflow: 0,
    presentStock: 0,
    shortage: 0,
    status: 'Sufficient',
    notes: '',
  });

  // Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // In-App Clear All Modal
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Fetch Data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [posRes, sumRes, skuRes] = await Promise.all([
        inventoryApi.getProjectStock({
          project: selectedProject !== 'all' ? selectedProject : undefined,
          status: selectedStatus !== 'all' ? selectedStatus : undefined,
          shortageOnly: shortageOnly ? 'true' : undefined,
          search: search || undefined,
        }),
        inventoryApi.getProjectStockSummary(),
        inventoryApi.getSkus(),
      ]);

      setPositions(posRes.data.items || []);
      setProjectsList(posRes.data.projects || []);
      setSummary(sumRes.data);
      setSkus(skuRes.data.items || skuRes.data || []);
    } catch (err) {
      console.error('Failed to load project stock positions', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedProject, selectedStatus, shortageOnly, search]);

  // Recalculate derived fields when user edits inputs in form
  const handleFormNumberChange = (field: string, val: number) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: val };
      const bomQty = field === 'bomQtyPerUnit' ? val : Number(next.bomQtyPerUnit) || 1;
      const batch = field === 'batchQty' ? val : Number(next.batchQty) || 1;
      const planned = bomQty * batch;

      const open = field === 'openingStock' ? val : Number(next.openingStock) || 0;
      const inf = field === 'inflow' ? val : Number(next.inflow) || 0;
      const out = field === 'outflow' ? val : Number(next.outflow) || 0;
      const present = open + inf - out;

      const short = Math.max(0, planned - present);

      let autoStatus = next.status;
      if (short <= 0 && present >= planned * 1.5) {
        autoStatus = 'Surplus';
      } else if (short <= 0) {
        autoStatus = 'Sufficient';
      } else if (short > 0 && present > 0) {
        autoStatus = 'Shortage';
      } else {
        autoStatus = 'Critical Shortage';
      }

      return {
        ...next,
        plannedRequirement: planned,
        presentStock: present,
        shortage: short,
        status: autoStatus,
      };
    });
  };

  const handleOpenAddModal = () => {
    setEditingItem(null);
    setFormData({
      project: selectedProject !== 'all' ? selectedProject : (projectsList[0] || '2 CTBS- 20 Zone -Controller'),
      reference: '1',
      quantity: 1,
      itemCode: '',
      partValue: '',
      package: 'TH',
      unit: 'Nos',
      bomQtyPerUnit: 1,
      batchQty: 1,
      plannedRequirement: 1,
      openingStock: 0,
      inflow: 0,
      outflow: 0,
      presentStock: 0,
      shortage: 1,
      status: 'Critical Shortage',
      notes: '',
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (item: ProjectStockPosition) => {
    setEditingItem(item);
    setFormData({
      project: item.project,
      reference: item.reference,
      quantity: item.quantity,
      itemCode: item.itemCode,
      partValue: item.partValue || '',
      package: item.package || '',
      unit: item.unit,
      bomQtyPerUnit: item.bomQtyPerUnit,
      batchQty: item.batchQty,
      plannedRequirement: item.plannedRequirement,
      openingStock: item.openingStock,
      inflow: item.inflow,
      outflow: item.outflow,
      presentStock: item.presentStock,
      shortage: item.shortage,
      status: item.status,
      notes: item.notes || '',
    });
    setShowModal(true);
  };

  const handleSavePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await inventoryApi.updateProjectStock(editingItem.id, formData);
      } else {
        await inventoryApi.createProjectStock(formData);
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      alert('Failed to save position: ' + (err?.response?.data?.message || err.message));
    }
  };

  const handleDeletePosition = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove item "${name}" from this project?`)) return;
    try {
      await inventoryApi.deleteProjectStock(id);
      fetchData();
    } catch (err: any) {
      alert('Failed to delete position: ' + (err?.response?.data?.message || err.message));
    }
  };

  // Grouped and filtered items for tabs
  const buyItems = useMemo(() => positions.filter((p) => p.shortage > 0), [positions]);
  const collectItems = useMemo(() => positions.filter((p) => p.presentStock > 0), [positions]);

  const totalBuyQty = useMemo(() => buyItems.reduce((acc, p) => acc + p.shortage, 0), [buyItems]);
  const totalCollectQty = useMemo(() => collectItems.reduce((acc, p) => acc + Math.min(p.plannedRequirement, p.presentStock), 0), [collectItems]);

  // Export Excel
  const handleExportExcel = () => {
    if (positions.length === 0) return;
    const data = positions.map((p, idx) => ({
      'Sl No': idx + 1,
      'Project Name': p.project,
      'Circuit / BOM Tag': p.reference,
      'Item Code / SKU': p.itemCode,
      'Part Value & Specs': p.partValue || '-',
      'Package': p.package || '-',
      'Unit': p.unit,
      'BOM Qty / Unit': p.bomQtyPerUnit,
      'Batch Qty': p.batchQty,
      'Total Needed (Planned)': p.plannedRequirement,
      'Present Store Stock': p.presentStock,
      'Shortage (Must BUY)': p.shortage,
      'Status': p.status,
      'Procurement Notes': p.notes || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'JNC_BOM_Stock_Position');
    XLSX.writeFile(wb, `JNC_Project_BOM_Shortages_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Export CSV
  const handleExportCsv = () => {
    if (positions.length === 0) return;
    const data = positions.map((p, idx) => ({
      'Sl No': idx + 1,
      'Project': p.project,
      'Tag': p.reference,
      'Item Code': p.itemCode,
      'Part Value': p.partValue || '-',
      'Package': p.package || '-',
      'Unit': p.unit,
      'Needed': p.plannedRequirement,
      'Present Stock': p.presentStock,
      'Shortage to Buy': p.shortage,
      'Status': p.status,
      'Notes': p.notes || '',
    }));
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `JNC_BOM_Shortage_List_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Print Work Order / Picking Slip
  const handlePrintWorkOrder = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      {/* ─── TOP MAIN HEADER ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-950 dark:text-white flex items-center gap-2.5">
            <Cpu className="text-crm-blue" size={26} />
            <span>Product Order BOM & Shortage Planner</span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
            Select your ordered product to instantly see what to <strong>Collect from Store</strong> vs what to <strong>BUY from Suppliers</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canManage && (
            <button
              onClick={() => setShowComponentLibrary(true)}
              className="btn bg-gradient-to-r from-crm-blue to-crm-teal hover:opacity-90 text-white text-xs gap-1.5 shadow-glow-blue font-bold px-3.5 py-2"
              title="Pick from company component inventory & batch add to project"
            >
              <Boxes size={15} /> Company Component Library (Fast Add)
            </button>
          )}

          {canManage && (
            <button
              onClick={handleOpenAddModal}
              className="btn-primary text-xs gap-1.5 shadow-glow-blue"
            >
              <Plus size={14} /> Add Single Part
            </button>
          )}

          <button
            onClick={handleExportExcel}
            disabled={positions.length === 0}
            className="btn bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 shadow-sm"
            title="Download Excel spreadsheet"
          >
            <FileSpreadsheet size={14} /> Export Excel
          </button>

          <button
            onClick={handlePrintWorkOrder}
            className="btn bg-white/10 hover:bg-white/20 text-white text-xs gap-1.5"
            title="Print Production & Picking Slip"
          >
            <Printer size={14} /> Print Slip
          </button>

          {canDelete && (
            <button
              onClick={() => setShowClearModal(true)}
              className="btn bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-crm-coral text-xs gap-1.5"
              title="Wipe test data and start completely fresh"
            >
              <Trash2 size={13} /> Clear Fresh
            </button>
          )}
        </div>
      </div>

      {/* ─── PRODUCT SELECTOR & 3-CARD DECISION BANNER ─────────────────────── */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 max-w-xl">
            <label className="text-xs font-bold text-slate-300 block mb-1">
              Select Ordered Finished Product / Project:
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="input text-xs w-full font-bold text-slate-950 dark:text-white bg-slate-100 dark:bg-[#141722] border-crm-blue/40"
            >
              <option value="all">All Finished Products ({projectsList.length} Active)</option>
              {projectsList.map((proj) => (
                <option key={proj} value={proj}>{proj}</option>
              ))}
              {projectsList.length === 0 && (
                <option value="2 CTBS- 20 Zone -Controller">2 CTBS- 20 Zone -Controller</option>
              )}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('what_to_buy')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'what_to_buy' ? 'bg-red-500 text-white shadow-glow-coral' : 'bg-slate-100 dark:bg-[#141722] text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-[#2A3042]'}`}
            >
              <ShoppingCart size={15} />
              <span>1. What to BUY ({buyItems.length} Parts)</span>
            </button>

            <button
              onClick={() => setActiveTab('what_to_collect')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'what_to_collect' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-[#141722] text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-[#2A3042]'}`}
            >
              <PackageCheck size={15} />
              <span>2. What to COLLECT ({collectItems.length} Parts)</span>
            </button>

            <button
              onClick={() => setActiveTab('full_bom')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'full_bom' ? 'bg-crm-blue text-white shadow-glow-blue' : 'bg-slate-100 dark:bg-[#141722] text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-[#2A3042]'}`}
            >
              <Layers size={14} />
              <span>All BOM ({positions.length})</span>
            </button>
          </div>
        </div>

        {/* High-Level Decision Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Card 1: What to Buy */}
          <div
            onClick={() => setActiveTab('what_to_buy')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${activeTab === 'what_to_buy' ? 'bg-red-500/15 border-red-500 shadow-md ring-1 ring-red-500' : 'bg-slate-100 dark:bg-[#141722] border-slate-200 dark:border-[#2A3042] hover:border-red-500/50'}`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-crm-coral flex items-center gap-1.5">
                <ShieldAlert size={16} /> BUY FROM SUPPLIERS
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-500/20 text-red-300">
                {buyItems.length} SHORTAGES
              </span>
            </div>
            <p className="text-2xl font-black text-slate-950 dark:text-white mt-2 tabular-nums">
              {totalBuyQty.toLocaleString('en-IN')} <span className="text-xs font-normal text-slate-400">Total Units Deficit</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Parts with 0 or low store stock. Issue purchase orders immediately.
            </p>
          </div>

          {/* Card 2: What to Collect */}
          <div
            onClick={() => setActiveTab('what_to_collect')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${activeTab === 'what_to_collect' ? 'bg-emerald-500/15 border-emerald-500 shadow-md ring-1 ring-emerald-500' : 'bg-slate-100 dark:bg-[#141722] border-slate-200 dark:border-[#2A3042] hover:border-emerald-500/50'}`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={16} /> READY TO COLLECT FROM STORE
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300">
                {collectItems.length} AVAILABLE
              </span>
            </div>
            <p className="text-2xl font-black text-slate-950 dark:text-white mt-2 tabular-nums">
              {totalCollectQty.toLocaleString('en-IN')} <span className="text-xs font-normal text-slate-400">Units Ready to Pick</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Parts physically in stock. Issue to assembly workbench right away.
            </p>
          </div>

          {/* Card 3: Total BOM Requirement */}
          <div
            onClick={() => setActiveTab('full_bom')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${activeTab === 'full_bom' ? 'bg-crm-blue/15 border-crm-blue shadow-md ring-1 ring-crm-blue' : 'bg-slate-100 dark:bg-[#141722] border-slate-200 dark:border-[#2A3042] hover:border-crm-blue/50'}`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-crm-blue-light flex items-center gap-1.5">
                <Layers size={16} /> TOTAL FINISHED PRODUCT DEMAND
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-crm-blue/20 text-crm-blue-light">
                {positions.length} TOTAL PARTS
              </span>
            </div>
            <p className="text-2xl font-black text-slate-950 dark:text-white mt-2 tabular-nums">
              {summary?.totalPlannedRequirement?.toLocaleString('en-IN') || 0} <span className="text-xs font-normal text-slate-400">BOM Parts Needed</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Complete engineering bill of materials for this finished product.
            </p>
          </div>
        </div>
      </div>

      {/* ─── TAB 1: WHAT TO BUY FROM SUPPLIERS (PROCUREMENT LIST) ──────── */}
      {activeTab === 'what_to_buy' && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between text-xs flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} className="text-crm-coral" />
              <div>
                <strong className="text-white">Supplier Purchase Order & Shortage Requirement</strong>
                <span className="block text-[11px] text-slate-400">
                  These components are missing from your warehouse. Contact your component suppliers to procure them.
                </span>
              </div>
            </div>
            <button
              onClick={handleExportCsv}
              className="btn bg-red-600 hover:bg-red-500 text-white text-xs px-3.5 py-1.5 font-bold shadow-glow-coral flex items-center gap-1.5"
            >
              <Download size={13} /> Export PO Shortage Sheet
            </button>
          </div>

          <div className="border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-hidden bg-slate-100 dark:bg-[#141722] shadow-xl">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 dark:bg-[#1E2230] text-slate-300 border-b border-slate-200 dark:border-[#2A3042]">
                <tr>
                  <th className="p-3 text-left">Component Item Code / SKU</th>
                  <th className="p-3 text-left">Specifications / Part Value</th>
                  <th className="p-3 text-left">Mounting / Package</th>
                  <th className="p-3 text-center">Circuit Tag</th>
                  <th className="p-3 text-right">Order Needed</th>
                  <th className="p-3 text-right">Store Stock</th>
                  <th className="p-3 text-right text-crm-coral font-black">Quantity to BUY</th>
                  <th className="p-3 text-center">Status</th>
                  {canManage && <th className="p-3 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A3042]/60">
                {buyItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-emerald-400">
                      <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-400" />
                      <strong className="text-base block text-white">All Components In Stock!</strong>
                      <span className="text-xs text-slate-400">
                        You have 100% of the components needed in your warehouse for this product. No purchases required.
                      </span>
                    </td>
                  </tr>
                ) : (
                  buyItems.map((item) => (
                    <tr key={item.id} className="hover:bg-white/[0.04] bg-red-500/[0.04] transition-colors">
                      <td className="p-3 font-mono font-bold text-slate-950 dark:text-white">
                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 border border-red-300 dark:border-red-500/30 font-bold">
                          {item.itemCode}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-950 dark:text-white">
                        {item.partValue || '-'}
                      </td>
                      <td className="p-3 text-slate-700 dark:text-slate-400 font-medium">
                        {item.package || 'TH'}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-slate-800 dark:text-slate-300">
                        {item.reference || '-'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-amber-700 dark:text-amber-300">
                        {item.plannedRequirement} {item.unit}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-800 dark:text-slate-400">
                        {item.presentStock} {item.unit}
                      </td>
                      <td className="p-3 text-right font-mono font-black text-base text-crm-coral">
                        {item.shortage} {item.unit}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 border border-red-300 dark:border-red-500/40">
                          Critical Shortage
                        </span>
                      </td>
                      {canManage && (
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="btn-ghost text-xs p-1 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white"
                            title="Edit component or update stock"
                          >
                            <Edit3 size={13} className="text-crm-blue" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 2: WHAT TO COLLECT FROM STORE (PICKING LIST) ──────────── */}
      {activeTab === 'what_to_collect' && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <PackageCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
              <div>
                <strong className="text-slate-950 dark:text-white">Store Picking & Workbench Issue List</strong>
                <span className="block text-[11px] text-slate-700 dark:text-slate-400">
                  These components are available right now in your warehouse store. Hand this list to your storekeeper or assembly technician.
                </span>
              </div>
            </div>
            <button
              onClick={handlePrintWorkOrder}
              className="btn bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3.5 py-1.5 font-bold shadow-lg flex items-center gap-1.5"
            >
              <Printer size={13} /> Print Picking Slip
            </button>
          </div>

          <div className="border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-hidden bg-white dark:bg-[#141722] shadow-xl">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 dark:bg-[#1E2230] text-slate-800 dark:text-slate-300 font-bold border-b border-slate-300 dark:border-[#2A3042]">
                <tr>
                  <th className="p-3 text-left">Component Item Code / SKU</th>
                  <th className="p-3 text-left">Specifications / Part Value</th>
                  <th className="p-3 text-left">Package</th>
                  <th className="p-3 text-center">Circuit Tag</th>
                  <th className="p-3 text-right text-emerald-700 dark:text-emerald-400 font-bold">Qty to Issue / Collect</th>
                  <th className="p-3 text-right">Store Balance</th>
                  <th className="p-3 text-center">Readiness</th>
                  {canManage && <th className="p-3 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]/60">
                {collectItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-500">
                      No components available in store for this selection.
                    </td>
                  </tr>
                ) : (
                  collectItems.map((item) => {
                    const toCollect = Math.min(item.plannedRequirement, item.presentStock);
                    const isFullyCovered = item.presentStock >= item.plannedRequirement;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.04] bg-emerald-500/[0.03] transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-950 dark:text-white">
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30 font-bold">
                            {item.itemCode}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-slate-950 dark:text-white">
                          {item.partValue || '-'}
                        </td>
                        <td className="p-3 text-slate-700 dark:text-slate-400 font-medium">
                          {item.package || 'TH'}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-800 dark:text-slate-300">
                          {item.reference || '-'}
                        </td>
                        <td className="p-3 text-right font-mono font-black text-sm text-emerald-700 dark:text-emerald-400">
                          {toCollect} {item.unit}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-800 dark:text-slate-400">
                          {item.presentStock} {item.unit}
                        </td>
                        <td className="p-3 text-center">
                          {isFullyCovered ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              100% In-Stock
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              Partial ({item.presentStock} / {item.plannedRequirement})
                            </span>
                          )}
                        </td>
                        {canManage && (
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleOpenEditModal(item)}
                              className="btn-ghost text-xs p-1 text-slate-300 hover:text-white"
                              title="Edit component or update stock"
                            >
                              <Edit3 size={13} className="text-crm-blue" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 3: COMPLETE ENGINEERING BOM TABLE ──────────────────────── */}
      {activeTab === 'full_bom' && (
        <div className="space-y-3">
          <div className="border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-hidden bg-slate-100 dark:bg-[#141722] shadow-xl">
            <div className="overflow-x-auto max-h-[650px] scrollbar-thin scrollbar-thumb-crm-blue/70 scrollbar-track-[#181B26]">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-[#1E2230] text-slate-300 border-b border-slate-200 dark:border-[#2A3042] sticky top-0 z-10">
                  <tr>
                    <th className="p-2.5 text-left">Project</th>
                    <th className="p-2.5 text-center">Circuit Tag</th>
                    <th className="p-2.5 text-left">Item Code</th>
                    <th className="p-2.5 text-left">Part Specs</th>
                    <th className="p-2.5 text-left">Package</th>
                    <th className="p-2.5 text-center">Unit</th>
                    <th className="p-2.5 text-right">BOM/Unit</th>
                    <th className="p-2.5 text-right">Batch Qty</th>
                    <th className="p-2.5 text-right text-amber-300 font-bold">Planned Req.</th>
                    <th className="p-2.5 text-right text-emerald-400 font-bold">Present Stock</th>
                    <th className="p-2.5 text-right text-crm-coral font-bold">Shortage</th>
                    <th className="p-2.5 text-center">Status</th>
                    {canManage && <th className="p-2.5 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A3042]/60">
                  {positions.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="p-10 text-center text-slate-500">
                        No BOM positions found for this product. Click "Company Component Library (Fast Add)" to add components.
                      </td>
                    </tr>
                  ) : (
                    positions.map((p) => {
                      const hasShortage = p.shortage > 0;

                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-white/[0.04] transition-colors ${hasShortage ? 'bg-red-500/[0.04]' : 'bg-emerald-500/[0.02]'}`}
                        >
                          <td className="p-2.5 font-bold text-slate-950 dark:text-white whitespace-nowrap">{p.project}</td>
                          <td className="p-2.5 text-center font-mono text-slate-300">{p.reference || '-'}</td>
                          <td className="p-2.5 font-mono font-bold text-crm-blue-light">{p.itemCode}</td>
                          <td className="p-2.5 text-white max-w-xs truncate" title={p.partValue || ''}>{p.partValue || '-'}</td>
                          <td className="p-2.5 text-slate-400">{p.package || 'TH'}</td>
                          <td className="p-2.5 text-center text-slate-400">{p.unit}</td>
                          <td className="p-2.5 text-right font-medium text-slate-300">{p.bomQtyPerUnit}</td>
                          <td className="p-2.5 text-right font-medium text-slate-300">{p.batchQty}</td>
                          <td className="p-2.5 text-right font-bold text-amber-300">{p.plannedRequirement}</td>
                          <td className="p-2.5 text-right font-bold text-emerald-400">{p.presentStock}</td>
                          <td className="p-2.5 text-right font-bold text-crm-coral">
                            {hasShortage ? p.shortage : '0'}
                          </td>
                          <td className="p-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${hasShortage ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 border border-red-300 dark:border-red-500/30 font-bold' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
                              {hasShortage ? 'Shortage' : 'Sufficient'}
                            </span>
                          </td>
                          {canManage && (
                            <td className="p-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleOpenEditModal(p)}
                                  className="p-1 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white rounded"
                                  title="Edit"
                                >
                                  <Edit3 size={13} />
                                </button>
                                {canDelete && (
                                  <button
                                    onClick={() => handleDeletePosition(p.id, p.itemCode)}
                                    className="p-1 text-slate-400 hover:text-crm-coral rounded"
                                    title="Delete"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD / EDIT SINGLE POSITION MODAL ────────────────────────────── */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto border-slate-200 dark:border-[#2A3042] shadow-2xl p-6 bg-white dark:bg-[#181B26]"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#2A3042] mb-5">
                <div>
                  <h2 className="text-lg font-black text-slate-950 dark:text-white">
                    {editingItem ? 'Edit Component Stock Position' : 'Add Component to Product BOM'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure component parameters & calculate whether to collect from store or buy from supplier
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSavePosition} className="space-y-4 text-xs">
                {/* Quick Auto-Fill from Company Component Library */}
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-crm-blue/15 to-crm-teal/15 border border-crm-blue/30 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-950 dark:text-white flex items-center gap-1.5">
                      <Sparkles size={14} className="text-amber-400" />
                      Instant Auto-Fill from Company Inventory Catalog
                    </span>
                    <span className="text-[10.5px] text-emerald-400 font-bold">
                      {skus.length} Company Parts Ready
                    </span>
                  </div>
                  <select
                    className="input text-xs w-full bg-slate-100 dark:bg-[#141722] text-white font-medium border-crm-blue/40"
                    value=""
                    onChange={(e) => {
                      const sku = skus.find((s) => s.id === e.target.value);
                      if (sku) {
                        const openStock = Number(sku.totalOnHand) || 0;
                        const bom = formData.bomQtyPerUnit || 1;
                        const batch = formData.batchQty || 1;
                        const planned = bom * batch;
                        const short = Math.max(0, planned - openStock);
                        let autoStatus = 'Sufficient';
                        if (short > 0 && openStock === 0) autoStatus = 'Critical Shortage';
                        else if (short > 0) autoStatus = 'Shortage';
                        else if (openStock >= planned * 1.5) autoStatus = 'Surplus';

                        setFormData((prev) => ({
                          ...prev,
                          itemCode: sku.skuCode,
                          partValue: sku.name,
                          package: sku.packageType || 'TH',
                          openingStock: openStock,
                          presentStock: openStock,
                          plannedRequirement: planned,
                          shortage: short,
                          status: autoStatus,
                          notes: prev.notes || `Company SKU: ${sku.skuCode} (${sku.category || 'General'})`,
                        }));
                      }
                    }}
                  >
                    <option value="">-- Click to pick any Component --</option>
                    {skus.map((sku) => (
                      <option key={sku.id} value={sku.id}>
                        {sku.skuCode} — {sku.name} ({sku.packageType || 'Unit'}) [Stock: {sku.totalOnHand || 0} Nos]
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Finished Product Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="Enter product / model name"
                      value={formData.project}
                      onChange={(e) => setFormData({ ...formData, project: e.target.value })}
                      className="input font-bold"
                    />
                  </div>

                  <div>
                    <label className="label">Circuit / PCB / BOM Tag</label>
                    <input
                      type="text"
                      placeholder="Enter tag or reference"
                      value={formData.reference}
                      onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                      className="input font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="label">Item Code / SKU *</label>
                    <input
                      type="text"
                      required
                      placeholder="Enter item code / SKU"
                      value={formData.itemCode}
                      onChange={(e) => setFormData({ ...formData, itemCode: e.target.value })}
                      className="input uppercase font-mono font-bold text-crm-blue-light"
                    />
                  </div>

                  <div>
                    <label className="label">Part Value / Specs</label>
                    <input
                      type="text"
                      placeholder="Enter part value / specifications"
                      value={formData.partValue}
                      onChange={(e) => setFormData({ ...formData, partValue: e.target.value })}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="label">Package / Mounting</label>
                    <input
                      type="text"
                      placeholder="Enter package type"
                      value={formData.package}
                      onChange={(e) => setFormData({ ...formData, package: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3.5 rounded-xl bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042]">
                  <div>
                    <label className="label">Base Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="label">Unit</label>
                    <select
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="input"
                    >
                      <option value="Nos">Nos</option>
                      <option value="Pcs">Pcs</option>
                      <option value="Sets">Sets</option>
                      <option value="Mtrs">Mtrs</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">BOM Qty / Unit</label>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      value={formData.bomQtyPerUnit}
                      onChange={(e) => handleFormNumberChange('bomQtyPerUnit', Number(e.target.value))}
                      className="input font-bold"
                    />
                  </div>

                  <div>
                    <label className="label">Batch Qty</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.batchQty}
                      onChange={(e) => handleFormNumberChange('batchQty', Number(e.target.value))}
                      className="input font-bold"
                    />
                  </div>
                </div>

                {/* Stock Inflow / Outflow */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3.5 rounded-xl bg-slate-100 dark:bg-[#141722] border border-slate-200 dark:border-[#2A3042]">
                  <div>
                    <label className="label">Opening Stock</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.openingStock}
                      onChange={(e) => handleFormNumberChange('openingStock', Number(e.target.value))}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="label text-emerald-400">Inflow (+)</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.inflow}
                      onChange={(e) => handleFormNumberChange('inflow', Number(e.target.value))}
                      className="input text-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="label text-crm-coral">Outflow (-)</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.outflow}
                      onChange={(e) => handleFormNumberChange('outflow', Number(e.target.value))}
                      className="input text-crm-coral"
                    />
                  </div>

                  <div>
                    <label className="label text-slate-400">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="input font-bold"
                    >
                      <option value="Sufficient">Sufficient</option>
                      <option value="Shortage">Shortage</option>
                      <option value="Critical Shortage">Critical Shortage</option>
                      <option value="Surplus">Surplus</option>
                    </select>
                  </div>
                </div>

                {/* Live Formula Preview Box */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1E2230] border border-crm-blue/30 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Planned Requirement:</span>
                    <span className="font-mono font-bold text-amber-300 text-sm">
                      {formData.plannedRequirement} {formData.unit}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Present Store Stock:</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {formData.presentStock} {formData.unit}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Quantity to BUY (Deficit):</span>
                    <span className={`font-mono font-black text-sm ${formData.shortage > 0 ? 'text-crm-coral' : 'text-slate-400'}`}>
                      {formData.shortage > 0 ? `${formData.shortage} ${formData.unit}` : '0 (Covered)'}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="label">Procurement Remarks / Supplier PO Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Enter procurement remarks / notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-[#2A3042]">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary text-xs px-5 shadow-glow-blue font-bold"
                  >
                    {editingItem ? 'Update Component Position' : 'Save to Product BOM'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── COMPANY COMPONENT LIBRARY & FAST BOM BUILDER MODAL ───────── */}
      <CompanyComponentLibraryModal
        isOpen={showComponentLibrary}
        onClose={() => setShowComponentLibrary(false)}
        skus={skus}
        projectsList={projectsList}
        defaultProject={selectedProject}
        onAddedSuccess={fetchData}
      />

      {/* ─── IN-APP CLEAR ALL INVENTORY POPUP MODAL ────────────────────── */}
      <AnimatePresence>
        {showClearModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-950 dark:text-white">Clear All Inventory Fresh?</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    This will permanently clear all demo inventory data, project stock positions, stock movements, and test items so you can start completely fresh.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] text-red-300 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0 text-red-400" />
                <span>Existing invoices and confirmed orders will keep their historical records intact.</span>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={clearing}
                  onClick={() => setShowClearModal(false)}
                  className="btn-ghost text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={clearing}
                  onClick={async () => {
                    setClearing(true);
                    try {
                      await inventoryApi.clearAll();
                      await fetchData();
                      setShowClearModal(false);
                    } catch (err: any) {
                      alert('Failed to clear inventory: ' + (err?.response?.data?.message || err.message));
                    } finally {
                      setClearing(false);
                    }
                  }}
                  className="btn bg-red-600 hover:bg-red-500 text-white text-xs px-5 shadow-glow-coral flex items-center gap-1.5"
                >
                  <Trash2 size={13} />
                  {clearing ? 'Clearing Fresh...' : 'Yes, Clear All Fresh'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
