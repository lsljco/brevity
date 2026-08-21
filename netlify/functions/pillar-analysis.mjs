import householdAuth from './household-auth.js';

const { readSession } = householdAuth;
const PILLARS = new Set(['spiritual','health','fitness','household','education','finance','ministry']);
const MODEL = process.env.BREVITY_AI_MODEL || 'gpt-5.6';

const BASE_AUTOMATION = `Produce the household’s Seven Pillars daily schedule for the upcoming day. Structure it around Spiritual Maturity, Health & Nutrition, Gym/Fitness, Household Operations, Education/Think Tank, Finances, and Ministry/Fellowship. Include a morning family alignment agenda, decision points, owners, discussion prompts, and open items that need confirmation. Prioritize devotion and prayer before food, gym, errands, or outside activity. Include Terica’s meal communication section, gym location and workout decision section, household appointments and key focus, think tank topic, finance review with bills/purchases/transfers/accounts to fund, and ministry/fellowship content or meeting needs. Spiritual Maturity is owned by Lorenzo.`;

const PILLAR_INSTRUCTIONS = {
  spiritual: `Analyze Spiritual Maturity as the governing foundation for the day. Lorenzo owns this pillar and should own scripture focus, devotion insight, prayer priorities and practical obedience unless a specific item is explicitly delegated. Produce Scripture focus, devotion insight, prayer priorities, practical obedience, family discussion prompts, and what must be settled spiritually before the household moves into food, fitness, errands, work, or outside activity.`,
  health: `Analyze Health & Nutrition operationally. Terica owns meal communication. Cover breakfast, lunch, dinner, snacks, hydration, grocery needs, next-day preparation, unresolved meal decisions, and clear ownership. Do not invent medical restrictions.`,
  fitness: `Analyze Physical Fitness operationally. Resolve location, exact gym/walk option, participants, workout/body-part objective, departure and return time, step target, recovery, and any decision that must be made before leaving.`,
  household: `Analyze Household Operations as a command-center brief. Reconcile appointments, projects, errands, deadlines, home/HOA/contractor matters present in the supplied data, top three household outcomes, owners, deadlines, evidence of completion, and open decisions. Never invent appointments; label unknowns CONFIRM.`,
  education: `Analyze Education / Think Tank. Define one high-value Think Tank topic and required output, plus Isaiah’s age-appropriate reading, sight-word/vocabulary, comprehension, math/homework, supervising owner, and what should be staged for the next school day.`,
  finance: `Analyze Finances as a CFO-style daily operating brief using only supplied Brevity data. Cover bills, purchases, transfers, accounts requiring funding, liquidity/cash implications visible in the data, income-producing priorities, decision rules, owners, and facts requiring confirmation. Never fabricate balances or transactions.`,
  ministry: `Analyze Ministry & Fellowship. Cover Church Triumphant responsibilities, teaching/music/content readiness, meetings, Lorenzo’s content responsibilities when applicable, fellowship/discipleship follow-up, prayer needs, owners, deadlines, and what must be ready before the ministry moment arrives.`
};

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    headline: { type: 'string' },
    executiveSummary: { type: 'string' },
    todayFocus: { type: 'string' },
    analysisPoints: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { title:{type:'string'}, detail:{type:'string'} }, required:['title','detail'] } },
    decisions: { type: 'array', items: { type: 'string' } },
    owners: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { owner:{type:'string'}, action:{type:'string'}, evidence:{type:'string'} }, required:['owner','action','evidence'] } },
    discussionPrompts: { type: 'array', items: { type: 'string' } },
    openItems: { type: 'array', items: { type: 'string' } },
    successStandard: { type: 'string' },
    governingPrinciple: { type: 'string' }
  },
  required: ['headline','executiveSummary','todayFocus','analysisPoints','decisions','owners','discussionPrompts','openItems','successStandard','governingPrinciple']
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

  const prompt = `${BASE_AUTOMATION}\n\nYou are now producing the ${pillar} tab inside Brevity, the household source of truth. ${PILLAR_INSTRUCTIONS[pillar]}\n\nUse concrete execution language. Do not give generic motivational filler. Do not invent appointments, balances, restrictions, or commitments. When information is unavailable, explicitly use CONFIRM. Preserve human authority: AI analyzes and proposes; household members decide. Current signed-in member: ${currentMember}. If the pillar is Spiritual Maturity, Lorenzo is the owner regardless of which member is signed in.\n\nHOUSEHOLD DAILY PLAN (${date}):\n${JSON.stringify(plan)}\n\nADDITIONAL BREVITY CONTEXT:\n${JSON.stringify(localContext)}\n\nReturn a decision-oriented analysis for this pillar only.`;

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
  return json(200, { pillar, date, generatedAt:new Date().toISOString(), model:MODEL, analysis, cached:false });
};
