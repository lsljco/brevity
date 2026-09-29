// Native ESM functions must use a statically imported Blobs client.
import * as blobs from '@netlify/blobs'
import build from './release-build-context.mjs'
export * from '@netlify/blobs'
export function scopedName(name, context = build) {
  if (!context.preview) return name
  const review = String(context.reviewId || context.commit || 'isolated').replace(/[^a-zA-Z0-9-]/g, '-').slice(0,40)
  return `preview-${review}-${name}`
}
export function getStore(options) {
  return blobs.getStore(typeof options === 'string' ? scopedName(options) : {...options,name:scopedName(options.name)})
}
export const preview=build.preview
