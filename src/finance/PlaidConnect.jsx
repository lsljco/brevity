import { useState, useCallback } from 'react'
import { HOUSEHOLD_TIME_ZONE } from './financeTime.js'

const API = '/.netlify/functions'
const REQUEST_TIMEOUT_MS = 45000

async function apiFetch(path, options = {}) {
  const controller = options.signal ? null : new AbortController()
  const timeout = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null
  try {
    const res = await fetch(`${API}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
      signal: options.signal || controller?.signal,
    })
    if (!res.ok) {
      let detail = ''
      try { const body = await res.json(); detail = body.detail || body.error || '' } catch {}
      throw new Error(`API ${path} failed: ${res.status}${detail ? ' — ' + detail : ''}`)
    }
    return res.json()
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Bank sync timed out. Cached balances remain available; try Sync now again.')
    throw error
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

// ── Main PlaidConnect component ──
export default function PlaidConnect({ onAccountsSync, onTransactionsSync }) {
  // Restore connected state from localStorage immediately — no flicker
  const [connections, setConnections]   = useState(() => {
    try {
      const saved = localStorage.getItem('plaid_connections')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [syncedAt, setSyncedAt]         = useState(() => localStorage.getItem('plaid_synced_at') || null)
  const [syncing, setSyncing]           = useState(false)
  // Startup refresh owns automatic synchronization. Remounts render cached state.
  const [initialChecking]               = useState(false)
  const [error, setError]               = useState(null)
  const [syncNotice, setSyncNotice]     = useState('')
  const [requiresUpdate, setRequiresUpdate] = useState([]) // items needing re-auth
  const [expanded, setExpanded]         = useState(false)

  // Existing connections remain readable and can be explicitly synchronized.
  // Connection, re-link, and disconnect mutations are disabled for this release.
  const syncAccounts = useCallback(async ({ refreshTransactions = false } = {}) => {
    setSyncing(true)
    setError(null)
    setSyncNotice('')
    try {
      const data = await apiFetch('/plaid-accounts?live=1')
      if (data.connected) {
        // Derive connections list from accounts
        const byInstitution = {}
        ;(data.accounts || []).forEach(a => {
          if (!byInstitution[a.itemId]) {
            byInstitution[a.itemId] = { itemId: a.itemId, institution: a.institution, accounts: [] }
          }
          byInstitution[a.itemId].accounts.push(a)
        })
        const conns = Object.values(byInstitution)
        if (data.accounts?.length) {
          const balanceResult = typeof onAccountsSync === 'function'
            ? await onAccountsSync(data.accounts, data.syncedAt, data.accountSourceReceipt)
            : null
          if (balanceResult?.ok !== true) {
            const persistenceError = new Error(balanceResult?.error || 'The versioned household balance store did not acknowledge this refresh.')
            persistenceError.code = 'BALANCE_PERSISTENCE_FAILED'
            throw persistenceError
          }
        }
        // Only mark the balance check successful after its versioned household
        // record has been durably acknowledged.
        try {
          localStorage.setItem('plaid_synced_at', data.syncedAt)
          localStorage.setItem('plaid_connections', JSON.stringify(conns))
        } catch (cause) {
          const cacheError = new Error(cause?.message || 'Browser storage is unavailable.')
          cacheError.code = 'CONNECTION_CACHE_FAILED'
          cacheError.cause = cause
          throw cacheError
        }
        setSyncedAt(data.syncedAt)
        setConnections(conns)
        setRequiresUpdate(data.requiresUpdate || [])
        if (refreshTransactions && onTransactionsSync) {
          const transactionResult = await onTransactionsSync()
          if (transactionResult?.error) setError(`Balances updated, but ${transactionResult.error}`)
          else if (transactionResult?.refresh?.errors?.length || transactionResult?.errors?.length) {
            setSyncNotice('Balances are current and Brevity safely checked every available transaction change. The bank update request was not fully confirmed, so the transaction view is marked partial; try Sync now again shortly.')
          } else setSyncNotice(transactionResult?.refresh?.stillProcessing
            ? 'Balances are current. Your bank accepted the transaction update and Plaid is still processing it; check again shortly.'
            : 'Balances and the latest available transactions were checked.')
        }
      } else {
        // Only clear cached connections if the server explicitly confirmed "not connected"
        // (i.e. Plaid token is gone). Don't clear on transient network errors.
        setConnections([])
        localStorage.removeItem('plaid_connections')
        localStorage.removeItem('plaid_synced_at')
      }
    } catch (err) {
      // Network / server error — keep whatever cached state we had, just show error
      setError(err.code === 'BALANCE_PERSISTENCE_FAILED'
        ? 'Bank balances were received but could not be saved safely. ' + err.message
        : err.code === 'CONNECTION_CACHE_FAILED'
          ? 'Bank balances were saved, but connection status could not be cached on this device. Refresh before relying on the status shown here.'
          : 'Could not reach bank sync. ' + err.message)
    } finally {
      setSyncing(false)
    }
  }, [onAccountsSync, onTransactionsSync])

  const isConnected = connections.length > 0

  return (
    <div className="plaid-connect" style={{ marginBottom: 20 }}>
      {/* ── Status bar ── */}
      <div className="plaid-connect-status" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {initialChecking ? (
          <span style={{ fontSize: 10, color: '#888884', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            <i className="ti ti-refresh" style={{ fontSize: 11, marginRight: 5, animation: 'spin 0.8s linear infinite' }} aria-hidden="true" />
            Checking bank connection…
          </span>
        ) : isConnected ? (
          <>
            <div className="plaid-connected-pill">
              <div className="dot" />
              {connections.length} institution{connections.length !== 1 ? 's' : ''} connected
            </div>
            <button
              onClick={() => syncAccounts({ refreshTransactions:true })}
              disabled={syncing}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                fontSize: 10, fontWeight: 600, fontFamily: 'inherit', color: '#888884',
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}
            >
              <i
                className="ti ti-refresh"
                style={{ fontSize: 12, animation: syncing ? 'spin 0.8s linear infinite' : 'none' }}
                aria-hidden="true"
              />
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            {syncedAt && (
              <span style={{ fontSize: 10, color: '#888884', letterSpacing: '0.04em' }}>
                Balances checked {new Date(syncedAt).toLocaleString('en-US', { timeZone:HOUSEHOLD_TIME_ZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
            {syncNotice&&<span role="status" style={{flexBasis:'100%',fontSize:10,color:'#888884',lineHeight:1.45}}>{syncNotice}</span>}
            <button
              onClick={() => setExpanded(x => !x)}
              style={{ marginLeft: 'auto', fontSize: 10, color: '#888884', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em', textTransform: 'uppercase' }}
            >
              {expanded ? 'Hide' : 'Details'}
            </button>
          </>
        ) : (
          <div className="plaid-connect-disconnected" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 10, color: '#888884', letterSpacing: '0.08em', textTransform: 'uppercase' }}>No bank connected — source-managed balances unavailable</span>
            <button type="button" disabled title="Adding or changing bank connections is disabled in this release." style={{display:'flex',alignItems:'center',gap:7,padding:'8px 18px',borderRadius:10,cursor:'not-allowed',background:'rgba(197,164,109,0.05)',border:'1px solid rgba(197,164,109,0.16)',color:'#888884',fontSize:11,fontWeight:600,fontFamily:'inherit',letterSpacing:'0.08em',textTransform:'uppercase'}}><i className="ti ti-lock" style={{fontSize:14}} aria-hidden="true"/>Bank connections unavailable</button>
          </div>
        )}
      </div>

      <p className="plaid-connection-safety-note" role="note" style={{margin:'8px 0 0',fontSize:10,color:'#888884',lineHeight:1.45}}>Existing connected sources can still sync. Adding, re-linking, or disconnecting a bank is disabled in this release to protect financial credentials and account identity.</p>

      {/* ── Add another institution (when connected) ── */}
      {isConnected && !expanded && (
        <div style={{ marginTop: 8 }}>
          <button type="button" disabled title="Adding bank connections is disabled in this release." style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:8,cursor:'not-allowed',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',fontSize:12,fontWeight:500,fontFamily:'inherit',color:'#888884'}}><i className="ti ti-lock" style={{fontSize:12}} aria-hidden="true"/>Add bank unavailable</button>
        </div>
      )}

      {/* ── Expanded connections list ── */}
      {expanded && (
        <div style={{
          marginTop: 12, padding: '16px 18px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#888884', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Connected Banks
          </p>
          {connections.map(conn => (
            <div key={conn.itemId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9, background: 'rgba(197,164,109,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <i className="ti ti-building-bank" style={{ fontSize: 15, color: '#C5A46D' }} aria-hidden="true" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#F7F6F2' }}>{conn.institution}</p>
                <p style={{ fontSize: 10, color: '#888884', letterSpacing: '0.04em' }}>
                  {conn.accounts.length} account{conn.accounts.length !== 1 ? 's' : ''}
                </p>
              </div>
              <span style={{fontSize:10,color:'#888884',letterSpacing:'0.06em',textTransform:'uppercase'}}>Source-managed</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 10 }}>
            <button type="button" disabled title="Adding bank connections is disabled in this release." style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:9,cursor:'not-allowed',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',fontSize:12,fontWeight:500,fontFamily:'inherit',color:'#888884'}}><i className="ti ti-lock" style={{fontSize:13}} aria-hidden="true"/>Add bank unavailable</button>
          </div>
        </div>
      )}

      {requiresUpdate.length > 0 && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(196,120,90,0.08)', border: '1px solid rgba(196,120,90,0.3)', borderRadius: 10 }}>
          <p style={{ margin: '0 0 5px', fontSize: 12, color: '#C4785A', fontWeight: 600 }}>Bank session expired for {requiresUpdate.map(item=>item.institution).join(', ')}</p>
          <p style={{margin:0,fontSize:11,color:'#888884',lineHeight:1.45}}>Re-authentication is unavailable in this release. Brevity will retain the latest verified cached data without changing bank credentials.</p>
        </div>
      )}
      {error && (
        <p style={{ marginTop: 8, fontSize: 11, color: '#C4785A', background: 'rgba(196,120,90,0.1)', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(196,120,90,0.2)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
