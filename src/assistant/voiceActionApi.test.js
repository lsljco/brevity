import test from 'node:test'
import assert from 'node:assert/strict'
import {executeAssistantProposal} from './assistantApi.js'
test('voice review metadata reaches the server with the exact proposal and selected scope',async t=>{
 let request
 t.mock.method(globalThis,'fetch',async(url,options)=>{request={url,...options};return new Response(JSON.stringify({ok:true}),{status:200})})
 const voiceApproval={proposalId:'review-1',phrase:'Apply this change',reviewedAt:1000}
 await executeAssistantProposal({proposalId:'review-1',confirmed:true,selections:{'op-1':'this-item'},voiceApproval})
 assert.equal(request.credentials,'include')
 assert.deepEqual(JSON.parse(request.body),{proposalId:'review-1',confirmed:true,selections:{'op-1':'this-item'},voiceApproval})
})
