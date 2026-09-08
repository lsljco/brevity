import { toISO } from './projection.js'
import { isTransferTransaction } from './reportingData.js'

const CASH_ACCOUNT_TYPES=new Set(['checking','savings'])

const finiteNumber=value=>value!==''&&value!=null&&Number.isFinite(Number(value))
const accountType=account=>String(account?.type||'').trim().toLowerCase()
const localAccountId=transaction=>transaction?.acct||transaction?.localAccountId||''

export function normalizeMeetingSourceStatus(status){
  const normalized=String(status||'unknown').trim().toLowerCase()
  return ['fresh','cached','stale','partial','unverified','unknown','disconnected','unmatched','ambiguous','incompatible'].includes(normalized)?normalized:'unknown'
}

export function classifyMeetingScheduledTransaction(transaction,cashAccountIds){
  if(transaction?.type!=='transfer')return cashAccountIds.has(localAccountId(transaction))?{kind:'cash',transaction}:null
  const sourceInCash=cashAccountIds.has(localAccountId(transaction))
  const destinationInCash=cashAccountIds.has(transaction?.transferTo)
  if(sourceInCash&&destinationInCash)return {kind:'internal-transfer',transaction:null}
  if(sourceInCash===destinationInCash)return null
  const direction=sourceInCash?'outbound':'inbound'
  const baseName=String(transaction?.name||transaction?.description||'Scheduled transfer').trim()
  return {
    kind:`boundary-transfer-${direction}`,
    transaction:{
      ...transaction,
      type:sourceInCash?'expense':'income',
      name:`Transfer ${sourceInCash?'out':'in'} · ${baseName}`,
      cat:sourceInCash?'Transfer out of selected cash':'Transfer into selected cash',
      meetingOriginalType:'transfer',
      meetingBoundaryTransfer:direction,
    },
  }
}

export function buildMeetingCashScope({accounts=[],scheduled=[],cashFlowScheduled,actuals=[],balanceDataStatus='unknown',transactionFreshnessStatus='unknown',today=new Date()}={}){
  const cashAccounts=accounts.filter(account=>CASH_ACCOUNT_TYPES.has(accountType(account)))
  const excludedAccounts=accounts.filter(account=>!CASH_ACCOUNT_TYPES.has(accountType(account)))
  const localIdCounts=new Map(),plaidIdCounts=new Map()
  accounts.forEach(account=>{
    if(account?.id)localIdCounts.set(account.id,(localIdCounts.get(account.id)||0)+1)
    if(account?.plaidAccountId)plaidIdCounts.set(account.plaidAccountId,(plaidIdCounts.get(account.plaidAccountId)||0)+1)
  })
  const cashAccountIds=new Set(cashAccounts.filter(account=>account?.id&&localIdCounts.get(account.id)===1).map(account=>account.id))
  const compatiblyLinkedCashAccounts=cashAccounts.filter(account=>{
    const type=accountType(account)
    return Boolean(account?.id)&&localIdCounts.get(account.id)===1
      &&Boolean(account?.plaidAccountId)&&plaidIdCounts.get(account.plaidAccountId)===1
      &&String(account?.plaidType||'').trim().toLowerCase()==='depository'
      &&String(account?.plaidSubtype||'').trim().toLowerCase()===type
  })
  const cashPlaidIds=new Set(compatiblyLinkedCashAccounts.map(account=>account.plaidAccountId))
  const classifyScheduled=transaction=>classifyMeetingScheduledTransaction(transaction,cashAccountIds)
  const scheduledClassifications=scheduled.map(classifyScheduled).filter(Boolean)
  const scopedScheduled=scheduledClassifications.flatMap(result=>result.transaction?[result.transaction]:[])
  const sourceScheduled=Array.isArray(cashFlowScheduled)?cashFlowScheduled:scheduled
  const scopedCashFlowScheduled=sourceScheduled.map(classifyScheduled).filter(result=>result?.transaction).map(result=>result.transaction)
  const scopedActuals=actuals.filter(transaction=>cashPlaidIds.has(transaction?.accountId))
  const hasCashAccounts=cashAccounts.length>0
  const transactionDataStatus=normalizeMeetingSourceStatus(transactionFreshnessStatus)
  const currentDateKey=toISO(today)
  const currentMonth=currentDateKey.slice(0,7)
  const hasRetainedScopedActuals=scopedActuals.some(transaction=>!transaction?.pending
    &&String(transaction?.date||'').startsWith(currentMonth)
    &&transaction.date<=currentDateKey
    &&!isTransferTransaction(transaction))
  const hasExactCashTransactionLinks=hasCashAccounts&&compatiblyLinkedCashAccounts.length===cashAccounts.length
  const actualMetricsAvailable=hasExactCashTransactionLinks&&(transactionDataStatus==='fresh'||hasRetainedScopedActuals)
  const hasCompleteStoredBalances=hasCashAccounts&&cashAccounts.every(account=>finiteNumber(account?.balance))
  const availableCash=hasCompleteStoredBalances?cashAccounts.reduce((sum,account)=>sum+Number(account.balance),0):null
  const hasVerifiedCashAnchors=hasCashAccounts&&cashAccounts.every(account=>{
    const type=accountType(account)
    return Boolean(account?.id)&&localIdCounts.get(account.id)===1
      &&Boolean(account?.plaidAccountId)
      &&plaidIdCounts.get(account.plaidAccountId)===1
      &&String(account?.plaidType||'').toLowerCase()==='depository'
      &&String(account?.plaidSubtype||'').toLowerCase()===type
      &&finiteNumber(account?.plaidCurrentBalance)
      &&finiteNumber(account?.balance)
  })
  const hasDistinctCurrentBalance=hasVerifiedCashAnchors&&cashAccounts.every(account=>finiteNumber(account?.plaidAvailableBalance))
  const currentBalance=hasDistinctCurrentBalance?cashAccounts.reduce((sum,account)=>sum+Number(account.plaidCurrentBalance),0):null
  const rawBalanceStatus=normalizeMeetingSourceStatus(balanceDataStatus)
  const meetingBalanceStatus=rawBalanceStatus==='fresh'&&!hasVerifiedCashAnchors?'unverified':rawBalanceStatus
  return {
    accounts:cashAccounts,
    excludedAccounts,
    scheduled:scopedScheduled,
    cashFlowScheduled:scopedCashFlowScheduled,
    actuals:scopedActuals,
    excludedActualCount:Math.max(actuals.length-scopedActuals.length,0),
    boundaryTransferCount:scheduledClassifications.filter(result=>result.kind.startsWith('boundary-transfer-')).length,
    internalCashTransferCount:scheduledClassifications.filter(result=>result.kind==='internal-transfer').length,
    hasCashAccounts,
    hasExactCashTransactionLinks,
    hasRetainedScopedActuals,
    actualMetricsAvailable,
    transactionDataStatus,
    availableCash,
    currentBalance,
    hasDistinctCurrentBalance,
    hasVerifiedCashAnchors,
    balanceDataStatus:meetingBalanceStatus,
  }
}

