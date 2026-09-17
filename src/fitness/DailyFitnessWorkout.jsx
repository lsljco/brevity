import { useMemo } from 'react'
import { useDailyPlan } from '../household/useDailyPlan.js'
import { workoutForDate } from './fitnessWorkoutPlan.js'
import './DailyFitnessWorkout.css'

const POSES={
  press:{arms:'M32 54 L17 41 M48 54 L63 41',legs:'M35 82 L27 108 M45 82 L53 108',equipment:'M12 37 L22 45 M68 37 L58 45'},
  overhead:{arms:'M32 55 L23 27 M48 55 L57 27',legs:'M35 82 L30 108 M45 82 L50 108',equipment:'M17 23 H29 M51 23 H63'},
  lateral:{arms:'M32 55 L10 57 M48 55 L70 57',legs:'M35 82 L29 108 M45 82 L51 108',equipment:'M6 57 H13 M67 57 H74'},
  fly:{arms:'M32 55 L15 42 M48 55 L65 42',legs:'M35 82 L28 108 M45 82 L52 108',equipment:'M10 38 L17 45 M70 38 L63 45'},
  pulldown:{arms:'M32 55 L22 31 L14 20 M48 55 L58 31 L66 20',legs:'M35 82 L28 108 M45 82 L52 108',equipment:'M10 18 H70'},
  row:{arms:'M32 59 L19 64 M48 59 L61 64',legs:'M35 81 L25 102 M45 81 L55 102',equipment:'M14 64 H66'},
  'single-row':{arms:'M32 57 L18 67 M48 57 L59 52',legs:'M35 82 L24 103 M45 82 L57 103',equipment:'M12 69 L20 65'},
  'reverse-fly':{arms:'M32 58 L12 47 M48 58 L68 47',legs:'M35 82 L25 104 M45 82 L55 104',equipment:'M8 45 H15 M65 45 H72'},
  curl:{arms:'M32 55 L24 70 L18 58 M48 55 L56 70 L62 58',legs:'M35 82 L29 108 M45 82 L51 108',equipment:'M14 55 H21 M59 55 H66'},
  'knee-raise':{arms:'M32 50 L25 25 M48 50 L55 25',legs:'M36 80 L28 73 M44 80 L52 73',equipment:'M20 20 H60'},
  squat:{arms:'M33 56 L24 63 M47 56 L56 63',legs:'M35 80 L22 96 L30 108 M45 80 L58 96 L50 108',equipment:'M25 62 H55'},
  hinge:{arms:'M33 62 L25 82 M47 62 L55 82',legs:'M35 79 L28 106 M45 79 L52 106',equipment:'M20 84 H60'},
  lunge:{arms:'M33 55 L27 69 M47 55 L53 69',legs:'M35 81 L22 105 M45 81 L63 101',equipment:'M23 70 H31 M49 70 H57'},
  bridge:{arms:'M26 76 L15 85 M54 76 L65 85',legs:'M34 78 L23 96 M46 78 L57 96',equipment:'M26 72 H54'},
  'leg-curl':{arms:'M31 61 L19 70 M49 61 L61 70',legs:'M35 82 L26 91 L35 101 M45 82 L54 91 L45 101',equipment:'M20 104 H60'},
  calf:{arms:'M32 55 L25 69 M48 55 L55 69',legs:'M35 82 L31 106 M45 82 L49 106',equipment:'M27 110 H53'},
  kickback:{arms:'M32 58 L22 70 M48 58 L58 70',legs:'M35 81 L28 106 M45 81 L65 92',equipment:'M65 92 L73 92'},
  'step-up':{arms:'M32 55 L24 69 M48 55 L56 69',legs:'M35 82 L29 99 M45 82 L58 91',equipment:'M49 96 H70 V108 H43'},
  'dead-bug':{arms:'M32 60 L20 43 M48 60 L60 43',legs:'M35 79 L21 92 M45 79 L59 92',equipment:'M12 104 H68'},
  walk:{arms:'M32 56 L22 69 M48 56 L57 45',legs:'M35 82 L24 106 M45 82 L59 104',equipment:'M10 111 H70'},
  'face-pull':{arms:'M32 56 L23 45 L31 39 M48 56 L57 45 L49 39',legs:'M35 82 L29 108 M45 82 L51 108',equipment:'M31 39 H49'},
  pushup:{arms:'M29 65 L20 84 M51 65 L60 84',legs:'M36 78 L22 96 M44 78 L58 96',equipment:'M12 100 H68'},
  plank:{arms:'M30 68 L20 86 M50 68 L60 86',legs:'M36 79 L22 97 M44 79 L58 97',equipment:'M12 101 H68'},
  rollout:{arms:'M31 63 L19 82 M49 63 L61 82',legs:'M35 80 L28 104 M45 80 L52 104',equipment:'M56 87 A6 6 0 1 0 68 87 A6 6 0 1 0 56 87'},
  pressdown:{arms:'M32 55 L28 76 M48 55 L52 76',legs:'M35 82 L29 108 M45 82 L51 108',equipment:'M28 77 H52'},
}

