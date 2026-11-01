// Preserve recovery copies outside the small synchronous localStorage quota.
// Never delete the original until the IndexedDB transaction has committed.
export function archiveRecoveryCopy(key, value, indexedDB = globalThis.indexedDB) {
  if (!indexedDB) return Promise.reject(new Error('Recovery storage is unavailable.'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('brevity-local-recovery', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('copies', { keyPath: 'id', autoIncrement: true })
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Recovery storage is blocked.'))
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('copies', 'readwrite')
      tx.objectStore('copies').add({ key, value, archivedAt: new Date().toISOString() })
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Recovery copy could not be saved.')) }
      tx.onerror = () => { /* onabort reports the transaction failure */ }
    }
  })
}

export async function archiveLocalRecoveryCopies(storage, sharedKeys, archive = archiveRecoveryCopy) {
  const removed = []
  for (const key of sharedKeys) {
    for (const suffix of ['_backup', '_local_backup_before_cloud', '_server_conflict']) {
      const backupKey = key + suffix
      const value = storage.getItem(backupKey)
      if (value == null) continue
      await archive(backupKey, value)
      // Another tab may have updated this copy during the asynchronous write.
      if (storage.getItem(backupKey) !== value) continue
      storage.removeItem(backupKey)
      removed.push(backupKey)
    }
  }
  return removed
}
