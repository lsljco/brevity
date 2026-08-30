import { gunzipSync } from 'node:zlib'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const source=resolve(root,'src/vendor/apostolic-builder/index.html.gz.b64')
const destination=resolve(root,'public/apostolic-builder/index.html')

mkdirSync(dirname(destination),{recursive:true})
writeFileSync(destination,gunzipSync(Buffer.from(readFileSync(source,'utf8').trim(),'base64')))
