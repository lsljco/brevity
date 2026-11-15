import {RULE_FIELDS,RULE_OPERATORS,describeRuleCriteria} from './ruleCriteria.js'
export default function RuleCriteriaEditor({criteria,onChange,accounts,fieldStyle}){
 const buttonStyle={minHeight:44,padding:'8px 12px',border:'1px solid var(--gold)',borderRadius:9,background:'transparent',color:'var(--gold)',font:'inherit',cursor:'pointer'}
 const update=(index,patch)=>onChange(criteria.map((c,i)=>i===index?{...c,...patch}:c))
 return <div style={{marginTop:18}}>
  {criteria.map((c,index)=><fieldset key={index} style={{minWidth:0,margin:'12px 0',padding:12,border:'1px solid var(--border,rgba(197,164,109,.3))',borderRadius:12}}>
   <legend>Criterion {index+1}</legend>
   {index>0&&<label>Combine with previous criteria<select aria-label={`Connector ${index+1}`} style={fieldStyle} value={c.join} onChange={e=>update(index,{join:e.target.value})}><option value="and">AND</option><option value="or">OR</option></select></label>}
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,180px),1fr))',gap:12,marginTop:8}}>
    <label>Match using<select style={fieldStyle} value={c.field} onChange={e=>{const field=e.target.value;onChange(criteria.map((item,i)=>i===index?{field,operator:Object.keys(RULE_OPERATORS[field])[0],value:field==='direction'?'income':'',join:c.join}:item))}}>{Object.entries(RULE_FIELDS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label>Match method<select style={fieldStyle} value={c.operator} onChange={e=>update(index,{operator:e.target.value})}>{Object.entries(RULE_OPERATORS[c.field]).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    {c.field==='account'?<label>Bank account<select style={fieldStyle} value={c.value} onChange={e=>update(index,{value:e.target.value})}><option value="">Choose account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}{a.mask?` ••••${a.mask}`:''}</option>)}</select></label>:c.field==='direction'?<label>Direction<select style={fieldStyle} value={c.value} onChange={e=>update(index,{value:e.target.value})}><option value="income">Money in</option><option value="expense">Money out</option></select></label>:<label>{c.field==='amount'?'Amount':'Match text'}<input style={fieldStyle} type={c.field==='amount'?'number':'text'} min={c.field==='amount'?'0':undefined} step={c.field==='amount'?'0.01':undefined} value={c.value} onChange={e=>update(index,{value:e.target.value})}/></label>}
    {c.field==='amount'&&c.operator==='between'&&<label>Upper amount<input style={fieldStyle} type="number" min="0" step="0.01" value={c.max??''} onChange={e=>update(index,{max:e.target.value})}/></label>}
   </div>
   {criteria.length>1&&<button type="button" onClick={()=>onChange(criteria.filter((_,i)=>i!==index))} style={{...buttonStyle,marginTop:10}}>Remove criterion {index+1}</button>}
  </fieldset>)}
  <button type="button" style={{...buttonStyle,opacity:criteria.length>=5?.5:1}} disabled={criteria.length>=5} onClick={()=>onChange([...criteria,{field:'originalStatement',operator:'contains',value:'',join:'and'}])}>+ Add criterion</button><small style={{marginLeft:10}}>{criteria.length} of 5 criteria</small>
  <p style={{fontSize:12,color:'var(--muted)'}}>Amounts use the dollar value; choose Money direction to distinguish money in from money out. Bank account means the linked account receiving the record. To match an originating account mentioned by the bank, use Original bank statement contains “from *248”.</p>
  <p aria-label="Rule logic" style={{padding:12,border:'1px solid var(--gold)',borderRadius:10,overflowWrap:'anywhere'}}>{describeRuleCriteria(criteria,accounts)}</p>
  {criteria.some(c=>c.join==='or')&&<small>AND conditions are grouped together before OR. Account scope below applies to every group.</small>}
 </div>
}
