export function filterTypeaheadOptions(options = [], query = '') {
  const choices = []
  const seen = new Set()
  options.flat(Infinity).forEach(value => {
    const option = typeof value === 'string' ? value.trim() : ''
    const key = option.toLocaleLowerCase()
    if (!option || seen.has(key)) return
    seen.add(key)
    choices.push(option)
  })
  const needle = String(query || '').trim().toLocaleLowerCase()
  return needle ? choices.filter(option => option.toLocaleLowerCase().includes(needle)) : choices
}
