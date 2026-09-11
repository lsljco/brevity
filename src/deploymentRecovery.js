export const CHUNK_RECOVERY_KEY = 'brevity_chunk_recovery_at'
export const isDeploymentChunkError = error => /importing a module script failed|failed to fetch dynamically imported module|loading chunk [^ ]+ failed|chunkloaderror/i.test(String(error?.message || error || ''))

export function deploymentRecoveryUrl(location = window.location, now = Date.now()) {
  const url = new URL(location.href)
  url.searchParams.set('_brevity_reload', String(now))
  return url.toString()
}

export function recoverCurrentDeployment({ error, location = window.location, storage = window.sessionStorage, now = Date.now() } = {}) {
  if (!isDeploymentChunkError(error)) return false
  const lastAttempt = Number(storage?.getItem?.(CHUNK_RECOVERY_KEY) || 0)
  if (Number.isFinite(lastAttempt) && now - lastAttempt < 30_000) return false
  storage?.setItem?.(CHUNK_RECOVERY_KEY, String(now))
  location.replace(deploymentRecoveryUrl(location, now))
  return true
}
