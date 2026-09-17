import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fitnessProfileForMember, workoutForDate } from '../fitness/fitnessWorkoutPlan.js'

test('Physical Fitness assigns adult physique tracks and a separate youth-safe track', () => {
  assert.equal(fitnessProfileForMember('Larry'),'men')
  assert.equal(fitnessProfileForMember('Lorenzo'),'men')
  assert.equal(fitnessProfileForMember('Javin'),'men')
  assert.equal(fitnessProfileForMember('Terica'),'women')
  assert.equal(fitnessProfileForMember('Nyla'),'women')
  assert.equal(fitnessProfileForMember('Isaiah'),'youth')
})

test('Thursday serves an executable member-specific workout instead of a missing-analysis card', () => {
  const men=workoutForDate('2026-09-17','Larry')
  const women=workoutForDate('2026-09-17','Terica')
  const youth=workoutForDate('2026-09-17','Isaiah')
  assert.equal(men.title,'V-Taper Pull')
  assert.equal(women.title,'Back + Glute Sculpt')
  assert.equal(youth.title,'Youth Strength Foundations')
  for(const workout of [men,women,youth]){
    assert.equal(workout.stepGoal,12000)
    assert.equal(workout.weeklyWorkoutTarget,4)
    assert.ok(workout.exercises.length>=4)
    assert.ok(workout.exercises.every(item=>item.sets&&item.reps&&item.rest&&item.muscles.length&&item.cue&&item.visual))
  }
})

test('daily workout UI contains exercise illustrations, muscle targets, form cues and progression',async()=>{
  const source=await readFile(new URL('../fitness/DailyFitnessWorkout.jsx',import.meta.url),'utf8')
  assert.match(source,/fitness-exercise-visual/)
  assert.match(source,/targets \$\{muscleText\}/)
  assert.match(source,/Perform in this order/)
  assert.match(source,/Sets/)
  assert.match(source,/Reps \/ time/)
  assert.match(source,/Rest/)
  assert.match(source,/Progression/)
  assert.doesNotMatch(source,/What Matters Today/)
  assert.doesNotMatch(source,/Evidence & Provenance/)
})

