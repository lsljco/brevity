export const NUTRIENTS=['calories','proteinGrams','carbohydrateGrams','fatGrams']

export function dailyNutrition(record, member, date) {
  const entries=(record?.member===member&&record?.date===date&&Array.isArray(record.entries)?record.entries:[])
    .filter(entry=>entry.member===member&&entry.date===date)
  const totals=Object.fromEntries(NUTRIENTS.map(key=>[key,Number(entries.reduce((sum,entry)=>sum+Number(entry.macros?.[key]||0),0).toFixed(1))]))
  return{member,date,entries,totals,updatedAt:record?.updatedAt||'',notice:'Totals include only meals confirmed and saved in Brevity. Nutrition values are estimates; compare branded foods with their labels.'}
}
