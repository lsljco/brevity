import {useEffect,useRef,useState} from 'react'
import {importMealsFromImage,lookupPackagedFood} from './mealPlanApi.js'
import {LABEL_MACROS,packagedFoodInput} from './packagedFood.js'

export default function PackagedFoodForm({mealType,saving,error,onClose,onSave}) {
  const [form,setForm]=useState({mealType,name:'',serving:'',calories:'',proteinGrams:'',carbohydrateGrams:'',fatGrams:''})
  const [validation,setValidation]=useState('')
  const [barcode,setBarcode]=useState('')
  const [busy,setBusy]=useState(false)
  const [scanning,setScanning]=useState(false)
  const [warnings,setWarnings]=useState([])
  const video=useRef(null),generation=useRef(0)
  const applyDraft=draft=>{
    setForm(current=>({...current,name:draft.name||'',serving:draft.serving||'',sourceName:draft.sourceName||'Package nutrition label',sourceUrl:draft.sourceUrl||'',nutritionWarnings:draft.warnings||[],
      ...Object.fromEntries(LABEL_MACROS.map(([key])=>[key,draft.macros?.[key]??'']))}))
    setWarnings(draft.warnings||[])
  }
  const lookup=async code=>{
    setBusy(true);setValidation('')
    try{const result=await lookupPackagedFood(code);applyDraft(result.product)}
    catch(error){setValidation(error.message)}finally{setBusy(false)}
  }
  const photograph=async event=>{
    const file=event.target.files?.[0];event.target.value=''
    if(!file)return
    setBusy(true);setValidation('')
    try{
      const result=await importMealsFromImage(file,{packagedFood:true})
      if(result.meals?.length!==1)throw new Error('Photograph one product and its nutrition label clearly, then try again.')
      applyDraft({...result.meals[0],warnings:[...(result.warnings||[]),...(result.meals[0].warnings||[])]})
    }catch(error){setValidation(error.message)}finally{setBusy(false)}
  }
  useEffect(()=>{
    if(!scanning)return
    const ticket=++generation.current
    let controls,accepted=false
    const active=()=>generation.current===ticket
    ;(async()=>{
      try{
        const {BrowserMultiFormatReader}=await import('@zxing/browser')
        if(!active())return
        controls=await new BrowserMultiFormatReader().decodeFromConstraints({video:{facingMode:{ideal:'environment'}},audio:false},video.current,(result,error,scanner)=>{
          if(!result||accepted||!active())return
          accepted=true;scanner.stop();setScanning(false)
          const code=result.getText();setBarcode(code);lookup(code)
        })
        if(!active())controls.stop()
      }catch(error){if(active()){setScanning(false);setValidation('Camera unavailable. Allow camera access, enter the barcode digits, or photograph the nutrition label.')}}
    })()
    return()=>{generation.current++;controls?.stop()}
  },[scanning])
  const locked=saving||busy||scanning
  const set=(key,value)=>{setValidation('');setForm(current=>({...current,[key]:value}))}
  const submit=event=>{event.preventDefault();try{const meal=packagedFoodInput(form);onSave(meal)}catch(error){setValidation(error.message)}}
  return <form className="meal-add-form" onSubmit={submit}>
    <p className="meal-add-form--wide">Save a reusable packaged food using its nutrition label. Adding it to the library does not schedule it or count it as consumed.</p>
    <section className="meal-add-form--wide">
      <p>Scan a barcode or photograph the Nutrition Facts panel to fill this draft. Review the exact product and serving before saving.</p>
      <label><span>Product barcode</span><input inputMode="numeric" value={barcode} disabled={locked} onChange={event=>setBarcode(event.target.value)} placeholder="Printed barcode digits" /></label>
      <button type="button" disabled={locked||!barcode.trim()} onClick={()=>lookup(barcode)}>Look up barcode</button>
      <button type="button" disabled={locked} onClick={()=>{setValidation('');setScanning(true)}}>Scan barcode with camera</button>
      {scanning&&<div><video ref={video} autoPlay muted playsInline style={{width:'100%',maxHeight:240}} aria-label="Barcode camera preview"/><button type="button" onClick={()=>setScanning(false)}>Stop camera</button></div>}
      <label><span>Photograph or upload package label</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={locked} onChange={photograph}/></label>
      {busy&&<p role="status">Reading product details…</p>}
      {warnings.map((warning,index)=><p key={index}>{warning}</p>)}
    </section>
    <label><span>Meal type</span><select value={form.mealType} onChange={event=>set('mealType',event.target.value)} disabled={locked}>{[['breakfast','Breakfast'],['lunch','Lunch'],['dinner','Dinner'],['snack1','Snack 1'],['snack2','Snack 2']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label className="meal-add-form--wide"><span>Product name and flavor</span><input required value={form.name} disabled={locked} onChange={event=>set('name',event.target.value)} placeholder="Premier Protein Shake — Bananas & Cream" /></label>
    <label className="meal-add-form--wide"><span>Label serving size</span><input required value={form.serving} disabled={locked} onChange={event=>set('serving',event.target.value)} placeholder="1 bottle (11 fl oz / 325 mL)" /></label>
    <p className="meal-add-form--wide">Enter values for one label serving, not the whole multipack. Keep the label’s calorie value; label rounding can differ from calculations using protein, carbs and fat.</p>
    {LABEL_MACROS.map(([key,label])=><label key={key}><span>{label}</span><input type="number" required min="0" step="any" value={form[key]} disabled={locked} onChange={event=>set(key,event.target.value)} /></label>)}
    <p className="meal-add-form--wide">Brevity generates a meal image after saving. Use Upload Image in meal details if you prefer your own package photo.</p>
    {(validation||error)&&<p className="meal-nutrition-error meal-add-form--wide" role="alert">{validation||error}</p>}
    <footer><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="is-primary" disabled={locked}>{saving?'Adding packaged food…':'Add packaged food to Meal Library'}</button></footer>
  </form>
}
