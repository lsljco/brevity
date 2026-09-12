import { test, expect } from '@playwright/test'

const dateKey=()=>{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
const plan=()=>{const today=dateKey();return{id:`daily-plan-${today}`,date:today,theme:'Steady stewardship',dayObjective:'Execute today well.',governingPrinciple:'Do the known work.',successStandard:'Critical commitments complete.',topPriorities:[{id:'p1',title:'Protect the household rhythm',owner:'Family',status:'pending',priority:'high',participants:[]},{id:'p2',title:'Complete today’s essential commitments',owner:'Larry',status:'pending',priority:'high',participants:[]},{id:'p3',title:'Prepare tomorrow before closeout',owner:'Family',status:'pending',priority:'normal',participants:[]}],spiritual:{owner:'',scope:'household',scripture:['Psalm 1:3'],devotionFocus:'Shared household devotion',prayerFocus:['Wisdom'],discussionPrompts:[],obedienceAction:'Practice the teaching.',todayFocus:'Weekly Word',sermonNotes:{documentTitle:'Weekly Word',sevenDayFormationPlan:Array.from({length:7},(_,index)=>({title:`Day ${index+1}`,scripture:'Psalm 1:3',paragraphs:['Shared household devotion'],steps:['Practice the teaching.']}))},sermonSource:{active:true,activeVersion:2,sourceHash:'a'.repeat(64),sermonDate:today,title:'Weekly Word'}},health:{owner:'Terica',breakfast:'Eggs',lunch:'Chicken and vegetables',dinner:'Fish and vegetables',snacks:'Fruit',hydration:'Water',groceries:[],nextDayPrep:''},fitness:{owner:'Larry',location:'Lifetime Gym',participants:[],workout:'Strength',objective:'Train',departureTime:'',returnTime:'',stepGoal:10000,recovery:'',requiresDecision:false},household:{owner:'Larry',appointments:[],priorities:Array.from({length:4},(_,index)=>({id:`household-${index+1}`,title:`Household attention item ${index+1}`,status:'pending',priority:'normal'})),errands:[],openItems:[]},education:{owner:'Larry',thinkTankTopic:'',thinkTankDeliverable:'',isaiah:{owner:'Family',readingMinutes:20,sightWordsMinutes:10,comprehensionMinutes:10,mathMinutes:10,notes:''}},finance:{owner:'Larry',bills:[],purchases:[],transfers:[],accountsToFund:[],incomePipeline:[],decisionRule:''},ministry:{owners:['Larry','Lorenzo'],meetings:[],contentFocus:'',fellowshipFollowUps:[],prayerNeeds:[]},assignments:[],decisions:[],dayparts:[],recap:{wins:[],carryovers:[],lessons:[],tomorrowPrep:[],completedAt:''},version:1}}
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
const mealPlanResponse=(addedMeal=null)=>{
  const now=new Date().toISOString(),start=dateKey()
  const meals=[
    {id:'breakfast-eggs',mealType:'breakfast',name:'Eggs and Toast',description:'Eggs and whole-grain toast.',prepMinutes:10,totalMinutes:10,serving:'1 plate',macros:{calories:350,proteinGrams:22,carbohydrateGrams:30,fatGrams:14}},
    {id:'lunch-chicken',mealType:'lunch',name:'Chicken and Vegetables',description:'Grilled chicken with vegetables.',prepMinutes:15,totalMinutes:15,serving:'1 plate',macros:{calories:480,proteinGrams:48,carbohydrateGrams:32,fatGrams:18}},
    {id:'dinner-fish',mealType:'dinner',name:'Fish and Vegetables',description:'Roasted fish with vegetables.',prepMinutes:20,totalMinutes:20,serving:'1 plate',macros:{calories:520,proteinGrams:46,carbohydrateGrams:38,fatGrams:20}},
    ...(addedMeal?[addedMeal]:[]),
  ]
  const days=Array.from({length:7},(_,index)=>{
    const date=new Date(`${start}T12:00:00.000Z`);date.setUTCDate(date.getUTCDate()+index)
    const dateValue=date.toISOString().slice(0,10)
    return{id:`meal-plan-${dateValue}`,date:dateValue,version:1,meals:{breakfast:'breakfast-eggs',lunch:'lunch-chicken',dinner:'dinner-fish'},substitutions:{},resolvedMeals:{breakfast:meals[0],lunch:meals[1],dinner:meals[2]},createdAt:now,updatedAt:now}
  })
  return{householdId:'lslj-family',startDate:start,days,library:meals,librarySummary:{total:meals.length,counts:{breakfast:1+(addedMeal?1:0),lunch:1,dinner:1}}}
}
async function mockBackend(page,{financeFixture=false,accountLinkFixture=false,alreadyLinkedExtrasFixture=false}={}){
  let addedMeal=null
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
    else if(path.endsWith('/meal-plans')){
      if(route.request().method()==='POST'){
        const payload=route.request().postDataJSON()
        addedMeal={...payload,id:'custom-breakfast-browser-test',custom:true}
        body={meal:addedMeal}
      }else body=mealPlanResponse(addedMeal)
    }
    else if(path.endsWith('/meal-nutrition'))body={nutrition:{
      ingredients:[
        {input:'2 cups Pearl Milling Company pancake mix',resolvedName:'Pearl Milling Company pancake mix',amountDescription:'2 cups',basis:'Package-label estimate',confidence:'medium',macros:{calories:1200,proteinGrams:24,carbohydrateGrams:252,fatGrams:6}},
        {input:'1 cup water',resolvedName:'Water',amountDescription:'1 cup',basis:'Water',confidence:'high',macros:{calories:0,proteinGrams:0,carbohydrateGrams:0,fatGrams:0}},
        {input:'1 stick salted butter',resolvedName:'Salted butter',amountDescription:'1 stick',basis:'Standard portion estimate',confidence:'high',macros:{calories:810,proteinGrams:1,carbohydrateGrams:0,fatGrams:92}},
      ],
      yieldQuantity:12,yieldUnit:'pancakes',serving:'1 pancake',batchMacros:{calories:2010,proteinGrams:25,carbohydrateGrams:252,fatGrams:98},perServingMacros:{calories:167.5,proteinGrams:2.1,carbohydrateGrams:21,fatGrams:8.2},warnings:['Confirm the exact package label.'],nutritionBasis:'Calculated by Brevity from the measured ingredient list.',
    }}
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
    else if(path.endsWith('/brevity-assistant-actions')&&action==='prepare-direct'){
      const input=route.request().postDataJSON(),operation=input.operation||input.operations?.[0]
      body={proposal:{id:'direct-review-proposal',summary:input.summary,risk:operation?.payload?.applyToExisting?'strong-confirmation':'confirmation',operations:[{...operation,id:'direct-review-operation',domain:'finance',allowedScopes:['this-item'],defaultScope:'this-item',risk:operation?.payload?.applyToExisting?'strong-confirmation':'confirmation'}]}}
    }
    else if(path.endsWith('/health-alerts'))body={alerts:[]}
    else if(path.endsWith('/onedrive-status'))body={configured:true,connected:true,changeRequired:false,connection:{account:'test'}}
    else if(path.endsWith('/sermon-device-rescue'))body={sermons:[],imports:[]}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
  })
}
async function openMenuIfMobile(page,testInfo){if(testInfo.project.name==='iphone'){const drawer=page.locator('#primary-navigation-drawer');if(!(await drawer.getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Menu'}).click();await expect(drawer).toHaveClass(/is-expanded/)}}

test.beforeEach(async({page},testInfo)=>{await mockBackend(page,{financeFixture:testInfo.title.includes('Cash Forecast')||testInfo.title.includes('categorization rules')||testInfo.title.includes('transaction category'),accountLinkFixture:testInfo.title.includes('account-link repair'),alreadyLinkedExtrasFixture:testInfo.title.includes('already-linked')});await page.goto('/');await expect(page.locator('.app-shell')).toBeVisible()})

test('Today surfaces populated Daily Outcomes from the daily plan',async({page})=>{for(const outcome of ['Protect the household rhythm','Complete today’s essential commitments','Prepare tomorrow before closeout'])await expect(page.getByText(outcome)).toBeVisible();await expect(page.locator('body')).not.toContainText('Outcome not set')})

test('Today renders and counts unresolved Household Operations priorities',async({page})=>{
  const panel=page.locator('.today-attention')
  await expect(panel.getByRole('heading',{name:'Needs Attention'})).toBeVisible()
  await expect(panel.locator('header > strong')).toHaveText('4')
  for(let index=1;index<=4;index+=1)await expect(panel.getByText(`Household attention item ${index}`)).toBeVisible()
  await expect(page.locator('body')).not.toContainText("Can't find variable: signals")
})

test('Today last three pillar cards expose recorded detail instead of generic headings',async({page})=>{
  const education=page.locator('[data-pillar="education"]')
  const finance=page.locator('[data-pillar="finance"]')
  const ministry=page.locator('[data-pillar="ministry"]')
  await expect(education).toContainText('Education plan not defined')
  await expect(education).toContainText('20 min reading · 10 min math')
  await expect(finance).toContainText('No financial output, decision rule, bill, or purchase is recorded for today.')
  await expect(ministry).toContainText('No ministry focus, meeting, fellowship follow-up, or prayer need is recorded for today.')
  await expect(finance).not.toContainText('Financial Stewardship')
})

test('Meal Library calculates batch and per-serving nutrition from measured ingredients',async({page},testInfo)=>{
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Health & Nutrition',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Meal Plan',exact:true}).click()
  await page.getByRole('button',{name:'Meal Library',exact:true}).click()
  await page.getByRole('button',{name:'Add Breakfast',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Add a meal'})
  await dialog.getByLabel('Meal name').fill('Saturday Pancakes')
  await dialog.getByLabel(/Measured ingredients/).fill('2 cups Pearl Milling Company pancake mix\n1 cup water\n1 stick salted butter')
  await dialog.getByLabel('Prep time (minutes)').fill('5')
  await dialog.getByLabel('Cook time (minutes)').fill('15')
  await dialog.getByLabel('Batch yield').fill('12')
  await dialog.getByLabel('Yield unit').fill('pancakes')
  await dialog.getByRole('button',{name:'Calculate nutrition'}).click()
  const preview=dialog.getByLabel('Calculated nutrition preview')
  await expect(preview).toContainText('Total batch')
  await expect(preview).toContainText('2,010')
  await expect(preview).toContainText('Per 1 pancake')
  await expect(preview).toContainText('167.5')
  await expect(dialog.getByRole('button',{name:'Add to Meal Library'})).toBeEnabled()
  await dialog.getByRole('button',{name:'Add to Meal Library'}).click()
  await expect(page.getByText(/Saturday Pancakes was added/)).toBeVisible()
  await expect(page.getByText('Saturday Pancakes',{exact:true})).toBeVisible()
})

test('Next-Day Alignment retains the active weekly sermon instead of asking for another upload',async({page})=>{
  await page.getByRole('button',{name:/Tomorrow’s Alignment/}).click()
  await expect(page.getByRole('heading',{name:'Active teaching'})).toBeVisible()
  await expect(page.getByText('Weekly Word',{exact:true}).first()).toBeVisible()
  await expect(page.getByRole('heading',{name:'Upload the Word that will govern the formation cycle'})).toHaveCount(0)
})

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
  await dialog.getByLabel('Match text').fill('Market')
  await dialog.getByLabel('Apply category').fill('Groceries')
  await expect(dialog).toContainText('1 posted sample found.')
  await expect(dialog).toContainText('Neighborhood Market')
  await expect(dialog.getByRole('option',{name:'Operating Account'})).toHaveCount(1)
  await expect(dialog.getByRole('button',{name:'Review new rule'})).toBeEnabled()
})

test('changing a posted transaction category offers a prefilled rule with past-match control',async({page},testInfo)=>{
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Transactions',exact:true}).click()
  await page.getByRole('button',{name:'Show bank activity'}).click()
  await page.getByText('Neighborhood Market',{exact:true}).click()
  const category=page.getByRole('combobox',{name:'Transaction category'})
  await category.fill('Groceries')
  await category.blur()
  await expect(page.getByText('Save this category change as a rule?')).toBeVisible()
  await page.getByRole('button',{name:'Yes, set up rule'}).click()
  const dialog=page.getByRole('dialog',{name:'Categorization rules'})
  await expect(dialog.getByLabel('Match text')).toHaveValue('Neighborhood Market')
  await expect(dialog.getByLabel('Apply category')).toHaveValue('Groceries')
  const pastMatches=dialog.getByRole('checkbox',{name:/Apply this rule to all past matching transactions/})
  await expect(pastMatches).not.toBeChecked()
  await pastMatches.check()
  await dialog.getByRole('button',{name:'Review new rule'}).click()
  await expect(page.getByRole('dialog',{name:'Review proposed Brevity changes'})).toBeVisible()
  await expect(page.getByRole('heading',{name:/Automatically categorize matching past and future Neighborhood Market transactions as Groceries/})).toBeVisible()
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
  await page.getByRole('button',{name:/Check existing connection|Sync now/i}).click()
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
  await page.getByRole('button',{name:/Check existing connection|Sync now/i}).click()
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
