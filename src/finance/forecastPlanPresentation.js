// A category allocation is never evidence that a particular bank charge matched.
export function forecastPlanPresentation(plan, point) {
  const row=point?.realization?.find(item=>item.id===plan.id)
  const matched=Boolean(row?.statuses?.length && row.statuses.every(s=>['posted','pending'].includes(s.status)&&s.actualId))
  const pooled=Boolean(row?.categoryAllowance)
  return {matched,pooled,amount:pooled?Math.abs(row.delta):Number(plan.amount),label:matched?'Matched · ':pooled&&row.delta===0?'Category already spent · ':pooled&&Math.abs(row.delta)<Number(plan.amount)?'Remaining allowance · ':''}
}
