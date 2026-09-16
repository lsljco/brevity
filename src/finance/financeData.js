import { writeSharedJson } from '../household/sharedState.js'

export const CALENDAR_DATA_VERSION = 6
export const financeBackupKey = key => `${key}_backup`

const LEGACY_FRIDAY_ANCHORS = {
  t_i1: { from: '2026-07-02', to: '2026-07-03' }, t_i3: { from: '2026-07-09', to: '2026-07-10' },
  t_i4: { from: '2026-07-02', to: '2026-07-03' }, t_i5: { from: '2026-07-02', to: '2026-07-03' },
  t_i6: { from: '2026-07-02', to: '2026-07-03' }, t_i7: { from: '2026-07-02', to: '2026-07-03' },
  t_t1: { from: '2026-07-02', to: '2026-07-03' }, t_f1: { from: '2026-07-02', to: '2026-07-03' },
  t_disc1: { from: '2026-07-02', to: '2026-07-03' },
}
const SHRINER_ID='t_i1', SHRINER_LAST_CHECK='2026-08-14', MATIV_ID='t_i5', MATIV_LAST_CHECK='2026-09-18', CRH_FIRST_CHECK='2026-09-04', PROPERTY_TAX_ID='t_h6'
const CRH_INCOME_NAME=/crh|old\s*castle/i
const CORRUPTED_CRH_INCOME_NAME=/^JS\s+Old\s+Castle\s+Iincome$/i

export function migrateFinanceData(data) {
  if (!data || typeof data !== 'object') return data
  const currentVersion=Number(data.calendarDataVersion)||0
  const hasCorruptedCrhIncome=Array.isArray(data.transactions)&&data.transactions.some(transaction=>
    transaction?.type==='income'&&CORRUPTED_CRH_INCOME_NAME.test(transaction.name||'')
  )
  if (currentVersion >= CALENDAR_DATA_VERSION&&!hasCorruptedCrhIncome) return data
  const transactions=Array.isArray(data.transactions)?data.transactions.map(transaction=>{
    const correction=LEGACY_FRIDAY_ANCHORS[transaction.id]; let next=transaction
    if(correction&&transaction.freq==='weekly'&&transaction.start===correction.from) next={...next,start:correction.to}
    if(transaction.id===SHRINER_ID&&(!transaction.end||transaction.end>SHRINER_LAST_CHECK)) next={...next,end:SHRINER_LAST_CHECK}
    if(currentVersion<3&&transaction.id===MATIV_ID&&(!transaction.end||transaction.end>MATIV_LAST_CHECK)) next={...next,end:MATIV_LAST_CHECK}
    if(currentVersion<3&&transaction.type==='income'&&transaction.start===CRH_FIRST_CHECK&&CRH_INCOME_NAME.test(transaction.name||'')&&transaction.freq!=='weekly') next={...next,freq:'weekly'}
    if(currentVersion<6&&transaction.id===PROPERTY_TAX_ID&&transaction.name==='Property Taxes'&&transaction.type==='expense'&&transaction.freq==='monthly') next={...next,freq:'yearly'}
    if(transaction.type==='income'&&CORRUPTED_CRH_INCOME_NAME.test(transaction.name||'')) next={...next,name:'JS CRH Oldcastle Income',cat:'Income'}
    return next
  }).filter(transaction=>!(currentVersion<4&&transaction.id==='t_i6'&&transaction.name==='LJ - Ameripro Income')):data.transactions
  return {...data,calendarDataVersion:CALENDAR_DATA_VERSION,transactions}
}

export function saveFinanceData(storage,key,data){
  if(typeof storage?.getItem!=='function'){
    try{
      const serialized=JSON.stringify(data)
      storage.setItem(key,serialized)
      let backupError=null
      try{storage.setItem(financeBackupKey(key),serialized)}catch(error){backupError=error}
      return{ok:true,backupError}
    }catch(error){return{ok:false,error}}
  }
  try{
    const result=writeSharedJson(storage,key,data)
    return{ok:result.ok,record:result.record,backupError:null,...(result.error?{error:result.error}:{})}
  }
  catch(error){return{ok:false,error}}
}

export function loadFinanceData(storage,key){
  let primaryError=null
  try{const primary=storage.getItem(key);if(primary)return{data:JSON.parse(primary),source:'primary'}}catch(error){primaryError=error}
  try{const backup=storage.getItem(financeBackupKey(key));if(backup)return{data:JSON.parse(backup),source:'backup',primaryError}}
  catch(backupError){return{data:null,source:'invalid',primaryError,backupError}}
  return{data:null,source:primaryError?'invalid':'empty',primaryError}
}

// A persisted finance record is authoritative even when its transaction list is
// empty. Re-seeding sample transactions after the user deletes the last item
// makes an honest empty state impossible and can silently resurrect expenses.
export function restorePersistedFinanceData(stored = {}, defaults = {}) {
  const transactions = Array.isArray(stored.transactions) ? stored.transactions : []
  const defaultAccounts = Array.isArray(defaults.accounts)
    ? defaults.accounts.map(account => ({ ...account }))
    : []
  const hasPersistedAccounts = Array.isArray(stored.accounts)
  const accounts = hasPersistedAccounts ? stored.accounts : defaultAccounts

  const accountIds = new Set(accounts.map(account => account.id))
  const orphanedCount = transactions.filter(transaction => transaction.acct && !accountIds.has(transaction.acct)).length
  let finalAccounts = accounts
  if ((!hasPersistedAccounts || accounts.length > 0) && transactions.length && orphanedCount > transactions.length * 0.5) {
    const existingIds = new Set(accounts.map(account => account.id))
    finalAccounts = [
      ...accounts,
      ...defaultAccounts.filter(account => !existingIds.has(account.id)),
    ]
  }

  return {
    ...defaults,
    ...stored,
    accounts: finalAccounts,
    transactions,
  }
}
