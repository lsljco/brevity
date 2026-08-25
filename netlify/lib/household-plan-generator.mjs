import { getStore } from '@netlify/blobs';
import { buildDailyDevotionPdf } from './devotion-document.mjs';
import { getOneDriveConnection, publishDailyDevotion } from './onedrive.mjs';
import { productionMealPlanRepository } from './meal-plan-store.mjs';

const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family';
const STORE_NAME = 'brevity-household';
const MODEL = process.env.BREVITY_AI_MODEL || 'gpt-5.6';

const planKey = date => `${HOUSEHOLD_ID}/daily-plans/${date}`;
const ACTIVE_SERMON_KEY = `${HOUSEHOLD_ID}/spiritual/active-sermon`;

function store() {
  return getStore({
    name: STORE_NAME,
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN,
  });
}

const timelineItem = {
  type: 'object',
  additionalProperties: false,
  properties: {
    time: { type: 'string' },
    title: { type: 'string' },
    owner: { type: 'string' },
    pillar: { type: 'string' },
  },
  required: ['time', 'title', 'owner', 'pillar'],
};

const planItem = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    owner: { type: 'string' },
    status: { type: 'string' },
    notes: { type: 'string' },
    date: { type: 'string' },
    startTime: { type: 'string' },
    endTime: { type: 'string' },
    priority: { type: 'string' },
    calendarSync: { type: 'boolean' },
    requiresDecision: { type: 'boolean' },
    notificationLevel: { type: 'string' },
  },
  required: ['title', 'owner', 'status', 'notes', 'date', 'startTime', 'endTime', 'priority', 'calendarSync', 'requiresDecision', 'notificationLevel'],
};

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    theme: { type: 'string' },
    dayObjective: { type: 'string' },
    governingPrinciple: { type: 'string' },
    successStandard: { type: 'string' },
    topPriorities: { type: 'array', items: planItem },
    morningAlignment: {
      type: 'object', additionalProperties: false,
      properties: {
        startTime: { type: 'string' },
        notes: { type: 'string' },
        agenda: { type: 'array', items: { type: 'string' } },
      },
      required: ['startTime', 'notes', 'agenda'],
    },
    dayparts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          window: { type: 'string' },
          objective: { type: 'string' },
          items: { type: 'array', items: timelineItem },
        },
        required: ['id', 'label', 'window', 'objective', 'items'],
      },
    },
    spiritual: {
      type: 'object', additionalProperties: false,
      properties: {
        scripture: { type: 'array', items: { type: 'string' } },
        devotionFocus: { type: 'string' },
        prayerFocus: { type: 'array', items: { type: 'string' } },
        discussionPrompts: { type: 'array', items: { type: 'string' } },
        obedienceAction: { type: 'string' },
        requiredOutput: { type: 'string' },
      },
      required: ['scripture', 'devotionFocus', 'prayerFocus', 'discussionPrompts', 'obedienceAction', 'requiredOutput'],
    },
    health: {
      type: 'object', additionalProperties: false,
      properties: {
        breakfast: { type: 'string' }, lunch: { type: 'string' }, dinner: { type: 'string' }, snacks: { type: 'string' }, hydration: { type: 'string' }, nextDayPrep: { type: 'string' },
        groceries: { type: 'array', items: { type: 'string' } },
        discussionPrompt: { type: 'string' },
      },
      required: ['breakfast', 'lunch', 'dinner', 'snacks', 'hydration', 'nextDayPrep', 'groceries', 'discussionPrompt'],
    },
    fitness: {
      type: 'object', additionalProperties: false,
      properties: {
        location: { type: 'string' }, workout: { type: 'string' }, objective: { type: 'string' }, departureTime: { type: 'string' }, returnTime: { type: 'string' }, recovery: { type: 'string' },
        participants: { type: 'array', items: { type: 'string' } },
        stepGoal: { type: 'number' }, requiresDecision: { type: 'boolean' }, discussionPrompt: { type: 'string' },
      },
      required: ['location', 'workout', 'objective', 'departureTime', 'returnTime', 'recovery', 'participants', 'stepGoal', 'requiresDecision', 'discussionPrompt'],
    },
    household: {
      type: 'object', additionalProperties: false,
      properties: {
        keyFocus: { type: 'string' },
        appointments: { type: 'array', items: planItem }, priorities: { type: 'array', items: planItem },
        errands: { type: 'array', items: { type: 'string' } }, openItems: { type: 'array', items: { type: 'string' } }, careerPriorities: { type: 'array', items: { type: 'string' } },
      },
      required: ['keyFocus', 'appointments', 'priorities', 'errands', 'openItems', 'careerPriorities'],
    },
    education: {
      type: 'object', additionalProperties: false,
      properties: {
        thinkTankTopic: { type: 'string' }, thinkTankDeliverable: { type: 'string' }, discussionPrompts: { type: 'array', items: { type: 'string' } },
        isaiah: {
          type: 'object', additionalProperties: false,
          properties: { owner: { type: 'string' }, readingMinutes: { type: 'number' }, sightWordsMinutes: { type: 'number' }, comprehensionMinutes: { type: 'number' }, mathMinutes: { type: 'number' }, notes: { type: 'string' } },
          required: ['owner', 'readingMinutes', 'sightWordsMinutes', 'comprehensionMinutes', 'mathMinutes', 'notes'],
        },
      },
      required: ['thinkTankTopic', 'thinkTankDeliverable', 'discussionPrompts', 'isaiah'],
    },
    finance: {
      type: 'object', additionalProperties: false,
      properties: {
        bills: { type: 'array', items: planItem }, purchases: { type: 'array', items: planItem }, transfers: { type: 'array', items: planItem }, accountsToFund: { type: 'array', items: planItem },
        incomePipeline: { type: 'array', items: { type: 'string' } }, decisionRule: { type: 'string' }, discussionPrompt: { type: 'string' }, requiredOutput: { type: 'string' },
      },
      required: ['bills', 'purchases', 'transfers', 'accountsToFund', 'incomePipeline', 'decisionRule', 'discussionPrompt', 'requiredOutput'],
    },
    ministry: {
      type: 'object', additionalProperties: false,
      properties: {
        meetings: { type: 'array', items: planItem }, contentFocus: { type: 'string' }, fellowshipFollowUps: { type: 'array', items: planItem }, prayerNeeds: { type: 'array', items: { type: 'string' } }, readinessChecklist: { type: 'array', items: { type: 'string' } }, framework: { type: 'string' },
      },
      required: ['meetings', 'contentFocus', 'fellowshipFollowUps', 'prayerNeeds', 'readinessChecklist', 'framework'],
    },
    decisions: { type: 'array', items: planItem },
    recap: {
      type: 'object', additionalProperties: false,
      properties: { closePrompts: { type: 'array', items: { type: 'string' } }, tomorrowPrep: { type: 'array', items: { type: 'string' } } },
      required: ['closePrompts', 'tomorrowPrep'],
    },
  },
  required: ['theme','dayObjective','governingPrinciple','successStandard','topPriorities','morningAlignment','dayparts','spiritual','health','fitness','household','education','finance','ministry','decisions','recap'],
};

