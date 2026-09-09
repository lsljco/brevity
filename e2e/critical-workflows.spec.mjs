import { test, expect } from '@playwright/test'

const dateKey=()=>{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
const plan=()=>{const today=dateKey();return{id:`daily-plan-${today}`,date:today,theme:'Steady stewardship',dayObjective:'Execute today well.',governingPrinciple:'Do the known work.',successStandard:'Critical commitments complete.',topPriorities:[{id:'p1',title:'Protect the household rhythm',owner:'Family',status:'pending',priority:'high',participants:[]},{id:'p2',title:'Complete today’s essential commitments',owner:'Larry',status:'pending',priority:'high',participants:[]},{id:'p3',title:'Prepare tomorrow before closeout',owner:'Family',status:'pending',priority:'normal',participants:[]}],spiritual:{owner:'Family',scope:'household',scripture:['Psalm 1:3'],devotionFocus:'Shared household devotion',prayerFocus:['Wisdom'],discussionPrompts:[],obedienceAction:'Practice the teaching.'},health:{owner:'Terica',breakfast:'Eggs',lunch:'Chicken and vegetables',dinner:'Fish and vegetables',snacks:'Fruit',hydration:'Water',groceries:[],nextDayPrep:''},fitness:{owner:'Larry',location:'Lifetime Gym',participants:[],workout:'Strength',objective:'Train',departureTime:'',returnTime:'',stepGoal:10000,recovery:'',requiresDecision:false},household:{owner:'Larry',appointments:[],priorities:[],errands:[],openItems:[]},education:{owner:'Larry',thinkTankTopic:'',thinkTankDeliverable:'',isaiah:{owner:'Family',readingMinutes:20,sightWordsMinutes:10,comprehensionMinutes:10,mathMinutes:10,notes:''}},finance:{owner:'Larry',bills:[],purchases:[],transfers:[],accountsToFund:[],incomePipeline:[],decisionRule:''},ministry:{owners:['Larry','Lorenzo'],meetings:[],contentFocus:'',fellowshipFollowUps:[],prayerNeeds:[]},assignments:[],decisions:[],dayparts:[],recap:{wins:[],carryovers:[],lessons:[],tomorrowPrep:[],completedAt:''},version:1}}
const cashForecastRecords=()=>{
  const updatedAt=new Date().toISOString()
  const today=dateKey()
  const finance={calendarDataVersion:6,accounts:[{id:'a1',name:'Operating Account',type:'checking',balance:1000,plaidAccountId:'plaid-operating',plaidType:'depository',plaidSubtype:'checking',plaidCurrentBalance:1000}],transactions:[{id:'planned-grocery',name:'Planned groceries',type:'expense',amount:40,acct:'a1',freq:'once',start:today,end:today}]}
  const actuals=[
    {id:'bank-transfer',accountId:'plaid-operating',name:'Capital One payment',originalStatement:'PAYMENT TO CAPITAL ONE',category:'TRANSFER_OUT',amount:75,date:today,pending:false},
    {id:'bank-grocery',accountId:'plaid-operating',name:'Neighborhood Market',category:'FOOD_AND_DRINK',amount:25,date:today,pending:false},
    {id:'bank-pending',accountId:'plaid-operating',name:'Gas station authorization',category:'TRANSPORTATION',amount:30,date:today,pending:true},
  ]
  return Object.fromEntries(Object.entries({lslj_finance_v9:finance,plaid_actuals_cache:actuals}).map(([key,value])=>[key,{key,value:JSON.stringify(value),version:1,updatedAt}]))
}
const alreadyLinkedAccountRecords=()=>{
  const updatedAt=new Date().toISOString()
  const finance={calendarDataVersion:6,accounts:[
    {id:'operating',name:'Operating Account',type:'checking',balance:100,plaidAccountId:'bank-operating'},
    {id:'projects',name:'Renovation / Projects',type:'checking',balance:200,plaidAccountId:'bank-projects'},
    {id:'savings',name:'LSLJ Savings',type:'savings',balance:300,plaidAccountId:'bank-savings'},
  ],transactions:[]}
  return {lslj_finance_v9:{key:'lslj_finance_v9',value:JSON.stringify(finance),version:1,updatedAt}}
}
async function mockBackend(page,{financeFixture=false,accountLinkFixture=false,alreadyLinkedExtrasFixture=false}={}){
  await page.route('**/.netlify/functions/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname,action=url.searchParams.get('action')
    let body={}
    if(path.endsWith('/household-auth')&&action==='session')body={authenticated:true,member:'Larry',role:'admin',bootstrapRequired:false}
    else if(path.endsWith('/household-auth')&&action==='members')body={members:[]}
    else if(path.endsWith('/household-state')){
      if(route.request().method()==='PUT'){
        const payload=route.request().postDataJSON()
        body={conflict:false,record:{...payload,version:Number(payload.expectedVersion||0)+1,updatedAt:new Date().toISOString(),updatedBy:'Larry'}}
      }else body={records:alreadyLinkedExtrasFixture?alreadyLinkedAccountRecords():(financeFixture||accountLinkFixture)?cashForecastRecords():{},serverTime:new Date().toISOString()}
    }else if(path.endsWith('/household-data'))body={householdId:'lslj-family',plan:plan()}
    else if(path.endsWith('/icloud-calendar'))body={events:[],connected:true,syncedAt:new Date().toISOString()}
    else if(path.endsWith('/plaid-accounts'))body=alreadyLinkedExtrasFixture?{
      connected:true,balanceMode:'live',balanceProvenance:'plaid.accountsBalanceGet',syncedAt:new Date().toISOString(),errors:[],requiresUpdate:[],
      accountSourceReceipt:{payload:'test',signature:'a'.repeat(64)},
      accounts:[
        {accountId:'bank-operating',itemId:'item-1',institution:'Pinnacle',name:'Operating Account',type:'depository',subtype:'checking',mask:'2200',balance:150.58},
        {accountId:'bank-projects',itemId:'item-1',institution:'Pinnacle',name:'Renovation / Projects',type:'depository',subtype:'checking',mask:'4607',balance:1052.51},
        {accountId:'bank-savings',itemId:'item-1',institution:'Pinnacle',name:'LSLJ Savings',type:'depository',subtype:'savings',mask:'9638',balance:13000.20},
        ...Array.from({length:10},(_,index)=>({accountId:`untracked-${index}`,itemId:'item-1',institution:'Pinnacle',name:`Untracked ${index}`,type:'depository',subtype:'checking',mask:`10${String(index).padStart(2,'0')}`,balance:index})),
      ],
    }:accountLinkFixture?{
      connected:true,balanceMode:'live',balanceProvenance:'plaid.accountsBalanceGet',syncedAt:new Date().toISOString(),errors:[],requiresUpdate:[],
      accountSourceReceipt:{payload:'test',signature:'a'.repeat(64)},
      accounts:[
        {accountId:'bank-checking',itemId:'item-1',institution:'Pinnacle',name:'Personal Checking',type:'depository',subtype:'checking',mask:'0607',balance:756.74},
        {accountId:'bank-savings',itemId:'item-1',institution:'Pinnacle',name:'Personal Savings',type:'depository',subtype:'savings',mask:'4412',balance:2400},
      ],
    }:{connected:false,accounts:[],errors:[],syncedAt:new Date().toISOString()}
    else if(path.endsWith('/plaid-transactions'))body=alreadyLinkedExtrasFixture
      ? url.searchParams.get('refresh_only')==='1'
          ? {connected:true,transactions:[],errors:[],refresh:{requested:true,requestedAt:'2026-09-08T23:00:00.000Z',accepted:1,errors:[]}}
          : url.searchParams.get('refresh_status')==='1'
            ? {connected:true,transactions:[],errors:[],refresh:{requested:true,requestedAt:'2026-09-08T23:00:00.000Z',accepted:1,completed:1,stillProcessing:false,errors:[]}}
            : {connected:true,mode:'incremental',transactions:[],removed:[],errors:[],syncedAt:new Date().toISOString(),successfulInstitutions:['Pinnacle'],sourceReceipts:[{cursorIdentity:'item-1',batchId:'a'.repeat(64)}]}
      : {connected:false,transactions:[],errors:[]}
    else if(path.endsWith('/health-alerts'))body={alerts:[]}
    else if(path.endsWith('/onedrive-status'))body={configured:true,connected:true,changeRequired:false,connection:{account:'test'}}
    else if(path.endsWith('/sermon-device-rescue'))body={sermons:[],imports:[]}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
  })
}
async function openMenuIfMobile(page,testInfo){if(testInfo.project.name==='iphone'){const drawer=page.locator('#primary-navigation-drawer');if(!(await drawer.getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Menu'}).click();await expect(drawer).toHaveClass(/is-expanded/)}}

test.beforeEach(async({page},testInfo)=>{await mockBackend(page,{financeFixture:testInfo.title.includes('Cash Forecast')||testInfo.title.includes('categorization rules'),accountLinkFixture:testInfo.title.includes('account-link repair'),alreadyLinkedExtrasFixture:testInfo.title.includes('already-linked')});await page.goto('/');await expect(page.locator('.app-shell')).toBeVisible()})

test('Today surfaces populated Daily Outcomes from the daily plan',async({page})=>{for(const outcome of ['Protect the household rhythm','Complete today’s essential commitments','Prepare tomorrow before closeout'])await expect(page.getByText(outcome)).toBeVisible();await expect(page.locator('body')).not.toContainText('Outcome not set')})

test('Household Operations exposes Schedule, Routines, Operations and Inventory without crashing',async({page},testInfo)=>{await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Household Management'}).click();await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Household Operations'}).click();for(const label of ['Schedule','Routines','Operations','Supplies & Inventory'])await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();await expect(page.locator('body')).not.toContainText('Something went wrong')})

test('Finance primary workspaces open without a fatal error',async({page},testInfo)=>{await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Finance',exact:true}).click();for(const label of ['Dashboard','Meetings','Transactions','Cash Forecast','Accounts','Budget','Recurring','Reporting']){await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:label,exact:true}).click();await expect(page.locator('body')).not.toContainText('Something went wrong');await expect(page.locator('body')).not.toContainText('Application error')}})

test('posted transaction categorization rules are discoverable and preview exact bank matches',async({page},testInfo)=>{
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Transactions',exact:true}).click()
  await page.getByRole('button',{name:'Show bank activity'}).click()
  await page.getByRole('button',{name:'Categorization rules'}).click()
  const dialog=page.getByRole('dialog',{name:'Categorization rules'})
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Original statement contains').fill('Market')
  await dialog.getByLabel('Apply category').fill('Groceries')
  await expect(dialog).toContainText('1 posted sample found.')
  await expect(dialog).toContainText('Neighborhood Market')
  await expect(dialog.getByRole('option',{name:'Operating Account'})).toHaveCount(1)
  await expect(dialog.getByRole('button',{name:'Review new rule'})).toBeEnabled()
})

test('Finance workspaces fit phone and tablet viewports without overlapping filters',async({page},testInfo)=>{
  test.skip(testInfo.project.name==='desktop-chromium','responsive contract')
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  for(const label of ['Dashboard','Meetings','Transactions','Cash Forecast','Accounts','Budget','Recurring','Reporting']){
    await openMenuIfMobile(page,testInfo)
    await page.getByRole('button',{name:label,exact:true}).click()
    await expect.poll(()=>page.locator('.app-main').evaluate(element=>element.scrollWidth-element.clientWidth),`${label} workspace should not overflow .app-main`).toBeLessThanOrEqual(1)
  }
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Transactions',exact:true}).click()
  const controls=page.locator('.transaction-list-controls > *')
  const boxes=await controls.evaluateAll(elements=>elements.map(element=>{
    const rect=element.getBoundingClientRect()
    return{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}
  }))
  for(let left=0;left<boxes.length;left+=1){
    for(let right=left+1;right<boxes.length;right+=1){
      const a=boxes[left],b=boxes[right]
      const overlapX=Math.min(a.right,b.right)-Math.max(a.left,b.left)
      const overlapY=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)
      expect(overlapX>1&&overlapY>1,`transaction controls ${left} and ${right} overlap`).toBe(false)
    }
  }
})

test('iPhone Cash Forecast clearly separates its monthly plan without a sticky account overlap',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='iphone','iPhone Cash Forecast contract')
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Cash Forecast',exact:true}).click()

  await expect(page.getByRole('heading',{name:'Cash Forecast',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:/Show \d+ bank transactions? for /})).toBeVisible()
  await expect(page.getByText('Dates / Timeframe',{exact:true})).toHaveCount(0)
  await expect(page.locator('.finance-calendar-mobile-agenda')).toContainText('Planned activity')
  await expect(page.locator('.finance-calendar-mobile-agenda')).toContainText(/(?:Reconstructed posted close|Estimated historical cash balance|Current bank liquidity|Latest stored cash balance|Projected cash balance)/)
  await page.getByRole('button',{name:/Show 3 bank transactions for /}).click()
  const agenda=page.locator('.finance-calendar-mobile-agenda')
  await expect(agenda).toContainText('Bank activity')
  await expect(agenda).toContainText('Posted · Transfer · PAYMENT TO CAPITAL ONE')
  await expect(agenda).toContainText('Pending · Gas station authorization')
  await expect(agenda).toContainText(/Pending authorizations\s*−\$30\.00\s*· excluded from posted movement/)
  await expect(agenda).toContainText(/Posted movement\s*−\$100\.00/)
  await agenda.locator(':scope > button').filter({hasText:'PAYMENT TO CAPITAL ONE'}).click()
  await expect(page.getByText(/Transfer · included in bank balance movement, excluded from income and expense totals/)).toBeVisible()
  await page.getByRole('button',{name:'Next financial calendar month'}).click()
  await expect(agenda.locator(':scope > button.is-selected')).toHaveCount(0)
  await expect(page.locator('.finance-calendar-day-header')).toHaveCount(0)

  const layout=await page.evaluate(()=>{
    const account=document.querySelector('.finance-account-filter')
    const intro=document.querySelector('.finance-calendar-intro')
    const root=document.querySelector('.finance-root')
    const accountBox=account?.getBoundingClientRect()
    const introBox=intro?.getBoundingClientRect()
    return{
      accountPosition:account?getComputedStyle(account).position:'missing',
      rootOverflow:root?getComputedStyle(root).overflowY:'missing',
      overlaps:Boolean(accountBox&&introBox&&Math.min(accountBox.bottom,introBox.bottom)-Math.max(accountBox.top,introBox.top)>1),
    }
  })
  expect(layout).toEqual({accountPosition:'static',rootOverflow:'visible',overlaps:false})
})

test('iPhone account-link repair turns an unmatched balance warning into a compatible reviewed choice',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='iphone','iPhone account-link repair contract')
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Dashboard',exact:true}).click()
  await page.getByRole('button',{name:'Check existing connection'}).click()
  const warning=page.getByRole('alert')
  await expect(warning).toContainText('returned bank accounts are available for reviewed linkage')
  await warning.getByRole('button',{name:'Review account links'}).click()
  const selector=page.getByRole('combobox',{name:'Bank source for Operating Account'})
  await expect(selector).toBeVisible()
  await selector.selectOption({label:'Pinnacle · Personal Checking ••••0607'})
  await expect(page.getByRole('button',{name:'Review link'})).toBeEnabled()
  await expect.poll(()=>page.locator('.app-main').evaluate(element=>element.scrollWidth-element.clientWidth)).toBeLessThanOrEqual(1)
})

