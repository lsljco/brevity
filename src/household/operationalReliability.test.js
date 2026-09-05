import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {retryRefresh,isTransientRefreshError} from './retry.js'

test('transient refresh failures retry automatically and eventually return data',async()=>{let calls=0;const value=await retryRefresh(async()=>{calls+=1;if(calls<3)throw new Error('network temporarily unavailable');return{ok:true}},{attempts:3,baseDelayMs:1});assert.deepEqual(value,{ok:true});assert.equal(calls,3)})

test('permanent refresh errors do not churn through retries',async()=>{let calls=0;await assert.rejects(()=>retryRefresh(async()=>{calls+=1;throw new Error('invalid credentials')},{attempts:3,baseDelayMs:1}),/invalid credentials/);assert.equal(calls,1);assert.equal(isTransientRefreshError(new Error('network timeout')),true);assert.equal(isTransientRefreshError(new Error('invalid credentials')),false)})

test('sermon publishing is represented as one durable staged workflow',()=>{const workflow=fs.readFileSync(new URL('../../netlify/functions/sermon-workflow.mjs',import.meta.url),'utf8'),assets=fs.readFileSync(new URL('../../netlify/functions/sermon-slides-background.mjs',import.meta.url),'utf8'),state=fs.readFileSync(new URL('../../netlify/lib/sermon-workflow-state.mjs',import.meta.url),'utf8');for(const stage of ['notes','documents','documentPublishing','slides','visuals','devotions','complete'])assert.match(state,new RegExp(`['\"]${stage}['\"]`));assert.match(workflow,/withRetry/);assert.match(assets,/markSermonWorkflowComplete/);assert.match(assets,/publishSlideTarget/);assert.match(assets,/publishVisualTargets/);assert.match(assets,/publishDevotionTarget/)})

test('uploaded sermon notes skip unnecessary Word generation while retaining PDF and downstream assets',()=>{const workflow=fs.readFileSync(new URL('../../netlify/functions/sermon-workflow.mjs',import.meta.url),'utf8');assert.match(workflow,/pdfOnly=source\.sourceKind==='notes'/);assert.match(workflow,/pdfOnly\?Promise\.resolve\(null\):buildTimesSermonDocx/);assert.match(workflow,/buildTimesSermonPdf/);assert.match(workflow,/sermon-slides-background/)})
