const exercise = (id, name, sets, reps, rest, muscles, cue, visual) => Object.freeze({ id, name, sets, reps, rest, muscles:Object.freeze(muscles), cue, visual })

const EXERCISES = Object.freeze({
  inclinePress:exercise('incline-press','Incline dumbbell press',4,'8–12','90 sec',['Upper chest','Front shoulders','Triceps'],'Keep shoulder blades pulled down and back. Lower the dumbbells with control; stop one or two strong reps before form breaks.','press'),
  shoulderPress:exercise('shoulder-press','Seated dumbbell shoulder press',3,'8–12','75 sec',['Front delts','Side delts','Triceps'],'Keep ribs stacked over hips. Press up without shrugging or arching the lower back.','overhead'),
  lateralRaise:exercise('lateral-raise','Cable or dumbbell lateral raise',4,'12–18','45 sec',['Side delts'],'Lead with the elbows and stop around shoulder height. Use a controlled weight instead of swinging.','lateral'),
  cableFly:exercise('cable-fly','Low-to-high cable fly',3,'12–15','60 sec',['Upper chest','Front shoulders'],'Bring the handles up and inward while keeping a soft elbow bend. Squeeze the chest without rolling the shoulders forward.','fly'),
  triceps:exercise('rope-triceps','Rope triceps pressdown',3,'10–15','60 sec',['Triceps'],'Keep elbows pinned near the ribs. Separate the rope at the bottom without moving the shoulders.','pressdown'),
  abWheel:exercise('ab-wheel','Ab-wheel rollout',3,'6–12','60 sec',['Deep core','Rectus abdominis','Lats'],'Brace before moving. Roll only as far as the torso stays rigid and the lower back does not sag.','rollout'),
  latPulldown:exercise('lat-pulldown','Wide-neutral lat pulldown',4,'8–12','90 sec',['Lats','Upper back','Biceps'],'Drive elbows toward the hips. Keep the chest tall and avoid turning the movement into a backward lean.','pulldown'),
  chestRow:exercise('chest-row','Chest-supported row',4,'8–12','90 sec',['Mid-back','Lats','Rear delts'],'Keep the chest supported. Pull elbows back, pause briefly, and lower until the shoulder blades reach forward.','row'),
  singleRow:exercise('single-row','Single-arm cable row',3,'10–12 each','60 sec',['Lats','Mid-back','Biceps'],'Keep the torso quiet. Reach forward, then pull the elbow toward the back pocket.','single-row'),
  rearDelt:exercise('rear-delt','Reverse fly',3,'12–18','45 sec',['Rear delts','Upper back'],'Use a light load. Open the arms without shrugging and finish with the hands slightly behind the shoulders.','reverse-fly'),
  hammerCurl:exercise('hammer-curl','Hammer curl',3,'10–15','60 sec',['Biceps','Brachialis','Forearms'],'Keep elbows still and wrists neutral. Lower each repetition completely.','curl'),
  hangingRaise:exercise('hanging-raise','Hanging knee raise',3,'8–15','60 sec',['Lower abs','Deep core','Hip flexors'],'Start by tucking the pelvis, then raise the knees without swinging. Lower under control.','knee-raise'),
  gobletSquat:exercise('goblet-squat','Goblet squat',4,'8–12','90 sec',['Quadriceps','Glutes','Core'],'Brace, sit between the hips, and keep the whole foot planted. Use a depth you can control.','squat'),
  romanianDeadlift:exercise('romanian-deadlift','Romanian deadlift',4,'8–12','90 sec',['Hamstrings','Glutes','Back extensors'],'Push the hips back with soft knees. Keep the weights close and stop when the hamstrings limit the range.','hinge'),
  reverseLunge:exercise('reverse-lunge','Reverse lunge',3,'8–12 each','75 sec',['Glutes','Quadriceps','Adductors'],'Step back far enough to keep the front foot planted. Drive through the front leg to stand.','lunge'),
  hipThrust:exercise('hip-thrust','Hip thrust',4,'8–12','90 sec',['Glutes','Hamstrings'],'Finish by squeezing the glutes with ribs down. Do not gain height by overextending the lower back.','bridge'),
  legCurl:exercise('leg-curl','Seated or lying leg curl',3,'10–15','60 sec',['Hamstrings'],'Keep the hips anchored. Curl smoothly, pause, and control the return.','leg-curl'),
  calfRaise:exercise('calf-raise','Standing calf raise',3,'12–20','45 sec',['Calves'],'Use a full comfortable stretch, rise onto the big-toe side of the foot, and pause at the top.','calf'),
  cableKickback:exercise('cable-kickback','Cable glute kickback',3,'12–15 each','45 sec',['Glutes'],'Keep the pelvis square and move from the hip. Stop before the lower back begins to arch.','kickback'),
  stepUp:exercise('step-up','Dumbbell step-up',3,'8–12 each','75 sec',['Glutes','Quadriceps','Core'],'Place the full foot on the box. Let the working leg lift the body instead of pushing off the floor.','step-up'),
  deadBug:exercise('dead-bug','Dead bug',3,'6–10 each','45 sec',['Deep core','Rectus abdominis'],'Press the lower back gently into the floor. Extend opposite limbs only as far as you can maintain that position.','dead-bug'),
  inclineWalk:exercise('incline-walk','Incline treadmill walk',1,'20–30 min','As needed',['Heart and lungs','Glutes','Calves'],'Choose a pace that allows short sentences. Stay tall and avoid holding your body weight on the rails.','walk'),
  facePull:exercise('face-pull','Cable face pull',3,'12–18','45 sec',['Rear delts','Upper back','Rotator cuff'],'Pull toward eye level and rotate the hands apart. Keep the neck relaxed.','face-pull'),
  pushup:exercise('pushup','Push-up',3,'8–15','60 sec',['Chest','Triceps','Core'],'Keep the body in one line. Lower the chest between the hands and stop before the hips sag.','pushup'),
  plank:exercise('plank','Front plank',3,'20–40 sec','45 sec',['Deep core','Abs','Shoulders'],'Squeeze glutes, pull ribs down, and breathe behind the brace. End the set when the hips shift.','plank'),
})

