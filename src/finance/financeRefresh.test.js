import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchLatestPlaidTransactions, mergePlaidBalances, mergePlaidTransactionResponse, mergePlaidTransactionSnapshots, readTransactionFreshness, refreshFinanceData, scopePlaidTransactionsByAccount, transactionSnapshotFingerprint } from './financeRefresh.js'

test('startup balance refresh updates existing accounts without creating duplicates', () => {
  const finance = { accounts:[
    { id:'a1', name:'Operating Account', type:'checking', balance:10, plaidAccountId:'plaid-1' },
    { id:'a2', name:'Family Savings', type:'savings', balance:20 },
  ], transactions:[{ id:'keep-me' }] }
  const refreshed = mergePlaidBalances(finance, [
    { accountId:'plaid-1', name:'Bank Primary Checking', officialName:'Bank Complete Checking', type:'depository', subtype:'checking', balance:1500, availableBalance:1525, institution:'Pinnacle', mask:'607' },
    { accountId:'plaid-2', name:'Family Savings', subtype:'savings', balance:2200 },
    { accountId:'plaid-extra', name:'Do Not Create', subtype:'checking', balance:999 },
  ])
  assert.deepEqual(refreshed.accounts.map(account=>[account.id,account.balance,account.plaidAccountId]), [
    ['a1',1500,'plaid-1'],
    ['a2',2200,'plaid-2'],
  ])
  assert.equal(refreshed.transactions[0].id, 'keep-me')
  assert.equal(refreshed.accounts[0].name, 'Operating Account')
  assert.equal(refreshed.accounts[0].type, 'checking')
  assert.equal(refreshed.accounts[0].plaidName, 'Bank Primary Checking')
  assert.equal(refreshed.accounts[0].plaidOfficialName, 'Bank Complete Checking')
  assert.equal(refreshed.accounts[0].plaidType, 'depository')
  assert.equal(refreshed.accounts[0].plaidSubtype, 'checking')
  assert.equal(refreshed.accounts[0].institution, 'Pinnacle')
  assert.equal(refreshed.accounts[0].mask, '607')
  assert.equal(refreshed.accounts[0].plaidCurrentBalance, 1525)
})

test('does not guess between ambiguous Plaid accounts using only a broad type', () => {
  const finance = { accounts: [{ id: 'operating', name: 'Operating Account', type: 'checking', balance: 10 }], transactions: [] }
  const refreshed = mergePlaidBalances(finance, [
    { accountId: 'checking-1', name: 'Primary Checking', type: 'depository', subtype: 'checking', balance: 100 },
    { accountId: 'checking-2', name: 'Secondary Checking', type: 'depository', subtype: 'checking', balance: 200 },
  ])
  assert.equal(refreshed.accounts[0].balance, 10)
  assert.equal(refreshed.accounts[0].plaidAccountId, undefined)
})

test('uses a single compatible type fallback only when the mapping is unambiguous', () => {
  const finance = { accounts: [{ id: 'operating', name: 'Operating Account', type: 'checking', balance: 10 }], transactions: [] }
  const refreshed = mergePlaidBalances(finance, [
    { accountId: 'checking-1', name: 'Bank Account', type: 'depository', subtype: 'checking', balance: 100 },
  ])
  assert.equal(refreshed.accounts[0].balance, 100)
  assert.equal(refreshed.accounts[0].plaidAccountId, 'checking-1')
})

test('does not link an exact account name when the financial account types conflict', () => {
  const finance = { accounts: [{ id: 'savings', name: 'Primary Account', type: 'savings', balance: 10 }], transactions: [] }
  const refreshed = mergePlaidBalances(finance, [
    { accountId: 'checking-1', name: 'Primary Account', type: 'depository', subtype: 'checking', balance: 100 },
  ])
  assert.equal(refreshed.accounts[0].balance, 10)
  assert.equal(refreshed.accounts[0].plaidAccountId, undefined)
})

test('transaction snapshot fingerprint detects new pending transactions', () => {
  const before = [{ id:'apple', date:'2026-09-06', amount:49.98, pending:true }]
  const after = [...before, { id:'groceries', date:'2026-09-06', amount:150.12, pending:true }]
  assert.notEqual(transactionSnapshotFingerprint(before), transactionSnapshotFingerprint(after))
})

