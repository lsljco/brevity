const exercise=(id,name,bodyParts,sets,reps,rest,muscles,cue,image)=>Object.freeze({id,name,bodyParts:Object.freeze(bodyParts),sets,reps,rest,muscles:Object.freeze(muscles),cue,image:`/fitness/exercises/${image}.webp`})

export const EXERCISE_LIBRARY=Object.freeze([
  exercise('incline-press','Incline dumbbell press',['Chest','Shoulders','Triceps'],4,'8–12','90 sec',['Upper chest','Front delts','Triceps'],'Pin the shoulder blades down and back; lower with control.','incline-dumbbell-press'),
  exercise('cable-fly','Low-to-high cable fly',['Chest','Shoulders'],3,'12–15','60 sec',['Upper chest','Front delts'],'Sweep the handles up and inward without rolling the shoulders forward.','cable-fly'),
  exercise('push-up','Push-up',['Chest','Triceps','Abs'],3,'8–15','60 sec',['Chest','Triceps','Core'],'Keep one straight line from head to heels and lower the chest between the hands.','push-up'),
  exercise('lat-pulldown','Wide-neutral lat pulldown',['Back','Biceps'],4,'8–12','90 sec',['Lats','Upper back','Biceps'],'Drive elbows toward the hips without leaning backward.','lat-pulldown'),
  exercise('chest-row','Chest-supported row',['Back','Shoulders'],4,'8–12','90 sec',['Mid-back','Lats','Rear delts'],'Keep the chest supported; pause as the shoulder blades draw together.','chest-supported-row'),
  exercise('single-row','Single-arm cable row',['Back','Biceps'],3,'10–12 each','60 sec',['Lats','Mid-back','Biceps'],'Keep the torso quiet and pull the elbow toward the back pocket.','single-arm-row'),
  exercise('shoulder-press','Seated dumbbell shoulder press',['Shoulders','Triceps'],3,'8–12','75 sec',['Front delts','Side delts','Triceps'],'Keep ribs stacked over hips and press without shrugging.','shoulder-press'),
  exercise('lateral-raise','Dumbbell lateral raise',['Shoulders'],4,'12–18','45 sec',['Side delts'],'Lead with the elbows and stop around shoulder height.','lateral-raise'),
  exercise('reverse-fly','Chest-supported reverse fly',['Shoulders','Back'],3,'12–18','45 sec',['Rear delts','Upper back'],'Use a light load and open the arms without shrugging.','reverse-fly'),
  exercise('face-pull','Cable face pull',['Shoulders','Back'],3,'12–18','45 sec',['Rear delts','Upper back','Rotator cuff'],'Pull toward eye level and rotate the hands apart.','face-pull'),
  exercise('hammer-curl','Hammer curl',['Biceps','Forearms'],3,'10–15','60 sec',['Biceps','Brachialis','Forearms'],'Keep elbows still and wrists neutral; lower completely.','hammer-curl'),
  exercise('rope-triceps','Rope triceps pressdown',['Triceps'],3,'10–15','60 sec',['Triceps'],'Pin the elbows near the ribs and separate the rope at the bottom.','triceps-pressdown'),
  exercise('goblet-squat','Goblet squat',['Quadriceps','Glutes','Abs'],4,'8–12','90 sec',['Quadriceps','Glutes','Core'],'Brace, sit between the hips, and keep the whole foot planted.','goblet-squat'),
  exercise('romanian-deadlift','Romanian deadlift',['Hamstrings','Glutes','Back'],4,'8–12','90 sec',['Hamstrings','Glutes','Back extensors'],'Push the hips back with soft knees and keep the weights close.','romanian-deadlift'),
  exercise('reverse-lunge','Reverse lunge',['Quadriceps','Glutes'],3,'8–12 each','75 sec',['Glutes','Quadriceps','Adductors'],'Step back far enough to keep the front foot planted.','reverse-lunge'),
  exercise('hip-thrust','Barbell hip thrust',['Glutes','Hamstrings'],4,'8–12','90 sec',['Glutes','Hamstrings'],'Finish with glutes squeezed and ribs down—do not overarch.','hip-thrust'),
  exercise('leg-curl','Seated leg curl',['Hamstrings'],3,'10–15','60 sec',['Hamstrings'],'Anchor the hips, pause in the curl, and control the return.','leg-curl'),
  exercise('step-up','Dumbbell step-up',['Glutes','Quadriceps'],3,'8–12 each','75 sec',['Glutes','Quadriceps','Core'],'Plant the full working foot and avoid pushing off the floor.','step-up'),
  exercise('glute-kickback','Cable glute kickback',['Glutes'],3,'12–15 each','45 sec',['Glutes'],'Keep the pelvis square and stop before the lower back arches.','glute-kickback'),
  exercise('calf-raise','Standing calf raise',['Calves'],3,'12–20','45 sec',['Calves'],'Use a full stretch and pause at the top over the big toe.','calf-raise'),
  exercise('ab-wheel','Ab-wheel rollout',['Abs','Back'],3,'6–12','60 sec',['Deep core','Rectus abdominis','Lats'],'Roll only as far as the torso stays rigid and the low back does not sag.','ab-wheel'),
  exercise('hanging-raise','Hanging knee raise',['Abs'],3,'8–15','60 sec',['Lower abs','Deep core','Hip flexors'],'Tuck the pelvis first, then raise the knees without swinging.','hanging-knee-raise'),
  exercise('dead-bug','Dead bug',['Abs'],3,'6–10 each','45 sec',['Deep core','Rectus abdominis'],'Extend opposite limbs only while the low back stays gently pressed down.','dead-bug'),
  exercise('plank','Front plank',['Abs','Shoulders'],3,'20–40 sec','45 sec',['Deep core','Abs','Shoulders'],'Squeeze the glutes, pull the ribs down, and breathe behind the brace.','front-plank'),
  exercise('incline-walk','Incline treadmill walk',['Conditioning','Glutes','Calves'],1,'20–30 min','As needed',['Heart and lungs','Glutes','Calves'],'Use a pace that allows short sentences; stay tall and off the rails.','incline-walk'),
])

