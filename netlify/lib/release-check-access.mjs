import build from './release-build-context.mjs'
export function releaseCheckAccess(session,context=build){
 if(!context.preview)return {status:404,error:'Not found.'}
 if(!session)return {status:401,error:'Sign in to Brevity.'}
 if(session.role!=='admin')return {status:403,error:'Release checks require a household administrator.'}
 return null
}
export const releaseBuild=build
