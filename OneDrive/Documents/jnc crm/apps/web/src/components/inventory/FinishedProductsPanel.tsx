import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Package, Cpu, Plus, RefreshCw, ChevronRight,
  Speaker, Mic2, Radio, Shield, Bell, Phone,
  Activity, Layers, AlertTriangle
} from 'lucide-react';
import { inventoryApi } from '../../services/api';

const PRODUCT_ICONS: Record<string, React.ReactNode> = {
  'Call Station': <Mic2 size={20} />,
  'PA Controller': <Speaker size={20} />,
  'Conventional Talk Back Controller': <Radio size={20} />,
  'Talk Back Speaker': <Speaker size={20} />,
  '3-in-1 Speaker (Fire+PA+TalkBack)': <Layers size={20} />,
  'Addressable Controller': <Activity size={20} />,
  'Addressable Speaker': <Speaker size={20} />,
  'Nurse Call': <Bell size={20} />,
  'Fire Alarm System': <Shield size={20} />,
};

const PRODUCT_COLORS: Record<string, string> = {
  'Call Station': 'border-l-crm-blue bg-crm-blue/5',
  'PA Controller': 'border-l-emerald-500 bg-emerald-500/5',
  'Conventional Talk Back Controller': 'border-l-crm-violet bg-crm-violet/5',
  'Talk Back Speaker': 'border-l-cyan-500 bg-cyan-500/5',
  '3-in-1 Speaker (Fire+PA+TalkBack)': 'border-l-amber-500 bg-amber-500/5',
  'Addressable Controller': 'border-l-purple-500 bg-purple-500/5',
  'Addressable Speaker': 'border-l-indigo-500 bg-indigo-500/5',
  'Nurse Call': 'border-l-rose-500 bg-rose-500/5',
  'Fire Alarm System': 'border-l-red-500 bg-red-500/5',
};

const ICON_COLORS: Record<string, string> = {
  'Call Station': 'text-crm-blue bg-crm-blue/10',
  'PA Controller': 'text-emerald-400 bg-emerald-500/10',
  'Conventional Talk Back Controller': 'text-purple-400 bg-purple-500/10',
  'Talk Back Speaker': 'text-cyan-400 bg-cyan-500/10',
  '3-in-1 Speaker (Fire+PA+TalkBack)': 'text-amber-400 bg-amber-500/10',
  'Addressable Controller': 'text-purple-400 bg-purple-500/10',
  'Addressable Speaker': 'text-indigo-400 bg-indigo-500/10',
  'Nurse Call': 'text-rose-400 bg-rose-500/10',
  'Fire Alarm System': 'text-red-400 bg-red-500/10',
};

interface Props {
  onQuickAdd?: (product: any) => void;
}

export default function FinishedProductsPanel({ onQuickAdd }: Props) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data } = await inventoryApi.getProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  const handleSeedProducts = async () => {
    setSeeding(true);
    try {
      await inventoryApi.seedProducts();
      await fetchProducts();
    } catch (e: any) {
      alert('Seed failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950 dark:text-white flex items-center gap-2">
            <Package size={18} className="text-crm-blue" />
            Finished Products Catalog
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {products.length} product line{products.length !== 1 ? 's' : ''} — Standard product catalog
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSeedProducts}
            disabled={seeding}
            className="btn bg-crm-violet/20 text-crm-violet border border-crm-violet/30 hover:bg-crm-violet/30 text-xs gap-1.5"
          >
            {seeding ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
            {products.length === 0 ? 'Seed Sample Catalog' : 'Re-seed Catalog'}
          </button>
          <button
            onClick={fetchProducts}
            className="btn-ghost text-xs border border-white/10 hover:bg-white/5 text-slate-300"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Empty state */}
      {!loading && products.length === 0 && (
        <div className="card p-10 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-crm-blue/10 border border-crm-blue/20 flex items-center justify-center">
            <Package size={24} className="text-crm-blue" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">No products seeded yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Click "Seed Sample Catalog" to populate sample finished products and BOM components
            </p>
          </div>
          <button
            onClick={handleSeedProducts}
            disabled={seeding}
            className="btn-primary text-xs gap-1.5 shadow-glow-blue"
          >
            {seeding ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
            Seed Sample Products
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-4 bg-white/10 rounded w-3/4 mb-3" />
              <div className="h-3 bg-white/5 rounded w-1/2 mb-2" />
              <div className="h-3 bg-white/5 rounded w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Product Cards Grid */}
      {!loading && products.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product, idx) => {
            const colorClass = PRODUCT_COLORS[product.name] || 'border-l-slate-500 bg-slate-500/5';
            const iconColorClass = ICON_COLORS[product.name] || 'text-slate-400 bg-slate-500/10';
            const icon = PRODUCT_ICONS[product.name] || <Package size={20} />;
            const componentCount = product.skus?.length || 0;
            const isExpanded = expandedId === product.id;

            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className={`card border-l-4 ${colorClass} p-4 flex flex-col gap-3`}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconColorClass}`}>
                      {icon}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-950 dark:text-white leading-tight">{product.name}</h3>
                      <span className="text-[10px] text-slate-400">{product.category}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300 flex-shrink-0">
                    {componentCount} SKU{componentCount !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Description */}
                {product.description && (
                  <p className="text-[11px] text-slate-400 leading-relaxed">{product.description}</p>
                )}

                {/* Component list toggle */}
                {componentCount > 0 && (
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : product.id)}
                    className="flex items-center gap-1.5 text-[10.5px] text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors"
                  >
                    <ChevronRight size={12} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    {isExpanded ? 'Hide' : 'View'} {componentCount} linked component{componentCount !== 1 ? 's' : ''}
                  </button>
                )}

                {/* Expanded component list */}
                {isExpanded && product.skus && (
                  <div className="space-y-1 border-t border-white/5 pt-2">
                    {product.skus.slice(0, 8).map((sku: any) => (
                      <div key={sku.id} className="flex items-center gap-2 text-[10px]">
                        <Cpu size={10} className="text-slate-500 flex-shrink-0" />
                        <span className="text-slate-300 font-mono">{sku.skuCode}</span>
                        <span className="text-slate-500 truncate">{sku.name}</span>
                      </div>
                    ))}
                    {product.skus.length > 8 && (
                      <p className="text-[10px] text-slate-500">+{product.skus.length - 8} more...</p>
                    )}
                  </div>
                )}

                {/* Action Button */}
                <button
                  onClick={() => onQuickAdd?.(product)}
                  className="btn bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] gap-1.5 mt-auto"
                >
                  <Plus size={12} />
                  Add Component to This Product
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Info strip */}
      {!loading && products.length > 0 && (
        <div className="flex items-center gap-2 text-[10.5px] text-slate-500 border border-white/5 rounded-lg p-3 bg-white/2">
          <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
          Components added via "Quick Add Component" will automatically link to the selected product and appear here.
        </div>
      )}
    </div>
  );
}
