import crypto from 'node:crypto'
const conflict=message=>Object.assign(Error(message),{status:409})
const digest=text=>crypto.createHash('sha256').update(text).digest('hex')
export function calendarPrivileges(xml=''){
 const value=String(xml).match(/<(?:\w+:)?current-user-privilege-set\b[^>]*>([\s\S]*?)<\/(?:\w+:)?current-user-privilege-set>/i)?.[1]||''
 const has=name=>new RegExp(`<(?:\\w+:)?${name}\\s*[/ >]`,'i').test(value)
 return {canBind:has('all')||has('write')||has('bind'),canUnbind:has('all')||has('write')||has('unbind')}
}
export function connectedCalendarChoices(calendar,selected=[]){
 const primary=calendar.sources?.find(source=>source.url===calendar.url)
 return [{...primary,...calendar,sources:undefined,id:primary?.id||calendar.id,owner:'Family'},...selected.filter(source=>source.id!==primary?.id).flatMap(source=>{const found=calendar.sources?.find(item=>item.id===source.id);return found?[{...source,...found,owner:source.owner}]:[]})]
}
export async function moveCalendarResource({item,source,destination,repository,request}){
 if(!item.actionId||!item.etag)throw conflict('Review this calendar move before applying it.')
 const href=new URL(item.href,source.url).href,prefix=new URL(source.url).href.replace(/\/?$/,'/')
 if(!href.startsWith(prefix)||href.slice(prefix.length).includes('/')||new URL(href).search||new URL(href).hash)throw conflict('The event does not belong to its reviewed calendar.')
 const target=new URL(href.slice(prefix.length),destination.url.replace(/\/?$/,'/')).href
 if(!target.startsWith(destination.url.replace(/\/?$/,'/'))||href===target)throw conflict('Choose a different connected calendar.')
 let receipt=await repository.getCalendarMutationReceipt(item.actionId),original
 if(receipt&&(receipt.kind!=='move'||receipt.href!==item.href||receipt.reviewedEtag!==item.etag||receipt.destination!==target))throw conflict('This move belongs to a different reviewed event.')
 try{original=await request(href,'GET','',{},'calendar move source verification')}catch(error){if(error.status!==404||!receipt)throw error}
 if(original){
  if(original.response.headers.get('etag')!==item.etag)throw conflict('This event changed after review. Refresh before moving it.')
  const bodyHash=digest(original.text)
  if(receipt&&receipt.bodyHash!==bodyHash)throw conflict('The event contents changed after review.')
  receipt=await repository.saveCalendarMutationReceipt({id:item.actionId,kind:'move',href:item.href,reviewedEtag:item.etag,destination:target,bodyHash,recordedAt:new Date().toISOString()})
  if(receipt.destination!==target||receipt.bodyHash!==bodyHash)throw conflict('This move identity belongs to another event or destination.')
  await request(href,'MOVE','',{'if-match':item.etag,destination:target,overwrite:'F'},'move calendar event')
 }
 const moved=await request(target,'GET','',{},'calendar move destination verification')
 if(!receipt||digest(moved.text)!==receipt.bodyHash||!moved.response.headers.get('etag'))throw conflict('The moved event could not be verified. Refresh the calendar before trying again.')
 return {text:moved.text,href:new URL(target).pathname,etag:moved.response.headers.get('etag')}
}
