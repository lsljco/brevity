import {canonicalExerciseImage} from './exerciseImageManifest.js'

const inferEquipment=name=>/cable|pallof|rope pressdown/i.test(name)?'Cable':/dumbbell|arnold|goblet/i.test(name)?'Dumbbell':/machine|pec deck|leg press|hack squat|leg curl|leg extension|assisted|captain/i.test(name)?'Machine':/push-up|pushup|pull-up|pullup|chin-up|chinup|plank|crunch|dip|burpee|mountain climber|wall sit|nordic|pogo/i.test(name)?'Bodyweight':/barbell|deadlift|good morning|front squat|skull crusher|landmine/i.test(name)?'Barbell':'Other'
const exercise=(id,name,bodyParts,sets,reps,rest,muscles,cue,_legacyImage,equipment=inferEquipment(name))=>Object.freeze({id,name,bodyParts:Object.freeze(bodyParts),sets,reps,rest,muscles:Object.freeze(muscles),cue,image:canonicalExerciseImage(id),equipment})

export const EXERCISE_LIBRARY=Object.freeze([
  exercise('incline-press','Incline dumbbell press',['Chest','Shoulders','Triceps'],4,'8–12','90 sec',['Upper chest','Front delts','Triceps'],'Pin the shoulder blades down and back; lower with control.','family-lorenzo-incline-press-v1'),
  exercise('cable-fly','Low-to-high cable fly',['Chest','Shoulders'],3,'12–15','60 sec',['Upper chest','Front delts'],'Sweep the handles up and inward without rolling the shoulders forward.','family-terica-cable-fly-v1'),
  exercise('push-up','Push-up',['Chest','Triceps','Abs'],3,'8–15','60 sec',['Chest','Triceps','Core'],'Keep one straight line from head to heels and lower the chest between the hands.','family-larry-push-up-v1'),
  exercise('lat-pulldown','Wide-neutral lat pulldown',['Back','Biceps'],4,'8–12','90 sec',['Lats','Upper back','Biceps'],'Drive elbows toward the hips without leaning backward.','family-javin-lat-pulldown-v1'),
  exercise('chest-row','Chest-supported row',['Back','Shoulders'],4,'8–12','90 sec',['Mid-back','Lats','Rear delts'],'Keep the chest supported; pause as the shoulder blades draw together.','family-chest-supported-row-v2'),
  exercise('single-row','Single-arm cable row',['Back','Biceps'],3,'10–12 each','60 sec',['Lats','Mid-back','Biceps'],'Keep the torso quiet and pull the elbow toward the back pocket.','family-nyla-single-arm-row-v1'),
  exercise('shoulder-press','Seated dumbbell shoulder press',['Shoulders','Triceps'],3,'8–12','75 sec',['Front delts','Side delts','Triceps'],'Keep ribs stacked over hips and press without shrugging.','family-shoulder-press-v2'),
  exercise('lateral-raise','Dumbbell lateral raise',['Shoulders'],4,'12–18','45 sec',['Side delts'],'Lead with the elbows and stop around shoulder height.','family-lateral-raise-v2'),
  exercise('reverse-fly','Chest-supported reverse fly',['Shoulders','Back'],3,'12–18','45 sec',['Rear delts','Upper back'],'Use a light load and open the arms without shrugging.','family-reverse-fly-v2'),
  exercise('face-pull','Cable face pull',['Shoulders','Back'],3,'12–18','45 sec',['Rear delts','Upper back','Rotator cuff'],'Pull toward eye level and rotate the hands apart.','family-face-pull-v2'),
  exercise('hammer-curl','Hammer curl',['Biceps','Forearms'],3,'10–15','60 sec',['Biceps','Brachialis','Forearms'],'Keep elbows still and wrists neutral; lower completely.','family-hammer-curl-v2'),
  exercise('rope-triceps','Rope triceps pressdown',['Triceps'],3,'10–15','60 sec',['Triceps'],'Pin the elbows near the ribs and separate the rope at the bottom.','family-triceps-pressdown-v2'),
  exercise('goblet-squat','Goblet squat',['Quadriceps','Glutes','Abs'],4,'8–12','90 sec',['Quadriceps','Glutes','Core'],'Brace, sit between the hips, and keep the whole foot planted.','family-goblet-squat-v2'),
  exercise('romanian-deadlift','Romanian deadlift',['Hamstrings','Glutes','Back'],4,'8–12','90 sec',['Hamstrings','Glutes','Back extensors'],'Push the hips back with soft knees and keep the weights close.','family-romanian-deadlift-v2'),
  exercise('reverse-lunge','Reverse lunge',['Quadriceps','Glutes'],3,'8–12 each','75 sec',['Glutes','Quadriceps','Adductors'],'Step back far enough to keep the front foot planted.','family-reverse-lunge-v2'),
  exercise('hip-thrust','Barbell hip thrust',['Glutes','Hamstrings'],4,'8–12','90 sec',['Glutes','Hamstrings'],'Finish with glutes squeezed and ribs down—do not overarch.','family-hip-thrust-v2'),
  exercise('leg-curl','Seated leg curl',['Hamstrings'],3,'10–15','60 sec',['Hamstrings'],'Anchor the hips, pause in the curl, and control the return.','family-leg-curl-v2'),
  exercise('step-up','Dumbbell step-up',['Glutes','Quadriceps'],3,'8–12 each','75 sec',['Glutes','Quadriceps','Core'],'Plant the full working foot and avoid pushing off the floor.','family-step-up-v2'),
  exercise('glute-kickback','Cable glute kickback',['Glutes'],3,'12–15 each','45 sec',['Glutes'],'Keep the pelvis square and stop before the lower back arches.','family-glute-kickback-v2'),
  exercise('calf-raise','Standing calf raise',['Calves'],3,'12–20','45 sec',['Calves'],'Use a full stretch and pause at the top over the big toe.','family-calf-raise-v2'),
  exercise('ab-wheel','Ab-wheel rollout',['Abs','Back'],3,'6–12','60 sec',['Deep core','Rectus abdominis','Lats'],'Roll only as far as the torso stays rigid and the low back does not sag.','family-ab-wheel-v2'),
  exercise('hanging-raise','Hanging knee raise',['Abs'],3,'8–15','60 sec',['Lower abs','Deep core','Hip flexors'],'Tuck the pelvis first, then raise the knees without swinging.','family-hanging-knee-raise-v2'),
  exercise('dead-bug','Dead bug',['Abs'],3,'6–10 each','45 sec',['Deep core','Rectus abdominis'],'Extend opposite limbs only while the low back stays gently pressed down.','family-isaiah-dead-bug-v1'),
  exercise('plank','Front plank',['Abs','Shoulders'],3,'20–40 sec','45 sec',['Deep core','Abs','Shoulders'],'Squeeze the glutes, pull the ribs down, and breathe behind the brace.','family-front-plank-v2'),
  exercise('incline-walk','Incline treadmill walk',['Conditioning','Glutes','Calves'],1,'20–30 min','As needed',['Heart and lungs','Glutes','Calves'],'Use a pace that allows short sentences; stay tall and off the rails.','family-incline-walk-v2'),
  exercise('flat-db-press','Flat dumbbell bench press',['Chest','Shoulders','Triceps'],4,'8–12','90 sec',['Mid chest','Front delts','Triceps'],'Keep the shoulder blades anchored and stack wrists over elbows.','family-lorenzo-incline-press-v1'),
  exercise('machine-chest-press','Machine chest press',['Chest','Shoulders','Triceps'],3,'10–15','75 sec',['Chest','Front delts','Triceps'],'Set the handles near mid-chest and press without reaching the shoulders forward.','family-lorenzo-incline-press-v1'),
  exercise('cable-crossover','Cable crossover',['Chest','Shoulders'],3,'12–15','60 sec',['Chest','Front delts'],'Bring the upper arms across the torso while keeping the ribs controlled.','family-terica-cable-fly-v1'),
  exercise('assisted-dip','Assisted chest dip',['Chest','Triceps','Shoulders'],3,'8–12','75 sec',['Lower chest','Triceps','Front delts'],'Lean slightly forward and lower only as far as the shoulders stay comfortable.','family-larry-push-up-v1'),
  exercise('decline-push-up','Decline push-up',['Chest','Shoulders','Triceps','Abs'],3,'8–15','60 sec',['Upper chest','Triceps','Core'],'Keep a rigid plank as the chest lowers between the hands.','family-larry-push-up-v1'),
  exercise('db-floor-press','Dumbbell floor press',['Chest','Triceps'],3,'8–12','75 sec',['Chest','Triceps'],'Pause the upper arms softly on the floor and press without bouncing.','family-lorenzo-incline-press-v1'),
  exercise('pec-deck','Pec deck fly',['Chest'],3,'12–15','60 sec',['Chest'],'Keep the sternum tall and squeeze without letting the shoulders roll forward.','family-terica-cable-fly-v1'),
  exercise('single-cable-press','Single-arm cable chest press',['Chest','Shoulders','Triceps','Abs'],3,'10–12 each','60 sec',['Chest','Triceps','Core'],'Resist torso rotation while pressing forward and slightly inward.','family-terica-cable-fly-v1'),
  exercise('close-push-up','Close-grip push-up',['Chest','Triceps','Abs'],3,'8–15','60 sec',['Triceps','Chest','Core'],'Keep elbows close and maintain one line from head to heels.','family-larry-push-up-v1'),
  exercise('landmine-press','Half-kneeling landmine press',['Chest','Shoulders','Triceps','Abs'],3,'8–12 each','60 sec',['Upper chest','Front delts','Triceps','Core'],'Press up and forward while keeping the ribs stacked over the pelvis.','family-shoulder-press-v2'),
  exercise('machine-incline-press','Incline chest press machine',['Chest','Shoulders','Triceps'],3,'8–12','75 sec',['Upper chest','Front delts','Triceps'],'Set the seat so the handles begin at upper-chest level.','family-lorenzo-incline-press-v1'),
  exercise('cable-press-around','Cable press-around',['Chest','Abs'],3,'12–15 each','60 sec',['Chest','Serratus','Core'],'Sweep the arm around the rib cage without rotating the hips.','family-terica-cable-fly-v1'),
  exercise('pull-up','Pull-up',['Back','Biceps','Shoulders'],3,'5–10','90 sec',['Lats','Upper back','Biceps'],'Start from a controlled hang and drive elbows toward the ribs.','family-javin-lat-pulldown-v1'),
  exercise('assisted-pull-up','Assisted pull-up machine',['Back','Biceps'],3,'8–12','75 sec',['Lats','Upper back','Biceps'],'Use only enough assistance to complete smooth full-range repetitions.','family-javin-lat-pulldown-v1'),
  exercise('machine-row','Seated row machine',['Back','Biceps','Shoulders'],4,'8–12','75 sec',['Mid-back','Lats','Rear delts'],'Keep the chest against the pad and finish with elbows behind the torso.','family-chest-supported-row-v2'),
  exercise('one-db-row','One-arm dumbbell row',['Back','Biceps'],3,'8–12 each','75 sec',['Lats','Mid-back','Biceps'],'Brace firmly and pull the elbow toward the hip without twisting.','family-nyla-single-arm-row-v1'),
  exercise('t-bar-row','Chest-supported T-bar row',['Back','Biceps','Shoulders'],4,'8–12','90 sec',['Mid-back','Lats','Rear delts'],'Keep the chest planted and pause when the shoulder blades meet.','family-chest-supported-row-v2'),
  exercise('straight-arm-pulldown','Straight-arm cable pulldown',['Back','Triceps','Abs'],3,'12–15','60 sec',['Lats','Long-head triceps','Core'],'Keep arms nearly straight and sweep the bar toward the thighs.','family-javin-lat-pulldown-v1'),
  exercise('machine-pullover','Pullover machine',['Back','Chest','Triceps'],3,'10–15','60 sec',['Lats','Serratus','Triceps'],'Drive the elbows down in an arc without lifting the rib cage.','family-javin-lat-pulldown-v1'),
  exercise('arnold-press','Arnold dumbbell press',['Shoulders','Triceps'],3,'8–12','75 sec',['Front delts','Side delts','Triceps'],'Rotate smoothly and finish overhead without arching the lower back.','family-shoulder-press-v2'),
  exercise('cable-lateral-raise','Single-arm cable lateral raise',['Shoulders'],3,'12–18 each','45 sec',['Side delts'],'Lead with the elbow and keep tension through the bottom.','family-lateral-raise-v2'),
  exercise('machine-lateral-raise','Lateral raise machine',['Shoulders'],3,'12–18','45 sec',['Side delts'],'Keep shoulders down and raise the pads only to shoulder height.','family-lateral-raise-v2'),
  exercise('rear-delt-machine','Reverse pec deck',['Shoulders','Back'],3,'12–18','45 sec',['Rear delts','Upper back'],'Keep the chest supported and open the arms without shrugging.','family-reverse-fly-v2'),
  exercise('cable-upright-row','Cable upright row',['Shoulders','Biceps'],3,'10–15','60 sec',['Side delts','Upper traps','Biceps'],'Use a comfortable grip and stop before the shoulders roll forward.','family-face-pull-v2'),
  exercise('pike-push-up','Pike push-up',['Shoulders','Triceps','Abs'],3,'6–12','60 sec',['Front delts','Triceps','Core'],'Lower the crown of the head between the hands while the hips stay high.','family-larry-push-up-v1'),
  exercise('db-front-raise','Dumbbell front raise',['Shoulders'],3,'10–15','45 sec',['Front delts'],'Raise with straight wrists and stop at shoulder height.','family-lateral-raise-v2'),
  exercise('db-curl','Alternating dumbbell curl',['Biceps','Forearms'],3,'8–12 each','60 sec',['Biceps','Forearms'],'Keep elbows under the shoulders and fully straighten each arm.','family-hammer-curl-v2'),
  exercise('incline-curl','Incline dumbbell curl',['Biceps'],3,'10–15','60 sec',['Biceps long head'],'Let the arms hang behind the torso and avoid swinging.','family-hammer-curl-v2'),
  exercise('cable-curl','Standing cable curl',['Biceps','Forearms'],3,'10–15','60 sec',['Biceps','Forearms'],'Keep the upper arms still while curling through full range.','family-hammer-curl-v2'),
  exercise('preacher-machine-curl','Preacher curl machine',['Biceps'],3,'10–15','60 sec',['Biceps'],'Keep the upper arms on the pad and avoid locking out aggressively.','family-hammer-curl-v2'),
  exercise('chin-up','Chin-up',['Biceps','Back'],3,'5–10','90 sec',['Biceps','Lats','Upper back'],'Pull the chest toward the bar without kicking or craning the neck.','family-javin-lat-pulldown-v1'),
  exercise('concentration-curl','Concentration dumbbell curl',['Biceps'],3,'10–15 each','45 sec',['Biceps'],'Brace the upper arm against the thigh and move only the forearm.','family-hammer-curl-v2'),
  exercise('reverse-curl','Dumbbell reverse curl',['Biceps','Forearms'],3,'10–15','60 sec',['Brachialis','Forearms','Biceps'],'Keep knuckles up and elbows quiet throughout the curl.','family-hammer-curl-v2'),
  exercise('bayesian-curl','Bayesian cable curl',['Biceps'],3,'10–15 each','45 sec',['Biceps long head'],'Stand ahead of the cable and curl without moving the shoulder forward.','family-hammer-curl-v2'),
  exercise('machine-curl','Biceps curl machine',['Biceps'],3,'10–15','60 sec',['Biceps'],'Match the elbow joint to the machine pivot and lower slowly.','family-hammer-curl-v2'),
  exercise('overhead-cable-triceps','Overhead cable triceps extension',['Triceps'],3,'10–15','60 sec',['Triceps long head'],'Keep elbows pointed forward and ribs down as the arms straighten.','family-triceps-pressdown-v2'),
  exercise('db-overhead-triceps','Seated dumbbell overhead extension',['Triceps','Shoulders'],3,'10–15','60 sec',['Triceps long head'],'Keep the upper arms vertical and avoid flaring the ribs.','family-triceps-pressdown-v2'),
  exercise('machine-dip','Seated dip machine',['Triceps','Chest'],3,'8–12','75 sec',['Triceps','Lower chest'],'Keep shoulders down and press the handles through a controlled range.','family-triceps-pressdown-v2'),
  exercise('bench-dip','Bench dip',['Triceps','Chest','Shoulders'],3,'8–15','60 sec',['Triceps','Chest','Front delts'],'Keep the shoulders away from the ears and use a comfortable depth.','family-larry-push-up-v1'),
  exercise('skull-crusher','Dumbbell skull crusher',['Triceps'],3,'10–15','60 sec',['Triceps'],'Keep upper arms angled slightly back and bend only at the elbows.','family-triceps-pressdown-v2'),
  exercise('crossbody-triceps','Cross-body cable triceps extension',['Triceps'],3,'12–15 each','45 sec',['Triceps'],'Hold the upper arm still and finish with a complete elbow extension.','family-triceps-pressdown-v2'),
  exercise('single-pressdown','Single-arm cable pressdown',['Triceps'],3,'12–15 each','45 sec',['Triceps'],'Pin the elbow beside the torso and control the return.','family-triceps-pressdown-v2'),
  exercise('db-kickback','Dumbbell triceps kickback',['Triceps','Shoulders'],3,'12–15 each','45 sec',['Triceps','Rear delts'],'Keep the upper arm parallel to the floor and extend without swinging.','family-triceps-pressdown-v2'),
  exercise('leg-press','45-degree leg press',['Quadriceps','Glutes','Hamstrings'],4,'8–15','90 sec',['Quadriceps','Glutes','Hamstrings'],'Lower until the pelvis stays planted and drive through the whole foot.','family-goblet-squat-v2'),
  exercise('hack-squat','Hack squat machine',['Quadriceps','Glutes'],4,'8–12','90 sec',['Quadriceps','Glutes'],'Keep the back on the pad and let knees track with the toes.','family-goblet-squat-v2'),
  exercise('leg-extension','Leg extension machine',['Quadriceps'],3,'12–15','60 sec',['Quadriceps'],'Align the knee with the machine pivot and pause at the top.','family-goblet-squat-v2'),
  exercise('split-squat','Dumbbell Bulgarian split squat',['Quadriceps','Glutes','Hamstrings'],3,'8–12 each','75 sec',['Quadriceps','Glutes','Hamstrings'],'Drop the back knee down while keeping the front foot fully planted.','family-reverse-lunge-v2'),
  exercise('walking-lunge','Dumbbell walking lunge',['Quadriceps','Glutes','Hamstrings'],3,'10–16 steps','75 sec',['Quadriceps','Glutes','Hamstrings'],'Take controlled steps and keep the front knee tracking over the toes.','family-reverse-lunge-v2'),
  exercise('wall-sit','Wall sit',['Quadriceps','Glutes','Calves'],3,'30–60 sec','45 sec',['Quadriceps','Glutes','Calves'],'Press the low back gently into the wall and keep feet planted.','family-goblet-squat-v2'),
  exercise('front-squat','Barbell front squat',['Quadriceps','Glutes','Abs'],4,'6–10','90 sec',['Quadriceps','Glutes','Core'],'Keep elbows high, brace hard, and sit between the hips.','family-goblet-squat-v2'),
  exercise('belt-squat','Belt squat machine',['Quadriceps','Glutes','Hamstrings'],4,'8–15','90 sec',['Quadriceps','Glutes','Hamstrings'],'Descend between the hips and keep constant tension through the belt.','family-goblet-squat-v2'),
  exercise('lying-leg-curl','Lying leg curl machine',['Hamstrings'],3,'10–15','60 sec',['Hamstrings'],'Keep hips pressed into the pad and control the lowering phase.','family-leg-curl-v2'),
  exercise('nordic-curl','Assisted Nordic hamstring curl',['Hamstrings','Glutes'],3,'4–8','90 sec',['Hamstrings','Glutes'],'Lower in one line and use the hands only as much as needed.','family-leg-curl-v2'),
  exercise('stability-curl','Stability-ball leg curl',['Hamstrings','Glutes','Abs'],3,'10–15','60 sec',['Hamstrings','Glutes','Core'],'Hold the hips high while drawing the heels toward the body.','family-leg-curl-v2'),
  exercise('good-morning','Barbell good morning',['Hamstrings','Glutes','Back'],3,'8–12','75 sec',['Hamstrings','Glutes','Back extensors'],'Brace, soften the knees, and hinge without rounding the back.','family-romanian-deadlift-v2'),
  exercise('cable-pull-through','Cable pull-through',['Hamstrings','Glutes'],3,'12–15','60 sec',['Glutes','Hamstrings'],'Push the hips back, then stand tall by squeezing the glutes.','family-glute-kickback-v2'),
  exercise('back-extension','Back extension machine',['Hamstrings','Glutes','Back'],3,'10–15','60 sec',['Glutes','Hamstrings','Back extensors'],'Move through the hips and stop when the body forms a straight line.','family-romanian-deadlift-v2'),
  exercise('single-leg-rdl','Single-leg dumbbell Romanian deadlift',['Hamstrings','Glutes','Abs'],3,'8–12 each','75 sec',['Hamstrings','Glutes','Core'],'Keep hips square and reach the free leg long behind you.','family-romanian-deadlift-v2'),
  exercise('sumo-deadlift','Sumo deadlift',['Hamstrings','Glutes','Quadriceps','Back'],4,'5–8','120 sec',['Glutes','Hamstrings','Quadriceps','Back'],'Wedge the hips close to the bar and push the floor apart.','family-romanian-deadlift-v2'),
  exercise('seated-calf','Seated calf raise machine',['Calves'],4,'12–20','45 sec',['Soleus','Calves'],'Use a full heel drop and pause at the top of every repetition.','family-calf-raise-v2'),
  exercise('legpress-calf','Leg press calf raise',['Calves'],3,'12–20','45 sec',['Calves'],'Move only at the ankles and keep a soft bend in the knees.','family-calf-raise-v2'),
  exercise('single-calf','Single-leg bodyweight calf raise',['Calves'],3,'12–20 each','45 sec',['Calves'],'Use support for balance and rise over the big toe.','family-calf-raise-v2'),
  exercise('smith-calf','Smith machine calf raise',['Calves'],4,'10–20','45 sec',['Calves'],'Stand on a stable platform and control the bottom stretch.','family-calf-raise-v2'),
  exercise('pogo-hop','Pogo hop',['Calves','Conditioning'],3,'20–30 sec','45 sec',['Calves','Ankles','Heart and lungs'],'Stay tall and rebound lightly from the balls of the feet.','family-calf-raise-v2'),
  exercise('jump-rope','Jump rope',['Calves','Conditioning'],5,'60 sec','30 sec',['Calves','Heart and lungs','Coordination'],'Keep jumps low and land quietly under the hips.','family-incline-walk-v2'),
  exercise('farmers-carry','Dumbbell farmer carry',['Calves','Conditioning','Abs','Shoulders'],4,'30–45 sec','60 sec',['Grip','Core','Calves','Shoulders'],'Walk tall with short controlled steps and do not lean.','family-incline-walk-v2'),
  exercise('sled-push','Sled push',['Quadriceps','Glutes','Calves','Conditioning'],6,'20–30 yd','60 sec',['Quadriceps','Glutes','Calves','Heart and lungs'],'Keep arms long and drive the ground back with powerful steps.','family-incline-walk-v2'),
  exercise('stair-climber','Stair-climber intervals',['Conditioning','Glutes','Quadriceps','Calves'],1,'15–25 min','As needed',['Heart and lungs','Glutes','Quadriceps','Calves'],'Stand tall and use the rails only for balance.','family-incline-walk-v2'),
  exercise('cable-crunch','Kneeling cable crunch',['Abs'],3,'10–15','60 sec',['Rectus abdominis','Deep core'],'Curl the ribs toward the pelvis without sitting the hips back.','family-ab-wheel-v2'),
  exercise('reverse-crunch','Reverse crunch',['Abs'],3,'10–15','45 sec',['Lower abs','Deep core'],'Roll the pelvis toward the ribs without swinging the legs.','family-isaiah-dead-bug-v1'),
  exercise('pallof-press','Pallof cable press',['Abs','Shoulders'],3,'10–12 each','45 sec',['Obliques','Deep core','Shoulders'],'Press straight out while resisting rotation.','family-front-plank-v2'),
  exercise('side-plank','Side plank',['Abs','Shoulders'],3,'20–40 sec each','45 sec',['Obliques','Deep core','Shoulders'],'Stack the shoulders and hips while pushing the floor away.','family-front-plank-v2'),
  exercise('bicycle-crunch','Bicycle crunch',['Abs'],3,'10–20 each','45 sec',['Obliques','Rectus abdominis'],'Rotate the rib cage toward the opposite knee without pulling the neck.','family-isaiah-dead-bug-v1'),
  exercise('captain-chair','Captain’s chair knee raise',['Abs'],3,'8–15','60 sec',['Lower abs','Deep core','Hip flexors'],'Press into the pads and tuck the pelvis before lifting the knees.','family-hanging-knee-raise-v2'),
  exercise('mountain-climber','Mountain climber',['Abs','Conditioning','Shoulders'],4,'30–45 sec','30 sec',['Core','Shoulders','Heart and lungs'],'Keep shoulders over hands and drive knees without bouncing the hips.','family-larry-push-up-v1'),
  exercise('rower','Rowing machine intervals',['Conditioning','Back','Biceps','Quadriceps','Hamstrings'],8,'60 sec','60 sec',['Heart and lungs','Back','Legs'],'Drive with the legs, then swing and finish with the arms.','family-incline-walk-v2'),
  exercise('air-bike','Air bike intervals',['Conditioning','Quadriceps','Hamstrings','Shoulders'],10,'30 sec','60 sec',['Heart and lungs','Legs','Shoulders'],'Push and pull the handles while maintaining a steady torso.','family-incline-walk-v2'),
  exercise('elliptical','Elliptical steady state',['Conditioning','Glutes','Quadriceps','Calves'],1,'20–30 min','As needed',['Heart and lungs','Glutes','Legs'],'Use a smooth stride and keep the torso upright.','family-incline-walk-v2'),
  exercise('battle-rope','Battle rope intervals',['Conditioning','Shoulders','Biceps','Abs'],8,'30 sec','30 sec',['Heart and lungs','Shoulders','Arms','Core'],'Keep knees soft and make fast even waves from the shoulders.','family-face-pull-v2'),
  exercise('burpee','Burpee',['Conditioning','Chest','Shoulders','Triceps','Quadriceps','Abs'],4,'8–12','60 sec',['Heart and lungs','Chest','Legs','Core'],'Step or jump back under control and land softly.','family-larry-push-up-v1'),
  exercise('ski-erg','Ski erg intervals',['Conditioning','Back','Triceps','Abs'],8,'45 sec','45 sec',['Heart and lungs','Lats','Triceps','Core'],'Hinge and drive the handles past the thighs without rounding.','family-javin-lat-pulldown-v1'),
  exercise('shadow-boxing','Shadow boxing',['Conditioning','Shoulders','Abs','Calves'],6,'2 min','60 sec',['Heart and lungs','Shoulders','Core','Calves'],'Stay light on the feet and return each hand to guard.','family-incline-walk-v2'),
  exercise('brisk-walk','Brisk outdoor walk',['Conditioning','Glutes','Calves'],1,'30–45 min','As needed',['Heart and lungs','Glutes','Calves'],'Walk tall at a pace that allows short sentences.','family-incline-walk-v2'),
])

