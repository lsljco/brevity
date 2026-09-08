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

function cacheCompleteConnectionSnapshot(storage, connections, syncedAt) {
  // The roster is written before its check time on purpose. If the second
  // write fails, the device can have a newer roster with an older (therefore
  // conservative) time, but it can never present a new time beside an old
  // roster as though that older roster had just been verified.
  if (!syncedAt || !Number.isFinite(Date.parse(syncedAt))) {
    throw new Error('The bank response did not include a valid balance-check time.')
  }
  storage.setItem('plaid_connections', JSON.stringify(connections))
  storage.setItem('plaid_synced_at', syncedAt)
}

async function reportUnverifiedBalanceAttempt(onAccountsSync, { status, message, checkedAt = '' }) {
  if (typeof onAccountsSync !== 'function') return null
  try {
    return await onAccountsSync([], checkedAt, null, [{
      institution:'Plaid',
      code:`BALANCE_${String(status || 'stale').toUpperCase()}`,
      balanceDataStatus:status || 'stale',
      message,
    }])
  } catch {
    // Balance-attempt reporting must never suppress the independent
    // transaction refresh requested by the same Sync now action.
    return null
  }
}

// ── Main PlaidConnect component ──
export default function PlaidConnect({ onAccountsSync, onTransactionsSync, onReviewAccountLinks }) {
  // Restore connected state from localStorage immediately — no flicker
  const [connections, setConnections]   = useState(() => {
    try {
      const saved = localStorage.getItem('plaid_connections')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [syncedAt, setSyncedAt]         = useState(() => {
    try { return localStorage.getItem('plaid_synced_at') || null } catch { return null }
  })
  const [syncing, setSyncing]           = useState(false)
  // Startup refresh owns automatic synchronization. Remounts render cached state.
  const [initialChecking]               = useState(false)
  const [error, setError]               = useState(null)
  const [syncNotice, setSyncNotice]     = useState('')
  const [requiresUpdate, setRequiresUpdate] = useState([]) // items needing re-auth
  const [expanded, setExpanded]         = useState(false)
  const [linkReviewCount, setLinkReviewCount] = useState(0)

  // Existing connections remain readable and can be explicitly synchronized.
  // Institution credential mutations remain disabled; reviewed local account
  // mapping does not touch Plaid credentials or the connected institution.
  const syncAccounts = useCallback(async ({ refreshTransactions = false } = {}) => {
    setSyncing(true)
    setError(null)
    setSyncNotice('')
    setLinkReviewCount(0)
    let balanceState = 'failed'
    let balanceDetail = ''
    let transactionState = refreshTransactions && typeof onTransactionsSync === 'function' ? 'pending' : 'skipped'
    let transactionDetail = ''
    try {
      try {
        const data = await apiFetch('/plaid-accounts?live=1')
        if (data.connected) {
          const plaidAccounts = Array.isArray(data.accounts) ? data.accounts : []
          // Derive connections list from accounts
          const byInstitution = {}
          plaidAccounts.forEach(a => {
            if (!byInstitution[a.itemId]) {
              byInstitution[a.itemId] = { itemId: a.itemId, institution: a.institution, accounts: [] }
            }
            byInstitution[a.itemId].accounts.push(a)
          })
          const conns = Object.values(byInstitution)
          const endpointErrors = Array.isArray(data.errors) ? data.errors : []
          const balanceAttemptErrors = plaidAccounts.length ? endpointErrors : [
            ...endpointErrors,
            {
              institution:'Plaid',
              code:'BALANCE_EMPTY_LIVE_RESPONSE',
              balanceDataStatus:'partial',
              message:'The live balance check returned no bank accounts.',
            },
          ]
          let balanceResult = null
          let balanceFailure = null
          setRequiresUpdate(data.requiresUpdate || [])

          try {
            balanceResult = typeof onAccountsSync === 'function'
              ? await onAccountsSync(plaidAccounts, data.syncedAt, data.accountSourceReceipt, balanceAttemptErrors)
              : { error:'This screen cannot save bank balances.' }
            if (balanceResult?.ok !== true) {
              balanceFailure = balanceResult?.error || 'The versioned household balance store did not acknowledge this refresh.'
            }
          } catch (cause) {
            balanceFailure = cause?.message || 'The versioned household balance store did not acknowledge this refresh.'
          }

          const balancePartial = endpointErrors.length > 0 || !plaidAccounts.length || balanceResult?.partial === true
          const missingLinkedCount = balanceResult?.missingLinkedCount || 0
          const unmatchedCount = balanceResult?.unmatchedCount || 0
          setLinkReviewCount(balanceResult?.linkReviewAvailable ? unmatchedCount : 0)
          const balanceGapDetails = [
            ...(missingLinkedCount ? [`${missingLinkedCount} previously linked Brevity account${missingLinkedCount === 1 ? ' was' : 's were'} missing from the live bank response`] : []),
            ...(balanceResult?.linkReviewAvailable && unmatchedCount ? [`${unmatchedCount} returned bank account${unmatchedCount === 1 ? ' is' : 's are'} available for reviewed linkage`] : []),
            ...(endpointErrors.length ? [`${endpointErrors.length} bank institution${endpointErrors.length === 1 ? ' did' : 's did'} not confirm`] : []),
            ...(!plaidAccounts.length ? ['no bank accounts were returned'] : []),
          ]

          if (balanceFailure) {
            balanceState = 'failed'
            balanceDetail = plaidAccounts.length
              ? `Bank balances were received but could not be saved safely. ${balanceFailure}`
              : `The live balance check returned no bank accounts and could not establish a safe balance anchor. ${balanceFailure}`
          } else if (balancePartial) {
            balanceState = 'partial'
            balanceDetail = `Balance refresh is partial${balanceGapDetails.length ? `: ${balanceGapDetails.join('; ')}` : ''}. Prior connection details and the last complete balance-check time are unchanged.`
          } else {
            // Only advance the global check time and connection snapshot after
            // every connected source and previously linked local account has
            // been acknowledged.
            try {
              cacheCompleteConnectionSnapshot(localStorage, conns, data.syncedAt)
              setSyncedAt(data.syncedAt)
              setConnections(conns)
              balanceState = 'complete'
            } catch (cause) {
              balanceState = 'cache-failed'
              balanceDetail = `Bank balances were saved, but connection status could not be cached on this device. The cached balance-check time was not advanced; refresh before relying on local connection status. ${cause?.message || ''}`.trim()
            }
          }
        } else {
          // Only clear cached connections if the server explicitly confirmed
          // "not connected". Transient account errors leave the cache intact.
          balanceState = 'disconnected'
          balanceDetail = 'No existing server bank connection was found. Stored balances remain available, but they were not refreshed.'
          await reportUnverifiedBalanceAttempt(onAccountsSync, {
            status:'disconnected',
            checkedAt:data.syncedAt || '',
            message:balanceDetail,
          })
          setConnections([])
          setSyncedAt(null)
          setRequiresUpdate([])
          setLinkReviewCount(0)
          try {
            localStorage.removeItem('plaid_connections')
            localStorage.removeItem('plaid_synced_at')
          } catch (cause) {
            balanceDetail += ` This device could not clear its old connection cache: ${cause?.message || 'browser storage is unavailable.'}`
          }
        }
      } catch (cause) {
        // Keep the cached connection display on transient account failures.
        balanceState = 'failed'
        balanceDetail = `Could not complete the bank balance check. ${cause?.message || 'The bank sync service was unavailable.'}`
        await reportUnverifiedBalanceAttempt(onAccountsSync, {
          status:'stale',
          message:balanceDetail,
        })
      }

      // Transactions are an independent requested source refresh. Attempt it
      // even when account retrieval, balance linkage, persistence, or local
      // connection caching failed; one outcome must not suppress the other.
      if (transactionState === 'pending') {
        let transactionResult = null
        try {
          transactionResult = await onTransactionsSync()
        } catch (cause) {
          transactionResult = { error:cause?.message || 'The transaction refresh failed.' }
        }

        const transactionErrors = [
          ...(Array.isArray(transactionResult?.errors) ? transactionResult.errors : []),
          ...(Array.isArray(transactionResult?.refresh?.errors) ? transactionResult.refresh.errors : []),
        ]
        if (transactionResult?.error) {
          transactionState = 'failed'
          transactionDetail = `Transaction refresh did not complete. ${transactionResult.error}`
        } else if (transactionErrors.length) {
          transactionState = 'partial'
          transactionDetail = `Transaction refresh is partial. ${transactionErrors.length} bank source${transactionErrors.length === 1 ? ' did' : 's did'} not confirm; unconfirmed sources retain their last verified rows.`
        } else if (transactionResult?.refresh?.stillProcessing) {
          transactionState = 'processing'
          transactionDetail = 'Plaid accepted the transaction update and is still processing it; the current list is the latest available snapshot.'
        } else {
          transactionState = 'complete'
        }
      }

      const balanceHasIssue = balanceState !== 'complete'
      // An accepted asynchronous refresh is progress, not a failure. Keep it
      // in the ordinary sync notice; reserve the orange alert for a confirmed
      // failure or partial institution result.
      const transactionHasIssue = ['failed','partial'].includes(transactionState)
      setError([balanceHasIssue ? balanceDetail : '', transactionHasIssue ? transactionDetail : ''].filter(Boolean).join(' ') || null)

      const balanceSummary = balanceState === 'complete'
        ? 'Balances and the complete connection roster were checked.'
        : balanceState === 'partial'
          ? 'The balance check remains partial; its last complete time was preserved.'
          : balanceState === 'cache-failed'
            ? 'Balances were saved, but this device could not cache the connection check.'
            : balanceState === 'disconnected'
              ? 'No existing server bank connection was found.'
              : 'Balances were not changed.'
      const transactionSummary = transactionState === 'complete'
        ? 'The latest available transactions were checked.'
        : transactionState === 'partial'
          ? 'The transaction snapshot remains partial.'
          : transactionState === 'processing'
            ? 'The transaction update is still processing.'
            : transactionState === 'failed'
              ? 'Transactions were not refreshed; the last verified history remains available.'
              : ''
      setSyncNotice([balanceSummary, transactionSummary].filter(Boolean).join(' '))

      if (balanceState === 'complete' && ['complete','skipped'].includes(transactionState)) {
        window.dispatchEvent(new CustomEvent('brevity-finance-sync-recovered'))
      }
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
            <button
              onClick={() => setExpanded(x => !x)}
              style={{ marginLeft: 'auto', fontSize: 10, color: '#888884', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em', textTransform: 'uppercase' }}
            >
              {expanded ? 'Hide' : 'Details'}
            </button>
          </>
        ) : (
          <div className="plaid-connect-disconnected" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap:'wrap' }}>
            <span style={{ fontSize: 10, color: '#888884', letterSpacing: '0.08em', textTransform: 'uppercase' }}>No cached bank connection on this device</span>
            <button
              type="button"
              onClick={() => syncAccounts({ refreshTransactions:true })}
              disabled={syncing}
              title="Checks for an existing server-managed bank connection without adding or changing one."
              style={{display:'flex',alignItems:'center',gap:7,padding:'8px 18px',borderRadius:10,cursor:syncing?'wait':'pointer',background:'rgba(197,164,109,0.09)',border:'1px solid rgba(197,164,109,0.28)',color:'#C5A46D',fontSize:11,fontWeight:600,fontFamily:'inherit',letterSpacing:'0.08em',textTransform:'uppercase'}}
            >
              <i className="ti ti-refresh" style={{fontSize:14,animation:syncing?'spin 0.8s linear infinite':'none'}} aria-hidden="true"/>
              {syncing ? 'Checking…' : 'Check existing connection'}
            </button>
            <button type="button" disabled title="Adding or changing bank connections is disabled in this release." style={{display:'flex',alignItems:'center',gap:7,padding:'8px 18px',borderRadius:10,cursor:'not-allowed',background:'rgba(197,164,109,0.05)',border:'1px solid rgba(197,164,109,0.16)',color:'#888884',fontSize:11,fontWeight:600,fontFamily:'inherit',letterSpacing:'0.08em',textTransform:'uppercase'}}><i className="ti ti-lock" style={{fontSize:14}} aria-hidden="true"/>Bank changes unavailable</button>
          </div>
        )}
      </div>

      {syncNotice && <p role="status" style={{margin:'8px 0 0',fontSize:10,color:'#888884',lineHeight:1.45}}>{syncNotice}</p>}

      <p className="plaid-connection-safety-note" role="note" style={{margin:'8px 0 0',fontSize:10,color:'#888884',lineHeight:1.45}}>Existing connected sources can still sync. Adding, reauthorizing, or disconnecting an institution is disabled in this release. Mapping a returned account to an existing Brevity account uses reviewed Action Mode and does not change bank credentials.</p>

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
        <div role="alert" style={{ marginTop: 8, fontSize: 11, color: '#C4785A', background: 'rgba(196,120,90,0.1)', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(196,120,90,0.2)' }}>
          <p style={{margin:0,lineHeight:1.5}}>{error}</p>
          {linkReviewCount > 0 && typeof onReviewAccountLinks === 'function' && <button type="button" onClick={onReviewAccountLinks} style={{marginTop:9,padding:'7px 11px',borderRadius:8,border:'1px solid rgba(197,164,109,.35)',background:'rgba(197,164,109,.12)',color:'#C5A46D',fontFamily:'inherit',fontSize:11,fontWeight:600,cursor:'pointer'}}>Review account links</button>}
        </div>
      )}
    </div>
  )
}
