import {test,expect} from '@playwright/test'
import {mockBackend} from './home-fixtures.mjs'
import {createEmptyDailyPlan} from '../src/household/dailyPlan.js'
import {createStudio} from '../src/finance/scenarioStudioModel.js'
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date())
async function setup(page){
 await mockBackend(page)
 if(process.env.PREVIEW_BASE_URL)await page.route('**/.netlify/scripts/cdp',r=>r.abort())
 await page.route('**/.netlify/functions/household-data*',route=>{
  const day=new URL(route.request().url()).searchParams.get('date')||today(),plan=createEmptyDailyPlan(day)
  const rows=Array.from({length:5},(_,i)=>({id:`o${i}`,title:`Saved outcome ${i+1}`,owner:['Terica','Lorenzo','Larry','Nyla','Family'][i],status:i===2?'complete':'pending',date:day}))
  plan.topPriorities=rows.slice(0,2);plan.household.priorities=rows
  return route.fulfill({json:{householdId:'lslj-family',plan}})
 })
}
async function finance(page,testInfo,view){
 const menu=async()=>{if(testInfo.project.name==='iphone'&&!(await page.locator('#primary-navigation-drawer').getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Menu',exact:true}).click()}
 await menu();await page.getByRole('button',{name:'Finance',exact:true}).click();await menu()
 await page.getByRole('complementary',{name:'Primary navigation'}).getByRole('button',{name:view,exact:true}).click()
 if(testInfo.project.name==='iphone'&&(await page.locator('#primary-navigation-drawer').getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Collapse navigation',exact:true}).click()
}
test('Home and Today expand to every saved outcome including the third and fifth',async({page},info)=>{
 await setup(page);await page.goto('/')
 await expect(page.locator('.home-outcomes li')).toHaveCount(5)
 const home=page.locator('.home-card').filter({has:page.getByRole('heading',{name:'Today’s Outcomes',exact:true})})
 await home.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('home-all-outcomes.png')})
 expect(await home.evaluate(el=>el.scrollHeight<=el.clientHeight+2)).toBe(true)
 await home.getByRole('button',{name:'Review outcomes',exact:true}).click()
 const scope=page.getByRole('region',{name:'Your day at a glance'}).getByRole('button',{name:'Household',exact:true});await scope.click()
 const outcomes=page.locator('#today-focus')
 await expect(outcomes.locator('ol li')).toHaveCount(5)
 await expect(outcomes).toContainText('Saved outcome 3');await expect(outcomes).toContainText('Completed')
 expect(await outcomes.evaluate(el=>el.scrollHeight<=el.clientHeight+2)).toBe(true)
 await outcomes.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('today-all-outcomes.png')})
})
test('Groceries stays a 300 scheduled expense despite recorded category purchases',async({page},info)=>{
 await setup(page)
 const date=today(),data={calendarDataVersion:6,accounts:[{id:'a1',name:'Operating',type:'checking',balance:1000,plaidAccountId:'bank',plaidType:'depository',plaidSubtype:'checking',plaidCurrentBalance:1000}],transactions:[{id:'groceries',name:'Groceries',type:'expense',cat:'Food',amount:300,acct:'a1',freq:'weekly',start:date}]}
 const values={lslj_finance_v9:data,plaid_actuals_cache:[{id:'purchase',name:'Food purchase',accountId:'bank',category:'Food',amount:350,date,pending:false}]}
 await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{key,value:JSON.stringify(value),version:1,updatedAt:new Date().toISOString()}])),serverTime:new Date().toISOString()}}))
 await page.goto('/');await finance(page,info,'Cash Forecast')
 const grocery=info.project.name==='iphone'?page.locator('.finance-calendar-mobile-agenda > [role="button"]').filter({hasText:'Groceries'}).first():page.locator('.finance-calendar-event').filter({hasText:'Groceries'}).first()
 await expect(grocery).toContainText('$300');await expect(grocery).not.toContainText('Category already spent');await expect(grocery).not.toContainText('$0')
 await grocery.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('grocery-scheduled-expense.png')})
})
test('Screenshot cash flow equals net income minus full recurring expenses on every tab',async({page},info)=>{
 await setup(page)
 const a=createStudio({title:'Six income audit',incomes:[8488,2736.12,5498,6374.32,3540].map((monthlyNet,i)=>({id:`income-${i}`,description:`Income ${i+1}`,monthlyNet}))},24331.10,[],'2026-11-12')
 delete a.incomeDateVersion;delete a.planningVersion
 for(const row of a.incomes){row.start=a.start;delete row.startDateSource}
 a.openingCash=24000;a.liabilities=[{id:'income-tax',name:'Income tax',taxKind:'income-tax',dueDate:'2026-04-15',balance:3000,payment:0,apr:0,dueDay:1,include:true,method:'Principal only'},{id:'property-tax',name:'Property tax',taxKind:'property-tax',dueDate:'2026-10-15',balance:30000,payment:0,apr:0,dueDay:1,include:true,method:'Principal only'},{id:'card',name:'Discover payoff audit',balance:1000,payment:900,apr:0,dueDay:1,include:true,method:'Principal only'}]
 const value={studioPlans:[{id:'studio-six',assumptions:a,baseline:a}]}
 await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records:{brevity_finance_scenarios_v1:{key:'brevity_finance_scenarios_v1',value:JSON.stringify(value),version:1,updatedAt:new Date().toISOString()}},serverTime:new Date().toISOString()}}))
 await page.goto('/');await finance(page,info,'Scenario Modeling')
 const studio=page.getByRole('region',{name:'Scenario Studio',exact:true})
 await studio.getByLabel('Select scenario',{exact:true}).selectOption('studio-six')
 for(const name of ['Overview','Income','Expenses','Liabilities','Forecast','Compare']){
  await studio.getByRole('navigation',{name:'Scenario Studio tabs'}).getByRole('button',{name,exact:true}).click()
  await expect(studio.locator('.studio-summary').first().locator('strong').first()).toHaveText('$26,636.44')
  await expect(studio.getByRole('note')).toHaveCount(0)
  await expect(studio.locator('.studio-summary').first()).toContainText('Monthly recurring expenses')
  await expect(studio.locator('.studio-summary').first().locator('strong').nth(1)).toHaveText('$24,331.10')
  await expect(studio.locator('.studio-summary').first()).not.toContainText('Taxes & deductions')
  await expect(studio.locator('.studio-summary').first()).toContainText('$26,636.44 − $24,331.10 = $2,305.34')
  if(name==='Overview'){
   await expect(studio.getByRole('row').filter({hasText:'Net cash flow'})).toContainText('$2,305.34')
   await studio.locator('.studio-summary').first().scrollIntoViewIfNeeded()
   await page.screenshot({path:info.outputPath('cashflow-formula.png')})
  }
  await expect(studio.locator('.studio-summary').first().locator('strong').nth(2)).toHaveText('$2,305.34')
  if(name==='Forecast'){
   await expect(studio).toContainText('Surplus held for property taxes')
   await expect(studio.locator('.studio-ledger .studio-milestone')).toHaveCount(1)
   await expect(studio.locator('.studio-ledger .studio-payoff')).toHaveCount(3)
   for(const theme of ['dark','light']){
    await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme)
    await studio.locator('.studio-milestone').scrollIntoViewIfNeeded()
    await page.screenshot({path:info.outputPath(`payoff-highlights-${theme}.png`)})
   }
  }
 }
 await studio.getByRole('navigation',{name:'Scenario Studio tabs'}).getByRole('button',{name:'Income',exact:true}).click()
 await studio.getByRole('button',{name:'Income 1',exact:true}).click()
 await studio.getByLabel('End date (optional)',{exact:true}).fill('2026-11-15')
 await expect(studio.locator('.studio-summary').first().locator('strong').first()).toHaveText('$22,392.44')
 await expect(studio.getByRole('note')).toContainText('each source’s start and end dates')
 await studio.getByLabel('End date (optional)',{exact:true}).fill('')
 await studio.getByLabel('First payment / effective date',{exact:true}).fill('2026-11-16')
 await expect(studio.locator('.studio-summary').first().locator('strong').first()).toHaveText('$22,392.44')
 await studio.locator('.studio-summary').first().scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('monthly-income-reconciled.png')})
})

