import test from 'node:test'
import assert from 'node:assert/strict'
import {createStudio,projectStudio,validateStudio} from './scenarioStudioModel.js'
import {upgradeStudioPlan,savedScenarioCash} from './scenarioPayoffPlan.js'
const plan=()=>({...createStudio({title:'Income opportunity',incomes:[{id:'job',description:'LJ job',monthlyNet:8000}]},5000,[],'2026-01-01'),months:12,openingCash:24000})
const debt=(overrides={})=>({id:'card',name:'LJ Discover',balance:5000,payment:1000,apr:0,dueDay:1,include:true,method:'Principal only',...overrides})
const tax=(overrides={})=>({id:'tax',name:'Annual property tax',taxKind:'property-tax',amount:12000,frequency:'annual',start:'2026-10-01',end:'',enabled:true,...overrides})
test('monthly plan settles the full balance without deducting or releasing minimum payments',()=>{
 const a=plan();a.liabilities=[debt()];const r=projectStudio(a)
 assert.equal(r.payoffs[0].date,'2026-02-28');assert.equal(r.payoffs[0].amount,5000)
 assert.equal(r.months[0].cashFlow,3000);assert.equal(r.months[1].endingCash,25000)
 assert.equal(r.months[2].required,0);assert.equal(r.months[2].cashFlow,3000)
 assert.equal(r.lowest,24000);assert.equal(r.endingCash,55000)
 assert.equal(r.months.reduce((s,m)=>s+m.required+m.extra,0),5000)
})
test('reserve is rebuilt before extra payoff and edited floors delay it',()=>{
 const a=plan();a.openingCash=20000;a.liabilities=[debt({payment:0,balance:1000})]
 const r=projectStudio(a);assert.equal(r.months[0].extra,0);assert.match(r.months[0].reason,/Rebuilding/)
 assert.equal(r.payoffs[0].date,'2026-02-28')
 assert.equal(projectStudio({...a,cashFloor:30000}).payoffs[0].date,'2026-04-30')
})
test('future tax funding prevents an early debt payoff and pays annual bills in October and April',()=>{
 const a=plan();a.months=24;a.liabilities=[debt({balance:25000,payment:0})];a.expenses.push(tax(),tax({id:'income-tax',taxKind:'income-tax',name:'Income tax balance',amount:6000,start:'2026-04-01'}))
 const r=projectStudio(a)
 assert.ok(r.lowest>=24000);assert.equal(r.lateTaxes.length,0)
 assert.deepEqual(r.taxDeadlines.map(t=>t.dueDate),['2026-04-01','2026-10-01','2027-04-01','2027-10-01'])
 assert.equal(r.taxDeadlines[0].name,'2025 income tax payoff')
 assert.equal(r.months[3].income,8000);assert.equal(r.months[3].cashFlow,3000);assert.equal(r.months[3].taxes,6000)
 assert.ok(r.payoffs.find(p=>p.id==='card').date>'2026-10-31')
})
test('unfundable tax remains outstanding instead of spending protected reserves',()=>{
 const a=plan();a.months=1;a.expenses.push(tax({frequency:'once',start:'2026-01-15',amount:10000}))
 const r=projectStudio(a);assert.equal(r.months[0].taxes,0);assert.equal(r.unpaid,10000);assert.equal(r.endingCash,27000);assert.equal(r.lateTaxes.length,1)
 assert.match(r.months[0].reason,/Surplus held for property taxes/)
})
test('arrears and future annual taxes are distinct and all cash ledger rows reconcile',()=>{
 const a=plan();a.openingCash=40000;a.liabilities=[debt({id:'arrears',name:'2025 property tax',taxKind:'property-tax',dueDate:'2025-10-15',balance:5000,payment:0}),debt()];a.expenses.push(tax())
 const r=projectStudio(a);assert.equal(r.payoffs[0].name,'2025 property tax');assert.equal(r.taxDeadlines.length,2)
 let cash=a.openingCash;for(const row of r.ledger){cash=Math.round((cash+row.amount)*100)/100;assert.equal(row.cashBalance,cash);assert.ok(row.year&&row.month&&row.description)}
 assert.equal(cash,r.endingCash)
})
test('unknown opening cash never fabricates extra payments or balances',()=>{
 const a=plan();a.openingCash=null;a.liabilities=[debt({payment:0})];const r=projectStudio(a)
 assert.equal(r.payoffs.length,0);assert.equal(r.endingCash,null);assert.equal(r.ledger.every(r=>r.cashBalance===null),true)
})
test('paying a debt removes phantom future minimums from the affordability envelope',()=>{
 const a=plan();a.incomes[0].monthlyNet=5100;a.liabilities=[debt({balance:2000,payment:1000})];a.openingCash=27000
 const r=projectStudio(a);assert.equal(r.payoffs[0].date,'2026-01-31');assert.equal(r.months[0].endingCash,25100);assert.equal(r.months[1].cashFlow,100)
})
test('negative future cash flow prevents otherwise affordable extra settlement',()=>{
 const a=plan();a.openingCash=30000;a.incomes[0].end='2026-02-28';a.liabilities=[debt({balance:1000,payment:0})]
 assert.equal(projectStudio(a).payoffs.length,0)
})
test('excluded debts stay outstanding and minimums never reduce cash flow',()=>{
 const a=plan();a.start='2026-01-16';a.liabilities=[debt({balance:1500,payment:1000,include:false})]
 const r=projectStudio(a);assert.equal(r.months[0].income,8000);assert.equal(r.months[1].required,0);assert.equal(r.months[2].required,0)
 assert.equal(r.payoffs.length,0);assert.equal(r.unpaid,1500);assert.equal(r.months.every(m=>m.extra===0),true)
})
test('migration is a draft and preserves explicitly edited version-two reserve',()=>{
 const old={...plan(),cashFloor:9000};delete old.planningVersion
 assert.equal(upgradeStudioPlan(old).cashFloor,24000);assert.equal(old.cashFloor,9000)
 assert.equal(upgradeStudioPlan({...plan(),cashFloor:28000}).cashFloor,28000)
 assert.throws(()=>validateStudio({...plan(),projectionMode:'unknown'}),/projection/)
 const a=plan();a.liabilities=[debt({taxKind:'wrong'})];assert.throws(()=>validateStudio(a),/category/)
})
test('saved cash excludes missing or duplicate bank data and does not invent a reserve balance',()=>{
 assert.equal(savedScenarioCash([]),null)
 assert.equal(savedScenarioCash([{type:'savings',balance:24000}]),null)
 const account={type:'savings',plaidAccountId:'bank',plaidCurrentBalance:9000}
 assert.equal(savedScenarioCash([account]),9000);assert.equal(savedScenarioCash([account,account]),null)
})

