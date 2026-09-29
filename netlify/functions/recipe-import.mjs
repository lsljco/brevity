import {withLambda} from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import { importRecipe } from '../lib/recipe-import.mjs'

const { readSession } = householdAuth
const headers = {'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'POST,OPTIONS'}
const json = (statusCode, body) => ({ statusCode, headers, body:JSON.stringify(body) })

const handler = async event => {
  if (event.httpMethod === 'OPTIONS') return {statusCode:204,headers,body:''}
  if (event.httpMethod !== 'POST') return json(405,{error:'Method not allowed.'})
  try {
    const session = await readSession(event)
    if (!session) return json(401,{error:'Sign in to import a recipe.'})
    const body = JSON.parse(event.body || '{}')
    return json(200,{recipe:await importRecipe(body.url)})
  } catch (error) {
    console.error('[recipe-import]', error)
    const status = Number(error.status) || (error instanceof SyntaxError ? 400 : 500)
    return json(status,{error:error.message || 'Recipe import failed.'})
  }
}

export const config = {path:'/.netlify/functions/recipe-import'}

export default withLambda(handler)

export {handler as lambdaHandler}
