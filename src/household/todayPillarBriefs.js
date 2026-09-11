const list=value=>Array.isArray(value)?value:[]
const text=value=>String(value||'').trim()
const itemTitle=item=>text(typeof item==='string'?item:item?.title||item?.name||item?.description)
const names=(items,limit=3)=>list(items).map(itemTitle).filter(Boolean).slice(0,limit)
const joined=items=>items.length?items.join(' · '):''

export function educationBrief(education={}) {
  const isaiah=education.isaiah||{}
  const practice=[
    Number(isaiah.readingMinutes)>0?`${Number(isaiah.readingMinutes)} min reading`:'',
    Number(isaiah.mathMinutes)>0?`${Number(isaiah.mathMinutes)} min math`:'',
  ].filter(Boolean)
  return {
    title:text(education.thinkTankTopic)||text(education.thinkTankDeliverable)||'Education plan not defined',
    detail:text(education.thinkTankDeliverable)||text(isaiah.notes)||joined(practice)||'No education topic, deliverable, or learning note is recorded for today.',
    meta:list(education.discussionPrompts).map(text).filter(Boolean).slice(0,2),
  }
}

export function financeBrief(finance={}) {
  const bills=names(finance.bills)
  const purchases=names(finance.purchases)
  const obligations=[...bills,...purchases].slice(0,3)
  const count=list(finance.bills).length+list(finance.purchases).length
  return {
    title:text(finance.requiredOutput)||text(finance.decisionRule)||(count?`${count} financial item${count===1?'':'s'} require review`:'Finance plan not defined'),
    detail:text(finance.discussionPrompt)||joined(obligations)||(count?'Open Finance to review the recorded items.':'No financial output, decision rule, bill, or purchase is recorded for today.'),
    meta:[list(finance.bills).length?`${list(finance.bills).length} bill${list(finance.bills).length===1?'':'s'}`:'',list(finance.purchases).length?`${list(finance.purchases).length} purchase decision${list(finance.purchases).length===1?'':'s'}`:''].filter(Boolean),
  }
}

export function ministryBrief(ministry={}) {
  const meetings=names(ministry.meetings)
  const followUps=names(ministry.fellowshipFollowUps)
  const prayers=names(ministry.prayerNeeds)
  const evidence=[...meetings,...followUps,...prayers]
  const remaining=joined(evidence.slice(text(ministry.contentFocus)?0:1,3))
  const recordedDetail=remaining||(meetings.length?'Meeting recorded for today.':followUps.length?'Fellowship follow-up recorded for today.':prayers.length?'Prayer need recorded for today.':'')
  return {
    title:text(ministry.contentFocus)||text(ministry.framework)||evidence[0]||'Ministry plan not defined',
    detail:text(ministry.framework)||recordedDetail||'No ministry focus, meeting, fellowship follow-up, or prayer need is recorded for today.',
    meta:[meetings.length?`${meetings.length} meeting${meetings.length===1?'':'s'}`:'',followUps.length?`${followUps.length} follow-up${followUps.length===1?'':'s'}`:'',prayers.length?`${prayers.length} prayer need${prayers.length===1?'':'s'}`:''].filter(Boolean),
  }
}
