import { SNACK_LIBRARY } from '../src/meals/snackLibrary.js'
import { test, expect } from '@playwright/test'

const today = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

const plan = (date = today()) => ({
  id: `daily-plan-${date}`,
  date,
  theme: 'Steady stewardship',
  dayObjective: 'Execute the household plan without avoidable exceptions.',
  governingPrinciple: 'Do the known work in the right order.',
  successStandard: 'Critical commitments completed.',
  topPriorities: [
    { id:'priority-1', title:'Protect the household rhythm', owner:'Family', status:'pending', priority:'high', participants:[] },
  ],
  spiritual: { owner:'Family', scope:'household', scripture:['Psalm 1:3'], devotionFocus:'Shared household devotion', prayerFocus:['Wisdom'], discussionPrompts:[], obedienceAction:'Practice the teaching.' },
  health: { owner:'Terica', breakfast:'Eggs', lunch:'Chicken and vegetables', dinner:'Fish and vegetables', snacks:'Fruit', hydration:'Water', groceries:[], nextDayPrep:'' },
  fitness: { owner:'Larry', location:'Lifetime Gym', participants:[], workout:'Strength', objective:'Train', departureTime:'', returnTime:'', stepGoal:10000, recovery:'', requiresDecision:false },
  household: { owner:'Larry', appointments:[{ id:'school-meeting', title:'School planning meeting', date, startTime:'9:15 AM', owner:'Larry', status:'pending', priority:'normal' }], priorities:[], errands:[], openItems:[] },
  education: { owner:'Larry', thinkTankTopic:'', thinkTankDeliverable:'', isaiah:{ owner:'Family', readingMinutes:20, sightWordsMinutes:10, comprehensionMinutes:10, mathMinutes:10, notes:'' } },
  finance: { owner:'Larry', bills:[], purchases:[], transfers:[], accountsToFund:[], incomePipeline:[], decisionRule:'' },
  ministry: { owners:['Larry','Lorenzo'], meetings:[], contentFocus:'', fellowshipFollowUps:[], prayerNeeds:[] },
  assignments:[], decisions:[], dayparts:[], recap:{ wins:[], carryovers:[], lessons:[], tomorrowPrep:[], completedAt:'' }, version:1,
})

const mealPlanResponse = (startDate = today()) => {
  const meals = [
    { id:'breakfast-eggs', mealType:'breakfast', name:'Eggs and Toast', prepMinutes:10, macros:{ calories:350, proteinGrams:22, carbohydrateGrams:30, fatGrams:14 } },
    { id:'lunch-chicken', mealType:'lunch', name:'Chicken and Vegetables', prepMinutes:15, macros:{ calories:480, proteinGrams:48, carbohydrateGrams:32, fatGrams:18 } },
    { id:'dinner-fish', mealType:'dinner', name:'Fish and Vegetables', prepMinutes:20, macros:{ calories:520, proteinGrams:46, carbohydrateGrams:38, fatGrams:20 } },
  ]
  return {
    householdId:'lslj-family',
    startDate,
    days:[{ id:`meal-plan-${startDate}`, date:startDate, version:1, meals:{ breakfast:meals[0].id, lunch:meals[1].id, dinner:meals[2].id,snack1:SNACK_LIBRARY[0].id,snack2:SNACK_LIBRARY[1].id }, substitutions:{}, resolvedMeals:{ breakfast:meals[0], lunch:meals[1], dinner:meals[2],snack1:SNACK_LIBRARY[0],snack2:SNACK_LIBRARY[1] } }],
    library:[...meals,...SNACK_LIBRARY],
  }
}

async function mockBackend(page) {
  await page.route('**/.netlify/functions/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const action = url.searchParams.get('action')
    let body = {}
    if (path.endsWith('/household-auth') && action === 'session') body = { authenticated:true, member:'Larry', role:'admin', bootstrapRequired:false }
    else if (path.endsWith('/nutrition-records')) body = {member:'Larry',targets:{proteinGrams:160,calories:2200,carbohydrateGrams:220,fatGrams:80}}
    else if (path.endsWith('/household-auth') && action === 'members') body = { members:[] }
    else if (path.endsWith('/household-state')) {
      if (route.request().method() === 'PUT') {
        const payload = route.request().postDataJSON()
        body = { conflict:false, record:{ ...payload, version:Number(payload.expectedVersion || 0)+1, updatedAt:new Date().toISOString(), updatedBy:'Larry' } }
      } else body = { records:{}, serverTime:new Date().toISOString() }
    }
    else if (path.endsWith('/household-data')) body = { householdId:'lslj-family', plan:plan(url.searchParams.get('date') || today()) }
    else if (path.endsWith('/icloud-calendar')) body = { events:[{ id:'doctor-appointment', uid:'doctor-appointment', source:'icloud', title:'Doctor appointment', date:today(), time:'2:30 PM', owner:'Family' }], connected:true, syncedAt:new Date().toISOString() }
    else if (path.endsWith('/meal-plans')) body = mealPlanResponse(url.searchParams.get('startDate') || today())
    else if (path.endsWith('/plaid-accounts')) body = { connected:false, accounts:[], errors:[], syncedAt:new Date().toISOString() }
    else if (path.endsWith('/plaid-transactions')) body = { transactions:[], errors:[] }
    else if (path.endsWith('/health-alerts')) body = { alerts:[] }
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(body) })
  })
}