const session = (id, title, focus, duration, intensity, exerciseIds, note) => Object.freeze({ id, title, focus, duration, intensity, exercises:Object.freeze(exerciseIds.map(id=>EXERCISES[id])), note })

const MEN = Object.freeze([
  session('men-push','V-Taper Push','Upper chest, shoulder width, triceps and abs','55–65 min','Hypertrophy · 1–2 reps in reserve',['inclinePress','shoulderPress','lateralRaise','cableFly','triceps','abWheel'],'Build the shoulder-to-waist contrast without using loads that distort form.'),
  session('men-lower','Lower Body + Waist Control','Leg strength, glutes, hamstrings and braced core','55–65 min','Strength-hypertrophy',['gobletSquat','romanianDeadlift','reverseLunge','legCurl','calfRaise','deadBug'],'Training legs supports total-body muscle and conditioning; direct core work emphasizes bracing rather than heavy side bending.'),
  session('men-recovery','Conditioning + Mobility','Fat-loss support, recovery and movement quality','35–45 min','Conversational conditioning',['inclineWalk','deadBug','facePull','plank'],'This is an intentional recovery session. Finish feeling better than you started.'),
  session('men-pull','V-Taper Pull','Lat width, upper-back thickness, rear delts, arms and abs','55–65 min','Hypertrophy · 1–2 reps in reserve',['latPulldown','chestRow','singleRow','rearDelt','hammerCurl','hangingRaise'],'Today’s width-and-thickness session is the primary V-taper builder.'),
  session('men-upper','Shoulders + Chest Detail','Shoulder caps, upper chest, posture and core','50–60 min','Moderate-load hypertrophy',['inclinePress','lateralRaise','facePull','pushup','triceps','plank'],'Keep rest honest and repetitions controlled. Quality volume matters more than chasing a maximum.'),
  session('men-conditioning','Conditioning + Core','Calorie expenditure, work capacity and waist control','35–45 min','Moderate conditioning',['inclineWalk','stepUp','deadBug','plank'],'Use steady effort and clean movement. Fat loss still depends primarily on the sustained nutrition plan.'),
  session('men-rest','Full Recovery','Walking, mobility and readiness for the next training week','20–35 min','Recovery',['inclineWalk','deadBug'],'Keep the 12,000-step goal, use an easy pace, and avoid turning recovery into another hard session.'),
])