test('account-scoped bank activity reports unmapped rows and only includes them in the all-accounts view', () => {
  const transactions = [
    { id:'operating', accountId:'plaid-operating' },
    { id:'savings', accountId:'plaid-savings' },
    { id:'unmapped', accountId:'new-plaid-account' },
  ]
  const accountMap = { 'plaid-operating':'a1', 'plaid-savings':'a2' }

  const operating = scopePlaidTransactionsByAccount(transactions, accountMap, new Set(['a1']))
  assert.deepEqual(operating.included.map(transaction => transaction.id), ['operating'])
  assert.deepEqual(operating.unmapped.map(transaction => transaction.id), ['unmapped'])

  const all = scopePlaidTransactionsByAccount(transactions, accountMap, new Set(['a1','a2']), { includeUnmapped:true })
  assert.deepEqual(all.included.map(transaction => transaction.id), ['operating','savings','unmapped'])
  assert.deepEqual(all.unmapped.map(transaction => transaction.id), ['unmapped'])
})

test('account scope safely recovers stale Plaid ids from a unique institution identity', () => {
  const transactions = [{ id:'legacy-operating', accountId:'old-plaid-id', institution:'Pinnacle' }]
  const accountMap = { 'current-plaid-id':'a1', 'institution:pinnacle':'a1' }
  const result = scopePlaidTransactionsByAccount(transactions, accountMap, new Set(['a1']))
  assert.deepEqual(result.included.map(transaction => transaction.id), ['legacy-operating'])
  assert.deepEqual(result.unmapped, [])
})

test('partial Plaid snapshots retain cached rows for failed institutions', () => {
  const cached = [
    { id:'old-operating', institution:'Pinnacle', date:'2026-09-06', amount:10 },
    { id:'old-savings', institution:'Second Bank', date:'2026-09-05', amount:20 },
    { id:'legacy-without-institution', date:'2026-09-04', amount:30 },
  ]
  const fresh = [{ id:'new-savings', institution:'Second Bank', date:'2026-09-07', amount:40 }]
  const merged = mergePlaidTransactionSnapshots(cached, fresh, [{ institution:'Pinnacle' }])

  assert.deepEqual(merged.map(transaction => transaction.id), [
    'new-savings',
    'old-operating',
    'legacy-without-institution',
  ])
})

test('incremental Plaid deltas upsert confirmed changes, apply removals, and retain unmentioned history', () => {
  const cached = [
    { id:'unchanged', institution:'Pinnacle', date:'2026-09-01', amount:10 },
    { id:'modified', institution:'Pinnacle', date:'2026-09-02', amount:20 },
    { id:'removed', institution:'Pinnacle', date:'2026-09-03', amount:30 },
    { id:'failed-bank-history', institution:'Second Bank', date:'2026-09-04', amount:40 },
  ]
  const merged = mergePlaidTransactionResponse(cached, {
    mode:'incremental',
    transactions:[
      { id:'modified', institution:'Pinnacle', date:'2026-09-07', amount:25 },
      { id:'new', institution:'Pinnacle', date:'2026-09-06', amount:50 },
    ],
    removed:['removed'],
    errors:[{ institution:'Second Bank', message:'Unavailable' }],
  })
  assert.deepEqual(merged.map(item => item.id), ['modified','new','failed-bank-history','unchanged'])
  assert.equal(merged.find(item => item.id === 'modified').amount, 25)
  assert.equal(merged.some(item => item.id === 'removed'), false)
})

test('on-demand transaction refresh returns one receipt-bearing batch and remains partial until a later post-request sync', async () => {
  const calls=[]
  const payloads=[
    {transactions:[],refresh:{requested:true,accepted:1,errors:[]}},
    {mode:'incremental',transactions:[{id:'new',amount:48.32,pending:true}],removed:[],sourceReceipts:[{cursorIdentity:'item-1',batchId:'a'.repeat(64)}]},
  ]
  const result=await fetchLatestPlaidTransactions({
    requestBankUpdate:true,
    fetcher:async path=>{calls.push(path);return payloads.shift()},
  })
  assert.match(calls[0],/refresh=1&refresh_only=1/)
  assert.equal(calls.length,2)
  assert.equal(calls[1],'/plaid-transactions')
  assert.equal(result.transactions.length,1)
  assert.equal(result.refresh.updated,true)
  assert.equal(result.refresh.stillProcessing,true)
})

