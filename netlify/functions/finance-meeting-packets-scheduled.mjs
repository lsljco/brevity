import '../lib/native-runtime.mjs'
import {preview} from '../lib/scoped-store.mjs'
export async function dispatchPackets({now=new Date(),fetcher=fetch,secret=process.env.BREVITY_AUTOMATION_KEY,origin=process.env.URL||'https://brevityoflife.netlify.app',isPreview=preview}={}){
  if(isPreview)return {skipped:true}
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(now))
  if(hour!==5)return {skipped:true}
  if(!secret)throw Error('The existing Brevity automation credential is required for automatic financial preparation.')
  const endpoint=new URL('/.netlify/functions/finance-meeting-packets-background',origin)
  if(endpoint.protocol!=='https:')throw Error('A secure deployment origin is required.')
  const response=await fetcher(endpoint,{method:'POST',headers:{'x-brevity-automation-key':secret}})
  if(!response.ok)throw Error('Automatic financial packet preparation could not be queued.')
  return {queued:true}
}
export default ()=>dispatchPackets()
// Both UTC hours cover daylight and standard time. The local-hour guard runs once.
export const config={schedule:'0 9,10 * * *'}
