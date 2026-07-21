import { useState, useCallback, useEffect } from 'react'
import { usePlaidLink } from 'react-plaid-link'

const API = '/.netlify/functions'

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`)
  return res.json()
}

// ── PlaidLinkButton — rendered only when we have a link_token ──
function PlaidLinkButton({ linkToken, onSuccess, onExit }) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token, metadata) => onSuccess(public_token, metadata),
    onExit,
  })

  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
        background: '#1D9E75', border: 'none', color: 'white',
        fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
        opacity: ready ? 1 : 0.6,
      }}
    >
      <i className="ti ti-building-bank" style={{ fontSize: 16 }} aria-hidden="true" />
      Connect a bank account
    </button>
  )
}

// ── Main PlaidConnect component ──
export default function PlaidConnect({ onAccountsSync }) {
  const [linkToken, setLinkToken]       = useState(null)
  // Restore connected state from localStorage immediately — no flicker
  const [connections, setConnections]   = useState(() => {
    try {
      const saved = localStorage.getItem('plaid_connections')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [syncedAt, setSyncedAt]         = useState(() => localStorage.getItem('plaid_synced_at') || null)
  const [loading, setLoading]           = useState(false)
  const [syncing, setSyncing]           = useState(false)
  // True while the initial mount sync is running — prevents "No bank connected" flicker
  const [initialChecking, setInitialChecking] = useState(true)
  const [error, setError]               = useState(null)
  const [requiresUpdate, setRequiresUpdate] = useState([]) // items needing re-auth
  const [expanded, setExpanded]         = useState(false)

  // Fetch live account balances and push to parent
  const syncAccounts = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      const data = await apiFetch('/plaid-accounts')
      if (data.connected) {
        setSyncedAt(data.syncedAt)
        localStorage.setItem('plaid_synced_at', data.syncedAt)
        // Derive connections list from accounts
        const byInstitution = {}
        ;(data.accounts || []).forEach(a => {
          if (!byInstitution[a.itemId]) {
            byInstitution[a.itemId] = { itemId: a.itemId, institution: a.institution, accounts: [] }
          }
          byInstitution[a.itemId].accounts.push(a)
        })
        const conns = Object.values(byInstitution)
        setConnections(conns)
        localStorage.setItem('plaid_connections', JSON.stringify(conns))
        setRequiresUpdate(data.requiresUpdate || [])
        if (data.accounts?.length) {
          onAccountsSync(data.accounts, data.syncedAt)
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
      setError('Could not reach bank sync. ' + err.message)
    } finally {
      setSyncing(false)
      setInitialChecking(false)
    }
  }, [onAccountsSync])

  // Auto-sync on mount to restore state from Plaid / Netlify Blobs
  useEffect(() => {
    syncAccounts()
  }, [syncAccounts])

  // Get link token from server
  const startLink = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch('/plaid-create-link-token')
      setLinkToken(data.link_token)
    } catch (err) {
      setError('Could not start Plaid Link. ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Plaid Link success — exchange token
  const handleSuccess = useCallback(async (public_token, metadata) => {
    setSyncing(true)
    setLinkToken(null)
    try {
      const data = await apiFetch('/plaid-exchange-token', {
        method: 'POST',
        body: JSON.stringify({
          public_token,
          institutionName: metadata?.institution?.name || 'Bank',
        }),
      })
      if (data.accounts?.length) {
        onAccountsSync(data.accounts, new Date().toISOString())
        setSyncedAt(new Date().toISOString())
      }
      await syncAccounts()
    } catch (err) {
      setError('Connection failed. ' + err.message)
    } finally {
      setSyncing(false)
    }
  }, [onAccountsSync, syncAccounts])

  // Re-authenticate an item whose bank session has expired (ITEM_LOGIN_REQUIRED)
  const handleRelink = async (access_token) => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch('/plaid-create-link-token', {
        method: 'POST',
        body: JSON.stringify({ access_token }),
      })
      setLinkToken(data.link_token)
    } catch (err) { setError('Could not start re-authentication. ' + err.message) }
    finally { setLoading(false) }
  }

  const handleDisconnect = async (itemId) => {
    if (!window.confirm('Disconnect this bank account?')) return
    try {
      await apiFetch('/plaid-disconnect', { method: 'POST', body: JSON.stringify({ item_id: itemId }) })
      localStorage.removeItem('plaid_connections')
      localStorage.removeItem('plaid_synced_at')
      await syncAccounts()
    } catch (err) {
      setError('Disconnect failed: ' + err.message)
    }
  }

  const isConnected = connections.length > 0

  return (
    <div style={{ marginBottom: 20 }}>
      {/* ── Status bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
              onClick={syncAccounts}
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
                Synced {new Date(syncedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={() => setExpanded(x => !x)}
              style={{ marginLeft: 'auto', fontSize: 10, color: '#888884', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em', textTransform: 'uppercase' }}
            >
              {expanded ? 'Hide' : 'Manage'}
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 10, color: '#888884', letterSpacing: '0.08em', textTransform: 'uppercase' }}>No bank connected — balances are manual</span>
            {linkToken ? (
              <PlaidLinkButton linkToken={linkToken} onSuccess={handleSuccess} onExit={() => setLinkToken(null)} />
            ) : (
              <button
                onClick={startLink}
                disabled={loading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 18px', borderRadius: 10, cursor: 'pointer',
                  background: 'rgba(197,164,109,0.12)', border: '1px solid rgba(197,164,109,0.3)', color: '#C5A46D',
                  fontSize: 11, fontWeight: 600, fontFamily: 'inherit', letterSpacing: '0.08em', textTransform: 'uppercase',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <i className="ti ti-building-bank" style={{ fontSize: 14 }} aria-hidden="true" />
                {loading ? 'Loading…' : 'Connect a bank'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Add another institution (when connected) ── */}
      {isConnected && !expanded && (
        <div style={{ marginTop: 8 }}>
          {linkToken ? (
            <PlaidLinkButton linkToken={linkToken} onSuccess={handleSuccess} onExit={() => setLinkToken(null)} />
          ) : (
            <button
              onClick={startLink}
              disabled={loading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                background: 'white', border: '1px solid rgba(0,0,0,0.15)',
                fontSize: 12, fontWeight: 500, fontFamily: 'inherit', color: '#333',
              }}
            >
              <i className="ti ti-plus" style={{ fontSize: 12 }} aria-hidden="true" />
              Add another bank
            </button>
          )}
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
              <button
                onClick={() => handleDisconnect(conn.itemId)}
                style={{ fontSize: 10, color: '#C4785A', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em', textTransform: 'uppercase' }}
              >
                Disconnect
              </button>
            </div>
          ))}
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 10 }}>
            {linkToken ? (
              <PlaidLinkButton linkToken={linkToken} onSuccess={handleSuccess} onExit={() => setLinkToken(null)} />
            ) : (
              <button
                onClick={startLink}
                disabled={loading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 9, cursor: 'pointer',
                  background: 'white', border: '1px solid rgba(0,0,0,0.15)',
                  fontSize: 12, fontWeight: 500, fontFamily: 'inherit', color: '#333',
                }}
              >
                <i className="ti ti-plus" style={{ fontSize: 13 }} aria-hidden="true" />
                {loading ? 'Loading…' : 'Add another bank'}
              </button>
            )}
          </div>
        </div>
      )}

      {requiresUpdate.length > 0 && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(196,120,90,0.08)', border: '1px solid rgba(196,120,90,0.3)', borderRadius: 10 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#C4785A', fontWeight: 600 }}>Bank session expired — re-connect to resume syncing</p>
          {requiresUpdate.map(item => (
            <button key={item.item_id}
              onClick={() => handleRelink(item.item_id)}
              style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(196,120,90,0.4)', background: 'rgba(196,120,90,0.12)', color: '#C4785A', fontFamily: 'inherit', fontWeight: 600 }}>
              Re-connect {item.institution}
            </button>
          ))}
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
