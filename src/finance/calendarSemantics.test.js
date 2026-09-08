import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { bankBalanceMovement, buildUniquePlaidAccountMap, cashForecastScope, hasCompatiblePlaidAccountLink, hasVerifiedCashLedgerAnchors, mappedTransactionsForBalanceReconstruction, reconstructHistoricalCashBalances, transactionsForCalendarMonth } from './calendarSemantics.js'

const planner = readFileSync(new URL('./FinancePlanner.jsx', import.meta.url), 'utf8')
const agenda = readFileSync(new URL('./CashForecastAgenda.jsx', import.meta.url), 'utf8')
const responsive = readFileSync(new URL('../ResponsiveHardening.css', import.meta.url), 'utf8')

test('Cash Forecast bank count includes only the displayed calendar month', () => {
  const transactions = [
    { id: 'aug', date: '2026-08-31' },
    { id: 'sep-posted', date: '2026-09-01', pending: false },
    { id: 'sep-pending', date: '2026-09-30', pending: true },
    { id: 'oct', date: '2026-10-01' },
    { id: 'missing-date' },
  ]

  assert.deepEqual(
    transactionsForCalendarMonth(transactions, 2026, 8).map(transaction => transaction.id),
    ['sep-posted', 'sep-pending'],
  )
  assert.deepEqual(transactionsForCalendarMonth(transactions, 2026, 12), [])
})

test('reconstructed balances exclude transactions whose source account has no balance anchor', () => {
  const transactions = [
    { id:'mapped-debit', accountId:'p-check', amount:10 },
    { id:'unmapped-debit', accountId:'p-save', amount:1000 },
  ]
  const mapped = mappedTransactionsForBalanceReconstruction(transactions, { 'p-check':'operating' })
  assert.deepEqual(mapped.map(transaction => transaction.id), ['mapped-debit'])
  assert.equal(mapped.reduce((sum, transaction) => sum + transaction.amount, 100), 110)
})

test('Cash Forecast includes only cash accounts and their balance-moving transfers', () => {
  const accounts=[
    {id:'checking',type:'checking'},
    {id:'savings',type:'savings'},
    {id:'card',type:'credit'},
    {id:'brokerage',type:'investment'},
  ]
  const transactions=[
    {id:'cash-expense',type:'expense',acct:'checking'},
    {id:'card-expense',type:'expense',acct:'card'},
    {id:'card-payment',type:'transfer',acct:'checking',transferTo:'card'},
    {id:'investment-income',type:'income',acct:'brokerage'},
  ]
  const scope=cashForecastScope(accounts,transactions)
  assert.deepEqual(scope.accounts.map(account=>account.id),['checking','savings'])
  assert.deepEqual(scope.transactions.map(transaction=>transaction.id),['cash-expense','card-payment'])
})

test('bank balance movement includes boundary transfers and lets two in-scope sides cancel', () => {
  assert.equal(bankBalanceMovement([{amount:125},{amount:75,type:'transfer'}]),-200)
  assert.equal(bankBalanceMovement([{amount:75,type:'transfer'},{amount:-75,type:'transfer'}]),0)
})

test('historical reconstruction follows Plaid signs and ignores pending rows', () => {
  assert.deepEqual(reconstructHistoricalCashBalances({
    currentBalance:1000,
    todayKey:'2026-09-08',
    transactions:[
      {date:'2026-09-08',amount:100,pending:false},
      {date:'2026-09-07',amount:50,type:'transfer',pending:false},
      {date:'2026-09-07',amount:-200,pending:false},
      {date:'2026-09-07',amount:999,pending:true},
      {date:'2026-09-06',amount:0,pending:false},
    ],
  }),{
    '2026-09-07':1100,
    '2026-09-06':950,
  })
})

test('duplicate source or local identities are omitted from transaction-to-account mapping', () => {
  assert.deepEqual(buildUniquePlaidAccountMap([
    {id:'a',type:'checking',plaidAccountId:'p1',plaidType:'depository',plaidSubtype:'checking'},
    {id:'b',type:'checking',plaidAccountId:'p1',plaidType:'depository',plaidSubtype:'checking'},
    {id:'c',type:'savings',plaidAccountId:'p2',plaidType:'depository',plaidSubtype:'savings'},
  ]),{p2:'c'})
  assert.deepEqual(buildUniquePlaidAccountMap([
    {id:'same',type:'checking',plaidAccountId:'p1',plaidType:'depository',plaidSubtype:'checking'},
    {id:'same',type:'checking',plaidAccountId:'p2',plaidType:'depository',plaidSubtype:'checking'},
  ]),{})
})

test('transaction scoping rejects legacy links whose source type is missing or incompatible', () => {
  assert.equal(hasCompatiblePlaidAccountLink({type:'checking',plaidType:'depository',plaidSubtype:'checking'}),true)
  assert.equal(hasCompatiblePlaidAccountLink({type:'checking',plaidType:'credit',plaidSubtype:'credit card'}),false)
  assert.equal(hasCompatiblePlaidAccountLink({type:'checking'}),false)
  assert.deepEqual(buildUniquePlaidAccountMap([
    {id:'cash',type:'checking',plaidAccountId:'credit-source',plaidType:'credit',plaidSubtype:'credit card'},
  ]),{})
})