test('on-demand refresh never calls a first delta proof that the asynchronous bank update finished', async () => {
  const calls=[]
  const result=await fetchLatestPlaidTransactions({
    requestBankUpdate:true,
    fetcher:async path=>{
      calls.push(path)
      return path.includes('refresh_only=1')
        ? {refresh:{requested:true,accepted:1,errors:[]}}
        : {mode:'incremental',transactions:[{id:'new',amount:48.32,date:'2026-09-07'}],removed:[],errors:[]}
    },
  })
  assert.equal(calls.length,2)
  assert.equal(result.refresh.updated,true)
  assert.equal(result.refresh.stillProcessing,true)
})

test('on-demand transaction refresh reports when Plaid is still processing', async () => {
  const snapshot={mode:'incremental',transactions:[],removed:[]}
  const result=await fetchLatestPlaidTransactions({
    requestBankUpdate:true,
    fetcher:async path=>path.includes('refresh_only=1')?{transactions:[],refresh:{requested:true,accepted:1,errors:[]}}:snapshot,
  })
  assert.equal(result.refresh.updated,false)
  assert.equal(result.refresh.stillProcessing,true)
})

test('on-demand institution refresh receives a longer timeout without weakening ordinary reads', async () => {
  const calls=[]
  await fetchLatestPlaidTransactions({
    requestBankUpdate:true,
    fetcher:async (path,options)=>{calls.push({path,options});return path.includes('refresh_only=1')?{transactions:[],refresh:{requested:true,accepted:0,errors:[]}}:{transactions:[]}},
  })
  assert.equal(calls[0].options.timeoutMs,45000)
  assert.equal(calls[1].path,'/plaid-transactions')
  assert.equal(calls[1].options.timeoutMs,60000)
})

test('a failed optional bank-update request still drains the durable transaction cursor', async () => {
  const calls=[]
  const result=await fetchLatestPlaidTransactions({
    requestBankUpdate:true,
    fetcher:async path=>{
      calls.push(path)
      if(path.includes('refresh_only=1')){const error=new Error('Bank update request timed out.');error.code='TRANSACTION_SYNC_TIMEOUT';throw error}
      return {mode:'incremental',transactions:[{id:'replayed',amount:10,date:'2026-09-07'}],removed:[],sourceReceipts:[{cursorIdentity:'item-1',batchId:'a'.repeat(64)}]}
    },
  })
  assert.equal(calls.length,2)
  assert.equal(calls[1],'/plaid-transactions')
  assert.equal(result.transactions[0].id,'replayed')
  assert.equal(result.refresh.requestStatus,'unconfirmed')
  assert.equal(result.refresh.errors.length,1)
})

test('read-only refresh returns current bank data without changing browser or shared finance state', async () => {
  const values=new Map([['lslj_finance_v9',JSON.stringify({
    calendarDataVersion:6,
    accounts:[{id:'operating',name:'Operating Account',type:'checking',balance:10}],
    transactions:[],
  })]])
  const writes=[]
  const storage={
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>{writes.push([key,value]);values.set(key,value)},
  }
  const result=await refreshFinanceData(storage,{
    persist:false,
    requestBankUpdate:false,
    fetchAccounts:async()=>({connected:true,syncedAt:'2026-09-07T12:00:00.000Z',accounts:[{accountId:'plaid-operating',name:'Operating Account',type:'depository',subtype:'checking',balance:756.74}]}),
    fetchTransactions:async()=>({transactions:[{id:'actual-one',accountId:'plaid-operating',amount:16.15,date:'2026-09-07'}]}),
  })
  assert.equal(result.finance.accounts[0].balance,756.74)
  assert.equal(result.actuals.length,1)
  assert.deepEqual(writes,[])
  assert.equal(JSON.parse(values.get('lslj_finance_v9')).accounts[0].balance,10)
})

