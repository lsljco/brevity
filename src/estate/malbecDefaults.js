export const MALBEC_DEFAULT_SOURCE_SHA = '4f3cfcb7c1f5fe2a529454f59c226aefde9b31fe'

const DEFAULT_RECORDS = Object.freeze({
  maintenance_maintenance: [
    { id: 1, title: 'Master Bathroom Faucet', desc: 'Dripping at base', cat: 'Plumbing', owner: 'Larry', stage: 'In Progress', scheduledDate: '2026-07-05', updated: '2026-06-28', updatedBy: 'Larry' },
    { id: 2, title: 'Downstairs HVAC Service', desc: 'Routine maintenance', cat: 'HVAC', owner: 'Larry', stage: 'Scheduled', scheduledDate: '2026-07-10', updated: '2026-06-27', updatedBy: 'Larry' },
    { id: 3, title: 'Front Landscape Lights', desc: '2 lights not working', cat: 'Electrical', owner: 'Terica', stage: 'Needs Review', scheduledDate: '2026-07-02', updated: '2026-06-26', updatedBy: 'Terica' },
    { id: 4, title: 'Garage Door Adjustment', desc: 'Making noise when opening', cat: 'Doors', owner: 'Larry', stage: 'Completed', scheduledDate: null, updated: '2026-06-20', updatedBy: 'Larry' },
    { id: 5, title: 'Smoke Detectors', desc: 'Replace batteries', cat: 'Safety', owner: 'Terica', stage: 'Completed', scheduledDate: null, updated: '2026-06-18', updatedBy: 'Terica' },
    { id: 6, title: 'Gutter Cleaning', desc: 'Spring cleaning', cat: 'Exterior', owner: 'Larry', stage: 'Completed', scheduledDate: null, updated: '2026-06-15', updatedBy: 'Larry' },
    { id: 7, title: 'Pressure Wash Exterior', desc: 'Annual exterior wash', cat: 'Exterior', owner: 'Larry', stage: 'Scheduled', scheduledDate: '2026-07-15', updated: '2026-06-14', updatedBy: 'Larry' },
  ],
  maintenance_projects: [
    { id: 1, title: 'Pantry Build-out', desc: 'Custom shelving & lighting', cat: 'Home Improvement', owner: 'Terica', status: 'Planning', currentMilestone: 'Purchase Materials', milestones: ['Design', 'Source', 'Purchase Materials', 'Install', 'Complete'], doneCount: 3, updated: '2026-06-28', updatedBy: 'Terica' },
    { id: 2, title: 'Basement Flooring', desc: 'Tile installation', cat: 'Renovation', owner: 'Larry', status: 'In Progress', currentMilestone: 'Install Tile', milestones: ['Demo', 'Prep', 'Substrate', 'Install Tile', 'Grout', 'Finish'], doneCount: 4, updated: '2026-06-27', updatedBy: 'Larry' },
    { id: 3, title: 'Outdoor Kitchen', desc: 'Design & installation', cat: 'Construction', owner: 'Larry', status: 'Discussion', currentMilestone: 'Finalize Design', milestones: ['Vision', 'Budget', 'Design', 'Permits', 'Build', 'Complete'], doneCount: 1, updated: '2026-06-26', updatedBy: 'Larry' },
  ],
})

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  return value
}

function checksum(value) {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function malbecRecordFingerprint(record) {
  return checksum(JSON.stringify(stableValue(record)))
}

export function findExactMalbecSeedCandidates(recordsByKey = {}) {
  return Object.entries(DEFAULT_RECORDS).flatMap(([key, defaults]) => {
    const records = Array.isArray(recordsByKey[key]) ? recordsByKey[key] : []
    return defaults.flatMap((defaultRecord, sourceDefaultIndex) => {
      const record = records.find(item => String(item?.id ?? '') === String(defaultRecord.id))
      if (!record || malbecRecordFingerprint(record) !== malbecRecordFingerprint(defaultRecord)) return []
      return [{
        key,
        legacyId: String(defaultRecord.id),
        title: String(defaultRecord.title),
        sourceDefaultIndex,
        sourceFingerprint: malbecRecordFingerprint(defaultRecord),
        sourceCodeSha: MALBEC_DEFAULT_SOURCE_SHA,
      }]
    })
  })
}
