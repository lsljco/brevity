import {test,expect} from '@playwright/test'
import {mockBackend} from './home-fixtures.mjs'

test('Home current balance and Finance available balance explain the same snapshot',async({page,isMobile})=>{
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
 const open=home.getByRole('button',{name:'Open financial snapshot'})
 await expect(open).toBeVisible()
 const box=await open.boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44)
 if(isMobile)await open.tap();else await open.click()
 const position=page.getByRole('region',{name:'Financial position',exact:true})
 await expect(position.getByRole('button',{name:/Bank available balance/})).toContainText('$875.00')
 await page.getByText('Current and available cash explained',{exact:true}).press('Enter')
 const bridge=page.locator('details').filter({hasText:'Current and available cash explained'})
 await expect(bridge).toContainText('Bank current balance$1,000.00')
 await expect(bridge).toContainText('Available minus current-$125.00')
 await expect(bridge).toContainText('not an itemized transaction reconciliation')
})

test('manual cash evidence is not presented as a bank available balance',async({page,isMobile})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}))
 await mockBackend(page)
 const data={calendarDataVersion:6,accounts:[{id:'a1',name:'Operating Account',type:'checking',balance:100}],transactions:[]}
 const values={lslj_finance_v9:data,plaid_actuals_cache:[]}
 await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{key,value:JSON.stringify(value),version:1,updatedAt:new Date().toISOString()}])),serverTime:new Date().toISOString()}}))
 await page.goto('/')
 const home=page.getByRole('region',{name:'Financial Snapshot'})
 await expect(home).toContainText('Unavailable')
 const open=home.getByRole('button',{name:'Open financial snapshot'})
 if(isMobile)await open.tap();else await open.click()
 const position=page.getByRole('region',{name:'Financial position',exact:true})
 await expect(position.getByRole('button',{name:/Cash starting balance/})).toContainText('$100.00')
 await expect(position).not.toContainText('Bank available balance')
 const menu=page.getByRole('button',{name:'Menu',exact:true});if(await menu.isVisible())await menu.click()
 await page.getByRole('complementary',{name:'Primary navigation'}).getByRole('button',{name:'Dashboard',exact:true}).press('Enter')
 await expect(page.getByRole('button',{name:/Daily Financial Alignment/})).toContainText('Cash starting balance')
 await expect(page.getByRole('button',{name:/Daily Financial Alignment/})).not.toContainText('Operating available cash')
})
