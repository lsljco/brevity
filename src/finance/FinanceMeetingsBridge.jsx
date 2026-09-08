import { useMemo } from 'react'
import { buildCanonicalFinanceModel } from './financeDomain.js'
import { buildMeetingCashScope, meetingBalanceQualification, meetingTransactionQualification, normalizeMeetingSourceStatus } from './financeMeetingTruth.js'
import FinanceMeetingsWorkspace from './FinanceMeetingsWorkspace.jsx'

export default function FinanceMeetingsBridge({accounts=[],scheduled=[],cashFlowScheduled,actuals=[],budget={},budgetLegacyYear,budgetLegacyAccountId,projection,currentMember='Household member',balanceDataStatus='unknown',transactionFreshnessStatus='unknown',readOnly=false,financeReadOnly=readOnly,meetingPlanningReadOnly=readOnly}){
  const today=useMemo(()=>new Date(),[])
  const meetingScope=useMemo(()=>buildMeetingCashScope({accounts,scheduled,cashFlowScheduled,actuals,balanceDataStatus,transactionFreshnessStatus,today}),[accounts,scheduled,cashFlowScheduled,actuals,balanceDataStatus,transactionFreshnessStatus,today])
  const model=useMemo(()=>{
    const canonical=buildCanonicalFinanceModel({accounts:meetingScope.accounts,scheduled:meetingScope.scheduled,cashFlowScheduled:meetingScope.cashFlowScheduled,actuals:meetingScope.actuals,budget,budgetLegacyYear,budgetLegacyAccountId,today})
    const {metrics,breakdowns,sources}=canonical
    const balanceQualification=meetingBalanceQualification(meetingScope.balanceDataStatus,{hasDistinctCurrentBalance:meetingScope.hasDistinctCurrentBalance})
    const transactionQualification=meetingTransactionQualification(transactionFreshnessStatus,{actualMetricsAvailable:meetingScope.actualMetricsAvailable})
    const cashMetric=value=>meetingScope.hasCashAccounts?value:null
    const actualMetric=value=>meetingScope.actualMetricsAvailable?value:null
    const transferProjectionNote='Internal checking/savings transfers are neutral. Transfers crossing this cash scope count as projected inflows or obligations.'
    const balanceRows=meetingScope.availableCash==null?[]:meetingScope.accounts.map(account=>({id:account.id,label:account.name||account.accountName||'Cash account',amount:Number(account.balance),meta:balanceQualification}))
    const currentRows=meetingScope.hasDistinctCurrentBalance?meetingScope.accounts.map(account=>({id:account.id,label:account.name||account.accountName||'Cash account',amount:Number(account.plaidCurrentBalance),meta:'Bank current balance from the same verified refresh.'})):[]
    const liveSnapshot={
      currentMonthlyNet:actualMetric(metrics.actualMonthlyNet),
      actualMonthlyNet:actualMetric(metrics.actualMonthlyNet),
      projectedMonthlyNet:cashMetric(metrics.projectedMonthlyNet),
      operatingBalance:meetingScope.currentBalance,
      operatingAvailable:meetingScope.availableCash,
      todayInflows:cashMetric(metrics.todayInflows),
      todayObligations:cashMetric(metrics.todayObligations),
      approvedDiscretionary:cashMetric(metrics.approvedDiscretionary),
      weekInflows:cashMetric(metrics.weekInflows),
      weekObligations:cashMetric(metrics.weekObligations),
      monthForecast:cashMetric(metrics.monthForecast),
    }
    const drilldowns={
      currentMonthlyNet:{label:'Actual monthly net cash flow',amount:actualMetric(metrics.actualMonthlyNet),note:transactionQualification,source:'Canonical Finance ledger · checking and savings only',children:meetingScope.actualMetricsAvailable?[{label:'Realized income',amount:metrics.actualMonthlyIncome,meta:'Posted this month · transfers excluded',children:breakdowns.actual.income},{label:'Refunds and other cash inflows',amount:metrics.actualMonthlyOtherInflows,meta:'Posted cash credits that are not earned income',children:breakdowns.actual.otherInflows},{label:'Posted expenses',amount:metrics.actualMonthlyExpenses,meta:'Posted this month · transfers excluded',children:breakdowns.actual.expenses}]:[]},
      actualMonthlyNet:{label:'Actual monthly net cash flow',amount:actualMetric(metrics.actualMonthlyNet),note:transactionQualification,source:'Canonical Finance ledger · checking and savings only',children:meetingScope.actualMetricsAvailable?[{label:'Realized income',amount:metrics.actualMonthlyIncome,children:breakdowns.actual.income},{label:'Refunds and other cash inflows',amount:metrics.actualMonthlyOtherInflows,children:breakdowns.actual.otherInflows},{label:'Posted expenses',amount:metrics.actualMonthlyExpenses,children:breakdowns.actual.expenses}]:[]},
      projectedMonthlyNet:{label:'Projected monthly net cash flow',amount:cashMetric(metrics.projectedMonthlyNet),note:`All projected cash inflows minus projected obligations for the calendar month. ${transferProjectionNote}`,source:'Canonical Finance forecast',children:meetingScope.hasCashAccounts?[{label:'Projected inflows',amount:metrics.projectedMonthlyIncome,children:breakdowns.projected.income},{label:'Projected obligations',amount:metrics.projectedMonthlyExpenses,children:breakdowns.projected.expenses}]:[]},
      operatingAvailable:{label:meetingScope.hasDistinctCurrentBalance?'Available cash':'Cash balance',amount:meetingScope.availableCash,note:balanceQualification,source:'Checking and savings account scope',children:balanceRows},
      operatingBalance:{label:'Current balance',amount:meetingScope.currentBalance,note:balanceQualification,source:'Checking and savings account scope',children:currentRows},
      todayInflows:{label:'Projected inflows today / tomorrow',amount:cashMetric(metrics.todayInflows),note:`Scheduled plan entries are projections; they are not treated as completed bank activity. ${transferProjectionNote}`,source:'Canonical scheduled ledger',children:meetingScope.hasCashAccounts?breakdowns.nearIncome:[]},
      todayObligations:{label:'Projected obligations today / tomorrow',amount:cashMetric(metrics.todayObligations),note:`Scheduled plan entries are projections; they are not treated as completed bank activity. ${transferProjectionNote}`,source:'Canonical scheduled ledger',children:meetingScope.hasCashAccounts?breakdowns.nearExpenses:[]},
      approvedDiscretionary:{label:'Approved discretionary amount',amount:cashMetric(metrics.approvedDiscretionary),note:'Remaining discretionary budget divided across the remaining days in the month.',source:'Canonical budget model',children:[]},
      weekInflows:{label:'Projected inflows this week',amount:cashMetric(metrics.weekInflows),note:`Scheduled plan entries are projections; they are not treated as completed bank activity. ${transferProjectionNote}`,source:'Canonical scheduled ledger',children:meetingScope.hasCashAccounts?breakdowns.weekIncome:[]},
      weekObligations:{label:'Projected obligations this week',amount:cashMetric(metrics.weekObligations),note:`Scheduled plan entries are projections; they are not treated as completed bank activity. ${transferProjectionNote}`,source:'Canonical scheduled ledger',children:meetingScope.hasCashAccounts?breakdowns.weekExpenses:[]},
      monthForecast:{label:'Projected month-end net cash flow',amount:cashMetric(metrics.monthForecast),note:`All projected monthly cash inflows minus projected obligations. ${transferProjectionNote}`,source:'Canonical Finance forecast',children:meetingScope.hasCashAccounts?[{label:'Inflows',amount:sources.forecast.income,children:breakdowns.projected.income},{label:'Obligations',amount:sources.forecast.expenses,children:breakdowns.projected.expenses}]:[]},
      recurringMonthForecast:{label:'Recurring-only monthly net',amount:cashMetric(metrics.recurringMonthlyNet),note:`Recurring scheduled cash inflows minus recurring scheduled obligations. ${transferProjectionNote}`,source:'Canonical recurring plan',children:[]},
    }
    return {liveSnapshot,drilldowns}
  },[today,meetingScope,budget,budgetLegacyYear,budgetLegacyAccountId,transactionFreshnessStatus])

  const accountScope=useMemo(()=>{
    const cashLabel=!meetingScope.accounts.length?'No selected checking or savings accounts':meetingScope.accounts.length===1?`${meetingScope.accounts[0].name||meetingScope.accounts[0].accountName||'Selected cash account'} · checking/savings cash only`:`${meetingScope.accounts.length} selected checking/savings cash accounts`
    const excludedTypes=[...new Set(meetingScope.excludedAccounts.map(account=>String(account?.type||'other').toLowerCase()))].join(', ')
    const accountExclusion=meetingScope.excludedAccounts.length?` ${meetingScope.excludedAccounts.length} selected non-cash account${meetingScope.excludedAccounts.length===1?' is':'s are'} excluded${excludedTypes?` (${excludedTypes})`:''}; non-cash accounts do not count toward coverage.`:''
    const activityExclusion=meetingScope.excludedActualCount?` ${meetingScope.excludedActualCount} bank transaction${meetingScope.excludedActualCount===1?' is':'s are'} outside exact cash-account links and excluded from actual totals.`:''
    const transferScope=meetingScope.boundaryTransferCount||meetingScope.internalCashTransferCount?` ${meetingScope.boundaryTransferCount} boundary transfer${meetingScope.boundaryTransferCount===1?'':'s'} count as projected cash movement; ${meetingScope.internalCashTransferCount} transfer${meetingScope.internalCashTransferCount===1?'':'s'} within selected cash remain neutral.`:''
    return `${cashLabel}.${accountExclusion}${activityExclusion}${transferScope}`
  },[meetingScope])
  return <FinanceMeetingsWorkspace liveSnapshot={model.liveSnapshot} drilldowns={model.drilldowns} accountScope={accountScope} currentMember={currentMember} balanceDataStatus={meetingScope.balanceDataStatus} transactionFreshnessStatus={normalizeMeetingSourceStatus(transactionFreshnessStatus)} hasDistinctCurrentBalance={meetingScope.hasDistinctCurrentBalance} hasCashAccounts={meetingScope.hasCashAccounts} actualMetricsAvailable={meetingScope.actualMetricsAvailable} readOnly={readOnly} financeReadOnly={financeReadOnly} meetingPlanningReadOnly={meetingPlanningReadOnly}/>
}
