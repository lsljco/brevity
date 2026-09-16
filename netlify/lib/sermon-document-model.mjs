const clean = value => String(value || '').trim()
const values = value => Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []

const guideDate = value => {
  const raw = clean(value)
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[2]}.${iso[3]}.${iso[1]}`
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime())
    ? raw
    : `${String(parsed.getMonth() + 1).padStart(2, '0')}.${String(parsed.getDate()).padStart(2, '0')}.${parsed.getFullYear()}`
}

export const sermonGuideBaseName = (title, date) => {
  const cleanTitle = clean(title).replace(/\s+(?:Sermon\s+)?Teaching\s+Guide$/i, '').trim() || 'Sermon'
  const prefix = guideDate(date)
  return `${prefix ? `${prefix} - ` : ''}${cleanTitle} Teaching Document`
}

const atAGlance = notes => {
  const glance = notes.messageAtAGlance || {}
  return [
    glance.focus && { label:'Focus', detail:glance.focus },
    glance.centralDiagnosis && { label:'Central diagnosis', detail:glance.centralDiagnosis },
    glance.centralCommand && { label:'Central command', detail:glance.centralCommand },
    glance.centralHope && { label:'Central hope', detail:glance.centralHope },
    glance.desiredResponse && { label:'Desired response', detail:glance.desiredResponse },
  ].filter(Boolean)
}

const foundationalScriptures = notes => [
  ...values(notes.primaryScriptures || notes.scriptures),
  ...values(notes.supportingBiblicalWitnesses),
].map(item => typeof item === 'string'
  ? { label:item, detail:'' }
  : { label:clean(item.reference), detail:clean(item.explanation) })

export function normalizeSermonSections(notes = {}) {
  const glance = atAGlance(notes)
  const scriptures = foundationalScriptures(notes)
  const responseItems = [...values(notes.contributorInsights), ...values(notes.congregationalResponse)]
  const closing = [notes.weeklyCharge, notes.closingCommission].filter(Boolean)

  return [
    ['MESSAGE AT A GLANCE', glance.length ? [{ title:'', items:glance }] : values(notes.thesis || notes.aim)],
    ['FOUNDATIONAL SCRIPTURES', scriptures.length ? [{ title:'', items:scriptures }] : []],
    ['PASTORAL ORIENTATION', values(notes.openingExhortation || notes.coreRevelation)],
    ['HISTORICAL AND BIBLICAL CONTEXT', values(notes.historicalBiblicalContext)],
    ['WORKING DEFINITIONS', values(notes.workingDefinitions)],
    ['DETAILED EXPOSITION', values(notes.detailedExposition)],
    ['ARCHITECTURAL FRAMEWORKS', values(notes.architecturalFrameworks)],
    ['KINGDOM PRINCIPLES', values(notes.kingdomPrinciples || notes.foundationalTruths)],
    ['A PRACTICAL SOUL-CULTIVATION RHYTHM', values(notes.practicalApplication || notes.whatThisProduces)],
    ['PASTORAL GUARDRAILS', values(notes.pastoralGuardrails)],
    ['REFLECTION AND DISCUSSION', values(notes.reflectionQuestions || notes.applicationQuestions)],
    ['CONGREGATIONAL RESPONSE', responseItems],
    ['PRAYER', values(notes.prayer)],
    ['SCRIPTURE INDEX', values(notes.scriptureIndex)],
    ['CLOSING CHARGE', closing],
  ].filter(([, items]) => items.length)
}

export function sermonItemParagraphs(item, includeItems = true) {
  if (typeof item === 'string') return [item]
  return [
    ...values(item?.description),
    ...values(item?.paragraphs),
    ...values(item?.details),
    ...values(item?.steps),
    ...values(item?.actions),
    ...(includeItems ? values(item?.items) : []),
    ...values(item?.explanation),
    ...values(item?.teachingEmphasis),
    ...values(item?.content),
  ]
    .map(value => typeof value === 'string' ? value : `${clean(value?.label || value?.stage)}${value?.detail ? ` — ${clean(value.detail)}` : ''}`)
    .filter(Boolean)
}
