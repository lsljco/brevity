(() => {
  const INCLUDED_KEYS = [
    'apostolic_sermon_library_v1',
    'apostolic_lib_subfolders_v1',
    'counselee_profiles_v1',
    'ct-revelation-threads-v1',
    'ct_captured_micdrops_v1',
    'ct_generated_quotes_v1',
  ]
  const records = {}
  INCLUDED_KEYS.forEach(key => {
    const value = localStorage.getItem(key)
    if (value != null) records[key] = value
  })
  if (!Object.keys(records).length) {
    window.alert('No Apostolic Sermon Builder records were found in this browser. Run this rescue bookmark while the full Apostolic Sermon Builder is open on the device that contains the documents.')
    return
  }
  const label = window.prompt('Name this source device so it can be reconciled in Brevity:', /iPhone|iPad|Android/i.test(navigator.userAgent) ? 'Lorenzo mobile device' : 'Lorenzo computer')
  if (label === null) return
  const parseCount = (key, fallback) => {
    try {
      const value = JSON.parse(records[key] || fallback)
      return Array.isArray(value) ? value.length : Object.keys(value || {}).length
    } catch { return 0 }
  }
  const exportedAt = new Date().toISOString()
  const payload = {
    format: 'apostolic-sermon-device-export',
    schemaVersion: 1,
    exportedAt,
    sourceOrigin: location.origin,
    deviceLabel: String(label || 'Unlabeled Apostolic device').slice(0, 120),
    records,
    inventory: {
      sermons: parseCount('apostolic_sermon_library_v1', '[]'),
      folders: parseCount('apostolic_lib_subfolders_v1', '{}'),
      counselingProfiles: parseCount('counselee_profiles_v1', '{}'),
      revelationThreads: parseCount('ct-revelation-threads-v1', '[]'),
    },
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `apostolic-sermon-rescue-${exportedAt.slice(0, 10)}-${String(label || 'device').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'device'}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  window.alert(`Rescue package created: ${payload.inventory.sermons} sermon record(s), ${payload.inventory.revelationThreads} revelation thread(s), and ${payload.inventory.counselingProfiles} counseling profile(s). Nothing was deleted or changed.`)
})()
