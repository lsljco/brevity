import { useEffect, useMemo, useRef, useState } from 'react'
import { calculateFluency, deriveMastery } from './masteryEngine.js'
import { generateAiReadingExercise, gradeAiExercise, gradeDirections, gradeReadingAudio, readDirectionsAloud } from './aiTutorApi.js'
import './IsaiahDailyTutor.css'
import './IsaiahDirections.css'

const FULTON_MATH_SOURCE='https://www.fultonschools.org/fs/resource-manager/view/65b41323-23cd-4ed4-bf43-ec9cea33de15'
const FULTON_MATH_MAP='https://www.fultonschools.org/fs/resource-manager/view/a2d88005-ff7b-4064-995b-d178d62f7e91'
const FULTON_ELA_SOURCE='https://www.fultonschools.org/fs/resource-manager/view/9643db3b-39d2-4a4e-974d-7a959c18a1f6'
const AI_STANDARD_CODES=['3.F.P.4.b','3.F.F.1.a','3.F.F.1.b','3.F.F.1.d','3-5.L.V.1','S3L1']
const AI_MASTERY_TARGETS=['multisyllabic decoding','high-frequency-word automaticity','oral reading fluency','vocabulary','comprehension and text evidence']
const AI_CURRICULUM='Fulton Grade 3 ELA Unit 2 — Figure It Out; Science — Habitats, Adaptations, and Environment. Foundational reading repair remains active while Isaiah accesses supported Grade 3 content.'

const activities=[
  {id:'reading',minutes:10,title:'Reading Repair',track:'Track A · Foundational Repair',objective:'Phonological awareness, decoding, high-frequency-word automaticity, and oral fluency.',why:'Isaiah’s August baseline identified foundational reading gaps. Brevity repairs them explicitly while preserving access to Grade 3 content.',standard:{subject:'ELA / Reading Intervention',code:'Prerequisite repair + 3.F.P.4 / 3.F.F.1',description:'Foundational remediation supporting Grade 3 phonics, decoding, sight-word automaticity, accuracy, fluency, and self-correction.',unit:'Fulton Grade 3 ELA · synchronized layer',pace:'Daily intervention',source:FULTON_ELA_SOURCE},prompt:'Blend /m/ /ă/ /p/ → map. Segment ship. Decode rabbit, sunset, napkin, magnet, picnic. Read could, would, should, because, their.',answer:'map; /sh/ /ĭ/ /p/; rabbit, sunset, napkin, magnet, picnic; could, would, should, because, their'},
  {id:'retrieval',minutes:5,title:'Math Retrieval',track:'Track A → Spaced Retrieval',objective:'Confirm retention of place value and skip-counting prerequisites.',why:'Place value was learned rapidly. Brevity checks retention briefly; confirmed mastery moves to spaced retrieval.',standard:{subject:'Mathematics',code:'3.NR.1 / 3.NR.1.1',description:'Use place-value reasoning with numbers to 10,000; read/write multi-digit numbers using numerals and expanded form.',unit:'Prior Grade 3 objective · retrieval',pace:'Spaced retrieval',source:FULTON_MATH_SOURCE},prompt:'Expand 6,304. Value of 8 in 8,517? Compare 4,906 and 4,960. Continue 6, 8, __, __, 14 and 15, 20, __, __, 35.',answer:'6,000 + 300 + 4; 8,000; <; 10, 12; 25, 30'},
  {id:'math',minutes:15,title:'Current Fulton Math',track:'Track B · Grade 3 On-Pace',objective:'Represent multiplication with equal groups, arrays, repeated addition, and notation.',why:'Fulton Grade 3 is in Unit 2, Exploring Multiplication. The sequence moves concrete → picture → repeated addition → notation → reasoning.',standard:{subject:'Mathematics',code:'3.PAR.3.2 + 3.PAR.3.6',description:'Represent single-digit multiplication/division using varied strategies; solve practical problems within 100 using visual representations and concrete models.',unit:'Unit 2 · Exploring Multiplication',pace:'Sept. 10–Oct. 22, 2026 · ON PACE',source:FULTON_MATH_SOURCE,map:FULTON_MATH_MAP},prompt:'Build 3 equal groups of 4 counters. Draw 3 rows of 4. Write repeated addition and multiplication. Then solve 4 plates with 3 crackers each.',answer:'4 + 4 + 4 = 12; 3 × 4 = 12. Word problem: 3 + 3 + 3 + 3 = 12; 4 × 3 = 12.'},
  {id:'ela',minutes:10,title:'ELA + Science',track:'Track B · Grade 3 Knowledge',objective:'Explain an animal adaptation using evidence with supported Grade 3 text exposure.',why:'Grade-level knowledge keeps advancing while decoding is repaired; the adult carries difficult decoding when necessary.',standard:{subject:'Science + ELA',code:'S3L1 + Grade 3 ELA',description:'Explain how animal features and behaviors support survival in habitats; integrate vocabulary and evidence-based comprehension.',unit:'Habitats, Adaptations & Environment',pace:'Aug. 31–Oct. 9, 2026 · ON PACE',source:'https://www.fultonschools.org/all-departments/academics/learning-teaching/curriculum/science/elementary-science-resources'},prompt:'Read/echo-read the squirrel adaptation passage. Define habitat, adaptation, survive, region. Explain two squirrel adaptations and cite evidence.',answer:'Examples: claws help climbing; tail helps balance; fur helps camouflage; burying nuts supports later food access.'},
  {id:'challenge',minutes:5,title:'Prove It',track:'Independent Mastery Check',objective:'Demonstrate transfer without coaching.',why:'Mastery is based on independent evidence. A strong first encounter remains YELLOW until demonstrated across varied questions on another encounter.',standard:{subject:'Cross-curricular',code:'Evidence encounter',description:'Independent evidence attaches to target standards and prerequisite skill records.',unit:'Daily mastery evidence',pace:'End of session',source:null},prompt:'Read rabbit, sunset, napkin, could, their. Draw 5 equal groups of 2 and write both equations. Explain one squirrel adaptation and its survival function.',answer:'2 + 2 + 2 + 2 + 2 = 10; 5 × 2 = 10; science answer includes feature + function.'},
]

