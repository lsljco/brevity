import assert from 'node:assert/strict'
import test from 'node:test'
import { applicationRefreshDate, buildRefreshIssues } from './appRefresh.js'

test('application refresh requests the authoritative household date across UTC boundaries', () => {
  assert.equal(applicationRefreshDate(new Date('2026-09-07T02:30:00.000Z')), '2026-09-06')
  assert.equal(applicationRefreshDate(new Date('2026-09-07T04:30:00.000Z')), '2026-09-07')
})

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