test('historical cash reconstruction requires unique compatible ledger-current anchors', () => {
  const checking={id:'checking',type:'checking',plaidAccountId:'p1',plaidType:'depository',plaidSubtype:'checking',plaidCurrentBalance:100}
  const savings={id:'savings',type:'savings',plaidAccountId:'p2',plaidType:'depository',plaidSubtype:'savings',plaidCurrentBalance:200}
  const map=buildUniquePlaidAccountMap([checking,savings])
  assert.equal(hasVerifiedCashLedgerAnchors([checking,savings],map),true)
  assert.equal(hasVerifiedCashLedgerAnchors([{...checking,plaidType:'credit'}],{'p1':'checking'}),false)
  assert.equal(hasVerifiedCashLedgerAnchors([{...checking,plaidCurrentBalance:null}],{'p1':'checking'}),false)
  assert.equal(hasVerifiedCashLedgerAnchors([checking,savings],{'p1':'checking'}),false)
})

test('Cash Forecast names its scope and owns one explicit bank-activity toggle', () => {
  assert.match(agenda, /<h1 id="cash-forecast-title">Cash Forecast<\/h1>/)
  assert.match(planner, /transactionsForCalendarMonth\(plaidActuals \|\| \[\], calYear, calMonth\)/)
  assert.match(planner, /aria-pressed=\{showActuals\}/)
  assert.match(planner, /`\$\{showActuals \? 'Hide' : 'Show'\} bank activity \(\$\{monthBankCount\} this month\)`/)
  assert.doesNotMatch(planner, /`Actuals \(\$\{plaidActuals\.length\}\)`/)
  assert.match(planner, /view !== 'calendar' && \(/, 'global account bar toggle should be absent from Cash Forecast')
  assert.match(planner, /view !== 'scenario-modeling' && view !== 'calendar' && <div[^>]*><FinanceTimeframe/, 'disconnected global timeframe should be hidden on Cash Forecast')
})

test('mobile agenda separates the plan, bank activity, and balance meaning', () => {
  assert.match(planner, /<CashForecastAgenda/)
  assert.match(agenda, /finance-calendar-agenda-group--planned/)
  assert.match(agenda, /finance-calendar-agenda-group--bank/)
  assert.match(planner, /showActuals && selDay <= todayStr && \(\(\) => \{/, 'day detail should honor the bank-activity toggle')
  assert.match(agenda, /Reconstructed posted close/)
  assert.match(agenda, /Latest stored cash balance/)
  assert.match(agenda, /today’s plan is not automatically reapplied/)
  assert.match(agenda, /bankBalanceMovement\(postedBank\)/)
  assert.match(agenda, /Posted movement/)
  assert.match(agenda, /Pending authorizations/)
  assert.match(agenda, /'Posted', isTransferTransaction\(transaction\) \? 'Transfer'/)
  assert.match(agenda, /Estimated historical cash balance/)
  assert.match(planner, /Estimated historical cash balance from/)
  assert.match(agenda, /freshnessStatus !== 'fresh'/)
  assert.match(agenda, /aria-expanded=\{selected\}/)
  assert.match(agenda, /aria-controls=\{detailId\}/)
  assert.match(agenda, /detail\.scrollIntoView/)
  assert.match(agenda, /detail\.focus/)
  assert.match(planner, /Reconstructed end-of-day balance/)
  assert.match(planner, /if \(!forecastScope\.accounts\.length\) return new Map\(\)/)
  assert.match(agenda, /No checking or savings account is selected/)
  assert.match(planner, /const prevMonth = \(\) => \{[^\n]*setSelDay\(null\)/)
  assert.match(planner, /const nextMonth = \(\) => \{[^\n]*setSelDay\(null\)/)
  assert.doesNotMatch(`${planner}\n${agenda}`, /balanceIsActual/)
  assert.match(planner, /Account-linkage status:/)
  assert.match(planner, /across all available history/)
  assert.match(planner, /Open all bank activity/)
  assert.match(planner, /actualsFreshnessMessage=\{actualsFreshnessMessage\}/)
  assert.match(agenda, /reconstructed closes appear only when every included cash account has a verified live ledger anchor and this transaction snapshot is fresh\./)
  assert.match(planner, /mappedTransactionsForBalanceReconstruction\(actualAccountScope\.included, plaidIdToLocal\)/)
  assert.match(planner, /const forecastCanReconstructHistory = forecastBalanceVerifiedLive && actualsFreshness\?\.status === 'fresh'/)
  assert.match(planner, /if \(!forecastCanReconstructHistory \|\| !cashForecastPostedActuals\?\.length\) return \{\}/)
  assert.match(planner, /viewAcctIds=\{forecastScope\.accountIds\}/)
})

test('phone Finance uses the app scroll and a non-overlapping account bar', () => {
  const mobileBlock = responsive.slice(responsive.indexOf('@media (max-width: 720px)'))
  assert.match(mobileBlock, /\.app-main \.finance-root\s*\{[^}]*height:\s*auto\s*!important;[^}]*overflow:\s*visible\s*!important;/s)
  assert.match(mobileBlock, /\.finance-root \.dash-body\s*\{\s*overflow-y:\s*visible\s*!important;/)
  assert.match(mobileBlock, /\.finance-account-filter\s*\{[^}]*position:\s*static\s*!important;[^}]*top:\s*auto\s*!important;/s)
  assert.match(mobileBlock, /\.finance-account-filter > button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s)
  assert.match(mobileBlock, /\.finance-calendar-agenda-activity\s*\{\s*grid-column:\s*1 \/ -1;/)
})
