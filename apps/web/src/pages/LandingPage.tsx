import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Menu,
  X,
  ArrowRight,
  Check,
  Kanban,
  Zap,
  Contact,
  LineChart,
  Mail,
  Phone,
  Clock,
  Twitter,
  Linkedin,
  Github,
  Youtube,
  ShieldCheck,
  TrendingUp,
  LogOut,
  LayoutDashboard,
  LucideIcon,
  Sun,
  Moon,
} from 'lucide-react';
import BrandLogo from '../components/common/BrandLogo';
import Footer from '../components/common/Footer';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { BRAND, PRODUCT_NAME } from '../config/brand';

/* ---------- Feature Items ---------- */
interface FeatureItem {
  icon: LucideIcon;
  title: string;
  text: string;
  tone: string;
}

const FEATURES: FeatureItem[] = [
  {
    icon: Kanban,
    title: 'Pipeline & deal management',
    text: 'Drag deals across clear stages and see what is stuck, what is closing, and what it is worth.',
    tone: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40',
  },
  {
    icon: Zap,
    title: 'Automated follow-ups',
    text: 'Trigger reminders, emails and task assignments the moment a lead replies, goes quiet or moves stage.',
    tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40',
  },
  {
    icon: Contact,
    title: 'Smart contact history',
    text: 'Every call, email and note lives on one timeline, so anyone on your team can pick up the conversation.',
    tone: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40',
  },
  {
    icon: LineChart,
    title: 'Real-time sales analytics',
    text: 'Live dashboards for revenue, win rate and rep performance, with no spreadsheets to rebuild each week.',
    tone: 'bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400 border border-sky-200/60 dark:border-sky-800/40',
  },
];

const HIGHLIGHTS = [
  {
    title: 'Pipeline Management',
    description: 'Track leads, generate quotations, issue invoices, and manage inventory in one system.',
  },
  {
    title: 'Integrated Communication',
    description: 'Connect WhatsApp, email, and web inquiry channels into a single unified workspace.',
  },
  {
    title: 'Real-Time Insights',
    description: 'Instant visibility on pipeline velocity, team workload, and order fulfillment status.',
  },
];

interface PlanItem {
  name: string;
  blurb: string;
  popular?: boolean;
  cta: string;
  features: string[];
}

const PLANS: PlanItem[] = [
  {
    name: 'Starter',
    blurb: 'Essential tools for small teams getting organised.',
    cta: 'Contact us for pricing',
    features: [
      'Lead and contact management',
      'Sales pipeline & quotation generation',
      'Email integration & communication logs',
      'Basic reports and activity metrics',
    ],
  },
  {
    name: 'Professional',
    blurb: 'Advanced workflows and operational management.',
    popular: true,
    cta: 'Contact us for pricing',
    features: [
      'Order fulfillment & delivery tracking',
      'GST tax invoices, credit notes & proforma',
      'Component inventory & stock management',
      'Workflow automation & email sequences',
      'Advanced reporting & performance analytics',
    ],
  },
  {
    name: 'Enterprise',
    blurb: 'Full suite with governance and dedicated support.',
    cta: 'Contact us for pricing',
    features: [
      'Custom role-based access & permissions',
      'Multi-tenant workspace architecture',
      'Comprehensive compliance audit trail',
      'Direct print hub & custom document templates',
      'Dedicated support & onboarding assistance',
    ],
  },
];

const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';
const btnGhost =
  'inline-flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#181B26] px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

