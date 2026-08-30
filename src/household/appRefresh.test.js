import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRefreshIssues } from './appRefresh.js'

test('refresh issues identify their source and remain separate from daily decisions', () => {
  const issues=buildRefreshIssues({
    financeResult:{status:'fulfilled',value:{errors:['Pinnacle: login required']}},
    planResult:{status:'fulfilled',value:{}},
    calendar:{error:'Apple Calendar credentials need attention.'},
  })

  assert.deepEqual(issues.map(issue=>issue.source),['Finance & Plaid','Family Calendar'])
  assert.match(issues[0].message,/Pinnacle/)
  assert.match(issues[1].action,/Family Calendar/)
})
