import { HOUSEHOLD_TIME_ZONE } from './financeTime.js'

const ISO_TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g

export function bankRetryTime(message) {
  const match = String(message || '').match(/paid balance check[\s\S]*?Try after (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/i)
  return match && Number.isFinite(Date.parse(match[1])) ? match[1] : ''
}

export function readableBankMessage(message) {
  return String(message || '').replace(ISO_TIME, value => {
    if (!Number.isFinite(Date.parse(value))) return value
    return new Date(value).toLocaleString('en-US', {
      timeZone:HOUSEHOLD_TIME_ZONE, month:'short', day:'numeric', year:'numeric',
      hour:'numeric', minute:'2-digit', timeZoneName:'short',
    })
  })
}

export function normalTransactionSyncNotice(result) {
  if (!result || result.error || result.connected === false) return `Transaction sync did not complete. ${readableBankMessage(result?.error || 'Last verified history remains available.')}`
  if (result.errors?.length || result.refresh?.errors?.length) return 'Transaction sync is partial. Forecast uses incomplete bank data; unconfirmed sources retain their last verified transactions.'
  if (result.refresh?.stillProcessing) return 'The bank update is still processing. Forecast uses the latest available transaction snapshot.'
  return 'Available transactions synced. The last live balance-check time is unchanged.'
}
