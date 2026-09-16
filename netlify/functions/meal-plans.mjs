import householdAuth from './household-auth.js'
import { productionMealPlanRepository } from '../lib/meal-plan-store.mjs'
import { getStore } from '@netlify/blobs'
import { generateMealImage, MEAL_IMAGE_STORE } from '../lib/meal-image.mjs'

const { readSession } = householdAuth
const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
}

const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })

export const handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }

  try {
    const session = await readSession(event)
    if (!session) return response(401, { error: 'Sign in to access the household meal plan.' })
    const repository = await productionMealPlanRepository()

    if (event.httpMethod === 'GET') {
      const plan = await repository.getWindowReadOnly({ startDate: event.queryStringParameters?.startDate, count: 7 })
      return response(200, plan)
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}')
      const imageStore = getStore({ name:MEAL_IMAGE_STORE, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
      const meal = await repository.createMeal({
        meal:{ ...body, image:'' },
        actor:session.member || 'Household member',
        generateImage:(candidate, assetId) => generateMealImage({ meal:candidate, assetId, householdId:process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family', store:imageStore }),
      })
      return response(201, { meal })
    }

    if (event.httpMethod === 'PUT') {
      return response(409, { error: 'Meal substitutions require review and confirmation. Refresh Brevity and use the meal replacement review.' })
    }

    return response(405, { error: 'Method not allowed.' })
  } catch (error) {
    console.error('[meal-plans]', error)
    const status = error.code === 'VERSION_CONFLICT' || error.code === 'REVIEW_REQUIRED' ? 409 : error.code === 'VALIDATION_ERROR' || /valid YYYY-MM-DD/.test(error.message) || error instanceof SyntaxError ? 400 : error.code === 'IMAGE_GENERATION_ERROR' ? 502 : 500
    return response(status, { error: error.message || 'Meal-plan request failed.' })
  }
}
