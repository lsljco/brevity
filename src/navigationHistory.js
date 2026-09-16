export const MAX_NAVIGATION_HISTORY = 30

export function sameNavigationLocation(left = {}, right = {}) {
  return left.viewId === right.viewId && left.pillarId === right.pillarId
}

export function pushNavigationLocation(history = [], current = {}, next = {}) {
  if (sameNavigationLocation(current, next)) return history
  return [...history, current].slice(-MAX_NAVIGATION_HISTORY)
}

export function popNavigationLocation(history = []) {
  if (!history.length) return { previous: null, history }
  return { previous: history.at(-1), history: history.slice(0, -1) }
}
