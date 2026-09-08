import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import oneDriveStart from '../../netlify/functions/onedrive-oauth-start.mjs'
import oneDriveCallback from '../../netlify/functions/onedrive-oauth-callback.mjs'

const require=createRequire(import.meta.url)
const {handler:createPlaidLink}=require('../../netlify/functions/plaid-create-link-token.js')
const {handler:exchangePlaidToken}=require('../../netlify/functions/plaid-exchange-token.js')
const {handler:disconnectPlaid}=require('../../netlify/functions/plaid-disconnect.js')
const householdAuth=require('../../netlify/functions/household-auth.js')
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')

test('Plaid connection mutation endpoints reject before touching bank credentials or token storage',async()=>{
  const endpoints=[
    [createPlaidLink,{httpMethod:'GET'}],
    [exchangePlaidToken,{httpMethod:'POST',body:JSON.stringify({public_token:'must-not-exchange'})}],
    [disconnectPlaid,{httpMethod:'POST',body:JSON.stringify({item_id:'must-not-remove'})}],
  ]
  for(const [handler,event] of endpoints){
    const result=await handler(event)
    const body=JSON.parse(result.body)
    assert.equal(result.statusCode,423)
    assert.equal(body.code,'CONNECTION_MUTATIONS_DISABLED')
    assert.equal(result.headers['Cache-Control'],'no-store')
    assert.equal(result.headers['set-cookie'],undefined)
  }
  for(const file of ['../../netlify/functions/plaid-create-link-token.js','../../netlify/functions/plaid-exchange-token.js','../../netlify/functions/plaid-disconnect.js']){
    const source=read(file)
    assert.doesNotMatch(source,/readSession|getTokens|setTokens|plaidClient|itemPublicTokenExchange|itemRemove|linkTokenCreate/)
  }
})

test('Plaid UI keeps existing-source sync but exposes no connection mutation path',()=>{
  const source=read('../finance/PlaidConnect.jsx')
  assert.match(source,/Existing connected sources can still sync/)
  assert.match(source,/apiFetch\('\/plaid-accounts\?live=1'\)/)
  assert.match(source,/const plaidAccounts = Array\.isArray\(data\.accounts\) \? data\.accounts : \[\]/)
  assert.match(source,/const balanceAttemptErrors = plaidAccounts\.length \? endpointErrors/)
  assert.match(source,/await onAccountsSync\(plaidAccounts, data\.syncedAt, data\.accountSourceReceipt, balanceAttemptErrors\)/)
  assert.match(source,/reportUnverifiedBalanceAttempt\(onAccountsSync/)
  assert.match(source,/Adding, re-linking, or disconnecting a bank is disabled/)
  assert.match(source,/Add bank unavailable/)
  assert.match(source,/Re-authentication is unavailable in this release/)
  assert.doesNotMatch(source,/usePlaidLink|plaid-create-link-token|plaid-exchange-token|plaid-disconnect|handleRelink|handleDisconnect|plaid_oauth_link_token|window\.confirm/)
})

test('member-password mutation rejects before opening storage and never changes the session cookie',async()=>{
  const source=read('../../netlify/functions/household-auth.js')
  const handlerSource=source.slice(source.indexOf('exports.handler ='))
  assert.ok(handlerSource.indexOf("action === 'set-member-password'")<handlerSource.indexOf('const dataStore = store()'))
  assert.equal((handlerSource.match(/action === 'set-member-password'/g)||[]).length,1)
  const result=await householdAuth.handler({
    httpMethod:'POST',
    queryStringParameters:{action:'set-member-password'},
    body:JSON.stringify({member:'Nyla',password:'must-not-be-saved'}),
    headers:{cookie:'brevity_household_session=must-not-change'},
  })
  const body=JSON.parse(result.body)
  assert.equal(result.statusCode,423)
  assert.equal(body.code,'CREDENTIAL_MUTATIONS_DISABLED')
  assert.equal(result.headers['set-cookie'],undefined)
  assert.match(handlerSource,/action === 'login'/)
})

test('Settings account UI is status-only while sign-in remains available',()=>{
  const ui=read('./HouseholdAuth.jsx')
  const api=read('./authApi.js')
  assert.match(ui,/Household account status remains visible/)
  assert.match(ui,/Password changes unavailable/)
  assert.doesNotMatch(ui,/setHouseholdMemberPassword|onSubmit=\{save\}|Set \/ reset/)
  assert.doesNotMatch(api,/set-member-password|setHouseholdMemberPassword/)
  assert.match(api,/loginHouseholdMember/)
  assert.match(ui,/onLogin\(member, password\)/)
})

test('OneDrive OAuth start and callback reject without network or repository-state mutation',async()=>{
  let networkCalls=0
  const previousFetch=globalThis.fetch
  globalThis.fetch=async()=>{networkCalls+=1;throw new Error('network must not be called')}
  try{
    for(const [handler,url] of [[oneDriveStart,'https://brevity.test/.netlify/functions/onedrive-oauth-start'],[oneDriveCallback,'https://brevity.test/.netlify/functions/onedrive-oauth-callback?code=must-not-exchange&state=must-not-save']]){
      const response=await handler(new Request(url))
      const body=await response.json()
      assert.equal(response.status,423)
      assert.equal(body.code,'CONNECTION_MUTATIONS_DISABLED')
      assert.equal(response.headers.get('set-cookie'),null)
      assert.equal(response.headers.get('cache-control'),'no-store')
    }
  }finally{globalThis.fetch=previousFetch}
  assert.equal(networkCalls,0)
  const start=read('../../netlify/functions/onedrive-oauth-start.mjs')
  const callback=read('../../netlify/functions/onedrive-oauth-callback.mjs')
  const server=read('../../netlify/lib/onedrive.mjs')
  assert.doesNotMatch(start,/createOneDriveAuthorization|readSession|getStore|setJSON/)
  assert.doesNotMatch(callback,/completeOneDriveAuthorization|getStore|setJSON|tokenRequest/)
  assert.doesNotMatch(server,/createOneDriveAuthorization|completeOneDriveAuthorization|grant_type:'authorization_code'|onedrive-states/)
})

test('OneDrive UI has no OAuth route and external sermon publishing remains unavailable',()=>{
  const repository=read('./SermonRepository.jsx')
  const studio=read('./SpiritualFormationStudio.jsx')
  const api=read('./sermonFormationApi.js')
  assert.match(api,/getOneDriveStatus/)
  assert.doesNotMatch(api,/onedrive-oauth-start|oneDriveConnectUrl/)
  for(const source of [repository,studio]){
    assert.match(source,/External publishing unavailable/)
    assert.match(source,/disabled title="External publishing and connection changes are disabled in this release\."/)
    assert.doesNotMatch(source,/oneDriveConnectUrl|authorizeRepository|changeRepository|window\.location\.assign/)
  }
  assert.match(repository,/oneDrive\.connected&&oneDrive\.connection\?\.folderWebUrl/)
  assert.match(repository,/onClick=\{createCurrent\}/)
  assert.match(repository,/archiveSermonDocuments\(\{activeVersion,sourceHash\}\)/)
  assert.doesNotMatch(repository,/publishCurrent|Publish current sermon/)
})
