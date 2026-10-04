import '../lib/native-runtime.mjs'
import {libraryImageBatch} from '../lib/meal-library-images-production.mjs'
export default async function handler(){
 const status=await (await libraryImageBatch()).status()
 if(!status.active)return
 if(!process.env.BREVITY_AUTOMATION_KEY)throw Error('BREVITY_AUTOMATION_KEY is required for meal image rendering.')
 const response=await fetch('https://brevityoflife.netlify.app/.netlify/functions/meal-library-images-background',{method:'POST',headers:{'content-type':'application/json','x-brevity-automation-key':process.env.BREVITY_AUTOMATION_KEY},body:'{}',signal:AbortSignal.timeout(10000)})
 if(!response.ok)throw Error(`Could not continue meal image rendering (${response.status}).`)
}
export const config={schedule:'*/2 * * * *'}
