import {useEffect,useRef,useState} from 'react'
import {calculatePackageLabels} from './mealPlanApi.js'
const fields=[['calories','Calories'],['proteinGrams','Protein (g)'],['carbohydrateGrams','Carbs (g)'],['fatGrams','Fat (g)'],['fiberGrams','Fiber (g), optional'],['sugarGrams','Sugar (g), optional'],['sodiumMilligrams','Sodium (mg), optional']]
const empty=()=>({name:'',servingSize:'',servings:'1',...Object.fromEntries(fields.map(([key])=>[key,'']))})
export default function PackageLabelEditor({ingredients=[],onCalculated,onInvalidate,disabled}){
  const [rows,setRows]=useState(()=>ingredients.length?ingredients.map(item=>({...empty(),name:item.resolvedName||item.input||'',...(item.source==='member-label'?{servingSize:item.label.servingSize,servings:item.label.servings,...item.label.perLabelServing}:{} )})): [empty()])
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const sequence=useRef(0)
  useEffect(()=>()=>{sequence.current+=1},[])
  const change=next=>{sequence.current+=1;setBusy(false);setError('');setRows(next);onInvalidate()}
  const calculate=async()=>{
    const request=++sequence.current
    onInvalidate();setError('');setBusy(true)
    try{const result=await calculatePackageLabels(rows);if(request===sequence.current)onCalculated(result.nutrition)}
    catch(cause){if(request===sequence.current)setError(cause.message||'Could not calculate these labels.')}
    finally{if(request===sequence.current)setBusy(false)}
  }
  return <div><p>Enter values per label serving and the number of servings eaten. For 6 oz of sausage with a 2 oz label serving, enter 3 servings. Include every food; blank optional nutrients stay unknown.</p>
    {rows.map((row,index)=><fieldset key={index} disabled={disabled} className="consumed-label-food"><legend>Food {index+1}</legend><div className="consumed-nutrition-fields">
      {[['name','Exact product name'],['servingSize','Label serving size (e.g. 2 oz)'],['servings','Servings eaten'],...fields].map(([key,label])=><label key={key}>{label}<input type={['name','servingSize'].includes(key)?'text':'number'} min={key==='servings'?'0.01':'0'} step="any" maxLength={key==='name'?120:key==='servingSize'?80:undefined} value={row[key]??''} onChange={event=>change(rows.map((item,i)=>i===index?{...item,[key]:event.target.value}:item))}/></label>)}
      </div><button type="button" disabled={rows.length===1} onClick={()=>change(rows.filter((_,i)=>i!==index))}>Remove food {index+1}</button></fieldset>)}
    <button type="button" disabled={disabled||rows.length>=30} onClick={()=>change([...rows,empty()])}>Add food label</button>
    <button type="button" disabled={disabled||busy} onClick={calculate}>{busy?'Calculating labels…':'Calculate from labels'}</button>{error&&<p role="alert">{error}</p>}
  </div>
}
