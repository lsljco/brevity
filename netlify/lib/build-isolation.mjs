// Deployment metadata is baked at build time, never taken from a request header.
const stagingHost='brevity-architect-staging.netlify.app'
export function releaseContext(env){
 let siteHost='';try{siteHost=new URL(env.URL||'').hostname}catch{}
 const staging=siteHost===stagingHost||env.SITE_NAME==='brevity-architect-staging'
 return {preview:env.CONTEXT==='deploy-preview'||staging,commit:env.COMMIT_REF||'local',reviewId:env.REVIEW_ID||(staging?'staging':''),origin:env.DEPLOY_PRIME_URL||env.URL||''}
}
export function allowedReleaseOrigin(host,origin,context){
 if(!context.preview||!host||origin&&origin!==`https://${host}`)return false
 let bound;try{bound=new URL(context.origin)}catch{return false}
 if(bound.protocol!=='https:'||bound.host!==host)return false
 return /^deploy-preview-\d+--brevityoflife\.netlify\.app$/.test(host)||/^(?:(?:deploy-preview-\d+|main)--)?brevity-architect-staging\.netlify\.app$/.test(host)
}
