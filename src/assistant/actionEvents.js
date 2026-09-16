export const ACTION_REVIEW_EVENT='brevity-action-review-requested'
export const ACTION_COMPLETED_EVENT='brevity-action-completed'

export function requestActionReview(proposal) {
  if(!proposal||typeof window==='undefined')return false
  window.dispatchEvent(new CustomEvent(ACTION_REVIEW_EVENT,{detail:{proposal}}))
  return true
}

export function publishActionCompleted(detail) {
  if(typeof window==='undefined')return
  window.dispatchEvent(new CustomEvent(ACTION_COMPLETED_EVENT,{detail}))
}
