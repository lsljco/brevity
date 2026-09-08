export const PILLAR_ANALYSIS_GUARDRAIL_VERSION = 1

const PILLARS = new Set(['spiritual','health','fitness','household','education','finance','ministry'])
const PILLAR_LABELS = {
  spiritual:'Spiritual Maturity', health:'Health & Nutrition', fitness:'Physical Fitness',
  household:'Household Management', education:'Education', finance:'Finance', ministry:'Ministry & Fellowship',
}

const REQUIRED_TEXT = ['headline','executiveSummary','todayFocus','growthSignal','governingPrinciple']
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
const GENERIC_ONLY = /^(?:stay aligned|stay focused|focus on what matters(?: today)?|keep moving forward|take action|be intentional|continue to grow|execute the plan|make progress|do the work)[.!]?$/i
const ACTION_VERBS = /\b(?:name|notice|compare|choose|adjust|protect|pause|review|clarify|observe|discuss|ask|identify|practice|test|track|verify|prepare|simplify|connect|reflect|respond|decide|measure|preserve|prioritize|replace|reduce|increase|confirm|write|read|listen|set|use|check)\b/i
const EXCLUDED_EVIDENCE_KEYS = /(?:^|\.)(?:id|uid|hash|etag|version|owner|owners|responsible|accountable|supervisor|createdBy|updatedBy|recordedBy|member|participants|attendance|sourceId|actionId|lastActionId)$/i
const GOVERNANCE_EVIDENCE_KEYS = /(?:owner|ownership|responsib|accountab|supervis|assigned(?:to|by)?)/i
const FRESHNESS_KEYS = /(?:At|Timestamp|synced|refreshed|updated|created)$/i
const HIGH_VALUE_KEYS = /(?:todayFocus|devotionFocus|scripture|sermon|theme|objective|focus|goal|principle|meal|hydration|energy|training|workout|recovery|status|priority|amount|balance|variance|cash|income|expense|transaction|lesson|subject|message|notes?|title)$/i

const clean = (value, max = 700) => String(value ?? '').replace(/\s+/g,' ').trim().slice(0,max)
const normalized = value => clean(value,1200).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const titleCase = value => clean(value).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase())
const scalar = value => ['string','number','boolean'].includes(typeof value) && clean(value) !== ''

function analysisText(analysis) {
  const values = REQUIRED_TEXT.map(field=>analysis?.[field])
  for (const item of analysis?.analysisPoints || []) values.push(item?.title,item?.detail)
  for (const item of analysis?.actionableInsights || []) values.push(item?.title,item?.whyItMatters,item?.nextMove)
  for (const item of analysis?.evidence || []) values.push(item?.source,item?.detail)
  values.push(...(analysis?.reflectionPrompts || []),...(analysis?.watchFor || []),...(analysis?.decisions || []))
  return values.filter(value=>typeof value==='string').join(' ')
}

function duplicateContent(analysis) {
  const candidates = [
    analysis?.headline, analysis?.executiveSummary, analysis?.todayFocus,
    ...(analysis?.analysisPoints || []).flatMap(item=>[item?.title,item?.detail]),
    ...(analysis?.actionableInsights || []).flatMap(item=>[item?.title,item?.whyItMatters,item?.nextMove]),
    ...(analysis?.reflectionPrompts || []), ...(analysis?.watchFor || []),
  ].map(normalized).filter(value=>value.length>=18)
  return new Set(candidates).size !== candidates.length
}

function objectArrayValid(value, fields, min = 1, max = 3) {
  return Array.isArray(value) && value.length >= min && value.length <= max
    && value.every(item=>item && typeof item==='object' && !Array.isArray(item) && fields.every(field=>clean(item[field]).length>=4))
}

const stringArrayValid = (value, max) => Array.isArray(value) && value.length<=max
  && value.every(item=>typeof item==='string' && clean(item).length>=4)

