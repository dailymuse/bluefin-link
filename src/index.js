'use strict'

const fs = require('fs')
const path = require('path')
const Promise = require('bluebird')
const pg = require('pg')

const {MockStrategy, MockNotifier} = require('./mock.js')
const {PgStrategy, PgNotifier} = require('./pg.js')

const instances = []

class Link {
  static parseInt8AsJsNumber () {
    // this can lead to numerical errors for values greater than 2^32, because
    // JavaScript will use floats, which are not exact. However, int8 is the
    // type returned by COUNT(), which pg will return as a string by default.
    pg.types.setTypeParser(20, parseInt)
  }

  static useRealConnections () {
    for (let i of instances) {
      i.adoptStrategy(PgStrategy)
      i.adoptNotifier(PgNotifier)
    }
    delete this.mock
  }

  static mockAllConnections () {
    for (let i of instances) {
      i.adoptStrategy(MockStrategy)
      i.adoptNotifier(MockNotifier)
    }
    this.mock = MockStrategy.mock
  }

  static clearAllMocks () {
    this.mock = MockStrategy.mock = {}
  }

  static testWithMocks () {
    before(() => {
      this.mockAllConnections()
    })

    beforeEach(() => {
      this.clearAllMocks()
    })
  }

  constructor (url) {
    if (url === undefined) throw new Error('No Link specified')
    if (arguments.length < 2) throw new Error('No query directory specified')

    const args = Array.prototype.slice.call(arguments, 1)
    const directory = path.resolve.apply(path, args)
    fs.accessSync(directory, fs.R_OK)

    if (Link.mock) {
      this.strategy = new MockStrategy(url, directory)
      this.notifier = new MockNotifier(url)
    } else {
      this.strategy = new PgStrategy(url, directory)
      this.notifier = new PgNotifier(url)
    }

    instances.push(this)
  }

  get url () {
    return this.strategy.url
  }

  get directory () {
    return this.strategy.directory
  }

  adoptStrategy (Strategy) {
    this.strategy = new Strategy(this.url, this.directory)
  }

  adoptNotifier (Notifier) {
    if (this.notifier) this.notifier.close()
    this.notifier = new Notifier(this.url)
  }

  connect (fn) {
    const disposer = this.strategy.createDisposer()
    return Promise.using(disposer, target => {
      const handler = new Handler(this.strategy)
      const proxy = new Proxy(target, handler)
      return fn(proxy)
    })
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
        .then(
          result => c.commit().return(result),
          err => c.rollback().throw(err)
        )
    })
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

module.exports = Link
