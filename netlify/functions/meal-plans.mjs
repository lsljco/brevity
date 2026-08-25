import householdAuth from './household-auth.js'
import { productionMealPlanRepository } from '../lib/meal-plan-store.mjs'

const { readSession } = householdAuth
const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,PUT,OPTIONS',
}

const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })

export const handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }

  try {
    const session = await readSession(event)
    if (!session) return response(401, { error: 'Sign in to access the household meal plan.' })
    const repository = await productionMealPlanRepository()

    if (event.httpMethod === 'GET') {
      const plan = await repository.getWindow({ startDate: event.queryStringParameters?.startDate, count: 7 })
      return response(200, plan)
    }

    if (event.httpMethod === 'PUT') {
      if ((event.body || '').length > 50000) return response(413, { error: 'Meal-plan update is too large.' })
      let body
      try { body = JSON.parse(event.body || '{}') } catch { return response(400, { error: 'Invalid JSON body.' }) }
      const day = await repository.substitute({ ...body, actor: session.member || session.name || 'Household member' })
      return response(200, { day })
    }

    return response(405, { error: 'Method not allowed.' })
  } catch (error) {
    console.error('[meal-plans]', error)
    const status = error.code === 'VERSION_CONFLICT' ? 409 : error.code === 'VALIDATION_ERROR' || /valid YYYY-MM-DD/.test(error.message) ? 400 : 500
    return response(status, { error: error.message || 'Meal-plan request failed.' })
  }
}
