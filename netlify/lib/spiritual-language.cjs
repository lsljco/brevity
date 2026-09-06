function sharedSpiritualText(value) {
  if (typeof value !== 'string') return value
  return value
    .replace(
      /Lorenzo owns this pillar and must lead the household in Scripture, devotion, prayer, and concrete obedience/gi,
      'Today’s spiritual focus is shared, while each household member remains responsible for their own response',
    )
    .replace(
      /Lorenzo owns this pillar and must lead the household/gi,
      'Today’s spiritual focus belongs to the household',
    )
    .replace(/Lorenzo owns this pillar/gi, 'This is a shared household pillar')
}

function sharedSpiritualValue(value) {
  if (Array.isArray(value)) return value.map(sharedSpiritualValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sharedSpiritualValue(item)]))
  }
  return sharedSpiritualText(value)
}

module.exports = { sharedSpiritualText, sharedSpiritualValue }
