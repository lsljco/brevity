import {Agent,Runner,webSearchTool,user} from '@openai/agents'

const sourceSchema={type:'object',additionalProperties:false,required:['urls'],properties:{urls:{type:'array',maxItems:3,items:{type:'string'}}}}

// A focused discovery task sees only a product description, never household
// records or conversation history. It returns candidates, not verified macros.
export async function findProductNutritionSources(product,{model,runner=new Runner({tracingDisabled:true})}={}){
  const agent=new Agent({
    name:'Product nutrition source finder',model,
    instructions:'Find current product-specific Nutrition Facts pages for the exact packaged food and package variant requested. Search the exact product name. Prefer its manufacturer product page; if the label is an image or unavailable in text, also find a matching established grocery retailer product page. Brand homepages, recipe PDFs, general meal plans and search-result pages are not nutrition labels. Search a second focused query if the first only finds those. Return up to three actual product-page URLs discovered by web_search, ordered by relevance. Never invent URLs. Return an empty list when nothing relevant is found. Only research the supplied product; do not calculate nutrition or request household details.',
    tools:[webSearchTool({searchContextSize:'high'})],
    outputType:{type:'json_schema',name:'product_nutrition_sources',strict:true,schema:sourceSchema},
    modelSettings:{store:false,maxTokens:1200},
  })
  const result=await runner.run(agent,[user(String(product).slice(0,240))],{maxTurns:4})
  return [...new Set(result.finalOutput?.urls||[])].filter(value=>{try{return new URL(value).protocol==='https:'}catch{return false}}).slice(0,3)
}
