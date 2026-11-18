export function budgetItemOperations({line,name,category,direction,accountId,amount,month,repeat=false},createId=()=>crypto.randomUUID()){
 const value=Number(amount),title=String(name||'').trim(),cat=direction==='income'?'Income':String(category||'').trim()
 if(!title||!cat||!accountId||!['income','expense'].includes(direction)||amount===''||!Number.isFinite(value)||value<0||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Enter a name, category, account, month and non-negative budget amount.')
 if(line&&(line.accountId!==accountId||line.direction!==direction))throw Error('The selected budget item belongs to a different account or type.')
 const year=Number(month.slice(0,4)),start=Number(month.slice(5,7))-1,lineId=line?.id||`budget-item:${createId()}`
 return Array.from({length:repeat?12-start:1},(_,i)=>({type:'budget.update',targetId:lineId,description:`Set ${title} budget to $${value.toFixed(2)} for ${year}-${String(start+i+1).padStart(2,'0')}.`,payload:{lineId,recordId:line?.recordId||'',lineName:line?.name||title,category:line?.category||cat,direction,accountId,year,month:start+i,value}}))
}
