import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDeterministicPillarFallback,
  enforcePillarAnalysisGuardrails,
  pillarAnalysisEvidence,
  pillarAnalysisFactPack,
  pillarAnalysisQualityIssues,
} from './pillarAnalysisGuardrails.js'
import { createEmptyDailyPlan } from './dailyPlan.js'

const validAnalysis=()=>({
  headline:'The posted AT&T charge needs comparison today',
  executiveSummary:'The posted AT&T transaction is $450, while its scheduled amount is $400; the mismatch should be understood before the household changes its plan.',
  todayFocus:'Compare the posted AT&T transaction with its $400 scheduled record and resolve the mismatch.',
  analysisPoints:[{title:'AT&T does not match its schedule',detail:'The posted AT&T amount of $450 differs from the $400 scheduled record, so the plan and actual cannot yet be treated as reconciled.'}],
  actionableInsights:[{title:'Verify the AT&T mismatch',whyItMatters:'The AT&T difference can change the near-term outlook more than several smaller planned items.',nextMove:'Open the AT&T posted transaction and compare it with the $400 scheduled record.'}],
  evidence:[{source:'Authoritative finance context',detail:'Actual transaction amount: $450; scheduled amount: $400.'}],
  reflectionPrompts:['Which difference would materially change the next financial choice?'],
  watchFor:['A pending amount being described as realized income.'],
  decisions:[],
  growthSignal:'Progress will show when realized, pending, and projected figures reconcile without ambiguous labels.',
  governingPrinciple:'Verify the source and status of a financial number before interpreting or changing it.',
})

const narrativeText=analysis=>[
  analysis?.headline,
  analysis?.executiveSummary,
  analysis?.todayFocus,
  ...(analysis?.analysisPoints || []).flatMap(item=>[item?.title,item?.detail]),
  ...(analysis?.actionableInsights || []).flatMap(item=>[item?.title,item?.whyItMatters,item?.nextMove]),
  ...(analysis?.reflectionPrompts || []),
  ...(analysis?.watchFor || []),
  ...(analysis?.decisions || []),
  analysis?.growthSignal,
  analysis?.governingPrinciple,
].filter(Boolean).join(' ')

test('valid insight-led analysis is preserved without rewriting',()=>{
  const analysis=validAnalysis()
  const result=enforcePillarAnalysisGuardrails({analysis,pillar:'finance',date:'2026-09-07',pillarData:{todayFocus:'Preserve liquidity'},localContext:{actualTransactions:[{name:'AT&T',amount:450,date:'2026-09-07',pending:false}],scheduledTransactions:[{name:'AT&T',amount:400,start:'2026-09-07'}]}})
  assert.equal(result.usedFallback,false)
  assert.equal(result.analysis,analysis)
  assert.deepEqual(result.issues,[])
})

test('pillar ownership announcements are rejected before caching',()=>{
  const analysis=validAnalysis()
  analysis.executiveSummary='Lorenzo owns this pillar and must lead the household through today’s priorities.'
  const result=enforcePillarAnalysisGuardrails({analysis,pillar:'household',date:'2026-09-07',pillarData:{weeklyFocus:'Reduce kitchen friction'}})
  assert.equal(result.usedFallback,true)
  assert.ok(result.issues.includes('pillar-ownership-language'))
  assert.doesNotMatch(JSON.stringify(result.analysis),/owns?\s+(?:this|the)\s+pillar/i)
  assert.match(result.analysis.headline,/kitchen friction/i)
})

test('empty and non-actionable output receives a complete deterministic fallback',()=>{
  const empty=enforcePillarAnalysisGuardrails({analysis:{},pillar:'health',date:'2026-09-07',pillarData:{todayFocus:'Steady hydration'}})
  assert.equal(empty.usedFallback,true)
  assert.ok(empty.issues.includes('empty-core-insight'))
  assert.ok(empty.issues.includes('empty-actionable-insights'))
  assert.equal(empty.analysis.actionableInsights.length,1)
  assert.equal(empty.analysis.evidence.length,1)
  assert.deepEqual(pillarAnalysisQualityIssues(empty.analysis,'health'),[])

  const generic=validAnalysis()
  generic.actionableInsights=[{title:'Do something useful',whyItMatters:'A response is needed to keep the day moving.',nextMove:'Take action.'}]
  const guarded=enforcePillarAnalysisGuardrails({analysis:generic,pillar:'finance',date:'2026-09-07'})
  assert.equal(guarded.usedFallback,true)
  assert.ok(guarded.issues.includes('generic-non-actionable-language'))
  assert.ok(guarded.issues.includes('non-actionable-next-move'))
})

test('repeated boilerplate and malformed lists cannot be cached as analysis',()=>{
  const analysis=validAnalysis()
  analysis.todayFocus=analysis.headline
  analysis.watchFor=[{text:'This is not a valid insight.'}]
  const guarded=enforcePillarAnalysisGuardrails({analysis,pillar:'finance',date:'2026-09-07'})
  assert.equal(guarded.usedFallback,true)
  assert.ok(guarded.issues.includes('repeated-boilerplate'))
  assert.ok(guarded.issues.includes('invalid-watchFor'))
  assert.deepEqual(pillarAnalysisQualityIssues(guarded.analysis,'finance'),[])
})

test('spiritual analysis cannot assign one member responsibility for another person’s formation',()=>{
  const analysis=validAnalysis()
  analysis.headline='Receive the Scripture personally today'
  analysis.executiveSummary='Lorenzo should ensure everyone completes their daily devotion and prayer before the schedule begins.'
  const result=enforcePillarAnalysisGuardrails({analysis,pillar:'spiritual',date:'2026-09-07',pillarData:{scriptureFocus:'Proverbs 4:23'}})
  assert.equal(result.usedFallback,true)
  assert.ok(result.issues.includes('spiritual-responsibility-leakage'))
  assert.match(JSON.stringify(result.analysis),/Proverbs 4:23/i)
  assert.doesNotMatch(JSON.stringify(result.analysis),/Lorenzo should ensure/i)

  const direct=validAnalysis()
  direct.executiveSummary='Larry is responsible for Nyla’s spiritual growth and daily prayer.'
  assert.ok(pillarAnalysisQualityIssues(direct,'spiritual').includes('spiritual-responsibility-leakage'))
})

test('fallback evidence excludes governance metadata and names its authoritative source',()=>{
  const evidence=pillarAnalysisEvidence({pillarData:{owner:'Lorenzo',todayFocus:'Guard the heart before reacting'},localContext:{updatedBy:'Larry',sermon:{title:'The receiving soil'}}})
  assert.equal(evidence.length,2)
  assert.equal(evidence[0].source,'Daily pillar plan')
  assert.equal(evidence[1].source,'Authoritative household context')
  assert.doesNotMatch(JSON.stringify(evidence),/owner|updated by|Lorenzo|Larry/i)

  const deduplicated=pillarAnalysisEvidence({pillarData:{todayFocus:'Guard the heart before reacting'},localContext:{sermon:{theme:'Guard the heart before reacting'}}})
  assert.equal(deduplicated.length,1)

  const fallback=buildDeterministicPillarFallback({pillar:'spiritual',date:'2026-09-07',pillarData:{todayFocus:'Lorenzo owns this pillar and must lead the household in prayer.',scriptureFocus:'Proverbs 4:23'}})
  assert.doesNotMatch(JSON.stringify(fallback),/owns this pillar|must lead the household/i)
  assert.match(JSON.stringify(fallback),/Proverbs 4:23/)
})

test('all seven pillars have deterministic, complete, non-list fallbacks',()=>{
  const pillars=['spiritual','health','fitness','household','education','finance','ministry']
  for(const pillar of pillars){
    const input={pillar,date:'2026-09-07',pillarData:{todayFocus:`${pillar} source focus`},localContext:{}}
    const first=buildDeterministicPillarFallback(input)
    const second=buildDeterministicPillarFallback(input)
    assert.deepEqual(first,second)
    assert.deepEqual(pillarAnalysisQualityIssues(first,pillar,input),[],pillar)
    assert.ok(first.analysisPoints.length<=3)
    assert.ok(first.actionableInsights.length<=2)
  }
})

