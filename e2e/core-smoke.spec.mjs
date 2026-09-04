import { test, expect } from '@playwright/test'

const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

const plan = () => ({
  id: `daily-plan-${today()}`,
  date: today(),
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
  household: { owner:'Larry', appointments:[], priorities:[], errands:[], openItems:[] },
  education: { owner:'Larry', thinkTankTopic:'', thinkTankDeliverable:'', isaiah:{ owner:'Family', readingMinutes:20, sightWordsMinutes:10, comprehensionMinutes:10, mathMinutes:10, notes:'' } },
  finance: { owner:'Larry', bills:[], purchases:[], transfers:[], accountsToFund:[], incomePipeline:[], decisionRule:'' },
  ministry: { owners:['Larry','Lorenzo'], meetings:[], contentFocus:'', fellowshipFollowUps:[], prayerNeeds:[] },
  assignments:[], decisions:[], dayparts:[], recap:{ wins:[], carryovers:[], lessons:[], tomorrowPrep:[], completedAt:'' }, version:1,
})

async function mockBackend(page) {
  await page.route('**/.netlify/functions/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const action = url.searchParams.get('action')
    let body = {}
    if (path.endsWith('/household-auth') && action === 'session') body = { authenticated:true, member:'Larry', role:'admin', bootstrapRequired:false }
    else if (path.endsWith('/household-auth') && action === 'members') body = { members:[] }
    else if (path.endsWith('/household-state')) body = { records:{} }
    else if (path.endsWith('/household-data')) body = { householdId:'lslj-family', plan:plan() }
    else if (path.endsWith('/icloud-calendar')) body = { events:[], connected:true, syncedAt:new Date().toISOString() }
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

test('Today renders operating content without a fatal application error', async ({ page }) => {
  await expect(page.getByRole('button', { name:'Today' }).first()).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Something went wrong')
  await expect(page.locator('body')).not.toContainText('Application error')
})

test('mobile shell keeps fixed navigation inside the viewport without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'mobile-only assertion')
  const dimensions = await page.evaluate(() => ({ width:window.innerWidth, scrollWidth:document.documentElement.scrollWidth }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1)
  const nav = page.locator('.mobile-app-nav')
  await expect(nav).toBeVisible()
  const box = await nav.boundingBox()
  expect(box).not.toBeNull()
  expect(box.y + box.height).toBeLessThanOrEqual(dimensions.width * 3)
})
