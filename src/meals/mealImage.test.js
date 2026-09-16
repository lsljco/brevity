import assert from 'node:assert/strict'
import test from 'node:test'
import { assertMealImagePng, buildMealImagePrompt, generateMealImage, mealImageKey } from '../../netlify/lib/meal-image.mjs'

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3])

test('meal image prompt preserves the selected dish and premium library aesthetic', () => {
  const prompt=buildMealImagePrompt({name:'Salmon, rice, and broccoli',description:'Seared salmon with vegetables.',ingredients:['6 oz salmon','1 cup rice','1 cup broccoli']})
  assert.match(prompt,/Salmon, rice, and broccoli/)
  assert.match(prompt,/6 oz salmon/)
  assert.match(prompt,/ultra-photorealistic/)
  assert.match(prompt,/deep black and navy/)
  assert.match(prompt,/antique-gold/)
  assert.match(prompt,/No people, hands, words/)
})

test('generated meal images are PNG-validated, stored separately, and returned as authenticated asset URLs', async () => {
  const prior=process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY='test-key'
  const writes=[]
  try{
    const url=await generateMealImage({
      meal:{name:'Steak dinner',ingredients:['ribeye steak']},assetId:'custom-dinner-123',householdId:'house',
      store:{set:async(key,bytes)=>writes.push({key,bytes:Buffer.from(bytes)})},
      fetcher:async(_url,options)=>({ok:true,json:async()=>({data:[{b64_json:png.toString('base64')}]}),options}),
    })
    assert.equal(url,'/.netlify/functions/meal-images?id=custom-dinner-123')
    assert.equal(writes[0].key,mealImageKey('house','custom-dinner-123'))
    assert.deepEqual(writes[0].bytes,png)
  }finally{
    if(prior===undefined)delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY=prior
  }
})

test('meal image generation rejects non-PNG output before storage', () => {
  assert.throws(()=>assertMealImagePng(Buffer.from('not an image')),/generated PNG meal images only/)
})
