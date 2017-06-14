'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const Promise = require('bluebird')

const log = require('./log')

class BaseStrategy {
  constructor (url, directory) {
    this.url = url
    this.directory = directory
    this.methods = {
      begin: this.createTxnMethod('BEGIN'),
      commit: this.createTxnMethod('COMMIT'),
      rollback: this.createTxnMethod('ROLLBACK')
    }
  }

  hasMethod (name) {
    return name in this.methods
  }

  create (name) {
    var text
    var source
    try {
      source = path.join(this.directory, name + '.sql')
      text = fs.readFileSync(source, 'utf8')
    } catch (e) {
      return undefined
    }

    const meta = {source}
    this.extractMetaData(text, meta)

    const fn = this.createMethod(name, meta, text)
    this.methods[name] = fn
    return this.methods[name]
  }

  extractMetaData (text, meta) {
    const pattern = /^--\*\s+(\w+)\s+(\w+)/g

    var match
    while ((match = pattern.exec(text)) !== null) {
      meta[match[1]] = match[2]
    }

    return meta
  }

  desc (options) {
    return Object.assign({url: this.url}, options)
  }

  genId () {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(3, (err, buf) => {
        if (err) return reject(err)
        resolve(buf.toString('hex'))
      })
    })
  }

  createLogQueryFn (meta) {
    const data = Object.assign({}, meta)
    return (id, elapsed, parameters) => {
      data['connection-id'] = id
      data.ms = elapsed()
      data.parameters = parameters.map(
        p => (Buffer.isBuffer(p) ? '\\x' + p.toString('hex') : p)
      )
      log.info('query', data)
    }
  }
}

module.exports = BaseStrategy
