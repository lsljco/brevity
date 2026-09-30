import {getStore} from './scoped-store.mjs'
import {emptyVendors} from '../../src/finance/vendorModel.js'
export function productionVendorRepository(){
 const store=getStore({name:'brevity-vendors',consistency:'strong'}),key=`${process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'}/workspace`
 return {
  async read(){const entry=await store.getWithMetadata(key,{type:'json'});return {value:entry?.data?.value||emptyVendors(),version:entry?.data?.version||0,record:entry?.data||null,etag:entry?.etag||null}},
  async write(value,expectedVersion,actor,mutationId=''){
   const current=await this.read();if(current.version!==expectedVersion)throw Object.assign(Error('Vendor records changed after review. Refresh and retry.'),{code:'VERSION_CONFLICT'})
   const record={value,version:current.version+1,updatedAt:new Date().toISOString(),updatedBy:actor,lastActionId:mutationId}
   if(current.record&&!current.etag)throw Error('Vendor storage did not provide a safe version marker.')
   const result=await store.setJSON(key,record,current.etag?{onlyIfMatch:current.etag}:{onlyIfNew:true})
   if(result?.modified===false)throw Object.assign(Error('Vendor records changed while saving.'),{code:'VERSION_CONFLICT'})
   return{value,version:record.version,record}
  },
 }
}
