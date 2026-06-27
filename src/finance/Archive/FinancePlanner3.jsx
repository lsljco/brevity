import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import PlaidConnect from './PlaidConnect.jsx'
import { buildProjection, today0, toISO, addDays, fmtMoney, fmtK } from './projection.js'

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
    { id: 't_i1',  name: 'W3 LLC / Larry Consulting',    amount: 4627,   type: 'income',  freq: 'biweekly',  start: '2026-06-18', end: '', cat: 'Income',        acct: 'a1' },
    { id: 't_i2',  name: 'Genesco / Larry Part-time',    amount: 717.65, type: 'income',  freq: 'weekly',    start: '2026-06-05', end: '', cat: 'Income',        acct: 'a1' },
    { id: 't_i3',  name: 'Globe Life / Terica',          amount: 2720,   type: 'income',  freq: 'biweekly',  start: '2026-06-12', end: '', cat: 'Income',        acct: 'a1' },
    { id: 't_i4',  name: 'Robert Half / Terica',         amount: 1500,   type: 'income',  freq: 'weekly',    start: '2026-06-04', end: '', cat: 'Income',        acct: 'a1' },
    { id: 't_i5',  name: 'Genesco / Lorenzo',            amount: 8449,   type: 'income',  freq: 'biweekly',  start: '2026-06-18', end: '', cat: 'Income',        acct: 'a1' },
    { id: 't_i6',  name: 'Scapa-Mativ / Javin',          amount: 1698,   type: 'income',  freq: 'biweekly',  start: '2026-06-05', end: '', cat: 'Income',        acct: 'a1' },
    { id: 't_u1',  name: 'AT&T',                         amount: 630.96, type: 'expense', freq: 'monthly',   start: '2026-06-25', end: '', cat: 'Utilities',     acct: 'a1' },
    { id: 't_u2',  name: 'Comcast',                      amount: 736.02, type: 'expense', freq: 'monthly',   start: '2026-06-26', end: '', cat: 'Utilities',     acct: 'a1' },
    { id: 't_u3',  name: 'Sawnee EMC (Electric)',        amount: 564.14, type: 'expense', freq: 'monthly',   start: '2026-07-01', end: '', cat: 'Utilities',     acct: 'a1' },
    { id: 't_u4',  name: 'Constellation Power (Gas)',    amount: 180.86, type: 'expense', freq: 'monthly',   start: '2026-07-05', end: '', cat: 'Utilities',     acct: 'a1' },
    { id: 't_u5',  name: 'Breezeway Disposal',           amount: 110,    type: 'expense', freq: 'monthly',   start: '2026-07-16', end: '', cat: 'Housing',       acct: 'a1' },
    { id: 't_d1',  name: 'Prosper Marketplace',          amount: 904.03, type: 'expense', freq: 'monthly',   start: '2026-07-03', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_d2',  name: 'Student Loan',                 amount: 229.05, type: 'expense', freq: 'monthly',   start: '2026-07-09', end: '', cat: 'Education',     acct: 'a1' },
    { id: 't_d3',  name: 'Synchrony',                    amount: 295,    type: 'expense', freq: 'monthly',   start: '2026-07-11', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_d4',  name: 'Discover Card',                amount: 683,    type: 'expense', freq: 'monthly',   start: '2026-07-26', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_d5',  name: 'Capital One (Terica)',         amount: 482,    type: 'expense', freq: 'monthly',   start: '2026-07-02', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_d6',  name: 'Capital One (Lorenzo)',        amount: 275,    type: 'expense', freq: 'monthly',   start: '2026-07-08', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_ins1',name: 'Protective Life Insurance',    amount: 65.08,  type: 'expense', freq: 'monthly',   start: '2026-07-24', end: '', cat: 'Insurance',     acct: 'a1' },
    { id: 't_ins2',name: 'American General Life',        amount: 62.76,  type: 'expense', freq: 'monthly',   start: '2026-07-24', end: '', cat: 'Insurance',     acct: 'a1' },
    { id: 't_ins3',name: 'Pacific Life Insurance',       amount: 126.95, type: 'expense', freq: 'monthly',   start: '2026-07-15', end: '', cat: 'Insurance',     acct: 'a1' },
    { id: 't_ft1', name: 'Life Time (Larry)',             amount: 499,    type: 'expense', freq: 'monthly',   start: '2026-07-01', end: '', cat: 'Healthcare',    acct: 'a1' },
    { id: 't_ft2', name: 'Life Time (Lorenzo)',           amount: 349,    type: 'expense', freq: 'monthly',   start: '2026-07-01', end: '', cat: 'Healthcare',    acct: 'a1' },
    { id: 't_s1',  name: 'Netflix',                      amount: 26.99,  type: 'expense', freq: 'monthly',   start: '2026-07-01', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s2',  name: 'Disney+',                      amount: 18.99,  type: 'expense', freq: 'monthly',   start: '2026-07-28', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s3',  name: 'Peacock',                      amount: 16.99,  type: 'expense', freq: 'monthly',   start: '2026-07-02', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s4',  name: 'Amazon Prime Video',           amount: 11.99,  type: 'expense', freq: 'monthly',   start: '2026-07-18', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s5',  name: 'Audible',                      amount: 16.11,  type: 'expense', freq: 'monthly',   start: '2026-07-05', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_s6',  name: 'Musora Media',                 amount: 30,     type: 'expense', freq: 'monthly',   start: '2026-07-10', end: '', cat: 'Entertainment', acct: 'a1' },
    { id: 't_sw1a',name: 'Adobe (Creative)',              amount: 17.99,  type: 'expense', freq: 'monthly',   start: '2026-07-08', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw1b',name: 'Adobe (Acrobat)',               amount: 24.98,  type: 'expense', freq: 'monthly',   start: '2026-07-25', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw2', name: 'Anthropic / Claude',            amount: 347,    type: 'expense', freq: 'monthly',   start: '2026-07-02', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw3', name: 'Genspark.ai',                   amount: 49.99,  type: 'expense', freq: 'monthly',   start: '2026-07-22', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw4', name: 'Coursiv.io',                    amount: 39.99,  type: 'expense', freq: 'monthly',   start: '2026-07-25', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw5', name: 'Smartsheet',                    amount: 19,     type: 'expense', freq: 'monthly',   start: '2026-07-25', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw6', name: 'Netlify',                       amount: 9,      type: 'expense', freq: 'monthly',   start: '2026-07-22', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw7', name: 'MYQ (Garage)',                  amount: 14.99,  type: 'expense', freq: 'monthly',   start: '2026-07-10', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_sw8', name: 'Rocket Money',                  amount: 7,      type: 'expense', freq: 'monthly',   start: '2026-07-17', end: '', cat: 'Other',         acct: 'a1' },
    { id: 't_f1',  name: 'Groceries (Instacart/Kroger/Whole Foods)', amount: 4254, type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Food', acct: 'a1' },
    { id: 't_g1',  name: 'Gas (BP / Kroger / RaceTrac)',  amount: 723,   type: 'expense', freq: 'monthly',   start: '2026-07-01', end: '', cat: 'Transport',     acct: 'a1' },
    { id: 't_p1',  name: 'Personal Care (hair/nails/grooming)', amount: 663, type: 'expense', freq: 'monthly', start: '2026-07-01', end: '', cat: 'Other',      acct: 'a1' },
    { id: 't_az1', name: 'Amazon',                        amount: 3257,   type: 'expense', freq: 'monthly',   start: '2026-07-01', end: '', cat: 'Other',         acct: 'a1' },
  ],
}

function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }
function loadData() {
  try { const v = localStorage.getItem(LS_KEY); return v ? JSON.parse(v) : JSON.parse(JSON.stringify(DEFAULT_DATA)) }
  catch { return JSON.parse(JSON.stringify(DEFAULT_DATA)) }
}
function saveData(d) { try { localStorage.setItem(LS_KEY, JSON.stringify(d)) } catch {} }

