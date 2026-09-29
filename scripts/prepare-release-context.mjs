import {writeFile} from 'node:fs/promises'
await writeFile(new URL('../netlify/lib/release-build-context.mjs',import.meta.url),`export default ${JSON.stringify({preview:process.env.CONTEXT==='deploy-preview',commit:process.env.COMMIT_REF||'local'})}\n`)
