import {test,expect} from '@playwright/test'
import {mockBackend} from './home-fixtures.mjs'

test('Home current balance and Finance available balance explain the same snapshot',async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.abort())
 await mockBackend(page)
 const data={calendarDataVersion:6,accounts:[{id:'a1',name:'Operating Account',type:'checking',balance:875,plaidAccountId:'bank',plaidType:'depository',plaidSubtype:'checking',plaidCurrentBalance:1000,plaidAvailableBalance:875}],transactions:[]}
 const values={lslj_finance_v9:data,plaid_actuals_cache:[]}
 await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{key,value:JSON.stringify(value),version:1,updatedAt:new Date().toISOString()}])),serverTime:new Date().toISOString()}}))
 await page.goto('/')
 const home=page.getByRole('region',{name:'Financial Snapshot'})
 await expect(home).toContainText('Operating cash · bank current')
 await expect(home).toContainText('$1,000.00')
 await expect(home).toContainText('holds and availability adjustments')
 await home.getByRole('button',{name:'Open financial snapshot'}).press('Enter')
 const position=page.getByRole('region',{name:'Financial position',exact:true})
 await expect(position.getByRole('button',{name:/Bank available balance/})).toContainText('$875.00')
 await page.getByText('Current and available cash explained',{exact:true}).press('Enter')
 const bridge=page.locator('details').filter({hasText:'Current and available cash explained'})
 await expect(bridge).toContainText('Bank current balance$1,000.00')
 await expect(bridge).toContainText('Available minus current-$125.00')
 await expect(bridge).toContainText('not an itemized transaction reconciliation')
})