test('deterministic fallbacks self-validate across representative source shapes',()=>{
  const date='2026-09-08'
  const cases=[
    ['spiritual focus','spiritual',{devotionFocus:'Guard the heart'}],
    ['spiritual Scripture','spiritual',{scripture:['Proverbs 4:23']}],
    ['spiritual obedience','spiritual',{obedienceAction:'Pause before answering'}],
    ['spiritual formation emphasis','spiritual',{formationEmphasis:'Receive before responding'}],
    ['spiritual weekly assignment','spiritual',{weeklyAssignment:'Memorize Proverbs 4:23'}],
    ['spiritual prayer','spiritual',{prayerFocus:['Wisdom for the meeting']}],
    ['spiritual active sermon','spiritual',{sermonNotes:{documentTitle:'Guard the Well'}}],
    ['health partial meal','health',{breakfast:'Oatmeal'}],
    ['health meals','health',{breakfast:'Oatmeal',lunch:'Chicken wraps',dinner:'Salmon'}],
    ['health hydration','health',{hydration:'96 ounces'}],
    ['health preparation','health',{nextDayPrep:'Thaw salmon'}],
    ['health snack','health',{snacks:'Almonds'}],
    ['health grocery','health',{groceries:['Spinach']}],
    ['health question','health',{discussionPrompt:'How is energy at noon?'}],
    ['health rolling plan','health',{breakfast:'Oats',lunch:'Wraps',dinner:'Salmon',mealDetails:[{title:'Salmon',prepMinutes:30},{title:'Oats',prepMinutes:10}]}],
    ['health schedule','health',{}, {scheduleItems:[{title:'Dietitian',date,startTime:'10:00'}]}],
    ['fitness empty default','fitness',createEmptyDailyPlan(date).fitness],
    ['fitness workout','fitness',{workout:'Lower strength'}],
    ['fitness objective','fitness',{objective:'Improve stability'}],
    ['fitness recovery','fitness',{recovery:'10 minute mobility'}],
    ['fitness question','fitness',{discussionPrompt:'Train or recover?'}],
    ['fitness schedule','fitness',{}, {scheduleItems:[{title:'Gym',date,startTime:'06:00'}]}],
    ['household focus','household',{weeklyFocus:'Reduce kitchen friction'}],
    ['household priority','household',{priorities:[{title:'Tile delivery',status:'blocked'}]}],
    ['household open item','household',{openItems:['Call plumber']}],
    ['household appointment','household',{appointments:[{title:'Inspection',date,startTime:'10:00'}]}],
    ['household errand','household',{errands:['Buy paint']}],
    ['household career priority','household',{careerPriorities:['Submit proposal']}],
    ['household high project','household',{}, {analysisSummary:{attentionProjects:[{title:'Roof estimate',priority:'high',due:date}]}}],
    ['household maintenance exception','household',{}, {analysisSummary:{maintenanceAttention:[{title:'Upstairs floors',status:'Overdue',date:'2026-09-07'}]}}],
    ['household maintenance today','household',{}, {analysisSummary:{maintenanceToday:[{title:'Kitchen reset',status:'Scheduled',date}]}}],
    ['household stock','household',{}, {analysisSummary:{lowStockItems:[{name:'Milk',quantity:1,parLevel:2}]}}],
    ['household expiration','household',{}, {analysisSummary:{expiringItems:[{name:'Yogurt',quantity:2,expiresOn:'2026-09-09'}]}}],
    ['household schedule','household',{}, {analysisSummary:{todaySchedule:[{title:'School pickup',date,startTime:'15:00'}]}}],
    ['education topic','education',{thinkTankTopic:'Fractions'}],
    ['education deliverable','education',{thinkTankDeliverable:'Explain 3/4 = 6/8'}],
    ['education observation','education',{isaiah:{notes:'Needs help carrying tens'}}],
    ['education practice','education',{isaiah:{readingMinutes:20}}],
    ['education question','education',{discussionPrompts:['Why are these equal?']}],
    ['education schedule','education',{}, {scheduleItems:[{title:'Think Tank',date,startTime:'09:00'}]}],
    ['finance source gap','finance',{}, {analysisSummary:{asOfDate:date,sourceCoverage:{transactionCache:'unavailable'}}}],
    ['finance stale source','finance',{}, {analysisSummary:{asOfDate:date,sourceCoverage:{transactionCache:'available',reconciliation:'unavailable',freshnessStatus:'stale'}}}],
    ['finance reconciliation','finance',{}, {analysisSummary:{asOfDate:date,sourceCoverage:{transactionCache:'available',reconciliation:'available'},reconciliation:{needsReviewCount:1,reviewAmounts:{knownGrossTotal:125,ambiguousGroupCount:0,complete:true},largestUnresolved:{label:'Groceries',amount:125,date}}}}],
    ['finance positive actual','finance',{}, {analysisSummary:{asOfDate:date,actualMonthToDate:{transactionCount:1,income:4200,expenses:500,otherInflows:0,net:3700}}}],
    ['finance negative actual','finance',{}, {analysisSummary:{asOfDate:date,actualMonthToDate:{transactionCount:1,income:500,expenses:900,otherInflows:0,net:-400}}}],
    ['finance positive schedule','finance',{}, {analysisSummary:{asOfDate:date,scheduledMonthBaseline:{scheduledLineCount:2,occurrenceCount:2,income:4200,expenses:3850,net:350}}}],
    ['finance negative schedule','finance',{}, {analysisSummary:{asOfDate:date,scheduledMonthBaseline:{scheduledLineCount:2,occurrenceCount:2,income:3000,expenses:3850,net:-850}}}],
    ['finance pending','finance',{}, {analysisSummary:{asOfDate:date,pending:{count:2,grossAmount:140,inflowAmount:100,expenseAmount:40}}}],
    ['finance largest posted','finance',{}, {analysisSummary:{asOfDate:date,largestPostedExpense:{name:'Property tax',amount:2500,date}}}],
    ['finance largest scheduled','finance',{}, {analysisSummary:{asOfDate:date,largestScheduledExpenseLine:{name:'Mortgage',monthlyAmount:3850,perOccurrenceAmount:3850,occurrenceCount:1,firstOccurrenceDate:date}}}],
    ['finance account','finance',{}, {accounts:[{name:'Operating',balance:12400}]}],
    ['finance raw actual','finance',{}, {actualTransactions:[{name:'Genesco Payroll',amount:-4200,date,pending:false}]}],
    ['finance raw schedule','finance',{}, {scheduledTransactions:[{name:'Primary Mortgage',amount:3850,start:date,type:'expense'}]}],
    ['finance pipeline','finance',{incomePipeline:[{title:'Contract',amount:9000,date,status:'projected'}]}],
    ['finance planned item','finance',{bills:[{title:'Water bill',amount:85,date,status:'scheduled'}]}],
    ['ministry focus','ministry',{contentFocus:'Guard the Well'}],
    ['ministry meeting','ministry',{meetings:[{title:'Leaders meeting',startTime:'18:00'}]}],
    ['ministry follow-up','ministry',{fellowshipFollowUps:[{title:'Call Smith family',status:'open'}]}],
    ['ministry prayer','ministry',{prayerNeeds:['Smith family']}],
    ['ministry readiness','ministry',{readinessChecklist:['Print handouts']}],
    ['ministry framework','ministry',{framework:'Serve with clarity'}],
    ['ministry schedule','ministry',{}, {calendarEvents:[{title:'Bible study',date,startTime:'19:00'}]}],
  ]

  for(const [name,pillar,pillarData,localContext={}] of cases){
    const args={pillar,date,pillarData,localContext}
    const fallback=buildDeterministicPillarFallback(args)
    assert.deepEqual(pillarAnalysisQualityIssues(fallback,pillar,args),[],name)
  }
})

test('the vague Finance card reported from production is forbidden',()=>{
  const productionCard=buildDeterministicPillarFallback({
    pillar:'finance',
    date:'2026-09-08',
    pillarData:{decisionRule:'Verify before deciding'},
    localContext:{accounts:[{id:'operating',name:'Operating Account',balance:12400}]},
  })
  const text=narrativeText(productionCard)

  assert.doesNotMatch(text,/Let verified financial signals guide the next prudent choice/i)
  assert.doesNotMatch(text,/Brevity found a usable Finance signal in authoritative household context/i)
  assert.doesNotMatch(text,/The interpretation stays within those records/i)
  assert.doesNotMatch(text,/Separate what is verified, projected, and still unresolved/i)
})

