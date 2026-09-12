import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Projects remains viewable while every supported mutation requires reviewed Action Mode permission checks', () => {
  const source = read('../homehq/HomeHQ.jsx')

  assert.match(source, /function App\(\{readOnly=false,canDelete=false,currentMember=''\}\)/)
  assert.match(source, /setForm\(newProjectForm\(currentMember\)\)/)
  assert.match(source, /function openAdd\(\)\{ if\(readOnly\)/)
  assert.match(source, /function openEdit\(item\)\{\s*if\(readOnly\)/)
  assert.match(source, /async function saveItem\(\)\{\s*if\(readOnly\)/)
  assert.match(source, /projectUpdateOperation\(current,cleaned\):projectCreateOperation\(cleaned\)/)
  assert.match(source, /await requestProjectActionReview\(\{summary,operation\}\)/)
  assert.match(source, /async function deleteItem\(item\)\{\s*if\(readOnly\)/)
  assert.match(source, /if\(!canDelete\)\{showToast\("Only a household administrator can delete a project\."\);return;\}/)
  assert.match(source, /operation:projectDeleteOperation\(item\)/)
  assert.match(source, /\{readOnly&&<div role="note" className="hq-read-only-notice"/)
  assert.match(source, /<button onClick=\{exportData\}[^>]*>Export<\/button>/, 'export remains available in read-only mode')
  assert.match(source, /Project import, file and image changes, and multi-project calendar publishing remain unavailable/)
  assert.match(source, /Project images are view-only|Photo changes are temporarily unavailable/)
  assert.match(source, /\{modal&&!readOnly&&\(/)
  assert.match(source, /<GanttView items=\{items\} onEdit=\{openEdit\} readOnly=\{readOnly\}/)
  assert.match(source, /<CalendarView items=\{items\} onEdit=\{openEdit\} readOnly=\{readOnly\}/)
  assert.doesNotMatch(source, /saveItems|writeJson|publishProjectEvents|FileReader|window\.confirm/)
})

test('Household Operations keeps navigation visible while every occurrence change requires reviewed Action Mode', () => {
  const source = read('./HouseholdMaintenance.jsx')

  assert.match(source, /HouseholdMaintenance\(\{ currentMember, canEdit=true, isAdmin=false \}\)/)
  assert.match(source, /<OperationsTabs workspace=\{workspace\} setWorkspace=\{setWorkspace\}/, 'workspace navigation stays enabled')
  assert.match(source, /Every operations change requires review/)
  assert.match(source, /requestHouseholdActionReview\(\{summary,operation\}\)/)
  assert.match(source, /maintenanceCompletionOperation\(task,'submit'\)/)
  assert.match(source, /maintenanceCompletionOperation\(task,'start'\)/)
  assert.match(source, /Review start/)
  assert.match(source, /maintenanceCoverageOperation\(task,coveredBy\)/)
  assert.match(source, /maintenanceExceptionOperation\(task,message\)/)
  assert.match(source, /<HouseholdSchedule currentMember=\{currentMember\} mode="schedule" canEdit=\{canEdit\} isAdmin=\{isAdmin\}/)
  assert.match(source, /<HouseholdInventory currentMember=\{currentMember\} canEdit=\{canEdit\}/)
  assert.doesNotMatch(source, /localStorage\.setItem|writeSharedJson|publishHouseholdOperationEvents|const persist|const patchOccurrence/)
})

test('Schedule and routines expose granular reviewed mutations without raw writes', () => {
  const source = read('./HouseholdSchedule.jsx')

  assert.match(source, /HouseholdSchedule\(\{currentMember,mode='schedule',canEdit=true,isAdmin=false\}\)/)
  assert.match(source, /requestHouseholdActionReview\(\{summary,operation\}\)/)
  assert.match(source, /scheduleBlockCreateOperation/)
  assert.match(source, /scheduleRoutineUpdateOperation/)
  assert.match(source, /scheduleInvitationOperation/)
  assert.match(source, /<input type="date" value=\{date\} onChange=/, 'day navigation remains available')
  assert.match(source, /scheduleForMember\(state,date,currentMember\)/, 'schedule display remains available')
  assert.match(source, /invitationsForMember\(state,currentMember\)/, 'invitation display remains available')
  assert.doesNotMatch(source, /localStorage\.setItem|writeSharedJson|publishHouseholdScheduleEvents|createScheduleBlock|updateScheduleBlock|deleteScheduleBlock|createRoutine|updateRoutine|deleteRoutine|overrideRoutineOccurrence|respondToInvitation/)
})

test('Inventory remains searchable and routes item, quantity, and waste through review without Finance bridge writes', () => {
  const source = read('./HouseholdInventory.jsx')
  const app = read('../App.jsx')
  const estate = read('../estate/EstateWorkspace.jsx')

  assert.match(source, /HouseholdInventory\(\{currentMember,canEdit=true\}\)/)
  assert.match(source, /inventoryItemCreateOperation/)
  assert.match(source, /inventoryQuantityOperation/)
  assert.match(source, /inventoryWasteOperation/)
  assert.match(source, /requestHouseholdActionReview\(\{summary,operation\}\)/)
  assert.match(source, /<input value=\{search\} onChange=/, 'search remains available')
  assert.match(source, /<select value=\{location\} onChange=/, 'location filter remains available')
  assert.doesNotMatch(source, /writeSharedJson|publishHouseholdFinanceBridge|addInventoryItem|adjustInventoryQuantity|recordInventoryWaste|localStorage\.setItem/)
  assert.match(app, /<HouseholdMaintenance currentMember=\{currentMember\} canEdit=\{canEditPlanning\} isAdmin=\{auth\.role==='admin'\}/)
  assert.doesNotMatch(estate, /publishHouseholdFinanceBridge/)
})
