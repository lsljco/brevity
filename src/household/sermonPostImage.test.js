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

test('family subject selection constrains people and changes the source version',async()=>{
 const {defaultPostSubject,buildFacebookPhotoPrompt,sermonSubjectReference,generateSermonCover}=await import('../../netlify/lib/sermon-cover.mjs')
 assert.equal(defaultPostSubject({title:'A boy waits',content:''}),'Isaiah')
 assert.equal(defaultPostSubject({title:'Faithful woman',content:''}),'Terica')
 assert.equal(defaultPostSubject(post),'none')
 assert.match(buildFacebookPhotoPrompt(sermon,post,'none'),/Show no people/)
 assert.match(buildFacebookPhotoPrompt(sermon,post,'Larry'),/only person permitted/)
 assert.notEqual(postImageSourceHash(sermon,post,'Larry'),postImageSourceHash(sermon,post,'Lorenzo'))
 const reference=await sermonSubjectReference('Larry',{identityStore:{get:async()=>new Uint8Array([255,216,255,217])},householdId:'home',environment:{}})
 assert.equal(reference.fileName,'larry.jpg')
 let url,method,body
 const png=Buffer.from([137,80,78,71,13,10,26,10,1,2])
 await generateSermonCover({sermon,assetId:'image-1',householdId:'home',store:{set:async()=>{}},reference,prompt:'Photograph Larry',apiKey:'test',fetcher:async(u,options)=>{url=u;method=options.method;body=options.body;return{ok:true,json:async()=>({data:[{b64_json:png.toString('base64')}]})}}})
 assert.match(url,/images\/edits/);assert.equal(method,'POST');assert.equal(body.get('prompt'),'Photograph Larry')
})

test('old generic photography is invalidated and a selected family subject is bound to the job',async()=>{
 let job
 const handler=createPostImageHandler({authenticate:async()=>({member:'Larry'}),repositoryFactory:()=>repository,jobFactory:()=>({get:async()=>job,setJSON:async(_key,value)=>{job=value}}),identityFactory:()=>({get:async()=>({version:'uploaded-photo-v1'})}),dispatch:async()=>({ok:true,status:202})})
 job={id:'old-job',sermonId:'sermon-1',postId:'post-1',assetId:'old',state:'ready',sourceHash:'old-generic-image'}
 const query={httpMethod:'GET',queryStringParameters:{sermonId:'sermon-1',postId:'post-1'}}
 assert.equal(JSON.parse((await handler(query)).body).state,'not-started')
 const request={httpMethod:'POST',headers:{host:'example.test'},body:JSON.stringify({sermonId:'sermon-1',postId:'post-1',subject:'Larry',regenerate:true})}
 assert.equal((await handler(request)).statusCode,202)
 assert.equal(job.subject,'Larry')
 assert.equal(job.sourceHash,postImageSourceHash(sermon,post,'Larry','uploaded-photo-v1'))
})
