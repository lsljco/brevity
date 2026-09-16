import assert from 'node:assert/strict'
import test from 'node:test'
import { OPERATING_KIND, buildTodayReadModel, createOperatingRecord } from './operatingModel.js'

const plan = {
  id: 'daily-plan-2026-08-26',
  date: '2026-08-26',
  theme: 'Act on what matters',
  health: { dinner: 'Salmon and asparagus' },
  fitness: { location: 'Lifetime Fitness' },
  education: { isaiah: { owner: 'Terica' } },
  topPriorities: [
    { id: 'outcome-1', title: 'Resolve the insurance decision', owner: 'Larry', status: 'pending' },
  ],
  assignments: [
    { id: 'mine', title: 'Call the doctor', owner: 'Larry', status: 'pending', priority: 'high' },
    { id: 'family', title: 'General family item', owner: 'Family', status: 'pending' },
    { id: 'done', title: 'Finished work', owner: 'Larry', status: 'complete' },
  ],
  decisions: [
    { id: 'decision-1', title: 'Choose contractor', owner: 'Larry', status: 'needs-decision' },
    { id: 'decision-2', title: 'Approved proposal', owner: 'Larry', status: 'determined' },
    { id: 'decision-3', title: 'Closed question', owner: 'Larry', status: 'complete' },
  ],
}

test('operating records require a recognized kind and a useful title', () => {
  assert.throws(() => createOperatingRecord({ kind: 'widget', title: 'Invalid' }), /unsupported/i)
  assert.throws(() => createOperatingRecord({ kind: OPERATING_KIND.action, title: ' ' }), /require a title/i)
})

test('Today read model separates outcomes, actions, decisions, commitments, and signals', () => {
  const model = buildTodayReadModel({
    plan,
    currentMember: 'Larry',
    now: new Date('2026-08-26T08:00:00'),
    calendarHealth: { state: 'ready', usable: true, stale: false, lastSuccessfulSyncAt: '2026-08-26T07:55:00.000Z' },
    calendarAppointments: [
      { id: 'doctor', title: 'Doctor appointment', date: '2026-08-26', startTime: '9:30 AM', owner: 'Larry', calendarSource: 'icloud' },
    ],
  })

  assert.deepEqual(model.outcomes.map(item => item.title), ['Resolve the insurance decision'])
  assert.deepEqual(model.memberOutcomes.map(item => item.title), ['Resolve the insurance decision'])
  assert.deepEqual(model.actions.map(item => item.title), ['Call the doctor'])
  assert.deepEqual(model.decisions.map(item => item.title), ['Choose contractor', 'Approved proposal'])
  assert.equal(model.commitments[0].kind, OPERATING_KIND.commitment)
  assert.equal(model.commitments[0].source.system, 'apple-calendar')
  assert.equal(model.nextCommitment.title, 'Doctor appointment')
  assert.equal(model.signals.length, 0)
  assert.deepEqual(model.attentionItems.map(item => item.title), [])
  assert.equal(model.focus.headline, 'Act on what matters')
  assert.equal(model.focus.source, 'recorded-theme')
})

test('Today surfaces every unresolved household priority in Household Operations attention', () => {
  const model=buildTodayReadModel({plan:{
    ...plan,
    household:{priorities:[
      {id:'one',title:'Replace the hallway bulb',status:'pending'},
      {id:'two',title:'Schedule the HVAC service',status:'in-progress'},
      {id:'three',title:'Approve the landscaping quote',status:'needs-decision'},
      {id:'four',title:'Restock cleaning supplies',status:'ready'},
      {id:'done',title:'Completed household work',status:'complete'},
      {id:'deferred',title:'Deferred household work',status:'deferred'},
    ]},
  },calendarHealth:{state:'ready',usable:true}})

  assert.equal(model.counts.attention,4)
  assert.deepEqual(model.attentionItems.map(item=>item.title),[
    'Approve the landscaping quote',
    'Replace the hallway bulb',
    'Restock cleaning supplies',
    'Schedule the HVAC service',
  ])
  assert.ok(model.attentionItems.every(item=>item.source.recordType==='household-priority'))
})

