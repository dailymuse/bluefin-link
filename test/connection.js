const test = require('ava')

const PgLink = require('../src')
const options = {
  connectionString: 'pg://localhost:5430/test',
  connectionTimeoutMillis: 3,
  retries: 2,
  randomize: false,
  minTimeout: 1,
  maxTimeout: 10
}

test('connect rejects when connection fails', t => {
  const db = new PgLink(options, __dirname, 'sql')
  const vow = db.connect(sql => {})
  vow.catch(err => {
    t.is(err.effect.message, 'Failed to connect to database')
    t.is(err.effect.context.attempts, 3)
    t.is(err.effect.context.messages.length, 3)
    for (let m of err.effect.context.messages) {
      t.true(typeof m === 'string')
    }
  })
  return t.throws(vow)
})
