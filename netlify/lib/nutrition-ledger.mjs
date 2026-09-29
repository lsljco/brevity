export const NUTRIENTS=['calories','proteinGrams','carbohydrateGrams','fatGrams']
export const OPTIONAL_NUTRIENTS=['fiberGrams','sugarGrams','sodiumMilligrams']

export function dailyNutrition(record, member, date) {
  const entries=(record?.member===member&&record?.date===date&&Array.isArray(record.entries)?record.entries:[])
    .filter(entry=>entry.member===member&&entry.date===date)
  const totals=Object.fromEntries(NUTRIENTS.map(key=>[key,Number(entries.reduce((sum,entry)=>sum+Number(entry.macros?.[key]||0),0).toFixed(1))]))
  const optionalTotals=Object.fromEntries(OPTIONAL_NUTRIENTS.map(key=>[key,entries.length&&entries.every(entry=>typeof entry.nutrients?.[key]==='number'&&Number.isFinite(entry.nutrients[key]))?Number(entries.reduce((sum,entry)=>sum+entry.nutrients[key],0).toFixed(1)):null]))
  return{member,date,entries,totals,optionalTotals,updatedAt:record?.updatedAt||'',notice:'Totals include only meals confirmed and saved in Brevity. Nutrition values are estimates; compare branded foods with their labels. Optional nutrient totals appear only when every saved food has a reliable value.'}
}