function ExerciseIllustration({exercise}){
  const pose=POSES[exercise.visual]||POSES.press
  const muscleText=exercise.muscles.join(', ')
  return <svg className="fitness-exercise-visual" viewBox="0 0 80 120" role="img" aria-label={`${exercise.name} illustration; targets ${muscleText}`}>
    <title>{exercise.name}: {muscleText}</title>
    <circle cx="40" cy="20" r="9" className="fitness-figure-head"/>
    <path d="M40 29 L40 80" className="fitness-figure-body"/>
    <path d={pose.arms} className="fitness-figure-limb"/>
    <path d={pose.legs} className="fitness-figure-limb"/>
    <path d={pose.equipment} className="fitness-figure-equipment"/>
    <path d="M31 42 Q40 36 49 42 L47 63 Q40 68 33 63 Z" className="fitness-muscle-highlight"/>
  </svg>
}

const dateLabel=date=>new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})

export default function DailyFitnessWorkout({currentMember='Larry'}){
  const {plan,state,error,reload}=useDailyPlan()
  const workout=useMemo(()=>workoutForDate(plan?.date,currentMember),[plan?.date,currentMember])
  const recordedWorkout=String(plan?.fitness?.workout||'').trim()
  const recordedRecovery=String(plan?.fitness?.recovery||'').trim()
  const location=String(plan?.fitness?.location||'').trim() || (new Date(`${plan?.date}T12:00:00`).getDay()===1?'Lifetime Buckhead':'Lifetime Perimeter')
  const profileLabel=workout.profile==='women'?'Lean athletic physique':workout.profile==='youth'?'Youth movement foundations':'V-taper + fat loss'
  return <main className="daily-fitness">
    <header className="daily-fitness-hero">
      <div><span>Physical Fitness · {dateLabel(workout.date)}</span><h1>{workout.title}</h1><p>{workout.focus}</p></div>
      <aside><span>{currentMember}</span><strong>{profileLabel}</strong><small>{location}</small></aside>
    </header>

    {error&&<div className="daily-fitness-error" role="alert"><strong>Today’s plan could not be verified.</strong><span>{error}</span><button onClick={reload}>Retry</button></div>}
    {state==='loading'&&<div className="daily-fitness-loading"><i className="ti ti-loader-2"/> Verifying today’s household plan…</div>}

    <section className="daily-fitness-brief">
      <div><span>Today’s objective</span><strong>{workout.note}</strong></div>
      <dl><div><dt>Duration</dt><dd>{workout.duration}</dd></div><div><dt>Training style</dt><dd>{workout.intensity}</dd></div><div><dt>Daily movement</dt><dd>{workout.stepGoal.toLocaleString()} steps</dd></div><div><dt>Weekly standard</dt><dd>{workout.weeklyWorkoutTarget} workouts</dd></div></dl>
    </section>

    {(recordedWorkout||recordedRecovery)&&<section className="daily-fitness-recorded"><i className="ti ti-calendar-check"/><div><span>Morning Alignment record</span><strong>{recordedWorkout||recordedRecovery}</strong>{recordedWorkout&&recordedRecovery&&<small>Recovery: {recordedRecovery}</small>}</div></section>}

    <section className="daily-fitness-workout">
      <header><div><span>Perform in this order</span><h2>Today’s Workout</h2></div><p>Use a load that preserves the form cue through the final repetition. Stop any movement that causes sharp pain, dizziness, or unusual symptoms.</p></header>
      <div className="fitness-exercise-list">{workout.exercises.map((item,index)=><article key={item.id}>
        <div className="fitness-exercise-number">{String(index+1).padStart(2,'0')}</div>
        <ExerciseIllustration exercise={item}/>
        <div className="fitness-exercise-copy"><span>{item.muscles.join(' · ')}</span><h3>{item.name}</h3><p>{item.cue}</p><div>{item.muscles.map(muscle=><small key={muscle}>{muscle}</small>)}</div></div>
        <dl><div><dt>Sets</dt><dd>{item.sets}</dd></div><div><dt>Reps / time</dt><dd>{item.reps}</dd></div><div><dt>Rest</dt><dd>{item.rest}</dd></div></dl>
      </article>)}</div>
    </section>

    <section className="daily-fitness-guidance">
      <article><i className="ti ti-target-arrow"/><div><span>Physique strategy</span><strong>{workout.profile==='women'?'Develop shoulders, back, glutes, legs and core while the nutrition plan steadily reduces body fat.':'Prioritize lats, side and rear delts, upper chest and abs while the nutrition plan steadily reduces body fat and waist measurement.'}</strong></div></article>
      <article><i className="ti ti-trending-up"/><div><span>Progression</span><strong>When every set reaches the top of its repetition range with clean form, add the smallest available load next time.</strong></div></article>
      <article><i className="ti ti-heart-rate-monitor"/><div><span>Recovery check</span><strong>Record the completed session, working weights, repetitions, and any movement that needs modification before the next workout.</strong></div></article>
    </section>
  </main>
}

