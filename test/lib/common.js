const path = require('path')

const sourceDir = path.join(__dirname, '..', 'sql')

module.exports = test => {
  test('initializes correctly', t => {
    t.is(t.context.db.options.database, 'test')
    t.is(t.context.db.directory, sourceDir)
  })

  test('exposes existence of functions', t => {
    t.plan(1)
    t.context.Link.fn.selectInteger = 42
    return t.context.db.connect(c => {
      t.true('selectInteger' in c)
    })
  })

  test('executes value function', t => {
    t.context.Link.fn.selectInteger = 43
    return t.context.db
      .connect(c => {
        return c.selectInteger(43)
      })
      .then(i => {
        t.is(i, 43)
      })
  })

  test('executes a row function', t => {
    t.context.Link.fn.selectIntegerAndString = { number: 42, str: 'abc' }
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
    t.context.Link.fn.selectSeries = [
      { num: 0 },
      { num: 1 },
      { num: 2 },
      { num: 3 },
      { num: 4 },
      { num: 5 },
      { num: 6 },
      { num: 7 },
      { num: 8 }
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
    t.context.Link.fn.selectResult = {
      command: 'SELECT',
      rowCount: 9,
      rows: [
        { num: 0 },
        { num: 1 },
        { num: 2 },
        { num: 3 },
        { num: 4 },
        { num: 5 },
        { num: 6 },
        { num: 7 },
        { num: 8 }
      ],
      fields: [{ name: 'num' }]
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
    t.context.Link.fn.selectInteger = 3
    return t.context.db
      .all(c => c.selectInteger(3), c => c.selectInteger(3), c => c.selectInteger(3))
      .spread((one, two, three) => {
        t.is(one, 3)
        t.is(two, 3)
        t.is(three, 3)
      })
  })

  test('executes queries in a transaction', t => {
    const { Link, db } = t.context
    Link.fn.insertN = () => {}
    Link.fn.zeroN = () => {}
    Link.fn.sumN = 42
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
    const { db, Link } = t.context
    Link.fn.error = () => {
      throw new Error('column "this_column_doesnt_exist" does not exist')
    }
    return t.context.db
      .txn(c => {
        return c
          .error()
          .then(() => {
            return c.selectInteger(2)
          })
          .then(i => {
            t.fail('the promise should be rejected')
          })
      })
      .catch(e => {
        t.is(e.effect.context.source, `${db.directory}/error.sql`)
      })
  })

  test('QueryFailed includes context', t => {
    const { db, Link } = t.context

    Link.fn.errorWithArguments = () => {
      throw new Error('whiffle')
    }
    return db.connect(c => c.errorWithArguments(42, 21, 96)).catch(e => {
      const effect = e.effect
      t.true('context' in effect)
      t.deepEqual(effect.context.arguments, [42, 21, 96])
      t.is(effect.context.return, 'row')
      t.true(effect.context.source.includes(`${sourceDir}/errorWithArguments.sql`))
    })
  })

  test('returns a bluebird promise', t => {
    t.context.Link.fn.selectInteger = 43
    return t.context.db.connect(c => c.selectInteger(43).return(6)).then(val => t.is(val, 6))
  })
}
