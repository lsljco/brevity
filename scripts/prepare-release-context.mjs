import {writeFile} from 'node:fs/promises'
import {releaseContext} from '../netlify/lib/build-isolation.mjs'
const context=releaseContext(process.env)
await writeFile(new URL('../netlify/lib/release-build-context.mjs',import.meta.url),`export default ${JSON.stringify(context)}\n`)
await writeFile(new URL('../netlify/lib/release-build-context.cjs',import.meta.url),`module.exports = ${JSON.stringify(context)}\n`)
