export async function generateDailyProposal(sourcePlan, targetDate) {
  const response = await fetch('/.netlify/functions/daily-proposal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourcePlan, targetDate }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `Proposal request failed (${response.status}).`)
  return payload
}