test('iPad already-linked accounts ignore additional institution accounts without a false partial warning',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='tablet','iPad already-linked account contract')
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Dashboard',exact:true}).click()
  await page.getByRole('button',{name:'Check existing connection'}).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('status').filter({hasText:'The latest available transactions were checked.'})).toBeVisible()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Accounts',exact:true}).click()
  await expect(page.getByRole('note')).toContainText('All 3 Brevity accounts are linked to verified bank sources. No action is required.')
  await expect(page.getByRole('button',{name:'Linked'})).toHaveCount(3)
  await expect(page.getByRole('button',{name:'Review link'})).toHaveCount(0)
})

test('Family Calendar opens as the single shared calendar surface',async({page},testInfo)=>{await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Household Management'}).click();await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Family Calendar'}).click();await expect(page.locator('body')).not.toContainText('My Planner');await expect(page.locator('body')).not.toContainText('Something went wrong')})

test('Settings remains operational when optional integration payloads are empty',async({page},testInfo)=>{await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Settings'}).click();await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();await expect(page.locator('body')).not.toContainText('Recovery Mode');await expect(page.locator('body')).not.toContainText('Cannot read properties of undefined')})

test('iPhone alignment keeps Next Pillar above fixed bottom navigation',async({page},testInfo)=>{test.skip(testInfo.project.name!=='iphone','iPhone layout contract');await page.getByRole('button',{name:/Start Today’s Alignment/}).click();const next=page.getByRole('button',{name:'Next Pillar'}),bottomNav=page.locator('.mobile-app-nav'),main=page.locator('.app-main');await expect(next).toBeVisible();await expect(bottomNav).toBeVisible();await main.evaluate(element=>{element.scrollTop=element.scrollHeight});await expect.poll(async()=>{const nextBox=await next.boundingBox(),navBox=await bottomNav.boundingBox();return nextBox&&navBox?Math.round(navBox.y-(nextBox.y+nextBox.height)):-999},{timeout:5000}).toBeGreaterThanOrEqual(0)})