// ── Sparkline ──────────────────────────────────────────
function Sparkline({ data, color = '#C5A46D', height = 36 }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const w = 120
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', height, display: 'block' }} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.75" />
    </svg>
  )
}

// ── KPI Card ───────────────────────────────────────────
function KPICard({ icon, label, value, sub, sparkData, trendVal, trendLabel, positive }) {
  const col = positive === false ? '#C4785A' : '#C5A46D'
  const trendCol = trendVal === undefined ? '#888884' : trendVal >= 0 ? '#C5A46D' : '#C4785A'
  return (
    <div className="kpi-card">
      <div className="kpi-icon"><i className={`ti ${icon}`} /></div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color: col }}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {sparkData && sparkData.length > 2 && (
        <div style={{ marginTop: 'auto', paddingTop: 8 }}>
          <Sparkline data={sparkData} color={col} height={32} />
        </div>
      )}
      {trendVal !== undefined && (
        <div className="kpi-trend">
          <i className={`ti ${trendVal >= 0 ? 'ti-trending-up' : 'ti-trending-down'}`} style={{ fontSize: 10, color: trendCol }} />
          <span style={{ color: trendCol }}>{trendVal >= 0 ? '+' : ''}{fmtMoney(Math.abs(trendVal))}</span>
          {trendLabel && <span style={{ color: '#888884' }}>{trendLabel}</span>}
        </div>
      )}
    </div>
  )
}

// ── Donut Chart ────────────────────────────────────────
function DonutChart({ pct, size = 90, stroke = 8 }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const dashOff = circ * (1 - Math.min(100, Math.max(0, pct)) / 100)
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#C5A46D" strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={dashOff}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  )
}

