import { useMemo, useRef, useState } from 'react'
import { commitMalbecBackup, importEstateVaultFile, previewMalbecBackup } from './estateApi.js'
import { compareMalbecExports, formatBytes, prepareMalbecBackup, reconciliationInspection } from './malbecBackup.js'
import { buildMalbecReconciliationReport, downloadReconciliationReport } from './malbecReconciliationReport.js'

export default function MalbecMigrationConsole({ role, workspace, onCommitted }) {
  const inputRef = useRef(null)
  const [sources, setSources] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [preview, setPreview] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [seedResolutions, setSeedResolutions] = useState({})
  const [busy, setBusy] = useState('')
  const [vaultProgress, setVaultProgress] = useState('')
  const [error, setError] = useState('')
  const comparison = useMemo(() => sources.length ? compareMalbecExports(sources) : null, [sources])
  const selectedSource = selectedIndex == null ? null : sources[selectedIndex]
  const inspection = selectedSource && comparison ? reconciliationInspection(sources, comparison, selectedIndex, Object.values(seedResolutions)) : null
  const reconciliationReport = useMemo(() => preview?.dryRun && comparison && inspection
    ? buildMalbecReconciliationReport({ preview, comparison, inspection, selectedIndex })
    : null, [preview, comparison, inspection, selectedIndex])
  const pendingFiles = (workspace?.migration?.pendingFiles || []).filter(file => file.status === 'pending-document-import')
  const sourceMatchesWorkspace = Boolean(workspace && selectedSource && workspace.migration?.sourceChecksum === selectedSource.inspection.sourceChecksum)
  const availableFilePayloads = sourceMatchesWorkspace
    ? (selectedSource.filePayloads || []).filter(payload => pendingFiles.some(file => file.id === payload.id && file.path === payload.path && file.sourceChecksum === payload.sourceChecksum))
    : []

  if (role !== 'admin') return null

  const resetValidation = () => { setPreview(null); setConfirmed(false) }

  const selectFiles = async event => {
    const files = [...(event.target.files || [])]
    event.target.value = ''
    if (!files.length) return
    setBusy('inspect')
    setError(''); setSeedResolutions({}); resetValidation()
    const additions = []
    const failures = []
    for (const file of files) {
      try {
        if (file.size > 50_000_000) throw new Error(`${file.name} is larger than 50 MB.`)
        const parsed = JSON.parse(await file.text())
        const result = prepareMalbecBackup(parsed, { sourceFileName: file.name, sourceBytes: file.size })
        if (result.inspection.preparedBytes > 4_500_000) throw new Error(`${file.name} remains too large after file extraction and requires the offline pipeline.`)
        if ([...sources, ...additions].some(source => source.inspection.sourceChecksum === result.inspection.sourceChecksum)) throw new Error(`${file.name} duplicates an export already selected.`)
        additions.push(result)
      } catch (reason) { failures.push(reason.message || `${file.name} is not a valid Malbec backup.`) }
    }
    if (additions.length) {
      const nextSources = [...sources, ...additions]
      const nextComparison = compareMalbecExports(nextSources)
      setSources(nextSources)
      setSelectedIndex(nextComparison.recommendedSourceIndex ?? nextSources.length - 1)
    }
    if (failures.length) setError(failures.join(' '))
    setBusy('')
  }

  const removeSource = index => {
    const nextSources = sources.filter((_, sourceIndex) => sourceIndex !== index)
    setSources(nextSources); setSeedResolutions({}); resetValidation(); setError('')
    if (!nextSources.length) return setSelectedIndex(null)
    const nextComparison = compareMalbecExports(nextSources)
    setSelectedIndex(nextComparison.recommendedSourceIndex ?? Math.min(index, nextSources.length - 1))
  }

  const chooseSource = index => { setSelectedIndex(index); setSeedResolutions({}); resetValidation() }

  const resolveSeedCandidate = (candidate, action) => {
    const key = `${candidate.key}:${candidate.legacyId}:${candidate.sourceFingerprint}`
    setSeedResolutions(current => ({ ...current, [key]: { ...candidate, action } }))
    resetValidation()
  }

  const runPreview = async () => {
    setBusy('preview'); setError(''); setPreview(null)
    try { setPreview(await previewMalbecBackup({ backup: selectedSource.prepared, sourceInspection: inspection })) }
    catch (reason) { setError(reason.message) }
    finally { setBusy('') }
  }

  const commit = async () => {
    if (!confirmed || !preview || workspace || !selectedSource) return
    setBusy('commit'); setError('')
    try {
      const result = await commitMalbecBackup({ backup: selectedSource.prepared, sourceInspection: inspection, expectedVersion: 0 })
      onCommitted?.(result.workspace)
      setPreview(result)
    } catch (reason) { setError(reason.message) }
    finally { setBusy('') }
  }

  const importPendingFiles = async () => {
    if (!workspace || !availableFilePayloads.length) return
    setBusy('files'); setError('')
    let currentWorkspace = workspace
    try {
      for (let fileIndex = 0; fileIndex < availableFilePayloads.length; fileIndex += 1) {
        const file = availableFilePayloads[fileIndex]
        setVaultProgress(`File ${fileIndex + 1} of ${availableFilePayloads.length} · preparing`)
        const result = await importEstateVaultFile({
          propertyId: currentWorkspace.propertyId,
          file,
          expectedVersion: currentWorkspace.version,
          onProgress: ({ chunkIndex, totalChunks }) => setVaultProgress(`File ${fileIndex + 1} of ${availableFilePayloads.length} · chunk ${chunkIndex} of ${totalChunks}`),
        })
        currentWorkspace = result.workspace
        onCommitted?.(currentWorkspace)
      }
      setVaultProgress(`${availableFilePayloads.length} file${availableFilePayloads.length === 1 ? '' : 's'} imported and verified`)
    } catch (reason) { setError(reason.message) }
    finally { setBusy('') }
  }

  const blocked = Boolean(inspection?.blockingIssues?.length || workspace)
  const previewBlocks = preview?.report?.sourceInspection?.blockingIssues || []
  return <section className="estate-migration-console">
    <header><div><p>Administrator migration console</p><h2>Compare Malbec device backups</h2><span>Inspect every browser export · reconcile differences · preview · explicitly import</span></div><button type="button" onClick={() => inputRef.current?.click()} disabled={Boolean(busy)}><i className="ti ti-files"/> {busy === 'inspect' ? 'Inspecting backups…' : sources.length ? 'Add another backup' : 'Choose JSON backups'}</button><input ref={inputRef} type="file" accept="application/json,.json" multiple onChange={selectFiles} hidden/></header>
    {workspace && <div className="estate-migration-notice"><i className="ti ti-shield-lock"/><span>A durable Malbec workspace already exists. New backups can be compared, but this console will not overwrite the initial import.</span></div>}
    {error && <div className="estate-migration-error" role="alert"><i className="ti ti-alert-circle"/> {error}</div>}
    {!sources.length && <div className="estate-migration-notice"><i className="ti ti-device-desktop"/><span>Add the untouched Malbec JSON export from every browser or device used to edit the legacy application.</span></div>}
    {sources.length > 0 && <>
      <div className="estate-source-list"><h3>Source exports</h3>{sources.map((source, index) => <div key={source.inspection.sourceChecksum} className={`estate-source-item${selectedIndex === index ? ' is-selected' : ''}`}>
        <input type="radio" name="estate-source" aria-label={`Use ${source.inspection.sourceFileName} as the migration candidate`} checked={selectedIndex === index} onChange={() => chooseSource(index)}/>
        <span><strong>{source.inspection.sourceFileName}</strong><small>{source.inspection.sourceExportedAt ? new Date(source.inspection.sourceExportedAt).toLocaleString() : 'Export time unavailable'} · {source.inspection.sourceRecordCount} records · {source.inspection.fileCount} files</small></span>
        <button type="button" onClick={() => removeSource(index)} aria-label={`Remove ${source.inspection.sourceFileName}`}><i className="ti ti-x"/></button>
      </div>)}</div>
      <div className={`estate-comparison${comparison.blockingIssues.length ? ' has-conflicts' : ''}`}>
        <div><i className={`ti ${comparison.blockingIssues.length ? 'ti-arrows-diff' : 'ti-checks'}`}/><span><strong>{comparison.sourceCount === 1 ? 'One export inspected' : comparison.propertyRecordsAgree ? `${comparison.sourceCount} exports agree` : 'Property records require reconciliation'}</strong><small>{comparison.propertyConflicts.length} property conflicts · {comparison.deferredDifferences.length} deferred-domain differences</small></span></div>
        {comparison.blockingIssues.length > 0 && <ul>{comparison.blockingIssues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
        {comparison.deferredDifferences.length > 0 && <p>Deferred differences are recorded for later Calendar, Household, or Supplies migration and do not alter this property import.</p>}
      </div>
      {selectedSource.inspection.seedCandidates?.length > 0 && <div className="estate-seed-review">
        <h3>Review exact code-default matches</h3>
        <p>These records exactly match Malbec's built-in demonstration data. Decide whether each became a real household record or should be excluded as a sample.</p>
        {selectedSource.inspection.seedCandidates.map(candidate => {
          const key = `${candidate.key}:${candidate.legacyId}:${candidate.sourceFingerprint}`
          const action = seedResolutions[key]?.action || ''
          return <div className="estate-seed-item" key={key}>
            <span><strong>{candidate.title}</strong><small>{candidate.key.replace('maintenance_', '').replaceAll('_', ' ')} · legacy ID {candidate.legacyId}</small></span>
            <label><input type="radio" name={`seed-${key}`} checked={action === 'exclude'} onChange={() => resolveSeedCandidate(candidate, 'exclude')}/> Exclude sample</label>
            <label><input type="radio" name={`seed-${key}`} checked={action === 'import'} onChange={() => resolveSeedCandidate(candidate, 'import')}/> Keep as real</label>
          </div>
        })}
      </div>}
    </>}
    {inspection && <>
      <div className="estate-migration-stats">
        <div><strong>{inspection.keyCount}</strong><span>Storage keys</span></div>
        <div><strong>{inspection.sourceRecordCount}</strong><span>Source records</span></div>
        <div><strong>{inspection.fileCount}</strong><span>Files catalogued</span></div>
        <div><strong>{formatBytes(inspection.preparedBytes)}</strong><span>Safe upload</span></div>
      </div>
      <div className="estate-migration-details">
        <div><h3>Selected export inventory</h3><div className="estate-key-list">{inspection.keyInventory.map(item => <div key={item.key}><code>{item.key}</code><span>{item.count}</span><em className={`is-${item.disposition}`}>{item.disposition.replaceAll('-', ' ')}</em></div>)}</div></div>
        <div><h3>Inspection notes</h3>{inspection.warnings.length ? <ul>{inspection.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : <p>No inspection warnings.</p>}{inspection.fileCount > 0 && <p>Embedded file bytes: {formatBytes(inspection.embeddedFileBytes)}. Original backups are unchanged; files remain pending for Estate Vault.</p>}</div>
      </div>
      {!preview && <button className="estate-preview-button" type="button" onClick={runPreview} disabled={Boolean(busy)}>{busy === 'preview' ? 'Running validation…' : 'Run safe migration preview'}</button>}
    </>}
    {workspace && pendingFiles.length > 0 && <div className="estate-vault-import">
      <div><i className="ti ti-shield-upload"/><span><strong>Estate Vault migration</strong><small>{pendingFiles.length} file{pendingFiles.length === 1 ? '' : 's'} remain pending durable import</small></span></div>
      {!selectedSource && <p>Choose the original Malbec backup again to make its file bytes available locally. Brevity does not retain source bytes during structured preview.</p>}
      {selectedSource && !sourceMatchesWorkspace && <p>The selected backup checksum does not match the export used to create this Estate workspace.</p>}
      {sourceMatchesWorkspace && <p>{availableFilePayloads.length} matching file payload{availableFilePayloads.length === 1 ? '' : 's'} available. Each file is uploaded in resumable chunks, verified, hashed, related, and audited.</p>}
      {vaultProgress && <p className="estate-vault-progress" role="status">{vaultProgress}</p>}
      <button type="button" onClick={importPendingFiles} disabled={!availableFilePayloads.length || Boolean(busy)}>{busy === 'files' ? 'Importing and verifying…' : 'Import matching files to Estate Vault'}</button>
    </div>}
    {preview && <div className={`estate-preview-result${previewBlocks.length ? ' has-blockers' : ''}`}>
      <div><i className={`ti ${previewBlocks.length ? 'ti-alert-triangle' : 'ti-circle-check'}`}/><span><strong>{previewBlocks.length ? 'Preview complete — action required' : 'Dry run passed'}</strong><small>No Estate or Malbec records were changed.</small></span></div>
      <dl><div><dt>Systems</dt><dd>{preview.report.counts.systems}</dd></div><div><dt>Work orders</dt><dd>{preview.report.counts.workOrders}</dd></div><div><dt>Projects</dt><dd>{preview.report.counts.projects}</dd></div><div><dt>Deferred keys</dt><dd>{preview.report.deferredKeys.length}</dd></div></dl>
      <div className="estate-validation-checks">
        <span className={preview.report.validation?.preparedChecksumVerified ? 'is-pass' : 'is-fail'}><i className={`ti ${preview.report.validation?.preparedChecksumVerified ? 'ti-shield-check' : 'ti-shield-x'}`}/> Payload integrity</span>
        <span className={preview.report.validation?.recordCountMatches ? 'is-pass' : 'is-fail'}><i className={`ti ${preview.report.validation?.recordCountMatches ? 'ti-list-check' : 'ti-alert-triangle'}`}/> Record counts reconcile</span>
      </div>
      {preview.report.seedReview?.candidateCount > 0 && <p className="estate-seed-summary">Seed review: {preview.report.seedReview.excludedCount} excluded · {preview.report.seedReview.importedCount} retained · {preview.report.seedReview.unresolvedCount} unresolved</p>}
      {previewBlocks.length > 0 && <ul className="estate-preview-blockers">{previewBlocks.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      {reconciliationReport && <button className="estate-report-button" type="button" onClick={() => downloadReconciliationReport(reconciliationReport)}><i className="ti ti-download"/> Download reconciliation report</button>}
      {!workspace && <label className="estate-import-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>I inspected every known Malbec device export and understand this creates Brevity's initial durable Estate workspace. Malbec remains active and its source data will not be modified.</span></label>}
      <button className="estate-commit-button" type="button" onClick={commit} disabled={!confirmed || blocked || Boolean(busy)}>{busy === 'commit' ? 'Creating durable workspace…' : workspace ? 'Initial import already protected' : blocked ? 'Resolve comparison issues before import' : 'Commit initial structured import'}</button>
    </div>}
  </section>
}
