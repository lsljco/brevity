import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Education router preserves the existing Pillar Analysis core implementation',async()=>{
 const router=await readFile(new URL('./PillarAnalysis.jsx',import.meta.url),'utf8')
 const core=await readFile(new URL('./PillarAnalysisCore.jsx',import.meta.url),'utf8')
 assert.match(router,/IsaiahDailyTutor/)
 assert.match(router,/PillarAnalysisCore/)
 assert.match(core,/Meaningful Next Moves/)
 assert.match(core,/Questions Worth Considering/)
 assert.match(core,/How Progress Will Show/)
})
