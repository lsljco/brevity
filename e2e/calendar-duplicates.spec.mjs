import {test,expect} from '@playwright/test'
import {mockBackend} from './home-fixtures.mjs'

test('Home shows one row per linked Apple occurrence after daily-plan and calendar refreshes',async({page},info)=>{
 await mockBackend(page)
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date())
 const common={source:'icloud',appleCalendarId:'family',appleCalendarOwner:'Family',owner:'Family',date}
 const events=[
  {...common,id:'interview',title:'NS- Interview w/ Ampact',time:'2:00 PM'},
  {...common,id:'lesson',title:'Review Isaiah Lesson Plan',time:'2:00 PM'},
  {...common,id:'tutor::today',sourceId:'tutor-source',recurring:true,title:'Isaiah Daily Tutor',owner:'Nyla',time:'2:45 PM'},
 ]
 const appointments=[
  {...events[0],startTime:events[0].time},
  {id:'icloud-interview',calendarEventId:'interview',calendarSource:'icloud',appleCalendarId:'family',appleCalendarOwner:'Family',owner:'Family',date,title:events[0].title,startTime:'14:00'},
  {id:'icloud-lesson',calendarEventId:'lesson',calendarSource:'icloud',appleCalendarId:'family',appleCalendarOwner:'Family',owner:'Family',date,title:events[1].title,startTime:'14:00'},
  {id:'saved-tutor',calendarSourceId:'tutor-source',calendarSource:'icloud',appleCalendarId:'family',appleCalendarOwner:'Family',owner:'Nyla',recurring:true,date,title:events[2].title,startTime:'14:45'},
 ]
 await page.route('**/.netlify/functions/household-data*',r=>r.fulfill({json:{householdId:'lslj-family',plan:{date,id:`daily-plan-${date}`,version:1,household:{appointments}}}}))
 await page.route('**/.netlify/functions/icloud-calendar*',r=>r.fulfill({json:{events,connected:true,syncedAt:new Date().toISOString()}}))
 await page.goto('/')
 const card=page.locator('.home-card').filter({has:page.getByRole('heading',{name:'Today at a Glance',exact:true})})
 await expect(card.locator('.home-rows li')).toHaveCount(3)
 await expect(card).toContainText('3 calendar entries')
 for(const event of events)await expect(card.getByText(event.title,{exact:true})).toHaveCount(1)
 await page.reload()
 await expect(card.locator('.home-rows li')).toHaveCount(3)
 await expect(card).toContainText('3 calendar entries')
 await page.screenshot({path:info.outputPath('calendar-single-occurrences.png')})
})
