import { useMemo, useState } from 'react'
import { fmtMoney } from './projection.js'
import { groupReportTransactions, reportStats, transactionDirection } from './reportingData.js'
import { timeframeLabel } from './financeTimeframe.js'

const COLORS = ['#17A9CC','#35AD76','#FFC247','#FF6A2F','#8850CE','#D23B9A','#4867DD','#18A99A','#ED4C52','#86A63D']
const button = active => ({ flex: 1, padding: '10px 14px', border: 0, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
  color: active ? 'var(--white)' : 'var(--muted)', background: active ? 'rgba(255,255,255,.11)' : 'transparent' })

function Drilldown({ title, transactions, onClose }) {
  const total = transactions.reduce((sum, row) => sum + Math.abs(Number(row.amount) || 0), 0)
  return <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(0,0,0,.72)', display: 'grid', placeItems: 'center', padding: 18 }} onClick={onClose}>
    <div className="finance-card" onClick={e => e.stopPropagation()} style={{ width: 'min(760px,96vw)', maxHeight: '82vh', overflow: 'auto', padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', marginBottom: 16 }}>
        <div><h3 style={{ margin: 0 }}>{title}</h3><p style={{ margin: '5px 0 0', color: 'var(--muted)', fontSize: 12 }}>{transactions.length} transactions · {fmtMoney(total)}</p></div>
        <button onClick={onClose} aria-label="Close details" style={{ border: 0, background: 'transparent', color: 'var(--muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
      </div>
      {transactions.length ? transactions.slice().sort((a,b) => b.date.localeCompare(a.date)).map((row, index) => <div key={row.id || index} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 140px 110px', gap: 10, padding: '10px 4px', borderTop: '1px solid rgba(255,255,255,.06)', fontSize: 12 }}>
        <span style={{ color: 'var(--muted)' }}>{row.date}</span><span>{row.merchant_name || row.name}</span><span style={{ color: 'var(--muted)' }}>{row.category || row.cat || 'Uncategorized'}</span>
        <strong style={{ textAlign: 'right', color: transactionDirection(row) === 'income' ? 'var(--income-color)' : 'var(--expense-color)' }}>{transactionDirection(row) === 'income' ? '+' : '-'}{fmtMoney(Math.abs(row.amount))}</strong>
      </div>) : <p style={{ color: 'var(--muted)' }}>No transactions make up this total.</p>}
    </div>
  </div>
}

function Stat({ label, value, color, onClick }) {
  return <button onClick={onClick} style={{ textAlign: 'left', padding: '18px 20px', borderRadius: 14, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}>
    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--muted)' }}>{label}</div>
    <div style={{ fontSize: 22, marginTop: 7, color: color || 'var(--white)' }}>{value}</div>
    <div style={{ fontSize: 10, color: 'var(--gold)', marginTop: 6 }}>View details →</div>
  </button>
}

function Bars({ rows, total, direction, onOpen }) {
  return <div className="finance-card" style={{ padding: 20 }}>
    {rows.length ? rows.slice(0, 18).map((row, index) => <button key={row.name} onClick={() => onOpen(row.name, row.transactions)} style={{ display: 'block', width: '100%', border: 0, background: 'transparent', color: 'inherit', padding: '6px 0', cursor: 'pointer', fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, marginBottom: 5 }}><span>{row.name}</span><span>{fmtMoney(row.amount)} · {total ? ((row.amount / total) * 100).toFixed(1) : 0}%</span></div>
      <div style={{ height: 34, borderRadius: 9, background: 'rgba(255,255,255,.045)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${total ? Math.max(2, row.amount / total * 100) : 0}%`, background: direction === 'income' ? 'rgba(53,173,118,.34)' : 'rgba(237,76,82,.34)', borderRadius: 9 }} /></div>
    </button>) : <p style={{ color: 'var(--muted)' }}>No matching transactions in this timeframe.</p>}
  </div>
}

export default function MonarchReports({ transactions = [], range }) {
  const [tab, setTab] = useState('cashflow')
  const [displayBy, setDisplayBy] = useState('category')
  const [chart, setChart] = useState('bar')
  const [drill, setDrill] = useState(null)
  const income = useMemo(() => reportStats(transactions, 'income'), [transactions])
  const expense = useMemo(() => reportStats(transactions, 'expense'), [transactions])
  const direction = tab === 'income' ? 'income' : 'expense'
  const stats = direction === 'income' ? income : expense
  const rows = useMemo(() => groupReportTransactions(transactions, direction, displayBy), [transactions, direction, displayBy])
  const allIncome = transactions.filter(row => transactionDirection(row) === 'income')
  const allExpense = transactions.filter(row => transactionDirection(row) === 'expense')
  const open = (title, rowsToShow) => setDrill({ title, transactions: rowsToShow })
  const segments = rows.slice(0, 10); let cursor = 0
  const gradient = segments.length ? `conic-gradient(${segments.map((row, i) => { const start = cursor; cursor += stats.total ? row.amount / stats.total * 100 : 0; return `${COLORS[i % COLORS.length]} ${start}% ${cursor}%` }).join(',')})` : 'rgba(255,255,255,.08)'

  return <div>
    {drill && <Drilldown {...drill} onClose={() => setDrill(null)} />}
    <div style={{ display: 'flex', gap: 8, padding: 5, borderRadius: 13, background: 'rgba(255,255,255,.035)', marginBottom: 16 }}>
      {[['cashflow','Cash Flow'],['spending','Spending'],['income','Income']].map(([id,label]) => <button key={id} style={button(tab === id)} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginBottom: 18 }}>
      <label style={{ fontSize: 10, color: 'var(--muted)' }}>Chart<select value={chart} onChange={e => setChart(e.target.value)} style={{ width: '100%', display: 'block', marginTop: 5, padding: 10, borderRadius: 10, background: '#171613', color: 'var(--white)', border: '1px solid rgba(255,255,255,.12)' }}><option value="bar">Bar</option><option value="pie">Pie</option></select></label>
      <label style={{ fontSize: 10, color: 'var(--muted)' }}>Display by<select value={displayBy} onChange={e => setDisplayBy(e.target.value)} style={{ width: '100%', display: 'block', marginTop: 5, padding: 10, borderRadius: 10, background: '#171613', color: 'var(--white)', border: '1px solid rgba(255,255,255,.12)' }}><option value="category">Category</option><option value="group">Group</option><option value="merchant">Merchant</option></select></label>
    </div>
    <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 16px' }}>{timeframeLabel(range)}</p>
    {tab === 'cashflow' ? <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginBottom: 18 }}>
        <Stat label="Total income" value={fmtMoney(income.total)} color="var(--income-color)" onClick={() => open('Total income', allIncome)} />
        <Stat label="Total expenses" value={fmtMoney(expense.total)} color="var(--expense-color)" onClick={() => open('Total expenses', allExpense)} />
        <Stat label="Savings" value={fmtMoney(income.total - expense.total)} color="var(--gold)" onClick={() => open('Cash flow transactions', transactions)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}><Bars rows={groupReportTransactions(transactions, 'income', displayBy)} total={income.total} direction="income" onOpen={open} /><Bars rows={groupReportTransactions(transactions, 'expense', displayBy)} total={expense.total} direction="expense" onOpen={open} /></div>
    </> : <>
      {chart === 'pie' && <div className="finance-card" style={{ padding: 24, display: 'grid', placeItems: 'center', marginBottom: 16 }}><button onClick={() => open(`Total ${direction}`, direction === 'income' ? allIncome : allExpense)} style={{ width: 250, height: 250, borderRadius: '50%', border: 0, cursor: 'pointer', background: gradient, display: 'grid', placeItems: 'center' }}><span style={{ width: 160, height: 160, borderRadius: '50%', background: '#171613', display: 'grid', placeItems: 'center', color: 'var(--white)', fontSize: 20, fontWeight: 700 }}>{fmtMoney(stats.total)}</span></button></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12, marginBottom: 18 }}>
        <Stat label={`Total ${direction}`} value={fmtMoney(stats.total)} onClick={() => open(`Total ${direction}`, direction === 'income' ? allIncome : allExpense)} />
        <Stat label="Transactions" value={stats.count.toLocaleString()} onClick={() => open(`${direction} transactions`, direction === 'income' ? allIncome : allExpense)} />
        <Stat label="Largest" value={fmtMoney(stats.largest)} onClick={() => open('Largest transaction', (direction === 'income' ? allIncome : allExpense).filter(row => Math.abs(row.amount) === stats.largest))} />
        <Stat label="Average" value={fmtMoney(stats.average)} onClick={() => open(`Transactions behind the average`, direction === 'income' ? allIncome : allExpense)} />
      </div>
      <Bars rows={rows} total={stats.total} direction={direction} onOpen={open} />
    </>}
  </div>
}

export function RecurringFinance({ scheduled = [], actuals = [], range }) {
  const [tab, setTab] = useState('upcoming')
  const today = new Date().toISOString().slice(0, 10)
  const rows = scheduled.filter(row => tab === 'all' || !row.end || row.end >= today)
  const income = rows.filter(row => row.type === 'income').reduce((sum,row) => sum + Number(row.amount || 0), 0)
  const expense = rows.filter(row => row.type === 'expense').reduce((sum,row) => sum + Number(row.amount || 0), 0)
  return <div>
    <div style={{ display: 'flex', gap: 8, padding: 5, background: 'rgba(255,255,255,.035)', borderRadius: 13, marginBottom: 18 }}>{[['upcoming','Upcoming'],['all','All Recurring']].map(([id,label]) => <button key={id} onClick={() => setTab(id)} style={button(tab === id)}>{label}</button>)}</div>
    <div className="finance-card" style={{ padding: 20, marginBottom: 16 }}><h2 style={{ margin: '0 0 5px' }}>Recurring cash plan</h2><p style={{ margin: 0, color: 'var(--muted)', fontSize: 12 }}>{timeframeLabel(range)} · {actuals.length} posted transactions available for matching</p></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginBottom: 18 }}><Stat label="Recurring income" value={fmtMoney(income)} /><Stat label="Recurring expenses" value={fmtMoney(expense)} /><Stat label="Expected net" value={fmtMoney(income-expense)} /></div>
    <div className="finance-card" style={{ padding: 20 }}>{rows.map(row => <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 110px', gap: 12, padding: '12px 2px', borderTop: '1px solid rgba(255,255,255,.06)' }}><div><strong>{row.name}</strong><div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>{row.cat || 'Uncategorized'} · {row.freq}</div></div><span style={{ color: 'var(--muted)', fontSize: 12 }}>{row.start}</span><strong style={{ textAlign: 'right', color: row.type === 'income' ? 'var(--income-color)' : 'var(--expense-color)' }}>{row.type === 'income' ? '+' : '-'}{fmtMoney(row.amount)}</strong></div>)}</div>
  </div>
}
