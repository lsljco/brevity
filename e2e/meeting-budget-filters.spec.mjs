import {test,expect} from '@playwright/test'
import {mockBackend} from './home-fixtures.mjs'
test('meeting monthly budgets filter actuals and preserve unclassified spending',async({page},info)=>{
 await mockBackend(page)
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date()),month=date.slice(0,7)
 const accounts=[{id:'a1',name:'Operating',type:'checking',balance:24000,plaidAccountId:'bank'}]
 const values={lslj_finance_v9:{calendarDataVersion:6,accounts,transactions:[]},lslj_budget_v1:{categoryLimits:{food:{accountId:'a1',month,category:'Food',amount:100},utilities:{accountId:'a1',month,category:'Utilities',amount:100}}},plaid_actuals_cache:[{id:'food',accountId:'bank',date,name:'Food purchase',category:'Food',amount:65},{id:'utilities',accountId:'bank',date,name:'Electric utility',category:'Utilities',amount:110},{id:'unclassified',accountId:'bank',date,name:'Unknown purchase',category:'Uncategorized',amount:40},{id:'income',accountId:'bank',date,name:'Payroll',category:'Income',amount:-2000}]}
 await page.route('**/.netlify/functions/household-state*',r=>r.fulfill({json:{records:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{key,value:JSON.stringify(value),version:1,updatedAt:new Date().toISOString()}])),serverTime:new Date().toISOString()}}))
 await page.goto('/')
 const menu=async()=>{if(info.project.name==='iphone'&&!(await page.locator('#primary-navigation-drawer').getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Menu',exact:true}).click()}
 await menu();await page.getByRole('button',{name:'Finance',exact:true}).click();await menu();await page.getByRole('complementary',{name:'Primary navigation'}).getByRole('button',{name:'Meetings',exact:true}).click()
 if(info.project.name==='iphone'&&(await page.locator('#primary-navigation-drawer').getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Collapse navigation',exact:true}).click()
 const panel=page.getByRole('region',{name:'Budget versus actual'})
 await expect(panel).toContainText('65.0%');await expect(panel).toContainText('110.0%')
 await panel.getByLabel('Budget category filter').selectOption('75');await expect(panel.getByRole('button',{name:'Food',exact:true})).toHaveCount(0);await expect(panel.getByRole('button',{name:'Utilities',exact:true})).toBeVisible()
 await expect(panel).toContainText('Unknown purchase')
 await panel.getByLabel('Budget category filter').selectOption('50');await expect(panel.getByRole('button',{name:'Food',exact:true})).toBeVisible()
 await panel.getByLabel('Budget activity').selectOption('income');await panel.getByLabel('Budget category filter').selectOption('all');await expect(panel).toContainText('$2,000.00');await expect(panel).toContainText('Unknown purchase')
 await panel.getByLabel('Budget activity').selectOption('expense');await panel.getByLabel('Budget category filter').selectOption('custom');await panel.getByLabel('More than (%)').fill('110');await expect(panel).toContainText('No categories match')
 await panel.getByLabel('Budget category filter').selectOption('all');await panel.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('budget-actual.png'),fullPage:true})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2)).toBe(false)
})