export const EXERCISE_BY_ID=Object.freeze(Object.fromEntries(EXERCISE_LIBRARY.map(item=>[item.id,item])))
export const BODY_PARTS=Object.freeze(['All','Chest','Back','Shoulders','Biceps','Triceps','Quadriceps','Hamstrings','Glutes','Calves','Abs','Conditioning'])
export const EQUIPMENT_TYPES=Object.freeze(['All','Bodyweight','Cable','Dumbbell','Machine','Barbell','Other'])
const session=(id,title,focus,duration,intensity,ids,note)=>Object.freeze({id,title,focus,duration,intensity,exercises:Object.freeze(ids.map(id=>EXERCISE_BY_ID[id])),note})

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
const imageOverrides=value=>Object.fromEntries((Array.isArray(value)?value:[]).map(item=>String(item).split('|')).filter(parts=>parts.length>=2&&EXERCISE_BY_ID[parts[0]]).map(([id,...url])=>[id,url.join('|')]))
export function workoutForDate(date,member='Larry',fitness={}){
  const parsed=new Date(`${date}T12:00:00Z`),day=Number.isFinite(parsed.getTime())?parsed.getUTCDay():new Date().getDay(),profile=fitnessProfileForMember(member),schedule=profile==='women'?WOMEN:profile==='youth'?YOUTH:MEN
  const base=schedule[day===0?6:day-1],ids=Array.isArray(fitness?.exerciseIds)?fitness.exerciseIds.filter(id=>EXERCISE_BY_ID[id]).slice(0,10):[],images=imageOverrides(fitness?.exerciseImages)
  const exercises=(ids.length?ids:base.exercises.map(item=>item.id)).map(id=>images[id]?{...EXERCISE_BY_ID[id],image:images[id]}:EXERCISE_BY_ID[id]).filter(Boolean)
  return {...base,...(ids.length?{id:`custom-${date}-${member}`,title:String(fitness.workout||'Custom Target Workout'),focus:String(fitness.objective||fitness.goal||base.focus),note:String(fitness.goal||fitness.objective||base.note),exercises}:{}),profile,date,member,stepGoal:Number(fitness?.stepGoal)||12000,weeklyWorkoutTarget:5}
}

