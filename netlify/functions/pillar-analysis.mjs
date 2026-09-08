import householdAuth from './household-auth.js';
import { getStore } from '@netlify/blobs';
import { PILLAR_ANALYSIS_SCHEMA_VERSION, pillarAnalysisContextSignature } from '../../src/household/pillarAnalysisCache.js';
import { PILLAR_ANALYSIS_GUARDRAIL_VERSION, enforcePillarAnalysisGuardrails } from '../../src/household/pillarAnalysisGuardrails.js';

const { readSession } = householdAuth;
const PILLARS = new Set(['spiritual','health','fitness','household','education','finance','ministry']);
const MODEL = process.env.BREVITY_AI_MODEL || 'gpt-5.6';
const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family';
const STORE_NAME = 'brevity-household';

export { PILLAR_ANALYSIS_SCHEMA_VERSION };
const cacheSegment = value => String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'') || 'unknown';
export const pillarAnalysisServerCacheKey = (date,pillar,planVersion,member,contextSignature) => `${HOUSEHOLD_ID}/pillar-analysis/v${PILLAR_ANALYSIS_SCHEMA_VERSION}/${date}/${pillar}/plan-${Number(planVersion || 0)}/${cacheSegment(member)}/${cacheSegment(contextSignature)}`;
const store = () => getStore({ name:STORE_NAME, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN });

export const BASE_ANALYSIS_GUIDANCE = `Produce a concise daily insight brief for one of the household's Seven Pillars. The brief must interpret the supplied facts and reveal the key message for this pillar today. It is not a schedule, an ownership report, or a task inventory.

Hard rules:
- Never state, repeat, or emphasize who owns a pillar. Owner fields in supplied data are operational metadata, not analysis content.
- Never infer that a pillar owner is responsible for another household member's personal growth, practice, devotion, or prayer.
- Spiritual Maturity is shared formation. Each household member is responsible for personally engaging the day's Scripture, reflection, prayer, and response. Do not require Lorenzo to lead anyone else's devotion or prayer unless the supplied plan contains a specific, explicit assignment for that date.
- Center the brief on insight: what the data means, why it matters today, what pattern or opportunity deserves attention, and how the household can move forward or grow.
- Treat plans as intentions, not evidence of completed behavior or achieved results. Say what a plan is designed to support; do not claim that stability, adherence, growth, or progress occurred unless the supplied data records it.
- Keep the pillar's own facts as the center of gravity. A household-wide spiritual or scheduling theme must not become the headline of Health, Fitness, Education, Finance, or Household Management unless that pillar's supplied data contains a direct dependency.
- Provide no more than three high-value insights and no more than two meaningful next moves. Do not turn routine plan items into a checklist.
- Keep each array item to one complete insight, prompt, signal, or decision. Never combine several entries inside one string.
- A next move must be specific and useful, but it may be a conversation, adjustment, boundary, observation, or practice rather than a task.
- Include one or two concise evidence entries naming whether the basis is the daily pillar plan or authoritative household context. Treat source evidence as support for interpretation, not proof that a planned behavior was completed.
- Set decisions to an empty array unless the supplied data contains a clearly stated unresolved choice between concrete alternatives. A missing fact, a generic CONFIRM statement, or whether to perform an optional routine is not a decision.
- Never manufacture decisions, assignments, deadlines, or facts. Use CONFIRM only for a material unknown inside the relevant insight, never as a standalone decision. Preserve human authority: AI offers perspective; household members decide.`;

export const PILLAR_INSTRUCTIONS = {
  spiritual: `Identify the day's central Scriptural truth, the heart pattern it illuminates, and a personal way each household member can respond. Connect insight to growth without making one person the household's spiritual supervisor.`,
  health: `Interpret the meal, hydration, preparation, and energy context. Highlight the strongest health leverage point or pattern for the day rather than repeating the menu or producing a grocery checklist. Do not invent medical restrictions.`,
  fitness: `Explain the day's training intent, likely readiness or recovery need, and the adjustment most likely to improve consistency or progress. Treat Lifetime Gym as settled and do not recite routine logistics unless an exception materially changes the day.`,
  household: `Surface the household bottleneck, dependency, or sequencing insight that most affects today's flow. Recommend one or two high-leverage ways to reduce friction; do not restate the entire project and errand list. Never invent appointments.`,
  education: `Identify the day's most valuable learning objective, the growth gap or encouraging signal visible in the data, and one practice that deepens understanding. Treat standing routine and management details as background. Never discuss who supervises, owns, or is accountable for a learning block.`,
  finance: `Explain the most consequential change, variance, liquidity signal, or tradeoff visible in Brevity's data. Emphasize implications and a prudent next move, not a list of bills or transfers. Never fabricate balances or transactions.`,
  ministry: `Identify the message, relationship need, or readiness issue that matters most today. Offer insight that strengthens preparation, service, or follow-through without turning the brief into a roster of owners and deadlines.`
};

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    headline: { type: 'string' },
    executiveSummary: { type: 'string' },
    todayFocus: { type: 'string' },
    analysisPoints: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false, properties: { title:{type:'string'}, detail:{type:'string'} }, required:['title','detail'] } },
    actionableInsights: { type: 'array', maxItems: 2, items: { type: 'object', additionalProperties: false, properties: { title:{type:'string'}, whyItMatters:{type:'string'}, nextMove:{type:'string'} }, required:['title','whyItMatters','nextMove'] } },
    evidence: { type:'array', minItems:1, maxItems:2, items:{ type:'object', additionalProperties:false, properties:{ source:{type:'string'}, detail:{type:'string'} }, required:['source','detail'] } },
    reflectionPrompts: { type: 'array', maxItems: 3, items: { type: 'string' } },
    watchFor: { type: 'array', maxItems: 2, items: { type: 'string' } },
    decisions: { type: 'array', maxItems: 2, items: { type: 'string' } },
    growthSignal: { type: 'string' },
    governingPrinciple: { type: 'string' }
  },
  required: ['headline','executiveSummary','todayFocus','analysisPoints','actionableInsights','evidence','reflectionPrompts','watchFor','decisions','growthSignal','governingPrinciple']
};

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }, body: JSON.stringify(body) });