test('every fallback brings a specific source fact into the user-facing analysis, not only its evidence footer',()=>{
  const fixtures=[
    {pillar:'spiritual',pillarData:{scripture:['Proverbs 4:23'],devotionFocus:'Guard the well'},anchor:/Proverbs 4:23/i},
    {pillar:'health',pillarData:{dinner:'Herb-crusted salmon',hydration:'96 ounces of water'},anchor:/Herb-crusted salmon/i},
    {pillar:'fitness',pillarData:{workout:'Lower-body strength',stepGoal:12000,recovery:'10-minute mobility'},anchor:/Lower-body strength/i},
    {pillar:'household',pillarData:{priorities:[{title:'Kitchen floor tile delivery',status:'blocked'}]},anchor:/Kitchen floor tile delivery/i},
    {pillar:'education',pillarData:{thinkTankTopic:'Equivalent fractions',thinkTankDeliverable:'Explain why 3\/4 equals 6\/8'},anchor:/Equivalent fractions/i},
    {pillar:'finance',pillarData:{incomePipeline:[{title:'Robert Half contract',amount:9000,status:'projected'}]},anchor:/Robert Half contract/i},
    {pillar:'ministry',pillarData:{contentFocus:'Guard the Well',meetings:[]},anchor:/Guard the Well/i},
  ]

  for(const fixture of fixtures){
    const fallback=buildDeterministicPillarFallback({...fixture,date:'2026-09-08'})
    assert.match(narrativeText(fallback),fixture.anchor,`${fixture.pillar} fallback must interpret a named source fact in its visible narrative`)
  }
})

test('Health prioritizes the current rolling meal preparation constraint',()=>{
  const args={
    pillar:'health',
    date:'2026-09-08',
    pillarData:{
      breakfast:'Greek yogurt bowl',
      lunch:'Chicken salad wraps',
      dinner:'Herb-crusted salmon',
      mealDetails:[
        {mealType:'breakfast',name:'Greek yogurt bowl',prepMinutes:5},
        {mealType:'lunch',name:'Chicken salad wraps',prepMinutes:15},
        {mealType:'dinner',name:'Herb-crusted salmon',prepMinutes:35},
      ],
    },
  }
  const facts=pillarAnalysisFactPack(args)
  assert.equal(facts[0].id,'rolling-meal-prep')
  assert.match(facts[0].detail,/3 meals totaling 55 planned preparation minutes/i)
  assert.match(facts[0].headline,/Herb-crusted salmon.*35 minutes/i)

  const fallback=buildDeterministicPillarFallback(args)
  assert.match(narrativeText(fallback),/Herb-crusted salmon/i)
  assert.match(narrativeText(fallback),/35 minutes/i)
  assert.deepEqual(pillarAnalysisQualityIssues(fallback,'health',args),[])
})

test('Finance fallback summary names the records, values, and truth status being interpreted',()=>{
  const fallback=buildDeterministicPillarFallback({
    pillar:'finance',
    date:'2026-09-08',
    pillarData:{decisionRule:'Protect the operating floor'},
    localContext:{
      accounts:[{id:'operating',name:'Operating Account',balance:12400}],
      actualTransactions:[{id:'payroll',date:'2026-09-08',name:'Genesco Payroll',amount:-4200,category:'INCOME',pending:false,accountId:'operating'}],
      scheduledTransactions:[{id:'mortgage',name:'Primary Mortgage',amount:3850,type:'expense',date:'2026-09-08',freq:'once',accountId:'operating'}],
    },
  })

  assert.match(fallback.executiveSummary,/Genesco Payroll/i)
  assert.match(fallback.executiveSummary,/\$4,?200/)
  assert.match(fallback.executiveSummary,/Primary Mortgage/i)
  assert.match(fallback.executiveSummary,/\$3,?850/)
  assert.match(fallback.executiveSummary,/posted|actual|realized/i)
  assert.match(fallback.executiveSummary,/scheduled|projected/i)
})

test('empty sources produce an honest data-needed state with a concrete capture or refresh action',()=>{
  const expectations={
    spiritual:{missing:/scripture|sermon/i,action:/add|activate|select|upload/i},
    health:{missing:/meal|hydration|energy/i,action:/add|record|set/i},
    fitness:{missing:/workout|readiness|recovery/i,action:/add|record|set/i},
    household:{missing:/priority|project|appointment|open (?:household )?item/i,action:/add|record|refresh|set/i},
    education:{missing:/topic|deliverable|progress note/i,action:/add|record|set/i},
    finance:{missing:/posted transaction|account balance|scheduled (?:cash|transaction)/i,action:/refresh|add|record/i},
    ministry:{missing:/meeting|message|follow-up|prayer need/i,action:/add|record|set/i},
  }

  for(const [pillar,expected] of Object.entries(expectations)){
    const fallback=buildDeterministicPillarFallback({pillar,date:'2026-09-08',pillarData:{},localContext:{}})
    const text=narrativeText(fallback)
    assert.match(fallback.headline,/missing|data (?:needed|required)|more .* data|not enough .* data|no reliable .* data/i,`${pillar} must identify the result as a data-needed state`)
    assert.match(text,expected.missing,`${pillar} must name the missing source data`)
    assert.match(fallback.actionableInsights?.[0]?.nextMove || '',expected.action,`${pillar} must say how to capture or refresh the missing data`)
  }
})

test('meta-process prose and an ungrounded hero are rejected even when the schema is complete',()=>{
  const meta=validAnalysis()
  meta.executiveSummary='Brevity found a usable Finance signal in authoritative household context. The interpretation stays within those records.'
  assert.equal(enforcePillarAnalysisGuardrails({
    analysis:meta,
    pillar:'finance',
    date:'2026-09-08',
    localContext:{actualTransactions:[{id:'payroll',name:'Genesco Payroll',amount:-4200,category:'INCOME'}]},
  }).usedFallback,true)

  const ungrounded=validAnalysis()
  ungrounded.headline='A meaningful financial difference deserves attention today'
  ungrounded.executiveSummary='The current position contains an important variance that could change the outlook.'
  ungrounded.todayFocus='Resolve the material difference before changing the plan.'
  ungrounded.analysisPoints=[{title:'The variance matters',detail:'The difference is large enough to affect the next choice if it remains unresolved.'}]
  ungrounded.actionableInsights=[{title:'Review the difference',whyItMatters:'Resolving it will improve confidence in the outlook.',nextMove:'Compare the relevant record with the expected amount before deciding.'}]
  ungrounded.evidence=[{source:'Posted transaction',detail:'Genesco Payroll: $4,200 received on September 8.'}]

  assert.equal(enforcePillarAnalysisGuardrails({
    analysis:ungrounded,
    pillar:'finance',
    date:'2026-09-08',
    localContext:{actualTransactions:[{id:'payroll',date:'2026-09-08',name:'Genesco Payroll',amount:-4200,category:'INCOME'}]},
  }).usedFallback,true)
})

test('the hero, every analysis point, and every next move must identify a source fact',()=>{
  const context={actualTransactions:[{name:'AT&T',amount:450,date:'2026-09-08'}],scheduledTransactions:[{name:'AT&T',amount:400,start:'2026-09-08'}]}
  const buried=validAnalysis()
  buried.headline='A financial difference deserves attention today'
  buried.executiveSummary='The current position may affect the household outlook if it remains unresolved.'
  buried.todayFocus='Clarify the important difference before changing the plan.'
  assert.ok(pillarAnalysisQualityIssues(buried,'finance',{date:'2026-09-08',localContext:context}).includes('ungrounded-core-insight'))

  const vaguePoint=validAnalysis()
  vaguePoint.analysisPoints=[{title:'The difference matters',detail:'This condition could affect the outlook and deserves careful attention today.'}]
  assert.ok(pillarAnalysisQualityIssues(vaguePoint,'finance',{date:'2026-09-08',localContext:context}).includes('ungrounded-analysis-point'))

  const vagueAction=validAnalysis()
  vagueAction.actionableInsights=[{title:'Review the difference',whyItMatters:'More clarity can improve the next choice.',nextMove:'Review the data before making a decision about what matters.'}]
  const issues=pillarAnalysisQualityIssues(vagueAction,'finance',{date:'2026-09-08',localContext:context})
  assert.ok(issues.includes('ungrounded-actionable-insight'))
  assert.ok(issues.includes('generic-non-actionable-language'))
})

test('a date or generic status alone cannot masquerade as a grounded fact',()=>{
  const date='2026-09-08'
  const analysis=validAnalysis()
  analysis.headline=`Review the position for ${date}`
  analysis.executiveSummary=`The records dated ${date} deserve careful attention before the plan changes.`
  analysis.todayFocus=`Clarify the ${date} position before making another choice.`

  const issues=pillarAnalysisQualityIssues(analysis,'finance',{
    date,
    localContext:{actualTransactions:[{name:'AT&T',amount:450,date,status:'posted'}]},
  })
  assert.ok(issues.includes('ungrounded-core-insight'))
})

