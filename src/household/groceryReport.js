import {parseGroceryIngredient} from './groceryData.js'
const normalize=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase()
export function consolidateGroceries(items,filter='Needed'){
 const groups=new Map()
 for(const item of items||[]){
  if(filter!=='All'&&Boolean(item.completed)!==(filter==='Purchased'))continue
  const category=item.category||'Other',key=JSON.stringify([category,normalize(item.name),Boolean(item.completed)])
  const row=groups.get(key)||{name:item.name.trim(),category,completed:Boolean(item.completed),amounts:new Map(),other:[],sources:new Set()}
  const quantity=String(item.quantity||'').trim(),parsed=parseGroceryIngredient(`${quantity} __item__`)
  if(parsed.name==='__item__'&&parsed.amount!==null)row.amounts.set(parsed.unit,(row.amounts.get(parsed.unit)||0)+parsed.amount)
  else row.other.push(quantity||'As needed')
  for(const source of item.sources||[])row.sources.add(source)
  groups.set(key,row)
 }
 return [...groups.values()].map(row=>({name:row.name,category:row.category,completed:row.completed,quantity:[...row.amounts].map(([unit,n])=>`${Number(n.toFixed(3))}${unit?' '+unit:''}`).concat(row.other).join(' + '),sources:[...row.sources]})).sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name)||Number(a.completed)-Number(b.completed))
}
export function groceryReport(rows,filter){return {title:'Grocery List',notes:[`Items: ${filter}. Matching items and units are combined; different units are kept separate.`],sections:[{title:'Shopping list',columns:['Category','Item','Quantity','Status','Meal references'].map(label=>({label})),rows:rows.map(row=>[row.category,row.name,row.quantity,row.completed?'Purchased':'Needed',row.sources.join('; ')])}]}}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function groceryPrintHtml(rows,filter){return `<!doctype html><html><head><title>Brevity Grocery List</title><style>body{font:14px Arial,sans-serif;color:#111;margin:24px}h1{font:28px Georgia}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 6px;border-bottom:1px solid #ccc;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}button{padding:10px}@media print{button{display:none}@page{margin:15mm}}</style></head><body><button onclick="window.print()">Print list</button><h1>Grocery List</h1><p>${escape(filter)} · ${rows.length} consolidated items</p><table><thead><tr><th>Purchased</th><th>Category</th><th>Item</th><th>Quantity</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${row.completed?'✓':'☐'}</td><td>${escape(row.category)}</td><td>${escape(row.name)}</td><td>${escape(row.quantity)}</td></tr>`).join('')}</tbody></table></body></html>`}

export function groceryText(rows,filter='Needed'){
 return [`Brevity Grocery List (${filter})`,...rows.map(row=>`${row.completed?'✓':'☐'} ${row.name}: ${row.quantity} (${row.category})`)].join('\n')
}
export function grocerySmsLink(rows,filter,userAgent=''){
 const separator=/iPad|iPhone|iPod/i.test(userAgent)?'&':'?'
 return `sms:${separator}body=${encodeURIComponent(groceryText(rows,filter))}`
}
