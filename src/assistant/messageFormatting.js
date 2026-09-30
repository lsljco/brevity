export function safeSourceUrl(value) {
  if (!/^https?:\/\//i.test(value || '') || /[\s\u0000-\u001f]/.test(value)) return null
  try {
    const url = new URL(value)
    return url.hostname && !url.username && !url.password ? url.href : null
  } catch { return null }
}

function cells(line) {
  const text = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
  return text.split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'))
}

export function messageBlocks(content) {
  const lines = String(content).split('\n'), blocks = []
  let list = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const header = cells(line), divider = cells(lines[i + 1] || '')
    if (line.includes('|') && header.length > 1 && divider.length === header.length && divider.every(cell => /^:?-{3,}:?$/.test(cell))) {
      const table = {type:'table', header, align:divider.map(cell => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left'), rows:[]}
      i++
      while (i + 1 < lines.length && lines[i + 1].includes('|')) {
        const row = cells(lines[i + 1])
        if (row.length !== header.length) break
        table.rows.push(row); i++
      }
      blocks.push(table); list = null; continue
    }
    const match = line.match(/^\s*(?:([-*•])\s+|(\d+)[.)]\s+)(.*)$/)
    if (match) {
      const type = match[2] ? 'ol' : 'ul'
      if (!list || list.type !== type) { list = {type,start:Number(match[2] || 1),items:[]}; blocks.push(list) }
      list.items.push(match[3])
    } else { list = null; blocks.push({type:'p',text:line.replace(/^#{1,6}\s+/, '')}) }
  }
  return blocks
}

export function messageSpeech(content) {
  const plain = text => text.replace(/!?\[([^\]\n]+)\]\([^\s)]+\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')
  return messageBlocks(content).flatMap(block => block.type === 'table'
    ? block.rows.map(row => row.map((cell,i) => `${plain(block.header[i])}: ${plain(cell)}`).join('. ') + '.')
    : block.type === 'p' ? [plain(block.text)] : block.items.map(plain)).join('\n')
}