test('Finance rejects invented amounts and a scheduled item described as posted',()=>{
  const context={actualTransactions:[{name:'Genesco Payroll',amount:-4200,date:'2026-09-08'}]}
  const invented=validAnalysis()
  invented.headline='Genesco Payroll posted at $999,999'
  invented.executiveSummary='Genesco Payroll is the named posted record requiring attention today.'
  invented.todayFocus='Open Genesco Payroll and resolve the $999,999 amount.'
  invented.analysisPoints=[{title:'Genesco Payroll amount',detail:'The $999,999 Genesco Payroll amount would dominate today’s cash position.'}]
  invented.actionableInsights=[{title:'Inspect Genesco Payroll',whyItMatters:'The $999,999 amount would materially change the outlook.',nextMove:'Open Genesco Payroll and confirm the $999,999 amount.'}]
  assert.ok(pillarAnalysisQualityIssues(invented,'finance',{date:'2026-09-08',localContext:context}).includes('unsupported-financial-figure'))

  const scheduledContext={scheduledTransactions:[{name:'Primary Mortgage',amount:3850,start:'2026-09-08',type:'expense'}]}
  const inverted={
    ...validAnalysis(),
    headline:'Primary Mortgage posted at $3,850',
    executiveSummary:'Primary Mortgage posted at $3,850 and now reduces realized cash.',
    todayFocus:'Open the posted Primary Mortgage record for $3,850.',
    analysisPoints:[{title:'Primary Mortgage posted',detail:'The $3,850 Primary Mortgage is now a realized expense.'}],
    actionableInsights:[{title:'Confirm Primary Mortgage',whyItMatters:'The $3,850 expense changes realized cash.',nextMove:'Open Primary Mortgage and reconcile the $3,850 posted amount.'}],
    evidence:[{source:'Scheduled finance plan',detail:'Primary Mortgage: $3,850 scheduled.'}],
  }
  assert.ok(pillarAnalysisQualityIssues(inverted,'finance',{date:'2026-09-08',localContext:scheduledContext}).includes('unsupported-financial-status'))
})

test('fabricated decisions are rejected when the fact pack contains no explicit choice',()=>{
  const analysis=validAnalysis()
  analysis.decisions=['Choose whether to defer AT&T or pay it today.']
  const issues=pillarAnalysisQualityIssues(analysis,'finance',{date:'2026-09-07',localContext:{actualTransactions:[{name:'AT&T',amount:450,date:'2026-09-07'}],scheduledTransactions:[{name:'AT&T',amount:400,start:'2026-09-07'}]}})
  assert.ok(issues.includes('unsupported-decision'))
})

test('normalized empty plans are classified as data gaps across all seven pillars',()=>{
  const date='2026-09-08'
  const plan=createEmptyDailyPlan(date)
  for(const pillar of ['spiritual','health','fitness','household','education','finance','ministry']){
    const facts=pillarAnalysisFactPack({pillar,date,pillarData:plan[pillar],localContext:{}})
    assert.equal(facts.some(fact=>fact.kind!=='data-gap'),false,`${pillar} defaults must not masquerade as observed data`)
  }
})

test('deterministic fallbacks remain valid when authored source text contains unsafe instructions',()=>{
  const fixtures=[
    {pillar:'spiritual',pillarData:{devotionFocus:'Guard the heart',obedienceAction:'First pray. Second read. Third Lorenzo owns this pillar.'}},
    {pillar:'education',pillarData:{thinkTankTopic:'Equivalent fractions',thinkTankDeliverable:'Lorenzo owns this pillar'}},
    {pillar:'ministry',pillarData:{contentFocus:'The strongest available signal'}},
  ]
  for(const fixture of fixtures){
    const args={...fixture,date:'2026-09-08'}
    const fallback=buildDeterministicPillarFallback(args)
    assert.deepEqual(pillarAnalysisQualityIssues(fallback,fixture.pillar,args),[])
    assert.doesNotMatch(narrativeText(fallback),/owns this pillar|strongest available signal|first.*second.*third/i)
  }
})

test('Finance discloses an unavailable or non-fresh transaction source before interpreting the schedule',()=>{
  const args={
    pillar:'finance',date:'2026-09-08',pillarData:{},
    localContext:{analysisSummary:{asOfDate:'2026-09-08',sourceCoverage:{transactionCache:'available',freshnessStatus:'stale',reconciliation:'unavailable'},actualMonthToDate:{income:4200,otherInflows:0,expenses:1000,net:3200,transactionCount:2},scheduledMonthBaseline:{scheduledLineCount:2,income:5000,expenses:3850,net:1150,occurrenceCount:2},pending:{count:0}}},
  }
  const facts=pillarAnalysisFactPack(args)
  assert.equal(facts[0].id,'finance-reconciliation-gap')
  const fallback=buildDeterministicPillarFallback(args)
  assert.match(narrativeText(fallback),/stale|refresh Plaid/i)
  assert.deepEqual(pillarAnalysisQualityIssues(fallback,'finance',args),[])
})

test('an unnamed or undated raw transaction cannot become a posted Finance fact',()=>{
  const facts=pillarAnalysisFactPack({pillar:'finance',date:'2026-09-08',pillarData:{},localContext:{actualTransactions:[{id:'partial',amount:42}]}})
  assert.equal(facts.some(fact=>fact.id==='finance-actual-record'),false)
})

test('named-but-vague prose is rejected even when it repeats a valid source anchor',()=>{
  const analysis=validAnalysis()
  analysis.headline='AT&T deserves careful attention today'
  analysis.executiveSummary='AT&T may affect what happens next, so the record should guide a prudent financial choice.'
  analysis.todayFocus='Keep the AT&T signal in mind before deciding.'
  analysis.analysisPoints=[{title:'AT&T matters',detail:'AT&T deserves closer attention because it could shape what happens next.'}]
  analysis.actionableInsights=[{title:'Consider AT&T',whyItMatters:'AT&T may influence the next choice.',nextMove:'Open AT&T and keep this signal in mind before deciding.'}]
  const issues=pillarAnalysisQualityIssues(analysis,'finance',{date:'2026-09-08',localContext:{actualTransactions:[{name:'AT&T',amount:450,date:'2026-09-08'}]}})
  assert.ok(issues.includes('vague-insight-language'))
})

test('planned, pending, unresolved, and unavailable facts cannot be rewritten as completed truth',()=>{
  const cases=[
    {
      expected:'unsupported-financial-status',
      args:{pillar:'finance',date:'2026-09-08',localContext:{analysisSummary:{sourceCoverage:{transactionCache:'available',freshnessStatus:'fresh',reconciliation:'available'},pending:{count:1,grossAmount:140,inflowAmount:100,expenseAmount:40}}}},
      sentence:'The transactions marked pending in the bank snapshot have posted and cleared at $140.',
    },
    {
      expected:'unsupported-financial-status',
      args:{pillar:'finance',date:'2026-09-08',localContext:{scheduledTransactions:[{name:'Primary Mortgage',amount:3850,start:'2026-09-08',type:'expense'}]}},
      sentence:'After reviewing the schedule, the scheduled Primary Mortgage at $3,850 has posted and cleared.',
    },
    {
      expected:'unsupported-financial-status',
      args:{pillar:'finance',date:'2026-09-08',localContext:{analysisSummary:{sourceCoverage:{transactionCache:'available',reconciliation:'available'},scheduledMonthBaseline:{scheduledLineCount:2,occurrenceCount:2,income:4200,expenses:3850,net:350}}}},
      sentence:'The Scheduled full-month baseline of $350 is realized income.',
    },
    {
      expected:'unsupported-financial-status',
      args:{pillar:'finance',date:'2026-09-08',localContext:{analysisSummary:{sourceCoverage:{transactionCache:'available',reconciliation:'available'},reconciliation:{needsReviewCount:1,reviewAmounts:{knownGrossTotal:125,ambiguousGroupCount:0,complete:true},largestUnresolved:{label:'Groceries',amount:125,date:'2026-09-08'}}}}},
      sentence:'The Groceries review item at $125 is fully reconciled and resolved.',
    },
    {
      expected:'unsupported-financial-status',
      args:{pillar:'finance',date:'2026-09-08',localContext:{analysisSummary:{asOfDate:'2026-09-08',sourceCoverage:{transactionCache:'unavailable',reconciliation:'unavailable'}}}},
      sentence:'The bank-transaction snapshot is current, refreshed, and complete for 2026-09-08.',
    },
    {
      expected:'unsupported-completion-status',
      args:{pillar:'health',date:'2026-09-08',pillarData:{breakfast:'Oatmeal',lunch:'Chicken wraps',dinner:'Herb salmon'}},
      sentence:'Herb salmon was eaten and proved that energy improved.',
    },
  ]

  for(const {args,sentence,expected} of cases){
    const analysis=buildDeterministicPillarFallback(args)
    analysis.executiveSummary=sentence
    assert.ok(pillarAnalysisQualityIssues(analysis,args.pillar,args).includes(expected),sentence)
  }
})

