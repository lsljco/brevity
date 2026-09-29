import { getStore } from '../lib/scoped-store.cjs'
import { createHash } from 'node:crypto'
import householdAuth from './household-auth.js'
import { SERMON_IDENTITY_STORE,SERMON_PHOTO_SUBJECTS,sermonIdentityKey,sermonIdentityMetaKey } from '../lib/sermon-cover.mjs'

const {readSession}=householdAuth
const householdId=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
const identityStore=()=>getStore({name:SERMON_IDENTITY_STORE,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'},body:JSON.stringify(body)})
export function createSermonIdentitiesHandler({authenticate=readSession,storeFactory=identityStore}={}){
 return async event=>{try{
  const session=await authenticate(event);if(!session?.member)return json(401,{error:'Sign in to manage sermon identities.'})
  if(session.role!=='admin')return json(403,{error:'Only a household administrator can manage sermon identities.'})
  const store=storeFactory()
  if(event.httpMethod==='GET'){
   const members=await Promise.all(SERMON_PHOTO_SUBJECTS.filter(member=>member!=='none').map(async member=>({member,uploaded:!!(await store.get(sermonIdentityKey(householdId,member),{type:'arrayBuffer'}))})))
   return json(200,{members})
  }
  if(event.httpMethod!=='PUT')return json(405,{error:'Method not allowed.'})
  const body=JSON.parse(event.body||'{}'),member=body.member
  if(!SERMON_PHOTO_SUBJECTS.includes(member)||member==='none')return json(400,{error:'Choose an approved household member.'})
  const encoded=String(body.imageBase64||'')
  if(encoded.length>9_000_000||!/^[A-Za-z0-9+/=]+$/.test(encoded))return json(400,{error:'Choose a JPEG image smaller than 6 MB.'})
  const bytes=Buffer.from(encoded,'base64')
  if(bytes.length<100||bytes.length>6_000_000||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)return json(400,{error:'Choose a valid JPEG image smaller than 6 MB.'})
  await store.set(sermonIdentityKey(householdId,member),bytes)
  await store.setJSON(sermonIdentityMetaKey(householdId,member),{version:createHash('sha256').update(bytes).digest('hex'),updatedAt:new Date().toISOString()})
  return json(200,{member,uploaded:true})
 }catch(error){console.error('[sermon-identities]',error);return json(500,{error:'Could not save the identity reference.'})}}
}
export const handler=createSermonIdentitiesHandler()