test('Scenario adds dated payouts expenses and liabilities and edits payoff timing',async({page},info)=>{
 await setup(page)
 const a=createStudio({title:'Dated items audit',incomes:[{id:'salary',description:'Salary',monthlyNet:8000}]},5000,[],'2026-01-01')
 a.openingCash=24000;a.months=6
 const value={studioPlans:[{id:'studio-items',assumptions:a,baseline:a}]}
 await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records:{brevity_finance_scenarios_v1:{key:'brevity_finance_scenarios_v1',value:JSON.stringify(value),version:1,updatedAt:new Date().toISOString()}},serverTime:new Date().toISOString()}}))
 await page.goto('/');await finance(page,info,'Scenario Modeling')
 const studio=page.getByRole('region',{name:'Scenario Studio',exact:true})
 await studio.getByLabel('Select scenario',{exact:true}).selectOption('studio-items')
 await studio.getByRole('button',{name:'Add bonus payout',exact:true}).click()
 await studio.getByLabel('Payout description',{exact:true}).fill('February bonus')
 await studio.getByLabel('Net payout amount',{exact:true}).fill('7000')
 await studio.getByLabel('Payout date',{exact:true}).fill('2026-02-10')
 await expect(studio.locator('.studio-summary').first().locator('strong').nth(2)).toHaveText('$3,000.00')
 await studio.getByRole('button',{name:'Add projected expense',exact:true}).click()
 await studio.getByLabel('Name',{exact:true}).fill('Roof repair')
 await studio.getByLabel('Amount per occurrence',{exact:true}).fill('2000')
 await studio.getByLabel('First payment / effective date',{exact:true}).fill('2026-02-15')
 await studio.getByRole('button',{name:'Add liability',exact:true}).first().click()
 await studio.getByLabel('Name',{exact:true}).fill('Additional loan')
 await studio.getByLabel('Balance',{exact:true}).fill('4000')
 await studio.getByLabel('Planned payoff date (optional)',{exact:true}).fill('2026-03-12')
 const forecast=()=>studio.getByRole('navigation',{name:'Scenario Studio tabs'}).getByRole('button',{name:'Forecast',exact:true}).click()
 await forecast()
 await expect(studio.getByRole('row').filter({hasText:'2026-03-12'})).toContainText('Additional loan')
 await expect(studio.locator('.studio-ledger').getByRole('button',{name:'February bonus',exact:true})).toHaveCount(1)
 await expect(studio.locator('.studio-ledger').getByRole('button',{name:'Roof repair',exact:true})).toHaveCount(1)
 await studio.locator('.studio-ledger').getByRole('button',{name:'Additional loan payoff',exact:true}).click()
 await studio.getByLabel('Planned payoff date (optional)',{exact:true}).fill('2026-04-10')
 await forecast();await expect(studio.getByRole('row').filter({hasText:'2026-04-10'})).toContainText('Additional loan')
 await studio.locator('.studio-ledger').getByRole('button',{name:'February bonus',exact:true}).click()
 await studio.getByLabel('Net payout amount',{exact:true}).fill('8000')
 await studio.getByLabel('Payout date',{exact:true}).fill('2026-03-05')
 await forecast()
 await expect(studio.locator('.studio-ledger tbody tr').filter({hasText:'February bonus'})).toContainText('$8,000.00')
 await studio.locator('.studio-ledger').getByRole('button',{name:'February bonus',exact:true}).scrollIntoViewIfNeeded()
 await page.screenshot({path:info.outputPath('dated-scenario-items.png')})
 await expect(studio.locator('.studio-summary').first().locator('strong').nth(2)).toHaveText('$3,000.00')
})

