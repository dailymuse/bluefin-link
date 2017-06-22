'use strict'

const Promise = require('bluebird')
const EventEmitter = require('events')
const pg = require('pg')

const failed = require('./failed')
const log = require('./log')
const time = require('./time')
const BaseStrategy = require('./base')

class PgStrategy extends BaseStrategy {
  createDisposer () {
    var close
    var id
    var txnTimeMs

    const connectTimeMs = time.start()
    const idvow = this.genId()
    const cvow = new Promise((resolve, reject) => {
      pg.connect(this.url, (err, client, done) => {
        if (err) reject(err)
        resolve([client, done])
      })
    })
      .timeout(30000, 'Timed out attempting to connect to database')
      .catch(e => {
        if (e.message === 'Timed out attempting to connect to database') {
          pg.end()
        }
        return Promise.reject(e)
      })

    return Promise.join(idvow, cvow, (_id, [_client, _close]) => {
      id = _id
      close = _close

      const ms = connectTimeMs()
      log.info('pg connected', this.desc({'connection-id': id, ms}))

      txnTimeMs = time.start()
      return {_id, _client}
    }).disposer(() => {
      const ms = txnTimeMs()
      log.info('pg disconnecting', {'connection-id': id, ms})
      if (close) close()
    })
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

  createMethodWithCallback (name, meta, text, end) {
    const logQuery = this.createLogQueryFn(meta)
    const method = function () {
      const elapsed = time.start()
      const args = [...arguments].map(format)
      const context = {arguments: args}
      Object.assign(context, meta)
      Error.captureStackTrace(context, method)

      return new Promise((resolve, reject) => {
        const query = this._client.query(text, args)

        query.on('error', pgError => {
          var e = failed.query(pgError.message, pgError, context)
          log.error(e)
          reject(e)
        })

        query.on('row', (row, result) => result.addRow(row))

        query.on('end', result => {
          logQuery(this._id, elapsed, args)
          resolve(end(result))
        })
      })
    }
    return method
  }

  createTxnMethod (sql) {
    const msg = sql.toLowerCase()
    return function () {
      return new Promise((resolve, reject) => {
        log.info(msg, {'connection-id': this._id})
        this._client.query(sql, err => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
    }
  }
}

module.exports = PgStrategy

function format (v) {
  if (v instanceof Array) {
    return v.map(format)
  } else if (v instanceof Buffer) {
    return '\\x' + v.toString('hex')
  } else if (typeof v.toSql === 'function') {
    return v.toSql()
  } else {
    return v
  }
}
