const test = require('ava')
const Link = require('../src')
const path = require('path')

const dbUrl = 'pg:///test'
const sourceDir = path.join(__dirname, 'sql')

/*
These tests depend on asserting that stack traces include particular line
numbers. By isolating them, we reduce their exposure to changes in other areas
of the test suite.
*/

test('pg error', t => {
  const db = new Link(dbUrl, sourceDir)
  return db.connect(c => c.semanticError()).catch(e => {
    t.true(e.stack.includes(`${__filename}:16:28`))
  })
})

test('mock error', t => {
  const scope = Link.mock()
  scope.fn.semanticError = () => {
    throw new Error('whiffle')
  }
  const db = new scope.Link(dbUrl, sourceDir)
  return db.connect(c => c.semanticError()).catch(e => {
    t.true(e.stack.includes(`${__filename}:27:28`))
  })
})
