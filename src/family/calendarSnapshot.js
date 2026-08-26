export const CALENDAR_CACHE_VERSION = 2
export const CALENDAR_STALE_AFTER_MS = 30 * 60 * 1000

const validDate = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const statusFromError = status => {
  if (status === 401) return 'locked'
  if (status === 503) return 'unconfigured'
  return 'error'
}

export function stampCalendarSuccess(payload = {}, syncedAt = new Date().toISOString()) {
  return {
    ...payload,
    cacheVersion: CALENDAR_CACHE_VERSION,
    error: '',
    errorStatus: null,
    lastAttemptAt: syncedAt,
    lastSuccessfulSyncAt: syncedAt,
  }
}

export function stampCalendarFailure(previous = {}, error = {}, attemptedAt = new Date().toISOString()) {
  return {
    ...previous,
    cacheVersion: CALENDAR_CACHE_VERSION,
    error: error?.message || 'The shared Apple Family Calendar could not be reached.',
    errorStatus: Number(error?.status) || null,
    lastAttemptAt: attemptedAt,
    lastSuccessfulSyncAt: previous?.lastSuccessfulSyncAt || '',
    events: Array.isArray(previous?.events) ? previous.events : [],
  }
}

export function calendarSnapshotHealth(snapshot, { now = new Date(), staleAfterMs = CALENDAR_STALE_AFTER_MS } = {}) {
  if (!snapshot) {
    return {
      state: 'loading',
      usable: false,
      stale: true,
      lastSuccessfulSyncAt: '',
      message: 'Calendar connection is still loading.',
    }
  }

  const lastSuccessful = validDate(snapshot.lastSuccessfulSyncAt)
  const ageMs = lastSuccessful ? Math.max(0, now.getTime() - lastSuccessful.getTime()) : Number.POSITIVE_INFINITY
  const stale = ageMs > staleAfterMs
  const errorState = snapshot.error ? statusFromError(snapshot.errorStatus) : ''

  if (errorState) {
    const fallback = lastSuccessful
      ? `Cached events from ${lastSuccessful.toLocaleString()} remain visible.`
      : 'No verified calendar snapshot is available.'
    return {
      state: errorState,
      usable: Boolean(lastSuccessful),
      stale: true,
      ageMs,
      lastSuccessfulSyncAt: lastSuccessful?.toISOString() || '',
      message: `${snapshot.error} ${fallback}`,
    }
  }

  if (!lastSuccessful) {
    return {
      state: 'stale',
      usable: Array.isArray(snapshot.events),
      stale: true,
      ageMs,
      lastSuccessfulSyncAt: '',
      message: 'Calendar events are from an older cache whose freshness cannot be verified. Refresh the Family Calendar.',
    }
  }

  if (stale) {
    return {
      state: 'stale',
      usable: true,
      stale: true,
      ageMs,
      lastSuccessfulSyncAt: lastSuccessful.toISOString(),
      message: `Calendar data was last verified ${lastSuccessful.toLocaleString()}. Refresh before relying on today’s schedule.`,
    }
  }

  return {
    state: 'ready',
    usable: true,
    stale: false,
    ageMs,
    lastSuccessfulSyncAt: lastSuccessful.toISOString(),
    message: `Calendar verified ${lastSuccessful.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
  }
}
