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
      const parameters = [...arguments].map(format)
      const context = {parameters}
      Object.assign(context, meta)
      Error.captureStackTrace(context, method)

      return new Promise((resolve, reject) => {
        const query = this._client.query(text, parameters)

        query.on('error', pgError => {
          var e = failed.query(pgError.message, pgError, context)
          log.error(e)
          reject(e)
        })

        query.on('row', (row, result) => result.addRow(row))

        query.on('end', result => {
          logQuery(this._id, elapsed, parameters)
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

class PgNotifier {
  constructor (url) {
    this._url = url
    this._client = null
    this._emitter = new EventEmitter()
  }

  _ensureClient () {
    if (this._client) return Promise.resolve()
    this._client = new pg.Client(this._url)
    this._client.on('notification', msg => {
      const payload = JSON.parse(msg.payload)
      this._emitter.emit(msg.channel, ...payload)
    })
    return Promise.fromCallback(cb => this._client.connect(cb))
  }

  _query () {
    return this._ensureClient().then(() => {
      return Promise.fromCallback(cb => this._client.query(...arguments, cb))
    })
  }

  _unlisten (eventName, context) {
    return this._query(`UNLISTEN "${eventName}"`).then(
      () => log.info('unlisten', {eventName, url: this._url}),
      error => {
        throw failed.unlisten(error, context)
      }
    )
  }

  close () {
    if (this._client) {
      this._client.end()
    }
  }

  removeListener (eventName, listener) {
    const context = {eventName}
    Error.captureStackTrace(context)

    this._emitter.removeListener(eventName, listener)
    return this._emitter.listenerCount(eventName) === 0
      ? this._unlisten(eventName, context)
      : Promise.resolve()
  }

  removeAllListeners (eventName) {
    const context = {eventName}
    Error.captureStackTrace(context)

    const names = eventName ? [eventName] : this._emitter.eventNames()
    this._emitter.removeAllListeners(eventName)

    let vow = Promise.resolve()
    names.forEach(ea => {
      vow = vow.then(() => this._unlisten(ea, context))
    })
    return vow
  }

  emit (eventName, ...args) {
    const payload = JSON.stringify(args)
    const context = {eventName}
    Error.captureStackTrace(context)

    return this._query('SELECT pg_notify($1, $2)', [eventName, payload]).then(
      () => log.info('notify', {url: this._url, eventName, payload}),
      error => {
        throw failed.notify(error, context)
      }
    )
  }
}

;[
  'eventNames',
  'getMaxListeners',
  'listenerCount',
  'listeners',
  'setMaxListeners'
].forEach(name => {
  PgNotifier.prototype[name] = function () {
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
    const context = {eventName}
    Error.captureStackTrace(context, method)

    const listenerCount = this._emitter.listenerCount(eventName)
    this._emitter[name](eventName, listener)
    if (listenerCount === 0) {
      return this._query(`LISTEN "${eventName}"`).then(
        () => log.info('listen', {eventName, url: this._url}),
        pgError => {
          throw failed.listen(pgError, context)
        }
      )
    } else {
      return Promise.resolve()
    }
  }
  PgNotifier.prototype[name] = method
})

module.exports = {PgStrategy, PgNotifier}

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
