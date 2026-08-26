import { createHash } from 'node:crypto'
import householdAuth from './household-auth.js'
import { productionEstateRepository } from '../lib/estate-store.mjs'
import { productionEstateVaultRepository } from '../lib/estate-vault-store.mjs'
import { MALBEC_PROPERTY_ID } from '../../src/estate/estateModel.js'

const { readSession } = householdAuth
const MAX_CHUNKS = 80
const MAX_CHUNK_CHARACTERS = 1_000_000
const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
}
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })
const clean = (value, length = 240) => String(value || '').replace(/[\u0000-\u001f]/g, '').slice(0, length)
const safeName = value => clean(value || 'estate-document', 180).replace(/["\\/\r\n]/g, '-')

function sourceChecksum(value) {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function parseBody(event) {
  if (Buffer.byteLength(event.body || '', 'utf8') > 1_250_000) throw Object.assign(new Error('Estate Vault upload chunks must be 1 MB or smaller.'), { statusCode: 413 })
  try { return JSON.parse(event.body || '{}') } catch { throw Object.assign(new Error('Invalid JSON body.'), { statusCode: 400 }) }
}

function validateUpload(input) {
  const fileId = clean(input.fileId, 160)
  const sourcePath = clean(input.sourcePath, 500)
  const checksum = clean(input.sourceChecksum, 120)
  const chunkIndex = Number(input.chunkIndex)
  const totalChunks = Number(input.totalChunks)
  if (!fileId || !sourcePath || !checksum) throw Object.assign(new Error('File id, source path, and source checksum are required.'), { statusCode: 400 })
  if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > MAX_CHUNKS) throw Object.assign(new Error(`Estate Vault supports 1 to ${MAX_CHUNKS} chunks per file.`), { statusCode: 400 })
  if (input.action === 'chunk' && (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= totalChunks)) throw Object.assign(new Error('The upload chunk index is invalid.'), { statusCode: 400 })
  return { fileId, sourcePath, sourceChecksum: checksum, chunkIndex, totalChunks }
}

function pendingManifest(workspace, input) {
  return workspace?.migration?.pendingFiles?.find(file => file.id === input.fileId && file.path === input.sourcePath && file.sourceChecksum === input.sourceChecksum) || null
}

function normalizedBase64(value) {
  const text = String(value || '')
  if (!text || text.length > MAX_CHUNK_CHARACTERS || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null
  const bytes = Buffer.from(text, 'base64')
  if (bytes.toString('base64') !== text) return null
  return { text, bytes }
}

function relatedEntityIds(workspace, sourcePath) {
  const match = sourcePath.match(/^malbecHOS_(maintenance_maintenance|maintenance_projects)\[(\d+)\]/)
  if (!match) return []
  const [, key, sourceIndex] = match
  const collection = key === 'maintenance_maintenance' ? workspace.workOrders : workspace.projects
  const record = (collection || []).find(item => item.legacySource?.storageKey === `malbecHOS_${key}` && Number(item.legacySource?.sourceIndex) === Number(sourceIndex))
  return record ? [record.id] : []
}

function documentTitle(workspace, manifest, relations) {
  const related = [...(workspace.workOrders || []), ...(workspace.projects || [])].find(item => relations.includes(item.id))
  const extension = String(manifest.mimeType || '').split('/')[1]?.replace(/[^a-zA-Z0-9]/g, '') || 'file'
  return `${related?.title || 'Malbec legacy document'} (${manifest.id}.${extension})`
}

export function createEstateVaultHandler({
  authenticate = readSession,
  workspaceRepositoryFactory = productionEstateRepository,
  vaultRepositoryFactory = productionEstateVaultRepository,
  now = () => new Date(),
} = {}) {
  return async event => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
    try {
      const session = await authenticate(event)
      if (!session) return response(401, { error: 'Sign in to access Estate documents.' })
      const propertyId = clean(event.queryStringParameters?.propertyId || MALBEC_PROPERTY_ID, 160)
      const workspaceRepository = await workspaceRepositoryFactory()
      const workspace = await workspaceRepository.getWorkspace(propertyId)
      if (!workspace) return response(404, { error: 'Create the durable Estate workspace before importing legacy documents.' })
      const vaultRepository = await vaultRepositoryFactory()

      if (event.httpMethod === 'GET') {
        const documentId = clean(event.queryStringParameters?.documentId, 180)
        const document = workspace.documents?.find(item => item.id === documentId)
        if (!document?.storage?.key) return response(404, { error: 'That Estate document was not found.' })
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
      }

      if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed.' })
      if (session.role !== 'admin') return response(403, { error: 'Household administrator access is required for legacy document imports.' })
      const body = parseBody(event)
      const input = validateUpload(body)
      const manifest = pendingManifest(workspace, input)
      if (!manifest) return response(409, { error: 'This file does not match the pending manifest in the durable Estate workspace.' })
      const existing = workspace.documents?.find(document => document.legacySource?.fileId === input.fileId && document.legacySource?.sourceChecksum === input.sourceChecksum)
      if (existing) return response(200, { complete: true, document: existing, workspace })

      if (body.action === 'chunk') {
        const chunk = normalizedBase64(body.base64)
        if (!chunk) return response(400, { error: 'The upload chunk is not canonical base64.' })
        await vaultRepository.setChunk({ propertyId, ...input, index: input.chunkIndex, base64: chunk.text })
        return response(202, { accepted: true, chunkIndex: input.chunkIndex, totalChunks: input.totalChunks })
      }
      if (body.action !== 'finalize') return response(400, { error: 'Estate Vault action must be chunk or finalize.' })

      const chunks = await vaultRepository.getChunks({ propertyId, ...input })
      if (chunks.some(chunk => typeof chunk !== 'string')) return response(409, { error: 'One or more Estate Vault upload chunks are missing.' })
      const base64 = chunks.join('')
      if (sourceChecksum(base64) !== input.sourceChecksum) return response(409, { error: 'The reconstructed file does not match the Malbec source checksum.' })
      const bytes = Buffer.from(base64, 'base64')
      if (bytes.length !== Number(manifest.byteEstimate || 0)) return response(409, { error: 'The reconstructed file size does not match the pending manifest.' })
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const storageKey = await vaultRepository.putFile({ propertyId, sha256, bytes })
      const occurredAt = now().toISOString()
      const relations = relatedEntityIds(workspace, manifest.path)
      const document = {
        id: `estate-document-${clean(manifest.id, 150)}`,
        propertyId,
        title: documentTitle(workspace, manifest, relations),
        fileName: `${manifest.id}.${String(manifest.mimeType || '').split('/')[1]?.replace(/[^a-zA-Z0-9]/g, '') || 'bin'}`,
        documentType: String(manifest.mimeType || '').startsWith('image/') ? 'photograph' : 'legacy-document',
        mimeType: clean(manifest.mimeType || 'application/octet-stream', 120),
        byteSize: bytes.length,
        sha256,
        status: 'active',
        relatedEntityIds: relations,
        storage: { provider: 'netlify-blobs', key: storageKey },
        createdAt: occurredAt,
        updatedAt: occurredAt,
        legacySource: { system: 'malbec-estate-household-os', fileId: manifest.id, sourcePath: manifest.path, sourceChecksum: manifest.sourceChecksum },
      }
      const next = {
        ...workspace,
        documents: [...(workspace.documents || []), document],
        migration: {
          ...workspace.migration,
          pendingFiles: workspace.migration.pendingFiles.map(file => file.id === manifest.id ? { ...file, status: 'imported', documentId: document.id, sha256, importedAt: occurredAt } : file),
        },
      }
      const saved = await workspaceRepository.saveWorkspace({ workspace: next, expectedVersion: body.expectedVersion, actor: session.member, reason: 'estate.legacy-document-imported' })
      await vaultRepository.clearChunks({ propertyId, ...input })
      return response(201, { complete: true, document, workspace: saved })
    } catch (error) {
      console.error('[estate-vault]', error)
      const status = error.statusCode || (error.code === 'VERSION_CONFLICT' ? 409 : error.code === 'VALIDATION_ERROR' ? 400 : 500)
      return response(status, { error: error.message || 'Estate Vault is temporarily unavailable.' })
    }
  }
}

export const handler = createEstateVaultHandler()
