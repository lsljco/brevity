const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' }
  if (event.httpMethod !== 'POST') return { statusCode:405, headers, body:JSON.stringify({ error:'Method not allowed' }) }
  return {
    statusCode:423,
    headers,
    body:JSON.stringify({
      code:'CONNECTION_MUTATIONS_DISABLED',
      error:'Disconnecting bank connections is disabled in this release. No bank credentials or connection records were changed.',
    }),
  }
}
