import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8')
const planner=readFileSync(new URL('./FinancePlanner.jsx',import.meta.url),'utf8')
const meetings=readFileSync(new URL('./FinanceMeetingsWorkspace.jsx',import.meta.url),'utf8')
const meetingsCss=readFileSync(new URL('./FinanceMeetings.css',import.meta.url),'utf8')
const meetingsBridge=readFileSync(new URL('./FinanceMeetingsBridge.jsx',import.meta.url),'utf8')
const meetingTruth=readFileSync(new URL('./financeMeetingTruth.js',import.meta.url),'utf8')
const assistant=readFileSync(new URL('../assistant/BrevityAssistant.jsx',import.meta.url),'utf8')
const meetingReview=readFileSync(new URL('./meetingActionReview.js',import.meta.url),'utf8')
const actionExecutor=readFileSync(new URL('../../netlify/lib/assistant-action-executor.mjs',import.meta.url),'utf8')
const actionFunction=readFileSync(new URL('../../netlify/functions/brevity-assistant-actions.mjs',import.meta.url),'utf8')
const { canonicalMeetingNameText }=await import('./meetingNames.js')

test('finance greeting receives the authenticated household member',()=>{
  assert.match(app,/FinancePlanner[^>]+currentMember=\{currentMember\}/)
  assert.match(planner,/\{getHouseholdGreeting\(\)\}, \{currentMember\}/)
  assert.doesNotMatch(planner,/\{getHouseholdGreeting\(\)\}, Larry/)
})

