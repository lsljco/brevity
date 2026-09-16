import test from 'node:test'
import assert from 'node:assert/strict'
import {independentRate} from './independentRate.js'

test('independent rate does not count prompted success as independent mastery',()=>{assert.equal(independentRate([{result:'independent'},{result:'prompted'}]),50)})