// ── Dashboard Calendar Widget ──────────────────────────
function DashCalendar({ proj }) {
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear,  setCalYear]  = useState(new Date().getFullYear())
  const t = today0(), todayStr = toISO(t)
  const firstDow = new Date(calYear, calMonth, 1).getDay()
  const daysInMo = new Date(calYear, calMonth + 1, 0).getDate()
  const monthName = new Date(calYear, calMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const cells = Array(firstDow).fill(null)
  for (let d = 1; d <= daysInMo; d++) cells.push(d)
  const prev = () => { let m=calMonth-1,y=calYear; if(m<0){m=11;y--}; setCalMonth(m); setCalYear(y) }
  const next = () => { let m=calMonth+1,y=calYear; if(m>11){m=0;y++}; setCalMonth(m); setCalYear(y) }
  return (
    <div className="dash-card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="dash-card-header">
        <span className="dash-card-title">Calendar</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={prev} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', color: '#888884', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}><i className="ti ti-chevron-left" /></button>
          <span style={{ fontSize: 11, fontWeight: 500, color: '#F7F6F2', minWidth: 112, textAlign: 'center' }}>{monthName}</span>
          <button onClick={next} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', color: '#888884', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}><i className="ti ti-chevron-right" /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 5 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <p key={d} style={{ textAlign: 'center', fontSize: 8, fontWeight: 600, color: '#555550', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>{d}</p>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, flex: 1 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />
          const m = String(calMonth+1).padStart(2,'0'), dd = String(d).padStart(2,'0')
          const key = `${calYear}-${m}-${dd}`
          const pt = proj.get(key)
          const isToday = key === todayStr
          const isPast  = key < todayStr
          const hasTx   = pt?.txns?.length > 0
          const balCol  = pt ? (pt.bal < 0 ? '#C4785A' : '#C5A46D') : '#888884'
          return (
            <div key={key} style={{ minHeight: 52, padding: '5px 3px', border: `1px solid ${isToday ? 'rgba(197,164,109,0.5)' : 'rgba(255,255,255,0.05)'}`, borderRadius: 7, background: isToday ? 'rgba(197,164,109,0.07)' : 'rgba(255,255,255,0.02)', opacity: isPast ? 0.38 : 1 }}>
              <p style={{ fontSize: 9.5, fontWeight: isToday ? 700 : 400, color: isToday ? '#C5A46D' : '#888884', textAlign: 'center', margin: '0 0 2px', lineHeight: 1 }}>{d}</p>
              {pt && <p style={{ fontSize: '8px', fontWeight: 600, color: balCol, textAlign: 'center', lineHeight: 1.2, margin: 0 }}>{fmtK(pt.bal)}</p>}
              {hasTx && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 1.5, marginTop: 2 }}>
                  {pt.txns.slice(0,3).map((tx,j) => <div key={j} style={{ width: 3, height: 3, borderRadius: '50%', background: tx.type==='income' ? '#C5A46D' : '#C4785A' }} />)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── TxForm ─────────────────────────────────────────────
function TxForm({ tx, accounts, onSave, onCancel }) {
  const blank = { name:'', amount:'', type:'expense', freq:'monthly', start:toISO(today0()), end:'', cat:'Housing', acct:accounts[0]?.id||'' }
  const [form, setForm] = useState(tx ? {...tx} : blank)
  const set = (k,v) => setForm(f => ({...f,[k]:v}))
  const save = () => {
    if (!form.name || !form.amount) { alert('Name and amount are required.'); return }
    onSave({...form, id:tx?.id||uid(), amount:parseFloat(form.amount)||0})
  }
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
        <button onClick={onCancel} style={{ padding:'6px 10px', cursor:'pointer', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'#888884', fontSize:14 }}><i className="ti ti-arrow-left" /></button>
        <h2 style={{ fontSize:14, fontWeight:600, color:'#F7F6F2', letterSpacing:'0.04em' }}>{tx?.id ? 'Edit Transaction' : 'Add Transaction'}</h2>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:520 }}>
        <div><label className="field-label">Name</label><input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Mortgage, Paycheck…" /></div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><label className="field-label">Type</label><select value={form.type} onChange={e=>set('type',e.target.value)}><option value="income">Income</option><option value="expense">Expense</option></select></div>
          <div><label className="field-label">Amount ($)</label><input type="number" min="0" step="0.01" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="0.00" /></div>
        </div>
        <div><label className="field-label">Frequency</label><select value={form.freq} onChange={e=>set('freq',e.target.value)}>{FREQ_OPTS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><label className="field-label">{form.freq==='once'?'Date':'Start date'}</label><input type="date" value={form.start} onChange={e=>set('start',e.target.value)} /></div>
          {form.freq!=='once'&&<div><label className="field-label">End date (optional)</label><input type="date" value={form.end||''} onChange={e=>set('end',e.target.value)} /></div>}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><label className="field-label">Category</label><select value={form.cat} onChange={e=>set('cat',e.target.value)}>{CATS.map(c=><option key={c}>{c}</option>)}</select></div>
          <div><label className="field-label">Account</label><select value={form.acct} onChange={e=>set('acct',e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        </div>
        <div style={{ display:'flex', gap:8, paddingTop:4 }}>
          <button onClick={onCancel} style={{ flex:1, padding:'10px', cursor:'pointer', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', fontFamily:'inherit', fontSize:12, color:'#888884', letterSpacing:'0.06em' }}>Cancel</button>
          <button onClick={save} style={{ flex:2, padding:'10px', cursor:'pointer', borderRadius:10, border:'1px solid rgba(197,164,109,0.3)', background:'rgba(197,164,109,0.12)', color:'#C5A46D', fontWeight:600, fontSize:12, fontFamily:'inherit', letterSpacing:'0.08em', textTransform:'uppercase' }}>{tx?.id?'Save Changes':'Add Transaction'}</button>
        </div>
      </div>
    </div>
  )
}

// ── AcctForm ───────────────────────────────────────────
function AcctForm({ acct, onSave, onCancel }) {
  const blank = { name:'', balance:'', type:'checking' }
  const [form, setForm] = useState(acct ? {...acct} : blank)
  const set = (k,v) => setForm(f => ({...f,[k]:v}))
  const save = () => {
    if (!form.name) { alert('Account name is required.'); return }
    onSave({...form, id:acct?.id||uid(), balance:parseFloat(form.balance)||0})
  }
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
        <button onClick={onCancel} style={{ padding:'6px 10px', cursor:'pointer', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'#888884', fontSize:14 }}><i className="ti ti-arrow-left" /></button>
        <h2 style={{ fontSize:14, fontWeight:600, color:'#F7F6F2', letterSpacing:'0.04em' }}>{acct?.id?'Edit Account':'Add Account'}</h2>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:400 }}>
        <div><label className="field-label">Account name</label><input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Chase Checking" /></div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><label className="field-label">Current balance ($)</label><input type="number" step="0.01" value={form.balance} onChange={e=>set('balance',e.target.value)} placeholder="0.00" /></div>
          <div><label className="field-label">Account type</label><select value={form.type} onChange={e=>set('type',e.target.value)}>{ACCT_TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</select></div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, padding:'10px', cursor:'pointer', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', fontFamily:'inherit', fontSize:12, color:'#888884' }}>Cancel</button>
          <button onClick={save} style={{ flex:2, padding:'10px', cursor:'pointer', borderRadius:10, border:'1px solid rgba(197,164,109,0.3)', background:'rgba(197,164,109,0.12)', color:'#C5A46D', fontWeight:600, fontSize:12, fontFamily:'inherit', letterSpacing:'0.08em', textTransform:'uppercase' }}>{acct?.id?'Save Changes':'Add Account'}</button>
        </div>
      </div>
    </div>
  )
}

// ── CalendarView (full page) ───────────────────────────
function CalendarView({ proj, calYear, calMonth, setCalYear, setCalMonth, selDay, setSelDay }) {
  const t = today0(), todayStr = toISO(t)
  const firstDow = new Date(calYear, calMonth, 1).getDay()
  const daysInMo = new Date(calYear, calMonth + 1, 0).getDate()
  const monthName = new Date(calYear, calMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const cells = Array(firstDow).fill(null)
  for (let d = 1; d <= daysInMo; d++) cells.push(d)
  const prevMonth = () => { let m=calMonth-1,y=calYear; if(m<0){m=11;y--}; setCalMonth(m); setCalYear(y) }
  const nextMonth = () => { let m=calMonth+1,y=calYear; if(m>11){m=0;y++}; setCalMonth(m); setCalYear(y) }
  const selPt = selDay ? proj.get(selDay) : null
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
        <button onClick={prevMonth} style={{ padding:'7px 11px', cursor:'pointer', borderRadius:9, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'#D8D5CE' }}><i className="ti ti-chevron-left" /></button>
        <p style={{ margin:0, fontSize:14, fontWeight:600, flex:1, textAlign:'center', color:'#F7F6F2' }}>{monthName}</p>
        <button onClick={nextMonth} style={{ padding:'7px 11px', cursor:'pointer', borderRadius:9, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'#D8D5CE' }}><i className="ti ti-chevron-right" /></button>
        <button onClick={()=>{setCalMonth(new Date().getMonth());setCalYear(new Date().getFullYear())}} style={{ padding:'6px 14px', cursor:'pointer', borderRadius:9, border:'1px solid rgba(197,164,109,0.25)', background:'rgba(197,164,109,0.08)', color:'#C5A46D', fontSize:11, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase' }}>Today</button>
      </div>
      <div className="cal-grid" style={{ marginBottom:4 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=>(
          <p key={d} style={{ textAlign:'center', fontSize:10, fontWeight:600, color:'#888884', margin:'0 0 6px', letterSpacing:'0.1em', textTransform:'uppercase' }}>{d}</p>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((d,i)=>{
          if(!d) return <div key={`e${i}`} style={{ minHeight:80 }}/>
          const m=String(calMonth+1).padStart(2,'0'),dd=String(d).padStart(2,'0')
          const key=`${calYear}-${m}-${dd}`
          const pt=proj.get(key)
          const isToday=key===todayStr, isSel=key===selDay, isPast=key<todayStr
          const hasTxns=pt?.txns?.length>0
          const balColor=pt&&pt.bal<0?'#C4785A':pt&&pt.bal<500?'#9A7B49':'#C5A46D'
          return (
            <div key={key} className={`cal-cell ${isToday?'is-today':''} ${isSel?'is-selected':''} ${isPast?'is-past':''}`} onClick={()=>setSelDay(isSel?null:key)}>
              <p style={{ margin:'0 0 3px', fontSize:11, fontWeight:isToday?700:400, color:isToday?'#C5A46D':'#888884' }}>{d}</p>
              {pt&&<p style={{ margin:0, fontSize:'10px', fontWeight:600, color:balColor, lineHeight:1.2 }}>{fmtK(pt.bal)}</p>}
              {hasTxns&&<div style={{ display:'flex', gap:2, marginTop:5, flexWrap:'wrap' }}>{pt.txns.slice(0,5).map((tx,j)=><div key={j} style={{ width:4, height:4, borderRadius:'50%', background:tx.type==='income'?'#C5A46D':'#C4785A' }}/>)}</div>}
            </div>
          )
        })}
      </div>
      {selDay&&selPt&&(
        <div className="finance-card" style={{ marginTop:18 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
            <div>
              <p style={{ margin:0, fontSize:14, fontWeight:600, color:'#F7F6F2' }}>{new Date(selDay+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</p>
              <p style={{ margin:'3px 0 0', fontSize:11, color:'#888884' }}>{selPt.delta!==0?`Net: ${selPt.delta>0?'+':'-'}${fmtMoney(Math.abs(selPt.delta))}`:'No transactions'}</p>
            </div>
            <div style={{ textAlign:'right' }}>
              <p style={{ margin:0, fontSize:10, color:'#888884', textTransform:'uppercase', letterSpacing:'0.1em' }}>Projected Balance</p>
              <p style={{ margin:0, fontSize:22, fontWeight:600, color:selPt.bal<0?'#C4785A':selPt.bal<500?'#9A7B49':'#C5A46D', letterSpacing:'-0.02em' }}>{fmtMoney(selPt.bal)}</p>
            </div>
          </div>
          {selPt.txns.length>0?(
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {selPt.txns.map((tx,i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 12px', background:'rgba(255,255,255,0.04)', borderRadius:10 }}>
                  <div>
                    <p style={{ margin:0, fontSize:13, fontWeight:500, color:'#F7F6F2' }}>{tx.name}</p>
                    <p style={{ margin:0, fontSize:10, color:'#888884' }}>{tx.cat} · {FREQ_OPTS.find(f=>f.v===tx.freq)?.l}</p>
                  </div>
                  <p style={{ margin:0, fontSize:13, fontWeight:600, color:tx.type==='income'?'#C5A46D':'#C4785A' }}>{tx.type==='income'?'+':'-'}{fmtMoney(tx.amount)}</p>
                </div>
              ))}
            </div>
          ):<p style={{ margin:0, fontSize:13, color:'#888884' }}>No transactions on this date.</p>}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────
export default function FinancePlanner({ view, setView }) {
  const [data,     setData]     = useState(loadData)
  const [formView, setFormView] = useState(null)
  const [calYear,  setCalYear]  = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [selDay,   setSelDay]   = useState(null)
  const [editTx,   setEditTx]   = useState(null)
  const [editAcct, setEditAcct] = useState(null)
  const [toast,    setToast]    = useState('')
  const toastRef = useRef()

  const activeView = formView || view

  useEffect(() => { saveData(data) }, [data])
  const proj = useMemo(() => buildProjection(data.accounts, data.transactions, 365), [data])

  // ── All hooks must come before any non-hook code ──
  const spark30 = useMemo(() => {
    const t = today0(), o = []
    for (let i = 0; i <= 30; i += 2) { const p = proj.get(toISO(addDays(t,i))); if (p) o.push(p.bal) }
    return o
  }, [proj])

  const spark90 = useMemo(() => {
    const t = today0(), o = []
    for (let i = 0; i <= 90; i += 5) { const p = proj.get(toISO(addDays(t,i))); if (p) o.push(p.bal) }
    return o
  }, [proj])

  const showToast = (msg) => {
    setToast(msg); clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(''), 3000)
  }

  const handlePlaidSync = useCallback((plaidAccounts) => {
    setData(d => {
      const updated = d.accounts.map(a => {
        const match = plaidAccounts.find(pa => pa.accountId === a.plaidAccountId || pa.name.toLowerCase().includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(pa.name.toLowerCase()))
        if (match) return { ...a, balance: match.balance, plaidAccountId: match.accountId }
        return a
      })
      const existingIds = updated.map(a => a.plaidAccountId).filter(Boolean)
      const newAccts = plaidAccounts.filter(pa => !existingIds.includes(pa.accountId)).map(pa => ({ id: uid(), name: pa.name, balance: pa.balance, type: pa.subtype || pa.type || 'checking', plaidAccountId: pa.accountId }))
      return { ...d, accounts: [...updated, ...newAccts] }
    })
    showToast('✓ Balances synced from Plaid')
  }, [])

  const updateTx = (tx) => {
    setData(d => ({ ...d, transactions: d.transactions.find(t => t.id === tx.id) ? d.transactions.map(t => t.id === tx.id ? tx : t) : [...d.transactions, tx] }))
    setFormView(null); setEditTx(null); showToast('✓ Transaction saved')
  }
  const deleteTx = (id) => {
    if (!window.confirm('Delete this transaction?')) return
    setData(d => ({ ...d, transactions: d.transactions.filter(t => t.id !== id) }))
    showToast('Transaction deleted')
  }
  const updateAcct = (acct) => {
    setData(d => ({ ...d, accounts: d.accounts.find(a => a.id === acct.id) ? d.accounts.map(a => a.id === acct.id ? acct : a) : [...d.accounts, acct] }))
    setFormView(null); setEditAcct(null); showToast('✓ Account saved')
  }
  const deleteAcct = (id) => {
    if (!window.confirm('Delete this account?')) return
    setData(d => ({ ...d, accounts: d.accounts.filter(a => a.id !== id) }))
  }

  // ── Derived values (non-hook) ─────────────────────
  const t = today0()
  const totBal = data.accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0)
  const pt30 = proj.get(toISO(addDays(t, 30)))
  const pt90 = proj.get(toISO(addDays(t, 90)))

  const monthlyIncome  = data.transactions.filter(tx => tx.type==='income').reduce((s,tx)=>{ const m={weekly:4.33,biweekly:2.17,semimonthly:2,monthly:1,quarterly:1/3,yearly:1/12,daily:30,once:0}; return s+tx.amount*(m[tx.freq]??1) },0)
  const monthlyExpense = data.transactions.filter(tx => tx.type==='expense').reduce((s,tx)=>{ const m={weekly:4.33,biweekly:2.17,semimonthly:2,monthly:1,quarterly:1/3,yearly:1/12,daily:30,once:0}; return s+tx.amount*(m[tx.freq]??1) },0)
  const monthlyCashFlow = monthlyIncome - monthlyExpense
  const savingsPct  = monthlyIncome>0 ? Math.max(0,Math.round((monthlyCashFlow/monthlyIncome)*100)) : 0
  const spendingPct = monthlyIncome>0 ? Math.min(100,Math.round((monthlyExpense/monthlyIncome)*100)) : 0

  const upcoming = []
  for(let i=1;i<=7;i++){const d=addDays(t,i);const p=proj.get(toISO(d));if(p?.txns?.length)p.txns.forEach(tx=>upcoming.push({...tx,date:d,balAfter:p.bal}))}

  const hour = new Date().getHours()
  const greeting = hour<12?'Good morning':hour<17?'Good afternoon':'Good evening'
  const dateStr = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <div className="finance-root fade-in">

      {/* ══════════ DASHBOARD ══════════ */}
      {activeView === 'dashboard' && (
        <div>
          {/* Plaid bar */}
          <div style={{ padding:'14px 32px 0', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
            <PlaidConnect onAccountsSync={handlePlaidSync} />
          </div>

          {/* Header */}
          <div className="dash-header">
            <div>
              <h1 className="dash-greeting">{greeting}, Larry</h1>
              <p className="dash-date">{dateStr}</p>
            </div>
            <div className="dash-actions">
              <div className="dash-search">
                <i className="ti ti-search" />
                <input placeholder="Search…" />
              </div>
              <button className="dash-icon-btn"><i className="ti ti-bell" /></button>
              <button className="dash-icon-btn gold" onClick={()=>{setFormView('tx-form');setEditTx(null)}}>
                <i className="ti ti-plus" />
              </button>
            </div>
          </div>

          {/* 5 KPI Cards */}
          <div className="kpi-grid">
            <KPICard icon="ti-wallet"          label="Total Cash"       value={fmtMoney(totBal)}       sub="All Accounts"  sparkData={spark30} trendVal={pt30?pt30.bal-totBal:undefined} trendLabel=" in 30d" />
            <KPICard icon="ti-trending-up"     label="Monthly Income"   value={fmtMoney(monthlyIncome)}  sub="This Month"  positive={true} />
            <KPICard icon="ti-trending-down"   label="Monthly Expenses" value={fmtMoney(monthlyExpense)} sub="This Month"  positive={false} />
            <KPICard icon="ti-arrows-exchange" label="Net Cash Flow"    value={(monthlyCashFlow>=0?'+':'')+fmtMoney(monthlyCashFlow)} sub="This Month" positive={monthlyCashFlow>=0} />
            <KPICard icon="ti-chart-line"      label="90-Day Outlook"   value={pt90?fmtMoney(pt90.bal):'—'} sub="Projected" sparkData={spark90} trendVal={pt90?pt90.bal-totBal:undefined} trendLabel=" growth" />
          </div>

          {/* Main Grid */}
          <div className="dash-grid">
            <div className="dash-left-col">

              {/* Upcoming */}
              <div className="dash-card">
                <div className="dash-card-header">
                  <span className="dash-card-title">Upcoming (Next 7 Days)</span>
                  <button className="dash-card-link" onClick={()=>setView('transactions')}>View All</button>
                </div>
                {upcoming.length===0&&<p style={{fontSize:11,color:'#888884'}}>No upcoming transactions.</p>}
                <div style={{display:'flex',flexDirection:'column',gap:9}}>
                  {upcoming.slice(0,6).map((tx,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:34,flexShrink:0,textAlign:'center',background:'rgba(255,255,255,0.04)',borderRadius:8,padding:'4px 2px',border:'1px solid rgba(255,255,255,0.07)'}}>
                        <p style={{fontSize:7.5,color:'#888884',textTransform:'uppercase',letterSpacing:'0.06em',lineHeight:1,margin:0}}>{MONTHS[tx.date.getMonth()]}</p>
                        <p style={{fontSize:15,fontWeight:600,color:'#F7F6F2',lineHeight:1.2,margin:0}}>{tx.date.getDate()}</p>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontSize:11.5,fontWeight:500,color:'#F7F6F2',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',margin:0}}>{tx.name}</p>
                        <p style={{fontSize:9.5,color:'#888884',margin:0}}>{tx.cat}</p>
                      </div>
                      <p style={{fontSize:11.5,fontWeight:600,color:tx.type==='income'?'#C5A46D':'#C4785A',flexShrink:0,margin:0}}>{tx.type==='income'?'+':'-'}{fmtMoney(tx.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Budget Health */}
              <div className="dash-card">
                <div className="dash-card-header">
                  <span className="dash-card-title">Budget Health</span>
                  <button className="dash-card-link" onClick={()=>setView('transactions')}>View Budget</button>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:14}}>
                  <div style={{position:'relative',flexShrink:0}}>
                    <DonutChart pct={savingsPct} size={90} stroke={8}/>
                    <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                      <span style={{fontSize:16,fontWeight:600,color:'#C5A46D',letterSpacing:'-0.02em',lineHeight:1}}>{savingsPct}%</span>
                      <span style={{fontSize:8,color:'#888884',textTransform:'uppercase',letterSpacing:'0.08em'}}>Saved</span>
                    </div>
                  </div>
                  <div style={{flex:1}}>
                    {[{label:'Income',val:fmtMoney(monthlyIncome),dot:'#C5A46D'},{label:'Expenses',val:fmtMoney(monthlyExpense),dot:'#C4785A'},{label:'Saved',val:fmtMoney(Math.max(0,monthlyCashFlow)),dot:'#555550'}].map(s=>(
                      <div key={s.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:7}}>
                        <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:5,height:5,borderRadius:'50%',background:s.dot,flexShrink:0}}/><span style={{fontSize:10.5,color:'#888884'}}>{s.label}</span></div>
                        <span style={{fontSize:10.5,fontWeight:600,color:s.dot==='#555550'?'#888884':s.dot}}>{s.val}</span>
                      </div>
                    ))}
                    <div style={{marginTop:4}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:9,color:'#888884'}}><span>{fmtMoney(monthlyExpense)} spent</span><span>of {fmtMoney(monthlyIncome)}</span></div>
                      <div style={{height:3,background:'rgba(255,255,255,0.08)',borderRadius:2}}>
                        <div style={{width:`${spendingPct}%`,height:'100%',background:spendingPct>90?'#C4785A':'linear-gradient(90deg,#9A7B49,#C5A46D)',borderRadius:2,transition:'width 0.5s'}}/>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Calendar */}
            <DashCalendar proj={proj} />
          </div>

          {/* Scheduled Transactions grid */}
          <div style={{padding:'0 32px',marginBottom:14}}>
            <div className="dash-card">
              <div className="dash-card-header">
                <span className="dash-card-title">Scheduled Transactions</span>
                <button className="dash-card-link" onClick={()=>setView('transactions')}>View All</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:6}}>
                {[...data.transactions].sort((a,b)=>a.type!==b.type?(a.type==='income'?-1:1):a.name.localeCompare(b.name)).slice(0,12).map((tx,i)=>(
                  <div key={tx.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'rgba(255,255,255,0.03)',borderRadius:10}}>
                    <div style={{width:32,height:32,borderRadius:8,background:tx.type==='income'?'rgba(197,164,109,0.1)':'rgba(255,255,255,0.05)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <i className={`ti ${tx.type==='income'?'ti-arrow-down-left':'ti-arrow-up-right'}`} style={{fontSize:12,color:tx.type==='income'?'#C5A46D':'#888884'}}/>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{fontSize:11.5,fontWeight:500,color:'#F7F6F2',margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tx.name}</p>
                      <p style={{fontSize:9.5,color:'#888884',margin:0}}>{tx.cat} · {FREQ_OPTS.find(f=>f.v===tx.freq)?.l}</p>
                    </div>
                    <p style={{fontSize:11.5,fontWeight:600,color:tx.type==='income'?'#C5A46D':'#C4785A',flexShrink:0,margin:0}}>{tx.type==='income'?'+':'-'}{fmtMoney(tx.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="dash-footer">
            <i className="ti ti-quote" style={{fontSize:26,color:'#C5A46D',opacity:0.3,flexShrink:0}}/>
            <p style={{flex:1,fontSize:12,color:'#888884',fontStyle:'italic',lineHeight:1.5,margin:0}}>
              "Financial freedom is available to those who learn about it and work for it." — Robert Kiyosaki
            </p>
            <div style={{flexShrink:0,textAlign:'right',minWidth:180}}>
              <p style={{fontSize:9,color:'#888884',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:5}}>Savings Rate</p>
              <p style={{fontSize:20,fontWeight:600,color:'#C5A46D',letterSpacing:'-0.02em',marginBottom:6}}>{savingsPct}%</p>
              <div style={{width:'100%',height:3,background:'rgba(255,255,255,0.08)',borderRadius:2}}>
                <div style={{width:`${savingsPct}%`,height:'100%',background:'linear-gradient(90deg,#9A7B49,#C5A46D)',borderRadius:2}}/>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ CALENDAR ══════════ */}
      {activeView === 'calendar' && (
        <div className="finance-inner">
          <PlaidConnect onAccountsSync={handlePlaidSync} />
          <div style={{marginTop:20}}>
            <CalendarView proj={proj} calYear={calYear} calMonth={calMonth} setCalYear={setCalYear} setCalMonth={setCalMonth} selDay={selDay} setSelDay={setSelDay} />
          </div>
        </div>
      )}

      {/* ══════════ TRANSACTIONS ══════════ */}
      {activeView === 'transactions' && (
        <div className="finance-inner">
          <PlaidConnect onAccountsSync={handlePlaidSync} />
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'20px 0 12px'}}>
            <p style={{fontSize:10,fontWeight:600,color:'#888884',textTransform:'uppercase',letterSpacing:'0.12em'}}>{data.transactions.length} Scheduled Transactions</p>
            <button onClick={()=>{setEditTx(null);setFormView('tx-form')}} style={{display:'flex',alignItems:'center',gap:7,padding:'8px 18px',cursor:'pointer',borderRadius:10,border:'1px solid rgba(197,164,109,0.3)',background:'rgba(197,164,109,0.1)',color:'#C5A46D',fontSize:11,fontWeight:600,fontFamily:'inherit',letterSpacing:'0.08em',textTransform:'uppercase'}}>
              <i className="ti ti-plus" style={{fontSize:13}}/> Add
            </button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:20}}>
            <div style={{padding:'16px 18px',background:'rgba(197,164,109,0.08)',borderRadius:16,border:'1px solid rgba(197,164,109,0.18)'}}>
              <p style={{margin:'0 0 6px',fontSize:10,fontWeight:600,color:'#9A7B49',textTransform:'uppercase',letterSpacing:'0.12em'}}>Monthly Income</p>
              <p style={{margin:0,fontSize:20,fontWeight:600,color:'#C5A46D',letterSpacing:'-0.02em'}}>{fmtMoney(monthlyIncome)}</p>
            </div>
            <div style={{padding:'16px 18px',background:'rgba(196,120,90,0.08)',borderRadius:16,border:'1px solid rgba(196,120,90,0.18)'}}>
              <p style={{margin:'0 0 6px',fontSize:10,fontWeight:600,color:'#a06045',textTransform:'uppercase',letterSpacing:'0.12em'}}>Monthly Expenses</p>
              <p style={{margin:0,fontSize:20,fontWeight:600,color:'#C4785A',letterSpacing:'-0.02em'}}>{fmtMoney(monthlyExpense)}</p>
            </div>
            <div style={{padding:'16px 18px',background:monthlyCashFlow>=0?'rgba(197,164,109,0.08)':'rgba(196,120,90,0.08)',borderRadius:16,border:`1px solid ${monthlyCashFlow>=0?'rgba(197,164,109,0.18)':'rgba(196,120,90,0.18)'}`}}>
              <p style={{margin:'0 0 6px',fontSize:10,fontWeight:600,color:monthlyCashFlow>=0?'#9A7B49':'#a06045',textTransform:'uppercase',letterSpacing:'0.12em'}}>Net Cash Flow</p>
              <p style={{margin:0,fontSize:20,fontWeight:600,color:monthlyCashFlow>=0?'#C5A46D':'#C4785A',letterSpacing:'-0.02em'}}>{monthlyCashFlow>=0?'+':''}{fmtMoney(monthlyCashFlow)}</p>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {[...data.transactions].sort((a,b)=>a.type!==b.type?(a.type==='income'?-1:1):a.name.localeCompare(b.name)).map(tx=>{
              const freqLabel=FREQ_OPTS.find(f=>f.v===tx.freq)?.l||tx.freq
              return (
                <div key={tx.id} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12}}>
                  <div style={{width:34,height:34,borderRadius:'50%',flexShrink:0,background:tx.type==='income'?'rgba(197,164,109,0.12)':'rgba(196,120,90,0.12)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <i className={`ti ti-${tx.type==='income'?'arrow-down-left':'arrow-up-right'}`} style={{fontSize:14,color:tx.type==='income'?'#C5A46D':'#C4785A'}}/>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{margin:0,fontSize:13,fontWeight:500,color:'#F7F6F2'}}>{tx.name}</p>
                    <p style={{margin:0,fontSize:10,color:'#888884',letterSpacing:'0.04em'}}>{tx.cat} · {freqLabel}</p>
                  </div>
                  <p style={{margin:0,fontSize:13,fontWeight:600,flexShrink:0,color:tx.type==='income'?'#C5A46D':'#C4785A'}}>{tx.type==='income'?'+':'-'}{fmtMoney(tx.amount)}</p>
                  <div style={{display:'flex',gap:4}}>
                    <button onClick={()=>{setEditTx({...tx});setFormView('tx-form')}} style={{padding:'5px 8px',cursor:'pointer',borderRadius:7,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#888884'}} title="Edit"><i className="ti ti-edit" style={{fontSize:13}}/></button>
                    <button onClick={()=>deleteTx(tx.id)} style={{padding:'5px 8px',cursor:'pointer',borderRadius:7,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#888884'}} title="Delete"><i className="ti ti-trash" style={{fontSize:13}}/></button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════ ACCOUNTS ══════════ */}
      {activeView === 'accounts' && (
        <div className="finance-inner">
          <PlaidConnect onAccountsSync={handlePlaidSync} />
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'20px 0 16px'}}>
            <p style={{fontSize:10,fontWeight:600,color:'#888884',textTransform:'uppercase',letterSpacing:'0.12em'}}>{data.accounts.length} Connected Accounts</p>
            <button onClick={()=>{setEditAcct(null);setFormView('acct-form')}} style={{display:'flex',alignItems:'center',gap:7,padding:'8px 18px',cursor:'pointer',borderRadius:10,border:'1px solid rgba(197,164,109,0.3)',background:'rgba(197,164,109,0.1)',color:'#C5A46D',fontSize:11,fontWeight:600,fontFamily:'inherit',letterSpacing:'0.08em',textTransform:'uppercase'}}>
              <i className="ti ti-plus" style={{fontSize:13}}/> Add account
            </button>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:20}}>
            {data.accounts.map(acct=>(
              <div key={acct.id} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 18px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:14}}>
                <div style={{width:42,height:42,borderRadius:11,background:'rgba(197,164,109,0.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <i className="ti ti-building-bank" style={{fontSize:18,color:'#C5A46D'}}/>
                </div>
                <div style={{flex:1}}>
                  <p style={{margin:0,fontSize:14,fontWeight:500,color:'#F7F6F2'}}>
                    {acct.name}
                    {acct.plaidAccountId&&<span style={{marginLeft:8,fontSize:9,fontWeight:600,background:'rgba(197,164,109,0.12)',color:'#C5A46D',padding:'2px 8px',borderRadius:10,letterSpacing:'0.08em',textTransform:'uppercase'}}>Live</span>}
                  </p>
                  <p style={{margin:0,fontSize:10,color:'#888884',textTransform:'uppercase',letterSpacing:'0.06em'}}>{acct.type}</p>
                </div>
                <p style={{margin:0,fontSize:17,fontWeight:600,color:'#C5A46D',letterSpacing:'-0.01em'}}>{fmtMoney(parseFloat(acct.balance||0))}</p>
                <div style={{display:'flex',gap:4}}>
                  <button onClick={()=>{setEditAcct({...acct});setFormView('acct-form')}} style={{padding:'5px 8px',cursor:'pointer',borderRadius:7,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#888884'}} title="Edit"><i className="ti ti-edit" style={{fontSize:13}}/></button>
                  <button onClick={()=>deleteAcct(acct.id)} style={{padding:'5px 8px',cursor:'pointer',borderRadius:7,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#888884'}} title="Delete"><i className="ti ti-trash" style={{fontSize:13}}/></button>
                </div>
              </div>
            ))}
          </div>
          <div className="finance-card">
            <p style={{fontSize:10,fontWeight:600,color:'#888884',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:16}}>Balance Forecast</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
              {[{label:'Current',val:fmtMoney(totBal)},{label:'In 30 days',val:pt30?fmtMoney(pt30.bal):'—'},{label:'In 90 days',val:pt90?fmtMoney(pt90.bal):'—'}].map(m=>(
                <div key={m.label}>
                  <p style={{margin:'0 0 4px',fontSize:10,color:'#888884',textTransform:'uppercase',letterSpacing:'0.1em'}}>{m.label}</p>
                  <p style={{margin:0,fontSize:18,fontWeight:600,color:'#C5A46D',letterSpacing:'-0.01em'}}>{m.val}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ FORMS ══════════ */}
      {formView === 'tx-form'   && <div className="finance-inner"><TxForm   tx={editTx}   accounts={data.accounts} onSave={updateTx}   onCancel={()=>{setFormView(null);setEditTx(null)}} /></div>}
      {formView === 'acct-form' && <div className="finance-inner"><AcctForm acct={editAcct}                         onSave={updateAcct} onCancel={()=>{setFormView(null);setEditAcct(null)}} /></div>}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
