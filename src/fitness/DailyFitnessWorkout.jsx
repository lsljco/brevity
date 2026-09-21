import { useMemo, useState } from 'react'
import { useDailyPlan } from '../household/useDailyPlan.js'
import { BODY_PARTS, EQUIPMENT_TYPES, EXERCISE_BY_ID, EXERCISE_LIBRARY, suggestWorkoutFromGoal, weeklyScheduleForMember, workoutForDate } from './fitnessWorkoutPlan.js'
import { prepareDirectAction } from '../assistant/assistantApi.js'
import { requestActionReview } from '../assistant/actionEvents.js'
import ExerciseImageViewer, { ExerciseImageThumbnail } from './ExerciseImageViewer.jsx'
import './DailyFitnessWorkout.css'

const dateLabel=date=>new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})

function ExerciseCard({exercise,index,compact=false}){
  return <article className={compact?'fitness-library-card':'fitness-workout-card'}>
    {!compact&&<div className="fitness-exercise-number">{String(index+1).padStart(2,'0')}</div>}
    <ExerciseImageViewer exercise={exercise} className="fitness-exercise-image-button" imageClassName="fitness-exercise-photo" />
    <div className="fitness-exercise-copy"><span>{exercise.muscles.join(' · ')}</span><h3>{exercise.name}</h3><p>{exercise.cue}</p><div><small>{exercise.equipment}</small>{exercise.bodyParts.map(part=><small key={part}>{part}</small>)}</div></div>
    <dl><div><dt>Sets</dt><dd>{exercise.sets}</dd></div><div><dt>Reps / time</dt><dd>{exercise.reps}</dd></div><div><dt>Rest</dt><dd>{exercise.rest}</dd></div></dl>
  </article>
}

