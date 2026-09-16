import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultActionPermissions, normalizePermissionMatrix } from '../../netlify/lib/assistant-action-contract.mjs'
import { createAssistantActionRepository } from '../../netlify/lib/assistant-action-repository.mjs'
import { createPermissionActionResources, savePermissionsWithJournal, undoActionWithJournal } from '../../netlify/functions/brevity-assistant-actions.mjs'

function versionedBlobStore() {
  const values=new Map()
  let sequence=0
  const clone=value=>value==null?value:structuredClone(value)
  return{
    values,
    async get(key){return clone(values.get(key)?.data??null)},
    async getWithMetadata(key){const entry=values.get(key);return entry?{data:clone(entry.data),etag:entry.etag}:null},
    async setJSON(key,value,options={}){
      const current=values.get(key)
      if(options.onlyIfNew&&current)return{modified:false,etag:current.etag}
      if(options.onlyIfMatch&&current?.etag!==options.onlyIfMatch)return{modified:false,etag:current?.etag||null}
      const etag=`etag-${++sequence}`
      values.set(key,{data:clone(value),etag})
      return{modified:true,etag}
    },
  }
}

const admin={member:'Larry',role:'admin'}
const fixedNow=()=>new Date('2026-09-07T12:00:00Z')
const changedPermissions=(member,domain,value)=>{
  const matrix=normalizePermissionMatrix()
  matrix[member]={...matrix[member],[domain]:value}
  return matrix
}

test('permission persistence requires an explicit reviewed version, including a legacy version-zero record',async()=>{
  const store=versionedBlobStore()
  const legacy={...normalizePermissionMatrix(),updatedAt:'2026-09-01T12:00:00Z',updatedBy:'Larry'}
  await store.setJSON('house/permissions',legacy)
  const repository=createAssistantActionRepository({store,householdId:'house',now:fixedNow})
  assert.equal((await repository.getPermissionsState()).version,0)
  await assert.rejects(()=>repository.savePermissions(changedPermissions('Nyla','planning',false),'Larry'),error=>error.code==='VERSION_CONFLICT')
  await assert.rejects(()=>repository.savePermissions(changedPermissions('Nyla','planning',false),'Larry',null),error=>error.code==='VERSION_CONFLICT')
  const saved=await repository.savePermissions(changedPermissions('Nyla','planning',false),'Larry',0,'permission-write-1')
  assert.equal(saved.version,1)
  assert.equal(saved.Nyla.planning,false)
  await assert.rejects(()=>repository.savePermissions(changedPermissions('Nyla','calendar',false),'Larry',0,'stale-write'),error=>error.code==='VERSION_CONFLICT')
  const current=await repository.getPermissionsState()
  assert.equal(current.version,1)
  assert.equal(current.permissions.Nyla.planning,false)
  assert.equal(current.permissions.Nyla.calendar,true)
})

test('permission persistence uses the blob ETag and rejects a race at the atomic write',async()=>{
  const current={...normalizePermissionMatrix(),version:3,updatedAt:'2026-09-07T11:00:00Z',updatedBy:'Larry'}
  let writes=0
  const store={
    get:async()=>structuredClone(current),
    getWithMetadata:async()=>({data:structuredClone(current),etag:'permissions-etag-3'}),
    setJSON:async(key,_value,options)=>{
      writes+=1
      assert.equal(key,'house/permissions')
      assert.deepEqual(options,{onlyIfMatch:'permissions-etag-3'})
      return{modified:false,etag:'permissions-etag-4'}
    },
  }
  const repository=createAssistantActionRepository({store,householdId:'house',now:fixedNow})
  await assert.rejects(()=>repository.savePermissions(changedPermissions('Nyla','calendar',false),'Larry',3,'racing-write'),error=>error.code==='VERSION_CONFLICT')
  assert.equal(writes,1)
})

test('the journaled permission mutation rejects a non-administrator before writing',async()=>{
  const store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:fixedNow})
  await assert.rejects(()=>savePermissionsWithJournal({repository,matrix:changedPermissions('Nyla','projects',false),session:{member:'Nyla',role:'member'},expectedVersion:0,now:fixedNow}),error=>error.code==='FORBIDDEN')
  assert.equal(store.values.has('house/permissions'),false)
  assert.equal(store.values.has('house/history'),false)
})

