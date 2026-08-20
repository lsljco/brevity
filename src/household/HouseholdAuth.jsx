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
      <p className="household-auth-copy">{bootstrapRequired ? 'Create Larry’s administrator password. After sign-in, household member accounts can be created in Settings.' : 'Use your own household account so My Day, assignments, and personal views follow you across devices.'}</p>
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

export function HouseholdAccounts({ sessionMember, role }) {
  const [members, setMembers] = useState([])
  const [selected, setSelected] = useState('Lorenzo')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try { setMembers((await fetchHouseholdMembers()).members || []) } catch (err) { setError(err.message) }
  }
  useEffect(() => { load() }, [])

  if (role !== 'admin') return <div className="household-account-summary"><strong>Signed in as {sessionMember}</strong><span>Your identity is attached to this account on every device.</span></div>

  const save = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      await setHouseholdMemberPassword(selected, password)
      setPassword(''); setMessage(`${selected}'s account is ready.`); await load()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return <div className="household-account-admin">
    <div className="household-account-grid">{members.map(item => <div key={item.member} className={`household-account-chip${item.configured ? ' is-ready' : ''}`}><strong>{item.member}</strong><span>{item.configured ? 'Account ready' : 'Not configured'}</span></div>)}</div>
    <form onSubmit={save} className="household-account-form">
      <label><span>Member</span><select value={selected} onChange={e => setSelected(e.target.value)}>{HOUSEHOLD_MEMBERS.map(name => <option key={name}>{name}</option>)}</select></label>
      <label><span>Set / reset password</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required /></label>
      <button disabled={busy}>{busy ? 'Saving…' : 'Save Member Account'}</button>
    </form>
    {message && <div className="household-auth-success">{message}</div>}{error && <div className="household-auth-error">{error}</div>}
  </div>
}
