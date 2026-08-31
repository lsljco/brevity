import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const target = 'https://1drv.ms/f/c/0675525c56f14fef/IgDc-iXzsiwjSLJBV5ifMvBfASYUCca6MBtroniveZWUJhU'
const serverSource = readFileSync(new URL('../../netlify/lib/onedrive.mjs', import.meta.url), 'utf8')
const statusSource = readFileSync(new URL('../../netlify/functions/onedrive-status.mjs', import.meta.url), 'utf8')
const apiSource = readFileSync(new URL('./sermonFormationApi.js', import.meta.url), 'utf8')
const repositorySource = readFileSync(new URL('./SermonRepository.jsx', import.meta.url), 'utf8')

test('sermon publishing and the repository interface use the new OneDrive folder', () => {
  assert.ok(serverSource.includes(target))
  assert.ok(apiSource.includes(target))
  assert.match(repositorySource, /oneDriveConnectUrl\(ONEDRIVE_REPOSITORY_SHARE_URL\)/)
})

test('an old OneDrive connection cannot continue receiving new files', () => {
  assert.match(serverSource, /connection\?\.repositoryShareUrl===ONEDRIVE_REPOSITORY_SHARE_URL/)
  assert.match(serverSource, /changeRequired:Boolean\(connection&&!activeRepositoryConnection\(connection\)\)/)
  assert.match(serverSource, /const connection=await getOneDriveConnection\(\)/)
  assert.match(statusSource, /changeRequired:repository\.changeRequired/)
  assert.match(repositorySource, /Authorize new repository/)
})
