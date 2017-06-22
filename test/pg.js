const test = require('ava')
const {Client} = require('pg')
const path = require('path')

const Link = require('../src')
const common = require('./lib/common')

const dbUrl = 'pg:///test'
const sourceDir = path.join(__dirname, 'sql')

let db
const client = new Client(dbUrl)

test.before(t => {
  db = new Link(dbUrl, __dirname, 'sql')
  client.connect()
  return client.query('CREATE TABLE IF NOT EXISTS _database_test (n integer)')
})

test.after(t => {
  return client.query('DROP TABLE _database_test').then(() => client.end())
})

test.beforeEach(t => {
  t.context.db = db
  t.context.mock = {fn: {}} // stub mocking context
})

common(test)

test('error has correct information', t => {
  return db.connect(c => c.errorWithArguments(42, 21, 96)).catch(e => {
    t.is(e.message, 'invalid reference to FROM-clause entry for table "x"')
    t.regex(e.stack, /^QueryFailed: invalid reference/)

    const c = e.cause()
    t.is(c.message, 'invalid reference to FROM-clause entry for table "x"')
    t.is(typeof c.context.hint, 'string')
  })
})
