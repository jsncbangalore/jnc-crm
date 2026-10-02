import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Boxes,
  Layers,
  Building2,
  Receipt,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Percent,
  Trash2,
  Eye,
  Tag,
  Download,
  Upload,
  RefreshCw,
  X,
  FileSpreadsheet,
  ShoppingCart,
  Check,
  PackageCheck,
  ArrowRight,
  Sparkles,
  Edit3,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SlidersHorizontal,
  Zap,
  Coins,
  Calculator,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { inventoryApi } from '../services/api';
import { Sku, ProjectStockPosition } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { AddComponentModal } from '../components/inventory/AddComponentModal';
import { EditComponentModal } from '../components/inventory/EditComponentModal';
import { BulkEditComponentsModal } from '../components/inventory/BulkEditComponentsModal';
import { RecordComponentPurchaseModal } from '../components/inventory/RecordComponentPurchaseModal';
import { RecordPurchaseModal } from '../components/inventory/RecordPurchaseModal';
import { BulkExcelImportModal } from '../components/inventory/BulkExcelImportModal';
import { PurchaseBillsHub } from '../components/inventory/PurchaseBillsHub';
import { RestockComponentModal } from '../components/inventory/RestockComponentModal';

export interface BuyListItem {
  id: string;
  skuCode: string;
  name: string;
  project: string;
  supplier: string;
  currentStock: number;
  quantityToBuy: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  rawPosition?: ProjectStockPosition;
}

