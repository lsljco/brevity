import { useMemo, useState } from 'react'
import { fmtMoney } from './projection.js'
import { groupReportTransactions, reportStats, transactionDirection } from './reportingData.js'
import { timeframeLabel } from './financeTimeframe.js'

const COLORS = ['#17A9CC','#35AD76','#FFC247','#FF6A2F','#8850CE','#D23B9A','#4867DD','#18A99A','#ED4C52','#86A63D']
const button = active => ({ flex: 1, padding: '10px 14px', border: 0, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
  color: active ? 'var(--white)' : 'var(--muted)', background: active ? 'rgba(255,255,255,.11)' : 'transparent' })

function Stat({ label, value, color, onClick }) {
  return <button onClick={onClick} style={{ textAlign: 'left', padding: '18px 20px', borderRadius: 14, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}>
    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--muted)' }}>{label}</div>
    <div style={{ fontSize: 22, marginTop: 7, color: color || 'var(--white)' }}>{value}</div>
    <div style={{ fontSize: 10, color: 'var(--gold)', marginTop: 6 }}>View transactions →</div>
  </button>
}

function Bars({ rows, total, direction, onOpen }) {
  return <div className="finance-card" style={{ padding: 20 }}>
    {rows.length ? rows.map(row => <button key={row.name} onClick={() => onOpen(row.name, direction)} style={{ display: 'block', width: '100%', border: 0, background: 'transparent', color: 'inherit', padding: '6px 0', cursor: 'pointer', fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, marginBottom: 5 }}><span>{row.name}</span><span>{fmtMoney(row.amount)} · {total ? ((row.amount / total) * 100).toFixed(1) : 0}%</span></div>
      <div style={{ height: 34, borderRadius: 9, background: 'rgba(255,255,255,.045)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${total ? Math.max(2, row.amount / total * 100) : 0}%`, background: direction === 'income' ? 'rgba(53,173,118,.34)' : 'rgba(237,76,82,.34)', borderRadius: 9 }} /></div>
    </button>) : <p style={{ color: 'var(--muted)' }}>No matching transactions in this timeframe.</p>}
  </div>
}

function Donut({ rows, total, direction, onOpen, title }) {
  let cursor = 0
  const segments = rows.slice(0, 12)
  const gradient = segments.length ? `conic-gradient(${segments.map((row, index) => {
    const start = cursor
    cursor += total ? row.amount / total * 100 : 0
    return `${COLORS[index % COLORS.length]} ${start}% ${cursor}%`
  }).join(',')})` : 'rgba(255,255,255,.08)'
  return <div className="finance-card" style={{ padding: 22, display: 'grid', placeItems: 'center' }}>
    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>{title}</div>
    <button aria-label={`View ${title} transactions`} onClick={() => onOpen(null, direction)} style={{ width: 230, height: 230, borderRadius: '50%', border: 0, cursor: 'pointer', background: gradient, display: 'grid', placeItems: 'center' }}>
      <span style={{ width: 145, height: 145, borderRadius: '50%', background: '#171613', display: 'grid', placeItems: 'center', color: 'var(--white)', fontSize: 19, fontWeight: 700 }}>{fmtMoney(total)}</span>
    </button>
    <div style={{ width: '100%', marginTop: 16 }}>{segments.slice(0, 6).map((row, index) => <button key={row.name} onClick={() => onOpen(row.name, direction)} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 12, border: 0, background: 'transparent', color: 'var(--soft-white)', padding: '5px 0', cursor: 'pointer' }}><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: COLORS[index % COLORS.length], marginRight: 7 }} />{row.name}</span><span>{fmtMoney(row.amount)}</span></button>)}</div>
  </div>
}

