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
test('Scenario counts full monthly income regardless of the November planning start',async({page},info)=>{
 await setup(page)
 const a=createStudio({title:'Six income audit',incomes:[8488,2736.12,5498,6374.32,3540,12089.2].map((monthlyNet,i)=>({id:`income-${i}`,description:`Income ${i+1}`,monthlyNet}))},25000,[],'2026-11-12')
 a.openingCash=24000;a.liabilities=[{id:'income-tax',name:'Income tax',taxKind:'income-tax',dueDate:'2026-04-15',balance:3000,payment:0,apr:0,dueDay:1,include:true,method:'Principal only'},{id:'property-tax',name:'Property tax',taxKind:'property-tax',dueDate:'2026-10-15',balance:30000,payment:0,apr:0,dueDay:1,include:true,method:'Principal only'},{id:'card',name:'Discover payoff audit',balance:1000,payment:0,apr:0,dueDay:1,include:true,method:'Principal only'}]
 const value={studioPlans:[{id:'studio-six',assumptions:a,baseline:a}]}
 await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records:{brevity_finance_scenarios_v1:{key:'brevity_finance_scenarios_v1',value:JSON.stringify(value),version:1,updatedAt:new Date().toISOString()}},serverTime:new Date().toISOString()}}))
 await page.goto('/');await finance(page,info,'Scenario Modeling')
 const studio=page.getByRole('region',{name:'Scenario Studio',exact:true})
 await studio.getByLabel('Select scenario',{exact:true}).selectOption('studio-six')
 for(const name of ['Overview','Income','Expenses','Liabilities','Forecast','Compare']){
  await studio.getByRole('navigation',{name:'Scenario Studio tabs'}).getByRole('button',{name,exact:true}).click()
  await expect(studio.locator('.studio-summary').first().locator('strong').first()).toHaveText('$38,725.64')
  await expect(studio.getByRole('note')).toHaveCount(0)
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
 await expect(studio.locator('.studio-summary').first().locator('strong').first()).toHaveText('$34,481.64')
 await expect(studio.getByRole('note')).toContainText('each source’s start and end dates')
 await studio.locator('.studio-summary').first().scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('monthly-income-reconciled.png')})
})
