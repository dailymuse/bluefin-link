const test = require('ava')
const PgLink = require('../src')
const StubTally = require('./lib/tally')

test('mock sends query metrics to a custom tally', t => {
  const tally = new StubTally()
  const Link = PgLink.mock()
  Link.fn.selectInteger = 42
  Link.tally = tally
  const db = new Link('pg:///test', __dirname, 'sql')
  return db.connect(sql => sql.selectInteger(1)).then(() => {
    t.is(tally.metrics.length, 4)
    for (let o of tally.metrics) {
      t.is(o.dimensions.host, 'localhost')
    }

    t.is(tally.metrics[0].name, 'mock.connect.duration')
    t.is(tally.metrics[0].kind, 'magnitude')

    t.is(tally.metrics[1].name, 'mock.connect.retries')
    t.is(tally.metrics[1].kind, 'count')

    t.is(tally.metrics[2].name, 'mock.query.duration')
    t.is(tally.metrics[2].kind, 'magnitude')
    t.is(tally.metrics[2].dimensions.query, 'selectInteger')

    t.is(tally.metrics[3].name, 'mock.connection.duration')
    t.is(tally.metrics[2].kind, 'magnitude')
  })
})

test('pg sends query metrics to a custom tally', t => {
  const tally = new StubTally()
  PgLink.tally = tally
  const db = new PgLink('pg:///test', __dirname, 'sql')
  return db.connect(sql => sql.selectInteger(1)).then(() => {
    t.is(tally.metrics.length, 4)
    for (let o of tally.metrics) {
      t.is(o.dimensions.host, 'localhost')
    }

    t.is(tally.metrics[0].name, 'pg.connect.duration')
    t.is(tally.metrics[0].kind, 'magnitude')

    t.is(tally.metrics[1].name, 'pg.connect.retries')
    t.is(tally.metrics[1].kind, 'count')

    t.is(tally.metrics[2].name, 'pg.query.duration')
    t.is(tally.metrics[2].kind, 'magnitude')
    t.is(tally.metrics[2].dimensions.query, 'selectInteger')

    t.is(tally.metrics[3].name, 'pg.connection.duration')
    t.is(tally.metrics[2].kind, 'magnitude')
  })
})
