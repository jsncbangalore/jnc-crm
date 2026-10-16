import React from 'react';
import { motion } from 'framer-motion';
import { AnimatedCounter } from './AnimatedCounter';

type KpiColor = 'blue' | 'amber' | 'violet' | 'teal' | 'coral' | 'green';

interface KpiCardProps {
  title: string;
  value: number;
  color: KpiColor;
  icon: React.ReactNode;
  subtitle?: string;
  breakdown?: { label: string; value: number; color?: string }[];
  index?: number;
}

const colorMap: Record<KpiColor, { bg: string; glow: string; text: string; bar: string }> = {
  blue:   { bg: 'bg-crm-blue/10',   glow: 'shadow-glow-blue',   text: 'text-crm-blue',   bar: 'bg-crm-blue' },
  amber:  { bg: 'bg-crm-amber/10',  glow: 'shadow-glow-amber',  text: 'text-crm-amber',  bar: 'bg-crm-amber' },
  violet: { bg: 'bg-crm-violet/10', glow: 'shadow-glow-violet', text: 'text-crm-violet', bar: 'bg-crm-violet' },
  teal:   { bg: 'bg-crm-teal/10',   glow: 'shadow-glow-teal',   text: 'text-crm-teal',   bar: 'bg-crm-teal' },
  coral:  { bg: 'bg-crm-coral/10',  glow: 'shadow-glow-coral',  text: 'text-crm-coral',  bar: 'bg-crm-coral' },
  green:  { bg: 'bg-crm-whatsapp/10', glow: '', text: 'text-crm-whatsapp', bar: 'bg-crm-whatsapp' },
};

export function KpiCard({ title, value, color, icon, subtitle, breakdown, index = 0 }: KpiCardProps) {
  const c = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-xl p-3 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-all ${c.glow} relative overflow-hidden flex flex-col justify-between`}
    >
      {/* Background accent */}
      <div className={`absolute -top-6 -right-6 w-20 h-20 ${c.bg} rounded-full blur-2xl pointer-events-none`} />

      <div className="relative z-10">
        <div className="flex items-center justify-between gap-1 mb-1.5">
          <span className="text-slate-800 dark:text-slate-300 text-xs font-bold tracking-tight truncate">{title}</span>
          <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center ${c.text} shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5`}>
            {icon}
          </div>
        </div>

        <AnimatedCounter
          value={value}
          className={`text-xl sm:text-2xl font-black ${c.text} tabular-nums tracking-tight leading-none`}
        />

        {subtitle && <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium leading-tight truncate">{subtitle}</p>}

        {breakdown && breakdown.length > 0 && (
          <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-white/5 grid grid-cols-2 gap-x-2 gap-y-0.5">
            {breakdown.map((item) => (
              <div key={item.label} className="flex items-center justify-between text-[10px]">
                <span className="text-slate-500 dark:text-slate-400 truncate">{item.label}</span>
                <span className={item.color || 'text-slate-900 dark:text-slate-200 font-bold ml-1'} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
