import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { BODY_PARTS, EXERCISE_LIBRARY, fitnessProfileForMember, suggestWorkoutFromGoal, weeklyScheduleForMember, workoutForDate } from '../fitness/fitnessWorkoutPlan.js'

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
  assert.ok(EXERCISE_LIBRARY.length>=100)
  for(const part of ['Chest','Back','Shoulders','Biceps','Triceps','Quadriceps','Hamstrings','Glutes','Calves','Abs','Conditioning']){
    assert.ok(BODY_PARTS.includes(part))
    assert.ok(EXERCISE_LIBRARY.filter(item=>item.bodyParts.includes(part)).length>=15,`${part} has at least 15 movements`)
  }
  for(const equipment of ['Bodyweight','Cable','Dumbbell','Machine'])assert.ok(EXERCISE_LIBRARY.some(item=>item.equipment===equipment),`${equipment} movements are available`)
})

test('daily workout UI contains photographs, schedule, searchable library and progression',async()=>{
  const source=await readFile(new URL('../fitness/DailyFitnessWorkout.jsx',import.meta.url),'utf8')
  const viewer=await readFile(new URL('../fitness/ExerciseImageViewer.jsx',import.meta.url),'utf8')
  const fitnessCss=await readFile(new URL('../fitness/DailyFitnessWorkout.css',import.meta.url),'utf8')
  const todayCss=await readFile(new URL('./TodayDashboard.css',import.meta.url),'utf8')
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
  assert.match(fitnessCss,/\.fitness-library-card \.fitness-exercise-photo[\s\S]*object-fit:contain/)
  assert.match(fitnessCss,/@media\(max-width:700px\)[\s\S]*\.fitness-workout-card \.fitness-exercise-photo[\s\S]*aspect-ratio:4\/3/)
  assert.match(todayCss,/\.today-fitness-exercise-image img\{object-fit:contain/)
  assert.match(source,/ExerciseImageViewer/)
  assert.match(viewer,/role="dialog"/)
  assert.match(viewer,/Enlarge .* exercise image/)
  assert.match(viewer,/event\.key === 'Escape'/)
})

test('every library movement uses a permanent versioned exercise render',async()=>{
  const files=EXERCISE_LIBRARY.map(item=>item.image.replace('/fitness/exercises/','').replace(/\.webp$/,''))
  assert.equal(files.length,EXERCISE_LIBRARY.length)
  assert.ok(files.every(name=>/^exercise-[a-z0-9-]+-r[1-9]\d*$/.test(name)))
  const unique=[...new Set(files)],assets=await Promise.all(unique.map(name=>readFile(new URL(`../../public/fitness/exercises/${name}.webp`,import.meta.url))))
  for(const asset of assets){
    assert.equal(asset.subarray(0,4).toString(),'RIFF')
    assert.equal(asset.subarray(8,12).toString(),'WEBP')
    assert.ok(asset.length>60000,'workout render should be a full photographic asset')
  }
  assert.equal(new Set(assets.map(asset=>asset.toString('base64'))).size,unique.length)
})

test('goal builder targets named muscles and keeps daily abs',()=>{
  const suggestion=suggestWorkoutFromGoal('Build wider shoulders and lats with upper chest emphasis','Larry')
  assert.ok(suggestion.exerciseIds.includes('lateral-raise'))
  assert.ok(suggestion.exerciseIds.includes('lat-pulldown'))
  assert.ok(suggestion.exerciseIds.includes('incline-press'))
  assert.ok(suggestion.exerciseIds.includes('ab-wheel'))
})

test('reviewed custom workout and generated images override only the dated workout',()=>{
  const generated='/.netlify/functions/fitness-images?id=incline-press-larry-3b1d88c2-25c0-4e49-93b3-f0bf8b20df82'
  const workout=workoutForDate('2026-09-21','Larry',{goal:'Upper chest',workout:'Upper Chest Target',objective:'Target upper chest',exerciseIds:['incline-press','cable-fly'],exerciseImages:[`incline-press|${generated}`]})
  assert.equal(workout.title,'Upper Chest Target')
  assert.deepEqual(workout.exercises.map(item=>item.id),['incline-press','cable-fly'])
  assert.equal(workout.exercises[0].image,generated)
})
