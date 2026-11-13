import test from 'node:test'
import assert from 'node:assert/strict'
import {nextHomeBill} from './nextHomeBill.js'
test('home next obligation ignores realized payments and finds next recurring bill',()=>{
 const finance={accounts:[{id:'a1',type:'checking'}],transactions:[{id:'rent',acct:'a1',type:'expense',name:'Rent',amount:1000,start:'2026-11-13',freq:'monthly'}]}
 assert.equal(nextHomeBill(finance,'2026-11-13').date,'2026-11-13')
 assert.equal(nextHomeBill(finance,'2026-11-13',[{id:'rent',status:'Posted'}]).date,'2026-12-13')
 assert.equal(nextHomeBill(null,'2026-11-13'),null)
})
