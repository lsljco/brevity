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
export function labelTransactionCategory(tx,catalog=storedCategoryCatalog()) { const category=resolveCategory(tx.category||tx.cat,catalog);return category===undefined?tx:{...tx,...(tx.category?{category}:{}),...(tx.cat?{cat:category}:{})} }
