import { withLambda } from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import { originalKey, originalStore } from '../lib/sermon-original.mjs'
import { productionSermonSourceRepository } from '../lib/sermon-source-repository.mjs'

const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'private, no-store'},body:JSON.stringify(body)})
export function createSermonOriginalHandler({readSession=householdAuth.readSession,store,repository}={}) {
  return async event=>{
    if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed.'})
    const session=await readSession(event).catch(()=>null)
    if(!session)return json(401,{error:'Sign in to read sermon documents.'})
    const hash=String(event.queryStringParameters?.sourceHash||'')
    if(!/^[a-f0-9]{64}$/.test(hash))return json(400,{error:'Invalid sermon source identity.'})
    try{
      const record=await (store||originalStore()).get(originalKey(hash),{type:'json'})
      if(!record)return json(404,{error:'No original Word file is retained for this source.'})
      if(record.uploadedBy!==session.member){
        const active=await (repository||productionSermonSourceRepository()).active()
        if(active?.value?.deleted||Number(active?.version||0)<1||active?.value?.source?.sourceHash!==hash)return json(404,{error:'That original document is not available.'})
      }
      if(event.queryStringParameters?.download!=='1')return json(200,{fileName:record.fileName,documentUrl:`/.netlify/functions/sermon-original?sourceHash=${hash}&download=1`})
      const fileName=String(record.fileName||'sermon.docx').replace(/["\r\n\\]/g,'').replace(/[^\x20-\x7e]/g,'_')
      return {statusCode:200,isBase64Encoded:true,headers:{'content-type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','content-disposition':`attachment; filename="${fileName}"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'},body:record.data}
    }catch{return json(503,{error:'The original Word document could not be loaded. Please retry.'})}
  }
}
const handler=createSermonOriginalHandler()
export { handler as lambdaHandler }
export default withLambda(handler)
