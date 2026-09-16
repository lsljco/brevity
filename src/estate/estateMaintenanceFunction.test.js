import assert from 'node:assert/strict'
import test from 'node:test'
import { createEstateMaintenanceHandler } from '../../netlify/functions/estate-maintenance.mjs'

const request = (method = 'POST') => ({ httpMethod:method, body:JSON.stringify({ action:'create-plan' }) })

test('Estate maintenance endpoint requires household authentication', async () => {
  const handler = createEstateMaintenanceHandler({ authenticate:async () => null })
  const result = await handler(request())
  assert.equal(result.statusCode, 401)
})

test('Estate maintenance rejects every mutation before a store can be reached', async () => {
  let authenticationCalls = 0
  const handler = createEstateMaintenanceHandler({
    authenticate:async () => { authenticationCalls += 1; return { member:'Larry', role:'admin' } },
  })

  for (const action of ['create-plan', 'transition-event', 'link-calendar']) {
    const result = await handler({ httpMethod:'POST', body:JSON.stringify({ action }) })
    const body = JSON.parse(result.body)
    assert.equal(result.statusCode, 423)
    assert.equal(body.code, 'ACTION_MODE_REQUIRED')
    assert.equal(body.domain, 'projects')
    assert.match(body.error, /Action Mode/i)
  }
  assert.equal(authenticationCalls, 3)
})

test('Estate maintenance keeps non-mutation methods closed', async () => {
  const handler = createEstateMaintenanceHandler({ authenticate:async () => ({ member:'Larry', role:'admin' }) })
  assert.equal((await handler(request('GET'))).statusCode, 405)
  assert.equal((await handler(request('OPTIONS'))).statusCode, 204)
})
