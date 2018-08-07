const fs = require('fs')
const path = require('path')
const Promise = require('bluebird')
const pg = require('pg')

const DebugLog = require('./log')
const MockStrategy = require('./mock.js')
const PgStrategy = require('./pg.js')

const checkLinkArgs = (options, segments, cb) => {
  if (segments.length < 1) throw new Error('No query directory specified')

  options = typeof options === 'string' ? {connectionString: options} : options
  if (options.connectionString === undefined) {
    throw new Error('No url specified')
  }

  options.directory = path.resolve.apply(path, segments)
  fs.accessSync(options.directory, fs.R_OK)
  return options
}

class Link {
  static parseInt8AsJsNumber () {
    // this can lead to numerical errors for values greater than 2^32, because
    // JavaScript will use floats, which are not exact. However, int8 is the
    // type returned by COUNT(), which pg will return as a string by default.
    pg.types.setTypeParser(20, parseInt)
  }

  static disconnect () {
    return PgStrategy.disconnect()
  }

  constructor (strategy) {
    this.strategy = strategy
    this.log = this.constructor.log
  }

  get options () {
    return this.strategy.options
  }

  get directory () {
    return this.strategy.directory
  }

  connect (fn) {
    const disposer = this.strategy.connect(this.log)
    return Promise.using(disposer, connection => {
      const handler = new Handler(this.strategy)
      const proxy = new Proxy(connection, handler)
      return fn(proxy)
    })
  }

  disconnect () {
    return this.strategy.disconnect()
  }

  all () {
    const results = [...arguments].map(ea => this.connect(ea))
    return Promise.all(results)
  }

  txn (fn) {
    return this.connect(c => {
      return c
        .begin()
        .then(() => Promise.try(fn, c))
        .then(result => c.commit().return(result), err => c.rollback().throw(err))
    })
  }
}

Link.log = new DebugLog()

class PgLink extends Link {
  static mock () {
    const MockLink = class extends Link {
      static clearMocks () {
        for (let name of Object.keys(this.fn)) {
          delete this.fn[name]
        }
      }

      constructor (options, ...segments) {
        options = checkLinkArgs(options, segments)
        const strategy = new MockStrategy(options, MockLink.fn)
        super(strategy)
      }
    }
    MockLink.fn = {}
    if ('log' in PgLink) MockLink.log = PgLink.log
    return MockLink
  }

  constructor (options, ...segments) {
    options = checkLinkArgs(options, segments)
    super(new PgStrategy(options))
  }
}

class Handler {
  constructor (strategy) {
    this.strategy = strategy
  }

  has (target, name) {
    if (name in target) return true
    if (this.strategy.hasMethod(name)) return true
    this.strategy.create(name)
    return this.strategy.hasMethod(name)
  }

  get (target, name) {
    if (name in target) return target[name]
    if (name in this.strategy.methods) return this.strategy.methods[name]
    return this.strategy.create(name)
  }
}

module.exports = PgLink