test('current tax bills are not starved to save for a later unfundable tax bill',()=>{
 const a=plan();a.openingCash=34000;a.incomes[0].monthlyNet=5000
 a.expenses.push(tax({id:'due-now',frequency:'once',start:'2026-01-01',amount:10000}),tax({id:'future',amount:20000}))
 const r=projectStudio(a);assert.equal(r.months[0].taxes,10000);assert.equal(r.endingCash,24000);assert.equal(r.unpaid,20000)
})

test('monthly APR accrual is included once in the lump-sum settlement',()=>{
 const a=plan();a.openingCash=30000;a.liabilities=[debt({balance:1000,payment:100,apr:36.5,method:'Amortized APR'})]
 const r=projectStudio(a);assert.equal(r.months[0].required,0);assert.equal(r.months[0].extra,1031)
 assert.equal(r.months[0].endingCash,31969);assert.equal(r.months[1].required,0)
})

test('November 12 planning start retains the full six-income monthly rate',async()=>{
 const {studioMonthly}=await import('./scenarioStudioModel.js')
 const a=createStudio({title:'Six incomes',incomes:[8488,2736.12,5498,6374.32,3540,12089.2].map((monthlyNet,i)=>({id:`income-${i}`,description:`Income ${i}`,monthlyNet}))},25000,[],'2026-11-12')
 assert.equal(studioMonthly(a).income,38725.64)
 assert.equal(projectStudio(a).months[0].income,38725.64)
})

test('property tax wins over earlier income tax and an affordable liability',()=>{
 const a=plan();a.openingCash=26000;a.liabilities=[debt({id:'income',name:'Income tax',taxKind:'income-tax',dueDate:'2025-04-01',balance:1000,payment:0}),debt({id:'property',name:'Property tax',taxKind:'property-tax',dueDate:'2025-10-01',balance:7000,payment:0}),debt({balance:500,payment:0})]
 const r=projectStudio(a)
 assert.equal(r.months[0].taxes,0);assert.equal(r.months[0].extra,0)
 assert.match(r.months[0].reason,/held for property taxes/)
 assert.deepEqual(r.payoffs.slice(0,3).map(p=>p.id),['property','income','card'])
 assert.ok(r.lowest>=24000)
})
test('upcoming property-tax funding is protected before paying income-tax balances',()=>{
 const a=plan();a.months=1;a.openingCash=34000;a.incomes[0].monthlyNet=5000
 a.expenses.push(tax({amount:10000}))
 a.liabilities=[debt({name:'Income tax',taxKind:'income-tax',balance:5000,payment:0})]
 const r=projectStudio(a);assert.equal(r.months[0].taxes,0);assert.equal(r.endingCash,34000)
})