const statusOptions=[['independent','Correct Independently'],['prompt','Correct With Prompt'],['incorrect','Incorrect'],['unable','Could Not Attempt']]
const assignmentDurations=[10,20,30,45]
const todayKey=()=>{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function Detail({activity,type}){
  const s=activity.standard
  if(type==='why')return <div className="edu-detail"><strong>Instructional rationale</strong><p>{activity.why}</p></div>
  return <div className="edu-detail"><div className="edu-standard-grid"><span>Subject</span><b>{s.subject}</b><span>Standard</span><b>{s.code}</b><span>Current unit</span><b>{s.unit}</b><span>Pacing</span><b>{s.pace}</b></div><p>{s.description}</p>{s.source&&<a href={s.source} target="_blank" rel="noreferrer">Official Fulton / Georgia standard source ↗</a>}{s.map&&<a href={s.map} target="_blank" rel="noreferrer">2026–27 Fulton curriculum map ↗</a>}</div>
}

const blobToBase64=blob=>new Promise((resolve,reject)=>{
  const reader=new FileReader()
  reader.onerror=()=>reject(reader.error||new Error('Could not read audio.'))
  reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'')
  reader.readAsDataURL(blob)
})

function AiPractice(){
  const[targetMinutes,setTargetMinutes]=useState(45)
  const[exercise,setExercise]=useState(null)
  const[exerciseState,setExerciseState]=useState('idle')
  const[exerciseError,setExerciseError]=useState('')
  const[answers,setAnswers]=useState({})
  const[grade,setGrade]=useState(null)
  const[gradeState,setGradeState]=useState('idle')
  const[directionSummary,setDirectionSummary]=useState('')
  const[directionResult,setDirectionResult]=useState(null)
  const[directionState,setDirectionState]=useState('idle')
  const[directionError,setDirectionError]=useState('')
  const[speechState,setSpeechState]=useState('idle')
  const[speechUsed,setSpeechUsed]=useState(false)
  const[readingResult,setReadingResult]=useState(null)
  const[recordingState,setRecordingState]=useState('idle')
  const[recordingError,setRecordingError]=useState('')
  const[secondsLeft,setSecondsLeft]=useState(60)
  const recorderRef=useRef(null),streamRef=useRef(null),chunksRef=useRef([]),startedAtRef=useRef(0),timerRef=useRef(null),speechAudioRef=useRef(null)
  const stopTracks=()=>{streamRef.current?.getTracks?.().forEach(track=>track.stop());streamRef.current=null}
  const directionsComplete=Boolean(directionResult&&Array.isArray(directionResult.missedPoints)&&directionResult.missedPoints.length===0)

  useEffect(()=>()=>{
    if(timerRef.current)clearInterval(timerRef.current)
    if(recorderRef.current)recorderRef.current.onstop=null
    try{if(recorderRef.current?.state==='recording')recorderRef.current.stop()}catch{}
    try{speechAudioRef.current?.pause?.()}catch{}
    stopTracks()
  },[])

  const createExercise=async continuation=>{
    setExerciseState('loading');setExerciseError('');setGrade(null);setAnswers({});setReadingResult(null);setDirectionSummary('');setDirectionResult(null);setDirectionError('');setDirectionState('idle');setSpeechState('idle');setSpeechUsed(false)
    try{speechAudioRef.current?.pause?.()}catch{}
    try{
      const data=await generateAiReadingExercise({instructionalDate:todayKey(),targetMinutes,standardCodes:AI_STANDARD_CODES,masteryTargets:AI_MASTERY_TARGETS,curriculum:AI_CURRICULUM,continuationContext:continuation?`${exercise?.title||''}: ${exercise?.intro||''}`:''})
      setExercise(data.exercise);setExerciseState('ready')
    }catch(error){setExerciseState('error');setExerciseError(error.message||'Could not create the reading exercise.')}
  }

  const checkDirections=async()=>{
    if(!exercise?.id)return
    setDirectionState('loading');setDirectionError('')
    try{
      const result=await gradeDirections({exerciseId:exercise.id,studentSummary:directionSummary,supportUsed:speechUsed})
      setDirectionResult(result);setDirectionState('ready')
    }catch(error){setDirectionState('error');setDirectionError(error.message||'Could not check the directions explanation.')}
  }

  const playDirections=async()=>{
    if(!exercise?.id)return
    setSpeechState('loading');setDirectionError('')
    try{
      const result=await readDirectionsAloud({exerciseId:exercise.id})
      const audio=new Audio(`data:${result.mimeType};base64,${result.audioBase64}`)
      speechAudioRef.current=audio;setSpeechUsed(true);setSpeechState('playing')
      audio.onended=()=>setSpeechState('idle')
      audio.onerror=()=>setSpeechState('error')
      await audio.play()
    }catch(error){setSpeechState('error');setDirectionError(error.message||'Brevity could not read the directions aloud.')}
  }

  const finishRecording=async recorder=>{
    if(timerRef.current){clearInterval(timerRef.current);timerRef.current=null}
    const elapsed=Math.max(1,Math.min(60,(Date.now()-startedAtRef.current)/1000))
    stopTracks();setRecordingState('grading')
    try{
      const blob=new Blob(chunksRef.current,{type:recorder.mimeType||'audio/webm'})
      const audioBase64=await blobToBase64(blob)
      const result=await gradeReadingAudio({referenceText:exercise.passage,audioBase64,mimeType:blob.type,elapsedSeconds:elapsed,exerciseId:exercise.id})
      setReadingResult(result);setRecordingState('idle')
    }catch(error){setRecordingError(error.message||'Could not grade this reading sample.');setRecordingState('idle')}
  }

  const startReadingProbe=async()=>{
    if(!exercise?.passage||!directionsComplete)return
    setRecordingError('');setReadingResult(null);setSecondsLeft(60)
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
      setRecordingError('Microphone recording is not available in this browser. Use Adult Guided Mode to enter fluency manually.')
      return
    }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream
      const candidates=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg']
      const mimeType=candidates.find(type=>MediaRecorder.isTypeSupported?.(type))||''
      const recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined)
      recorderRef.current=recorder;chunksRef.current=[]
      recorder.ondataavailable=event=>{if(event.data?.size)chunksRef.current.push(event.data)}
      recorder.onstop=()=>finishRecording(recorder)
      startedAtRef.current=Date.now();setRecordingState('recording');recorder.start(1000)
      timerRef.current=setInterval(()=>{
        const remaining=Math.max(0,60-Math.floor((Date.now()-startedAtRef.current)/1000));setSecondsLeft(remaining)
        if(remaining<=0&&recorder.state==='recording')recorder.stop()
      },250)
    }catch(error){stopTracks();setRecordingState('idle');setRecordingError(error?.name==='NotAllowedError'?'Microphone access was not allowed. You can still complete the lesson with Adult Guided scoring.':'Brevity could not start the microphone.')}
  }
  const stopReadingProbe=()=>{if(recorderRef.current?.state==='recording')recorderRef.current.stop()}
  const submitAnswers=async()=>{
    if(!exercise?.id||!directionsComplete)return
    setGradeState('loading')
    try{setGrade(await gradeAiExercise({exerciseId:exercise.id,answers}));setGradeState('ready')}
    catch(error){setGrade({error:error.message||'Could not grade comprehension.'});setGradeState('error')}
  }
  const itemGrade=id=>grade?.items?.find(item=>item.id===id)

  return <div className="edu-panel edu-ai-studio">
    <div className="edu-ai-heading"><div><p className="edu-kicker">ChatGPT-powered interactive practice</p><h2>Isaiah AI Reading Studio</h2><p>Brevity creates an original standards-aligned reading section, checks whether Isaiah understood the written directions, listens to a timed oral-reading sample, calculates fluency against the exact displayed text, and grades comprehension.</p></div><span className="edu-draft-evidence">Adult review controls mastery</span></div>
    <div className="edu-ai-controls"><label>Overall reading assignment<select value={targetMinutes} onChange={event=>setTargetMinutes(Number(event.target.value))}>{assignmentDurations.map(minutes=><option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label><button type="button" className="edu-ai-primary" disabled={exerciseState==='loading'} onClick={()=>createExercise(false)}>{exerciseState==='loading'?'Creating…':'Create AI reading exercise'}</button>{exercise&&<button type="button" disabled={exerciseState==='loading'} onClick={()=>createExercise(true)}>Create next reading section</button>}</div>
    <p className="edu-ai-note">A 45-minute assignment is delivered in manageable sections. Isaiah reads directions independently first; spoken directions are available as support. Oral-reading fluency uses a controlled 60-second probe rather than one 45-minute audio upload.</p>
    {exerciseError&&<div className="edu-ai-error" role="alert">{exerciseError}</div>}
    {exercise&&<>
      <section className="edu-directions-card"><div className="edu-directions-head"><div><p className="edu-kicker">Step 1 · Read for meaning</p><h3>Read the directions yourself</h3><p>Do not start the exercise yet. Read every direction, then tell Brevity what you are supposed to do.</p></div><button type="button" className="edu-directions-audio" disabled={speechState==='loading'||speechState==='playing'} onClick={playDirections}><i className="ti ti-volume" aria-hidden="true"/> {speechState==='loading'?'Preparing audio…':speechState==='playing'?'Reading directions…':'Read directions to me'}</button></div><blockquote>{exercise.directions}</blockquote><label className="edu-directions-summary">In your own words, what do you need to do?<textarea rows="4" value={directionSummary} onChange={event=>setDirectionSummary(event.target.value)} placeholder="Explain all of the steps before you begin…"/></label><button type="button" className="edu-ai-primary" disabled={directionState==='loading'} onClick={checkDirections}>{directionState==='loading'?'Checking directions…':'Check my understanding'}</button>{directionError&&<div className="edu-ai-error" role="alert">{directionError}</div>}{directionResult&&<div className={`edu-directions-result ${directionsComplete?'complete':'review'}`}><div><strong>{directionResult.score}% directions understood</strong><span>{directionResult.supportUsed?'Audio support used':'Read independently'}</span></div><p>{directionResult.feedback}</p>{directionResult.capturedPoints?.length>0&&<details><summary>What you captured</summary><ul>{directionResult.capturedPoints.map(point=><li key={point}>{point}</li>)}</ul></details>}{directionResult.missedPoints?.length>0&&<div className="edu-directions-missed"><strong>Review these directions and try again:</strong><ul>{directionResult.missedPoints.map(point=><li key={point}>{point}</li>)}</ul></div>}</div>}{!directionsComplete&&directionResult&&<p className="edu-directions-lock"><i className="ti ti-lock" aria-hidden="true"/> The exercise stays locked until all material directions are understood. Read them again, revise your explanation, and re-check.</p>}</section>
      {directionsComplete&&<><section className="edu-reading-card"><div className="edu-reading-title"><div><span>{exercise.sectionMinutes} min section</span><h3>{exercise.title}</h3><p>{exercise.intro}</p></div><a href={FULTON_ELA_SOURCE} target="_blank" rel="noreferrer">Fulton Grade 3 ELA standards ↗</a></div>
        <div className="edu-reading-passage" aria-label="Reading passage">{exercise.passage.split(/\n+/).filter(Boolean).map((paragraph,paragraphIndex)=><p key={paragraphIndex}>{paragraph}</p>)}</div>
        <div className="edu-vocabulary"><strong>Words to know</strong>{exercise.vocabulary.map(item=><span key={item.word}><b>{item.word}</b> — {item.meaning}</span>)}</div>
        <div className="edu-mic-panel"><div><strong>60-second oral reading probe</strong><p>Isaiah reads the passage aloud. Brevity transcribes the recording, then calculates WCPM and accuracy from the exact text above.</p></div>{recordingState==='recording'?<button type="button" className="edu-mic recording" onClick={stopReadingProbe}><i className="ti ti-player-stop" aria-hidden="true"/> Recording · {secondsLeft}s</button>:<button type="button" className="edu-mic" disabled={recordingState==='grading'} onClick={startReadingProbe}><i className="ti ti-microphone" aria-hidden="true"/> {recordingState==='grading'?'Grading reading…':'Start 60-second reading probe'}</button>}</div>
        {recordingError&&<div className="edu-ai-error" role="alert">{recordingError}</div>}
        {readingResult&&<div className="edu-reading-result"><div className="edu-ai-metrics"><div><span>WCPM</span><b>{readingResult.score.wcpm}</b></div><div><span>Accuracy</span><b>{readingResult.score.accuracy}%</b></div><div><span>Correct words</span><b>{readingResult.score.correctWords}/{readingResult.score.referenceWordsAssessed}</b></div><div><span>Word differences</span><b>{readingResult.score.errorCount}</b></div></div><details><summary>Review transcript and word differences</summary><p className="edu-transcript">{readingResult.transcript||'No transcript returned.'}</p><div className="edu-word-differences"><span>Substitutions: {readingResult.score.substitutions.length}</span><span>Omissions: {readingResult.score.omissions.length}</span><span>Insertions/repetitions: {readingResult.score.insertions.length}</span></div></details><p className="edu-review-note">{readingResult.note}</p></div>}
      </section>
      <section className="edu-questions"><div><p className="edu-kicker">Comprehension & vocabulary</p><h3>Show what you understood</h3></div>{exercise.questions.map((question,questionIndex)=>{const result=itemGrade(question.id);return <article className="edu-question" key={question.id}><strong>{questionIndex+1}. {question.prompt}</strong><small>{question.skill}</small>{question.type==='multiple_choice'?<div className="edu-answer-options">{question.choices.map(choice=><label key={choice}><input type="radio" name={question.id} checked={answers[question.id]===choice} onChange={()=>setAnswers(current=>({...current,[question.id]:choice}))}/><span>{choice}</span></label>)}</div>:<textarea rows="3" value={answers[question.id]||''} onChange={event=>setAnswers(current=>({...current,[question.id]:event.target.value}))} placeholder="Type your answer here…"/>}{result&&<div className={`edu-ai-feedback ${result.correct===true?'correct':result.correct===false?'needs-work':''}`}><b>{result.score==null?'Adult review needed':`${result.score}/${result.possible}`}</b><span>{result.feedback}</span>{result.evidence&&<small>{result.evidence}</small>}</div>}</article>})}<button type="button" className="edu-ai-primary" disabled={gradeState==='loading'} onClick={submitAnswers}>{gradeState==='loading'?'Grading…':'Grade my answers'}</button>{grade?.percent!=null&&<div className="edu-comprehension-score"><strong>{grade.percent}%</strong><span>{grade.earned} of {grade.possible} points · draft instructional evidence</span></div>}{grade?.error&&<div className="edu-ai-error">{grade.error}</div>}</section></>}
      <section className="edu-ai-provenance"><strong>Why this is aligned</strong><p>{AI_CURRICULUM}</p><div>{AI_STANDARD_CODES.map(code=><span key={code}>{code}</span>)}</div><small>Directions comprehension, oral-reading evidence, and content scoring remain separate. Generated exercise and AI scoring are instructional evidence only. Isaiah cannot directly change mastery status; an approved adult reviews the session before evidence becomes authoritative.</small></section>
    </>}
  </div>
}

export default function IsaiahDailyTutor({currentMember='Larry'}){
  const[tab,setTab]=useState('today'),[index,setIndex]=useState(0),[responses,setResponses]=useState({}),[detail,setDetail]=useState(null),[attempted,setAttempted]=useState(''),[errors,setErrors]=useState('')
  const fluency=useMemo(()=>calculateFluency(attempted,errors),[attempted,errors]),completed=Object.keys(responses).length,activity=activities[index]
  const masteryRows=activities.map(a=>{const r=responses[a.id];return{name:a.title,status:r?deriveMastery({independentCorrect:r==='independent'?1:0,total:1,encounters:1}):'—',evidence:r?statusOptions.find(x=>x[0]===r)?.[1]:'Not assessed'}})
  return <section className="edu-tutor"><header className="edu-hero"><div><p className="edu-kicker">Education Pillar · Isaiah · Grade 3</p><h1>Daily Tutor</h1><p>Two-track mastery tutoring · Adult: {currentMember}</p></div><div className="edu-pace"><span>Fulton Math</span><strong>Unit 2</strong><small>Exploring Multiplication · On Pace</small></div></header><nav className="edu-tabs">{[['today','Today’s Lesson'],['ai','AI Practice'],['mastery','Mastery Map'],['standards','Standards Sync']].map(([id,label])=><button type="button" key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {tab==='today'&&<><div className="edu-progress"><span>{completed}/5 activities assessed</span><div><i style={{width:`${completed/5*100}%`}}/></div><b>45 min</b></div><article className="edu-activity"><div className="edu-activity-head"><div><p>{activity.track}</p><h2>{activity.title} <span>{activity.minutes} min</span></h2><small>{activity.objective}</small></div><span>{index+1} / 5</span></div><div className="edu-explain"><button type="button" onClick={()=>setDetail(detail==='why'?null:'why')}>Why is Isaiah learning this?</button><button type="button" onClick={()=>setDetail(detail==='standards'?null:'standards')}>Fulton Grade 3 Standards</button></div>{detail&&<Detail activity={activity} type={detail}/>}<div className="edu-script"><label>Adult instruction</label><p>{activity.prompt}</p><details><summary>Answer / scoring guidance</summary><p>{activity.answer}</p></details></div>{activity.id==='reading'&&<div className="edu-fluency"><strong>Manual 60-second fluency entry</strong><label>Words attempted<input inputMode="numeric" value={attempted} onChange={e=>setAttempted(e.target.value)}/></label><label>Errors<input inputMode="numeric" value={errors} onChange={e=>setErrors(e.target.value)}/></label><div>WCPM <b>{fluency.wcpm}</b> · Accuracy <b>{fluency.accuracy}%</b></div></div>}<fieldset className="edu-score"><legend>Record Isaiah’s performance</legend>{statusOptions.map(([id,label])=><button type="button" key={id} className={responses[activity.id]===id?'selected':''} onClick={()=>setResponses(r=>({...r,[activity.id]:id}))}>{label}</button>)}</fieldset><div className="edu-nav"><button type="button" disabled={index===0} onClick={()=>{setIndex(i=>i-1);setDetail(null)}}>Previous</button><button type="button" disabled={index===4} onClick={()=>{setIndex(i=>i+1);setDetail(null)}}>Next Activity</button></div></article></>}
    {tab==='ai'&&<AiPractice/>}
    {tab==='mastery'&&<div className="edu-panel"><h2>Isaiah Mastery Map</h2><p>Strong first encounters stay YELLOW. GREEN requires independent mastery across varied questions on more than one encounter.</p><div className="edu-table">{masteryRows.map(row=><div key={row.name}><b>{row.name}</b><span>{row.status}</span><small>{row.evidence}</small></div>)}</div><div className="edu-baseline"><strong>August 2026 reading baseline</strong><span>ORF 34 WCPM · Decoding 12th %ile · Phonological awareness 15th · HFW 16th · Vocabulary 13th</span>{attempted&&<span>Manual probe: {fluency.wcpm} WCPM · {fluency.accuracy}% accuracy</span>}</div></div>}
    {tab==='standards'&&<div className="edu-panel"><h2>Fulton Grade 3 Standards Sync</h2><p>Grade-level standards and prerequisite mastery remain separate.</p>{activities.filter(a=>a.standard.source).map(a=><article className="edu-standard-card" key={a.id}><div><span>{a.standard.subject}</span><strong>{a.standard.code}</strong></div><h3>{a.standard.unit}</h3><p>{a.standard.description}</p><small>{a.standard.pace}</small><a href={a.standard.source} target="_blank" rel="noreferrer">Open official source ↗</a></article>)}</div>}
  </section>
}
