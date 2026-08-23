import { readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import process from 'node:process'
import { reconcileMalbecEstateExports } from '../src/estate/malbecTransform.js'

function usage() {
  console.error('Usage: npm run estate:migration:dry-run -- --output <report.json> <browser-export.json> [...]')
  process.exitCode = 1
}

async function main() {
  const args = process.argv.slice(2)
  const outputIndex = args.indexOf('--output')
  if (outputIndex === -1 || !args[outputIndex + 1]) return usage()
  const outputPath = resolve(args[outputIndex + 1])
  const inputPaths = args.filter((value, index) => index !== outputIndex && index !== outputIndex + 1).map(resolve)
  if (!inputPaths.length) return usage()
  if (inputPaths.includes(outputPath)) throw new Error('The reconciliation report cannot overwrite a source export.')

  const descriptors = await Promise.all(inputPaths.map(async inputPath => {
    const payload = JSON.parse(await readFile(inputPath, 'utf8'))
    return {
      payload,
      sourceDeviceId: payload.sourceDeviceId || basename(inputPath).replace(/\.json$/i, ''),
      extractedAt: payload.exportedAt || payload.timestamp || payload.exportDate,
    }
  }))
  const dated = descriptors.map(item => item.extractedAt).filter(Boolean).sort()
  const report = reconcileMalbecEstateExports(descriptors, { extractedAt: dated.at(-1) })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  console.log(`Dry-run report written to ${outputPath}`)
  console.log(`Sources: ${report.manifest.sourceDevices.length}; conflicts: ${report.manifest.conflictCount}`)
  console.log('No Brevity or Malbec records were modified.')
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
