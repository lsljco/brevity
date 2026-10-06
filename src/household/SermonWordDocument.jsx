import { useEffect, useRef, useState } from 'react'

// Word styles live in their own document: app themes cannot recolor the notes.
const FRAME = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data: blob:; font-src data: blob:"><style>body{margin:0;background:#ddd} .docx-wrapper{padding:12px!important} @media(max-width:700px){.docx-wrapper>section.docx{width:100%!important;padding:24px!important;box-sizing:border-box}table{max-width:100%}.docx p{line-height:normal!important}}</style></head><body></body></html>'
export default function SermonWordDocument({ url, frameRef, fallback }) {
  const [state, setState] = useState('loading')
  const localRef = useRef(null)
  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)
    setState('loading')
    const render = async () => {
      try {
        const target = new URL(url, window.location.origin)
        if (target.origin !== window.location.origin || !target.pathname.startsWith('/.netlify/functions/')) throw new Error('Unsupported document source')
        const [response, { renderAsync }] = await Promise.all([fetch(target, { signal: controller.signal }), import('docx-preview')])
        if (!response.ok) throw new Error('Document unavailable')
        const blob = await response.blob()
        if (!alive) return
        const frame = localRef.current
        const document = frame.contentDocument
        const body = document.createElement('div'), styles = document.createElement('div')
        document.body.replaceChildren(styles, body)
        await renderAsync(blob, body, styles, { inWrapper:true, breakPages:true, useBase64URL:true, renderAltChunks:false })
        if (alive) setState('ready')
      } catch { if (alive) setState('error') }
      finally { clearTimeout(timer) }
    }
    // Wait until the isolated frame's document exists before rendering Word.
    const frame = localRef.current
    frame.addEventListener('load', render, { once:true })
    frame.srcdoc = FRAME
    return () => { alive = false; controller.abort(); clearTimeout(timer); frame.removeEventListener('load', render) }
  }, [url])
  return <>{state === 'loading' && <p className="sermon-word-status" role="status" data-reading-skip>Loading Word document…</p>}
    <iframe ref={node => { localRef.current = node; if (frameRef) frameRef.current = node }} title="Sermon notes Word document" sandbox="allow-same-origin" className="sermon-word-frame" hidden={state !== 'ready'}/>
    {state === 'error' && <><p className="sermon-word-status" role="status" data-reading-skip>The Word file could not be loaded. Showing the saved teaching notes below.</p>{fallback}</>}
  </>
}
