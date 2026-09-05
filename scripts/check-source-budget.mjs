import fs from 'node:fs'
import path from 'node:path'

const planner = path.resolve('src/finance/FinancePlanner.jsx')
const maxPlannerBytes = 505 * 1024
const archiveDir = path.resolve('src/finance/Archive')

let failed = false

if (!fs.existsSync(planner)) {
  console.error('FinancePlanner.jsx is missing.')
  process.exit(1)
}

const plannerBytes = fs.statSync(planner).size
if (plannerBytes > maxPlannerBytes) {
  console.error(`FinancePlanner.jsx exceeds its source budget: ${(plannerBytes / 1024).toFixed(1)} KiB > ${(maxPlannerBytes / 1024).toFixed(0)} KiB.`)
  failed = true
} else {
  console.log(`FinancePlanner.jsx source: ${(plannerBytes / 1024).toFixed(1)} KiB / ${(maxPlannerBytes / 1024).toFixed(0)} KiB budget.`)
}

if (fs.existsSync(archiveDir)) {
  const archivedPlannerCopies = fs.readdirSync(archiveDir).filter(name => /^FinancePlanner.*\.jsx$/i.test(name))
  if (archivedPlannerCopies.length) {
    console.error(`Obsolete FinancePlanner archive copies are not allowed in src/: ${archivedPlannerCopies.join(', ')}`)
    failed = true
  }
}

if (failed) process.exit(1)
console.log('Finance source budget passed.')
