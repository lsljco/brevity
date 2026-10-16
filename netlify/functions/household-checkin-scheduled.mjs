import '../lib/native-runtime.mjs'
import {householdClock} from '../../src/household/dailyRhythm.js'
import {prepareCheckinMeeting} from '../lib/household-checkins.mjs'
export default async function handler(){
 const now=new Date(),{date,minute}=householdClock(now)
 if(minute<990||minute>=1020)return
 await prepareCheckinMeeting(date,{now})
}
export const config={schedule:'*/5 * * * *'}
