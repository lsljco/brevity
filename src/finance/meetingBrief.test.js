import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import {buildMeetingPacket} from './meetingPackets.js'
import {effectiveMeetingPacket} from './meetingPacketIntelligence.js'
import {meetingBrief,meetingBriefReport,MEETING_DESIGNS} from './meetingBrief.js'
import {xlsxBytes} from './financeExportFiles.js'
const make=cadence=>effectiveMeetingPacket(buildMeetingPacket({cadence,now:new Date('2026-10-28T15:00:00Z'),accounts:[{id:'a',name:'Operating',type:'checking',balance:1000,plaidAccountId:'secret-bank-id'}],actuals:[{id:'t',accountId:'secret-bank-id',date:'2026-10-28',amount:25,name:'Food',category:'Food'}],actions:[{text:'Review bill',owner:'Larry',status:'open'}]}),{})
test('every cadence shares live brief and curated export without leaking bank identifiers',async()=>{
 for(const cadence of Object.keys(MEETING_DESIGNS)){
  const p=make(cadence),brief=meetingBrief(p),report=meetingBriefReport(p)
  assert.equal(brief.metrics.length,4);assert.equal(brief.agenda.length,3)
  const zip=await JSZip.loadAsync(await xlsxBytes(report)),workbook=await zip.file('xl/workbook.xml').async('string')
  assert.equal((workbook.match(/<sheet /g)||[]).length,5)
  assert.match(workbook,new RegExp(`name="${p.label}"`))
  const sheet=await zip.file('xl/worksheets/sheet1.xml').async('string')
  assert.match(sheet,/BREVITY/);assert.match(sheet,/Review bill/);assert.match(sheet,/Date needed/)
  assert.doesNotMatch(sheet,/secret-bank-id|NaN|undefined|#REF!/)
  assert.match(await zip.file('xl/styles.xml').async('string'),/FF243126/)
 }
})
test('missing data stays unknown and reconciled payments are excluded from the scenario',()=>{
 const absent=meetingBrief(effectiveMeetingPacket(buildMeetingPacket({cadence:'daily'}),{}))
 assert.equal(absent.forecast,null);assert.equal(absent.obligations,null)
 const p=make('daily');p.payables=[{amount:50,status:'Reconciled to posted charge'},{amount:100,status:'Projected',title:'Bill',date:'2026-10-28'}];p.projectedInflows=[{amount:200}]
 assert.equal(meetingBrief(p).forecast,1100)
 p.pendingItems=[{amount:100}];assert.equal(meetingBrief(p).forecast,1100)
 p.cashBalance=null;assert.equal(meetingBrief(p).forecast,null)
})
test('yearly view groups actual months and preserves unknown totals',()=>{
 const p=make('yearly');p.monthly=[{month:'2026-01',income:100,net:80},{month:'2026-02',income:null,net:null}]
 assert.deepEqual(meetingBrief(p).table.rows,[['2026 Q1','Unavailable','Unavailable']])
})
