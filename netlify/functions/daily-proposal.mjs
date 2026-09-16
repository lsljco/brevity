import householdAuth from './household-auth.js'

const { readSession } = householdAuth

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
})

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['theme', 'governingPrinciple', 'topPriorities', 'spiritualFocus', 'thinkTankTopic', 'ministryFocus', 'decisionPrompts'],
  properties: {
    theme: { type: 'string' },
    governingPrinciple: { type: 'string' },
    topPriorities: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } },
    spiritualFocus: { type: 'string' },
    thinkTankTopic: { type: 'string' },
    ministryFocus: { type: 'string' },
    decisionPrompts: { type: 'array', maxItems: 8, items: { type: 'string' } },
  },
}

const outputText = response => response?.output?.flatMap(item => item?.content || []).find(item => item?.type === 'output_text')?.text || ''

export const handler = async event => {
  if (event.httpMethod === 'OPTIONS') return json(204, {})
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })
  if (!process.env.OPENAI_API_KEY) return json(503, { error: 'Brevity AI is not configured yet.' })
  const session = await readSession(event).catch(() => null)
  if (!session) return json(401, { error: 'Sign in to generate a daily proposal.' })

  let payload
  try { payload = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'Invalid request.' }) }

  const source = payload.sourcePlan || {}
  const targetDate = payload.targetDate || ''
  const compactContext = {
    sourceDate: source.date,
    targetDate,
    theme: source.theme,
    governingPrinciple: source.governingPrinciple,
    topPriorities: source.topPriorities,
    carryovers: source.recap?.carryovers || [],
    lessons: source.recap?.lessons || [],
    tomorrowPrep: source.recap?.tomorrowPrep || [],
    unresolvedDecisions: (source.decisions || []).filter(item => !['complete', 'deferred'].includes(item.status)),
    householdAppointments: source.household?.appointments || [],
    ministryMeetings: source.ministry?.meetings || [],
    financeDecisionRule: source.finance?.decisionRule || '',
  }

  const instructions = [
    'You create a concise proposed Seven Pillars household operating brief for the next day.',
    'Brevity is the source of truth; this output is only a proposal and must not invent appointments, balances, bills, or people.',
    'Carry forward only explicit unresolved items from the supplied context.',
    'Lifetime Gym is the standing fitness location, and Isaiah’s education block is a standing household commitment. Never create decision prompts for gym location or education-block accountability.',
    'Keep priorities concrete and outcome-oriented. Spiritual framing should connect truth to practical obedience.',
    'Return exactly the requested structured output.',
  ].join(' ')

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.BREVITY_AI_MODEL || 'gpt-5.6',
        store: false,
        instructions,
        input: `Prepare the proposed household brief for ${targetDate}. Context: ${JSON.stringify(compactContext)}`,
        text: { format: { type: 'json_schema', name: 'brevity_daily_proposal', strict: true, schema } },
      }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result?.error?.message || `OpenAI returned ${response.status}.`)
    const text = outputText(result)
    if (!text) throw new Error('Brevity AI returned no proposal.')
    return json(200, { proposal: JSON.parse(text), model: result.model || process.env.BREVITY_AI_MODEL || 'configured' })
  } catch (error) {
    console.error('Brevity daily proposal error', error.message)
    return json(502, { error: error.message || 'Could not generate the daily proposal.' })
  }
}
