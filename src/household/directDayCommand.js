import {fetchDailyPlan} from './householdApi.js'
import {getHouseholdDateKey} from '../finance/financeTime.js'
import {prepareDirectAction,executeAssistantProposal} from '../assistant/assistantApi.js'
import {exactDayCompletion} from './dayVoiceIntent.js'
import {dayItemChange,createDaySave} from './directDayActions.js'
const pending=new Map()
export async function directDayCommand(text,{date,member}){
 if(!/^(?:hey[, ]+brevity[, ]*|brevity[, :]+)?(?:please )?mark .+ (?:as )?(?:complete|completed|done)[.!]?$/i.test(text.trim()))return null
 const targetDate=date||getHouseholdDateKey(),key=JSON.stringify([member,targetDate,text.trim()])
 let command=pending.get(key)
 if(!command){
  const plan=await fetchDailyPlan(targetDate)
  if(!plan)return null
  const item=exactDayCompletion(text,plan,member)
  if(!item)return null
  command={item,result:null}
  command.save=createDaySave(dayItemChange(plan,item,{status:'complete'}),{prepare:prepareDirectAction,execute:async args=>{command.result=await executeAssistantProposal(args);return command.result}})
  pending.set(key,command)
 }
 const audit=await command.save();pending.delete(key)
 return {message:`Saved: ${command.item.title} is complete. You can undo this in Action Mode history.`,audit,conversation:command.result?.conversation}
}
