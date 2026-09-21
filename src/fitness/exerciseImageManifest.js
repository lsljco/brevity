export const EXERCISE_IMAGE_VERSION='2026-09-21-r6'

const CANONICAL_EXERCISE_IDS=`incline-press,cable-fly,push-up,lat-pulldown,chest-row,single-row,shoulder-press,lateral-raise,reverse-fly,face-pull,hammer-curl,rope-triceps,goblet-squat,romanian-deadlift,reverse-lunge,hip-thrust,leg-curl,step-up,glute-kickback,calf-raise,ab-wheel,hanging-raise,dead-bug,plank,incline-walk,flat-db-press,machine-chest-press,cable-crossover,assisted-dip,decline-push-up,db-floor-press,pec-deck,single-cable-press,close-push-up,landmine-press,machine-incline-press,cable-press-around,pull-up,assisted-pull-up,machine-row,one-db-row,t-bar-row,straight-arm-pulldown,machine-pullover,arnold-press,cable-lateral-raise,machine-lateral-raise,rear-delt-machine,cable-upright-row,pike-push-up,db-front-raise,db-curl,incline-curl,cable-curl,preacher-machine-curl,chin-up,concentration-curl,reverse-curl,bayesian-curl,machine-curl,overhead-cable-triceps,db-overhead-triceps,machine-dip,bench-dip,skull-crusher,crossbody-triceps,single-pressdown,db-kickback,leg-press,hack-squat,leg-extension,split-squat,walking-lunge,wall-sit,front-squat,belt-squat,lying-leg-curl,nordic-curl,stability-curl,good-morning,cable-pull-through,back-extension,single-leg-rdl,sumo-deadlift,seated-calf,legpress-calf,single-calf,smith-calf,pogo-hop,jump-rope,farmers-carry,sled-push,stair-climber,cable-crunch,reverse-crunch,pallof-press,side-plank,bicycle-crunch,captain-chair,mountain-climber,rower,air-bike,elliptical,battle-rope,burpee,ski-erg,shadow-boxing,brisk-walk`.split(',')

const ASSET_REVISIONS=Object.freeze({'ski-erg':6,'brisk-walk':4})

export const EXERCISE_IMAGE_ASSETS=Object.freeze(Object.fromEntries(
  CANONICAL_EXERCISE_IDS.map(id=>[id,`exercise-${id}-r${ASSET_REVISIONS[id]||3}.webp`])
))

export const canonicalExerciseImage=id=>{
  const asset=EXERCISE_IMAGE_ASSETS[String(id||'').trim()]
  return asset?`/fitness/exercises/${asset}`:''
}
