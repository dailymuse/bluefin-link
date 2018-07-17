'use strict'

const Promise = require('bluebird')

const BaseStrategy = require('./base')

class MockStrategy extends BaseStrategy {
  constructor (options, mocks) {
    super(options)
    this.mocks = mocks
  }

  connect () {
    const connectEnd = this.log.begin('mock.connect.duration')
    var txnEnd
    return this.genId()
      .then(_id => {
        connectEnd({host: this.options.host})
        this.log.count('mock.connect.retries', 0, {host: this.options.host})
        txnEnd = this.log.begin('mock.connection.duration')
        return {_id, _log: this.log}
      })
      .disposer(() => {
        txnEnd({host: this.options.host})
      })
  }

  createMethod (name, meta, text) {
    const logQuery = this.createLogQueryFn(name, meta)
    const checkResult = this.createCheckResultFn(name, meta)
    const {options, mocks, log} = this
    const method = function () {
      const queryEnd = log.begin('mock.query.duration')
      const args = [...arguments]
      const context = {arguments: args}
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
          const microseconds = queryEnd({host: options.host, query: name})
          logQuery(this._id, microseconds, args)
          if (typeof mock === 'function') {
            try {
              result = mock.apply(this, args)
            } catch (e) {
              log.fail(`mock ${name}() threw error`, e, context)
              return reject(e)
            }
          }
          checkResult(result, context, resolve, reject)
        })
      })
    }
    return method
  }

  createCheckResultFn (name, meta) {
    const log = this.log
    return function (result, context, resolve, reject) {
      const fail = msg => {
        const cause = new Error(msg)
        cause.context = {result}
        log.fail('incorrect result from mock', cause, context)
        reject(cause)
      }

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
    return function () {
      this._log.info(sql, {'connection-id': this._id})
      return new Promise((resolve, reject) => {
        process.nextTick(() => {
          resolve()
        })
      })
    }
  }
}

module.exports = MockStrategy
