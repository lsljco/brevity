import { useMemo } from 'react'
import { HOUSEHOLD_MEMBERS } from '../homehq/projectData.js'
import { calculatePerformance,INTELLIGENCE_STORAGE_KEY,loadPerformanceSources,normalizeIntelligenceConfig,normalizePerformanceActivities,projectPerformance,resolveIntelligencePeriod } from './performanceIntelligence.js'

export default function TodayIntelligenceSummary({currentMember,onOpen}){
  const model=useMemo(()=>{let raw={};try{raw=JSON.parse(localStorage.getItem(INTELLIGENCE_STORAGE_KEY)||'{}')}catch{}const config=normalizeIntelligenceConfig(raw,HOUSEHOLD_MEMBERS),activities=normalizePerformanceActivities({...loadPerformanceSources(),members:HOUSEHOLD_MEMBERS,config});return projectPerformance(calculatePerformance({activities,config,members:HOUSEHOLD_MEMBERS,period:resolveIntelligencePeriod('today'),viewer:currentMember,isAdmin:false}))},[currentMember])
  const onTrack=model.householdPillars.filter(item=>item.attainment!=null&&item.attainment>=80).length,attention=model.householdPillars.filter(item=>item.attainment!=null&&item.attainment<80).length
  return <button type="button" className="today-intelligence-summary" onClick={onOpen}><i className="ti ti-chart-dots-3"/><span><small>Today’s Household Intelligence</small><strong>{model.overall==null?'Performance data is still taking shape':`${model.overall}% household alignment`}</strong><em>{model.overall==null?'Open to configure targets and classify activity':`${onTrack} pillars on track · ${attention} need attention`}</em></span><i className="ti ti-arrow-right"/></button>
}
