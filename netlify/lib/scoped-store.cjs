// Build-time scope is trusted; neither request hosts nor client fields choose stores.
const blobs = require('@netlify/blobs')
const build = require('./release-build-context.cjs')
function scopedName(name, context = build) {
  if (!context.preview) return name
  const review = String(context.reviewId || context.commit || 'isolated').replace(/[^a-zA-Z0-9-]/g, '-').slice(0,40)
  return `preview-${review}-${name}`
}
function getStore(options) {
  return blobs.getStore(typeof options === 'string' ? scopedName(options) : {...options,name:scopedName(options.name)})
}
module.exports = {...blobs,getStore,scopedName,preview:build.preview}
