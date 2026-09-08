import test from 'node:test'
import assert from 'node:assert/strict'
import { BALANCE_FRESHNESS_MAX_AGE_MS, buildPlaidBalanceSourceCandidate, buildPlaidBalanceSourceResult, classifyPlaidBalanceGaps, fetchLatestPlaidTransactions, invalidateLatestBalanceRefreshStatus, mergePlaidBalances, mergePlaidBalancesWithDiagnostics, mergePlaidTransactionResponse, mergePlaidTransactionSnapshots, readLatestBalanceRefreshStatus, readTransactionFreshness, recordLatestBalanceRefreshStatus, refreshFinanceData, scopePlaidTransactionsByAccount, transactionResponseFingerprint, transactionSnapshotFingerprint, waitForPlaidTransactionRefresh } from './financeRefresh.js'

const liveAccountPayload = payload => ({
  balanceMode:'live',
  balanceProvenance:'plaid.accountsBalanceGet',
  accountSourceReceipt:{payload:'signed-live-balance-snapshot',signature:'a'.repeat(64)},
  ...payload,
})

test('startup balance refresh updates existing accounts without creating duplicates', () => {
  const finance = { accounts:[
    { id:'a1', name:'Operating Account', type:'checking', balance:10, plaidAccountId:'plaid-1' },
    { id:'a2', name:'Family Savings', type:'savings', balance:20 },
  ], transactions:[{ id:'keep-me' }] }
  const refreshed = mergePlaidBalances(finance, [
    { accountId:'plaid-1', name:'Bank Primary Checking', officialName:'Bank Complete Checking', type:'depository', subtype:'checking', balance:1500, currentBalance:1525, availableBalance:1500, institution:'Pinnacle', mask:'607' },
    { accountId:'plaid-2', name:'Family Savings', type:'depository', subtype:'savings', balance:2200 },
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
  assert.equal(refreshed.accounts[0].plaidAvailableBalance, 1500)
})

test('additional Plaid accounts are untracked—not linkage failures—when every Brevity account matched', () => {
  const finance={accounts:[
    {id:'operating',name:'Operating Account',type:'checking',balance:10,plaidAccountId:'bank-operating'},
    {id:'projects',name:'Renovation / Projects',type:'checking',balance:20,plaidAccountId:'bank-projects'},
    {id:'savings',name:'LSLJ Savings',type:'savings',balance:30,plaidAccountId:'bank-savings'},
  ],transactions:[]}
  const linked=[
    {accountId:'bank-operating',name:'Operating Account',type:'depository',subtype:'checking',balance:150.58},
    {accountId:'bank-projects',name:'Renovation / Projects',type:'depository',subtype:'checking',balance:1052.51},
    {accountId:'bank-savings',name:'LSLJ Savings',type:'depository',subtype:'savings',balance:13000.20},
  ]
  const extras=Array.from({length:10},(_,index)=>({
    accountId:`untracked-${index}`,
    name:`Untracked account ${index}`,
    type:'depository',
    subtype:'checking',
    balance:index,
  }))

  const diagnostics=mergePlaidBalancesWithDiagnostics(finance,[...linked,...extras])
  const gaps=classifyPlaidBalanceGaps(diagnostics)

  assert.equal(diagnostics.matchedCount,3)
  assert.deepEqual(diagnostics.unmatchedLocalAccountIds,[])
  assert.equal(gaps.unmatchedReturnedCount,10)
  assert.equal(gaps.missingLinkedCount,0)
  assert.equal(gaps.linkReviewAvailable,false)
  assert.equal(gaps.untrackedReturnedCount,10)
})

test('link review remains available when an unmatched Brevity account has a returned candidate', () => {
  const diagnostics=mergePlaidBalancesWithDiagnostics({accounts:[
    {id:'operating',name:'Operating Account',type:'checking',balance:10,plaidAccountId:'missing-old-id'},
  ],transactions:[]},[
    {accountId:'replacement',name:'Personal Checking',type:'depository',subtype:'checking',balance:150.58},
  ])
  const gaps=classifyPlaidBalanceGaps(diagnostics)

  assert.equal(gaps.missingLinkedCount,1)
  assert.equal(gaps.unmatchedLocalCount,1)
  assert.equal(gaps.unmatchedReturnedCount,1)
  assert.equal(gaps.linkReviewAvailable,true)
  assert.equal(gaps.untrackedReturnedCount,0)
})

test('manual balance refresh preserves the exact persisted household plan instead of folding in view migrations', () => {
  const persisted = {
    calendarDataVersion:5,
    accounts:[{ id:'a1', name:'Operating Account', type:'checking', balance:10, householdNote:'Keep this exact note' }],
    transactions:[{ id:'property-tax', name:'Property Taxes', type:'expense', freq:'monthly' }],
    meetingPreferences:{ cadence:'daily', owner:'Larry' },
  }
  const storage = { getItem:key => key === 'lslj_finance_v9' ? JSON.stringify(persisted) : null }
  const candidate = buildPlaidBalanceSourceCandidate(storage, [{
    accountId:'plaid-operating', itemId:'plaid-item', name:'Operating Account', officialName:'Complete Checking',
    type:'depository', subtype:'checking', balance:756.74, currentBalance:780.12, availableBalance:756.74, institution:'Pinnacle', mask:'607',
  }])

  assert.equal(candidate.calendarDataVersion,5)
  assert.deepEqual(candidate.transactions,persisted.transactions)
  assert.deepEqual(candidate.meetingPreferences,persisted.meetingPreferences)
  assert.equal(candidate.accounts[0].name,'Operating Account')
  assert.equal(candidate.accounts[0].type,'checking')
  assert.equal(candidate.accounts[0].householdNote,'Keep this exact note')
  assert.equal(candidate.accounts[0].balance,756.74)
  assert.equal(candidate.accounts[0].plaidAccountId,'plaid-operating')
  assert.equal(candidate.accounts[0].plaidItemId,'plaid-item')
  assert.equal(candidate.accounts[0].plaidCurrentBalance,780.12)
  assert.equal(candidate.accounts[0].plaidAvailableBalance,756.74)
  assert.deepEqual(persisted.accounts,[{ id:'a1', name:'Operating Account', type:'checking', balance:10, householdNote:'Keep this exact note' }])
})

test('manual balance refresh will not write from a backup when the primary record is invalid', () => {
  const backup = { accounts:[{ id:'a1', name:'Operating Account', balance:10 }], transactions:[] }
  const storage = {
    getItem:key => key === 'lslj_finance_v9'
      ? '{invalid primary'
      : key === 'lslj_finance_v9_backup' ? JSON.stringify(backup) : null,
  }

  assert.equal(buildPlaidBalanceSourceCandidate(storage, [{ accountId:'plaid-1', balance:999 }]), null)
})

test('application balance refresh will not import a recovered backup as verified source truth', async () => {
  const backup = { calendarDataVersion:6, accounts:[{ id:'a1', name:'Operating Account', type:'checking', balance:10 }], transactions:[] }
  const values = new Map([
    ['lslj_finance_v9', '{invalid primary'],
    ['lslj_finance_v9_backup', JSON.stringify(backup)],
    ['plaid_actuals_cache', '[]'],
  ])
  const storage = { getItem:key => values.get(key) ?? null, setItem:(key, value) => values.set(key, String(value)) }
  const imports = []
  const result = await refreshFinanceData(storage, {
    fetchAccounts:async () => liveAccountPayload({ connected:true, accounts:[{ accountId:'plaid-1', name:'Operating Account', subtype:'checking', balance:999 }] }),
    fetchTransactions:async () => ({ connected:false, transactions:[] }),
    persistSourceImport:async (_storage, key, value) => {
      imports.push({ key, value })
      return { ok:true, durable:true, record:{ key, value:JSON.stringify(value), version:1 } }
    },
  })

  assert.equal(imports.some(item => item.key === 'lslj_finance_v9'), false)
  assert.equal(result.finance.accounts[0].balance, 10)
  assert.ok(result.errors.some(message => /no server-confirmed finance plan/i.test(message)))
})

test('does not guess between ambiguous Plaid accounts using only a broad type', () => {
  const finance = { accounts: [{ id: 'operating', name: 'Operating Account', type: 'checking', balance: 10 }], transactions: [] }
  const refreshed = mergePlaidBalances(finance, [
    { accountId: 'checking-1', name: 'Primary Checking', type: 'depository', subtype: 'checking', balance: 100 },
    { accountId: 'checking-2', name: 'Secondary Checking', type: 'depository', subtype: 'checking', balance: 200 },
  ])
  assert.equal(refreshed.accounts[0].balance, 10)
  assert.equal(refreshed.accounts[0].plaidAccountId, undefined)
  assert.equal(mergePlaidBalancesWithDiagnostics(finance, [
    { accountId:'checking-1', name:'Primary Checking', type:'depository', subtype:'checking', balance:100 },
    { accountId:'checking-2', name:'Secondary Checking', type:'depository', subtype:'checking', balance:200 },
  ]).matchedCount, 0)
  assert.equal(buildPlaidBalanceSourceCandidate({ getItem:() => JSON.stringify(finance) }, [
    { accountId:'checking-1', name:'Primary Checking', type:'depository', subtype:'checking', balance:100 },
    { accountId:'checking-2', name:'Secondary Checking', type:'depository', subtype:'checking', balance:200 },
  ]), null)
})

test('does not establish account identity from type alone even when only one account is returned', () => {
  const finance = { accounts: [{ id: 'operating', name: 'Operating Account', type: 'checking', balance: 10 }], transactions: [] }
  const refreshed = mergePlaidBalances(finance, [
    { accountId: 'checking-1', name: 'Bank Account', type: 'depository', subtype: 'checking', balance: 100 },
  ])
  assert.equal(refreshed.accounts[0].balance, 10)
  assert.equal(refreshed.accounts[0].plaidAccountId, undefined)
})

test('does not link an exact account name when the financial account types conflict', () => {
  const finance = { accounts: [{ id: 'savings', name: 'Primary Account', type: 'savings', balance: 10 }], transactions: [] }
  const refreshed = mergePlaidBalances(finance, [
    { accountId: 'checking-1', name: 'Primary Account', type: 'depository', subtype: 'checking', balance: 100 },
  ])
  assert.equal(refreshed.accounts[0].balance, 10)
  assert.equal(refreshed.accounts[0].plaidAccountId, undefined)
})

test('an existing Plaid ID link fails closed when the source account type conflicts', () => {
  const finance={accounts:[{
    id:'operating',name:'Operating Account',type:'checking',balance:425,
    plaidAccountId:'linked-source',
  }],transactions:[]}
  const result=mergePlaidBalancesWithDiagnostics(finance,[{
    accountId:'linked-source',name:'Credit Card',type:'credit',subtype:'credit card',balance:-1875,
  }])

  assert.equal(result.matchedCount,0)
  assert.deepEqual(result.finance,finance)
  assert.equal(result.finance.accounts[0].balance,425)
  assert.deepEqual(result.incompatibleLocalAccountIds,['operating'])
  assert.deepEqual(result.incompatiblePlaidAccountIds,['linked-source'])
  assert.equal(buildPlaidBalanceSourceCandidate({ getItem:() => JSON.stringify(finance) },[{
    accountId:'linked-source',name:'Credit Card',type:'credit',subtype:'credit card',balance:-1875,
  }]),null)
})

test('account matching requires a valid Plaid type family even when the subtype looks compatible', () => {
  const malformedSources = [
    { localType:'checking', plaidType:'credit', plaidSubtype:'checking' },
    { localType:'savings', plaidType:'credit', plaidSubtype:'savings' },
    { localType:'credit', plaidType:'depository', plaidSubtype:'credit card' },
    { localType:'investment', plaidType:'depository', plaidSubtype:'brokerage' },
  ]

  malformedSources.forEach(({ localType, plaidType, plaidSubtype }, index) => {
    const localId=`local-${index}`
    const sourceId=`source-${index}`
    const finance={accounts:[{
      id:localId,
      name:`Account ${index}`,
      type:localType,
      balance:425,
      plaidAccountId:sourceId,
    }],transactions:[]}
    const result=mergePlaidBalancesWithDiagnostics(finance,[{
      accountId:sourceId,
      name:`Source ${index}`,
      type:plaidType,
      subtype:plaidSubtype,
      balance:999,
    }])

    assert.equal(result.matchedCount,0)
    assert.equal(result.finance.accounts[0].balance,425)
    assert.deepEqual(result.incompatibleLocalAccountIds,[localId])
    assert.deepEqual(result.incompatiblePlaidAccountIds,[sourceId])
  })
})

test('balance matching fails closed for stale links, duplicate identities, and conflicting account subtypes', () => {
  const staleLinked={accounts:[{id:'operating',name:'Operating',type:'checking',balance:500,plaidAccountId:'p-failed'}],transactions:[]}
  const staleResult=mergePlaidBalancesWithDiagnostics(staleLinked,[{accountId:'p-other',name:'Other',type:'depository',subtype:'checking',balance:999}])
  assert.equal(staleResult.matchedCount,0)
  assert.deepEqual(staleResult.finance,staleLinked)
  assert.deepEqual(staleResult.missingLinkedLocalAccountIds,['operating'])

  const missingResult=buildPlaidBalanceSourceResult({getItem:()=>JSON.stringify(staleLinked)},[])
  assert.equal(missingResult.finance,null)
  assert.deepEqual(missingResult.diagnostics.missingLinkedLocalAccountIds,['operating'])

  const duplicateLink={accounts:[
    {id:'a',name:'One',type:'checking',balance:10,plaidAccountId:'p1'},
    {id:'b',name:'Two',type:'checking',balance:20,plaidAccountId:'p1'},
  ],transactions:[]}
  const duplicateResult=mergePlaidBalancesWithDiagnostics(duplicateLink,[{accountId:'p1',name:'One',type:'depository',subtype:'checking',balance:100}])
  assert.equal(duplicateResult.matchedCount,0)
  assert.deepEqual(duplicateResult.finance,duplicateLink)
  assert.deepEqual(duplicateResult.ambiguousPlaidAccountIds,['p1'])

  const duplicateLocal={accounts:[
    {id:'same',name:'Checking',type:'checking',balance:10},
    {id:'same',name:'Savings',type:'savings',balance:20},
  ],transactions:[]}
  assert.equal(mergePlaidBalancesWithDiagnostics(duplicateLocal,[{accountId:'p2',name:'Savings',type:'depository',subtype:'savings',balance:200}]).matchedCount,0)

  const checking={accounts:[{id:'operating',name:'Operating Account',type:'checking',balance:10}],transactions:[]}
  const savings=mergePlaidBalancesWithDiagnostics(checking,[{accountId:'bank-savings',name:'Rainy Day',type:'depository',subtype:'savings',balance:9999}])
  assert.equal(savings.matchedCount,0)
  assert.equal(savings.finance.accounts[0].balance,10)
})

test('exact name matching is globally one-to-one and independent of local account order', () => {
  const finance={accounts:[
    {id:'a',name:'Alpha',type:'checking',balance:1},
    {id:'b',name:'Alpha Checking',type:'checking',balance:2},
  ],transactions:[]}
  const result=mergePlaidBalancesWithDiagnostics(finance,[{accountId:'p',name:'Alpha Checking',type:'depository',subtype:'checking',balance:100}])
  assert.equal(result.finance.accounts[0].plaidAccountId,undefined)
  assert.equal(result.finance.accounts[1].plaidAccountId,'p')

  const ambiguous={accounts:[
    {id:'a',name:'Same',type:'checking',balance:1},
    {id:'b',name:'Same',type:'checking',balance:2},
  ],transactions:[]}
  assert.equal(mergePlaidBalancesWithDiagnostics(ambiguous,[{accountId:'p',name:'Same',type:'depository',subtype:'checking',balance:100}]).matchedCount,0)
})

test('an unchanged exact source id still counts as a verified balance match', () => {
  const finance={accounts:[{id:'a',name:'Operating',type:'checking',balance:100,plaidAccountId:'p'}],transactions:[]}
  const result=mergePlaidBalancesWithDiagnostics(finance,[{accountId:'p',name:'Bank Checking',type:'depository',subtype:'checking',balance:100}])
  assert.equal(result.matchedCount,1)
  assert.equal(result.finance.accounts[0].balance,100)
})

test('transaction snapshot fingerprint detects new pending transactions', () => {
  const before = [{ id:'apple', date:'2026-09-06', amount:49.98, pending:true }]
  const after = [...before, { id:'groceries', date:'2026-09-06', amount:150.12, pending:true }]
  assert.notEqual(transactionSnapshotFingerprint(before), transactionSnapshotFingerprint(after))
  assert.notEqual(
    transactionSnapshotFingerprint([{id:'same',accountId:'p1',pending:false,date:'2026-09-08',amount:10}]),
    transactionSnapshotFingerprint([{id:'same',accountId:'p2',pending:false,date:'2026-09-08',amount:10}]),
  )
})

test('transaction fingerprints are compact, order-insensitive, and field-sensitive', () => {
  const first = {
    id:'tx-1', accountId:'account-1', itemId:'item-1', name:'Market', originalStatement:'MARKET 001',
    amount:42.18, date:'2026-09-08', category:['Food','Groceries'], type:'debit', institution:'Example Bank', pending:false,
  }
  const second = { ...first, id:'tx-2', amount:12.50 }
  const baseline = transactionSnapshotFingerprint([first, second])
  assert.equal(baseline, transactionSnapshotFingerprint([second, first]))
  for (const [field, value] of [
    ['id','changed-id'], ['accountId','account-2'], ['itemId','item-2'], ['name','Another Market'],
    ['originalStatement','MARKET 002'], ['amount',42.19], ['date','2026-09-09'],
    ['category',['Food','Dining']], ['type','credit'], ['institution','Another Bank'], ['pending',true],
  ]) {
    assert.notEqual(baseline, transactionSnapshotFingerprint([{ ...first, [field]:value }, second]), `expected ${field} mutation to change fingerprint`)
  }

  const large = Array.from({ length:10_000 }, (_, index) => ({ ...first, id:`tx-${index}`, amount:index / 100 }))
  assert.ok(transactionSnapshotFingerprint(large).length < 64)
})

test('transaction response fingerprints compactly include removed ids without depending on order', () => {
  const transactions = [
    { id:'tx-1', accountId:'account-1', amount:1, date:'2026-09-08' },
    { id:'tx-2', accountId:'account-1', amount:2, date:'2026-09-07' },
  ]
  const baseline = transactionResponseFingerprint({ transactions, removed:[{ transactionId:'old-1' }, 'old-2'] })
  assert.equal(baseline, transactionResponseFingerprint({ transactions:[...transactions].reverse(), removed:['old-2', { transactionId:'old-1' }] }))
  assert.notEqual(baseline, transactionResponseFingerprint({ transactions, removed:['old-2', { transactionId:'old-3' }] }))

  const large = Array.from({ length:10_000 }, (_, index) => ({ id:`tx-${index}`, amount:index }))
  assert.ok(transactionResponseFingerprint({ transactions:large, removed:large.map(item => item.id) }).length < 64)
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

test('account scope leaves stale Plaid ids unmapped instead of guessing by institution', () => {
  const transactions = [{ id:'legacy-operating', accountId:'old-plaid-id', itemId:'item-1', institution:'Pinnacle' }]
  const accountMap = { 'current-plaid-id':'a1', 'item:item-1':'a1', 'institution:pinnacle':'a1' }
  const result = scopePlaidTransactionsByAccount(transactions, accountMap, new Set(['a1']))
  assert.deepEqual(result.included, [])
  assert.deepEqual(result.unmapped.map(transaction => transaction.id), ['legacy-operating'])
})

test('account scope never assigns an unrepresented source account through its shared Plaid item', () => {
  const transactions = [
    { id:'checking-row', accountId:'p-check', itemId:'item-1', institution:'Bank' },
    { id:'savings-row', accountId:'p-save', itemId:'item-1', institution:'Bank' },
  ]
  const accountMap = { 'p-check':'operating', 'item:item-1':'operating', 'institution:bank':'operating' }
  const result = scopePlaidTransactionsByAccount(transactions, accountMap, new Set(['operating']))
  assert.deepEqual(result.included.map(transaction => transaction.id), ['checking-row'])
  assert.deepEqual(result.unmapped.map(transaction => transaction.id), ['savings-row'])
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

test('accepted transaction refresh polls bounded Item status until Plaid confirms completion', async () => {
  const calls=[]
  const pauses=[]
  const requestedAt='2026-09-08T23:00:00.000Z'
  const responses=[
    {refresh:{requested:true,requestedAt,accepted:1,completed:0,stillProcessing:true,errors:[]}},
    {refresh:{requested:true,requestedAt,accepted:1,completed:1,stillProcessing:false,errors:[]}},
  ]
  const result=await waitForPlaidTransactionRefresh({requested:true,requestedAt,accepted:1,stillProcessing:true},{
    delays:[10,20,40],
    pause:async delay=>{pauses.push(delay)},
    fetcher:async (path,options)=>{calls.push({path,options});return responses.shift()},
  })

  assert.deepEqual(pauses,[10,20])
  assert.equal(calls.length,2)
  assert.match(calls[0].path,/refresh_status=1&since=2026-09-08T23%3A00%3A00\.000Z/)
  assert.equal(calls[0].options.timeoutMs,45000)
  assert.equal(result.refresh.stillProcessing,false)
})

test('transaction refresh status outages retain processing truth instead of claiming completion', async () => {
  const refresh={requested:true,requestedAt:'2026-09-08T23:00:00.000Z',accepted:1,stillProcessing:true}
  const result=await waitForPlaidTransactionRefresh(refresh,{
    delays:[0,0],
    pause:async()=>{},
    fetcher:async()=>{throw new Error('status unavailable')},
  })
  assert.deepEqual(result,{refresh})
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
    fetchAccounts:async()=>liveAccountPayload({connected:true,syncedAt:'2026-09-07T12:00:00.000Z',accounts:[{accountId:'plaid-operating',name:'Operating Account',type:'depository',subtype:'checking',balance:756.74}]}),
    fetchTransactions:async()=>({transactions:[{id:'actual-one',accountId:'plaid-operating',amount:16.15,date:'2026-09-07'}]}),
  })
  assert.equal(result.finance.accounts[0].balance,756.74)
  assert.equal(result.actuals.length,1)
  assert.deepEqual(writes,[])
  assert.equal(JSON.parse(values.get('lslj_finance_v9')).accounts[0].balance,10)
})

test('only signed live balance responses can advance durable account truth', async () => {
  const values=new Map([
    ['lslj_finance_v9',JSON.stringify({calendarDataVersion:6,accounts:[{id:'operating',name:'Operating Account',type:'checking',balance:10}],transactions:[]})],
    ['plaid_actuals_cache','[]'],
  ])
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}
  const imports=[]
  const persistSourceImport=async(_storage,key,value,options)=>{
    imports.push({key,value:structuredClone(value),options:structuredClone(options)})
    values.set(key,JSON.stringify(value))
    return{ok:true,durable:true,record:{key,value:JSON.stringify(value),version:imports.length}}
  }
  const accountCalls=[]
  const live=await refreshFinanceData(storage,{
    requestBankUpdate:true,
    fetchAccounts:async options=>{
      accountCalls.push(options)
      return liveAccountPayload({connected:true,syncedAt:'2026-09-08T10:00:00.000Z',accounts:[{accountId:'p1',itemId:'item-1',institution:'Pinnacle',name:'Operating Account',type:'depository',subtype:'checking',balance:100}]})
    },
    fetchTransactions:async()=>({connected:false,transactions:[]}),
    persistSourceImport,
  })
  assert.deepEqual(accountCalls,[{requestBankUpdate:true}])
  assert.equal(live.balanceDataStatus,'fresh')
  assert.equal(JSON.parse(values.get('lslj_finance_v9')).accounts[0].balance,100)
  assert.equal(values.get('plaid_synced_at'),'2026-09-08T10:00:00.000Z')
  assert.equal(imports.filter(item=>item.key==='lslj_finance_v9').length,1)
  assert.equal(imports[0].options.accountSourceReceipt.payload,'signed-live-balance-snapshot')

  const recent=readLatestBalanceRefreshStatus(new Date('2026-09-08T10:05:00.000Z'))
  assert.equal(recent.status,'fresh')
  assert.equal(recent.balanceMode,'live')
  assert.equal(recent.balanceProvenance,'plaid.accountsBalanceGet')
  assert.equal(readLatestBalanceRefreshStatus(new Date(BALANCE_FRESHNESS_MAX_AGE_MS + Date.parse('2026-09-08T10:00:00.000Z') + 1)).status,'stale')

  recordLatestBalanceRefreshStatus({balanceDataStatus:'fresh',balanceCheckedAt:'2026-09-08T10:00:00.000Z',balanceMode:'live',balanceProvenance:'plaid.accountsBalanceGet'})
  assert.equal(invalidateLatestBalanceRefreshStatus().status,'unknown')
  assert.match(readLatestBalanceRefreshStatus().errors.join(' '),/current household snapshot/i)

  // An unchanged value still carries a new anti-replay/provenance receipt to
  // durable household state.
  await refreshFinanceData(storage,{
    requestBankUpdate:true,
    fetchAccounts:async()=>liveAccountPayload({connected:true,syncedAt:'2026-09-08T10:01:00.000Z',accounts:[{accountId:'p1',itemId:'item-1',institution:'Pinnacle',name:'Operating Account',type:'depository',subtype:'checking',balance:100}]}),
    fetchTransactions:async()=>({connected:false,transactions:[]}),
    persistSourceImport,
  })
  assert.equal(imports.filter(item=>item.key==='lslj_finance_v9').length,2)

  const beforeCached=JSON.parse(values.get('lslj_finance_v9'))
  const cachedImports=imports.length
  const cached=await refreshFinanceData(storage,{
    requestBankUpdate:false,
    fetchAccounts:async options=>{
      accountCalls.push(options)
      return {
        connected:true,
        syncedAt:'2026-09-08T10:02:00.000Z',
        balanceMode:'cached',
        balanceProvenance:'plaid.accountsGet',
        // Even an unexpected receipt-shaped field cannot make cached values
        // importable.
        accountSourceReceipt:{payload:'not-live',signature:'b'.repeat(64)},
        accounts:[{accountId:'p1',itemId:'item-1',institution:'Pinnacle',name:'Operating Account',type:'depository',subtype:'checking',balance:1}],
      }
    },
    fetchTransactions:async()=>({connected:false,transactions:[]}),
    persistSourceImport,
  })
  assert.deepEqual(accountCalls.at(-1),{requestBankUpdate:false})
  assert.equal(cached.balanceDataStatus,'cached')
  assert.equal(cached.finance.accounts[0].balance,100)
  assert.deepEqual(JSON.parse(values.get('lslj_finance_v9')),beforeCached)
  assert.equal(imports.length,cachedImports)
  assert.equal(values.get('plaid_synced_at'),'2026-09-08T10:01:00.000Z')
  assert.equal(readLatestBalanceRefreshStatus().status,'cached')
})

test('a claimed live response without an importable receipt fails closed', async () => {
  const values=new Map([
    ['lslj_finance_v9',JSON.stringify({calendarDataVersion:6,accounts:[{id:'operating',name:'Operating Account',type:'checking',balance:10}],transactions:[]})],
    ['plaid_actuals_cache','[]'],
  ])
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))}
  const imports=[]
  const result=await refreshFinanceData(storage,{
    fetchAccounts:async()=>({connected:true,balanceMode:'live',balanceProvenance:'plaid.accountsBalanceGet',accounts:[{accountId:'p1',name:'Operating Account',type:'depository',subtype:'checking',balance:999}]}),
    fetchTransactions:async()=>({connected:false,transactions:[]}),
    persistSourceImport:async(_storage,key,value)=>imports.push({key,value}),
  })
  assert.equal(result.balanceDataStatus,'unverified')
  assert.equal(result.finance.accounts[0].balance,10)
  assert.equal(imports.length,0)
  assert.match(result.balanceErrors.join(' '),/signed live-balance receipt/i)
})

