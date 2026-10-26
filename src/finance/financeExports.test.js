import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import {createRequire} from 'node:module'
import {csvText,recordsSection,modelSections,transactionSection} from './financeExportData.js'
import {xlsxBytes,pdfBytes} from './financeExportFiles.js'
import {consolidateBudgetLines} from './budgetBreakdown.js'
const require=createRequire(import.meta.url)
const parsePdf=require('pdf-parse/lib/pdf-parse.js')
const report={title:'Budget October',notes:['Selected account only'],sections:[recordsSection('Housing',[{category:'HOA Dues',budget:100,actual:25},{category:'=unsafe,"name"\ncontinued',budget:-20,actual:0}],['category','budget','actual'])]}

test('consolidation sums stable record targets and allocations without changing the records',()=>{
 const lines=[{id:'a',name:'HOA Dues',budget:100,actual:20},{id:'b',name:' HOA   Dues ',budget:200,actual:30},{id:'c',name:'Insurance',budget:80,actual:0}]
 const original=structuredClone(lines)
 assert.deepEqual(consolidateBudgetLines(lines,l=>l.budget,l=>l.actual),[{name:'HOA Dues',budget:300,actual:50},{name:'Insurance',budget:80,actual:0}])
 assert.deepEqual(lines,original)
})
test('CSV preserves numbers, multiline labels and quotes while protecting formula-like strings',()=>{
 const csv=csvText(report)
 assert.ok(csv.startsWith('\ufeff'))
 assert.ok(csv.includes('"HOA Dues","100","25"'))
 assert.ok(csv.includes('"\'=unsafe,""name""\ncontinued","-20","0"'))
})
test('XLSX holds numeric amounts, literal strings and valid unique sheet references',async()=>{
 const zip=await JSZip.loadAsync(await xlsxBytes({...report,sections:[...report.sections,...report.sections]}))
 const sheet=await zip.file('xl/worksheets/sheet2.xml').async('string')
 assert.match(sheet,/<c r="B2"><v>100<\/v><\/c>/)
 assert.match(sheet,/<c r="B3"><v>-20<\/v><\/c>/)
 assert.match(sheet,/t="inlineStr"/)
 assert.doesNotMatch(sheet,/<f>/)
 assert.match(await zip.file('xl/workbook.xml').async('string'),/name="Housing 2"/)
})
test('PDF includes the last row of a long report with multiple pages and repeated headings',async()=>{
 const rows=Array.from({length:160},(_,i)=>({category:`Category ${i}`,budget:i+.25,actual:i}))
 const bytes=await pdfBytes({title:'Long budget report',notes:['October 2026'],sections:[recordsSection('Categories',rows)]})
 const parsed=await parsePdf(new Uint8Array(bytes))
 assert.ok(parsed.numpages>1)
 assert.match(parsed.text,/Category 159/)
 assert.match(parsed.text,/159.25/)
 assert.match(parsed.text,/continued/)
})
test('nested report tables retain amounts and source labels; scheduled details are never labelled posted',()=>{
 const sections=modelSections({vendors:[{name:'Example',activity:[{amount:12}]}]})
 assert.ok(sections.some(s=>s.rows.some(r=>r.includes(12))))
 const section=transactionSection([{name:'Fuel',date:'2026-10-01',amount:40,accountId:'bank-a'}],[{id:'a',plaidAccountId:'bank-a',name:'Checking'}],{scheduled:true})
 assert.ok(section.rows[0].includes('Scheduled'))
 assert.ok(section.rows[0].includes('Checking'))
 assert.ok(!section.rows[0].includes('Posted'))
})
