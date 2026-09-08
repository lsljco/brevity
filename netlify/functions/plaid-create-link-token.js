const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' }
  return {
    statusCode:423,
    headers,
    body:JSON.stringify({
      code:'CONNECTION_MUTATIONS_DISABLED',
      error:'Adding or re-authenticating bank connections is disabled in this release. Existing verified connections can still be synchronized.',
    }),
  }
}
