import { useEffect, useRef, useState } from 'react'
import {createPortal} from 'react-dom'
import './MetricDrilldown.css'

const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(value)||0)
const valueOf=row=>row.valueLabel??(row.valueType==='count'?String(row.amount??'Unavailable'):row.amount==null?'Unavailable':money(row.amount))

export default function MetricDrilldown({node,onClose}){
  const[stack,setStack]=useState(()=>node?[node]:[])
  const dialog=useRef(null),close=useRef(onClose),isOpen=Boolean(node)
  close.current=onClose
  useEffect(()=>setStack(node?[node]:[]),[node])
  useEffect(()=>{
    if(!isOpen)return
    const previous=document.activeElement
    dialog.current?.querySelector('button')?.focus()
    const keys=event=>{
      if(event.key==='Escape'){event.preventDefault();close.current();return}
      if(event.key!=='Tab')return
      const buttons=[...dialog.current.querySelectorAll('button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]')]
      const first=buttons[0],last=buttons.at(-1)
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
    }
    document.addEventListener('keydown',keys)
    return()=>{document.removeEventListener('keydown',keys);previous?.focus()}
  },[isOpen])
  if(!node||!stack.length)return null
  const current=stack[stack.length-1]
  const rows=Array.isArray(current.children)?current.children:[]
  return createPortal(<div className="metric-drilldown-backdrop" role="presentation" onClick={onClose}>
    <section ref={dialog} className="metric-drilldown" role="dialog" aria-modal="true" aria-label={`${current.label} breakdown`} onClick={event=>event.stopPropagation()}>
      <header>
        <div>
          <button type="button" className="metric-drilldown-back" aria-label={stack.length>1?'Back to previous breakdown':'Close breakdown'} onClick={()=>stack.length>1?setStack(items=>items.slice(0,-1)):onClose()}><span aria-hidden="true">{stack.length>1?'←':'×'}</span></button>
          <div><span>{current.eyebrow||'How this number is built'}</span><h2>{current.label}</h2></div>
        </div>
        <strong>{valueOf(current)}</strong>
      </header>
      {current.note&&<p className="metric-drilldown-note">{current.note}</p>}
      <div className="metric-drilldown-rows">
        {rows.length?rows.map((row,index)=>{
          const hasChildren=Array.isArray(row.children)&&row.children.length>0
          return <button type="button" key={row.id||`${row.label}-${index}`} className="metric-drilldown-row" onClick={()=>hasChildren&&setStack(items=>[...items,row])} disabled={!hasChildren}>
            <span><b>{row.label}</b>{row.meta&&<small>{row.meta}</small>}</span>
            <span className="metric-drilldown-amount">{valueOf(row)}{hasChildren&&<i className="ti ti-chevron-right"/>}</span>
          </button>
        }):<div className="metric-drilldown-empty">{current.emptyMessage||'No additional detail is available for this number.'}</div>}
      </div>
      {current.source&&<footer>Source: {current.source}</footer>}
    </section>
  </div>,document.body)
}
