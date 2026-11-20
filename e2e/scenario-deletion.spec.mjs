import {test,expect} from '@playwright/test'
import {mockBackend} from './home-fixtures.mjs'
import {createStudio} from '../src/finance/scenarioStudioModel.js'
import {RECOVERY_DEFAULT} from '../src/finance/recoveryScenario.js'
import {ALL_WORK_SCENARIOS} from '../src/finance/workScenarios.js'
import {normalizeActionProposal} from '../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation} from '../netlify/lib/assistant-action-executor.mjs'

for(const kind of ['studio','income','recovery','template'])test(`delete ${kind} scenario by exact ID, cancel safely and retain deletion after reload`,async({page},info)=>{
 await mockBackend(page)
 const assumptions=createStudio({title:'Remove this Studio',incomes:[]},500,[],'2026-11-20')
 let state={scenarios:kind==='income'?[{id:'income-delete',title:'Remove this income',incomes:[]}]:[],studioPlans:kind==='studio'?[{id:'studio-delete',assumptions,baseline:assumptions},{id:'studio-keep',assumptions:{...assumptions,title:'Keep this Studio'},baseline:assumptions}]:[],recoveryPlans:kind==='recovery'?[{id:'recovery-delete',title:'Remove this recovery',assumptions:{...RECOVERY_DEFAULT,title:'Remove this recovery'}}]:[]},proposal,snapshot,version=1
 await page.route('**/.netlify/functions/household-state*',r=>r.fulfill({json:{records:{brevity_finance_scenarios_v1:{value:JSON.stringify(state),version,updatedAt:new Date().toISOString()}},serverTime:new Date().toISOString()}}))
 await page.route('**/.netlify/functions/brevity-assistant-actions*',async r=>{
  const action=new URL(r.request().url()).searchParams.get('action')
  if(action==='prepare-direct'){const b=r.request().postDataJSON();proposal=normalizeActionProposal({summary:b.summary,operations:[b.operation]},{member:'Larry',role:'admin'});return r.fulfill({json:{proposal}})}
  if(action==='execute'){snapshot=structuredClone(state);state=applyRecordOperation(state,proposal.operations[0]).after;version++;return r.fulfill({json:{proposal:{...proposal,state:'completed'},audit:{id:'delete-audit',operations:proposal.operations,undoAvailable:true}}})}
  return r.fallback()
 })
 async function open(){
  const menu=async()=>{if(info.project.name==='iphone'&&!(await page.locator('#primary-navigation-drawer').getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Menu',exact:true}).click()}
  await menu();await page.getByRole('button',{name:'Finance',exact:true}).click();await menu();await page.getByRole('complementary',{name:'Primary navigation'}).getByRole('button',{name:'Scenario Modeling',exact:true}).click()
  if(info.project.name==='iphone'&&(await page.locator('#primary-navigation-drawer').getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Collapse navigation',exact:true}).click()
 }
 await page.goto('/');await open()
 let panel=page.getByRole('region',{name:'Scenario Studio',exact:true}),title=kind==='studio'?'Remove this Studio':'Remove this income'
 if(kind==='recovery'||kind==='template'){
  await page.locator('.scenario-legacy > summary').click();panel=page.locator('.recovery-workspace')
  await page.getByLabel('Named scenario').selectOption(kind==='template'?ALL_WORK_SCENARIOS[0].id:'recovery-delete');title=kind==='template'?ALL_WORK_SCENARIOS[0].title:'Remove this recovery'
 }
 const remove=kind==='recovery'||kind==='template'?page.getByRole('button',{name:`Delete scenario ${title}`,exact:true}):panel.getByRole('button',{name:`Delete scenario ${title}`,exact:true})
 await remove.click()
 let review=page.getByRole('dialog',{name:'Review proposed Brevity changes'})
 await expect(review).toContainText(title);await review.getByRole('button',{name:'Cancel',exact:true}).click()
 expect(state.deletedScenarios).toBeUndefined()
 await remove.click();review=page.getByRole('dialog',{name:'Review proposed Brevity changes'})
 await review.getByRole('button',{name:'Apply approved changes',exact:true}).click()
 await expect.poll(()=>state.deletedScenarios?.includes(kind==='template'?`recovery:${ALL_WORK_SCENARIOS[0].id}`:`${kind}:${kind}-delete`)).toBe(true)
 if(kind==='studio'||kind==='income')await expect(page.getByLabel('Select scenario',{exact:true})).not.toContainText(title)
 expect(snapshot).toBeTruthy()
 await page.reload();await open()
 await expect(page.locator('body')).not.toContainText('Something went wrong')
 if(kind==='studio'){await expect(page.getByLabel('Select scenario',{exact:true})).toContainText('Keep this Studio');await expect(page.getByLabel('Select scenario',{exact:true})).not.toContainText(title)}
 if(kind==='income'){await expect(page.getByLabel('Select scenario',{exact:true})).toContainText('New scenario');await expect(page.getByLabel('Select scenario',{exact:true})).not.toContainText(title)}
 if(kind==='recovery'||kind==='template'){await page.locator('.scenario-legacy > summary').click();await expect(page.getByLabel('Named scenario')).not.toContainText(title)}
 if(kind==='template')await expect(page.getByRole('region',{name:'Return-to-work scenario comparison'})).not.toContainText(title)
})