const BY_ID=Object.freeze(Object.fromEntries(EXERCISE_LIBRARY.map(item=>[item.id,item])))
export const BODY_PARTS=Object.freeze(['All','Chest','Back','Shoulders','Biceps','Triceps','Quadriceps','Hamstrings','Glutes','Calves','Abs','Conditioning'])
const session=(id,title,focus,duration,intensity,ids,note)=>Object.freeze({id,title,focus,duration,intensity,exercises:Object.freeze(ids.map(id=>BY_ID[id])),note})

const MEN=Object.freeze([
  session('men-chest-back-a','Chest + Back · V-Taper A','Upper chest, lat width, back thickness and abs','60–70 min','Hypertrophy · 1–2 reps in reserve',['incline-press','lat-pulldown','chest-row','cable-fly','single-row','ab-wheel'],'Build a wider upper frame while preserving a tight, braced waist.'),
  session('men-legs-a','Legs · Strength A','Quadriceps, hamstrings, glutes, calves and abs','55–65 min','Strength-hypertrophy',['goblet-squat','romanian-deadlift','reverse-lunge','leg-curl','calf-raise','dead-bug'],'Train the full lower body with controlled range and progressive loading.'),
  session('men-arms-shoulders','Arms + Shoulders','Shoulder width, biceps, triceps, rear delts and abs','55–65 min','V-taper hypertrophy',['shoulder-press','lateral-raise','hammer-curl','rope-triceps','face-pull','hanging-raise'],'Prioritize side and rear delts to increase shoulder-to-waist contrast.'),
  session('men-legs-b','Legs · Strength B','Glutes, hamstrings, unilateral legs, calves and abs','55–65 min','Posterior-chain hypertrophy',['hip-thrust','romanian-deadlift','step-up','leg-curl','calf-raise','plank'],'A second lower-body exposure builds balance, strength and work capacity.'),
  session('men-chest-back-b','Chest + Back · V-Taper B','Chest thickness, lats, upper back and abs','60–70 min','Hypertrophy · controlled volume',['chest-row','incline-press','lat-pulldown','push-up','reverse-fly','hanging-raise'],'Finish the training week with balanced pressing and pulling volume.'),
  session('men-recovery-sat','Active Recovery + Abs','Easy conditioning, trunk control and recovery','30–40 min','Conversational effort',['incline-walk','dead-bug','plank'],'Keep 12,000 steps and abs visible while allowing the trained muscles to recover.'),
  session('men-recovery-sun','Active Recovery + Abs','Walking, mobility and readiness','25–35 min','Recovery',['incline-walk','dead-bug'],'Move easily, complete the step goal, and arrive fresh for Monday.'),
])

