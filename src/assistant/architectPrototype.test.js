import test from 'node:test'
import assert from 'node:assert/strict'
import {approvedPrototypePacket,requestArchitectPrototype} from '../../netlify/lib/architect-prototype.mjs'
const record={id:'fixture',stage:'implementation-planned',updatedBy:'Larry',updatedAt:'2026-09-29',title:'Fixture',problem:'Reported issue',requirements:'Improve contrast',userStories:'Readable notes',dataChanges:'None',permissionChanges:'None',testPlan:'Contrast and build',rolloutPlan:'Isolated preview',rollbackPlan:'Revert commit'}
test('prototype dispatch requires approved implementation, authorized administrator and configured production integration',async()=>{
 assert.throws(()=>approvedPrototypePacket({...record,stage:'proposed'}),/approve/)
 assert.throws(()=>approvedPrototypePacket({...record,updatedBy:'Terica'}),/approve/)
 const base={record,member:'Larry',role:'admin',preview:false}
 await assert.rejects(()=>requestArchitectPrototype({...base,member:'Isaiah'}),/Only Larry or Lorenzo/)
 await assert.rejects(()=>requestArchitectPrototype({...base,preview:true}),/disabled in deploy previews/)
 await assert.rejects(()=>requestArchitectPrototype({...base,token:''}),/not connected/)
})
test('prototype dispatch is idempotent, sends approved fields only and never reports implementation success',async()=>{
 const values=new Map(),store={get:async key=>values.get(key),setJSON:async(key,value,options={})=>{if(options.onlyIfNew&&values.has(key))return{modified:false};values.set(key,value);return{modified:true}}};let calls=0,payload
 const args={record:{...record,privateChat:'must not transmit'},member:'Larry',role:'admin',preview:false,token:'test-only',store,fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.github.com/repos/lsljco/brevity/actions/workflows/architect-prototype.yml/dispatches');payload=JSON.parse(options.body);return{status:204}}}
 const first=await requestArchitectPrototype(args),second=await requestArchitectPrototype(args)
 assert.equal(calls,1);assert.equal(first.state,'dispatched');assert.equal(second.id,first.id);assert.match(first.notice,/not an implemented feature/)
 assert.equal(payload.ref,'main');assert.equal(JSON.parse(payload.inputs.packet).privateChat,undefined)
})
test('uncertain dispatch is retained and never automatically repeated',async()=>{
 const values=new Map(),store={get:async key=>values.get(key),setJSON:async(key,value)=>{values.set(key,value);return{modified:true}}};let calls=0
 const args={record,member:'Larry',role:'admin',preview:false,token:'test-only',store,fetcher:async()=>{calls++;throw Error('timeout')}}
 assert.equal((await requestArchitectPrototype(args)).state,'dispatch-unknown');await requestArchitectPrototype(args);assert.equal(calls,1)
})

test('trusted prototype patch checker rejects dependency and workflow changes',async()=>{
 const {mkdtemp,writeFile,mkdir,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),path=await import('node:path'),{spawnSync}=await import('node:child_process')
 const root=await mkdtemp(path.join(tmpdir(),'brevity-prototype-scope-')),checker=path.resolve('scripts/architect/check-patch.mjs')
 const git=(...args)=>{const result=spawnSync('git',args,{cwd:root});assert.equal(result.status,0,result.stderr.toString())}
 try{
  git('init','-q');await mkdir(path.join(root,'src'));await writeFile(path.join(root,'src','Example.jsx'),'export default function Example(){return null}\n');git('add','src')
  assert.equal(spawnSync(process.execPath,[checker],{cwd:root}).status,0)
  await mkdir(path.join(root,'netlify/functions'),{recursive:true});await writeFile(path.join(root,'netlify/functions/package.json'),'{}');git('add','netlify')
  assert.notEqual(spawnSync(process.execPath,[checker],{cwd:root}).status,0)
  git('rm','--cached','netlify/functions/package.json');await mkdir(path.join(root,'.github/workflows'),{recursive:true});await writeFile(path.join(root,'.github/workflows/unsafe.yml'),'name: forbidden');git('add','.github')
  assert.notEqual(spawnSync(process.execPath,[checker],{cwd:root}).status,0)
 }finally{await rm(root,{recursive:true,force:true})}
})