test('read-only refresh derives partial and stale freshness from the current attempt without storage writes', async () => {
  const cached=[{id:'old',accountId:'p1',institution:'Down Bank',amount:10,date:'2026-09-01'}]
  const oldFingerprint=transactionSnapshotFingerprint(cached)
  const values=new Map([
    ['lslj_finance_v9',JSON.stringify({calendarDataVersion:6,accounts:[],transactions:[]})],
    ['plaid_actuals_cache',JSON.stringify(cached)],
    ['brevity_plaid_transaction_freshness_v1',JSON.stringify({status:'fresh',checkedAt:'2026-09-01T10:00:00Z',lastFullSuccessAt:'2026-09-01T10:00:00Z',snapshotFingerprint:oldFingerprint})],
  ])
  const writes=[]
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>writes.push([key,value])}
  const partial=await refreshFinanceData(storage,{
    persist:false,
    fetchAccounts:async()=>({connected:false}),
    fetchTransactions:async()=>({connected:true,mode:'incremental',transactions:[{id:'new',accountId:'p2',institution:'Good Bank',amount:20,date:'2026-09-08'}],errors:[{institution:'Down Bank',message:'Not confirmed'}],syncedAt:'2026-09-08T12:00:00Z'}),
  })
  assert.equal(partial.transactionDataStatus,'partial')
  assert.equal(partial.transactionFreshness.status,'partial')
  assert.equal(partial.transactionFreshness.checkedAt,'2026-09-08T12:00:00Z')
  assert.notEqual(partial.transactionFreshness.snapshotFingerprint,oldFingerprint)
  assert.deepEqual(writes,[])

  await assert.rejects(refreshFinanceData(storage,{
    persist:false,
    fetchAccounts:async()=>({connected:false}),
    fetchTransactions:async()=>{throw new Error('Transaction source unavailable')},
  }),error=>{
    assert.equal(error.detail.transactionFreshness.status,'stale')
    assert.match(error.detail.transactionFreshness.errors[0],/unavailable/)
    return true
  })
  assert.deepEqual(writes,[])
})

