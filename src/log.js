const debug = require('debug')('bluefin:link')

class DebugLog {
  constructor(context, dimensions) {
    this.context = context
    this.dimensions = dimensions
  }

  formatPath(filePath) {
    return filePath
  }

  fail(msg, cause, ...rest) {
    const effect = new Error(msg)
    effect.context = Object.assign({}, this.context, ...rest)
    for (let i = rest.length - 1; i >= 0; i--) {
      const ctx = rest[i]
      if (ctx.stack) effect.stack = ctx.stack.replace(/(\[object Object\])/, `Error: ${msg}`)
    }

    let e = cause
    while ('effect' in e) e = e.effect
    e.effect = effect
    return cause
  }

  log(format, message, context) {
    if (this.context === undefined && context === undefined) return debug(format, message)
    const combined = Object.assign({}, this.context, context)
    debug(format + ' %o', message, combined)
  }

  debug(msg, ...rest) {
    const context = Object.assign({}, this.context, ...rest)
    this.log('debug', msg, context)
  }

  info(message, ...rest) {
    const context = Object.assign({}, this.context, ...rest)
    this.log('%s', message, context)
  }

  warning(message, ...rest) {
    const context = Object.assign({}, this.context, ...rest)
    this.log('WARNING %s', message, context)
  }

  error(error, ...rest) {
    const context = Object.assign({}, this.context, ...rest)
    this.log('%s', 'Error', context)
    let e = error
    while (e) {
      if (e.context) this.log('%s', e.name, e.context)
      debug('%s', e.stack)
      e = e.result
    }
  }

  magnitude(name, value, ...rest) {
    const dimensions = Object.assign({}, this.dimensions, ...rest)
    debug('magnitude %s %d %o', name, value, dimensions)
  }

  count(name, value, ...rest) {
    const dimensions = Object.assign({}, this.dimensions, ...rest)
    debug('count %s %d %o', name, value, dimensions)
  }

  begin(name) {
    const begin = process.hrtime()
    return (...rest) => {
      const dimensions = Object.assign({}, this.dimensions, ...rest)
      const elapsed = process.hrtime(begin)
      const microseconds = elapsed[0] * 1e6 + elapsed[1] * 1e-3
      this.magnitude(name, microseconds, dimensions)
      return microseconds
    }
  }
}

module.exports = DebugLog
