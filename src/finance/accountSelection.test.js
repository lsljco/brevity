import test from 'node:test'
import assert from 'node:assert/strict'
import { toggleFinanceAccountSelection } from './accountSelection.js'
import { cashForecastScope } from './calendarSemantics.js'
import { scopePlaidTransactionsByAccount } from './financeRefresh.js'
const accounts=[{id:'operating',type:'checking'},{id:'savings',type:'savings'},{id:'renovation',type:'checking'}]
test('Operating plus Savings excludes Renovation in scheduled and bank scopes',()=>{
 const original=new Set(['operating'])
 const selected=toggleFinanceAccountSelection(original,'savings',accounts)
 assert.deepEqual([...original],['operating'])
 assert.deepEqual([...selected],['operating','savings'])
 const plans=accounts.map(account=>({id:account.id,type:'expense',acct:account.id,amount:10}))
 const scope=cashForecastScope(accounts.filter(account=>selected.has(account.id)),plans.filter(tx=>selected.has(tx.acct)))
 assert.deepEqual(scope.transactions.map(tx=>tx.id),['operating','savings'])
 const actuals=accounts.map(account=>({id:account.id,accountId:`bank-${account.id}`,amount:10}))
 const bank=scopePlaidTransactionsByAccount(actuals,Object.fromEntries(accounts.map(account=>[`bank-${account.id}`,account.id])),selected,{includeUnmapped:false})
 assert.deepEqual(bank.included.map(tx=>tx.id),['operating','savings'])
})
test('All can exclude one account and selected chips can be removed independently',()=>{
 const selected=toggleFinanceAccountSelection(null,'renovation',accounts)
 assert.deepEqual([...selected],['operating','savings'])
 assert.deepEqual([...toggleFinanceAccountSelection(selected,'operating',accounts)],['savings'])
 assert.equal(toggleFinanceAccountSelection(selected,'renovation',accounts),null)
})
test('last account stays selected and unknown ids cannot expand the scope',()=>{
 assert.deepEqual([...toggleFinanceAccountSelection(new Set(['operating']),'operating',accounts)],['operating'])
 const selected=new Set(['operating'])
 assert.equal(toggleFinanceAccountSelection(selected,'unknown',accounts),selected)
})
