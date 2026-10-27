async function openTodayDetails(page) {
  await expect(page.locator('.today-dashboard')).toBeVisible()
  const collapse=page.getByRole('button',{name:'Collapse navigation',exact:true})
  const restore=(page.viewportSize()?.width||1440)<700&&await collapse.isVisible()
  if(restore)await collapse.click()
  for (const title of ['Weather','Pillar details & resources','Nutrition goals & food logged','Earlier work & daily briefing','Household details & responsibility updates','Health care coordination','Education, finance & ministry','Household readiness & settings','Assistant settings & administration']) {
    const summary=page.locator('details:not([open]) > summary').filter({hasText:new RegExp('^'+title+'$')})
    if(await summary.count())await summary.click()
  }
  if(restore)await page.getByRole('button',{name:'Menu',exact:true}).click()
}
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
    if (path.endsWith('/daily-briefing')) return route.fulfill({json:{brief:{member:'Larry',date:today(),items:[],gaps:[],sources:{}},revision:'brief-v1',acknowledged:false,household:[],finance:null}})
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
    else if (path.endsWith('/icloud-calendar')) body = { events:[{ id:'doctor-appointment', uid:'doctor-appointment', source:'icloud', appleCalendarId:'larry-calendar', appleCalendarOwner:'Larry', title:'Doctor appointment', date:today(), time:'2:30 PM', owner:'Family' }], connected:true, syncedAt:new Date().toISOString() }
    else if (path.endsWith('/meal-plans')) body = mealPlanResponse(url.searchParams.get('startDate') || today())
    else if (path.endsWith('/plaid-accounts')) body = { connected:false, accounts:[], errors:[], syncedAt:new Date().toISOString() }
    else if (path.endsWith('/plaid-transactions')) body = { transactions:[], errors:[] }
    else if (path.endsWith('/learning-hub')) body = {items:[],version:0}
    else if (path.endsWith('/health-alerts')) body = { alerts:[] }
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(body) })
  })
}

test.beforeEach(async ({ page }) => {
  // Netlify's preview-only feedback drawer overlaps app controls on tablets.
  if(process.env.PREVIEW_BASE_URL)await page.route('**/.netlify/scripts/cdp',route=>route.abort())
  await mockBackend(page)
  await page.goto('/')
  await expect(page.locator('.app-shell')).toBeVisible()
  await openTodayDetails(page)
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

test('daily date browsing edits the selected plan and returns to today', async ({ page }) => {
  const picker=page.getByLabel('Daily plan date',{exact:true})
  await picker.fill('2026-02-17')
  await expect(page.locator('.today-overview > header')).toContainText('February 17')
  await expect(page.locator('.today-bills-glance')).toContainText('2026-02-17')
  await page.getByRole('button',{name:'Adjust this day’s plan',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Adjust this day',exact:true})).toBeVisible()
  await expect(page.locator('.morning-alignment-header')).toContainText('2026-02-17')
  await page.getByRole('button',{name:'Next day',exact:true}).click()
  await expect(picker).toHaveValue('2026-02-18')
  await expect(page.locator('.today-overview > header')).toContainText('February 18')
  await page.locator('.life-date-nav').getByRole('button',{name:'Today',exact:true}).click()
  await expect(picker).toHaveValue(today())
  await expect(page.locator('.today-overview')).toBeVisible()
})

test('Home and Household destinations remain usable without horizontal overflow', async ({ page },testInfo) => {
  const nav=page.locator(testInfo.project.name==='iphone'?'.mobile-app-nav':'.sidebar-nav')
  await nav.getByRole('button',{name:'Home',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Welcome home, Larry.'})).toBeVisible()
  await page.screenshot({path:testInfo.outputPath('home.png')})
  await page.getByRole('button',{name:/Our household Shared responsibilities/}).click()
  await expect(page.getByRole('heading',{name:'Household',exact:true})).toBeVisible()
  await page.screenshot({path:testInfo.outputPath('household.png')})
  await page.getByRole('navigation',{name:'Household sections'}).getByRole('button',{name:'Manage',exact:true}).click()
  await page.getByRole('button',{name:/Supplies & inventory What/}).click()
  await expect(page.locator('.household-operations-shell')).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+1)).toBe(true)
})

test('calendar dates open the matching daily plan',async({page})=>{
  await page.getByRole('button',{name:'Open calendar',exact:true}).click()
  await page.getByRole('button',{name:'Month',exact:true}).click()
  const date=`${today().slice(0,7)}-01`
  await page.getByRole('button',{name:`Review plan for ${date}`,exact:true}).click()
  await expect(page.getByLabel('Daily plan date',{exact:true})).toHaveValue(date)
  await expect(page.locator('.today-bills-glance')).toContainText(date)
})

test('Today displays every recorded Pillar 7 prayer request', async ({ page }) => {
  const prayers = Array.from({ length:14 }, (_, index) => `Household prayer request ${index + 1}`)
  await page.route('**/.netlify/functions/household-data?*', async route => {
    const date = new URL(route.request().url()).searchParams.get('date') || today()
    const householdPlan = plan(date)
    householdPlan.ministry = { ...householdPlan.ministry, contentFocus:'Serve together', prayerNeeds:prayers }
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ householdId:'lslj-family', plan:householdPlan }) })
  })
  await page.reload();await openTodayDetails(page)
  const ministry = page.locator('.today-pillar-brief[data-pillar="ministry"]')
  await expect(ministry).toContainText('14 prayer needs')
  await ministry.getByText('View all 14 prayer needs').click()
  await expect(ministry.locator('.today-prayer-needs li')).toHaveCount(14)
  await expect(ministry).toContainText('Household prayer request 14')
})

