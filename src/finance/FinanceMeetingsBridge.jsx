import { useMemo } from 'react'
import { buildCanonicalFinanceModel } from './financeDomain.js'
import FinanceMeetingsWorkspace from './FinanceMeetingsWorkspace.jsx'

export default function FinanceMeetingsBridge({accounts=[],scheduled=[],cashFlowScheduled,actuals=[],budget={},projection}){
  const today=useMemo(()=>new Date(),[])
  const model=useMemo(()=>{
    const canonical=buildCanonicalFinanceModel({accounts,scheduled,cashFlowScheduled,actuals,budget,projection,today})
    const {metrics,breakdowns,sources}=canonical
    const liveSnapshot={
      currentMonthlyNet:metrics.actualMonthlyNet,
      actualMonthlyNet:metrics.actualMonthlyNet,
      projectedMonthlyNet:metrics.projectedMonthlyNet,
      operatingBalance:metrics.operatingBalance,
      operatingAvailable:metrics.operatingAvailable,
      todayInflows:metrics.todayInflows,
      todayObligations:metrics.todayObligations,
      approvedDiscretionary:metrics.approvedDiscretionary,
      weekInflows:metrics.weekInflows,
      weekObligations:metrics.weekObligations,
      monthForecast:metrics.monthForecast,
    }
    const drilldowns={
      currentMonthlyNet:{label:'Actual monthly net cash flow',amount:metrics.actualMonthlyNet,note:'Posted month-to-date income minus posted month-to-date expenses. Transfers are excluded.',source:'Canonical Finance ledger',children:[{label:'Income',amount:metrics.actualMonthlyIncome,meta:'Posted this month · transfers excluded',children:breakdowns.actual.income},{label:'Expenses',amount:metrics.actualMonthlyExpenses,meta:'Posted this month · transfers excluded',children:breakdowns.actual.expenses}]},
      actualMonthlyNet:{label:'Actual monthly net cash flow',amount:metrics.actualMonthlyNet,note:'Posted month-to-date income minus posted month-to-date expenses. Transfers are excluded.',source:'Canonical Finance ledger',children:[{label:'Income',amount:metrics.actualMonthlyIncome,children:breakdowns.actual.income},{label:'Expenses',amount:metrics.actualMonthlyExpenses,children:breakdowns.actual.expenses}]},
      projectedMonthlyNet:{label:'Projected monthly net cash flow',amount:metrics.projectedMonthlyNet,note:'All projected income minus all projected expenses for the calendar month. Transfers are excluded.',source:'Canonical Finance forecast',children:[{label:'Projected income',amount:metrics.projectedMonthlyIncome,children:breakdowns.projected.income},{label:'Projected expenses',amount:metrics.projectedMonthlyExpenses,children:breakdowns.projected.expenses}]},
      operatingAvailable:{label:'Available cash',amount:metrics.operatingAvailable,source:'Canonical Finance accounts',children:breakdowns.cashRows},
      operatingBalance:{label:'Current balance',amount:metrics.operatingBalance,source:'Canonical Finance accounts',children:breakdowns.cashRows},
      todayInflows:{label:'Expected inflows today / tomorrow',amount:metrics.todayInflows,source:'Canonical scheduled ledger',children:breakdowns.nearIncome},
      todayObligations:{label:'Obligations due today / tomorrow',amount:metrics.todayObligations,source:'Canonical scheduled ledger',children:breakdowns.nearExpenses},
      approvedDiscretionary:{label:'Approved discretionary amount',amount:metrics.approvedDiscretionary,note:'Remaining discretionary budget divided across the remaining days in the month.',source:'Canonical budget model',children:[]},
      weekInflows:{label:'Expected inflows this week',amount:metrics.weekInflows,source:'Canonical scheduled ledger',children:breakdowns.weekIncome},
      weekObligations:{label:'Obligations this week',amount:metrics.weekObligations,source:'Canonical scheduled ledger',children:breakdowns.weekExpenses},
      monthForecast:{label:'Projected month-end net cash flow',amount:metrics.monthForecast,note:'All projected monthly income minus all projected monthly expenses. Transfers are excluded.',source:'Canonical Finance forecast',children:[{label:'Income',amount:sources.forecast.income,children:breakdowns.projected.income},{label:'Expenses',amount:sources.forecast.expenses,children:breakdowns.projected.expenses}]},
      recurringMonthForecast:{label:'Recurring-only monthly net',amount:metrics.recurringMonthlyNet,note:'Recurring scheduled income minus recurring scheduled expenses.',source:'Canonical recurring plan',children:[]},
    }
    return {liveSnapshot,drilldowns}
  },[today,accounts,scheduled,cashFlowScheduled,actuals,budget,projection])

  const accountScope=useMemo(()=>!accounts.length?'No selected accounts':accounts.length===1?(accounts[0].name||accounts[0].accountName||'Selected account'):`${accounts.length} selected accounts`,[accounts])
  return <FinanceMeetingsWorkspace liveSnapshot={model.liveSnapshot} drilldowns={model.drilldowns} accountScope={accountScope}/>
}
