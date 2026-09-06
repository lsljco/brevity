const DAYPART_RANK = new Map([
  ['anchor', 0],
  ['focus', 1],
  ['flex', 2],
  ['winddown', 3],
])

export function canonicalDaypartId(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '')
}

export function orderDayparts(dayparts = []) {
  return dayparts
    .map((block, index) => ({ block, index }))
    .sort((left, right) => {
      const leftRank = DAYPART_RANK.get(canonicalDaypartId(left.block?.id || left.block?.label)) ?? 99
      const rightRank = DAYPART_RANK.get(canonicalDaypartId(right.block?.id || right.block?.label)) ?? 99
      return leftRank - rightRank || left.index - right.index
    })
    .map(({ block }) => block)
}
