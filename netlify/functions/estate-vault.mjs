import householdAuth from './household-auth.js'
import { productionEstateRepository } from '../lib/estate-store.mjs'
import { productionEstateVaultRepository } from '../lib/estate-vault-store.mjs'
import { MALBEC_PROPERTY_ID } from '../../src/estate/estateModel.js'

const { readSession } = householdAuth
const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
}
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })
const clean = (value, length = 240) => String(value || '').replace(/[\u0000-\u001f]/g, '').slice(0, length)
const safeName = value => clean(value || 'estate-document', 180).replace(/["\\/\r\n]/g, '-')

export function createEstateVaultHandler({
  authenticate = readSession,
  workspaceRepositoryFactory = productionEstateRepository,
  vaultRepositoryFactory = productionEstateVaultRepository,
} = {}) {
  return async event => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
    try {
      const session = await authenticate(event)
      if (!session) return response(401, { error: 'Sign in to access Estate documents.' })

      // Downloads remain available, but upload chunks and finalization are
      // deliberately stopped before either repository is opened. Estate Vault
      // imports need the same reviewed Action journal, immutable audit, safe
      // Undo, and stale-version recovery as every other meaningful mutation.
      if (event.httpMethod === 'POST') return response(423, {
        code: 'ACTION_REVIEW_REQUIRED',
        error: 'Estate Vault imports are unavailable in this release because document uploads are not yet protected by Action Mode review, audit history, safe Undo, and version-conflict recovery. No upload chunks or Estate records were changed.',
      })
      if (event.httpMethod !== 'GET') return response(405, { error: 'Method not allowed.' })

      const propertyId = clean(event.queryStringParameters?.propertyId || MALBEC_PROPERTY_ID, 160)
      const workspaceRepository = await workspaceRepositoryFactory()
      const workspace = await workspaceRepository.getWorkspace(propertyId)
      if (!workspace) return response(404, { error: 'That Estate workspace was not found.' })
      const documentId = clean(event.queryStringParameters?.documentId, 180)
      const document = workspace.documents?.find(item => item.id === documentId)
      if (!document?.storage?.key) return response(404, { error: 'That Estate document was not found.' })
      const vaultRepository = await vaultRepositoryFactory()
      const bytes = await vaultRepository.getFile(document.storage.key)
      if (!bytes) return response(404, { error: 'The Estate document bytes are unavailable.' })
      return {
        statusCode: 200,
        isBase64Encoded: true,
        headers: {
          'content-type': document.mimeType || 'application/octet-stream',
          'content-disposition': `attachment; filename="${safeName(document.fileName || document.title)}"`,
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
        },
        body: Buffer.from(bytes).toString('base64'),
      }
    } catch (error) {
      console.error('[estate-vault]', error)
      const status = error.statusCode || 500
      return response(status, { error: error.message || 'Estate Vault is temporarily unavailable.' })
    }
  }
}

export const handler = createEstateVaultHandler()
