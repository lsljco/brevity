import test from 'node:test'
import assert from 'node:assert/strict'
import {householdCashControls,operatingSpendingSources} from './householdCashControls.js'
import {normalizeVendorPayload,applyVendorOperation,vendorForExpense} from './vendorModel.js'
const accounts=[{id:'op',name:'Operating Account',type:'checking',plaidType:'depository',plaidSubtype:'checking',plaidAccountId:'bank'},{id:'personal',name:'Personal Food',type:'checking',plaidType:'depository',plaidSubtype:'checking',plaidAccountId:'food'}]
test('household control scope excludes personal and unknown accounts while retaining dividend cash outflow',()=>{
 const source={accounts,scheduled:[],actuals:[{id:'div',accountId:'bank',date:'2026-10-09',amount:50,category:'TRANSFER_OUT',managementCategory:'Dividend Expense'},{id:'coffee',accountId:'food',date:'2026-10-09',amount:8,name:'Starbucks'},{id:'opcoffee',accountId:'bank',date:'2026-10-09',amount:12,name:'Starbucks'},{id:'unknown',accountId:'unknown',date:'2026-10-09',amount:900,name:'Starbucks'}]}
 const result=householdCashControls(source,{from:'2026-10-01',to:'2026-10-30'})
 assert.equal(result.dividendExpense,50);assert.equal(result.exceptions.length,1);assert.equal(result.exceptions[0].id,'opcoffee')
 assert.deepEqual(operatingSpendingSources(source).actuals.map(t=>t.id),['div','opcoffee'])
 assert.equal(householdCashControls({accounts:[],actuals:[]},{from:'2026-10-01',to:'2026-10-30'}).exceptionCount,null)
})
test('aliases recognize historical statement or merchant exactly, preserve explicit links, and reject ambiguity',()=>{
 const workspace={vendors:[{id:'a',name:'Armored',aliases:['EE Armored']},{id:'b',name:'Second',aliases:[]}],links:{'posted:explicit':'b'}}
 assert.equal(vendorForExpense(workspace,'posted',{id:'old',name:'EE Armored'}),'a')
 assert.equal(vendorForExpense(workspace,'posted',{id:'new',merchant_name:' ee   armored '}),'a')
 assert.equal(vendorForExpense(workspace,'posted',{id:'explicit',name:'EE Armored'}),'b')
 assert.equal(vendorForExpense(workspace,'posted',{id:'different',name:'EE Armored unfamiliar charge'}),'')
 workspace.vendors[1].aliases=['EE Armored']
 assert.equal(vendorForExpense(workspace,'posted',{id:'old',name:'EE Armored'}),'')
})
test('billing cycle fields validate dates and amounts while leaving unknown distinct from zero',()=>{
 const payload=normalizeVendorPayload('vendor.update',{statementDate:'2026-10-01',paymentDueDate:'2026-10-25',minimumDue:0,statementBalance:null,autopay:'minimum',aliases:['EE Armored']})
 assert.equal(payload.minimumDue,0);assert.equal(payload.statementBalance,null)
 assert.throws(()=>normalizeVendorPayload('vendor.update',{paymentDueDate:'2026-02-30'}))
 assert.throws(()=>normalizeVendorPayload('vendor.update',{minimumDue:-10}))
 assert.throws(()=>normalizeVendorPayload('vendor.update',{password:'not-allowed'}))
 const updated=applyVendorOperation({vendors:[{id:'v',name:'Vendor'}]}, {type:'vendor.update',targetId:'v',payload},()=> 'new')
 assert.equal(updated.vendors[0].paymentDueDate,'2026-10-25')
})
