import test from 'node:test'
import assert from 'node:assert/strict'
import {currentUnit} from './fultonCurriculum.js'

test('ELA and science resolve independently from math',()=>{assert.equal(currentUnit('2026-09-16','ela')?.title,'Figure It Out');assert.equal(currentUnit('2026-09-16','science')?.title,'Habitats, Adaptations, and Environment')})
