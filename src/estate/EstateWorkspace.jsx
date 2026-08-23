import { useEffect, useMemo, useState } from 'react'
import { fetchEstateEntities, fetchEstateSummary, fetchHomeHQBridgeAudit } from './estateApi.js'
import './EstateWorkspace.css'

const LEGACY_URL = 'https://malbecestate.netlify.app/'
const TABS = [
  ['command', 'Command Center', 'ti-layout-dashboard', null],
  ['systems', 'Systems', 'ti-circuit-ground', 'propertySystem'],
  ['assets', 'Assets', 'ti-package', 'asset'],
  ['maintenance', 'Maintenance', 'ti-tool', 'workOrder'],
  ['projects', 'Projects', 'ti-building-estate', 'propertyProject'],
  ['vendors', 'Vendors', 'ti-users-group', 'vendor'],
  ['documents', 'Documents', 'ti-folders', 'propertyDocument'],
  ['insurance', 'Insurance', 'ti-shield-check', 'insurancePolicy'],
  ['utilities', 'Utilities', 'ti-bolt', 'utility'],
  ['grounds', 'Grounds', 'ti-trees', 'workOrder'],
  ['reports', 'Reports', 'ti-report-analytics', null],
]

const money = value => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const displayName = record => record.name || record.title || record.companyName || record.serviceType || 'Untitled record'

function Metric({ label, value, note, icon, tone = '', onClick }) {
  return <button type="button" className={`estate-metric ${tone}`} onClick={onClick}><i className={`ti ${icon}`} aria-hidden="true"/><span>{label}</span><strong>{value}</strong><small>{note}</small></button>
}

function RecordList({ label, records, loading, error }) {
  if (loading) return <div className="estate-empty">Loading {label.toLowerCase()}…</div>
  if (error) return <div className="estate-empty is-warning"><strong>{label} could not load.</strong><span>{error}</span></div>
  if (!records.length) return <div className="estate-empty"><strong>No verified {label.toLowerCase()} yet.</strong><span>Records will appear after a dry-run import is reconciled and accepted. Malbec remains available during migration.</span></div>
  return <div className="estate-record-list">{records.map(record=><article key={record.id}><div><span>{record.entityType}</span><h3>{displayName(record)}</h3></div><div><strong>{String(record.status || 'active').replaceAll('_', ' ')}</strong><small>Updated {record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : '—'}</small></div></article>)}</div>
}

function HomeHQBridgeCard({ role, audit, state, error, onAudit }) {
  const manifest = audit?.manifest
  return <section className="estate-bridge-card">
    <header><span>HomeHQ compatibility bridge</span><h2>{audit?.available ? `${manifest.sourceCount} source item${manifest.sourceCount===1?'':'s'} audited` : 'Non-destructive dry run'}</h2></header>
    {audit?.available
      ? <p>{manifest.counts.propertyProject} project · {manifest.counts.workOrder} work order · {manifest.counts.vendor} vendor · {manifest.attachmentCount} attachment record{manifest.attachmentCount===1?'':'s'}. Nothing was imported.</p>
      : <p>Inspect the synchronized <code>homehq_items_v1</code> record without changing HomeHQ or enabling Estate imports.</p>}
    {manifest?.vendorConflictCount>0&&<p className="estate-bridge-warning">{manifest.vendorConflictCount} contractor conflict{manifest.vendorConflictCount===1?'':'s'} require review.</p>}
    {manifest?.itemConflictCount>0&&<p className="estate-bridge-warning">{manifest.itemConflictCount} duplicate item ID conflict{manifest.itemConflictCount===1?'':'s'} require review.</p>}
    {state==='error'&&<p className="estate-bridge-warning">{error}</p>}
    {role==='admin'&&<button type="button" onClick={onAudit} disabled={state==='loading'}>{state==='loading'?'Auditing…':'Run compatibility audit'}</button>}
  </section>
}

