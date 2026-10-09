export const ENHANCEMENT_STATUSES = ['Received','Under review','Planned','In progress','Available','Not planned']
export const ENHANCEMENT_AREAS = ['General','Today','Calendar','Meals','Fitness','Household','Education','Finance','Ministry','Voice']
export const canManageEnhancements = member => ['Larry','Terica'].includes(member)
export function similarRequests(text, rows) {
  const words = value => new Set(String(value).toLowerCase().match(/[a-z]{4,}/g) || [])
  const query = words(text)
  if (query.size < 2) return []
  return rows.map(row => { const tokens=words(`${row.title} ${row.description}`); const overlap=[...query].filter(word=>tokens.has(word)).length; return {row,score:overlap / Math.min(query.size,tokens.size||1),overlap} })
    .filter(item=>item.overlap>=2&&item.score>=.4).sort((a,b)=>b.score-a.score).slice(0,3).map(item=>item.row)
}
