import test from 'node:test'
import assert from 'node:assert/strict'
import {buildMetricTrends} from './metricTrends.js'
import {summarizeActualCashActivity} from './reportingData.js'
const range={from:'2026-09-07',to:'2026-09-13'}
test('hero graph ends at the displayed scheduled total, includes one-time items and respects skips',()=>{
 const scheduled=[{amount:100,type:'income',freq:'weekly',start:'2026-09-04'},{amount:250,type:'income',freq:'once',start:'2026-09-10'},{amount:90,type:'expense',freq:'once',start:'2026-09-08'},{amount:30,type:'expense',freq:'weekly',start:'2026-09-04',skips:['2026-09-11']}]
 const points=buildMetricTrends({scheduled,range})
 assert.deepEqual(points[0],{date:range.from,income:0,expenses:0,net:0})
 assert.deepEqual(points.at(-1),{date:range.to,income:350,expenses:90,net:260})
 assert.equal(points[1].net,-90)
})
test('posted graphs use the posted ledger, not scheduled amounts, and exclude pending rows',()=>{
 const actuals=[{date:'2026-09-08',amount:50},{date:'2026-09-09',amount:900,pending:true}]
 const points=buildMetricTrends({actuals,range,posted:true,scheduled:[{amount:999,type:'income',freq:'once',start:range.from}]})
 assert.deepEqual(points.at(-1),{date:range.to,...summarizeActualCashActivity([actuals[0]])})
 assert.equal(points.at(-1).expenses,50)
 assert.deepEqual(buildMetricTrends({actuals,range:{from:range.from,to:range.from},posted:true}),[])
})
