const disabled=()=>new Response(JSON.stringify({
  code:'CONNECTION_MUTATIONS_DISABLED',
  error:'Connecting or changing the OneDrive repository is disabled in this release. Existing authorized publishing remains unchanged.',
}),{status:423,headers:{'content-type':'application/json','cache-control':'no-store'}})

export default async function handler(){return disabled()}
export const config={path:'/.netlify/functions/onedrive-oauth-start'}
