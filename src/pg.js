'use strict'

const crypto = require('crypto')
const Promise = require('bluebird')
const pg = require('pg')
const pretry = require('promise-retry')

const BaseStrategy = require('./base')

const pools = {}
const ignoreProperties = ['name', 'severity', 'file', 'line', 'routine']

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

  getPool (log) {
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
    p.on('error', e => log.error(e))
    pools[key] = p

    return p
  }

  connect (log) {
    var txnEnd
    var failures = []

    const idvow = this.genId()
    const pool = this.getPool(log)
    const dimensions = {host: this.options.host}
    const context = {}
    this.addCallsite(log, context)
    const info = (id, ms) => {
      const info = {clients: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount}
      if (id !== undefined) info['connection-id'] = id
      if (ms !== undefined) info.ms = ms
      return Object.assign(info, context, dimensions)
    }

    const connectEnd = log.begin('pg.connect.duration')

    const retryOpts = Object.assign({randomize: true, maxTimeout: 8000}, this.options)
    const cvow = pretry(retryOpts, retry => {
      log.debug('connecting', info())
      return pool.connect().catch(err => {
        failures.push(err.message)
        retry(err)
      })
    }).catch(err => {
      const context = Object.assign(retryOpts, {attempts: failures.length, messages: failures})
      context.ms = connectEnd(info()) * 1e-3
      log.fail('Failed to connect to database', err, context)
      throw err
    })

    return Promise.join(idvow, cvow, (_id, _client) => {
      const ms = connectEnd(dimensions) * 1e-3
      log.debug('connected', info(_id, ms))
      log.count('pg.connect.retries', failures.length, dimensions)
      txnEnd = log.begin('pg.connection.duration')
      return {_id, _client, _log: log}
    }).disposer(connection => {
      const ms = txnEnd(dimensions) * 1e-3
      connection._client.release()
      connection._log.debug('disconnected', info(connection._id, ms))
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
    const {addCallsite, logQuery, options} = this
    const method = function (...args) {
      const queryEnd = this._log.begin('pg.query.duration')
      args = args.map(format)
      const context = Object.assign({arguments: args}, meta)
      addCallsite(this._log, context)
      Error.captureStackTrace(context, method)

      // query() will return a native Promise, but we want a bluebird promise,
      // so we call query() with a callback and convert it to a promise
      return Promise.fromCallback(cb => this._client.query(text, args, cb))
        .then(result => {
          const microseconds = queryEnd({host: options.host, query: name})
          logQuery(this, meta, context, microseconds)
          return extract(result)
        })
        .catch(opErr => {
          const cause = rebuildError(opErr.cause)
          throw this._log.fail('query failed', cause, context)
        })
    }

    return method
  }

  createTxnMethod (sql) {
    return function () {
      const context = {'connection-id': this._id, callsite: undefined}
      this._log.info(sql, context)

      // query() will return a native Promise, but we want a bluebird promise,
      // so we call query() with a callback and convert it to a promise
      return new Promise((resolve, reject) => {
        this._client.query(sql, (err, val) => {
          if (err) reject(rebuildError(err))
          else resolve(val)
        })
      })
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

function rebuildError (pge) {
  const error = new Error(pge.message)
  error.stack = pge.stack.replace('error: ', 'Error: ')
  error.context = {}
  for (let p in pge) {
    if (ignoreProperties.includes(p)) continue
    if (pge[p] === undefined) continue
    if (p === 'position') {
      error.context[p] = parseInt(pge[p])
    } else {
      error.context[p] = pge[p]
    }
  }
  return error
}