export function meetingBalanceQualification(status,{hasDistinctCurrentBalance=false}={}){
  switch(normalizeMeetingSourceStatus(status)){
    case 'fresh':return hasDistinctCurrentBalance
      ? 'Live bank balances verified in the latest refresh; available and current amounts are shown separately.'
      : 'Live bank balance verified in the latest refresh. The bank did not provide a distinct available amount, so one cash balance is shown.'
    case 'partial':return 'Partial balance refresh: confirmed cash accounts were updated while unconfirmed accounts retain stored values.'
    case 'cached':return 'Cached balance snapshot: no live bank balance was confirmed in this refresh.'
    case 'stale':return 'Stale balance snapshot: the latest bank balance refresh did not complete.'
    case 'disconnected':return 'Stored balance only: no connected bank balance source was confirmed.'
    case 'ambiguous':return 'Stored balance only: account linkage is ambiguous and current bank truth is not verified.'
    case 'incompatible':return 'Stored balance only: a linked bank account has an incompatible financial type.'
    case 'unmatched':return 'Stored balance only: returned bank accounts did not match this cash scope.'
    default:return 'Stored balance only: current bank freshness is not verified for this cash scope.'
  }
}

export function meetingTransactionQualification(status,{actualMetricsAvailable=true}={}){
  if(!actualMetricsAvailable)return 'Actual bank activity unavailable: no retained posted transactions are exactly linked to this cash scope, and an empty result has not been verified.'
  switch(normalizeMeetingSourceStatus(status)){
    case 'fresh':return 'Posted bank activity from the latest completed transaction refresh; pending items and transfers are excluded.'
    case 'partial':return 'Partial bank activity: confirmed sources were updated and unconfirmed sources retain their prior posted transactions.'
    case 'stale':return 'Stale bank activity: actual totals use the last retained posted transaction snapshot.'
    case 'cached':return 'Cached bank activity: actual totals use stored posted transactions without a live refresh.'
    case 'disconnected':return 'Stored bank activity: no connected transaction source was confirmed.'
    default:return 'Stored bank activity: transaction freshness is not verified for this snapshot.'
  }
}

export function meetingCoverageTone({availableCash=null,expectedInflows=null,obligations=null,balanceDataStatus='unknown'}={}){
  if(!finiteNumber(availableCash)||!finiteNumber(expectedInflows)||!finiteNumber(obligations))return 'yellow'
  const available=Number(availableCash)||0,inflows=Number(expectedInflows)||0,due=Number(obligations)||0
  const calculated=due>available+inflows?'red':available<due?'yellow':'green'
  if(normalizeMeetingSourceStatus(balanceDataStatus)==='fresh')return calculated
  return calculated==='red'?'red':'yellow'
}