/* ---------- Navbar ---------- */
function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const scrollTo = (id: string) => {
    setOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-[#2A3042] bg-white/95 dark:bg-[#0F1117]/95 backdrop-blur-md transition-colors">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <BrandLogo size={36} reversed={isDark} showText={true} />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          <Link
            to="/features"
            className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition"
          >
            Features
          </Link>
          <Link
            to="/solutions"
            className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition"
          >
            Solutions
          </Link>
          <Link
            to="/pricing"
            className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition"
          >
            Pricing
          </Link>
          <Link
            to="/help"
            className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition"
          >
            Help
          </Link>
          <Link
            to="/contact"
            className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition"
          >
            Contact
          </Link>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {/* Light / Dark Mode Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all shadow-xs cursor-pointer"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {isDark ? (
              <Sun size={17} className="text-amber-400" />
            ) : (
              <Moon size={17} className="text-slate-700" />
            )}
          </button>

          {isAuthenticated && user ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 py-1 pl-1.5 pr-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
                  {(user.name || user.email || 'U')[0].toUpperCase()}
                </span>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[120px]">
                  {user.name || user.email}
                </span>
              </div>
              <Link to="/dashboard" className={btnPrimary}>
                <LayoutDashboard size={15} />
                <span>Dashboard</span>
              </Link>
              <button
                type="button"
                onClick={() => logout()}
                title="Log out"
                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-rose-950/20 px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition"
              >
                <LogOut size={13} />
                <span>Log out</span>
              </button>
            </div>
          ) : (
            <>
              <Link to="/login" className={btnGhost}>
                Log in
              </Link>
              <Link to="/login" className={btnPrimary}>
                Get started free
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] text-slate-700 dark:text-slate-300"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} />}
          </button>
          <button
            className="rounded-lg p-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-72 flex-col bg-white dark:bg-[#181B26] border-l border-slate-200 dark:border-[#2A3042] p-5 shadow-2xl transition-transform duration-200 md:hidden ${
          open ? 'translate-x-0' : 'translate-x-full invisible pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between">
          <Link to="/" onClick={() => setOpen(false)}>
            <BrandLogo size={32} reversed={isDark} showText={true} />
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="mt-6 flex flex-col gap-1">
          <Link
            to="/features"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2.5 text-left text-base font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Features
          </Link>
          <Link
            to="/solutions"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2.5 text-left text-base font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Solutions
          </Link>
          <Link
            to="/pricing"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2.5 text-left text-base font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Pricing
          </Link>
          <Link
            to="/help"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2.5 text-left text-base font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Help
          </Link>
          <Link
            to="/contact"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2.5 text-left text-base font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Contact
          </Link>
        </nav>

        <div className="mt-auto flex flex-col gap-2">
          {isAuthenticated && user ? (
            <>
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-900 p-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
                  {(user.name || user.email || 'U')[0].toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                    {user.name || 'User'}
                  </p>
                  <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                    {user.email}
                  </p>
                </div>
              </div>
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className={btnPrimary}
              >
                Dashboard
              </Link>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/20 px-4 py-2 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition"
              >
                <LogOut size={16} />
                <span>Log out</span>
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className={btnGhost}
              >
                Log in
              </Link>
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className={btnPrimary}
              >
                Get started free
              </Link>
            </>
          )}
        </div>
      </aside>
    </header>
  );
}

/* ---------- Hero ---------- */
function DashboardMock() {
  const pts = [8, 22, 16, 34, 28, 46, 40, 58, 52, 70];
  const path = pts.map((y, i) => `${i ? 'L' : 'M'}${i * 32},${80 - y}`).join(' ');

  return (
    <div className="relative mx-auto mt-14 max-w-4xl [perspective:1600px]">
      <div
        className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-blue-400/30 via-indigo-300/20 to-teal-300/20 dark:from-blue-600/20 dark:via-indigo-600/10 dark:to-teal-500/10 blur-2xl"
        aria-hidden
      />
      <div className="relative rounded-2xl border border-slate-200 dark:border-[#2A3042] bg-white/90 dark:bg-[#181B26]/90 p-4 shadow-2xl shadow-blue-900/10 ring-1 ring-slate-900/5 backdrop-blur-xl sm:p-5 sm:[transform:rotateX(6deg)]">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {['bg-rose-400', 'bg-amber-400', 'bg-emerald-400'].map((c) => (
              <span key={c} className={`h-2.5 w-2.5 rounded-full ${c}`} />
            ))}
            <span className="ml-3 h-5 w-32 rounded-md bg-slate-100 dark:bg-slate-800" />
          </div>
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-200/60 dark:border-white/5">
            Sample data
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ['Revenue', '₹2.05 Cr', '+18.7%'],
            ['Open deals', '64', '+9.8%'],
            ['Win rate', '26.1%', '+2.4%'],
          ].map(([l, v, t]) => (
            <div
              key={l}
              className="rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] p-3 text-left shadow-xs"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">{l}</p>
                <span className="text-[9.5px] font-mono text-slate-400 dark:text-slate-500">Sample data</span>
              </div>
              <p className="mt-1 text-lg font-bold text-slate-950 dark:text-white sm:text-2xl">{v}</p>
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{t}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] p-3 text-left sm:col-span-3 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Sales performance</p>
              <span className="text-[9.5px] font-mono text-slate-400 dark:text-slate-500">Sample data</span>
            </div>
            <svg
              viewBox="0 0 288 90"
              className="mt-2 h-28 w-full"
              role="img"
              aria-label="Rising sales line chart"
            >
              <defs>
                <linearGradient id="fillg" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#2563eb" stopOpacity=".3" />
                  <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${path} L288,90 L0,90 Z`} fill="url(#fillg)" />
              <path
                d={path}
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="hidden space-y-2 sm:col-span-2 sm:block">
            {[
              ['Active Lead 1', 'Stage: Qualified', 'from-blue-600 to-indigo-600'],
              ['Active Lead 2', 'Stage: Proposal', 'from-emerald-500 to-teal-500'],
              ['Active Lead 3', 'Stage: Negotiation', 'from-amber-500 to-rose-500'],
            ].map(([n, c, g]) => (
              <div
                key={n}
                className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] p-2.5 text-left shadow-xs"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${g} text-xs font-bold text-white`}
                >
                  {n[0]}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {n}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{c}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  const [email, setEmail] = useState('');
  const navigate = useNavigate();

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/login');
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/50 via-transparent to-transparent dark:from-blue-950/20 dark:via-transparent dark:to-transparent px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-3.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300 shadow-xs">
          <Zap size={14} /> Unified sales pipeline and automated customer follow-ups
        </p>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white sm:text-6xl">
          Manage leads. Close deals. Scale your business faster.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-700 dark:text-slate-300 font-normal">
          Track leads, conversations, and deals with automated follow-ups.
        </p>

        <form onSubmit={handleStart} className="mx-auto mt-8 flex max-w-md flex-col gap-2 sm:flex-row">
          <label htmlFor="hero-email" className="sr-only">
            Work email
          </label>
          <input
            id="hero-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your work email"
            className="h-11 flex-1 rounded-xl border border-slate-300 dark:border-[#2A3042] bg-white dark:bg-[#181B26] px-4 text-sm text-slate-900 dark:text-white shadow-xs placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900/40"
          />
          <button type="submit" className={`${btnPrimary} h-11 whitespace-nowrap`}>
            Get Started <ArrowRight size={16} />
          </button>
        </form>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
          Enterprise CRM, Quotations, Orders &amp; Inventory Platform.
        </p>
      </div>

      <DashboardMock />
    </section>
  );
}

/* ---------- Features ---------- */
function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
        {title}
      </h2>
      {sub && (
        <p className="mt-4 text-base text-slate-700 dark:text-slate-300 font-normal">{sub}</p>
      )}
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="px-4 py-20 sm:px-6 lg:px-8">
      <SectionTitle
        title="Everything you need to win more deals"
        sub="One workspace for your pipeline, your contacts and your numbers."
      />
      <div className="mx-auto mt-12 grid max-w-7xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, text, tone }) => (
          <article
            key={title}
            className="rounded-2xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:border-blue-500/50 dark:hover:border-blue-500/50"
          >
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>
              <Icon size={22} />
            </span>
            <h3 className="mt-5 text-lg font-bold text-slate-950 dark:text-white">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------- Showcase tabs ---------- */
function ContactPreview() {
  return (
    <div className="grid gap-3 sm:grid-cols-5">
      <div className="space-y-2 sm:col-span-2">
        {['Account Lead 1', 'Account Lead 2', 'Account Lead 3'].map((n, i) => (
          <div
            key={n}
            className={`flex items-center gap-2.5 rounded-xl border p-2.5 transition ${
              i === 0
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50/80 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200'
                : 'border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] text-slate-800 dark:text-slate-200'
            }`}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 dark:bg-slate-700 text-xs font-bold text-white">
              {n[0]}
            </span>
            <span className="text-sm font-semibold">{n}</span>
          </div>
        ))}
      </div>
      <ol className="space-y-3 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] p-4 sm:col-span-3 shadow-xs">
        {[
          [Mail, 'Opened proposal email', '2 hr ago'],
          [Phone, 'Client phone consultation, 14 min', 'Yesterday'],
          [Clock, 'Follow-up set for Friday', 'Yesterday'],
        ].map(([Icon, t, time], i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Icon size={14} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                {t as string}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {time as string}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EmailPreview() {
  const steps = [
    ['Step 1', 'Welcome and intro', 'Triggered on lead creation'],
    ['Step 2', 'Technical specifications', 'Triggered after 2 days'],
    ['Step 3', 'Commercial review', 'Triggered after consultation'],
  ];

  return (
    <div className="space-y-2.5">
      {steps.map(([d, t, s], i) => (
        <div
          key={d}
          className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#1E2230] p-3 shadow-xs"
        >
          <span
            className={`flex h-9 w-14 items-center justify-center rounded-lg text-xs font-bold ${
              i === 2
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400'
            }`}
          >
            {d}
          </span>
          <span className="flex-1 text-sm font-semibold text-slate-900 dark:text-white">{t}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{s}</span>
        </div>
      ))}
    </div>
  );
}

const TABS = [
  {
    id: 'contacts',
    label: 'Contact management',
    title: 'A full history for every contact',
    text: 'Calls, emails and notes sit on one timeline, so nobody asks a customer to repeat themselves.',
    view: ContactPreview,
  },
  {
    id: 'email',
    label: 'Automated emailing',
    title: 'Follow up without lifting a finger',
    text: 'Build sequences that stop on their own when a lead replies, and track opens and replies per step.',
    view: EmailPreview,
  },
];

function Showcase() {
  const [active, setActive] = useState('contacts');
  const tab = TABS.find((t) => t.id === active) || TABS[0];
  const View = tab.view;

  return (
    <section id="solutions" className="bg-slate-100/70 dark:bg-[#121520] px-4 py-20 sm:px-6 lg:px-8 transition-colors">
      <SectionTitle title="Built around how modern sales teams actually work" />
      <div
        role="tablist"
        className="mx-auto mt-10 flex max-w-xl flex-wrap justify-center gap-1 rounded-xl bg-slate-200/80 dark:bg-[#1E2230] p-1 border border-slate-300/60 dark:border-[#2A3042]"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              active === t.id
                ? 'bg-white dark:bg-[#181B26] text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        className="mx-auto mt-8 grid max-w-6xl items-center gap-8 rounded-3xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] p-6 shadow-sm md:grid-cols-5 md:p-10"
      >
        <div className="md:col-span-2">
          <h3 className="text-2xl font-bold text-slate-950 dark:text-white">{tab.title}</h3>
          <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-400 font-normal">
            {tab.text}
          </p>
          <Link
            to="/login"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            Try it free <ArrowRight size={16} />
          </Link>
        </div>
        <div
          key={active}
          className="rounded-2xl bg-gradient-to-br from-blue-50 to-emerald-50 dark:from-blue-950/30 dark:to-emerald-950/20 p-4 md:col-span-3 md:p-6 border border-slate-200/60 dark:border-[#2A3042]"
        >
          <View />
        </div>
      </div>
    </section>
  );
}

/* ---------- Capability Highlights ---------- */
function CapabilityHighlights() {
  return (
    <section className="px-4 py-16 sm:px-6 lg:px-8 bg-slate-50/50 dark:bg-[#151926]/40">
      <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-3">
        {HIGHLIGHTS.map(({ title, description }) => (
          <div
            key={title}
            className="rounded-2xl border border-slate-200/80 dark:border-[#2A3042] bg-white dark:bg-[#181B26] p-6 text-left shadow-xs"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Pricing ---------- */
function Pricing() {
  return (
    <section id="pricing" className="bg-slate-100/70 dark:bg-[#121520] px-4 py-20 sm:px-6 lg:px-8 transition-colors">
      <SectionTitle
        title="Tailored plans for every organization"
        sub="Choose the feature package that matches your operational needs, or contact our team for custom licensing."
      />

      <div className="mx-auto mt-12 grid max-w-6xl items-stretch gap-6 lg:grid-cols-3">
        {PLANS.map((p) => {
          return (
            <article
              key={p.name}
              className={`relative flex flex-col rounded-2xl p-7 transition ${
                p.popular
                  ? 'bg-slate-900 dark:bg-[#0B0E17] text-white shadow-2xl ring-2 ring-blue-500 lg:-my-3 lg:py-10'
                  : 'border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] text-slate-900 dark:text-white shadow-sm'
              }`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
                  Recommended
                </span>
              )}
              <h3 className="text-xl font-bold">{p.name}</h3>
              <p
                className={`mt-1 text-sm ${
                  p.popular ? 'text-slate-300' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {p.blurb}
              </p>

              <div className="mt-6 p-4 rounded-xl bg-blue-50/50 dark:bg-white/5 border border-blue-100 dark:border-white/5">
                <span className="block text-xs uppercase tracking-wider font-bold text-blue-600 dark:text-blue-400">
                  Feature Package
                </span>
                <span className="block mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  Custom organization quotes
                </span>
              </div>

              <Link
                to="/contact"
                className={`mt-6 ${
                  p.popular
                    ? 'inline-flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white transition'
                    : btnPrimary
                }`}
              >
                {p.cta}
              </Link>
              <ul className="mt-7 space-y-3 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check
                      size={18}
                      className={`mt-px shrink-0 ${
                        p.popular ? 'text-emerald-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    />
                    <span className={p.popular ? 'text-slate-200' : 'text-slate-700 dark:text-slate-300 font-medium'}>
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Final CTA ---------- */
function FinalCta() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-950 px-6 py-14 text-center shadow-2xl sm:px-12">
        <div
          className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal-400/20 blur-3xl"
          aria-hidden
        />
        <h2 className="relative text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Your next best quarter starts today
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg text-blue-100 font-normal">
          Close more deals with less busywork. Set up in minutes.
        </p>
        <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-white hover:bg-slate-100 active:bg-slate-200 px-6 py-3 text-sm font-bold text-blue-700 shadow-md transition"
          >
            Get Started Today <ArrowRight size={16} />
          </Link>
        </div>
        <p className="relative mt-4 flex items-center justify-center gap-1.5 text-sm text-blue-200 font-medium">
          <ShieldCheck size={16} /> Enterprise-grade security and dedicated support
        </p>
      </div>
    </section>
  );
}


/* ---------- Main Landing Page Component ---------- */
export default function LandingPage() {
  const [searchParams] = useSearchParams();
  const noticeParam = searchParams.get('notice');
  const [notice, setNotice] = useState<string | null>(() => {
    if (noticeParam) return noticeParam;
    if (typeof sessionStorage !== 'undefined') {
      const stored = sessionStorage.getItem('crm_session_notice');
      if (stored) return stored;
    }
    return null;
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col bg-[#F4F6FB] dark:bg-[#0F1117] text-slate-900 dark:text-slate-100 font-sans antialiased transition-colors">
      {notice && (
        <div
          data-testid="session-ended-notice"
          className="bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200 px-4 py-3 text-center text-sm font-semibold flex items-center justify-center gap-3 sticky top-0 z-50 backdrop-blur-md"
        >
          <span>{notice}</span>
          <Link
            to="/login"
            className="font-bold underline hover:no-underline text-amber-950 dark:text-amber-100 bg-amber-500/20 px-3 py-1 rounded-md transition"
          >
            Sign in
          </Link>
        </div>
      )}
      <Navbar />
      <main className="flex-1">
        <Hero />
        <Features />
        <Showcase />
        <CapabilityHighlights />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