const HOUSEHOLD_CONTEXT = `
Household operating rhythm:
- Lorenzo owns Spiritual Maturity and leads the spiritual content, scripture, devotion emphasis, prayer priorities and practical obedience for the household.
- Larry leads household command, finance, career/income priorities and overall operational coordination.
- Brevity's rolling meal plan is the source of truth for breakfast, lunch and dinner. Lunch and dinner are simple animal protein plus vegetables; breakfast excludes bacon, sausage, pancakes, waffles and heavy American breakfast platters.
- Health ownership covers snacks, hydration, groceries and next-day preparation; the three planned meals do not depend on manual communication.
- Lorenzo also shares ministry/fellowship responsibility and leadership participation.
- Isaiah is 8 and entering third grade; daily education should include oral reading, sight words/vocabulary, comprehension and math/homework with a supervising adult marked CONFIRM unless established.
- Devotion and prayer happen before food, gym, errands, shopping or outside activity.
- Preferred dayparts: ANCHOR 4:00–8:00 AM; FOCUS 8:00 AM–12:00 PM; FLEX 12:00–4:00 PM; WIND DOWN 4:00–8:00 PM+.
- Protect prime morning hours for income-producing career actions.
- Fitness target is generally 10,000–12,000 steps with location/participants/workout decided before departure.
- Wednesday Night Connect is 7:00–8:30 PM. Sunday service is 1:30 PM. Do not invent any other appointment.
- Unknown calendar-specific commitments must be labeled CONFIRM.
- Use concrete execution language, owners, decision states, deadlines and evidence of completion. Avoid generic motivational filler.
`;

function localDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' }).formatToParts(now);
  const get = type => parts.find(part => part.type === type)?.value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday') };
}

function outputText(response) {
  return (response.output || []).flatMap(item => item.content || []).map(part => part.text || '').join('').trim();
}

function itemWithId(item, prefix, index, date) {
  return { id: `${prefix}-${date}-${index}`, ...item };
}

function hydrateGeneratedPlan(generated, date, mealDay, activeSermon = null) {
  const now = new Date().toISOString();
  return {
    id: `daily-plan-${date}`,
    date,
    householdId: HOUSEHOLD_ID,
    theme: generated.theme,
    dayObjective: generated.dayObjective,
    governingPrinciple: generated.governingPrinciple,
    successStandard: generated.successStandard,
    topPriorities: generated.topPriorities.map((item, index) => itemWithId(item, 'top-priority', index, date)),
    morningAlignment: { ...generated.morningAlignment, completedAt: '' },
    dayparts: generated.dayparts,
    spiritual: { owner: 'Lorenzo', ...generated.spiritual, ...(activeSermon?{sermonNotes:activeSermon.sermonNotes,sermonSource:{...activeSermon.source,generatedAt:activeSermon.activatedAt,model:activeSermon.model,active:true}}:{}) },
    health: {
      owner: 'Terica',
      ...generated.health,
      breakfast: mealDay.resolvedMeals.breakfast.name,
      lunch: mealDay.resolvedMeals.lunch.name,
      dinner: mealDay.resolvedMeals.dinner.name,
      mealPlanSource: 'rolling',
      mealPlanVersion: mealDay.version,
    },
    fitness: { owner: 'Larry', ...generated.fitness },
    household: { owner: 'Larry', ...generated.household, appointments: generated.household.appointments.map((item, index) => itemWithId(item, 'appointment', index, date)), priorities: generated.household.priorities.map((item, index) => itemWithId(item, 'household-priority', index, date)) },
    education: { owner: 'Larry', ...generated.education },
    finance: { owner: 'Larry', ...generated.finance, bills: generated.finance.bills.map((item, index) => itemWithId(item, 'bill', index, date)), purchases: generated.finance.purchases.map((item, index) => itemWithId(item, 'purchase', index, date)), transfers: generated.finance.transfers.map((item, index) => itemWithId(item, 'transfer', index, date)), accountsToFund: generated.finance.accountsToFund.map((item, index) => itemWithId(item, 'fund', index, date)) },
    ministry: { owners: ['Larry','Lorenzo'], ...generated.ministry, meetings: generated.ministry.meetings.map((item, index) => itemWithId(item, 'ministry-meeting', index, date)), fellowshipFollowUps: generated.ministry.fellowshipFollowUps.map((item, index) => itemWithId(item, 'fellowship', index, date)) },
    assignments: [],
    decisions: generated.decisions.map((item, index) => itemWithId(item, 'decision', index, date)),
    recap: { wins: [], carryovers: [], lessons: [], completedAt: '', ...generated.recap },
    createdAt: now,
    updatedAt: now,
    generatedBy: 'brevity-daily-household-plan',
    version: 1,
  };
}

