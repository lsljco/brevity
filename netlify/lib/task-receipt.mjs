// Destinations come from committed before/after records, never model prose.
export function savedTaskLinks(audit) {
  if (audit?.action !== 'execute' || audit.status !== 'completed' || audit.undoneAt) return []
  const dates = new Set((audit.operations || []).filter(op => op.type === 'assignment.create').map(op => op.targetDate))
  return (audit.changes || []).flatMap(change => {
    const date = change.resource?.startsWith('plan:') ? change.resource.slice(5) : ''
    if (!dates.has(date)) return []
    const previous = new Set((change.before?.assignments || []).map(item => item.id))
    return (change.after?.assignments || []).filter(item => !previous.has(item.id)).map(item => ({id:item.id,date,title:item.title,owner:item.owner || 'Family'}))
  })
}

export function taskReceiptText(links, member) {
  if (!links?.length) return ''
  return links.map(task => `Saved task “${task.title}” for ${task.owner} on ${task.date}.${task.owner === member ? ` Tasks dated today appear in Today → ${member}’s Actions.` : ' Open task to view its saved details.'} This task was not added to the calendar. To reserve time, ask me to schedule it.`).join(' ')
}
