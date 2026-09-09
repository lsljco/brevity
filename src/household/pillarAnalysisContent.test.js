import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { BASE_ANALYSIS_GUIDANCE, buildPillarAnalysisPrompt, pillarAnalysisServerCacheKey, pillarAnalysisServerInternals, PILLAR_INSTRUCTIONS } from '../../netlify/functions/pillar-analysis.mjs'

const expectedPillars = ['spiritual', 'health', 'fitness', 'household', 'education', 'finance', 'ministry']

test('every pillar receives the insight-led analysis contract', () => {
  assert.deepEqual(Object.keys(PILLAR_INSTRUCTIONS), expectedPillars)
  assert.match(BASE_ANALYSIS_GUIDANCE, /Never state, repeat, or emphasize who owns a pillar/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /no more than three high-value insights/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /no more than two meaningful next moves/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /Never infer that a pillar owner is responsible for another household member/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /Set decisions to an empty array \(\[\]\)/)
  assert.doesNotMatch(BASE_ANALYSIS_GUIDANCE, /Set decisions to an empty array unless/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /Never combine several entries inside one string/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /Treat plans as intentions, not evidence/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /pillar's own facts as the center of gravity/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /name|specific|exact/i)
  assert.match(BASE_ANALYSIS_GUIDANCE, /Do not describe|meta|process language/i)
  assert.match(BASE_ANALYSIS_GUIDANCE, /Every declarative concrete claim must map to a ranked fact/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /score, ratio, quantity, physiological measurement/)
  assert.match(PILLAR_INSTRUCTIONS.spiritual, /do not quote, paraphrase, promise, or guarantee doctrine from model memory/)
  assert.match(PILLAR_INSTRUCTIONS.education, /Do not invent mastery, readiness, scores, ratios/)
  assert.match(PILLAR_INSTRUCTIONS.ministry, /Do not invent people, approvals, participants, attendance/)
})

test('server rejects non-boolean force flags', () => {
  const { validForceFlag } = pillarAnalysisServerInternals
  assert.equal(validForceFlag(false), true)
  assert.equal(validForceFlag(true), true)
  for (const value of ['false', 'true', 0, 1, null, {}, []]) assert.equal(validForceFlag(value), false)
})

test('request body, plan, and local context must be plain objects', () => {
  const { plainObject } = pillarAnalysisServerInternals
  assert.equal(plainObject({}),true)
  assert.equal(plainObject(Object.create(null)),true)
  for(const value of [JSON.parse('null'),[],new Date(),'',0,true])assert.equal(plainObject(value),false)

  const validBody={pillar:'finance',date:'2026-09-08',plan:{},localContext:{}}
  assert.equal(plainObject(validBody),true)
  assert.equal(plainObject(validBody.plan),true)
  assert.equal(plainObject(validBody.localContext),true)
  for(const field of ['plan','localContext']){
    for(const value of [null,[],true,'records'])assert.equal(plainObject({...validBody,[field]:value}[field]),false,`${field} accepted ${JSON.stringify(value)}`)
  }
})

test('malformed model output and refusal collections are traversed safely', () => {
  const { modelHasRefusal, modelPayloadIssue, outputText, parsedAnalysis } = pillarAnalysisServerInternals
  const malformed = [null, {}, { output:{} }, { output:[null,{ content:{} },{ content:[null,'text',{ text:42 }] }] }]
  for (const payload of malformed) {
    assert.doesNotThrow(() => outputText(payload))
    assert.equal(outputText(payload), '')
    assert.equal(modelHasRefusal(payload), false)
    assert.equal(parsedAnalysis(payload), null)
    assert.equal(modelPayloadIssue(payload), 'model-unreadable')
  }

  const refusal={output:[{content:[{type:'refusal',refusal:'Cannot comply'}]}]}
  assert.equal(modelHasRefusal(refusal),true)
  assert.equal(parsedAnalysis(refusal),null)
  assert.equal(modelPayloadIssue(refusal),'model-refusal')
  for(const text of ['null','[]','"analysis"']){
    assert.equal(parsedAnalysis({output:[{content:[{text}]}]}),null)
  }
})

test('malformed analysis collections produce a deterministic fallback instead of throwing', () => {
  const { enforceServerGuardrails } = pillarAnalysisServerInternals
  const context={pillar:'finance',date:'2026-09-08',pillarData:{},localContext:{accounts:[{name:'Operating',balance:12400}]}}
  for(const canonicalEvidence of [false,true]){
    const guarded=enforceServerGuardrails({analysisPoints:{}},context,{canonicalEvidence})
    assert.equal(guarded.usedFallback,true)
    assert.equal(guarded.insufficientData,false)
    assert.ok(guarded.issues.includes('malformed-analysis-shape'))
    assert.match(guarded.analysis.headline,/Operating/i)
  }
})

test('model requests retry only transient failures within the shared deadline', async () => {
  const { modelTotalTimeoutMs, requestModel } = pillarAnalysisServerInternals
  const request={instructions:'instructions',input:'input'}
  const response=(status,sequence)=>({status,ok:status>=200&&status<300,json:async()=>({sequence})})
  assert.ok(modelTotalTimeoutMs<45000)

  for(const status of [408,429,500,503]){
    let calls=0
    const result=await requestModel(request,{deadline:Date.now()+1000,fetcher:async()=>{
      calls+=1
      return calls===1?response(status,calls):response(200,calls)
    }})
    assert.equal(calls,2,`${status} should retry once`)
    assert.equal(result.response.status,200)
    assert.equal(result.attempts,2)
  }

  let networkCalls=0
  const recovered=await requestModel(request,{deadline:Date.now()+1000,fetcher:async()=>{
    networkCalls+=1
    if(networkCalls===1)throw new TypeError('network unavailable')
    return response(200,networkCalls)
  }})
  assert.equal(networkCalls,2)
  assert.equal(recovered.response.status,200)

  let permanentCalls=0
  const permanent=await requestModel(request,{deadline:Date.now()+1000,fetcher:async()=>{
    permanentCalls+=1
    return response(400,permanentCalls)
  }})
  assert.equal(permanentCalls,1)
  assert.equal(permanent.response.status,400)

  let exhaustedCalls=0
  const exhausted=await requestModel(request,{deadline:Date.now()+1000,fetcher:async()=>{
    exhaustedCalls+=1
    return response(503,exhaustedCalls)
  }})
  assert.equal(exhaustedCalls,2)
  assert.equal(exhausted.response.status,503)

  let expiredCalls=0
  await assert.rejects(
    requestModel(request,{deadline:Date.now()-1,fetcher:async()=>{expiredCalls+=1;return response(200,expiredCalls)}}),
    error=>error?.name==='AbortError',
  )
  assert.equal(expiredCalls,0)
})

test('an older generation cannot overwrite a result created after it began', async () => {
  const { writeAnalysisCacheIfCurrent } = pillarAnalysisServerInternals
  let cached=null
  let etag=null
  let writes=0
  const dataStore={
    getWithMetadata:async()=>cached?{data:structuredClone(cached),etag}:null,
    setJSON:async(key,value,conditions)=>{
      if(conditions?.onlyIfNew&&cached)return{modified:false}
      if(conditions?.onlyIfMatch&&conditions.onlyIfMatch!==etag)return{modified:false}
      writes+=1
      cached={...value,key}
      etag=`etag-${writes}`
      return{modified:true,etag}
    },
  }
  const key='pillar-key'
  const olderStart=Date.parse('2026-09-08T10:00:00.000Z')
  const newerStart=Date.parse('2026-09-08T10:00:01.000Z')
  const older={requestStartedAt:olderStart,generatedAt:'2026-09-08T10:00:03.000Z',analysis:{headline:'older'}}
  const newer={requestStartedAt:newerStart,generatedAt:'2026-09-08T10:00:02.000Z',analysis:{headline:'newer'}}

  assert.equal(await writeAnalysisCacheIfCurrent({dataStore,key,result:older}),true)
  assert.equal(await writeAnalysisCacheIfCurrent({dataStore,key,result:newer}),true,'request start order must win even if the older request completed later')
  assert.equal(await writeAnalysisCacheIfCurrent({dataStore,key,result:older}),false)
  assert.equal(writes,2)
  assert.equal(cached.analysis.headline,'newer')

  let raceCached=null
  let raceEtag=null
  let raceWrites=0
  let releaseOlderSet
  let markOlderSetReached
  const olderSetReached=new Promise(resolve=>{markOlderSetReached=resolve})
  const olderSetRelease=new Promise(resolve=>{releaseOlderSet=resolve})
  const racingStore={
    getWithMetadata:async()=>raceCached?{data:structuredClone(raceCached),etag:raceEtag}:null,
    setJSON:async(key,value,conditions)=>{
      if(value.analysis.headline==='older'){
        markOlderSetReached()
        await olderSetRelease
      }
      if(conditions?.onlyIfNew&&raceCached)return{modified:false}
      if(conditions?.onlyIfMatch&&conditions.onlyIfMatch!==raceEtag)return{modified:false}
      raceWrites+=1
      raceCached={...value,key}
      raceEtag=`race-etag-${raceWrites}`
      return{modified:true,etag:raceEtag}
    },
  }
  const olderWrite=writeAnalysisCacheIfCurrent({dataStore:racingStore,key,result:older})
  await olderSetReached
  assert.equal(await writeAnalysisCacheIfCurrent({dataStore:racingStore,key,result:newer}),true)
  releaseOlderSet()
  assert.equal(await olderWrite,false)
  assert.equal(raceWrites,1)
  assert.equal(raceCached.analysis.headline,'newer')
})

test('spiritual analysis preserves each member’s personal responsibility', () => {
  const instructions = `${BASE_ANALYSIS_GUIDANCE}\n${PILLAR_INSTRUCTIONS.spiritual}`
  assert.match(instructions, /Each household member is responsible for personally engaging/)
  assert.match(instructions, /without making one person the household's spiritual supervisor/)
  assert.doesNotMatch(instructions, /Lorenzo owns this pillar/i)
  assert.doesNotMatch(instructions, /Lorenzo is the owner/i)
})

test('each prompt is isolated to the selected pillar data', () => {
  const prompt = buildPillarAnalysisPrompt({
    pillar:'household',
    date:'2026-09-06',
    currentMember:'Larry',
    plan:{
      spiritual:{ devotionFocus:'SPIRITUAL_SENTINEL' },
      household:{ weeklyFocus:'HOUSEHOLD_SENTINEL' },
    },
    localContext:{ projects:[{ title:'PROJECT_SENTINEL', priority:'high', status:'active' }] },
  })
  assert.match(prompt, /HOUSEHOLD_SENTINEL/)
  assert.match(prompt, /PROJECT_SENTINEL/)
  assert.doesNotMatch(prompt, /SPIRITUAL_SENTINEL/)
  assert.match(prompt, /requested pillar is the absolute scope/)
})

test('education analysis keeps routine management out of the daily message', () => {
  assert.match(PILLAR_INSTRUCTIONS.education, /standing routine and management details as background/)
  assert.match(PILLAR_INSTRUCTIONS.education, /Never discuss who supervises, owns, or is accountable/)
})

test('Health and Fitness analysis cannot invent clinical authority or outcomes', () => {
  assert.match(PILLAR_INSTRUCTIONS.health, /Do not invent diagnoses, treatments, cures, clinical outcomes/)
  assert.match(PILLAR_INSTRUCTIONS.health, /approval or recommendations from a clinician/)
  assert.match(PILLAR_INSTRUCTIONS.fitness, /Do not invent diagnoses, treatments, cures, clinical outcomes/)
  assert.match(PILLAR_INSTRUCTIONS.fitness, /approval or recommendations from a clinician/)
})

test('pillar analysis UI presents insight and growth without an ownership section', async () => {
  const source = await readFile(new URL('./PillarAnalysis.jsx', import.meta.url), 'utf8')
  assert.match(source, /Meaningful Next Moves/)
  assert.match(source, /Questions Worth Considering/)
  assert.match(source, /How Progress Will Show/)
  assert.doesNotMatch(source, /Who Does What/)
  assert.doesNotMatch(source, />Ownership</)
  assert.doesNotMatch(source, /analysis\.owners/)
  assert.match(source, /result\?\.pillar===pillar\.id && result\?\.date===plan\?\.date/)
  assert.match(source, /inFlightRef\.current===requestKey/)
  assert.match(source, /if\(inFlightRef\.current===requestKey\)return/)
  assert.match(source, /Refreshing analysis…/)
  assert.match(source, />Who</)
  assert.match(source, />When</)
  assert.match(source, />Done when</)
  assert.match(source, />Where</)
  assert.match(source, /\[currentMember, pillar\.id\]/)
  assert.match(source, /useRollingMealPlan\(\{enabled:isHealth,startDate:plan\?\.date,requireFresh:true,reloadOnRefreshEvents:true\}\)/)
  assert.match(source, /mealDetails:meals\.map/)
  assert.match(source, /const localContext=useMemo\(\(\)=>collectPillarContext\(pillar\.id,analysisPlan\?\.date\)/)
  assert.match(source, /const localContext=contextRef\.current/)
  assert.match(source, /currentScopeRef\.current!==requestKey/)
  assert.match(source, /errorScopeRef\.current=''; setError\(''\); setResult\(cached\)/)
  assert.match(source, /verifiedAt\+CALENDAR_STALE_AFTER_MS/)
  assert.match(source, /isHealth&&rollingMeals\.state!=='ready'/)
  assert.match(source, /forceAfterMealReloadRef\.current=true/)
  assert.match(source, /Health analysis is paused/)
  assert.match(source, /Retry meal plan/)
  assert.match(source, /planState!=='ready'/)
  assert.match(source, /Retry daily plan/)
  assert.match(source, /analysisSourceReady=planState==='ready'&&!planRefreshError&&\(!isHealth\|\|rollingMeals\.state==='ready'\)/)
  assert.match(source, /event\.detail\?\.plan\?\.date===refreshDate&&plan\?\.date===refreshDate/)
  assert.match(source, /Household plan could not be reverified/)
  assert.match(source, /planState!=='ready' \|\| planRefreshError \|\| !analysisPlan\?\.date/)
  assert.match(source, /isHealth&&rollingMeals\.state!=='ready'\)}/)
})

test('pillar analyses are retained server-side and force refresh bypasses that cache', async () => {
  const source = await readFile(new URL('../../netlify/functions/pillar-analysis.mjs', import.meta.url), 'utf8')
  assert.match(source, /pillar-analysis\/v\$\{PILLAR_ANALYSIS_SCHEMA_VERSION\}/)
  assert.match(source, /if\(!force\)/)
  assert.match(source, /cached:true/)
  assert.match(source, /plan-\$\{Number\(planVersion \|\| 0\)\}/)
  assert.match(source, /pillarAnalysisContextSignature/)
  assert.match(source, /writeAnalysisCacheIfCurrent/)
  assert.match(source, /onlyIfMatch/)
  assert.match(source, /onlyIfNew/)
  assert.match(source, /requestStartedAt/)
  assert.match(source, /requestedContextSignature!==contextSignature/)
  assert.match(source, /member:currentMember/)
  assert.match(source, /enforceServerGuardrails\(initialAnalysis\|\|\{\},guardContext/)
  assert.ok(source.indexOf('enforceServerGuardrails(initialAnalysis||{},guardContext') < source.lastIndexOf('writeAnalysisCacheIfCurrent({dataStore'),'semantic guardrails must run before generated analysis is cached')
  assert.match(source, /canonicalEvidence:Boolean\(initialAnalysis\)/)
  assert.match(source, /pillarAnalysisEvidence\(context,analysis\)/)
  assert.match(source, /operationalizePillarAnalysis/)
  assert.doesNotMatch(source, /evidence:\s*\{\s*type:'array'/)
  assert.match(source, /headline: \{ type:'string', maxLength:240 \}/)
  assert.match(source, /executiveSummary: \{ type:'string', maxLength:1600 \}/)
  assert.match(source, /safeCached=\{\.\.\.cached,analysis:withCanonicalEvidence\(guarded\.analysis/)
  assert.match(source, /\['validated','repaired','insufficient-data'\]\.includes\(quality\.status\)/)
  assert.notEqual(
    pillarAnalysisServerCacheKey('2026-09-07','finance',2,'Larry','context-a'),
    pillarAnalysisServerCacheKey('2026-09-07','finance',2,'Lorenzo','context-a'),
  )
})

test('pillar analysis UI identifies evidence without presenting a vague fallback as safe analysis', async () => {
  const source = await readFile(new URL('./PillarAnalysis.jsx', import.meta.url), 'utf8')
  assert.match(source, /Evidence & Provenance/)
  assert.match(source, /What This Is Based On/)
  assert.doesNotMatch(source, /Source-grounded safe analysis/)
  assert.match(source, /analysis\.evidence/)
})