export function pillarAnalysisQualityIssues(analysis, pillar) {
  const issues=[]
  if (!PILLARS.has(pillar)) issues.push('unknown-pillar')
  if (!analysis || typeof analysis!=='object' || Array.isArray(analysis)) return [...issues,'missing-analysis']
  if (REQUIRED_TEXT.some(field=>clean(analysis[field]).length<12)) issues.push('empty-core-insight')
  if (!objectArrayValid(analysis.analysisPoints,['title','detail'],1,3)) issues.push('empty-analysis-points')
  if (!objectArrayValid(analysis.actionableInsights,['title','whyItMatters','nextMove'],1,2)) issues.push('empty-actionable-insights')
  if (!objectArrayValid(analysis.evidence,['source','detail'],1,2)) issues.push('missing-evidence')
  if (!stringArrayValid(analysis.reflectionPrompts,3)) issues.push('invalid-reflectionPrompts')
  if (!stringArrayValid(analysis.watchFor,2)) issues.push('invalid-watchFor')
  if (!stringArrayValid(analysis.decisions,2)) issues.push('invalid-decisions')
  const text=analysisText(analysis)
  if (OWNERSHIP_PATTERNS.some(pattern=>pattern.test(text))) issues.push('pillar-ownership-language')
  if (pillar==='spiritual' && SPIRITUAL_LEAKAGE_PATTERNS.some(pattern=>pattern.test(text))) issues.push('spiritual-responsibility-leakage')
  if (duplicateContent(analysis)) issues.push('repeated-boilerplate')
  if ([analysis.headline,analysis.todayFocus,...(analysis.actionableInsights || []).map(item=>item.nextMove)].some(value=>GENERIC_ONLY.test(clean(value)))) issues.push('generic-non-actionable-language')
  if ((analysis.actionableInsights || []).some(item=>!ACTION_VERBS.test(clean(item.nextMove)) || clean(item.nextMove).length<18)) issues.push('non-actionable-next-move')
  if ((analysis.actionableInsights || []).some(item=>/\bfirst\b.*\bsecond\b.*\bthird\b|(?:^|\s)\d[.)].*(?:\s)\d[.)].*(?:\s)\d[.)]/i.test(clean(item.nextMove)))) issues.push('task-list-dumping')
  return [...new Set(issues)]
}

function flattenEvidence(value, path = [], output = [], depth = 0) {
  if (output.length>=80 || depth>5 || value==null) return output
  if (scalar(value)) {
    const key=path.filter(part=>!/^\d+$/.test(part)).slice(-2).join('.')
    const text=clean(value,220)
    if (key && !EXCLUDED_EVIDENCE_KEYS.test(key) && !GOVERNANCE_EVIDENCE_KEYS.test(key) && !FRESHNESS_KEYS.test(key) && !/^data:|^[a-f0-9]{32,}$/i.test(text)) output.push({key,text,priority:HIGH_VALUE_KEYS.test(key)?0:1})
    return output
  }
  if (Array.isArray(value)) value.slice(0,20).forEach((item,index)=>flattenEvidence(item,[...path,String(index)],output,depth+1))
  else if (typeof value==='object') Object.entries(value).slice(0,60).forEach(([key,item])=>flattenEvidence(item,[...path,key],output,depth+1))
  return output
}

export function pillarAnalysisEvidence({ pillar = '', pillarData = {}, localContext = {} } = {}) {
  const isSafe=item=>!OWNERSHIP_PATTERNS.some(pattern=>pattern.test(item.text)) && (pillar!=='spiritual'||!SPIRITUAL_LEAKAGE_PATTERNS.some(pattern=>pattern.test(item.text)))
  const plan=flattenEvidence(pillarData).filter(isSafe).sort((a,b)=>a.priority-b.priority||a.key.localeCompare(b.key))
  const context=flattenEvidence(localContext).filter(isSafe).sort((a,b)=>a.priority-b.priority||a.key.localeCompare(b.key))
  const selected=[]
  const selectedValues=new Set()
  if (plan[0]) {
    selected.push({source:'Daily pillar plan',detail:`${titleCase(plan[0].key.split('.').at(-1))}: ${plan[0].text}`})
    selectedValues.add(normalized(plan[0].text))
  }
  if (context[0] && !selectedValues.has(normalized(context[0].text))) selected.push({source:'Authoritative household context',detail:`${titleCase(context[0].key.split('.').at(-1))}: ${context[0].text}`})
  return selected.slice(0,2)
}

