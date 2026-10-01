import { execFileSync } from 'node:child_process'

function auditJson(){
  try{return JSON.parse(execFileSync('npm',['audit','--omit=dev','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))}
  catch(error){const output=String(error.stdout||'').trim();if(!output)throw error;return JSON.parse(output)}
}
const report=auditJson()
if(report.error || !report.vulnerabilities || !report.metadata?.vulnerabilities){
  console.error('Production dependency audit could not verify a complete npm audit report.');process.exit(1)
}
const vulnerabilities=report.vulnerabilities,blocking=[]
for(const [name,entry] of Object.entries(vulnerabilities)){
  if(entry.severity==='critical')blocking.push(`${name}: critical vulnerability`)
  if(entry.severity==='high')blocking.push(`${name}: high vulnerability`)
}
if(blocking.length){console.error('Production dependency audit failed:');blocking.forEach(item=>console.error(`- ${item}`));process.exit(1)}
const moderate=Object.entries(vulnerabilities).filter(([,entry])=>entry.severity==='moderate').map(([name])=>name)
if(moderate.length)console.warn(`Non-blocking moderate vulnerabilities remain: ${moderate.join(', ')}.`)
console.log('Production dependency audit gate passed.')