export async function generateAndSaveDailyPlan({ targetDate, targetWeekday, overwrite = false } = {}) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
  const local = localDateParts();
  const date = targetDate || local.date;
  const weekday = targetWeekday || new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' }).format(new Date(`${date}T12:00:00-04:00`));
  const dataStore = store();
  const existing = await dataStore.get(planKey(date), { type: 'json' }).catch(() => null);
  if (existing && !overwrite && existing.generatedBy === 'brevity-daily-household-plan') return { plan: existing, skipped: true, reason: 'already-generated' };

  const yesterday = new Date(`${date}T12:00:00-04:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
  const priorPlan = await dataStore.get(planKey(yesterdayKey), { type: 'json' }).catch(() => null);
  const activeSermon = await dataStore.get(ACTIVE_SERMON_KEY, { type: 'json' }).catch(() => null);
  const priorPlanContext = priorPlan ? { ...priorPlan, spiritual: { ...priorPlan.spiritual, sermonNotes: undefined } } : null;
  const mealRepository = await productionMealPlanRepository();
  const mealWindow = await mealRepository.getWindow({ startDate: date, count: 1 });
  const mealDay = mealWindow.days[0];
  const scheduledMeals = Object.fromEntries(Object.entries(mealDay.resolvedMeals).map(([mealType, meal]) => [mealType, meal.name]));

  const prompt = `Produce the household's Seven Pillars Household Command Schedule for ${weekday}, ${date}.\n\n${HOUSEHOLD_CONTEXT}\n\nBrevity's already-selected meals for this date are authoritative and must be copied exactly into the health fields:\n${JSON.stringify(scheduledMeals)}\n\nGenerate the same level of specificity as a premium daily household briefing: exact daily theme, a concise day objective, ANCHOR/FOCUS/FLEX/WIND DOWN timeline, all seven pillar sections, decision board, evening close, success standard and governing principle. Treat Brevity as the source of truth. Populate structured fields rather than writing a prose article.\n\nSpiritual Maturity owner is Lorenzo. Do not assign that pillar to Larry. ${activeSermon?'The ACTIVE SERMON SOURCE below governs Spiritual Maturity every day until it is replaced by a new successful transcript upload. Derive today’s scripture, devotion focus, prayer focus, discussion prompts, obedience action, and required output exclusively from that sermon. Create a fresh date-specific movement through the sermon rather than repeating yesterday verbatim; preserve the sermon’s doctrine and wording, advance its sequence or deepen its application, and never substitute a generic devotion or an unrelated passage.':'No active sermon transcript is stored. Keep Spiritual Maturity clearly marked for Lorenzo to confirm rather than inventing a sermon source.'} For appointments or commitments not established by standing cadence or supplied prior-plan data, use CONFIRM and do not invent specifics.\n\nACTIVE SERMON SOURCE, retained until replaced:\n${JSON.stringify(activeSermon||null)}\n\nYesterday's plan/recap context, if any:\n${JSON.stringify(priorPlanContext || {})}`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, store: false, input: prompt, text: { format: { type: 'json_schema', name: 'brevity_daily_household_plan', strict: true, schema } } }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || 'OpenAI daily-plan generation failed.');
  const generated = JSON.parse(outputText(payload));
  const plan = hydrateGeneratedPlan(generated, date, mealDay, activeSermon);
  if (await getOneDriveConnection()) {
    try {
      const pdf = await buildDailyDevotionPdf(plan);
      plan.spiritual.devotionDocument = await publishDailyDevotion({ pdf, baseName: `${date}-daily-devotion` });
    } catch (error) {
      console.error('[daily-household-plan devotion publishing]', error);
      plan.spiritual.devotionDocument = { state: 'error', error: error.message || 'OneDrive devotion publishing failed.' };
    }
  }
  await dataStore.setJSON(planKey(date), plan);
  return { plan, skipped: false };
}

export function currentNewYorkHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(now));
}
