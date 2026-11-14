import {useState} from 'react'
import {compareFinancialValues} from './financialSort.js'
export function useFinancialListSort(options, label) {
 const [key,setKey]=useState(''),[direction,setDirection]=useState('asc')
 const option=options.find(o=>o.key===key)
 const sortRows=rows=>option?[...rows].sort((a,b)=>compareFinancialValues(option.value?option.value(a):a[key],option.value?option.value(b):b[key],direction)):rows
 const controls=<div className="financial-list-sort" style={{display:'flex',gap:12,flexWrap:'wrap',margin:'12px 0'}}><label>Sort by <select aria-label={`Sort ${label} by`} value={key} onChange={e=>setKey(e.target.value)}><option value="">Original order</option>{options.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}</select></label><label>Order <select aria-label={`${label} sort direction`} value={direction} disabled={!key} onChange={e=>setDirection(e.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label></div>
 return {sortRows,controls}
}
