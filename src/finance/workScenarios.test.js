import test from 'node:test'
import assert from 'node:assert/strict'
import {WORK_SCENARIOS,createWorkScenario,summarizeWorkScenario} from './workScenarios.js'
import {validateRecovery} from './recoveryScenario.js'
test('named work plans use the requested incomes and recompute source balances in cents',()=>{
  const expected=[56859,168859,161859]
  WORK_SCENARIOS.forEach((s,i)=>{
    const a=createWorkScenario(s.id),before=JSON.stringify(a),p=summarizeWorkScenario(validateRecovery(a))
    assert.equal(p.opening,17000);assert.equal(p.monthlyBefore,[14604.09,22604.09,29604.09][i]);assert.equal(p.closing,expected[i])
    assert.equal(p.rows.filter(r=>r.kind==='cashflow').length,15)
    assert.equal(p.rows.filter(r=>r.id.startsWith('tax-')).length,2)
    assert.equal(p.rows.filter(r=>r.id.startsWith('prosper-')).length,2)
    assert.equal(JSON.stringify(a),before)
    assert.ok(JSON.stringify(a).length<12000)
    assert.ok(p.rows.every(r=>r.classification==='hypothetical'))
  })
})
test('Vizient pairs wages with Texas and exposes the source payoff shortfall',()=>{
 const a=createWorkScenario('recovery-both-vizient'),p=summarizeWorkScenario(a)
 assert.equal(p.monthlyAfter,22104.09)
 const texas=p.rows.filter(r=>r.id.startsWith('texas-'))
 assert.equal(texas.length,14);assert.equal(texas[0].month,'2026-11')
 assert.equal(texas.reduce((s,r)=>s+r.amount,0),-105000)
 assert.equal(p.negative,true)
 const noTexas=summarizeWorkScenario({...a,worksheet:{...a.worksheet,rows:a.worksheet.rows.filter(r=>!r.id.startsWith('texas-'))}})
 assert.equal(noTexas.closing,266859)
 assert.match(a.worksheet.sourceNotes,/262,177.99/)
 assert.equal(p.rows.find(r=>r.id==='capital-one').month,'2026-12')
 assert.equal(summarizeWorkScenario(createWorkScenario('recovery-larry-work')).rows.find(r=>r.id==='capital-one').month,'2027-02')
})
