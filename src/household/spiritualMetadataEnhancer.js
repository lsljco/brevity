const MONTHS={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12}
const pad=value=>String(value).padStart(2,'0')
const validDate=(year,month,day)=>{const date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?`${year}-${pad(month)}-${pad(day)}`:''}
const inferDate=text=>{
  const source=String(text||'')
  let match=source.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.]([0-2]?\d|3[01])\b/)
  if(match)return validDate(Number(match[1]),Number(match[2]),Number(match[3]))
  match=source.match(/\b(0?[1-9]|1[0-2])[-/.]([0-2]?\d|3[01])[-/.](20\d{2})\b/)
  if(match)return validDate(Number(match[3]),Number(match[1]),Number(match[2]))
  match=source.match(/\b(January|February|March|April|May|June|July|August|September|Sept|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+([0-2]?\d|3[01])(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i)
  if(match)return validDate(Number(match[3]),MONTHS[match[1].toLowerCase()],Number(match[2]))
  return ''
}
const inferService=(text,date)=>{
  const source=String(text||'')
  if(/\b(wednesday|midweek|mid-week|wednesday night connect)\b/i.test(source))return 'Wednesday'
  if(/\b(sunday|sunday service|sunday worship)\b/i.test(source))return 'Sunday'
  if(date){const day=new Date(`${date}T12:00:00`).getDay();if(day===0)return 'Sunday';if(day===3)return 'Wednesday';return 'Other'}
  return ''
}
const inferTitle=fileName=>String(fileName||'').replace(/\.(docx|pdf|txt|md|markdown|vtt|srt)$/i,'').replace(/^\s*(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})\s*[-–—]?\s*/,'').replace(/\s+Sermon(?:\s+Teaching)?\s+(?:Guide|Notes|Transcript)$/i,'').trim()
const setControlledValue=(element,value)=>{
  if(!element||!value||element.value===value)return
  const proto=element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype
  const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set
  if(setter)setter.call(element,value);else element.value=value
  element.dispatchEvent(new Event('input',{bubbles:true}))
  element.dispatchEvent(new Event('change',{bubbles:true}))
}
const applyMetadata=(input,text='')=>{
  const card=input.closest('.sermon-source-card')
  if(!card)return
  const combined=`${input.files?.[0]?.name||''}\n${String(text||'').slice(0,30000)}`
  const date=inferDate(combined)
  const service=inferService(combined,date)
  const labels=[...card.querySelectorAll('.sermon-source-meta label')]
  const serviceSelect=labels.find(label=>/service/i.test(label.textContent||''))?.querySelector('select')
  const dateInput=labels.find(label=>/sermon date/i.test(label.textContent||''))?.querySelector('input[type="date"]')
  const titleInput=labels.find(label=>/title/i.test(label.textContent||''))?.querySelector('input')
  setControlledValue(dateInput,date)
  setControlledValue(serviceSelect,service)
  const inferredTitle=inferTitle(input.files?.[0]?.name)
  if(titleInput&&!titleInput.value&&inferredTitle)setControlledValue(titleInput,inferredTitle)
}
const pollImportedText=input=>{
  let tries=0
  const timer=setInterval(()=>{
    tries+=1
    const card=input.closest('.sermon-source-card')
    const text=card?.querySelector('.transcript-paste textarea')?.value||''
    if(text.trim()){applyMetadata(input,text);clearInterval(timer)}
    else if(tries>=20)clearInterval(timer)
  },350)
}
const onUpload=async event=>{
  const input=event.target
  if(!(input instanceof HTMLInputElement)||!input.matches('.transcript-file-input'))return
  const file=input.files?.[0]
  if(!file)return
  try{
    if(/\.(txt|md|markdown|vtt|srt)$/i.test(file.name)){const text=await file.text();applyMetadata(input,text)}
    else applyMetadata(input,'')
  }catch{applyMetadata(input,'')}
  pollImportedText(input)
}
if(typeof document!=='undefined')document.addEventListener('change',onUpload,true)
