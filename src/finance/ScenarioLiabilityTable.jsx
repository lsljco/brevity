import {useRef,useState} from 'react'
import {orderedLiabilities,reorderLiability} from './scenarioPriority.js'
import {payoffPriority} from './scenarioPayoffPlan.js'
export default function ScenarioLiabilityTable({rows,readOnly,onReorder,onEdit,money}){
 const source=useRef(null),[over,setOver]=useState(null),ordered=orderedLiabilities(rows)
 const move=(id,target)=>{const next=reorderLiability(rows,id,target);if(next&&!readOnly)onReorder(next);source.current=null;setOver(null)}
 const targetAt=e=>document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-liability-id]')?.dataset.liabilityId
 return <div className="studio-table-scroll"><table className="studio-priority-table"><thead><tr>{['Priority / liability','Balance','APR','Minimum (reference)','Payoff'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{ordered.map((r,i)=>{
 const group=ordered.filter(x=>payoffPriority(x)===payoffPriority(r))
 return <tr key={r.id} data-liability-id={r.id} className={over===r.id?'studio-drop-target':''}>
 <td><div className="studio-priority-controls"><button className="studio-drag-handle" aria-label={`Drag ${r.name} to reorder; arrow keys move priority`} disabled={readOnly} draggable={false} onPointerDown={e=>{if(readOnly||(e.pointerType==='mouse'&&e.button!==0))return;source.current=r.id;e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!source.current)return;setOver(targetAt(e)||null);const box=e.currentTarget.closest('.studio-table-scroll');const bounds=box.getBoundingClientRect();if(e.clientY<bounds.top+40)box.scrollTop-=12;if(e.clientY>bounds.bottom-40)box.scrollTop+=12}} onPointerUp={e=>{if(source.current)move(source.current,targetAt(e))}} onPointerCancel={e=>{source.current=null;setOver(null)}} onKeyDown={e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();move(r.id,ordered[i+(e.key==='ArrowUp'?-1:1)]?.id)}}}>⠿</button><span>{i+1}.</span><button onClick={()=>onEdit(r.id)}>{r.name}</button></div><select aria-label={`Priority for ${r.name}`} disabled={readOnly} value={r.id} onChange={e=>move(r.id,e.target.value)}>{group.map(x=><option key={x.id} value={x.id}>Priority {ordered.findIndex(d=>d.id===x.id)+1}</option>)}</select></td>
 <td>{money(r.balance)}</td><td>{r.apr}%</td><td>{money(r.payment)}</td><td>{r.include?'Included':'Excluded'}</td></tr>
 })}</tbody></table></div>
}
