export const PILLAR_ANALYSIS_GUARDRAIL_VERSION = 3

const PILLARS = new Set(['spiritual','health','fitness','household','education','finance','ministry'])
const PILLAR_LABELS = {
  spiritual:'Spiritual Maturity', health:'Health & Nutrition', fitness:'Physical Fitness',
  household:'Household Management', education:'Education', finance:'Finance', ministry:'Ministry & Fellowship',
}
const PILLAR_DATA_NEEDS = {
  spiritual:'a Scripture, devotion focus, or act of obedience',
  health:'today’s meals, hydration plan, or preparation need',
  fitness:'today’s workout, training objective, step goal, or recovery plan',
  household:'a dated commitment, open household item, project, or maintenance condition',
  education:'a learning topic, deliverable, practice target, or observed result',
  finance:'a posted transaction, scheduled transaction, account balance, or reconciliation result',
  ministry:'a meeting, message focus, follow-up, prayer need, or readiness item',
}
const PILLAR_DATA_ACTIONS = {
  spiritual:'Add today’s Scripture or activate a sermon-derived devotion before refreshing this analysis.',
  health:'Open Morning Alignment and record today’s meals or hydration plan, then refresh this analysis.',
  fitness:'Open Morning Alignment and record the workout or recovery plan, then refresh this analysis.',
  household:'Open Household Management and record the dated priority or condition that needs attention, then refresh this analysis.',
  education:'Open Morning Alignment and record today’s learning topic or deliverable, then refresh this analysis.',
  finance:'Refresh Finance and Plaid, or add the missing scheduled record, then refresh this analysis.',
  ministry:'Open Morning Alignment and record today’s ministry focus or commitment, then refresh this analysis.',
}
const PILLAR_PRINCIPLES = {
  spiritual:'Formation becomes visible when a named truth produces a named response.',
  health:'Use recorded choices and observed response—not assumptions—to improve the next health decision.',
  fitness:'Match the recorded training objective with an executable session and recovery response.',
  household:'Resolve the recorded constraint with the widest downstream effect first.',
  education:'Measure learning through a defined demonstration of understanding, not activity alone.',
  finance:'Keep posted activity, pending activity, and projections distinct before changing the plan.',
  ministry:'Let the recorded message or relationship need determine the next preparation step.',
}

const REQUIRED_TEXT = ['headline','executiveSummary','todayFocus','growthSignal','governingPrinciple']
const CORE_TEXT_LIMITS = {headline:240,executiveSummary:1600,todayFocus:800,growthSignal:800,governingPrinciple:600}
const ANALYSIS_POINT_LIMITS = {title:160,detail:1200}
const ACTIONABLE_INSIGHT_LIMITS = {title:160,whyItMatters:800,nextMove:800}
const EVIDENCE_LIMITS = {source:160,detail:1200}
const STRING_ARRAY_LIMIT = 600
const HOUSEHOLD_NAMES = '(?:Larry|Lorenzo|Terica|Nyla|Javin|Isaiah)'
const OWNERSHIP_PATTERNS = [
  /\bowns?\s+(?:this|the)\s+pillar\b/i,
  /\b(?:pillar\s+owner|owner\s+of\s+(?:this|the)\s+pillar)\b/i,
  new RegExp(`\\b${HOUSEHOLD_NAMES}\\b.{0,50}\\b(?:owner|owns|accountable|responsible|lead)\\b.{0,50}\\bpillar\\b`,'i'),
  new RegExp(`\\bpillar\\b.{0,50}\\b${HOUSEHOLD_NAMES}\\b.{0,50}\\b(?:owner|owns|accountable|responsible|lead)\\b`,'i'),
  new RegExp(`\\b(?:this|the)\\s+pillar\\b.{0,40}\\b(?:belongs to|is led by|is overseen by|is managed by)\\s+${HOUSEHOLD_NAMES}\\b`,'i'),
]
const SPIRITUAL_LEAKAGE_PATTERNS = [
  new RegExp(`\\b${HOUSEHOLD_NAMES}\\b.{0,60}\\b(?:must|should|needs? to|is responsible (?:for|to))\\b.{0,90}\\b(?:lead|guide|ensure|oversee|manage|supervise|make sure|hold)\\b.{0,90}\\b(?:household|family|everyone|others?|their)\\b.{0,70}\\b(?:devotion|prayer|scripture|spiritual|faith|formation|growth)\\b`,'i'),
  new RegExp(`\\b${HOUSEHOLD_NAMES}\\b.{0,60}\\b(?:must|should|needs? to|is responsible (?:for|to))\\b.{0,100}\\b(?:everyone|the household|the family|others?)['’]s\\s+(?:devotion|prayer|spiritual|faith|formation|growth)\\b`,'i'),
  new RegExp(`\\b${HOUSEHOLD_NAMES}\\b.{0,60}\\bis responsible for\\b.{0,80}\\b${HOUSEHOLD_NAMES}['’]s\\s+(?:devotion|prayer|spiritual|faith|formation|growth)\\b`,'i'),
]
const GENERIC_ONLY = /^(?:stay aligned|stay focused|focus on what matters(?: today)?|keep moving forward|take action|be intentional|continue to grow|execute the plan|make progress|do the work|review the data|verify the signal)[.!]?$/i
const GENERIC_ACTION = /\b(?:review|check|consider|look at|verify)\s+(?:the\s+|this\s+)?(?:data|information|situation|signal|records?|details?)\b|\buse\b.{0,80}\bto guide\b.{0,50}\b(?:decision|choice|next step)\b/i
const VAGUE_INSIGHT_LANGUAGE = /\bdeserves?\s+(?:careful|closer|special)?\s*attention\b|\b(?:may|might|could)\s+(?:affect|shape|influence)\s+what happens next\b|\bguide\s+(?:a|the)\s+(?:careful|prudent|informed|appropriate)?\s*(?:financial\s+)?(?:decision|choice)\b|\bkeep\s+(?:this|it|the\s+(?:signal|record|information))\s+in mind\b/i
const PROCESS_LANGUAGE = /\b(?:source-grounded safe analysis|authoritative household context|usable (?:finance|health|fitness|household|education|ministry|spiritual|pillar)?\s*signal|strongest available signal|interpretation stays within (?:those|the) records|verified financial signals guide|next prudent choice|available context supports (?:a|the) (?:cautious|careful|prudent) interpretation|based on the supplied records,? the available context|a second relevant record is|the supported analysis is|make the recorded plan executable)\b/i
const CLINICAL_AUTHORITY = '(?:Dr\\.?\\s+[A-Z][a-z]+|doctors?|physicians?|clinicians?|nutritionists?|dietitians?|pediatricians?|therapists?|medical providers?|family physicians?)'
const CLINICAL_ACTION = '(?:approv(?:e|ed|es|ing)?|recommend(?:ed|s|ing)?|prescrib(?:e|ed|es|ing)?|diagnos(?:e|ed|es|ing)?|treat(?:ed|s|ing)?|cur(?:e|ed|es|ing)?|prevent(?:ed|s|ing)?|stabiliz(?:e|ed|es|ing)?|lower(?:ed|s|ing)?|rais(?:e|ed|es|ing)?|heal(?:ed|s|ing)?|reliev(?:e|ed|es|ing)?|safe)'
const MEDICAL_CONDITION = '(?:diabetes|prediabetes|hypertension|high blood pressure|blood sugar|blood glucose|glucose|heart rate|celiac|allerg(?:y|ies|ic)|asthma|back pain|knee pain|pain|injury|disease|disorder|diagnosis|medical condition)'
const MEDICAL_CLAIM_PATTERNS = [
  new RegExp(`\\b${CLINICAL_AUTHORITY}\\b.{0,100}\\b${CLINICAL_ACTION}\\b`,'i'),
  new RegExp(`\\b${CLINICAL_ACTION}\\b.{0,100}\\b${CLINICAL_AUTHORITY}\\b`,'i'),
  new RegExp(`\\b${CLINICAL_ACTION}\\b.{0,100}\\b${MEDICAL_CONDITION}\\b`,'i'),
  new RegExp(`\\b${MEDICAL_CONDITION}\\b.{0,100}\\b${CLINICAL_ACTION}\\b`,'i'),
]
const ACTION_VERBS = /\b(?:name|notice|compare|choose|adjust|protect|pause|review|clarify|observe|discuss|ask|answer|identify|practice|test|track|verify|validate|reconcile|prepare|simplify|connect|reflect|respond|decide|resolve|measure|preserve|prioritize|replace|reduce|increase|confirm|write|read|listen|set|use|check|open|record|select|restore|schedule|call|allocate|complete|inspect|refresh|add|explain|apply|demonstrate)\b/i
const TASK_LIST_LANGUAGE = /\bfirst\b.*\bsecond\b.*\bthird\b|(?:^|\s)\d[.)].*(?:\s)\d[.)].*(?:\s)\d[.)]/i
const SUBSTANTIVE_INTERPRETATION = /\b(?:affect|alter|advance|avoid|block|change|collid|constrain|delay|depend|determin|differ|distinguish|enable|exceed|execut|expos|improv|increas|leav|limit|los(?:e|es|ing)|prevent|protect|prov(?:e|ed|en|ing)|reconcil|reduc|remain(?:s|ed|ing)?\s+(?:only|an?\s+idea)|remov|requir|resolv|reveal|risk)\w*\b|\b(?:accuracy|behavior|cannot|capacity|cash flow|classification|condition|consequence|constraint|decision friction|dependency|distinct|effect|evidence|execution|final|funding|gross activity|liquidity|margin|missing|net cash|outcome|period summary|proof|readiness|realized cash|reconciliation|recovery|response|result|settled cash|timing|tradeoff|unknown|unresolved|variance|without)\b|\b(?:because|otherwise|so that|which means|rather than|instead of)\b/i
const EXCLUDED_EVIDENCE_KEYS = /(?:^|\.)(?:id|uid|hash|etag|version|owner|owners|responsible|accountable|supervisor|createdBy|updatedBy|recordedBy|member|participants|attendance|sourceId|actionId|lastActionId)$/i
const GOVERNANCE_EVIDENCE_KEYS = /(?:owner|ownership|responsib|accountab|supervis|assigned(?:to|by)?)/i
const FRESHNESS_KEYS = /(?:At|Timestamp|synced|refreshed|updated|created)$/i
const HIGH_VALUE_KEYS = /(?:todayFocus|devotionFocus|scripture|sermon|theme|objective|focus|goal|principle|meal|hydration|energy|training|workout|recovery|status|priority|amount|balance|variance|cash|income|expense|transaction|lesson|subject|message|notes?|title)$/i
const LOW_SPECIFICITY_ANCHOR = /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}(?:\s*[ap]m)?|[-+]?\d+(?:[.,]\d+)?|actual|active|blocked|complete|completed|open|pending|planned|posted|projected|recorded|scheduled|unresolved)$/i

