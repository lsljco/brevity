import householdAuth from './household-auth.js'

const { readSession } = householdAuth
const MODEL = process.env.BREVITY_AI_MODEL || 'gpt-5.6'
const MAX_TRANSCRIPT = 120000
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
})

function outputText(response) {
  return (response.output || []).flatMap(item => item.content || []).map(part => part.text || '').join('').trim()
}

function stripFence(value = '') {
  return value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

function normalizeResult(input = {}) {
  const list = value => Array.isArray(value) ? value.slice(0, 20) : []
  return {
    summary: String(input.summary || '').slice(0, 1800),
    decisions: list(input.decisions).map(item => ({
      text: String(item?.text || '').slice(0, 500),
      reason: String(item?.reason || '').slice(0, 600),
    })).filter(item => item.text),
    actions: list(input.actions).map(item => ({
      text: String(item?.text || '').slice(0, 500),
      owner: String(item?.owner || '').slice(0, 120),
      due: String(item?.due || '').slice(0, 80),
      financialEffect: String(item?.financialEffect || '').slice(0, 300),
    })).filter(item => item.text),
    corrections: list(input.corrections).map(item => ({
      label: String(item?.label || '').slice(0, 300),
      value: String(item?.value || '').slice(0, 300),
      source: ['Bank Verified','Forecast','User Confirmed','Proposed'].includes(item?.source) ? item.source : 'Proposed',
      scope: ['this occurrence','going forward','underlying data is wrong'].includes(item?.scope) ? item.scope : 'this occurrence',
      reason: String(item?.reason || '').slice(0, 500),
    })).filter(item => item.label && item.value),
    risks: list(input.risks).map(value => String(value || '').slice(0, 400)).filter(Boolean),
    unresolved: list(input.unresolved).map(value => String(value || '').slice(0, 400)).filter(Boolean),
  }
}

export const handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })
  if (!process.env.OPENAI_API_KEY) return json(503, { error: 'Brevity meeting intelligence is not configured yet.' })

  const session = await readSession(event).catch(() => null)
  if (!session) return json(401, { error: 'Sign in to analyze a finance meeting.' })

  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'Invalid request body.' }) }
  const transcript = String(body.transcript || '').trim().slice(0, MAX_TRANSCRIPT)
  if (!transcript) return json(400, { error: 'A meeting transcript is required.' })
  const cadence = ['daily','weekly','monthly','quarterly','yearly'].includes(body.cadence) ? body.cadence : 'weekly'
  const snapshot = JSON.stringify(body.snapshot || {}).slice(0, 8000)
  const notes = String(body.notes || '').slice(0, 8000)

  const prompt = `You are Brevity's Finance Meeting reconciliation engine. Analyze the household's ${cadence} finance meeting transcript and return ONLY valid JSON.

Product rules:
1. Brevity gives the household the minimum information required to make the right decision.
2. Preserve human authority. You may propose changes; do not claim any financial record was changed.
3. Never overwrite bank history from speech. A spoken correction is User Confirmed unless the transcript explicitly says it is merely a proposal.
4. Distinguish decisions, action items, financial corrections, risks, and unresolved questions.
5. Do not infer owners, deadlines, dollar values, or decisions that were not actually stated.
6. A correction scope must be exactly one of: "this occurrence", "going forward", "underlying data is wrong". If the scope is unclear, use "this occurrence" and add an unresolved question.
7. A source must be exactly one of: "Bank Verified", "Forecast", "User Confirmed", "Proposed".
8. Keep the output concise. Do not extract ordinary conversation that does not affect a decision.

Return this exact JSON shape:
{
  "summary":"one concise paragraph",
  "decisions":[{"text":"...","reason":"..."}],
  "actions":[{"text":"...","owner":"","due":"","financialEffect":""}],
  "corrections":[{"label":"...","value":"...","source":"User Confirmed","scope":"this occurrence","reason":"..."}],
  "risks":["..."],
  "unresolved":["..."]
}

Current meeting snapshot (may contain forecasts or user-entered values): ${snapshot}
Meeting notes: ${notes || 'none'}

TRANSCRIPT:
${transcript}`

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, store: false, input: prompt, max_output_tokens: 3500 }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) return json(response.status, { error: payload.error?.message || 'Brevity could not reconcile the meeting.' })

  const text = outputText(payload)
  let parsed
  try { parsed = JSON.parse(stripFence(text)) }
  catch { return json(502, { error: 'Brevity returned an invalid meeting reconciliation. Please try again.' }) }

  return json(200, {
    ...normalizeResult(parsed),
    model: MODEL,
    member: session.member,
    analyzedAt: new Date().toISOString(),
  })
}
