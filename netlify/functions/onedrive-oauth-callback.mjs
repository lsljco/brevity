const disabled=()=>new Response(JSON.stringify({
  code:'CONNECTION_MUTATIONS_DISABLED',
  error:'OneDrive authorization callbacks are disabled in this release. No repository credentials or connection state were changed.',
}),{status:423,headers:{'content-type':'application/json','cache-control':'no-store'}})

export default async function handler(){return disabled()}
export const config={path:'/.netlify/functions/onedrive-oauth-callback'}