const FALLBACKS = {
  spiritual:{
    headline:'Receive today’s truth personally before extending it outward',
    focus:'Let the available spiritual source expose one heart response for each person.',
    meaning:'Spiritual maturity grows through personal reception and lived response, not by assigning one household member responsibility for everyone else’s formation.',
    moveTitle:'Name the personal implication', moveWhy:'A shared message becomes formative when each person recognizes what it reveals in their own life.', move:'Each person can name one truth that stands out and choose one response that expresses it today.',
    growth:'Progress will show when each person can connect the source truth to an honest personal response without relying on another member to carry it.',
    principle:'Shared formation honors personal responsibility: receive the truth, discern its meaning, and respond faithfully.',
  },
  health:{
    headline:'Use today’s health information to protect steady energy', focus:'Notice the one food, hydration, or preparation factor most likely to shape the day.',
    meaning:'The useful health question is not whether every routine is perfect, but which available choice gives the household the greatest support for energy and consistency.',
    moveTitle:'Choose the highest-leverage adjustment', moveWhy:'One deliberate adjustment is easier to sustain and evaluate than a long wellness checklist.', move:'Compare the available meal, hydration, and energy signals, then adjust the one factor most likely to improve how the day feels.',
    growth:'Progress will show through more predictable energy and a clearer understanding of which daily choices help or hinder it.', principle:'Favor observable, sustainable health choices over assumptions or an overloaded routine.',
  },
  fitness:{
    headline:'Match today’s training choice to readiness and continuity', focus:'Protect consistency by distinguishing productive effort from effort that compromises recovery.',
    meaning:'The strongest fitness move is the one that advances the training intent while preserving the ability to return well, especially when readiness information is limited.',
    moveTitle:'Calibrate the session', moveWhy:'A small readiness-based adjustment can preserve both progress and recovery.', move:'Notice current energy or soreness, then choose the planned intensity or a measured adjustment that still serves the training intent.',
    growth:'Progress will show through consistent sessions, appropriate recovery, and fewer all-or-nothing training decisions.', principle:'Consistency improves when effort is matched to today’s readiness rather than forced by routine alone.',
  },
  household:{
    headline:'Reduce today’s household friction at the main dependency', focus:'Identify the one bottleneck that most affects the rest of the household flow.',
    meaning:'Household progress comes from resolving the dependency with the widest downstream effect, not from turning every visible item into an urgent task list.',
    moveTitle:'Clarify the constraint', moveWhy:'Naming the true bottleneck prevents effort from scattering across lower-impact work.', move:'Identify what is blocking the most downstream activity, then clarify the smallest adjustment or conversation that would release it.',
    growth:'Progress will show when fewer activities wait on unclear sequencing, missing information, or duplicated effort.', principle:'Address the highest-leverage dependency first, then let the rest of the plan remain proportionate.',
  },
  education:{
    headline:'Center today’s learning on understanding, not mere completion', focus:'Identify the concept or skill whose understanding would create the most useful growth.',
    meaning:'The day’s educational value lies in revealing what is understood, what remains uncertain, and which practice would deepen mastery without confusing routine completion with learning.',
    moveTitle:'Test understanding', moveWhy:'A brief explanation or application exposes the real learning gap more clearly than checking whether work was merely finished.', move:'Choose one central idea and explain or apply it without prompts; use the result to identify the next practice that would deepen understanding.',
    growth:'Progress will show when the learner can explain, transfer, or apply the idea with less prompting and greater accuracy.', principle:'Measure learning by understanding and transfer, not by supervision language or task volume.',
  },
  finance:{
    headline:'Let verified financial signals guide the next prudent choice', focus:'Separate what is verified, projected, and still unresolved before interpreting the day’s financial position.',
    meaning:'Financial clarity improves when the household acts on the most consequential verified variance or liquidity signal without treating projections as posted transactions.',
    moveTitle:'Verify the consequential difference', moveWhy:'Distinguishing an actual transaction from a projection protects both reconciliation and decision quality.', move:'Compare the strongest available financial signal with its source record, then clarify the one variance or assumption that would materially change the outlook.',
    growth:'Progress will show when projected, pending, and realized amounts reconcile clearly and decisions rely on labeled source truth.', principle:'Verified financial truth comes before interpretation; interpretation comes before adjustment.',
  },
  ministry:{
    headline:'Focus ministry attention on the message or relationship that needs readiness', focus:'Identify what would make today’s service, preparation, or follow-through more faithful and useful.',
    meaning:'Ministry effectiveness grows from clarity of message and attentiveness to people, not from converting every opportunity into a roster of assignments.',
    moveTitle:'Clarify the needed response', moveWhy:'A clear relational or message-centered response keeps preparation connected to its purpose.', move:'Identify the person, message, or readiness gap most present in the source, then choose one thoughtful response that strengthens service or follow-through.',
    growth:'Progress will show through clearer preparation, more attentive relationships, and follow-through that matches the stated ministry purpose.', principle:'Serve with clarity and attentiveness; let the purpose shape the response.',
  },
}

