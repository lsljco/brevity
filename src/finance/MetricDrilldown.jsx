import { useEffect, useState } from 'react'
import './MetricDrilldown.css'

const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(value)||0)

export default function MetricDrilldown({node,onClose}){
  const[stack,setStack]=useState(()=>node?[node]:[])
  useEffect(()=>setStack(node?[node]:[]),[node])
  if(!node||!stack.length)return null
  const current=stack[stack.length-1]
  const rows=Array.isArray(current.children)?current.children:[]
  return <div className="metric-drilldown-backdrop" role="presentation" onClick={onClose}>
    <section className="metric-drilldown" role="dialog" aria-modal="true" aria-label={`${current.label} breakdown`} onClick={event=>event.stopPropagation()}>
      <header>
        <div>
          <button type="button" className="metric-drilldown-back" onClick={()=>stack.length>1?setStack(items=>items.slice(0,-1)):onClose()}><i className={`ti ${stack.length>1?'ti-arrow-left':'ti-x'}`}/></button>
          <div><span>{current.eyebrow||'How this number is built'}</span><h2>{current.label}</h2></div>
        </div>
        <strong>{money(current.amount)}</strong>
      </header>
      {current.note&&<p className="metric-drilldown-note">{current.note}</p>}
      <div className="metric-drilldown-rows">
        {rows.length?rows.map((row,index)=>{
          const hasChildren=Array.isArray(row.children)&&row.children.length>0
          return <button type="button" key={row.id||`${row.label}-${index}`} className="metric-drilldown-row" onClick={()=>hasChildren&&setStack(items=>[...items,row])} disabled={!hasChildren}>
            <span><b>{row.label}</b>{row.meta&&<small>{row.meta}</small>}</span>
            <span className="metric-drilldown-amount">{money(row.amount)}{hasChildren&&<i className="ti ti-chevron-right"/>}</span>
          </button>
        }):<div className="metric-drilldown-empty">No additional detail is available for this number.</div>}
      </div>
      {current.source&&<footer>Source: {current.source}</footer>}
    </section>
  </div>
}
