'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const Promise = require('bluebird')
const parseConnectionString = require('pg-connection-string').parse

class BaseStrategy {
  static disconnect () {
    return Promise.resolve()
  }

  constructor (_options) {
    this.directory = _options.directory
    delete _options.directory

    const options = Object.assign({}, _options)
    if ('connectionString' in options) {
      const parsed = parseConnectionString(options.connectionString)
      delete options.connectionString
      parsed.host = parsed.host || process.env.PGHOST || 'localhost'
      parsed.port = parsed.port || process.env.PGPORT
      parsed.user = parsed.user || process.env.PGUSER
      parsed.database = parsed.database || process.env.PGDATABASE
      parsed.password = parsed.password || process.env.PGPASSWORD
      Object.assign(options, parsed)
    }

    this.options = options
    this.methods = {
      begin: this.createTxnMethod('begin'),
      commit: this.createTxnMethod('commit'),
      rollback: this.createTxnMethod('rollback')
    }
  }

  disconnect () {
    return Promise.resolve()
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

    const meta = { source }
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
    return Object.assign({ url: this.url }, options)
  }

  genId () {
    return Promise.fromCallback(cb => crypto.randomBytes(3, cb)).then(buf => buf.toString('hex'))
  }

  logQuery (target, meta, call, microseconds) {
    const context = { id: target._id, ms: microseconds / 100 }
    if (meta.source) context.source = target._log.formatPath(meta.source)
    target._log.info('query', meta, call, context)
  }

  addCallsite (log, context) {
    if (log.tracer) log.tracer.addCallsite(context, findCaller)
  }
}

const findCaller = stack => {
  let foundBluefin = false
  return stack.find(site => {
    const filename = site.getFileName()
    if (!filename) return false
    const includesBluefin = filename.includes('bluefin-link')
    if (includesBluefin) foundBluefin = true
    return foundBluefin && !includesBluefin
  })
}

module.exports = BaseStrategy
