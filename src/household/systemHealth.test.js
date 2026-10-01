import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {systemHealthIssues} from './systemHealth.js'

test('system health only escalates integrations that need attention',()=>{const issues=systemHealthIssues({checks:{ai:{state:'ready',detail:'ok'},calendar:{state:'needs-attention',detail:'Calendar missing'},finance:{state:'ready',detail:'ok'},oneDrive:{state:'needs-attention',detail:'Authorization required'}}});assert.deepEqual(issues.map(issue=>issue.source),['Family Calendar','OneDrive Publishing']);assert.match(issues[0].message,/Calendar/);assert.match(issues[1].message,/Authorization/)})

test('server health covers the integrations required to operate Brevity',()=>{const source=fs.readFileSync(new URL('../../netlify/functions/system-health.mjs',import.meta.url),'utf8');for(const term of ['OPENAI_API_KEY','ICLOUD_EMAIL','ICLOUD_APP_PASSWORD','BREVITY_AUTOMATION_KEY','getTokens','getOneDriveRepositoryState'])assert.match(source,new RegExp(term))})
test('system health uses a bundle-safe storage import',()=>{const source=fs.readFileSync(new URL('../../netlify/functions/system-health.mjs',import.meta.url),'utf8');assert.match(source,/import storage from '\.\.\/legacy-functions\/storage\.js'/);assert.doesNotMatch(source,/createRequire|import\.meta\.url/)})

test('production dependency audit rejects every high and critical advisory without exceptions',()=>{const source=fs.readFileSync(new URL('../../scripts/audit-production.mjs',import.meta.url),'utf8');assert.match(source,/entry.severity==='critical'\)blocking.push/);assert.match(source,/entry.severity==='high'\)blocking.push/);assert.doesNotMatch(source,/allowedHigh|EXCEPTION_REVIEW_DATE/);const manifest=JSON.parse(fs.readFileSync(new URL('../../package.json',import.meta.url),'utf8'));assert.equal(manifest.overrides.pptxgenjs['image-size'],'2.0.4')})

test('sermon slide pipeline only accepts generated PNG image assets',()=>{const source=fs.readFileSync(new URL('../../netlify/lib/sermon-slides.mjs',import.meta.url),'utf8');assert.match(source,/output_format:'png'/);assert.match(source,/assertGeneratedPng/);assert.match(source,/0x89,0x50,0x4e,0x47/);assert.match(source,/accepts generated PNG assets only/)})


test('dependency audit fails closed on registry errors and blocks high advisories',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brevity-audit-gate-'))
  try {
    fs.writeFileSync(path.join(dir,'npm'),'#!/usr/bin/env node\nprocess.stdout.write(process.env.AUDIT_FIXTURE);process.exit(Number(process.env.AUDIT_EXIT))',{mode:0o700})
    const run=(report,exit=0)=>spawnSync(process.execPath,['scripts/audit-production.mjs'],{cwd:new URL('../../',import.meta.url),encoding:'utf8',env:{...process.env,PATH:`${dir}${path.delimiter}${process.env.PATH}`,AUDIT_FIXTURE:JSON.stringify(report),AUDIT_EXIT:String(exit)}})
    const complete={vulnerabilities:{},metadata:{vulnerabilities:{high:0,critical:0}}}
    assert.equal(run(complete).status,0)
    assert.equal(run({error:{code:'ECONNRESET'}},1).status,1)
    assert.equal(run({}).status,1)
    for(const severity of ['high','critical']){
      const result=run({...complete,vulnerabilities:{'image-size':{severity}}},1)
      assert.equal(result.status,1);assert.match(result.stderr,new RegExp(`${severity} vulnerability`))
    }
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
})
