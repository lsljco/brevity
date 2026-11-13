import test from 'node:test'
import assert from 'node:assert/strict'
import {landingView} from './landingView.js'
test('ordinary entry defaults to Home while notification destinations are preserved',()=>{
 for(const query of ['', '?utm_source=bookmark', '?signoffs=1'])assert.equal(landingView(query),'home')
 for(const query of ['?briefing=1','?priorities=1','?checkin=1','?view=today'])assert.equal(landingView(query),'today')
 assert.equal(landingView('?enhancements=1'),'enhancements')
})
