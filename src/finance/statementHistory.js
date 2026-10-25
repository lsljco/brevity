// Statement rows are retained separately from Plaid. They fill older coverage
// only; once Plaid supplies an earlier boundary, overlapping statement dates
// are excluded from calculated totals, never silently added a second time.
export function mergeStatementHistory(bankRows=[],statementRows=[],accounts=[]){
 const earliest=new Map()
 for(const row of bankRows)if(!row.pending&&row.accountId&&row.date&&(!earliest.has(row.accountId)||row.date<earliest.get(row.accountId)))earliest.set(row.accountId,row.date)
 const included=statementRows.flatMap(row=>{
  const account=accounts.find(a=>a.id===row.localAccountId)
  if(!account?.plaidAccountId||earliest.has(account.plaidAccountId)&&row.date>=earliest.get(account.plaidAccountId))return []
  return [{...row,accountId:account.plaidAccountId,pending:false,source:'statement'}]
 })
 return [...included,...bankRows]
}
function csvRows(text){
 const rows=[];let row=[],field='',quoted=false
 for(let i=0;i<text.length;i++){
  const c=text[i]
  if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}
  else if(c===','&&!quoted){row.push(field);field=''}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field=''}
  else field+=c
 }
 if(quoted)throw Error('A quoted CSV field is not closed.')
 row.push(field);if(row.some(v=>v.trim()))rows.push(row)
 return rows
}
export function parseStatementCsv(text,{accountId,today,bankRows=[]}={}){
 if(text.length>200000)throw Error('Use a CSV smaller than 200 KB, up to 500 rows per review.')
 const parsed=csvRows(text.replace(/^\uFEFF/,'')),headers=(parsed.shift()||[]).map(v=>v.trim().toLowerCase())
 for(const key of ['date','description','amount'])if(!headers.includes(key))throw Error('CSV columns must include date, description, amount; category is optional.')
 if(!parsed.length||parsed.length>500)throw Error('Import 1–500 transactions per review.')
 let hash=2166136261;for(const c of text){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619)}
 const earliest=bankRows.filter(r=>!r.pending&&r.date).map(r=>r.date).sort()[0]
 return parsed.map((values,index)=>{
  const get=key=>(values[headers.indexOf(key)]||'').trim(),date=get('date'),amount=Number(get('amount')),name=get('description')
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(`${date}T12:00:00Z`))||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date||date>today||!get('amount')||!Number.isFinite(amount)||!name)throw Error(`Row ${index+2}: use a valid past ISO date, description and signed amount.`)
  if(earliest&&date>=earliest)throw Error(`Row ${index+2} overlaps retained bank coverage starting ${earliest}. Import only earlier dates to avoid duplicate cash movements.`)
  return {id:`statement:${accountId}:${(hash>>>0).toString(36)}:${index}`,localAccountId:accountId,date,name:name.slice(0,200),amount:Math.round(amount*100)/100,category:get('category')||'Other',pending:false,source:'statement'}
 })
}