const WOMEN=Object.freeze([
  session('women-chest-back-a','Chest + Back · Sculpt A','Upper chest, back definition, posture and abs','55–65 min','Lean-muscle hypertrophy',['incline-press','lat-pulldown','chest-row','cable-fly','single-row','dead-bug'],'Build balanced upper-body shape and posture with controlled repetitions.'),
  session('women-legs-a','Legs · Glute + Quad A','Glutes, quadriceps, hamstrings, calves and abs','60–70 min','Lower-body hypertrophy',['hip-thrust','goblet-squat','reverse-lunge','leg-curl','calf-raise','plank'],'Prioritize glute shape, strong legs and clean, athletic movement.'),
  session('women-arms-shoulders','Arms + Shoulders · Sculpt','Shoulder shape, arms, upper back and abs','50–60 min','Lean-muscle hypertrophy',['shoulder-press','lateral-raise','hammer-curl','rope-triceps','reverse-fly','hanging-raise'],'Develop defined shoulders and arms without sacrificing posture or mobility.'),
  session('women-legs-b','Legs · Glute + Hamstring B','Glutes, hamstrings, unilateral strength, calves and abs','60–70 min','Glute-focused hypertrophy',['romanian-deadlift','hip-thrust','step-up','glute-kickback','calf-raise','dead-bug'],'Use full, controlled hip extension and strong single-leg work.'),
  session('women-chest-back-b','Chest + Back · Sculpt B','Back definition, chest, rear delts and abs','55–65 min','Lean-muscle hypertrophy',['lat-pulldown','incline-press','chest-row','push-up','face-pull','plank'],'Close the week with balanced upper-body work and precise technique.'),
  session('women-recovery-sat','Active Recovery + Abs','Easy conditioning, core and recovery','30–40 min','Conversational effort',['incline-walk','dead-bug','plank'],'Keep 12,000 steps and abs visible while recovery remains the priority.'),
  session('women-recovery-sun','Active Recovery + Abs','Walking, mobility and readiness','25–35 min','Recovery',['incline-walk','dead-bug'],'Move easily, complete the step goal, and arrive fresh for Monday.'),
])

const YOUTH=Object.freeze(MEN.map((_,index)=>index<5
  ? session(`youth-${index}`,'Youth Strength + Movement','Technique, coordination, full-body strength and core','35–45 min','Adult-supervised technique',['goblet-squat','push-up','single-row','step-up','dead-bug'],'Isaiah follows an age-appropriate full-body plan—not an adult bodybuilding split.')
  : session(`youth-recovery-${index}`,'Youth Active Recovery','Normal play, walking and core control','25–35 min','Easy effort',['incline-walk','dead-bug'],'Walking or active play may replace the treadmill.')))

export const WEEKLY_WORKOUT_SCHEDULE=Object.freeze([
  {day:'Monday',focus:'Chest + Back',daily:'Abs · 12,000 steps'},
  {day:'Tuesday',focus:'Legs',daily:'Abs · 12,000 steps'},
  {day:'Wednesday',focus:'Arms + Shoulders',daily:'Abs · 12,000 steps'},
  {day:'Thursday',focus:'Legs',daily:'Abs · 12,000 steps'},
  {day:'Friday',focus:'Chest + Back',daily:'Abs · 12,000 steps'},
  {day:'Saturday',focus:'Active Recovery',daily:'Abs · 12,000 steps'},
  {day:'Sunday',focus:'Active Recovery',daily:'Abs · 12,000 steps'},
])

export const FITNESS_MEMBER_PROFILES=Object.freeze({Larry:'men',Lorenzo:'men',Javin:'men',Terica:'women',Nyla:'women',Isaiah:'youth'})
export function fitnessProfileForMember(member='Larry'){return FITNESS_MEMBER_PROFILES[member]||'men'}
export function weeklyScheduleForMember(member='Larry'){
  const profile=fitnessProfileForMember(member),schedule=profile==='women'?WOMEN:profile==='youth'?YOUTH:MEN
  return WEEKLY_WORKOUT_SCHEDULE.map((day,index)=>({...day,session:schedule[index]}))
}
export function workoutForDate(date,member='Larry'){
  const parsed=new Date(`${date}T12:00:00Z`),day=Number.isFinite(parsed.getTime())?parsed.getUTCDay():new Date().getDay(),profile=fitnessProfileForMember(member),schedule=profile==='women'?WOMEN:profile==='youth'?YOUTH:MEN
  return {...schedule[day===0?6:day-1],profile,date,member,stepGoal:12000,weeklyWorkoutTarget:5}
}