test('payoff highlights and non-tax milestone are emitted once with future annual taxes remaining',()=>{
 const a=plan();a.openingCash=30000;a.incomes[0].monthlyNet=5000
 a.incomes[0].monthlyNet=8000;a.liabilities=[debt({balance:500,payment:500})];a.expenses.push(tax({amount:10000}))
 const r=projectStudio(a),milestones=r.ledger.filter(row=>row.type==='milestone')
 assert.equal(milestones.length,1);assert.equal(milestones[0].date,'2026-01-31')
 assert.equal(milestones[0].amount,0);assert.equal(milestones[0].unpaidLiabilities,0)
 assert.equal(r.nonTaxDebtFree,'2026-01-31');assert.equal(r.debtFree,'2026-01-31')
 assert.equal(r.ledger.filter(row=>row.type==='payoff').length,2)
 assert.match(milestones[0].description,/All non-tax liabilities paid off/)
 assert.equal(projectStudio({...a,liabilities:a.liabilities.slice(1)}).ledger.some(r=>r.type==='milestone'),false)
})

 test('only explicit source dates prorate income, including days before planning start',()=>{
 const a=plan();a.start='2026-01-16';a.incomes[0].end='2026-01-10';
 assert.equal(projectStudio(a).months[0].income,2580.65)
 a.incomes[0].start='2026-01-20';a.incomes[0].end='2026-01-25';
 assert.equal(projectStudio(a).months[0].income,1548.39)
 a.incomes[0].start='2026-02-01';a.incomes[0].end='';
 assert.equal(projectStudio(a).months[0].income,0)
 })
 test('import preserves explicit source start and end dates',()=>{
 const a=createStudio({incomes:[{monthlyNet:3000,start:'2026-11-16',end:'2026-11-20'}]},0,[],'2026-11-12')
 assert.equal(a.incomes[0].start,'2026-11-16');assert.equal(a.incomes[0].end,'2026-11-20')
 assert.equal(projectStudio(a).months[0].income,500)
 })

test('legacy saved snapshot repairs inherited income dates without touching explicit dates or the source record',()=>{
 const a=createStudio({title:'Current State',incomes:[8488,2736.12,5498,6374.32,3540].map((monthlyNet,i)=>({id:`income-${i}`,monthlyNet}))},25000,[],'2026-11-12')
 delete a.incomeDateVersion;delete a.planningVersion
 for(const row of a.incomes){row.start=a.start;delete row.startDateSource}
 const fixed=upgradeStudioPlan(a)
 assert.equal(projectStudio(fixed).months[0].income,26636.44)
 assert.equal(a.incomes[0].start,'2026-11-12')
 assert.deepEqual(upgradeStudioPlan(fixed),fixed)
 a.incomes[0].startDateSource='explicit';a.incomes[1].start='2026-11-20';a.incomes[2].end='2026-11-15'
 const mixed=upgradeStudioPlan({...a,planningVersion:2})
 assert.equal(mixed.incomes[0].start,'2026-11-12');assert.equal(mixed.incomes[1].start,'2026-11-20')
 assert.equal(mixed.incomes[2].end,'2026-11-15')
 const current=createStudio({incomes:[{monthlyNet:3000,start:'2026-11-12'}]},0,[],'2026-11-12')
 assert.equal(upgradeStudioPlan(current).incomes[0].start,'2026-11-12')
})

test('changing monthly minimums cannot change monthly cash flow or lump-sum payoff dates',()=>{
 const a=plan();a.liabilities=[debt({payment:0})]
 const original=projectStudio(a);a.liabilities[0].payment=999999
 assert.deepEqual(projectStudio(a),original)
})

test('screenshot cash flow is net income minus full recurring expenses regardless of planning day',async()=>{
 const {studioMonthly}=await import('./scenarioStudioModel.js')
 const a=createStudio({incomes:[8488,2736.12,5498,6374.32,3540].map((monthlyNet,i)=>({id:`source-${i}`,monthlyNet}))},24331.10,[],'2026-11-12')
 a.openingCash=9000;a.liabilities=[debt({payment:2959.33,balance:10000})]
 for(const day of ['2026-11-01','2026-11-12','2026-11-30']){
  const plan={...a,start:day},summary=studioMonthly(plan),m=projectStudio(plan).months[0]
  assert.equal(summary.income,26636.44);assert.equal(summary.living,24331.10);assert.equal(summary.cashFlow,2305.34)
  assert.equal(m.income,summary.income);assert.equal(m.expenses,summary.living);assert.equal(m.cashFlow,summary.cashFlow)
 }
 a.expenses.push({id:'repair',name:'One-time repair',amount:500,frequency:'once',start:'2026-11-15',end:'',enabled:true})
 const r=projectStudio(a);assert.equal(r.months[0].cashFlow,2305.34);assert.equal(r.months[0].oneTime,500)
 assert.equal(r.months[0].endingCash,10805.34);assert.ok(r.ledger.some(row=>row.description==='November one-time expenses'&&row.amount===-500))
})

test('new snapshots retain recurring expense total without hidden debt adjustments',()=>{
 const a=createStudio({incomes:[{monthlyNet:26636.44}]},24331.10,[{id:'debt',status:'Active',currentBalance:10000,minimumPayment:2959.33,interestRate:0}], '2026-11-12')
 assert.equal(a.expenses[0].amount,24331.10);assert.equal(projectStudio(a).months[0].cashFlow,2305.34)
})
