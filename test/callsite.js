const test = require('ava')
const Link = require('../src')

test.beforeEach(t => {
  t.context.Link = Link.mock()
  t.context.db = new t.context.Link('pg:///test', __dirname, 'sql')
})

test('gets structured callsite', t => {
  const {db} = t.context

  const frame = db.strategy.getCallSite()
  t.is(frame.getFunctionName(), 'emit')
  t.false(frame.getFileName().includes('bluefin-link'))
})

test('formats callsite', t => {
  const {db} = t.context

  const desc = db.strategy.formatCallSite()
  t.is(desc, 'process.emit (events.js:180:13)')
})