test.beforeEach(async ({ page }) => {
  await mockBackend(page)
  await page.goto('/')
  await expect(page.locator('.app-shell')).toBeVisible()
})

test('seven pillars remain in the approved order', async ({ page }) => {
  const labels = await page.locator('.pillar-header .pillar-label').allTextContents()
  expect(labels).toEqual([
    'Spiritual Maturity',
    'Health & Nutrition',
    'Physical Fitness',
    'Household Management',
    'Education',
    'Finance',
    'Ministry & Fellowship',
  ])
})

test('Today displays every recorded Pillar 7 prayer request', async ({ page }) => {
  const prayers = Array.from({ length:14 }, (_, index) => `Household prayer request ${index + 1}`)
  await page.route('**/.netlify/functions/household-data?*', async route => {
    const date = new URL(route.request().url()).searchParams.get('date') || today()
    const householdPlan = plan(date)
    householdPlan.ministry = { ...householdPlan.ministry, contentFocus:'Serve together', prayerNeeds:prayers }
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ householdId:'lslj-family', plan:householdPlan }) })
  })
  await page.reload()
  const ministry = page.locator('.today-pillar-brief[data-pillar="ministry"]')
  await expect(ministry).toContainText('14 prayer needs')
  await ministry.getByText('View all 14 prayer needs').click()
  await expect(ministry.locator('.today-prayer-needs li')).toHaveCount(14)
  await expect(ministry).toContainText('Household prayer request 14')
})

