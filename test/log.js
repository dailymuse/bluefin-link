import {EALREADY} from 'constants'

const test = require('ava')
const PgLink = require('../src')
const StubLog = require('./lib/log')

test('mock logs queries to a custom log', t => {
  const log = new StubLog()
  const Link = PgLink.mock()
  Link.fn.selectInteger = 42
  Link.log = log
  const db = new Link('pg:///test', __dirname, 'sql')
  return db.connect(sql => sql.selectInteger(1)).then(() => {
    t.is(log._info.length, 1)
    t.is(log._info[0].message, 'query')
    t.is(log._info[0].context.source, `${db.directory}/selectInteger.sql`)
    t.is(log._info[0].context.return, 'value')
    t.deepEqual(log._info[0].context.arguments, [1])
  })
})

test('pg logs queries to a custom log', t => {
  const log = new StubLog()
  PgLink.log = log
  const db = new PgLink('pg:///test', __dirname, 'sql')
  return db.connect(sql => sql.selectInteger(1)).then(() => {
    const entry = log._info.find(ea => ea.message === 'query')
    t.not(entry, undefined)
    t.is(entry.context.source, `${db.directory}/selectInteger.sql`)
    t.is(entry.context.return, 'value')
    t.deepEqual(entry.context.arguments, [1])
  })
})
