import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const app = read('../App.jsx')
const today = read('./HouseholdToday.jsx')
const dashboard = read('./TodayDashboard.jsx')
const alignment = read('./MorningAlignment.jsx')
const recap = read('./EveningRecap.jsx')
const generatorEndpoint = read('../../netlify/functions/daily-household-plan-background.mjs')
const generator = read('../../netlify/lib/household-plan-generator.mjs')

test('App resolves the signed-in member planning capability from Action Mode and always allows the administrator', () => {
  assert.match(app, /import \{ getActionMode \} from '\.\/assistant\/assistantApi\.js'/)
  assert.match(app, /const permissions=result\?\.permissions\?\.\[auth\.member\]/)
  assert.match(app, /auth\.role==='admin'\|\|\(actionPermissionState\.status==='ready'&&actionPermissionState\.member===currentMember&&actionPermissionState\.permissions\?\.planning===true\)/)
  assert.match(app, /<HouseholdToday[^>]+canEditPlanning=\{canEditPlanning\}[^>]+planningAccessStatus=\{planningAccessStatus\}[^>]+isAdministrator=\{auth\.role==='admin'\}/)
  assert.match(app, /<HomeHQ readOnly=\{!canEditProjects\}/)
  assert.match(app, /<HouseholdMaintenance currentMember=\{currentMember\} canEdit=\{canEditPlanning\}/)
  assert.match(app, /const shouldRequestBankUpdate=requestBankUpdate&&!financeReadOnly/)
  assert.match(app, /refreshApplicationData\(\{currentMember:member,requestBankUpdate:shouldRequestBankUpdate,financeReadOnly\}\)/)
})

test('Today remains navigable but every plan mutation is reviewed and permission guarded', () => {
  assert.match(today, /if \(!canEditPlanning\) throw new Error\('Plans & decisions permission is required to close the shared daily plan\.'\)/)
  assert.match(today, /if \(!canEditPlanning \|\| !isAdministrator\)/)
  assert.match(today, /Today is view-only for \{currentMember\}/)
  assert.match(today, /readOnly=\{!canEditPlanning\}/)
  assert.match(today, /stageDailyPlanReview/)
  assert.doesNotMatch(today, /savePlan\(|persistAndSync|onSaveDraft/)
  assert.match(dashboard, /if \(readOnly\) throw new Error\('Plans & decisions permission is required to update the shared decision queue\.'\)/)
  assert.match(dashboard, /disabled=\{readOnly \|\| !canGeneratePlan \|\| generationState === 'generating'\}/)
  assert.match(dashboard, /readOnly \? 'View Today’s Alignment'/)
  assert.match(dashboard, /readOnly \? 'View Recap'/)
})

test('Morning Alignment blocks revoked planning and protects the embedded finance section for every nonadministrator', () => {
  assert.match(alignment, /if \(readOnly \|\| \(section === 'finance' && financeReadOnly\)\) return/)
  assert.match(alignment, /if \(readOnly\) return[\s\S]*?if \(exiting\.current\) return/)
  assert.match(alignment, /if \(financeReadOnly\) cleanedDraft\.finance = protectedFinanceRef\.current/)
  assert.match(alignment, /<fieldset className="alignment-step-fields" disabled=\{stepReadOnly\}/)
  assert.match(alignment, /Only the household administrator can change financial details in Morning Alignment/)
  assert.match(today, /financeReadOnly=\{!isAdministrator\}/)
})

test('Evening Recap exposes existing content without allowing a read-only member to close or alter the day', () => {
  assert.match(recap, /if \(readOnly\) return[\s\S]*?setDraft/)
  assert.match(recap, /if \(readOnly\) \{ onCancel\(\); return \}/)
  assert.match(recap, /textarea readOnly=\{readOnly\}/)
  assert.match(recap, /This recap is view-only/)
})

test('daily-plan generation creates only a versioned draft for later exact-version review', () => {
  assert.match(generatorEndpoint, /authorization\.session\?\.role !== 'admin' && !authorization\.automation/)
  assert.match(generatorEndpoint, /requires household-administrator review/)
  assert.match(generator, /getWithMetadata\(planKey\(date\), \{ type: 'json' \}\)/)
  assert.match(generator, /basePlanVersion:Number\(basePlanVersion \|\| 0\)/)
  assert.match(generator, /daily-plan-drafts/)
  assert.match(generator, /\{ onlyIfNew:true \}/)
  assert.doesNotMatch(generator, /setJSON\(planKey\(/)
  assert.doesNotMatch(generator, /get\(planKey\(date\), \{ type: 'json' \}\)\.catch\(\(\) => null\)/)
})
