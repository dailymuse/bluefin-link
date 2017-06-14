const test = require('ava')
const Link = require('../src')

test('requires a URL', t => {
  function ctorWithNoParameters () {
    return new Link()
  }

  t.throws(ctorWithNoParameters, Error)
})

test('requires at least one path segment', t => {
  function ctorWithNoPath () {
    return new Link(dbUrl)
  }

  t.throws(ctorWithNoPath, Error)
})

test('requires the query directory to exist', t => {
  function ctorWithFakePath () {
    return new Link(dbUrl, __dirname, 'does-not-exist')
  }

  t.throws(ctorWithFakePath, Error)
})
