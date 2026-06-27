import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Filler, Tooltip,
} from 'chart.js'
import PlaidConnect from './PlaidConnect.jsx'
import { buildProjection, today0, toISO, addDays, fmtMoney, fmtK, txOccursOnDate } from './projection.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

// ── Constants ──────────────────────────────────────────────────────────────────
const LS_KEY = 'lslj_finance_v4'

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

const DEFAULT_DATA = {
  accounts: [
    { id: 'a1', name: 'Checking', balance: 4250, type: 'checking', plaidAccountId: null },
    { id: 'a2', name: 'Savings',  balance: 12800, type: 'savings', plaidAccountId: null },
  ],
  transactions: [
    // ── INCOME ──────────────────────────────────────────────────────────
    // W3 LLC: biweekly Thursdays — confirmed Jun 5 & Jun 18
    { id: 't_i1',  name: 'W3 LLC / Larry Consulting',    amount: 4627,   type: 'income',  freq: 'biweekly',  start: '2026-06-18', end: '', cat: 'Income',        acct: 'a1' },
    // Genesco Larry: every Thursday — Jun 5, 12, 18, 26
    { id: 't_i2',  name: 'Genesco / Larry Part-time',    amount: 717.65, type: 'income',  freq: 'weekly',    start: '2026-06-05', end: '', cat: 'Income',        acct: 'a1' },
    // Globe Life Terica: biweekly Thursdays — May 29, Jun 12, Jun 26
    { id: 't_i3',  name: 'Globe Life / Terica',          amount: 2720,   type: 'income',  freq: 'biweekly',  start: '2026-06-12', end: '', cat: 'Income',        acct: 'a1' },
    // Robert Half Terica: weekly Wednesdays — Jun 4, 11, 17, 25
    { id: 't_i4',  name: 'Robert Half / Terica',         amount: 1500,   type: 'income',  freq: 'weekly',    start: '2026-06-04', end: '', cat: 'Income',        acct: 'a1' },
    // Genesco Lorenzo: biweekly Thursdays — Jun 18 (same cycle as W3 LLC)
    { id: 't_i5',  name: 'Genesco / Lorenzo',            amount: 8449,   type: 'income',  freq: 'biweekly',  start: '2026-06-18', end: '', cat: 'Income',        acct: 'a1' },
    // Scapa-Mativ Javin: biweekly Thursdays — Jun 5 & Jun 18
    { id: 't_i6',  name: 'Scapa-Mativ / Javin',          amount: 1698,   type: 'income',  freq: 'biweekly',  start: '2026-06-05', end: '', cat: 'Income',        acct: 'a1' },

    // ── UTILITIES ────────────────────────────────────────────────────────
    { id: 't_u1',  name: 'AT&T',                         amount: 630.96, type: 'expense', freq: 'monthly',   start: '2026-06-25', end: '', cat: 'Utilities',     acct: 'a1' },
    { id: 't_u2',  name: 'Comcast',                      amount: 736.02, type: 'expense', freq: 'monthly',   start: '2026-06-26', end: '', cat: 'Utilities',     acct: 'a1' },
    { id: 't_u3',  name: 'Sawnee EMC (Electric)',        amount: 564.14, type: 'expense', freq: 'monthly',   start: '2026-07-01', end: '', cat: 'Utilities',     acct: 'a1' },
    { id: 't_u4',  name: 'Constellation Power (Gas)',    amount: 180.86, type: 'expense', freq: 'monthly',   start: '2026-07-05', end: '', cat: 'Utilities',     acct: 'a1' },
    { id: 't_u5',  name: 'Breezeway Disposal',           amount: 110,    type: 'expense', freq: 'monthly',   start: '2026-07-16', end: '', cat: 'Housing',       acct: 'a1' },

    // ── LOANS & DEBT ─────────────────────────────────────────────────────
    { id: 't_d1',  name: 'Prosper Marketplace',          amount: 904.03, type: 'expense', freq: 'monthly',   start: '2026-07-03', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_d2',  name: 'Student Loan',                 amount: 229.05, type: 'expense', freq: 'monthly',   start: '2026-07-09', end: '', cat: 'Education',     acct: 'a1' },
    { id: 't_d3',  name: 'Synchrony',                    amount: 295,    type: 'expense', freq: 'monthly',   start: '2026-07-11', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_d4',  name: 'Discover Card',                amount: 683,    type: 'expense', freq: 'monthly',   start: '2026-07-26', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_d5',  name: 'Capital One (Terica)',         amount: 482,    type: 'expense', freq: 'monthly',   start: '2026-07-02', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_d6',  name: 'Capital One (Lorenzo)',        amount: 275,    type: 'expense', freq: 'monthly',   start: '2026-07-08', end: '', cat: 'Other',         acct: 'a1' },

    // ── INSURANCE ────────────────────────────────────────────────────────
    { id: 't_ins1',name: 'Protective Life Insurance',    amount: 65.08,  type: 'expense', freq: 'monthly',   start: '2026-07-24', end: '', cat: 'Insurance',     acct: 'a1' },
    { id: 't_ins2',name: 'American General Life',        amount: 62.76,  type: 'expense', freq: 'monthly',   start: '2026-07-24', end: '', cat: 'Insurance',     acct: 'a1' },
    { id: 't_ins3',name: 'Pacific Life Insurance',       amount: 126.95, type: 'expense', freq: 'monthly',   start: '2026-07-15', end: '', cat: 'Insurance',     acct: 'a1' },

    // ── FITNESS ──────────────────────────────────────────────────────────
    { id: 't_ft1', name: 'Life Time (Larry)',             amount: 499,    type: 'expense', freq: 'monthly',   start: '2026-07-01', end: '', cat: 'Healthcare',    acct: 'a1' },
    { id: 't_ft2', name: 'Life Time (Lorenzo)',           amount: 349,    type: 'expense', freq: 'monthly',   start: '2026-07-01', end: '', cat: 'Healthcare',    acct: 'a1' },

    // ── STREAMING ────────────────────────────────────────────────────────
    { id: 't_s1',  name: 'Netflix',                      amount: 26.99,  type: 'expense', freq: 'monthly',   start: '2026-07-01', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s2',  name: 'Disney+',                      amount: 18.99,  type: 'expense', freq: 'monthly',   start: '2026-07-28', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s3',  name: 'Peacock',                      amount: 16.99,  type: 'expense', freq: 'monthly',   start: '2026-07-02', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s4',  name: 'Amazon Prime Video',           amount: 11.99,  type: 'expense', freq: 'monthly',   start: '2026-07-18', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s5',  name: 'Audible',                      amount: 16.11,  type: 'expense', freq: 'monthly',   start: '2026-07-05', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s6',  name: 'Musora Media',                 amount: 30,     type: 'expense', freq: 'monthly',   start: '2026-07-10', end: '', cat: 'Entertainment', acct: 'a1' },

    // ── SOFTWARE & AI ─────────────────────────────────────────────────────
    // Adobe: two subs — $17.99 posts 8th, $24.98 posts 25th
    { id: 't_sw1a',name: 'Adobe (Creative)',              amount: 17.99,  type: 'expense', freq: 'monthly',   start: '2026-07-08', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw1b',name: 'Adobe (Acrobat)',               amount: 24.98,  type: 'expense', freq: 'monthly',   start: '2026-07-25', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw2', name: 'Anthropic / Claude',            amount: 347,    type: 'expense', freq: 'monthly',   start: '2026-07-02', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw3', name: 'Genspark.ai',                   amount: 49.99,  type: 'expense', freq: 'monthly',   start: '2026-07-22', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw4', name: 'Coursiv.io',                    amount: 39.99,  type: 'expense', freq: 'monthly',   start: '2026-07-25', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw5', name: 'Smartsheet',                    amount: 19,     type: 'expense', freq: 'monthly',   start: '2026-07-25', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw6', name: 'Netlify',                       amount: 9,      type: 'expense', freq: 'monthly',   start: '2026-07-22', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw7', name: 'MYQ (Garage)',                  amount: 14.99,  type: 'expense', freq: 'monthly',   start: '2026-07-10', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw8', name: 'Rocket Money',                  amount: 7,      type: 'expense', freq: 'monthly',   start: '2026-07-17', end: '', cat: 'Other',         acct: 'a1' },

    // ── FOOD & GROCERIES ─────────────────────────────────────────────────
    { id: 't_f1',  name: 'Groceries (Instacart/Kroger/Whole Foods)', amount: 4254, type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Food', acct: 'a1' },

    // ── TRANSPORT ────────────────────────────────────────────────────────
    { id: 't_g1',  name: 'Gas (BP / Kroger / RaceTrac)',  amount: 723,   type: 'expense', freq: 'monthly',   start: '2026-07-01', end: '', cat: 'Transport',     acct: 'a1' },

    // ── PERSONAL CARE ────────────────────────────────────────────────────
    { id: 't_p1',  name: 'Personal Care (hair/nails/grooming)', amount: 663, type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Other',      acct: 'a1' },

    // ── AMAZON ───────────────────────────────────────────────────────────
    { id: 't_az1', name: 'Amazon',                        amount: 3257,   type: 'expense', freq: 'monthly',   start: '2026-07-01', end: '', cat: 'Other',         acct: 'a1' },
  ],
}

function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }
function loadData() {
  try { const v = localStorage.getItem(LS_KEY); return v ? JSON.parse(v) : JSON.parse(JSON.stringify(DEFAULT_DATA)) }
  catch { return JSON.parse(JSON.stringify(DEFAULT_DATA)) }
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
        <button onClick={onCancel} style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#888884', fontSize: 14 }}>
          <i className="ti ti-arrow-left" aria-hidden="true" />
        </button>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#F7F6F2', letterSpacing: '0.04em' }}>{tx?.id ? 'Edit Transaction' : 'Add Transaction'}</h2>
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
          <button onClick={onCancel} style={{ flex: 1, padding: '10px', cursor: 'pointer', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', fontFamily: 'inherit', fontSize: 12, color: '#888884', letterSpacing: '0.06em' }}>Cancel</button>
          <button onClick={save} style={{ flex: 2, padding: '10px', cursor: 'pointer', borderRadius: 10, border: '1px solid rgba(197,164,109,0.3)', background: 'rgba(197,164,109,0.12)', color: '#C5A46D', fontWeight: 600, fontSize: 12, fontFamily: 'inherit', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {tx?.id ? 'Save Changes' : 'Add Transaction'}
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
        <button onClick={onCancel} style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#888884', fontSize: 14 }}>
          <i className="ti ti-arrow-left" aria-hidden="true" />
        </button>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#F7F6F2', letterSpacing: '0.04em' }}>{acct?.id ? 'Edit Account' : 'Add Account'}</h2>
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
          <button onClick={onCancel} style={{ flex: 1, padding: '10px', cursor: 'pointer', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', fontFamily: 'inherit', fontSize: 12, color: '#888884', letterSpacing: '0.06em' }}>Cancel</button>
          <button onClick={save} style={{ flex: 2, padding: '10px', cursor: 'pointer', borderRadius: 10, border: '1px solid rgba(197,164,109,0.3)', background: 'rgba(197,164,109,0.12)', color: '#C5A46D', fontWeight: 600, fontSize: 12, fontFamily: 'inherit', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {acct?.id ? 'Save Changes' : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────────
export default function FinancePlanner() {
  const [data, setData]         = useState(loadData)
  const [view, setView]         = useState('dashboard')
  const [calYear, setCalYear]   = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [selDay, setSelDay]     = useState(null)
  const [editTx, setEditTx]     = useState(null)
  const [editAcct, setEditAcct] = useState(null)
  const [toast, setToast]       = useState('')
  const toastRef                = useRef()

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
      backgroundColor: 'rgba(197,164,109,0.06)',
      fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 5, borderWidth: 1.5,
    }],
  }
  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1D1D1D', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, titleColor: '#888884', bodyColor: '#C5A46D', callbacks: { label: ctx => fmtMoney(ctx.raw) } } },
    scales: {
      x: { ticks: { maxTicksLimit: 7, color: '#888884', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
      y: { ticks: { color: '#888884', callback: v => fmtK(v), font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
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

  const isForm = ['tx-form', 'acct-form'].includes(view)

  return (
    <div className="finance-root fade-in">

      {/* ── Plaid connect bar ── */}
      <PlaidConnect onAccountsSync={handlePlaidSync} />

      {/* ── Sub-navigation ── */}
      {!isForm && (
        <nav className="finance-subnav" aria-label="Finance sections">
          {[
            { id: 'dashboard',    icon: 'ti-layout-dashboard', label: 'Dashboard'    },
            { id: 'calendar',     icon: 'ti-calendar',         label: 'Calendar'     },
            { id: 'transactions', icon: 'ti-refresh',          label: 'Transactions' },
            { id: 'accounts',     icon: 'ti-building-bank',    label: 'Accounts'     },
          ].map(tab => (
            <button key={tab.id} className={`finance-tab ${view === tab.id ? 'active' : ''}`}
              onClick={() => { setView(tab.id); setSelDay(null) }}>
              <i className={`ti ${tab.icon}`} aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </nav>
      )}

      {/* ══════════ DASHBOARD ══════════ */}
      {view === 'dashboard' && (
        <div>
          {/* ── Monthly Income / Expense Summary ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ padding: '18px 20px', background: 'rgba(197,164,109,0.08)', borderRadius: 16, border: '1px solid rgba(197,164,109,0.18)' }}>
              <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: '#9A7B49', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Monthly Income</p>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#C5A46D', letterSpacing: '-0.02em' }}>{fmtMoney(monthlyIncome)}</p>
            </div>
            <div style={{ padding: '18px 20px', background: 'rgba(196,120,90,0.08)', borderRadius: 16, border: '1px solid rgba(196,120,90,0.18)' }}>
              <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: '#a06045', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Monthly Expenses</p>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#C4785A', letterSpacing: '-0.02em' }}>{fmtMoney(monthlyExpense)}</p>
            </div>
            <div style={{ padding: '18px 20px', background: monthlyCashFlow >= 0 ? 'rgba(197,164,109,0.08)' : 'rgba(196,120,90,0.08)', borderRadius: 16, border: `1px solid ${monthlyCashFlow >= 0 ? 'rgba(197,164,109,0.18)' : 'rgba(196,120,90,0.18)'}` }}>
              <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: monthlyCashFlow >= 0 ? '#9A7B49' : '#a06045', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Net Cash Flow</p>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 600, color: monthlyCashFlow >= 0 ? '#C5A46D' : '#C4785A', letterSpacing: '-0.02em' }}>{monthlyCashFlow >= 0 ? '+' : ''}{fmtMoney(monthlyCashFlow)}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 20 }}>
            <MetricCard label="Total balance" value={fmtMoney(totBal)} />
            <MetricCard label="In 30 days" value={pt30 ? fmtMoney(pt30.bal) : '—'}
              sub={pt30 ? (pt30.bal >= totBal ? '+' : '-') + '$' + Math.round(Math.abs(pt30.bal - totBal)).toLocaleString() + ' change' : null}
              subGood={pt30 && pt30.bal >= totBal} />
            <MetricCard label="In 90 days" value={pt90 ? fmtMoney(pt90.bal) : '—'}
              sub={pt90 ? (pt90.bal >= totBal ? '+' : '-') + '$' + Math.round(Math.abs(pt90.bal - totBal)).toLocaleString() + ' change' : null}
              subGood={pt90 && pt90.bal >= totBal} />
            <MetricCard label="90-day floor" value={minDay ? fmtMoney(minBal) : '—'}
              sub={minDay ? minDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null}
              subGood={minBal >= 1000} />
          </div>

          <div className="finance-card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: '#888884', textTransform: 'uppercase', letterSpacing: '0.12em' }}>6-Month Balance Projection</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#888884', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                <div style={{ width: 16, height: 1.5, background: '#C5A46D', borderRadius: 2 }} />
                Projected balance
              </div>
            </div>
            <div style={{ height: 200 }}>
              <Line data={chartDataset} options={chartOptions} aria-label="Projected balance over 6 months" />
            </div>
          </div>

          <div>
            <p style={{ fontSize: 10, fontWeight: 600, color: '#888884', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>Upcoming 7 Days</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {upcoming.length === 0 && <p style={{ fontSize: 13, color: '#888884' }}>No transactions this week.</p>}
              {upcoming.map((tx, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: tx.type === 'income' ? 'rgba(197,164,109,0.12)' : 'rgba(196,120,90,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={`ti ti-${tx.type === 'income' ? 'arrow-down-left' : 'arrow-up-right'}`} style={{ fontSize: 14, color: tx.type === 'income' ? '#C5A46D' : '#C4785A' }} aria-hidden="true" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#F7F6F2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</p>
                    <p style={{ margin: 0, fontSize: 10, color: '#888884', letterSpacing: '0.04em' }}>{tx.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: tx.type === 'income' ? '#C5A46D' : '#C4785A' }}>{tx.type === 'income' ? '+' : '-'}{fmtMoney(tx.amount)}</p>
                    <p style={{ margin: 0, fontSize: 10, color: '#888884' }}>bal: {fmtK(tx.balAfter)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ CALENDAR ══════════ */}
      {view === 'calendar' && (
        <CalendarView proj={proj} calYear={calYear} calMonth={calMonth}
          setCalYear={setCalYear} setCalMonth={setCalMonth}
          selDay={selDay} setSelDay={setSelDay} />
      )}

      {/* ══════════ TRANSACTIONS ══════════ */}
      {view === 'transactions' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: '#888884', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{data.transactions.length} Scheduled Transactions</p>
            <button onClick={() => { setEditTx(null); setView('tx-form') }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', cursor: 'pointer', borderRadius: 10, border: '1px solid rgba(197,164,109,0.3)', background: 'rgba(197,164,109,0.1)', color: '#C5A46D', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              <i className="ti ti-plus" style={{ fontSize: 13 }} aria-hidden="true" /> Add
            </button>
          </div>

          {/* ── Monthly totals summary ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ padding: '16px 18px', background: 'rgba(197,164,109,0.08)', borderRadius: 16, border: '1px solid rgba(197,164,109,0.18)' }}>
              <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: '#9A7B49', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Monthly Income</p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#C5A46D', letterSpacing: '-0.02em' }}>{fmtMoney(monthlyIncome)}</p>
            </div>
            <div style={{ padding: '16px 18px', background: 'rgba(196,120,90,0.08)', borderRadius: 16, border: '1px solid rgba(196,120,90,0.18)' }}>
              <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: '#a06045', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Monthly Expenses</p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#C4785A', letterSpacing: '-0.02em' }}>{fmtMoney(monthlyExpense)}</p>
            </div>
            <div style={{ padding: '16px 18px', background: monthlyCashFlow >= 0 ? 'rgba(197,164,109,0.08)' : 'rgba(196,120,90,0.08)', borderRadius: 16, border: `1px solid ${monthlyCashFlow >= 0 ? 'rgba(197,164,109,0.18)' : 'rgba(196,120,90,0.18)'}` }}>
              <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: monthlyCashFlow >= 0 ? '#9A7B49' : '#a06045', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Net Cash Flow</p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 600, color: monthlyCashFlow >= 0 ? '#C5A46D' : '#C4785A', letterSpacing: '-0.02em' }}>{monthlyCashFlow >= 0 ? '+' : ''}{fmtMoney(monthlyCashFlow)}</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[...data.transactions]
              .sort((a, b) => a.type !== b.type ? (a.type === 'income' ? -1 : 1) : a.name.localeCompare(b.name))
              .map(tx => {
                const freqLabel = FREQ_OPTS.find(f => f.v === tx.freq)?.l || tx.freq
                return (
                  <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, transition: 'background 0.15s' }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: tx.type === 'income' ? 'rgba(197,164,109,0.12)' : 'rgba(196,120,90,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className={`ti ti-${tx.type === 'income' ? 'arrow-down-left' : 'arrow-up-right'}`} style={{ fontSize: 14, color: tx.type === 'income' ? '#C5A46D' : '#C4785A' }} aria-hidden="true" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#F7F6F2' }}>{tx.name}</p>
                      <p style={{ margin: 0, fontSize: 10, color: '#888884', letterSpacing: '0.04em' }}>{tx.cat} · {freqLabel}</p>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, flexShrink: 0, color: tx.type === 'income' ? '#C5A46D' : '#C4785A' }}>
                      {tx.type === 'income' ? '+' : '-'}{fmtMoney(tx.amount)}
                    </p>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => { setEditTx({ ...tx }); setView('tx-form') }}
                        style={{ padding: '5px 8px', cursor: 'pointer', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#888884' }}
                        title="Edit"><i className="ti ti-edit" style={{ fontSize: 13 }} aria-hidden="true" /></button>
                      <button onClick={() => deleteTx(tx.id)}
                        style={{ padding: '5px 8px', cursor: 'pointer', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#888884' }}
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
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: '#888884', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{data.accounts.length} Connected Account{data.accounts.length !== 1 ? 's' : ''}</p>
            <button onClick={() => { setEditAcct(null); setView('acct-form') }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', cursor: 'pointer', borderRadius: 10, border: '1px solid rgba(197,164,109,0.3)', background: 'rgba(197,164,109,0.1)', color: '#C5A46D', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              <i className="ti ti-plus" style={{ fontSize: 13 }} aria-hidden="true" /> Add account
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {data.accounts.map(acct => (
              <div key={acct.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, background: 'rgba(197,164,109,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="ti ti-building-bank" style={{ fontSize: 18, color: '#C5A46D' }} aria-hidden="true" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#F7F6F2' }}>
                    {acct.name}
                    {acct.plaidAccountId && <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 600, background: 'rgba(197,164,109,0.12)', color: '#C5A46D', padding: '2px 8px', borderRadius: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Live</span>}
                  </p>
                  <p style={{ margin: 0, fontSize: 10, color: '#888884', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{acct.type}</p>
                </div>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#C5A46D', letterSpacing: '-0.01em' }}>{fmtMoney(parseFloat(acct.balance || 0))}</p>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => { setEditAcct({ ...acct }); setView('acct-form') }}
                    style={{ padding: '5px 8px', cursor: 'pointer', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#888884' }}
                    title="Edit"><i className="ti ti-edit" style={{ fontSize: 13 }} aria-hidden="true" /></button>
                  <button onClick={() => deleteAcct(acct.id)}
                    style={{ padding: '5px 8px', cursor: 'pointer', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#888884' }}
                    title="Delete"><i className="ti ti-trash" style={{ fontSize: 13 }} aria-hidden="true" /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="finance-card">
            <p style={{ fontSize: 10, fontWeight: 600, color: '#888884', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 16 }}>Balance Forecast</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {[
                { label: 'Current',    val: fmtMoney(totBal) },
                { label: 'In 30 days', val: pt30 ? fmtMoney(pt30.bal) : '—' },
                { label: 'In 90 days', val: pt90 ? fmtMoney(pt90.bal) : '—' },
              ].map(m => (
                <div key={m.label}>
                  <p style={{ margin: '0 0 4px', fontSize: 10, color: '#888884', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{m.label}</p>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#C5A46D', letterSpacing: '-0.01em' }}>{m.val}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ FORMS ══════════ */}
      {view === 'tx-form'   && <TxForm   tx={editTx}   accounts={data.accounts} onSave={updateTx}   onCancel={() => setView('transactions')} />}
      {view === 'acct-form' && <AcctForm acct={editAcct}                         onSave={updateAcct} onCancel={() => setView('accounts')} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

// ── Calendar View ───────────────────────────────────────────────────────────────
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={prevMonth} style={{ padding: '7px 11px', cursor: 'pointer', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#D8D5CE' }}><i className="ti ti-chevron-left" aria-hidden="true" /></button>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, flex: 1, textAlign: 'center', color: '#F7F6F2', letterSpacing: '0.04em' }}>{monthName}</p>
        <button onClick={nextMonth} style={{ padding: '7px 11px', cursor: 'pointer', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#D8D5CE' }}><i className="ti ti-chevron-right" aria-hidden="true" /></button>
        <button onClick={() => { setCalMonth(new Date().getMonth()); setCalYear(new Date().getFullYear()) }}
          style={{ padding: '6px 14px', cursor: 'pointer', borderRadius: 9, border: '1px solid rgba(197,164,109,0.25)', background: 'rgba(197,164,109,0.08)', color: '#C5A46D', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Today</button>
      </div>

      <div className="cal-grid" style={{ marginBottom: 4 }}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <p key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: '#888884', margin: '0 0 6px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{d}</p>
        ))}
      </div>

      <div className="cal-grid">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} style={{ minHeight: 80 }} />
          const m = String(calMonth + 1).padStart(2, '0'), dd = String(d).padStart(2, '0')
          const key = `${calYear}-${m}-${dd}`
          const pt = proj.get(key)
          const isToday = key === todayStr
          const isSel = key === selDay
          const isPast = key < todayStr
          const hasTxns = pt?.txns?.length > 0
          const isNeg = pt && pt.bal < 0
          const isLow = pt && pt.bal >= 0 && pt.bal < 500
          const balColor = isNeg ? '#C4785A' : isLow ? '#9A7B49' : '#C5A46D'

          return (
            <div key={key}
              className={`cal-cell ${isToday ? 'is-today' : ''} ${isSel ? 'is-selected' : ''} ${isPast ? 'is-past' : ''}`}
              onClick={() => setSelDay(isSel ? null : key)}
            >
              <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? '#C5A46D' : '#888884' }}>{d}</p>
              {pt && <p style={{ margin: 0, fontSize: '10px', fontWeight: 600, color: balColor, lineHeight: 1.2 }}>{fmtK(pt.bal)}</p>}
              {hasTxns && (
                <div style={{ display: 'flex', gap: 2, marginTop: 5, flexWrap: 'wrap' }}>
                  {pt.txns.slice(0, 5).map((tx, j) => (
                    <div key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: tx.type === 'income' ? '#C5A46D' : '#C4785A' }} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
        {[['#C5A46D','Income'],['#C4785A','Expense'],['#C5A46D','Healthy (>$500)'],['#9A7B49','Low (<$500)'],['#C4785A','Negative']].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#888884', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0 }} />
            {l}
          </div>
        ))}
      </div>

      {selDay && selPt && (
        <div className="finance-card" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#F7F6F2' }}>
                {new Date(selDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: '#888884', letterSpacing: '0.04em' }}>
                {selPt.delta !== 0 ? `Net: ${selPt.delta > 0 ? '+' : '-'}${fmtMoney(Math.abs(selPt.delta))}` : 'No transactions'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: 10, color: '#888884', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Projected Balance</p>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 600, color: selPt.bal < 0 ? '#C4785A' : selPt.bal < 500 ? '#9A7B49' : '#C5A46D', letterSpacing: '-0.02em' }}>
                {fmtMoney(selPt.bal)}
              </p>
            </div>
          </div>
          {selPt.txns.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {selPt.txns.map((tx, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#F7F6F2' }}>{tx.name}</p>
                    <p style={{ margin: 0, fontSize: 10, color: '#888884', letterSpacing: '0.04em' }}>{tx.cat} · {FREQ_OPTS.find(f => f.v === tx.freq)?.l}</p>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: tx.type === 'income' ? '#C5A46D' : '#C4785A' }}>
                    {tx.type === 'income' ? '+' : '-'}{fmtMoney(tx.amount)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: '#888884' }}>No transactions on this date.</p>
          )}
        </div>
      )}
    </div>
  )
}
