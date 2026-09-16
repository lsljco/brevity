import test from 'node:test'
import assert from 'node:assert/strict'
import {tutorSessionId} from './sessionId.js'

test('session ids are deterministic enough for duplicate-completion protection',()=>{assert.equal(tutorSessionId('2026-09-16'),'isaiah-2026-09-16-session-1')})