test('Today can browse tomorrow and the next seven days without changing a plan', async ({ page }) => {
  const tomorrow=new Date(`${today()}T12:00:00Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1)
  const tomorrowKey=tomorrow.toISOString().slice(0,10)
  await page.route('**/.netlify/functions/icloud-calendar*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({events:[{id:'tomorrow-visit',uid:'tomorrow-visit',source:'icloud',appleCalendarId:'larry-calendar',appleCalendarOwner:'Larry',title:'Tomorrow appointment',date:tomorrowKey,time:'2:30 PM',owner:'Family'}],connected:true,syncedAt:new Date().toISOString()})}))
  await page.reload();await openTodayDetails(page)
  await page.getByRole('button',{name:'Next 7 days'}).click()
  const picker=page.getByRole('combobox',{name:'Choose a day'})
  await expect(picker.locator('option')).toHaveCount(8)
  await expect(page.locator('.upcoming-schedule .today-dashboard')).toBeVisible()
  await expect(page.locator('.upcoming-schedule .weather-header')).toBeVisible()
  await page.locator('.upcoming-schedule .family-detail-library > summary').click()
  for (const pillar of ['spiritual','health','fitness','household','education','finance','ministry']) {
    const sections=page.locator(`.upcoming-schedule .family-detail-library > [data-pillar="${pillar}"]`)
    expect(await sections.count()).toBeGreaterThan(0)
    for(const section of await sections.all())await expect(section).toBeVisible()
  }
  await expect(page.getByRole('heading',{name:'Appointments & Meetings'})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Scheduled Chores'})).toBeVisible()
  await expect(page.locator('.upcoming-schedule .today-calendar-agenda')).toContainText('Tomorrow appointment')
  await expect(page.locator('.upcoming-schedule .today-calendar-agenda')).toContainText('2:30 PM')
  await expect(page.locator('.upcoming-schedule .today-meals')).toContainText('Eggs and Toast')
  await expect(page.locator('.upcoming-schedule')).not.toContainText('Set Today’s Focus')
  const last=await picker.locator('option').last().getAttribute('value')
  await picker.selectOption(last)
  await expect(page.locator('.upcoming-schedule .today-overview > header')).toContainText(new Date(`${last}T12:00:00`).toLocaleDateString('en-US',{month:'long',day:'numeric'}))
  await page.getByRole('button',{name:'Back to Today'}).click()
  await expect(page.getByRole('heading',{name:/Good (morning|afternoon|evening),/})).toBeVisible()
})

test('Top Outcomes retains spaces in the shared Alignment editor', async ({ page }) => {
  await openTodayDetails(page);await page.getByRole('button',{name:'Edit today’s plan'}).click()
  await page.getByRole('button',{name:'Add / Edit Outcomes',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Edit Outcomes'})
  const first=dialog.getByRole('textbox',{name:'Outcome 1',exact:true})
  await first.fill('LJ - Follow up with stormwater contractors')
  await dialog.getByRole('button',{name:'Add outcome',exact:true}).click()
  const second=dialog.getByRole('textbox',{name:'Outcome 2',exact:true})
  await second.fill('Review household schedule')
  await second.press('End');await second.press('Space')
  await expect(second).toHaveValue('Review household schedule ')
  await dialog.getByRole('button',{name:'Use in plan draft'}).click()
  await expect(page.getByRole('region',{name:'Today’s Outcomes',exact:true})).toContainText('LJ - Follow up with stormwater contractors')
  await page.getByRole('button',{name:/Next Pillar/}).click()
  await page.getByRole('button',{name:'Add / Edit Outcomes',exact:true}).click()
  await expect(first).toHaveValue('LJ - Follow up with stormwater contractors')
  await expect(second).toHaveValue('Review household schedule')
})

test('Tomorrow planning uses the shared schedule and four guidance cards and keeps outcome edits on tomorrow',async({page})=>{
 const next=new Date(`${today()}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1)
 const date=next.toISOString().slice(0,10)
 let writes=0
 page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('assistant-action'))writes++})
 await page.getByRole('button',{name:'Edit tomorrow’s plan'}).click()
 const overview=page.getByRole('region',{name:'Your day at a glance'})
 await expect(overview.locator('.today-four-questions > section')).toHaveCount(5)
 await expect(overview.getByRole('heading',{name:'Tomorrow’s Outcomes'})).toBeVisible()
 await expect(overview.getByRole('heading',{name:'How will this day unfold?'})).toBeVisible()
 await expect(overview).not.toContainText('Review today with Evening Recap.')
 await overview.getByRole('button',{name:'Add / Edit Outcomes'}).click()
 const dialog=page.getByRole('dialog',{name:'Edit Outcomes'})
 await expect(dialog.getByLabel('Scheduled date')).toHaveValue(date)
 await dialog.getByRole('textbox',{name:'Outcome 1',exact:true}).fill('Prepare for tomorrow’s interview')
 await dialog.getByRole('button',{name:'Use in plan draft'}).click()
 await expect(overview).toContainText('Prepare for tomorrow’s interview')
 await expect(page.getByRole('dialog',{name:'Brevity Assistant',exact:true})).toHaveCount(0)
 expect(writes).toBe(0)
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
})

test('deprecated My Planner workspace is not present in navigation', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'iphone') {
    await page.getByRole('button', { name:'Menu' }).click()
    await expect(page.locator('#primary-navigation-drawer')).toHaveClass(/is-expanded/)
  }
  await page.getByRole('button', { name:'Household Management',exact:true}).click()
  await expect(page.getByRole('complementary', { name: 'Primary navigation' }).getByRole('button', { name:'Household Operations' })).toBeVisible()
  await expect(page.getByRole('button', { name:'Family Calendar' })).toBeVisible()
  await expect(page.getByRole('button', { name:'My Planner' })).toHaveCount(0)
})

test('top-level pillar navigation returns to Today instead of the previously viewed pillar', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'iphone') await page.getByRole('button', { name:'Menu' }).click()
  await page.getByRole('button', { name:'Household Management',exact:true}).click()
  await page.getByRole('button', { name:'Spiritual Maturity',exact:true}).click()
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
  await page.getByRole('button', { name:'Physical Fitness',exact:true}).click()
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
  await page.getByRole('button', { name:'Add / Edit Outcomes' }).click()
  const outcomesDialog=page.getByRole('dialog',{name:'Edit Outcomes'})
  await expect(outcomesDialog.getByRole('textbox', { name:'Outcome 1',exact:true })).toBeVisible()
  await expect(outcomesDialog.getByLabel('Scheduled date')).toHaveValue(today())
  await outcomesDialog.getByRole('button',{name:'Cancel'}).click()
  await expect(household.getByRole('heading', { name:'Today’s Appointments & Meetings' })).toBeVisible()
  await expect(household.getByText('School planning meeting')).toBeVisible()
  await expect(household.getByText('Doctor appointment')).toBeVisible()
  await expect(household.getByRole('heading', { name:'Today’s Chores' })).toBeVisible()
  await page.getByRole('button',{name:'Household',exact:true}).click()
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

