import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeActionProposal,permissionForOperation} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation,resourceForOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {weeklyHouseholdBriefing} from '../../netlify/lib/weekly-household-briefing.mjs'
import {loadAssistantSupplementalContext} from '../../netlify/lib/assistant-supplemental-context.mjs'
import {pillarRecords} from '../../netlify/lib/brevity-agent-tools.mjs'
const normalize=(type,payload,targetId='Larry')=>normalizeActionProposal({summary:'Reviewed activity',operations:[{type,targetId,targetDate:'2026-09-29',payload}]},{member:'Larry',role:'admin'}).operations[0]
test('completed workouts are own-member activity records, separate from planned workouts',()=>{
 const op=normalize('activity.record',{kind:'workout',title:'Walk',durationMinutes:30})
 assert.equal(resourceForOperation(op),'activity:Larry:2026-09-29')
 assert.equal(permissionForOperation({operation:op,member:'Lorenzo',role:'admin'}).allowed,false)
 const saved=applyRecordOperation(null,op,()=> 'walk',{actor:'Larry'}).after
 assert.equal(saved.entries[0].durationMinutes,30);assert.equal(saved.entries[0].member,'Larry')
 const corrected=applyRecordOperation(saved,normalize('activity.update',{entryId:'walk',durationMinutes:25}),()=> 'unused',{actor:'Larry'}).after
 assert.equal(corrected.entries[0].durationMinutes,25)
 assert.equal(applyRecordOperation(corrected,normalize('activity.remove',{entryId:'walk',reason:'Wrong day'})).after.entries.length,0)
 assert.throws(()=>normalize('activity.record',{kind:'workout',title:'Walk',durationMinutes:-5}),/Invalid/)
})
test('reported expenses require amount, currency and administrator review, never bank mutations',()=>{
 assert.throws(()=>normalize('activity.record',{kind:'expense',title:'Groceries'}),/amount and currency/)
 const operation=normalize('activity.record',{kind:'expense',title:'Groceries',amount:50,currency:'USD'})
 assert.equal(permissionForOperation({operation,member:'Larry',role:'member',permissions:{finance:true}}).allowed,false)
 assert.equal(resourceForOperation(operation),'activity:Larry:2026-09-29')
})
test('approved learning observations use the existing education record and evidence-derived mastery',()=>{
 const op=normalize('education.observation.record',{observations:[{skillId:'decoding',activityId:'reading',result:'prompted'}]},'Isaiah')
 assert.equal(resourceForOperation(op),'shared:brevity_education_isaiah_v1')
 assert.equal(permissionForOperation({operation:op,member:'Isaiah',role:'admin'}).allowed,false)
 assert.equal(permissionForOperation({operation:op,member:'Terica',role:'member',permissions:{planning:true}}).allowed,true)
 const first=applyRecordOperation(null,op,()=> 'session1',{actor:'Larry'}).after
 assert.equal(first.skillMastery.decoding.status,'YELLOW')
 const next=applyRecordOperation(first,op,()=> 'session2',{actor:'Larry'}).after
 assert.equal(next.skillMastery.decoding.status,'YELLOW');assert.equal(next.sessions[0].assessor,'Larry')
 assert.throws(()=>normalize('education.observation.record',{observations:[{skillId:'reading',activityId:'a',result:'mastered'}]},'Isaiah'),/independent/)
})
test('weekly briefing separates planned activities from reported completion and preserves source gaps',()=>{
 const value=weeklyHouseholdBriefing({signedInMember:'Larry',householdDate:'2026-09-29',historyStartDate:'2026-09-23',recentDailyPlans:[{date:'2026-09-29',fitness:{workout:'Run 5 miles'},assignments:[{title:'Inspect roof',status:'pending'}]}],recentActivities:[{entries:[{kind:'workout',title:'Walk',durationMinutes:30}]}],supplementalSources:{'nutrition:2026-09-28':'unavailable'},access:{finance:false}})
 assert.equal(value.fitness.reportedWorkouts,1);assert.equal(value.fitness.reportedMinutes,30)
 assert.equal(value.household.completedAssignments,0);assert.equal(value.nextActions.length,1)
 assert.equal(value.finance.access,'not-permitted');assert.deepEqual(value.unavailableSources,['nutrition:2026-09-28'])
})
test('private module tools do not expose education or finance to unauthorized members',async()=>{
 const reads=[]
 const context=await loadAssistantSupplementalContext({canonical:{householdDate:'2026-09-29'},member:'Javin',resources:{read:async key=>{reads.push(key);return {value:{entries:[]}}}},loadLibrary:async()=>({library:[]}),loadCalendar:async()=>({})})
 assert.equal(context.access.education,false);assert.equal(context.access.finance,false)
 assert.equal(reads.includes('shared:brevity_education_isaiah_v1'),false)
 assert.equal(pillarRecords('finance',{...context,actionRecords:{finance:{secret:'private'}}},{}).access,'not-permitted')
 assert.equal(pillarRecords('education',{...context,learningRecord:{private:true}},{}).learningRecord,undefined)
})
