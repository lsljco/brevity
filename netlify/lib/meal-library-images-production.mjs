import {getStore} from './scoped-store.mjs'
import {productionMealPlanRepository} from './meal-plan-store.mjs'
import {MEAL_IMAGE_STORE} from './meal-image.mjs'
import {BATCH_STORE,createLibraryImageBatch} from './meal-library-images.mjs'
export async function libraryImageBatch(){
 const options={consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN}
 return createLibraryImageBatch({store:getStore({name:BATCH_STORE,...options}),imageStore:getStore({name:MEAL_IMAGE_STORE,...options}),repository:await productionMealPlanRepository(),householdId:process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'})
}