test('Today can browse tomorrow and the next seven days without changing a plan', async ({ page }) => {
  const tomorrow=new Date(`${today()}T12:00:00Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1)
  const tomorrowKey=tomorrow.toISOString().slice(0,10)
  await page.route('**/.netlify/functions/icloud-calendar*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({events:[{id:'tomorrow-visit',uid:'tomorrow-visit',source:'icloud',title:'Tomorrow appointment',date:tomorrowKey,time:'2:30 PM',owner:'Family'}],connected:true,syncedAt:new Date().toISOString()})}))
  await page.reload()
  await page.getByRole('button',{name:'View Next 7 Days'}).click()
  const picker=page.getByRole('combobox',{name:'Choose a day'})
  await expect(picker.locator('option')).toHaveCount(8)
  await expect(page.locator('.upcoming-schedule .today-dashboard')).toBeVisible()
  await expect(page.locator('.upcoming-schedule .weather-header')).toBeVisible()
  for (const pillar of ['spiritual','health','fitness','household','education','finance','ministry']) {
    await expect(page.locator(`.upcoming-schedule [data-pillar="${pillar}"]`)).toBeVisible()
  }
  await expect(page.getByRole('heading',{name:'Appointments & Meetings'})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Scheduled Chores'})).toBeVisible()
  await expect(page.locator('.upcoming-schedule .today-calendar-agenda')).toContainText('Tomorrow appointment')
  await expect(page.locator('.upcoming-schedule .today-calendar-agenda')).toContainText('2:30 PM')
  await expect(page.locator('.upcoming-schedule .today-meals')).toContainText('Eggs and Toast')
  await expect(page.locator('.upcoming-schedule')).not.toContainText('Set Today’s Focus')
  const last=await picker.locator('option').last().getAttribute('value')
  await picker.selectOption(last)
  await expect(page.locator('.upcoming-schedule .today-hero h1')).toContainText(new Date(`${last}T12:00:00`).toLocaleDateString('en-US',{month:'long',day:'numeric'}))
  await page.getByRole('button',{name:'Back to Today'}).click()
  await expect(page.getByRole('heading',{name:'Today',exact:true})).toBeVisible()
})

test('Top Outcomes retains spaces while typing before Alignment review', async ({ page }) => {
  await page.getByRole('button',{name:/Today’s Alignment/}).click()
  await page.getByRole('button',{name:/Next Pillar/}).click()
  await page.getByRole('button',{name:/Next Pillar/}).click()
  await page.getByRole('button',{name:/Next Pillar/}).click()
  const field=page.getByRole('textbox',{name:/Today.s Top 3 Outcomes/})
  await field.fill('LJ - Follow up with stormwater contractors\nReview household schedule')
  await expect(field).toHaveValue('LJ - Follow up with stormwater contractors\nReview household schedule')
  await field.press('End')
  await field.press('Space')
  await expect(field).toHaveValue('LJ - Follow up with stormwater contractors\nReview household schedule ')
})

test('deprecated My Planner workspace is not present in navigation', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'iphone') {
    await page.getByRole('button', { name:'Menu' }).click()
    await expect(page.locator('#primary-navigation-drawer')).toHaveClass(/is-expanded/)
  }
  await page.getByRole('button', { name:'Household Management' }).click()
  await expect(page.getByRole('button', { name:'Household Operations' })).toBeVisible()
  await expect(page.getByRole('button', { name:'Family Calendar' })).toBeVisible()
  await expect(page.getByRole('button', { name:'My Planner' })).toHaveCount(0)
})

test('top-level pillar navigation returns to Today instead of the previously viewed pillar', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'iphone') await page.getByRole('button', { name:'Menu' }).click()
  await page.getByRole('button', { name:'Household Management' }).click()
  await page.getByRole('button', { name:'Spiritual Maturity' }).click()
  await expect(page.getByRole('button', { name:'Back to Today' })).toBeVisible()
})

test('direct shared household writes remain local and never bypass Action Mode review', async ({ page }) => {
  const writes = []
  page.on('request', request => {
    if (request.method() === 'PUT' && request.url().includes('/.netlify/functions/household-state')) writes.push(request)
  })
  await page.evaluate(() => {
    localStorage.setItem('brevity_household_schedule_v1', JSON.stringify({ version:1, blocks:[], routines:[] }))
  })
  await page.waitForTimeout(250)
  expect(writes).toHaveLength(0)
})

test('Settings exposes sync health and identifies browser data as a recovery cache', async ({ page }, testInfo) => {
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  if (testInfo.project.name === 'iphone') await page.getByRole('button', { name:'Menu' }).click()
  await page.getByRole('button', { name:'Settings' }).click()
  if (testInfo.project.name === 'iphone') await page.getByRole('button', { name:'Collapse navigation' }).click()
  await page.waitForTimeout(300)
  expect(pageErrors).toEqual([])
  await expect(page.getByRole('heading', { name:'Settings', exact:true })).toBeVisible()
  await expect(page.locator('.household-account-admin')).toBeVisible()
  await expect(page.locator('.household-sync-health')).toBeVisible()
  await expect(page.getByText('Last verified sync')).toBeVisible()
  await expect(page.getByText('Local Recovery Cache')).toBeVisible()
  await expect(page.getByRole('button', { name:'Export Recovery Cache' })).toBeVisible()
  await expect(page.getByText('Browser Data Export')).toHaveCount(0)
})

test('Settings submits a verified household password change', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'iphone') await page.getByRole('button', { name:'Menu' }).click()
  await page.getByRole('button', { name:'Settings' }).click()
  if (testInfo.project.name === 'iphone') await page.getByRole('button', { name:'Collapse navigation' }).click()
  await expect(page.getByText('Your current password')).toBeVisible()
  await page.getByLabel('Your current password').fill('current-secret')
  await page.getByLabel('New password', { exact:true }).fill('new-household-secret')
  await page.getByLabel('Confirm new password').fill('new-household-secret')
  const request = page.waitForRequest(value => value.url().includes('action=set-member-password'))
  await page.getByRole('button', { name:'Change Password' }).click()
  const submitted = await request
  expect(submitted.postDataJSON()).toEqual({ member:'Larry', currentPassword:'current-secret', newPassword:'new-household-secret' })
})

test('shared-state UI no longer asks users to reload after synchronization', async ({ page }) => {
  await expect(page.locator('body')).not.toContainText('Refresh this view to display them')
  await expect(page.getByRole('button', { name:'Reload view' })).toHaveCount(0)
})

test('Today renders operating content without a fatal application error', async ({ page }) => {
  await expect(page.getByRole('button', { name:'Today' }).first()).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Something went wrong')
  await expect(page.locator('body')).not.toContainText('Application error')
})

test('Today Pillar 3 shows the dated workout exercise photography and opens the full workout', async ({ page }) => {
  const fitness = page.locator('.today-fitness-workout')
  await expect(fitness).toBeVisible()
  expect(await fitness.locator('.today-fitness-exercise').count()).toBeGreaterThanOrEqual(2)
  const images = fitness.locator('.today-fitness-exercise img')
  expect(await images.count()).toBeGreaterThanOrEqual(2)
  for (let index = 0; index < await images.count(); index += 1) {
    await expect(images.nth(index)).toHaveJSProperty('complete', true)
    expect(await images.nth(index).evaluate(image => image.naturalWidth)).toBeGreaterThan(0)
  }
  await fitness.getByRole('button', { name:/Enlarge .* exercise image/ }).first().click()
  const imageViewer = page.getByRole('dialog', { name:/enlarged exercise image/ })
  await expect(imageViewer).toBeVisible()
  const enlargedImage = imageViewer.locator('img')
  await expect(enlargedImage).toHaveCSS('object-fit', 'contain')
  const sizing = await enlargedImage.evaluate(image => ({
    clientWidth:image.clientWidth,
    clientHeight:image.clientHeight,
    naturalWidth:image.naturalWidth,
    naturalHeight:image.naturalHeight,
  }))
  expect(sizing.clientWidth).toBeGreaterThan(0)
  expect(sizing.clientHeight).toBeGreaterThan(0)
  expect(sizing.naturalWidth).toBeGreaterThan(0)
  expect(sizing.naturalHeight).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await expect(imageViewer).toHaveCount(0)
  await fitness.getByRole('button', { name:'Open Full Workout' }).click()
  await expect(page.locator('.daily-fitness-hero h1')).toBeVisible()
})

test('Physical Fitness builds and refines a goal-driven workout before Action Mode review', async ({ page }, testInfo) => {
  if(testInfo.project.name==='iphone')await page.getByRole('button',{name:'Menu'}).click()
  await page.getByRole('button', { name:'Physical Fitness' }).click()
  if(testInfo.project.name==='iphone')await page.getByRole('button',{name:'Close navigation'}).evaluate(button=>button.click())
  await expect(page.getByRole('heading', { name:'Tell Brevity what you want to target' })).toBeVisible()
  await page.getByLabel('Today’s goal').fill('Build wider shoulders and lats with upper chest emphasis')
  await page.getByRole('button', { name:'Build Workout' }).click()
  const draft=page.locator('.fitness-goal-draft')
  await expect(draft.getByText('Proposed for Larry')).toBeVisible()
  const selected=await draft.locator('select[aria-label^="Replace "]').evaluateAll(selects=>selects.map(select=>select.value))
  expect(selected).toEqual(expect.arrayContaining(['lateral-raise','lat-pulldown','incline-press']))
  await expect(draft.getByLabel('Use in generated images')).toHaveValue('Larry')
  await expect(draft.getByRole('button', { name:'Review & Replace Today’s Workout' })).toBeVisible()
  await page.getByRole('button',{name:'Exercise Library'}).click()
  await page.locator('.fitness-body-filters').getByRole('button',{name:'Chest',exact:true}).click()
  await expect(page.locator('.fitness-result-count')).toHaveText('19 exercises')
  await page.getByLabel('Filter exercise equipment').selectOption('Cable')
  expect(await page.locator('.fitness-library-card').count()).toBeGreaterThanOrEqual(4)
})

test('Today Pillar 4 lists every calendar commitment and today’s Household Operations chores', async ({ page }) => {
  const household = page.locator('[data-pillar="household"]')
  await expect(household.getByRole('button', { name:'Set Today’s Focus' })).toBeVisible()
  await household.getByRole('button', { name:'Set Today’s Focus' }).click()
  const focusDialog=page.getByRole('dialog',{name:'Set Today’s Focus'})
  await expect(focusDialog.getByRole('textbox', { name:'Today’s Focus' })).toBeVisible()
  await expect(focusDialog).toContainText('Calendar appointments remain visible below')
  await focusDialog.getByRole('button',{name:'Cancel'}).click()
  await expect(household.getByRole('heading', { name:'Today’s Appointments & Meetings' })).toBeVisible()
  await expect(household.getByText('School planning meeting')).toBeVisible()
  await expect(household.getByText('Doctor appointment')).toBeVisible()
  await expect(household.getByRole('heading', { name:'Today’s Chores' })).toBeVisible()
  expect(await household.locator('.today-chore-item').count()).toBeGreaterThan(0)
  await expect(household.getByRole('button', { name:'Open Household Operations' })).toBeVisible()
})

test('Today meal cards show calories and all three macros',async({page})=>{
  const cards=page.locator('.today-meal-card')
  await expect(cards).toHaveCount(5)
  const macros=page.locator('.today-meal-macros')
  await expect(macros).toHaveCount(5)
  for(const summary of await macros.all()){
    await expect(summary).toContainText('cal')
    await expect(summary).toContainText('protein')
    await expect(summary).toContainText('carbs')
    await expect(summary).toContainText('fat')
  }
})

test('mobile shell keeps fixed navigation inside the viewport without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'mobile-only assertion')
  const dimensions = await page.evaluate(() => ({ width:window.innerWidth, height:window.innerHeight, scrollWidth:document.documentElement.scrollWidth }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1)
  const nav = page.locator('.mobile-app-nav')
  await expect(nav).toBeVisible()
  const box = await nav.boundingBox()
  expect(box).not.toBeNull()
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(dimensions.height + 1)
})

test('expanded mobile refresh details stay above Ask Brevity and mobile navigation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'mobile-only assertion')
  const refresh = page.locator('.app-refresh-status')
  await expect(refresh).toBeVisible()
  await page.getByRole('button', { name:'View details' }).click()
  await expect(refresh).toHaveClass(/is-expanded/)

  const [refreshBox, assistantBox, navBox] = await Promise.all([
    refresh.boundingBox(),
    page.locator('.brevity-assistant-launcher').boundingBox(),
    page.locator('.mobile-app-nav').boundingBox(),
  ])
  expect(refreshBox).not.toBeNull()
  expect(assistantBox).not.toBeNull()
  expect(navBox).not.toBeNull()
  expect(refreshBox.y + refreshBox.height).toBeLessThanOrEqual(assistantBox.y)
  expect(refreshBox.y + refreshBox.height).toBeLessThanOrEqual(navBox.y)
  expect(refreshBox.height).toBeLessThanOrEqual(page.viewportSize().height * 0.55 + 1)

  const reservedPadding = await page.locator('.app-main').evaluate(element => parseFloat(getComputedStyle(element).paddingBottom))
  expect(reservedPadding).toBeGreaterThanOrEqual(refreshBox.height)
})

test('Today Finance displays stored cash and scheduled obligations without claiming payment', async ({ page }) => {
  const date=today()
  const tomorrow=new Date(`${date}T12:00:00`); tomorrow.setDate(tomorrow.getDate()+1)
  const dueDate=[tomorrow.getFullYear(),String(tomorrow.getMonth()+1).padStart(2,'0'),String(tomorrow.getDate()).padStart(2,'0')].join('-')
  const financeData={accounts:[{id:'cash',name:'Operating Account',type:'checking',balance:1250}],transactions:[{id:'bill',name:'Mortgage',amount:900,type:'expense',freq:'once',start:dueDate,acct:'cash'}]}
  await page.route('**/.netlify/functions/household-state*', route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:{lslj_finance_v9:{key:'lslj_finance_v9',value:JSON.stringify(financeData),version:1,updatedAt:new Date().toISOString()}}})}))
  await page.reload()
  const finance=page.locator('.today-finance-brief')
  await expect(finance).toContainText('Daily Finance Brief')
  await expect(finance).toContainText('$1,250')
  await expect(finance).toContainText('Latest stored balance')
  await expect(finance).toContainText('Mortgage')
  await expect(finance).toContainText('Scheduled · unconfirmed')
  await expect(finance).toContainText('Operating Balance · $1,000 watch')
  await expect(finance).toContainText('Projected below $1,000 on 6 of the next seven days')
  await expect(finance.locator('.today-operating-watch')).toContainText('$350')
  await expect(finance).not.toContainText('Posted · linked')
  await expect(finance).toContainText('No finance decision recorded today.')
})

for(const interruptPhase of ['preparing','playing'])test(`voice can interrupt while ${interruptPhase} and resume the next turn`,async({page})=>{
  const requests=[]
  let releaseSpeech
  const heldSpeech=new Promise(resolve=>{releaseSpeech=resolve})
  let speechRequests=0
  await page.route('**/.netlify/functions/brevity-conversation',route=>route.fulfill({json:{version:0,messages:[]}}))
  await page.route('**/.netlify/functions/brevity-assistant',async route=>{
    requests.push(route.request().postDataJSON())
    await route.fulfill({json:{message:`Verified schedule answer ${requests.length}.`,proposal:null}})
  })
  await page.route('**/elevenlabs-voices',route=>route.fulfill({json:{voices:[{voice_id:'test-voice',name:'Test voice'}]}}))
  await page.route('**/elevenlabs-tts',async route=>{
    speechRequests++
    if(interruptPhase==='preparing'&&speechRequests===1)await heldSpeech
    await route.fulfill({contentType:'audio/mpeg',body:'test-audio'}).catch(()=>{})
  })
  await page.addInitScript(()=>{
    localStorage.setItem('brevity_el_voice_v1','test-voice')
    window.voiceTest={starts:0,plays:0,current:null,audio:null}
    window.SpeechRecognition=class {
      start(){window.voiceTest.current=this;window.voiceTest.starts++;this.onstart?.()}
      stop(){this.onend?.()}
      abort(){this.onend?.()}
    }
    window.Audio=class {
      constructor(){window.voiceTest.audio=this}
      async play(){if(!this.src?.startsWith('data:'))window.voiceTest.plays++}
      pause(){}
    }
  })
  await page.reload()
  await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Brevity Assistant',exact:true})
  await dialog.getByRole('button',{name:'Start voice conversation',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.voiceTest.starts)).toBe(1)
  await page.evaluate(()=>window.voiceTest.current.onresult({results:[[{transcript:'What appointments do I have today?'}]]}))
  // Exercise the real seven-second silence submission, not only the Send button.
  await expect.poll(()=>requests.length,{timeout:10000}).toBe(1)
  await expect(dialog.getByText('Verified schedule answer 1.',{exact:true})).toBeVisible()
  if(interruptPhase==='playing')await expect.poll(()=>page.evaluate(()=>window.voiceTest.plays)).toBe(1)
  await dialog.getByRole('button',{name:'Interrupt and speak',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.voiceTest.starts)).toBe(2)
  if(interruptPhase==='preparing'){
    releaseSpeech()
    await expect.poll(()=>page.evaluate(()=>window.voiceTest.plays)).toBe(0)
  }
  await page.evaluate(()=>window.voiceTest.current.onresult({results:[[{transcript:'And what chores are due?'}]]}))
  await dialog.getByRole('button',{name:'Send message',exact:true}).click()
  await expect.poll(()=>requests.length).toBe(2)
  expect(requests[1].messages.at(-1).content).toBe('And what chores are due?')
  expect(requests[1].messages.some(message=>message.content==='Verified schedule answer 1.')).toBe(true)
  await expect.poll(()=>page.evaluate(()=>window.voiceTest.plays)).toBe(interruptPhase==='playing'?2:1)
  await page.evaluate(()=>window.voiceTest.audio.onended())
  await expect.poll(()=>page.evaluate(()=>window.voiceTest.starts)).toBe(3)
  await dialog.getByRole('button',{name:'Close Brevity Assistant',exact:true}).click()
  await expect(page.getByRole('button',{name:'Open Brevity Assistant',exact:true})).toBeVisible()
  expect(requests.length).toBe(2)
})

for(const outcome of ['approve','update','activity','cancel','interim','interrupted','blocked'])test(`routine spoken review ${outcome} stays bound to the reviewed proposal`,async({page})=>{
  let executions=0,saved=false
  const messages=[]
  const proposal={id:'voice-proposal',actor:'Larry',actorRole:'admin',state:'pending',risk:'confirmation',expiresAt:new Date(Date.now()+1800000).toISOString(),summary:'Create household priorities',operations:[{id:'voice-op',type:'household.schedule.block.create',domain:'planning',risk:'confirmation',description:'Create priorities work block',targetDate:today(),targetId:'Larry',payload:{title:'Voice approval verification',date:today(),owner:'Larry',startTime:'18:00',endTime:'18:15'},allowedScopes:['this-item'],defaultScope:'this-item'}]}
  if(outcome==='update'){proposal.expectedVersions={[`plan:${today()}`]:3};Object.assign(proposal.operations[0],{type:'assignment.update',targetId:'saved-task',payload:{status:'complete'},voiceTarget:{id:'saved-task',title:'School follow-up',owner:'Larry',status:'in-progress',resource:`plan:${today()}`,version:3}})}
  if(outcome==='activity')Object.assign(proposal.operations[0],{type:'activity.record',payload:{kind:'workout',title:'Morning walk',durationMinutes:25,status:'complete'}})
  await page.route('**/.netlify/functions/brevity-conversation',route=>route.fulfill({json:{version:saved?1:0,messages}}))
  await page.route('**/.netlify/functions/brevity-assistant',route=>route.fulfill({json:{message:'Review prepared. Nothing saved.',proposal}}))
  await page.route('**/.netlify/functions/brevity-assistant-actions?*',async route=>{
    const body=route.request().postDataJSON()
    expect(body.proposalId).toBe(proposal.id);expect(body.voiceApproval.proposalId).toBe(proposal.id)
    expect(body.voiceApproval.phrase.toLowerCase()).toBe('apply this change');expect(body.confirmed).toBe(true)
    expect(body.selections).toEqual({'voice-op':'this-item'})
    executions++;saved=true;messages.push({role:'assistant',content:'Completed: Voice approval verification.'})
    await route.fulfill({json:{audit:{id:'voice-audit',summary:'Voice approval verification'},conversation:{version:1,messages}}})
  })
  await page.route('**/elevenlabs-voices',route=>route.fulfill({json:{voices:[{voice_id:'test-voice',name:'Test voice'}]}}))
  await page.route('**/elevenlabs-tts',route=>route.fulfill({contentType:'audio/mpeg',body:'test-audio'}))
  await page.addInitScript(({outcome})=>{
    localStorage.setItem('brevity_el_voice_v1','test-voice')
    window.voiceTest={starts:0,plays:0,current:null,audio:null}
    window.SpeechRecognition=class {start(){window.voiceTest.current=this;window.voiceTest.starts++;this.onstart?.()}stop(){this.onend?.()}abort(){this.onend?.()}}
    window.Audio=class {constructor(){window.voiceTest.audio=this}async play(){if(!this.src?.startsWith('data:')){window.voiceTest.plays++;if(outcome==='blocked'&&window.voiceTest.plays===1)throw new DOMException('Tap required','NotAllowedError')}}pause(){}}
  },{outcome})
  await page.reload();await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Brevity Assistant',exact:true})
  await dialog.getByRole('button',{name:'Start voice conversation',exact:true}).click()
  await dialog.getByRole('textbox').fill('Prepare a household priorities block for 6 to 6:15 PM.')
  await dialog.getByRole('button',{name:'Send message',exact:true}).click()
  const review=page.getByRole('dialog',{name:'Review proposed Brevity changes',exact:true})
  await expect(review).toBeVisible();await expect.poll(()=>page.evaluate(()=>window.voiceTest.plays)).toBe(1)
  expect(executions).toBe(0)
  if(outcome==='blocked'){
    await expect(review.getByRole('status')).toContainText('Hear the full review')
    await review.getByRole('button',{name:'Play response',exact:true}).click()
    await expect.poll(()=>page.evaluate(()=>window.voiceTest.plays)).toBe(2)
    expect(executions).toBe(0)
  }
  if(outcome==='update')await expect(review.getByText('School follow-up',{exact:true})).toBeVisible()
  if(outcome==='interrupted'){
    await page.evaluate(()=>{window.lateReviewEnd=window.voiceTest.audio.onended})
    await review.getByRole('button',{name:'Cancel',exact:true}).click()
    await page.evaluate(()=>window.lateReviewEnd())
    await expect(review).toHaveCount(0);expect(executions).toBe(0);return
  }
  await page.evaluate(()=>window.voiceTest.audio.onended())
  await expect(review.getByRole('status')).toContainText('Say “Apply this change”')
  await expect.poll(()=>page.evaluate(()=>window.voiceTest.starts)).toBe(2)
  await page.evaluate(({outcome})=>{const result=[{transcript:outcome==='cancel'?'Cancel this change':'Apply this change'}];result.isFinal=outcome!=='interim';window.voiceTest.current.onresult({results:[result]})},{outcome})
  if(outcome==='approve'||outcome==='update'||outcome==='activity'||outcome==='blocked'){
    await expect.poll(()=>executions,{timeout:10000}).toBe(1)
    await expect(review).toHaveCount(0)
    await expect(dialog.getByText('Completed: Voice approval verification.',{exact:true})).toBeVisible()
    await page.reload();await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
    await expect(page.getByText('Completed: Voice approval verification.',{exact:true})).toBeVisible()
    expect(executions).toBe(1)
  }else if(outcome==='cancel'){
    await expect(review).toHaveCount(0,{timeout:10000});expect(executions).toBe(0)
  }else{
    await expect(dialog.getByRole('alert')).toContainText('Nothing was applied',{timeout:10000})
    await expect(review).toBeVisible();expect(executions).toBe(0)
  }
})

test('assistant shows honest elapsed progress across close and renders safe formatted answers',async({page})=>{
  let release
  const held=new Promise(resolve=>{release=resolve})
  await page.route('**/.netlify/functions/brevity-conversation',r=>r.fulfill({json:{version:0,messages:[]}}))
  await page.route('**/.netlify/functions/brevity-assistant',async r=>{
    await held
    await r.fulfill({json:{message:'**Today**\n\n\n- **Meeting:** 2 PM\n- <img src=x onerror=alert(1)>',proposal:null}})
  })
  await page.reload()
  await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Brevity Assistant',exact:true})
  await page.clock.install({time:new Date('2026-09-30T12:00:00Z')})
  await page.clock.pauseAt(new Date('2026-09-30T12:01:00Z'))
  await dialog.locator('textarea').fill('What is today’s schedule?')
  await dialog.getByRole('button',{name:'Send message',exact:true}).click()
  await expect(dialog.getByText('Working on your request',{exact:true})).toBeVisible()
  await page.clock.fastForward(16000)
  await expect(dialog.getByText('Still working on your request',{exact:true})).toBeVisible()
  await expect(dialog.locator('.brevity-progress-elapsed')).toHaveAttribute('aria-hidden','true')
  await dialog.getByRole('button',{name:'Close Brevity Assistant',exact:true}).click()
  await page.clock.fastForward(5000)
  await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
  await expect(dialog.locator('.brevity-progress-elapsed')).toContainText('21s elapsed')
  release()
  await expect(dialog.locator('.brevity-progress')).toHaveCount(0)
  await expect(dialog.locator('.is-assistant strong')).toHaveText(['Today','Meeting:'])
  await expect(dialog.locator('.is-assistant li')).toHaveCount(2)
  await expect(dialog.locator('.is-assistant img')).toHaveCount(0)
  await expect(dialog.locator('.is-assistant .brevity-assistant-message-body')).not.toContainText('**')
})

test('assistant comparisons render accessible tables and safe source links without widening the viewport',async({page})=>{
  const message='**Label comparison**\n| Food | Calories | Protein | Carbs | Fat | Sodium | Calcium | Potassium |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n| **Cup** | 80 | 16g | 5g | 0g | 55mg | 180mg | 230mg |\n| Tub portion | 135 | 27g | 7.5g | 0g | 97.5mg | 300mg | 390mg |\n[Manufacturer source](https://usa.fage/products/yogurt/fage-total-0)\n[Unsafe](javascript:alert(1))\n![Not loaded](https://example.com/private.png)\n<img src=x onerror=alert(1)>'
  await page.route('**/.netlify/functions/brevity-conversation',r=>r.fulfill({json:{version:0,messages:[]}}))
  await page.route('**/.netlify/functions/brevity-assistant',r=>r.fulfill({json:{message,proposal:null}}))
  await page.reload()
  await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Brevity Assistant',exact:true})
  await dialog.locator('textarea').fill('Compare these labels without saving anything.')
  await dialog.getByRole('button',{name:'Send message',exact:true}).click()
  const table=dialog.getByRole('table')
  await expect(table.getByRole('columnheader')).toHaveCount(8)
  await expect(table.getByRole('row')).toHaveCount(3)
  await expect(table.getByRole('cell',{name:'97.5mg',exact:true})).toBeVisible()
  await expect(dialog.getByRole('link',{name:'Manufacturer source'})).toHaveAttribute('href','https://usa.fage/products/yogurt/fage-total-0')
  await expect(dialog.getByRole('link',{name:'Manufacturer source'})).toHaveAttribute('rel','noopener noreferrer')
  await expect(dialog.locator('.is-assistant a')).toHaveCount(1)
  await expect(dialog.locator('.is-assistant img')).toHaveCount(0)
  const region=dialog.getByRole('region',{name:'Comparison table'})
  await expect(region).toHaveAttribute('tabindex','0')
  expect(await region.evaluate(el=>el.scrollWidth>=el.clientWidth)).toBe(true)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
})

test('blocked speech keeps its audio for a direct play tap and resumes follow-up listening',async({page})=>{
  let speechRequests=0
  await page.route('**/.netlify/functions/brevity-conversation',r=>r.fulfill({json:{version:0,messages:[]}}))
  await page.route('**/.netlify/functions/brevity-assistant',r=>r.fulfill({json:{message:'Your schedule is ready.',proposal:null}}))
  await page.route('**/elevenlabs-voices',r=>r.fulfill({json:{voices:[{voice_id:'test-voice',name:'Test voice'}]}}))
  await page.route('**/elevenlabs-tts',r=>{speechRequests++;return r.fulfill({contentType:'audio/mpeg',body:'test-audio'})})
  await page.addInitScript(()=>{
    localStorage.setItem('brevity_el_voice_v1','test-voice')
    window.voiceTest={starts:0,created:0,attempts:0,primed:false}
    window.SpeechRecognition=class{start(){window.voiceTest.starts++;this.onstart?.()}stop(){this.onend?.()}abort(){this.onend?.()}}
    window.Audio=class{
      constructor(){window.voiceTest.created++;window.voiceTest.audio=this}
      async play(){
        if(this.src.startsWith('data:')){window.voiceTest.primed=navigator.userActivation.isActive;return}
        window.voiceTest.attempts++
        if(window.voiceTest.attempts===1)throw new DOMException('Gesture required','NotAllowedError')
      }
      pause(){}
    }
  })
  await page.reload()
  await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Brevity Assistant',exact:true})
  await dialog.getByRole('button',{name:'Start voice conversation',exact:true}).click()
  await dialog.locator('textarea').fill('What is my schedule?')
  await dialog.getByRole('button',{name:'Send message',exact:true}).click()
  await expect(dialog.getByRole('button',{name:'Play response',exact:true})).toBeVisible()
  expect(await page.evaluate(()=>window.voiceTest.primed)).toBe(true)
  expect(await page.evaluate(()=>window.voiceTest.created)).toBe(1)
  await dialog.getByRole('button',{name:'Play response',exact:true}).click()
  await expect(dialog.getByRole('button',{name:'Play response',exact:true})).toHaveCount(0)
  expect(speechRequests).toBe(1)
  await page.evaluate(()=>window.voiceTest.audio.onended())
  await expect.poll(()=>page.evaluate(()=>window.voiceTest.starts)).toBe(2)
})

 test('Today shows planned targets, two snacks and reviewed swaps',async({page})=>{
   const summary=page.getByRole('region',{name:'Planned daily macros compared with goals'})
   await expect(summary).toContainText('160 g')
   await expect(summary).toContainText('not logged consumption')
   await expect(page.locator('.today-snack-card')).toHaveCount(2)
   await page.getByRole('button',{name:'Swap Snack 2',exact:true}).click()
   const dialog=page.getByRole('dialog',{name:'Swap Snack 2'})
   await expect(dialog).toContainText('Action Mode')
   await expect(dialog.getByRole('button',{name:'Review swap'})).toBeDisabled()
   await dialog.getByRole('combobox').selectOption('snack-premier-chocolate')
   await expect(dialog.getByRole('button',{name:'Review swap'})).toBeEnabled()
   await dialog.getByRole('button',{name:'Cancel'}).click()
 })
 test('Today calendar supports multi-member, church, Family and All selection',async({page})=>{
   const filter=page.getByRole('group',{name:'Calendars to show'})
   await expect(filter.getByRole('button',{name:'Larry',exact:true})).toHaveAttribute('aria-pressed','true')
   await filter.getByRole('button',{name:'Lorenzo',exact:true}).click()
   await expect(filter.getByRole('button',{name:'Larry',exact:true})).toHaveAttribute('aria-pressed','true')
   await expect(filter.getByRole('button',{name:'Lorenzo',exact:true})).toHaveAttribute('aria-pressed','true')
   await filter.getByRole('button',{name:'Church Triumphant',exact:true}).click()
   await expect(filter.getByRole('button',{name:'Church Triumphant',exact:true})).toHaveAttribute('aria-pressed','true')
   await filter.getByRole('button',{name:'Family',exact:true}).click()
   await expect(filter.getByRole('button',{name:'Church Triumphant',exact:true})).toHaveAttribute('aria-pressed','false')
   await filter.getByRole('button',{name:'All',exact:true}).click()
   await expect(filter.getByRole('button',{name:'All',exact:true})).toHaveAttribute('aria-pressed','true')
 })

test('startup retries a generic institution failure and does not retain its stale alert',async({page})=>{
  let attempts=0
  await page.route('**/.netlify/functions/plaid-transactions*',async route=>{
    const url=new URL(route.request().url())
    if(url.search)return route.fulfill({status:200,json:{refresh:{requested:false,accepted:0}}})
    attempts++
    return route.fulfill(attempts===1
      ? {status:502,json:{error:'Transaction sync failed for every connected institution.',errors:[{institution:'Fixture Bank',code:'INSTITUTION_DOWN',message:'Transactions could not be refreshed for this institution.'}]}}
      : {status:200,json:{connected:false,transactions:[],errors:[]}})
  })
  await page.reload()
  await expect.poll(()=>attempts).toBeGreaterThanOrEqual(2)
  await expect(page.locator('body')).not.toContainText('Transaction sync failed for every connected institution.')
})

test('persistent transaction failures disclose a safe cause and release the refresh spinner',async({page})=>{
  await page.route('**/.netlify/functions/plaid-transactions*',async route=>route.fulfill({status:502,json:{error:'Transaction sync failed for every connected institution.',errors:[{institution:'Fixture Bank',code:'PLAID_CURSOR_READ_FAILED',message:'The transaction checkpoint could not be read.'}]}}))
  await page.reload()
  const details=page.getByRole('button',{name:'View details',exact:true})
  await expect(details).toBeVisible({timeout:15000})
  await details.click()
  await expect(page.locator('body')).toContainText('PLAID_CURSOR_READ_FAILED')
  await expect(page.getByRole('button',{name:'Refresh all',exact:true})).toBeEnabled()
  await expect(page.locator('body')).not.toContainText('Refreshing bank balances and transactions…')
})

test('Today reflects inventory source exceptions and clears them after a newer source read',async({page})=>{
  let quantity=1
  await page.route('**/.netlify/functions/household-state*',async route=>{
    const key='brevity_household_inventory_v1'
    return route.fulfill({status:200,json:{records:{[key]:{key,version:quantity,value:JSON.stringify({items:[{id:'inventory-audit-source',name:'Audit paper towels',quantity,parLevel:4,unit:'rolls'}],waste:[]}),updatedAt:new Date().toISOString()}},serverTime:new Date().toISOString()}})
  })
  await page.reload()
  await expect(page.locator('.today-attention')).toContainText('Replenish Audit paper towels')
  await expect(page.locator('.today-attention')).not.toContainText('No household items need attention')
  quantity=5
  await page.reload()
  await expect(page.locator('.today-attention')).not.toContainText('Replenish Audit paper towels')
})
