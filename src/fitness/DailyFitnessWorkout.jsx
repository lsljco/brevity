import { useMemo, useState } from 'react'
import { useDailyPlan } from '../household/useDailyPlan.js'
import { BODY_PARTS, EXERCISE_LIBRARY, weeklyScheduleForMember, workoutForDate } from './fitnessWorkoutPlan.js'
import MemberExerciseImage from './MemberExerciseImage.jsx'
import { generateWorkoutImages } from './fitnessImageApi.js'
import './DailyFitnessWorkout.css'

const dateLabel=date=>new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})

function ExerciseCard({exercise,index,compact=false,currentMember,imageRevision}){
  return <article className={compact?'fitness-library-card':'fitness-workout-card'}>
    {!compact&&<div className="fitness-exercise-number">{String(index+1).padStart(2,'0')}</div>}
    <MemberExerciseImage className="fitness-exercise-photo" member={currentMember} exercise={exercise} revision={imageRevision}/>
    <div className="fitness-exercise-copy"><span>{exercise.muscles.join(' · ')}</span><h3>{exercise.name}</h3><p>{exercise.cue}</p><div>{exercise.bodyParts.map(part=><small key={part}>{part}</small>)}</div></div>
    <dl><div><dt>Sets</dt><dd>{exercise.sets}</dd></div><div><dt>Reps / time</dt><dd>{exercise.reps}</dd></div><div><dt>Rest</dt><dd>{exercise.rest}</dd></div></dl>
  </article>
}

