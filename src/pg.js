'use strict'

const crypto = require('crypto')
const Promise = require('bluebird')
const pg = require('pg')
const pretry = require('promise-retry')

const failed = require('./failed')
const time = require('./time')
const BaseStrategy = require('./base')

const pools = {}

class PgStrategy extends BaseStrategy {
  static disconnect () {
    const vows = []
    for (let url in pools) {
      vows.push(pools[url].end())
      delete pools[url]
    }
    return Promise.all(vows)
  }

  get poolKey () {
    const hash = new crypto.Hash('md5')
    hash.update(JSON.stringify(this.options))
    return hash.digest('base64')
  }

  getPool () {
    const key = this.poolKey
    if (key in pools) return pools[key]

    const poolOpts = Object.assign(
      {
        connectionTimeoutMillis: 30000,
        Promise
      },
      this.options
    )
    const p = new pg.Pool(poolOpts)
    p.on('error', e => this.log.error(e))
    pools[key] = p

    return p
  }

  connect () {
    var txnEnd
    var failures = []

    const idvow = this.genId()
    const pool = this.getPool()
    const dimensions = {host: this.options.host, callsite: this.formatCallSite()}
    const info = (id, ms) => {
      const info = {clients: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount}
      if (id !== undefined) info['connection-id'] = id
      if (ms !== undefined) info.ms = ms
      return Object.assign(info, dimensions)
    }

    const connectEnd = this.tally.begin('pg.connect.duration')

    const retryOpts = Object.assign({randomize: true, maxTimeout: 8000}, this.options)
    const cvow = pretry(retryOpts, retry => {
      this.log.info('connecting', info())
      return pool.connect().catch(err => {
        failures.push(err.message)
        retry(err)
      })
    }).catch(err => {
      const context = Object.assign(retryOpts, {attempts: failures.length, messages: failures})
      context.ms = connectEnd(info()) * 1e-3
      throw failed.connection(err, context)
    })

    return Promise.join(idvow, cvow, (_id, _client) => {
      const ms = connectEnd(dimensions) * 1e-3
      this.log.info('connected', info(_id, ms))
      this.tally.count('pg.connect.retries', failures.length, dimensions)
      txnEnd = this.tally.begin('pg.connection.duration')
      return {_id, _client, _log: this.log}
    }).disposer(connection => {
      const ms = txnEnd(dimensions) * 1e-3
      connection._client.release()
      this.log.info('disconnected', info(connection._id, ms))
    })
  }

  disconnect () {
    const key = this.poolKey
    if (!(key in pools)) return Promise.resolve()
    const pool = pools[key]
    delete pools[key]
    return pool.end()
  }

  createMethod (name, meta, text) {
    var fn
    switch (meta.return) {
      case 'value':
        fn = r => {
          for (let p in r.rows[0]) {
            return r.rows[0][p]
          }
        }
        break
      case 'row':
        fn = r => (r.rows[0] ? Object.assign({}, r.rows[0]) : r.rows[0])
        break
      case 'table':
        fn = r => r.rows.map(ea => (ea ? Object.assign({}, ea) : ea))
        break
      case undefined:
        fn = result => result
        break
      default:
        throw new Error('Unrecognized return kind', meta.return)
    }
    return this.createMethodWithCallback(name, meta, text, fn)
  }

  createMethodWithCallback (name, meta, text, extract) {
    const logQuery = this.createLogQueryFn(name, meta)
    const {options, tally} = this
    const method = function () {
      const queryEnd = tally.begin('pg.query.duration')
      const args = [...arguments].map(format)
      const context = {arguments: args}
      Object.assign(context, meta)
      Error.captureStackTrace(context, method)

      // query() will return a native Promise, but we want a bluebird promise,
      // so we call query() with a callback and convert it to a promise
      return Promise.fromCallback(cb => this._client.query(text, args, cb))
        .then(result => {
          const microseconds = queryEnd({host: options.host, query: name})
          logQuery(this._id, microseconds, args)
          return extract(result)
        })
        .catch(pgError => {
          var e = failed.query(pgError, context)
          this._log.error(e)
          throw e
        })
    }

    return method
  }

  createTxnMethod (sql) {
    // query() will return a native Promise, but we want a bluebird promise,
    // so we call query() with a callback and convert it to a promise
    return function () {
      this._log.info(sql, {'connection-id': this._id})
      return Promise.fromCallback(cb => this._client.query(sql, cb))
    }
  }
}

module.exports = PgStrategy

function format (v) {
  if (v === null || v === undefined) return null
  else if (v instanceof Array) return v.map(format)
  else if (v instanceof Buffer) return '\\x' + v.toString('hex')
  else if (typeof v.toSql === 'function') return format(v.toSql())
  else return v
}
