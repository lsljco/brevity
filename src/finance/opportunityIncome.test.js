import test from 'node:test'
import assert from 'node:assert/strict'
import {OPPORTUNITY_SCENARIOS,opportunityMonthly,validateOpportunityIncome} from './opportunityIncome.js'
import {createWorkScenario,summarizeWorkScenario} from './workScenarios.js'
import {validateRecovery} from './recoveryScenario.js'
// Cached December 2027 balances from October 15 Models E/J/O/T/Y/AD/AI54.
const sourceClosings=[30579.32,38372.07636363637,61750.345454545444,38521.9370629371,49761.489510489526,109705.76923076922,59352.57426573428]
test('all eight October 15 templates preserve source timing, debt totals and isolated assumptions',()=>{
  assert.equal(OPPORTUNITY_SCENARIOS.length,8)
  OPPORTUNITY_SCENARIOS.forEach((s,i)=>{
    const a=createWorkScenario(s.id),before=JSON.stringify(a),p=summarizeWorkScenario(validateRecovery(a))
    assert.equal(JSON.stringify(a),before)
    assert.ok(before.length<12000)
    assert.equal(p.opening,17000);assert.equal(p.obligations,171202.35)
    assert.equal(p.rows.find(r=>r.id==='cash-2026-10').amount,6604.09)
    assert.equal(p.rows.find(r=>r.id==='tax-2026').month,'2026-12')
    assert.equal(p.rows.find(r=>r.id==='tax-2027').month,'2027-10')
    assert.equal(p.rows.find(r=>r.id==='income-tax').month,'2027-01')
    assert.equal(p.rows.filter(r=>r.id.startsWith('texas-')).length,0)
    assert.ok(p.rows.every(r=>r.classification==='hypothetical'))
    if(i<7)assert.ok(Math.abs(p.closing-sourceClosings[i])<=.071,`${s.title}: cents-only monthly rounding`)
  })
})
test('Phoenix exposes the source July shortfall and exact source ending balance',()=>{
  const p=summarizeWorkScenario(createWorkScenario('recovery-oct15-phoenix'))
  assert.equal(p.monthlyBefore,12726.97);assert.equal(p.closing,30579.32)
  assert.equal(p.rows.find(r=>r.id==='prosper-2').balance,-2717.94)
  assert.equal(p.negative,true)
})
test('Expedite remains unknown until compensation is supplied; zero is a deliberate valid assumption',()=>{
  const a=createWorkScenario('recovery-oct15-expedite'),p=summarizeWorkScenario(a)
  assert.equal(p.incomePending,true);assert.equal(p.closing,null);assert.equal(p.monthlyBefore,null)
  assert.equal(p.rows.find(r=>r.id==='cash-2026-10').balance,23604.09)
  assert.ok(p.rows.filter(r=>r.month>='2026-11').every(r=>r.balance===null))
  a.worksheet.opportunity.gross=55
  assert.equal(summarizeWorkScenario(a).closing,30579.32)
  a.worksheet.opportunity.gross=0
  assert.equal(summarizeWorkScenario(a).incomePending,false)
  assert.equal(summarizeWorkScenario(a).closing,-55141)
})
test('pay, retention, costs and contract months dynamically change projections without compounding income',()=>{
  const a=createWorkScenario('recovery-oct15-phoenix'),o=a.worksheet.opportunity
  o.gross=75;o.retention=.6;o.hours=40;o.weeks=52;o.costs=1000;o.start='2027-01';o.end='2027-02'
  assert.equal(opportunityMonthly(o).net,7800)
  const p=summarizeWorkScenario(a)
  assert.equal(p.rows.find(r=>r.id==='cash-2026-11').amount,6604.09)
  assert.equal(p.rows.find(r=>r.id==='cash-2027-01').amount,13404.09)
  assert.equal(p.rows.find(r=>r.id==='cash-2027-03').amount,6604.09)
  assert.equal(p.closing,-41541)
  assert.equal(summarizeWorkScenario(a).closing,p.closing)
  assert.equal(a.worksheet.rows.find(r=>r.id==='cash-2027-01').amount,6604.09)
})
test('opportunity validation rejects malformed or duplicated income assumptions',()=>{
  for(const update of [{retention:1.1},{gross:-1},{hours:Infinity},{basis:'weekly'},{start:'2027-13'},{end:'2026-10'},{actual:true}]){
    const a=createWorkScenario('recovery-oct15-phoenix')
    assert.throws(()=>validateOpportunityIncome({...a.worksheet.opportunity,...update}))
  }
  const a=createWorkScenario('recovery-oct15-phoenix')
  a.worksheet.rows.splice(5,0,{...a.worksheet.rows[4],id:'duplicate-month'})
  assert.throws(()=>summarizeWorkScenario(a),/one cash flow row/)
})
