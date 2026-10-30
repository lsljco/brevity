import test from 'node:test'
import assert from 'node:assert/strict'
import {merchantIdentity,transactionVendorHistory} from './vendorHistory.js'
test('merchant identity uses bank evidence and respects reviewed links',()=>{
 assert.equal(merchantIdentity({name:'POS AMZN 123'}),null)
 assert.equal(merchantIdentity({merchant_name:'E.E. Armored'}).key,merchantIdentity({merchant_name:'EE Armored'}).key)
 assert.equal(merchantIdentity({vendorId:'v',merchant_name:'Other'}).key,'vendor:v')
})
test('history separates pending and credits and counts other posted expenses once',()=>{
 const tx={id:'a',merchant_name:'Shop',date:'2026-10-01',amount:10}
 const rows=[tx,tx,{...tx,id:'p',pending:true,amount:20},{...tx,id:'b',pendingTransactionId:'p',amount:20},{...tx,id:'c',amount:-5},{...tx,id:'d',pending:true,amount:7},{...tx,id:'e',_deleted:true}]
 const h=transactionVendorHistory(tx,rows)
 assert.equal(h.rows.length,4);assert.equal(h.otherExpenses,1)
 assert.deepEqual(h.months,[{month:'2026-10',count:2,expenses:30,credits:5,average:15}])
})