test('Today Finance separates accounts, limits cash flow to today and preserves unverified states', async ({ page }) => {
  const date=today(),tomorrow=new Date(`${date}T12:00:00Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1)
  const financeData={accounts:[{id:'cash',name:'Operating Account',type:'checking',balance:1250,plaidCurrentBalance:1250,plaidAccountId:'bank',plaidType:'depository',plaidSubtype:'checking'},{id:'save',name:'Savings',type:'savings',balance:2000,plaidCurrentBalance:2000,plaidAccountId:'bank2',plaidType:'depository',plaidSubtype:'savings'}],transactions:[{id:'bill',name:'Today bill',amount:100,type:'expense',freq:'once',start:date,acct:'cash'},{id:'future',name:'Tomorrow mortgage',amount:900,type:'expense',freq:'once',start:tomorrow.toISOString().slice(0,10),acct:'cash'},{id:'pay',name:'Today income',amount:500,type:'income',freq:'once',start:date,acct:'cash'}]}
  await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records:{lslj_finance_v9:{key:'lslj_finance_v9',value:JSON.stringify(financeData),version:1,updatedAt:new Date().toISOString()}}}}))
  await page.reload();await openTodayDetails(page)
  const finance=page.locator('.today-finance-brief')
  await expect(finance).toContainText('Balances & today’s cash flow')
  await expect(finance).toContainText('$1,250.00');await expect(finance).toContainText('$2,000.00')
  await expect(finance).toContainText('Projected month end')
  await expect(finance).toContainText('Today bill');await expect(finance).toContainText('Today income')
  await expect(finance).not.toContainText('Tomorrow mortgage')
  await expect(finance).toContainText('Expected');await expect(finance).toContainText('not proof of receipt or payment')
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
      start(){window.voiceTest.current=this;window.voiceTest.starts++;this.onstart?.();this.onaudiostart?.()}
      stop(){this.onend?.()}
      abort(){this.onend?.()}
    }
    window.Audio=class {
      constructor(){window.voiceTest.audio=this}
      async play(){if(!this.src?.startsWith('data:'))window.voiceTest.plays++}
      pause(){}
    }
  })
  await page.reload();await openTodayDetails(page)
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
    window.SpeechRecognition=class {start(){window.voiceTest.current=this;window.voiceTest.starts++;this.onstart?.();this.onaudiostart?.()}stop(){this.onend?.()}abort(){this.onend?.()}}
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
  await page.reload();await openTodayDetails(page)
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
  await page.reload();await openTodayDetails(page)
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
    window.SpeechRecognition=class{start(){window.voiceTest.starts++;this.onstart?.();this.onaudiostart?.()}stop(){this.onend?.()}abort(){this.onend?.()}}
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
  await page.reload();await openTodayDetails(page)
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
   const titles=await dialog.getByRole('option').allTextContents()
   expect(titles).toEqual([...titles].sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base',numeric:true})))
   await expect(dialog.getByRole('button',{name:'Review swap'})).toBeDisabled()
   await dialog.getByRole('combobox').selectOption('snack-premier-chocolate')
   await expect(dialog.getByRole('button',{name:'Review swap'})).toBeEnabled()
   await dialog.getByRole('button',{name:'Cancel'}).click()
 })
 test('Today calendar is scoped to Family and the signed-in member',async({page})=>{
   const calendar=page.locator('.today-calendar-agenda')
   await expect(calendar).toContainText('Larry’s calendar and shared commitments')
   await expect(calendar.getByRole('group',{name:'Calendars to show'})).toHaveCount(0)
   await expect(calendar.getByRole('button',{name:'Open Family Calendar',exact:true})).toBeVisible()
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
  await page.reload();await openTodayDetails(page)
  await expect.poll(()=>attempts).toBeGreaterThanOrEqual(2)
  await expect(page.locator('body')).not.toContainText('Transaction sync failed for every connected institution.')
})

test('persistent transaction failures disclose a safe cause and release the refresh spinner',async({page})=>{
  await page.route('**/.netlify/functions/plaid-transactions*',async route=>route.fulfill({status:502,json:{error:'Transaction sync failed for every connected institution.',errors:[{institution:'Fixture Bank',code:'PLAID_CURSOR_READ_FAILED',message:'The transaction checkpoint could not be read.'}]}}))
  await page.reload();await openTodayDetails(page)
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
  await page.reload();await openTodayDetails(page)
  await page.getByRole('button',{name:'Household',exact:true}).click()
  await expect(page.getByRole('region',{name:'Needs your attention'})).toContainText('Replenish Audit paper towels')
  await expect(page.getByRole('region',{name:'Needs your attention'})).not.toContainText('No household items need attention')
  await page.getByRole('button',{name:'Review source for Replenish Audit paper towels',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Household Cleaning Plan',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Back to Today',exact:true}).click()
  quantity=5
  await page.reload();await openTodayDetails(page)
  await page.getByRole('button',{name:'Household',exact:true}).click()
  await expect(page.getByRole('region',{name:'Needs your attention'})).not.toContainText('Replenish Audit paper towels')
})

test('an open Today calendar ages from verified to stale without losing appointments',async({page})=>{
  await page.clock.install({time:new Date()})
  await page.reload();await openTodayDetails(page)
  await expect(page.locator('.today-calendar-health')).toContainText('Calendar verified')
  await page.clock.fastForward(31*60*1000)
  await expect(page.locator('.today-calendar-health')).toContainText('Refresh before relying')
  await expect(page.locator('.today-calendar-agenda')).toContainText('Doctor appointment')
})


test('Next 7 Days sends the selected meal date to Brevity',async({page})=>{
  const requests=[]
  await page.route('**/.netlify/functions/brevity-conversation',route=>route.fulfill({json:{version:0,messages:[]}}))
  await page.route('**/.netlify/functions/brevity-assistant',async route=>{
    requests.push(route.request().postDataJSON())
    await route.fulfill({json:{message:'The selected date is ready for review.',proposal:null}})
  })
  await page.getByRole('button',{name:'Next 7 days'}).click()
  const date=await page.getByRole('combobox',{name:'Choose a day'}).inputValue()
  await expect(page.locator('.today-snack-card')).toHaveCount(2)
  await page.locator('.family-detail-library > summary').click()
  await page.getByText('Nutrition goals & food logged',{exact:true}).click()
  await page.getByRole('button',{name:'Balance my meals with Brevity'}).click()
  await expect.poll(()=>requests.length).toBe(1)
  const message=requests[0].messages.at(-1).content
  expect(message).toContain(`for ${date}.`)
  expect(message).toContain('Action Mode review')
  expect(message).not.toContain('for today.')
})

test('Next 7 Days refreshes shared chores and ages calendar verification while open',async({page})=>{
  await page.clock.install({time:new Date()})
  let source={customChores:[]},version=1
  const key='brevity_household_maintenance_v1'
  await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records:{[key]:{key,version,value:JSON.stringify(source),updatedAt:new Date().toISOString()}},serverTime:new Date().toISOString()}}))
  await page.reload();await openTodayDetails(page)
  await page.getByRole('button',{name:'Next 7 days'}).click()
  await expect(page.locator('.today-calendar-health')).toContainText('Calendar verified')
  const date=await page.getByRole('combobox',{name:'Choose a day'}).inputValue()
  source={customChores:[{id:'shared-future-chore',title:'Updated future source chore',date,owners:['Larry']}]};version++
  await page.clock.fastForward(11000)
  await expect(page.locator('.today-household-chores')).toContainText('Updated future source chore')
  source={customChores:[]};version++
  await page.clock.fastForward(11000)
  await expect(page.locator('.today-household-chores')).not.toContainText('Updated future source chore')
  await page.clock.fastForward(31*60*1000)
  await expect(page.locator('.today-calendar-health')).toContainText('Refresh before relying')
})

test('Today consumed macros compare all saved goals and update after review',async({page},testInfo)=>{
   let member='Larry',date=today(),totals={calories:650,proteinGrams:45.5,carbohydrateGrams:90,fatGrams:80},targets={calories:2200,proteinGrams:160,carbohydrateGrams:80,fatGrams:80},failed=false
   await page.route('**/.netlify/functions/nutrition-records',route=>route.fulfill({status:failed?503:200,contentType:'application/json',body:JSON.stringify({member,date,targets,days:[{member,date,totals,entries:totals.calories?[{id:'saved-meal'}]:[]}]})}))
   await page.reload();await openTodayDetails(page)
   const section=page.getByRole('region',{name:'Macro goals versus consumed'})
   await expect(section).toContainText('650 cal / 2,200 cal')
   await expect(section).toContainText('1,550 cal below goal')
   await expect(section).toContainText('45.5 g / 160 g')
   await expect(section).toContainText('114.5 g below goal')
   await expect(section).toContainText('10 g over goal')
   await expect(section).toContainText('Goal reached')
   await expect(section.getByRole('progressbar')).toHaveCount(4)
   await expect(section.getByRole('progressbar',{name:'Carbs consumed versus goal'})).toHaveAttribute('value','80')
   await section.screenshot({path:`test-results/consumed-macros-${testInfo.project.name}.png`})
   const refresh=()=>page.evaluate(()=>window.dispatchEvent(new CustomEvent('brevity-action-completed')))
   totals.calories=2300;await refresh();await expect(section).toContainText('100 cal over goal')
   await expect(section.getByRole('progressbar',{name:'Calories consumed versus goal'})).toHaveAttribute('value','2200')
   totals={calories:0,proteinGrams:0,carbohydrateGrams:0,fatGrams:0};await refresh();await expect(section).toContainText('No food has been logged today')
   delete totals.proteinGrams;await refresh();await expect(section).toContainText('Consumed amount not verified');await expect(section.getByRole('progressbar')).toHaveCount(3)
   targets={};await refresh();await expect(section).toContainText('Goal not set');await expect(section.getByRole('progressbar')).toHaveCount(0)
   member='Terica';totals.calories=999;await refresh();await expect(section).toContainText('Not verified');await expect(section).not.toContainText('999')
   member='Larry';date='2000-01-01';await refresh();await expect(section).toContainText('Some consumed macros could not be verified for today')
   failed=true;await refresh();await expect(section).toContainText('Not verified');await expect(section.getByRole('progressbar')).toHaveCount(0)
 })

test('voice recovers a stalled microphone after read aloud and preserves a draft on manual restart',async({page},testInfo)=>{
  await page.route('**/.netlify/functions/brevity-conversation',r=>r.fulfill({json:{version:0,messages:[{role:'assistant',content:'Ready for your next question.'}]}}))
  await page.route('**/elevenlabs-voices',r=>r.fulfill({json:{voices:[{voice_id:'test-voice',name:'Test voice'}]}}))
  await page.route('**/elevenlabs-tts',r=>r.fulfill({contentType:'audio/mpeg',body:'test-audio'}))
  await page.addInitScript(()=>{
    localStorage.setItem('brevity_el_voice_v1','test-voice')
    window.voiceTest={starts:0,loads:0,current:null,audio:null}
    window.SpeechRecognition=class {
      start(){window.voiceTest.current=this;window.voiceTest.starts++;this.onstart?.();if(window.voiceTest.starts===1)this.onaudiostart?.()}
      stop(){this.onend?.()}
      abort(){this.onend?.()}
    }
    window.Audio=class {
      constructor(){window.voiceTest.audio=this}
      async play(){}
      pause(){}
      removeAttribute(){this.src=''}
      load(){window.voiceTest.loads++}
    }
  })
  await page.reload();await openTodayDetails(page)
  await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Brevity Assistant',exact:true})
  await expect(dialog.getByText('Ready for your next question.',{exact:true})).toBeVisible()
  await page.clock.install()
  await dialog.getByRole('button',{name:'Start voice conversation',exact:true}).click()
  await dialog.getByRole('button',{name:'Read response aloud',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>Boolean(window.voiceTest.audio.onended))).toBe(true)
  await page.evaluate(()=>window.voiceTest.audio.onended())
  // Retain the element but release its native source before reopening capture.
  expect(await page.evaluate(()=>window.voiceTest.loads)).toBe(1)
  await page.clock.fastForward(300)
  await expect(dialog.getByText(/Voice conversation on · Starting microphone/)).toBeVisible()
  await expect(dialog.getByPlaceholder('Listening…',{exact:true})).toHaveCount(0)
  await page.clock.fastForward(4000)
  await page.clock.fastForward(300)
  expect(await page.evaluate(()=>window.voiceTest.starts)).toBe(3)
  // A second startup failure is bounded; silence after healthy capture is not.
  await page.clock.fastForward(4000)
  await expect(dialog.getByRole('alert')).toContainText('microphone stopped returning speech')
  await expect(dialog.getByPlaceholder('Listening…',{exact:true})).toHaveCount(0)
  await dialog.locator('textarea').fill('Keep this draft')
  const restartButton=dialog.getByRole('button',{name:'Restart microphone',exact:true})
  const restartBox=await restartButton.boundingBox()
  expect(restartBox.width).toBeGreaterThan(140)
  expect(restartBox.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({path:`test-results/voice-recovery-${testInfo.project.name}.png`})
  await restartButton.click()
  await page.evaluate(()=>{window.voiceTest.current.onaudiostart();window.voiceTest.current.onresult({results:[[{transcript:'and this new question'}]]})})
  await expect(dialog.locator('textarea')).toHaveValue('Keep this draft and this new question')
  await dialog.getByRole('button',{name:'Close Brevity Assistant',exact:true}).click()
  const starts=await page.evaluate(()=>window.voiceTest.starts)
  await page.clock.fastForward(30000)
  expect(await page.evaluate(()=>window.voiceTest.starts)).toBe(starts)
})

test('manual microphone restart waits for native release, preserves speech, and ignores retired callbacks',async({page})=>{
  await page.route('**/.netlify/functions/brevity-conversation',r=>r.fulfill({json:{version:0,messages:[]}}))
  await page.addInitScript(()=>{
    window.voiceTest={starts:0,active:null,overlap:0}
    window.SpeechRecognition=class {
      start(){
        if(window.voiceTest.active){window.voiceTest.overlap++;throw Error('Native session still active')}
        window.voiceTest.active=this;window.voiceTest.starts++;this.onstart?.();this.onaudiostart?.()
      }
      abort(){const end=this.onend;setTimeout(()=>{window.voiceTest.active=null;end?.()},600)}
      stop(){this.abort()}
    }
  })
  await page.reload();await openTodayDetails(page)
  await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Brevity Assistant',exact:true})
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now()+1000))
  await dialog.getByRole('button',{name:'Start voice conversation',exact:true}).click()
  await page.evaluate(()=>{
    const r=window.voiceTest.active;window.voiceTest.oldResult=r.onresult
    r.onresult({results:[[{transcript:'Keep my question'}]]})
  })
  await expect(dialog.locator('textarea')).toHaveValue('Keep my question')
  await dialog.getByRole('button',{name:'Restart microphone',exact:true}).click()
  await expect(dialog.getByText(/Reconnecting microphone/)).toBeVisible()
  await page.clock.fastForward(500)
  expect(await page.evaluate(()=>window.voiceTest.starts)).toBe(1)
  await page.clock.fastForward(100)
  await expect.poll(()=>page.evaluate(()=>window.voiceTest.starts)).toBe(2)
  expect(await page.evaluate(()=>window.voiceTest.overlap)).toBe(0)
  await page.evaluate(()=>{
    window.voiceTest.oldResult({results:[[{transcript:'stale speech'}]]})
    window.voiceTest.active.onresult({results:[[{transcript:'about tomorrow'}]]})
  })
  await expect(dialog.locator('textarea')).toHaveValue('Keep my question about tomorrow')
  await expect(dialog.getByText(/Transcribing/)).toBeVisible()
  await dialog.getByRole('button',{name:'Restart microphone',exact:true}).click()
  await dialog.getByRole('button',{name:'Close Brevity Assistant',exact:true}).click()
  await page.clock.fastForward(30000)
  expect(await page.evaluate(()=>window.voiceTest.starts)).toBe(2)
})

test('Today has one outcomes editor in the outcomes card and does not repeat the primary priority',async({page})=>{
  await openTodayDetails(page)
  const focus=page.getByRole('region',{name:'Today’s Outcomes',exact:true})
  await expect(focus).toBeVisible()
  await expect(focus.getByRole('button',{name:'Add / Edit Outcomes',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Set today’s focus',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Add / Edit Outcomes',exact:true})).toHaveCount(1)
  const bubbles=focus.locator('.today-focus-bubbles li strong')
  await expect(bubbles.first()).toBeVisible()
  const titles=await bubbles.allTextContents()
  expect(new Set(titles).size).toBe(titles.length)
  await expect(focus.locator('.today-primary-focus')).toHaveCount(0)
})

test('household archive searches saved history and displays source coverage', async ({page})=>{
 await page.route('**/.netlify/functions/household-archive?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({rows:[{date:today(),kind:'day',title:'Stormwater and job search',coverage:'Saved daily plan only; historical calendar and chore states were not captured.',plan:{household:{keyFocus:'Stormwater and job search'},recap:{wins:['Called the engineer']}}}],cursor:null})}))
 await page.getByRole('button',{name:'History & archives',exact:true}).click()
 const archive=page.getByRole('region',{name:'Household archive'})
 await expect(archive).toBeVisible()
 await archive.getByLabel('Search',{exact:true}).fill('engineer')
 await archive.getByRole('button',{name:'Search history',exact:true}).click()
 await archive.getByRole('button',{name:/Stormwater and job search/}).click()
 await expect(archive.locator('article')).toContainText('Called the engineer')
 await expect(archive.locator('article')).toContainText('were not captured')
 await archive.getByRole('button',{name:'Return to Today'}).click()
 await expect(page.getByRole('region',{name:'Today’s Outcomes'})).toBeVisible()
})

test('routine source review shows proposals without silently saving them', async ({page},testInfo)=>{
 let changes=0
 page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('assistant-action'))changes++})
 await page.route('**/.netlify/functions/household-routine-review?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({week:[{member:'Nyla',date:today(),weekday:5,items:[{id:'one',title:'Living room care',timing:'2–4 PM',source:'Chore',status:'pending'}],conflicts:[]}],proposals:[{sourceId:'one',title:'Living room care',owner:'Nyla',days:[5],startTime:'14:00',endTime:'14:30',sourceTitle:'Saved recurring chore'}],questions:['Javin: confirm the after-work time.'],notice:'Proposed work blocks are not completion records.',scheduleVersion:1})}))
 if(testInfo.project.name==='iphone')await page.getByRole('button',{name:'Menu'}).click()
 await page.getByRole('button',{name:'Household Management',exact:true}).click()
 await page.getByRole('complementary', { name: 'Primary navigation' }).getByRole('button', { name:'Household Operations',exact:true}).click()
 if(testInfo.project.name==='iphone')await page.getByRole('button',{name:'Collapse navigation',exact:true}).click()
 await page.getByRole('button',{name:'Routines',exact:true}).click()
 const review=page.getByRole('region',{name:'Build routines from household records'})
 await review.getByRole('button',{name:'Review chores & calendars'}).click()
 await expect(review).toContainText('confirm the after-work time')
 await expect(review).toContainText('Proposed, not saved')
 await review.getByRole('checkbox').check()
 await expect(review.getByRole('button',{name:'Review 1 selected blocks'})).toBeVisible()
 expect(changes).toBe(0)
})

test('six voice turns resume capture after delayed native shutdown and quiet follow-up pauses',async({page})=>{
 await page.route('**/.netlify/functions/brevity-conversation',r=>r.fulfill({json:{version:0,messages:[]}}))
 let requests=0
 await page.route('**/.netlify/functions/brevity-assistant',r=>r.fulfill({json:{message:`Voice answer ${++requests}`,proposal:null}}))
 await page.route('**/elevenlabs-voices',r=>r.fulfill({json:{voices:[{voice_id:'test-voice',name:'Test'}]}}))
 await page.route('**/elevenlabs-tts',r=>r.fulfill({contentType:'audio/mpeg',body:'test'}))
 await page.addInitScript(()=>{
  localStorage.setItem('brevity_el_voice_v1','test-voice')
  window.voiceTest={starts:0,active:null,audio:null,plays:0,overlap:0}
  window.SpeechRecognition=class{
   start(){if(window.voiceTest.active){window.voiceTest.overlap++;throw Error('Still releasing')};window.voiceTest.active=this;window.voiceTest.starts++;this.onstart?.();this.onaudiostart?.()}
   stop(){} // Exercise the stop watchdog on every turn.
   abort(){const end=this.onend;setTimeout(()=>{if(window.voiceTest.active===this)window.voiceTest.active=null;end?.()},900)}
  }
  window.Audio=class{constructor(){window.voiceTest.audio=this}play(){if(!this.src?.startsWith('data:'))window.voiceTest.plays++;return Promise.resolve()}pause(){}}
 })
 await page.reload();await openTodayDetails(page)
 await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Brevity Assistant',exact:true})
 await page.clock.install()
 await dialog.getByRole('button',{name:'Start voice conversation',exact:true}).click()
 for(let turn=1;turn<=6;turn++){
  await expect.poll(()=>page.evaluate(()=>window.voiceTest.starts)).toBe(turn)
  // Thinking for a minute must not exhaust retries or disable voice mode.
  await page.clock.runFor(60000)
  expect(await page.evaluate(()=>window.voiceTest.starts)).toBe(turn)
  await expect(dialog.getByRole('button',{name:'Stop voice conversation',exact:true})).toBeVisible()
  await page.evaluate(n=>{const result=[{transcript:`Question ${n}`}];result.isFinal=true;window.voiceTest.active.onresult({results:[result]})},turn)
  await page.clock.runFor(7000);await page.clock.runFor(400)
  await expect.poll(()=>requests).toBe(turn)
  await expect.poll(()=>page.evaluate(()=>window.voiceTest.plays)).toBe(turn)
  await page.evaluate(()=>window.voiceTest.audio.onended())
  await page.clock.runFor(300)
  expect(await page.evaluate(()=>window.voiceTest.starts)).toBe(turn)
  await page.clock.runFor(600)
  await expect.poll(()=>page.evaluate(()=>window.voiceTest.starts)).toBe(turn+1)
 }
 expect(await page.evaluate(()=>window.voiceTest.overlap)).toBe(0)
 await dialog.getByRole('button',{name:'Close Brevity Assistant',exact:true}).click()
})

test('completed proposal card removes approval control and stays completed after reload',async({page})=>{
 let completed=false,executions=0
 const proposal={id:'card-1',state:'pending',summary:'Create repaint project',risk:'confirmation',operations:[{id:'op-1',domain:'projects',description:'Paint exterior brick',defaultScope:'this-item',allowedScopes:['this-item'],payload:{}}]}
 await page.route('**/.netlify/functions/brevity-conversation',r=>r.fulfill({json:{version:1,messages:[{role:'assistant',content:'Review this project',proposal:{...proposal,state:completed?'executed':'pending'}}]}}))
 await page.route('**/.netlify/functions/brevity-assistant-actions?action=execute',r=>{executions++;completed=true;return r.fulfill({json:{audit:{id:'audit-1',summary:proposal.summary,taskLinks:[]}}})})
 await page.reload();await openTodayDetails(page)
 await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Brevity Assistant',exact:true})
 await dialog.getByRole('button',{name:'Review changes',exact:true}).click()
 await page.getByRole('button',{name:'Apply approved changes',exact:true}).click()
 await expect(dialog.locator('.brevity-action-proposal')).toContainText('Completed')
 await expect(dialog.getByRole('button',{name:'Review changes',exact:true})).toHaveCount(0)
 await page.reload();await openTodayDetails(page)
 await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
 await expect(dialog.locator('.brevity-action-proposal')).toContainText('Completed')
 await expect(dialog.getByRole('button',{name:'Review changes',exact:true})).toHaveCount(0)
 expect(executions).toBe(1)
})

test('routine workspace reviews a single day, a recurring change and household edits with exact IDs',async({page},testInfo)=>{
 const routine=(id,owner)=>({id,title:`${owner} focus`,owner,participants:[],days:[0,1,2,3,4,5,6],startTime:'08:00',endTime:'12:00',enabled:true,pillar:'Household Management',notes:''})
 const key='brevity_household_schedule_v1',source={version:1,blocks:[],routines:[routine('larry-focus','Larry'),routine('nyla-focus','Nyla')],routineOverrides:{}}
 await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records:{[key]:{key,version:1,value:JSON.stringify(source),updatedAt:new Date().toISOString()}},serverTime:new Date().toISOString()}}))
 await page.reload();await expect(page.locator('.today-dashboard')).toBeVisible()
 let request
 await page.route('**/.netlify/functions/brevity-assistant-actions?*',async route=>{if(route.request().method()==='POST'){request=route.request().postDataJSON();return route.fulfill({status:409,json:{error:'Review captured for test'}})}return route.fallback()})
 if(testInfo.project.name==='iphone'&&!(await page.locator('#primary-navigation-drawer').getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Menu',exact:true}).click()
 await page.getByRole('button',{name:'Household Management',exact:true}).click()
 await page.getByRole('button',{name:'Schedule & Routines',exact:true}).click()
 if(testInfo.project.name==='iphone'&&(await page.locator('#primary-navigation-drawer').getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Collapse navigation',exact:true}).click()
 const workspace=page.locator('.household-schedule')
 await expect(workspace.getByRole('heading',{name:'Larry focus',exact:true})).toBeVisible()
 await workspace.getByRole('button',{name:'Change one day',exact:true}).click()
 const editor=page.getByRole('region',{name:'Routine editor'})
 await editor.getByLabel('Routine start',{exact:true}).fill('09:00')
 await editor.getByLabel('Routine end',{exact:true}).fill('12:30')
 await editor.getByRole('button',{name:'Review this day’s change',exact:true}).click()
 await expect.poll(()=>request?.operation?.type).toBe('household.schedule.occurrence.update')
 expect(request.operation.targetId).toBe('larry-focus');expect(request.operation.payload.date).toBe(today())
 expect(request.operation.payload.startTime).toBe('09:00')
 await editor.getByLabel('Apply change to').selectOption('recurring')
 await editor.getByLabel('Routine start',{exact:true}).fill('09:00')
 await editor.getByRole('button',{name:'Review recurring routine',exact:true}).click()
 await expect.poll(()=>request?.operation?.type).toBe('household.schedule.routine.update')
 expect(request.operation.targetId).toBe('larry-focus');expect(request.operation.payload).not.toHaveProperty('date')
 await editor.getByRole('button',{name:'Cancel',exact:true}).click()
 await workspace.getByLabel('View routines for').selectOption('Household')
 await workspace.getByRole('checkbox',{name:'Select Larry focus for Larry',exact:true}).check()
 await workspace.getByRole('checkbox',{name:'Select Nyla focus for Nyla',exact:true}).check()
 await workspace.getByRole('button',{name:'Review household change',exact:true}).click()
 await expect.poll(()=>request?.operations?.length).toBe(2)
 expect(request.operations.map(x=>x.targetId)).toEqual(['larry-focus','nyla-focus'])
 expect(request.operations.every(x=>x.type==='household.schedule.occurrence.update')).toBe(true)
 const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}))
 expect(width.scroll).toBeLessThanOrEqual(width.viewport+1)
})


test('members default to their routines and can view everyone without editing others',async({page},testInfo)=>{
 const routine=(id,owner)=>({id,title:`${owner} focus`,owner,participants:[],days:[1,2,3,4,5],startTime:'08:00',endTime:'12:00',enabled:true,pillar:'Household Management',notes:''})
 const key='brevity_household_schedule_v1',source={version:1,blocks:[],routines:[routine('larry-focus','Larry'),routine('nyla-focus','Nyla')],routineOverrides:{}}
 await page.route('**/.netlify/functions/household-auth?action=session',route=>route.fulfill({json:{authenticated:true,member:'Nyla',role:'member',bootstrapRequired:false}}))
 await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records:{[key]:{key,version:1,value:JSON.stringify(source),updatedAt:new Date().toISOString()}},serverTime:new Date().toISOString()}}))
 await page.reload();await expect(page.locator('.today-dashboard')).toBeVisible()
 if(testInfo.project.name==='iphone'&&!(await page.locator('#primary-navigation-drawer').getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Menu',exact:true}).click()
 await page.getByRole('button',{name:'Household Management',exact:true}).click()
 await page.getByRole('button',{name:'Schedule & Routines',exact:true}).click()
 if(testInfo.project.name==='iphone'&&(await page.locator('#primary-navigation-drawer').getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Collapse navigation',exact:true}).click()
 const workspace=page.locator('.household-schedule'),filter=workspace.getByLabel('View routines for')
 await expect(filter).toHaveValue('Nyla')
 await expect(workspace.getByRole('heading',{name:'Nyla focus',exact:true})).toBeVisible()
 await expect(workspace.getByRole('button',{name:'Edit recurring routine',exact:true})).toBeVisible()
 await filter.selectOption('Larry')
 await expect(workspace.getByRole('heading',{name:'Larry focus',exact:true})).toBeVisible()
 await expect(workspace.getByRole('button',{name:'Edit recurring routine',exact:true})).toHaveCount(0)
 await expect(workspace.getByRole('button',{name:'Change one day',exact:true})).toHaveCount(0)
 await workspace.getByRole('button',{name:'Add routine',exact:true}).click()
 await expect(page.getByRole('region',{name:'Routine editor'}).getByLabel('Routine owner')).toHaveValue('Nyla')
 await filter.selectOption('Household')
 await expect(workspace.getByRole('heading',{name:'Larry focus',exact:true})).toBeVisible()
 await expect(workspace.getByRole('heading',{name:'Nyla focus',exact:true})).toBeVisible()
 await expect(workspace.getByRole('button',{name:'Edit recurring routine',exact:true})).toHaveCount(1)
 await expect(workspace.getByRole('checkbox',{name:/Select .* for/})).toHaveCount(0)
})

test('unfinished work carries forward and completion reviews the original dated record',async({page},testInfo)=>{
 const original='2026-09-01',operation={type:'assignment.update',targetDate:original,targetId:'saved-task',payload:{status:'complete'}}
 const item={id:'assignment:saved-task',title:'Finish exterior brick preparation',owner:'Larry',participants:[],originalDate:original,carriedForward:true,source:{kind:'assignment',date:original,id:'saved-task'},operation,expectedVersion:7}
 let completed=false,request
 await page.route('**/.netlify/functions/open-work?*',route=>route.fulfill({json:{date:today(),items:completed?[]:[item,{...item,id:'other',title:'Nyla open task',owner:'Nyla'}]}}))
 await page.route('**/.netlify/functions/brevity-assistant-actions?*',async route=>{if(route.request().method()==='POST'){request=route.request().postDataJSON();return route.fulfill({status:409,json:{error:'Review captured for test'}})}return route.fallback()})
 await page.reload();await openTodayDetails(page)
 if(testInfo.project.name==='iphone'&&(await page.locator('#primary-navigation-drawer').getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Collapse navigation',exact:true}).click()
 const work=page.getByRole('region',{name:'Open work',exact:true})
 await expect(work.getByText(item.title,{exact:true})).toBeVisible()
 await expect(work.getByText('Nyla open task',{exact:true})).toHaveCount(0)
 await expect(work.getByText('Larry · Carried forward from 2026-09-01',{exact:true})).toBeVisible()
 await work.getByRole('button',{name:'Mark complete',exact:true}).click()
 await expect.poll(()=>request?.operation?.targetId).toBe('saved-task')
 expect(request.operation.targetDate).toBe(original);expect(request.expectedVersion).toBe(7)
 await expect(work.getByText(item.title,{exact:true})).toBeVisible()
 completed=true
 await page.reload();await expect(page.getByRole('region',{name:'Open work',exact:true}).getByText(item.title,{exact:true})).toHaveCount(0)
})

test('Today opens with schedule and compact pillar briefing while detailed resources stay closed',async({page},testInfo)=>{
 await page.route('**/.netlify/functions/open-work?*',route=>route.fulfill({json:{items:Array.from({length:38},(_,i)=>({id:`assignment:old-${i}`,title:`Old August responsibility ${i}`,owner:'Larry',participants:[],originalDate:'2026-08-19',source:{kind:'assignment',id:`old-${i}`,date:'2026-08-19'}}))}}))
 await page.route('**/.netlify/functions/health-care',route=>route.fulfill({json:{version:1,items:[{id:'today',title:'Scheduled dental visit',member:'Larry',type:'Dental',status:'Scheduled',date:today()},{id:'old',title:'Unscheduled old need',member:'Larry',status:'Needs scheduling',date:'2026-08-19'},{id:'other',title:'Other member appointment',member:'Nyla',status:'Scheduled',date:today()}]}}))
 await page.reload();await expect(page.locator('.today-overview')).toBeVisible()
 for(const question of ['Today’s Outcomes','What should I do now?','What needs my attention?','What remains today?'])await expect(page.getByRole('heading',{name:question,exact:true})).toBeVisible()
 await expect(page.locator('.family-pillar-grid > article')).toHaveCount(7)
 await expect(page.locator('.family-detail-library')).not.toHaveAttribute('open','')
 await page.locator('.family-detail-library > summary').click()
 const ordered=await page.locator('.family-detail-library > [data-pillar]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.dataset.pillar))])
 expect(ordered).toEqual(['spiritual','health','fitness','household','education','finance','ministry'])
 for(const pillar of ordered)await expect(page.locator(`.family-detail-library > [data-pillar="${pillar}"]`).first()).toBeVisible()
 await expect(page.getByText('Old August responsibility 0',{exact:true}).filter({visible:true})).toHaveCount(0)
 const care=page.getByRole('region',{name:'Scheduled health appointments',exact:true})
 await expect(care).toContainText('Scheduled dental visit');await expect(care).not.toContainText('Unscheduled old need');await expect(care).not.toContainText('Other member appointment')
 await expect(page.locator('.today-four-questions')).not.toContainText('Old August responsibility')
 await expect(page.locator('.today-macro-summary').first()).not.toBeVisible()
 const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));expect(width.scroll).toBeLessThanOrEqual(width.viewport+1)
})


test('Education opens a household learning hub and preserves the tutor workspace',async({page})=>{
 await page.getByRole('button',{name:'Open Education',exact:true}).click()
 const hub=page.locator('.learning-hub')
 await expect(hub.getByRole('heading',{name:'Education',exact:true})).toBeVisible()
 await hub.getByRole('button',{name:'Learning Programs',exact:true}).click()
 await expect(hub.getByRole('button',{name:'AI Curriculum',exact:true})).toBeVisible()
 await hub.getByRole('button',{name:'AI Curriculum',exact:true}).click()
 await hub.getByLabel('Title',{exact:true}).fill('Practical AI')
 await expect(hub.getByRole('button',{name:'Review changes',exact:true})).toBeVisible()
 await hub.getByRole('button',{name:'Cancel',exact:true}).click()
 await hub.getByRole('button',{name:'Open Isaiah’s Daily Tutor',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Daily Tutor',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Back to Education',exact:true}).click()
 await expect(page.locator('.learning-hub')).toBeVisible()
})

test('page requests use compact conversation without a backdrop and only changes open confirmation',async({page})=>{
 await page.route('**/.netlify/functions/brevity-conversation',r=>r.fulfill({json:{version:1,messages:[]}}))
 await page.route('**/.netlify/functions/brevity-assistant',r=>r.fulfill({json:{message:'What would you like to learn?',proposal:null}}))
 await page.reload();await openTodayDetails(page)
 await page.getByRole('button',{name:'Open Education',exact:true}).click()
 await page.getByRole('button',{name:'Plan with Brevity',exact:true}).click()
 const compact=page.getByRole('region',{name:'Brevity Assistant',exact:true})
 await expect(compact.getByText('What would you like to learn?',{exact:true})).toBeVisible()
 await expect(page.locator('.brevity-assistant-backdrop')).toHaveCount(0)
 await expect(page.getByRole('dialog',{name:'Review proposed Brevity changes',exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Speak to Brevity',exact:true})).toBeVisible()
 await compact.getByRole('button',{name:'Expand conversation',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'Brevity Assistant',exact:true})).toBeVisible()
})


test('Education saves only an approved item and shows the saved record after refresh',async({page})=>{
 let items=[],version=0,proposal=null,executions=0
 await page.route('**/.netlify/functions/learning-hub',r=>r.fulfill({json:{items,version}}))
 await page.route('**/.netlify/functions/brevity-assistant-actions?action=prepare-direct',async r=>{
  const input=r.request().postDataJSON()
  proposal={id:'learning-review',actor:'Larry',state:'pending',risk:'confirmation',summary:input.summary,operations:[{...input.operation,id:'learning-op',domain:'planning',allowedScopes:['this-item'],defaultScope:'this-item',risk:'confirmation'}]}
  await r.fulfill({json:{proposal}})
 })
 await page.route('**/.netlify/functions/brevity-assistant-actions?action=execute',async r=>{
  executions++;const op=proposal.operations[0];items=[{...op.payload,id:op.targetId}];version++
  await r.fulfill({json:{audit:{summary:'Learning item saved',operations:proposal.operations}}})
 })
 await page.getByRole('button',{name:'Open Education',exact:true}).click()
 const hub=page.locator('.learning-hub')
 await hub.getByRole('button',{name:'Add learning item',exact:true}).click()
 await hub.getByLabel('Title',{exact:true}).fill('Discuss responsible AI')
 await hub.getByRole('combobox',{name:'Type',exact:true}).selectOption('session')
 await hub.getByLabel('Date',{exact:true}).fill(today())
 await hub.getByRole('button',{name:'Review changes',exact:true}).click()
 const review=page.getByRole('dialog',{name:'Review proposed Brevity changes',exact:true})
 await expect(review).toBeVisible();expect(executions).toBe(0)
 await review.getByRole('button',{name:'Apply approved changes',exact:true}).click()
 await expect(hub.getByRole('heading',{name:'Discuss responsible AI',exact:true})).toBeVisible()
 expect(executions).toBe(1)
 await expect(page.locator('.brevity-assistant-drawer.is-open')).toHaveCount(0)
 await page.reload();await openTodayDetails(page)
 await page.getByRole('button',{name:'Open Education',exact:true}).click()
 await expect(page.locator('.learning-hub').getByRole('heading',{name:'Discuss responsible AI',exact:true})).toBeVisible()
})

for(const failure of ['speech request','playback'])test(`voice resumes after stalled ${failure} and keeps final words from native stop`,async({page})=>{
 await page.route('**/.netlify/functions/brevity-conversation',r=>r.fulfill({json:{version:0,messages:[{role:'assistant',content:'A response to read.'}]}}))
 let sent=null
 await page.route('**/.netlify/functions/brevity-assistant',r=>{sent=r.request().postDataJSON();return r.fulfill({json:{message:'Follow-up received.',proposal:null}})})
 await page.route('**/elevenlabs-voices',r=>r.fulfill({json:{voices:[{voice_id:'test-voice',name:'Test'}]}}))
 await page.route('**/elevenlabs-tts',r=>failure==='speech request'?undefined:r.fulfill({contentType:'audio/mpeg',body:'test'}))
 await page.addInitScript(()=>{
  localStorage.setItem('brevity_el_voice_v1','test-voice')
  window.voiceTest={starts:0,current:null,audio:null}
  window.SpeechRecognition=class{
   start(){window.voiceTest.current=this;window.voiceTest.starts++;this.onstart?.();this.onaudiostart?.()}
   stop(){const result=[{transcript:'My complete follow-up'}];result.isFinal=true;this.onresult?.({results:[result]});this.onend?.()}
   abort(){this.onend?.()}
  }
  window.Audio=class{constructor(){window.voiceTest.audio=this;this.currentTime=0}play(){return Promise.resolve()}pause(){}removeAttribute(){this.src=''}load(){}}
 })
 await page.reload();await openTodayDetails(page)
 await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Brevity Assistant',exact:true})
 await expect(dialog.getByText('A response to read.',{exact:true})).toBeVisible()
 await page.clock.install()
 await dialog.getByRole('button',{name:'Start voice conversation',exact:true}).click()
 await dialog.getByRole('button',{name:'Read response aloud',exact:true}).click()
 await expect(dialog.getByText(failure==='speech request'?/Preparing spoken response/:/Speaking…/)).toBeVisible()
 await page.clock.runFor(failure==='speech request'?45000:15000)
 await expect.poll(()=>page.evaluate(()=>window.voiceTest.starts)).toBe(2)
 await expect(dialog.getByRole('alert')).toContainText(failure==='speech request'?'took too long':'playback was interrupted')
 // Quiet native sessions can end with no-speech repeatedly; those are not faults.
 for(let i=0;i<3;i++){
  await page.evaluate(()=>window.voiceTest.current.onerror({error:'no-speech'}))
  await page.clock.runFor(300)
  await expect.poll(()=>page.evaluate(()=>window.voiceTest.starts)).toBe(3+i)
 }
 await page.evaluate(()=>window.voiceTest.current.onresult({results:[[{transcript:'My incomplete'}]]}))
 await page.clock.runFor(7000)
 await expect.poll(()=>sent?.messages?.at(-1)?.content).toBe('My complete follow-up')
 await dialog.getByRole('button',{name:'Close Brevity Assistant',exact:true}).click()
 const starts=await page.evaluate(()=>window.voiceTest.starts)
 await page.clock.runFor(60000)
 expect(await page.evaluate(()=>window.voiceTest.starts)).toBe(starts)
})

test('microphone permission denial stops retries and explains the remembered Safari setting',async({page})=>{
 await page.addInitScript(()=>{
  window.voiceTest={starts:0}
  window.SpeechRecognition=class{
   start(){window.voiceTest.starts++;this.onerror?.({error:'not-allowed'})}
   abort(){this.onend?.()}
  }
 })
 await page.reload();await openTodayDetails(page)
 await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Brevity Assistant',exact:true})
 await page.clock.install()
 await dialog.getByRole('button',{name:'Start voice conversation',exact:true}).click()
 await expect(dialog.getByRole('alert')).toContainText('Website Settings → Microphone → Allow')
 await page.clock.runFor(60000)
 expect(await page.evaluate(()=>window.voiceTest.starts)).toBe(1)
 await expect(dialog.getByRole('button',{name:'Start voice conversation',exact:true})).toBeVisible()
})

test('microphone permission prompt waiting does not create repeated automatic requests',async({page})=>{
 await page.addInitScript(()=>{
  window.voiceTest={starts:0}
  window.SpeechRecognition=class{start(){window.voiceTest.starts++}abort(){this.onend?.()}}
 })
 await page.reload();await openTodayDetails(page)
 await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Brevity Assistant',exact:true})
 await page.clock.install()
 await dialog.getByRole('button',{name:'Start voice conversation',exact:true}).click()
 await page.clock.runFor(10000)
 expect(await page.evaluate(()=>window.voiceTest.starts)).toBe(1)
 await expect(dialog.getByRole('button',{name:'Stop voice conversation',exact:true})).toBeVisible()
 await page.clock.runFor(50000)
 expect(await page.evaluate(()=>window.voiceTest.starts)).toBe(1)
 await expect(dialog.getByRole('alert')).toContainText('microphone did not connect')
 await expect(dialog.getByRole('button',{name:'Restart microphone',exact:true})).toBeVisible()
})

test('Today personal guidance groups household work and highlights major appointments',async({page},testInfo)=>{
 await page.route('**/.netlify/functions/household-data*',route=>{
  const p=plan();p.topPriorities=[];p.household.keyFocus='Financial Review / Daily Schedule Alignment / LinkedIn & Résumé Optimization'
  p.assignments=['Larry','Lorenzo','Terica','Nyla','Javin','Isaiah'].flatMap(owner=>['Financial Review','Daily Schedule Alignment'].map((title,index)=>({id:`${owner}-${index}`,title,owner,date:today(),priority:'high',status:'pending'})))
  return route.fulfill({json:{householdId:'lslj-family',plan:p}})
 })
 await page.route('**/.netlify/functions/icloud-calendar*',route=>route.fulfill({json:{connected:true,syncedAt:new Date().toISOString(),events:[
  {id:'medical',source:'icloud',title:'TS- Dr. Appointment',date:today(),time:'3:00 PM',endTime:'4:00 PM',owner:'Family',ownershipKnown:false},
  {id:'bank',source:'icloud',appleCalendarId:'family',appleCalendarOwner:'Family',title:'Send bank files',date:today(),time:'11:00 AM',owner:'Lorenzo'},
  {id:'tutor',source:'icloud',appleCalendarId:'larry',appleCalendarOwner:'Larry',title:'Isaiah Daily Tutor',date:today(),time:'2:45 PM',owner:'Nyla',participants:['Larry','Lorenzo','Terica','Nyla','Javin','Isaiah'],recurring:true}
 ]}}))
 await page.reload();await expect(page.locator('.today-overview')).toBeVisible()
 if((page.viewportSize()?.width||1440)<700&&await page.getByRole('button',{name:'Collapse navigation',exact:true}).isVisible())await page.getByRole('button',{name:'Collapse navigation',exact:true}).click()
 const overview=page.getByRole('region',{name:'Your day at a glance',exact:true})
 await expect(overview.locator('.today-focus-bubbles li')).toHaveCount(1)
 await expect(overview.locator('.today-focus-bubbles li')).toContainText('Financial Review / Daily Schedule Alignment / LinkedIn & Résumé Optimization')
 await overview.locator('.family-heads-up > summary').click()
 const major=overview.getByRole('region',{name:'Major household calendar items'})
 await expect(major).toContainText('TS- Dr. Appointment');await expect(major).toContainText('3:00 PM');await expect(major).toContainText('Owner unconfirmed');await expect(major).not.toContainText('Isaiah Daily Tutor')
 const remaining=overview.getByRole('region',{name:'Remaining today'})
 await expect(remaining).not.toContainText('Send bank files');await expect(remaining).not.toContainText('Lorenzo');await expect(remaining).not.toContainText('Isaiah Daily Tutor')
 const attention=overview.getByRole('region',{name:'Needs your attention'})
 await expect(attention).not.toContainText('Overdue:');await expect(attention).not.toContainText('Lorenzo')
 await overview.getByRole('button',{name:'Household',exact:true}).click()
 const showAll=remaining.getByRole('button',{name:/^Show all .* remaining$/})
 if(await showAll.isVisible())await showAll.click()
 await expect(remaining.getByText('Financial Review',{exact:true})).toHaveCount(1)
 await expect(remaining.getByText('Daily Schedule Alignment',{exact:true})).toHaveCount(1)
 await remaining.getByRole('button',{name:'Update Financial Review',exact:true}).click()
 await expect(overview.getByRole('region',{name:'Shared task participants'}).getByRole('button',{name:/^Review /})).toHaveCount(6)
 await overview.getByRole('button',{name:'Close participant review'}).click()
 await overview.locator('#today-focus').screenshot({path:testInfo.outputPath('today-personal-priorities.png')})
})

test('Today separates proposed outcomes from saved editable outcomes',async({page})=>{
 await expect(page.locator('.today-overview')).toBeVisible()
 await page.locator('details[aria-label="Suggested daily outcomes"] > summary').click()
 await expect(page.locator('details[aria-label="Suggested daily outcomes"]')).toContainText('Protect the household rhythm')
 await expect(page.locator('details[aria-label="Suggested daily outcomes"]')).toContainText('An agreed outcome is still unfinished.')
 const outcomes=page.getByRole('region',{name:'Today’s Outcomes',exact:true})
 await expect(outcomes).toContainText('Protect the household rhythm')
 await expect(outcomes.getByRole('button',{name:'Add / Edit Outcomes',exact:true})).toBeVisible()
 await expect(page.getByText('No focus has been set for this day.',{exact:true})).toHaveCount(0)
})

test('Today keeps pillar planning compact and exposes sourced planning context on demand',async({page})=>{
 const section=page.locator('details[aria-label="Pillar planning and schedule conflicts"]')
 await expect(section).toBeVisible()
 await expect(section.getByRole('button',{name:'Review pillar balance with Brevity'})).toBeHidden()
 await section.locator('summary').click()
 await expect(section).toContainText('Spiritual Maturity')
 await expect(section).toContainText('Physical Fitness')
 await expect(section).toContainText('Timing overlaps')
 await expect(section.getByRole('button',{name:'Review pillar balance with Brevity'})).toBeVisible()
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
 await page.evaluate(()=>window.addEventListener('brevity-assistant-requested',event=>{window.planningReviewMessage=event.detail.message;event.stopImmediatePropagation()},{capture:true,once:true}))
 await section.getByRole('button',{name:'Review pillar balance with Brevity'}).click()
 const message=await page.evaluate(()=>window.planningReviewMessage)
 expect(message).toContain('Retrieve the exact dated plan fields')
 const context=JSON.parse(message.split('Context: ')[1])
 expect(context.pillars.some(x=>x.pillar==='spiritual')).toBe(true)
 expect(Array.isArray(context.timing.conflicts)).toBe(true)
})


test('Direct outcomes editing reviews the exact date without opening Ask Brevity',async({page})=>{
 let request=null
 await page.route('**/.netlify/functions/brevity-assistant-actions?action=prepare-direct',async r=>{
  request=r.request().postDataJSON()
  await r.fulfill({json:{proposal:{id:'outcome-review',actor:'Larry',state:'pending',risk:'confirmation',summary:request.summary,operations:[{...request.operations[0],id:'outcome-op',domain:'planning',allowedScopes:['this-item'],defaultScope:'this-item',risk:'confirmation'}]}}})
 })
 await page.getByRole('button',{name:'Add / Edit Outcomes',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Edit Outcomes'})
 await dialog.getByRole('textbox',{name:'Outcome 1',exact:true}).fill('Prepare interview notes')
 await dialog.getByLabel('Status',{exact:true}).selectOption('complete')
 await dialog.getByRole('button',{name:'Review outcomes',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'Review proposed Brevity changes',exact:true})).toBeVisible()
 expect(request.operations[0].targetDate).toBe(today())
 expect(request.operations[0].payload.patch.priorities[0]).toMatchObject({id:'priority-1',title:'Prepare interview notes',status:'complete'})
 await expect(page.getByRole('dialog',{name:'Brevity Assistant',exact:true})).toHaveCount(0)
})


test('Outcomes shows the first three saved priorities and expands the complete list',async({page})=>{
 await page.route('**/.netlify/functions/household-data*',route=>{
  const p=plan();p.topPriorities=['First outcome','Second outcome','Third outcome','Fourth outcome'].map((title,index)=>({id:`outcome-${index}`,title,owner:'Family',status:'pending'}));p.household.priorities=p.topPriorities
  return route.fulfill({json:{householdId:'lslj-family',plan:p}})
 })
 await page.reload()
 const outcomes=page.getByRole('region',{name:'Today’s Outcomes',exact:true})
 await expect(outcomes.locator('.today-focus-bubbles li')).toHaveCount(3)
 await expect(outcomes).not.toContainText('Fourth outcome')
 await outcomes.getByRole('button',{name:'Show all 4 outcomes'}).click()
 await expect(outcomes.locator('.today-focus-bubbles li')).toHaveCount(4)
 await expect(outcomes).toContainText('Fourth outcome')
 await outcomes.getByRole('button',{name:'Show top three'}).click()
 await expect(outcomes.locator('.today-focus-bubbles li')).toHaveCount(3)
})
