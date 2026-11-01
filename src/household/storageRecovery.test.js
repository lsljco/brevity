import test from 'node:test'
import assert from 'node:assert/strict'
import {archiveLocalRecoveryCopies,archiveRecoveryCopy} from './storageRecovery.js'
const storage = entries => { const data=new Map(entries);return {getItem:k=>data.get(k)??null,removeItem:k=>data.delete(k),setItem:(k,v)=>data.set(k,v)} }
test('archives full recovery copies before reclaiming space and leaves live data intact',async()=>{
 const s=storage([['finance','live'],['finance_backup','old'],['finance_server_conflict','conflict'],['other_backup','unrelated']]), archived=[]
 await archiveLocalRecoveryCopies(s,['finance'],async(k,v)=>{assert.equal(s.getItem(k),v);archived.push([k,v])})
 assert.deepEqual(archived,[['finance_backup','old'],['finance_server_conflict','conflict']])
 assert.equal(s.getItem('finance_backup'),null);assert.equal(s.getItem('finance'),'live');assert.equal(s.getItem('other_backup'),'unrelated')
})
test('failed archive never removes a recovery copy',async()=>{
 const s=storage([['finance_backup','unsynced']])
 await assert.rejects(archiveLocalRecoveryCopies(s,['finance'],async()=>{throw Error('quota')}))
 assert.equal(s.getItem('finance_backup'),'unsynced')
})
test('a newer cross-tab recovery copy is preserved',async()=>{
 const s=storage([['finance_backup','old']])
 await archiveLocalRecoveryCopies(s,['finance'],async()=>s.setItem('finance_backup','new'))
 assert.equal(s.getItem('finance_backup'),'new')
})
test('unavailable IndexedDB fails without pretending persistence succeeded',async()=>{
 await assert.rejects(archiveRecoveryCopy('key','data',null),/unavailable/)
})
