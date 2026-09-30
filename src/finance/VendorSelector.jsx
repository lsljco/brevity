import {useState} from 'react'
import {useVendorDirectory,reviewVendor} from './vendorApi.js'
import {vendorForExpense} from './vendorModel.js'
export default function VendorSelector({expense,kind='posted',value,onChange,onReviewed,label='Expense vendor'}){
 const {directory,error}=useVendorDirectory(),[selected,setSelected]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const options=directory?.vendors?.filter(v=>!v.archived)||[]
 const current=onChange?value:vendorForExpense(directory,kind,expense||{})
 async function assign(){setBusy(true);setMessage('');try{const vendor=options.find(v=>v.id===selected);await reviewVendor(directory,{type:'vendor.expense.link',targetId:selected,payload:{vendorId:selected,expenseKind:kind,expenseId:expense.id}},`Link ${expense.name||'expense'} to ${vendor.name}`);onReviewed?.()}catch(err){setMessage(err.message)}finally{setBusy(false)}}
 return <section><label className="field-label">Vendor<select aria-label={label} value={onChange?value:selected||current} disabled={!directory||busy} onChange={event=>onChange?onChange(event.target.value):setSelected(event.target.value)}><option value="">Unassigned — choose a vendor</option>{options.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>{!onChange&&expense?.id&&<button type="button" disabled={!selected||busy||selected===current} onClick={assign}>Review vendor assignment</button>}<small>Create and manage vendors under Finance → Vendors. Existing unassigned expenses remain visible there.</small>{(error||message)&&<p role="alert">{error||message}</p>}</section>
}
