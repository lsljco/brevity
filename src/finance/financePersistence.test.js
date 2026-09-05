import test from 'node:test'
import assert from 'node:assert/strict'
import { saveFinanceData } from './financeData.js'

function memoryStorage(){const data=new Map();return{getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value))}}

test('Finance saves prepare the canonical versioned household-state record',()=>{
  const storage=memoryStorage()
  const data={calendarDataVersion:4,transactions:[{id:'income-1',type:'income',amount:2500}]}
  const result=saveFinanceData(storage,'lslj_finance_v9',data)
  assert.equal(result.ok,true)
  assert.equal(result.record.key,'lslj_finance_v9')
  assert.equal(result.record.expectedVersion,0)
  assert.equal(storage.getItem('lslj_finance_v9'),JSON.stringify(data))
  assert.equal(storage.getItem('lslj_finance_v9_backup'),JSON.stringify(data))
})
