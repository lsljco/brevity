import householdAuth from './household-auth.js'

const { readSession } = householdAuth
const MODEL = process.env.BREVITY_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'
const MAX_AUDIO_BYTES = 5_500_000
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
})

function extensionFor(mime = '') {
  if (/mp4|m4a/i.test(mime)) return 'm4a'
  if (/ogg/i.test(mime)) return 'ogg'
  if (/wav/i.test(mime)) return 'wav'
  return 'webm'
}

export const handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })
  if (!process.env.OPENAI_API_KEY) return json(503, { error: 'Brevity transcription is not configured yet.' })

  const session = await readSession(event).catch(() => null)
  if (!session) return json(401, { error: 'Sign in to transcribe a finance meeting.' })

  const mime = String(event.queryStringParameters?.mime || event.headers?.['content-type'] || 'audio/webm').slice(0, 100)
  let bytes
  try {
    bytes = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'binary')
  } catch {
    return json(400, { error: 'The meeting audio could not be read.' })
  }
  if (!bytes.length) return json(400, { error: 'No meeting audio was received.' })
  if (bytes.length > MAX_AUDIO_BYTES) return json(413, { error: 'This meeting audio segment is too large to transcribe.' })

  const form = new FormData()
  form.append('model', MODEL)
  form.append('file', new Blob([bytes], { type: mime }), `meeting-segment.${extensionFor(mime)}`)
  form.append('language', 'en')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) return json(response.status, { error: payload.error?.message || 'The meeting audio could not be transcribed.' })

  return json(200, {
    text: String(payload.text || '').trim(),
    model: MODEL,
    member: session.member,
    transcribedAt: new Date().toISOString(),
  })
}