export default function DailyFitnessWorkout({currentMember='Larry'}){
  const {plan,state,error,reload}=useDailyPlan()
  const [view,setView]=useState('today'),[query,setQuery]=useState(''),[bodyPart,setBodyPart]=useState('All')
  const [imageState,setImageState]=useState('idle'),[imageProgress,setImageProgress]=useState(null),[imageError,setImageError]=useState(''),[imageRevision,setImageRevision]=useState('')
  const workout=useMemo(()=>workoutForDate(plan?.date,currentMember),[plan?.date,currentMember])
  const schedule=useMemo(()=>weeklyScheduleForMember(currentMember),[currentMember])
  const filteredExercises=useMemo(()=>EXERCISE_LIBRARY.filter(item=>(bodyPart==='All'||item.bodyParts.includes(bodyPart))&&`${item.name} ${item.muscles.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())),[bodyPart,query])
  const recordedWorkout=String(plan?.fitness?.workout||'').trim(),recordedRecovery=String(plan?.fitness?.recovery||'').trim()
  const location=String(plan?.fitness?.location||'').trim()||(new Date(`${plan?.date}T12:00:00`).getDay()===1?'Lifetime Buckhead':'Lifetime Perimeter')
  const profileLabel=workout.profile==='women'?'Lean athletic physique':workout.profile==='youth'?'Youth movement foundations':'V-taper + fat loss'
  const currentDay=new Date(`${plan?.date}T12:00:00`).toLocaleDateString('en-US',{weekday:'long'})
  const createWorkoutPhotos=async()=>{
    setImageState('loading');setImageError('');setImageProgress({completed:[],total:workout.exercises.length})
    try{
      await generateWorkoutImages(currentMember,workout.exercises.map(item=>item.id),setImageProgress)
      setImageRevision(Date.now().toString());setImageState('ready')
    }catch(problem){setImageError(problem.message||'Brevity could not create the workout photos.');setImageState('error')}
  }
  return <main className="daily-fitness">
    <header className="daily-fitness-hero"><div><span>Physical Fitness · {dateLabel(workout.date)}</span><h1>{workout.title}</h1><p>{workout.focus}</p></div><aside><span>{currentMember}</span><strong>{profileLabel}</strong><small>{location}</small></aside></header>

    {error&&<div className="daily-fitness-error" role="alert"><strong>Today’s plan could not be verified.</strong><span>{error}</span><button onClick={reload}>Retry</button></div>}
    {state==='loading'&&<div className="daily-fitness-loading"><i className="ti ti-loader-2"/> Verifying today’s household plan…</div>}

    <nav className="fitness-view-tabs" aria-label="Physical Fitness views">
      <button className={view==='today'?'active':''} onClick={()=>setView('today')}><i className="ti ti-barbell"/> Today’s Workout</button>
      <button className={view==='week'?'active':''} onClick={()=>setView('week')}><i className="ti ti-calendar-week"/> Weekly Schedule</button>
      <button className={view==='library'?'active':''} onClick={()=>setView('library')}><i className="ti ti-books"/> Exercise Library</button>
    </nav>

    {view==='today'&&<>
      <section className="daily-fitness-brief"><div><span>Today’s objective</span><strong>{workout.note}</strong></div><dl><div><dt>Duration</dt><dd>{workout.duration}</dd></div><div><dt>Training style</dt><dd>{workout.intensity}</dd></div><div><dt>Every day</dt><dd>Abs + {workout.stepGoal.toLocaleString()} steps</dd></div><div><dt>Weekly standard</dt><dd>{workout.weeklyWorkoutTarget} workouts</dd></div></dl></section>
      {(recordedWorkout||recordedRecovery)&&<section className="daily-fitness-recorded"><i className="ti ti-calendar-check"/><div><span>Morning Alignment record</span><strong>{recordedWorkout||recordedRecovery}</strong>{recordedWorkout&&recordedRecovery&&<small>Recovery: {recordedRecovery}</small>}</div></section>}
      <section className="daily-fitness-workout"><header><div><span>Perform in this order</span><h2>Today’s Workout</h2></div><div className="fitness-workout-photo-action"><p>Use a load that preserves the form cue through the final repetition. Stop any movement that causes sharp pain, dizziness, or unusual symptoms.</p><button type="button" onClick={createWorkoutPhotos} disabled={imageState==='loading'}><i className="ti ti-photo-spark"/> {imageState==='loading'?`Creating ${imageProgress?.completed?.length||0} of ${imageProgress?.total||workout.exercises.length}…`:`Create ${currentMember}’s Workout Photos`}</button>{imageState==='ready'&&<small role="status">Personalized photos are ready and saved for this member.</small>}{imageError&&<small className="fitness-image-error" role="alert">{imageError}</small>}</div></header><div className="fitness-exercise-list">{workout.exercises.map((item,index)=><ExerciseCard key={item.id} exercise={item} index={index} currentMember={currentMember} imageRevision={imageRevision}/>)}</div></section>
      <section className="daily-fitness-guidance"><article><i className="ti ti-target-arrow"/><div><span>Physique strategy</span><strong>{workout.profile==='women'?'Develop shoulders, back, glutes, legs and core while the nutrition plan steadily reduces body fat.':'Prioritize lats, side and rear delts, upper chest and abs while the nutrition plan steadily reduces body fat and waist measurement.'}</strong></div></article><article><i className="ti ti-trending-up"/><div><span>Progression</span><strong>When every set reaches the top of its repetition range with clean form, add the smallest available load next time.</strong></div></article><article><i className="ti ti-walk"/><div><span>Daily non-negotiables</span><strong>Train abs with the listed movement and complete 12,000 total steps, including recovery days.</strong></div></article></section>
    </>}

    {view==='week'&&<section className="fitness-week"><header><span>Household training rhythm</span><h2>Weekly Workout Schedule</h2><p>Five lifting days, daily abs, and a daily 12,000-step goal. Weekend sessions preserve movement while reducing fatigue.</p></header><div>{schedule.map(day=><article key={day.day} className={day.day===currentDay?'today':''}><div><span>{day.day}</span>{day.day===currentDay&&<small>Today</small>}<h3>{day.focus}</h3><p>{day.session.title}</p></div><strong>{day.daily}</strong><ul>{day.session.exercises.map(item=><li key={item.id}>{item.name}</li>)}</ul></article>)}</div></section>}

    {view==='library'&&<section className="fitness-library"><header><div><span>Movement reference</span><h2>Exercise Library</h2><p>Search the household’s exercise collection by movement or target muscle. Personalized photos appear after they are created from Today’s Workout.</p></div><label><i className="ti ti-search"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search exercises or muscles" aria-label="Search exercise library"/></label></header><div className="fitness-body-filters">{BODY_PARTS.map(part=><button key={part} className={bodyPart===part?'active':''} onClick={()=>setBodyPart(part)}>{part}</button>)}</div><p className="fitness-result-count">{filteredExercises.length} exercise{filteredExercises.length===1?'':'s'}</p><div className="fitness-library-grid">{filteredExercises.map(item=><ExerciseCard key={item.id} exercise={item} compact currentMember={currentMember} imageRevision={imageRevision}/>)}</div>{!filteredExercises.length&&<div className="fitness-empty">No exercises match this search and body-part filter.</div>}</section>}
  </main>
}
