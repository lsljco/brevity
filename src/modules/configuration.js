import {PILLARS} from './catalog.js'
export const MODULE_RESOURCE='shared:brevity_modules_v1'
export const moduleCatalog=()=>PILLARS.flatMap((pillar,order)=>[{id:pillar.id,label:pillar.label,pillarId:pillar.id,enabled:true,order,kind:'pillar'},...pillar.items.map((item,order)=>({id:item.id,label:item.label,pillarId:pillar.id,enabled:true,order,kind:'module'}))])
export function normalizeModulePatch(payload){
 if(!payload||Object.keys(payload).some(key=>key!=='modules')||!Array.isArray(payload.modules)||!payload.modules.length||payload.modules.length>50)throw Error('Provide one to fifty module changes.')
 const known=new Map(moduleCatalog().map(row=>[row.id,row])),seen=new Set()
 return {modules:payload.modules.map(row=>{
  if(!row||Object.keys(row).some(key=>!['id','label','enabled','order','pillarId','description'].includes(key))||typeof row.id!=='string'||seen.has(row.id))throw Error('Each module change requires a unique module ID.')
  seen.add(row.id)
  if(!known.has(row.id)&&!/^custom-[a-z0-9-]{1,60}$/.test(row.id))throw Error('Custom module IDs begin with custom- and use lowercase letters, numbers and hyphens.')
  if(row.enabled!==undefined&&typeof row.enabled!=='boolean')throw Error('Enabled must be true or false.')
  if(row.order!==undefined&&(!Number.isInteger(row.order)||row.order<0||row.order>100))throw Error('Module order must be between 0 and 100.')
  if(row.label!==undefined&&(typeof row.label!=='string'||!row.label.trim()||row.label.length>80))throw Error('A module name must contain 1–80 characters.')
  if(row.description!==undefined&&(typeof row.description!=='string'||row.description.length>2000))throw Error('Module description is too long.')
  if(row.pillarId!==undefined&&!PILLARS.some(item=>item.id===row.pillarId))throw Error('Choose a parent pillar.')
  if(known.has(row.id)&&row.pillarId&&row.pillarId!==known.get(row.id).pillarId)throw Error('Built-in modules keep their parent pillar.')
  if(!known.has(row.id)&&(!row.label||!row.pillarId))throw Error('A custom module needs a name and parent pillar.')
  return {...row}
 })}
}
export function applyModulePatch(value,payload){const changes=normalizeModulePatch(payload).modules,rows=new Map((Array.isArray(value)?value:[]).map(row=>[row.id,row]));for(const row of changes)rows.set(row.id,{...rows.get(row.id),...row});if(rows.size>100)throw Error('Household module limit reached.');return [...rows.values()]}
export function resolveModules(value){const rows=new Map(moduleCatalog().map(row=>[row.id,row]));for(const patch of Array.isArray(value)?value:[]){const base=rows.get(patch.id);rows.set(patch.id,{enabled:true,order:99,kind:'module',...base,...patch})}return [...rows.values()]}
export function configuredPillars(value){const rows=resolveModules(value);return PILLARS.map(pillar=>{const config=rows.find(row=>row.id===pillar.id);return {...pillar,...config,items:rows.filter(row=>row.kind==='module'&&row.pillarId===pillar.id&&row.enabled).sort((a,b)=>a.order-b.order).map(row=>({...pillar.items.find(item=>item.id===row.id),...row,icon:pillar.items.find(item=>item.id===row.id)?.icon||'ti-notebook'}))}}).filter(pillar=>pillar.enabled).sort((a,b)=>a.order-b.order)}
