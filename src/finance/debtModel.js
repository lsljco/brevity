export const DEBT_STORAGE_KEY = 'brevity_finance_debts_v1'
export const DEBT_TYPES = ['Personal loan','Credit card','Student loan','Mortgage','Auto loan','Medical','Other']
export const DEBT_STATUSES = ['Active','Deferred','Paid off']
export const DEBT_INTEREST_METHODS = ['Amortized APR','Fixed interest per payment','Principal only']

const amount = value => Math.max(0, Number(value) || 0)
const cents = value => Math.round((Number(value) || 0) * 100) / 100
export function normalizeDebts(value) {
  return (Array.isArray(value) ? value : []).filter(item => item?.id).map(item => ({
    ...item,
    creditor:String(item.creditor || '').trim(), accountName:String(item.accountName || '').trim(),
    debtType:DEBT_TYPES.includes(item.debtType) ? item.debtType : 'Other',
    status:DEBT_STATUSES.includes(item.status) ? item.status : 'Active',
    originalBalance:amount(item.originalBalance), currentBalance:amount(item.currentBalance),
    interestRate:amount(item.interestRate), minimumPayment:amount(item.minimumPayment),
    interestMethod:DEBT_INTEREST_METHODS.includes(item.interestMethod) ? item.interestMethod : 'Amortized APR',
    paymentsPerYear:Number.isInteger(Number(item.paymentsPerYear)) && Number(item.paymentsPerYear) > 0 ? Number(item.paymentsPerYear) : 12,
    fixedInterestAmount:amount(item.fixedInterestAmount),
    dueDay:Number.isInteger(Number(item.dueDay)) ? Number(item.dueDay) : 0,
    paymentMatchText:String(item.paymentMatchText || '').trim(), notes:String(item.notes || '').trim(),
    paymentRule:item.paymentRule?.enabled ? {
      enabled:true,
      matchText:String(item.paymentRule.matchText || '').trim(),
      matchField:item.paymentRule.matchField === 'merchantName' ? 'merchantName' : 'originalStatement',
      matchMode:['contains','exactly','starts'].includes(item.paymentRule.matchMode) ? item.paymentRule.matchMode : 'contains',
      accountId:String(item.paymentRule.accountId || '').trim(),
      nonPrincipalAmount:cents(item.paymentRule.nonPrincipalAmount),
    } : null,
    payments:(Array.isArray(item.payments) ? item.payments : []).filter(payment=>payment?.transactionId).map(payment=>({
      ...payment,amount:amount(payment.amount),interest:cents(payment.interest),principal:cents(payment.principal),
      nonPrincipalAmount:cents(payment.nonPrincipalAmount),unappliedAmount:cents(payment.unappliedAmount),
      balanceBefore:cents(payment.balanceBefore),balanceAfter:cents(payment.balanceAfter),
    })),
  }))
}

const ruleText = (transaction, field) => String(field === 'merchantName'
  ? transaction?.merchant_name || transaction?.merchantName || transaction?.name || ''
  : transaction?.originalStatement || transaction?.original_description || transaction?.name || '').trim().toLowerCase()

export function debtRuleMatches(debt, transaction, localAccountId = '') {
  const rule=debt?.paymentRule
  if(!rule?.enabled || transaction?.pending || Number(transaction?.amount) <= 0)return false
  if(rule.accountId && rule.accountId !== localAccountId)return false
  const source=ruleText(transaction,rule.matchField),needle=String(rule.matchText||'').trim().toLowerCase()
  if(!needle)return false
  if(rule.matchMode==='exactly')return source===needle
  if(rule.matchMode==='starts')return source.startsWith(needle)
  return source.includes(needle)
}

export function matchingDebtRule(debts, transaction, localAccountId = '') {
  return normalizeDebts(debts).find(debt=>debt.status==='Active'&&debt.currentBalance>0&&debtRuleMatches(debt,transaction,localAccountId)) || null
}

