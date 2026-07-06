import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Line, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Filler, Tooltip, ArcElement, DoughnutController,
} from 'chart.js'
import PlaidConnect from './PlaidConnect.jsx'
import { buildProjection, today0, toISO, addDays, fmtMoney, fmtK, txOccursOnDate } from './projection.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, ArcElement, DoughnutController)

// ── Constants ──────────────────────────────────────────────────────────────────
const LS_KEY = 'lslj_finance_v6'

const FREQ_OPTS = [
  { v: 'once',        l: 'One time' },
  { v: 'daily',       l: 'Daily' },
  { v: 'weekly',      l: 'Weekly' },
  { v: 'biweekly',    l: 'Bi-weekly (every 2 wks)' },
  { v: 'semimonthly', l: 'Semi-monthly (1st & 15th)' },
  { v: 'monthly',     l: 'Monthly' },
  { v: 'quarterly',   l: 'Quarterly' },
  { v: 'yearly',      l: 'Yearly' },
]

const CATS = ['Income','Housing','Utilities','Food','Transport','Insurance','Entertainment','Healthcare','Education','Savings','Travel','Other']
const ACCT_TYPES = ['checking','savings','credit','investment','cash']

const PROJECTS = [
  { id: 'p1', name: 'Kitchen Renovation',  status: 'In Progress', spent: 24680, budget: 36000,
    img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&h=200&fit=crop&q=85' },
  { id: 'p2', name: 'Pool & Landscape',    status: 'In Progress', spent: 18450, budget: 44000,
    img: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=400&h=200&fit=crop&q=85' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function Sparkline({ data = [], color = '#C5A46D', height = 40, fullWidth = false }) {
  if (data.length < 2) return null
  const W = 200, H = height
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - ((v - min) / range) * (H - 8) - 4,
  }))
  // Smooth cubic bezier path
  const lineParts = pts.map((p, i) => {
    if (i === 0) return `M${p.x},${p.y}`
    const prev = pts[i - 1]
    const cpx = (prev.x + p.x) / 2
    return `C${cpx},${prev.y} ${cpx},${p.y} ${p.x},${p.y}`
  }).join(' ')
  const areaPath = `${lineParts} L${W},${H} L0,${H} Z`
  const gradId = `spk-${color.replace(/[^a-z0-9]/gi, '').slice(0,8)}-${data.length}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={fullWidth ? '100%' : 72} height={H}
      style={{ display: 'block', overflow: 'visible' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.20" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={lineParts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const LUXURY_CSS = `
:root {
  --brevity-black: #080808;
  --brevity-ink: #0A0908;
  --brevity-charcoal: #101010;
  --brevity-graphite: #181818;
  --brevity-slate: #242424;
  --brevity-border: rgba(255,255,255,.08);
  --brevity-border-strong: rgba(197,164,109,.40);
  --brevity-white: #F7F6F2;
  --brevity-soft-white: #D8D5CE;
  --brevity-muted: rgba(122,122,118,.90);
  --brevity-dim: rgba(216,213,206,.35);
  --brevity-gold: #C5A46D;
  --brevity-gold-light: #D9BD8B;
  --brevity-gold-dark: #9A7B49;
  --brevity-glass: rgba(14,12,10,.58);
  --brevity-glass-hover: rgba(20,17,14,.68);
  --brevity-shadow: 0 30px 80px rgba(0,0,0,.60), 0 10px 30px rgba(0,0,0,.40);
  --brevity-radius-xl: 28px;
  --brevity-radius-lg: 28px;
  --brevity-radius-md: 14px;
}

/* ── finance-root: layout only, no competing background ── */
.finance-root {
  color: var(--brevity-white) !important;
  font-family: Inter, system-ui, -apple-system, sans-serif !important;
  padding: 0 !important;
  position: relative;
  overflow-x: hidden;
}

/* ── Subtle grid texture overlay ─────────────────────── */
.finance-root::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background:
    linear-gradient(rgba(255,255,255,.012) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.010) 1px, transparent 1px);
  background-size: 72px 72px;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 25%, black 30%, transparent 75%);
}

/* ── Dark-theme overrides for non-dashboard light inline styles ── */
.finance-root [style*="background: white"],
.finance-root [style*='background: "white"'],
.finance-root [style*="background: '#E1F5EE'"],
.finance-root [style*="background: '#FDE8E8'"],
.finance-root [style*="background: '#EBF4FF'"],
.finance-root [style*="background: '#F8F8F7'"] {
  background: rgba(255,255,255,.06) !important;
  color: var(--brevity-white) !important;
  border-color: rgba(255,255,255,.08) !important;
}