const WOMEN = Object.freeze([
  session('women-upper','Upper-Body Sculpt','Shoulders, back, chest and core','50–60 min','Lean-muscle hypertrophy',['latPulldown','inclinePress','chestRow','lateralRaise','triceps','deadBug'],'Build an athletic upper body with controlled repetitions and balanced pulling and pressing.'),
  session('women-glutes','Glutes + Legs','Glute development, hamstrings and legs','55–65 min','Glute-focused hypertrophy',['hipThrust','romanianDeadlift','reverseLunge','legCurl','cableKickback','calfRaise'],'Prioritize full, controlled hip extension and strong single-leg work.'),
  session('women-recovery','Conditioning + Mobility','Fat-loss support, recovery and posture','35–45 min','Conversational conditioning',['inclineWalk','facePull','deadBug','plank'],'This lower-stress day supports consistency without adding unnecessary fatigue.'),
  session('women-back-glutes','Back + Glute Sculpt','Back definition, shoulder shape and glutes','55–65 min','Lean-muscle hypertrophy',['latPulldown','singleRow','rearDelt','stepUp','cableKickback','hangingRaise'],'A strong back, shoulders and glutes create an athletic silhouette while the nutrition plan drives fat loss.'),
  session('women-lower','Legs + Glutes','Quadriceps, glutes, hamstrings and calves','55–65 min','Strength-hypertrophy',['gobletSquat','hipThrust','reverseLunge','legCurl','calfRaise','deadBug'],'Use ranges of motion you can own and progress repetitions before adding load.'),
  session('women-conditioning','Full-Body Conditioning','Work capacity, glutes and core','35–45 min','Moderate conditioning',['inclineWalk','stepUp','pushup','plank'],'Move continuously without rushing technique. Finish energized, not depleted.'),
  session('women-rest','Full Recovery','Walking, mobility and readiness','20–35 min','Recovery',['inclineWalk','deadBug'],'Keep the 12,000-step goal at an easy pace and prepare for the next training week.'),
])

const YOUTH = Object.freeze([
  session('youth-full-a','Youth Strength Foundations','Movement skill, posture and age-appropriate strength','35–45 min','Technique first',['gobletSquat','pushup','singleRow','stepUp','deadBug'],'Use adult supervision and light resistance that allows perfect technique.'),
  session('youth-move','Youth Movement Day','Coordination, conditioning and core control','30–40 min','Playful moderate effort',['inclineWalk','reverseLunge','plank'],'Stop well before exhaustion and keep the session positive.'),
  session('youth-recovery','Youth Recovery','Easy movement and mobility','20–30 min','Recovery',['inclineWalk','deadBug'],'No bodybuilding or maximum-load work.'),
  session('youth-full-b','Youth Strength Foundations','Pulling, pushing, legs and trunk control','35–45 min','Technique first',['latPulldown','pushup','gobletSquat','stepUp','plank'],'Use adult supervision and equipment adjusted to fit the child.'),
  session('youth-move-2','Youth Movement Day','Balance, conditioning and coordination','30–40 min','Playful moderate effort',['inclineWalk','reverseLunge','deadBug'],'Keep every repetition smooth and pain-free.'),
  session('youth-active','Youth Active Recovery','Outdoor movement and mobility','30–45 min','Easy effort',['inclineWalk','plank'],'Walking or active play can replace the treadmill.'),
  session('youth-rest','Youth Rest Day','Rest and normal play','Normal activity','Recovery',['deadBug'],'No formal training is required today.'),
])

export const FITNESS_MEMBER_PROFILES = Object.freeze({ Larry:'men', Lorenzo:'men', Javin:'men', Terica:'women', Nyla:'women', Isaiah:'youth' })

export function fitnessProfileForMember(member='Larry') { return FITNESS_MEMBER_PROFILES[member] || 'men' }

export function workoutForDate(date,member='Larry') {
  const parsed=new Date(`${date}T12:00:00Z`)
  const day=Number.isFinite(parsed.getTime())?parsed.getUTCDay():new Date().getDay()
  const profile=fitnessProfileForMember(member)
  const schedule=profile==='women'?WOMEN:profile==='youth'?YOUTH:MEN
  return { ...schedule[day===0?6:day-1], profile, date, member, stepGoal:12000, weeklyWorkoutTarget:4 }
}