export default function DailyFitnessWorkout({currentMember='Larry'}){
  const {plan,state,error,reload}=useDailyPlan()
  const [view,setView]=useState('today'),[query,setQuery]=useState(''),[bodyPart,setBodyPart]=useState('All'),[equipment,setEquipment]=useState('All')
  const [goal,setGoal]=useState(''),[draft,setDraft]=useState(null),[builderState,setBuilderState]=useState('idle'),[builderError,setBuilderError]=useState('')
  const [imageMember,setImageMember]=useState(currentMember)
  const workout=useMemo(()=>workoutForDate(plan?.date,currentMember,plan?.fitness),[plan?.date,currentMember,plan?.fitness])
  const schedule=useMemo(()=>weeklyScheduleForMember(currentMember),[currentMember])
  const filteredExercises=useMemo(()=>EXERCISE_LIBRARY.filter(item=>(bodyPart==='All'||item.bodyParts.includes(bodyPart))&&(equipment==='All'||item.equipment===equipment)&&`${item.name} ${item.muscles.join(' ')} ${item.equipment}`.toLowerCase().includes(query.trim().toLowerCase())),[bodyPart,equipment,query])
  const recordedWorkout=String(plan?.fitness?.workout||'').trim(),recordedRecovery=String(plan?.fitness?.recovery||'').trim()
  const location=String(plan?.fitness?.location||'').trim()||(new Date(`${plan?.date}T12:00:00`).getDay()===1?'Lifetime Buckhead':'Lifetime Perimeter')
  const profileLabel=workout.profile==='women'?'Lean athletic physique':workout.profile==='youth'?'Youth movement foundations':'V-taper + fat loss'
  const currentDay=new Date(`${plan?.date}T12:00:00`).toLocaleDateString('en-US',{weekday:'long'})
  const buildWorkout=()=>{try{setDraft(suggestWorkoutFromGoal(goal,currentMember));setImageMember(currentMember);setBuilderError('')}catch(reason){setBuilderError(reason.message)}}
  const replaceExercise=(index,id)=>setDraft(current=>({...current,exerciseIds:current.exerciseIds.map((item,itemIndex)=>itemIndex===index?id:item),exercises:current.exercises.map((item,itemIndex)=>itemIndex===index?EXERCISE_BY_ID[id]:item)}))
  const generateImage=async index=>{
    const exercise=draft.exercises[index];setBuilderState(`image-${index}`);setBuilderError('')
    try{const jobId=globalThis.crypto?.randomUUID?.()||`fitness-image-${Date.now()}-${Math.random().toString(36).slice(2)}`,response=await fetch('/.netlify/functions/fitness-image-generate',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({jobId,exerciseId:exercise.id,member:imageMember})}),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||'Brevity could not start this exercise image.');const deadline=Date.now()+180000;let job=null;while(Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,2000));const statusResponse=await fetch(`/.netlify/functions/fitness-image-job-status?jobId=${encodeURIComponent(jobId)}`,{credentials:'include'}),statusPayload=await statusResponse.json().catch(()=>({}));if(!statusResponse.ok)throw new Error(statusPayload.error||'Brevity could not check this exercise image.');if(statusPayload.state==='ready'){job=statusPayload;break}if(statusPayload.state==='error')throw new Error(statusPayload.error||'Brevity could not generate this exercise image.')}if(!job)throw new Error('The exercise image is still rendering. Try again shortly.');setDraft(current=>current?({...current,exercises:current.exercises.map((item,itemIndex)=>itemIndex===index&&item.id===exercise.id?{...item,image:job.image}:item)}):current)}catch(reason){setBuilderError(reason.message)}finally{setBuilderState('idle')}
  }
  const reviewWorkout=async()=>{
    setBuilderState('review');setBuilderError('')
    try{const exerciseImages=draft.exercises.filter(item=>item.image!==EXERCISE_BY_ID[item.id].image).map(item=>`${item.id}|${item.image}`);const {proposal}=await prepareDirectAction({summary:`Set ${currentMember}'s ${draft.title} for ${plan.date}`,expectedVersion:Number(plan.version||0),operation:{type:'plan.pillar.update',targetId:'fitness',targetDate:plan.date,description:`Replace today's workout with ${draft.title}`,payload:{pillar:'fitness',patch:{goal:draft.goal,workout:draft.title,objective:draft.objective,exerciseIds:draft.exerciseIds,exerciseImages}}}});requestActionReview(proposal)}catch(reason){setBuilderError(reason.message)}finally{setBuilderState('idle')}
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
      <section className="fitness-goal-builder"><header><div><span>Goal-driven workout builder</span><h2>Tell Brevity what you want to target</h2><p>Describe the muscles, physique result, or training emphasis. Brevity will prepare a workout you can refine before Action Mode review.</p></div></header><div className="fitness-goal-entry"><label><span>Today’s goal</span><textarea value={goal} onChange={event=>setGoal(event.target.value)} placeholder="Example: Build wider shoulders and lats, emphasize upper chest, and finish with abs."/></label><button type="button" onClick={buildWorkout}><i className="ti ti-sparkles"/> Build Workout</button></div>{builderError&&<p className="fitness-builder-error" role="alert">{builderError}</p>}{draft&&<div className="fitness-goal-draft"><div className="fitness-goal-draft-heading"><div><span>Proposed for {currentMember}</span><h3>{draft.title}</h3><p>{draft.objective}</p></div><label><span>Use in generated images</span><select value={imageMember} onChange={event=>setImageMember(event.target.value)}>{['Larry','Lorenzo','Terica','Nyla','Javin','Isaiah'].map(member=><option key={member}>{member}</option>)}</select></label></div><div className="fitness-goal-exercises">{draft.exercises.map((exercise,index)=><article key={`${index}-${exercise.id}`}><ExerciseImageThumbnail exercise={exercise}/><div><strong>{index+1}. {exercise.name}</strong><small>{exercise.muscles.join(' · ')}</small><select aria-label={`Replace ${exercise.name}`} value={exercise.id} onChange={event=>replaceExercise(index,event.target.value)}>{EXERCISE_LIBRARY.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></div><button type="button" disabled={builderState===`image-${index}`} onClick={()=>generateImage(index)}>{builderState===`image-${index}`?'Rendering…':'Render Family Image'}</button></article>)}</div><div className="fitness-goal-actions"><button type="button" className="secondary" onClick={()=>setDraft(null)}>Discard</button><button type="button" disabled={builderState==='review'} onClick={reviewWorkout}><i className="ti ti-shield-check"/> Review &amp; Replace Today’s Workout</button></div></div>}</section>
      <section className="daily-fitness-brief"><div><span>Today’s objective</span><strong>{workout.note}</strong></div><dl><div><dt>Duration</dt><dd>{workout.duration}</dd></div><div><dt>Training style</dt><dd>{workout.intensity}</dd></div><div><dt>Every day</dt><dd>Abs + {workout.stepGoal.toLocaleString()} steps</dd></div><div><dt>Weekly standard</dt><dd>{workout.weeklyWorkoutTarget} workouts</dd></div></dl></section>
      {(recordedWorkout||recordedRecovery)&&<section className="daily-fitness-recorded"><i className="ti ti-calendar-check"/><div><span>Morning Alignment record</span><strong>{recordedWorkout||recordedRecovery}</strong>{recordedWorkout&&recordedRecovery&&<small>Recovery: {recordedRecovery}</small>}</div></section>}
      <section className="daily-fitness-workout"><header><div><span>Perform in this order</span><h2>Today’s Workout</h2></div><p>Use a load that preserves the form cue through the final repetition. Stop any movement that causes sharp pain, dizziness, or unusual symptoms.</p></header><div className="fitness-exercise-list">{workout.exercises.map((item,index)=><ExerciseCard key={item.id} exercise={item} index={index}/>)}</div></section>
      <section className="daily-fitness-guidance"><article><i className="ti ti-target-arrow"/><div><span>Physique strategy</span><strong>{workout.profile==='women'?'Develop shoulders, back, glutes, legs and core while the nutrition plan steadily reduces body fat.':'Prioritize lats, side and rear delts, upper chest and abs while the nutrition plan steadily reduces body fat and waist measurement.'}</strong></div></article><article><i className="ti ti-trending-up"/><div><span>Progression</span><strong>When every set reaches the top of its repetition range with clean form, add the smallest available load next time.</strong></div></article><article><i className="ti ti-walk"/><div><span>Daily non-negotiables</span><strong>Train abs with the listed movement and complete 12,000 total steps, including recovery days.</strong></div></article></section>
    </>}

    {view==='week'&&<section className="fitness-week"><header><span>Household training rhythm</span><h2>Weekly Workout Schedule</h2><p>Five lifting days, daily abs, and a daily 12,000-step goal. Weekend sessions preserve movement while reducing fatigue.</p></header><div>{schedule.map(day=><article key={day.day} className={day.day===currentDay?'today':''}><div><span>{day.day}</span>{day.day===currentDay&&<small>Today</small>}<h3>{day.focus}</h3><p>{day.session.title}</p></div><strong>{day.daily}</strong><ul>{day.session.exercises.map(item=><li key={item.id}>{item.name}</li>)}</ul></article>)}</div></section>}

    {view==='library'&&<section className="fitness-library"><header><div><span>Movement reference</span><h2>Exercise Library</h2><p>Search more than 100 movements by target muscle and equipment.</p></div><div className="fitness-library-controls"><label><i className="ti ti-search"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search exercises or muscles" aria-label="Search exercise library"/></label><label><i className="ti ti-barbell"/><select value={equipment} onChange={event=>setEquipment(event.target.value)} aria-label="Filter exercise equipment">{EQUIPMENT_TYPES.map(type=><option key={type}>{type}</option>)}</select></label></div></header><div className="fitness-body-filters">{BODY_PARTS.map(part=><button key={part} className={bodyPart===part?'active':''} onClick={()=>setBodyPart(part)}>{part}</button>)}</div><p className="fitness-result-count">{filteredExercises.length} exercise{filteredExercises.length===1?'':'s'}</p><div className="fitness-library-grid">{filteredExercises.map(item=><ExerciseCard key={item.id} exercise={item} compact/>)}</div>{!filteredExercises.length&&<div className="fitness-empty">No exercises match this search, body-part, and equipment filter.</div>}</section>}
  </main>
}