test('freshness is bound to the full source snapshot and ages after 24 hours', () => {
  const actuals=[{id:'t',accountId:'p1',itemId:'i1',institution:'Bank',name:'Store',amount:10,date:'2026-09-01',pending:false}]
  const values=new Map([
    ['plaid_actuals_cache',JSON.stringify(actuals)],
    ['brevity_plaid_transaction_freshness_v1',JSON.stringify({status:'fresh',checkedAt:'2026-09-01T10:00:00Z',lastFullSuccessAt:'2026-09-01T10:00:00Z',snapshotFingerprint:transactionSnapshotFingerprint(actuals),errors:[]})],
  ])
  const storage={getItem:key=>values.get(key)??null}
  assert.equal(readTransactionFreshness(storage,new Date('2026-09-01T20:00:00Z')).status,'fresh')
  assert.equal(readTransactionFreshness(storage,new Date('2026-09-03T10:00:01Z')).status,'stale')
  assert.equal(readTransactionFreshness(storage,new Date('2026-09-01T09:58:59Z')).status,'stale')
  values.set('plaid_actuals_cache',JSON.stringify([{...actuals[0],accountId:'p2'}]))
  assert.equal(readTransactionFreshness(storage,new Date('2026-09-01T20:00:00Z')).status,'unknown')
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
      fetchAccounts:async()=>liveAccountPayload({connected:true,syncedAt:'2026-09-07T15:00:00.000Z',accounts:[{accountId:'plaid-operating',name:'Operating Account',type:'depository',subtype:'checking',balance:756.74,itemId:'item-1',institution:'Pinnacle'}]}),
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

test('live responses missing previously linked accounts stay partial and preserve complete connection metadata', async () => {
  const finance={calendarDataVersion:6,accounts:[
    {id:'one',name:'One',type:'checking',balance:10,plaidAccountId:'p1'},
    {id:'two',name:'Two',type:'checking',balance:20,plaidAccountId:'p2'},
  ],transactions:[]}
  const priorConnections=[
    {itemId:'ok',institution:'Good Bank',accounts:[{accountId:'p1'}]},
    {itemId:'down',institution:'Down Bank',accounts:[{accountId:'p2'}]},
  ]
  const values=new Map([
    ['lslj_finance_v9',JSON.stringify(finance)],
    ['plaid_actuals_cache','[]'],
    ['plaid_connections',JSON.stringify(priorConnections)],
    ['plaid_synced_at','2026-09-01T10:00:00Z'],
  ])
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}
  const partial=await refreshFinanceData(storage,{
    fetchAccounts:async()=>liveAccountPayload({connected:true,syncedAt:'2026-09-08T12:00:00Z',accounts:[{accountId:'p1',itemId:'ok',institution:'Good Bank',name:'One',type:'depository',subtype:'checking',balance:111}]}),
    fetchTransactions:async()=>({connected:false,transactions:[]}),
    persistSourceImport:async(_storage,key,value)=>{values.set(key,JSON.stringify(value));return{ok:true,durable:true,record:{key,value:JSON.stringify(value),version:2}}},
  })
  assert.equal(partial.balanceDataStatus,'partial')
  assert.equal(partial.missingLinkedAccountCount,1)
  assert.ok(partial.balanceErrors.some(message=>/1 previously linked Brevity account was not present/i.test(message)))
  assert.equal(partial.finance.accounts[0].balance,111)
  assert.equal(partial.finance.accounts[1].balance,20)
  assert.equal(values.get('plaid_synced_at'),'2026-09-01T10:00:00Z')
  assert.deepEqual(JSON.parse(values.get('plaid_connections')),priorConnections)

  const missingAll=await refreshFinanceData(storage,{
    fetchAccounts:async()=>liveAccountPayload({connected:true,syncedAt:'2026-09-08T13:00:00Z',accounts:[
      {accountId:'unknown-1',name:'Alpha',type:'depository',subtype:'checking',balance:100},
      {accountId:'unknown-2',name:'Beta',type:'depository',subtype:'checking',balance:200},
    ]}),
    fetchTransactions:async()=>({connected:false,transactions:[]}),
    persistSourceImport:async()=>{throw new Error('Balance import must not run')},
  })
  assert.equal(missingAll.balanceDataStatus,'partial')
  assert.equal(missingAll.missingLinkedAccountCount,2)
  assert.ok(missingAll.balanceErrors.some(message=>/2 previously linked Brevity accounts were not present/i.test(message)))
  assert.equal(values.get('plaid_synced_at'),'2026-09-01T10:00:00Z')
  assert.deepEqual(JSON.parse(values.get('plaid_connections')),priorConnections)
})

test('an explicit disconnected response clears cached connection and balance-check markers', async () => {
  const values=new Map([
    ['lslj_finance_v9',JSON.stringify({calendarDataVersion:6,accounts:[],transactions:[]})],
    ['plaid_actuals_cache','[]'],
    ['plaid_connections','[{"itemId":"old"}]'],
    ['plaid_synced_at','2026-09-01T10:00:00Z'],
  ])
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}
  const result=await refreshFinanceData(storage,{
    fetchAccounts:async()=>({connected:false,accounts:[]}),
    fetchTransactions:async()=>({connected:false,transactions:[]}),
  })
  assert.equal(result.balanceDataStatus,'disconnected')
  assert.equal(values.has('plaid_connections'),false)
  assert.equal(values.has('plaid_synced_at'),false)
})

