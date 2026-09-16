import assert from 'node:assert/strict'
import test from 'node:test'
import { findExactMalbecSeedCandidates, MALBEC_DEFAULT_SOURCE_SHA } from './malbecDefaults.js'

const exact = { id: 6, title: 'Gutter Cleaning', desc: 'Spring cleaning', cat: 'Exterior', owner: 'Larry', stage: 'Completed', scheduledDate: null, updated: '2026-06-15', updatedBy: 'Larry' }

test('detects only records that exactly match the Malbec source defaults', () => {
  const candidates = findExactMalbecSeedCandidates({ maintenance_maintenance: [exact, { ...exact, id: 60, title: 'Real gutter work' }] })
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].legacyId, '6')
  assert.equal(candidates[0].sourceCodeSha, MALBEC_DEFAULT_SOURCE_SHA)
})

test('does not classify an edited default record as code seed data', () => {
  const candidates = findExactMalbecSeedCandidates({ maintenance_maintenance: [{ ...exact, stage: 'Scheduled' }] })
  assert.equal(candidates.length, 0)
})
