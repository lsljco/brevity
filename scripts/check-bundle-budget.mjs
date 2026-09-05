import fs from 'node:fs'
import path from 'node:path'

const assetsDir=path.resolve('dist/assets')
if(!fs.existsSync(assetsDir)){console.error('dist/assets does not exist. Run the production build first.');process.exit(1)}
const files=fs.readdirSync(assetsDir).filter(file=>file.endsWith('.js'))
const bytes=file=>fs.statSync(path.join(assetsDir,file)).size
const budgets=[
  {label:'FinancePlanner',match:file=>file.startsWith('FinancePlanner-'),max:540*1024},
  {label:'application shell',match:file=>file.startsWith('index-'),max:250*1024},
]
let failed=false
for(const budget of budgets){
  const matches=files.filter(budget.match)
  if(!matches.length){console.error(`Bundle budget could not locate ${budget.label}.`);failed=true;continue}
  for(const file of matches){const size=bytes(file);if(size>budget.max){console.error(`${budget.label} exceeds its bundle budget: ${(size/1024).toFixed(1)} KiB > ${(budget.max/1024).toFixed(0)} KiB (${file}).`);failed=true}else console.log(`${budget.label}: ${(size/1024).toFixed(1)} KiB / ${(budget.max/1024).toFixed(0)} KiB budget.`)}
}
if(failed)process.exit(1)
console.log('Production bundle budget passed.')