/* ── Inputs and selects ─────────────────────────────── */
.finance-root input,
.finance-root select {
  height: 44px;
  color: var(--brevity-white) !important;
  background: rgba(255,255,255,.05) !important;
  border: 1px solid rgba(255,255,255,.08) !important;
  border-radius: 12px !important;
  padding: 0 14px !important;
  outline: none !important;
  font-family: inherit !important;
}
.finance-root input:focus,
.finance-root select:focus {
  border-color: rgba(197,164,109,.50) !important;
  box-shadow: 0 0 0 3px rgba(197,164,109,.10) !important;
}
.finance-root select option { background: #111; color: var(--brevity-white); }

/* ── Calendar cells ─────────────────────────────────── */
.cal-grid {
  display: grid !important;
  grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
  gap: 4px !important;
}
.cal-cell {
  min-height: 110px !important;
  padding: 10px 9px !important;
  cursor: pointer;
  border-radius: 12px !important;
}
.cal-cell:hover {
  border-color: rgba(197,164,109,.28) !important;
  background: rgba(255,255,255,.035) !important;
}
.cal-cell.is-today,
.cal-cell.is-selected {
  border-color: rgba(197,164,109,.55) !important;
  box-shadow: inset 0 0 0 1px rgba(197,164,109,.18), 0 0 28px rgba(197,164,109,.08) !important;
}
.cal-cell.is-past { opacity: .30; }

/* ── Toast ──────────────────────────────────────────── */
.toast {
  color: var(--brevity-white) !important;
  background: rgba(14,12,10,.90) !important;
  border: 1px solid rgba(197,164,109,.35) !important;
  border-radius: 14px !important;
  backdrop-filter: blur(28px) !important;
}
`

function LuxuryStyles() {
  return <style>{LUXURY_CSS}</style>
}



const DEFAULT_DATA = {
  accounts: [
    { id: 'a1', name: 'Checking',    balance: 4250,  type: 'checking',    plaidAccountId: null },
    { id: 'a2', name: 'Savings',     balance: 12800, type: 'savings',     plaidAccountId: null },
    { id: 'a3', name: 'Investment',  balance: 285000,type: 'investment',  plaidAccountId: null },
  ],
  transactions: [
    // ── INCOME ──────────────────────────────────────────────────────────
    { id: 't_i1', name: 'W3 LLC / Larry Consulting', amount: 4627,   type: 'income', freq: 'biweekly', start: '2026-06-18', end: '', cat: 'Income', acct: 'a1' },
    { id: 't_i2', name: 'Genesco / Larry Part-time',  amount: 717.65, type: 'income', freq: 'weekly',   start: '2026-06-05', end: '', cat: 'Income', acct: 'a1' },
    { id: 't_i3', name: 'Globe Life / Terica',        amount: 2720,   type: 'income', freq: 'biweekly', start: '2026-06-12', end: '', cat: 'Income', acct: 'a1' },
    { id: 't_i4', name: 'Robert Half / Terica',       amount: 1500,   type: 'income', freq: 'weekly',   start: '2026-06-04', end: '', cat: 'Income', acct: 'a1' },
    { id: 't_i5', name: 'Genesco / Lorenzo',          amount: 8449,   type: 'income', freq: 'biweekly', start: '2026-06-18', end: '', cat: 'Income', acct: 'a1' },
    { id: 't_i6', name: 'Scapa-Mativ / Javin',        amount: 1698,   type: 'income', freq: 'biweekly', start: '2026-06-05', end: '', cat: 'Income', acct: 'a1' },

    // ── HOUSING ─────────────────────────────────────────────────────────
    { id: 't_h1',  name: 'Mortgage Payment',          amount: 11355.71, type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Housing',    acct: 'a1' },
    { id: 't_h2',  name: 'HELOC Payment',             amount: 2830.57,  type: 'expense', freq: 'monthly', start: '2026-07-15', end: '', cat: 'Housing',    acct: 'a1' },
    { id: 't_h3',  name: 'Home Owner\'s Association', amount: 458.33,   type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Housing',    acct: 'a1' },
    { id: 't_h4',  name: 'Lawncare',                  amount: 320.00,   type: 'expense', freq: 'monthly', start: '2026-07-15', end: '', cat: 'Housing',    acct: 'a1' },

    // ── INSURANCE ───────────────────────────────────────────────────────
    { id: 't_ins1',name: 'Insurance – Homeowner\'s',  amount: 967.33,   type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Insurance',  acct: 'a1' },
    { id: 't_ins2',name: 'Auto Insurance',            amount: 918.33,   type: 'expense', freq: 'monthly', start: '2026-07-15', end: '', cat: 'Insurance',  acct: 'a1' },
    { id: 't_ins3',name: 'Traveler\'s Umbrella',      amount: 94.22,    type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Insurance',  acct: 'a1' },
    { id: 't_ins4',name: 'Life Insurance',            amount: 179.69,   type: 'expense', freq: 'monthly', start: '2026-07-24', end: '', cat: 'Insurance',  acct: 'a1' },

    // ── UTILITIES ───────────────────────────────────────────────────────
    { id: 't_u1',  name: 'Electric (Sawnee EMC)',     amount: 550.00,   type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Utilities',  acct: 'a1' },
    { id: 't_u2',  name: 'AT&T Cellular',             amount: 643.76,   type: 'expense', freq: 'monthly', start: '2026-07-25', end: '', cat: 'Utilities',  acct: 'a1' },
    { id: 't_u3',  name: 'Natural Gas/Constellation', amount: 380.00,   type: 'expense', freq: 'monthly', start: '2026-07-05', end: '', cat: 'Utilities',  acct: 'a1' },
    { id: 't_u4',  name: 'Cable, Internet & Phone',   amount: 336.36,   type: 'expense', freq: 'monthly', start: '2026-07-26', end: '', cat: 'Utilities',  acct: 'a1' },
    { id: 't_u5',  name: 'Waste Management',          amount: 60.00,    type: 'expense', freq: 'monthly', start: '2026-07-16', end: '', cat: 'Utilities',  acct: 'a1' },
    { id: 't_u6',  name: 'Water – Metro Metering',    amount: 136.83,   type: 'expense', freq: 'monthly', start: '2026-07-10', end: '', cat: 'Utilities',  acct: 'a1' },

    // ── DEBT / LOANS ────────────────────────────────────────────────────
    { id: 't_d1',  name: 'Child Support',             amount: 1024.00,  type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Other',      acct: 'a1' },
    { id: 't_d2',  name: 'LJ Prosper Loan',           amount: 904.33,   type: 'expense', freq: 'monthly', start: '2026-07-03', end: '', cat: 'Other',      acct: 'a1' },
    { id: 't_d3',  name: 'LJ Care Credit / Synchrony',amount: 326.00,   type: 'expense', freq: 'monthly', start: '2026-07-11', end: '', cat: 'Other',      acct: 'a1' },
    { id: 't_d4',  name: 'LS Student Loan',           amount: 585.33,   type: 'expense', freq: 'monthly', start: '2026-07-09', end: '', cat: 'Education',  acct: 'a1' },
    { id: 't_d5',  name: 'LJ Student Loan',           amount: 219.00,   type: 'expense', freq: 'monthly', start: '2026-07-09', end: '', cat: 'Education',  acct: 'a1' },
    { id: 't_d6',  name: 'Car Rental',                amount: 1064.00,  type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Transport',  acct: 'a1' },
    { id: 't_d7',  name: 'Dividends',                 amount: 800.00,   type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Other',      acct: 'a1' },

    // ── FOOD & GROCERIES ────────────────────────────────────────────────
    { id: 't_f1',  name: 'Groceries',                 amount: 1000.00,  type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Food',       acct: 'a1' },

    // ── TRANSPORT ───────────────────────────────────────────────────────
    { id: 't_g1',  name: 'Gasoline',                  amount: 320.00,   type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Transport',  acct: 'a1' },

    // ── FITNESS / HEALTH ────────────────────────────────────────────────
    { id: 't_ft1', name: 'LSLJ Gym Membership',       amount: 189.00,   type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Healthcare', acct: 'a1' },
    { id: 't_ft2', name: 'TS & Kids Gym Membership',  amount: 359.00,   type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Healthcare', acct: 'a1' },

    // ── PERSONAL CARE ───────────────────────────────────────────────────
    { id: 't_p1',  name: 'Cleaning/Laundry Supplies', amount: 200.00,   type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Other',      acct: 'a1' },
    { id: 't_p2',  name: 'Personal Care/Hygiene',     amount: 100.00,   type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Other',      acct: 'a1' },
    { id: 't_p3',  name: 'Petcare',                   amount: 150.00,   type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Other',      acct: 'a1' },

    // ── SUBSCRIPTIONS ───────────────────────────────────────────────────
    { id: 't_s1',  name: 'Netflix',                   amount: 21.89,    type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s2',  name: 'Disney+',                   amount: 7.65,     type: 'expense', freq: 'monthly', start: '2026-07-28', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s3',  name: 'Peacock',                   amount: 5.99,     type: 'expense', freq: 'monthly', start: '2026-07-02', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s4',  name: 'YouTube Premium',           amount: 29.99,    type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s5',  name: 'Apple One (Family)',        amount: 25.95,    type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s6',  name: 'Amazon Prime',              amount: 15.00,    type: 'expense', freq: 'monthly', start: '2026-07-18', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s7',  name: 'Pandora',                   amount: 16.45,    type: 'expense', freq: 'monthly', start: '2026-07-10', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s8',  name: 'Amazon Music',              amount: 8.75,     type: 'expense', freq: 'monthly', start: '2026-07-05', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s9',  name: 'Sonos',                     amount: 9.99,     type: 'expense', freq: 'monthly', start: '2026-07-10', end: '', cat: 'Entertainment', acct: 'a1' },

    // ── SOFTWARE & APPS ─────────────────────────────────────────────────
    { id: 't_sw1', name: 'Adobe',                     amount: 21.94,    type: 'expense', freq: 'monthly', start: '2026-07-08', end: '', cat: 'Other',      acct: 'a1' },
    { id: 't_sw2', name: 'SmartSheet',                amount: 20.85,    type: 'expense', freq: 'monthly', start: '2026-07-25', end: '', cat: 'Other',      acct: 'a1' },
    { id: 't_sw3', name: 'Apple Care',                amount: 33.46,    type: 'expense', freq: 'monthly', start: '2026-07-08', end: '', cat: 'Other',      acct: 'a1' },
    { id: 't_sw4', name: 'Monarch Money',             amount: 14.99,    type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Other',      acct: 'a1' },
    { id: 't_sw5', name: 'Arlo',                      amount: 10.96,    type: 'expense', freq: 'monthly', start: '2026-07-10', end: '', cat: 'Other',      acct: 'a1' },
    { id: 't_sw6', name: 'PocketSmith',               amount: 10.03,    type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Other',      acct: 'a1' },
    { id: 't_sw7', name: 'MyMood AI',                 amount: 6.99,     type: 'expense', freq: 'monthly', start: '2026-07-22', end: '', cat: 'Other',      acct: 'a1' },
    { id: 't_sw8', name: 'Life Bible App',            amount: 5.99,     type: 'expense', freq: 'monthly', start: '2026-07-02', end: '', cat: 'Other',      acct: 'a1' },
  ],
}

function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }
function loadData() {
  try {
    const v = localStorage.getItem(LS_KEY)
    if (!v) return JSON.parse(JSON.stringify(DEFAULT_DATA))
    const stored = JSON.parse(v)
    // Always use DEFAULT_DATA transactions as the base so recurring
    // expenses/income are always current regardless of cached LS version.
    // Preserve account balances (Plaid-synced) and any user-added transactions.
    const defaultIds = new Set(DEFAULT_DATA.transactions.map(t => t.id))
    const userTxns = (stored.transactions || []).filter(t => !defaultIds.has(t.id))
    return {
      ...stored,
      accounts: stored.accounts?.length ? stored.accounts : DEFAULT_DATA.accounts,
      transactions: [...DEFAULT_DATA.transactions, ...userTxns],
    }
  } catch { return JSON.parse(JSON.stringify(DEFAULT_DATA)) }
}
function saveData(d) { try { localStorage.setItem(LS_KEY, JSON.stringify(d)) } catch {} }

// ── Sub-components ─────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, subGood }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      {sub && <p className={`metric-sub ${subGood ? 'up' : 'down'}`}>{sub}</p>}
    </div>
  )
}

function TxForm({ tx, accounts, onSave, onCancel }) {
  const blank = { name: '', amount: '', type: 'expense', freq: 'monthly', start: toISO(today0()), end: '', cat: 'Housing', acct: accounts[0]?.id || '' }
  const [form, setForm] = useState(tx ? { ...tx } : blank)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = () => {
    if (!form.name || !form.amount) { alert('Name and amount are required.'); return }
    onSave({ ...form, id: tx?.id || uid(), amount: parseFloat(form.amount) || 0 })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={onCancel} style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: 'white', fontSize: 14 }}>
          <i className="ti ti-arrow-left" aria-hidden="true" />
        </button>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>{tx?.id ? 'Edit transaction' : 'Add transaction'}</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
        <div>
          <label className="field-label">Name</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Mortgage, Paycheck, Car insurance" style={{ width: '100%' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="field-label">Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)} style={{ width: '100%' }}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <div>
            <label className="field-label">Amount ($)</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" style={{ width: '100%' }} />
          </div>
        </div>
        <div>
          <label className="field-label">Frequency</label>
          <select value={form.freq} onChange={e => set('freq', e.target.value)} style={{ width: '100%' }}>
            {FREQ_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="field-label">{form.freq === 'once' ? 'Date' : 'Start date'}</label>
            <input type="date" value={form.start} onChange={e => set('start', e.target.value)} style={{ width: '100%' }} />
          </div>
          {form.freq !== 'once' && (
            <div>
              <label className="field-label">End date (optional)</label>
              <input type="date" value={form.end || ''} onChange={e => set('end', e.target.value)} style={{ width: '100%' }} />
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="field-label">Category</label>
            <select value={form.cat} onChange={e => set('cat', e.target.value)} style={{ width: '100%' }}>
              {CATS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Account</label>
            <select value={form.acct} onChange={e => set('acct', e.target.value)} style={{ width: '100%' }}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '10px', cursor: 'pointer', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', background: 'white', fontFamily: 'inherit', fontSize: 13 }}>Cancel</button>
          <button onClick={save} style={{ flex: 2, padding: '10px', cursor: 'pointer', borderRadius: 10, border: 'none', background: '#C5A46D', color: 'white', fontWeight: 600, fontSize: 14, fontFamily: 'inherit' }}>
            {tx?.id ? 'Save changes' : 'Add transaction'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AcctForm({ acct, onSave, onCancel }) {
  const blank = { name: '', balance: '', type: 'checking' }
  const [form, setForm] = useState(acct ? { ...acct } : blank)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const save = () => {
    if (!form.name) { alert('Account name is required.'); return }
    onSave({ ...form, id: acct?.id || uid(), balance: parseFloat(form.balance) || 0 })
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={onCancel} style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: 'white', fontSize: 14 }}>
          <i className="ti ti-arrow-left" aria-hidden="true" />
        </button>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>{acct?.id ? 'Edit account' : 'Add account'}</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 400 }}>
        <div>
          <label className="field-label">Account name</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Chase Checking" style={{ width: '100%' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="field-label">Current balance ($)</label>
            <input type="number" step="0.01" value={form.balance} onChange={e => set('balance', e.target.value)} placeholder="0.00" style={{ width: '100%' }} />
          </div>
          <div>
            <label className="field-label">Account type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)} style={{ width: '100%' }}>
              {ACCT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '10px', cursor: 'pointer', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', background: 'white', fontFamily: 'inherit', fontSize: 13 }}>Cancel</button>
          <button onClick={save} style={{ flex: 2, padding: '10px', cursor: 'pointer', borderRadius: 10, border: 'none', background: '#C5A46D', color: 'white', fontWeight: 600, fontSize: 14, fontFamily: 'inherit' }}>
            {acct?.id ? 'Save changes' : 'Add account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────────
export default function FinancePlanner({ view: extView, setView: setExtView }) {
  const [data, setData]         = useState(loadData)
  const [formView, setFormView] = useState(null) // 'tx-form' | 'acct-form' | null

  // Primary view comes from App sidebar; form overlays are local
  const view    = formView ?? extView ?? 'dashboard'
  const setView = (v) => {
    if (v === 'tx-form' || v === 'acct-form') { setFormView(v) }
    else { setFormView(null); setExtView?.(v) }
  }

  const [calYear, setCalYear]   = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const _now = new Date()
  const _initMcMonth = _now.getDate() >= 20 ? (_now.getMonth() === 11 ? 0 : _now.getMonth() + 1) : _now.getMonth()
  const _initMcYear  = _now.getDate() >= 20 && _now.getMonth() === 11 ? _now.getFullYear() + 1 : _now.getFullYear()
  const [mcNavYear, setMcNavYear]   = useState(_initMcYear)
  const [mcNavMonth, setMcNavMonth] = useState(_initMcMonth)
  const [selDay, setSelDay]     = useState(null)
  const [editTx, setEditTx]     = useState(null)
  const [editAcct, setEditAcct] = useState(null)
  const [toast, setToast]       = useState('')
  const toastRef                = useRef()

  // ── HomeHQ Projects (live-synced from localStorage) ──────────────────
  const [hqItems, setHqItems] = useState(() => {
    try { const v = localStorage.getItem('homehq_items_v1'); return v ? JSON.parse(v) : [] }
    catch { return [] }
  })
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'homehq_items_v1') {
        try { setHqItems(e.newValue ? JSON.parse(e.newValue) : []) } catch {}
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => { saveData(data) }, [data])

  const proj = useMemo(() => buildProjection(data.accounts, data.transactions, 365), [data])

  const showToast = (msg) => {
    setToast(msg)
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(''), 3000)
  }

  // Called by PlaidConnect when accounts are synced — update balances
  const handlePlaidSync = useCallback((plaidAccounts, syncedAt) => {
    setData(d => {
      const updated = d.accounts.map(a => {
        // Match by plaidAccountId, or fall back to name match
        const match = plaidAccounts.find(pa =>
          pa.accountId === a.plaidAccountId ||
          pa.name.toLowerCase().includes(a.name.toLowerCase()) ||
          a.name.toLowerCase().includes(pa.name.toLowerCase())
        )
        if (match) return { ...a, balance: match.balance, plaidAccountId: match.accountId }
        return a
      })

      // Add brand-new accounts from Plaid that don't exist yet
      const existingPlaidIds = updated.map(a => a.plaidAccountId).filter(Boolean)
      const newAccounts = plaidAccounts
        .filter(pa => !existingPlaidIds.includes(pa.accountId))
        .map(pa => ({
          id: uid(),
          name: pa.name,
          balance: pa.balance,
          type: pa.subtype || pa.type || 'checking',
          plaidAccountId: pa.accountId,
        }))

      return { ...d, accounts: [...updated, ...newAccounts] }
    })
    showToast('✓ Balances synced from Plaid')
  }, [])

  const setDataAndPersist = (fn) => setData(d => { const n = fn(d); return n })

  const updateTx = (tx) => {
    setDataAndPersist(d => ({
      ...d,
      transactions: d.transactions.find(t => t.id === tx.id)
        ? d.transactions.map(t => t.id === tx.id ? tx : t)
        : [...d.transactions, tx],
    }))
    setView('transactions')
    setEditTx(null)
    showToast(tx.id ? '✓ Transaction saved' : '✓ Transaction added')
  }

  const deleteTx = (id) => {
    if (!window.confirm('Delete this transaction?')) return
    setDataAndPersist(d => ({ ...d, transactions: d.transactions.filter(t => t.id !== id) }))
    showToast('Transaction deleted')
  }

  const updateAcct = (acct) => {
    setDataAndPersist(d => ({
      ...d,
      accounts: d.accounts.find(a => a.id === acct.id)
        ? d.accounts.map(a => a.id === acct.id ? acct : a)
        : [...d.accounts, acct],
    }))
    setView('accounts')
    setEditAcct(null)
    showToast('✓ Account saved')
  }

  const deleteAcct = (id) => {
    if (!window.confirm('Delete this account?')) return
    setDataAndPersist(d => ({ ...d, accounts: d.accounts.filter(a => a.id !== id) }))
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const t = today0()
  const totBal = data.accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0)
  const pt30  = proj.get(toISO(addDays(t, 30)))
  const pt90  = proj.get(toISO(addDays(t, 90)))

  // 90-day minimum balance
  let minBal = Infinity, minDay = null
  for (let i = 1; i <= 90; i++) {
    const pt = proj.get(toISO(addDays(t, i)))
    if (pt && pt.bal < minBal) { minBal = pt.bal; minDay = addDays(t, i) }
  }

  // Chart data — every 3 days for 6 months
  const chartLabels = [], chartData = []
  for (let i = 0; i <= 180; i += 3) {
    const d = addDays(t, i)
    const pt = proj.get(toISO(d))
    if (pt) {
      chartLabels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
      chartData.push(pt.bal)
    }
  }

  const chartDataset = {
    labels: chartLabels,
    datasets: [{
      data: chartData,
      borderColor: '#C5A46D',
      backgroundColor: 'rgba(197,164,109,0.10)',
      fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2,
    }],
  }
  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtMoney(ctx.raw) } } },
    scales: {
      x: { ticks: { maxTicksLimit: 7, color: '#D8D5CE', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.06)' }, border: { display: false } },
      y: { ticks: { color: '#D8D5CE', callback: v => fmtK(v), font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.06)' }, border: { display: false } },
    },
  }

  // Upcoming 7 days
  const upcoming = []
  for (let i = 1; i <= 7; i++) {
    const d = addDays(t, i)
    const pt = proj.get(toISO(d))
    if (pt?.txns?.length) pt.txns.forEach(tx => upcoming.push({ ...tx, date: d, balAfter: pt.bal }))
  }

  // Monthly income & expense summary
  const monthlyIncome  = data.transactions.filter(t => t.type === 'income').reduce((s, t) => {
    const m = { weekly: 4.33, biweekly: 2.17, semimonthly: 2, monthly: 1, quarterly: 1/3, yearly: 1/12, daily: 30, once: 0 }
    return s + t.amount * (m[t.freq] ?? 1)
  }, 0)
  const monthlyExpense = data.transactions.filter(t => t.type === 'expense').reduce((s, t) => {
    const m = { weekly: 4.33, biweekly: 2.17, semimonthly: 2, monthly: 1, quarterly: 1/3, yearly: 1/12, daily: 30, once: 0 }
    return s + t.amount * (m[t.freq] ?? 1)
  }, 0)
  const monthlyCashFlow = monthlyIncome - monthlyExpense

  // ── HomeHQ → Projects card ─────────────────────────────────────────────
  const ROOM_IMGS = {
    Kitchen:      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&h=200&fit=crop&q=85',
    Bathroom:     'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=400&h=200&fit=crop&q=85',
    'Living Room':'https://images.unsplash.com/photo-1618219944342-824b40a033f8?w=400&h=200&fit=crop&q=85',
    Bedroom:      'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=400&h=200&fit=crop&q=85',
    Basement:     'https://images.unsplash.com/photo-1574362848149-11496d93a7c7?w=400&h=200&fit=crop&q=85',
    Garage:       'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=200&fit=crop&q=85',
    Exterior:     'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=400&h=200&fit=crop&q=85',
    Yard:         'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=400&h=200&fit=crop&q=85',
    Attic:        'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400&h=200&fit=crop&q=85',
  }
  const ROOM_IMG_DEFAULT = 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=400&h=200&fit=crop&q=85'

  // Projects card: pull from HomeHQ "All Items" tab, excluding backlog (To Do).
  // Falls back to PROJECTS sample data when no active HQ items exist.
  const hqActiveItems = hqItems.filter(item => item.status !== 'To Do')
  const projectItems = hqActiveItems.length > 0
    ? hqActiveItems.map(item => ({
        id:     item.id,
        name:   item.title,
        status: item.status,
        spent:  parseFloat(item.actcost) || 0,
        budget: parseFloat(item.estcost) || 0,
        img:    (item.photos && item.photos[0]) ? item.photos[0] : (ROOM_IMGS[item.room] || ROOM_IMG_DEFAULT),
      }))
    : PROJECTS

  // ── Dashboard extras ──────────────────────────────────────────────────────
  const freqMult = { weekly: 4.33, biweekly: 2.17, semimonthly: 2, monthly: 1, quarterly: 1/3, yearly: 1/12, daily: 30, once: 0 }
  const incomeSources = data.transactions
    .filter(tx => tx.type === 'income')
    .map(tx => ({ ...tx, monthly: tx.amount * (freqMult[tx.freq] ?? 1) }))
    .sort((a, b) => b.monthly - a.monthly)

  const expByCat = {}
  data.transactions.filter(tx => tx.type === 'expense').forEach(tx => {
    expByCat[tx.cat] = (expByCat[tx.cat] || 0) + tx.amount * (freqMult[tx.freq] ?? 1)
  })
  const topCats = Object.entries(expByCat).sort((a, b) => b[1] - a[1]).slice(0, 6)

  const nowDt = new Date()
  const mcYear = mcNavYear, mcMonth = mcNavMonth
  const mcFirstDow = new Date(mcYear, mcMonth, 1).getDay()
  const mcDays = new Date(mcYear, mcMonth + 1, 0).getDate()
  const mcCells = Array(mcFirstDow).fill(null)
  for (let d = 1; d <= mcDays; d++) mcCells.push(d)
  const mcMonthName = new Date(mcYear, mcMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const mcTodayN = nowDt.getDate()
  const mcIsCurrentMonth = mcYear === nowDt.getFullYear() && mcMonth === nowDt.getMonth()
  const mcNavPrev = () => { if (mcNavMonth === 0) { setMcNavMonth(11); setMcNavYear(y => y - 1) } else setMcNavMonth(m => m - 1) }
  const mcNavNext = () => { if (mcNavMonth === 11) { setMcNavMonth(0); setMcNavYear(y => y + 1) } else setMcNavMonth(m => m + 1) }

  const recent14 = []
  for (let i = 1; i <= 14; i++) {
    const d = addDays(t, i)
    const pt = proj.get(toISO(d))
    if (pt?.txns?.length) pt.txns.forEach(tx => recent14.push({ ...tx, date: d }))
  }

  const donutColors = ['#C5A46D','#9A7B49','rgba(197,164,109,0.60)','rgba(197,164,109,0.40)','rgba(197,164,109,0.25)','rgba(197,164,109,0.14)']
  const donutDataset = {
    labels: topCats.map(([k]) => k),
    datasets: [{ data: topCats.map(([, v]) => Math.round(v)), backgroundColor: donutColors, borderColor: 'rgba(255,255,255,0.06)', borderWidth: 1 }],
  }
  const donutOpts = {
    responsive: true, maintainAspectRatio: false, cutout: '72%',
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtMoney(ctx.raw)}` } } },
  }

  const todayLabel = nowDt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const sparkLine30 = chartData.slice(0, 11)

  const isForm = ['tx-form', 'acct-form'].includes(view)

  return (
    <div className="finance-root fade-in">
      <LuxuryStyles />

      {/* ══════════ DASHBOARD ══════════ */}
      {view === 'dashboard' && (
        <div className="dash-body">
          {/* ── Greeting header ── */}
          <div className="dash-header">
            <div>
              <div className="dash-greeting">{getGreeting()}, Larry</div>
              <div className="dash-date">{todayLabel}</div>
            </div>
            <div className="dash-actions">
              <PlaidConnect onAccountsSync={handlePlaidSync} />
              <div className="dash-search">
                <i className="ti ti-search" />
                <input placeholder="Search…" readOnly style={{ cursor: 'default' }} />
              </div>
              <button className="dash-icon-btn" title="Notifications"><i className="ti ti-bell" /></button>
              <button className="dash-icon-btn gold" title="Add transaction" onClick={() => { setEditTx(null); setView('tx-form') }}>
                <i className="ti ti-plus" />
              </button>
            </div>
          </div>

          {/* ── 5 KPI Cards ── */}
          <div className="kpi-grid">
            {[
              { label: 'Total Balance',    value: fmtMoney(totBal),                                                        sub: `${data.accounts.length} accounts`,                                                      trend: `vs last month`, icon: 'ti-wallet',          spark: sparkLine30,                     good: true  },
              { label: 'Monthly Income',   value: fmtMoney(monthlyIncome),                                                 sub: `${incomeSources.length} streams`,                                                       trend: 'vs last month',  icon: 'ti-trending-up',     spark: sparkLine30.map(v=>v*0.58),     good: true  },
              { label: 'Monthly Expenses', value: fmtMoney(monthlyExpense),                                                sub: `${data.transactions.filter(t=>t.type==='expense').length} items`,                       trend: 'vs last month',  icon: 'ti-trending-down',   spark: sparkLine30.map(v=>v*0.42),     good: false },
              { label: 'Net Cash Flow',    value: (monthlyCashFlow >= 0 ? '+' : '') + fmtMoney(monthlyCashFlow),           sub: monthlyCashFlow >= 0 ? 'Monthly surplus' : 'Monthly deficit',                           trend: 'monthly',        icon: 'ti-arrows-exchange', spark: sparkLine30,                     good: monthlyCashFlow >= 0 },
              { label: '90-Day Floor',     value: minDay ? fmtMoney(minBal) : '—',                                         sub: minDay ? minDay.toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—',        trend: 'lowest point',   icon: 'ti-chart-bar',       spark: sparkLine30,                     good: minBal >= 1000 },
            ].map((kpi, i) => {
              const spkColor = kpi.good ? '#C5A46D' : 'rgba(196,120,90,0.85)'
              return (
                <div key={i} className="kpi-card">
                  <div className="kpi-icon"><i className={`ti ${kpi.icon}`} /></div>
                  <div className="kpi-label">{kpi.label}</div>
                  <div className="kpi-value">{kpi.value}</div>
                  {/* Full-width sparkline flush to card bottom */}
                  <div className="kpi-sparkline">
                    <Sparkline data={kpi.spark} color={spkColor} height={48} fullWidth />
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── 3-column grid ── */}
          <div className="dash-main-grid">

            {/* Col 1 · Row 1 — Upcoming 7 days */}
            <div className="dash-card">
              <div className="dash-card-header">
                <span className="dash-card-title">Upcoming · 7 days</span>
                <button className="dash-card-link" onClick={() => setView('calendar')}>Calendar →</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxHeight: 290, overflowY: 'auto' }}>
                {upcoming.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>Nothing due this week.</p>}
                {upcoming.map((tx, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: tx.type === 'income' ? 'rgba(197,164,109,0.14)' : 'rgba(196,120,90,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className={`ti ti-${tx.type === 'income' ? 'arrow-down-left' : 'arrow-up-right'}`} style={{ fontSize: 12, color: tx.type === 'income' ? 'var(--gold)' : 'var(--expense-color)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</p>
                      <p style={{ margin: 0, fontSize: 10, color: 'var(--muted)' }}>{tx.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: tx.type === 'income' ? 'var(--gold)' : 'var(--expense-color)', flexShrink: 0 }}>
                      {tx.type === 'income' ? '+' : '-'}{fmtMoney(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Col 2 · Row 1 — Projects */}
            <div className="dash-card">
              <div className="dash-card-header">
                <span className="dash-card-title">Projects</span>
                <button className="dash-card-link">View All</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}>
                {projectItems.map(p => {
                  const pct = p.budget > 0 ? Math.min(100, Math.round((p.spent / p.budget) * 100)) : 0
                  return (
                    <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      {/* Thumbnail */}
                      <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: '1px solid var(--glass-border)' }}>
                        <img src={p.img} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'brightness(0.8) saturate(0.9)' }} />
                      </div>
                      {/* Details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--white)', lineHeight: 1.3 }}>{p.name}</span>
                          <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--gold)', background: 'rgba(197,164,109,0.15)', border: '1px solid rgba(197,164,109,0.25)', padding: '2px 7px', borderRadius: 8, letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0, marginLeft: 6 }}>{p.status}</span>
                        </div>
                        <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)', marginBottom: 5 }}>
                          <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg,var(--gold-dark),var(--gold))', width: `${pct}%`, transition: 'width 0.5s ease' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span style={{ color: 'var(--muted)' }}>{pct}%</span>
                          <span style={{ color: 'var(--muted)' }}>{fmtMoney(p.spent)} <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span> {fmtMoney(p.budget)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <button style={{ marginTop: 8, width: '100%', padding: '9px 0', background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 10, color: 'var(--muted)', fontSize: 11, fontWeight: 500, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> New Project
              </button>
            </div>

            {/* Col 3 · Rows 1+2 — Calendar */}
            <div className="dash-card" style={{ gridRow: 'span 2', display: 'flex', flexDirection: 'column' }}>
              {/* Calendar header with nav */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <button onClick={mcNavPrev} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>‹</button>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)', letterSpacing: '0.01em' }}>{mcMonthName}</div>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button onClick={mcNavNext} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>›</button>
                  <button className="dash-card-link" onClick={() => setView('calendar')} style={{ marginLeft: 4 }}>Full →</button>
                </div>
              </div>
              {/* Day-of-week headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 4 }}>
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
                  <div key={i} style={{ textAlign: 'center', fontSize: 8, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '3px 0' }}>{d}</div>
                ))}
              </div>
              {/* Calendar cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, flex: 1 }}>
                {mcCells.map((d, i) => {
                  if (!d) return <div key={`e${i}`} />
                  const mm = String(mcMonth + 1).padStart(2, '0'), dd = String(d).padStart(2, '0')
                  const key = `${mcYear}-${mm}-${dd}`
                  const pt = proj.get(key)
                  const isToday = mcIsCurrentMonth && d === mcTodayN
                  const isPast = new Date(mcYear, mcMonth, d) < new Date(nowDt.getFullYear(), nowDt.getMonth(), nowDt.getDate())
                  const hasTx = pt?.txns?.length > 0
                  const dayInc = hasTx ? pt.txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0) : 0
                  const dayExp = hasTx ? pt.txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0) : 0
                  return (
                    <div key={key}
                      onClick={() => { setView('calendar'); setSelDay(key) }}
                      style={{
                        borderRadius: 8,
                        padding: '5px 2px 5px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: isToday ? 'rgba(197,164,109,0.18)' : hasTx ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.015)',
                        border: isToday ? '1px solid rgba(197,164,109,0.55)' : '1px solid rgba(255,255,255,0.05)',
                        opacity: isPast && !isToday ? 0.4 : 1,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
                        transition: 'background 0.15s', minHeight: 0,
                      }}>
                      {/* Day number */}
                      <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--gold)' : 'var(--soft-white)', lineHeight: 1, marginBottom: 1 }}>{d}</div>
                      {/* Deltas */}
                      {hasTx && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                          {dayInc > 0 && <div style={{ fontSize: 7, fontWeight: 600, color: 'var(--gold)', lineHeight: 1 }}>+{fmtK(dayInc)}</div>}
                          {dayExp > 0 && <div style={{ fontSize: 7, fontWeight: 600, color: 'var(--expense-color)', lineHeight: 1 }}>-{fmtK(dayExp)}</div>}
                        </div>
                      )}
                      {/* Balance — gold at bottom, always show when proj data exists */}
                      {pt && (
                        <div style={{ fontSize: 8, fontWeight: 600, color: isToday ? 'var(--gold)' : 'rgba(197,164,109,0.75)', lineHeight: 1, marginTop: 2, letterSpacing: '-0.01em' }}>
                          {fmtK(pt.bal)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* Legend */}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--glass-border)', display: 'flex', gap: 16, justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--muted)' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)' }} /> Net positive
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--muted)' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--expense-color)' }} /> Net negative
                </div>
              </div>
            </div>

            {/* Col 1 · Row 2 — Budget Health */}
            <div className="dash-card">
              <div className="dash-card-header">
                <span className="dash-card-title">Budget Health</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtMoney(monthlyExpense)}/mo</span>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 88, height: 88, flexShrink: 0, position: 'relative' }}>
                  <Doughnut data={donutDataset} options={donutOpts} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {topCats.map(([cat, val], i) => (
                    <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: donutColors[i] }} />
                        <span style={{ fontSize: 11, color: 'var(--soft-white)' }}>{cat}</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtMoney(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Col 2 · Row 2 — Recent Activity */}
            <div className="dash-card">
              <div className="dash-card-header">
                <span className="dash-card-title">Activity · 14 days</span>
                <button className="dash-card-link" onClick={() => setView('transactions')}>All →</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 260, overflowY: 'auto' }}>
                {recent14.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>Nothing in the next 14 days.</p>}
                {recent14.slice(0, 12).map((tx, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: i < Math.min(recent14.length, 12) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: tx.type === 'income' ? 'var(--gold)' : 'var(--expense-color)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</p>
                      <p style={{ margin: 0, fontSize: 10, color: 'var(--muted)' }}>{tx.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: tx.type === 'income' ? 'var(--gold)' : 'var(--expense-color)', flexShrink: 0 }}>
                      {tx.type === 'income' ? '+' : '-'}{fmtMoney(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>{/* /3-col grid */}

          {/* ── Footer quote bar ── */}
          <div className="dash-footer">
            <i className="ti ti-quote" style={{ color: 'var(--gold)', fontSize: 18, flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', flex: 1 }}>
              "Wealth is not about having a lot of money; it&apos;s about having a lot of options."
            </p>
            <span style={{ fontSize: 10, color: 'var(--gold-dark)', flexShrink: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Chris Rock</span>

            {/* Net Worth Goal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingLeft: 22, borderLeft: '1px solid var(--glass-border)', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Net Worth Goal</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--white)' }}>$3.00M</span>
                  <span style={{ fontSize: 11, color: 'var(--gold)' }}>47%</span>
                </div>
                <div style={{ width: 160, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', marginTop: 6 }}>
                  <div style={{ height: '100%', width: '47%', borderRadius: 2, background: 'linear-gradient(90deg, var(--gold-dark), var(--gold))' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ CALENDAR ══════════ */}
      {view === 'calendar' && (
        <div className="finance-inner">
          <CalendarView proj={proj} calYear={calYear} calMonth={calMonth}
            setCalYear={setCalYear} setCalMonth={setCalMonth}
            selDay={selDay} setSelDay={setSelDay} />
        </div>
      )}

      {/* ══════════ TRANSACTIONS ══════════ */}
      {view === 'transactions' && (
        <div className="finance-inner">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{data.transactions.length} scheduled transaction{data.transactions.length !== 1 ? 's' : ''}</p>
            <button onClick={() => { setEditTx(null); setView('tx-form') }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', cursor: 'pointer', borderRadius: 10, border: 'none', background: '#C5A46D', color: 'white', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
              <i className="ti ti-plus" style={{ fontSize: 14 }} aria-hidden="true" /> Add transaction
            </button>
          </div>

          {/* ── Monthly totals summary ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            <div style={{ padding: '12px 14px', background: '#E1F5EE', borderRadius: 12, border: '1px solid rgba(15,110,86,0.15)' }}>
              <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 600, color: '#0F6E56', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monthly Income</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0F6E56' }}>{fmtMoney(monthlyIncome)}</p>
            </div>
            <div style={{ padding: '12px 14px', background: '#FDE8E8', borderRadius: 12, border: '1px solid rgba(163,45,45,0.15)' }}>
              <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 600, color: '#A32D2D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monthly Expenses</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#A32D2D' }}>{fmtMoney(monthlyExpense)}</p>
            </div>
            <div style={{ padding: '12px 14px', background: monthlyCashFlow >= 0 ? '#E1F5EE' : '#FDE8E8', borderRadius: 12, border: `1px solid ${monthlyCashFlow >= 0 ? 'rgba(15,110,86,0.15)' : 'rgba(163,45,45,0.15)'}` }}>
              <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 600, color: monthlyCashFlow >= 0 ? '#0F6E56' : '#A32D2D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Cash Flow</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: monthlyCashFlow >= 0 ? '#0F6E56' : '#A32D2D' }}>{monthlyCashFlow >= 0 ? '+' : ''}{fmtMoney(monthlyCashFlow)}</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...data.transactions]
              .sort((a, b) => a.type !== b.type ? (a.type === 'income' ? -1 : 1) : a.name.localeCompare(b.name))
              .map(tx => {
                const freqLabel = FREQ_OPTS.find(f => f.v === tx.freq)?.l || tx.freq
                return (
                  <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'white', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: tx.type === 'income' ? '#E1F5EE' : '#FDE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className={`ti ti-${tx.type === 'income' ? 'arrow-down-left' : 'arrow-up-right'}`} style={{ fontSize: 14, color: tx.type === 'income' ? '#0F6E56' : '#A32D2D' }} aria-hidden="true" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{tx.name}</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#D8D5CE' }}>{tx.cat} · {freqLabel}</p>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, flexShrink: 0, color: tx.type === 'income' ? '#0F6E56' : '#A32D2D' }}>
                      {tx.type === 'income' ? '+' : '-'}{fmtMoney(tx.amount)}
                    </p>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => { setEditTx({ ...tx }); setView('tx-form') }}
                        style={{ padding: '5px 8px', cursor: 'pointer', borderRadius: 7, border: '1px solid rgba(0,0,0,0.1)', background: 'white' }}
                        title="Edit"><i className="ti ti-edit" style={{ fontSize: 13 }} aria-hidden="true" /></button>
                      <button onClick={() => deleteTx(tx.id)}
                        style={{ padding: '5px 8px', cursor: 'pointer', borderRadius: 7, border: '1px solid rgba(0,0,0,0.1)', background: 'white', color: '#D8D5CE' }}
                        title="Delete"><i className="ti ti-trash" style={{ fontSize: 13 }} aria-hidden="true" /></button>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* ══════════ ACCOUNTS ══════════ */}
      {view === 'accounts' && (
        <div className="finance-inner">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{data.accounts.length} account{data.accounts.length !== 1 ? 's' : ''}</p>
            <button onClick={() => { setEditAcct(null); setView('acct-form') }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', cursor: 'pointer', borderRadius: 10, border: 'none', background: '#C5A46D', color: 'white', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
              <i className="ti ti-plus" style={{ fontSize: 14 }} aria-hidden="true" /> Add account
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {data.accounts.map(acct => (
              <div key={acct.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(197,164,109,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="ti ti-building-bank" style={{ fontSize: 18, color: 'var(--gold)' }} aria-hidden="true" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
                    {acct.name}
                    {acct.plaidAccountId && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, background: 'rgba(197,164,109,0.12)', color: 'var(--gold)', padding: '2px 7px', borderRadius: 10 }}>Plaid</span>}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>{acct.type}</p>
                </div>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{fmtMoney(parseFloat(acct.balance || 0))}</p>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => { setEditAcct({ ...acct }); setView('acct-form') }}
                    style={{ padding: '5px 8px', cursor: 'pointer', borderRadius: 7, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--muted)' }}
                    title="Edit"><i className="ti ti-edit" style={{ fontSize: 13 }} aria-hidden="true" /></button>
                  <button onClick={() => deleteAcct(acct.id)}
                    style={{ padding: '5px 8px', cursor: 'pointer', borderRadius: 7, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--muted)' }}
                    title="Delete"><i className="ti ti-trash" style={{ fontSize: 13 }} aria-hidden="true" /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="finance-card">
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 12 }}>Combined balance forecast</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {[
                { label: 'Current',    val: fmtMoney(totBal) },
                { label: 'In 30 days', val: pt30 ? fmtMoney(pt30.bal) : '—' },
                { label: 'In 90 days', val: pt90 ? fmtMoney(pt90.bal) : '—' },
              ].map(m => (
                <div key={m.label}>
                  <p style={{ margin: '0 0 3px', fontSize: 11, color: 'var(--muted)' }}>{m.label}</p>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--gold)' }}>{m.val}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ FORMS ══════════ */}
      {view === 'tx-form'   && <div className="finance-inner"><TxForm   tx={editTx}   accounts={data.accounts} onSave={updateTx}   onCancel={() => setView('transactions')} /></div>}
      {view === 'acct-form' && <div className="finance-inner"><AcctForm acct={editAcct}                         onSave={updateAcct} onCancel={() => setView('accounts')} /></div>}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

// ── Calendar View ────────────────────────────────────────────────────────────────
function CalendarView({ proj, calYear, calMonth, setCalYear, setCalMonth, selDay, setSelDay }) {
  const t = today0()
  const todayStr = toISO(t)
  const firstDow = new Date(calYear, calMonth, 1).getDay()
  const daysInMo = new Date(calYear, calMonth + 1, 0).getDate()
  const monthName = new Date(calYear, calMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const cells = Array(firstDow).fill(null)
  for (let d = 1; d <= daysInMo; d++) cells.push(d)

  const prevMonth = () => { let m = calMonth - 1, y = calYear; if (m < 0) { m = 11; y-- }; setCalMonth(m); setCalYear(y) }
  const nextMonth = () => { let m = calMonth + 1, y = calYear; if (m > 11) { m = 0; y++ }; setCalMonth(m); setCalYear(y) }

  const selPt = selDay ? proj.get(selDay) : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={prevMonth} style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent' }}>
          <i className="ti ti-chevron-left" aria-hidden="true" />
        </button>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: 1, textAlign: 'center' }}>{monthName}</p>
        <button onClick={nextMonth} style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent' }}>
          <i className="ti ti-chevron-right" aria-hidden="true" />
        </button>
        <button onClick={() => { setCalMonth(new Date().getMonth()); setCalYear(new Date().getFullYear()) }}
          style={{ padding: '5px 10px', cursor: 'pointer', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', fontSize: 12 }}>
          Today
        </button>
      </div>

      <div className="cal-grid" style={{ marginBottom: 4 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <p key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--muted)', margin: '0 0 4px' }}>{d}</p>
        ))}
      </div>

      <div className="cal-grid">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} style={{ minHeight: 72 }} />
          const m = String(calMonth + 1).padStart(2, '0'), dd = String(d).padStart(2, '0')
          const key = `${calYear}-${m}-${dd}`
          const pt = proj.get(key)
          const isToday = key === todayStr
          const isSel = key === selDay
          const isPast = key < todayStr
          const hasTxns = pt?.txns?.length > 0
          const isNeg = pt && pt.bal < 0
          const isLow = pt && pt.bal >= 0 && pt.bal < 500
          const balColor = isNeg ? '#D9BD8B' : isLow ? '#C5A46D' : '#C5A46D'
          return (
            <div key={key}
              className={`cal-cell ${isToday ? 'is-today' : ''} ${isSel ? 'is-selected' : ''} ${isPast ? 'is-past' : ''}`}
              onClick={() => setSelDay(isSel ? null : key)}>
              <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: isToday ? 600 : 400, color: isToday ? 'var(--gold)' : 'var(--muted)' }}>{d}</p>
              {pt && <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: balColor, lineHeight: 1.2 }}>{fmtK(pt.bal)}</p>}
              {hasTxns && (
                <div style={{ display: 'flex', gap: 2, marginTop: 4, flexWrap: 'wrap' }}>
                  {pt.txns.slice(0, 5).map((tx, j) => (
                    <div key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: tx.type === 'income' ? 'var(--gold)' : 'var(--expense-color)' }} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
        {[['var(--gold)','Income'],['var(--expense-color)','Expense'],['var(--gold-dark)','Healthy (>$500)'],['rgba(197,164,109,0.4)','Low (<$500)'],['rgba(196,120,90,0.6)','Negative']].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }} />
            {l}
          </div>
        ))}
      </div>

      {selDay && selPt && (
        <div className="finance-card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                {new Date(selDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                {selPt.delta !== 0 ? `Net: ${selPt.delta > 0 ? '+' : '-'}${fmtMoney(Math.abs(selPt.delta))}` : 'No transactions'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>Projected balance</p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 600, color: selPt.bal < 0 ? 'var(--expense-color)' : 'var(--gold)' }}>
                {fmtMoney(selPt.bal)}
              </p>
            </div>
          </div>
          {selPt.txns.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selPt.txns.map((tx, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 9 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{tx.name}</p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>{tx.cat} · {FREQ_OPTS.find(f => f.v === tx.freq)?.l}</p>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: tx.type === 'income' ? 'var(--gold)' : 'var(--expense-color)' }}>
                    {tx.type === 'income' ? '+' : '-'}{fmtMoney(tx.amount)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>No transactions on this date.</p>
          )}
        </div>
      )}
    </div>
  )
}