export default function EstateWorkspace({ currentMember, role, onOpenProjects }) {
  const [tab, setTab] = useState('command')
  const [summary, setSummary] = useState(null)
  const [summaryState, setSummaryState] = useState('loading')
  const [summaryError, setSummaryError] = useState('')
  const [records, setRecords] = useState([])
  const [recordsState, setRecordsState] = useState('idle')
  const [recordsError, setRecordsError] = useState('')
  const [bridgeState, setBridgeState] = useState('idle')
  const [bridgeAudit, setBridgeAudit] = useState(null)
  const [bridgeError, setBridgeError] = useState('')
  const active = useMemo(() => TABS.find(item => item[0] === tab) || TABS[0], [tab])
  const propertyId = summary?.property?.id

  const auditHomeHQ = async () => {
    setBridgeState('loading'); setBridgeError('')
    try {
      const result = await fetchHomeHQBridgeAudit(propertyId)
      setBridgeAudit(result); setBridgeState('ready')
    } catch (error) {
      setBridgeError(error.message); setBridgeState('error')
    }
  }

  useEffect(() => {
    let cancelled = false
    setSummaryState('loading')
    fetchEstateSummary().then(result => {
      if (cancelled) return
      setSummary(result); setSummaryState('ready')
    }).catch(error => {
      if (cancelled) return
      setSummaryError(error.message); setSummaryState('error')
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!active[3]) { setRecords([]); setRecordsState('idle'); return }
    let cancelled = false
    setRecordsState('loading'); setRecordsError('')
    fetchEstateEntities(active[3], propertyId).then(result => {
      if (cancelled) return
      let next = result.entities || []
      if (tab === 'grounds') next = next.filter(record => /ground|landscap|exterior|irrigation|stormwater|drain/i.test(`${record.title} ${record.scope} ${record.propertySystemName}`))
      setRecords(next); setRecordsState('ready')
    }).catch(error => {
      if (cancelled) return
      setRecordsError(error.message); setRecordsState('error')
    })
    return () => { cancelled = true }
  }, [active, propertyId, tab])

  const metrics = summary?.metrics || {}
  const propertyName = summary?.property?.name || 'Malbec Estate'
  const command = <>
    <div className="estate-metrics">
      <Metric label="Overdue maintenance" value={metrics.overdueMaintenance || 0} note="Requires attention" icon="ti-alert-triangle" tone={metrics.overdueMaintenance ? 'is-alert' : ''} onClick={()=>setTab('maintenance')}/>
      <Metric label="Upcoming maintenance" value={metrics.upcomingMaintenance || 0} note="Next 90 days" icon="ti-calendar-due" onClick={()=>setTab('maintenance')}/>
      <Metric label="Open work orders" value={metrics.openWorkOrders || 0} note="Repairs and service" icon="ti-tool" onClick={()=>setTab('maintenance')}/>
      <Metric label="Active projects" value={metrics.activeProjects || 0} note={`${money(metrics.projectBudgetExposure)} exposure`} icon="ti-building-estate" onClick={()=>setTab('projects')}/>
      <Metric label="Warranties expiring" value={metrics.expiringWarranties || 0} note="Next 90 days" icon="ti-certificate" onClick={()=>setTab('assets')}/>
      <Metric label="Decisions" value={metrics.unresolvedDecisions || 0} note="Need household action" icon="ti-gavel" onClick={()=>setTab('projects')}/>
      <Metric label="Property spending" value={money(metrics.recentSpending)} note="Current calendar year" icon="ti-report-money" onClick={()=>setTab('reports')}/>
    </div>
    <div className="estate-command-grid">
      <section><header><span>Property health</span><h2>{summaryState === 'loading' ? 'Loading verified records…' : summary?.property ? 'Canonical Estate foundation active' : 'Migration foundation ready'}</h2></header><p>{summary?.property ? 'This workspace is reading authenticated, household-scoped Estate records.' : 'No Malbec records have been imported. This is intentional until every browser export is collected, transformed, and reconciled.'}</p></section>
      <section><header><span>Alerts</span><h2>{summary?.alerts?.length || 0} current alerts</h2></header>{summary?.alerts?.length ? <ul>{summary.alerts.map(alert=><li key={`${alert.type}-${alert.entityId}`}>{alert.title} <small>{alert.dueDate}</small></li>)}</ul> : <p>No verified Estate alerts yet.</p>}</section>
      <HomeHQBridgeCard role={role} audit={bridgeAudit} state={bridgeState} error={bridgeError} onAudit={auditHomeHQ}/>
    </div>
  </>

  return <div className="estate-workspace">
    <header className="estate-hero"><div><p>Household Management · Property</p><h1>{propertyName}</h1><span>Estate operations inside Brevity</span></div><div><span className="estate-access">{currentMember} · {role === 'admin' ? 'Administrator' : 'Read access'}</span><a href={LEGACY_URL} target="_blank" rel="noreferrer">Open legacy Malbec <i className="ti ti-external-link"/></a></div></header>
    <nav className="estate-tabs" aria-label="Malbec Estate sections">{TABS.map(([id,label,icon])=><button type="button" key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><i className={`ti ${icon}`}/><span>{label}</span></button>)}</nav>
    <main className="estate-content">
      {summaryState === 'error' && <div className="estate-banner"><strong>Estate foundation is not connected in this environment.</strong><span>{summaryError}</span><a href={LEGACY_URL} target="_blank" rel="noreferrer">Continue in legacy Malbec</a></div>}
      <div className="estate-section-heading"><div><p>Malbec Estate</p><h2>{active[1]}</h2></div><div className="estate-section-actions">{tab==='projects'&&onOpenProjects&&<button type="button" onClick={onOpenProjects}>Open current HomeHQ Projects</button>}{active[3]&&<span>{records.length} verified record{records.length===1?'':'s'}</span>}</div></div>
      {tab === 'command' || tab === 'reports' ? command : <RecordList label={active[1]} records={records} loading={recordsState==='loading'} error={recordsError}/>}
    </main>
  </div>
}
