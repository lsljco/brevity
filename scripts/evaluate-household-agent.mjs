import {writeFile} from 'node:fs/promises'
import {evaluationCases as cases,evaluateHouseholdCase} from '../netlify/lib/household-agent-evaluation.mjs'
const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1]
if(!args.includes('--live')){
  console.log(cases.map(item=>`${item.id}\t${item.pillar}\t${item.messages.at(-1).content}`).join('\n'))
  console.log('\nNo model calls made. Use --live --id CASE_ID or --live --all --out /absolute/report.json. Provider charges apply. No household records are read or written.')
  process.exit(0)
}
if(!process.env.OPENAI_API_KEY)throw Error('OPENAI_API_KEY is required for live evaluation. No evaluation was run.')
const selected=args.includes('--all')?cases:cases.filter(item=>item.id===value('--id'))
if(!selected.length)throw Error('Choose a known --id or explicitly use --all.')
const report=[]
for(const item of selected){
  report.push(await evaluateHouseholdCase(item))
  console.log(`${item.id}: ${report.at(-1).structuralPass?'structural checks passed; human review pending':'needs review'}`)
}
const out=args.includes('--out')?value('--out'):'/tmp/brevity-agent-evaluation.json'
await writeFile(out,JSON.stringify({generatedAt:new Date().toISOString(),syntheticData:true,productionWrites:false,model:process.env.BREVITY_AI_MODEL||'gpt-5.6',results:report},null,2)+'\n')
console.log(`Report: ${out}. Structural checks are not household pilot acceptance.`)
