import assert from 'node:assert/strict'
import test from 'node:test'
import { ACTION_COMPLETED_EVENT } from '../assistant/actionEvents.js'
import {
  captureMealPlanRefreshError,
  ROLLING_MEAL_APP_REFRESH_EVENT,
  rollingMealPlanRequestKey,
  rollingMealPlanOperationIsCurrent,
  rollingMealPlanScopeIsCurrent,
  rollingMealPlanView,
  shouldReloadRollingMealPlan,
  validateRollingMealPlan,
} from './useRollingMealPlan.js'

const completeMeals={breakfast:{name:'Yogurt'},lunch:{name:'Chicken salad'},dinner:{name:'Salmon'}}
const plan = date => ({ startDate:date, days:[{ date, resolvedMeals:completeMeals }] })

test('rolling meal data is visible only for the requested start date',()=>{
  const current=plan('2026-09-08')
  assert.equal(rollingMealPlanView({
    startDate:'2026-09-08',requireFresh:true,state:'ready',stateRequestKey:rollingMealPlanRequestKey('2026-09-08'),
    data:current,dataRequestKey:rollingMealPlanRequestKey('2026-09-08'),
  }).data,current)

  const changed=rollingMealPlanView({
    startDate:'2026-09-09',requireFresh:true,state:'ready',stateRequestKey:rollingMealPlanRequestKey('2026-09-08'),
    data:current,dataRequestKey:rollingMealPlanRequestKey('2026-09-08'),
  })
  assert.equal(changed.state,'loading')
  assert.equal(changed.data,null)
})

test('strict consumers cannot use a prior snapshot while reloading, after an error, or while disabled',()=>{
  const date='2026-09-08',requestKey=rollingMealPlanRequestKey(date),data=plan(date)
  const common={startDate:date,requireFresh:true,stateRequestKey:requestKey,data,dataRequestKey:requestKey}
  assert.equal(rollingMealPlanView({...common,state:'loading'}).data,null)
  assert.equal(rollingMealPlanView({...common,state:'error',error:'offline'}).data,null)
  assert.equal(rollingMealPlanView({...common,state:'error',error:'offline'}).error,'offline')
  assert.deepEqual(rollingMealPlanView({...common,enabled:false,state:'ready'}),{data:null,state:'idle',error:'',requestKey})

  const reenabled=rollingMealPlanView({...common,state:'idle',stateRequestKey:''})
  assert.equal(reenabled.state,'loading')
  assert.equal(reenabled.data,null)
})

test('default meal-plan consumers retain their current snapshot during an ordinary reload',()=>{
  const requestKey=rollingMealPlanRequestKey(),data=plan('2026-09-08')
  const view=rollingMealPlanView({state:'loading',stateRequestKey:requestKey,data,dataRequestKey:requestKey})
  assert.equal(view.data,data)
  assert.equal(view.state,'loading')
})

test('an explicit-date response must contain the requested rolling-plan day',()=>{
  const current=plan('2026-09-08')
  assert.equal(validateRollingMealPlan(current,'2026-09-08'),current)
  assert.throws(()=>validateRollingMealPlan(current,'2026-09-09'),/did not return the requested day/i)
  assert.throws(()=>validateRollingMealPlan({startDate:'2026-09-08',days:[{date:'2026-09-08',resolvedMeals:{breakfast:{name:'Yogurt'}}}]},'2026-09-08'),/incomplete.*lunch, dinner/i)
  assert.equal(validateRollingMealPlan(current),current)
})

test('Health reloads for application refreshes and completed meal substitutions only',()=>{
  assert.equal(shouldReloadRollingMealPlan({type:ROLLING_MEAL_APP_REFRESH_EVENT}),true)
  assert.equal(shouldReloadRollingMealPlan({type:ACTION_COMPLETED_EVENT,detail:{audit:{operations:[{type:'meal.substitute'}]}}}),true)
  assert.equal(shouldReloadRollingMealPlan({type:ACTION_COMPLETED_EVENT,detail:{audit:{operations:[{type:'plan.pillar.update'}]}}}),false)
  assert.equal(shouldReloadRollingMealPlan({type:'storage'}),false)
})

test('stale callbacks cannot take over a newer rolling-plan scope',()=>{
  const current={enabled:true,requestKey:rollingMealPlanRequestKey('2026-09-09')}
  assert.equal(rollingMealPlanScopeIsCurrent(current,rollingMealPlanRequestKey('2026-09-09')),true)
  assert.equal(rollingMealPlanScopeIsCurrent(current,rollingMealPlanRequestKey('2026-09-08')),false)
  assert.equal(rollingMealPlanScopeIsCurrent({...current,enabled:false},current.requestKey),false)
  assert.equal(rollingMealPlanOperationIsCurrent({operation:4,currentOperation:4,mounted:true,scope:current,requestKey:current.requestKey}),true)
  assert.equal(rollingMealPlanOperationIsCurrent({operation:3,currentOperation:4,mounted:true,scope:current,requestKey:current.requestKey}),false)
  assert.equal(rollingMealPlanOperationIsCurrent({operation:4,currentOperation:4,mounted:true,scope:current,requestKey:rollingMealPlanRequestKey('2026-09-08')}),false)
  assert.equal(rollingMealPlanOperationIsCurrent({operation:4,currentOperation:4,mounted:false,scope:current,requestKey:current.requestKey}),false)
})

test('a committed meal replacement is not reported as failed when only its follow-up refresh fails',async()=>{
  const refreshFailure=new Error('refresh offline')
  assert.equal(await captureMealPlanRefreshError(async()=>{throw refreshFailure}),refreshFailure)
  assert.equal(await captureMealPlanRefreshError(async()=>{}),null)
})
