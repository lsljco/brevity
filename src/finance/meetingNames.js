export function canonicalMeetingNameText(value='') {
  return String(value)
    .replace(/\bJabin\b/g,'Javin')
    .replace(/\b(?:Tarrica|Tara)\b/g,'Terica')
}
