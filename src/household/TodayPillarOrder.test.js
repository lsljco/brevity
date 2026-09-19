import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Today renders its primary content in the canonical seven-pillar order',async()=>{
  const source=await readFile(new URL('./TodayDashboard.jsx',import.meta.url),'utf8')
  const rendered=source.slice(source.lastIndexOf('return <div className="today-dashboard">'))
  const markers=['<TodayDevotionHero','<TodayMeals','<TodayFitnessWorkout','data-pillar="household"','pillar="education"','pillar="finance"','pillar="ministry"']
  const positions=markers.map(marker=>rendered.indexOf(marker))
  positions.forEach((position,index)=>assert.ok(position>=0,`missing ${markers[index]}`))
  for(let index=1;index<positions.length;index+=1)assert.ok(positions[index]>positions[index-1],`${markers[index]} should follow ${markers[index-1]}`)
  assert.match(source,/sermonDevotionImageUrl/)
  assert.match(source,/Pillar 1 · Spiritual Maturity/)
  assert.match(source,/Day \$\{devotion\.dayNumber\} of 7/)
})

test('Today Pillar 3 renders every exercise image from the shared dated member workout',async()=>{
  const source=await readFile(new URL('./TodayDashboard.jsx',import.meta.url),'utf8')
  assert.match(source,/import \{ workoutForDate \} from '\.\.\/fitness\/fitnessWorkoutPlan\.js'/)
  assert.match(source,/workoutForDate\(date, currentMember\)/)
  assert.match(source,/workout\.exercises\.map/)
  assert.match(source,/src=\{exercise\.image\}/)
  assert.match(source,/Open Full Workout/)
  assert.match(source,/Abs \+ \{workout\.stepGoal\.toLocaleString\(\)\} steps/)
})

test('Today Pillar 4 names calendar commitments and synchronized Household Operations chores explicitly',async()=>{
  const dashboard=await readFile(new URL('./TodayDashboard.jsx',import.meta.url),'utf8')
  const today=await readFile(new URL('./HouseholdToday.jsx',import.meta.url),'utf8')
  assert.match(dashboard,/Today’s Appointments &amp; Meetings/)
  assert.match(dashboard,/commitments\.map/)
  assert.doesNotMatch(dashboard,/commitments\.slice\(0, 4\)/)
  assert.match(dashboard,/Today’s Chores/)
  assert.match(dashboard,/Open Household Operations/)
  assert.match(today,/buildHouseholdMaintenanceWeek\(date, maintenance\)/)
  assert.match(today,/SHARED_STATE_EVENT/)
  assert.match(today,/householdChores=\{householdChores\}/)
})
