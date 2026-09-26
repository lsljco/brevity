import householdAuth from './household-auth.js'
import { productionMealPlanRepository } from '../lib/meal-plan-store.mjs'
import { getStore } from '@netlify/blobs'
import { mealImageContentType, mealImageKey, MEAL_IMAGE_STORE } from '../lib/meal-image.mjs'
import { randomUUID } from 'node:crypto'

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
      const requestedCount = event.queryStringParameters?.count
      const count = requestedCount === undefined ? 7 : Number(requestedCount)
      if (!Number.isInteger(count) || count < 1 || count > 31) return response(400, { error:'Choose a meal-plan window of 1 to 31 days.' })
      const plan = await repository.getWindowReadOnly({ startDate: event.queryStringParameters?.startDate, count })
      return response(200, plan)
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}')
      if (body.action === 'bulk-create') {
        const meals = await repository.createMeals({ meals:body.meals, actor:session.member || 'Household member' })
        return response(201, { meals })
      }
      const meal = await repository.createMeal({
        meal:{ ...body, image:'' },
        actor:session.member || 'Household member',
      })
      return response(201, { meal })
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}')
      if (body.action !== 'upload-image') return response(409, { error: 'Meal substitutions require review and confirmation. Refresh Brevity and use the meal replacement review.' })
      const libraryState = await repository.getLibrary()
      const meal = libraryState.library.find(candidate => candidate.id === body.mealId)
      if (!meal) return response(404, { error:'That meal is no longer in the household library.' })
      const imageStore = getStore({ name:MEAL_IMAGE_STORE, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
      const assetId = `${meal.id}-${randomUUID()}`
      let image
      const bytes=Buffer.from(String(body.imageBase64||''),'base64')
      if(!bytes.length||bytes.length>8*1024*1024)return response(400,{error:'Choose an image smaller than 8 MB.'})
      mealImageContentType(bytes)
      await imageStore.set(mealImageKey(process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family',assetId),bytes)
      image=`/.netlify/functions/meal-images?id=${encodeURIComponent(assetId)}`
      await repository.setMealImage({ mealId:meal.id, image, actor:session.member || 'Household member' })
      return response(200, { meal:{ ...meal, image, imageGenerated:true } })
    }

    return response(405, { error: 'Method not allowed.' })
  } catch (error) {
    console.error('[meal-plans]', error)
    const status = error.code === 'VERSION_CONFLICT' || error.code === 'REVIEW_REQUIRED' ? 409 : error.code === 'VALIDATION_ERROR' || /valid YYYY-MM-DD/.test(error.message) || error instanceof SyntaxError ? 400 : error.code === 'IMAGE_GENERATION_ERROR' ? 502 : 500
    return response(status, { error: error.message || 'Meal-plan request failed.' })
  }
}
