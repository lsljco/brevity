const fail=(message,status=400)=>Object.assign(new Error(message),{status})
export function validateBarcode(value) {
  const code=String(value||'').replace(/[\s-]/g,'')
  if(!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code))throw fail('Enter an 8, 12, 13 or 14 digit product barcode.')
  let sum=0
  for(let i=code.length-2,weight=3;i>=0;i--,weight=weight===3?1:3)sum+=Number(code[i])*weight
  if((10-sum%10)%10!==Number(code.at(-1)))throw fail('The barcode check digit is invalid. Check the printed digits.')
  return code
}
const number=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null
export function productDraft(product,code) {
  const nutrients=product?.nutriments||{}
  const serving=String(product?.serving_size||'').trim()
  // Do not mislabel per-100g values as one bottle or infer density/serving units.
  const macros={calories:number(nutrients['energy-kcal_serving']),proteinGrams:number(nutrients.proteins_serving),carbohydrateGrams:number(nutrients.carbohydrates_serving),fatGrams:number(nutrients.fat_serving)}
  if(!serving)for(const key of Object.keys(macros))macros[key]=null
  return {barcode:code,name:[product?.brands,product?.product_name].filter(Boolean).join(' — ').slice(0,240),serving,macros,
    sourceUrl:`https://world.openfoodfacts.org/product/${code}`,sourceName:'Open Food Facts',
    warnings:['Check the exact flavor, package size and all values against your label. Community data may be incomplete or outdated.',...(!serving||Object.values(macros).some(value=>value===null)?['Some serving or nutrition data is missing. Enter it from the package before saving.']:[])]}
}
export async function lookupPackagedFood(value,{fetcher=globalThis.fetch}={}) {
  const code=validateBarcode(value)
  const response=await fetcher(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,brands,serving_size,nutriments`,{headers:{'User-Agent':'Brevity/1.0 (https://brevityoflife.netlify.app)'},signal:AbortSignal.timeout(10000)})
  if(!response.ok)throw fail('Product lookup is unavailable. Enter the package label manually.',502)
  const payload=await response.json()
  if(payload.status!==1||!payload.product)throw fail('Barcode not found. Photograph the nutrition label or enter it manually.',404)
  return productDraft(payload.product,code)
}
