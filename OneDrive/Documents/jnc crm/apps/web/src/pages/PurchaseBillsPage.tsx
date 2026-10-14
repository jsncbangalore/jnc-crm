import React, { useState, useEffect } from 'react';
import { Receipt, Plus, FileText, ShoppingCart } from 'lucide-react';
import { PurchaseBillsHub } from '../components/inventory/PurchaseBillsHub';
import { RecordComponentPurchaseModal } from '../components/inventory/RecordComponentPurchaseModal';
import { inventoryApi } from '../services/api';

export default function PurchaseBillsPage() {
  const [showRecordPurchaseModal, setShowRecordPurchaseModal] = useState(false);
  const [existingProjects, setExistingProjects] = useState<string[]>(['General Inventory']);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    inventoryApi.getProjectStock().then((res: any) => {
      const positions = Array.isArray(res?.data) ? res.data : [];
      const projects = Array.from(new Set(positions.map((p: any) => p.project).filter(Boolean))) as string[];
      if (projects.length > 0) {
        setExistingProjects(projects);
      }
    }).catch(() => {});
  }, []);

  const handleStockUpdated = () => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="space-y-5">
      {/* ─── PAGE HEADER ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-950 dark:text-white flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200/60 dark:border-transparent">
              <Receipt size={18} />
            </span>
            Purchase Bills & Inward Register
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-medium">
            Manage vendor purchase invoices, inward component batches, track GST input tax credits, and scan physical bills.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowRecordPurchaseModal(true)}
            className="btn-primary text-xs py-2 px-3.5 shadow-glow-blue flex items-center gap-1.5"
            title="Record vendor purchase"
          >
            <ShoppingCart size={14} /> Record Purchase
          </button>
        </div>
      </div>

      {/* ─── PURCHASE BILLS HUB VIEW ─────────────────────────────────────── */}
      <PurchaseBillsHub
        key={refreshKey}
        existingProjects={existingProjects}
        onStockUpdated={handleStockUpdated}
        onRecordPurchase={() => setShowRecordPurchaseModal(true)}
      />

      {/* ─── RECORD PURCHASE MODAL ───────────────────────────────────────── */}
      <RecordComponentPurchaseModal
        isOpen={showRecordPurchaseModal}
        onClose={() => setShowRecordPurchaseModal(false)}
        existingProjects={existingProjects}
        onSuccess={handleStockUpdated}
      />
    </div>
  );
}
