import {test,expect} from '@playwright/test'
import {mockBackend} from './home-fixtures.mjs'
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date())
async function setup(page){
 await mockBackend(page)
 const date=today(),actuals=Array.from({length:65},(_,i)=>({id:`bank-${i}`,name:`RaceTrac ${i}`,merchant_name:'RaceTrac',date,accountId:'bank',amount:20+i,pending:false,category:'TRANSPORTATION'})),finance={calendarDataVersion:6,accounts:[{id:'a1',name:'Operating Account',type:'checking',plaidAccountId:'bank',plaidType:'depository',plaidSubtype:'checking',plaidCurrentBalance:1000,balance:1000}],transactions:[{id:'fuel',name:'RaceTrac',cat:'Transportation',type:'expense',amount:100,acct:'a1',freq:'monthly',start:date}]}
 const values={lslj_finance_v9:finance,plaid_actuals_cache:actuals,lslj_tx_overrides_v1:{},lslj_tx_rules_v1:[],lslj_budget_v1:{}},records=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{key,value:JSON.stringify(value),version:key==='plaid_actuals_cache'?7:1,updatedAt:new Date().toISOString()}]))
 await page.route('**/.netlify/functions/household-state*',r=>r.fulfill({json:{records,serverTime:new Date().toISOString()}}))
 await page.route('**/.netlify/functions/plaid-transactions*',r=>r.fulfill({json:{transactions:actuals,errors:[],syncedAt:new Date().toISOString(),balanceSnapshot:{bank:1000}}}))
 await page.route('**/.netlify/functions/plaid-accounts*',r=>r.fulfill({json:{connected:true,accounts:[{accountId:'bank',name:'Checking',type:'depository',subtype:'checking',balance:1000,current:1000}],errors:[],syncedAt:new Date().toISOString()}}))
 const prepared=[],executed=[]
 await page.route('**/.netlify/functions/brevity-assistant-actions*',r=>{const action=new URL(r.request().url()).searchParams.get('action');if(action==='prepare-direct'){const body=r.request().postDataJSON();prepared.push(body);return r.fulfill({json:{proposal:{id:'fixture-review',summary:body.summary,actor:'Larry',actorRole:'admin',state:'pending',risk:'confirmation',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+1800000).toISOString(),operations:[{...body.operation,id:'op',domain:'finance',allowedScopes:['this-item'],defaultScope:'this-item',risk:'confirmation'}],expectedVersions:{}}}})}if(action==='execute')executed.push(r.request().postDataJSON());return r.fulfill({json:{member:'Larry',role:'admin',history:[],permissions:{Larry:{finance:true}}}})})
 await page.goto('/');await expect(page.locator('.home-dashboard')).toBeVisible()
 return {prepared,executed}
}
async function navigate(page,view){await expect(page.locator('.app-shell')).toBeVisible();const menu=page.getByRole('button',{name:'Menu',exact:true}),nav=page.getByRole('complementary',{name:'Primary navigation'});if(page.viewportSize().width<=760){await menu.waitFor({state:'visible'});if(await menu.getAttribute('aria-expanded')!=='true')await menu.click();await expect(nav).toHaveClass(/is-expanded/);}await nav.getByRole('button',{name:'Finance',exact:true}).click();await nav.getByRole('button',{name:view,exact:true}).click();const collapse=page.getByRole('button',{name:'Collapse navigation',exact:true});if(await collapse.isVisible())await collapse.click()}
test('Accounting categories are editable without a vendor and reconciliation has one export menu',async({page},info)=>{
 const {prepared,executed}=await setup(page);await navigate(page,'Accounting')
 await expect(page.getByRole('navigation',{name:'Accounting tabs'})).toBeVisible()
 await page.getByRole('textbox',{name:'Search categories'}).fill('Transportation')
 await page.getByRole('row').filter({hasText:'Transportation'}).getByRole('button',{name:'Edit',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Edit category'});await dialog.getByRole('textbox',{name:'Category name'}).fill('Fuel');await expect(dialog).toContainText('Vendor assignment is optional.');await expect(dialog).toContainText('65 retained bank transactions, 1 scheduled items, 0 rules, and 0 category budgets');await expect(dialog.getByRole('button',{name:'Create a separate category instead'})).toBeVisible()
 await page.screenshot({path:info.outputPath('category-editor.png')})
 await dialog.getByRole('button',{name:'Review changes',exact:true}).click();await expect.poll(()=>prepared.length).toBe(1)
 expect(prepared[0].operation.type).toBe('finance.category.save');expect(prepared[0].operation.payload.name).toBe('Fuel');expect(prepared[0].operation.payload.vendorId).toBeUndefined();expect(executed).toHaveLength(0)
 await page.reload();await navigate(page,'Accounting');await page.getByRole('navigation',{name:'Accounting tabs'}).getByRole('button',{name:'Reconcile',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Review your balances'})).toBeVisible();await expect(page.locator('.accounting-workspace .finance-export')).toHaveCount(1)
 await expect(page.getByRole('button',{name:'Review 0 recommended matches'})).toHaveCount(0)
 const exporter=page.locator('.accounting-workspace .finance-export');await exporter.locator('summary').click();await exporter.getByLabel('Export format').selectOption('csv');const downloaded=page.waitForEvent('download');await exporter.getByRole('button',{name:'Export',exact:true}).click();expect((await downloaded).suggestedFilename()).toMatch(/\.csv$/)
 await page.screenshot({path:info.outputPath('reconcile.png')})
})
test('bulk selection spans pages and prepares category-only changes for every selected id',async({page},info)=>{
 const {prepared,executed}=await setup(page);await navigate(page,'Transactions')
 await page.getByRole('button',{name:'Show posted bank activity',exact:true}).click()
 const ledger=page.getByRole('region',{name:'Bank transaction ledger'});await expect(ledger.getByRole('button',{name:'Select all 65 matching records'})).toBeVisible()
 await ledger.getByRole('checkbox',{name:'Select this page'}).check();await expect(ledger).toContainText('50 selected')
 await ledger.getByRole('button',{name:'Select all 65 matching records'}).click();await expect(ledger).toContainText('65 selected')
 await ledger.getByRole('button',{name:'Next',exact:true}).click();await expect(ledger.getByRole('checkbox',{name:/Select RaceTrac/}).first()).toBeChecked()
 await ledger.getByRole('button',{name:'Change category',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Change category',exact:true});await dialog.getByLabel('Category',{exact:true}).fill('Fuel')
 await expect(dialog).toContainText('Vendor assignment is optional.');await page.screenshot({path:info.outputPath('bulk-category.png')})
 await dialog.getByRole('button',{name:'Review changes'}).click();await expect.poll(()=>prepared.length).toBe(1)
 expect(prepared[0].operation.payload.transactionIds).toHaveLength(65);expect(prepared[0].operation.payload.category).toBe('Fuel');expect(prepared[0].operation.payload.vendorId).toBeUndefined();expect(executed).toHaveLength(0)
})
test('suggested category rules can be selected and reviewed without assigning a vendor',async({page})=>{
 const {prepared,executed}=await setup(page);await navigate(page,'Accounting')
 await page.getByRole('navigation',{name:'Accounting tabs'}).getByRole('button',{name:'Rules',exact:true}).click();await page.getByRole('button',{name:'Manage rules'}).click()
 const rules=page.getByRole('dialog',{name:'Categorization rules',exact:true});await rules.getByRole('button',{name:'Find suggested categories and vendors'}).click()
 const suggestions=rules.getByRole('region',{name:'Suggested categorization changes'});await suggestions.getByRole('checkbox',{name:'Select all suggestions',exact:true}).check()
 await expect(suggestions.getByRole('button',{name:'Review selected',exact:true})).toBeEnabled();await suggestions.getByRole('button',{name:'Review selected',exact:true}).click();await expect.poll(()=>prepared.length).toBe(1)
 expect(prepared[0].operations.length).toBeGreaterThan(0);expect(prepared[0].operations.every(op=>!op.payload.vendorId)).toBe(true);expect(executed).toHaveLength(0)
})

test('separate category leaves the existing category target out of the review',async({page})=>{
 const {prepared}=await setup(page);await navigate(page,'Accounting')
 await page.getByRole('textbox',{name:'Search categories'}).fill('Transportation')
 await page.getByRole('row').filter({hasText:'Transportation'}).getByRole('button',{name:'Edit',exact:true}).click()
 await page.getByRole('dialog',{name:'Edit category'}).getByRole('textbox',{name:'Category name'}).fill('Fuel')
 await page.getByRole('button',{name:'Create a separate category instead'}).click()
 await page.getByRole('dialog',{name:'Add category'}).getByRole('button',{name:'Review changes'}).click()
 await expect.poll(()=>prepared.length).toBe(1)
 expect(prepared[0].operation.targetId).toBe('')
 expect(prepared[0].operation.payload.category).toBeUndefined()
 expect(prepared[0].operation.payload.name).toBe('Fuel')
})
