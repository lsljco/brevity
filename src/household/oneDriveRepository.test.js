import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const target = 'https://1drv.ms/f/c/0675525c56f14fef/IgDc-iXzsiwjSLJBV5ifMvBfASYUCca6MBtroniveZWUJhU'
const serverSource = readFileSync(new URL('../../netlify/lib/onedrive.mjs', import.meta.url), 'utf8')
const statusSource = readFileSync(new URL('../../netlify/functions/onedrive-status.mjs', import.meta.url), 'utf8')
const startSource = readFileSync(new URL('../../netlify/functions/onedrive-oauth-start.mjs', import.meta.url), 'utf8')
const callbackSource = readFileSync(new URL('../../netlify/functions/onedrive-oauth-callback.mjs', import.meta.url), 'utf8')
const apiSource = readFileSync(new URL('./sermonFormationApi.js', import.meta.url), 'utf8')
const repositorySource = readFileSync(new URL('./SermonRepository.jsx', import.meta.url), 'utf8')

test('the sermon repository retains the selected OneDrive folder as read-only context', () => {
  assert.ok(serverSource.includes(target))
  assert.ok(apiSource.includes(target))
  assert.match(repositorySource, /OneDrive connected/)
  assert.match(repositorySource, /Automatic uploads are not enabled/i)
  assert.doesNotMatch(repositorySource, /oneDriveConnectUrl|window\.location\.assign/)
})

test('an old OneDrive connection cannot continue receiving new files', () => {
  assert.match(serverSource, /connection\?\.repositoryShareUrl===ONEDRIVE_REPOSITORY_SHARE_URL/)
  assert.match(serverSource, /changeRequired:Boolean\(connection&&!activeRepositoryConnection\(connection\)\)/)
  assert.match(serverSource, /const connection=await getOneDriveConnection\(\)/)
  assert.match(statusSource, /changeRequired:repository\.changeRequired/)
  assert.doesNotMatch(repositorySource, /External publishing unavailable/)
  assert.match(startSource, /CONNECTION_MUTATIONS_DISABLED/)
  assert.match(callbackSource, /CONNECTION_MUTATIONS_DISABLED/)
  assert.doesNotMatch(startSource, /createOneDriveAuthorization/)
  assert.doesNotMatch(callbackSource, /completeOneDriveAuthorization/)
})
