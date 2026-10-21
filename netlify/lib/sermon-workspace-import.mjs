import { weekdayForDate, alignSermonDate } from './calendar-date.mjs'
const sections=[['opening_setup','Opening Setup'],['prayer','Prayer'],['set_the_text','Set the Text'],['exposition','Exposition'],['witness','Witness'],['revelation','Revelation'],['warning','Warning'],['affirmation','Affirmation'],['application','Application'],['closing_charge','Closing Charge'],['benediction','Benediction']]
const text=value=>String(value||'').trim()
const firstLine=value=>text(value).split(/\r?\n/).find(Boolean)?.slice(0,200)||''

export function importSermonFields({sermon,notes,rawText,sourceName}={}) {
  const builder=sermon&&typeof sermon==='object'&&!Array.isArray(sermon)?sermon:null
  if(!builder&&!text(rawText))throw Error('Paste text or select a sermon with content.')
  const manuscript=builder?sections.filter(([key])=>text(builder[key])).map(([key,label])=>`${label}\n${text(builder[key])}`).join('\n\n'):text(rawText)
  if(manuscript.length>150000||(!builder&&text(rawText).length>150000))throw Error('This sermon exceeds the 150,000 character import limit.')
  const title=text(builder?.sermon_title||builder?.title)||firstLine(rawText)||text(sourceName).replace(/\.(docx|pdf|txt|json)$/i,'')||'Imported Sermon'
  const date=text(builder?.date||builder?.serviceDate||builder?.service_date||builder?.sermon_date)
  if(date&&!weekdayForDate(date))throw Error('Supply the sermon date as YYYY-MM-DD.')
  return {
    date,serviceType:text(builder?.serviceType||builder?.service_type),
    seriesTitle:text(builder?.series),title:title.slice(0,200),bigIdea:text(builder?.big_idea),
    scripture:text(builder?.scripture_reference||notes?.scripture_reference||builder?.scripture),
    outline:manuscript,
    sourceNotes:builder?text(notes?.executiveSummary||notes?.summary):text(rawText),
    builderReview:builder?'Imported from Apostolic Sermon Builder. Review and approve before publishing.':'',
    sourceName:text(sourceName).slice(0,200),
  }
}

export function importedWorkspaceSermon({fields,sourceKey,member,seriesId,id,now}) {
  return alignSermonDate({id,seriesId,title:fields.title,date:fields.date||'',serviceType:fields.serviceType||'',status:'Draft',version:1,
    bigIdea:fields.bigIdea,scripture:fields.scripture,outline:fields.outline,sourceNotes:fields.sourceNotes,builderReview:fields.builderReview,
    approvedNotes:'',recordingUrl:'',transcript:'',publishedUrl:'',assets:[],sourceKey:sourceKey||'',sourceName:fields.sourceName,
    createdBy:member,updatedAt:now.toISOString()})
}
