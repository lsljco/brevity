// Included cached reads only. Startup performs the first sync separately.
export function startIncludedBankSync(refresh, {
  target = window, documentTarget = document, online = () => navigator.onLine,
  now = () => Date.now(), interval = setInterval, clear = clearInterval,
} = {}) {
  let lastAttempt = now(), busy = false, stopped = false
  const check = async () => {
    if (stopped || busy || !online() || documentTarget.visibilityState === 'hidden' || now() - lastAttempt < 5 * 60_000) return
    lastAttempt = now()
    busy = true
    try { await refresh() } catch { /* Refresh publishes its own source status; retry on a later check. */ }
    finally { busy = false }
  }
  const timer = interval(check, 15 * 60_000)
  target.addEventListener('focus', check)
  target.addEventListener('online', check)
  documentTarget.addEventListener('visibilitychange', check)
  return () => {
    stopped = true
    clear(timer)
    target.removeEventListener('focus', check)
    target.removeEventListener('online', check)
    documentTarget.removeEventListener('visibilitychange', check)
  }
}
