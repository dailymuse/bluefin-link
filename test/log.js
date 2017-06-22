const test = require('ava')
const Link = require('../src')
const StubLog = require('./lib/log')

test('mock logs queries to a custom log', t => {
  const log = new StubLog()
  const mock = Link.mock()
  mock.fn.selectInteger = 42
  mock.Link.log = log
  const db = new mock.Link('pg:///test', __dirname, 'sql')
  return db.connect(sql => sql.selectInteger(1)).then(() => {
    t.is(log._info.length, 3)
    t.is(log._info[1].message, 'query')
    t.is(log._info[1].context.source, `${db.directory}/selectInteger.sql`)
    t.is(log._info[1].context.return, 'value')
    t.deepEqual(log._info[1].context.arguments, [1])
  })
})

test('pg logs queries to a custom log', t => {
  const log = new StubLog()
  Link.log = log
  const db = new Link('pg:///test', __dirname, 'sql')
  return db.connect(sql => sql.selectInteger(1)).then(() => {
    t.is(log._info.length, 3)
    t.is(log._info[1].message, 'query')
    t.is(log._info[1].context.source, `${db.directory}/selectInteger.sql`)
    t.is(log._info[1].context.return, 'value')
    t.deepEqual(log._info[1].context.arguments, [1])
  })
})
