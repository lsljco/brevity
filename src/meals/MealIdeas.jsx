import {useEffect,useRef,useState} from 'react'
import VoiceIdea from '../enhancements/VoiceIdea.jsx'
import {startMealIdeas,fetchMealIdeas,saveMealIdea} from './mealPlanApi.js'
import {requestAssistantConversation} from '../assistant/actionEvents.js'
import './MealIdeas.css'
const storageKey=member=>`brevity-meal-ideas-v1:${member}`
export default function MealIdeas({currentMember,onSaved,canEditPlanning}){
 const [ingredients,setIngredients]=useState(''),[preferences,setPreferences]=useState(''),[maxMinutes,setMaxMinutes]=useState('0')
 const [jobId,setJobId]=useState(()=>{try{return sessionStorage.getItem(storageKey(currentMember))||''}catch{return ''}})
 const [job,setJob]=useState(null),[error,setError]=useState(''),[starting,setStarting]=useState(false),[saving,setSaving]=useState(''),[saved,setSaved]=useState({})
 const mounted=useRef(true),active=useRef(false)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 const busy=starting||Boolean(jobId&&!['ready','error'].includes(job?.state))
 useEffect(()=>{
  if(!jobId)return
  let cancelled=false,timer,attempts=0
  const poll=async()=>{
   try{
    const result=await fetchMealIdeas(jobId)
    if(cancelled)return
    setJob(result);setError(result.error||'')
    if(result.input){setIngredients(result.input.ingredients);setPreferences(result.input.preferences);setMaxMinutes(String(result.input.maxMinutes))}
    if(['ready','error'].includes(result.state))return
   }catch(cause){if(cancelled)return;setError(`Connection interrupted: ${cause.message}. Retrying…`)}
   if(++attempts>=225){setJob(current=>({...current,state:'ready'}));setError('This request is taking too long. Any recipes shown remain available. Return to Meal Ideas to check again.');return}
   timer=setTimeout(poll,4000)
  }
  poll()
  return()=>{cancelled=true;clearTimeout(timer)}
 },[jobId])
 async function discover(event){
  event.preventDefault();if(active.current||busy)return
  active.current=true;setStarting(true);setError('')
  const id=crypto.randomUUID()
  try{
   await startMealIdeas({ingredients,preferences,maxMinutes:Number(maxMinutes)},id)
   if(!mounted.current)return
   setJob(null);setSaved({});setJobId(id)
   try{sessionStorage.setItem(storageKey(currentMember),id)}catch{}
  }catch(cause){if(mounted.current)setError(cause.message)}finally{active.current=false;if(mounted.current)setStarting(false)}
 }
 async function save(idea){
  if(saving)return
  setSaving(idea.id);setError('')
  try{
   const result=await saveMealIdea(jobId,idea.id)
   if(mounted.current)setSaved(value=>({...value,[idea.id]:result.meal}))
   await onSaved(result.meal)
  }catch(cause){if(mounted.current)setError(cause.message)}finally{if(mounted.current)setSaving('')}
 }
 return <section className="meal-ideas" aria-label="Ingredient meal ideas">
  <header><p className="meal-ideas-eyebrow">FROM YOUR KITCHEN</p><h2>What can we make?</h2><p>Tell Brevity what you have. Explore six meals, from a great sandwich to a steakhouse-style dinner.</p></header>
  <form onSubmit={discover} className="meal-ideas-form">
   <label htmlFor="idea-ingredients">Ingredients you have</label>
   <textarea id="idea-ingredients" value={ingredients} maxLength={2000} required disabled={busy} onChange={event=>setIngredients(event.target.value)} placeholder="For example: chicken breast, spinach, potatoes and provolone. Include quantities if you know them."/>
   <div className="meal-ideas-voice"><VoiceIdea label="Speak your ingredients" disabled={busy} onError={setError} onText={text=>setIngredients(value=>[value,text].filter(Boolean).join('\n').slice(0,2000))}/></div>
   <div className="meal-ideas-inputs"><label>Time available<select value={maxMinutes} disabled={busy} onChange={event=>setMaxMinutes(event.target.value)}><option value="0">Any preparation time</option><option value="15">Up to 15 minutes</option><option value="30">Up to 30 minutes</option><option value="60">Up to 60 minutes</option></select></label><label>Any preferences? <span>(optional)</span><input value={preferences} disabled={busy} maxLength={1000} onChange={event=>setPreferences(event.target.value)} placeholder="Higher protein, fewer extras, no cheese…"/></label></div>
   <button type="submit" className="is-primary" disabled={busy||!ingredients.trim()}>{busy?'Preparing your options…':job?.ideas?.length?'Explore another six meals':'Show me meal ideas'}</button>
   <small>Uses your household food exclusions. Nothing is added to your library or calendar until you choose it.</small>
  </form>
  {error&&<p role="alert">{error}</p>}
  {busy&&<p role="status">{job?.ideas?.length?'Your recipes are ready. Brevity is creating their images; you can compare meals while the photos finish.':'Brevity is creating six recipes with measured ingredients and estimated macros. This can take a few minutes.'}</p>}
  {job?.ideas?.length>0&&<><p className="meal-ideas-estimates">Macros are estimates per person, including listed sides, sauces and cooking fats. Each recipe makes one serving. Photos are AI-generated serving suggestions.</p><div className="meal-ideas-grid">{job.ideas.map(idea=><article key={idea.id} className="meal-idea-card">
   {idea.image?<img src={idea.image} alt={`${idea.name} — generated serving suggestion`} loading="lazy"/>:<div className="meal-idea-image" role="img" aria-label={`${idea.name}: image ${idea.imageState==='error'?'unavailable':'being prepared'}`}><i className="ti ti-tools-kitchen-2" aria-hidden="true"/><span>{idea.imageState==='error'?'Photo unavailable · save to retry':'Preparing your meal photo…'}</span></div>}
   <div className="meal-idea-copy"><p className="meal-ideas-eyebrow">{idea.style} · {idea.totalMinutes} min</p><h3>{idea.name}</h3><p>{idea.description}</p><dl className="meal-idea-macros">{[['calories','cal'],['proteinGrams','g protein'],['carbohydrateGrams','g carbs'],['fatGrams','g fat']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{idea.macros[key]}</dd></div>)}</dl>
   <p><strong>Also needed:</strong> {idea.extras.length?idea.extras.join('; '):'No extra ingredients'}</p>
   <details><summary>Ingredients & preparation</summary><p>For one person · {idea.prepMinutes} min prep + {idea.cookMinutes} min cooking</p><ul>{idea.ingredients.map((line,i)=><li key={i}>{line}</li>)}</ul><ol>{idea.instructions.map((line,i)=><li key={i}>{line}</li>)}</ol>{idea.assumptions?.map((line,i)=><p key={i}><small>{line}</small></p>)}</details>
   {saved[idea.id]?<div role="status"><p>Saved to Meal Library.</p>{canEditPlanning&&<button onClick={()=>requestAssistantConversation(`Help me schedule the saved meal “${saved[idea.id].name}” (meal ID ${saved[idea.id].id}). Ask which date and meal slot, and how many people, then prepare the calendar change for review.`)}>Plan this meal with Brevity</button>}</div>:<button disabled={Boolean(saving)||(!idea.image&&idea.imageState!=='error'&&job.state!=='ready')} onClick={()=>save(idea)}>{saving===idea.id?'Saving…':'Save to Meal Library'}</button>}
   </div></article>)}</div></>}
 </section>
}
