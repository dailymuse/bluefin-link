const test = require('ava')
const pg = require('pg')
const path = require('path')

const Link = require('../src')

const dbUrl = 'pg:///test'
let db

test.cb.before(t => {
  db = new Link(dbUrl, __dirname, 'sql')
  pg.connect(dbUrl, (err, client, close) => {
    if (err) return t.end(err)
    client.query(
      'CREATE TABLE IF NOT EXISTS _database_test (n integer)',
      err => {
        if (err) return t.end(err)
        close()
        t.end()
      }
    )
  })
})

test.cb.after(t => {
  pg.connect(dbUrl, (err, client, close) => {
    if (err) return t.end(err)
    client.query('DROP TABLE _database_test', err => {
      if (err) return t.end(err)
      close()
      t.end()
    })
  })
})

test('pg initializes correctly', t => {
  const queryDirectory = path.resolve(__dirname, 'sql')
  t.is(db.url, dbUrl)
  t.is(db.directory, queryDirectory)
})

test('pg exposes existence of functions', t => {
  return db.connect(c => {
    t.true('selectInteger' in c)
  })
})

test('pg executes value function', t => {
  return db
    .connect(c => {
      return c.selectInteger(42)
    })
    .then(i => {
      t.is(i, 42)
    })
})

test('pg executes a row function', t => {
  return db
    .connect(c => {
      return c.selectIntegerAndString(42, 'abc')
    })
    .then(r => {
      t.is(r.number, 42)
      t.is(r.str, 'abc')
    })
})

test('pg executes a table function', t => {
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

test('pg executes a result function', t => {
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

test('pg executes queries in parallel', t => {
  return db
    .all(
      c => c.selectInteger(1),
      c => c.selectInteger(2),
      c => c.selectInteger(3),
      c => c.selectInteger(4)
    )
    .spread((one, two, three, four) => {
      t.is(one, 1)
      t.is(two, 2)
      t.is(three, 3)
      t.is(four, 4)
    })
})

test('pg executes queries in a transaction', t => {
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

test('pg automatically rolls back transactions', t => {
  return db
    .txn(c => {
      return c
        .error()
        .then(() => {
          return c.selectInteger(2)
        })
        .then(i => {
          t.fail('should have thrown an exception')
        })
    })
    .catch(e => {
      t.is(e.message, 'column "this_column_does_not_exist" does not exist')
    })
})

test('pg includes the error name and message in the stack', t => {
  return db.connect(sql => sql.semanticError()).catch(e => {
    t.regex(e.stack, /^QueryFailed: invalid reference/)
  })
})