test('Finance number validation handles words, bare amounts, and binds values to the named record',()=>{
  const context={actualTransactions:[{name:'AT&T',amount:450,date:'2026-09-08'}],scheduledTransactions:[{name:'AT&T',amount:400,start:'2026-09-08'}]}
  const dollars=validAnalysis()
  dollars.executiveSummary='The AT&T record is 999,999 dollars, which would materially change the current position.'
  assert.ok(pillarAnalysisQualityIssues(dollars,'finance',{date:'2026-09-08',localContext:context}).includes('unsupported-financial-figure'))

  const bare=validAnalysis()
  bare.executiveSummary='The AT&T record is 999999, which would materially change the current position.'
  assert.ok(pillarAnalysisQualityIssues(bare,'finance',{date:'2026-09-08',localContext:context}).includes('unsupported-financial-figure'))

  const baselineArgs={pillar:'finance',date:'2026-09-08',localContext:{analysisSummary:{sourceCoverage:{transactionCache:'available',reconciliation:'available'},scheduledMonthBaseline:{scheduledLineCount:1,occurrenceCount:1,income:0,expenses:100,net:-100}}}}
  const baseline=buildDeterministicPillarFallback(baselineArgs)
  assert.deepEqual(pillarAnalysisQualityIssues(baseline,'finance',baselineArgs),[],'$100 baseline must not be parsed as a billion suffix')

  const boundArgs={pillar:'finance',date:'2026-09-08',localContext:{analysisSummary:{sourceCoverage:{transactionCache:'available',freshnessStatus:'fresh',coverageThrough:'2026-09-08',reconciliation:'available'},actualMonthToDate:{income:4200,otherInflows:0,expenses:450,net:3750,transactionCount:2},largestPostedExpense:{name:'AT&T',amount:450,date:'2026-09-08'}}}}
  const misbound=buildDeterministicPillarFallback(boundArgs)
  misbound.analysisPoints=[{title:'AT&T drove the result',detail:'AT&T at $3,750 is the largest posted expense in the captured month-to-date result.'}]
  assert.ok(pillarAnalysisQualityIssues(misbound,'finance',boundArgs).includes('misbound-financial-figure'))
})

test('malformed model collections fall back safely instead of crashing analysis',()=>{
  const malformed={...validAnalysis(),analysisPoints:{detail:'wrong shape'},actionableInsights:'wrong shape',evidence:null,reflectionPrompts:{},watchFor:42,decisions:'none'}
  const args={analysis:malformed,pillar:'finance',date:'2026-09-08',localContext:{actualTransactions:[{name:'AT&T',amount:450,date:'2026-09-08'}]}}
  assert.doesNotThrow(()=>enforcePillarAnalysisGuardrails(args))
  const result=enforcePillarAnalysisGuardrails(args)
  assert.equal(result.usedFallback,true)
  assert.deepEqual(pillarAnalysisQualityIssues(result.analysis,'finance',args),[])
})

test('intentional recovery is analysis input, not a missing-workout error',()=>{
  const args={pillar:'fitness',date:'2026-09-08',pillarData:{recovery:'10 minute mobility'}}
  const facts=pillarAnalysisFactPack(args)
  assert.equal(facts[0].id,'plan-recovery')
  assert.equal(facts.some(fact=>fact.id==='plan-workout-gap'),false)
  assert.doesNotMatch(narrativeText(buildDeterministicPillarFallback(args)),/no workout (?:or intentional recovery )?is recorded/i)
})

test('stale or canceled schedule records and closed maintenance never become upcoming commitments',()=>{
  const stale={
    pillar:'spiritual',date:'2026-09-08',pillarData:{},
    localContext:{calendarEvents:[{source:'icloud',title:'Old prayer call',date:'2026-09-08'}],appleCalendarCoverage:{state:'stale',stale:true,usable:true,lastSuccessfulSyncAt:'2026-09-07T08:00:00Z',message:'Refresh before relying on today’s schedule.'}},
  }
  const staleFacts=pillarAnalysisFactPack(stale)
  assert.equal(staleFacts.some(fact=>fact.id==='context-spiritual-commitment'),false)
  assert.equal(staleFacts.some(fact=>fact.id==='calendar-coverage-gap'),true)

  const canceled=pillarAnalysisFactPack({pillar:'ministry',date:'2026-09-08',localContext:{calendarEvents:[{title:'Canceled visit',date:'2026-09-08',status:'canceled'}]}})
  assert.equal(canceled.some(fact=>fact.id==='context-ministry-commitment'),false)

  const closed=pillarAnalysisFactPack({pillar:'household',date:'2026-09-08',localContext:{analysisSummary:{maintenanceToday:[{title:'Kitchen reset',date:'2026-09-08',status:'Approved'}]}}})
  assert.equal(closed.some(fact=>fact.id==='context-maintenance-today'),false)
})

test('Spiritual and Finance receive their own current schedule commitments',()=>{
  const spiritual=pillarAnalysisFactPack({pillar:'spiritual',date:'2026-09-08',localContext:{scheduleItems:[{title:'Family devotion',date:'2026-09-08',startTime:'06:30'}]}})
  const finance=pillarAnalysisFactPack({pillar:'finance',date:'2026-09-08',localContext:{scheduleItems:[{title:'Budget review',date:'2026-09-08',startTime:'17:00'}]}})
  assert.equal(spiritual.some(fact=>fact.id==='context-spiritual-commitment'),true)
  assert.equal(finance.some(fact=>fact.id==='context-finance-commitment'),true)
})

test('one grounded hero field is sufficient and equivalent currency formatting still anchors it',()=>{
  const args={
    pillar:'finance',date:'2026-09-08',
    localContext:{analysisSummary:{sourceCoverage:{transactionCache:'available',freshnessStatus:'fresh',coverageThrough:'2026-09-08',reconciliation:'available'},actualMonthToDate:{transactionCount:2,income:4200,otherInflows:0,expenses:450,net:3750}}},
  }
  const analysis=JSON.parse(JSON.stringify(buildDeterministicPillarFallback(args)).replaceAll('$3,750.00','$3,750'))
  analysis.executiveSummary='The household should keep today’s next choice narrow until the named record is reviewed.'
  analysis.todayFocus='Use the available time to resolve the most important open question before day’s end.'
  const issues=pillarAnalysisQualityIssues(analysis,'finance',args)
  assert.equal(issues.includes('ungrounded-core-insight'),false)
  assert.equal(issues.includes('ungrounded-analysis-point'),false)
})

test('Finance rejects invented counts, percentages, and calendar dates below the amount threshold',()=>{
  const args={
    pillar:'finance',date:'2026-09-08',
    localContext:{analysisSummary:{sourceCoverage:{transactionCache:'available',freshnessStatus:'fresh',coverageThrough:'2026-09-08',reconciliation:'available'},actualMonthToDate:{transactionCount:2,income:4200,otherInflows:0,expenses:450,net:3750}}},
  }
  const analysis=buildDeterministicPillarFallback(args)
  analysis.executiveSummary+=' It contains 99 posted transactions, carries a 75% margin, and will close on October 31.'
  assert.ok(pillarAnalysisQualityIssues(analysis,'finance',args).includes('ungrounded-claim-clause'))
})

