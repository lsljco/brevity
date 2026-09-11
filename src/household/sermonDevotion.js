const clean = value => String(value || '').trim()
const values = value => Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []

const parseDateKey = value => {
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function sermonDevotionForDate({ notes = {}, source = {}, targetDate = '' } = {}) {
  const days = values(notes.sevenDayFormationPlan).slice(0, 7)
  if (!days.length) return null
  const sermonDate = source.sermonDate || notes.sermonDate
  const start = parseDateKey(sermonDate)
  const target = parseDateKey(targetDate)
  const diff = start != null && target != null ? Math.floor((target - start) / 86400000) : 0
  const index = Math.max(0, Math.min(days.length - 1, Number.isFinite(diff) ? diff : 0))
  const day = days[index] || days[0]
  const paragraphs = [...values(day?.description), ...values(day?.paragraphs), ...values(day?.details)].map(clean).filter(Boolean)
  const steps = [...values(day?.steps), ...values(day?.actions), ...values(day?.items)]
    .map(value => clean(typeof value === 'string' ? value : value?.detail || value?.description || value?.text || value?.label))
    .filter(Boolean)
  return {
    ...day,
    index,
    dayNumber:index + 1,
    title:clean(day?.title) || `Day ${index + 1}`,
    scripture:clean(day?.scripture || day?.reference || day?.scriptureReference),
    devotionFocus:paragraphs.join('\n\n'),
    prayerFocus:values(day?.prayerFocus).map(clean).filter(Boolean).length ? values(day.prayerFocus).map(clean).filter(Boolean) : steps.slice(0, 3),
    discussionPrompts:values(day?.discussionPrompts).map(clean).filter(Boolean),
    obedienceAction:clean(day?.obedienceAction) || steps[0] || '',
    requiredOutput:clean(day?.requiredOutput) || steps[1] || clean(day?.weeklyAssignment),
    formationEmphasis:clean(day?.formationEmphasis),
    keyPrinciple:clean(day?.keyPrinciple) || paragraphs[0] || '',
    weeklyAssignment:clean(day?.weeklyAssignment),
  }
}

export function applySermonDevotionToSpiritual(spiritual = {}, devotion = null) {
  if (!devotion) return spiritual
  return {
    ...spiritual,
    scripture:devotion.scripture ? [devotion.scripture] : spiritual.scripture,
    devotionFocus:devotion.devotionFocus || spiritual.devotionFocus,
    prayerFocus:devotion.prayerFocus.length ? devotion.prayerFocus : spiritual.prayerFocus,
    discussionPrompts:devotion.discussionPrompts.length ? devotion.discussionPrompts : spiritual.discussionPrompts,
    obedienceAction:devotion.obedienceAction || spiritual.obedienceAction,
    requiredOutput:devotion.requiredOutput || spiritual.requiredOutput,
    todayFocus:devotion.title || spiritual.todayFocus,
    formationEmphasis:devotion.formationEmphasis || spiritual.formationEmphasis,
    keyPrinciple:devotion.keyPrinciple || spiritual.keyPrinciple,
    weeklyAssignment:devotion.weeklyAssignment || spiritual.weeklyAssignment,
  }
}

export function sermonArtifactIdFromActive({ notes = {}, source = {} } = {}) {
  const retainedId=clean(source.slideDeck?.id || source.document?.id)
  if(retainedId)return retainedId
  const sourceHash = clean(source.sourceHash).toLowerCase()
  const activeVersion = Number(source.activeVersion || source.version || 0)
  if (!/^[a-f0-9]{64}$/.test(sourceHash) || !Number.isInteger(activeVersion) || activeVersion < 1) return ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(clean(source.sermonDate || notes.sermonDate)) ? clean(source.sermonDate || notes.sermonDate) : 'undated'
  const title = clean(notes.documentTitle || notes.title || source.title || 'sermon').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'sermon'
  return `${date}-${title}-${sourceHash.slice(0, 12)}-v${activeVersion}`
}

export function sermonDevotionImageUrl({ notes = {}, source = {}, targetDate = '' } = {}) {
  const devotion = sermonDevotionForDate({ notes, source, targetDate })
  const id = sermonArtifactIdFromActive({ notes, source })
  return devotion && id ? `/.netlify/functions/sermon-slides?id=${encodeURIComponent(id)}&asset=devotion&index=${devotion.dayNumber}` : ''
}
