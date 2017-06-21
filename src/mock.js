'use strict'

const Promise = require('bluebird')

const BaseStrategy = require('./base')
const failed = require('./failed')
const log = require('./log')
const time = require('./time')

class MockStrategy extends BaseStrategy {
  constructor (url, directory, mocks) {
    super(url, directory)
    this.mocks = mocks
  }

  createDisposer () {
    var id
    return this.genId()
      .then(_id => {
        id = _id
        log.info('mock connected', this.desc({'connection-id': id}))
        return {_id: id}
      })
      .disposer(() => {
        // no actual resources to clean up
        log.info('mock disconnnecting', {'connection-id': id})
      })
  }

  createMethod (name, meta, text) {
    const log = this.createLogQueryFn(meta)
    const checkResult = this.createCheckResultFn(meta)
    const mocks = this.mocks
    const method = function () {
      const elapsed = time.start()
      const parameters = [...arguments]
      const context = {parameters}
      Object.assign(context, meta)
      Error.captureStackTrace(context, method)

      // make sure we have a mock for this query
      if (!(name in mocks)) {
        throw new Error(`no mock for method ${name}`)
      }

      const mock = mocks[name]

      return new Promise((resolve, reject) => {
        process.nextTick(() => {
          let result = mock
          log(this._id, elapsed, parameters)
          if (typeof mock === 'function') {
            try {
              result = mock.apply(this, parameters)
            } catch (mockError) {
              var e = failed.query(
                `Mock ${name}() threw error`,
                mockError,
                context
              )
              return reject(e)
            }
          }
          checkResult(result, context, resolve, reject)
        })
      })
    }
    return method
  }

  createCheckResultFn (meta) {
    return function (result, context, resolve, reject) {
      const fail = msg =>
        reject(failed.query(msg, new Error('Result check failed'), context))

      if (meta.return === 'table') {
        if (!(result instanceof Array)) {
          return fail('mock does not return a table')
        }
        for (let ea of result) {
          if (typeof ea !== 'object') {
            return fail('mock does not return rows')
          }
        }
      } else if (meta.return === 'row') {
        // if no rows were returned, undefined is legit
        if (result === undefined) return resolve(result)

        // if we're looking for row, null is not a valid value
        if (result === null) return fail('mock returns null, not a row')

        // if it's some scalar value, that's also wrong
        if (typeof result !== 'object') {
          return fail('mock does not return a row')
        }

        // check columns
        if (Object.keys(result).length < 1) {
          return fail('mock row should have at least one column')
        }
      }

      // if we made it here, the mock is fine
      return resolve(result)
    }
  }

  createTxnMethod (sql) {
    const msg = sql.toLowerCase()
    return function () {
      log.info(msg, {'connection-id': this._id})
      return new Promise((resolve, reject) => {
        process.nextTick(() => {
          resolve()
        })
      })
    }
  }
}

class MockNotifier {
  constructor (emitter) {
    this._emitter = emitter
  }

  close () {}

  emit (eventName, ...args) {
    const payload = args
    return new Promise((resolve, reject) => {
      process.nextTick(() => {
        try {
          log.info('notify', {eventName, payload})
          this._emitter.emit(...arguments)
          resolve()
        } catch (e) {
          reject(e)
        }
      })
    })
  }
}

;[
  'eventNames',
  'getMaxListeners',
  'listenerCount',
  'listeners',
  'setMaxListeners'
].forEach(name => {
  MockNotifier.prototype[name] = function () {
    return this._emitter[name](...arguments)
  }
})
;[
  'addListener',
  'on',
  'once',
  'prependListner',
  'prependOnceListner'
].forEach(name => {
  const method = function (eventName, listener) {
    this._emitter[name](eventName, listener)
    return new Promise((resolve, reject) => {
      process.nextTick(() => {
        log.info('listen', {eventName, url: this.url})
        resolve()
      })
    })
  }
  MockNotifier.prototype[name] = method
})
;['removeAllListeners', 'removeListener'].forEach(name => {
  const method = function (eventName, listener) {
    this._emitter[name](eventName, listener)
    return new Promise((resolve, reject) => {
      process.nextTick(() => {
        log.info('unlisten', {eventName, url: this.url})
        resolve()
      })
    })
  }
  MockNotifier.prototype[name] = method
})

module.exports = {MockStrategy, MockNotifier}