test('Finance status checks allow source comparisons but scope cautions to their own clause',()=>{
  const args={pillar:'finance',date:'2026-09-08',localContext:{scheduledTransactions:[{name:'Primary Mortgage',amount:3850,start:'2026-09-08',type:'expense'}]}}

  const comparison=buildDeterministicPillarFallback(args)
  comparison.executiveSummary='Compare scheduled Primary Mortgage at $3,850.00 against posted bank activity.'
  assert.equal(pillarAnalysisQualityIssues(comparison,'finance',args).includes('unsupported-financial-status'),false)

  const contradicted=buildDeterministicPillarFallback(args)
  contradicted.executiveSummary='Primary Mortgage has posted and cleared at $3,850, but it should not be treated as realized until verified.'
  assert.ok(pillarAnalysisQualityIssues(contradicted,'finance',args).includes('unsupported-financial-status'))

  const assertiveComparison=buildDeterministicPillarFallback(args)
  assertiveComparison.executiveSummary='Compare Primary Mortgage, which has posted, against posted bank activity.'
  assert.ok(pillarAnalysisQualityIssues(assertiveComparison,'finance',args).includes('unsupported-financial-status'))

  const question=buildDeterministicPillarFallback(args)
  question.reflectionPrompts=['Has Primary Mortgage posted?','Is Primary Mortgage paid?']
  assert.equal(pillarAnalysisQualityIssues(question,'finance',args).includes('unsupported-financial-status'),false)

  const declaration=buildDeterministicPillarFallback(args)
  declaration.reflectionPrompts=['Primary Mortgage has posted.']
  assert.ok(pillarAnalysisQualityIssues(declaration,'finance',args).includes('unsupported-financial-status'))
})

test('combined actual and scheduled Finance fallbacks validate with distinct or identical totals',()=>{
  for(const scheduledNet of [350,3750]){
    const args={
      pillar:'finance',date:'2026-09-08',
      localContext:{analysisSummary:{
        sourceCoverage:{transactionCache:'available',freshnessStatus:'fresh',coverageThrough:'2026-09-08',reconciliation:'available'},
        actualMonthToDate:{transactionCount:2,income:4200,otherInflows:0,expenses:450,net:3750},
        scheduledMonthBaseline:{scheduledLineCount:2,occurrenceCount:2,income:4200,expenses:4200-scheduledNet,net:scheduledNet},
      }},
    }
    const fallback=buildDeterministicPillarFallback(args)
    assert.deepEqual(pillarAnalysisQualityIssues(fallback,'finance',args),[],`scheduled net ${scheduledNet}`)
  }
})

test('incomplete Finance summaries name their missing fields without fabricating zero values',()=>{
  const cases=[
    ['finance-actual-summary-gap',{actualMonthToDate:{transactionCount:2}}],
    ['finance-scheduled-summary-gap',{scheduledMonthBaseline:{occurrenceCount:2}}],
    ['finance-pending-summary-gap',{pending:{count:2}}],
    ['finance-reconciliation-summary-gap',{reconciliation:{needsReviewCount:2,reviewAmounts:{}}}],
  ]
  for(const [expectedId,partial] of cases){
    const args={pillar:'finance',date:'2026-09-08',localContext:{analysisSummary:{sourceCoverage:{transactionCache:'available',reconciliation:'available'},...partial}}}
    const facts=pillarAnalysisFactPack(args)
    assert.equal(facts[0].id,expectedId)
    assert.equal(facts[0].kind,'data-gap')
    const fallback=buildDeterministicPillarFallback(args)
    assert.doesNotMatch(narrativeText(fallback),/\$0\.00/)
    assert.match(narrativeText(fallback),/missing/i)
    assert.deepEqual(pillarAnalysisQualityIssues(fallback,'finance',args),[])
  }
})

test('grounding is checked per clause while source-backed details and interpretation remain allowed',()=>{
  const baseArgs={pillar:'health',date:'2026-09-08',pillarData:{breakfast:'Oatmeal',lunch:'Chicken wraps',dinner:'Herb salmon'}}
  const fabricated=buildDeterministicPillarFallback(baseArgs)
  fabricated.executiveSummary='Breakfast is Oatmeal, and Larry’s nutritionist appointment is at 7:00 AM.'
  assert.ok(pillarAnalysisQualityIssues(fabricated,'health',baseArgs).includes('ungrounded-claim-clause'))

  const sourcedArgs={...baseArgs,localContext:{scheduleItems:[{title:'Larry nutritionist appointment',date:'2026-09-08',startTime:'07:00'}]}}
  const sourced=buildDeterministicPillarFallback(sourcedArgs)
  sourced.executiveSummary='Breakfast is Oatmeal, and Larry’s nutritionist appointment is at 7:00 AM.'
  assert.equal(pillarAnalysisQualityIssues(sourced,'health',sourcedArgs).includes('ungrounded-claim-clause'),false)

  const interpretation=buildDeterministicPillarFallback(baseArgs)
  interpretation.executiveSummary='Oatmeal is planned, and that reduces morning choice load.'
  assert.equal(pillarAnalysisQualityIssues(interpretation,'health',baseArgs).includes('ungrounded-claim-clause'),false)

  for(const claim of ['the dentist appointment is confirmed','A dentist appointment is confirmed','Dentist appointment is confirmed']){
    const unnamedRecord=buildDeterministicPillarFallback(baseArgs)
    unnamedRecord.executiveSummary=`Oatmeal is planned, and ${claim}.`
    assert.ok(pillarAnalysisQualityIssues(unnamedRecord,'health',baseArgs).includes('ungrounded-claim-clause'),claim)
  }

  const namedRecordArgs={...baseArgs,localContext:{scheduleItems:[{title:'Dentist appointment',date:'2026-09-08'}]}}
  const namedRecord=buildDeterministicPillarFallback(namedRecordArgs)
  namedRecord.executiveSummary='Oatmeal is planned, and the Dentist appointment is confirmed.'
  assert.equal(pillarAnalysisQualityIssues(namedRecord,'health',namedRecordArgs).includes('ungrounded-claim-clause'),false)
})

test('a Spiritual schedule without formation content leads with the missing source action',()=>{
  const args={pillar:'spiritual',date:'2026-09-08',pillarData:{},localContext:{scheduleItems:[{title:'Family devotion',date:'2026-09-08',startTime:'06:30'}]}}
  const facts=pillarAnalysisFactPack(args)
  assert.equal(facts[0].id,'plan-spiritual-source-gap')
  const fallback=buildDeterministicPillarFallback(args)
  assert.match(fallback.actionableInsights[0].nextMove,/add today’s Scripture|add.*devotion focus/i)
  assert.doesNotMatch(fallback.actionableInsights[0].nextMove,/open the recorded Scripture/i)
  assert.deepEqual(pillarAnalysisQualityIssues(fallback,'spiritual',args),[])
})

