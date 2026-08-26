import { useRef, useState } from 'react'
import { commitMalbecBackup, previewMalbecBackup } from './estateApi.js'
import { formatBytes, prepareMalbecBackup } from './malbecBackup.js'

export default function MalbecMigrationConsole({ role, workspace, onCommitted }) {
  const inputRef = useRef(null)
  const [prepared, setPrepared] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [preview, setPreview] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  if (role !== 'admin') return null

  const selectFile = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(''); setPreview(null); setConfirmed(false)
    try {
      if (file.size > 50_000_000) throw new Error('Choose a Malbec JSON backup smaller than 50 MB. Large file binaries will be handled through the document pipeline.')
      const parsed = JSON.parse(await file.text())
      const result = prepareMalbecBackup(parsed, { sourceFileName: file.name, sourceBytes: file.size })
      if (result.inspection.preparedBytes > 4_500_000) throw new Error('The structured records remain too large after file extraction. Do not import this backup; it requires the offline migration pipeline.')
      setPrepared(result.prepared)
      setInspection(result.inspection)
    } catch (reason) {
      setPrepared(null); setInspection(null)
      setError(reason.message || 'The selected file is not a valid Malbec backup.')
    }
  }

  const runPreview = async () => {
    setBusy('preview'); setError(''); setPreview(null)
    try { setPreview(await previewMalbecBackup({ backup: prepared, sourceInspection: inspection })) }
    catch (reason) { setError(reason.message) }
    finally { setBusy('') }
  }

  const commit = async () => {
    if (!confirmed || !preview || workspace) return
    setBusy('commit'); setError('')
    try {
      const result = await commitMalbecBackup({ backup: prepared, sourceInspection: inspection, expectedVersion: 0 })
      onCommitted?.(result.workspace)
      setPreview(result)
    } catch (reason) { setError(reason.message) }
    finally { setBusy('') }
  }

  const blocked = Boolean(inspection?.blockingIssues?.length || workspace)
  const previewBlocks = preview?.report?.sourceInspection?.blockingIssues || []
  return <section className="estate-migration-console">
    <header><div><p>Administrator migration console</p><h2>Inspect a Malbec backup</h2><span>Local inspection first · server dry run second · explicit import last</span></div><button type="button" onClick={() => inputRef.current?.click()} disabled={Boolean(busy)}><i className="ti ti-file-upload"/> Choose JSON backup</button><input ref={inputRef} type="file" accept="application/json,.json" onChange={selectFile} hidden/></header>
    {workspace && <div className="estate-migration-notice"><i className="ti ti-shield-lock"/><span>A durable Malbec workspace already exists. New backups can be inspected, but this console will not overwrite the initial import.</span></div>}
    {error && <div className="estate-migration-error" role="alert"><i className="ti ti-alert-circle"/> {error}</div>}
    {inspection && <>
      <div className="estate-migration-stats">
        <div><strong>{inspection.keyCount}</strong><span>Storage keys</span></div>
        <div><strong>{inspection.sourceRecordCount}</strong><span>Source records</span></div>
        <div><strong>{inspection.fileCount}</strong><span>Files catalogued</span></div>
        <div><strong>{formatBytes(inspection.preparedBytes)}</strong><span>Safe upload</span></div>
      </div>
      <div className="estate-migration-details">
        <div><h3>Key inventory</h3><div className="estate-key-list">{inspection.keyInventory.map(item => <div key={item.key}><code>{item.key}</code><span>{item.count}</span><em className={`is-${item.disposition}`}>{item.disposition.replaceAll('-', ' ')}</em></div>)}</div></div>
        <div><h3>Inspection notes</h3>{inspection.warnings.length ? <ul>{inspection.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : <p>No inspection warnings.</p>}{inspection.fileCount > 0 && <p>Embedded file bytes: {formatBytes(inspection.embeddedFileBytes)}. The original backup is unchanged; files remain pending for Estate Vault.</p>}</div>
      </div>
      {!preview && <button className="estate-preview-button" type="button" onClick={runPreview} disabled={Boolean(busy)}>{busy === 'preview' ? 'Running validation…' : 'Run safe migration preview'}</button>}
    </>}
    {preview && <div className={`estate-preview-result${previewBlocks.length ? ' has-blockers' : ''}`}>
      <div><i className={`ti ${previewBlocks.length ? 'ti-alert-triangle' : 'ti-circle-check'}`}/><span><strong>{previewBlocks.length ? 'Preview complete — action required' : 'Dry run passed'}</strong><small>No Estate or Malbec records were changed.</small></span></div>
      <dl><div><dt>Systems</dt><dd>{preview.report.counts.systems}</dd></div><div><dt>Work orders</dt><dd>{preview.report.counts.workOrders}</dd></div><div><dt>Projects</dt><dd>{preview.report.counts.projects}</dd></div><div><dt>Deferred keys</dt><dd>{preview.report.deferredKeys.length}</dd></div></dl>
      {previewBlocks.length > 0 && <ul className="estate-preview-blockers">{previewBlocks.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      {!workspace && <label className="estate-import-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>I understand this creates Brevity's initial durable Estate workspace. Malbec remains active and its source data will not be modified.</span></label>}
      <button className="estate-commit-button" type="button" onClick={commit} disabled={!confirmed || blocked || Boolean(busy)}>{busy === 'commit' ? 'Creating durable workspace…' : workspace ? 'Initial import already protected' : 'Commit initial structured import'}</button>
    </div>}
  </section>
}