test('failed transaction refresh preserves the cached snapshot and rejects so automatic retry can run', async () => {
  const cached=[{id:'cached-actual',institution:'Pinnacle',amount:16.15,date:'2026-09-06'}]
  const values=new Map([
    ['lslj_finance_v9',JSON.stringify({calendarDataVersion:6,accounts:[],transactions:[]})],
    ['plaid_actuals_cache',JSON.stringify(cached)],
  ])
  const storage={
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>values.set(key,value),
  }

  await assert.rejects(
    refreshFinanceData(storage,{
      fetchAccounts:async()=>({connected:false,accounts:[]}),
      fetchTransactions:async()=>{throw new Error('Transactions are temporarily unavailable.')},
    }),
    error => {
      assert.equal(error.detail.transactionDataStatus,'stale')
      assert.equal(error.detail.actuals,undefined)
      assert.deepEqual(error.detail.lastKnownActuals,cached)
      return true
    },
  )
  assert.deepEqual(JSON.parse(values.get('plaid_actuals_cache')),cached)
})

test('application refresh waits for versioned source acknowledgements before publishing success', async () => {
  const values=new Map([
    ['lslj_finance_v9',JSON.stringify({calendarDataVersion:6,accounts:[{id:'operating',name:'Operating Account',type:'checking',balance:10}],transactions:[]})],
    ['plaid_actuals_cache','[]'],
  ])
  const storage={
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>values.set(key,String(value)),
  }
  const originalWindow=globalThis.window
  const originalCustomEvent=globalThis.CustomEvent
  const events=[]
  globalThis.window={dispatchEvent:event=>events.push(event)}
  globalThis.CustomEvent=class CustomEvent { constructor(type,init={}) { this.type=type;this.detail=init.detail } }
  let release
  const gate=new Promise(resolve=>{release=resolve})
  let startedCount=0
  let allStarted
  const started=new Promise(resolve=>{allStarted=resolve})
  const imports=[]
  const persistSourceImport=async (_storage,key,value)=>{
    imports.push(key)
    startedCount+=1
    if(startedCount===2)allStarted()
    await gate
    values.set(key,JSON.stringify(value))
    return{ok:true,durable:true,record:{key,value:JSON.stringify(value),version:1}}
  }
  try{
    const pending=refreshFinanceData(storage,{
      fetchAccounts:async()=>({connected:true,syncedAt:'2026-09-07T15:00:00.000Z',accounts:[{accountId:'plaid-operating',name:'Operating Account',type:'depository',subtype:'checking',balance:756.74,itemId:'item-1',institution:'Pinnacle'}]}),
      fetchTransactions:async()=>({transactions:[{id:'actual-one',accountId:'plaid-operating',amount:16.15,date:'2026-09-07'}]}),
      persistSourceImport,
    })
    await started
    assert.equal(events.length,0)
    assert.equal(storage.getItem('plaid_synced_at'),null)
    release()
    const result=await pending
    assert.deepEqual(imports.sort(),['lslj_finance_v9','plaid_actuals_cache'])
    assert.equal(result.finance.accounts[0].balance,756.74)
    assert.equal(result.actuals[0].id,'actual-one')
    assert.equal(storage.getItem('plaid_synced_at'),'2026-09-07T15:00:00.000Z')
    assert.equal(events.filter(event=>event.type==='brevity-finance-refreshed').length,1)
  }finally{
    if(originalWindow===undefined)delete globalThis.window
    else globalThis.window=originalWindow
    if(originalCustomEvent===undefined)delete globalThis.CustomEvent
    else globalThis.CustomEvent=originalCustomEvent
  }
})

