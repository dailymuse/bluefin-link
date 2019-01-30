const test = require('ava')
const { Client } = require('pg')

const PgLink = require('../src')
const common = require('./lib/common')

const dbUrl = 'pg:///test'

let db
const client = new Client(dbUrl)

test.before(t => {
  db = new PgLink(dbUrl, __dirname, 'sql')
  client.connect()
  return client.query('CREATE TABLE IF NOT EXISTS _database_test (n integer)')
})

test.after(t => {
  return client.query('DROP TABLE _database_test').then(() => client.end())
})

test.beforeEach(t => {
  t.context.db = db
  t.context.Link = PgLink.mock()
})

common(test)

test('error has correct information', t => {
  return db.connect(c => c.errorWithArguments(42, 21, 96)).catch(cause => {
    t.is(cause.message, 'invalid reference to FROM-clause entry for table "x"')
    t.is(cause.context.length, 217)
    t.is(cause.context.code, '42P01')
    t.is(cause.context.position, 120)
    t.is(
      cause.context.hint,
      'There is an entry for table "x", but it cannot be referenced from this part of the query.'
    )

    const effect = cause.effect
    t.is(effect.message, 'query failed')
    t.deepEqual(effect.context.arguments, [42, 21, 96])
    t.true(effect.context.source.endsWith('test/sql/errorWithArguments.sql'))
    t.is(effect.context.return, 'row')
  })
})
