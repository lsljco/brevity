import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {systemHealthIssues} from './systemHealth.js'

test('system health only escalates integrations that need attention',()=>{const issues=systemHealthIssues({checks:{ai:{state:'ready',detail:'ok'},calendar:{state:'needs-attention',detail:'Calendar missing'},finance:{state:'ready',detail:'ok'},oneDrive:{state:'needs-attention',detail:'Authorization required'}}});assert.deepEqual(issues.map(issue=>issue.source),['Family Calendar','OneDrive Publishing']);assert.match(issues[0].message,/Calendar/);assert.match(issues[1].message,/Authorization/)})

test('server health covers the integrations required to operate Brevity',()=>{const source=fs.readFileSync(new URL('../../netlify/functions/system-health.mjs',import.meta.url),'utf8');for(const term of ['OPENAI_API_KEY','ICLOUD_EMAIL','ICLOUD_APP_PASSWORD','BREVITY_AUTOMATION_KEY','getTokens','getOneDriveRepositoryState'])assert.match(source,new RegExp(term))})
