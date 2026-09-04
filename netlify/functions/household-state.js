const { getStore } = require('@netlify/blobs')
const { readSession } = require('./household-auth')

const STORE_NAME = 'brevity-household-state'
const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const ALLOWED_KEYS = new Set([
  'lslj_finance_v9','lslj_budget_v1','lslj_actuals_v1','lslj_bal_overrides_v1','lslj_tx_overrides_v1','lslj_tx_rules_v1',
  'brevity_finance_categories_v1','brevity_finance_scenarios_v1','fp_goals','homehq_items_v1','family_calendar_events_v1',
  'brevity_daily_financial_alignment_v1','brevity_finance_timeframe_v1','brevity_finance_meetings_v1','brevity_household_maintenance_v1',
  'brevity_household_inventory_v1','brevity_household_finance_bridge_v1','brevity_household_schedule_v1',
])
const headers = {
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-headers':'content-type',
  'access-control-allow-methods':'GET,PUT,OPTIONS',
}
const response = (statusCode, body) => ({ statusCode, headers, body:JSON.stringify(body) })
const recordKey = key => `${HOUSEHOLD_ID}/records/${key}`
const store = () => getStore({ name:STORE_NAME, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
const normalizeVersion = record => Math.max(0, Number(record?.version || 0))

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode:204, headers, body:'' }
  try {
    const session = await readSession(event)
    if (!session) return response(401, { error:'Sign in to synchronize household data.' })
    const dataStore = store()

    if (event.httpMethod === 'GET') {
      const records = {}
      await Promise.all([...ALLOWED_KEYS].map(async key => {
        const record = await dataStore.get(recordKey(key), { type:'json' }).catch(() => null)
        if (record?.value != null) records[key] = { ...record, version:normalizeVersion(record) }
      }))
      return response(200, { householdId:HOUSEHOLD_ID, records, serverTime:new Date().toISOString() })
    }

    if (event.httpMethod === 'PUT') {
      let body
      try { body = JSON.parse(event.body || '{}') } catch { return response(400, { error:'Invalid JSON body.' }) }
      const key = String(body.key || '')
      if (!ALLOWED_KEYS.has(key)) return response(400, { error:'This data type cannot be synchronized.' })
      if (typeof body.value !== 'string') return response(400, { error:'A serialized value is required.' })
      if (Buffer.byteLength(body.value, 'utf8') > 5_000_000) return response(413, { error:'This record is too large to synchronize. Remove large embedded attachments and try again.' })

      const existing = await dataStore.get(recordKey(key), { type:'json' }).catch(() => null)
      const existingVersion = normalizeVersion(existing)
      const hasExpectedVersion = body.expectedVersion !== undefined && body.expectedVersion !== null
      const expectedVersion = Math.max(0, Number(body.expectedVersion || 0))

      if (existing && hasExpectedVersion && expectedVersion !== existingVersion) {
        return response(200, {
          conflict:true,
          conflictType:'version',
          record:{ ...existing, version:existingVersion },
          expectedVersion,
          actualVersion:existingVersion,
        })
      }

      const updatedAt = new Date().toISOString()
      const record = {
        key,
        value:body.value,
        hash:String(body.hash || ''),
        version:existingVersion + 1,
        updatedAt,
        updatedBy:session.member,
      }
      await dataStore.setJSON(recordKey(key), record)
      return response(200, { record, conflict:false })
    }

    return response(405, { error:'Method not allowed.' })
  } catch (error) {
    console.error('[household-state]', error)
    return response(500, { error:'Household synchronization is temporarily unavailable.' })
  }
}
