const clean=value=>String(value||'').replace(/\s+/g,' ').trim()
const list=value=>Array.isArray(value)?value.filter(Boolean):value?[value]:[]

const isoDate=value=>{const match=String(value||'').match(/\d{4}-\d{2}-\d{2}/);return match?match[0]:''}
const addDays=(date,days)=>{const base=new Date(`${date}T12:00:00-04:00`);base.setDate(base.getDate()+days);return `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}-${String(base.getDate()).padStart(2,'0')}`}
const textFrom=value=>typeof value==='string'?clean(value):clean(value?.detail||value?.description||value?.text||value?.label||value?.stage)

export function buildSermonFormationCycle(notes={},source={}){
  const sermonDate=isoDate(source.sermonDate||notes.sermonDate)
  const rawDays=list(notes.sevenDayFormationPlan).slice(0,7)
  if(!sermonDate||!rawDays.length)return null
  const startDate=addDays(sermonDate,1)
  const days=rawDays.map((day,index)=>{
    const paragraphs=[...list(day?.description),...list(day?.paragraphs),...list(day?.details)].map(textFrom).filter(Boolean)
    const steps=[...list(day?.steps),...list(day?.actions),...list(day?.items)].map(textFrom).filter(Boolean)
    const scripture=clean(day?.scripture||day?.reference||day?.subtitle)
    return {
      day:index+1,
      date:addDays(startDate,index),
      title:clean(day?.title)||`Day ${index+1}`,
      scripture:scripture?[scripture]:[],
      devotionFocus:paragraphs.join('\n\n')||clean(day?.description||day?.detail),
      prayerFocus:steps.slice(0,3),
      discussionPrompts:list(day?.discussionPrompts).map(textFrom).filter(Boolean),
      obedienceAction:steps[0]||'',
      requiredOutput:steps[1]||steps[0]||'',
      practice:steps,
    }
  })
  return {sermonDate,startDate,endDate:days.at(-1)?.date||startDate,days}
}

export function devotionForDate(activeSermon,date){
  const cycle=activeSermon?.formationCycle
  const target=isoDate(date)
  if(!cycle?.days?.length||!target)return null
  const exact=cycle.days.find(day=>day.date===target)
  if(exact)return exact
  if(target<cycle.startDate)return cycle.days[0]
  return cycle.days.at(-1)
}

export function applySermonDevotion(spiritual={},activeSermon,date){
  const devotion=devotionForDate(activeSermon,date)
  if(!devotion)return spiritual
  return {
    ...spiritual,
    scripture:devotion.scripture,
    devotionFocus:devotion.devotionFocus,
    prayerFocus:devotion.prayerFocus,
    discussionPrompts:devotion.discussionPrompts,
    obedienceAction:devotion.obedienceAction,
    requiredOutput:devotion.requiredOutput,
    devotionDay:devotion.day,
    devotionDate:devotion.date,
    sermonNotes:activeSermon.sermonNotes,
    sermonSource:{...activeSermon.source,generatedAt:activeSermon.activatedAt,model:activeSermon.model,active:true,formationCycle:{startDate:cycle.startDate,endDate:cycle.endDate}},
  }
}
