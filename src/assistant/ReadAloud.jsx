import { useEffect, useRef, useState } from 'react'
import { createElevenLabsSpeech } from './assistantApi.js'
import { primeAudio } from './voicePlayback.js'
import { READING_EVENT, speechChunks, VOICE_KEY } from './readingText.js'
import './ReadAloud.css'

export default function ReadAloud({ getText, label = 'Read aloud', contentKey }) {
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')
  const audio = useRef(null), request = useRef(null), url = useRef(''), generation = useRef(0)
  const identity = useRef({})
  const stop = () => {
    generation.current += 1
    request.current?.abort(); request.current = null
    if (audio.current) { audio.current.onended = null; audio.current.onerror = null; audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load() }
    if (url.current) { URL.revokeObjectURL(url.current); url.current = '' }
    setState('idle')
  }
  useEffect(() => {
    const interrupt = event => { if (event.detail !== identity.current) stop() }
    window.addEventListener(READING_EVENT, interrupt)
    return () => { window.removeEventListener(READING_EVENT, interrupt); stop() }
  }, [])
  useEffect(() => { stop(); setError('') }, [contentKey])
  const play = async () => {
    setError('')
    let voiceId
    try { voiceId = localStorage.getItem(VOICE_KEY) } catch {}
    if (!voiceId) { setError('Choose your ElevenLabs voice in Ask Brevity, then select Read aloud.'); return }
    const chunks = speechChunks(getText())
    if (!chunks.length) { setError('There is no reading content available yet.'); return }
    window.dispatchEvent(new CustomEvent(READING_EVENT, { detail: identity.current }))
    stop(); primeAudio(audio)
    const current = generation.current
    const next = async index => {
      if (current !== generation.current) return
      if (index >= chunks.length) { stop(); return }
      setState('loading')
      const controller = new AbortController(); request.current = controller
      const timeout = setTimeout(() => controller.abort(), 45000)
      try {
        const blob = await createElevenLabsSpeech({ text: chunks[index], voiceId, signal: controller.signal })
        if (current !== generation.current) return
        if (url.current) URL.revokeObjectURL(url.current)
        url.current = URL.createObjectURL(blob)
        audio.current.src = url.current
        audio.current.onended = () => { void next(index + 1) }
        audio.current.onerror = () => { stop(); setError('Audio could not be played. Please try again.') }
        try { await audio.current.play(); if (current === generation.current) setState('playing') }
        catch { if (current === generation.current) setState('paused') }
      } catch (err) {
        if (current !== generation.current) return
        stop(); setError(err.name === 'AbortError' ? 'ElevenLabs took too long. Please try again.' : err.message || 'Read aloud is unavailable.')
      } finally { clearTimeout(timeout) }
    }
    void next(0)
  }
  const resume = async () => {
    try { await audio.current.play(); setState('playing') }
    catch { setError('Your browser could not start audio. Tap Resume to try again.') }
  }
  return <div className="brevity-read-aloud" data-reading-skip>
    {state === 'idle' ? <button type="button" onClick={play}><i className="ti ti-volume" aria-hidden="true"/>{label}</button> : <>
      {state === 'playing' && <button type="button" onClick={() => { audio.current.pause(); setState('paused') }}>Pause reading</button>}
      {state === 'paused' && <button type="button" onClick={resume}>Resume reading</button>}
      {state === 'loading' && <span role="status">Preparing audio…</span>}
      <button type="button" onClick={stop}>Stop reading</button>
    </>}
    <small>ElevenLabs · Your chosen Brevity voice</small>
    {error && <p role="alert">{error}</p>}
  </div>
}
