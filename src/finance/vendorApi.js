import {useCallback,useEffect,useState} from 'react'
import {ACTION_COMPLETED_EVENT,requestActionReview} from '../assistant/actionEvents.js'
import {prepareDirectAction} from '../assistant/assistantApi.js'
export async function vendorRequest(action='list',body){
 const response=await fetch(`/.netlify/functions/finance-vendors?action=${action}`,{method:body?'POST':'GET',credentials:'include',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined})
 const data=await response.json();if(!response.ok)throw Error(data.error||'Vendor request failed.');return data
}
export function useVendorDirectory(){
 const [directory,setDirectory]=useState(null),[error,setError]=useState('')
 const reload=useCallback(async()=>{try{const value=await vendorRequest();setDirectory(value);setError('')}catch(err){setError(err.message)}},[])
 useEffect(()=>{let active=true;vendorRequest().then(value=>active&&setDirectory(value)).catch(err=>active&&setError(err.message));const refreshed=()=>reload();window.addEventListener(ACTION_COMPLETED_EVENT,refreshed);return()=>{active=false;window.removeEventListener(ACTION_COMPLETED_EVENT,refreshed)}},[reload])
 return{directory,error,reload}
}
export async function reviewVendor(directory,operation,summary,expectedVersion=directory.version){
 const result=await prepareDirectAction({summary,operation:{...operation,description:summary},expectedVersion})
 if(!result?.proposal?.id)throw Error('Vendor review could not be prepared.')
 requestActionReview(result.proposal)
}

export const VENDOR_OPEN_EVENT='brevity:open-vendor'
export const requestVendorOpen=vendorId=>window.dispatchEvent(new CustomEvent(VENDOR_OPEN_EVENT,{detail:{vendorId}}))
