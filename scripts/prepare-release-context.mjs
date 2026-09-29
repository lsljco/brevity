import {writeFile} from 'node:fs/promises'
const context={preview:process.env.CONTEXT==='deploy-preview',commit:process.env.COMMIT_REF||'local',reviewId:process.env.REVIEW_ID||'',origin:process.env.DEPLOY_PRIME_URL||process.env.URL||''}
await writeFile(new URL('../netlify/lib/release-build-context.mjs',import.meta.url),`export default ${JSON.stringify(context)}\n`)
await writeFile(new URL('../netlify/lib/release-build-context.cjs',import.meta.url),`module.exports = ${JSON.stringify(context)}\n`)