export function calculateDebtPayment(debt, transaction, nonPrincipalAmount = 0) {
  const normalized=normalizeDebts([{...debt,id:debt?.id||'preview'}])[0]
  if(!normalized)throw new Error('Choose a current debt before calculating this payment.')
  const payment=cents(Math.abs(Number(transaction?.amount)||0)),other=cents(nonPrincipalAmount)
  if(payment<=0)throw new Error('A debt payment must be greater than zero.')
  if(other<0||other>payment)throw new Error('Escrow, fees, and other non-principal amounts must be between zero and the payment total.')
  const available=cents(payment-other)
  const calculatedInterest=normalized.interestMethod==='Fixed interest per payment'
    ? normalized.fixedInterestAmount
    : normalized.interestMethod==='Amortized APR'
      ? normalized.currentBalance*(normalized.interestRate/100/normalized.paymentsPerYear)
      : 0
  const interest=cents(Math.min(available,Math.max(0,calculatedInterest)))
  const principal=cents(Math.min(normalized.currentBalance,Math.max(0,available-interest)))
  const balanceAfter=cents(Math.max(0,normalized.currentBalance-principal))
  return{amount:payment,interest,principal,nonPrincipalAmount:other,unappliedAmount:cents(Math.max(0,payment-interest-principal-other)),balanceBefore:cents(normalized.currentBalance),balanceAfter}
}

export function debtSummary(debts) {
  const active=normalizeDebts(debts).filter(item=>item.status!=='Paid off')
  const totalDebt=active.reduce((sum,item)=>sum+item.currentBalance,0)
  const originalPrincipal=active.reduce((sum,item)=>sum+item.originalBalance,0)
  const monthlyMinimums=active.reduce((sum,item)=>sum+item.minimumPayment,0)
  const weightedApr=totalDebt ? active.reduce((sum,item)=>sum+(item.currentBalance*item.interestRate),0)/totalDebt : 0
  return {count:active.length,totalDebt,originalPrincipal,paidDown:Math.max(0,originalPrincipal-totalDebt),monthlyMinimums,weightedApr}
}

export function matchedDebtPayments(debt, transactions=[]) {
  const needle=String(debt?.paymentMatchText || '').trim().toLowerCase()
  if(!needle)return[]
  return transactions.filter(transaction=>{
    if(transaction?.pending)return false
    const text=[transaction.name,transaction.merchant_name,transaction.merchantName,transaction.originalStatement].filter(Boolean).join(' ').toLowerCase()
    return text.includes(needle) && Number(transaction.amount)>0
  }).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))
}

export function projectDebtPayoff(debts,{monthlyCapacity=0,reserve=0,strategy='highest-rate',maxMonths=360}={}){
  const rows=normalizeDebts(debts).filter(item=>item.status==='Active'&&item.currentBalance>0).map(item=>({...item,balance:item.currentBalance}))
  const available=Math.max(0,Number(monthlyCapacity)||0)-Math.max(0,Number(reserve)||0)
  if(!rows.length)return{months:0,totalInterest:0,available,completed:[],remaining:0}
  if(available<=0)return{months:null,totalInterest:0,available,completed:[],remaining:rows.reduce((s,d)=>s+d.balance,0)}
  let month=0,totalInterest=0;const completed=[]
  while(rows.some(item=>item.balance>0)&&month<maxMonths){month+=1;for(const item of rows){if(item.balance<=0)continue;const interest=item.balance*(item.interestRate/100/12);item.balance+=interest;totalInterest+=interest}let pool=available;for(const item of rows){if(item.balance<=0||pool<=0)continue;const paid=Math.min(item.balance,item.minimumPayment,pool);item.balance-=paid;pool-=paid;if(item.balance<=.005&&!completed.some(x=>x.id===item.id))completed.push({id:item.id,creditor:item.creditor,month,freedMinimum:item.minimumPayment})}if(pool>0){const candidates=rows.filter(item=>item.balance>0).sort(strategy==='lowest-balance'?(a,b)=>a.balance-b.balance:(a,b)=>b.interestRate-a.interestRate);for(const item of candidates){if(pool<=0)break;const paid=Math.min(item.balance,pool);item.balance-=paid;pool-=paid;if(item.balance<=.005&&!completed.some(x=>x.id===item.id))completed.push({id:item.id,creditor:item.creditor,month,freedMinimum:item.minimumPayment})}}}
  const remaining=rows.reduce((s,d)=>s+Math.max(0,d.balance),0)
  return{months:remaining>.01?null:month,totalInterest,available,completed,remaining}
}
