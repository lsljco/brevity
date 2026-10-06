export const READING_EVENT = 'brevity-reading-start'
export const VOICE_KEY = 'brevity_el_voice_v1'

// Bound each request without dropping the rest of a long teaching document.
export function speechChunks(text, limit = 1800) {
  const chunks = []
  let rest = String(text || '').trim()
  while (rest.length > limit) {
    const slice = rest.slice(0, limit)
    const boundary = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('. '), slice.lastIndexOf(' '))
    const end = boundary > limit / 2 ? boundary + 1 : limit
    chunks.push(rest.slice(0, end).trim())
    rest = rest.slice(end).trim()
  }
  if (rest) chunks.push(rest)
  return chunks
}

export function readableText(root) {
  if (!root) return ''
  const copy = root.cloneNode(true)
  copy.querySelectorAll('button,input,select,textarea,nav,script,style,[aria-hidden="true"],[hidden],[data-reading-skip],details:not([open])').forEach(node => node.remove())
  // Keep document/paragraph boundaries when extracting text outside the live DOM.
  copy.querySelectorAll('p,h1,h2,h3,h4,li,dt,dd,section,article,br,tr').forEach(node => node.append('\n'))
  return copy.textContent.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim()
}
