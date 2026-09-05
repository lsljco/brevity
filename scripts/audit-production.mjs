import { execFileSync } from 'node:child_process'

const ALLOWED_IMAGE_SIZE_GHSAS=new Set(['GHSA-w3rx-r6r6-pgpr','GHSA-5p2g-fcmc-qvqq'])
const EXCEPTION_REVIEW_DATE='2026-10-01'
const today=process.env.BREVITY_AUDIT_DATE||new Date().toISOString().slice(0,10)

function auditJson(){
  try{return JSON.parse(execFileSync('npm',['audit','--omit=dev','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))}
  catch(error){const output=String(error.stdout||'').trim();if(!output)throw error;return JSON.parse(output)}
}
function advisoryId(via){const text=`${via?.url||''} ${via?.title||''}`;return [...ALLOWED_IMAGE_SIZE_GHSAS].find(id=>text.includes(id))||''}
function allowedHigh(name,entry){
  if(name==='image-size'){
    const advisories=(entry.via||[]).filter(item=>typeof item==='object'&&item.severity==='high')
    return advisories.length>0&&advisories.every(item=>ALLOWED_IMAGE_SIZE_GHSAS.has(advisoryId(item)))
  }
  if(name==='pptxgenjs')return (entry.via||[]).every(item=>item==='image-size'||(typeof item==='object'&&item.name==='image-size'))
  return false
}

const report=auditJson(),vulnerabilities=report.vulnerabilities||{},blocking=[]
for(const [name,entry] of Object.entries(vulnerabilities)){
  if(entry.severity==='critical')blocking.push(`${name}: critical vulnerability`)
  if(entry.severity==='high'&&!allowedHigh(name,entry))blocking.push(`${name}: unapproved high vulnerability`)
}
if(today>EXCEPTION_REVIEW_DATE&&Object.entries(vulnerabilities).some(([name,entry])=>entry.severity==='high'&&allowedHigh(name,entry)))blocking.push(`image-size exception expired on ${EXCEPTION_REVIEW_DATE}`)
if(blocking.length){console.error('Production dependency audit failed:');blocking.forEach(item=>console.error(`- ${item}`));process.exit(1)}
const allowed=Object.entries(vulnerabilities).filter(([name,entry])=>entry.severity==='high'&&allowedHigh(name,entry)).map(([name])=>name)
if(allowed.length)console.warn(`Approved temporary upstream exception through ${EXCEPTION_REVIEW_DATE}: ${allowed.join(', ')} (${[...ALLOWED_IMAGE_SIZE_GHSAS].join(', ')}). Brevity restricts sermon slide assets to generated PNG data; review or remove this exception when an upstream fixed dependency is installable.`)
const moderate=Object.entries(vulnerabilities).filter(([,entry])=>entry.severity==='moderate').map(([name])=>name)
if(moderate.length)console.warn(`Non-blocking moderate vulnerabilities remain: ${moderate.join(', ')}.`)
console.log('Production dependency audit gate passed.')
