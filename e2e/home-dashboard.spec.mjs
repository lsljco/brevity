import {test,expect} from '@playwright/test'
import {mockBackend} from './home-fixtures.mjs'
async function openHome(page,testInfo,role='admin'){
 await mockBackend(page)
 await page.route('**/.netlify/functions/icloud-calendar*',route=>route.fulfill({json:{connected:true,syncedAt:new Date().toISOString(),events:[
 {id:'home-family',source:'icloud',appleCalendarId:'family',appleCalendarOwner:'Family',title:'Family planning together',date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date()),time:'11:00 AM',owner:'Family'},
 {id:'home-private',source:'icloud',appleCalendarId:'larry',appleCalendarOwner:'Larry',title:'Private work meeting',date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date()),time:'1:00 PM',owner:'Larry'}]}}))
 await page.route('**/.netlify/functions/weather*',route=>route.fulfill({json:{location:{name:'Johns Creek, GA'},current:{temperature:41,apparentTemperature:35,condition:'Clear'},day:{high:51,low:39,precipitationProbability:0},periods:[],isCurrentDay:true,updatedAt:new Date().toISOString()}}))
 await page.route('**/.netlify/functions/household-auth?action=session',route=>route.fulfill({json:{authenticated:true,member:'Larry',role,bootstrapRequired:false}}))
 await page.goto('/')
 await expect(page.locator('.app-shell')).toBeVisible()
 await expect(page.locator('.home-dashboard')).toBeVisible()
 await expect(page.locator('.home-main-meals')).toContainText('Eggs and Toast')
}
test('Home scopes private calendars, shows meals and routes to details',async({page},testInfo)=>{
 await openHome(page,testInfo)
 await expect(page.locator('.home-left')).toContainText('Family planning together')
 await expect(page.locator('.home-dashboard')).not.toContainText('Private work meeting')
 await page.getByRole('navigation',{name:'Home scope'}).getByRole('button',{name:'My day',exact:true}).click()
 await expect(page.locator('.home-left')).toContainText('Private work meeting')
 await expect(page.locator('.home-main-meals .home-meal')).toHaveCount(3)
 await expect(page.locator('.home-snacks .home-meal')).toHaveCount(2)
 await expect(page.locator('.home-financial')).toContainText('Operating cash')
 await expect(page.locator('.home-financial')).toContainText('freshness unverified')
 await page.getByRole('button',{name:'Open chores',exact:true}).click()
 await expect(page.getByRole('navigation',{name:'Household operating areas'})).toBeVisible()
})
test('Home visual audit in both themes',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await openHome(page,testInfo)
 const collapse=page.getByRole('button',{name:'Collapse navigation',exact:true});if(await collapse.isVisible())await collapse.click()
 for(const theme of ['dark','light']){
  await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme)
  await page.locator('.home-welcome').scrollIntoViewIfNeeded()
  await page.screenshot({path:testInfo.outputPath(`home-${theme}.png`),fullPage:true})
  for(const area of ['home-center','home-right','home-financial']){await page.locator('.'+area).scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath(`${area}-${theme}.png`)})}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  const overflow=await page.locator('.home-dashboard').evaluate(node=>[...node.querySelectorAll('.home-card,.home-meal,.home-weather')].filter(el=>el.scrollWidth>el.clientWidth+2).length)
  expect(overflow).toBe(0)
 }
 expect(errors).toEqual([])
})

test('Home keeps financial balances restricted to administrator access',async({page},testInfo)=>{
 await openHome(page,testInfo,'member')
 await expect(page.locator('.home-financial')).toHaveCount(0)
})

test('Home is the default after reload and Today notification links still open Today',async({page},testInfo)=>{
 await openHome(page,testInfo)
 await page.reload()
 await expect(page.locator('.home-dashboard')).toBeVisible()
 await page.goto('/?briefing=1#daily-briefing')
 await expect(page.locator('.today-dashboard')).toBeVisible()
 await expect(page.getByRole('region',{name:'Daily briefing'})).toBeVisible()
})

test('Home overview fits the tablet and desktop viewport',async({page},testInfo)=>{
 test.skip(testInfo.project.name==='iphone','Phone retains its scrolling layout')
 await openHome(page,testInfo)
 const collapse=page.getByRole('button',{name:'Collapse navigation',exact:true});if(await collapse.isVisible())await collapse.click()
 await expect.poll(()=>page.locator('.app-main').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(2)
 for(const selector of ['.home-banner','.home-left','.home-center','.home-right','.home-financial','.home-footer']){
  const box=await page.locator(selector).boundingBox()
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y+box.height).toBeLessThanOrEqual(page.viewportSize().height)
 }
 await page.locator('.home-outcomes').evaluate(el=>{for(let i=0;i<20;i++){const li=document.createElement('li');li.textContent='Additional household outcome '+i;el.append(li)}})
 await expect.poll(()=>page.locator('.app-main').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(2)
 await page.screenshot({path:testInfo.outputPath('home-one-screen.png')})
})

test('History and approvals live in Settings rather than the page toolbar',async({page},testInfo)=>{
 await openHome(page,testInfo)
 await expect(page.locator('.app-toolbar').getByText('Meeting History',{exact:true})).toHaveCount(0)
 await expect(page.locator('.app-toolbar .app-archive-entry')).toHaveCount(0)
 const menu=page.getByRole('button',{name:'Menu',exact:true})
 if(await menu.isVisible()){if(await menu.getAttribute('aria-expanded')==='false')await menu.click()}
 else {const expand=page.getByRole('button',{name:'Expand navigation',exact:true});if(await expand.isVisible())await expand.click()}
 await page.getByRole('button',{name:'Open settings',exact:true}).click()
 const collapse=page.getByRole('button',{name:'Collapse navigation',exact:true});if(await collapse.isVisible())await collapse.click()
 await page.locator('.settings-history > summary').click()
 await expect(page.locator('.settings-history')).toContainText('Meeting History')
 await page.getByRole('button',{name:'Browse archive history',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Household history archive'})).toBeVisible({timeout:15000})
})
