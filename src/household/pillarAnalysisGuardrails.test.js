import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDeterministicPillarFallback,
  enforcePillarAnalysisGuardrails,
  pillarAnalysisEvidence,
  pillarAnalysisQualityIssues,
} from './pillarAnalysisGuardrails.js'

const validAnalysis=()=>({
  headline:'Verified cash timing is the key financial message today',
  executiveSummary:'The operating data shows a timing difference worth understanding before the household changes its plan.',
  todayFocus:'Separate posted activity from projections and resolve the material variance.',
  analysisPoints:[{title:'Timing changes the interpretation',detail:'The posted and projected records describe different stages of the same planning horizon, so their labels matter.'}],
  actionableInsights:[{title:'Verify the material variance',whyItMatters:'One verified difference can change the near-term outlook more than several small planned items.',nextMove:'Compare the largest variance with its authoritative transaction or recurring-plan source.'}],
  evidence:[{source:'Authoritative finance context',detail:'Actual transaction amount: $450; scheduled amount: $400.'}],
  reflectionPrompts:['Which difference would materially change the next financial choice?'],
  watchFor:['A pending amount being described as realized income.'],
  decisions:[],
  growthSignal:'Progress will show when realized, pending, and projected figures reconcile without ambiguous labels.',
  governingPrinciple:'Verify the source and status of a financial number before interpreting or changing it.',
})

test('valid insight-led analysis is preserved without rewriting',()=>{
  const analysis=validAnalysis()
  const result=enforcePillarAnalysisGuardrails({analysis,pillar:'finance',date:'2026-09-07',pillarData:{todayFocus:'Preserve liquidity'},localContext:{actualTransactions:[{name:'AT&T',amount:450}]}})
  assert.equal(result.usedFallback,false)
  assert.equal(result.analysis,analysis)
  assert.deepEqual(result.issues,[])
})

test('pillar ownership announcements are rejected before caching',()=>{
  const analysis=validAnalysis()
  analysis.executiveSummary='Lorenzo owns this pillar and must lead the household through today’s priorities.'
  const result=enforcePillarAnalysisGuardrails({analysis,pillar:'household',date:'2026-09-07',pillarData:{weeklyFocus:'Reduce kitchen friction'}})
  assert.equal(result.usedFallback,true)
  assert.ok(result.issues.includes('pillar-ownership-language'))
  assert.doesNotMatch(JSON.stringify(result.analysis),/owns?\s+(?:this|the)\s+pillar/i)
  assert.match(result.analysis.headline,/household friction/i)
})

test('empty and non-actionable output receives a complete deterministic fallback',()=>{
  const empty=enforcePillarAnalysisGuardrails({analysis:{},pillar:'health',date:'2026-09-07',pillarData:{todayFocus:'Steady hydration'}})
  assert.equal(empty.usedFallback,true)
  assert.ok(empty.issues.includes('empty-core-insight'))
  assert.ok(empty.issues.includes('empty-actionable-insights'))
  assert.equal(empty.analysis.actionableInsights.length,1)
  assert.equal(empty.analysis.evidence.length,1)
  assert.deepEqual(pillarAnalysisQualityIssues(empty.analysis,'health'),[])

  const generic=validAnalysis()
  generic.actionableInsights=[{title:'Do something useful',whyItMatters:'A response is needed to keep the day moving.',nextMove:'Take action.'}]
  const guarded=enforcePillarAnalysisGuardrails({analysis:generic,pillar:'finance',date:'2026-09-07'})
  assert.equal(guarded.usedFallback,true)
  assert.ok(guarded.issues.includes('generic-non-actionable-language'))
  assert.ok(guarded.issues.includes('non-actionable-next-move'))
})

test('repeated boilerplate and malformed lists cannot be cached as analysis',()=>{
  const analysis=validAnalysis()
  analysis.todayFocus=analysis.headline
  analysis.watchFor=[{text:'This is not a valid insight.'}]
  const guarded=enforcePillarAnalysisGuardrails({analysis,pillar:'finance',date:'2026-09-07'})
  assert.equal(guarded.usedFallback,true)
  assert.ok(guarded.issues.includes('repeated-boilerplate'))
  assert.ok(guarded.issues.includes('invalid-watchFor'))
  assert.deepEqual(pillarAnalysisQualityIssues(guarded.analysis,'finance'),[])
})

test('spiritual analysis cannot assign one member responsibility for another person’s formation',()=>{
  const analysis=validAnalysis()
  analysis.headline='Receive the Scripture personally today'
  analysis.executiveSummary='Lorenzo should ensure everyone completes their daily devotion and prayer before the schedule begins.'
  const result=enforcePillarAnalysisGuardrails({analysis,pillar:'spiritual',date:'2026-09-07',pillarData:{scriptureFocus:'Proverbs 4:23'}})
  assert.equal(result.usedFallback,true)
  assert.ok(result.issues.includes('spiritual-responsibility-leakage'))
  assert.match(result.analysis.analysisPoints[0].detail,/personal reception and lived response/i)
  assert.doesNotMatch(JSON.stringify(result.analysis),/Lorenzo should ensure/i)

  const direct=validAnalysis()
  direct.executiveSummary='Larry is responsible for Nyla’s spiritual growth and daily prayer.'
  assert.ok(pillarAnalysisQualityIssues(direct,'spiritual').includes('spiritual-responsibility-leakage'))
})

test('fallback evidence excludes governance metadata and names its authoritative source',()=>{
  const evidence=pillarAnalysisEvidence({pillarData:{owner:'Lorenzo',todayFocus:'Guard the heart before reacting'},localContext:{updatedBy:'Larry',sermon:{title:'The receiving soil'}}})
  assert.equal(evidence.length,2)
  assert.equal(evidence[0].source,'Daily pillar plan')
  assert.equal(evidence[1].source,'Authoritative household context')
  assert.doesNotMatch(JSON.stringify(evidence),/owner|updated by|Lorenzo|Larry/i)

  const deduplicated=pillarAnalysisEvidence({pillarData:{todayFocus:'Guard the heart before reacting'},localContext:{sermon:{theme:'Guard the heart before reacting'}}})
  assert.equal(deduplicated.length,1)

  const fallback=buildDeterministicPillarFallback({pillar:'spiritual',date:'2026-09-07',pillarData:{todayFocus:'Lorenzo owns this pillar and must lead the household in prayer.',scriptureFocus:'Proverbs 4:23'}})
  assert.doesNotMatch(JSON.stringify(fallback),/owns this pillar|must lead the household/i)
  assert.match(JSON.stringify(fallback),/Proverbs 4:23/)
})

test('all seven pillars have deterministic, complete, non-list fallbacks',()=>{
  const pillars=['spiritual','health','fitness','household','education','finance','ministry']
  for(const pillar of pillars){
    const input={pillar,date:'2026-09-07',pillarData:{todayFocus:`${pillar} source focus`},localContext:{}}
    const first=buildDeterministicPillarFallback(input)
    const second=buildDeterministicPillarFallback(input)
    assert.deepEqual(first,second)
    assert.deepEqual(pillarAnalysisQualityIssues(first,pillar),[],pillar)
    assert.ok(first.analysisPoints.length<=3)
    assert.ok(first.actionableInsights.length<=2)
  }
})
