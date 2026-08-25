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
  return `${prefix ? `${prefix} - ` : ''}${cleanTitle} Sermon Teaching Guide`
}

export function normalizeSermonSections(notes = {}) {
  const primary = values(notes.primaryScriptures || notes.scriptures)
    .map(item => typeof item === 'string' ? { reference:item, explanation:'' } : item)

  return [
    ['TEACHING OBJECTIVES', values(notes.teachingObjectives)],
    ['ANCHOR DECLARATION', values(notes.anchorDeclaration)],
    ['AIM', values(notes.aim)],
    ['THESIS', values(notes.thesis || notes.bigIdea)],
    ['OPENING EXHORTATION', values(notes.openingExhortation || notes.coreRevelation)],
    ['PRIMARY SCRIPTURES', primary.map(item => `${clean(item.reference)}${item.explanation ? ` — ${clean(item.explanation)}` : ''}`)],
    ['SUPPORTING BIBLICAL WITNESSES', values(notes.supportingBiblicalWitnesses).map(item => typeof item === 'string' ? item : `${clean(item.reference)}${item.explanation ? ` — ${clean(item.explanation)}` : ''}`)],
    ['GOVERNING QUESTION', values(notes.governingQuestion)],
    ['WORKING DEFINITIONS', values(notes.workingDefinitions)],
    ['HISTORICAL AND BIBLICAL CONTEXT', values(notes.historicalBiblicalContext)],
    ['DETAILED EXPOSITION', values(notes.detailedExposition)],
    ['KINGDOM PRINCIPLES', values(notes.kingdomPrinciples || notes.foundationalTruths)],
    ['ARCHITECTURAL FRAMEWORKS', values(notes.architecturalFrameworks)],
    ['MEMORABLE LINES', values(notes.memorableLines)],
    ['PRACTICAL APPLICATION', values(notes.practicalApplication || notes.whatThisProduces)],
    ['DIAGNOSTIC WORKSHEETS', values(notes.diagnosticWorksheets)],
    ['PASTORAL GUARDRAILS', values(notes.pastoralGuardrails)],
    ['REFLECTION QUESTIONS', values(notes.reflectionQuestions || notes.applicationQuestions)],
    ['SEVEN-DAY MEDITATION AND FORMATION PLAN', values(notes.sevenDayFormationPlan)],
    ['SMALL-GROUP TEACHING PLAN', values(notes.smallGroupTeachingPlan)],
    ['CONTRIBUTOR INSIGHTS', values(notes.contributorInsights)],
    ['WEEKLY CHARGE', values(notes.weeklyCharge || notes.call)],
    ['CONGREGATIONAL RESPONSE', values(notes.congregationalResponse)],
    ['PRAYER', values(notes.prayer)],
    ['CLOSING COMMISSION', values(notes.closingCommission)],
    ['PERSONAL CLOSING RESPONSE', values(notes.personalResponseQuestions)],
    ['SCRIPTURE INDEX', values(notes.scriptureIndex)],
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
