import test from 'node:test'
import assert from 'node:assert/strict'
import {analyzeMealImage,validateMealImageImport} from '../../netlify/lib/meal-image-import.mjs'

const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,0,1,2,3]).toString('base64')
test('image import rejects disguised and oversize files before AI analysis',()=>{
  assert.throws(()=>validateMealImageImport({mimeType:'image/png',imageBase64:jpeg}),/contents/)
  assert.throws(()=>validateMealImageImport({mimeType:'image/jpeg',imageBase64:'abc'}),/contents|smaller/)
})
test('image import keeps three distinct plates and null for an unreadable macro',async()=>{
  const previous=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only'
  try{
    const result=await analyzeMealImage({mimeType:'image/jpeg',imageBase64:jpeg},{fetcher:async(_url,options)=>{
      const request=JSON.parse(options.body)
      assert.equal(request.store,false)
      assert.equal(request.input[0].content[1].type,'input_image')
      assert.match(request.input[0].content[0].text,/up to 30 separate meals/)
      assert.match(request.instructions,/optional carb variant/)
      return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({meals:[
        {name:'Strip steak',ingredients:['Steak','Green beans'],serving:'plate',calories:460,proteinGrams:54,carbohydrateGrams:21,fatGrams:20,warnings:[]},
        {name:'Brisket',ingredients:['Brisket','Potatoes'],serving:'plate',calories:520,proteinGrams:52,carbohydrateGrams:37,fatGrams:18,warnings:[]},
        {name:'Chicken',ingredients:['Chicken','Rice'],serving:'plate',calories:430,proteinGrams:47,carbohydrateGrams:null,fatGrams:12,warnings:['Carbs illegible']},
      ],warnings:[]})}]}]})}
    }})
    assert.equal(result.meals.length,3)
    assert.equal(result.meals[0].macros.proteinGrams,54)
    assert.equal(result.meals[2].macros.carbohydrateGrams,null)
    assert.equal(result.meals[0].mealType,'lunch')
  }finally{if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous}
})
