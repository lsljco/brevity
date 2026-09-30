import {useDailyPlan} from '../household/useDailyPlan.js'

export default function SavedTask({task,onClose}) {
  const {plan,state,error,reload}=useDailyPlan(task.date)
  const saved=plan.date===task.date ? plan.assignments?.find(item=>item.id===task.id) : null
  return <div className="brevity-action-center brevity-saved-task" role="dialog" aria-modal="true" aria-label="Saved task">
    <header><div><span>Daily plan · {task.date}</span><h3>Saved task</h3></div><button type="button" onClick={onClose} aria-label="Close saved task">Close</button></header>
    {state==='loading'?<p role="status">Loading the saved task…</p>:error?<div role="alert"><p>{error}</p><button type="button" onClick={reload}>Retry</button></div>:saved?<article>
      <h3>{saved.title}</h3><dl><dt>Assigned to</dt><dd>{saved.owner}</dd><dt>Date</dt><dd>{task.date}</dd><dt>Status</dt><dd>{saved.status}</dd></dl>
      {saved.notes&&<p>{saved.notes}</p>}<p>This is a daily-plan task. Creating it did not add a calendar event.</p>
    </article>:<p role="status">This task is no longer in the daily plan. It may have been undone or removed.</p>}
  </div>
}
