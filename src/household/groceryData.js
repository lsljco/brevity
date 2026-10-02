export const GROCERY_CATEGORIES = ['Food & Pantry','Paper Goods','Toiletries','Cleaning','Laundry','Pet Care','Other']
const units={cups:'cup',cup:'cup',tablespoon:'tbsp',tablespoons:'tbsp',tbsp:'tbsp',teaspoon:'tsp',teaspoons:'tsp',tsp:'tsp',ounce:'oz',ounces:'oz',oz:'oz',pound:'lb',pounds:'lb',lb:'lb',lbs:'lb',gram:'g',grams:'g',g:'g',kilogram:'kg',kilograms:'kg',kg:'kg',ml:'ml',milliliters:'ml',liter:'l',liters:'l',l:'l',clove:'clove',cloves:'clove',slice:'slice',slices:'slice',bottle:'bottle',bottles:'bottle',can:'can',cans:'can',package:'package',packages:'package'}
const key=value=>String(value).toLowerCase().replace(/\s+/g,' ').trim()
const fraction=value=>value.includes('/')?Number(value.split('/')[0])/Number(value.split('/')[1]):Number(value)
export function parseGroceryIngredient(line){
 const text=String(line||'').trim().replace(/(\d)([¼½¾⅓⅔⅛⅜⅝⅞])/g,'$1 $2').replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g,c=>({'¼':'1/4','½':'1/2','¾':'3/4','⅓':'1/3','⅔':'2/3','⅛':'1/8','⅜':'3/8','⅝':'5/8','⅞':'7/8'}[c]))
 const match=text.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s+(.+)$/)
 if(!match)return {name:text,amount:null,unit:''}
 const amount=match[1].split(/\s+/).reduce((sum,v)=>sum+fraction(v),0)
 if(!Number.isFinite(amount)||amount<=0)return {name:text,amount:null,unit:''}
 const rest=match[2],word=rest.split(/\s+/)[0].toLowerCase(),unit=units[word]||''
 // Keep preparation, brands, alternatives and sizes intact; never guess conversions.
 const name=unit?rest.slice(word.length).trim():rest
 if(!name||/^[–-]|^to\s/.test(name))return {name:text,amount:null,unit:''}
 return {name,amount,unit}
}
export function proposeWeeklyGroceries(days,servings=1){
 if(!Number.isFinite(servings)||servings<=0||servings>100)throw Error('Choose between 0 and 100 servings per meal.')
 const grouped=new Map(),missing=[]
 for(const day of days||[])for(const [slot,meal] of Object.entries(day.resolvedMeals||{})){
  if(!meal){missing.push(`${day.date}: ${slot} has no saved meal.`);continue}
  const lines=meal.ingredients?.filter(Boolean)||[]
  const servingOnly=lines.length===1&&lines[0]===meal.serving
  const ingredients=servingOnly?[`${servings} ${meal.name} — ${meal.serving} each`]:lines
  if(!ingredients.length){missing.push(`${day.date}: ${meal.name} has no ingredient list.`);continue}
  const yieldQuantity=Number(meal.yieldQuantity)||1
  for(const line of ingredients){
   const parsed=parseGroceryIngredient(line),groupKey=key(`${parsed.name}|${parsed.unit}`)
   const row=grouped.get(groupKey)||{id:groupKey,name:parsed.name,unit:parsed.unit,amount:0,unmeasured:false,sources:[],category:'Food & Pantry',selected:false}
   if(parsed.amount==null)row.unmeasured=true
   else row.amount+=parsed.amount*(servingOnly?1:servings/yieldQuantity)
   const source=`${day.date} · ${meal.name}`
   if(!row.sources.includes(source))row.sources.push(source)
   grouped.set(groupKey,row)
  }
 }
 return {items:[...grouped.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(row=>({...row,quantity:row.unmeasured?'As needed':`${Number(row.amount.toFixed(3))}${row.unit?' '+row.unit:''}`,sourceKey:`${days?.[0]?.date}|${row.id}`})),missing}
}
