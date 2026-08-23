import { readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import process from 'node:process'
import { transformHomeHQExport } from '../src/estate/homehqTransform.js'

function usage() {
  console.error('Usage: npm run estate:homehq:dry-run -- --output <report.json> <brevity-backup.json>')
  process.exitCode = 1
}

async function main() {
  const args = process.argv.slice(2)
  const outputIndex = args.indexOf('--output')
  if (outputIndex === -1 || !args[outputIndex + 1]) return usage()
  const outputPath = resolve(args[outputIndex + 1])
  const inputPaths = args.filter((value, index) => index !== outputIndex && index !== outputIndex + 1)
  if (inputPaths.length !== 1) return usage()
  const inputPath = resolve(inputPaths[0])
  if (inputPath === outputPath) throw new Error('The audit report cannot overwrite the Brevity source backup.')

  const payload = JSON.parse(await readFile(inputPath, 'utf8'))
  const report = transformHomeHQExport(payload, {
    sourceDeviceId: payload.sourceDeviceId || basename(inputPath).replace(/\.json$/i, ''),
    extractedAt: payload.exportedAt || payload.timestamp,
  })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  console.log(`HomeHQ dry-run report written to ${outputPath}`)
  console.log(`Source items: ${report.manifest.sourceCount}; item conflicts: ${report.manifest.itemConflictCount}; vendor conflicts: ${report.manifest.vendorConflictCount}`)
  console.log('No HomeHQ or Estate records were modified.')
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