test('Scenario comparison selection and drag priority are editable',async({page},info)=>{
 await setup(page)
 const a=createStudio({title:'Current State',incomes:[{monthlyNet:8000}]},5000,[],'2026-01-01');a.openingCash=24000;a.months=6;a.strategy='highest-apr'
 a.liabilities=['Property tax','Income tax','Card 1','Card 2','Card 3','Card 4','Card 5'].map((name,i)=>({id:`d${i}`,name,balance:100,payment:0,apr:0,dueDay:1,include:true,method:'Principal only'}))
 const b={...a,title:'Current State'},c={...a,title:'QTS opportunity'}
 const value={studioPlans:[{id:'studio-a',assumptions:a,baseline:a},{id:'studio-b',assumptions:b,baseline:b},{id:'studio-c',assumptions:c,baseline:c}]}
 await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records:{brevity_finance_scenarios_v1:{key:'brevity_finance_scenarios_v1',value:JSON.stringify(value),version:1,updatedAt:new Date().toISOString()}},serverTime:new Date().toISOString()}}))
 await page.goto('/');await finance(page,info,'Scenario Modeling')
 const studio=page.getByRole('region',{name:'Scenario Studio',exact:true}),tab=name=>studio.getByRole('navigation',{name:'Scenario Studio tabs'}).getByRole('button',{name,exact:true}).click()
 await studio.getByLabel('Select scenario',{exact:true}).selectOption('studio-a');await tab('Compare')
 await expect(studio.locator('.studio-comparison tbody tr')).toHaveCount(2)
 await studio.getByRole('button',{name:'Clear comparison',exact:true}).click();await expect(studio).toContainText('No scenarios selected')
 const add=async key=>{await studio.getByLabel('Scenario to add to comparison',{exact:true}).selectOption(key);await studio.getByRole('button',{name:'Add to comparison',exact:true}).click()}
 await add('scenario:studio-b');await add('scenario:studio-c');await expect(studio.locator('.studio-comparison tbody tr')).toHaveCount(2)
 await studio.getByRole('button',{name:/Remove Current State .* from comparison/}).click();await expect(studio.locator('.studio-comparison tbody tr')).toHaveCount(1)
 await add('scenario:studio-b');await expect(studio.locator('.studio-comparison tbody tr')).toHaveCount(2)
 await studio.locator('.studio-comparison').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('selected-comparison.png')})
 await page.reload();await finance(page,info,'Scenario Modeling');await tab('Compare');await expect(studio.locator('.studio-comparison tbody tr')).toHaveCount(2)
 await tab('Liabilities')
 const table=studio.locator('.studio-priority-table'),handle=table.getByRole('button',{name:'Drag Card 5 to reorder; arrow keys move priority',exact:true}),target=table.locator('[data-liability-id="d3"]')
 if(info.project.name==='iphone'){
  await handle.scrollIntoViewIfNeeded()
  const from=await handle.boundingBox(),to=await table.getByRole('button',{name:'Drag Card 4 to reorder; arrow keys move priority',exact:true}).boundingBox()
  const cdp=await page.context().newCDPSession(page)
  const point=(box)=>({x:box.x+box.width/2,y:box.y+box.height/2})
  const origin=point(from),destination=point(to)
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]})
  for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:origin.x+(destination.x-origin.x)*step/8,y:origin.y+(destination.y-origin.y)*step/8}]})
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  await expect(table.locator('tbody tr').nth(5)).toHaveAttribute('data-liability-id','d6')
  await cdp.detach()
  await studio.getByLabel('Priority for Card 5',{exact:true}).selectOption('d3')
 }else await handle.dragTo(target)
 await expect(table.locator('tbody tr').nth(3)).toHaveAttribute('data-liability-id','d6')
 await expect(studio.getByLabel('Payoff strategy',{exact:true})).toHaveValue('priority')
 await table.getByRole('button',{name:'Drag Card 5 to reorder; arrow keys move priority',exact:true}).press('ArrowUp')
 await expect(table.locator('tbody tr').nth(2)).toHaveAttribute('data-liability-id','d6')
 await table.getByRole('button',{name:'Drag Card 5 to reorder; arrow keys move priority',exact:true}).press('ArrowUp')
 await expect(table.locator('tbody tr').nth(0)).toHaveAttribute('data-liability-id','d0')
 await expect(table.locator('tbody tr').nth(1)).toHaveAttribute('data-liability-id','d1')
 await table.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('liability-priority.png')})
 await tab('Forecast');await expect(studio.locator('.studio-ledger .studio-payoff').nth(2)).toContainText('Card 5 payoff')
})