test('meeting-created text exposes editors and routes saves through reviewed Action Mode',()=>{
  for(const label of ['Commitment text','Correction name','Correction rationale','Correction source detail','Meeting summary','Meeting notes','Meeting transcript','Brevity meeting summary'])assert.match(meetings,new RegExp(`aria-label="${label}"`))
  assert.match(meetings,/requestMeetingActionReview\(\{summary,operation\}\)/)
  assert.match(meetings,/pendingReviewsRef\.current\.set\(proposal\.id,\{label,onApplied\}\)/)
  assert.match(meetings,/pending\.onApplied\?\.\(\)/)
  assert.match(meetings,/Preparing review…':'Review changes'/)
  assert.match(meetingReview,/getAcknowledgedSharedStateVersion\(storage,FINANCE_MEETINGS_STORAGE_KEY\)/)
  assert.match(actionFunction,/DIRECT_REVIEW_TYPES=new Set\(\[[^\]]*'meeting\.action\.update'/)
  assert.match(actionExecutor,/updatedBy:context\.actor\|\|'Household member'/)
})

test('Action Mode renders extracted meeting records as reviewable fields',()=>{
  assert.match(assistant,/Object\.entries\(item\)/)
  assert.match(assistant,/actionFieldLabel\(field\).*actionFieldValue\(fieldValue\)/)
  assert.doesNotMatch(assistant,/Array\.isArray\(value\)\?value\.join\(', '\)/)
})

test('meeting commitments repair known household-name transcription errors',()=>{
  assert.equal(canonicalMeetingNameText('Jabin and Tarrica spoke with Tara'),'Javin and Terica spoke with Terica')
  assert.equal(canonicalMeetingNameText('Benjamin met Taran'),'Benjamin met Taran')
  assert.match(meetings,/HOUSEHOLD_MEMBERS\.map\(member=>/)
  assert.match(meetings,/SHARED_STATE_EVENT/)
  assert.match(meetingReview,/const next=canonicalMeetingAction\(/)
  assert.match(meetingReview,/next\.text=next\.text\.trim\(\);next\.owner=next\.owner\.trim\(\)/)
})

test('daily commitments are summarized once and edited in one authoritative list',()=>{
  assert.match(meetings,/className="fm-kiss-card fm-commitments-summary"/)
  assert.match(meetings,/href="#finance-decisions-assignments"/)
  assert.match(meetings,/id="finance-decisions-assignments"/)
  assert.match(meetings,/The authoritative list for reviewing and editing commitments\./)
  assert.doesNotMatch(meetings,/openActions\.slice\(0,3\)\.map/)
  assert.equal((meetings.match(/<Action key=/g)||[]).length,1)
})

test('finance defaults to the operating account and projected vision',()=>{
  assert.match(planner,/data\.accounts\.find\(account => account\.name === 'Operating Account'\)/)
  assert.match(planner,/return operating \? new Set\(\[operating\.id\]\) : null/)
  assert.match(planner,/onClick=\{\(\) => setSelectedAccts\(new Set\(\[acct\.id\]\)\)\}/)
  assert.match(meetings,/\[visionMode,setVisionMode\]=useState\('projected'\)/)
})

test('Finance Meetings visibly qualifies balance, actual, and projected sources',()=>{
  assert.match(meetingsBridge,/balanceDataStatus='unknown',transactionFreshnessStatus='unknown'/)
  assert.match(meetingsBridge,/buildMeetingCashScope\(\{accounts,scheduled,cashFlowScheduled,actuals,balanceDataStatus,transactionFreshnessStatus,today\}\)/)
  assert.match(meetingsBridge,/balanceDataStatus=\{meetingScope\.balanceDataStatus\}/)
  assert.match(meetingsBridge,/transactionFreshnessStatus=\{normalizeMeetingSourceStatus\(transactionFreshnessStatus\)\}/)
  assert.match(meetings,/aria-label="Finance Meeting data quality"/)
  assert.match(meetings,/<strong>Balance:<\/strong> \{balanceQualification\}/)
  assert.match(meetings,/<strong>Actual bank activity:<\/strong> \{transactionQualification\}/)
  assert.match(meetings,/<strong>Scheduled activity:<\/strong> projections until explicitly reconciled to posted bank activity/)
  assert.match(meetings,/Transfers within selected cash are neutral; transfers crossing the cash boundary count as projected inflows or obligations/)
  assert.match(meetings,/sourceStatus:\{balances:normalizedBalanceStatus,postedTransactions:normalizedTransactionStatus,scheduledActivity:'projected-not-completed',cashScope:hasCashAccounts\?'available':'unavailable',actualMetrics:actualMetricsAvailable\?'available':'unavailable'\}/)
  assert.match(meetings,/aria-label="Cash metrics unavailable"/)
  assert.match(meetings,/unavailable values are shown as —/)
  assert.match(meetings,/const money=value=>value===''\|\|value==null\|\|Number\.isNaN\(Number\(value\)\)\?'—'/)
  assert.match(meetings,/if\(value!==''&&value!=null&&Number\.isFinite\(Number\(value\)\)\)snapshot\[key\]=Number\(value\)/)
  assert.match(meetingsBridge,/const cashMetric=value=>meetingScope\.hasCashAccounts\?value:null/)
  assert.match(meetingsBridge,/const actualMetric=value=>meetingScope\.actualMetricsAvailable\?value:null/)
  assert.match(meetingTruth,/Transfer out of selected cash/)
  assert.match(meetingTruth,/Transfer into selected cash/)
})

test('Finance Meeting cash guidance stays conservative without fresh balances',()=>{
  assert.match(meetings,/meetingCoverageTone\(\{availableCash:snapshot\.operatingAvailable,expectedInflows:snapshot\.todayInflows,obligations:snapshot\.todayObligations,balanceDataStatus:normalizedBalanceStatus\}\)/)
  assert.match(meetings,/!balanceIsFresh[\s\S]{0,180}Verify live balances before treating \$\{timeframe\} cash coverage as safe/)
  assert.match(meetings,/monthGuidanceTone=balanceIsFresh\?snapshot\.monthStatus:snapshot\.monthStatus==='red'\?'red':'yellow'/)
  assert.match(meetings,/hasDistinctCurrentBalance&&<Metric label="Current balance"/)
  assert.match(meetingsBridge,/selected non-cash account[\s\S]{0,180}non-cash accounts do not count toward coverage/)
})

test('transaction filters use responsive non-overlapping columns',()=>{
  assert.match(planner,/grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(planner,/transaction-list-controls\.is-compact \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(planner,/@media \(max-width: 1120px\)[\s\S]*transaction-list-controls\.is-compact \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(planner,/@media \(max-width: 768px\)[\s\S]*transaction-list-controls\.is-compact \{ grid-template-columns: 1fr/)
  assert.doesNotMatch(planner,/className="transaction-list-controls"[^>]+gridTemplateColumns/)
})

test('Finance Meetings shrink to the phone workspace while cadence tabs scroll internally',()=>{
  assert.match(meetingsCss,/\.finance-meetings\{[^}]*width:100%;[^}]*min-width:0;/)
  assert.match(meetingsCss,/\.fm-tabs\{[^}]*overflow:auto;/)
})

test('finance meetings separate member planning edits from administrator financial edits',()=>{
  assert.match(meetings,/currentMember='Household member',readOnly=false,financeReadOnly=readOnly,meetingPlanningReadOnly=readOnly/)
  assert.doesNotMatch(meetings,/localStorage\.setItem\(STORAGE_KEY/)
  assert.doesNotMatch(meetings,/setWorkspace\(current=>/)
  assert.match(meetings,/const setCadence=next=>\{setSelectedCadence\(next\);invalidateAnalysis\(\)\}/)
  for(const mutation of ['appendTranscript','runSegment','startMeeting','endMeeting','saveRecording','importTranscript','addDecision','analyze','finalize']){
    assert.match(meetings,new RegExp(`const ${mutation}=[\\s\\S]{0,100}if\\(meetingPlanningReadOnly`),`${mutation} must require planning access`)
  }
  assert.match(meetings,/const addCorrection=async\(\)=>\{\s*if\(financeReadOnly/)
  assert.match(meetings,/if\(financeReadOnly&&\['meeting\.correction\.create','meeting\.correction\.update','meeting\.workspace\.update'\]\.includes\(operation\.type\)\)/)
  assert.match(meetings,/!meetingPlanningReadOnly&&<div className="fm-header-actions"/)
  assert.match(meetings,/!meetingPlanningReadOnly&&<div className="fm-form-grid"/)
  assert.match(meetings,/!financeReadOnly&&<div className="fm-correction-grid"/)
  assert.match(meetings,/!meetingPlanningReadOnly&&<section className="fm-capture"/)
  assert.match(meetings,/!meetingPlanningReadOnly&&showReconcile&&<section className="fm-reconcile"/)
  assert.match(meetings,/<Action[^>]+readOnly=\{meetingPlanningReadOnly\}/)
  assert.match(meetings,/<CorrectionRow[^>]+readOnly=\{financeReadOnly\}/)
  assert.match(meetings,/<HistoryRow[^>]+readOnly=\{meetingPlanningReadOnly\}/)
})

test('member Finance stays visible while only planning-authorized meeting narrative is editable',()=>{
  assert.match(app,/Financial records are read-only for \{currentMember\}/)
  assert.match(app,/<FinancePlanner[^>]+readOnly=\{auth\.role!=='admin'\}/)
  assert.match(app,/meetingPlanningReadOnly=\{!canEditPlanning\}/)
  assert.match(app,/planning access still allows reviewed edits to Finance Meeting narrative/)
  assert.doesNotMatch(planner,/useEffect\(\(\) => \{\s*if \(readOnly\) return[\s\S]{0,300}persistSharedSourceImport\(localStorage, LS_KEY, candidate\)/)
  assert.match(planner,/const fetchActuals = useCallback\(async \(\) => \{\s*if \(readOnly\)/)
  assert.doesNotMatch(planner,/addDashboardProjectWithImage|updateDashboardProjectImage|localStorage\.setItem\('homehq_items_v1'/)
  assert.match(planner,/Project images are view-only until reviewed image changes support Audit History and safe Undo/)
  assert.match(planner,/\{!readOnly && <PlaidConnect/)
  assert.match(planner,/\{!readOnly && view === 'tx-form'/)
  assert.doesNotMatch(planner,/view === 'acct-form'/)
  assert.match(planner,/\{!readOnly && selActualTx && \(/)
  for(const child of ['DailyAlignment','ScenarioModeling','BudgetView','CalendarView']){
    assert.match(planner,new RegExp(`<${child}[\\s\\S]{0,800}readOnly=\\{readOnly\\}`),`${child} must inherit Finance read-only state`)
  }
  assert.match(planner,/<DailyAlignment[\s\S]{0,300}financeReadOnly=\{readOnly\}/)
  assert.match(planner,/<DailyAlignment[\s\S]{0,300}meetingPlanningReadOnly=\{meetingPlanningReadOnly\}/)
})