export default function MonarchReports({ transactions = [], range, onOpenTransactions }) {
  const [tab, setTab] = useState('cashflow')
  const [displayBy, setDisplayBy] = useState('category')
  const [chart, setChart] = useState('bar')
  const income = useMemo(() => reportStats(transactions, 'income'), [transactions])
  const expense = useMemo(() => reportStats(transactions, 'expense'), [transactions])
  const direction = tab === 'income' ? 'income' : 'expense'
  const stats = direction === 'income' ? income : expense
  const rows = useMemo(() => groupReportTransactions(transactions, direction, displayBy), [transactions, direction, displayBy])
  const incomeRows = useMemo(() => groupReportTransactions(transactions, 'income', displayBy), [transactions, displayBy])
  const expenseRows = useMemo(() => groupReportTransactions(transactions, 'expense', displayBy), [transactions, displayBy])
  const open = (value, selectedDirection, ids) => onOpenTransactions?.({
    direction: selectedDirection || null, displayBy: value ? displayBy : null, value: value || null, ids: ids || null,
    label: value || (selectedDirection === 'income' ? 'Income' : selectedDirection === 'expense' ? 'Expenses' : 'Cash Flow'),
  })

  return <div className="monarch-reports">
    <div style={{ display: 'flex', gap: 8, padding: 5, borderRadius: 13, background: 'rgba(255,255,255,.035)', marginBottom: 16 }}>
      {[['cashflow','Cash Flow'],['spending','Spending'],['income','Income']].map(([id,label]) => <button key={id} style={button(tab === id)} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    <div className="report-controls" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginBottom: 18 }}>
      <label style={{ fontSize: 10, color: 'var(--muted)' }}>Chart<select aria-label="Report chart" value={chart} onChange={e => setChart(e.target.value)} style={{ width: '100%', display: 'block', marginTop: 5, padding: 10, borderRadius: 10, background: '#171613', color: 'var(--white)', border: '1px solid rgba(255,255,255,.12)' }}><option value="bar">Bar</option><option value="pie">Pie</option></select></label>
      <label style={{ fontSize: 10, color: 'var(--muted)' }}>Display by<select aria-label="Report grouping" value={displayBy} onChange={e => setDisplayBy(e.target.value)} style={{ width: '100%', display: 'block', marginTop: 5, padding: 10, borderRadius: 10, background: '#171613', color: 'var(--white)', border: '1px solid rgba(255,255,255,.12)' }}><option value="category">Category</option><option value="group">Group</option><option value="merchant">Merchant</option></select></label>
    </div>
    <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 16px' }}>{timeframeLabel(range)}</p>
    {tab === 'cashflow' ? <>
      <div className="report-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginBottom: 18 }}>
        <Stat label="Total income" value={fmtMoney(income.total)} color="var(--income-color)" onClick={() => open(null, 'income')} />
        <Stat label="Total expenses" value={fmtMoney(expense.total)} color="var(--expense-color)" onClick={() => open(null, 'expense')} />
        <Stat label="Savings" value={fmtMoney(income.total - expense.total)} color="var(--gold)" onClick={() => open(null, null)} />
      </div>
      <div className="report-chart-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
        {chart === 'pie' ? <><Donut title="Income" rows={incomeRows} total={income.total} direction="income" onOpen={open} /><Donut title="Expenses" rows={expenseRows} total={expense.total} direction="expense" onOpen={open} /></> : <><Bars rows={incomeRows} total={income.total} direction="income" onOpen={open} /><Bars rows={expenseRows} total={expense.total} direction="expense" onOpen={open} /></>}
      </div>
    </> : <>
      {chart === 'pie' ? <Donut title={direction === 'income' ? 'Income' : 'Spending'} rows={rows} total={stats.total} direction={direction} onOpen={open} /> : null}
      <div className="report-stat-grid report-stat-grid--four" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12, margin: '18px 0' }}>
        <Stat label={`Total ${direction}`} value={fmtMoney(stats.total)} onClick={() => open(null, direction)} />
        <Stat label="Transactions" value={stats.count.toLocaleString()} onClick={() => open(null, direction)} />
        <Stat label="Largest" value={fmtMoney(stats.largest)} onClick={() => open(null, direction, transactions.filter(row => transactionDirection(row) === direction && Math.abs(Number(row.amount)) === stats.largest).map(row => row.id))} />
        <Stat label="Average" value={fmtMoney(stats.average)} onClick={() => open(null, direction)} />
      </div>
      {chart === 'bar' ? <Bars rows={rows} total={stats.total} direction={direction} onOpen={open} /> : null}
    </>}
  </div>
}

export function RecurringFinance({ scheduled = [], actuals = [], range }) {
  const [tab, setTab] = useState('upcoming')
  const today = new Date().toISOString().slice(0, 10)
  const rows = scheduled.filter(row => tab === 'all' || !row.end || row.end >= today)
  const income = rows.filter(row => row.type === 'income').reduce((sum,row) => sum + Number(row.amount || 0), 0)
  const expense = rows.filter(row => row.type === 'expense').reduce((sum,row) => sum + Number(row.amount || 0), 0)
  return <div className="recurring-finance">
    <div style={{ display: 'flex', gap: 8, padding: 5, background: 'rgba(255,255,255,.035)', borderRadius: 13, marginBottom: 18 }}>{[['upcoming','Upcoming'],['all','All Recurring']].map(([id,label]) => <button key={id} onClick={() => setTab(id)} style={button(tab === id)}>{label}</button>)}</div>
    <div className="finance-card" style={{ padding: 20, marginBottom: 16 }}><h2 style={{ margin: '0 0 5px' }}>Recurring cash plan</h2><p style={{ margin: 0, color: 'var(--muted)', fontSize: 12 }}>{timeframeLabel(range)} · {actuals.length} posted transactions available for matching</p></div>
    <div className="report-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginBottom: 18 }}><Stat label="Recurring income" value={fmtMoney(income)} /><Stat label="Recurring expenses" value={fmtMoney(expense)} /><Stat label="Expected net" value={fmtMoney(income-expense)} /></div>
    <div className="finance-card" style={{ padding: 20 }}>{rows.map(row => <div className="recurring-row" key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 110px', gap: 12, padding: '12px 2px', borderTop: '1px solid rgba(255,255,255,.06)' }}><div><strong>{row.name}</strong><div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>{row.cat || 'Uncategorized'} · {row.freq}</div></div><span style={{ color: 'var(--muted)', fontSize: 12 }}>{row.start}</span><strong style={{ textAlign: 'right', color: row.type === 'income' ? 'var(--income-color)' : 'var(--expense-color)' }}>{row.type === 'income' ? '+' : '-'}{fmtMoney(row.amount)}</strong></div>)}</div>
  </div>
}
