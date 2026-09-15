async function parseJson(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Brevity alignment intelligence is unavailable right now.')
  return payload
}

export async function transcribeAlignmentAudio(blob) {
  const mime = blob?.type || 'audio/webm'
  const response = await fetch(`/.netlify/functions/finance-meeting-transcribe?mime=${encodeURIComponent(mime)}`, {
    method:'POST', credentials:'include', headers:{'content-type':mime}, body:blob,
  })
  return parseJson(response)
}

export async function analyzeAlignmentTranscript({transcript, notes, timing, plan}) {
  const response = await fetch('/.netlify/functions/alignment-meeting-analyze', {
    method:'POST', credentials:'include', headers:{'content-type':'application/json'},
    body:JSON.stringify({transcript, notes, timing, plan}),
  })
  return parseJson(response)
}
