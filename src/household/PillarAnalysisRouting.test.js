import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Education and Physical Fitness use purpose-built daily experiences while other pillars preserve the analysis core',async()=>{
 const router=await readFile(new URL('./PillarAnalysis.jsx',import.meta.url),'utf8')
 const core=await readFile(new URL('./PillarAnalysisCore.jsx',import.meta.url),'utf8')
 assert.match(router,/IsaiahDailyTutor/)
 assert.match(router,/DailyFitnessWorkout/)
 assert.match(router,/pillar\?\.id === 'fitness'/)
 assert.match(router,/PillarAnalysisCore/)
 assert.match(core,/Meaningful Next Moves/)
 assert.match(core,/Questions Worth Considering/)
 assert.match(core,/How Progress Will Show/)
})
