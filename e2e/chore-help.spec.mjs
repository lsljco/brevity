import {test,expect} from '@playwright/test'
import {mockBackend} from './home-fixtures.mjs'
import {normalizeActionProposal} from '../netlify/lib/assistant-action-contract.mjs'
import {applyHouseholdRecordOperation} from '../src/household/householdActionModel.js'

for(const [member,owner] of [['Nyla','Javin'],['Javin','Isaiah'],['Isaiah','Nyla']])test(`${member} completes ${owner}'s chore with attributed credit and no sign-off permission`,async({page},info)=>{
 await mockBackend(page)
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date())
 let state={customChores:[{id:'peer-help',title:'Peer help test chore',date,owners:[owner],details:['Clean surface','Reset area'],zone:'Kitchen',signoffRequired:true}]},proposal
 await page.route('**/.netlify/functions/household-auth?action=session',r=>r.fulfill({json:{authenticated:true,member,role:'member',bootstrapRequired:false}}))
 await page.route('**/.netlify/functions/household-state*',r=>r.fulfill({json:{records:{brevity_household_maintenance_v1:{value:JSON.stringify(state),version:1,updatedAt:new Date().toISOString()}},serverTime:new Date().toISOString()}}))
 await page.route('**/.netlify/functions/brevity-assistant-actions*',async r=>{
  const action=new URL(r.request().url()).searchParams.get('action')
  if(action==='prepare-direct'){const body=r.request().postDataJSON();proposal=normalizeActionProposal({summary:body.summary,operations:body.operations||[body.operation]},{member,role:'member'});return r.fulfill({json:{proposal}})}
  if(action==='execute'){state=applyHouseholdRecordOperation(state,proposal.operations[0],{actor:member}).after;return r.fulfill({json:{proposal:{...proposal,state:'completed'},audit:{id:'completion',operations:proposal.operations}}})}
  return r.fallback()
 })
 await page.goto('/')
 const menu=async()=>{if(info.project.name==='iphone'&&!(await page.locator('#primary-navigation-drawer').getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Menu',exact:true}).click()}
 const open=async()=>{await menu();await page.getByRole('button',{name:'Household Management',exact:true}).click();await menu();await page.getByRole('complementary',{name:'Primary navigation'}).getByRole('button',{name:'Household Operations',exact:true}).click();if(info.project.name==='iphone'&&(await page.locator('#primary-navigation-drawer').getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Collapse navigation',exact:true}).click();await page.getByRole('button',{name:'Operations',exact:true}).click();await page.getByRole('button',{name:'Help a sibling',exact:true}).click()}
 await open()
 let task=page.locator('.maintenance-task').filter({hasText:'Peer help test chore'})
 await expect(task).toContainText(`Helping ${owner}`)
 await expect(task.getByRole('button',{name:'Edit details',exact:true})).toHaveCount(0)
 for(const box of await task.locator('.maintenance-checklist input').all())await box.check()
 await task.getByRole('button',{name:'Confirm complete',exact:true}).click()
 const review=page.getByRole('dialog',{name:'Review proposed Brevity changes'})
 await review.getByRole('button',{name:'Apply approved changes',exact:true}).click()
 await expect.poll(()=>Object.values(state.occurrences||{})[0]?.completedBy).toBe(member)
 await page.reload();await open()
 task=page.locator('.maintenance-task').filter({hasText:'Peer help test chore'})
 await expect(task).toContainText(`Completed by ${member} for ${owner}`)
 await expect(task).toContainText('Awaiting sign-off')
 await expect(task.getByRole('button',{name:'Review approval',exact:true})).toHaveCount(0)
 await expect(task.locator('.maintenance-owners')).toContainText(owner)
})
