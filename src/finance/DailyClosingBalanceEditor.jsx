import { useState } from 'react'
import { getAcknowledgedSharedStateVersion } from '../household/sharedState.js'
import { fmtMoney } from './projection.js'

export default function DailyClosingBalanceEditor({ date, accounts, records = {}, onReview }) {
  const [editing, setEditing] = useState(false)
  const [accountId, setAccountId] = useState(accounts[0]?.id || '')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [version, setVersion] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const saved = records[accountId]?.[date]
  function open() {
    try {
      setVersion(getAcknowledgedSharedStateVersion(localStorage, 'lslj_finance_v9'))
      setAmount(saved ? String(saved.amount) : '')
      setNotes(saved?.notes || '')
      setError(''); setEditing(true)
    } catch { setError('Sync household data before editing this ending balance.') }
  }
  async function review(remove = false) {
    if (!remove && (!amount.trim() || !Number.isFinite(Number(amount)))) { setError('Enter a valid ending balance, including zero or a negative amount.'); return }
    setBusy(true); setError('')
    try {
      const account = accounts.find(row => row.id === accountId)
      if (!account) throw Error('Select a cash account.')
      const value = Math.round(Number(amount) * 100) / 100
      const summary = remove ? `Remove recorded ending balance for ${account.name} on ${date}` : `Record ${fmtMoney(value)} ending balance for ${account.name} on ${date}`
      const ready = await onReview({ summary, expectedVersion:version, operation:{type:remove ? 'finance.close.delete' : 'finance.close.set',targetId:accountId,targetDate:date,description:`${summary}. User-recorded close; live bank balances remain unchanged.`,payload:remove ? {} : {amount:value,notes}} })
      if (ready) setEditing(false)
    } catch (cause) { setError(cause.message) }
    finally { setBusy(false) }
  }
  if (!accounts.length) return null
  return <section aria-label="Daily ending balance" style={{marginTop:16,paddingTop:12,borderTop:'1px solid rgba(197,164,109,.25)'}}>
    <h3>Ending balance · {date}</h3>
    <p style={{fontSize:12}}>Record the closing balance for each selected cash account. This anchors the date’s history and subsequent estimates until a newer balance observation. Source bank balances remain separate.</p>
    {!editing ? <button type="button" onClick={open}>Edit ending balance</button> : <form style={{display:'grid',gap:10,minWidth:0}} onSubmit={event => {event.preventDefault();review()}}>
      <label style={{display:'grid',gap:4}}>Account<select aria-label="Account" value={accountId} disabled={busy} onChange={event => {const id=event.target.value;setAccountId(id);setAmount(records[id]?.[date] ? String(records[id][date].amount) : '');setNotes(records[id]?.[date]?.notes || '')}}>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label style={{display:'grid',gap:4}}>Ending balance<input type="number" step="0.01" value={amount} required disabled={busy} onChange={event=>setAmount(event.target.value)}/></label>
      <label style={{display:'grid',gap:4}}>Note or statement reference<input value={notes} maxLength={500} disabled={busy} onChange={event=>setNotes(event.target.value)}/></label>
      <button type="submit" disabled={busy}>{busy ? 'Preparing…' : 'Review balance correction'}</button>{' '}
      <button type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancel</button>{' '}
      {saved && <button type="button" disabled={busy} onClick={()=>review(true)}>Remove recorded balance</button>}
    </form>}
    {accounts.map(account=>records[account.id]?.[date] && <p key={account.id} style={{fontSize:12}}>{account.name}: {fmtMoney(records[account.id][date].amount)} · User-recorded</p>)}
    {error && <p role="alert">{error}</p>}
  </section>
}
