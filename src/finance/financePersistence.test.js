import test from 'node:test'
import assert from 'node:assert/strict'
import { saveFinanceData } from './financeData.js'

function memoryStorage(){const data=new Map();return{getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value))}}

test('unreviewed Finance saves fail before changing canonical household state',()=>{
  const storage=memoryStorage()
  const data={calendarDataVersion:4,transactions:[{id:'income-1',type:'income',amount:2500}]}
  const result=saveFinanceData(storage,'lslj_finance_v9',data)
  assert.equal(result.ok,false)
  assert.equal(result.error.code,'ACTION_REVIEW_REQUIRED')
  assert.equal(result.record,null)
  assert.equal(storage.getItem('lslj_finance_v9'),null)
  assert.equal(storage.getItem('lslj_finance_v9_backup'),null)
})
