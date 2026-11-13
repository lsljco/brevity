import {txOccursOnDate,parseISODate} from '../finance/projection.js'
// Scheduled obligations are not a statement that a bank payment is outstanding.
export function nextHomeBill(finance,date,todayBills=[]){
 const accounts=new Set((finance?.accounts||[]).filter(account=>['checking','savings'].includes(account.type)).map(account=>account.id))
 const expenses=(finance?.transactions||[]).filter(item=>item.type==='expense'&&accounts.has(item.acct))
 const day=parseISODate(date)
 for(let offset=0;offset<31;offset++){
  const due=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`
  const item=expenses.find(item=>txOccursOnDate(item,day)&&!(offset===0&&todayBills.some(bill=>bill.id===item.id&&['Posted','Pending'].includes(bill.status))))
  if(item)return {title:item.name,date:due,amount:Number(item.amount)}
  day.setDate(day.getDate()+1)
 }
 return null
}
