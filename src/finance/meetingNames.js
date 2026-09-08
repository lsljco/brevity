export function canonicalMeetingNameText(value='') {
  return String(value)
    .replace(/\bJabin\b/gi,'Javin')
    .replace(/\b(?:Tarrica|Tara)\b/gi,'Terica')
}

export function canonicalMeetingAction(item={}){
  return{
    ...item,
    text:canonicalMeetingNameText(item.text),
    owner:canonicalMeetingNameText(item.owner),
    financialEffect:canonicalMeetingNameText(item.financialEffect),
  }
}

export function canonicalMeetingCorrection(item={}){
  return{
    ...item,
    label:canonicalMeetingNameText(item.label),
    value:typeof item.value==='string'?canonicalMeetingNameText(item.value):item.value,
    reason:canonicalMeetingNameText(item.reason),
    origin:canonicalMeetingNameText(item.origin),
  }
}

export function canonicalMeetingHistory(item={}){
  return{
    ...item,
    summary:canonicalMeetingNameText(item.summary),
    notes:canonicalMeetingNameText(item.notes),
    transcript:canonicalMeetingNameText(item.transcript),
  }
}
