import householdAuth from './household-auth.js';

const { readSession } = householdAuth;
const PILLARS = new Set(['spiritual','health','fitness','household','education','finance','ministry']);
const MODEL = process.env.BREVITY_AI_MODEL || 'gpt-5.6';

export const PILLAR_ANALYSIS_SCHEMA_VERSION = 3;

export const BASE_ANALYSIS_GUIDANCE = `Produce a concise daily insight brief for one of the household's Seven Pillars. The brief must interpret the supplied facts and reveal the key message for this pillar today. It is not a schedule, an ownership report, or a task inventory.

Hard rules:
- Never state, repeat, or emphasize who owns a pillar. Owner fields in supplied data are operational metadata, not analysis content.
- Never infer that a pillar owner is responsible for another household member's personal growth, practice, devotion, or prayer.
- Spiritual Maturity is shared formation. Each household member is responsible for personally engaging the day's Scripture, reflection, prayer, and response. Do not require Lorenzo to lead anyone else's devotion or prayer unless the supplied plan contains a specific, explicit assignment for that date.
- Center the brief on insight: what the data means, why it matters today, what pattern or opportunity deserves attention, and how the household can move forward or grow.
- Provide no more than three high-value insights and no more than two meaningful next moves. Do not turn routine plan items into a checklist.
- A next move must be specific and useful, but it may be a conversation, adjustment, boundary, observation, or practice rather than a task.
- Set decisions to an empty array unless the supplied data contains a clearly stated unresolved choice between concrete alternatives. A missing fact, a generic CONFIRM statement, or whether to perform an optional routine is not a decision.
- Never manufacture decisions, assignments, deadlines, or facts. Use CONFIRM only for a material unknown inside the relevant insight, never as a standalone decision. Preserve human authority: AI offers perspective; household members decide.`;

export const PILLAR_INSTRUCTIONS = {
  spiritual: `Identify the day's central Scriptural truth, the heart pattern it illuminates, and a personal way each household member can respond. Connect insight to growth without making one person the household's spiritual supervisor.`,
  health: `Interpret the meal, hydration, preparation, and energy context. Highlight the strongest health leverage point or pattern for the day rather than repeating the menu or producing a grocery checklist. Do not invent medical restrictions.`,
  fitness: `Explain the day's training intent, likely readiness or recovery need, and the adjustment most likely to improve consistency or progress. Treat Lifetime Gym as settled and do not recite routine logistics unless an exception materially changes the day.`,
  household: `Surface the household bottleneck, dependency, or sequencing insight that most affects today's flow. Recommend one or two high-leverage ways to reduce friction; do not restate the entire project and errand list. Never invent appointments.`,
  education: `Identify the day's most valuable learning objective, the growth gap or encouraging signal visible in the data, and one practice that deepens understanding. Do not create a supervision or accountability decision for Isaiah's standing block.`,
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
    reflectionPrompts: { type: 'array', maxItems: 2, items: { type: 'string' } },
    watchFor: { type: 'array', maxItems: 2, items: { type: 'string' } },
    decisions: { type: 'array', maxItems: 2, items: { type: 'string' } },
    growthSignal: { type: 'string' },
    governingPrinciple: { type: 'string' }
  },
  required: ['headline','executiveSummary','todayFocus','analysisPoints','actionableInsights','reflectionPrompts','watchFor','decisions','growthSignal','governingPrinciple']
};

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }, body: JSON.stringify(body) });

function outputText(response) {
  return (response.output || []).flatMap(item => item.content || []).map(part => part.text || '').join('').trim();
}

export const handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error:'Method not allowed.' });
  if (!process.env.OPENAI_API_KEY) return json(503, { error:'Brevity AI is not configured yet. OPENAI_API_KEY must be available to Netlify Functions.' });

  const session = await readSession(event).catch(() => null);
  if (!session) return json(401, { error:'Sign in to generate a Seven Pillars analysis.' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error:'Invalid request body.' }); }
  const { pillar, date, plan, localContext = {} } = body;
  const currentMember = session.member;
  if (!PILLARS.has(pillar)) return json(400, { error:'Unknown Seven Pillar.' });
  if (!date || !plan) return json(400, { error:'Date and household plan are required.' });

  const prompt = `${BASE_ANALYSIS_GUIDANCE}\n\nYou are producing the ${pillar} tab inside Brevity, the household source of truth. ${PILLAR_INSTRUCTIONS[pillar]}\n\nWrite for clarity, discernment, and forward growth. Keep the executive summary focused on the day's message, not governance or assignments. Current signed-in member: ${currentMember}.\n\nHOUSEHOLD DAILY PLAN (${date}):\n${JSON.stringify(plan)}\n\nADDITIONAL BREVITY CONTEXT:\n${JSON.stringify(localContext)}\n\nReturn an insight-led analysis for this pillar only.`;

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
  return json(200, { schemaVersion:PILLAR_ANALYSIS_SCHEMA_VERSION, pillar, date, generatedAt:new Date().toISOString(), model:MODEL, analysis, cached:false });
};
