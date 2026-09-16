import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('education authoritative record cannot be wired to direct browser persistence',async()=>{
 const source=await readFile(new URL('./educationRecord.js',import.meta.url),'utf8')
 assert.doesNotMatch(source,/localStorage|sessionStorage|setItem\(|getStore\(|fetch\(/)
 assert.match(source,/applyCompletedTutorSession/)
})
