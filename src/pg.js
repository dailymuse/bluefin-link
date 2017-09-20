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
    pools[key] = p
    return p
  }

  connect () {
    var txnTimeMs

    const connectTimeMs = time.start()
    const idvow = this.genId()
    const pool = this.getPool()

    const retryOpts = Object.assign({randomize: true}, this.options)
    const cvow = pretry(retryOpts, (retry, count) => {
      if (count > 1) this.log.info('retrying database connection', {count})
      return pool.connect().catch(retry)
    })

    return Promise.join(idvow, cvow, (_id, _client) => {
      const ms = connectTimeMs()
      this.log.info('pg connected', this.desc({'connection-id': _id, ms}))
      txnTimeMs = time.start()
      return {_id, _client, _log: this.log}
    }).disposer(connection => {
      const ms = txnTimeMs()
      this.log.info('pg disconnecting', {'connection-id': connection._id, ms})
      connection._client.release()
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
        fn = r => r.rows[0]
        break
      case 'table':
        fn = r => r.rows
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
    const logQuery = this.createLogQueryFn(meta)
    const method = function () {
      const elapsed = time.start()
      const args = [...arguments].map(format)
      const context = {arguments: args}
      Object.assign(context, meta)
      Error.captureStackTrace(context, method)
      return this._client
        .query(text, args)
        .then(result => {
          logQuery(this._id, elapsed, args)
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
