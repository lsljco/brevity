import {withLambda} from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import auth from '../lib/household-auth.cjs'
import {productionVendorRepository} from '../lib/vendor-store.mjs'
import {productionVendorVault,vendorVisible,detectVendorFile,MAX_VENDOR_FILE} from '../lib/vendor-vault.mjs'
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})}
const exact=(value,allowed)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('Unsupported vendor request.')}
export function createVendorHandler({authenticate=auth.readSession,verifyPassword=auth.verifyMemberPassword,repositoryFactory=productionVendorRepository,vaultFactory=productionVendorVault}={}){
 return async event=>{
  const headers={'content-type':'application/json','cache-control':'private, no-store','x-content-type-options':'nosniff'},reply=(statusCode,value)=>({statusCode,headers,body:JSON.stringify(value)})
  try{
   const session=await authenticate(event);if(!session)return reply(401,{error:'Sign in to Brevity.'})
   const repository=repositoryFactory(),workspace=await repository.read(),action=event.queryStringParameters?.action||'list'
   if(event.httpMethod==='GET'&&action==='list'){
    const vendors=workspace.value.vendors.filter(v=>vendorVisible(v,session)),ids=new Set(vendors.map(v=>v.id))
    return reply(200,{version:workspace.version,isAdmin:session.role==='admin',vendors,links:Object.fromEntries(Object.entries(workspace.value.links||{}).filter(([,id])=>ids.has(id)))})
   }
   if(event.httpMethod==='GET'&&action==='download'){
    const vendor=workspace.value.vendors.find(v=>v.id===event.queryStringParameters?.vendorId),blobId=event.queryStringParameters?.blobId
    if(!vendorVisible(vendor,session)||vendor.archived)fail('Vendor document unavailable.',403)
    const document=vendor.documents?.find(doc=>doc.blobId===blobId);if(!document)fail('Document not found.',404)
    const vault=vaultFactory(),bytes=await vault.read(vendor.id,blobId,'document');await vault.audit(session.member,vendor.id,'document-downloaded')
    return{statusCode:200,isBase64Encoded:true,headers:{...headers,'content-type':document.mimeType,'content-disposition':`attachment; filename="${document.fileName.replace(/[^a-zA-Z0-9_. -]/g,'_')}"`},body:bytes.toString('base64')}
   }
   if(event.httpMethod!=='POST')return reply(405,{error:'Unsupported vendor operation.'})
   if(!String(event.headers?.['content-type']||event.headers?.['Content-Type']||'').startsWith('application/json'))return reply(415,{error:'Use a JSON request.'})
   if(Buffer.byteLength(event.body||'')>4.3*1024*1024)fail('Upload is too large. Maximum file size is 3 MB.',413)
   let body;try{body=JSON.parse(event.body||'')}catch{fail('Invalid vendor request.')}
   const vendor=workspace.value.vendors.find(v=>v.id===body?.vendorId)
   if(!vendorVisible(vendor,session)||vendor.archived)fail('Vendor unavailable.',403)
   const vault=vaultFactory()
   if(action==='unlock'){
    exact(body,['vendorId','currentPassword']);await vault.consumeUnlockAttempt(session.member)
    if(!await verifyPassword(session.member,body.currentPassword))fail('Your Brevity password is incorrect.',403)
    const refreshed=(await repository.read()).value.vendors.find(v=>v.id===vendor.id)
    if(!vendorVisible(refreshed,session)||refreshed.archived)fail('Vendor unavailable.',403)
    if(!refreshed.loginBlobId)fail('No login details are saved.',404)
    const bytes=await vault.read(refreshed.id,refreshed.loginBlobId,'login');await vault.audit(session.member,vendor.id,'login-revealed')
    return reply(200,{login:JSON.parse(bytes.toString()),expiresInSeconds:60})
   }
   if(session.role!=='admin')fail('Vendor changes require the household administrator.',403)
   if(action==='stage-login'){
    exact(body,['vendorId','username','password','accountNumbers'])
    for(const field of ['username','password','accountNumbers'])if(typeof body[field]!=='string'||body[field].length>4000)fail('Login details are invalid.')
    if(!body.username&&!body.password&&!body.accountNumbers)fail('Enter login or account details.')
    const upload=await vault.stage(vendor.id,'login',Buffer.from(JSON.stringify({username:body.username,password:body.password,accountNumbers:body.accountNumbers})),{},session.member)
    return reply(201,{upload,message:'Encrypted and staged. Review in Action Mode to attach these details.'})
   }
   if(action==='stage-document'){
    exact(body,['vendorId','fileName','base64']);if(typeof body.base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64))fail('Invalid file encoding.')
    const bytes=Buffer.from(body.base64,'base64');if(!bytes.length||bytes.length>MAX_VENDOR_FILE)fail('Files must be between 1 byte and 3 MB.',413)
    if(typeof body.fileName!=='string'||!body.fileName.trim()||body.fileName.length>180)fail('Use a file name up to 180 characters.')
    const mimeType=detectVendorFile(bytes),fileName=body.fileName.replace(/[\u0000-\u001f\\/]/g,'_')
    const upload=await vault.stage(vendor.id,'document',bytes,{fileName,mimeType,size:bytes.length},session.member)
    return reply(201,{upload,message:'Encrypted and staged. Review in Action Mode to attach the document.'})
   }
   return reply(400,{error:'Unknown vendor operation.'})
  }catch(error){return reply(error.status||503,{error:error.status?error.message:'Vendor storage is temporarily unavailable. Please retry.'})}
 }
}
export const lambdaHandler=createVendorHandler()
export default withLambda(lambdaHandler)
