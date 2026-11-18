import {test,expect} from '@playwright/test'
import {mockBackend} from './home-fixtures.mjs'
import {meetingPeriod} from '../src/finance/meetingPackets.js'
async function setup(page,info){
 await mockBackend(page)
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date()),previous=meetingPeriod('weekly','previous').from
 const values={lslj_finance_v9:{calendarDataVersion:6,accounts:[{id:'a',name:'Operating',type:'checking',balance:1000,plaidAccountId:'bank'}],transactions:[{id:'bill',name:'Utility payment',acct:'a',cat:'Utilities',type:'expense',amount:80,freq:'once',start:today}]},brevity_finance_meetings_v1:{openActions:[{id:'c1',text:'Review utility',owner:'Larry',due:today,status:'open',transactionId:'bill'},{id:'c2',text:'Call insurer',owner:'Terica',due:previous,status:'open'},{id:'c3',text:'Set a date',status:'open'}]},plaid_actuals_cache:[{id:'pay',name:'Payroll proof',category:'Income',accountId:'bank',date:previous,amount:-500},{id:'food',name:'Spending proof',category:'Food',accountId:'bank',date:previous,amount:120},{id:'refund',name:'Refund proof',accountId:'bank',date:previous,amount:-10},{id:'pending',name:'Pending must stay separate',accountId:'bank',date:previous,amount:999,pending:true},{id:'other',name:'Other account must stay separate',accountId:'outside',date:previous,amount:999}]}
 await page.route('**/.netlify/functions/household-state*',r=>r.fulfill({json:{records:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{key,value:JSON.stringify(value),version:1,updatedAt:new Date().toISOString()}])),serverTime:new Date().toISOString()}}))
 await page.route('**/.netlify/functions/finance-meeting-packet',r=>r.fulfill({status:503,json:{error:'Use retained fixture records'}}))
 await page.goto('/')
 const menu=async()=>{if(info.project.name==='iphone'&&!(await page.locator('#primary-navigation-drawer').getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Menu',exact:true}).click()}
 await menu();await page.getByRole('button',{name:'Finance',exact:true}).click();await menu();await page.getByRole('complementary',{name:'Primary navigation'}).getByRole('button',{name:'Meetings',exact:true}).click()
 if(info.project.name==='iphone'&&(await page.locator('#primary-navigation-drawer').getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Collapse navigation',exact:true}).click()
 await page.getByRole('button',{name:'Weekly',exact:true}).click()
}
test('meeting cards open exact commitments and posted transaction contributions',async({page},info)=>{
 await setup(page,info)
 await page.getByRole('button',{name:'View Open commitments records'}).click()
 let dialog=page.getByRole('dialog',{name:'Open commitments breakdown'})
 await expect(dialog.locator('.metric-drilldown-row')).toHaveCount(3)
 await expect(dialog).toContainText('Review utility');await expect(dialog).toContainText('Cash forecast:');await expect(dialog).toContainText('Call insurer');await expect(dialog).toContainText('Overdue');await expect(dialog).toContainText('Due date not set')
 await expect(dialog.locator('header > strong')).toHaveText('3')
 await dialog.getByRole('button',{name:'Close breakdown'}).click()
 for(const [card,title,total] of [['Posted income','Payroll proof','$500.00'],['Posted spending','Spending proof','$120.00'],['Weekly net cash flow','Refund proof','$390.00']]){
  await page.getByRole('button',{name:`View ${card} records`}).click();dialog=page.getByRole('dialog',{name:`${card} breakdown`})
  await expect(dialog).toContainText(title);await expect(dialog.locator('header > strong')).toHaveText(total)
  await expect(dialog).not.toContainText('Pending must');await expect(dialog).not.toContainText('Other account must')
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible()
 }
 await page.getByRole('button',{name:'View Open commitments records'}).click();await page.screenshot({path:info.outputPath('commitment-drilldown.png')})
})
test('Add to Budget opens an editable income or expense form and prepares the complete review',async({page},info)=>{
 await setup(page,info)
 let captured
 await page.route('**/.netlify/functions/brevity-assistant-actions*',async r=>{if(r.request().method()==='POST'){captured=r.request().postDataJSON();return r.fulfill({json:{proposal:{id:'budget-review',summary:'Review budget',operations:[],state:'pending'}}})}return r.fulfill({json:{history:[]}})})
 await page.getByRole('button',{name:'Add to Budget',exact:true}).click()
 const form=page.getByRole('form',{name:'Add to Budget'})
 await form.getByLabel('Type',{exact:true}).selectOption('income')
 await form.getByLabel('Item name').fill('Additional take-home')
 await form.getByLabel('Monthly budget amount ($)',{exact:true}).fill('500')
 await form.getByLabel('Budget month',{exact:true}).fill('2027-01')
 await form.getByLabel('Apply for').selectOption('repeat')
 await form.getByRole('button',{name:'Review budget item',exact:true}).click()
 await expect.poll(()=>captured?.operations?.length||captured?.proposal?.operations?.length||0).toBe(12)
 expect(captured.operations.every(op=>op.type==='budget.update'&&op.payload.direction==='income'&&op.payload.accountId==='a')).toBe(true)
 await expect(form).not.toBeVisible()
})
