const debug = require('debug')('bluefin:link')

class DebugLog {
  constructor (context) {
    this.context = context
  }

  log (format, message, context) {
    if (this.context === undefined && context === undefined) return debug(format, message)
    const combined = Object.assign({}, this.context, context)
    debug(format + ' %o', message, combined)
  }

  info (message, context) {
    this.log('%s', message, context)
  }

  warning (message, context) {
    this.log('WARNING %s', message, context)
  }

  error (error) {
    let e = error
    while (e) {
      if (e.context) this.log('%s', e.name, e.context)
      debug('%s', e.stack)
      e = typeof e.cause === 'function' ? e.cause() : e.cause
    }
  }
}

module.exports = DebugLog
