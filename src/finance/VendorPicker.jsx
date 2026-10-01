import {useId,useState,useEffect} from 'react'
import './VendorPicker.css'

export default function VendorPicker({options=[],value='',onChange,label='Vendor',disabled=false,onCreate}){
 const id=useId(),[open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(-1)
 const selected=options.find(v=>v.id===value)
 const matches=[...options].filter(v=>v.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id))
 const choices=query.trim()?matches:[{id:'',name:'Unassigned'},...matches]
 useEffect(()=>{if(open&&active>=0)document.getElementById(`${id}-${active}`)?.scrollIntoView({block:'nearest'})},[open,active,id])
 const choose=vendor=>{onChange(vendor.id);setOpen(false);setQuery('');setActive(-1)}
 return <div className="vendor-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)){setOpen(false);setQuery('');setActive(-1)}}}>
  <input role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open&&active>=0?`${id}-${active}`:undefined} autoComplete="off" disabled={disabled} placeholder="Type to find a vendor or payer" value={open?query:selected?.name||(value?'Saved record unavailable':'')} onFocus={()=>{setOpen(true);setQuery('');setActive(-1)}} onClick={()=>setOpen(true)} onChange={event=>{setQuery(event.target.value);setOpen(true);setActive(-1)}} onKeyDown={event=>{
   if(event.key==='Escape'){event.preventDefault();setOpen(false);setQuery('');setActive(-1)}
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);setActive(index=>Math.max(0,Math.min(choices.length-1,index+(event.key==='ArrowDown'?1:-1))))}
   if(event.key==='Enter'&&open){event.preventDefault();if(active>=0&&choices[active])choose(choices[active])}
  }}/>
  {open&&<div className="vendor-picker-menu"><div id={`${id}-options`} role="listbox" aria-label={`${label} matches`}>{choices.map((vendor,index)=><button type="button" role="option" id={`${id}-${index}`} key={vendor.id} aria-selected={vendor.id===value} className={index===active?'is-active':''} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(vendor)}>{vendor.name}{vendor.id&&options.filter(v=>v.name===vendor.name).length>1&&<small>Record {vendor.id}</small>}</button>)}</div>{!choices.length&&<p role="status">No matching saved vendor or payer.</p>}{onCreate&&query.trim()&&<button type="button" className="vendor-picker-create" onClick={()=>onCreate(query.trim())}>Create new: {query.trim()}</button>}<small>Choose a saved record to link it. Typing alone does not change the selection.</small></div>}
 </div>
}
