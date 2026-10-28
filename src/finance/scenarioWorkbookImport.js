// Shared validation keeps workbook data in the private forecast resource only.
const text=(v,max=1000)=>{if(typeof v!=='string'||v.length>max)throw Error('Invalid scenario text.');return v}
const num=v=>{if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e12)throw Error('Invalid scenario amount.');return v}
const optional=v=>v==null?null:num(v)
const round=v=>Math.round((v+Number.EPSILON)*100)/100
export function validateScenarioImport(value){
 if(!value||value.sheet!=='Scenarios'||!Array.isArray(value.scenarios)||!value.scenarios.length||value.scenarios.length>24)throw Error('Choose a Scenarios sheet containing 1–24 scenarios.')
 const ids=new Set()
 const scenarios=value.scenarios.map(s=>{
  const source=s.source||s;const id=text(s.id,80);if(!/^workbook-[A-Z]+$/.test(id)||ids.has(id))throw Error('Duplicate or invalid scenario identity.');ids.add(id)
  if(!Array.isArray(s.incomes)||!s.incomes.length||s.incomes.length>20||!Array.isArray(source.schedule)||source.schedule.length>200)throw Error('Invalid income or payoff schedule.')
  const incomes=s.incomes.map((r,i)=>({id:`${id}-income-${i+1}`,description:text(r.description),monthlyNet:optional(r.monthlyNet),annualGross:optional(r.annualGross),contribution:optional(r.contribution),remote:r.remote===true?true:r.remote===false?false:null,employment:text(r.employment||''),notes:text(r.notes||''),workArrangement:text(r.workArrangement||'',80)}))
  if(incomes.some(r=>['monthlyNet','annualGross','contribution'].some(k=>r[k]!=null&&r[k]<0)))throw Error('Income assumptions cannot be negative.')
  const schedule=source.schedule.map(r=>{if(!Array.isArray(r)||r.length!==5||!/^\d{4}-\d{2}-\d{2}$/.test(r[0]))throw Error('Invalid payoff schedule row.');return[text(r[0],10),text(r[1]),num(r[2]),num(r[3]),text(r[4]||'')]})
  const summary={monthlyCashFlow:num(source.summary.monthlyCashFlow),annualCashFlow:num(source.summary.annualCashFlow),payoff:text(source.summary.payoff,100),minimumCash:num(source.summary.minimumCash),totalPaid:num(source.summary.totalPaid),unpaid:num(source.summary.unpaid),endingCash:num(source.summary.endingCash)}
  const planningExpense=num(s.planningExpense);if(planningExpense<0)throw Error('Scenario expenses cannot be negative.')
  if(Math.abs(round(incomes.reduce((n,r)=>n+(r.monthlyNet||0),0)-planningExpense)-round(summary.monthlyCashFlow))>.02)throw Error('Income and cashflow do not reconcile to the scenario baseline.')
  return{id,title:text(s.title,250),description:text(s.description||'',2000),planningExpense,incomes,source:{block:text(source.block,8),summary,schedule,notes:(source.notes||[]).slice(0,30).map(v=>text(v,1500))}}
 })
 return{sheet:'Scenarios',filename:text(value.filename,250),scenarios}
}
export function scenariosFromCells(cells,filename){
 const col=n=>{let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
 const date=v=>typeof v==='number'?new Date((v-25569)*86400000).toISOString().slice(0,10):String(v||'')
 const scenarios=[]
 for(let n=1;n<128;n+=8){
  const c=Array.from({length:7},(_,i)=>col(n+i)),v=(i,r)=>cells[`${c[i]}${r}`]??null
  if(v(0,3)!=='Description'||!v(0,2))continue
  const incomes=[]
  for(let r=4;r<16;r++)if(typeof v(0,r)==='string'&&v(0,r).trim()){
   const work=String(v(4,r)||'');incomes.push({description:v(0,r).trim(),monthlyNet:v(1,r),annualGross:v(2,r),contribution:v(3,r)==null?null:v(3,r)*100,remote:work==='Remote'?true:/onsite|on-site|in office/i.test(work)?false:null,workArrangement:work,employment:String(v(5,r)||''),notes:String(v(6,r)||'')})
  }
  const net=incomes.reduce((sum,r)=>sum+(r.monthlyNet||0),0)
  if(Math.abs(net-Number(v(1,16)))>.02)throw Error(`Scenario ${c[0]} income rows disagree with its saved total.`)
  const schedule=[]
  for(let r=29;r<214;r++)if(typeof v(0,r)==='number'&&typeof v(1,r)==='string'&&typeof v(2,r)==='number'&&typeof v(3,r)==='number')schedule.push([date(v(0,r)),v(1,r),v(2,r),v(3,r),String(v(4,r)||'')])
  const notes=[...new Set([v(3,20),v(4,21),v(3,22)].filter(x=>typeof x==='string'))]
  if(incomes.some(r=>r.monthlyNet==null||r.annualGross==null))notes.push('Some income assumptions are blank in the workbook. Blank amounts are excluded from totals, not confirmed as zero.')
  for(const r of [215,216,217,220,221,222,223,224,225,226,227]){
   const amount=r===215&&typeof v(2,19)==='number'?v(2,19):cells[`C${r}`]
   if(typeof amount==='number')notes.push(`${r===215?'Minimum cash reserve':cells[`B${r}`]}: $${amount.toFixed(2)}${r>=220?`; monthly cashflow released after payoff: $${Number(cells[`D${r}`]||0).toFixed(2)}`:''}`)
  }
  notes.push('Expense baseline derived from the saved total monthly net income minus the saved November cashflow. Contribution percentages are retained as supplied.')
  scenarios.push({id:`workbook-${c[0]}`,block:c[0],title:v(0,2).trim(),description:`Imported from Scenarios!${c[0]}2:${c[6]}213. November 2026 income and expense assumptions.`,planningExpense:round(net-v(2,18)),incomes,schedule,notes,summary:{monthlyCashFlow:v(2,18),annualCashFlow:v(5,18),payoff:date(v(2,20)),minimumCash:v(2,21),totalPaid:v(2,22),unpaid:v(2,23),endingCash:v(2,24)}})
 }
 return validateScenarioImport({sheet:'Scenarios',filename,scenarios})
}
export async function readScenarioWorkbook(file){
 if(file.size>20000000)throw Error('Choose a workbook smaller than 20 MB.')
 const {default:JSZip}=await import('jszip'),zip=await JSZip.loadAsync(await file.arrayBuffer())
 const xml=async path=>{const f=zip.file(path);if(!f)throw Error(`Workbook part missing: ${path}`);const s=await f.async('string');if(s.length>30000000)throw Error('Workbook sheet is too large.');return new DOMParser().parseFromString(s,'application/xml')}
 const workbook=await xml('xl/workbook.xml'),sheet=[...workbook.getElementsByTagName('sheet')].find(s=>s.getAttribute('name')==='Scenarios')
 if(!sheet)throw Error('The workbook must contain a tab named Scenarios.')
 const rels=await xml('xl/_rels/workbook.xml.rels'),rel=[...rels.getElementsByTagName('Relationship')].find(r=>r.getAttribute('Id')===sheet.getAttribute('r:id'))
 const target=rel?.getAttribute('Target')||'';if(!target||target.includes('..')||target.includes('://'))throw Error('Invalid worksheet path.')
 const shared=zip.file('xl/sharedStrings.xml')?await xml('xl/sharedStrings.xml'):null,strings=shared?[...shared.getElementsByTagName('si')].map(s=>[...s.getElementsByTagName('t')].map(t=>t.textContent).join('')):[]
 const data=await xml(target.startsWith('/')?target.slice(1):`xl/${target}`),cells={}
 for(const c of data.getElementsByTagName('c')){
  const ref=c.getAttribute('r');if(Number(ref?.match(/\d+$/)?.[0])>229)continue
  const raw=c.getElementsByTagName('v')[0]?.textContent,t=c.getAttribute('t')
  if(t==='e')throw Error(`The Scenarios sheet contains an Excel error at ${ref}.`)
  if(t==='s')cells[ref]=strings[Number(raw)];else if(t==='inlineStr')cells[ref]=c.getElementsByTagName('is')[0]?.textContent;else if(raw!=null&&raw!=='')cells[ref]=t==='str'?raw:Number(raw)
 }
 return scenariosFromCells(cells,file.name)
}
