'use strict'

const test = require('ava')
const pg = require('pg')

const Link = require('../src')

const dbUrl = 'pg:///test'
const db = new Link(dbUrl, __dirname, 'sql')

let int8Parser

class Custom {
  constructor (buf) {
    this.buf = buf
  }

  toSql () {
    return `\\x${this.buf.toString('hex')}`
  }
}

test.before(t => {
  Link.useRealConnections()
})

test.serial('materializes counts as int', t => {
  int8Parser = pg.types.getTypeParser(20)
  Link.parseInt8AsJsNumber()
  return db
    .connect(sql => sql.selectCount())
    .then(val => t.is(val, 1))
    .then(() => pg.types.setTypeParser(20, int8Parser))
})

test('serializes custom objects with toSql()', t => {
  const obj = new Custom(Buffer.alloc(12))
  return db.connect(sql => sql.selectString(obj)).then(str => {
    t.is(str, '\\x000000000000000000000000')
  })
})

test('serializes outgoing arrays of objects with toSql()', t => {
  const obj1 = new Custom(Buffer.from('052ca97b5800000040000001', 'hex'))
  const obj2 = new Custom(Buffer.from('052ca97b5800000040000002', 'hex'))
  return db.connect(sql => sql.selectString([obj1, obj2])).then(str => {
    t.is(
      str,
      '{"\\\\x052ca97b5800000040000001","\\\\x052ca97b5800000040000002"}'
    )
  })
})
