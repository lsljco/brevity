// Build-time scope is trusted; neither request hosts nor client fields choose stores.
let nativeBlobs = null
const client = () => nativeBlobs || require('@netlify/blobs')
const setNativeBlobs = value => { nativeBlobs = value }
const build = require('./release-build-context.cjs')
function scopedName(name, context = build) {
  if (!context.preview) return name
  const review = String(context.reviewId || context.commit || 'isolated').replace(/[^a-zA-Z0-9-]/g, '-').slice(0,40)
  return `preview-${review}-${name}`
}
function getStore(options) {
  return client().getStore(typeof options === 'string' ? scopedName(options) : {...options,name:scopedName(options.name)})
}
module.exports = {getStore,scopedName,preview:build.preview,setNativeBlobs,connectLambda:event=>client().connectLambda(event)}
