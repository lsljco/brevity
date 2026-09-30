import test from 'node:test'
import assert from 'node:assert/strict'
import {messageBlocks,safeSourceUrl,messageSpeech} from './messageFormatting.js'

test('source links accept HTTP URLs but reject executable, credentialed and malformed destinations',()=>{
  assert.equal(safeSourceUrl('https://usa.fage/products/yogurt/fage-total-0'),'https://usa.fage/products/yogurt/fage-total-0')
  for(const value of ['javascript:alert(1)','data:text/html,test','file:///tmp/file','//example.com','https://user:secret@example.com','https://example.com\n.evil.test','https://'])assert.equal(safeSourceUrl(value),null)
})
test('comparison tables preserve portion values, alignment, escaped pipes and following prose',()=>{
  const blocks=messageBlocks('**Comparison**\n| Food | Amount |\n| :--- | ---: |\n| A \\| B | **1.5×** |\n\nSource note')
  assert.deepEqual(blocks[1],{type:'table',header:['Food','Amount'],align:['left','right'],rows:[['A | B','**1.5×**']]})
  assert.deepEqual(blocks[2],{type:'p',text:'Source note'})
})
test('ordinary pipe text and malformed table rows are retained instead of silently discarded',()=>{
  const blocks=messageBlocks('A | B\nnot a divider\n| A | B |\n| --- | --- |\n| one | two | extra |')
  assert.equal(blocks[0].type,'p')
  assert.equal(blocks[2].type,'table')
  assert.equal(blocks[3].text,'| one | two | extra |')
})

test('spoken tables retain every column/value and read source labels without URL syntax',()=>{
  assert.equal(messageSpeech('**Comparison**\n| Food | Protein | Sodium |\n| --- | ---: | ---: |\n| Cup | 16g | 55mg |\n| Tub | 27g | 97.5mg |\n[Manufacturer](https://usa.fage/example)'), 'Comparison\nFood: Cup. Protein: 16g. Sodium: 55mg.\nFood: Tub. Protein: 27g. Sodium: 97.5mg.\nManufacturer')
  assert.equal(messageSpeech('Review this task for Larry at 6:00 PM. Say approve or cancel.'),'Review this task for Larry at 6:00 PM. Say approve or cancel.')
})