test('a disconnected transaction response retains the last acknowledged ledger as stale', async () => {
  const cached=[{id:'last-known',institution:'Pinnacle',accountId:'p1',amount:22,date:'2026-09-07',pending:false}]
  const values=new Map([
    ['lslj_finance_v9',JSON.stringify({calendarDataVersion:6,accounts:[],transactions:[]})],
    ['plaid_actuals_cache',JSON.stringify(cached)],
  ])
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}
  const result=await refreshFinanceData(storage,{
    fetchAccounts:async()=>({connected:false,accounts:[]}),
    fetchTransactions:async()=>({connected:false,transactions:[]}),
  })
  assert.equal(result.transactionDataStatus,'stale')
  assert.deepEqual(result.actuals,cached)
  assert.deepEqual(result.lastKnownActuals,cached)
  assert.deepEqual(JSON.parse(values.get('plaid_actuals_cache')),cached)
})

test('a source-import persistence failure publishes stale diagnostics and keeps verified actuals', async () => {
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
        fetchAccounts:async()=>liveAccountPayload({connected:true,syncedAt:'2026-09-07T15:00:00.000Z',accounts:[{accountId:'plaid-operating',name:'Operating Account',type:'depository',subtype:'checking',balance:756.74}]}),
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
    const refreshEvent=events.find(event=>event.type==='brevity-finance-refreshed')
    assert.ok(refreshEvent)
    assert.equal(refreshEvent.detail.balanceDataStatus,'fresh')
    assert.equal(refreshEvent.detail.transactionDataStatus,'stale')
    assert.equal(refreshEvent.detail.actuals,undefined)
    assert.equal(storage.getItem('plaid_synced_at'),null)
    assert.deepEqual(JSON.parse(storage.getItem('plaid_actuals_cache')),cached)
  }finally{
    if(originalWindow===undefined)delete globalThis.window
    else globalThis.window=originalWindow
    if(originalCustomEvent===undefined)delete globalThis.CustomEvent
    else globalThis.CustomEvent=originalCustomEvent
  }
})

