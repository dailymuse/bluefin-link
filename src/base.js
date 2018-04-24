'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const Promise = require('bluebird')
const parseConnectionString = require('pg-connection-string').parse
const url = require('url')

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
    return Promise.fromCallback(cb => crypto.randomBytes(3, cb)).then(buf => buf.toString('hex'))
  }

  createLogQueryFn (name, meta) {
    const data = Object.assign({}, meta)
    data.callsite = this.formatCallSite()
    return (id, microseconds, args) => {
      data['connection-id'] = id
      data.ms = microseconds / 1000
      data.arguments = args.map(p => (Buffer.isBuffer(p) ? '\\x' + p.toString('hex') : p))
      this.log.info('query', data)
    }
  }

  getCallSite () {
    const _prepareStackTrace = Error.prepareStackTrace

    try {
      Error.prepareStackTrace = (_, stack) => {
        return stack.find(frame => !(frame.getFileName() || '').includes('bluefin-link'))
      }
      return new Error().stack
    } finally {
      Error.prepareStackTrace = _prepareStackTrace
    }
  }

  formatCallSite (frame) {
    if (!frame) frame = this.getCallSite()
    if (!frame) return

    const parts = []

    const typeName = frame.getTypeName()
    if (typeName) {
      parts.push(typeName)
      parts.push('.')
    }

    const functionName = frame.getFunctionName()
    const methodName = frame.getMethodName()
    if (functionName) {
      parts.push(functionName)
      if (methodName && methodName !== functionName) {
        parts.push('[as ')
        parts.push(methodName)
        parts.push(']')
      }
    } else if (methodName) {
      parts.push(methodName)
    } else {
      parts.push('<anonymous>')
    }

    parts.push(' (')
    const fileName = frame.getFileName()
    if (fileName) {
      parts.push(fileName)
      const lineNumber = frame.getLineNumber()
      if (lineNumber) {
        parts.push(':')
        parts.push(lineNumber)
        const columnNumber = frame.getColumnNumber()
        if (columnNumber) {
          parts.push(':')
          parts.push(columnNumber)
        }
      }
    } else if (frame.isNative()) {
      parts.push('<native>')
    } else {
      parts.push('<unknown>')
    }
    parts.push(')')

    return parts.join('')
  }
}

module.exports = BaseStrategy
