const key = value => String(value || '').trim().toLowerCase()
export function categoryId(name) { let hash=2166136261;for(const c of key(name))hash=Math.imul(hash^c.charCodeAt(0),16777619);return `category-${(hash>>>0).toString(16)}` }
export function resolveCategory(name, catalog=[]) { return catalog.find(row=>[row.name,...(row.aliases||[])].some(value=>key(value)===key(name)))?.name || name }
export function categoryRows(names=[],catalog=[]) {
 const rows=new Map(catalog.map(row=>[row.id,row]))
 for(const name of names.filter(Boolean)){const resolved=resolveCategory(name,catalog);if(![...rows.values()].some(row=>key(row.name)===key(resolved)))rows.set(categoryId(name),{id:categoryId(name),name,description:'',enabled:true,aliases:[]})}
 return [...rows.values()].sort((a,b)=>a.name.localeCompare(b.name))
}
export function saveCategory(value,operation) {
 const data=value||{},p=operation.payload||{},rows=categoryRows((data.transactions||[]).map(t=>t.cat||t.category),data.categoryCatalog||[])
 const old=rows.find(row=>row.id===operation.targetId)||(p.category&&categoryId(p.category)===operation.targetId?{id:operation.targetId,name:p.category,aliases:[]}:null),name=String(p.name||'').trim()
 if(!name||name.length>120)throw Error('Enter a category name up to 120 characters.')
 if(['income','transfer','uncategorized'].includes(key(old?.name))||['income','transfer','uncategorized'].includes(key(name)))throw Error('This system category is reserved.')
 if(rows.some(row=>row.id!==operation.targetId&&[row.name,...(row.aliases||[])].some(n=>key(n)===key(name))))throw Error('That category already exists. Choose a unique name.')
 const aliases=[...new Set([...(old?.aliases||[]),...(old&&key(old.name)!==key(name)?[old.name]:[])])]
 const updated={id:operation.targetId||categoryId(name),name,aliases,description:p.description||'',enabled:p.enabled!==false}
 const catalog=[...rows.filter(row=>row.id!==updated.id),updated]
 const transactions=(data.transactions||[]).map(t=>({...t,...(t.cat?{cat:resolveCategory(t.cat,catalog)}:{}),...(t.category?{category:resolveCategory(t.category,catalog)}:{}),...(t.splits?{splits:t.splits.map(s=>({...s,...(s.cat?{cat:resolveCategory(s.cat,catalog)}:{}),...(s.category?{category:resolveCategory(s.category,catalog)}:{})}))}:{})}))
 return {...data,categoryCatalog:catalog,transactions}
}
let cachedSource,cachedCatalog=[]
export function storedCategoryCatalog(storage=globalThis.localStorage) {try{const source=storage?.getItem('lslj_finance_v9')||'{}';if(source!==cachedSource){cachedCatalog=JSON.parse(source).categoryCatalog||[];cachedSource=source}return cachedCatalog}catch{return []}}
// Resolve at the boundary so stored aliases remain valid across rename and undo.
export function labelTransactionCategory(tx,catalog=storedCategoryCatalog()) {
 if(!tx.category&&!tx.cat&&!Array.isArray(tx.splits))return tx
 return {...tx,...(tx.category?{category:resolveCategory(tx.category,catalog)}:{}),...(tx.cat?{cat:resolveCategory(tx.cat,catalog)}:{}),...(Array.isArray(tx.splits)?{splits:tx.splits.map(split=>labelTransactionCategory(split,catalog))}:{})}
}
export function labelRuleCategories(rule,catalog=storedCategoryCatalog()) {
 return {...rule,
  ...(rule.conditions?{conditions:{...rule.conditions,...(rule.conditions.categories?{categories:{...rule.conditions.categories,value:resolveCategory(rule.conditions.categories.value,catalog)}}:{})}}:{}),
  ...(rule.actions?{actions:{...rule.actions,...(rule.actions.updateCategory?{updateCategory:{...rule.actions.updateCategory,value:resolveCategory(rule.actions.updateCategory.value,catalog)}}:{})}}:{}),
  ...(rule.criteria?{criteria:rule.criteria.map(c=>c.field==='category'?{...c,value:resolveCategory(c.value,catalog)}:c)}:{}),
  ...(rule.splits?{splits:rule.splits.map(s=>labelTransactionCategory(s,catalog))}:{})}
}
export function categoryRenameImpact(name,{catalog=[],scheduled=[],actuals=[],rules=[],budget={}}={}) {
 const same=value=>Boolean(value)&&key(resolveCategory(value,catalog))===key(resolveCategory(name,catalog))
 const linked=t=>same(t.cat)||same(t.category)||(t.splits||[]).some(linked)
 return {scheduled:scheduled.filter(linked).length,actuals:new Set(actuals.filter(linked).map(t=>t.id)).size,
 rules:rules.filter(r=>same(r.actions?.updateCategory?.value)||same(r.conditions?.categories?.value)||(r.criteria||[]).some(c=>c.field==='category'&&same(c.value))||(r.splits||[]).some(linked)).length,
 budgets:Object.values(budget.categoryLimits||{}).filter(t=>same(t.category)).length}
}
