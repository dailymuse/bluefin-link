const test = require('ava')
const Link = require('../src')
const common = require('./lib/common')

test.beforeEach(t => {
  t.context.mock = Link.mock()
  t.context.db = new t.context.mock.Link('pg:///test', __dirname, 'sql')
})

common(test)

test('rejects a table mock that is not an array', t => {
  t.context.mock.fn.selectSeries = 42
  return t.context.db.connect(sql => sql.selectSeries(8)).catch(e => {
    t.is(e.name, 'QueryFailed')
    t.is(e.message, 'mock does not return a table')
  })
})

test('rejects a table mock that does not contain rows', t => {
  t.context.mock.fn.selectSeries = [42]
  return t.context.db.connect(sql => sql.selectSeries(8)).catch(e => {
    t.is(e.name, 'QueryFailed')
    t.is(e.message, 'mock does not return rows')
  })
})

test('rejects a row mock that does not return a row', t => {
  t.context.mock.fn.selectIntegerAndString = 42
  return t.context.db.connect(sql => sql.selectIntegerAndString(8)).catch(e => {
    t.is(e.name, 'QueryFailed')
    t.is(e.message, 'mock does not return a row')
  })
})

test('rejects a row mock that returns a row with no columns', t => {
  t.context.mock.fn.selectIntegerAndString = {}
  return t.context.db.connect(sql => sql.selectIntegerAndString(8)).catch(e => {
    t.is(e.name, 'QueryFailed')
    t.is(e.message, 'mock row should have at least one column')
  })
})

test('accepts a undefined mock row', t => {
  t.context.mock.fn.selectIntegerAndString = undefined
  return t.context.db
    .connect(sql => sql.selectIntegerAndString(8))
    .then(
      row => t.true(row === undefined),
      e => t.fail('promise must not be rejected')
    )
})

test('includes the error name and message in the stack', t => {
  const {mock, db} = t.context
  mock.fn.errorWithArguments = () => {
    throw new Error('whiffle')
  }
  return db.connect(c => c.errorWithArguments(42, 21, 96)).catch(e => {
    t.is(e.message, 'Mock errorWithArguments() threw error')
    t.regex(e.stack, /^QueryFailed: Mock errorWithArguments\(\) threw error/)
    t.regex(e.cause().stack, /^Error: whiffle\n/)
  })
})
