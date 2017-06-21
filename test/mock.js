const test = require('ava')
const path = require('path')

const Link = require('../src')

test.beforeEach(t => {
  t.context.mock = Link.mock()
  t.context.db = new t.context.mock.Link('pg:///narg', __dirname, 'sql')
})

test('initializes correctly', t => {
  const queryDirectory = path.resolve(__dirname, 'sql')
  t.is(t.context.db.url, 'pg:///narg')
  t.is(t.context.db.directory, queryDirectory)
})

test('exposes existence of functions', t => {
  t.plan(1)
  t.context.mock.fn.selectInteger = 42
  return t.context.db.connect(c => {
    t.true('selectInteger' in c)
  })
})

test('executes value function', t => {
  t.context.mock.fn.selectInteger = 43
  return t.context.db
    .connect(c => {
      return c.selectInteger(96)
    })
    .then(i => {
      t.is(i, 43)
    })
})

test('executes a row function', t => {
  t.context.mock.fn.selectIntegerAndString = {number: 42, str: 'abc'}
  return t.context.db
    .connect(c => {
      return c.selectIntegerAndString(42, 'abc')
    })
    .then(r => {
      t.is(r.number, 42)
      t.is(r.str, 'abc')
    })
})

test('executes a table function', t => {
  t.context.mock.fn.selectSeries = [
    {num: 0},
    {num: 1},
    {num: 2},
    {num: 3},
    {num: 4},
    {num: 5},
    {num: 6},
    {num: 7},
    {num: 8}
  ]
  return t.context.db
    .connect(c => {
      return c.selectSeries(8)
    })
    .then(rows => {
      t.true(Array.isArray(rows))
      t.is(rows.length, 9)
      for (let i = 0; i < 9; i++) {
        t.is(rows[i].num, i)
      }
    })
})

test('executes a result function', t => {
  t.context.mock.fn.selectResult = {
    command: 'SELECT',
    rowCount: 9,
    rows: [
      {num: 0},
      {num: 1},
      {num: 2},
      {num: 3},
      {num: 4},
      {num: 5},
      {num: 6},
      {num: 7},
      {num: 8}
    ],
    fields: [{name: 'num'}]
  }
  return t.context.db
    .connect(c => {
      return c.selectResult(8)
    })
    .then(result => {
      t.is(result.command, 'SELECT')
      t.is(result.rowCount, 9)
      t.true(Array.isArray(result.rows))
      t.is(result.rows.length, 9)
      t.true(Array.isArray(result.fields))
      t.is(result.fields.length, 1)
    })
})

test('executes queries in parallel', t => {
  t.context.mock.fn.selectInteger = 3
  return t.context.db
    .all(
      c => c.selectInteger(1),
      c => c.selectInteger(1),
      c => c.selectInteger(1)
    )
    .spread((one, two, three) => {
      t.is(one, 3)
      t.is(two, 3)
      t.is(three, 3)
    })
})

test('executes queries in a transaction', t => {
  const {mock, db} = t.context
  mock.fn.insertN = t => {}
  mock.fn.zeroN = t => {}
  mock.fn.sumN = 42
  return db.txn(one => {
    return one
      .insertN(42)
      .then(() => {
        return db.txn(two => two.zeroN())
      })
      .then(() => {
        return one.sumN()
      })
      .then(sum => {
        t.is(sum, 42)
      })
  })
})

test('automatically rolls back transactions', t => {
  t.context.mock.fn.selectInteger = 2
  t.context.mock.fn.error = t => {
    throw new Error('column "this_column_doesnt_exist" does not exist')
  }
  return t.context.db
    .txn(c => {
      return c
        .error()
        .then(t => {
          return c.selectInteger(2)
        })
        .then(i => {
          t.fail('the promise should be rejected')
        })
    })
    .catch(e => {
      t.is(e.message, 'Mock error() threw error')
      t.is(
        e.cause().message,
        'column "this_column_doesnt_exist" does not exist'
      )
    })
})

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
  t.context.mock.fn.semanticError = () => {
    throw new Error('whiffle')
  }
  return t.context.db.connect(sql => sql.semanticError()).catch(e => {
    t.regex(e.stack, /^QueryFailed: Mock semanticError\(\) threw error\n/)
    t.regex(e.cause().stack, /^Error: whiffle\n/)
  })
})
