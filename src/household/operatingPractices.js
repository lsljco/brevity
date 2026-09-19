// Living agreements reuse the authoritative Schedule routine and Daily Plan.
// The readable routine marker links a policy to a real recurring commitment;
// no second task store, browser-only state, bank authorization, or moral score.
export const PRACTICE_ADULTS = ['Larry', 'Lorenzo', 'Terica', 'Nyla', 'Javin']
export const PRACTICE_STATUSES = ['unrecorded', 'complete', 'blocked', 'exception']
export const PRACTICE_MEALS = ['breakfast', 'lunch', 'dinner']
export const PRACTICE_TEMPLATES = [
  {
    id: 'FIN-001', title: 'Daily finance operations', pillar: 'Finance',
    purpose: 'Protect essential obligations and make shared spending intentional.',
    standard: 'Use the approved purpose, funded allowance, and designated account. Operating is not the fallback for unfunded discretionary spending.',
    steps: 'Review available transactions and upcoming obligations in Finance. Confirm funded spending before leaving home. Resolve or record exceptions; recategorizing a charge does not undo spending.',
    outcome: 'The financial review is recorded and unresolved spending questions have a recovery action.',
  },
  {
    id: 'OPS-001', title: 'Own tomorrow: schedule and coverage', pillar: 'Household Management',
    purpose: 'Protect paid work, income recovery, study, care, and shared responsibilities.',
    standard: 'Coordinate shared anchors and protect separate focus time. Every essential responsibility has an agreed owner and realistic time; nobody is the automatic backup.',
    steps: 'Pray and review tomorrow together or asynchronously. Check work, school, travel and rest. Assign coverage with consent, resolve conflicts, and protect individual focus blocks in Schedule.',
    outcome: 'Tomorrow has workable coverage, protected priorities, and a communicated plan.',
  },
  {
    id: 'MEAL-001', title: 'Meals: plan, prepare, communicate', pillar: 'Health & Nutrition',
    purpose: 'Make meals available on time and reduce avoidable dining and food waste.',
    standard: 'A meal has a ready-by time, headcount, preparation owner, backup, and a communication step. Cooking, shopping and cleanup may have different owners.',
    steps: 'Check usable inventory against the meal plan before shopping. Confirm procurement and preparation coverage. Publish what is available and where. Plan safe leftover use and assign cleanup.',
    outcome: 'People know what they can eat, when and where; unused portions have a next use.',
  },
]
const marker = /^\[Brevity practice (FIN-001|OPS-001|MEAL-001); version=(\d+); from=(\d{4}-\d{2}-\d{2}); review=(\d{4}-\d{2}-\d{2}); backup=([^\]]+)\]\s*/
const clone = value => JSON.parse(JSON.stringify(value))
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const text = (value, max = 1200) => {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Enter text of no more than ${max} characters.`)
  return value.replace(/[\u0000-\u001f]/g, ' ').trim()
}
const only = (value, fields, label) => {
  if (!object(value)) throw new Error(`${label} must be an object.`)
  if (Object.keys(value).some(key => !fields.includes(key))) throw new Error(`${label} contains an unsupported field.`)
}
export function validPracticeDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function shiftPracticeDate(date, days) {
  if (!validPracticeDate(date) || !Number.isInteger(days)) throw new Error('Choose a valid household date.')
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
export const validPracticeTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))
export function readPracticeRoutine(routine) {
  const match = String(routine?.notes || '').match(marker)
  if (!match) return null
  const [, policyId, revision, effectiveDate, reviewDate, backup] = match
  if (!validPracticeDate(effectiveDate) || !validPracticeDate(reviewDate) || reviewDate < effectiveDate || !PRACTICE_ADULTS.includes(backup) || !Number.isSafeInteger(Number(revision)) || Number(revision) < 1) return null
  return { policyId, revision: Number(revision), effectiveDate, reviewDate, backup, procedure: routine.notes.slice(match[0].length), routine }
}
export function practiceRoutineNotes({ policyId, revision = 1, effectiveDate, reviewDate, backup, procedure }) {
  if (!PRACTICE_TEMPLATES.some(item => item.id === policyId) || !Number.isSafeInteger(revision) || revision < 1) throw new Error('Choose a recognized practice and version.')
  if (!validPracticeDate(effectiveDate) || !validPracticeDate(reviewDate) || reviewDate < effectiveDate) throw new Error('Choose an effective date and a review date on or after it.')
  if (!PRACTICE_ADULTS.includes(backup)) throw new Error('Choose an agreed adult backup.')
  const instructions = text(procedure, 1300)
  if (!instructions) throw new Error('Write the practical steps and completion standard.')
  return `[Brevity practice ${policyId}; version=${revision}; from=${effectiveDate}; review=${reviewDate}; backup=${backup}] ${instructions}`
}
export function practiceAppliesOn(routine, date) {
  const practice = readPracticeRoutine(routine)
  if (!practice || !routine.enabled || !validPracticeDate(date) || date < practice.effectiveDate) return false
  return Array.isArray(routine.days) && routine.days.includes(new Date(`${date}T12:00:00Z`).getUTCDay())
}
export function practiceRoutineDateAllowed(routine, date) {
  if (!String(routine?.notes || '').startsWith('[Brevity practice ')) return true
  const practice = readPracticeRoutine(routine)
  return Boolean(practice && validPracticeDate(date) && date >= practice.effectiveDate)
}
export function emptyPracticeDay() { return { schemaVersion: 1, checkins: [], meals: {}, review: { notes: '', completed: false } } }

// Shared with the server allowlist. Unknown keys and invalid values are rejected,
// not silently coerced into success. The existing action audit owns actor/time.
export function validatePracticeDay(input) {
  only(input, ['schemaVersion', 'checkins', 'meals', 'review'], 'Practice record')
  if (input.schemaVersion !== 1) throw new Error('Unsupported practice record version.')
  if (!Array.isArray(input.checkins) || input.checkins.length > 30) throw new Error('Practice records require at most 30 check-ins.')
  const seen = new Set()
  const checkins = input.checkins.map(item => {
    only(item, ['routineId', 'policyId', 'revision', 'title', 'owner', 'backup', 'status', 'note', 'recovery'], 'Practice check-in')
    const routineId = text(item.routineId, 160)
    if (!routineId || seen.has(routineId)) throw new Error('Each routine can have only one check-in per date.')
    seen.add(routineId)
    if (!PRACTICE_TEMPLATES.some(template => template.id === item.policyId)) throw new Error('Unknown policy in check-in.')
    if (!Number.isSafeInteger(item.revision) || item.revision < 1) throw new Error('The policy version must be a positive integer.')
    if (!PRACTICE_ADULTS.includes(item.owner) || !PRACTICE_ADULTS.includes(item.backup)) throw new Error('A check-in requires its agreed adult owner and backup.')
    if (!PRACTICE_STATUSES.includes(item.status)) throw new Error('Choose a valid check-in status.')
    const note = text(item.note || '')
    const recovery = text(item.recovery || '', 600)
    if (['blocked', 'exception'].includes(item.status) && (!note || !recovery)) throw new Error('Record the obstacle or exception and a recovery action.')
    return { routineId, policyId: item.policyId, revision: item.revision, title: text(item.title, 200), owner: item.owner, backup: item.backup, status: item.status, note, recovery }
  })
  only(input.meals, PRACTICE_MEALS, 'Meal readiness')
  const meals = {}
  for (const [type, value] of Object.entries(input.meals)) {
    only(value, ['mealName', 'owner', 'backup', 'readyBy', 'headcount', 'inventoryChecked', 'ingredientsReady', 'preparation', 'location', 'communicated', 'portionsEaten', 'leftovers', 'fallback', 'notRequired', 'exception'], `${type} readiness`)
    const result = {}
    for (const field of ['mealName', 'owner', 'backup', 'readyBy', 'location', 'leftovers', 'fallback', 'exception']) result[field] = text(value[field] || '', ['leftovers', 'fallback', 'exception'].includes(field) ? 600 : 200)
    for (const field of ['inventoryChecked', 'ingredientsReady', 'communicated', 'notRequired']) {
      if (typeof value[field] !== 'boolean') throw new Error(`Meal ${field} must be true or false.`)
      result[field] = value[field]
    }
    for (const field of ['headcount', 'portionsEaten']) {
      if (value[field] !== null && (!Number.isInteger(value[field]) || value[field] < 0 || value[field] > 30)) throw new Error(`Meal ${field} must be unknown or a whole number from 0 to 30.`)
      result[field] = value[field]
    }
    for (const field of ['owner', 'backup']) if (result[field] && !PRACTICE_ADULTS.includes(result[field])) throw new Error('Choose an adult meal owner and backup.')
    if (result.readyBy && !validPracticeTime(result.readyBy)) throw new Error('Choose a valid meal ready-by time.')
    if (!['unrecorded', 'planned', 'preparing', 'ready'].includes(value.preparation)) throw new Error('Choose a valid preparation state.')
    result.preparation = value.preparation
    if (result.notRequired && !result.exception) throw new Error('Explain why this household meal is not needed.')
    if (!result.notRequired && result.preparation === 'ready' && (!result.mealName || !result.owner || !result.backup || !result.readyBy || !result.location || !result.ingredientsReady || !result.headcount)) throw new Error('A ready meal needs a meal, owner, backup, ready-by time, portions, ingredients, and serving/storage location.')
    if (result.communicated && (!result.location || (!result.notRequired && result.preparation !== 'ready'))) throw new Error('Mark a meal communicated only after it is available and its location is recorded.')
    meals[type] = result
  }
  only(input.review, ['notes', 'completed'], 'Weekly review')
  if (typeof input.review.completed !== 'boolean') throw new Error('Weekly review completion must be true or false.')
  const notes = text(input.review.notes || '', 2000)
  if (input.review.completed && !notes) throw new Error('Record what worked, what needs attention, and the agreed next steps.')
  return { schemaVersion: 1, checkins, meals, review: { notes, completed: input.review.completed } }
}
export function readPracticeDay(plan) {
  const input = plan?.household?.practiceDay
  if (input == null) return { data: emptyPracticeDay(), error: '' }
  try { return { data: validatePracticeDay(input), error: '' } }
  catch { return { data: emptyPracticeDay(), error: 'The saved practice record needs review. Refresh before changing it; existing data has not been removed.' } }
}
export function blankMealReadiness(mealName = '') {
  return { mealName, owner: '', backup: '', readyBy: '', headcount: null, inventoryChecked: false, ingredientsReady: false, preparation: 'unrecorded', location: '', communicated: false, portionsEaten: null, leftovers: '', fallback: '', notRequired: false, exception: '' }
}
export function mealReadiness(meal, saved) {
  if (saved?.notRequired) return { state: 'exception', label: 'Meal not required', gaps: [saved.exception], saved }
  if (!meal?.name) return { state: 'unknown', label: 'Meal plan unavailable', gaps: ['Choose or restore the planned meal.'], saved }
  if (saved?.mealName && saved.mealName !== meal.name) return { state: 'changed', label: 'Meal changed; review coverage', gaps: ['The saved preparation record belongs to a different meal.'], saved }
  const item = saved || blankMealReadiness(meal.name)
  const gaps = []
  if (!item.owner) gaps.push('Assign preparation owner')
  if (!item.backup) gaps.push('Agree on backup coverage')
  if (!item.readyBy) gaps.push('Set ready-by time')
  if (!item.headcount) gaps.push('Confirm portions/headcount')
  if (!item.inventoryChecked) gaps.push('Check usable inventory before buying')
  if (!item.ingredientsReady) gaps.push('Confirm ingredients/procurement')
  if (!item.fallback) gaps.push('Identify the fallback meal')
  if (gaps.length) return { state: 'needs-attention', label: 'Preparation gaps', gaps, saved: item }
  if (item.preparation !== 'ready') return { state: 'planned', label: item.preparation === 'preparing' ? 'Preparation reported in progress' : 'Covered, not yet prepared', gaps: ['Record availability when ready.'], saved: item }
  if (!item.communicated) return { state: 'needs-attention', label: 'Ready; communicate availability', gaps: ['Post what is ready and where. No external message has been sent.'], saved: item }
  return { state: 'ready', label: 'Available; posted in Brevity', gaps: [], saved: item }
}
export function dailyPracticeCards(schedule, plan) {
  const { data } = readPracticeDay(plan)
  return PRACTICE_TEMPLATES.map(template => {
    const matches = (schedule?.routines || []).map(readPracticeRoutine).filter(item => item?.policyId === template.id)
    const active = matches.filter(item => item.routine.enabled)
    if (active.length > 1) return { template, state: 'needs-attention', label: 'Duplicate active agreements; review Routines', matches }
    const practice = active[0] || matches[0]
    if (!practice) return { template, state: 'setup', label: 'Choose owner, timing, and backup', matches }
    if (!practice.routine.enabled) return { template, practice, state: 'paused', label: 'Practice is paused', matches }
    if (plan.date < practice.effectiveDate) return { template, practice, state: 'scheduled', label: `Starts ${practice.effectiveDate}`, matches }
    const override = schedule.routineOverrides?.[`${practice.routine.id}:${plan.date}`]
    const due = practiceAppliesOn(practice.routine, plan.date)
    if (override?.cancelled) return { template, practice, state: 'exception', label: 'Occurrence skipped through Schedule', due: false, matches }
    const checkin = data.checkins.find(item => item.routineId === practice.routine.id)
    // Keep the historical record visible but do not count an old policy version
    // as proof that a revised agreement has been carried out.
    const current = checkin?.revision === practice.revision ? checkin : null
    return { template, practice, due, matches, checkin, state: current?.status || (due ? 'unrecorded' : 'not-due'), label: current ? ({ complete: 'Completion reported', blocked: 'Blocked; needs support', exception: 'Exception recorded', unrecorded: 'Not yet recorded' }[current.status]) : due ? 'Not yet recorded — not a violation' : 'Not scheduled for this date', reviewDue: practice.reviewDate <= plan.date }
  })
}
export function practiceDayOperation(plan, next) {
  if (!validPracticeDate(plan?.date) || !Number.isInteger(Number(plan?.version ?? 0)) || Number(plan?.version ?? 0) < 0) throw new Error('Refresh the shared daily plan before reviewing this change.')
  const data = validatePracticeDay(next)
  return { type: 'plan.pillar.update', targetDate: plan.date, targetId: 'household', description: `Review household practice and meal-readiness records for ${plan.date}. This does not authorize spending or move money.`, payload: { pillar: 'household', patch: { practiceDay: data } } }
}
export function withPracticeCheckin(plan, practice, status, note = '', recovery = '') {
  const existing = readPracticeDay(plan)
  if (existing.error) throw new Error(existing.error)
  const data = clone(existing.data)
  const routine = practice.routine
  const item = { routineId: routine.id, policyId: practice.policyId, revision: practice.revision, title: routine.title, owner: routine.owner, backup: practice.backup, status, note, recovery }
  data.checkins = [...data.checkins.filter(value => value.routineId !== routine.id), item]
  return validatePracticeDay(data)
}
export function summarizePracticeWeek(results) {
  const summary = { complete: 0, blocked: 0, exception: 0, unrecorded: 0, unavailableDates: [], reviews: [], records: [] }
  for (const result of results) {
    if (result.error || !result.plan) { summary.unavailableDates.push(result.date); continue }
    const saved = readPracticeDay(result.plan)
    if (saved.error) { summary.unavailableDates.push(result.date); continue }
    for (const checkin of saved.data.checkins) {
      summary[checkin.status] += 1
      summary.records.push({ ...checkin, date: result.date })
    }
    if (!saved.data.checkins.length) summary.unrecorded += 1
    if (saved.data.review.completed) summary.reviews.push({ date: result.date, notes: saved.data.review.notes })
  }
  return summary
}
