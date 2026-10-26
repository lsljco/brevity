// Only explicitly supplied report data is exported; never inspect storage or credentials.
export const columnLabel=value=>String(value).replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())
export function recordsSection(title,records=[],fields){
 const keys=fields||[...new Set(records.flatMap(row=>Object.keys(row||{})))].filter(key=>records.some(row=>row[key]===null||['string','number','boolean'].includes(typeof row[key])))
 return {title,columns:keys.map(key=>({key,label:columnLabel(key)})),rows:records.map(row=>keys.map(key=>row[key]??''))}
}
export function modelSections(model,title='Summary'){
 const sections=[],summary=[]
 for(const [key,value]of Object.entries(model||{})){
  if(Array.isArray(value)){
   if(value.every(row=>row&&typeof row==='object'&&!Array.isArray(row))){sections.push(recordsSection(`${title} · ${columnLabel(key)}`,value));value.forEach((row,index)=>{const nested=Object.fromEntries(Object.entries(row).filter(([,v])=>v&&typeof v==='object'));if(Object.keys(nested).length)sections.push(...modelSections(nested,`${columnLabel(key)} ${row.name||row.title||index+1}`))})}
   else sections.push({title:`${title} · ${columnLabel(key)}`,columns:[{label:'Item'}],rows:value.map(row=>[typeof row==='object'?JSON.stringify(row):row])})
  }else if(value&&typeof value==='object')sections.push(...modelSections(value,`${title} · ${columnLabel(key)}`))
  else summary.push([columnLabel(key),value??''])
 }
 return [{title,columns:[{label:'Metric'},{label:'Value'}],rows:summary},...sections].filter(s=>s.rows.length)
}
export function financeReport(title,model,notes=[]){return {title,notes,sections:modelSections(model)}}
export function transactionSection(rows=[],accounts=[],{scheduled=false}={}){const names=new Map(accounts.flatMap(a=>[[String(a.id),a.name],[String(a.plaidAccountId),a.name]]));return recordsSection(scheduled?'Scheduled transactions':'Bank transactions',rows.map(row=>({date:row.date||row.occurrenceDate||row.start,name:row.name||row.description,category:row.cat||row.category,vendor:row.vendorName||'Unassigned',account:names.get(String(row.acct||row.accountId))||row.accountName||row.accountId||row.acct||'',direction:row.type|| (Number(row.amount)<0?'income':'expense'),amount:Number(row.amount)||0,selectedPeriodAmount:scheduled||row.expenseKind==='planned'?Number(row.rangeAmount??Number(row.amount)*(row.occurrenceCount??1)):Number(row.amount)||0,status:scheduled||row.expenseKind==='planned'?'Scheduled':row.pending?'Pending':'Posted',frequency:row.freq||'',occurrences:row.occurrenceCount??'',id:row.id})),['date','name','category','vendor','account','direction','amount','selectedPeriodAmount','status','frequency','occurrences','id'])}
export function csvText(report){
 const cell=value=>{const raw=typeof value==='number'&&Number.isFinite(value)?String(value):String(value??'');const safe=typeof value==='string'&&/^[\s]*[=+@-]/.test(raw)?`'${raw}`:raw;return `"${safe.replaceAll('"','""')}"`}
 const rows=[[report.title],...(report.notes||[]).map(note=>[note]),...report.sections.flatMap(section=>[[],[section.title],section.columns.map(c=>c.label),...section.rows])]
 return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')
}
