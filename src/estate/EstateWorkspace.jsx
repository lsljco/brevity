import { useEffect, useMemo, useState } from 'react'
import { estateWorkspaceSummary } from './estateModel.js'
import { estateDocumentUrl, fetchEstateWorkspace } from './estateApi.js'
import EstateMaintenance from './EstateMaintenance.jsx'
import EstateVendorIntelligence from './EstateVendorIntelligence.jsx'
import MalbecMigrationConsole from './MalbecMigrationConsole.jsx'
import './EstateWorkspace.css'

const cards = summary => [
  ['Property systems', summary.systems, 'ti-adjustments-cog'],
  ['Registered assets', summary.assets, 'ti-engine'],
  ['Maintenance plans', summary.maintenancePlans, 'ti-calendar-cog', 'estate-maintenance'],
  ['Upcoming maintenance', summary.upcomingMaintenance, 'ti-calendar-time', 'estate-maintenance'],
  ['Open work orders', summary.openWorkOrders, 'ti-tool'],
  ['Overdue maintenance', summary.overdueMaintenance, 'ti-alert-triangle'],
  ['Active projects', summary.activeProjects, 'ti-timeline-event'],
  ['Vendors', summary.vendors, 'ti-address-book', 'estate-vendors'],
  ['Documents', summary.documents, 'ti-files'],
]

export default function EstateWorkspace({ role = 'member' }) {
  const [workspace, setWorkspace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    fetchEstateWorkspace()
      .then(value => { if (!cancelled) setWorkspace(value) })
      .catch(reason => { if (!cancelled) setError(reason.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])
  const summary = useMemo(() => workspace ? estateWorkspaceSummary(workspace) : null, [workspace])

  if (loading) return <div className="estate-state">Loading Estate records…</div>
  if (error) return <div className="estate-state estate-state--error"><i className="ti ti-cloud-off"/> {error}</div>

  return <section className="estate-workspace">
    <header className="estate-header">
      <div><p className="estate-eyebrow">Household Management · Property</p><h1>Malbec Estate</h1><p>Native property operations, maintained inside Brevity.</p></div>
      <span className="estate-readiness"><i className="ti ti-shield-check"/> {workspace ? `Durable record v${workspace.version}` : 'Migration staging'}</span>
    </header>
    {!workspace ? <div className="estate-empty">
      <i className="ti ti-building-estate"/>
      <div><h2>Estate foundation is ready</h2><p>No legacy records have been committed. Malbec remains active while its structured data, files, and relationships are extracted and reconciled.</p></div>
    </div> : <>
      <div className="estate-command-grid">{cards(summary).map(([label, value, icon, target]) => target
        ? <button key={label} type="button" onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' })}><i className={`ti ${icon}`}/><strong>{value}</strong><span>{label}</span></button>
        : <article key={label}><i className={`ti ${icon}`}/><strong>{value}</strong><span>{label}</span></article>)}</div>
      <div className="estate-sections">
        <article><p>Needs attention</p><h2>{summary.openWorkOrders ? `${summary.openWorkOrders} open work order${summary.openWorkOrders === 1 ? '' : 's'}` : 'No open work orders'}</h2><span>{summary.overdueMaintenance ? `${summary.overdueMaintenance} overdue` : 'Nothing overdue'}</span></article>
        <article><p>Portfolio activity</p><h2>{summary.activeProjects ? `${summary.activeProjects} active project${summary.activeProjects === 1 ? '' : 's'}` : 'No active projects'}</h2><span>{summary.systems} systems · {summary.assets} assets</span></article>
      </div>
      <EstateMaintenance role={role} workspace={workspace} onWorkspaceChange={setWorkspace}/>
      <div id="estate-vendors"><EstateVendorIntelligence workspace={workspace}/></div>
      {workspace.documents.length > 0 && <section className="estate-vault-list">
        <header><div><p>Estate Vault</p><h2>Verified property documents</h2></div><span>{workspace.documents.length} file{workspace.documents.length === 1 ? '' : 's'}</span></header>
        {workspace.documents.map(document => <a key={document.id} href={estateDocumentUrl(document.id, workspace.propertyId)}>
          <i className={`ti ${document.documentType === 'photograph' ? 'ti-photo' : 'ti-file-description'}`}/>
          <span><strong>{document.title}</strong><small>{document.mimeType} · SHA-256 verified · {document.relatedEntityIds?.length ? 'Related to Estate record' : 'Property-level document'}</small></span>
          <i className="ti ti-download"/>
        </a>)}
      </section>}
    </>}
    <MalbecMigrationConsole role={role} workspace={workspace} onCommitted={setWorkspace}/>
    <footer className="estate-safety"><i className="ti ti-lock"/><span>Migration writes are limited to validated Brevity records and Estate Vault files. Legacy Malbec data and infrastructure remain unchanged until reconciliation and acceptance are complete.</span></footer>
  </section>
}