export function buildDeterministicPillarFallback({ pillar, date, pillarData = {}, localContext = {} } = {}) {
  const config=FALLBACKS[pillar] || FALLBACKS.household
  const evidence=pillarAnalysisEvidence({pillar,pillarData,localContext})
  const sourceMessage=evidence.length
    ? `Brevity found a usable ${PILLAR_LABELS[pillar] || 'pillar'} signal in ${evidence.map(item=>item.source.toLowerCase()).join(' and ')}. The interpretation stays within those records and does not treat a plan as completed behavior.`
    : `No reliable ${PILLAR_LABELS[pillar] || 'pillar'}-specific signal was supplied for ${date || 'today'}. Brevity is keeping the interpretation bounded and is not claiming that any planned behavior was completed.`
  return {
    headline:config.headline,
    executiveSummary:sourceMessage,
    todayFocus:config.focus,
    analysisPoints:[{title:'Key message',detail:config.meaning}],
    actionableInsights:[{title:config.moveTitle,whyItMatters:config.moveWhy,nextMove:config.move}],
    evidence:evidence.length?evidence:[{source:'Source availability',detail:`No reliable ${PILLAR_LABELS[pillar] || 'pillar'}-specific evidence was present for ${date || 'today'}; this fallback makes no claim of completed progress.`}],
    reflectionPrompts:[pillar==='spiritual'?'What does the available truth invite me to recognize and respond to personally?':'What does the strongest available signal mean before we add more activity?'],
    watchFor:[pillar==='finance'?'A projected or pending amount being mistaken for a realized transaction.':'A plan or intention being described as if it were already a completed result.'],
    decisions:[],
    growthSignal:config.growth,
    governingPrinciple:config.principle,
  }
}

export function enforcePillarAnalysisGuardrails({ analysis, pillar, date, pillarData = {}, localContext = {} } = {}) {
  const issues=pillarAnalysisQualityIssues(analysis,pillar)
  if (!issues.length) return {analysis,usedFallback:false,issues:[]}
  return {analysis:buildDeterministicPillarFallback({pillar,date,pillarData,localContext}),usedFallback:true,issues}
}
