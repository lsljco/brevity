import { useEffect, useState } from 'react'
import { HOUSEHOLD_MEMBERS } from './dailyPlan.js'
import {
  bootstrapHousehold,
  fetchHouseholdMembers,
  fetchHouseholdSession,
  loginHouseholdMember,
  logoutHouseholdMember,
  setHouseholdMemberPassword,
} from './authApi.js'
import { getSharedStateHealth, SHARED_STATE_HEALTH_EVENT } from './sharedState.js'
import './HouseholdAuth.css'

export function useHouseholdAuth() {
  const [state, setState] = useState({ loading: true, authenticated: false, member: null, role: null, bootstrapRequired: false, error: '' })

  const reload = async () => {
    setState(current => ({ ...current, loading: true, error: '' }))
    try {
      const session = await fetchHouseholdSession()
      setState({ loading: false, error: '', ...session })
    } catch (error) {
      setState({ loading: false, authenticated: false, member: null, role: null, bootstrapRequired: false, error: error.message })
    }
  }

  useEffect(() => { reload() }, [])

  const login = async (member, password) => {
    const session = await loginHouseholdMember(member, password)
    setState(current => ({ ...current, loading: false, error: '', bootstrapRequired: false, ...session }))
  }

  const bootstrap = async password => {
    const session = await bootstrapHousehold(password)
    setState(current => ({ ...current, loading: false, error: '', bootstrapRequired: false, ...session }))
  }

  const logout = async () => {
    await logoutHouseholdMember()
    await reload()
  }

  return { ...state, reload, login, bootstrap, logout }
}

export function HouseholdLogin({ bootstrapRequired, onLogin, onBootstrap, error: initialError }) {
  const [member, setMember] = useState('Larry')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(initialError || '')
  const [busy, setBusy] = useState(false)

  const submit = async event => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      if (bootstrapRequired) await onBootstrap(password)
      else await onLogin(member, password)
    } catch (err) {
      setError(err.message || 'Could not sign in.')
      setBusy(false)
    }
  }

  return <div className="household-auth-page">
    <div className="household-auth-card">
      <img src="/brevity-logo.png" alt="Brevity" className="household-auth-logo" />
      <p className="household-auth-kicker">Household Operating System</p>
      <h1>{bootstrapRequired ? 'Initialize Household Access' : 'Sign in to Brevity'}</h1>
      <p className="household-auth-copy">{bootstrapRequired ? 'Create Larry’s initial administrator password. Additional household account and password changes are disabled in this release.' : 'Use your own household account so My Day, assignments, and personal views follow you across devices.'}</p>
      <form onSubmit={submit}>
        {!bootstrapRequired && <label><span>Household member</span><select value={member} onChange={e => setMember(e.target.value)}>{HOUSEHOLD_MEMBERS.map(name => <option key={name}>{name}</option>)}</select></label>}
        {bootstrapRequired && <div className="household-auth-admin">Administrator: <strong>Larry</strong></div>}
        <label><span>Password</span><input type="password" autoComplete={bootstrapRequired ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} minLength={8} required /></label>
        {error && <div className="household-auth-error">{error}</div>}
        <button type="submit" disabled={busy}>{busy ? 'Please wait…' : bootstrapRequired ? 'Create Administrator Account' : 'Sign In'}</button>
      </form>
    </div>
  </div>
}

function formatSyncTime(value) {
  if (!value) return 'Not yet verified'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not yet verified'
  return date.toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })
}

function HouseholdSyncHealth() {
  const [health, setHealth] = useState(() => getSharedStateHealth())
  useEffect(() => {
    const refresh = event => setHealth(event.detail || getSharedStateHealth())
    window.addEventListener(SHARED_STATE_HEALTH_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(SHARED_STATE_HEALTH_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  const status = health.status === 'healthy' ? 'Healthy' : health.status === 'syncing' ? 'Syncing' : health.status === 'degraded' ? 'Needs attention' : 'Checking'
  return <section className={`household-sync-health household-sync-health--${health.status || 'unknown'}`} aria-label="Household data sync health">
    <div><span>Household data</span><strong>{status}</strong></div>
    <div><span>Pending writes</span><strong>{Number(health.pendingWrites || 0)}</strong></div>
    <div><span>Last verified sync</span><strong>{formatSyncTime(health.lastSuccessAt)}</strong></div>
    {health.lastConflictAt && <p>Most recent edit conflict was reconciled automatically for <strong>{health.lastConflictKey || 'a household record'}</strong> at {formatSyncTime(health.lastConflictAt)}.</p>}
    {health.lastError && <p className="household-sync-health-error">{health.lastError} Brevity retains the local cache and retries synchronization automatically.</p>}
  </section>
}

export function HouseholdAccounts({ sessionMember, role }) {
  const [members, setMembers] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [targetMember, setTargetMember] = useState(sessionMember)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try { setMembers((await fetchHouseholdMembers()).members || []) } catch (err) { setError(err.message) }
  }
  useEffect(() => { load() }, [])

  const savePassword = async event => {
    event.preventDefault()
    setError(''); setSuccess('')
    if (newPassword !== confirmPassword) return setError('The new passwords do not match.')
    setBusy(true)
    try {
      const target = role === 'admin' ? targetMember : sessionMember
      const result = await setHouseholdMemberPassword({ member:target, currentPassword, newPassword })
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setSuccess(result.message || `Password updated for ${result.member}.`)
      await load()
    } catch (err) {
      setError(err.message || 'Could not update the password.')
    } finally { setBusy(false) }
  }

  return <div className="household-account-admin">
    {role === 'admin' ? <div className="household-account-grid">{members.map(item => <div key={item.member} className={`household-account-chip${item.configured ? ' is-ready' : ''}`}><strong>{item.member}</strong><span>{item.configured ? 'Account ready' : 'Not configured'}</span></div>)}</div> : <div className="household-account-summary"><strong>Signed in as {sessionMember}</strong><span>Your identity is attached to this account on every device.</span></div>}
    <form className="household-account-form household-password-form" onSubmit={savePassword}>
      {role === 'admin' && <label><span>Household member</span><select value={targetMember} onChange={event => setTargetMember(event.target.value)}>{HOUSEHOLD_MEMBERS.map(member => <option key={member}>{member}</option>)}</select></label>}
      <label><span>Your current password</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} minLength={8} required /></label>
      <label><span>New password</span><input type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={8} required /></label>
      <label><span>Confirm new password</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={8} required /></label>
      <button type="submit" disabled={busy}>{busy ? 'Updating…' : role === 'admin' && targetMember !== sessionMember ? `Set ${targetMember}’s Password` : 'Change Password'}</button>
    </form>
    <p className="household-account-target" role="note">For security, password changes require the signed-in member’s current password. Updating an account signs out its other active sessions.</p>
    {error && <div className="household-auth-error">{error}</div>}
    {success && <div className="household-auth-success" role="status">{success}</div>}
    <HouseholdSyncHealth/>
  </div>
}
