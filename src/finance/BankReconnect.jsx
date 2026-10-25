import { useEffect, useRef, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import './BankReconnect.css'

function SecureLink({ token, onSuccess, onExit }) {
  const { open, ready, error } = usePlaidLink({token,onSuccess,onExit})
  const opened = useRef(false)
  useEffect(() => { if (ready && !opened.current) { opened.current = true; open() } }, [ready,open])
  useEffect(() => { if (error) onExit(error) }, [error,onExit])
  return <p role="status">Opening secure sign-in…</p>
}

export default function BankReconnect({ items, connections, checkedLabel, canReconnect, request, onReconnected, onViewAccounts }) {
  const [selected,setSelected] = useState(null)
  const [token,setToken] = useState(null)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const dialog = useRef(null)
  const opener = useRef(null)
  const count = item => connections.find(conn=>conn.itemId===item.item_id)?.accounts?.length
  useEffect(() => {
    if (selected && !token) dialog.current?.showModal()
    else { dialog.current?.close(); opener.current?.focus() }
  },[selected,token])
  const close = () => { if (!busy && !token) { setSelected(null); setError('') } }
  const start = async () => {
    setBusy(true); setError('')
    try {
      const data = await request('/plaid-create-link-token',{method:'POST',body:JSON.stringify({itemId:selected.item_id})})
      if (!data.link_token) throw new Error('Secure sign-in could not be opened. Please try again.')
      setToken(data.link_token)
    } catch (cause) { setError(cause.message) }
    finally { setBusy(false) }
  }
  return <>
    <section className="bank-recovery-card" aria-label="Bank connection needs attention">
      <span className="bank-recovery-label">Sign-in required</span>
      <h3>{items.length===1 ? `${items[0].institution} needs your attention` : 'Your banks need your attention'}</h3>
      <p>Reconnect securely to resume updates. Your saved accounts and history remain available.</p>
      {items.map(item=><div className="bank-recovery-institution" key={item.item_id}>
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c5a46d" strokeWidth="1.5"><path d="m3 8 9-5 9 5H3Zm2 3v8m5-8v8m4-8v8m5-8v8M3 21h18"/></svg>
        <div><strong>{item.institution}</strong><small>{count(item) != null ? `${count(item)} existing accounts` : 'Existing connection'}</small></div>
        <button type="button" disabled={!canReconnect} onClick={event=>{opener.current=event.currentTarget;setSelected(item)}}>Reconnect securely</button>
      </div>)}
      {!canReconnect && <p>A household administrator must reconnect this bank.</p>}
      <div className="bank-recovery-footer"><span>Balances last verified {checkedLabel}</span><button type="button" onClick={onViewAccounts}>View saved accounts</button></div>
    </section>
    <dialog ref={dialog} className="bank-reconnect-dialog" aria-labelledby="bank-reconnect-title" onCancel={event=>{event.preventDefault();close()}}>
      <button type="button" className="bank-reconnect-close" aria-label="Close reconnection" disabled={busy || !!token} onClick={close}>×</button>
      <span className="bank-reconnect-lock" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></span>
      <h2 id="bank-reconnect-title">Reconnect {selected?.institution}</h2>
      <p>Continue to Plaid’s secure sign-in to restore this existing connection.</p>
      <ul><li>Keep your {selected && count(selected) != null ? `${count(selected)} existing accounts` : 'existing accounts'}</li><li>Preserve account mappings and history</li><li>Return here after secure sign-in</li></ul>
      {error && <p role="alert">{error}</p>}
      {token ? <SecureLink token={token} onSuccess={()=>{setToken(null);setSelected(null);onReconnected()}} onExit={cause=>{setToken(null);setError(cause ? 'Secure sign-in did not finish. Your saved accounts remain unchanged. Try again when ready.' : 'Sign-in was canceled. Your saved accounts remain unchanged.')}}/> : <button type="button" className="bank-reconnect-continue" disabled={busy} onClick={start}>{busy ? 'Preparing secure sign-in…' : 'Continue securely'}</button>}
      <button type="button" disabled={busy || !!token} onClick={close}>Cancel</button>
      <small>Bank sign-in opens in Plaid.</small>
    </dialog>
  </>
}