test('a failed balance import revokes a mounted fresh claim without replacing stored balances', async () => {
  const stored={calendarDataVersion:6,accounts:[{id:'operating',name:'Operating Account',type:'checking',balance:10}],transactions:[]}
  const values=new Map([
    ['lslj_finance_v9',JSON.stringify(stored)],
    ['plaid_actuals_cache','[]'],
  ])
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))}
  const originalWindow=globalThis.window
  const originalCustomEvent=globalThis.CustomEvent
  const events=[]
  globalThis.window={dispatchEvent:event=>events.push(event)}
  globalThis.CustomEvent=class CustomEvent { constructor(type,init={}) { this.type=type;this.detail=init.detail } }
  try{
    await assert.rejects(refreshFinanceData(storage,{
      requestBankUpdate:true,
      fetchAccounts:async()=>liveAccountPayload({connected:true,syncedAt:'2026-09-08T12:00:00.000Z',accounts:[{accountId:'p1',name:'Operating Account',type:'depository',subtype:'checking',balance:999}]}),
      fetchTransactions:async()=>({connected:false,transactions:[]}),
      persistSourceImport:async(_storage,key)=>{if(key==='lslj_finance_v9')throw new Error('Balance store unavailable')},
    }),/Balance store unavailable/)
    const event=events.find(candidate=>candidate.type==='brevity-finance-refreshed')
    assert.ok(event)
    assert.equal(event.detail.balanceDataStatus,'stale')
    assert.equal(event.detail.finance.accounts[0].balance,10)
    assert.deepEqual(JSON.parse(values.get('lslj_finance_v9')),stored)
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
    fetchAccounts:async()=>liveAccountPayload({connected:true,accounts:[{accountId:'p1',name:'Operating Account',type:'depository',subtype:'checking',balance:756.74}]}),
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
    fetchAccounts:async()=>liveAccountPayload({connected:true,accounts:[{accountId:'p1',name:'Operating Account',type:'depository',subtype:'checking',balance:756.74}]}),
    fetchTransactions:async()=>({connected:true,mode:'incremental',transactions:[],removed:[],errors:[]}),
    persistSourceImport:async(_storage,key,value)=>{emptyImports.push({key,value});return{ok:true,durable:true,record:{key,value:JSON.stringify(value),version:1}}},
  })
  assert.equal(emptyImports.some(item=>item.key==='lslj_finance_v9'),false)
  assert.ok(noPlan.errors.some(message=>/no server-confirmed finance plan/i.test(message)))
})