const TARGETS={
  chest:['incline-press','cable-fly','push-up'],back:['lat-pulldown','chest-row','single-row','face-pull'],lat:['lat-pulldown','chest-row','single-row'],shoulder:['shoulder-press','lateral-raise','reverse-fly','face-pull'],
  arm:['hammer-curl','rope-triceps','shoulder-press'],bicep:['hammer-curl','single-row'],tricep:['rope-triceps','push-up','incline-press'],
  leg:['goblet-squat','romanian-deadlift','reverse-lunge','leg-curl','calf-raise'],quad:['goblet-squat','reverse-lunge','step-up'],hamstring:['romanian-deadlift','leg-curl','hip-thrust'],
  glute:['hip-thrust','romanian-deadlift','glute-kickback','step-up'],calf:['calf-raise'],ab:['ab-wheel','hanging-raise','dead-bug','plank'],core:['ab-wheel','dead-bug','plank'],conditioning:['incline-walk'],fat:['incline-walk'],waist:['dead-bug','plank','hanging-raise'],
}
export function suggestWorkoutFromGoal(goal,member='Larry'){
  const text=String(goal||'').trim().toLowerCase(),profile=fitnessProfileForMember(member)
  if(text.length<3)throw new Error('Describe the muscles or physique goal you want to target.')
  const ranked=[]
  for(const [term,ids] of Object.entries(TARGETS))if(text.includes(term))ids.forEach(id=>{if(!ranked.includes(id))ranked.push(id)})
  for(const [term,id] of [['chest','incline-press'],['lat','lat-pulldown'],['shoulder','lateral-raise'],['glute','hip-thrust'],['hamstring','romanian-deadlift'],['quad','goblet-squat'],['ab','ab-wheel'],['core','dead-bug']])if(text.includes(term)){const index=ranked.indexOf(id);if(index>=0)ranked.splice(index,1);ranked.unshift(id)}
  if(!ranked.length)(profile==='women'?['hip-thrust','goblet-squat','lateral-raise','chest-row','dead-bug']:profile==='youth'?['goblet-squat','push-up','single-row','step-up','dead-bug']:['lat-pulldown','incline-press','lateral-raise','chest-row','ab-wheel']).forEach(id=>ranked.push(id))
  const core=profile==='youth'?'dead-bug':text.includes('ab')||text.includes('core')||text.includes('waist')?null:(profile==='women'?'dead-bug':'ab-wheel')
  const limit=profile==='youth'?5:8,ids=ranked.filter(id=>id!==core).slice(0,core?limit-1:limit)
  if(core&&!ids.includes(core))ids.push(core)
  const muscles=[...new Set(ids.flatMap(id=>EXERCISE_BY_ID[id].muscles))].slice(0,6)
  return {goal:String(goal).trim(),member,exerciseIds:ids,title:`${muscles.slice(0,2).join(' + ')} Target Workout`,objective:`Target ${muscles.join(', ')} with controlled, progressive training.`,exercises:ids.map(id=>EXERCISE_BY_ID[id])}
}
