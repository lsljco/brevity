import test from 'node:test'
import assert from 'node:assert/strict'
import {dailySessionComplete} from './sessionState.js'

test('unfinished session does not count as completed Education evidence',()=>{assert.equal(dailySessionComplete({responses:[]}),false);assert.equal(dailySessionComplete({responses:[],completedAt:'2026-09-16T20:00:00Z'}),true)})