const clean = (value, max = 700) => String(value ?? '').replace(/\s+/g,' ').trim().slice(0,max)
const normalized = value => clean(value,2000).toLowerCase().replace(/[^a-z0-9$]+/g,' ').trim()
const normalizedFull = value => String(value??'').replace(/\s+/g,' ').trim().toLowerCase().replace(/[^a-z0-9$]+/g,' ').trim()
const titleCase = value => clean(value).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase())
const scalar = value => ['string','number','boolean'].includes(typeof value) && clean(value) !== ''
const list = value => Array.isArray(value) ? value : []
const finite = value => value !== null && value !== '' && Number.isFinite(Number(value))
const populatedObject = value => value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).some(item=>item!==undefined&&item!==null&&item!=='')
const finiteFields = (value, fields) => value && typeof value === 'object' && fields.every(field => finite(value[field]))
const missingFiniteFields = (value, fields) => fields.filter(field => !finite(value?.[field]))
const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(value)||0)
const itemTitle = item => clean(typeof item==='string' ? item : item?.title || item?.name || item?.label || item?.description || item?.detail)
const itemAmount = item => finite(item?.amount) ? money(Math.abs(Number(item.amount))) : ''
const itemDescription = item => [...new Set([
  itemTitle(item),
  itemAmount(item),
  clean(item?.date || item?.occurrenceDate || item?.start || item?.due || item?.dueDate || item?.dueAt),
  [clean(item?.startTime || item?.time),clean(item?.endTime)].filter(Boolean).join('–'),
  clean(item?.status || item?.state),
].filter(Boolean))].join(' · ')
const isOpenRecord = item => !/^(?:done|complete|completed|closed|approved|cancelled|canceled|deferred|void|voided)$/i.test(clean(item?.status || item?.state))
const validSourceDate = value => { const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value));if(!match)return false;const parsed=new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`);return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===`${match[1]}-${match[2]}-${match[3]}` }
const earliestSourceDate=(...values)=>values.map(value=>clean(value)).filter(validSourceDate).sort()[0] || clean(values.find(Boolean))
const safeSourceText = (value,{spiritual=false}={}) => {
  const text=clean(value)
  if(!text||PROCESS_LANGUAGE.test(text)||OWNERSHIP_PATTERNS.some(pattern=>pattern.test(text))||TASK_LIST_LANGUAGE.test(text))return ''
  if(spiritual&&SPIRITUAL_LEAKAGE_PATTERNS.some(pattern=>pattern.test(text)))return ''
  return text
}
const appleCalendarCoverage = context => context?.appleCalendarCoverage || context?.calendar?.appleCalendarCoverage || null
const isAppleCalendarItem = item => /(?:apple|icloud)/i.test([item?.source,item?.calendarName].filter(Boolean).join(' '))
const appleCalendarIsCurrent = context => {
  const coverage=appleCalendarCoverage(context)
  return !coverage || (coverage.usable!==false&&!coverage.stale)
}
const scheduledPillarItem = context => [...list(context?.scheduleItems),...list(context?.calendarEvents)]
  .find(item=>itemTitle(item)&&isOpenRecord(item)&&(!isAppleCalendarItem(item)||appleCalendarIsCurrent(context)))

function calendarCoverageFact(context,pillar,date) {
  const coverage=appleCalendarCoverage(context)
  if(!coverage?.stale||(!coverage.error&&!coverage.lastSuccessfulSyncAt&&coverage.state==='loading'))return null
  const label=PILLAR_LABELS[pillar]||titleCase(pillar)
  const last=clean(coverage.lastSuccessfulSyncAt)
  const state=clean(coverage.state || 'stale')
  const status=last?`Last verified ${last}`:'No current verified snapshot'
  const message=clean(coverage.message || coverage.error || 'The Apple Family Calendar snapshot is stale.')
  return makeFact({id:'calendar-coverage-gap',source:'Apple Family Calendar coverage',label:'Apple Family Calendar needs refresh',value:status,priority:7,kind:'data-gap',headline:`${label} calendar coverage needs a refresh`,detail:`Apple Family Calendar coverage is ${state} for ${date || 'today'}. ${message}`,implication:`Cached Apple events are excluded from ${label} analysis until calendar coverage is current; Brevity schedule records remain usable.`,nextMove:'Open Family Calendar and refresh Apple events before relying on them for today’s commitments.',whyItMatters:'An old calendar event can create a false upcoming commitment after it was changed or canceled.',watchFor:'A cached Apple event being treated as a current commitment.',growth:'The next reliable schedule signal is a successful Apple Family Calendar refresh.',anchors:['Apple Family Calendar',status,last,state]})
}

function makeFact({id,source='Daily pillar plan',label,value,detail,priority=50,kind='recorded',headline,implication,nextMove,whyItMatters,watchFor,growth,anchors=[]}) {
  const safeValue=clean(value || detail,240)
  const safeDetail=clean(detail || `${label}: ${safeValue}`,500)
  const usableAnchor=value=>{const text=clean(value,240);return text.length>=2&&!LOW_SPECIFICITY_ANCHOR.test(text)}
  const identityAnchors=[label,...anchors].map(value=>clean(value,240)).filter(value=>(
    usableAnchor(value)
    && !/\$|\b\d+(?:[.,]\d+)?\b/.test(value)
  ))
  return {
    id,source,label:clean(label),value:safeValue,detail:safeDetail,priority,kind,
    headline:clean(headline || `${label}: ${safeValue}`,180),
    implication:clean(implication || `The recorded “${safeValue}” is specific enough to guide today’s next move, but it is not evidence of a completed outcome.`,500),
    nextMove:clean(nextMove || `Review “${safeValue}” and record the result before changing the plan.`,500),
    whyItMatters:clean(whyItMatters || 'Resolving this named condition gives the household a concrete basis for the next decision.',500),
    watchFor:clean(watchFor || `A change to “${safeValue}” that is not reflected in Brevity.`,300),
    growth:clean(growth || `Progress will show when “${safeValue}” has a recorded outcome rather than an assumed one.`,400),
    anchors:[...new Set([safeValue,...anchors].filter(usableAnchor).map(value=>clean(value,240)))],
    identityAnchors:[...new Set(identityAnchors)],
  }
}

function recordFact({id,source,label,item,priority,kind,nextMove,implication,whyItMatters,watchFor,growth}) {
  if(!itemTitle(item))return null
  const value=itemDescription(item)
  if(!value)return null
  return makeFact({id,source,label,value,priority,kind,nextMove,implication,whyItMatters,watchFor,growth,anchors:[itemTitle(item),itemAmount(item),clean(item?.date),clean(item?.startTime || item?.time),clean(item?.status || item?.state)]})
}

function sourceGapFact({id,label,value,date,missing,nextMove}) {
  const fields=missing.map(titleCase).join(', ')
  const target=clean(value || label)
  return makeFact({
    id,source:'Source coverage',label,value:`${target} · missing ${fields}`,priority:0,kind:'data-gap',
    headline:`${label}: ${fields} ${missing.length===1?'is':'are'} missing`,
    detail:`${target} cannot be interpreted for ${date || 'today'} because ${fields} ${missing.length===1?'is':'are'} not recorded.`,
    implication:'The incomplete source shape cannot support a zero value, posted status, or completed result.',
    nextMove,
    whyItMatters:'Naming the missing fields prevents an absent value from being silently converted into a financial or operational claim.',
    watchFor:`Treating missing ${fields.toLowerCase()} as zero or complete.`,
    growth:`The next reliable signal is ${target} with ${fields.toLowerCase()} recorded.`,
    anchors:[target,...missing.map(titleCase)],
  })
}

function spiritualFacts(data,date,context={}) {
  const facts=[]
  const scripture=list(data.scripture).map(value=>clean(value)).filter(Boolean).join(', ') || clean(data.scriptureFocus)
  const focus=clean(data.todayFocus || data.devotionTitle || data.devotionFocus)
  const devotionText=safeSourceText(data.devotionFocus,{spiritual:true})
  const obedience=safeSourceText(data.obedienceAction || data.requiredOutput,{spiritual:true})
  const hasDailyFormationSource=Boolean(scripture||focus||obedience)
  if(focus)facts.push(makeFact({id:'plan-devotion-focus',label:'Today’s devotion focus',value:focus,priority:1,kind:'projected',
    headline:focus,
    detail:devotionText&&normalized(devotionText)!==normalized(focus)?devotionText:`Today’s formation centers on “${focus}.”`,
    implication:scripture?`The plan pairs “${focus}” with ${scripture}, so today’s formation should move from reading the passage to naming a personal response.`:`“${focus}” gives today’s formation a clear subject, but its value still depends on a personal response.`,
    nextMove:obedience||`Write one concrete response to “${focus}” and complete it today.`,whyItMatters:'A named response keeps the devotion from remaining only an idea.',watchFor:`Discussing “${focus}” without naming a personal response.`,growth:`Progress will show when each person can connect “${focus}” to a specific lived response.`,anchors:[focus,scripture]}))
  if(scripture)facts.push(makeFact({id:'plan-scripture',label:'Today’s Scripture',value:scripture,priority:2,kind:'projected',headline:`${scripture} anchors today’s formation`,detail:`${scripture} is the Scripture selected for today’s formation.`,implication:`Read ${scripture} before drawing meaning from the theme, then identify the phrase that most directly shapes a personal response.`,nextMove:`Read ${scripture}, name the phrase that confronts or encourages you, and record one response.`,whyItMatters:'Using the cited passage prevents a generic theme from replacing the recorded source for today’s reflection.',anchors:[scripture]}))
  if(obedience)facts.push(makeFact({id:'plan-obedience',label:'Recorded act of obedience',value:obedience,priority:3,kind:'projected',implication:`“${obedience}” is the plan’s explicit test of whether today’s reflection becomes lived response.`,nextMove:`Complete the recorded response—“${obedience}”—and note what changed when it was practiced.`,whyItMatters:'This is the plan’s explicit bridge from reflection to behavior.',growth:`Progress will show when “${obedience}” is completed and reflected on honestly.`,anchors:[obedience]}))
  const emphasis=clean(data.formationEmphasis || data.keyPrinciple)
  if(emphasis)facts.push(makeFact({id:'plan-formation-emphasis',label:'Formation emphasis',value:emphasis,priority:4,kind:'projected',implication:`“${emphasis}” names the lens for connecting today’s Scripture to a personal response.`,nextMove:`Use “${emphasis}” to write one sentence describing the response today’s Scripture calls for.`,whyItMatters:'A named formation lens keeps reflection tied to the source teaching.',anchors:[emphasis]}))
  const weekly=clean(data.weeklyAssignment)
  if(weekly)facts.push(makeFact({id:'plan-weekly-assignment',label:'Weekly formation assignment',value:weekly,priority:5,kind:'projected',implication:`“${weekly}” is the longer formation practice that today’s response should advance.`,nextMove:`Complete the next observable part of “${weekly}” and record what remains.`,whyItMatters:'Connecting today’s response to the weekly assignment prevents the devotion from becoming isolated activity.',anchors:[weekly]}))
  const prayer=clean(list(data.prayerFocus)[0])
  if(prayer)facts.push(makeFact({id:'plan-prayer-focus',label:'Prayer focus',value:prayer,priority:6,kind:'projected',implication:`“${prayer}” identifies the need today’s prayer is meant to address rather than leaving prayer general.`,nextMove:`Pray specifically about “${prayer},” then record any response or follow-up it brings into view.`,whyItMatters:'Specific prayer keeps the day’s spiritual response connected to a named need.',anchors:[prayer]}))
  if(!hasDailyFormationSource){
    const sermonTitle=clean(data.sermonNotes?.documentTitle || data.sermonNotes?.title || data.sermonSource?.title)
    if(sermonTitle)facts.push(makeFact({id:'sermon-daily-gap',source:'Active sermon record',label:'Daily formation missing from active sermon',value:sermonTitle,priority:0,kind:'data-gap',headline:`${sermonTitle} has no dated devotion for today`,detail:`“${sermonTitle}” is active, but no Scripture, devotion focus, or response is assigned to today.`,implication:'The source sermon is available, but today’s formation step cannot be interpreted until a dated devotion is selected.',nextMove:`Open “${sermonTitle}” in the Sermon Repository and select or add today’s formation step.`,whyItMatters:'An active sermon and a dated personal response are different records; the second is currently missing.',anchors:[sermonTitle]}))
    else facts.push(makeFact({id:'plan-spiritual-source-gap',source:'Daily pillar plan',label:'Missing daily formation source',value:`Scripture, devotion focus, and personal response for ${date || 'today'}`,priority:0,kind:'data-gap',headline:`Spiritual Maturity data needed for ${date || 'today'}`,detail:`No Scripture, devotion focus, or personal response is recorded for ${date || 'today'}.`,implication:'A calendar commitment can reserve time for formation, but it cannot supply the truth or response that should be interpreted.',nextMove:'Open Morning Alignment and add today’s Scripture or devotion focus plus one personal response.',whyItMatters:'A named formation source is required before Brevity can offer a grounded spiritual interpretation.',watchFor:'Treating a scheduled devotion time as proof that a Scripture or response was selected.',growth:'The next useful signal is a dated Scripture or devotion focus connected to a personal response.',anchors:['Scripture','devotion focus','personal response']}))
  }
  const commitment=scheduledPillarItem(context)
  if(commitment)facts.push(recordFact({id:'context-spiritual-commitment',source:'Household schedule',label:`Spiritual commitment for ${date || 'today'}`,item:commitment,priority:3,kind:'projected',implication:`“${itemTitle(commitment)}” is a dated spiritual commitment; it creates a preparation window but does not prove that reflection or response occurred.`,nextMove:`Before “${itemTitle(commitment)},” open the recorded Scripture or devotion focus and name the personal response it calls for.`,whyItMatters:'A named calendar commitment is useful when it is connected to the actual formation source and response.'}))
  const coverageFact=calendarCoverageFact(context,'spiritual',date)
  if(coverageFact)facts.push(coverageFact)
  return facts
}

function healthFacts(data,date,context={}) {
  const facts=[]
  const meals=['breakfast','lunch','dinner']
  const missing=meals.filter(key=>!clean(data[key]))
  const planned=meals.filter(key=>clean(data[key])).map(key=>`${titleCase(key)} — ${clean(data[key])}`)
  const preparation=safeSourceText(data.nextDayPrep)
  if(missing.length)facts.push(makeFact({id:'plan-meal-gap',label:'Unresolved meal plan',value:missing.map(titleCase).join(' and '),priority:0,kind:'data-gap',headline:`Health & Nutrition data needed: ${missing.map(titleCase).join(' and ')} ${missing.length===1?'is':'are'} not recorded`,detail:`The ${missing.join(' and ')} field${missing.length===1?' is':'s are'} empty in today’s Health & Nutrition plan.${planned.length?` Recorded choices: ${planned.join('; ')}.`:''}`,implication:'An unresolved meal creates a predictable execution gap when the day becomes busy.',nextMove:`Record ${missing.join(' and ')} in the Meal Plan or Morning Alignment before the next meal window.`,whyItMatters:'A named meal can be prepared; an empty field leaves the decision to the busiest moment.',watchFor:'A meal being improvised because the recorded plan remained incomplete.',growth:'Progress will show when all three meal windows have an executable recorded choice.',anchors:[...missing.map(titleCase),...planned.map(value=>value.split(' — ')[1]),date]}))
  if(planned.length)facts.push(makeFact({id:'plan-meals',label:'Recorded meal plan',value:planned.join('; '),priority:missing.length?4:3,kind:'projected',implication:`${planned.length} of 3 meal windows have a named choice; this supports preparation but does not prove the meals were eaten.`,nextMove:preparation?`Complete the recorded preparation step—“${preparation}”—before the next meal window.`:`Check that the ingredients for ${planned.map(value=>value.split(' — ')[1]).join(', ')} are available before the first preparation window.`,whyItMatters:'The useful leverage point is whether the recorded meals can actually be executed.',watchFor:'Treating a planned meal as completed nutrition without a check-in.',growth:'Progress will show when planned meals are prepared consistently and energy response can be observed.',anchors:planned.map(value=>value.split(' — ')[1])}))
  if(clean(data.hydration))facts.push(makeFact({id:'plan-hydration',label:'Hydration plan',value:clean(data.hydration),priority:2,kind:'projected',implication:`“${clean(data.hydration)}” is the only health input designed to be repeated across the day, making it the clearest condition to observe against energy or thirst.`,nextMove:`Use the recorded hydration plan—“${clean(data.hydration)}”—and note whether energy or thirst changes by midday.`,whyItMatters:'Hydration is the only recorded health input that can be observed repeatedly across the day.',watchFor:'Reaching midday without following the recorded hydration cue.',growth:'Progress will show through consistent execution and a clearer record of its effect on energy.',anchors:[data.hydration]}))
  if(preparation)facts.push(makeFact({id:'plan-preparation',label:'Preparation need',value:preparation,priority:3,kind:'projected',implication:`“${preparation}” is the recorded step that removes tomorrow’s earliest meal-plan dependency.`,nextMove:`Complete the recorded preparation step—“${preparation}”—before the kitchen closes.`,whyItMatters:'Completing the named preparation step removes friction from the next meal decision.',anchors:[preparation]}))
  const snack=clean(data.snacks)
  if(snack)facts.push(makeFact({id:'plan-snack',label:'Planned snack',value:snack,priority:5,kind:'projected',implication:`“${snack}” gives the plan a named option between meals instead of leaving that choice unresolved.`,nextMove:`Confirm “${snack}” is available before the first between-meal window.`,whyItMatters:'Availability determines whether the recorded snack can replace an improvised choice.',anchors:[snack]}))
  const grocery=clean(list(data.groceries)[0])
  if(grocery)facts.push(makeFact({id:'plan-grocery',label:'Recorded grocery need',value:grocery,priority:4,kind:'unresolved',implication:`“${grocery}” is a named supply dependency for the current meal plan.`,nextMove:`Confirm whether “${grocery}” is on hand; if not, add it to the next purchase list.`,whyItMatters:'A missing named ingredient can make an otherwise complete meal plan unusable.',anchors:[grocery]}))
  const discussion=clean(data.discussionPrompt)
  if(discussion)facts.push(makeFact({id:'plan-health-question',label:'Open health question',value:discussion,priority:6,kind:'unresolved',implication:`“${discussion}” identifies the health response the household still needs to observe or discuss.`,nextMove:`Answer “${discussion}” using today’s recorded meal, hydration, or energy observation.`,whyItMatters:'The answer can change the next meal or preparation choice without inventing a medical conclusion.',anchors:[discussion]}))
  const detailedMeals=list(data.mealDetails).filter(meal=>itemTitle(meal)&&finite(meal?.prepMinutes))
  if(detailedMeals.length){
    const totalPrep=detailedMeals.reduce((total,meal)=>total+Number(meal.prepMinutes||0),0)
    const longest=[...detailedMeals].sort((left,right)=>Number(right.prepMinutes||0)-Number(left.prepMinutes||0)||itemTitle(left).localeCompare(itemTitle(right)))[0]
    facts.push(makeFact({id:'rolling-meal-prep',source:'Rolling meal plan',label:'Planned meal preparation load',value:`${totalPrep} total minutes · ${itemTitle(longest)} needs ${Number(longest.prepMinutes)} minutes`,priority:1,kind:'projected',headline:`${itemTitle(longest)} is today’s longest meal-prep block at ${Number(longest.prepMinutes)} minutes`,detail:`The rolling meal plan contains ${detailedMeals.length} meals totaling ${totalPrep} planned preparation minutes; ${itemTitle(longest)} is longest at ${Number(longest.prepMinutes)} minutes.`,implication:`The ${Number(longest.prepMinutes)}-minute ${itemTitle(longest)} block is the meal-plan timing constraint most likely to collide with the household schedule.`,nextMove:`Reserve ${Number(longest.prepMinutes)} minutes for ${itemTitle(longest)} before its meal window and confirm the ingredients are available.`,whyItMatters:'Protecting the longest named preparation block makes the rest of the recorded menu more executable.',watchFor:`Starting ${itemTitle(longest)} too late for its ${Number(longest.prepMinutes)}-minute preparation window.`,growth:'Progress will show when the longest planned meal can be prepared without displacing the next household commitment.',anchors:[itemTitle(longest),String(totalPrep),String(longest.prepMinutes)]}))
  }
  const commitment=scheduledPillarItem(context)
  if(commitment)facts.push(recordFact({id:'context-health-commitment',source:'Household schedule',label:`Health commitment for ${date || 'today'}`,item:commitment,priority:3,kind:'projected',implication:`“${itemTitle(commitment)}” is a dated Health & Nutrition commitment whose timing can change when meals or preparation need to occur.`,nextMove:`Confirm the time and preparation needed for “${itemTitle(commitment)}” before the preceding meal window.`,whyItMatters:'A named health commitment can materially change whether the recorded meal and hydration plan is executable.'}))
  const coverageFact=calendarCoverageFact(context,'health',date)
  if(coverageFact)facts.push(coverageFact)
  return facts
}

function fitnessFacts(data,date,context={}) {
  const facts=[]
  const workout=clean(data.workout)
  const recovery=clean(data.recovery)
  const hasTrainingIntent=Boolean(workout || recovery)
  if(!workout&&!recovery)facts.push(makeFact({id:'plan-workout-gap',label:'Missing workout',value:date || 'today',priority:0,kind:'data-gap',headline:`Physical Fitness data needed: no workout is recorded for ${date || 'today'}`,detail:`The Physical Fitness plan has no workout or intentional recovery recorded for ${date || 'today'}.`,implication:'Without a named session or recovery plan, Brevity cannot distinguish intentional recovery from an unplanned miss.',nextMove:'Record either the planned workout or an intentional recovery day in Morning Alignment.',whyItMatters:'A named training intent makes later consistency and recovery analysis possible.',watchFor:'Calling the day complete without recording whether it was training or recovery.',growth:'Progress will show when each day has a clear training or recovery intent and an observed result.',anchors:[date,'workout','recovery']}))
  else if(workout)facts.push(makeFact({id:'plan-workout',label:'Planned workout',value:workout,priority:1,kind:'projected',headline:`${workout} is today’s recorded training session`,implication:clean(data.objective)?`The session is intended to support “${clean(data.objective)}”; execution should be judged against that objective, not activity alone.`:'The workout is named, but the plan does not yet state the outcome it is meant to produce.',nextMove:recovery?`Complete “${workout}” at an effort that still permits the recorded recovery step: ${recovery}.`:`Before “${workout},” record current energy or soreness and choose an intensity that can be repeated.`,whyItMatters:'Connecting the exact session to readiness protects consistency without assuming how the body feels.',watchFor:`Completing “${workout}” while ignoring a recovery signal that would affect the next session.`,growth:`Progress will show when “${workout}” is completed at a repeatable intensity and recovery is recorded.`,anchors:[workout,data.objective,recovery]}))
  if(clean(data.objective))facts.push(makeFact({id:'plan-fitness-objective',label:'Training objective',value:clean(data.objective),priority:2,kind:'projected',implication:`“${clean(data.objective)}” is the standard the workout should advance; movement alone does not establish that result.`,nextMove:`After the session, record whether “${clean(data.objective)}” was advanced and what evidence supports that conclusion.`,anchors:[data.objective]}))
  if(finite(data.stepGoal)&&Number(data.stepGoal)>0)facts.push(makeFact({id:'plan-step-goal',label:'Step goal',value:`${Number(data.stepGoal).toLocaleString('en-US')} steps`,priority:3,kind:hasTrainingIntent?'projected':'data-gap',implication:hasTrainingIntent?`The ${Number(data.stepGoal).toLocaleString('en-US')}-step target adds daily movement to the named training intent without proving that either has been completed.`:`The standing ${Number(data.stepGoal).toLocaleString('en-US')}-step target is present, but no workout or intentional recovery day is recorded for ${date || 'today'}.`,nextMove:`Check progress toward ${Number(data.stepGoal).toLocaleString('en-US')} steps at midday and adjust the remaining walk only if needed.`,anchors:[String(Number(data.stepGoal)),Number(data.stepGoal).toLocaleString('en-US')]}))
  if(recovery)facts.push(makeFact({id:'plan-recovery',label:workout?'Recovery plan':'Intentional recovery day',value:recovery,priority:workout?3:0,kind:'projected',headline:workout?`${recovery} is the recorded recovery constraint`:`${recovery} is today’s intentional recovery plan`,detail:workout?`The Physical Fitness plan pairs today’s workout with “${recovery}” as its recovery condition.`:`The Physical Fitness plan records “${recovery}” instead of a workout for ${date || 'today'}; this is intentional recovery, not an unplanned missing session.`,implication:`“${recovery}” is the recorded constraint for keeping the next training effort repeatable.`,nextMove:`Complete and record the recovery step: ${recovery}.`,whyItMatters:'A named recovery plan protects consistency by making the no-workout day intentional and observable.',watchFor:`Treating “${recovery}” as completed without recording the recovery response.`,growth:`Progress will show when “${recovery}” is completed and the next session’s readiness is recorded.`,anchors:[recovery]}))
  const discussion=clean(data.discussionPrompt)
  if(discussion)facts.push(makeFact({id:'plan-fitness-question',label:'Open fitness question',value:discussion,priority:4,kind:'unresolved',implication:`“${discussion}” identifies an unresolved condition that could change how the session should be executed.`,nextMove:`Answer “${discussion}” before selecting the session’s final intensity or timing.`,whyItMatters:'Resolving the named question prevents the workout plan from resting on an unstated assumption.',anchors:[discussion]}))
  const commitment=scheduledPillarItem(context)
  if(commitment)facts.push(recordFact({id:'context-fitness-commitment',source:'Household schedule',label:`Fitness commitment for ${date || 'today'}`,item:commitment,priority:2,kind:'projected',implication:`“${itemTitle(commitment)}” provides the dated training window that the workout and recovery plan must fit.`,nextMove:`Protect the recorded time for “${itemTitle(commitment)}” and adjust session volume if the available window is shorter than planned.`,whyItMatters:'A named time window turns general training intent into an executable session.'}))
  const coverageFact=calendarCoverageFact(context,'fitness',date)
  if(coverageFact)facts.push(coverageFact)
  return facts
}

function householdFacts(data,context,date) {
  const facts=[]
  const focus=clean(data.keyFocus || data.weeklyFocus || data.todayFocus)
  if(focus)facts.push(makeFact({id:'plan-household-focus',label:'Recorded household focus',value:focus,priority:2,kind:'unresolved',headline:`Household focus: ${focus}`,implication:`“${focus}” is the named operating emphasis; the useful next step is to identify the exact dependency keeping it unresolved.`,nextMove:`Open “${focus}” and record the next dependency, decision, or dated action needed to move it.`,whyItMatters:'A named focus becomes useful when its next constraint is visible.',anchors:[focus]}))
  const unresolved=list(data.priorities).filter(isOpenRecord)
  if(unresolved[0])facts.push(recordFact({id:'plan-household-priority',source:'Daily pillar plan',label:'Highest recorded household priority',item:unresolved[0],priority:1,kind:'unresolved',nextMove:`Open “${itemTitle(unresolved[0])},” identify its next unresolved dependency, and record the owner and due point for that dependency.`,implication:`“${itemTitle(unresolved[0])}” is the first unresolved household priority in today’s plan, so delays there can affect the rest of the flow.`,whyItMatters:'Resolving the named dependency prevents effort from scattering across lower-impact work.'}))
  const open=itemTitle(list(data.openItems).find(isOpenRecord))
  if(open)facts.push(makeFact({id:'plan-open-item',label:'Open household item',value:open,priority:2,kind:'unresolved',nextMove:`Resolve or explicitly defer “${open}” and record the reason.`,whyItMatters:'An open item without a disposition continues to consume attention.',anchors:[open]}))
  const appointment=list(data.appointments).find(isOpenRecord)
  if(appointment)facts.push(recordFact({id:'plan-appointment',source:'Daily pillar plan',label:'Today’s household commitment',item:appointment,priority:3,kind:'projected',nextMove:`Confirm the time and preparation needed for “${itemTitle(appointment)}” before the preceding schedule block.`,whyItMatters:'A dated commitment changes what can realistically fit around it.'}))
  const summary=context.analysisSummary || {}
  const highProject=list(summary.attentionProjects).find(isOpenRecord) || list(context.projects).find(project=>/^(?:urgent|critical|high)$/i.test(clean(project.priority))&&isOpenRecord(project))
  if(highProject)facts.push(recordFact({id:'context-high-project',source:'Household operations',label:'High-priority project',item:highProject,priority:1,kind:'unresolved',nextMove:`Open “${itemTitle(highProject)}” and record the next dependency, decision, or due date that is blocking movement.`,whyItMatters:'A named high-priority project can create wider household friction when its next dependency is unclear.'}))
  const maintenance=list(summary.maintenanceAttention).find(isOpenRecord)
  if(maintenance)facts.push(recordFact({id:'context-maintenance-attention',source:'Household maintenance',label:`${clean(maintenance.status) || 'Open'} maintenance item`,item:maintenance,priority:0,kind:'unresolved',nextMove:`Open “${itemTitle(maintenance)}” in Household Maintenance and resolve the ${clean(maintenance.status || 'open').toLowerCase()} condition.`,whyItMatters:'An unresolved maintenance exception can delay household use or hide a dependency until its disposition is recorded.'}))
  const maintenanceDue=list(summary.maintenanceToday).find(isOpenRecord)
  if(maintenanceDue)facts.push(recordFact({id:'context-maintenance-today',source:'Household maintenance',label:'Today’s maintenance work',item:maintenanceDue,priority:3,kind:'projected',implication:`“${itemTitle(maintenanceDue)}” is scheduled for ${date || 'today'} with status ${clean(maintenanceDue.status || 'Scheduled')}; that is a commitment, not proof of completion.`,nextMove:`Open “${itemTitle(maintenanceDue)}” in Household Maintenance and record its completion or sign-off state when the work is finished.`,whyItMatters:'A named scheduled task makes the household workload visible without overstating progress.'}))
  const lowStock=list(summary.lowStockItems)[0] || list(context.inventory?.items).filter(item=>Number(item?.parLevel)>0&&Number(item?.quantity)<=Number(item?.parLevel)).sort((left,right)=>(Number(right.parLevel)-Number(right.quantity))-(Number(left.parLevel)-Number(left.quantity))||itemTitle(left).localeCompare(itemTitle(right)))[0]
  if(lowStock)facts.push(makeFact({id:'context-low-stock',source:'Household inventory',label:'Low-stock item',value:`${itemTitle(lowStock)} · ${Number(lowStock.quantity)||0} ${clean(lowStock.unit)||'units'} on hand · par ${Number(lowStock.parLevel)||0}`,priority:2,nextMove:`Add ${itemTitle(lowStock)} to the next purchase list with the recorded quantity needed to restore par.`,whyItMatters:'Falling below the operating threshold creates a purchase dependency that can make planned household use unavailable.',anchors:[itemTitle(lowStock),String(lowStock.quantity),String(lowStock.parLevel)]}))
  const expiring=list(summary.expiringItems)[0]
  if(expiring)facts.push(recordFact({id:'context-expiring-item',source:'Household inventory',label:clean(expiring.expiresOn)<date?'Expired inventory item':'Inventory expiring soon',item:expiring,priority:1,kind:'unresolved',implication:`“${itemTitle(expiring)}” has ${Number(expiring.quantity)||0} ${clean(expiring.unit)||'units'} recorded with an expiration date of ${clean(expiring.expiresOn)}; without a use, discard, or quantity decision, the recorded stock can become avoidable waste.`,nextMove:`Open “${itemTitle(expiring)}” in Inventory and choose whether to use, discard, or update the recorded quantity before ${clean(expiring.expiresOn)}.`,whyItMatters:'Acting on the named quantity before it is unusable can reduce avoidable waste.'}))
  const currentAppleEvents=appleCalendarIsCurrent(context)?list(context.calendar?.appleFamilyCalendar):[]
  const scheduled=list(summary.todaySchedule).find(isOpenRecord)
    || list(summary.todayCalendarEvents).find(item=>isOpenRecord(item)&&(!isAppleCalendarItem(item)||appleCalendarIsCurrent(context)))
    || list(context.schedule?.blocks).find(item=>clean(item.date)===date&&isOpenRecord(item))
    || [...list(context.calendar?.brevityEvents),...currentAppleEvents].find(item=>clean(item.date || item.start).slice(0,10)===date&&isOpenRecord(item))
  if(scheduled)facts.push(recordFact({id:'context-today-schedule',source:'Household schedule',label:`Scheduled for ${date || 'today'}`,item:scheduled,priority:3,kind:'projected',nextMove:`Protect the recorded time for “${itemTitle(scheduled)}” and resolve any conflict before it begins.`,whyItMatters:'A dated commitment constrains the time available around it, so an unresolved conflict can delay both commitments.'}))
  const errand=clean(list(data.errands)[0])
  if(errand)facts.push(makeFact({id:'plan-household-errand',label:'Recorded errand',value:errand,priority:5,kind:'projected',implication:`“${errand}” is an open trip dependency that can consume time or block another household item if it remains unsequenced.`,nextMove:`Schedule “${errand}” next to the closest existing outing or record a deliberate defer date.`,whyItMatters:'Sequencing the named errand reduces a separate trip and protects the rest of the day.',anchors:[errand]}))
  const career=clean(list(data.careerPriorities)[0])
  if(career)facts.push(makeFact({id:'plan-career-priority',label:'Recorded career priority',value:career,priority:5,kind:'projected',implication:`“${career}” is the career-related household commitment most likely to compete with today’s shared capacity.`,nextMove:`Reserve a defined work window for “${career}” and record the household dependency it creates.`,whyItMatters:'Naming the capacity tradeoff prevents the career priority from becoming invisible household friction.',anchors:[career]}))
  const coverageFact=calendarCoverageFact(context,'household',date)
  if(coverageFact)facts.push(coverageFact)
  return facts.filter(Boolean)
}

function educationFacts(data,date,context={}) {
  const facts=[]
  const topic=clean(data.thinkTankTopic)
  const deliverable=safeSourceText(data.thinkTankDeliverable)
  if(!topic&&!deliverable)facts.push(makeFact({id:'plan-learning-gap',label:'Missing learning objective',value:date || 'today',priority:0,kind:'data-gap',headline:`Education data needed: no Think Tank topic or deliverable is recorded for ${date || 'today'}`,detail:`Education has no Think Tank topic or deliverable recorded for ${date || 'today'}.`,implication:'Without a defined topic or output, the standing practice minutes cannot show what understanding should be demonstrated today.',nextMove:'Record one Think Tank topic and one observable deliverable in Morning Alignment.',whyItMatters:'A defined output makes it possible to distinguish time spent from understanding gained.',watchFor:'Counting completed minutes as proof of understanding without a demonstration.',growth:'Progress will show when a named idea can be explained or applied with less prompting.',anchors:[date,'Think Tank']}))
  if(topic)facts.push(makeFact({id:'plan-think-tank-topic',label:'Think Tank topic',value:topic,priority:2,kind:'projected',implication:`“${topic}” defines what today’s learning should make clearer; the schedule alone cannot show whether that understanding developed.`,nextMove:deliverable?`Complete the recorded demonstration—“${deliverable}”—and note what required help or revision.`:`Explain “${topic}” in your own words and apply it to one example.`,whyItMatters:'A named topic focuses the learning block on understanding rather than general activity.',watchFor:`Finishing the block without testing whether “${topic}” can be explained or applied.`,growth:`Progress will show when “${topic}” can be explained accurately and transferred to a new example.`,anchors:[topic,deliverable]}))
  if(deliverable)facts.push(makeFact({id:'plan-think-tank-deliverable',label:'Required learning demonstration',value:deliverable,priority:1,kind:'projected',headline:`“${deliverable}” is today’s measure of understanding`,implication:topic?`The recorded deliverable turns “${topic}” into an observable learning result.`:'The deliverable supplies an observable result even though the topic is not named.',nextMove:`Complete “${deliverable}” without prompts, then record the part that required help or revision.`,whyItMatters:'The result reveals the actual growth gap more clearly than checking whether the block occurred.',watchFor:`Marking “${deliverable}” complete without checking accuracy or independent understanding.`,growth:`Progress will show when “${deliverable}” can be completed accurately with less prompting.`,anchors:[deliverable,topic]}))
  const isaiah=data.isaiah || {}
  const observed=clean(isaiah.notes)
  if(observed)facts.push(makeFact({id:'plan-isaiah-observation',label:'Recorded learning observation',value:observed,priority:0,kind:'actual',headline:`Isaiah’s recorded learning observation: ${observed}`,implication:`“${observed}” is the only recorded outcome from the learning block, so it should determine what receives the next explanation or practice.`,nextMove:`Use “${observed}” to choose one targeted example, then record whether Isaiah completes it independently.`,whyItMatters:'An observed result is stronger evidence of the learning gap than planned minutes alone.',anchors:[observed]}))
  const practices=[['readingMinutes','reading'],['sightWordsMinutes','sight words'],['comprehensionMinutes','comprehension'],['mathMinutes','math']].filter(([key])=>finite(isaiah[key])&&Number(isaiah[key])>0)
  if(practices.length)facts.push(makeFact({id:'plan-isaiah-practice',label:'Standing practice block',value:practices.map(([key,label])=>`${Number(isaiah[key])} minutes ${label}`).join('; '),priority:4,kind:topic||deliverable||observed?'projected':'data-gap',implication:topic||deliverable||observed?'The planned minutes allocate practice time, but the recorded topic, deliverable, or observation must determine how that time is used.':`The standing practice minutes are present for ${date || 'today'}, but no topic, deliverable, or learning observation says what understanding needs attention.`,nextMove:'Use the recorded minutes as practice windows, then capture one example of what Isaiah could do independently.',whyItMatters:'Practice time becomes useful evidence only when paired with an observed learning result.',anchors:practices.flatMap(([key,label])=>[String(isaiah[key]),label])}))
  const discussion=clean(list(data.discussionPrompts)[0])
  if(discussion)facts.push(makeFact({id:'plan-education-prompt',label:'Learning discussion prompt',value:discussion,priority:5,kind:'projected',implication:`“${discussion}” can reveal whether the learner can explain the idea rather than merely recognize it.`,nextMove:`Ask “${discussion}” and record the part of the answer that is accurate, incomplete, or dependent on prompting.`,whyItMatters:'The response creates an observable learning signal for the next practice choice.',anchors:[discussion]}))
  const commitment=scheduledPillarItem(context)
  if(commitment)facts.push(recordFact({id:'context-education-commitment',source:'Household schedule',label:`Education commitment for ${date || 'today'}`,item:commitment,priority:3,kind:'projected',implication:`“${itemTitle(commitment)}” is the dated learning window; it creates capacity for practice but does not define or prove understanding.`,nextMove:`Use “${itemTitle(commitment)}” for the recorded topic or deliverable, then capture one independent result.`,whyItMatters:'Connecting the scheduled block to an observable learning result makes the time educationally meaningful.'}))
  const coverageFact=calendarCoverageFact(context,'education',date)
  if(coverageFact)facts.push(coverageFact)
  return facts
}

function financeFacts(data,context,date) {
  const facts=[]
  const summary=context.analysisSummary || {}
  const coverage=summary.sourceCoverage || {}
  if(coverage.transactionCache==='unavailable')facts.push(makeFact({id:'finance-source-gap',source:'Finance source coverage',label:'Bank transaction source unavailable',value:date || summary.asOfDate || 'today',priority:0,kind:'data-gap',headline:`Bank activity is unavailable for ${date || summary.asOfDate || 'today'}`,detail:`No readable bank-transaction snapshot is available for ${date || summary.asOfDate || 'today'}.`,implication:'Posted cash flow and same-day reconciliation cannot be confirmed from the current Finance source, even if scheduled items are present.',nextMove:'Open Finance and refresh Plaid before interpreting scheduled items as matched, missing, or posted.',whyItMatters:'A scheduled obligation can guide preparation, but an unavailable transaction source cannot prove whether it posted.',watchFor:'A scheduled item being called missing or paid while the bank source is unavailable.',growth:'Progress will show when Finance records a readable transaction snapshot and its refresh status.',anchors:['Bank activity','bank-transaction snapshot','Plaid',date,summary.asOfDate]}))
  else if(coverage.reconciliation==='unavailable'){
    const status=clean(coverage.freshnessStatus || 'unknown')
    const coveredThrough=clean(coverage.coverageThrough || coverage.checkedDate)
    const requested=clean(summary.asOfDate || date)
    const futureCoverage=coverage.reconciliationReason==='date-after-source-coverage'
    const detail=futureCoverage
      ? `The fresh bank snapshot covers transactions through ${coveredThrough || 'an earlier date'}, before the requested Finance date of ${requested || 'today'}; future scheduled items cannot be classified as missing or posted.`
      : `The bank snapshot is present, but its refresh status is ${status}; captured posted records may be described, while missing-item conclusions remain unsafe.`
    facts.push(makeFact({id:'finance-reconciliation-gap',source:'Finance source coverage',label:futureCoverage?'Requested date exceeds bank coverage':'Reconciliation freshness needs attention',value:futureCoverage?`Bank coverage through ${coveredThrough || 'unknown'} · requested ${requested || 'today'}`:`Bank snapshot status: ${status}`,priority:0,kind:'data-gap',headline:futureCoverage?`Bank coverage stops at ${coveredThrough || 'an earlier date'}; ${requested || 'the requested date'} is not reconcilable yet`:`Bank snapshot status is ${status}; Finance reconciliation needs a fresh transaction check`,detail,implication:futureCoverage?'The schedule remains useful for preparation, but the requested date has not occurred within the verified transaction coverage.':'Existing captured activity remains visible, but the source cannot establish that an expected transaction is absent.',nextMove:futureCoverage?`Use the scheduled Finance plan for ${requested || 'the requested date'} and wait for bank coverage to reach that date before resolving missing or posted status.`:'Refresh Plaid in Finance before resolving a scheduled item as missing.',whyItMatters:'Missing-transaction conclusions require a current transaction check that covers the requested date.',watchFor:'A scheduled item being declared missing, paid, or posted outside the bank snapshot’s verified coverage.',growth:'Progress will show when the transaction source covers the requested date and reconciliation can run.',anchors:['Plaid','Bank coverage',coveredThrough,requested,`Bank snapshot status: ${status}`]}))
  }else if(coverage.reconciliation==='limited')facts.push(makeFact({id:'finance-reconciliation-limited',source:'Finance source coverage',label:'Same-day reconciliation is still open',value:`Fresh bank coverage through ${clean(coverage.coverageThrough || summary.asOfDate || date)}`,priority:5,kind:'recorded',headline:'Same-day Finance coverage is current, but expected postings are still open',detail:`The transaction source is fresh through ${clean(coverage.coverageThrough || summary.asOfDate || date)}, and Brevity withheld missing-transaction conclusions for items still due that same day.`,implication:'Observed matches, variances, and unplanned activity remain useful; absence alone is not yet evidence that a same-day item was missed.',nextMove:'Review observed Finance reconciliation items now, then check still-unmatched scheduled items after their posting window.',whyItMatters:'A fresh morning snapshot can be accurate without being a complete record of everything that will post later that day.',anchors:['Same-day reconciliation','Fresh bank coverage',coverage.coverageThrough,summary.asOfDate,date]}))
  const reconciliation=summary.reconciliation || {}
  if(populatedObject(reconciliation)&&(!finite(reconciliation.needsReviewCount)||Number(reconciliation.needsReviewCount)<0))facts.push(sourceGapFact({id:'finance-reconciliation-summary-gap',label:'Incomplete Finance reconciliation summary',value:'Finance reconciliation review count',date,missing:['needsReviewCount'],nextMove:'Open Finance Reconciliation and refresh the summary so Needs Review Count is recorded.'}))
  else if(Number(reconciliation.needsReviewCount)>0){
    const reviewAmounts=reconciliation.reviewAmounts || {}
    const missing=[...missingFiniteFields(reviewAmounts,['knownGrossTotal','ambiguousGroupCount']),...(typeof reviewAmounts.complete==='boolean'?[]:['complete'])]
    if(missing.length)facts.push(sourceGapFact({id:'finance-reconciliation-summary-gap',label:'Incomplete Finance reconciliation summary',value:`${Number(reconciliation.needsReviewCount)} review item${Number(reconciliation.needsReviewCount)===1?'':'s'}`,date,missing,nextMove:`Open Finance Reconciliation and refresh the summary so ${missing.map(titleCase).join(', ')} ${missing.length===1?'is':'are'} recorded.`}))
    else{
      const knownAmount=Number(reviewAmounts.knownGrossTotal)
      const ambiguousCount=Number(reviewAmounts.ambiguousGroupCount)
      const amountText=reviewAmounts.complete
        ? `${money(knownAmount)} known gross review amount`
        : `${money(knownAmount)} known gross amount${ambiguousCount?` plus ${ambiguousCount} ambiguous group${ambiguousCount===1?'':'s'} without a single defensible total`:''}`
      const largest=reconciliation.largestUnresolved
      const largestText=largest?` The first named review item is ${itemDescription(largest)}.`:''
      const nextTarget=itemTitle(largest)?`“${itemTitle(largest)}”${itemAmount(largest)?` (${itemAmount(largest)})`:''}`:'the first unmatched or variant item'
      facts.push(makeFact({id:'finance-reconciliation',source:'Finance reconciliation',label:'Finance items requiring review',value:`${Number(reconciliation.needsReviewCount)} item${Number(reconciliation.needsReviewCount)===1?'':'s'} · ${amountText}`,priority:0,kind:'unresolved',headline:`${Number(reconciliation.needsReviewCount)} finance item${Number(reconciliation.needsReviewCount)===1?' needs':'s need'} review; ${money(knownAmount)} is the known gross amount`,detail:`Finance reconciliation shows ${Number(reconciliation.needsReviewCount)} item${Number(reconciliation.needsReviewCount)===1?'':'s'} requiring review; ${amountText}.${largestText}`,implication:'The review queue can change timing, classification, or the scheduled outlook; a known gross amount is not the same as a net cash loss, and ambiguous groups should not be forced into a false total.',nextMove:`Open Finance Reconciliation and resolve ${nextTarget} first.`,whyItMatters:reviewAmounts.complete?`The ${money(knownAmount)} known gross review amount identifies how much recorded activity still lacks a final reconciliation explanation.`:'Separating known amounts from ambiguous groups prevents a plausible-looking but unsupported review total.',watchFor:'A missing, ambiguous, pending, or variant item being counted as reconciled cash.',growth:'Progress will show when every listed item is matched, explained, or deliberately reclassified and the review queue reaches zero.',anchors:[String(reconciliation.needsReviewCount),money(knownAmount),itemTitle(largest),itemAmount(largest),date,summary.asOfDate]}))
    }
  }
  const actual=summary.actualMonthToDate || {}
  if(populatedObject(actual)&&(!finite(actual.transactionCount)||Number(actual.transactionCount)<0))facts.push(sourceGapFact({id:'finance-actual-summary-gap',label:'Incomplete posted-activity summary',value:'Posted bank activity',date,missing:['transactionCount'],nextMove:'Refresh Finance so the posted-activity summary records Transaction Count.'}))
  else if(Number(actual.transactionCount)>0){
    const missing=missingFiniteFields(actual,['transactionCount','income','otherInflows','expenses','net'])
    if(missing.length)facts.push(sourceGapFact({id:'finance-actual-summary-gap',label:'Incomplete posted-activity summary',value:`${Number(actual.transactionCount)} posted record${Number(actual.transactionCount)===1?'':'s'}`,date,missing,nextMove:`Refresh Finance so the posted-activity summary records ${missing.map(titleCase).join(', ')}.`}))
    else{
      const count=Number(actual.transactionCount)
      const net=Number(actual.net)
      const snapshotStatus=clean(coverage.freshnessStatus || 'unknown')
      const capturedThrough=earliestSourceDate(summary.asOfDate,date,coverage.coverageThrough,coverage.checkedDate)
      const snapshotName=snapshotStatus==='fresh'?'fresh bank snapshot':`${snapshotStatus} bank snapshot`
      const incomplete=coverage.transactionCache==='available'&&snapshotStatus!=='fresh'
      facts.push(makeFact({id:'finance-actual-month',source:'Posted bank activity snapshot',label:'Captured month-to-date cash flow',value:`${count} posted records · Income ${money(actual.income)} · Other inflows ${money(actual.otherInflows)} · Expenses ${money(actual.expenses)} · Net ${money(net)}`,priority:net<0?1:3,kind:'actual',headline:`The ${snapshotName} contains ${money(net)} of net posted cash flow through ${capturedThrough || 'the measured date'}`,detail:`In the ${snapshotName}, ${count} posted record${count===1?'':'s'} dated through ${capturedThrough || summary.asOfDate || date} show ${money(actual.income)} of realized income, ${money(actual.otherInflows)} of other inflows, and ${money(actual.expenses)} of expenses, for captured net cash flow of ${money(net)}.${incomplete?' The snapshot may not contain all activity for the selected period.':''}`,implication:net<0?'Captured posted outflows exceed captured posted inflows; scheduled income cannot erase that observed result until it posts.':'Captured posted inflows exceed captured posted expenses, but this remains distinct from the scheduled full-month baseline and from activity not present in the snapshot.',nextMove:net<0?`Open the actual expense drill-down for the ${money(net)} captured month-to-date net and review the largest posted expense before approving additional discretionary spending.`:`Compare the captured ${money(net)} month-to-date net with the scheduled full-month baseline and identify the next scheduled item that changes the margin.`,whyItMatters:incomplete?'These are real records captured by the snapshot, but the stale or partial coverage must not be described as a complete current-period total.':'These are posted records captured through the stated cutoff date, distinct from pending and scheduled activity.',watchFor:'Scheduled income, transfers, or uncaptured activity being included in the posted snapshot total.',growth:'Progress will show when the captured month-to-date result reconciles to its drill-down and source coverage is explicit.',anchors:[String(count),money(actual.income),money(actual.expenses),money(net),capturedThrough,summary.asOfDate,date]}))
    }
  }
  const scheduled=summary.scheduledMonthBaseline || {}
  if(populatedObject(scheduled)&&(!finite(scheduled.occurrenceCount)||Number(scheduled.occurrenceCount)<0))facts.push(sourceGapFact({id:'finance-scheduled-summary-gap',label:'Incomplete scheduled baseline',value:'Scheduled full-month baseline',date,missing:['occurrenceCount'],nextMove:'Refresh Finance so the scheduled baseline records Occurrence Count.'}))
  else if(Number(scheduled.occurrenceCount)>0){
    const missing=missingFiniteFields(scheduled,['scheduledLineCount','occurrenceCount','income','expenses','net'])
    if(missing.length)facts.push(sourceGapFact({id:'finance-scheduled-summary-gap',label:'Incomplete scheduled baseline',value:`${Number(scheduled.occurrenceCount)} scheduled occurrence${Number(scheduled.occurrenceCount)===1?'':'s'}`,date,missing,nextMove:`Refresh Finance so the scheduled baseline records ${missing.map(titleCase).join(', ')}.`}))
    else{
      const net=Number(scheduled.net)
      facts.push(makeFact({id:'finance-scheduled-month',source:'Scheduled finance plan',label:'Scheduled full-month baseline',value:`${Number(scheduled.scheduledLineCount)} lines · ${Number(scheduled.occurrenceCount)} occurrences · Income ${money(scheduled.income)} · Expenses ${money(scheduled.expenses)} · Net ${money(net)}`,priority:net<0?2:4,kind:'projected',headline:`The scheduled full-month baseline is ${money(net)} across ${Number(scheduled.occurrenceCount)} occurrences`,detail:`${Number(scheduled.scheduledLineCount)} scheduled line${Number(scheduled.scheduledLineCount)===1?'':'s'} materialize as ${Number(scheduled.occurrenceCount)} occurrence${Number(scheduled.occurrenceCount)===1?'':'s'} this month, totaling ${money(scheduled.income)} of planned income and ${money(scheduled.expenses)} of planned expenses for a baseline net of ${money(net)}.`,implication:net<0?'The current schedule ends the month below zero unless an amount, date, or funding choice changes.':'The schedule shows a positive month, but the margin is not realized and does not incorporate actual-versus-planned variance.',nextMove:net<0?`Open scheduled expenses behind the ${money(net)} full-month baseline and identify the largest line that can be deferred, reduced, or funded differently.`:`Verify the next scheduled income date behind the ${money(net)} full-month baseline and preserve that margin until it posts.`,whyItMatters:'This is the plan’s baseline and should guide preparation without being mistaken for actual cash or an updated forecast.',watchFor:'A scheduled full-month baseline being described as money already received or spent.',growth:'Progress will show when scheduled occurrences post as expected and actual-versus-planned variance is reconciled.',anchors:[String(scheduled.scheduledLineCount),String(scheduled.occurrenceCount),money(scheduled.income),money(scheduled.expenses),money(net)]}))
    }
  }
  const pending=summary.pending || {}
  if(populatedObject(pending)&&(!finite(pending.count)||Number(pending.count)<0))facts.push(sourceGapFact({id:'finance-pending-summary-gap',label:'Incomplete pending-activity summary',value:'Pending bank activity',date,missing:['count'],nextMove:'Refresh Finance so the pending-activity summary records Count.'}))
  else if(Number(pending.count)>0){
    const missing=missingFiniteFields(pending,['count','grossAmount','inflowAmount','expenseAmount'])
    if(missing.length)facts.push(sourceGapFact({id:'finance-pending-summary-gap',label:'Incomplete pending-activity summary',value:`${Number(pending.count)} pending transaction${Number(pending.count)===1?'':'s'}`,date,missing,nextMove:`Refresh Finance so the pending-activity summary records ${missing.map(titleCase).join(', ')}.`}))
    else{
      const capturedThrough=earliestSourceDate(summary.asOfDate,date,coverage.coverageThrough,coverage.checkedDate)
      facts.push(makeFact({id:'finance-pending',source:'Pending bank activity snapshot',label:'Transactions marked pending in the bank snapshot',value:`${Number(pending.count)} item${Number(pending.count)===1?'':'s'} · ${money(pending.grossAmount)} gross · ${money(pending.inflowAmount)} inflow · ${money(pending.expenseAmount)} expense`,priority:2,kind:'pending',headline:`The ${clean(coverage.freshnessStatus || 'unknown')} bank snapshot contains ${Number(pending.count)} transaction${Number(pending.count)===1?'':'s'} marked pending, totaling ${money(pending.grossAmount)} gross`,detail:`The ${clean(coverage.freshnessStatus || 'unknown')} bank snapshot${capturedThrough?` through ${capturedThrough}`:''} contains ${Number(pending.count)} record${Number(pending.count)===1?'':'s'} marked pending: ${money(pending.inflowAmount)} of inflows and ${money(pending.expenseAmount)} of expenses, or ${money(pending.grossAmount)} before netting.`,implication:'Those status labels may change after the snapshot; neither side is final until a later posting check.',nextMove:`Open the ${Number(pending.count)} transactions marked pending with ${money(pending.grossAmount)} gross activity and refresh their status before treating the amounts as final.`,whyItMatters:'Pending labels are observations from a dated snapshot, not settled cash, and gross activity is not net cash.',anchors:[String(pending.count),money(pending.grossAmount),money(pending.inflowAmount),money(pending.expenseAmount),capturedThrough,summary.asOfDate,date]}))
    }
  }
  if(summary.largestPostedExpense){
    const largestPosted=summary.largestPostedExpense
    const missing=[...(itemTitle(largestPosted)?[]:['name']),...(validSourceDate(largestPosted?.date)?[]:['date']),...(finite(largestPosted?.amount)?[]:['amount'])]
    if(missing.length)facts.push(sourceGapFact({id:'finance-largest-posted-expense-gap',label:'Incomplete largest posted expense',value:itemTitle(largestPosted)||'Unnamed posted expense',date,missing,nextMove:`Refresh Finance so the largest posted expense records ${missing.map(titleCase).join(', ')}.`}))
    else facts.push(recordFact({id:'finance-largest-posted-expense',source:'Posted bank activity',label:'Largest posted expense in scope',item:largestPosted,priority:4,kind:'actual',implication:`“${itemTitle(largestPosted)}” at ${itemAmount(largestPosted)} is the largest single posted expense in the measured month-to-date result.`,nextMove:`Open “${itemTitle(largestPosted)}” and confirm its category and expected-versus-actual amount.`,whyItMatters:'The largest posted expense has the greatest single-record effect on the measured actual result.'}))
  }
  const largestLine=summary.largestScheduledExpenseLine
  if(largestLine){
    const missing=[...(itemTitle(largestLine)?[]:['name']),...missingFiniteFields(largestLine,['monthlyAmount','occurrenceCount','perOccurrenceAmount'])]
    if(missing.length)facts.push(sourceGapFact({id:'finance-largest-scheduled-expense-line-gap',label:'Incomplete largest scheduled expense line',value:itemTitle(largestLine)||'Unnamed scheduled expense line',date,missing,nextMove:`Refresh Finance so the largest scheduled expense line records ${missing.map(titleCase).join(', ')}.`}))
    else facts.push(makeFact({id:'finance-largest-scheduled-expense-line',source:'Scheduled finance plan',label:'Largest scheduled expense line by monthly total',value:`${itemTitle(largestLine)} · ${money(largestLine.monthlyAmount)} monthly total · ${Number(largestLine.occurrenceCount)} occurrence${Number(largestLine.occurrenceCount)===1?'':'s'} at ${money(largestLine.perOccurrenceAmount)} each${largestLine.firstOccurrenceDate?` · first ${clean(largestLine.firstOccurrenceDate)}`:''}`,priority:3,kind:'projected',headline:`${itemTitle(largestLine)} is the largest scheduled expense line at ${money(largestLine.monthlyAmount)} for the month`,detail:`“${itemTitle(largestLine)}” contributes ${money(largestLine.monthlyAmount)} to the monthly schedule across ${Number(largestLine.occurrenceCount)} occurrence${Number(largestLine.occurrenceCount)===1?'':'s'} of ${money(largestLine.perOccurrenceAmount)}${largestLine.firstOccurrenceDate?`, beginning ${clean(largestLine.firstOccurrenceDate)}`:''}.`,implication:'The monthly total—not a single occurrence—is the line’s full effect on the scheduled baseline.',nextMove:`Open “${itemTitle(largestLine)}” in scheduled transactions and verify its ${money(largestLine.perOccurrenceAmount)} occurrence amount, recurrence, and funding source.`,whyItMatters:'The scheduled line with the largest monthly total is the planned obligation most likely to constrain the baseline margin.',anchors:[itemTitle(largestLine),money(largestLine.monthlyAmount),money(largestLine.perOccurrenceAmount),String(largestLine.occurrenceCount),largestLine.firstOccurrenceDate]}))
  }
  if(!facts.length){
    const actualRows=list(context.actualTransactions)
    const actualMissing=item=>[
      ...(itemTitle(item)?[]:['name']),
      ...(validSourceDate(item?.date)?[]:['date']),
      ...(finite(item?.amount)?[]:['amount']),
      ...(typeof item?.pending==='boolean'?[]:['pending status']),
    ]
    const rawActual=actualRows.find(item=>!actualMissing(item).length)
    const partialActual=actualRows.find(item=>actualMissing(item).length)
    if(rawActual)facts.push(recordFact({id:'finance-actual-record',source:'Posted or pending bank activity',label:rawActual.pending?'Pending bank transaction':'Posted bank transaction',item:rawActual,priority:3,kind:rawActual.pending?'pending':'actual',implication:`“${itemTitle(rawActual)}” is a dated ${rawActual.pending?'pending':'posted'} record; its ${itemAmount(rawActual)} amount ${rawActual.pending?'is not final':'changes the captured realized-cash result'}.`,nextMove:`Open “${itemTitle(rawActual)}” and confirm its posted or pending status before using it in the day’s cash position.`,whyItMatters:'This is a named, dated source record, but no calculated period summary was supplied.'}))
    if(partialActual){
      const missing=actualMissing(partialActual)
      facts.push(sourceGapFact({id:'finance-actual-record-gap',label:'Incomplete bank transaction',value:itemTitle(partialActual)||'Unnamed bank transaction',date,missing,nextMove:`Open Finance and record ${missing.map(titleCase).join(', ')} for this bank transaction before classifying it as posted or pending.`}))
    }
    const scheduledRows=list(context.scheduledTransactions).filter(isOpenRecord)
    const scheduledMissing=item=>[
      ...(itemTitle(item)?[]:['name']),
      ...(validSourceDate(item?.date || item?.start)?[]:['date']),
      ...(finite(item?.amount)?[]:['amount']),
    ]
    const rawScheduled=scheduledRows.find(item=>!scheduledMissing(item).length)
    const partialScheduled=scheduledRows.find(item=>scheduledMissing(item).length)
    if(rawScheduled)facts.push(recordFact({id:'finance-scheduled-record',source:'Scheduled finance plan',label:'Scheduled finance record',item:rawScheduled,priority:4,kind:'projected',implication:`“${itemTitle(rawScheduled)}” is scheduled at ${itemAmount(rawScheduled)} and must not be counted as realized cash until a posted record exists.`,nextMove:`Open “${itemTitle(rawScheduled)}” and verify its date, amount, and actual posting status.`,whyItMatters:'A scheduled record affects the baseline but is not realized cash.'}))
    if(partialScheduled){
      const missing=scheduledMissing(partialScheduled)
      facts.push(sourceGapFact({id:'finance-scheduled-record-gap',label:'Incomplete scheduled transaction',value:itemTitle(partialScheduled)||'Unnamed scheduled transaction',date,missing,nextMove:`Open Finance and record ${missing.map(titleCase).join(', ')} for this scheduled transaction before using it in the baseline.`}))
    }
  }
  const account=list(context.accounts).filter(item=>itemTitle(item)&&finite(item.balance)).sort((left,right)=>Math.abs(Number(right.balance))-Math.abs(Number(left.balance))||itemTitle(left).localeCompare(itemTitle(right)))[0]
  if(account)facts.push(makeFact({id:'finance-account-balance',source:'Finance account record',label:'Largest recorded account balance',value:`${itemTitle(account)} · ${money(account.balance)}`,priority:5,kind:'recorded',implication:`${itemTitle(account)} has the largest absolute recorded balance at ${money(account.balance)}; that snapshot is different from month-to-date cash flow.`,nextMove:`Open ${itemTitle(account)} and check its source timestamp before relying on the ${money(account.balance)} balance for a funding decision.`,whyItMatters:'A named balance can frame liquidity only when its account and source timing are clear.',anchors:[itemTitle(account),money(account.balance)]}))
  const pipeline=list(data.incomePipeline).find(item=>itemDescription(item))
  if(pipeline)facts.push(recordFact({id:'plan-income-pipeline',source:'Daily pillar plan',label:'Projected income pipeline item',item:pipeline,priority:5,kind:'projected',implication:`“${itemTitle(pipeline)}” is pipeline income and must remain outside realized cash until it posts.`,nextMove:`Open “${itemTitle(pipeline)}” and verify its expected date, amount, and realization status.`,whyItMatters:'Pipeline income can inform planning but is not realized cash until it posts.'}))
  const planned=[...list(data.bills),...list(data.purchases),...list(data.transfers),...list(data.accountsToFund)].find(item=>itemDescription(item)&&isOpenRecord(item))
  if(planned)facts.push(recordFact({id:'plan-finance-item',source:'Daily pillar plan',label:'Today’s finance plan item',item:planned,priority:6,kind:'projected',implication:`“${itemTitle(planned)}” is a planned finance item; its amount and status should be checked against the named funding source before execution.`,nextMove:`Open “${itemTitle(planned)}” and verify its funding source and status.`,whyItMatters:'The item is planned, not evidence that cash has moved.'}))
  const commitment=scheduledPillarItem(context)
  if(commitment)facts.push(recordFact({id:'context-finance-commitment',source:'Household schedule',label:`Finance commitment for ${date || 'today'}`,item:commitment,priority:2,kind:'projected',implication:`“${itemTitle(commitment)}” is a dated Finance commitment; its purpose and source records should be ready before the recorded time.`,nextMove:`Open “${itemTitle(commitment)}” and prepare the exact Finance records or decision inputs needed before its start time.`,whyItMatters:'A named Finance review or meeting creates a concrete deadline for resolving the highest-value uncertainty.'}))
  const coverageFact=calendarCoverageFact(context,'finance',date)
  if(coverageFact)facts.push(coverageFact)
  return facts.filter(Boolean)
}

function ministryFacts(data,date,context={}) {
  const facts=[]
  const focus=clean(data.contentFocus)
  const meeting=list(data.meetings).find(isOpenRecord)
  const followUp=list(data.fellowshipFollowUps).find(isOpenRecord)
  if(focus)facts.push(makeFact({id:'plan-ministry-focus',label:'Ministry content focus',value:focus,priority:1,kind:'projected',headline:`“${focus}” is today’s recorded ministry emphasis`,implication:'Material that does not serve this named emphasis competes with the intended message and response.',nextMove:`Review today’s ministry material and remove or revise anything that does not strengthen “${focus}.”`,whyItMatters:'Without a named emphasis, unrelated material can remain in the message and weaken its follow-through.',watchFor:`Adding content or activity that competes with “${focus}.”`,growth:`Progress will show when the message and follow-through can be clearly traced to “${focus}.”`,anchors:[focus]}))
  if(meeting)facts.push(recordFact({id:'plan-ministry-meeting',label:`Ministry commitment for ${date || 'today'}`,item:meeting,priority:meeting?.startTime?0:2,kind:'projected',nextMove:`Confirm the time, intended outcome, and preparation needed for “${itemTitle(meeting)}.”`,implication:`“${itemTitle(meeting)}” is a recorded commitment, so readiness should be shaped by its actual purpose and timing.`,whyItMatters:'A named meeting creates a concrete preparation and follow-through requirement.'}))
  if(followUp)facts.push(recordFact({id:'plan-ministry-follow-up',label:'Fellowship follow-up',item:followUp,priority:2,kind:'unresolved',implication:`“${itemTitle(followUp)}” is an open relationship commitment; until it has a time or outcome, the intended care remains incomplete.`,nextMove:`Complete or schedule “${itemTitle(followUp)}” and record the outcome.`,whyItMatters:'A named relationship need loses value when it remains an indefinite intention.'}))
  const prayer=clean(list(data.prayerNeeds)[0])
  if(prayer)facts.push(makeFact({id:'plan-prayer-need',label:'Recorded prayer need',value:prayer,priority:3,kind:'unresolved',implication:`“${prayer}” names the need; without that anchor, prayer or follow-up could drift to a different concern.`,nextMove:`Pray specifically for “${prayer}” and record any follow-up that the need requires.`,whyItMatters:'Naming the person or circumstance prevents care from becoming generic.',anchors:[prayer]}))
  const readiness=clean(list(data.readinessChecklist)[0])
  if(readiness)facts.push(makeFact({id:'plan-ministry-readiness',label:'Ministry readiness item',value:readiness,priority:2,kind:'projected',implication:`“${readiness}” is the recorded preparation condition most likely to affect whether the ministry commitment is ready.`,nextMove:`Complete or deliberately defer “${readiness}” and record the resulting readiness state.`,whyItMatters:'A named readiness item connects preparation to an observable condition instead of a general sense of readiness.',anchors:[readiness]}))
  const framework=clean(data.framework)
  if(framework)facts.push(makeFact({id:'plan-ministry-framework',label:'Ministry framework',value:framework,priority:4,kind:'projected',implication:`“${framework}” creates a constraint: today’s message, meeting, or follow-through should be revised when it does not serve that standard.`,nextMove:`Review the current ministry material against “${framework}” and revise the one part that does not serve it.`,whyItMatters:'Without a defined framework, material outside the intended ministry purpose can remain in the message.',anchors:[framework]}))
  const commitment=scheduledPillarItem(context)
  if(commitment)facts.push(recordFact({id:'context-ministry-commitment',source:'Household schedule',label:`Ministry commitment for ${date || 'today'}`,item:commitment,priority:meeting?4:1,kind:'projected',implication:`“${itemTitle(commitment)}” fixes a preparation deadline at its recorded time; without an intended outcome, readiness cannot be evaluated.`,nextMove:`Confirm the intended outcome and preparation needed for “${itemTitle(commitment)}” before its recorded start time.`,whyItMatters:'A named calendar commitment creates a concrete readiness and follow-through requirement.'}))
  const coverageFact=calendarCoverageFact(context,'ministry',date)
  if(coverageFact)facts.push(coverageFact)
  return facts
}

export function pillarAnalysisFactPack({pillar,date='',pillarData={},localContext={}}={}) {
  const builders={spiritual:()=>spiritualFacts(pillarData,date,localContext),health:()=>healthFacts(pillarData,date,localContext),fitness:()=>fitnessFacts(pillarData,date,localContext),household:()=>householdFacts(pillarData,localContext,date),education:()=>educationFacts(pillarData,date,localContext),finance:()=>financeFacts(pillarData,localContext,date),ministry:()=>ministryFacts(pillarData,date,localContext)}
  const factText=fact=>[fact.value,fact.detail,fact.headline,fact.implication,fact.nextMove,fact.whyItMatters,fact.watchFor,fact.growth].join(' ')
  return (builders[pillar]?.() || []).filter(Boolean).filter(fact=>{
    const text=factText(fact)
    return !OWNERSHIP_PATTERNS.some(pattern=>pattern.test(text))
      && !PROCESS_LANGUAGE.test(text)
      && !TASK_LIST_LANGUAGE.test(fact.nextMove)
      && (pillar!=='spiritual'||!SPIRITUAL_LEAKAGE_PATTERNS.some(pattern=>pattern.test(text)))
  }).sort((left,right)=>left.priority-right.priority||left.id.localeCompare(right.id)).slice(0,8)
}

function analysisText(analysis,{includeEvidence=true}={}) {
  const values=REQUIRED_TEXT.map(field=>analysis?.[field])
  for(const item of list(analysis?.analysisPoints))values.push(item?.title,item?.detail)
  for(const item of list(analysis?.actionableInsights))values.push(item?.title,item?.whyItMatters,item?.nextMove)
  if(includeEvidence)for(const item of list(analysis?.evidence))values.push(item?.source,item?.detail)
  values.push(...list(analysis?.reflectionPrompts),...list(analysis?.watchFor),...list(analysis?.decisions))
  return values.filter(value=>typeof value==='string').join('. ')
}

function duplicateContent(analysis) {
  const candidates=[analysis?.headline,analysis?.executiveSummary,analysis?.todayFocus,...list(analysis?.analysisPoints).flatMap(item=>[item?.title,item?.detail]),...list(analysis?.actionableInsights).flatMap(item=>[item?.title,item?.whyItMatters,item?.nextMove]),...list(analysis?.reflectionPrompts),...list(analysis?.watchFor)].map(normalized).filter(value=>value.length>=18)
  const counts=candidates.reduce((result,value)=>result.set(value,(result.get(value)||0)+1),new Map())
  return [...counts.values()].some(count=>count>=2)
}

const compactText=value=>String(value??'').replace(/\s+/g,' ').trim()
const textFieldValid=(value,min,max)=>typeof value==='string'&&compactText(value).length>=min&&compactText(value).length<=max
function objectArrayValid(value,limits,min=1,max=3){return Array.isArray(value)&&value.length>=min&&value.length<=max&&value.every(item=>item&&typeof item==='object'&&!Array.isArray(item)&&Object.entries(limits).every(([field,limit])=>textFieldValid(item[field],4,limit)))}
const stringArrayValid=(value,max)=>Array.isArray(value)&&value.length<=max&&value.every(item=>textFieldValid(item,4,STRING_ARRAY_LIMIT))
const substantiveInterpretation=value=>typeof value==='string'&&compactText(value).length>=24&&SUBSTANTIVE_INTERPRETATION.test(compactText(value))
const narrativeFields=analysis=>[
  ...REQUIRED_TEXT.map(field=>({value:analysis?.[field],limit:CORE_TEXT_LIMITS[field]})),
  ...list(analysis?.analysisPoints).flatMap(item=>Object.entries(ANALYSIS_POINT_LIMITS).map(([field,limit])=>({value:item?.[field],limit}))),
  ...list(analysis?.actionableInsights).flatMap(item=>Object.entries(ACTIONABLE_INSIGHT_LIMITS).map(([field,limit])=>({value:item?.[field],limit}))),
  ...list(analysis?.evidence).flatMap(item=>Object.entries(EVIDENCE_LIMITS).map(([field,limit])=>({value:item?.[field],limit}))),
  ...['reflectionPrompts','watchFor','decisions'].flatMap(field=>list(analysis?.[field]).map(value=>({value,limit:STRING_ARRAY_LIMIT}))),
]
const parseCurrencyClaim=raw=>{const token=String(raw||'').toLowerCase().replace(/dollars?|[$,\s]/g,'');const suffix=token.at(-1),multiplier=suffix==='k'?1e3:suffix==='m'?1e6:suffix==='b'?1e9:1;return Number(token.replace(/[kmb]$/,''))*multiplier}
const currencyClaimMatches=text=>[...String(text||'').matchAll(/-?\$\s*\d[\d,]*(?:\.\d+)?(?:\s*[kmb](?![a-z]))?|-?\d[\d,]*(?:\.\d+)?\s+dollars?\b/gi)].map(match=>({index:match.index||0,value:parseCurrencyClaim(match[0])})).filter(match=>Number.isFinite(match.value))
const currencyClaims=text=>currencyClaimMatches(text).map(match=>match.value)
const factAnchored=(text,facts)=>{
  const haystack=normalized(text),amounts=currencyClaims(text)
  return facts.some(fact=>list(fact?.anchors).some(anchor=>{
    const needle=normalized(anchor)
    if(!needle||needle.length<2)return false
    if(haystack.includes(needle))return true
    const anchorAmounts=currencyClaims(anchor)
    if(anchorAmounts.some(value=>amounts.some(amount=>Math.abs(amount-value)<0.005)))return true
    const meaningful=needle.split(' ').filter(token=>token.length>=4||/\d/.test(token))
    return meaningful.length>0&&meaningful.slice(0,3).every(token=>haystack.includes(token))
  }))
}
const claimClauses=text=>String(text||'').split(/(?<=[.!?;])\s+|\n+|,\s+(?=(?:but|and|although|whereas|while)\b)/i).map(compactText).filter(Boolean)
const MONTHS={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12}
const normalizedDate=(year,month,day)=>{
  const candidate=`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  return validSourceDate(candidate)?candidate:''
}
const dateClaimMatches=(text,defaultDate='')=>{
  const source=String(text||''),claims=[]
  const add=(match,value)=>{if(value)claims.push({index:match.index||0,end:(match.index||0)+match[0].length,value})}
  for(const match of source.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g))add(match,normalizedDate(match[1],match[2],match[3]))
  for(const match of source.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g))add(match,normalizedDate(match[3],match[1],match[2]))
  const defaultYear=/^(\d{4})-/.exec(clean(defaultDate))?.[1] || new Date().getUTCFullYear()
  for(const match of source.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/gi))add(match,normalizedDate(match[3]||defaultYear,MONTHS[match[1].toLowerCase()],match[2]))
  return claims
}
const timeClaimMatches=text=>[...String(text||'').matchAll(/\b(\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?)?\b/gi)].map(match=>{
  let hour=Number(match[1]);const minute=Number(match[2]),period=match[3]?.toLowerCase()
  if(period==='p'&&hour<12)hour+=12
  if(period==='a'&&hour===12)hour=0
  return{index:match.index||0,value:hour>=0&&hour<24&&minute>=0&&minute<60?hour*60+minute:NaN}
}).filter(match=>Number.isFinite(match.value))
const percentageClaimMatches=text=>[...String(text||'').matchAll(/(?<![\w.])[-+]?\d+(?:\.\d+)?\s*%/g)].map(match=>({index:match.index||0,value:Number(match[0].replace('%','').trim())})).filter(match=>Number.isFinite(match.value))
const COUNT_NOUN='(?:transactions?|records?|items?|lines?|occurrences?|groups?|accounts?|meals?|workouts?|appointments?|commitments?|assignments?)'
const normalizedCountNoun=value=>String(value||'').toLowerCase().replace(/(?:transactions?|records?)/,'record').replace(/(?:items?)/,'item').replace(/s$/,'')
const countClaimMatches=text=>[...String(text||'').matchAll(new RegExp(`(?<![$\\w.])(\\d+)\\s+(?:posted\\s+|pending\\s+|scheduled\\s+)?(${COUNT_NOUN})\\b`,'gi'))].map(match=>({index:match.index||0,value:Number(match[1]),noun:normalizedCountNoun(match[2])}))
const measurementClaimMatches=text=>[...String(text||'').matchAll(/(?<![\w.])(\d+(?:\.\d+)?)\s*(mg\s*\/\s*d[lL]|bpm|kcal|calories?)\b/gi)].map(match=>({index:match.index||0,value:Number(match[1]),unit:/mg/i.test(match[2])?'mg/dl':/bpm/i.test(match[2])?'bpm':'calories'})).filter(match=>Number.isFinite(match.value))
const ratioClaimMatches=text=>[...String(text||'').matchAll(/(?<![\w/])(\d+)\s*(?:of|\/)\s*(\d+)(?!\s*\/|[\w])/gi)].map(match=>({index:match.index||0,numerator:Number(match[1]),denominator:Number(match[2])})).filter(match=>match.denominator>0)
const SCRIPTURE_BOOK = '(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|(?:1|2)\\s*Samuel|(?:1|2)\\s*Kings|(?:1|2)\\s*Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song\\s+of\\s+(?:Solomon|Songs)|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|(?:1|2)\\s*Corinthians|Galatians|Ephesians|Philippians|Colossians|(?:1|2)\\s*Thessalonians|(?:1|2)\\s*Timothy|Titus|Philemon|Hebrews|James|(?:1|2)\\s*Peter|(?:1|2|3)\\s*John|Jude|Revelation)'
const scriptureReferenceMatches=text=>{
  const source=String(text||''),matches=[]
  const add=(match,book,chapter,verse,endVerse='')=>matches.push({index:match.index||0,value:`${normalizedFull(book).replace(/\s/g,'')}:${Number(chapter)}:${Number(verse)}${endVerse?`-${Number(endVerse)}`:''}`})
  for(const match of source.matchAll(new RegExp(`\\b(${SCRIPTURE_BOOK})\\s+(\\d+):(\\d+)(?:-(\\d+))?\\b`,'gi')))add(match,match[1],match[2],match[3],match[4])
  for(const match of source.matchAll(new RegExp(`\\b(${SCRIPTURE_BOOK})\\s+chapter\\s+(\\d+)\\s*,?\\s*verse\\s+(\\d+)(?:-(\\d+))?\\b`,'gi')))add(match,match[1],match[2],match[3],match[4])
  return matches
}
const relativeTemporalClaims=text=>[...(String(text||'').match(/\b(?:tomorrow|yesterday|tonight|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi)||[])].map(normalizedFull)
const NUMBER_WORD_VALUES={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12}
const onHandQuantityMatches=text=>[...String(text||'').matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+([a-z][a-z0-9'’ -]{1,60}?)\s+(?:is|are|was|were)\s+(?:already\s+)?(?:on hand|in stock)\b/gi)].map(match=>({value:Number.isFinite(Number(match[1]))?Number(match[1]):NUMBER_WORD_VALUES[match[1].toLowerCase()],item:normalizedFull(match[2]).replace(/s$/,'')}))
const ASSERTED_ACTOR = /\b((?:(?:Dr\.?|Pastor|Coach|Professor|Teacher)\s+[A-Z][a-z]+|[A-Z][a-z]+(?:\s+[A-Z][A-Za-z]+){0,2}))\s+(?:says?|confirms?|confirmed|approves?|approved|committed|reports?|reported|claims?|claimed|measured|will)\b/g
const EVENT_MUTATION = /\b(?:(?:is|was|were|has|have|had)\s+(?:been\s+)?(?:relocated|rescheduled|cancelled|canceled|postponed)|moved\s+(?:to|from))\b/i
const coveredIndex=(index,ranges)=>ranges.some(range=>index>=range.index&&index<range.end)
const bareFinancialClaimMatches=text=>{
  const source=String(text||''),excluded=[...dateClaimMatches(source),...timeClaimMatches(source).map(match=>({...match,end:match.index+5})),...percentageClaimMatches(source).map(match=>({...match,end:match.index+String(match.value).length+1})),...countClaimMatches(source).map(match=>({...match,end:match.index+String(match.value).length}))]
  return[...source.matchAll(/(?<![$\w.-])[-+]?\d[\d,]*(?:\.\d+)?(?![\w.-])/g)].map(match=>({index:match.index||0,value:Number(match[0].replace(/,/g,''))})).filter(match=>Number.isFinite(match.value)&&Math.abs(match.value)>=100&&!coveredIndex(match.index,excluded))
}
const financialClaimMatches=text=>[...new Map([...currencyClaimMatches(text),...bareFinancialClaimMatches(text)].map(match=>[`${match.index}:${match.value}`,match])).values()].sort((left,right)=>left.index-right.index)
const bareFinancialClaims=text=>bareFinancialClaimMatches(text).map(match=>match.value)
const financialClaims=text=>[...new Set([...currencyClaims(text),...bareFinancialClaims(text)])]
const COMPLETED_RESULT = '(?:posted|realized|received|paid|spent|cleared|completed|finished|done|eaten|consumed|attended|achieved|reached|performed|delivered|practiced|served|logged|fixed|mastered|happened|approved)'
const ASSERTIVE_PREFIX = '(?:(?:has|have|had)\\s+(?:(?:already|now|fully)\\s+)?(?:been\\s+)?|(?:is|are|was|were)\\s+(?:(?:already|now|fully)\\s+)?)'
const completionAssertion=text=>{
  const claims=String(text||'')
    .replace(/\bposted\s+(?:bank\s+)?activity\b/gi,'')
    .replace(/\b(?:posted|pending|realized|completed)\s+(?:or\s+(?:posted|pending|realized|completed)\s+)?status\b/gi,'')
  return new RegExp(`\\b${ASSERTIVE_PREFIX}${COMPLETED_RESULT}\\b|\\b${COMPLETED_RESULT}\\b`,'i').test(claims)
}
const resolutionAssertion=text=>new RegExp(`\\b${ASSERTIVE_PREFIX}(?:matched|reconciled|resolved|closed|complete)\\b`,'i').test(text)
const availabilityAssertion=text=>new RegExp(`\\b${ASSERTIVE_PREFIX}(?:available|current|fresh|refreshed|recorded|resolved|complete)\\b`,'i').test(text)
const effectAssertion=text=>/\b(?:proved|proven|improved|reduced|increased|caused|resulted in|led to|demonstrated)\b/i.test(text)
const STATUS_OR_EFFECT = '(?:posted|realized|received|paid|spent|cleared|completed|finished|done|eaten|consumed|attended|achieved|reached|performed|delivered|matched|reconciled|resolved|closed|complete|available|current|fresh|refreshed|recorded|proved|proven|improved|reduced|increased|caused|resulted|led|demonstrated)'
const nonAssertiveStatus=text=>{
  if(/^\s*(?:has|have|had|is|are|was|were|do|does|did|can|could|will|would|should)\b[^?]*\?[.\s]*$/i.test(text))return true
  if(/^\s*(?:treating|mistaking|counting|describing)\b/i.test(text))return true
  const conditionalOrCaution=new RegExp(`\\b(?:if|when|once|until|before|whether|after)\\b[^,.;]{0,80}\\b${ASSERTIVE_PREFIX}${STATUS_OR_EFFECT}\\b|\\bso\\b.{0,140}\\b${ASSERTIVE_PREFIX}${STATUS_OR_EFFECT}\\b|\\b(?:no|never|does?\\s+not\\s+(?:prove|show|establish)|not\\s+(?:evidence|proof)|without|treat(?:ed|ing)?|described as|counted as|mistaken for)\\b.{0,80}\\b${STATUS_OR_EFFECT}\\b`,'i')
  if(conditionalOrCaution.test(text))return true
  if(new RegExp(`\\b${ASSERTIVE_PREFIX}${STATUS_OR_EFFECT}\\b`,'i').test(text))return false
  return new RegExp(`\\b(?:no|not|never|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|hasn['’]t|haven['’]t|hadn['’]t|has not|have not|had not|before|until|unless|if|when|once|after|whether|may|might|can(?:not|'t)?|could|would|should|will|must|needs? to|expected to|scheduled to|planned to|wait(?:ing)? for|treat(?:ed|ing)?|described as|counted as|mistaken for)\\b.{0,80}\\b${STATUS_OR_EFFECT}\\b`,'i').test(text)
}
const statusConflict=(fact,sentence)=>{
  if(['projected','pending'].includes(fact.kind)&&completionAssertion(sentence))return true
  if(fact.kind==='unresolved'&&(resolutionAssertion(sentence)||completionAssertion(sentence)))return true
  if(fact.kind==='data-gap'&&availabilityAssertion(sentence))return true
  return fact.kind!=='actual'&&effectAssertion(sentence)
}
const identityAnchored=(text,fact)=>factAnchored(text,[{anchors:list(fact.identityAnchors).length?fact.identityAnchors:fact.anchors}])
const safeStatusComparison=sentence=>/^(?:compare|review|check|verify|inspect|reconcile)\b/i.test(sentence)&&/\b(?:against|with|versus|to)\b/i.test(sentence)&&!new RegExp(`\\b${ASSERTIVE_PREFIX}${STATUS_OR_EFFECT}\\b`,'i').test(sentence)
const unsupportedFactStatus=(text,facts)=>claimClauses(text).some(sentence=>{
  if(normalizedFull(factCorpus(facts)).includes(normalizedFull(sentence)))return false
  if(facts.some(fact=>{
    const value=clean(fact?.value,2000)
    return value&&normalizedFull(sentence).includes(normalizedFull(value))&&(completionAssertion(value)||resolutionAssertion(value)||availabilityAssertion(value)||effectAssertion(value))
  }))return false
  return facts.some(fact=>{
  const identified=identityAnchored(sentence,fact)
  if(!identified||!statusConflict(fact,sentence)||nonAssertiveStatus(sentence))return false
  if(safeStatusComparison(sentence))return false
  const actualCandidate=completionAssertion(sentence)&&facts.some(candidate=>candidate.kind==='actual'&&identityAnchored(sentence,candidate))
  if(actualCandidate&&['projected','pending'].includes(fact.kind)){
    const kindMarker=fact.kind==='pending'?'pending':'(?:scheduled|planned|projected)'
    const explicitlyTargetsFact=new RegExp(`\\b${kindMarker}\\b[^.;]{0,100}\\b(?:${ASSERTIVE_PREFIX})?${COMPLETED_RESULT}\\b`,'i').test(sentence)
    if(!explicitlyTargetsFact)return false
  }
  return true
  })
})
const misboundFinancialAmount=(text,facts)=>claimClauses(text).some(sentence=>{
  const claims=financialClaimMatches(sentence)
  if(!claims.length)return false
  const identified=facts.filter(fact=>list(fact.identityAnchors).length&&identityAnchored(sentence,fact))
  if(!identified.length)return false
  const sourceAmounts=fact=>financialClaims([fact.value,fact.detail,fact.implication,fact.nextMove].join(' '))
  const comparison=/\b(?:compare|comparison|compared|differs?|versus|against|with|while|whereas|rather than|distinct\s+from)\b/i.test(sentence)
  if(comparison&&claims.every(claim=>identified.some(fact=>sourceAmounts(fact).some(value=>Math.abs(value-claim.value)<0.005))))return false
  const lower=sentence.toLowerCase()
  const mentions=identified.flatMap(fact=>list(fact.identityAnchors).flatMap(anchor=>{
    const needle=clean(anchor,240).toLowerCase()
    if(!needle)return[]
    const positions=[]
    for(let index=lower.indexOf(needle);index>=0;index=lower.indexOf(needle,index+needle.length))positions.push({fact,index:index+(needle.length/2)})
    return positions
  }))
  return claims.some(claim=>{
    if(mentions.length){
      const nearestDistance=Math.min(...mentions.map(mention=>Math.abs(mention.index-claim.index)))
      const nearestFacts=[...new Set(mentions.filter(mention=>Math.abs(mention.index-claim.index)===nearestDistance).map(mention=>mention.fact))]
      if(nearestFacts.length&&!nearestFacts.some(fact=>sourceAmounts(fact).some(value=>Math.abs(value-claim.value)<0.005)))return true
    }
    return !identified.some(fact=>sourceAmounts(fact).some(value=>Math.abs(value-claim.value)<0.005))
  })
})

const factCorpus=facts=>facts.flatMap(fact=>[fact.source,fact.label,fact.value,fact.detail,fact.headline,fact.implication,fact.nextMove,fact.whyItMatters,fact.watchFor,fact.growth]).join(' ')
const sourceSupportsClause=(clause,facts)=>{
  const claim=normalizedFull(clause)
  return claim.length>=4&&normalizedFull(factCorpus(facts)).includes(claim)
}
const sourceSupportsAssertedValue=(clause,facts)=>facts.some(fact=>{
  const value=normalizedFull(fact?.value)
  const actors=assertedActors(clause).map(normalizedFull)
  if(value.length<4||!normalizedFull(clause).includes(value))return false
  if(actors.length&&!actors.some(actor=>value.includes(actor)))return false
  return !EVENT_MUTATION.test(clause)||EVENT_MUTATION.test(fact?.value)
})
const valueAllowed=(value,approved)=>approved.some(candidate=>typeof value==='number'&&typeof candidate==='number'?Math.abs(candidate-value)<0.005:candidate===value)
const RECORD_NOUN='(?:appointment|visit|event|transaction|payment|charge|meal|workout|session|commitment|assignment|maintenance|repair|project|meeting|call|lesson|deliverable|sermon|devotion|account|bill|purchase|transfer)'
const GENERIC_RECORD_WORDS=new Set('a an that the this today s source active named recorded planned scheduled expected current dated open posted pending bank finance household spiritual health fitness education ministry daily actual largest first next record'.split(' '))
const assertedRecordPhrases=clause=>{
  const source=String(clause||'')
  const determined=[...source.matchAll(new RegExp(`\\b((?:a|an|that|the|this|today['’]s)\\s+(?:[a-z0-9&'’$-]+\\s+){0,4}${RECORD_NOUN})\\s+(?:is|are|was|were|has|have|had)\\b`,'gi'))]
  const titled=[...source.matchAll(new RegExp(`\\b((?:[A-Z][A-Za-z0-9&'’$-]*\\s+){1,4}${RECORD_NOUN})\\s+(?:is|are|was|were|has|have|had)\\b`,'g'))]
  return [...determined,...titled].map(match=>match[1]).filter(phrase=>normalized(phrase).split(' ').some(token=>token.length>=3&&!GENERIC_RECORD_WORDS.has(token)&&!new RegExp(`^${RECORD_NOUN}$`,'i').test(token)))
}
const GENERIC_ASSERTED_ACTORS=new Set(['a','an','brevity','finance','health','household','ministry','progress','spiritual','the','this','today'])
const assertedActors=clause=>[...String(clause||'').matchAll(ASSERTED_ACTOR)].map(match=>clean(match[1])).filter(actor=>!GENERIC_ASSERTED_ACTORS.has(normalizedFull(actor)))
const unsupportedConcreteClause=(text,facts,date)=>{
  const approved=factCorpus(facts)
  const approvedDates=dateClaimMatches(approved,date).map(match=>match.value)
  const approvedTimes=timeClaimMatches(approved).map(match=>match.value)
  const approvedPercentages=percentageClaimMatches(approved).map(match=>match.value)
  const approvedCounts=countClaimMatches(approved)
  const approvedRelative=new Set(relativeTemporalClaims(approved))
  const approvedQuantities=onHandQuantityMatches(approved)
  return claimClauses(text).some(clause=>{
    if(dateClaimMatches(clause,date).some(match=>!valueAllowed(match.value,approvedDates)))return true
    if(timeClaimMatches(clause).some(match=>!valueAllowed(match.value,approvedTimes)))return true
    if(percentageClaimMatches(clause).some(match=>!valueAllowed(match.value,approvedPercentages)))return true
    if(countClaimMatches(clause).some(match=>!approvedCounts.some(candidate=>candidate.value===match.value&&candidate.noun===match.noun)))return true
    if(relativeTemporalClaims(clause).some(value=>!approvedRelative.has(value)))return true
    if(onHandQuantityMatches(clause).some(match=>!approvedQuantities.some(candidate=>candidate.value===match.value&&candidate.item===match.item)))return true
    const names=clause.match(new RegExp(`\\b${HOUSEHOLD_NAMES}\\b`,'gi')) || []
    if(names.some(name=>!new RegExp(`\\b${name}\\b`,'i').test(approved)))return true
    if((assertedActors(clause).length||EVENT_MUTATION.test(clause))&&!sourceSupportsClause(clause,facts)&&!sourceSupportsAssertedValue(clause,facts))return true
    return assertedRecordPhrases(clause).some(phrase=>!facts.some(fact=>identityAnchored(phrase,fact)))
  })
}
const unsupportedMeasurement=(text,facts)=>{
  const approved=factCorpus(facts),measurements=measurementClaimMatches(approved),ratios=ratioClaimMatches(approved)
  return claimClauses(text).some(clause=>
    measurementClaimMatches(clause).some(match=>!measurements.some(candidate=>candidate.value===match.value&&candidate.unit===match.unit))
    || ratioClaimMatches(clause).some(match=>!ratios.some(candidate=>candidate.numerator===match.numerator&&candidate.denominator===match.denominator))
  )
}
const unsupportedScriptureClaim=(text,facts)=>{
  const approved=factCorpus(facts),references=new Set(scriptureReferenceMatches(approved).map(match=>match.value))
  return claimClauses(text).some(clause=>{
    const claims=scriptureReferenceMatches(clause)
    if(claims.some(match=>!references.has(match.value)))return true
    return claims.length>0&&/\b(?:guarantees?|promises?|assures?|proves?|teaches?|declares?|means\s+that)\b/i.test(clause)&&!sourceSupportsClause(clause,facts)
  })
}
const unsupportedMedicalClaim=(text,facts)=>{
  return claimClauses(text).some(clause=>MEDICAL_CLAIM_PATTERNS.some(pattern=>pattern.test(clause))&&!sourceSupportsClause(clause,facts))
}

export function pillarAnalysisQualityIssues(analysis,pillar,{date='',pillarData={},localContext={}}={}) {
  const issues=[]
  if(!PILLARS.has(pillar))issues.push('unknown-pillar')
  if(!analysis||typeof analysis!=='object'||Array.isArray(analysis))return[...issues,'missing-analysis']
  if(REQUIRED_TEXT.some(field=>!textFieldValid(analysis[field],12,CORE_TEXT_LIMITS[field])))issues.push('empty-core-insight')
  if(!objectArrayValid(analysis.analysisPoints,ANALYSIS_POINT_LIMITS,1,3))issues.push('empty-analysis-points')
  if(!objectArrayValid(analysis.actionableInsights,ACTIONABLE_INSIGHT_LIMITS,1,2))issues.push('empty-actionable-insights')
  if(!objectArrayValid(analysis.evidence,EVIDENCE_LIMITS,1,2))issues.push('missing-evidence')
  if(!stringArrayValid(analysis.reflectionPrompts,3))issues.push('invalid-reflectionPrompts')
  if(!stringArrayValid(analysis.watchFor,2))issues.push('invalid-watchFor')
  if(!stringArrayValid(analysis.decisions,2))issues.push('invalid-decisions')
  if(narrativeFields(analysis).some(({value,limit})=>typeof value==='string'&&compactText(value).length>limit))issues.push('overlong-analysis-content')
  const text=analysisText(analysis),visibleText=analysisText(analysis,{includeEvidence:false})
  if(OWNERSHIP_PATTERNS.some(pattern=>pattern.test(text)))issues.push('pillar-ownership-language')
  if(pillar==='spiritual'&&SPIRITUAL_LEAKAGE_PATTERNS.some(pattern=>pattern.test(text)))issues.push('spiritual-responsibility-leakage')
  if(duplicateContent(analysis))issues.push('repeated-boilerplate')
  if(PROCESS_LANGUAGE.test(visibleText))issues.push('internal-process-language')
  const points=list(analysis.analysisPoints),actions=list(analysis.actionableInsights),decisions=list(analysis.decisions)
  if([analysis.headline,analysis.todayFocus,...actions.map(item=>item.nextMove)].some(value=>GENERIC_ONLY.test(clean(value))))issues.push('generic-non-actionable-language')
  if(actions.some(item=>GENERIC_ACTION.test(clean(item.nextMove))))issues.push('generic-non-actionable-language')
  if(VAGUE_INSIGHT_LANGUAGE.test(visibleText))issues.push('vague-insight-language')
  if(actions.some(item=>!ACTION_VERBS.test(clean(item.nextMove))||clean(item.nextMove).length<18))issues.push('non-actionable-next-move')
  if(actions.some(item=>TASK_LIST_LANGUAGE.test(clean(item.nextMove))))issues.push('task-list-dumping')
  if(decisions.length)issues.push('unsupported-decision')
  const facts=pillarAnalysisFactPack({pillar,date,pillarData,localContext})
  if(facts.length&&[
    !factAnchored(analysis.headline,[facts[0]]),
    !factAnchored(analysis.executiveSummary,[facts[0]]),
    !factAnchored(analysis.todayFocus,[facts[0]]),
  ].every(Boolean))issues.push('ungrounded-core-insight')
  if(facts.length&&points.some(item=>!factAnchored(item?.detail || '',facts)))issues.push('ungrounded-analysis-point')
  if(facts.length&&actions.some(item=>!factAnchored(item?.nextMove || '',facts)))issues.push('ungrounded-actionable-insight')
  if(points.some(item=>!substantiveInterpretation(item?.detail))||actions.some(item=>!substantiveInterpretation(item?.whyItMatters)))issues.push('restatement-without-interpretation')
  if(facts.length&&unsupportedConcreteClause(visibleText,facts,date))issues.push('ungrounded-claim-clause')
  if(facts.length&&unsupportedMeasurement(visibleText,facts))issues.push('unsupported-measurement')
  if(pillar==='spiritual'&&facts.length&&unsupportedScriptureClaim(visibleText,facts))issues.push('unsupported-scripture-claim')
  if(['health','fitness'].includes(pillar)&&unsupportedMedicalClaim(visibleText,facts))issues.push('unsupported-medical-claim')
  if(unsupportedFactStatus(visibleText,facts))issues.push(pillar==='finance'?'unsupported-financial-status':'unsupported-completion-status')
  if(pillar==='finance'){
    const approved=financialClaims(facts.flatMap(fact=>[fact.value,fact.detail,fact.implication,fact.nextMove,fact.whyItMatters]).join(' '))
    if(financialClaims(visibleText).some(claim=>!approved.some(value=>Math.abs(value-claim)<0.005)))issues.push('unsupported-financial-figure')
    if(misboundFinancialAmount(visibleText,facts))issues.push('misbound-financial-figure')
  }
  return[...new Set(issues)]
}

function flattenEvidence(value,path=[],output=[],depth=0){if(output.length>=80||depth>5||value==null)return output;if(scalar(value)){const key=path.filter(part=>!/^\d+$/.test(part)).slice(-2).join('.'),text=clean(value,220);if(key&&!EXCLUDED_EVIDENCE_KEYS.test(key)&&!GOVERNANCE_EVIDENCE_KEYS.test(key)&&!FRESHNESS_KEYS.test(key)&&!/^data:|^[a-f0-9]{32,}$/i.test(text))output.push({key,text,priority:HIGH_VALUE_KEYS.test(key)?0:1});return output}if(Array.isArray(value))value.slice(0,20).forEach((item,index)=>flattenEvidence(item,[...path,String(index)],output,depth+1));else if(typeof value==='object')Object.entries(value).slice(0,60).forEach(([key,item])=>flattenEvidence(item,[...path,key],output,depth+1));return output}

export function pillarAnalysisEvidence({pillar='',date='',pillarData={},localContext={}}={},analysis=null) {
  const facts=pillarAnalysisFactPack({pillar,date,pillarData,localContext})
  if(facts.length){
    const visible=analysis?analysisText(analysis,{includeEvidence:false}):''
    const matched=visible?facts.filter(fact=>factAnchored(visible,[fact])):[]
    const selected=[...matched,...facts.filter(fact=>!matched.includes(fact))].slice(0,2)
    return selected.map(fact=>({source:fact.source,detail:fact.detail}))
  }
  if(PILLARS.has(pillar))return[]
  const safe=item=>!OWNERSHIP_PATTERNS.some(pattern=>pattern.test(item.text))&&!SPIRITUAL_LEAKAGE_PATTERNS.some(pattern=>pattern.test(item.text))
  const plan=flattenEvidence(pillarData).filter(safe).sort((a,b)=>a.priority-b.priority||a.key.localeCompare(b.key))
  const context=flattenEvidence(localContext).filter(safe).sort((a,b)=>a.priority-b.priority||a.key.localeCompare(b.key))
  const selected=[]
  if(plan[0])selected.push({source:'Daily pillar plan',detail:`${titleCase(plan[0].key.split('.').at(-1))}: ${plan[0].text}`})
  if(context[0]&&normalized(context[0].text)!==normalized(plan[0]?.text))selected.push({source:'Authoritative household context',detail:`${titleCase(context[0].key.split('.').at(-1))}: ${context[0].text}`})
  return selected.slice(0,2)
}

export function buildDeterministicPillarFallback({pillar,date,pillarData={},localContext={}}={}) {
  const label=PILLAR_LABELS[pillar]||'Pillar analysis'
  const facts=pillarAnalysisFactPack({pillar,date,pillarData,localContext})
  if(!facts.length){
    const need=PILLAR_DATA_NEEDS[pillar]||'a dated source record',action=PILLAR_DATA_ACTIONS[pillar]||'Record the missing source detail, then refresh this analysis.'
    return{headline:`${label}: source data is missing`,executiveSummary:`Brevity has no dated record of ${need} for ${date || 'today'}. That leaves today’s condition, result, or priority unknown.`,todayFocus:`Record ${need} before drawing a conclusion about today.`,analysisPoints:[{title:'What is missing',detail:`The ${label} record for ${date || 'today'} does not contain ${need}, so there is no supported result to compare with the plan.`}],actionableInsights:[{title:'Add the missing input',whyItMatters:`Until ${need} is recorded, the household cannot distinguish an unfinished plan from an unrecorded result.`,nextMove:action}],evidence:[{source:'Source coverage',detail:`There is no dated record of ${need} for ${date || 'today'}.`}],reflectionPrompts:[`What ${need} can be recorded now?`],watchFor:[`Treating an unrecorded ${label.toLowerCase()} result as if it were complete.`],decisions:[],growthSignal:`The next useful signal is a dated record of ${need} and its observed outcome.`,governingPrinciple:PILLAR_PRINCIPLES[pillar]||'A missing source fact should be recorded before it is interpreted.'}
  }
  const primary=facts[0],secondary=facts[1]
  const pointTitles={
    spiritual:['The formation movement','The Scriptural anchor'],
    health:['The execution leverage','The supporting condition'],
    fitness:['The training implication','The readiness condition'],
    household:['The operating constraint','The downstream dependency'],
    education:['The learning objective','The evidence of understanding'],
    finance:['The financial implication','The supporting financial fact'],
    ministry:['The ministry emphasis','The preparation requirement'],
  }[pillar]||['What this means','What supports it']
  const actionTitles={spiritual:'Practice the response',health:'Protect the health plan',fitness:'Make the session repeatable',household:'Resolve the key dependency',education:'Demonstrate understanding',finance:'Verify the consequential record',ministry:'Prepare for the intended outcome'}
  const reflections={
    spiritual:`What is “${clean(primary.value,120)}” bringing into view that needs a personal response today?`,
    health:`What would make “${clean(primary.value,120)}” easier to carry out at the planned time?`,
    fitness:`What readiness or recovery observation should shape “${clean(primary.value,120)}” today?`,
    household:`Which dependency is most likely to keep “${clean(primary.value,120)}” unresolved?`,
    education:`What would demonstrate real understanding of “${clean(primary.value,120)}” today?`,
    finance:`What fact about “${clean(primary.value,120)}” would materially change the next financial choice?`,
    ministry:`What preparation would make “${clean(primary.value,120)}” more focused and useful today?`,
  }
  const reflection=primary.kind==='data-gap'
    ? `What is preventing “${clean(primary.value,120)}” from being recorded or refreshed?`
    : reflections[pillar]||`What would change if “${clean(primary.value,120)}” were addressed today?`
  return{
    headline:primary.headline,
    executiveSummary:`${primary.detail} ${primary.whyItMatters}${secondary?` ${secondary.detail}`:''}`,
    todayFocus:primary.implication,
    analysisPoints:[
      {title:pointTitles[0],detail:`${primary.detail} ${primary.implication}`},
      ...(secondary?[{title:pointTitles[1],detail:`${secondary.detail} ${secondary.implication}`}]:[]),
    ],
    actionableInsights:[{title:actionTitles[pillar]||'Take the next grounded step',whyItMatters:primary.whyItMatters,nextMove:primary.nextMove}],
    evidence:facts.slice(0,2).map(fact=>({source:fact.source,detail:fact.detail})),
    reflectionPrompts:[reflection],
    watchFor:[primary.watchFor],decisions:[],growthSignal:primary.growth,
    governingPrinciple:PILLAR_PRINCIPLES[pillar]||'Use a named source fact, explain its consequence, and define the next observable move.',
  }
}

export function enforcePillarAnalysisGuardrails({analysis,pillar,date,pillarData={},localContext={}}={}) {
  const issues=pillarAnalysisQualityIssues(analysis,pillar,{date,pillarData,localContext})
  if(!issues.length)return{analysis,usedFallback:false,insufficientData:false,issues:[],origin:'model'}
  const facts=pillarAnalysisFactPack({pillar,date,pillarData,localContext})
  const insufficientData=!facts.some(fact=>fact.kind!=='data-gap')
  return{analysis:buildDeterministicPillarFallback({pillar,date,pillarData,localContext}),usedFallback:true,insufficientData,issues,origin:insufficientData?'insufficient-data':'deterministic-facts'}
}