test('reviewed permission changes are CAS journaled, immutably audited, retry-safe, and safely Undoable',async()=>{
  const store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:fixedNow})
  const matrix=changedPermissions('Nyla','projects',false)
  const input={repository,matrix,session:admin,expectedVersion:0,now:fixedNow,leaseMs:0,createAttemptId:()=> 'permission-attempt'}
  const first=await savePermissionsWithJournal(input)
  const repeated=await savePermissionsWithJournal(input)
  const state=await repository.getPermissionsState()
  const audit=await repository.getAudit(first.audit.id)
  assert.equal(state.version,1)
  assert.equal(state.permissions.Nyla.projects,false)
  assert.equal(first.audit.id,repeated.audit.id)
  assert.equal(audit.actor,'Larry')
  assert.equal(audit.occurredAt,'2026-09-07T12:00:00.000Z')
  assert.equal(audit.action,'permissions')
  assert.equal(audit.undoAvailable,true)
  assert.equal(audit.changes[0].resource,'shared:assistant-action-permissions')
  assert.equal(audit.changes[0].beforeVersion,0)
  assert.equal(audit.changes[0].afterVersion,1)
  assert.equal(audit.changes[0].before.Nyla.projects,true)
  assert.equal(audit.changes[0].after.Nyla.projects,false)
  assert.match(audit.operations[0].description,/Disabled projects access for Nyla/)
  assert.equal((await repository.history()).filter(item=>item.id===audit.id).length,1)

  const resources=createPermissionActionResources(repository)
  const undone=await undoActionWithJournal({repository,auditId:audit.id,session:admin,resources,event:{},now:fixedNow,leaseMs:0,createAttemptId:()=> 'undo-attempt'})
  const restored=await repository.getPermissionsState()
  assert.equal(restored.version,2)
  assert.equal(restored.permissions.Nyla.projects,true)
  assert.equal((await repository.getAudit(audit.id)).undoAvailable,false)
  assert.equal(undone.audit.action,'undo')
})

test('permission Undo stops before writing when a newer permission version exists',async()=>{
  const store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:fixedNow})
  const change=await savePermissionsWithJournal({repository,matrix:changedPermissions('Nyla','calendar',false),session:admin,expectedVersion:0,now:fixedNow,leaseMs:0})
  const latest=(await repository.getPermissionsState()).permissions
  latest.Lorenzo={...latest.Lorenzo,planning:false}
  await repository.savePermissions(latest,'Larry',1,'newer-permission-write')
  const beforeUndo=await repository.getPermissionsState()
  await assert.rejects(()=>undoActionWithJournal({repository,auditId:change.audit.id,session:admin,resources:createPermissionActionResources(repository),event:{},now:fixedNow,leaseMs:0}),error=>error.code==='VERSION_CONFLICT')
  const afterUndo=await repository.getPermissionsState()
  assert.equal(afterUndo.version,beforeUndo.version)
  assert.deepEqual(afterUndo.permissions,beforeUndo.permissions)
})

test('the permission editor sends version and confirmation, filters metadata, and refreshes App permission state',async()=>{
  const [{readFile},{fileURLToPath}]=await Promise.all([import('node:fs/promises'),import('node:url')])
  const assistant=await readFile(fileURLToPath(new URL('./BrevityAssistant.jsx',import.meta.url)),'utf8')
  const api=await readFile(fileURLToPath(new URL('./assistantApi.js',import.meta.url)),'utf8')
  const app=await readFile(fileURLToPath(new URL('../App.jsx',import.meta.url)),'utf8')
  const endpoint=await readFile(fileURLToPath(new URL('../../netlify/functions/brevity-assistant-actions.mjs',import.meta.url)),'utf8')
  assert.match(api,/saveActionPermissions\(permissions,expectedVersion,confirmation\)/)
  assert.match(assistant,/data\.permissionVersion,permissionConfirmation/)
  assert.match(assistant,/Type CONFIRM to save member permissions/)
  assert.match(assistant,/Object\.entries\(permissions\)\.filter/)
  assert.match(assistant,/typeof domains==='object'/)
  assert.match(assistant,/setPermissions\(data\.permissions\|\|\{\}\)/)
  assert.match(app,/setActionPermissionRevision\(value=>value\+1\)/)
  assert.match(app,/onActionCompleted=\{handleActionCompleted\}/)
  assert.match(endpoint,/session\.role!=='admin'.*administrator access is required to change Action Mode permissions/)
  assert.match(endpoint,/body\.confirmation!=='CONFIRM'/)
  assert.deepEqual(defaultActionPermissions('admin'),{planning:true,calendar:true,projects:true,finance:true})
})