test('a source-import persistence failure publishes no refresh success and keeps verified actuals', async () => {
  const cached=[{id:'verified-actual',institution:'Pinnacle',amount:16.15,date:'2026-09-06'}]
  const values=new Map([
    ['lslj_finance_v9',JSON.stringify({calendarDataVersion:6,accounts:[{id:'operating',name:'Operating Account',type:'checking',balance:10}],transactions:[]})],
    ['plaid_actuals_cache',JSON.stringify(cached)],
  ])
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))}
  const originalWindow=globalThis.window
  const originalCustomEvent=globalThis.CustomEvent
  const events=[]
  globalThis.window={dispatchEvent:event=>events.push(event)}
  globalThis.CustomEvent=class CustomEvent { constructor(type,init={}) { this.type=type;this.detail=init.detail } }
  try{
    await assert.rejects(
      refreshFinanceData(storage,{
        fetchAccounts:async()=>({connected:true,syncedAt:'2026-09-07T15:00:00.000Z',accounts:[{accountId:'plaid-operating',name:'Operating Account',type:'depository',subtype:'checking',balance:756.74}]}),
        fetchTransactions:async()=>({transactions:[{id:'unverified-new',amount:20,date:'2026-09-07'}]}),
        persistSourceImport:async(_storage,key,value)=>{
          if(key==='plaid_actuals_cache')throw new Error('Version conflict while saving transactions.')
          values.set(key,JSON.stringify(value))
          return{ok:true,durable:true,record:{key,value:JSON.stringify(value),version:1}}
        },
      }),
      error=>{
        assert.match(error.message,/Version conflict/)
        assert.equal(error.detail.actuals,undefined)
        assert.deepEqual(error.detail.lastKnownActuals,cached)
        assert.equal(error.detail.transactionDataStatus,'stale')
        return true
      },
    )
    assert.equal(events.some(event=>event.type==='brevity-finance-refreshed'),false)
    assert.equal(storage.getItem('plaid_synced_at'),null)
    assert.deepEqual(JSON.parse(storage.getItem('plaid_actuals_cache')),cached)
  }finally{
    if(originalWindow===undefined)delete globalThis.window
    else globalThis.window=originalWindow
    if(originalCustomEvent===undefined)delete globalThis.CustomEvent
    else globalThis.CustomEvent=originalCustomEvent
  }
})

test('partial institution success persists one merged verified snapshot and marks freshness partial', async () => {
  const cached=[
    {id:'old-pinnacle',institution:'Pinnacle',accountId:'p1',name:'Old',originalStatement:'OLD',amount:10,date:'2026-09-01',category:'OTHER',type:'expense',pending:false},
    {id:'second-bank',institution:'Second Bank',accountId:'s1',name:'Keep',originalStatement:'KEEP',amount:20,date:'2026-09-02',category:'OTHER',type:'expense',pending:false},
  ]
  const values=new Map([
    ['lslj_finance_v9',JSON.stringify({calendarDataVersion:6,accounts:[],transactions:[]})],
    ['plaid_actuals_cache',JSON.stringify(cached)],
  ])
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))}
  const imports=[]
  const result=await refreshFinanceData(storage,{
    fetchAccounts:async()=>({connected:true,accounts:[]}),
    fetchTransactions:async()=>({
      connected:true,
      mode:'incremental',
      transactions:[{id:'new-pinnacle',institution:'Pinnacle',accountId:'p1',itemId:'item-p',name:'New',originalStatement:'NEW',amount:30,date:'2026-09-07',category:'OTHER',type:'expense',pending:false}],
      removed:['old-pinnacle'],
      errors:[{institution:'Second Bank',message:'This institution did not confirm.'}],
      successfulInstitutions:['Pinnacle'],
      syncedAt:'2026-09-07T16:00:00.000Z',
      sourceReceipts:[{cursorIdentity:'item-p',batchId:'a'.repeat(64)}],
    }),
    persistSourceImport:async(_storage,key,value,options)=>{
      imports.push({key,value:structuredClone(value),options:structuredClone(options)})
      values.set(key,JSON.stringify(value))
      return{ok:true,durable:true,record:{key,value:JSON.stringify(value),version:1}}
    },
  })
  assert.equal(imports.length,1)
  assert.equal(imports[0].key,'plaid_actuals_cache')
  assert.deepEqual(imports[0].options.sourceReceipts,[{cursorIdentity:'item-p',batchId:'a'.repeat(64)}])
  assert.deepEqual(imports[0].value.map(item=>item.id),['new-pinnacle','second-bank'])
  assert.equal(result.transactionDataStatus,'partial')
  assert.deepEqual(result.actuals.map(item=>item.id),['new-pinnacle','second-bank'])
  const freshness=readTransactionFreshness(storage)
  assert.equal(freshness.status,'partial')
  assert.deepEqual(freshness.successfulInstitutions,['Pinnacle'])
  assert.equal(freshness.lastFullSuccessAt,'')
})