export default function InventoryPage() {
  const { user } = useAuth();
  const canDelete = user?.role === 'super_admin' || user?.role === 'admin';
  const canManage = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'sub_admin';

  // Active View Tab: 'master_stock' | 'buy_list' | 'bills_hub'
  const [activeTab, setActiveTab] = useState<'master_stock' | 'buy_list' | 'bills_hub'>('master_stock');

  // Table Density & Scrolling Navigator
  const [density, setDensity] = useState<'compact' | 'normal'>('normal');
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const buyListTableContainerRef = useRef<HTMLDivElement>(null);

  const [skus, setSkus] = useState<Sku[]>([]);
  const [positions, setPositions] = useState<ProjectStockPosition[]>([]);
  const [loading, setLoading] = useState(true);

  // Buy List / Procurement Cart State
  const [buyList, setBuyList] = useState<BuyListItem[]>(() => {
    try {
      const saved = localStorage.getItem('jnc_inventory_buy_list');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Save Buy List to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('jnc_inventory_buy_list', JSON.stringify(buyList));
    } catch {}
  }, [buyList]);

  // Filters
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [shortageOnly, setShortageOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals
  const [showAddComponentModal, setShowAddComponentModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [restockItem, setRestockItem] = useState<any | null>(null);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showRecordPurchaseModal, setShowRecordPurchaseModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [purchaseItem, setPurchaseItem] = useState<ProjectStockPosition | null>(null);
  const [previewDocUrl, setPreviewDocUrl] = useState<string | null>(null);
  const [previewDocTitle, setPreviewDocTitle] = useState<string>('');

  // Secure Wipe Modal
  const [showClearModal, setShowClearModal] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  // In-App Custom Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText: string;
    danger?: boolean;
    onConfirm: () => Promise<void> | void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    confirmText: 'Confirm',
    danger: false,
    onConfirm: () => {},
  });

  // Scroll Table Pan Navigation
  const scrollTable = (direction: 'start' | 'left' | 'right' | 'end') => {
    if (!tableContainerRef.current) return;
    const container = tableContainerRef.current;
    if (direction === 'start') {
      container.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (direction === 'left') {
      container.scrollBy({ left: -320, behavior: 'smooth' });
    } else if (direction === 'right') {
      container.scrollBy({ left: 320, behavior: 'smooth' });
    } else if (direction === 'end') {
      container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' });
    }
  };

  const scrollBuyListTable = (direction: 'start' | 'left' | 'right' | 'end') => {
    if (!buyListTableContainerRef.current) return;
    const container = buyListTableContainerRef.current;
    if (direction === 'start') {
      container.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (direction === 'left') {
      container.scrollBy({ left: -320, behavior: 'smooth' });
    } else if (direction === 'right') {
      container.scrollBy({ left: 320, behavior: 'smooth' });
    } else if (direction === 'end') {
      container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' });
    }
  };

  // Fetch Data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [skusRes, posRes] = await Promise.all([
        inventoryApi.getSkus(),
        inventoryApi.getProjectStock(),
      ]);

      const skusList = Array.isArray(skusRes.data)
        ? skusRes.data
        : Array.isArray(skusRes.data?.skus)
        ? skusRes.data.skus
        : [];

      const posList = Array.isArray(posRes.data?.items)
        ? posRes.data.items
        : Array.isArray(posRes.data?.data)
        ? posRes.data.data
        : Array.isArray(posRes.data)
        ? posRes.data
        : [];

      setSkus(skusList);
      setPositions(posList);
    } catch (err: any) {
      console.error('Failed to load inventory data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Distinct Projects List
  const existingProjects = useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(positions)) {
      positions.forEach((p) => {
        if (p?.project) set.add(p.project);
      });
    }
    return Array.from(set);
  }, [positions]);

  // Combined Master Component View List
  const combinedComponents = useMemo(() => {
    const items: Array<{
      id: string;
      skuId?: string;
      positionId?: string;
      skuCode: string;
      name: string;
      project: string;
      supplier: string;
      packageType: string;
      quantityOnHand: number;
      plannedRequirement: number;
      shortage: number;
      unit: string;
      unitPrice: number;
      taxRate: number;
      gstAmount: number;
      totalWithGst: number;
      documentUrl?: string | null;
      notes?: string | null;
      isLowStock: boolean;
      rawPosition?: ProjectStockPosition;
    }> = [];

    // Map each ProjectStockPosition
    if (Array.isArray(positions)) {
      positions.forEach((pos) => {
        if (!pos) return;
        const matchedSku = Array.isArray(skus)
          ? skus.find(
              (s) =>
                (s?.skuCode && pos?.itemCode && s.skuCode.toLowerCase() === pos.itemCode.toLowerCase()) ||
                (s?.name && pos?.partValue && s.name.toLowerCase() === pos.partValue.toLowerCase())
            )
          : undefined;

        const baseRate = Number(matchedSku?.costPrice || matchedSku?.unitPrice || 5.0);
        const taxRate = Number(matchedSku?.taxRate ?? 18);
        const gstAmount = Number(((baseRate * taxRate) / 100).toFixed(2));
        const totalWithGst = Number((baseRate + gstAmount).toFixed(2));

        let extractedDoc: string | null = null;
        if (pos.notes && typeof pos.notes === 'string' && pos.notes.includes('data:image')) {
          const match = pos.notes.match(/data:image[^"'\s]+/);
          if (match) extractedDoc = match[0];
        }

        const present = Number(pos.presentStock ?? pos.openingStock ?? 0);
        const planned = Number(pos.plannedRequirement || 50);
        const shortage = Number(pos.shortage ?? Math.max(0, planned - present));

        items.push({
          id: pos.id || `pos-${Math.random()}`,
          positionId: pos.id,
          skuId: matchedSku?.id,
          skuCode: pos.itemCode || matchedSku?.skuCode || 'ITEM',
          name: pos.partValue || matchedSku?.name || pos.itemCode || 'Component',
          project: pos.project || 'General Inventory',
          supplier: matchedSku?.preferredSupplier?.name || 'Direct / Authorized Supplier',
          packageType: pos.package || matchedSku?.packageType || '0805',
          quantityOnHand: present,
          plannedRequirement: planned,
          shortage: shortage,
          unit: pos.unit || 'Nos',
          unitPrice: baseRate,
          taxRate: taxRate,
          gstAmount: gstAmount,
          totalWithGst: totalWithGst,
          documentUrl: extractedDoc,
          notes: pos.notes,
          isLowStock: shortage > 0 || present <= 10,
          rawPosition: pos,
        });
      });
    }

    // Add standalone SKUs
    if (Array.isArray(skus)) {
      skus.forEach((sku) => {
        if (!sku) return;
        const alreadyIncluded = items.some(
          (it) => it.skuCode && sku.skuCode && it.skuCode.toLowerCase() === sku.skuCode.toLowerCase()
        );
        if (!alreadyIncluded) {
          const baseRate = Number(sku.costPrice || sku.unitPrice || 5.0);
          const taxRate = Number(sku.taxRate ?? 18);
          const gstAmount = Number(((baseRate * taxRate) / 100).toFixed(2));
          const totalWithGst = Number((baseRate + gstAmount).toFixed(2));
          const onHand = Number(sku.totalOnHand || 20);
          const reorderPt = Number(sku.reorderPoint || 10);

          items.push({
            id: sku.id || `sku-${Math.random()}`,
            skuId: sku.id,
            skuCode: sku.skuCode || 'SKU',
            name: sku.name || 'Component Item',
            project: sku.category ? `${sku.category} System` : 'General Catalog',
            supplier: sku.preferredSupplier?.name || 'Authorized Supplier',
            packageType: sku.packageType || '0805',
            quantityOnHand: onHand,
            plannedRequirement: Number(sku.reorderQty || 50),
            shortage: onHand < reorderPt ? reorderPt - onHand : 0,
            unit: sku.packageType || 'Nos',
            unitPrice: baseRate,
            taxRate: taxRate,
            gstAmount: gstAmount,
            totalWithGst: totalWithGst,
            notes: null,
            isLowStock: onHand < reorderPt,
          });
        }
      });
    }

    return items;
  }, [positions, skus]);

  // Filtered List
  const filteredList = useMemo(() => {
    return combinedComponents.filter((item) => {
      if (projectFilter !== 'all' && item.project !== projectFilter) return false;
      if (shortageOnly && !item.isLowStock) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          item.name.toLowerCase().includes(q) ||
          item.skuCode.toLowerCase().includes(q) ||
          item.project.toLowerCase().includes(q) ||
          item.supplier.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [combinedComponents, projectFilter, shortageOnly, search]);

  // Selected Items list for bulk actions
  const selectedItemsList = useMemo(() => {
    return combinedComponents.filter((it) => selectedIds.includes(it.id));
  }, [combinedComponents, selectedIds]);

  // Summary Metrics for Master Stock (Focus on physical counts, not amounts)
  const totalComponentsCount = combinedComponents.length;
  const totalStockUnits = combinedComponents.reduce((sum, it) => sum + (it.quantityOnHand || 0), 0);
  const totalShortagesCount = combinedComponents.filter((it) => it.isLowStock).length;
  const totalProjectsCount = existingProjects.length;

  // Summary Metrics for Buy List (Financial totals reside here!)
  const buyListUnitsCount = buyList.reduce((sum, it) => sum + (Number(it.quantityToBuy) || 0), 0);
  const buyListBaseTotal = buyList.reduce(
    (sum, it) => sum + (Number(it.quantityToBuy) || 0) * it.unitPrice,
    0
  );
  const buyListGstTotal = buyList.reduce(
    (sum, it) => sum + ((Number(it.quantityToBuy) || 0) * it.unitPrice * it.taxRate) / 100,
    0
  );
  const buyListGrandTotal = buyListBaseTotal + buyListGstTotal;

  // Toggle Add / Remove (Un-Add) from Buy List
  const handleToggleBuyList = (item: any, customQty?: number) => {
    setBuyList((prev) => {
      const existingIdx = prev.findIndex(
        (x) => x.skuCode === item.skuCode && x.project === item.project
      );
      if (existingIdx !== -1) {
        // Un-add / Remove from Buy List
        return prev.filter((_, idx) => idx !== existingIdx);
      } else {
        // Add to Buy List
        const qty = customQty || (item.shortage > 0 ? item.shortage : Math.max(10, item.plannedRequirement || 50));
        return [
          ...prev,
          {
            id: item.id,
            skuCode: item.skuCode,
            name: item.name,
            project: item.project,
            supplier: item.supplier,
            currentStock: item.quantityOnHand,
            quantityToBuy: qty,
            unit: item.unit,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            rawPosition: item.rawPosition,
          },
        ];
      }
    });
  };

  const handleAddToBuyList = (item: any, customQty?: number) => {
    handleToggleBuyList(item, customQty);
  };

  // Add Multiple Selected to Buy List
  const handleAddSelectedToBuyList = () => {
    selectedItemsList.forEach((item) => {
      handleAddToBuyList(item);
    });
    setSelectedIds([]);
    setActiveTab('buy_list');
  };

  // Auto-Add All Shortages to Buy List
  const handleAddAllShortagesToBuyList = () => {
    const deficitItems = combinedComponents.filter((it) => it.isLowStock);
    deficitItems.forEach((item) => {
      handleAddToBuyList(item);
    });
    setActiveTab('buy_list');
  };

  // Remove from Buy List
  const handleRemoveFromBuyList = (index: number) => {
    setBuyList((prev) => prev.filter((_, i) => i !== index));
  };

  // Download Supplier PO (Excel .xlsx)
  const handleDownloadPoExcel = () => {
    if (buyList.length === 0) return;
    const rows = buyList.map((it, idx) => {
      const base = it.quantityToBuy * it.unitPrice;
      const gst = (base * it.taxRate) / 100;
      return {
        'Sl No': idx + 1,
        'SKU Code': it.skuCode,
        'Component Description': it.name,
        'Project / System': it.project,
        'Target Supplier': it.supplier,
        'Order Qty': it.quantityToBuy,
        'Unit': it.unit,
        'Unit Rate (₹)': it.unitPrice,
        'Base Amount (₹)': base,
        'GST Rate': `${it.taxRate}%`,
        'GST Amount (₹)': Math.round(gst),
        'Total with GST (₹)': Math.round(base + gst),
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Purchase_Order_List');
    XLSX.writeFile(wb, `JNC_Procurement_Purchase_Order_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Download Supplier PO (CSV)
  const handleDownloadPoCsv = () => {
    if (buyList.length === 0) return;
    const rows = buyList.map((it, idx) => {
      const base = it.quantityToBuy * it.unitPrice;
      const gst = (base * it.taxRate) / 100;
      return {
        'Sl No': idx + 1,
        'SKU Code': it.skuCode,
        'Component Description': it.name,
        'Project / System': it.project,
        'Target Supplier': it.supplier,
        'Order Qty': it.quantityToBuy,
        'Unit': it.unit,
        'Unit Rate (₹)': it.unitPrice,
        'Base Amount (₹)': base,
        'GST Rate': `${it.taxRate}%`,
        'GST Amount (₹)': Math.round(gst),
        'Total with GST (₹)': Math.round(base + gst),
      };
    });
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `JNC_Procurement_Purchase_Order_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  // Bulk Delete
  const handleBulkDelete = () => {
    if (!canDelete || selectedIds.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: `Delete ${selectedIds.length} Selected Components?`,
      description: `Are you sure you want to permanently delete ${selectedIds.length} selected components from inventory? This action cannot be undone.`,
      confirmText: `Delete ${selectedIds.length} Items`,
      danger: true,
      onConfirm: async () => {
        try {
          for (const id of selectedIds) {
            const item = combinedComponents.find((it) => it.id === id);
            if (item?.positionId) {
              await inventoryApi.deleteProjectStockPosition(item.positionId);
            } else if (item?.skuId) {
              await inventoryApi.deleteSku(item.skuId);
            }
          }
          setSelectedIds([]);
          await fetchData();
        } catch (err: any) {
          console.error('Delete failed:', err);
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // Select All
  const handleSelectAll = () => {
    if (selectedIds.length === filteredList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredList.map((it) => it.id));
    }
  };

  return (
    <div className="space-y-5">
      {/* ─── TOP WORKFLOW NAVIGATION TABS ──────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-[#2A3042] pb-4 flex-wrap">
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#141722] p-1.5 rounded-2xl border border-slate-200 dark:border-[#2A3042]">
          {/* Tab 1: Master Stock */}
          <button
            onClick={() => setActiveTab('master_stock')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'master_stock'
                ? 'bg-crm-blue text-white shadow-glow-blue'
                : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/5'
            }`}
          >
            <Boxes size={15} />
            <span>Stock Master ({totalComponentsCount})</span>
          </button>

          {/* Tab 2: Procurement Buy List */}
          <button
            onClick={() => setActiveTab('buy_list')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'buy_list'
                ? 'bg-crm-blue text-white shadow-glow-blue'
                : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/5'
            }`}
          >
            <ShoppingCart size={15} />
            <span>Procurement Cart</span>
            {buyList.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${activeTab === 'buy_list' ? 'bg-white text-crm-blue' : 'bg-crm-blue text-white'}`}>
                {buyList.length}
              </span>
            )}
          </button>

          {/* Tab 3: Purchase Bills & Soft Copies Hub */}
          <button
            onClick={() => setActiveTab('bills_hub')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'bills_hub'
                ? 'bg-crm-blue text-white shadow-glow-blue'
                : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/5'
            }`}
          >
            <Receipt size={15} />
            <span>Purchase Bills & Archive</span>
          </button>
        </div>

        {/* Quick Shortage Alert Link */}
        {totalShortagesCount > 0 && activeTab === 'master_stock' && (
          <button
            onClick={handleAddAllShortagesToBuyList}
            className="btn bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30 text-xs px-3.5 py-2 font-bold gap-1.5 shadow-sm"
          >
            <Sparkles size={14} className="text-amber-600 dark:text-amber-400" />
            <span>Queue {totalShortagesCount} Deficits to Buy List</span>
          </button>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ─── VIEW 1: MASTER COMPONENT STOCK (PHYSICAL TRACKING - NO AMOUNTS) ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'master_stock' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* KPI CARDS (Focused on physical inventory) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            {/* Card 1: Total Components */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">
                  Total Components
                </span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-crm-blue/15 text-crm-blue flex items-center justify-center border border-blue-200 dark:border-transparent">
                  <Boxes size={16} />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-950 dark:text-white mt-2 tabular-nums font-mono">
                {totalComponentsCount}
              </p>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Master Catalog SKUs</span>
            </div>

            {/* Card 2: Total Store Stock */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">
                  Total Store Stock
                </span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-transparent">
                  <PackageCheck size={16} />
                </div>
              </div>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-2 tabular-nums font-mono">
                {totalStockUnits.toLocaleString('en-IN')}
              </p>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Physical items in warehouse</span>
            </div>

            {/* Card 3: Active Systems & BOMs */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">
                  Active Projects / BOMs
                </span>
                <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-200 dark:border-transparent">
                  <Layers size={16} />
                </div>
              </div>
              <p className="text-2xl font-black text-purple-700 dark:text-purple-400 mt-2 tabular-nums font-mono">
                {totalProjectsCount} Systems
              </p>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Loaded Electronic Boards</span>
            </div>

            {/* Card 4: Deficits / To Restock */}
            <div
              onClick={() => setShortageOnly(!shortageOnly)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all shadow-sm flex flex-col justify-between ${
                shortageOnly
                  ? 'bg-red-50 dark:bg-red-500/15 border-red-300 dark:border-red-500/40 ring-1 ring-red-400 shadow-glow-coral'
                  : totalShortagesCount > 0
                  ? 'bg-white dark:bg-[#181B26] border-slate-200 dark:border-[#2A3042] hover:border-red-300 hover:bg-red-50/40 dark:hover:bg-red-500/5'
                  : 'bg-white dark:bg-[#181B26] border-slate-200 dark:border-[#2A3042]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">
                  Shortages / Restock
                </span>
                <div className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center border border-red-200 dark:border-transparent">
                  <AlertTriangle size={16} />
                </div>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <p className={`text-2xl font-black tabular-nums font-mono ${totalShortagesCount > 0 ? 'text-red-700 dark:text-crm-coral' : 'text-slate-700 dark:text-slate-400'}`}>
                  {totalShortagesCount}
                </p>
                {totalShortagesCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300 border border-red-200 dark:border-red-500/30">
                    Deficit Items
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                {shortageOnly ? 'Filter Active (Click to Show All)' : 'Click to filter shortages'}
              </span>
            </div>
          </div>

          {/* CONTROLS & ACTION BAR */}
          <div className="flex items-center justify-between gap-3 flex-wrap bg-white dark:bg-[#181B26] p-3 rounded-2xl border border-slate-200 dark:border-[#2A3042] shadow-sm">
            <div className="flex items-center gap-2.5 flex-1 min-w-[280px] flex-wrap">
              {/* Search Box */}
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Search component name, SKU code, project..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input pl-9 text-xs"
                />
              </div>

              {/* Project Filter */}
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="input text-xs font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-[#1E2230] max-w-[220px]"
              >
                <option value="all">All Projects ({existingProjects.length})</option>
                {existingProjects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              {/* Quick Select All / Deselect Toggle */}
              <button
                type="button"
                onClick={handleSelectAll}
                className={`btn text-xs px-3 py-2 font-bold transition-all flex items-center gap-1.5 ${
                  selectedIds.length === filteredList.length && filteredList.length > 0
                    ? 'bg-crm-blue text-white shadow-glow-blue'
                    : 'bg-slate-100 dark:bg-[#1E2230] text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-[#2A3042]'
                }`}
                title="Toggle selection for all visible components"
              >
                <Check size={13} />
                <span>
                  {selectedIds.length === filteredList.length && filteredList.length > 0
                    ? `Deselect All (${filteredList.length})`
                    : `Select All (${filteredList.length})`}
                </span>
              </button>
            </div>

            {/* Action Buttons & Bulk Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {canManage && (
                <>
                  <button
                    onClick={() => setShowAddComponentModal(true)}
                    className="btn-primary text-xs font-bold gap-1.5 px-4 py-2 shadow-glow-blue"
                  >
                    <Plus size={14} /> Add Component
                  </button>

                  <button
                    onClick={() => setShowRecordPurchaseModal(true)}
                    className="btn bg-white dark:bg-[#1E2230] hover:bg-slate-100 dark:hover:bg-[#202534] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-[#2A3042] text-xs gap-1.5 font-bold px-3.5 py-2 shadow-sm"
                  >
                    <Receipt size={14} className="text-crm-blue" /> Record Purchase
                  </button>

                  <button
                    onClick={() => setShowBulkImportModal(true)}
                    className="btn bg-white dark:bg-[#1E2230] hover:bg-slate-100 dark:hover:bg-[#202534] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-[#2A3042] text-xs gap-1.5 font-bold px-3.5 py-2 shadow-sm"
                  >
                    <FileSpreadsheet size={14} className="text-emerald-600 dark:text-emerald-400" /> Bulk Import
                  </button>

                  <button
                    onClick={() => {
                      if (selectedIds.length === 0) {
                        setSelectedIds(filteredList.map((it) => it.id));
                      }
                      setShowBulkEditModal(true);
                    }}
                    className="btn bg-white dark:bg-[#1E2230] hover:bg-slate-100 dark:hover:bg-[#202534] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-[#2A3042] text-xs gap-1.5 font-bold px-3.5 py-2 shadow-sm"
                    title="Bulk edit project, supplier, unit, price, and GST on selected items"
                  >
                    <Edit3 size={13} className="text-purple-600 dark:text-crm-violet-light" />
                    <span>
                      {selectedIds.length > 0
                        ? `Bulk Edit (${selectedIds.length})`
                        : 'Bulk Edit'}
                    </span>
                  </button>
                </>
              )}

              {user?.role === 'super_admin' && (
                <button
                  onClick={() => {
                    setWipeConfirmText('');
                    setShowClearModal(true);
                  }}
                  className="btn bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30 text-xs px-3 py-2 font-bold gap-1 shadow-sm"
                  title="Super Admin Only"
                >
                  <Trash2 size={13} /> Wipe Data
                </button>
              )}
            </div>
          </div>

          {/* Prominent Bulk Selection Action Bar when items are selected */}
          {selectedIds.length > 0 && (
            <div className="p-3 rounded-2xl bg-crm-violet/15 border border-crm-violet/40 flex items-center justify-between flex-wrap gap-3 shadow-glow-violet animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-crm-violet animate-pulse" />
                <span className="text-xs font-black text-slate-950 dark:text-white">
                  {selectedIds.length} of {filteredList.length} Components Selected
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {canManage && (
                  <button
                    onClick={() => setShowBulkEditModal(true)}
                    className="btn bg-crm-violet hover:bg-crm-violet-light text-white text-xs px-3.5 py-1.5 font-bold gap-1.5 shadow-sm"
                  >
                    <Edit3 size={13} /> Bulk Edit ({selectedIds.length})
                  </button>
                )}
                <button
                  onClick={handleAddSelectedToBuyList}
                  className="btn bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3.5 py-1.5 font-bold gap-1.5 shadow-sm"
                >
                  <ShoppingCart size={13} /> Add {selectedIds.length} to Buy List
                </button>
                {canDelete && (
                  <button
                    onClick={handleBulkDelete}
                    className="btn bg-crm-coral hover:bg-crm-coral-hover text-white text-xs px-3 py-1.5 font-bold gap-1.5 shadow-sm"
                  >
                    <Trash2 size={13} /> Delete {selectedIds.length}
                  </button>
                )}
                <button
                  onClick={() => setSelectedIds([])}
                  className="btn-ghost text-xs text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white font-bold px-2.5 py-1"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* ─── TOP TABLE NAVIGATOR TOOLBAR (Scroll or Pan) ────────────────── */}
          <div className="flex items-center justify-between bg-white dark:bg-[#181B26] p-2 rounded-xl border border-slate-200 dark:border-[#2A3042] flex-wrap gap-2 text-xs shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-700 dark:text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <SlidersHorizontal size={12} className="text-crm-blue" />
                Table Navigator (Scroll or Pan):
              </span>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141722] p-0.5 rounded-lg border border-slate-200 dark:border-[#2A3042]">
                <button
                  type="button"
                  onClick={() => setDensity('compact')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                    density === 'compact' ? 'bg-crm-blue text-white shadow-sm' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  Compact
                </button>
                <button
                  type="button"
                  onClick={() => setDensity('normal')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                    density === 'normal' ? 'bg-crm-blue text-white shadow-sm' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  Normal
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => scrollTable('start')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-white/10 hover:border-crm-blue text-slate-800 dark:text-slate-300 flex items-center gap-1 font-bold shadow-sm"
                title="Scroll to Start (Component & SKU)"
              >
                <ChevronsLeft size={13} /> Start (Component & SKU)
              </button>
              <button
                type="button"
                onClick={() => scrollTable('left')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-[#2A3042] hover:border-crm-blue text-slate-800 dark:text-white flex items-center gap-1 font-bold shadow-sm"
                title="Pan Left"
              >
                <ChevronLeft size={13} /> Left
              </button>
              <button
                type="button"
                onClick={() => scrollTable('right')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-[#2A3042] hover:border-crm-blue text-slate-800 dark:text-white flex items-center gap-1 font-bold shadow-sm"
                title="Pan Right"
              >
                Right <ChevronRight size={13} />
              </button>
              <button
                type="button"
                onClick={() => scrollTable('end')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-white/10 hover:border-amber-500 text-amber-700 dark:text-crm-amber flex items-center gap-1 font-bold shadow-sm"
                title="Scroll to End (Actions & Add List)"
              >
                End (Actions & Bill) <ChevronsRight size={13} />
              </button>
            </div>
          </div>

          {/* MASTER TABLE (NO PRICING AMOUNTS - CLEAN INVENTORY VIEW) */}
          <div className="table-wrapper border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-hidden shadow-2xl bg-white dark:bg-[#141722]">
            <div
              ref={tableContainerRef}
              className="overflow-x-auto max-h-[680px] scrollbar-thin scrollbar-thumb-crm-blue/70 hover:scrollbar-thumb-crm-blue scrollbar-track-[#181B26]"
            >
              <table className={`table-auto border-collapse w-full ${density === 'compact' ? 'text-[11px]' : 'text-xs'}`}>
                <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-[#181B26] border-b border-slate-300 dark:border-[#2A3042] text-slate-800 dark:text-slate-300 font-bold shadow-sm">
                  <tr>
                    {canDelete && (
                      <th className={`w-8 text-center border-r border-slate-200 dark:border-[#2A3042]/60 ${density === 'compact' ? 'p-1.5' : 'p-2.5'}`}>
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-crm-blue focus:ring-crm-blue cursor-pointer"
                          checked={filteredList.length > 0 && selectedIds.length === filteredList.length}
                          onChange={handleSelectAll}
                        />
                      </th>
                    )}
                    <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[200px] ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                      Component & SKU
                    </th>
                    <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[180px] ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                      Loaded For / Project
                    </th>
                    <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[160px] ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                      Supplier / Bought From
                    </th>
                    <th className={`text-center font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                      Package
                    </th>
                    <th className={`text-right font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                      Stock On-Hand
                    </th>
                    <th className={`text-center font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                      GST Invoice
                    </th>
                    <th className={`text-right font-bold whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]/40">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-400">
                        <RefreshCw size={20} className="animate-spin mx-auto text-crm-blue mb-2" />
                        <span>Loading components inventory...</span>
                      </td>
                    </tr>
                  ) : filteredList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-400">
                        <Boxes size={32} className="mx-auto text-slate-600 mb-2" />
                        <p className="font-bold text-slate-950 dark:text-white">No components found</p>
                      </td>
                    </tr>
                  ) : (
                    filteredList.map((item, idx) => {
                      const isSelected = selectedIds.includes(item.id);
                      const isInBuyList = buyList.some(
                        (x) => x.skuCode === item.skuCode && x.project === item.project
                      );

                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            isSelected ? 'bg-slate-100 dark:bg-white/[0.04]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                          }`}
                        >
                          {canDelete && (
                            <td className={`text-center border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'p-1.5' : 'p-2.5'}`} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="rounded border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-crm-blue focus:ring-crm-blue cursor-pointer"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedIds((prev) =>
                                    prev.includes(item.id)
                                      ? prev.filter((x) => x !== item.id)
                                      : [...prev, item.id]
                                  );
                                }}
                              />
                            </td>
                          )}

                          {/* Component Name & SKU */}
                          <td className={`border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                            <div>
                              <div className="font-bold text-slate-950 dark:text-white leading-tight">{item.name}</div>
                              <div className="font-mono text-[11px] text-purple-700 dark:text-crm-violet-light font-bold flex items-center gap-1 mt-0.5">
                                <Tag size={10} className="text-teal-600 dark:text-crm-teal" />
                                {item.skuCode}
                              </div>
                            </div>
                          </td>

                          {/* Project Name */}
                          <td className={`border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                            <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] text-crm-blue inline-flex items-center gap-1.5 max-w-[200px] truncate">
                              <Layers size={11} className="shrink-0" /> {item.project}
                            </span>
                          </td>

                          {/* Supplier */}
                          <td className={`text-slate-800 dark:text-slate-300 font-medium border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                            <div className="flex items-center gap-1.5">
                              <Building2 size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span className="truncate max-w-[160px] font-medium">{item.supplier}</span>
                            </div>
                          </td>

                          {/* Package */}
                          <td className={`text-center font-mono border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                            <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-black/30 border border-slate-300 dark:border-white/5 text-slate-800 dark:text-slate-300 font-bold text-[10.5px]">
                              {item.packageType}
                            </span>
                          </td>

                          {/* Stock On-Hand */}
                          <td className={`text-right border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                            <div className="font-mono font-bold text-slate-950 dark:text-white">
                              {item.quantityOnHand} {item.unit}
                            </div>
                            {item.isLowStock && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 border border-red-300 dark:border-red-500/30 font-bold">
                                Deficit: {item.shortage}
                              </span>
                            )}
                          </td>

                          {/* GST Invoice Document */}
                          <td className={`text-center border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                            {item.documentUrl ? (
                              <button
                                onClick={() => {
                                  setPreviewDocUrl(item.documentUrl || null);
                                  setPreviewDocTitle(`${item.name} - Purchase GST Invoice`);
                                }}
                                className="px-2 py-1 rounded bg-crm-blue/15 hover:bg-crm-blue/25 text-crm-blue border border-crm-blue/30 text-[11px] font-bold inline-flex items-center gap-1 shadow-sm transition-all"
                              >
                                <Eye size={12} /> View Bill
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-600 dark:text-slate-400 italic font-bold">No bill</span>
                            )}
                          </td>

                          {/* Actions: Add List, Restock, Edit & Delete */}
                          <td className={`text-right whitespace-nowrap min-w-[210px] ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                            <div className="flex items-center justify-end gap-1.5 min-w-[200px]">
                              {/* Restock / Add Batch Button */}
                              {canManage && (
                                <button
                                  onClick={() => {
                                    setRestockItem(item);
                                    setShowRestockModal(true);
                                  }}
                                  className="w-[74px] h-[26px] rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 bg-gradient-to-r from-emerald-600 to-crm-blue hover:opacity-90 text-white shadow-sm transition-all shrink-0"
                                  title="Restock component & add incoming batch"
                                >
                                  <Zap size={11} className="fill-white shrink-0" />
                                  <span>Restock</span>
                                </button>
                              )}

                              {/* + Add List / In List Toggle Button */}
                              <button
                                onClick={() => handleToggleBuyList(item)}
                                className={`group w-[84px] h-[26px] rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-all cursor-pointer shrink-0 ${
                                  isInBuyList
                                    ? 'bg-emerald-600/25 hover:bg-red-500/20 text-emerald-700 dark:text-emerald-400 hover:text-red-600 dark:hover:text-red-300 border border-emerald-500/40 hover:border-red-500/40 shadow-sm'
                                    : 'bg-white dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
                                }`}
                                title={isInBuyList ? 'Click to un-add / remove from Procurement Buy List' : 'Click to add to Procurement Buy List'}
                              >
                                {isInBuyList ? (
                                  <>
                                    <Check size={12} className="group-hover:hidden text-emerald-700 dark:text-emerald-400 shrink-0" />
                                    <X size={12} className="hidden group-hover:block text-red-600 dark:text-red-400 shrink-0" />
                                    <span className="group-hover:hidden">In List</span>
                                    <span className="hidden group-hover:inline text-red-600 dark:text-red-300">Remove</span>
                                  </>
                                ) : (
                                  <>
                                    <ShoppingCart size={12} className="shrink-0" />
                                    <span>+ Add List</span>
                                  </>
                                )}
                              </button>

                              {/* Edit Button */}
                              {canManage && (
                                <button
                                  onClick={() => setEditingItem(item)}
                                  className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-blue-50 dark:hover:bg-crm-blue/20 text-slate-500 dark:text-slate-400 hover:text-crm-blue transition-colors shrink-0"
                                  title="Edit component details"
                                >
                                  <Edit3 size={13} />
                                </button>
                              )}

                              {/* Delete Button */}
                              {canDelete && (
                                <button
                                  onClick={() => {
                                    setConfirmModal({
                                      isOpen: true,
                                      title: `Delete Component: ${item.name}`,
                                      description: `Are you sure you want to permanently delete "${item.name}" (${item.skuCode})? This action cannot be undone.`,
                                      confirmText: 'Delete Component',
                                      danger: true,
                                      onConfirm: async () => {
                                        try {
                                          if (item.positionId) {
                                            await inventoryApi.deleteProjectStockPosition(item.positionId);
                                          } else if (item.skuId) {
                                            await inventoryApi.deleteSku(item.skuId);
                                          }
                                          await fetchData();
                                        } catch (err: any) {
                                          console.error('Delete failed:', err);
                                        } finally {
                                          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                                        }
                                      },
                                    });
                                  }}
                                  className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-500/20 text-slate-400 hover:text-red-600 transition-colors shrink-0"
                                  title="Delete"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── BOTTOM TABLE NAVIGATOR TOOLBAR ─────────────────────────────── */}
          <div className="flex items-center justify-between bg-white dark:bg-[#181B26] p-2.5 rounded-xl border border-slate-200 dark:border-[#2A3042] flex-wrap gap-2 text-xs shadow-sm">
            <span className="text-[11px] text-slate-700 dark:text-slate-400 font-mono font-medium">
              Showing {filteredList.length} component records
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => scrollTable('start')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-white/10 hover:border-crm-blue text-slate-800 dark:text-slate-300 flex items-center gap-1 font-bold shadow-sm"
                title="Scroll to Start"
              >
                <ChevronsLeft size={13} /> Start (Component & SKU)
              </button>
              <button
                type="button"
                onClick={() => scrollTable('left')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-[#2A3042] hover:border-crm-blue text-slate-800 dark:text-white flex items-center gap-1 font-bold shadow-sm"
                title="Pan Left"
              >
                <ChevronLeft size={13} /> Left
              </button>
              <button
                type="button"
                onClick={() => scrollTable('right')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-[#2A3042] hover:border-crm-blue text-slate-800 dark:text-white flex items-center gap-1 font-bold shadow-sm"
                title="Pan Right"
              >
                Right <ChevronRight size={13} />
              </button>
              <button
                type="button"
                onClick={() => scrollTable('end')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-white/10 hover:border-amber-500 text-amber-700 dark:text-crm-amber flex items-center gap-1 font-bold shadow-sm"
                title="Scroll to End"
              >
                End (Actions & Bill) <ChevronsRight size={13} />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ─── VIEW 2: PROCUREMENT BUY LIST & BILLING (FINANCIALS & POs HERE!) ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'buy_list' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* BUY LIST SUMMARY KPI CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            {/* Card 1: Items in Buy Cart */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">
                  Items in Buy Cart
                </span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-crm-blue/15 text-crm-blue flex items-center justify-center border border-blue-200 dark:border-transparent">
                  <ShoppingCart size={16} />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-950 dark:text-white mt-2 tabular-nums font-mono">
                {buyList.length} <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">({buyListUnitsCount} Units)</span>
              </p>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Queued for Vendor PO</span>
            </div>

            {/* Card 2: Estimated Base Amount */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">
                  Estimated Base Amount
                </span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-transparent">
                  <Coins size={16} />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-950 dark:text-white mt-2 tabular-nums font-mono">
                ₹{Math.round(buyListBaseTotal).toLocaleString('en-IN')}
              </p>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Excluding GST</span>
            </div>

            {/* Card 3: Estimated GST Total */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">
                  Estimated GST Total
                </span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-transparent">
                  <Calculator size={16} />
                </div>
              </div>
              <p className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-2 tabular-nums font-mono">
                +₹{Math.round(buyListGstTotal).toLocaleString('en-IN')}
              </p>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Input Tax Credit</span>
            </div>

            {/* Card 4: Grand Purchase Total */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">
                  Grand Purchase Total
                </span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-transparent">
                  <Receipt size={16} />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-950 dark:text-white mt-2 tabular-nums font-mono">
                ₹{Math.round(buyListGrandTotal).toLocaleString('en-IN')}
              </p>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Total PO Commitment</span>
            </div>
          </div>

          {/* BUY LIST ACTION BAR */}
          <div className="flex items-center justify-between gap-3 flex-wrap bg-white dark:bg-[#181B26] p-3.5 rounded-2xl border border-slate-200 dark:border-[#2A3042] shadow-sm">
            <div>
              <span className="font-bold text-slate-950 dark:text-white text-xs sm:text-sm block">
                Procurement & Vendor PO Generator
              </span>
              <span className="text-slate-600 dark:text-slate-400 text-[11px]">
                Export this list to Excel/CSV for sending to vendors or component distributors
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleDownloadPoExcel}
                disabled={buyList.length === 0}
                className="btn bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3.5 py-2 font-bold gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Download size={13} /> Download PO (Excel .xlsx)
              </button>

              <button
                type="button"
                onClick={handleDownloadPoCsv}
                disabled={buyList.length === 0}
                className="btn bg-white dark:bg-[#1E2230] hover:bg-slate-100 dark:hover:bg-[#2A3042] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-[#2A3042] text-xs px-3.5 py-2 font-bold gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Download size={13} /> Download PO (CSV)
              </button>

              {buyList.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: 'Clear Procurement Cart?',
                      description: 'Are you sure you want to remove all items from your procurement purchase list? This cannot be undone.',
                      confirmText: 'Clear All Items',
                      danger: true,
                      onConfirm: () => {
                        setBuyList([]);
                        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                      },
                    });
                  }}
                  className="btn bg-red-50 hover:bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30 text-xs px-3 py-2 font-bold gap-1 shadow-sm"
                >
                  <Trash2 size={13} /> Clear Cart
                </button>
              )}
            </div>
          </div>

          {/* ─── TOP TABLE NAVIGATOR TOOLBAR FOR PROCUREMENT CART ────────── */}
          <div className="flex items-center justify-between bg-white dark:bg-[#181B26] p-2 rounded-xl border border-slate-200 dark:border-[#2A3042] flex-wrap gap-2 text-xs shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-700 dark:text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <SlidersHorizontal size={12} className="text-crm-blue" />
                Table Navigator (Scroll or Pan):
              </span>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141722] p-0.5 rounded-lg border border-slate-200 dark:border-[#2A3042]">
                <button
                  type="button"
                  onClick={() => setDensity('compact')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                    density === 'compact' ? 'bg-crm-blue text-white shadow-sm' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  Compact
                </button>
                <button
                  type="button"
                  onClick={() => setDensity('normal')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                    density === 'normal' ? 'bg-crm-blue text-white shadow-sm' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  Normal
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => scrollBuyListTable('start')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-white/10 hover:border-crm-blue text-slate-800 dark:text-slate-300 flex items-center gap-1 font-bold shadow-sm"
                title="Scroll to Start (Component & SKU)"
              >
                <ChevronsLeft size={13} /> Start (Component & SKU)
              </button>
              <button
                type="button"
                onClick={() => scrollBuyListTable('left')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-[#2A3042] hover:border-crm-blue text-slate-800 dark:text-white flex items-center gap-1 font-bold shadow-sm"
                title="Pan Left"
              >
                <ChevronLeft size={13} /> Left
              </button>
              <button
                type="button"
                onClick={() => scrollBuyListTable('right')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-[#2A3042] hover:border-crm-blue text-slate-800 dark:text-white flex items-center gap-1 font-bold shadow-sm"
                title="Pan Right"
              >
                Right <ChevronRight size={13} />
              </button>
              <button
                type="button"
                onClick={() => scrollBuyListTable('end')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-white/10 hover:border-amber-500 text-amber-700 dark:text-crm-amber flex items-center gap-1 font-bold shadow-sm"
                title="Scroll to End (Actions & Inward)"
              >
                End (Actions & Bill) <ChevronsRight size={13} />
              </button>
            </div>
          </div>

          {/* BUY LIST TABLE */}
          <div className="table-wrapper border border-slate-200 dark:border-[#2A3042] rounded-xl overflow-hidden shadow-sm bg-white dark:bg-[#141722]">
            <div
              ref={buyListTableContainerRef}
              className="overflow-x-auto max-h-[680px] scrollbar-thin scrollbar-thumb-crm-blue/70 hover:scrollbar-thumb-crm-blue scrollbar-track-[#181B26]"
            >
              <table className={`table-auto border-collapse w-full ${density === 'compact' ? 'text-[11px]' : 'text-xs'}`}>
                <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-[#181B26] border-b border-slate-300 dark:border-[#2A3042] text-slate-800 dark:text-slate-300 font-bold shadow-sm">
                  <tr>
                    <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[180px] ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Component & SKU</th>
                    <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[150px] ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Project / System</th>
                    <th className={`text-left font-bold border-r border-slate-200 dark:border-[#2A3042]/60 min-w-[150px] ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Target Supplier</th>
                    <th className={`text-center font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Store Stock</th>
                    <th className={`text-center font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Order Qty</th>
                    <th className={`text-right font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Unit Rate</th>
                    <th className={`text-center font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>GST %</th>
                    <th className={`text-right font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Est. GST</th>
                    <th className={`text-right font-bold border-r border-slate-200 dark:border-[#2A3042]/60 whitespace-nowrap ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Total with GST</th>
                    <th className={`text-right font-bold whitespace-nowrap min-w-[140px] ${density === 'compact' ? 'px-2 py-2' : 'px-3 py-2.5'}`}>Actions / Inward</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2A3042]/40">
                  {buyList.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-12 text-slate-500">
                        <ShoppingCart size={32} className="mx-auto text-slate-400 mb-2" />
                        <p className="font-bold text-slate-950 dark:text-white">Your Procurement Buy List is Empty</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                          Go to "Stock Master" and click "+ Add List" next to items you need to restock.
                        </p>
                        <button
                          onClick={() => setActiveTab('master_stock')}
                          className="btn-primary text-xs px-4 py-2 mt-4 inline-flex items-center gap-1.5 shadow-sm font-bold"
                        >
                          <ArrowRight size={13} /> Go to Stock Master
                        </button>
                      </td>
                    </tr>
                  ) : (
                    buyList.map((item, idx) => {
                      const baseAmount = item.quantityToBuy * item.unitPrice;
                      const gstAmount = (baseAmount * item.taxRate) / 100;
                      const totalWithGst = baseAmount + gstAmount;

                      return (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                          {/* SKU & Name */}
                          <td className={`border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                            <div>
                              <div className="font-bold text-slate-950 dark:text-white text-xs">{item.name}</div>
                              <div className="font-mono text-[11px] text-indigo-700 dark:text-indigo-400 font-semibold flex items-center gap-1 mt-0.5">
                                <Tag size={10} className="text-indigo-600 dark:text-indigo-400" />
                                {item.skuCode}
                              </div>
                            </div>
                          </td>

                          {/* Project */}
                          <td className={`border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                            <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-[#1E2230] border border-blue-200 dark:border-[#2A3042] text-crm-blue inline-flex items-center gap-1.5">
                              <Layers size={11} /> {item.project}
                            </span>
                          </td>

                          {/* Supplier */}
                          <td className={`border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                            <input
                              type="text"
                              value={item.supplier}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBuyList((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, supplier: val } : x))
                                );
                              }}
                              className={`bg-white dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] text-slate-900 dark:text-white rounded-lg max-w-[160px] focus:outline-none focus:border-crm-blue ${
                                density === 'compact' ? 'text-[11px] py-0.5 px-1.5' : 'text-xs py-1 px-2'
                              }`}
                            />
                          </td>

                          {/* Store Stock */}
                          <td className={`text-center font-mono font-bold text-slate-800 dark:text-slate-300 border-r border-slate-200 dark:border-[#2A3042]/30 ${
                            density === 'compact' ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
                          }`}>
                            {item.currentStock} {item.unit}
                          </td>

                          {/* Quantity to Buy (Editable) */}
                          <td className={`text-center border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                            <input
                              type="number"
                              min="1"
                              value={item.quantityToBuy}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value));
                                setBuyList((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, quantityToBuy: val } : x))
                                );
                              }}
                              className={`bg-white dark:bg-[#1E2230] border border-slate-300 dark:border-[#2A3042] text-slate-950 dark:text-white font-mono font-black text-center max-w-[80px] mx-auto rounded-lg focus:outline-none focus:border-crm-blue ${
                                density === 'compact' ? 'text-[11px] py-0.5 px-1.5' : 'text-xs py-1 px-2'
                              }`}
                            />
                          </td>

                          {/* Unit Rate */}
                          <td className={`text-right font-mono font-bold text-slate-900 dark:text-slate-200 border-r border-slate-200 dark:border-[#2A3042]/30 ${
                            density === 'compact' ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
                          }`}>
                            ₹{item.unitPrice.toLocaleString('en-IN')}
                          </td>

                          {/* GST Rate */}
                          <td className={`text-center border-r border-slate-200 dark:border-[#2A3042]/30 ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                            <span className="px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30">
                              {item.taxRate}%
                            </span>
                          </td>

                          {/* GST Amount */}
                          <td className={`text-right font-mono font-bold text-amber-800 dark:text-amber-300 border-r border-slate-200 dark:border-[#2A3042]/30 ${
                            density === 'compact' ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
                          }`}>
                            +₹{Math.round(gstAmount).toLocaleString('en-IN')}
                          </td>

                          {/* Total with GST */}
                          <td className={`text-right font-mono font-black text-emerald-700 dark:text-emerald-400 border-r border-slate-200 dark:border-[#2A3042]/30 ${
                            density === 'compact' ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
                          }`}>
                            ₹{Math.round(totalWithGst).toLocaleString('en-IN')}
                          </td>

                          {/* Inward Purchase & Upload GST Bill */}
                          <td className={`text-right whitespace-nowrap ${density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  if (item.rawPosition) {
                                    setPurchaseItem(item.rawPosition);
                                  } else {
                                    setShowRecordPurchaseModal(true);
                                  }
                                }}
                                className="px-2.5 py-1 rounded-lg bg-crm-blue hover:bg-crm-blue-light text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-sm transition-all"
                                title="Inward goods & upload GST bill receipt"
                              >
                                <Receipt size={12} /> Inward & Bill
                              </button>
                              <button
                                onClick={() => handleRemoveFromBuyList(idx)}
                                className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/20 text-slate-400 hover:text-red-600 transition-colors"
                                title="Remove item"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── BOTTOM TABLE NAVIGATOR TOOLBAR FOR PROCUREMENT CART ─────────── */}
          <div className="flex items-center justify-between bg-white dark:bg-[#181B26] p-2.5 rounded-xl border border-slate-200 dark:border-[#2A3042] flex-wrap gap-2 text-xs shadow-sm">
            <span className="text-[11px] text-slate-700 dark:text-slate-400 font-mono font-medium">
              Showing {buyList.length} items queued in Buy Cart ({buyListUnitsCount} units)
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => scrollBuyListTable('start')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-white/10 hover:border-crm-blue text-slate-800 dark:text-slate-300 flex items-center gap-1 font-bold shadow-sm"
                title="Scroll to Start"
              >
                <ChevronsLeft size={13} /> Start (Component & SKU)
              </button>
              <button
                type="button"
                onClick={() => scrollBuyListTable('left')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-[#2A3042] hover:border-crm-blue text-slate-800 dark:text-white flex items-center gap-1 font-bold shadow-sm"
                title="Pan Left"
              >
                <ChevronLeft size={13} /> Left
              </button>
              <button
                type="button"
                onClick={() => scrollBuyListTable('right')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-[#2A3042] hover:border-crm-blue text-slate-800 dark:text-white flex items-center gap-1 font-bold shadow-sm"
                title="Pan Right"
              >
                Right <ChevronRight size={13} />
              </button>
              <button
                type="button"
                onClick={() => scrollBuyListTable('end')}
                className="btn bg-white dark:bg-[#1E2230] text-[11px] py-1 px-2.5 border border-slate-300 dark:border-white/10 hover:border-amber-500 text-amber-700 dark:text-crm-amber flex items-center gap-1 font-bold shadow-sm"
                title="Scroll to End"
              >
                End (Actions & Bill) <ChevronsRight size={13} />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ─── VIEW 3: PURCHASE BILLS & SOFT COPIES ARCHIVE ───────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'bills_hub' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <PurchaseBillsHub
            existingProjects={existingProjects}
            onStockUpdated={fetchData}
          />
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ─── MODALS ─────────────────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}

      {/* Modal 1: Add Component */}
      <AddComponentModal
        isOpen={showAddComponentModal}
        onClose={() => setShowAddComponentModal(false)}
        existingProjects={existingProjects}
        onSuccess={fetchData}
      />

      {/* Modal 2: Edit Single Component */}
      <EditComponentModal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        item={editingItem}
        existingProjects={existingProjects}
        onSuccess={fetchData}
        onOpenRestock={(it) => {
          setRestockItem(it);
          setShowRestockModal(true);
        }}
      />

      {/* Modal 2B: Dedicated Component Restock & New Batch Replenishment */}
      <RestockComponentModal
        isOpen={showRestockModal}
        onClose={() => {
          setShowRestockModal(false);
          setRestockItem(null);
        }}
        item={restockItem}
        onSuccess={fetchData}
      />

      {/* Modal 3: Bulk Edit Multiple Components */}
      <BulkEditComponentsModal
        isOpen={showBulkEditModal}
        onClose={() => setShowBulkEditModal(false)}
        selectedItems={selectedItemsList}
        existingProjects={existingProjects}
        onSuccess={() => {
          setSelectedIds([]);
          fetchData();
        }}
      />

      {/* Modal 4: Fast Record Component Purchase Modal */}
      <RecordComponentPurchaseModal
        isOpen={showRecordPurchaseModal}
        onClose={() => setShowRecordPurchaseModal(false)}
        existingProjects={existingProjects}
        onSuccess={fetchData}
      />

      {/* Modal 5: Bulk Excel Import (Multi-Sheet) */}
      <BulkExcelImportModal
        isOpen={showBulkImportModal}
        onClose={() => setShowBulkImportModal(false)}
        onSuccess={fetchData}
      />

      {/* Inward Purchase Modal for Existing Item */}
      <RecordPurchaseModal
        isOpen={!!purchaseItem}
        onClose={() => setPurchaseItem(null)}
        item={purchaseItem}
        onSuccess={fetchData}
      />

      {/* GST Bill / Invoice Document Preview Modal */}
      <AnimatePresence>
        {previewDocUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto"
            >
              <div className="p-4 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt size={18} className="text-crm-blue" />
                  <h3 className="text-sm font-bold text-slate-950 dark:text-white truncate">{previewDocTitle}</h3>
                </div>
                <button
                  onClick={() => setPreviewDocUrl(null)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-black/40 min-h-[300px]">
                {previewDocUrl.startsWith('data:image') || previewDocUrl.endsWith('.png') || previewDocUrl.endsWith('.jpg') ? (
                  <img
                    src={previewDocUrl}
                    alt="GST Invoice"
                    className="max-w-full max-h-[70vh] rounded-lg shadow-xl object-contain border border-slate-200 dark:border-[#2A3042]"
                  />
                ) : (
                  <iframe
                    src={previewDocUrl}
                    title="Invoice Document"
                    className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-[#2A3042]"
                  />
                )}
              </div>

              <div className="p-3 border-t border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex justify-end gap-2">
                <a
                  href={previewDocUrl}
                  download="GST-Invoice.png"
                  className="btn-primary text-xs px-4 py-1.5 shadow-glow-blue flex items-center gap-1.5"
                >
                  <Download size={13} /> Download Bill
                </a>
                <button
                  onClick={() => setPreviewDocUrl(null)}
                  className="btn-ghost text-xs px-4 py-1.5"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Wipe Data Modal */}
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
                  <h3 className="text-base font-bold text-slate-950 dark:text-white">Wipe Data?</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    This will clear inventory records and project stock positions. An encrypted
                    backup will be created automatically before clearing.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-[11px] text-red-700 dark:text-red-300">
                Type <strong className="text-slate-950 dark:text-white font-mono uppercase">WIPE</strong> below to confirm:
                <input
                  type="text"
                  placeholder="Type WIPE"
                  value={wipeConfirmText}
                  onChange={(e) => setWipeConfirmText(e.target.value)}
                  className="input mt-2 font-mono text-center font-bold tracking-widest text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/40 bg-white dark:bg-[#141722]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={clearing}
                  onClick={() => setShowClearModal(false)}
                  className="btn bg-white dark:bg-[#1E2230] hover:bg-slate-100 dark:hover:bg-[#252A3C] text-slate-800 dark:text-slate-300 text-xs px-4 py-2 border border-slate-300 dark:border-[#2A3042] font-bold shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={clearing || wipeConfirmText !== 'WIPE'}
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
                  className="btn bg-red-600 hover:bg-red-500 text-white text-xs px-5 shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                >
                  <Trash2 size={13} />
                  {clearing ? 'Backing Up & Wiping...' : 'Confirm Wipe'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── CUSTOM IN-APP CONFIRMATION MODAL ───────────────────────── */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  confirmModal.danger ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20' : 'bg-blue-50 dark:bg-crm-blue/10 text-crm-blue border border-blue-200 dark:border-crm-blue/20'
                }`}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-950 dark:text-white text-base">{confirmModal.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Please confirm to proceed</p>
                </div>
              </div>

              <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[#141722] p-3.5 rounded-xl border border-slate-200 dark:border-[#2A3042] leading-relaxed font-medium">
                {confirmModal.description}
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                  className="btn bg-white dark:bg-[#1E2230] hover:bg-slate-100 dark:hover:bg-[#252A3C] text-slate-800 dark:text-slate-300 text-xs px-4 py-2 border border-slate-300 dark:border-[#2A3042] font-bold shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmModal.onConfirm}
                  className={`btn text-xs px-5 py-2 font-bold flex items-center gap-1.5 shadow-sm ${
                    confirmModal.danger
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-crm-blue hover:bg-crm-blue-light text-white'
                  }`}
                >
                  {confirmModal.danger && <Trash2 size={13} />}
                  {confirmModal.confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
