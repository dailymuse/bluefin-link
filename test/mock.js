const test = require('ava')
const path = require('path')

const Link = require('../src')
let db

test.before(t => {
  db = new Link('pg:///narg', __dirname, 'sql')
  Link.mockAllConnections()
})

test.beforeEach(t => {
  Link.clearAllMocks()
})

test('initializes correctly', t => {
  const queryDirectory = path.resolve(__dirname, 'sql')
  t.is(db.url, 'pg:///narg')
  t.is(db.directory, queryDirectory)
})

test.serial('exposes existence of functions', t => {
  t.plan(1)
  Link.mock.selectInteger = 42
  return db.connect(c => {
    t.true('selectInteger' in c)
  })
})

test.serial('executes value function', t => {
  Link.mock.selectInteger = 43
  return db
    .connect(c => {
      return c.selectInteger(96)
    })
    .then(i => {
      t.is(i, 43)
    })
})

test.serial('executes a row function', t => {
  Link.mock.selectIntegerAndString = {number: 42, str: 'abc'}
  return db
    .connect(c => {
      return c.selectIntegerAndString(42, 'abc')
    })
    .then(r => {
      t.is(r.number, 42)
      t.is(r.str, 'abc')
    })
})

test.serial('executes a table function', t => {
  Link.mock.selectSeries = [
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
  return db
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

test.serial('executes a result function', t => {
  Link.mock.selectResult = {
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
  return db
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

test.serial('executes queries in parallel', t => {
  Link.mock.selectInteger = 3
  return db
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

test.serial('executes queries in a transaction', t => {
  Link.mock.insertN = t => {}
  Link.mock.zeroN = t => {}
  Link.mock.sumN = 42
  return db.txn(one => {
    return one
      .insertN(42)
      .then(t => {
        return db.txn(two => two.zeroN())
      })
      .then(t => {
        return one.sumN()
      })
      .then(sum => {
        t.is(sum, 42)
      })
  })
})

test.serial('automatically rolls back transactions', t => {
  Link.mock.selectInteger = 2
  Link.mock.error = t => {
    throw new Error('column "this_column_doesnt_exist" does not exist')
  }
  return db
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

test.serial('rejects a table mock that is not an array', t => {
  Link.mock.selectSeries = 42
  return db.connect(sql => sql.selectSeries(8)).catch(e => {
    t.is(e.name, 'QueryFailed')
    t.is(e.message, 'mock does not return a table')
  })
})

test.serial('rejects a table mock that does not contain rows', t => {
  Link.mock.selectSeries = [42]
  return db.connect(sql => sql.selectSeries(8)).catch(e => {
    t.is(e.name, 'QueryFailed')
    t.is(e.message, 'mock does not return rows')
  })
})

test.serial('rejects a row mock that does not return a row', t => {
  Link.mock.selectIntegerAndString = 42
  return db.connect(sql => sql.selectIntegerAndString(8)).catch(e => {
    t.is(e.name, 'QueryFailed')
    t.is(e.message, 'mock does not return a row')
  })
})

test.serial('rejects a row mock that returns a row with no columns', t => {
  Link.mock.selectIntegerAndString = {}
  return db.connect(sql => sql.selectIntegerAndString(8)).catch(e => {
    t.is(e.name, 'QueryFailed')
    t.is(e.message, 'mock row should have at least one column')
  })
})

test.serial('accepts a undefined mock row', t => {
  Link.mock.selectIntegerAndString = undefined
  return db
    .connect(sql => sql.selectIntegerAndString(8))
    .then(
      row => t.true(row === undefined),
      e => t.fail('promise must not be rejected')
    )
})

test.serial('includes the error name and message in the stack', t => {
  Link.mock.semanticError = () => {
    throw new Error('whiffle')
  }
  return db.connect(sql => sql.semanticError()).catch(e => {
    t.regex(e.stack, /^QueryFailed: Mock semanticError\(\) threw error\n/)
    t.regex(e.cause().stack, /^Error: whiffle\n/)
  })
})