test('a total transaction timeout retains verified history, records stale freshness, and never imports an empty replacement', async () => {
  const cached=[{id:'verified',institution:'Pinnacle',amount:16.15,date:'2026-09-06'}]
  const values=new Map([
    ['lslj_finance_v9',JSON.stringify({calendarDataVersion:6,accounts:[],transactions:[]})],
    ['plaid_actuals_cache',JSON.stringify(cached)],
  ])
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))}
  const imported=[]
  const timeout=Object.assign(new Error('Transaction sync timed out before every institution confirmed.'),{code:'TRANSACTION_SYNC_TIMEOUT'})
  await assert.rejects(
    refreshFinanceData(storage,{
      fetchAccounts:async()=>({connected:true,accounts:[]}),
      fetchTransactions:async()=>{throw timeout},
      persistSourceImport:async(_storage,key,value)=>{imported.push({key,value});throw new Error('unexpected import')},
    }),
    error=>{
      assert.equal(error.code,'TRANSACTION_SYNC_TIMEOUT')
      assert.equal(error.detail.transactionDataStatus,'stale')
      assert.equal(error.detail.actuals,undefined)
      assert.deepEqual(error.detail.lastKnownActuals,cached)
      return true
    },
  )
  assert.deepEqual(imported,[])
  assert.deepEqual(JSON.parse(values.get('plaid_actuals_cache')),cached)
  assert.equal(readTransactionFreshness(storage).status,'stale')
})

test('Plaid source persistence never carries a finance migration or sample-plan creation', async () => {
  const legacy={
    calendarDataVersion:5,
    accounts:[{id:'operating',name:'Operating Account',type:'checking',balance:10}],
    transactions:[{id:'t_h6',name:'Property Taxes',type:'expense',freq:'monthly'}],
  }
  const values=new Map([['lslj_finance_v9',JSON.stringify(legacy)],['plaid_actuals_cache','[]']])
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))}
  const imports=[]
  await refreshFinanceData(storage,{
    fetchAccounts:async()=>({connected:true,accounts:[{accountId:'p1',name:'Operating Account',type:'depository',subtype:'checking',balance:756.74}]}),
    fetchTransactions:async()=>({connected:true,mode:'incremental',transactions:[],removed:[],errors:[],successfulInstitutions:['Pinnacle']}),
    persistSourceImport:async(_storage,key,value)=>{
      imports.push({key,value:structuredClone(value)})
      values.set(key,JSON.stringify(value))
      return{ok:true,durable:true,record:{key,value:JSON.stringify(value),version:1}}
    },
  })
  const financeImport=imports.find(item=>item.key==='lslj_finance_v9').value
  assert.equal(financeImport.calendarDataVersion,5)
  assert.equal(financeImport.transactions[0].freq,'monthly')
  assert.equal(financeImport.accounts[0].balance,756.74)

  const emptyValues=new Map([['plaid_actuals_cache','[]']])
  const emptyStorage={getItem:key=>emptyValues.get(key)??null,setItem:(key,value)=>emptyValues.set(key,String(value))}
  const emptyImports=[]
  const noPlan=await refreshFinanceData(emptyStorage,{
    fetchAccounts:async()=>({connected:true,accounts:[{accountId:'p1',name:'Operating Account',type:'depository',subtype:'checking',balance:756.74}]}),
    fetchTransactions:async()=>({connected:true,mode:'incremental',transactions:[],removed:[],errors:[]}),
    persistSourceImport:async(_storage,key,value)=>{emptyImports.push({key,value});return{ok:true,durable:true,record:{key,value:JSON.stringify(value),version:1}}},
  })
  assert.equal(emptyImports.some(item=>item.key==='lslj_finance_v9'),false)
  assert.ok(noPlan.errors.some(message=>/no server-confirmed finance plan/i.test(message)))
})
