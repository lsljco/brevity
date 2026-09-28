import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFacebookPhotoPrompt,postImageSourceHash } from '../../netlify/lib/sermon-cover.mjs'
import { createPostImageHandler } from '../../netlify/functions/sermon-post-image.mjs'
import { createPostImageBackgroundHandler } from '../../netlify/functions/sermon-post-image-background.mjs'

const post={id:'post-1',type:'facebook',title:'Keep watch',content:'Remain faithful during the waiting season.'}
const sermon={id:'sermon-1',title:'Architecture of Wisdom',scripture:'Matthew 25',bigIdea:'Watchful faithfulness',assets:[post]}
const repository={get:async()=>({sermons:[sermon]})}
test('photography prompt follows the individual Facebook post',()=>{
 const prompt=buildFacebookPhotoPrompt(sermon,post)
 assert.match(prompt,/Remain faithful during the waiting season/)
 assert.match(prompt,/ultra-photorealistic/)
 assert.match(prompt,/No text/)
 assert.notEqual(postImageSourceHash(sermon,post),postImageSourceHash(sermon,{...post,content:'Changed'}))
})
test('post image requires sign in and binds job to an existing Facebook post',async()=>{
 let job,dispatches=0
 const handler=createPostImageHandler({authenticate:async()=>({member:'Larry'}),repositoryFactory:()=>repository,jobFactory:()=>({get:async()=>job,setJSON:async(_key,value)=>{job=value}}),dispatch:async()=>{dispatches++;return{ok:true,status:202}}})
 const event={httpMethod:'POST',headers:{host:'example.test'},body:JSON.stringify({sermonId:'sermon-1',postId:'post-1'})}
 assert.equal((await handler(event)).statusCode,202)
 assert.equal((await handler(event)).statusCode,202)
 assert.equal(dispatches,1)
 assert.equal((await handler({...event,body:JSON.stringify({sermonId:'sermon-1',postId:'unknown'})})).statusCode,404)
 const anonymous=createPostImageHandler({authenticate:async()=>null,repositoryFactory:()=>repository})
 assert.equal((await anonymous(event)).statusCode,401)
})
test('background job rejects a changed post before image generation',async()=>{
 let job={id:'job-1',sermonId:'sermon-1',postId:'post-1',assetId:'image-1',sourceHash:'stale',requestedBy:'Larry',state:'queued'}
 const handler=createPostImageBackgroundHandler({authenticate:async()=>({member:'Larry'}),repository,jobStore:{get:async()=>job,setJSON:async(_key,value)=>{job=value}},generateImage:async()=>{throw Error('should not run')}})
 const request=new Request('https://example.test',{method:'POST',body:JSON.stringify({sermonId:'sermon-1',postId:'post-1',jobId:'job-1'})})
 assert.equal((await handler(request)).status,409)
 assert.equal(job.state,'error')
})
