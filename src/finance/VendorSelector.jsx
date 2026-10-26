import VendorPicker from './VendorPicker.jsx'
import {useEffect,useState} from 'react'
import {useVendorDirectory,reviewVendor} from './vendorApi.js'
import {vendorForExpense} from './vendorModel.js'
export default function VendorSelector({expense,kind='posted',value,onChange,onReviewed,label='Expense vendor',fieldLabel='Vendor'}){
 const {directory,error}=useVendorDirectory(),[selected,setSelected]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[creating,setCreating]=useState('')
 const options=directory?.vendors?.filter(v=>!v.archived)||[]
 useEffect(()=>{if(!creating)return;const saved=options.find(v=>v.name.toLowerCase()===creating.toLowerCase());if(saved){if(onChange)onChange(saved.id);else setSelected(saved.id);setCreating('');setMessage(`${saved.name} created and selected.`)}},[directory,creating])
 const current=onChange?value:vendorForExpense(directory,kind,expense||{})
 async function assign(){setBusy(true);setMessage('');try{const vendor=options.find(v=>v.id===selected);await reviewVendor(directory,{type:'vendor.expense.link',targetId:selected,payload:{vendorId:selected,expenseKind:kind,expenseId:expense.id}},`Link ${expense.name||'expense'} to ${vendor.name}`);onReviewed?.()}catch(err){setMessage(err.message)}finally{setBusy(false)}}
 async function create(name){setBusy(true);setMessage('');try{await reviewVendor(directory,{type:'vendor.create',payload:{name,accessMembers:[]}},`Create ${fieldLabel.toLowerCase()} ${name}; administrator access only`);setCreating(name);setMessage(`Approve the new ${fieldLabel.toLowerCase()} in the confirmation. It will be selected here after saving.`)}catch(err){setMessage(err.message)}finally{setBusy(false)}}
 return <section><span className="field-label">{fieldLabel}{onChange?' (optional)':''}</span><VendorPicker label={label} options={options} value={onChange?value:selected??current} disabled={!directory||busy} onChange={id=>onChange?onChange(id):setSelected(id)} onCreate={directory?.isAdmin?create:undefined}/>
 {!onChange&&expense?.id&&<button type="button" disabled={!selected||busy||selected===current} onClick={assign}>Review vendor assignment</button>}<small>{fieldLabel === 'Payer' ? 'Choose who pays this income. Create and manage payers under Finance → Vendors.' : 'Create and manage vendors under Finance → Vendors. Existing unassigned expenses remain visible there.'}</small>{(error||message)&&<p role="alert">{error||message}</p>}</section>
}
