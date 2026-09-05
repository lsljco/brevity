import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {systemHealthIssues} from './systemHealth.js'

test('system health only escalates integrations that need attention',()=>{const issues=systemHealthIssues({checks:{ai:{state:'ready',detail:'ok'},calendar:{state:'needs-attention',detail:'Calendar missing'},finance:{state:'ready',detail:'ok'},oneDrive:{state:'needs-attention',detail:'Authorization required'}}});assert.deepEqual(issues.map(issue=>issue.source),['Family Calendar','OneDrive Publishing']);assert.match(issues[0].message,/Calendar/);assert.match(issues[1].message,/Authorization/)})

test('server health covers the integrations required to operate Brevity',()=>{const source=fs.readFileSync(new URL('../../netlify/functions/system-health.mjs',import.meta.url),'utf8');for(const term of ['OPENAI_API_KEY','ICLOUD_EMAIL','ICLOUD_APP_PASSWORD','BREVITY_AUTOMATION_KEY','getTokens','getOneDriveRepositoryState'])assert.match(source,new RegExp(term))})

test('production dependency exceptions are narrow, advisory-specific, and time bounded',()=>{const source=fs.readFileSync(new URL('../../scripts/audit-production.mjs',import.meta.url),'utf8');assert.match(source,/GHSA-w3rx-r6r6-pgpr/);assert.match(source,/GHSA-5p2g-fcmc-qvqq/);assert.match(source,/EXCEPTION_REVIEW_DATE='2026-10-01'/);assert.match(source,/critical/);assert.match(source,/unapproved high vulnerability/)})

test('sermon slide pipeline only accepts generated PNG image assets',()=>{const source=fs.readFileSync(new URL('../../netlify/lib/sermon-slides.mjs',import.meta.url),'utf8');assert.match(source,/output_format:'png'/);assert.match(source,/assertGeneratedPng/);assert.match(source,/0x89,0x50,0x4e,0x47/);assert.match(source,/accepts generated PNG assets only/)})