test('raw Finance rows require identity, date, amount, and explicit posting status',()=>{
  const missingStatus={pillar:'finance',date:'2026-09-08',localContext:{actualTransactions:[{name:'Payroll',date:'2026-09-08',amount:4200}]}}
  const missingFacts=pillarAnalysisFactPack(missingStatus)
  assert.equal(missingFacts[0].id,'finance-actual-record-gap')
  assert.equal(missingFacts.some(fact=>fact.kind==='actual'),false)
  assert.deepEqual(pillarAnalysisQualityIssues(buildDeterministicPillarFallback(missingStatus),'finance',missingStatus),[])

  for(const [pending,kind] of [[false,'actual'],[true,'pending']]){
    const args={pillar:'finance',date:'2026-09-08',localContext:{actualTransactions:[{name:'Payroll',date:'2026-09-08',amount:4200,pending}]}}
    const facts=pillarAnalysisFactPack(args)
    assert.equal(facts[0].kind,kind)
    assert.deepEqual(pillarAnalysisQualityIssues(buildDeterministicPillarFallback(args),'finance',args),[])
  }

  const unnamed={pillar:'finance',date:'2026-09-08',localContext:{scheduledTransactions:[{start:'2026-09-08',amount:3850,type:'expense'}]}}
  const unnamedFallback=buildDeterministicPillarFallback(unnamed)
  assert.equal(pillarAnalysisFactPack(unnamed)[0].id,'finance-scheduled-record-gap')
  assert.doesNotMatch(narrativeText(unnamedFallback),/Open [“"]{2}/)
  assert.deepEqual(pillarAnalysisQualityIssues(unnamedFallback,'finance',unnamed),[])
})

test('calendar years are not bare Finance amounts while explicit 2026-dollar claims remain amounts',()=>{
  const args={pillar:'finance',date:'2026-09-08',localContext:{actualTransactions:[{name:'AT&T',amount:450,date:'2026-09-08',pending:false}]}}
  for(const renderedDate of ['September 8, 2026','9/8/2026','2026-09-08']){
    const analysis=buildDeterministicPillarFallback(args)
    analysis.executiveSummary=`AT&T is a posted $450 record dated ${renderedDate}; confirm its category before changing the plan.`
    assert.equal(pillarAnalysisQualityIssues(analysis,'finance',args).includes('unsupported-financial-figure'),false,renderedDate)
    assert.equal(pillarAnalysisQualityIssues(analysis,'finance',args).includes('ungrounded-claim-clause'),false,renderedDate)
  }
  for(const invented of ['$2,026','2026 dollars']){
    const analysis=buildDeterministicPillarFallback(args)
    analysis.executiveSummary=`AT&T is a posted record for ${invented}; confirm the amount before changing the plan.`
    assert.ok(pillarAnalysisQualityIssues(analysis,'finance',args).includes('unsupported-financial-figure'),invented)
  }
})

test('historical Finance totals stop at the requested cutoff rather than later bank coverage',()=>{
  const args={
    pillar:'finance',date:'2026-09-01',
    localContext:{analysisSummary:{
      asOfDate:'2026-09-01',
      sourceCoverage:{transactionCache:'available',freshnessStatus:'fresh',coverageThrough:'2026-09-08',reconciliation:'available'},
      actualMonthToDate:{transactionCount:2,income:4200,otherInflows:0,expenses:450,net:3750},
    }},
  }
  const actual=pillarAnalysisFactPack(args).find(fact=>fact.id==='finance-actual-month')
  assert.match(actual.detail,/dated through 2026-09-01/)
  assert.doesNotMatch(actual.detail,/dated through 2026-09-08/)
  assert.deepEqual(pillarAnalysisQualityIssues(buildDeterministicPillarFallback(args),'finance',args),[])
})

test('Health rejects unsupported diagnoses, treatments, and clinician endorsements',()=>{
  const args={pillar:'health',date:'2026-09-08',pillarData:{breakfast:'Oatmeal',lunch:'Chicken wraps',dinner:'Herb salmon'}}
  for(const claim of [
    'A nutritionist has approved Oatmeal for diabetes.',
    'Dr. Smith approved Oatmeal for diabetes.',
    'Oatmeal will cure diabetes.',
    'Oatmeal is recommended by the family physician.',
  ]){
    const analysis=buildDeterministicPillarFallback(args)
    analysis.executiveSummary=claim
    assert.ok(pillarAnalysisQualityIssues(analysis,'health',args).includes('unsupported-medical-claim'),claim)
  }

  const sourcedArgs={...args,pillarData:{...args.pillarData,discussionPrompt:'A nutritionist has approved Oatmeal for diabetes.'}}
  const sourced=buildDeterministicPillarFallback(sourcedArgs)
  sourced.executiveSummary='A nutritionist has approved Oatmeal for diabetes.'
  assert.equal(pillarAnalysisQualityIssues(sourced,'health',sourcedArgs).includes('unsupported-medical-claim'),false)
})

test('Fitness rejects unsupported clinical exercise claims',()=>{
  const args={pillar:'fitness',date:'2026-09-08',pillarData:{workout:'Squats'}}
  for(const claim of ['Dr. Smith approved Squats for diabetes.','Squats will cure back pain.']){
    const analysis=buildDeterministicPillarFallback(args)
    analysis.executiveSummary=claim
    assert.ok(pillarAnalysisQualityIssues(analysis,'fitness',args).includes('unsupported-medical-claim'),claim)
  }
})

test('deterministic focus copy follows actual, recorded, and projected fact semantics',()=>{
  const cases=[
    {
      label:'posted transaction',kind:'actual',
      args:{pillar:'finance',date:'2026-09-08',localContext:{actualTransactions:[{name:'Payroll',date:'2026-09-08',amount:4200,pending:false}]}},
      expected:/observed result.*Open “Payroll”/i,
    },
    {
      label:'learning observation',kind:'actual',
      args:{pillar:'education',date:'2026-09-08',pillarData:{isaiah:{notes:'Fractions need another visual example'}}},
      expected:/observed result.*Fractions need another visual example/i,
    },
    {
      label:'account snapshot',kind:'recorded',
      args:{pillar:'finance',date:'2026-09-08',localContext:{accounts:[{name:'Operating',balance:12400}]}},
      expected:/recorded condition.*Open Operating.*source timestamp/i,
    },
    {
      label:'meal plan',kind:'projected',
      args:{pillar:'health',date:'2026-09-08',pillarData:{breakfast:'Oatmeal',lunch:'Chicken wraps',dinner:'Herb salmon'}},
      expected:/recorded plan executable.*ingredients.*Oatmeal/i,
    },
  ]

  for(const {label,kind,args,expected} of cases){
    const primary=pillarAnalysisFactPack(args)[0]
    const fallback=buildDeterministicPillarFallback(args)
    assert.equal(primary.kind,kind,label)
    assert.match(fallback.todayFocus,expected,label)
    assert.notEqual(fallback.todayFocus,fallback.actionableInsights[0].nextMove,label)
    assert.doesNotMatch(fallback.todayFocus,/By day’s end, record the outcome of/i,label)
    assert.deepEqual(pillarAnalysisQualityIssues(fallback,args.pillar,args),[],label)
  }
})

test('source restatements need an interpretation and a consequential why',()=>{
  const args={pillar:'health',date:'2026-09-08',pillarData:{breakfast:'Oatmeal',lunch:'Chicken wraps',dinner:'Herb salmon'}}
  const pointless={
    headline:'Oatmeal is today’s breakfast',
    executiveSummary:'The recorded breakfast entry for today is Oatmeal.',
    todayFocus:'Keep Oatmeal as the named breakfast in today’s plan.',
    analysisPoints:[{title:'Today’s breakfast',detail:'Oatmeal is the recorded breakfast entry for today.'}],
    actionableInsights:[{title:'Check the breakfast',whyItMatters:'The breakfast entry names Oatmeal for today.',nextMove:'Check that the ingredients for Oatmeal are available before breakfast.'}],
    evidence:[{source:'Daily pillar plan',detail:'Breakfast — Oatmeal'}],
    reflectionPrompts:['Is Oatmeal still the breakfast entry for today?'],
    watchFor:['Changing the Oatmeal entry without updating the plan.'],
    decisions:[],
    growthSignal:'Progress will show when Oatmeal remains the breakfast entry.',
    governingPrinciple:'A named Oatmeal breakfast is a named breakfast.',
  }
  assert.ok(pillarAnalysisQualityIssues(pointless,'health',args).includes('restatement-without-interpretation'))

  const genericSupport=buildDeterministicPillarFallback(args)
  genericSupport.analysisPoints=[{title:'Breakfast support',detail:'Oatmeal supports the breakfast plan for today.'}]
  genericSupport.actionableInsights=[{title:'Keep Oatmeal planned',whyItMatters:'Oatmeal supports today’s planned breakfast choice.',nextMove:'Check that the ingredients for Oatmeal are available before breakfast.'}]
  assert.ok(pillarAnalysisQualityIssues(genericSupport,'health',args).includes('restatement-without-interpretation'))

  const concise=buildDeterministicPillarFallback(args)
  concise.analysisPoints=[{title:'Breakfast execution',detail:'Oatmeal reduces morning decision friction when its ingredients are ready.'}]
  concise.actionableInsights=[{title:'Confirm Oatmeal ingredients',whyItMatters:'Confirming the ingredients prevents an improvised breakfast choice.',nextMove:'Check that the ingredients for Oatmeal are available before breakfast.'}]
  assert.equal(pillarAnalysisQualityIssues(concise,'health',args).includes('restatement-without-interpretation'),false)
  assert.deepEqual(pillarAnalysisQualityIssues(buildDeterministicPillarFallback(args),'health',args),[])
})

test('analysis text fields require strings and enforce the server length contract',()=>{
  const args={pillar:'health',date:'2026-09-08',pillarData:{breakfast:'Oatmeal',lunch:'Chicken wraps',dinner:'Herb salmon'}}
  const cases=[
    ['core object','headline',{value:'Oatmeal'} ,'empty-core-insight'],
    ['point object','analysisPoints',null,'empty-analysis-points'],
    ['action number','actionableInsights',null,'empty-actionable-insights'],
    ['evidence object','evidence',null,'missing-evidence'],
    ['prompt number','reflectionPrompts',null,'invalid-reflectionPrompts'],
  ]
  for(const [label,field,value,issue] of cases){
    const analysis=buildDeterministicPillarFallback(args)
    if(label==='point object')analysis.analysisPoints[0].detail={text:'not a string'}
    else if(label==='action number')analysis.actionableInsights[0].nextMove=42
    else if(label==='evidence object')analysis.evidence[0].detail={text:'not a string'}
    else if(label==='prompt number')analysis.reflectionPrompts=[42]
    else analysis[field]=value
    assert.ok(pillarAnalysisQualityIssues(analysis,'health',args).includes(issue),label)
  }

  const overlong=buildDeterministicPillarFallback(args)
  overlong.analysisPoints[0].detail='x'.repeat(1201)
  assert.ok(pillarAnalysisQualityIssues(overlong,'health',args).includes('overlong-analysis-content'))

  const hiddenClaim=buildDeterministicPillarFallback(args)
  hiddenClaim.analysisPoints[0].detail=`${'context '.repeat(100)}Oatmeal has been eaten and improved diabetes.`
  assert.ok(pillarAnalysisQualityIssues(hiddenClaim,'health',args).includes('unsupported-completion-status'))
})

test('completion aliases cannot turn plans or unresolved work into results',()=>{
  const cases=[
    ['spiritual',{pillar:'spiritual',date:'2026-09-08',pillarData:{scripture:['James 1:5'],devotionFocus:'Ask God for wisdom before responding',obedienceAction:'Pause and pray before the first difficult conversation'}},'Pause and pray before the first difficult conversation was practiced.'],
    ['health',{pillar:'health',date:'2026-09-08',pillarData:{breakfast:'Greek yogurt with berries',lunch:'Chicken salad',dinner:'Salmon with broccoli'}},'Greek yogurt with berries was served.'],
    ['fitness',{pillar:'fitness',date:'2026-09-08',pillarData:{workout:'30-minute interval run',objective:'Build aerobic endurance',stepGoal:8000,recovery:'Ten minutes mobility'}},'The 30-minute interval run was logged.'],
    ['household',{pillar:'household',date:'2026-09-08',pillarData:{weeklyFocus:'Repair guest bathroom',priorities:[{title:'Replace leaking faucet',status:'open'}]}},'Replace leaking faucet was fixed.'],
    ['education',{pillar:'education',date:'2026-09-08',pillarData:{thinkTankTopic:'Equivalent fractions',thinkTankDeliverable:'Explain two equivalent fractions',isaiah:{readingMinutes:20}}},'Isaiah mastered Equivalent fractions.'],
    ['ministry',{pillar:'ministry',date:'2026-09-08',pillarData:{contentFocus:'Encouragement in hardship',meetings:[{title:'Care team huddle',startTime:'18:30',status:'planned'}]}},'Care team huddle happened as planned.'],
  ]
  for(const [label,args,claim] of cases){
    const analysis=buildDeterministicPillarFallback(args)
    analysis.executiveSummary+=` ${claim}`
    assert.ok(pillarAnalysisQualityIssues(analysis,args.pillar,args).includes('unsupported-completion-status'),label)
  }

  const unresolved={pillar:'household',date:'2026-09-08',pillarData:{priorities:[{title:'Replace leaking faucet',status:'blocked'}]}}
  const completed=buildDeterministicPillarFallback(unresolved)
  completed.executiveSummary+=' Replace leaking faucet was completed.'
  assert.ok(pillarAnalysisQualityIssues(completed,'household',unresolved).includes('unsupported-completion-status'))

  const sourced={pillar:'health',date:'2026-09-08',pillarData:{breakfast:'Greek yogurt with berries',lunch:'Chicken salad',dinner:'Salmon with broccoli',discussionPrompt:'Greek yogurt with berries was served.'}}
  const sourcedAnalysis=buildDeterministicPillarFallback(sourced)
  sourcedAnalysis.executiveSummary+=' Greek yogurt with berries was served.'
  assert.equal(pillarAnalysisQualityIssues(sourcedAnalysis,'health',sourced).includes('unsupported-completion-status'),false)
})

test('measurements, scores, and inventory quantities require source support',()=>{
  const health={pillar:'health',date:'2026-09-08',pillarData:{breakfast:'Greek yogurt with berries',lunch:'Chicken salad',dinner:'Salmon with broccoli'}}
  const fitness={pillar:'fitness',date:'2026-09-08',pillarData:{workout:'30-minute interval run',objective:'Build aerobic endurance',stepGoal:8000,recovery:'Ten minutes mobility'}}
  const education={pillar:'education',date:'2026-09-08',pillarData:{thinkTankTopic:'Equivalent fractions',thinkTankDeliverable:'Explain two equivalent fractions',isaiah:{readingMinutes:20}}}
  for(const [args,claim] of [
    [health,'After Greek yogurt with berries, blood glucose measured 105 mg/dL.'],
    [fitness,'Resting heart rate fell to 58 bpm after the interval run.'],
    [fitness,'The interval run burned 420 calories.'],
    [education,'Isaiah answered 9 of 10 Equivalent fractions questions correctly.'],
  ]){
    const analysis=buildDeterministicPillarFallback(args)
    analysis.executiveSummary+=` ${claim}`
    assert.ok(pillarAnalysisQualityIssues(analysis,args.pillar,args).includes('unsupported-measurement'),claim)
  }

  const household={pillar:'household',date:'2026-09-08',pillarData:{weeklyFocus:'Repair guest bathroom',priorities:[{title:'Replace leaking faucet',status:'open'}]}}
  const quantity=buildDeterministicPillarFallback(household)
  quantity.executiveSummary+=' Two replacement cartridges are already on hand.'
  assert.ok(pillarAnalysisQualityIssues(quantity,'household',household).includes('ungrounded-claim-clause'))

  const sourced={...health,pillarData:{...health.pillarData,discussionPrompt:'Blood glucose measured 105 mg/dL.'}}
  const sourcedAnalysis=buildDeterministicPillarFallback(sourced)
  sourcedAnalysis.executiveSummary+=' Blood glucose measured 105 mg/dL.'
  assert.equal(pillarAnalysisQualityIssues(sourcedAnalysis,'health',sourced).includes('unsupported-measurement'),false)
})

test('Scripture references and doctrinal guarantees require a recorded source',()=>{
  const args={pillar:'spiritual',date:'2026-09-08',pillarData:{scripture:['James 1:5'],devotionFocus:'Ask God for wisdom before responding',obedienceAction:'Pause and pray before the first difficult conversation'}}
  for(const claim of [
    'John chapter 3, verse 16 is also assigned for today.',
    'James 1:5 guarantees that asking once produces immediate certainty.',
  ]){
    const analysis=buildDeterministicPillarFallback(args)
    analysis.executiveSummary+=` ${claim}`
    assert.ok(pillarAnalysisQualityIssues(analysis,'spiritual',args).includes('unsupported-scripture-claim'),claim)
  }

  const sourced={...args,pillarData:{...args.pillarData,scripture:['John 3:16']}}
  const supported=buildDeterministicPillarFallback(sourced)
  supported.executiveSummary+=' John chapter 3, verse 16 is assigned for today.'
  assert.equal(pillarAnalysisQualityIssues(supported,'spiritual',sourced).includes('unsupported-scripture-claim'),false)
})

test('new people, organizations, relative dates, and event mutations require exact source support',()=>{
  const household={pillar:'household',date:'2026-09-08',pillarData:{weeklyFocus:'Repair guest bathroom',priorities:[{title:'Replace leaking faucet',status:'open'}]}}
  const education={pillar:'education',date:'2026-09-08',pillarData:{thinkTankTopic:'Equivalent fractions',thinkTankDeliverable:'Explain two equivalent fractions',isaiah:{readingMinutes:20}}}
  const ministry={pillar:'ministry',date:'2026-09-08',pillarData:{contentFocus:'Encouragement in hardship',meetings:[{title:'Care team huddle',startTime:'18:30',status:'planned'}]}}
  for(const [args,claim] of [
    [household,'A plumber visit is confirmed for Thursday morning.'],
    [household,'Marcus will repair Replace leaking faucet tomorrow.'],
    [education,'Khan Academy confirms Isaiah is ready for decimals.'],
    [ministry,'Pastor Reynolds approved the message for Sunday.'],
    [ministry,'Maria committed to join the Care team huddle.'],
    [ministry,'The Care team huddle moved to the sanctuary.'],
  ]){
    const analysis=buildDeterministicPillarFallback(args)
    analysis.executiveSummary+=` ${claim}`
    assert.ok(pillarAnalysisQualityIssues(analysis,args.pillar,args).includes('ungrounded-claim-clause'),claim)
  }

  const sourced={...household,pillarData:{...household.pillarData,openItems:['Marcus will repair Replace leaking faucet tomorrow.']}}
  const supported=buildDeterministicPillarFallback(sourced)
  supported.executiveSummary+=' Marcus will repair Replace leaking faucet tomorrow.'
  assert.equal(pillarAnalysisQualityIssues(supported,'household',sourced).includes('ungrounded-claim-clause'),false)
})