function outputText(response) {
  return (response.output || []).flatMap(item => item.content || []).map(part => part.text || '').join('').trim();
}

export function buildPillarAnalysisPrompt({ pillar, date, plan, currentMember, localContext = {} }) {
  const pillarData = plan?.[pillar] || {};
  return `${BASE_ANALYSIS_GUIDANCE}\n\nYou are producing the ${pillar} tab inside Brevity, the household source of truth. ${PILLAR_INSTRUCTIONS[pillar]}\n\nThe requested pillar is the absolute scope of this analysis. Analyze only the supplied ${pillar} data. Do not substitute the household's overall daily theme or content from another pillar. Mention another pillar only when the supplied ${pillar} data contains a direct dependency that changes today's interpretation.\n\nWrite for clarity, discernment, and forward growth. Keep the executive summary focused on the day's message in this pillar, not governance or assignments. Current signed-in member: ${currentMember}.\n\n${pillar.toUpperCase()} DATA (${date}):\n${JSON.stringify(pillarData)}\n\nADDITIONAL ${pillar.toUpperCase()} CONTEXT:\n${JSON.stringify(localContext)}\n\nReturn an insight-led analysis for this pillar only.`;
}

export const handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error:'Method not allowed.' });
  if (!process.env.OPENAI_API_KEY) return json(503, { error:'Brevity AI is not configured yet. OPENAI_API_KEY must be available to Netlify Functions.' });

  const session = await readSession(event).catch(() => null);
  if (!session) return json(401, { error:'Sign in to generate a Seven Pillars analysis.' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error:'Invalid request body.' }); }
  const { pillar, date, plan, localContext = {}, force = false, contextSignature:requestedContextSignature } = body;
  const currentMember = session.member;
  if (!PILLARS.has(pillar)) return json(400, { error:'Unknown Seven Pillar.' });
  if (!date || !plan) return json(400, { error:'Date and household plan are required.' });
  const contextSignature=pillarAnalysisContextSignature({pillarData:plan?.[pillar] || {},localContext});
  if(requestedContextSignature!==contextSignature)return json(409,{error:'The pillar analysis source changed before Brevity received it. Refresh to use the latest household data.'});

  const dataStore=store();
  if(!force){
    const cached=await dataStore.get(pillarAnalysisServerCacheKey(date,pillar,plan.version,currentMember,contextSignature),{type:'json'}).catch(()=>null);
    if(cached?.schemaVersion===PILLAR_ANALYSIS_SCHEMA_VERSION&&cacheSegment(cached.member)===cacheSegment(currentMember)){
      const guarded=enforcePillarAnalysisGuardrails({analysis:cached.analysis,pillar,date,pillarData:plan?.[pillar]||{},localContext});
      const safeCached={...cached,analysis:guarded.analysis,quality:{guardrailVersion:PILLAR_ANALYSIS_GUARDRAIL_VERSION,status:guarded.usedFallback?'fallback':'validated',issues:guarded.issues},cached:true};
      if(guarded.usedFallback)await dataStore.setJSON(pillarAnalysisServerCacheKey(date,pillar,plan.version,currentMember,contextSignature),{...safeCached,cached:undefined}).catch(error=>console.error('[pillar-analysis cache repair]',error));
      return json(200,safeCached);
    }
  }

  const prompt = buildPillarAnalysisPrompt({ pillar, date, plan, currentMember, localContext });

  const response = await fetch('https://api.openai.com/v1/responses', {
    method:'POST',
    headers:{ 'authorization':`Bearer ${process.env.OPENAI_API_KEY}`, 'content-type':'application/json' },
    body:JSON.stringify({
      model: MODEL,
      store:false,
      input: prompt,
      text:{ format:{ type:'json_schema', name:'brevity_pillar_analysis', strict:true, schema } }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || 'OpenAI analysis failed.';
    const code = payload.error?.code || payload.error?.type || '';
    if (response.status === 429 && /quota|billing|insufficient/i.test(`${message} ${code}`)) {
      return json(429, { error:'Brevity AI reached the OpenAI API project’s available quota. Add API credits or increase the project usage limit, then refresh the analysis.' });
    }
    return json(response.status, { error: message });
  }

  let analysis;
  try { analysis = JSON.parse(outputText(payload)); } catch { return json(502, { error:'Brevity AI returned an unreadable analysis.' }); }
  const guarded=enforcePillarAnalysisGuardrails({analysis,pillar,date,pillarData:plan?.[pillar]||{},localContext});
  const result={ schemaVersion:PILLAR_ANALYSIS_SCHEMA_VERSION, contextSignature, member:currentMember, pillar, date, generatedAt:new Date().toISOString(), model:MODEL, quality:{guardrailVersion:PILLAR_ANALYSIS_GUARDRAIL_VERSION,status:guarded.usedFallback?'fallback':'validated',issues:guarded.issues},analysis:guarded.analysis };
  await dataStore.setJSON(pillarAnalysisServerCacheKey(date,pillar,plan.version,currentMember,contextSignature),result).catch(error=>console.error('[pillar-analysis cache]',error));
  return json(200, { ...result, cached:false });
};
