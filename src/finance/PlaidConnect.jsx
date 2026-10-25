import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
const BankReconnect = lazy(() => import('./BankReconnect.jsx'))
import { FINANCE_REFRESH_EVENT } from './financeRefresh.js'
import { HOUSEHOLD_TIME_ZONE } from './financeTime.js'
import { APP_REFRESH_EVENT, APP_REFRESH_STARTED_EVENT } from '../household/appRefresh.js'

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
      const body = await res.json().catch(() => ({}))
      const failure = new Error(body.detail || body.error || 'The bank service is temporarily unavailable.')
      failure.requiresUpdate = body.requiresUpdate || []
      throw failure
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
  const [lastSyncedAt, setLastSyncedAt] = useState(() => { try { return localStorage.getItem('plaid_last_synced_at') || '' } catch { return '' } })
  const [sourceUpdatedAt, setSourceUpdatedAt] = useState(() => { try { return localStorage.getItem('plaid_source_updated_at') || '' } catch { return '' } })
  const formatTime = value => new Date(value).toLocaleString('en-US', {timeZone:HOUSEHOLD_TIME_ZONE,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
  const [syncing, setSyncing]           = useState(false)
  const [appSyncing, setAppSyncing] = useState(false)
  const syncBusy = syncing || appSyncing
  // Startup refresh owns automatic synchronization. Remounts render cached state.
  const [error, setError]               = useState(null)
  const [syncNotice, setSyncNotice]     = useState('')
  const [requiresUpdate, setRequiresUpdate] = useState([])
  const [canReconnect,setCanReconnect] = useState(false)
  const checkConnectionStatus = useCallback(async () => {
    try {
      const data = await apiFetch('/plaid-create-link-token')
      setCanReconnect(data.canReconnect === true)
      setRequiresUpdate(current => {
        const unknown = current.filter(item => !data.connections?.some(conn => conn.item_id===item.item_id && conn.verified))
        const needed = (data.connections || []).filter(item => item.code==='ITEM_LOGIN_REQUIRED')
        return Array.from(new Map([...unknown,...needed].map(item=>[item.item_id,item])).values())
      })
    } catch { /* A failed status lookup never clears a known recovery requirement. */ }
  },[])
  useEffect(() => { checkConnectionStatus() },[checkConnectionStatus])
  const [statusTime, setStatusTime] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setStatusTime(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])
  const needsRefresh = !syncedAt || !Number.isFinite(Date.parse(syncedAt)) || statusTime - Date.parse(syncedAt) >= 24 * 60 * 60 * 1000
  const [expanded, setExpanded]         = useState(false)
  const [linkReviewCount, setLinkReviewCount] = useState(0)

  // Keep the Accounts control synchronized with the application-wide refresh.
  // Previously the top message could say Plaid was refreshing while this
  // button remained idle because it only knew about clicks made in this panel.
  useEffect(() => {
    const handleStarted = event => {
      if (!event.detail?.bankUpdateRequested) return
      setAppSyncing(true)
      setError(null)
      setSyncNotice('')
    }
    const handleCompleted = event => {
      // Every app refresh completion settles its spinner, even failed attempts
      // with incomplete bank metadata. A separate manual sync retains its state.
      setAppSyncing(false)
      const issue=event.detail?.issues?.find(item=>item.source==='Finance & Plaid')
      if(issue)setError(issue.message)
      checkConnectionStatus()
      try {
        const savedConnections = JSON.parse(localStorage.getItem('plaid_connections') || '[]')
        const savedAt = localStorage.getItem('plaid_synced_at') || null
        if (Array.isArray(savedConnections)) setConnections(savedConnections)
        setSyncedAt(savedAt)
        setLastSyncedAt(localStorage.getItem('plaid_last_synced_at') || '')
        setSourceUpdatedAt(localStorage.getItem('plaid_source_updated_at') || '')
      } catch {}
    }
    window.addEventListener(APP_REFRESH_STARTED_EVENT, handleStarted)
    window.addEventListener(APP_REFRESH_EVENT, handleCompleted)
    window.addEventListener(FINANCE_REFRESH_EVENT, handleCompleted)
    return () => {
      window.removeEventListener(APP_REFRESH_STARTED_EVENT, handleStarted)
      window.removeEventListener(APP_REFRESH_EVENT, handleCompleted)
      window.removeEventListener(FINANCE_REFRESH_EVENT, handleCompleted)
    }
  }, [])

  // Existing accounts retain their reviewed mappings during update-mode recovery.
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

          if (data.liveBalanceTimedOut) {
            await reportUnverifiedBalanceAttempt(onAccountsSync, {
              status:'stale',
              message:'The institution did not complete the live balance check in time. Last verified balances remain unchanged.',
            })
          } else {
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
          }

          const balancePartial = data.liveBalanceTimedOut || endpointErrors.length > 0 || !plaidAccounts.length || balanceResult?.partial === true
          const missingLinkedCount = balanceResult?.missingLinkedCount || 0
          const unmatchedCount = balanceResult?.unmatchedCount || 0
          setLinkReviewCount(balanceResult?.linkReviewAvailable ? unmatchedCount : 0)
          const balanceGapDetails = [
            ...(missingLinkedCount ? [`${missingLinkedCount} previously linked Brevity account${missingLinkedCount === 1 ? ' was' : 's were'} missing from the live bank response`] : []),
            ...(balanceResult?.linkReviewAvailable && unmatchedCount ? [`${unmatchedCount} returned bank account${unmatchedCount === 1 ? ' is' : 's are'} available for reviewed linkage`] : []),
            ...(endpointErrors.length ? [`${endpointErrors.length} bank institution${endpointErrors.length === 1 ? ' did' : 's did'} not confirm`] : []),
            ...(!plaidAccounts.length ? ['no bank accounts were returned'] : []),
          ]

          if (data.liveBalanceTimedOut) {
            balanceState = 'partial'
            balanceDetail = 'The institution did not complete the live balance check in time. Brevity kept the last verified balances and balance-check time; the transaction refresh continues separately. Try Sync now again later.'
          } else if (balanceFailure) {
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
        if (cause?.requiresUpdate?.length) setRequiresUpdate(cause.requiresUpdate)
        checkConnectionStatus()
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
      setSyncNotice([balanceHasIssue ? '' : balanceSummary, transactionSummary].filter(Boolean).join(' '))

      if (balanceState === 'complete' && ['complete','skipped'].includes(transactionState)) {
        window.dispatchEvent(new CustomEvent('brevity-finance-sync-recovered'))
      }
    } finally {
      setSyncing(false)
    }
  }, [onAccountsSync, onTransactionsSync])

  const isConnected = connections.length > 0

  return (
    <div className="plaid-connect" onKeyDown={event => {if(event.key === 'Escape' && expanded){setExpanded(false);event.currentTarget.querySelector('[aria-controls="bank-information-panel"]')?.focus()}}} style={{ marginBottom: 20 }}>
      {requiresUpdate.length > 0 && <Suspense fallback={<p role="status">Loading secure reconnection…</p>}><BankReconnect items={requiresUpdate} connections={connections} checkedLabel={syncedAt ? formatTime(syncedAt) : 'Not yet verified'} canReconnect={canReconnect} request={apiFetch} onViewAccounts={onReviewAccountLinks} onReconnected={() => {
        setError(null)
        setSyncNotice('Secure sign-in completed. Saved balances remain unchanged until a successful balance refresh.')
        checkConnectionStatus()
      }}/></Suspense>}
      <div className="plaid-connect-status" style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        {!requiresUpdate.length && <div style={{flex:'1 1 190px',minWidth:0}}>
          <div style={{fontSize:13,color:'#F7F6F2'}}>Balance checked: {syncedAt ? formatTime(syncedAt) : 'Not yet verified'}</div>
          <div role="status" style={{fontSize:12,color:needsRefresh ? '#C5A46D' : '#aaa99f',marginTop:4}}>
            {needsRefresh ? 'Needs refresh' : 'Last successful live check'}
          </div>
        </div>}
        {!requiresUpdate.length && <button type="button" onClick={() => syncAccounts({ refreshTransactions:true })} disabled={syncBusy}
          title="Requests a paid update from existing bank connections. Estimated $0.22 per connection; six-hour cooldown and $5 monthly allowance. Open Bank information for details."
          style={{minHeight:44,padding:'10px 16px',borderRadius:10,border:'1px solid #C5A46D',background:'#C5A46D',color:'#17150f',fontFamily:'inherit',fontWeight:600,cursor:syncBusy?'wait':'pointer',opacity:syncBusy ? 0.65 : 1}}>
          {syncBusy ? 'Updating…' : 'Refresh balance'}
        </button>}
        <button type="button" aria-label="Bank information" aria-expanded={expanded} aria-controls="bank-information-panel"
          title="Automatic sync checks saved Plaid data. Balance checked shows the last successful live check. Tap for refresh costs and connection details."
          onClick={() => setExpanded(value => !value)}
          style={{minWidth:44,minHeight:44,borderRadius:22,border:'1px solid rgba(197,164,109,.4)',background:'transparent',color:'#C5A46D',fontSize:requiresUpdate.length ? 13 : 20,cursor:'pointer',marginTop:requiresUpdate.length ? 12 : 0,padding:requiresUpdate.length ? '8px 14px' : undefined}}>{requiresUpdate.length ? 'Connection details' : 'ⓘ'}</button>
      </div>
      {syncNotice && (!requiresUpdate.length || syncNotice.startsWith('Secure sign-in')) && <p role="status" style={{margin:'8px 0 0',fontSize:12,color:'#aaa99f',lineHeight:1.45}}>{syncNotice}</p>}

      {/* ── Expanded connections list ── */}
      {expanded && (
        <div id="bank-information-panel" role="region" aria-label="Bank information details" style={{
          marginTop: 12, padding: '16px 18px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {error && requiresUpdate.length > 0 && <p role="note" style={{fontSize:12,lineHeight:1.5}}>Connection diagnostic: {error}</p>}
          <p role="note" style={{margin:0,fontSize:13,lineHeight:1.5}}>Refresh balance requests paid balance and transaction updates: estimated $0.22 per connection, with a six-hour cooldown and a shared $5 monthly allowance. Subscription fees are separate.</p>
          <p style={{margin:0,fontSize:13,lineHeight:1.5}}>Automatic sync checks the data Plaid already has when Brevity opens, every 15 minutes while visible, and when you return after five minutes. It does not verify a live balance. “Needs refresh” means the last successful live check is missing or at least 24 hours old.</p>
          <div style={{fontSize:12,color:'#aaa99f',lineHeight:1.7}}>
            <div>Last synced: {lastSyncedAt ? formatTime(lastSyncedAt) : 'Not recorded'}</div>
            <div>Plaid last updated: {sourceUpdatedAt ? formatTime(sourceUpdatedAt) : 'Not recorded'}</div>
            <div>Last live bank check: {syncedAt ? formatTime(syncedAt) : 'Not recorded'}</div>
          </div>
          {!isConnected && <p>No cached bank connection on this device. Refresh to check existing connections.</p>}
          <p className="plaid-connection-safety-note" role="note" style={{margin:0,fontSize:12,lineHeight:1.5}}>Existing connected sources can still sync. Administrators can securely reconnect an existing institution. Adding or disconnecting banks remains unavailable. Mapping a returned account to an existing Brevity account uses reviewed Action Mode and does not change bank credentials. Bank changes unavailable.</p>
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

      {error && !requiresUpdate.length && (
        <div role="alert" style={{ marginTop: 8, fontSize: 11, color: '#C4785A', background: 'rgba(196,120,90,0.1)', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(196,120,90,0.2)' }}>
          <p style={{margin:0,lineHeight:1.5}}>{error}</p>
          {linkReviewCount > 0 && typeof onReviewAccountLinks === 'function' && <button type="button" onClick={onReviewAccountLinks} style={{marginTop:9,padding:'7px 11px',borderRadius:8,border:'1px solid rgba(197,164,109,.35)',background:'rgba(197,164,109,.12)',color:'#C5A46D',fontFamily:'inherit',fontSize:11,fontWeight:600,cursor:'pointer'}}>Review account links</button>}
        </div>
      )}
    </div>
  )
}
