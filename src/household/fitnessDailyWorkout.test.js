import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { BODY_PARTS, EXERCISE_LIBRARY, fitnessProfileForMember, weeklyScheduleForMember, workoutForDate } from '../fitness/fitnessWorkoutPlan.js'

test('Physical Fitness assigns adult physique tracks and a separate youth-safe track', () => {
  assert.equal(fitnessProfileForMember('Larry'),'men')
  assert.equal(fitnessProfileForMember('Lorenzo'),'men')
  assert.equal(fitnessProfileForMember('Javin'),'men')
  assert.equal(fitnessProfileForMember('Terica'),'women')
  assert.equal(fitnessProfileForMember('Nyla'),'women')
  assert.equal(fitnessProfileForMember('Isaiah'),'youth')
})

test('Thursday follows the household leg schedule with daily abs and steps', () => {
  const men=workoutForDate('2026-09-17','Larry')
  const women=workoutForDate('2026-09-17','Terica')
  const youth=workoutForDate('2026-09-17','Isaiah')
  assert.match(men.title,/Legs/)
  assert.match(women.title,/Legs/)
  assert.equal(youth.title,'Youth Strength + Movement')
  for(const workout of [men,women,youth]){
    assert.equal(workout.stepGoal,12000)
    assert.equal(workout.weeklyWorkoutTarget,5)
    assert.ok(workout.exercises.length>=4)
    assert.ok(workout.exercises.some(item=>item.bodyParts.includes('Abs')))
    assert.ok(workout.exercises.every(item=>item.sets&&item.reps&&item.rest&&item.muscles.length&&item.cue&&item.image.endsWith('.webp')))
  }
})

test('weekly schedule matches the requested five-day household split',()=>{
  const schedule=weeklyScheduleForMember('Larry')
  assert.deepEqual(schedule.slice(0,5).map(day=>day.focus),['Chest + Back','Legs','Arms + Shoulders','Legs','Chest + Back'])
  assert.ok(schedule.every(day=>day.daily==='Abs · 12,000 steps'))
})

test('exercise library covers all major body parts with exercise-specific photography',()=>{
  assert.equal(EXERCISE_LIBRARY.length,25)
  for(const part of ['Chest','Back','Shoulders','Biceps','Triceps','Quadriceps','Hamstrings','Glutes','Calves','Abs','Conditioning']){
    assert.ok(BODY_PARTS.includes(part))
    assert.ok(EXERCISE_LIBRARY.some(item=>item.bodyParts.includes(part)),`${part} is covered`)
  }
  assert.equal(new Set(EXERCISE_LIBRARY.map(item=>item.image)).size,EXERCISE_LIBRARY.length)
})

test('daily workout UI contains photographs, schedule, searchable library and progression',async()=>{
  const source=await readFile(new URL('../fitness/DailyFitnessWorkout.jsx',import.meta.url),'utf8')
  assert.match(source,/fitness-exercise-photo/)
  assert.match(source,/Weekly Workout Schedule/)
  assert.match(source,/Exercise Library/)
  assert.match(source,/Search exercise library/)
  assert.match(source,/Perform in this order/)
  assert.match(source,/Sets/)
  assert.match(source,/Reps \/ time/)
  assert.match(source,/Rest/)
  assert.match(source,/Progression/)
  assert.match(source,/12,000 total steps/)
  assert.doesNotMatch(source,/What Matters Today/)
  assert.doesNotMatch(source,/Evidence & Provenance/)
  assert.doesNotMatch(source,/Create .*Workout Photos|Generate .*Workout Photos/)
})

test('every workout uses a permanent bundled family render',async()=>{
  const files=EXERCISE_LIBRARY.map(item=>item.image.replace('/fitness/exercises/','').replace(/\.webp$/,''))
  assert.equal(files.length,25)
  assert.ok(files.every(name=>name.startsWith('family-')))
  const assets=await Promise.all(files.map(name=>readFile(new URL(`../../public/fitness/exercises/${name}.webp`,import.meta.url))))
  for(const asset of assets){
    assert.equal(asset.subarray(0,4).toString(),'RIFF')
    assert.equal(asset.subarray(8,12).toString(),'WEBP')
    assert.ok(asset.length>60000,'family workout render should be a full photographic asset')
  }
  assert.equal(new Set(assets.map(asset=>asset.toString('base64'))).size,files.length)
})