test('Today derives a concrete focus when the plan theme is blank', () => {
  const outcomeModel=buildTodayReadModel({plan:{...plan,theme:'',topPriorities:[{id:'cash',title:'Fund the operating account',owner:'Larry',status:'pending'}]}})
  assert.deepEqual(outcomeModel.focus,{
    headline:'Fund the operating account',
    detail:'This is the highest recorded outcome that defines success for today.',
    source:'daily-outcome',
  })

  const commitmentModel=buildTodayReadModel({
    plan:{date:'2026-08-26',health:{dinner:'Salmon'}},
    now:new Date('2026-08-26T08:00:00'),
    calendarAppointments:[{id:'review',title:'Family Finance Meeting',date:'2026-08-26',startTime:'9:00 AM'}],
  })
  assert.equal(commitmentModel.focus.headline,'Prepare for Family Finance Meeting')
  assert.match(commitmentModel.focus.detail,/9:00 AM/)
  assert.equal(commitmentModel.focus.source,'next-commitment')
})

test('Today names a truthful next step when no focus evidence exists', () => {
  const model=buildTodayReadModel({plan:{date:'2026-08-26'}})
  assert.equal(model.focus.headline,'Today’s plan has no defined focus yet')
  assert.match(model.focus.detail,/Morning Alignment/)
  assert.equal(model.focus.source,'missing-plan')
})

test('pillar pulse communicates the daily meaning without announcing pillar owners', () => {
  const model = buildTodayReadModel({ plan:{
    ...plan,
    spiritual:{ devotionFocus:'Assess the fruit, not the image', owner:'Lorenzo' },
    health:{ dinner:'Salmon', hydration:'Keep water visible through transitions', owner:'Terica' },
    fitness:{ objective:'Protect energy and mobility', owner:'Larry' },
    education:{ thinkTankDeliverable:'Explain one idea in your own words', owner:'Larry' },
    finance:{ bills:[{title:'Mortgage'}], purchases:[], accountsToFund:[], owner:'Larry' },
    ministry:{ contentFocus:'Move conviction into concrete obedience', owners:['Larry','Lorenzo'] },
  }})
  const summaries = model.pillarPulse.map(item => item.summary).join(' ')
  assert.match(summaries, /Assess the fruit/)
  assert.match(summaries, /Keep water visible/)
  assert.match(summaries, /Explain one idea/)
  assert.doesNotMatch(summaries, /Lorenzo|Terica|owner/i)
})

test('calendar failures become prioritized signals without hiding cached commitments', () => {
  const model = buildTodayReadModel({
    plan,
    currentMember: 'Larry',
    now: new Date('2026-08-26T08:00:00'),
    calendarHealth: { state: 'error', usable: true, stale: true, message: 'Apple rejected discovery. Cached events remain visible.', lastSuccessfulSyncAt: '2026-08-26T07:00:00.000Z' },
    calendarAppointments: [
      { id: 'doctor', title: 'Doctor appointment', date: '2026-08-26', startTime: '9:30 AM', owner: 'Larry', calendarSource: 'icloud' },
    ],
  })

  assert.equal(model.signals[0].title, 'Today’s calendar may be out of date')
  assert.equal(model.signals[0].priority, 'critical')
  assert.equal(model.commitments.length, 1)
})

test('next commitment follows the household date and clock rather than the device zone', () => {
  const model = buildTodayReadModel({
    plan:{ ...plan, date:'2026-09-06' },
    currentMember:'Larry',
    now:new Date('2026-09-07T03:30:00.000Z'), // 11:30 PM on Sep 6 in New York
    calendarHealth:{ state:'ready', usable:true },
    calendarAppointments:[
      { id:'past', title:'Past commitment', date:'2026-09-06', startTime:'11:00 PM', owner:'Larry' },
      { id:'next', title:'Household-zone next commitment', date:'2026-09-06', startTime:'11:45 PM', owner:'Larry' },
    ],
  })

  assert.equal(model.nextCommitment.title, 'Household-zone next commitment')
})
