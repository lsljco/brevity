const STORE_NAME = 'brevity-estate-vault'
const safeSegment = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 160)

export function createEstateVaultRepository({ store, householdId = 'lslj-family' }) {
  const household = safeSegment(householdId)
  const uploadPrefix = ({ propertyId, fileId, sourceChecksum }) => `${household}/staging/${safeSegment(propertyId)}/${safeSegment(fileId)}/${safeSegment(sourceChecksum)}`
  const chunkKey = (input, index) => `${uploadPrefix(input)}/${String(index).padStart(3, '0')}`
  const binaryKey = ({ propertyId, sha256 }) => `${household}/files/${safeSegment(propertyId)}/${safeSegment(sha256)}`

  const setChunk = async ({ propertyId, fileId, sourceChecksum, index, base64 }) => {
    await store.set(chunkKey({ propertyId, fileId, sourceChecksum }, index), base64)
  }
  const getChunks = async ({ propertyId, fileId, sourceChecksum, totalChunks }) => Promise.all(
    Array.from({ length: totalChunks }, (_, index) => store.get(chunkKey({ propertyId, fileId, sourceChecksum }, index), { type: 'text' }).catch(() => null)),
  )
  const clearChunks = async input => {
    if (typeof store.delete !== 'function') return
    await Promise.all(Array.from({ length: input.totalChunks }, (_, index) => store.delete(chunkKey(input, index)).catch(() => null)))
  }
  const putFile = async ({ propertyId, sha256, bytes }) => {
    const key = binaryKey({ propertyId, sha256 })
    await store.set(key, bytes)
    return key
  }
  const getFile = async key => store.get(key, { type: 'arrayBuffer' }).catch(() => null)

  return { setChunk, getChunks, clearChunks, putFile, getFile }
}

export async function productionEstateVaultRepository(options = {}) {
  const { getStore } = await import('@netlify/blobs')
  const store = getStore({
    name: STORE_NAME,
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN,
  })
  return createEstateVaultRepository({ store, householdId: process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family', ...options })
}
