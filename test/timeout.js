const test = require('ava')
const pg = require('pg')
const path = require('path')
const sinon = require('sinon')

const Link = require('../src')

const dbUrl = 'pg:///test'
let db
let clock

test.before(t => {
  clock = sinon.useFakeTimers()
  sinon.stub(pg, 'connect')
  db = new Link(dbUrl, __dirname, 'sql')
})

test.after(t => {
  clock.restore()
  pg.connect.restore()
})

test('times out after 30 seconds trying to connect', t => {
  t.plan(1)
  const vow = db
    .connect(c => c.selectInteger(42))
    .then(i => t.fail('query must not succeed'))
    .catch(e => {
      t.is(e.message, 'Timed out attempting to connect to database')
    })
  clock.tick(30000)
  return vow
})
