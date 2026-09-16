export const splitEditableLines = value => String(value ?? '').split('\n')

export const joinEditableLines = value => Array.isArray(value) ? value.join('\n') : ''

export const compactEditableLines = value => (Array.isArray(value) ? value : [])
  .map(item => String(item ?? '').trim())
  .filter(Boolean)

export const compactTitledItems = value => (Array.isArray(value) ? value : [])
  .map(item => {
    if (typeof item === 'string') return item.trim()
    return { ...item, title: String(item?.title ?? '').trim() }
  })
  .filter(item => typeof item === 'string' ? Boolean(item) : Boolean(item.title))
