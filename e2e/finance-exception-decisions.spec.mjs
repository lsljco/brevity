import {test,expect} from '@playwright/test'
import {mockBackend} from './home-fixtures.mjs'
import {normalizeActionProposal} from '../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation} from '../netlify/lib/assistant-action-executor.mjs'
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date())
async function setup(page){
 await mockBackend(page)
 const date=today(),source={accountId:'old-bank',institution:'Fixture Bank',name:'Family checking',mask:'2222',type:'depository',subtype:'checking'}
 let finance={calendarDataVersion:6,accounts:[{id:'a1',name:'Operating Account',type:'checking',plaidAccountId:'bank',plaidType:'depository',plaidSubtype:'checking',plaidCurrentBalance:1000,balance:1000},{id:'a2',name:'Family spending',type:'checking',institution:'Fixture Bank',mask:'2222',balance:0}],transactions:[{id:'internet',name:'Internet payment',type:'expense',cat:'Utilities',amount:100,acct:'a1',freq:'once',start:date},{id:'partial',name:'Synchrony card payment',type:'expense',cat:'Debt',amount:337,acct:'a1',freq:'monthly',start:date}]},version=1,proposal
 const rows=Array.from({length:55},(_,i)=>({id:`old-${String(i).padStart(2,'0')}`,name:`Group purchase ${i}`,date,accountId:'old-bank',amount:i+1,pending:i===0})),actuals=[...rows,{id:'internet-bank',name:'Internet payment',date,amount:100,pending:false,accountId:'bank'},{id:'partial-bank',name:'Synchrony',date,amount:321,pending:false,accountId:'bank'}]
 const prepared=[],executed=[]
 await page.route('**/.netlify/functions/household-state*',r=>r.fulfill({json:{records:{lslj_finance_v9:{value:JSON.stringify(finance),version,updatedAt:new Date().toISOString()},plaid_actuals_cache:{value:JSON.stringify(actuals),version:1,updatedAt:new Date().toISOString()},lslj_tx_overrides_v1:{value:'{}',version:1},lslj_tx_rules_v1:{value:'[]',version:1}},serverTime:new Date().toISOString()}}))
 await page.route('**/.netlify/functions/plaid-transactions*',r=>r.fulfill({json:{transactions:actuals,errors:[],syncedAt:new Date().toISOString()}}))
 await page.route('**/.netlify/functions/plaid-accounts*',r=>r.fulfill({json:{connected:true,accounts:[source],errors:[],syncedAt:new Date().toISOString()}}))
 await page.route('**/.netlify/functions/brevity-assistant-actions*',r=>{
  const action=new URL(r.request().url()).searchParams.get('action')
  if(action==='prepare-direct'){const b=r.request().postDataJSON();prepared.push(b);proposal=normalizeActionProposal({summary:b.summary,operations:b.operations||[b.operation]},{member:'Larry',role:'admin'});return r.fulfill({json:{proposal}})}
  if(action==='execute'){executed.push(r.request().postDataJSON());for(const op of proposal.operations)finance=applyRecordOperation(finance,op,()=>`new-${version++}`).after;version++;return r.fulfill({json:{proposal:{...proposal,state:'completed'},audit:{id:'exception-audit',operations:proposal.operations,undoAvailable:true}}})}
  return r.fulfill({json:{member:'Larry',role:'admin',history:[],permissions:{Larry:{finance:true}}}})
 })
 await page.goto('/');await expect(page.locator('.home-dashboard')).toBeVisible()
 return{prepared,executed,getFinance:()=>finance}
}
async function navigate(page){
 const nav=page.getByRole('complementary',{name:'Primary navigation'}),menu=page.getByRole('button',{name:'Menu',exact:true})
 if(page.viewportSize().width<=760&&await menu.getAttribute('aria-expanded')!=='true')await menu.click()
 await nav.getByRole('button',{name:'Finance',exact:true}).click();await nav.getByRole('button',{name:'Accounts',exact:true}).click()
 const collapse=page.getByRole('button',{name:'Collapse navigation',exact:true});if(await collapse.isVisible())await collapse.click()
}
test('bank groups open every transaction with search, pending filters and source-link review',async({page},info)=>{
 const state=await setup(page);await navigate(page)
 const review=page.getByRole('region',{name:'Review account links'})
 await review.getByRole('button',{name:/Bank group 1/}).click()
 let detail=page.getByRole('region',{name:'Bank group 1 transactions',exact:true})
 await expect(detail).toContainText('55 matching transactions')
 await expect(detail.locator('.match-group-ledger article')).toHaveCount(25)
 await detail.getByRole('button',{name:/Show more transactions/}).click();await detail.getByRole('button',{name:/Show more transactions/}).click()
 await expect(detail.locator('.match-group-ledger article')).toHaveCount(55)
 await detail.getByLabel('Find a transaction').fill('Group purchase 54');await expect(detail.locator('.match-group-ledger article')).toHaveCount(1)
 await detail.getByLabel('Find a transaction').fill('');await detail.getByLabel('Filter transaction status').selectOption('pending');await expect(detail.locator('.match-group-ledger article')).toHaveCount(1)
 await review.getByRole('button',{name:'Load bank details',exact:true}).click()
 detail=page.getByRole('region',{name:/Fixture Bank.*transactions/})
 await expect(detail.getByLabel('Household account for this bank group')).toHaveValue('a2')
 await detail.getByRole('button',{name:'Review selected account link'}).click()
 const dialog=page.getByRole('dialog',{name:'Review proposed Brevity changes'})
 await expect(dialog).toContainText('Family spending');expect(state.prepared.at(-1).operation.type).toBe('finance.account.link');expect(state.executed).toHaveLength(0)
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();expect(state.getFinance().accounts[1].plaidAccountId).toBeUndefined()
 await page.screenshot({path:info.outputPath('group-records.png')})
})
test('exceptions support dismiss, accept, final approval and partial-payment protection',async({page},info)=>{
 const state=await setup(page);await navigate(page)
 await page.getByRole('region',{name:'Review account links'}).getByRole('button',{name:'Review exceptions',exact:true}).click()
 let panel=page.getByRole('region',{name:'Exception decisions'})
 await panel.getByRole('button',{name:/Dismiss match for Internet payment/}).click();expect(state.prepared).toHaveLength(0);expect(state.executed).toHaveLength(0)
 await page.reload();await navigate(page);await page.getByRole('region',{name:'Review account links'}).getByRole('button',{name:'Review exceptions',exact:true}).click()
 panel=page.getByRole('region',{name:'Exception decisions'})
 await expect(panel.getByRole('button',{name:/Accept match for Internet payment/})).toHaveCount(0)
 await panel.getByLabel('Show dismissed transaction suggestions').check()
 await expect(panel).toContainText('Payment is $16.00 below the planned amount.')
 await expect(panel.getByRole('button',{name:/Accept match for Synchrony/})).toHaveCount(0)
 await panel.getByRole('button',{name:/Accept match for Internet payment/}).click()
 const dialog=page.getByRole('dialog',{name:'Review proposed Brevity changes'})
 await expect(dialog).toContainText('Internet payment');expect(state.executed).toHaveLength(0)
 await dialog.getByRole('button',{name:'Apply approved changes',exact:true}).click()
 await expect.poll(()=>state.executed.length).toBe(1)
 await expect(dialog).not.toBeVisible()
 expect(state.getFinance().transactions.find(t=>t.id==='internet').reconciliation.actualId).toBe('internet-bank')
 expect(state.getFinance().transactions.find(t=>t.id==='partial').amount).toBe(337)
 await page.screenshot({path:info.outputPath('actionable-review.png')})
})
