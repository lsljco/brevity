import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'
import { durationMinutes, fetchRecipeHtml, isPublicAddress, normalizeRecipeUrl, parseRecipeHtml, parseRecipeYield, pinnedLookup } from '../../netlify/lib/recipe-import.mjs'

const response = (body, {statusCode=200,headers={'content-type':'text/html; charset=utf-8'}} = {}) => Object.assign(Readable.from([body]), {statusCode,headers})

const recipeHtml = `<!doctype html><html><head>
  <meta property="og:image" content="/fallback.jpg">
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":["Recipe","NewsArticle"],"name":"Fluffy &amp; Golden Pancakes","description":"A <strong>family</strong> breakfast.","recipeCategory":["Breakfast"],"recipeIngredient":["2 cups Pearl Milling Company pancake mix","1 cup water","1 stick salted butter"],"prepTime":"PT5M","cookTime":"PT15M","totalTime":"PT20M","recipeYield":"12 pancakes","image":{"url":"/pancakes.jpg"}}]}</script>
</head></html>`

test('structured recipe import populates editable meal fields from nested JSON-LD', () => {
  const result = parseRecipeHtml(recipeHtml,'https://recipes.example.com/breakfast/pancakes')
  assert.equal(result.name,'Fluffy & Golden Pancakes')
  assert.equal(result.description,'A family breakfast.')
  assert.equal(result.mealType,'breakfast')
  assert.deepEqual(result.ingredients,['2 cups Pearl Milling Company pancake mix','1 cup water','1 stick salted butter'])
  assert.deepEqual([result.prepMinutes,result.cookMinutes,result.totalMinutes],[5,15,20])
  assert.deepEqual([result.yieldQuantity,result.yieldUnit],[12,'pancakes'])
  assert.equal(result.image,'https://recipes.example.com/pancakes.jpg')
  assert.equal(result.sourceName,'recipes.example.com')
  assert.deepEqual(result.missingFields,[])
})

test('recipe duration and yield normalization retain missing data for household review', () => {
  assert.equal(durationMinutes('P1DT2H30M'),1590)
  assert.deepEqual(parseRecipeYield('Serves 6'),{yieldQuantity:6,yieldUnit:'servings'})
  const html=`<script type="application/ld+json">{"@type":"Recipe","name":"Soup","recipeIngredient":["2 cups broth"]}</script>`
  const result=parseRecipeHtml(html,'https://example.com/soup')
  assert.deepEqual(result.missingFields,['prep time','cook time','batch yield'])
})

test('recipe parsing never silently drops ingredient lines', () => {
  const ingredients=Array.from({length:31},(_,index)=>`Ingredient ${index+1}`)
  const html=`<script type="application/ld+json">${JSON.stringify({'@type':'Recipe',name:'Large recipe',recipeIngredient:ingredients})}</script>`
  assert.throws(()=>parseRecipeHtml(html,'https://example.com/large-recipe'),/more than 30 ingredient lines/i)
})

test('recipe importer rejects local, private and non-web destinations', () => {
  for(const address of ['127.0.0.1','10.0.0.2','169.254.169.254','192.168.1.4','::1','fd00::1'])assert.equal(isPublicAddress(address),false)
  assert.equal(isPublicAddress('93.184.216.34'),true)
  assert.throws(()=>normalizeRecipeUrl('file:///etc/passwd'),/http and https/i)
  assert.throws(()=>normalizeRecipeUrl('https://localhost/recipe'),/not available/i)
  assert.throws(()=>normalizeRecipeUrl('https://example.com:8443/recipe'),/standard website ports/i)
})

test('recipe retrieval pins a validated public address and revalidates redirects', async () => {
  const lookups=[]
  const requests=[]
  const lookup=async hostname=>{lookups.push(hostname);return hostname==='recipes.example.com'?[{address:'93.184.216.34',family:4}]:[{address:'127.0.0.1',family:4}]}
  await assert.rejects(fetchRecipeHtml('https://recipes.example.com/start',{lookup,requester:async(url,options)=>{
    requests.push({url:url.toString(),options})
    return response('',{statusCode:302,headers:{location:'http://127.0.0.1/private'}})
  }}),/private or local/i)
  assert.deepEqual(lookups,['recipes.example.com'])
  assert.equal(requests[0].options.lookup instanceof Function,true)
  await new Promise((resolve,reject)=>requests[0].options.lookup('ignored',{},(error,address,family)=>error?reject(error):(assert.deepEqual([address,family],['93.184.216.34',4]),resolve())))
})

test('pinned DNS lookup supports modern Node all-address requests', async () => {
  const lookup=pinnedLookup({address:'93.184.216.34',family:4})
  await new Promise((resolve,reject)=>lookup('ignored',{all:true},(error,addresses)=>error?reject(error):(assert.deepEqual(addresses,[{address:'93.184.216.34',family:4}]),resolve())))
})

test('recipe retrieval accepts bounded HTML from a public website', async () => {
  const result=await fetchRecipeHtml('https://recipes.example.com/pancakes',{lookup:async()=>[{address:'93.184.216.34',family:4}],requester:async(_url,options)=>{
    await new Promise((resolve,reject)=>options.lookup('ignored',{all:true},(error,addresses)=>error?reject(error):(assert.deepEqual(addresses,[{address:'93.184.216.34',family:4}]),resolve())))
    return response(recipeHtml)
  }})
  assert.match(result.html,/Fluffy/)
  assert.equal(result.sourceUrl,'https://recipes.example.com/pancakes')
})
